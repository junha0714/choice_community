from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, get_current_user_optional
from models import Post, AIInteraction, AISession, AISessionInteraction, User
from schemas import (
    AIQuestionFlowResponse,
    AITranscriptItem,
    AIAnswerRequest,
    AISessionStartRequest,
    AISessionStartResponse,
    PostResponse,
)
from post_utils import post_option_list
from openai_client import client
from ai_conversation import *
from app_helpers import (
    _get_post_or_404,
    _nickname_map,
    _post_to_response,
    _load_ai_transcript,
    _load_ai_session_transcript,
    _get_ai_session_or_404,
    _ai_session_post_like,
    _delete_ai_session,
)

router = APIRouter(tags=["ai"])


def _copy_session_interactions_to_post(
    db: Session, post_id: int, interactions: list[AISessionInteraction]
) -> None:
    db.query(AIInteraction).filter(AIInteraction.post_id == post_id).delete(
        synchronize_session=False
    )
    for it in interactions:
        db.add(
            AIInteraction(
                post_id=post_id,
                step_number=it.step_number,
                question=it.question,
                answer=it.answer,
            )
        )


def _default_ai_transcript_public(db: Session, user_id: int) -> bool:
    user = db.query(User).filter(User.id == user_id).first()
    return bool(getattr(user, "default_ai_transcript_public", False)) if user else False


def _post_fields_from_session(sess: AISession, *, include_transcript_public: bool | None = None) -> dict:
    fields = {
        "title": sess.title,
        "content": sess.content,
        "category": sess.category,
        "options": sess.options,
        "post_kind": "ai",
        "ai_mode": sess.ai_mode,
        "ai_question_steps": getattr(sess, "ai_question_steps", None),
        "tags": sess.tags,
        "vote_deadline_at": sess.vote_deadline_at,
        "ai_recommended": sess.ai_recommended,
        "ai_reason": sess.ai_reason,
    }
    if include_transcript_public is not None:
        fields["ai_transcript_public"] = include_transcript_public
    return fields


def _save_ai_session_draft(
    db: Session, sess: AISession, session_id: str
) -> int | None:
    """AI 결과를 마이페이지 임시저장 글로 동기화한다."""
    if not (sess.ai_recommended or "").strip():
        return None

    interactions = (
        db.query(AISessionInteraction)
        .filter(AISessionInteraction.session_id == session_id)
        .order_by(AISessionInteraction.step_number.asc())
        .all()
    )
    draft_id = getattr(sess, "draft_post_id", None)
    if draft_id:
        post = (
            db.query(Post)
            .filter(
                Post.id == draft_id,
                Post.user_id == sess.user_id,
                Post.deleted_at.is_(None),
            )
            .first()
        )
        if post:
            fields = _post_fields_from_session(sess)
            for key, val in fields.items():
                setattr(post, key, val)
            post.is_published = False
            db.commit()
            _copy_session_interactions_to_post(db, post.id, interactions)
            db.commit()
            return post.id

    fields = _post_fields_from_session(
        sess,
        include_transcript_public=_default_ai_transcript_public(db, sess.user_id),
    )
    new_post = Post(user_id=sess.user_id, is_published=False, **fields)
    db.add(new_post)
    db.commit()
    db.refresh(new_post)
    _copy_session_interactions_to_post(db, new_post.id, interactions)
    sess.draft_post_id = new_post.id
    db.commit()
    return new_post.id


def _ai_result_payload(
    db: Session,
    sess: AISession,
    session_id: str,
    *,
    recommended: str,
    reason: str,
    transcript: list[AITranscriptItem],
    low_confidence: bool = False,
) -> dict:
    draft_post_id = _save_ai_session_draft(db, sess, session_id)
    return {
        "type": "result",
        "recommended": recommended,
        "reason": reason,
        "low_confidence": low_confidence,
        "transcript": transcript,
        "draft_post_id": draft_post_id,
    }


