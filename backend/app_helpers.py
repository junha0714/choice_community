"""HTTP-independent helpers (posts, comments, votes, AI DB loads, reports)."""
import hashlib
import re
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, case, literal
from sqlalchemy.orm import Session

from models import (
    Post,
    Comment,
    Vote,
    AIInteraction,
    AISession,
    AISessionInteraction,
    User,
    UserBlock,
    Notification,
)
from schemas import PostResponse, SimilarPostBrief, CommentResponse, AITranscriptItem
from post_utils import tags_list

def _notify(
    db: Session,
    *,
    user_id: int | None,
    kind: str,
    title: str,
    body: str,
    post_id: int | None = None,
    comment_id: int | None = None,
    report_id: int | None = None,
) -> None:
    if not user_id:
        return
    db.add(
        Notification(
            user_id=user_id,
            kind=kind,
            title=title[:255],
            body=body,
            post_id=post_id,
            comment_id=comment_id,
            report_id=report_id,
        )
    )


def _comment_reply_counts(db: Session, comment_ids: list[int]) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = (
        db.query(Comment.parent_id, func.count(Comment.id))
        .filter(
            Comment.parent_id.in_(comment_ids),
            Comment.deleted_at.is_(None),
        )
        .group_by(Comment.parent_id)
        .all()
    )
    return {int(pid): int(cnt) for pid, cnt in rows if pid is not None}


def _comment_to_response(
    c: Comment,
    nick_map: dict[int, str | None],
    reply_map: dict[int, int],
) -> CommentResponse:
    return CommentResponse(
        id=c.id,
        content=c.content,
        post_id=c.post_id,
        user_id=c.user_id,
        author_nickname=nick_map.get(c.user_id) if c.user_id else None,
        parent_id=getattr(c, "parent_id", None),
        reply_count=reply_map.get(c.id, 0),
        created_at=c.created_at,
    )


def _nickname_map(db: Session, user_ids: set[int]) -> dict[int, str | None]:
    if not user_ids:
        return {}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: u.nickname for u in users}


def _vote_deadline_passed(post: Post) -> bool:
    dl = getattr(post, "vote_deadline_at", None)
    if dl is None:
        return False
    now = datetime.now(timezone.utc)
    if dl.tzinfo is None:
        dl = dl.replace(tzinfo=timezone.utc)
    else:
        dl = dl.astimezone(timezone.utc)
    return now > dl


def _post_to_response(
    post: Post,
    nick_map: dict[int, str | None],
    *,
    liked_by_me: bool | None = None,
    comment_count: int | None = None,
) -> PostResponse:
    kind = getattr(post, "post_kind", None) or "community"
    return PostResponse(
        id=post.id,
        title=post.title,
        content=post.content,
        category=post.category,
        options=post.options,
        post_kind=kind,
        ai_mode=getattr(post, "ai_mode", None),
        ai_question_steps=getattr(post, "ai_question_steps", None),
        view_count=getattr(post, "view_count", None) or 0,
        like_count=getattr(post, "like_count", None) or 0,
        comment_count=int(comment_count or 0),
        liked_by_me=liked_by_me,
        ai_recommended=getattr(post, "ai_recommended", None),
        ai_reason=getattr(post, "ai_reason", None),
        ai_transcript_public=bool(getattr(post, "ai_transcript_public", False)),
        user_id=post.user_id,
        author_nickname=nick_map.get(post.user_id) if post.user_id else None,
        created_at=post.created_at,
        is_hidden=bool(getattr(post, "is_hidden", False)),
        tags=tags_list(post),
        vote_deadline_at=getattr(post, "vote_deadline_at", None),
    )


def _posts_ilike_pattern(raw: str) -> str:
    """ILIKE용 패턴. %, _ 와일드카드·과도한 길이 방지."""
    s = (raw or "").strip()[:200]
    s = s.replace("%", "").replace("_", "")
    return f"%{s}%" if s else ""


def _apply_post_search(query, q: str | None):
    pattern = _posts_ilike_pattern(q or "")
    if not pattern:
        return query
    return query.filter(
        or_(
            Post.title.ilike(pattern),
            Post.content.ilike(pattern),
            Post.options.ilike(pattern),
        )
    )


def _hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_blocked_ids(db: Session, blocker_id: int) -> set[int]:
    rows = (
        db.query(UserBlock.blocked_id)
        .filter(UserBlock.blocker_id == blocker_id)
        .all()
    )
    return {r[0] for r in rows}


def _posts_list_query(db: Session, current_user: User | None):
    q = db.query(Post).filter(Post.deleted_at.is_(None))
    if current_user is None or not getattr(current_user, "is_admin", False):
        # is_hidden IS NULL 인 레거시 행도 목록에 포함 (== False 는 NULL 행을 SQL에서 제외함)
        q = q.filter(func.coalesce(Post.is_hidden, False).is_(False))
    if current_user:
        blocked = _get_blocked_ids(db, current_user.id)
        if blocked:
            q = q.filter(or_(Post.user_id.is_(None), ~Post.user_id.in_(blocked)))
    return q


def _post_to_similar_brief(post: Post) -> SimilarPostBrief:
    kind = getattr(post, "post_kind", None) or "community"
    return SimilarPostBrief(
        id=post.id,
        title=post.title,
        category=post.category,
        post_kind=kind,
        view_count=getattr(post, "view_count", None) or 0,
        like_count=getattr(post, "like_count", None) or 0,
        created_at=post.created_at,
        tags=tags_list(post),
    )


