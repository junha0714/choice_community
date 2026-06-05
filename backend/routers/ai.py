from __future__ import annotations

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
) -> dict:
    draft_post_id = _save_ai_session_draft(db, sess, session_id)
    return {
        "type": "result",
        "recommended": recommended,
        "reason": reason,
        "transcript": transcript,
        "draft_post_id": draft_post_id,
    }


def _run_standard_ai_final_recommendation(
    post_like,
    conversation_text: str,
    *,
    mode_n: str,
    early_finish: bool,
) -> tuple[str, str]:
    """random_fun 제외. (recommended, reason 저장 문자열)."""
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
    if mode_n == "deep":
        reason_short = _extract_text(data.get("reason")).strip()
        comp = _normalize_ai_comparison_field(data.get("comparison")).strip()
        full_reason = (
            f"{reason_short}\n\n---\n\n{comp}".strip() if comp else reason_short
        )
        return rec, full_reason
    return rec, _extract_text(data.get("reason")).strip()


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
                sys_rf, user_rf, forced_rec = random_fun_result_messages(
                    post_like, conversation_text=None
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            response_rf = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_rf},
                    {"role": "user", "content": user_rf},
                ],
            )
            data_rf = _parse_ai_json_response(response_rf.choices[0].message.content)
            rec_out = _extract_text(data_rf.get("recommended")).strip()
            if rec_out != forced_rec:
                rec_out = forced_rec
            reason_rf = _extract_text(data_rf.get("reason")).strip()
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
        sys_first = _ai_system_prompt_question(
            followup=False, conversation_style=mode_n, max_question_rounds=mx
        )
        stage0 = classify_decision_stage("", None, 0)
        intent0 = select_question_intent(
            stage=stage0, next_step=1, max_rounds=mx, prev_questions=[]
        )
        user_first = (
            _ai_user_block_post(post_like)
            + "첫 질문 1개를 만들어라."
            + _decision_stage_user_suffix(stage0)
            + _question_intent_user_suffix(intent0)
            + _first_question_human_opening_suffix(post_like)
            + _anti_binary_redundant_user_suffix(post_like)
            + _anti_obvious_restate_user_suffix(post_like)
            + _ai_no_tournament_user_suffix(
                post_like, [], next_step=1, max_rounds=mx
            )
            + _ai_thin_context_user_suffix(post_like)
            + _ai_question_context_suffix([])
            + _ai_mode_question_user_suffix(
                mode=mode_n, step=1, max_rounds=mx, post=post_like
            )
        )

        question_text = ""
        sys_loop = sys_first
        for _attempt in range(4):
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_loop},
                    {"role": "user", "content": user_first},
                ],
            )
            data = _parse_ai_json_response(response.choices[0].message.content)
            question_text = _extract_question_text(data).strip()
            if not question_should_reject(
                question_text,
                post_like,
                [],
                None,
                is_first_question=True,
                next_step=1,
                max_rounds=mx,
            ):
                break
            _, pen = question_rejection_penalties(
                question_text,
                post_like,
                [],
                None,
                is_first_question=True,
                next_step=1,
                max_rounds=mx,
            )
            retry_hint = ""
            if pen.get("narrow_pairwise_subset"):
                retry_hint = (
                    " 선택지가 3개 이상인데 두 후보만 맞댔다. "
                    "전체 후보를 염두에 둔 질문(기준·제외·남은 후보들 중)으로 바꿔라. "
                    "글에 없는 특정 상황(여행·맛집 등)을 붙이지 마라."
                )
            sys_loop = (
                sys_first
                + " 질문 품질 점검에서 감점이 컸다. "
                f"감점 항목: {list(pen.keys())}. "
                f"[질문 의도: {intent0.value}]는 유지하고, 그 의도에 맞게 한 문장만 다시 써라."
                + retry_hint
            )
        if question_should_reject(
            question_text,
            post_like,
            [],
            None,
            is_first_question=True,
            next_step=1,
            max_rounds=mx,
        ):
            question_text = _smart_fallback_question(post_like, [], intent=intent0)

        interaction = AISessionInteraction(
            session_id=sess.id,
            step_number=1,
            question=question_text,
            answer=None,
        )
        db.add(interaction)
        db.commit()

        tr = _load_ai_session_transcript(db, sess.id)
        return {
            "session_id": sess.id,
            "type": "question",
            "step": 1,
            "question": question_text,
            "transcript": tr,
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
    early_finish = bool(force_finish and current_step < max_steps)

    try:
        if current_step >= max_steps or force_finish:
            if mode_n == "random_fun":
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
                reason_rf = _extract_text(data_rf.get("reason")).strip()
                sess.ai_recommended = rec
                sess.ai_reason = reason_rf
            else:
                rec, reason_out = _run_standard_ai_final_recommendation(
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
            )

        # 다음 질문 생성
        next_step = current_step + 1
        prev_questions = [it.question for it in interactions if it.question]
        last_answer = interactions[-1].answer if interactions else None
        stage = classify_decision_stage(conversation_text, last_answer, len(prev_questions))
        q_intent = select_question_intent(
            stage=stage,
            next_step=next_step,
            max_rounds=max_steps,
            prev_questions=prev_questions,
            last_answer=last_answer,
        )

        sys_next = _ai_system_prompt_question(
            followup=True, conversation_style=mode_n, max_question_rounds=max_steps
        ) + _next_ai_sys_suffix_binary(post_like)
        user_next = (
            _ai_user_block_post(post_like)
            + f"지금까지 질문/답변:\n{conversation_text}\n"
            + "다음 질문 1개를 만들어라."
            + _decision_stage_user_suffix(stage)
            + _question_intent_user_suffix(q_intent)
            + _stall_guard_user_suffix(prev_questions, last_answer)
            + _next_ai_user_suffix_binary(post_like)
            + _anti_obvious_restate_user_suffix(post_like)
            + _answer_consistency_user_suffix(conversation_text)
            + _ai_no_tournament_user_suffix(
                post_like,
                prev_questions,
                next_step=next_step,
                max_rounds=max_steps,
            )
            + _skip_answer_pivot_suffix(post_like, prev_questions, last_answer)
            + _ai_question_style_rotation_suffix(prev_questions)
            + _ai_thin_context_user_suffix(post_like)
            + _ai_question_context_suffix(prev_questions)
            + _ai_mode_question_user_suffix(
                mode=mode_n,
                step=next_step,
                max_rounds=max_steps,
                post=post_like,
            )
        )

        sys_base = sys_next
        user_base = user_next
        chosen: str | None = None
        for attempt in range(5):
            extra = ""
            if attempt > 0:
                extra = (
                    "이전에 쓴 질문과 겹치지 않게, 방금 답을 그대로 되묻지 말고 새 질문 1개. "
                    "[질문 의도]는 그대로 두고 문장만 고쳐라."
                )
                if _should_avoid_named_option_comparison(prev_questions, post_like):
                    extra += (
                        " 최근에 두 후보를 한 문장에 나란히 맞댄 형식이 잦았다. "
                        "이번에는 한 후보·한 축·또는 [질문 의도]에 맞는 다른 형식으로 바꿔라."
                    )
                if _any_recent_theme_saturated(prev_questions):
                    extra += " 같은 말과 비슷한 단어만 반복하지 말고, 한 단계 다른 각도를 시도해라."
                if _post_is_thin_context_post(post_like):
                    extra += (
                        " 본문이 매우 짧다. 모호한 감상만 잇달아 묻지 말고, "
                        "짧게 답할 수 있는 한 가지(기준·조건·빈도 등)로 물어라."
                    )
                if _answer_is_low_information(last_answer):
                    extra += (
                        " 사용자가 짧거나 ‘모르겠다’에 가깝게 답했다. "
                        "구체적인 한 축으로 좁히거나, 한두 단어로라도 답하기 쉬운 질문으로 바꿔라."
                    )
                if _answer_is_skip(last_answer):
                    extra += (
                        " 사용자가 질문을 넘겼다. 다른 각도로, "
                        "선택지가 3개 이상이면 두 후보만 맞대지 말고 전체 후보에 연결되게."
                    )
                if _recent_stressful_counterfactual_pick_count(prev_questions) >= 1:
                    extra += (
                        " 이미 극단 가정으로 ‘포기·안 고름’을 묻는 질문을 썼다. 같은 류는 피하고 수렴·정리 쪽으로."
                    )
            if attempt >= 2 and len(post_option_list(post_like)) == 2:
                extra += " 설문 틀보다 대화처럼 자연스럽게."
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_base + extra},
                    {"role": "user", "content": user_base},
                ],
            )
            data = _parse_ai_json_response(response.choices[0].message.content)
            q_text = _extract_question_text(data).strip()
            if not q_text:
                continue
            if not question_should_reject(
                q_text,
                post_like,
                prev_questions,
                last_answer,
                next_step=next_step,
                max_rounds=max_steps,
            ):
                chosen = q_text
                break
            _, pen = question_rejection_penalties(
                q_text,
                post_like,
                prev_questions,
                last_answer,
                next_step=next_step,
                max_rounds=max_steps,
            )
            if pen.get("narrow_pairwise_subset"):
                extra += (
                    " 선택지가 3개 이상인데 두 후보만 맞댔다. "
                    "전체 후보를 염두에 둔 질문으로 바꿔라."
                )

        if not chosen:
            chosen = _smart_fallback_question(post_like, prev_questions, intent=q_intent)

        new_interaction = AISessionInteraction(
            session_id=session_id,
            step_number=next_step,
            question=chosen,
            answer=None,
        )
        db.add(new_interaction)
        db.commit()

        tr = _load_ai_session_transcript(db, session_id)
        return {
            "type": "question",
            "step": next_step,
            "question": chosen,
            "transcript": tr,
        }

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
            sys_rf, user_rf, forced_rec = random_fun_result_messages(
                post, conversation_text=None
            )
            response_rf = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_rf},
                    {"role": "user", "content": user_rf},
                ],
            )
            data_rf = _parse_ai_json_response(response_rf.choices[0].message.content)
            rec_out = _extract_text(data_rf.get("recommended")).strip()
            if rec_out != forced_rec:
                rec_out = forced_rec
            reason_rf = _extract_text(data_rf.get("reason")).strip()
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
        sys_first = _ai_system_prompt_question(
            followup=False, conversation_style=mode_n, max_question_rounds=mx
        )
        stage0 = classify_decision_stage("", None, 0)
        intent0 = select_question_intent(
            stage=stage0, next_step=1, max_rounds=mx, prev_questions=[]
        )
        user_first = (
            _ai_user_block_post(post)
            + "첫 질문 1개를 만들어라."
            + _decision_stage_user_suffix(stage0)
            + _question_intent_user_suffix(intent0)
            + _first_question_human_opening_suffix(post)
            + _anti_binary_redundant_user_suffix(post)
            + _anti_obvious_restate_user_suffix(post)
            + _ai_no_tournament_user_suffix(post, [], next_step=1, max_rounds=mx)
            + _ai_thin_context_user_suffix(post)
            + _ai_question_context_suffix([])
            + _ai_mode_question_user_suffix(
                mode=mode_n, step=1, max_rounds=mx, post=post
            )
        )

        question_text = ""
        sys_loop = sys_first
        for _attempt in range(4):
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_loop},
                    {"role": "user", "content": user_first},
                ],
            )
            data = _parse_ai_json_response(response.choices[0].message.content)
            question_text = _extract_question_text(data).strip()
            if not question_should_reject(
                question_text,
                post,
                [],
                None,
                is_first_question=True,
                next_step=1,
                max_rounds=mx,
            ):
                break
            _, pen = question_rejection_penalties(
                question_text,
                post,
                [],
                None,
                is_first_question=True,
                next_step=1,
                max_rounds=mx,
            )
            retry_hint = ""
            if pen.get("narrow_pairwise_subset"):
                retry_hint = (
                    " 선택지가 3개 이상인데 두 후보만 맞댔다. "
                    "전체 후보를 염두에 둔 질문으로 바꿔라. "
                    "글에 없는 특정 상황을 붙이지 마라."
                )
            sys_loop = (
                sys_first
                + " 질문 품질 점검에서 감점이 컸다(반복·단순 취향 재확인·장황함 등). "
                f"감점 항목: {list(pen.keys())}. "
                f"[질문 의도: {intent0.value}]는 유지하고, 그 의도에 맞게 한 문장만 다시 써라."
                + retry_hint
            )

        if question_should_reject(
            question_text,
            post,
            [],
            None,
            is_first_question=True,
            next_step=1,
            max_rounds=mx,
        ):
            question_text = _smart_fallback_question(post, [], intent=intent0)

        interaction = AIInteraction(
            post_id=post_id,
            step_number=1,
            question=question_text,
            answer=None,
        )

        db.add(interaction)
        db.commit()

        tr = _load_ai_transcript(db, post_id)
        return {
            "type": "question",
            "step": 1,
            "question": question_text,
            "transcript": tr,
        }

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
    early_finish = bool(force_finish and current_step < max_steps)

    try:
        if current_step >= max_steps or force_finish:
            if mode_n == "random_fun":
                sys_rf, user_rf, forced_rec = random_fun_result_messages(
                    post, conversation_text=conversation_text
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
                post.ai_recommended = rec
                post.ai_reason = _extract_text(data_rf.get("reason")).strip()
            else:
                rec, reason_out = _run_standard_ai_final_recommendation(
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
                "transcript": tr_final,
            }

        next_step = current_step + 1
        prev_questions = [it.question for it in interactions if it.question]
        last_answer = interactions[-1].answer if interactions else None
        stage = classify_decision_stage(conversation_text, last_answer, len(prev_questions))
        q_intent = select_question_intent(
            stage=stage,
            next_step=next_step,
            max_rounds=max_steps,
            prev_questions=prev_questions,
            last_answer=last_answer,
        )

        sys_next = _ai_system_prompt_question(
            followup=True, conversation_style=mode_n, max_question_rounds=max_steps
        ) + _next_ai_sys_suffix_binary(post)
        user_next = (
            _ai_user_block_post(post)
            + f"지금까지 질문/답변:\n{conversation_text}\n"
            + "다음 질문 1개를 만들어라."
            + _decision_stage_user_suffix(stage)
            + _question_intent_user_suffix(q_intent)
            + _stall_guard_user_suffix(prev_questions, last_answer)
            + _next_ai_user_suffix_binary(post)
            + _anti_obvious_restate_user_suffix(post)
            + _answer_consistency_user_suffix(conversation_text)
            + _ai_no_tournament_user_suffix(
                post,
                prev_questions,
                next_step=next_step,
                max_rounds=max_steps,
            )
            + _skip_answer_pivot_suffix(post, prev_questions, last_answer)
            + _ai_question_style_rotation_suffix(prev_questions)
            + _ai_thin_context_user_suffix(post)
            + _ai_question_context_suffix(prev_questions)
            + _ai_mode_question_user_suffix(
                mode=mode_n,
                step=next_step,
                max_rounds=max_steps,
                post=post,
            )
        )

        sys_base = sys_next
        user_base = user_next
        chosen: str | None = None
        for attempt in range(5):
            extra = ""
            if attempt > 0:
                extra = (
                    "이전에 쓴 질문과 겹치지 않게, 방금 답을 그대로 되묻지 말고 새 질문 1개. "
                    "[질문 의도]는 그대로 두고 문장만 고쳐라."
                )
                if _should_avoid_named_option_comparison(prev_questions, post):
                    extra += (
                        " 최근에 두 후보를 한 문장에 나란히 맞댄 형식이 잦았다. "
                        "이번에는 한 후보·한 축·또는 [질문 의도]에 맞는 다른 형식으로 바꿔라."
                    )
                if _any_recent_theme_saturated(prev_questions):
                    extra += " 같은 말과 비슷한 단어만 반복하지 말고, 한 단계 다른 각도를 시도해라."
                if _post_is_thin_context_post(post):
                    extra += (
                        " 본문이 매우 짧다. 모호한 감상만 잇달아 묻지 말고, "
                        "짧게 답할 수 있는 한 가지(기준·조건·빈도 등)로 물어라."
                    )
                if _answer_is_low_information(last_answer):
                    extra += (
                        " 사용자가 짧거나 ‘모르겠다’에 가깝게 답했다. "
                        "구체적인 한 축으로 좁히거나, 한두 단어로라도 답하기 쉬운 질문으로 바꿔라."
                    )
                if _answer_is_skip(last_answer):
                    extra += (
                        " 사용자가 질문을 넘겼다. 다른 각도로, "
                        "선택지가 3개 이상이면 두 후보만 맞대지 말고 전체 후보에 연결되게."
                    )
                if _recent_stressful_counterfactual_pick_count(prev_questions) >= 1:
                    extra += (
                        " 이미 극단 가정으로 ‘포기·안 고름’을 묻는 질문을 썼다. 같은 류는 피하고 수렴·정리 쪽으로."
                    )
            if attempt >= 2 and len(post_option_list(post)) == 2:
                extra += " 설문 틀보다 대화처럼 자연스럽게."
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_base + extra},
                    {"role": "user", "content": user_base},
                ],
            )

            data = _parse_ai_json_response(response.choices[0].message.content)
            cq = _extract_question_text(data).strip()
            if not question_should_reject(
                cq,
                post,
                prev_questions,
                last_answer,
                next_step=next_step,
                max_rounds=max_steps,
            ):
                chosen = cq
                break
            _, pen = question_rejection_penalties(
                cq,
                post,
                prev_questions,
                last_answer,
                next_step=next_step,
                max_rounds=max_steps,
            )
            if pen.get("narrow_pairwise_subset"):
                extra += (
                    " 선택지가 3개 이상인데 두 후보만 맞댔다. "
                    "전체 후보를 염두에 둔 질문으로 바꿔라."
                )

        next_question = (
            chosen
            if chosen
            else _smart_fallback_question(post, prev_questions, intent=q_intent)
        )

        interaction = AIInteraction(
            post_id=post_id,
            step_number=next_step,
            question=next_question,
            answer=None,
        )

        db.add(interaction)
        db.commit()

        tr = _load_ai_transcript(db, post_id)
        return {
            "type": "question",
            "step": next_step,
            "question": next_question,
            "transcript": tr,
        }

    except Exception as e:
        print("=== next_ai error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))