def _run_standard_ai_final_recommendation(
    post_like,
    conversation_text: str,
    *,
    mode_n: str,
    early_finish: bool,
) -> tuple[str, str, bool]:
    """random_fun 제외. (recommended, reason 저장 문자열, low_confidence)."""
    sys_msg, user_msg, forced_rec = ai_final_system_user_for_result(
        post_like, conversation_text, early_finish=early_finish
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": user_msg},
        ],
    )
    content = response.choices[0].message.content
    data = _parse_ai_json_response(content)
    rec = _extract_text(data.get("recommended")).strip()
    if forced_rec and rec != forced_rec:
        rec = forced_rec
    low_confidence = parse_low_confidence_flag(
        data.get("low_confidence"), conversation_text=conversation_text
    )
    if mode_n == "deep":
        reason_short = _extract_text(data.get("reason")).strip()
        comp = _normalize_ai_comparison_field(data.get("comparison")).strip()
        full_reason = (
            f"{reason_short}\n\n---\n\n{comp}".strip() if comp else reason_short
        )
        return rec, sanitize_ai_reason(full_reason), low_confidence
    return (
        rec,
        sanitize_ai_reason(_extract_text(data.get("reason")).strip()),
        low_confidence,
    )


def _run_random_fun_recommendation(
    post_like,
    conversation_text: str | None,
) -> tuple[str, str]:
    sys_rf, user_rf, forced_rec = random_fun_result_messages(
        post_like, conversation_text=conversation_text
    )
    response_rf = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": sys_rf},
            {"role": "user", "content": user_rf},
        ],
    )
    data_rf = _parse_ai_json_response(response_rf.choices[0].message.content)
    rec = _extract_text(data_rf.get("recommended")).strip()
    if rec != forced_rec:
        rec = forced_rec
    reason = _extract_text(data_rf.get("reason")).strip()
    return rec, reason


def _generate_ai_question(
    post,
    *,
    conversation_text: str,
    prev_questions: list[str],
    step: int,
    max_steps: int,
    mode: str,
    last_answer: str | None = None,
) -> str:
    sys_msg, user_msg = build_question_prompt(
        post,
        conversation_text=conversation_text,
        prev_questions=prev_questions,
        step=step,
        max_steps=max_steps,
        mode=mode,
    )
    last_candidate = ""
    for attempt in range(QUESTION_GENERATION_MAX_ATTEMPTS):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_msg},
                    {
                        "role": "user",
                        "content": user_msg + question_generation_retry_suffix(attempt),
                    },
                ],
            )
            data = _parse_ai_json_response(response.choices[0].message.content)
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
        q = _extract_question_text(data).strip()
        if not q:
            continue
        last_candidate = q
        if accept_generated_question(
            q, post, prev_questions, last_answer, step=step
        ):
            return q
    fallback = resolve_question_generation_fallback(last_candidate)
    if fallback:
        return fallback
    raise HTTPException(
        status_code=503,
        detail="질문을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    )


def _generate_answer_suggestions(
    post,
    *,
    question: str,
    conversation_text: str,
    mode: str,
) -> list[str]:
    q = (question or "").strip()
    if not q:
        return []
    collected: list[str] = []
    for attempt in range(SUGGESTED_ANSWER_GENERATION_MAX_ATTEMPTS):
        try:
            sys_msg, user_msg = build_answer_suggestions_prompt(
                post,
                question=q,
                conversation_text=conversation_text,
                mode=mode,
            )
            suffix = suggested_answer_retry_suffix(attempt, collected)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": user_msg + suffix},
                ],
            )
            data = _parse_ai_json_response(response.choices[0].message.content)
            collected = normalize_suggested_answers(
                data.get("suggested_answers"),
                post,
                existing=collected,
            )
            if len(collected) >= SUGGESTED_ANSWER_COUNT:
                break
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
    return complete_suggested_answers(collected, post, mode=mode)


def _question_flow_payload(
    *,
    step: int,
    question: str,
    transcript: list[AITranscriptItem],
    suggested_answers: list[str] | None = None,
    **extra,
) -> dict:
    payload = {
        "type": "question",
        "step": step,
        "question": question,
        "transcript": transcript,
        **extra,
    }
    if suggested_answers:
        payload["suggested_answers"] = suggested_answers
    return payload