def _get_post_or_404(
    db: Session,
    post_id: int,
    current_user: User | None,
) -> Post:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    admin = current_user is not None and getattr(current_user, "is_admin", False)
    author = (
        current_user is not None
        and post.user_id is not None
        and post.user_id == current_user.id
    )
    if post.deleted_at is not None and not admin:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if getattr(post, "is_hidden", False) and not admin and not author:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    return post
def _tokenize_for_tag_suggest(text: str) -> set[str]:
    """
    태그 추천용 매우 가벼운 토크나이저.
    - 한국어/영문/숫자 토큰을 뽑아 소문자화
    - 너무 짧은 토큰은 제거
    """
    raw = (text or "").lower()
    tokens = re.findall(r"[가-힣a-z0-9]{2,}", raw)
    out: set[str] = set()
    for t in tokens:
        if len(t) < 2:
            continue
        if len(t) > 30:
            t = t[:30]
        out.add(t)
    return out


def _normalize_tag_term(s: str) -> str:
    return (s or "").strip().lower()[:30]


def _suggest_tags_from_db(
    db: Session,
    *,
    title: str,
    content: str,
    category: str | None,
    selected: list[str],
    limit: int = 8,
) -> list[str]:
    blob = f"{title}\n{content}".strip().lower()
    tokens = _tokenize_for_tag_suggest(blob)
    selected_set = {_normalize_tag_term(x) for x in (selected or []) if _normalize_tag_term(x)}

    q = db.query(Post.tags).filter(Post.deleted_at.is_(None), Post.tags.isnot(None))
    if category:
        q = q.filter(Post.category == category.strip())
    rows = q.order_by(Post.id.desc()).limit(600).all()

    counts: dict[str, int] = {}
    for (csv,) in rows:
        if not csv:
            continue
        for raw in str(csv).split(","):
            t = _normalize_tag_term(raw)
            if not t or t in selected_set:
                continue
            counts[t] = counts.get(t, 0) + 1

    if not counts:
        return []

    # 점수: 빈도 + 본문/제목에 직접 등장하면 가산
    scored: list[tuple[int, str]] = []
    for tag, cnt in counts.items():
        score = cnt
        if tag in tokens or (tag and tag in blob):
            score += 60
        else:
            # 토큰 중 부분 일치(예: "이직" vs "이직준비") 약하게 가산
            if any(tag in tok or tok in tag for tok in tokens):
                score += 10
        scored.append((score, tag))

    scored.sort(key=lambda x: (-x[0], x[1]))
    return [t for _, t in scored[:limit]]
def _load_ai_transcript(db: Session, post_id: int) -> list[AITranscriptItem]:
    rows = (
        db.query(AIInteraction)
        .filter(AIInteraction.post_id == post_id)
        .order_by(AIInteraction.step_number.asc())
        .all()
    )
    return [
        AITranscriptItem(step=r.step_number, question=r.question, answer=r.answer)
        for r in rows
    ]
def _load_ai_session_transcript(db: Session, session_id: str) -> list[AITranscriptItem]:
    rows = (
        db.query(AISessionInteraction)
        .filter(AISessionInteraction.session_id == session_id)
        .order_by(AISessionInteraction.step_number.asc())
        .all()
    )
    return [
        AITranscriptItem(step=r.step_number, question=r.question, answer=r.answer)
        for r in rows
    ]


def _get_ai_session_or_404(
    db: Session, session_id: str, current_user: User
) -> AISession:
    s = db.query(AISession).filter(AISession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="AI 세션을 찾을 수 없습니다.")
    if s.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 AI 대화를 진행할 수 있어요.")
    if s.expires_at is not None:
        try:
            now = datetime.now(timezone.utc)
            exp = s.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if now >= exp:
                raise HTTPException(status_code=410, detail="AI 세션이 만료되었습니다.")
        except HTTPException:
            raise
        except Exception:
            pass
    return s


def _ai_session_post_like(session: AISession):
    # AI 로직은 Post 객체의 속성(title/content/options/category/tags/ai_mode 등)에만 의존한다.
    from types import SimpleNamespace

    return SimpleNamespace(
        id=session.id,
        title=session.title,
        content=session.content,
        category=session.category,
        options=session.options,
        post_kind="ai",
        ai_mode=session.ai_mode,
        ai_question_steps=getattr(session, "ai_question_steps", None),
        tags=session.tags,
        vote_deadline_at=session.vote_deadline_at,
    )


def _expires_at_utc(expires_at: datetime) -> datetime:
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=timezone.utc)
    return expires_at.astimezone(timezone.utc)
def _validate_report_target(db: Session, target_type: str, target_id: int) -> None:
    if target_type == "post":
        if not db.query(Post).filter(Post.id == target_id).first():
            raise HTTPException(status_code=404, detail="대상 게시글을 찾을 수 없습니다.")
    elif target_type == "comment":
        if not db.query(Comment).filter(Comment.id == target_id).first():
            raise HTTPException(status_code=404, detail="대상 댓글을 찾을 수 없습니다.")
    elif target_type == "user":
        if not db.query(User).filter(User.id == target_id).first():
            raise HTTPException(status_code=404, detail="대상 사용자를 찾을 수 없습니다.")