def _resolve_after_answer(
    post,
    *,
    conversation_text: str,
    prev_questions: list[str],
    current_step: int,
    max_steps: int,
    mode: str,
    last_answer: str | None,
    force_finish: bool,
) -> tuple[bool, bool, str | None, list[str]]:
    """
    답변 후 다음 액션.
    추천은 설정 질문 수 도달 또는 '바로 추천' 버튼(finish_here)일 때만.
    Returns: (should_recommend, early_finish, next_question, suggested_answers)
    """
    if current_step >= max_steps or force_finish:
        return True, bool(force_finish and current_step < max_steps), None, []

    next_q = _generate_ai_question(
        post,
        conversation_text=conversation_text,
        prev_questions=prev_questions,
        step=current_step + 1,
        max_steps=max_steps,
        mode=mode,
        last_answer=last_answer,
    )
    suggestions = _generate_answer_suggestions(
        post,
        question=next_q,
        conversation_text=conversation_text,
        mode=mode,
    )
    return False, False, next_q, suggestions


@router.get("/posts/{post_id}/ai-transcript", response_model=list[AITranscriptItem])
def get_ai_transcript(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)
    _require_ai_post(post)
    author = (
        current_user is not None
        and post.user_id is not None
        and post.user_id == current_user.id
    )
    public_ok = bool(getattr(post, "ai_transcript_public", False)) and bool(
        (getattr(post, "ai_recommended", None) or "").strip()
    )
    if not author and not public_ok:
        raise HTTPException(
            status_code=404,
            detail="대화 내용을 불러올 수 없습니다.",
        )
    return _load_ai_transcript(db, post_id)


@router.post("/ai-sessions/start", response_model=AISessionStartResponse)
def ai_session_start(
    req: AISessionStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 만료된 세션 정리(간단한 TTL 정리)
    now = datetime.now(timezone.utc)
    expired = (
        db.query(AISession)
        .filter(
            AISession.user_id == current_user.id,
            AISession.expires_at.is_not(None),
            AISession.expires_at < now,
        )
        .all()
    )
    if expired:
        # FK: 자식(ai_session_interactions)을 먼저 지워야 함. ORM 개별 delete 시 flush 순서로
        # 세션이 먼저 삭제되며 FK 위반이 날 수 있어 bulk delete로 고정.
        ids = [s.id for s in expired]
        db.query(AISessionInteraction).filter(
            AISessionInteraction.session_id.in_(ids)
        ).delete(synchronize_session=False)
        db.query(AISession).filter(AISession.id.in_(ids)).delete(synchronize_session=False)
        db.commit()

    # 세션 생성
    tags_csv = ",".join(req.tags) if req.tags else None
    sess = AISession(
        user_id=current_user.id,
        ai_mode=req.ai_mode,
        ai_question_steps=req.ai_question_steps,
        title=req.title,
        content=req.content,
        category=req.category,
        options=",".join(req.options),
        tags=tags_csv,
        vote_deadline_at=req.vote_deadline_at,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)

    post_like = _ai_session_post_like(sess)

    try:
        mode_n = normalize_ai_mode(getattr(post_like, "ai_mode", None))
        if mode_n == "random_fun":
            try:
                rec_out, reason_rf = _run_random_fun_recommendation(
                    post_like, conversation_text=None
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            sess.ai_recommended = rec_out
            sess.ai_reason = reason_rf
            db.commit()
            db.refresh(sess)
            result = _ai_result_payload(
                db,
                sess,
                sess.id,
                recommended=rec_out,
                reason=reason_rf,
                transcript=[],
            )
            return {"session_id": sess.id, "step": None, **result}

        mx = _ai_max_question_steps(post_like)
        question_text = _generate_ai_question(
            post_like,
            conversation_text="",
            prev_questions=[],
            step=1,
            max_steps=mx,
            mode=mode_n,
        )

        interaction = AISessionInteraction(
            session_id=sess.id,
            step_number=1,
            question=question_text,
            answer=None,
        )
        db.add(interaction)
        db.commit()

        tr = _load_ai_session_transcript(db, sess.id)
        suggestions = _generate_answer_suggestions(
            post_like,
            question=question_text,
            conversation_text="",
            mode=mode_n,
        )
        return {
            "session_id": sess.id,
            **_question_flow_payload(
                step=1,
                question=question_text,
                transcript=tr,
                suggested_answers=suggestions,
            ),
        }
    except Exception as e:
        print("=== ai_session_start error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-sessions/{session_id}/next", response_model=AIQuestionFlowResponse)
def ai_session_next(
    session_id: str,
    req: AIAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = _get_ai_session_or_404(db, session_id, current_user)
    interactions = (
        db.query(AISessionInteraction)
        .filter(AISessionInteraction.session_id == session_id)
        .order_by(AISessionInteraction.step_number.asc())
        .all()
    )
    if not interactions:
        raise HTTPException(status_code=400, detail="먼저 /ai-sessions/start를 호출해야 합니다.")

    last_interaction = interactions[-1]
    last_interaction.answer = req.answer
    db.commit()

    post_like = _ai_session_post_like(sess)
    # 지금까지 대화 정리
    conversation_text = ""
    for item in interactions:
        conversation_text += f"Q{item.step_number}: {item.question}\n"
        conversation_text += f"A{item.step_number}: {item.answer}\n"

    current_step = len(interactions)
    max_steps = _ai_max_question_steps(post_like)
    mode_n = normalize_ai_mode(getattr(post_like, "ai_mode", None))
    force_finish = req.action == "finish_here"
    prev_qs = [it.question for it in interactions if it.question]

    try:
        should_recommend, early_finish, next_question, suggested_answers = _resolve_after_answer(
            post_like,
            conversation_text=conversation_text,
            prev_questions=prev_qs,
            current_step=current_step,
            max_steps=max_steps,
            mode=mode_n,
            last_answer=last_interaction.answer,
            force_finish=force_finish,
        )

        if should_recommend:
            low_confidence = False
            if mode_n == "random_fun":
                rec, reason_rf = _run_random_fun_recommendation(
                    post_like, conversation_text=conversation_text
                )
                sess.ai_recommended = rec
                sess.ai_reason = reason_rf
            else:
                rec, reason_out, low_confidence = _run_standard_ai_final_recommendation(
                    post_like,
                    conversation_text,
                    mode_n=mode_n,
                    early_finish=early_finish,
                )
                sess.ai_recommended = rec
                sess.ai_reason = reason_out
            db.commit()
            db.refresh(sess)
            tr_final = _load_ai_session_transcript(db, session_id)
            return _ai_result_payload(
                db,
                sess,
                session_id,
                recommended=rec,
                reason=sess.ai_reason or "",
                transcript=tr_final,
                low_confidence=low_confidence,
            )

        next_step = current_step + 1
        new_interaction = AISessionInteraction(
            session_id=session_id,
            step_number=next_step,
            question=next_question,
            answer=None,
        )
        db.add(new_interaction)
        db.commit()

        tr = _load_ai_session_transcript(db, session_id)
        return _question_flow_payload(
            step=next_step,
            question=new_interaction.question,
            transcript=tr,
            suggested_answers=suggested_answers,
        )

    except Exception as e:
        print("=== ai_session_next error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-sessions/{session_id}/publish", response_model=PostResponse)
def ai_session_publish(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = _get_ai_session_or_404(db, session_id, current_user)
    if not (sess.ai_recommended or "").strip():
        raise HTTPException(status_code=400, detail="아직 AI 대화가 완료되지 않았어요.")

    draft_post_id = _save_ai_session_draft(db, sess, session_id)
    if not draft_post_id:
        raise HTTPException(status_code=400, detail="임시저장 글을 만들지 못했어요.")

    post = (
        db.query(Post)
        .filter(
            Post.id == draft_post_id,
            Post.user_id == current_user.id,
            Post.deleted_at.is_(None),
        )
        .first()
    )
    if not post:
        raise HTTPException(status_code=404, detail="임시저장 글을 찾을 수 없습니다.")

    post.is_published = True
    db.commit()
    db.refresh(post)

    _delete_ai_session(db, session_id, sess)

    nick_map = _nickname_map(db, {current_user.id})
    comment_count = 0
    return _post_to_response(
        post,
        nick_map,
        liked_by_me=None,
        comment_count=comment_count,
    )

@router.post("/posts/{post_id}/start-ai", response_model=AIQuestionFlowResponse)
def start_ai(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    _require_ai_post(post)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 AI 질문을 진행할 수 있어요.")

    # 이전 대화 있으면 제거 (새로 시작)
    old_interactions = db.query(AIInteraction).filter(AIInteraction.post_id == post_id).all()
    for item in old_interactions:
        db.delete(item)
    post.ai_recommended = None
    post.ai_reason = None
    post.ai_transcript_public = False
    db.commit()

    try:
        mode_n = normalize_ai_mode(getattr(post, "ai_mode", None))
        if mode_n == "random_fun":
            rec_out, reason_rf = _run_random_fun_recommendation(
                post, conversation_text=None
            )
            post.ai_recommended = rec_out
            post.ai_reason = reason_rf
            db.commit()
            db.refresh(post)
            tr = _load_ai_transcript(db, post_id)
            return {
                "type": "result",
                "recommended": rec_out,
                "reason": reason_rf,
                "transcript": tr,
            }

        mx = _ai_max_question_steps(post)
        question_text = _generate_ai_question(
            post,
            conversation_text="",
            prev_questions=[],
            step=1,
            max_steps=mx,
            mode=mode_n,
        )

        interaction = AIInteraction(
            post_id=post_id,
            step_number=1,
            question=question_text,
            answer=None,
        )

        db.add(interaction)
        db.commit()

        tr = _load_ai_transcript(db, post_id)
        suggestions = _generate_answer_suggestions(
            post,
            question=question_text,
            conversation_text="",
            mode=mode_n,
        )
        return _question_flow_payload(
            step=1,
            question=question_text,
            transcript=tr,
            suggested_answers=suggestions,
        )

    except Exception as e:
        print("=== start_ai error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/posts/{post_id}/next-ai", response_model=AIQuestionFlowResponse)
def next_ai(
    post_id: int,
    req: AIAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    _require_ai_post(post)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 AI 질문을 진행할 수 있어요.")

    interactions = (
        db.query(AIInteraction)
        .filter(AIInteraction.post_id == post_id)
        .order_by(AIInteraction.step_number.asc())
        .all()
    )

    if not interactions:
        raise HTTPException(status_code=400, detail="먼저 /start-ai를 호출해야 합니다.")

    last_interaction = interactions[-1]

    # 마지막 질문에 답변 저장
    last_interaction.answer = req.answer
    db.commit()

    # 지금까지 대화 정리
    conversation_text = ""
    for item in interactions:
        conversation_text += f"Q{item.step_number}: {item.question}\n"
        conversation_text += f"A{item.step_number}: {item.answer}\n"

    current_step = len(interactions)
    max_steps = _ai_max_question_steps(post)
    mode_n = normalize_ai_mode(getattr(post, "ai_mode", None))
    force_finish = req.action == "finish_here"
    prev_qs = [it.question for it in interactions if it.question]

    try:
        should_recommend, early_finish, next_question, suggested_answers = _resolve_after_answer(
            post,
            conversation_text=conversation_text,
            prev_questions=prev_qs,
            current_step=current_step,
            max_steps=max_steps,
            mode=mode_n,
            last_answer=last_interaction.answer,
            force_finish=force_finish,
        )

        if should_recommend:
            low_confidence = False
            if mode_n == "random_fun":
                rec, reason_rf = _run_random_fun_recommendation(
                    post, conversation_text=conversation_text
                )
                post.ai_recommended = rec
                post.ai_reason = reason_rf
            else:
                rec, reason_out, low_confidence = _run_standard_ai_final_recommendation(
                    post,
                    conversation_text,
                    mode_n=mode_n,
                    early_finish=early_finish,
                )
                post.ai_recommended = rec
                post.ai_reason = reason_out
            db.commit()
            db.refresh(post)
            tr_final = _load_ai_transcript(db, post_id)
            return {
                "type": "result",
                "recommended": post.ai_recommended,
                "reason": post.ai_reason or "",
                "low_confidence": low_confidence,
                "transcript": tr_final,
            }

        next_step = current_step + 1
        interaction = AIInteraction(
            post_id=post_id,
            step_number=next_step,
            question=next_question,
            answer=None,
        )

        db.add(interaction)
        db.commit()

        tr = _load_ai_transcript(db, post_id)
        return _question_flow_payload(
            step=next_step,
            question=interaction.question,
            transcript=tr,
            suggested_answers=suggested_answers,
        )

    except Exception as e:
        print("=== next_ai error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))
