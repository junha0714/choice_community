from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, case, literal

from categories import (
    BOARD_CATEGORIES,
    NOTICE_CATEGORY,
    SUGGESTION_CATEGORY,
    is_board_category,
    is_notice_category,
    is_suggestion_category,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, get_current_user_optional
from models import Post, Comment, Vote, PostLike, User, AISession, Notification
from schemas import (
    PostCreate,
    PostUpdate,
    PostResponse,
    PaginatedPosts,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
    VoteCreate,
    VoteResponse,
    VoteCountResponse,
    LikeToggleResponse,
    MessageResponse,
    SimilarPostBrief,
)
from post_utils import post_option_list, tags_list
from app_helpers import (
    _notify,
    _comment_reply_counts,
    _comment_to_response,
    _get_blocked_ids,
    _nickname_map,
    _vote_deadline_passed,
    _post_to_response,
    _apply_post_search,
    _get_post_or_404,
    _posts_list_query,
    _post_to_similar_brief,
    _delete_ai_session,
)

router = APIRouter(tags=["posts"])

@router.post("/posts", response_model=PostResponse)
def create_post(
    post: PostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai_mode_val = None
    ai_steps_val = None
    if is_notice_category(post.category):
        if not getattr(current_user, "is_admin", False):
            raise HTTPException(
                status_code=403,
                detail="공지사항은 관리자만 작성할 수 있어요.",
            )
    if post.post_kind == "ai":
        if is_notice_category(post.category) or is_suggestion_category(post.category):
            raise HTTPException(
                status_code=400,
                detail="공지·건의 게시판에는 AI 글을 올릴 수 없어요.",
            )
        ai_mode_val = post.ai_mode or "quick"
        ai_steps_val = post.ai_question_steps

    tags_csv = ",".join(post.tags) if post.tags else None
    opts_csv = (
        ""
        if is_board_category(post.category)
        else ",".join(post.options)
    )
    deadline = (
        None if is_board_category(post.category) else post.vote_deadline_at
    )
    new_post = Post(
        title=post.title,
        content=post.content,
        category=post.category,
        options=opts_csv,
        user_id=current_user.id,
        post_kind=post.post_kind,
        ai_mode=ai_mode_val,
        ai_question_steps=ai_steps_val,
        tags=tags_csv,
        vote_deadline_at=deadline,
    )

    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    return _post_to_response(
        new_post,
        {current_user.id: current_user.nickname},
    )


@router.get("/posts", response_model=PaginatedPosts)
def get_posts(
    category: str | None = None,
    feed: str | None = None,
    q: str | None = None,
    tag: str | None = None,
    sort: str = "latest",
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    sort = (sort or "latest").strip().lower()
    # 예전 URL 호환: popular → 기본 정렬
    if sort == "popular":
        sort = "likes"
    if sort not in ("latest", "likes", "harmony", "comments", "votes"):
        sort = "latest"

    query = _posts_list_query(db, current_user)
    cat = (category or "").strip()
    feed_key = (feed or "").strip().lower()
    if cat == NOTICE_CATEGORY:
        feed_key = "notice"
    elif cat == SUGGESTION_CATEGORY:
        feed_key = "feedback"
    elif cat:
        feed_key = "choice"
        query = query.filter(Post.category == cat)
    elif feed_key == "notice":
        query = query.filter(Post.category == NOTICE_CATEGORY)
    elif feed_key == "feedback":
        query = query.filter(Post.category == SUGGESTION_CATEGORY)
    else:
        # 기본 홈: 고민 글만 (공지·피드백 제외)
        query = query.filter(~Post.category.in_(BOARD_CATEGORIES))
    query = _apply_post_search(query, q)
    if tag:
        t = tag.strip().lower()[:30]
        if t:
            wrapped = func.concat(",", func.coalesce(Post.tags, ""), ",")
            query = query.filter(wrapped.like(f"%,{t},%"))

    cc_sub = (
        db.query(
            Comment.post_id.label("pid"),
            func.count(Comment.id).label("cnt"),
        )
        .filter(Comment.deleted_at.is_(None))
        .group_by(Comment.post_id)
        .subquery()
    )
    vc_sub = (
        db.query(
            Vote.post_id.label("pid"),
            func.count(Vote.id).label("cnt"),
        )
        .group_by(Vote.post_id)
        .subquery()
    )

    if sort == "comments":
        query = query.outerjoin(cc_sub, Post.id == cc_sub.c.pid)
        query = query.order_by(
            func.coalesce(cc_sub.c.cnt, 0).desc(),
            Post.id.desc(),
        )
    elif sort == "votes":
        query = query.outerjoin(vc_sub, Post.id == vc_sub.c.pid)
        query = query.order_by(
            func.coalesce(vc_sub.c.cnt, 0).desc(),
            Post.id.desc(),
        )
    elif sort == "harmony":
        # 조회순: 좋아요·댓글·투표 반응을 한 점수로 합산 (한쪽만 튀는 글보다 고르게 반응받은 글 우선)
        query = query.outerjoin(cc_sub, Post.id == cc_sub.c.pid).outerjoin(
            vc_sub, Post.id == vc_sub.c.pid
        )
        harmony_score = (
            func.coalesce(Post.like_count, 0)
            + func.coalesce(cc_sub.c.cnt, 0)
            + func.coalesce(vc_sub.c.cnt, 0)
        )
        query = query.order_by(harmony_score.desc(), Post.id.desc())
    elif sort == "latest":
        query = query.order_by(Post.created_at.desc(), Post.id.desc())
    else:
        query = query.order_by(Post.like_count.desc(), Post.id.desc())

    total = query.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    posts = (
        query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    ids = {p.user_id for p in posts if p.user_id}
    nick_map = _nickname_map(db, ids)
    liked_map: dict[int, bool] = {}
    if current_user and posts:
        pids = [p.id for p in posts]
        likes = (
            db.query(PostLike.post_id)
            .filter(
                PostLike.post_id.in_(pids),
                PostLike.user_id == current_user.id,
            )
            .all()
        )
        liked_set = {row[0] for row in likes}
        liked_map = {p.id: p.id in liked_set for p in posts}

    comment_map: dict[int, int] = {}
    vote_map: dict[int, int] = {}
    if posts:
        pids = [p.id for p in posts]
        rows = (
            db.query(Comment.post_id, func.count(Comment.id))
            .filter(Comment.deleted_at.is_(None), Comment.post_id.in_(pids))
            .group_by(Comment.post_id)
            .all()
        )
        comment_map = {int(pid): int(cnt) for pid, cnt in rows if pid is not None}
        vrows = (
            db.query(Vote.post_id, func.count(Vote.id))
            .filter(Vote.post_id.in_(pids))
            .group_by(Vote.post_id)
            .all()
        )
        vote_map = {int(pid): int(cnt) for pid, cnt in vrows if pid is not None}

    items = [
        _post_to_response(
            p,
            nick_map,
            liked_by_me=liked_map.get(p.id) if current_user else None,
            comment_count=comment_map.get(p.id, 0),
            vote_count=vote_map.get(p.id, 0),
        )
        for p in posts
    ]
    return PaginatedPosts(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )

@router.get("/posts/me", response_model=list[PostResponse])
def my_posts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """내가 작성한 고민 글 (최신순, 삭제된 글 제외 · 숨김 글은 작성자에게 표시)"""
    posts = (
        db.query(Post)
        .filter(
            Post.user_id == current_user.id,
            Post.deleted_at.is_(None),
        )
        .order_by(Post.id.desc())
        .all()
    )
    nick_map = {current_user.id: current_user.nickname}
    return [_post_to_response(p, nick_map) for p in posts]


@router.get("/posts/me/commented", response_model=list[PostResponse])
def my_commented_posts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """내가 댓글을 단 글 (최근 댓글 순 · 삭제·미게시 글 제외)"""
    last_comments = (
        db.query(
            Comment.post_id.label("post_id"),
            func.max(Comment.id).label("last_comment_id"),
        )
        .filter(
            Comment.user_id == current_user.id,
            Comment.deleted_at.is_(None),
        )
        .group_by(Comment.post_id)
        .subquery()
    )
    posts = (
        db.query(Post)
        .join(last_comments, Post.id == last_comments.c.post_id)
        .filter(
            Post.deleted_at.is_(None),
            func.coalesce(Post.is_published, True).is_(True),
        )
        .order_by(last_comments.c.last_comment_id.desc())
        .all()
    )
    user_ids = {p.user_id for p in posts if p.user_id}
    nick_map = _nickname_map(db, user_ids)
    return [_post_to_response(p, nick_map) for p in posts]


@router.get("/posts/{post_id}", response_model=PostResponse)
def get_post(
    post_id: int,
    count_view: bool = Query(True, description="false면 조회수를 올리지 않음"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)

    if (
        current_user
        and post.user_id == current_user.id
        and _vote_deadline_passed(post)
    ):
        already = (
            db.query(Notification.id)
            .filter(
                Notification.user_id == current_user.id,
                Notification.post_id == post_id,
                Notification.kind == "vote_closed",
            )
            .first()
        )
        if not already:
            title_short = (post.title or "")[:80]
            _notify(
                db,
                user_id=current_user.id,
                kind="vote_closed",
                title="투표가 마감되었어요",
                body=f"글: {title_short}",
                post_id=post_id,
            )

    if count_view:
        post.view_count = (getattr(post, "view_count", None) or 0) + 1
        db.commit()
        db.refresh(post)

    ids = {post.user_id} if post.user_id else set()
    nick_map = _nickname_map(db, ids)

    liked_by_me: bool | None = None
    if current_user:
        liked_by_me = (
            db.query(PostLike)
            .filter(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
            .first()
            is not None
        )

    comment_count = (
        db.query(func.count(Comment.id))
        .filter(Comment.deleted_at.is_(None), Comment.post_id == post_id)
        .scalar()
        or 0
    )
    vote_count = (
        db.query(func.count(Vote.id)).filter(Vote.post_id == post_id).scalar() or 0
    )

    return _post_to_response(
        post,
        nick_map,
        liked_by_me=liked_by_me,
        comment_count=int(comment_count),
        vote_count=int(vote_count),
    )


@router.get("/posts/{post_id}/similar", response_model=list[SimilarPostBrief])
def get_similar_posts(
    post_id: int,
    limit: int = 8,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    비슷한 고민 글 추천 (MVP):
    - 태그 겹침 개수 + 카테고리 동일 보너스로 점수화
    - 삭제/숨김/차단 필터는 목록과 동일하게 적용
    """
    limit = min(max(int(limit or 8), 1), 20)
    offset = max(int(offset or 0), 0)
    src = _get_post_or_404(db, post_id, current_user)

    base = _posts_list_query(db, current_user).filter(Post.id != src.id)

    src_tags = tags_list(src)
    wrapped = func.concat(",", func.coalesce(Post.tags, ""), ",")
    tag_terms = [(t or "").strip().lower()[:30] for t in src_tags]
    tag_terms = [t for t in tag_terms if t]

    # tag overlap score
    tag_score_expr = literal(0)
    for t in tag_terms:
        tag_score_expr = tag_score_expr + case(
            (wrapped.like(f"%,{t},%"), 1),
            else_=0,
        )

    category_bonus_expr = case((Post.category == src.category, 2), else_=0)
    score_expr = tag_score_expr + category_bonus_expr

    # Return only meaningful matches:
    # - If src has tags: require at least 1 tag overlap OR same category
    # - If src has no tags: require same category
    if tag_terms:
        base = base.filter(or_(tag_score_expr > 0, Post.category == src.category))
    else:
        base = base.filter(Post.category == src.category)

    rows = (
        base.add_columns(score_expr.label("score"))
        .order_by(func.coalesce(score_expr, 0).desc(), Post.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    posts = [p for (p, _score) in rows]
    return [_post_to_similar_brief(p) for p in posts]


@router.post("/posts/{post_id}/like", response_model=LikeToggleResponse)
def toggle_post_like(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)

    existing = (
        db.query(PostLike)
        .filter(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
        .first()
    )
    lc = getattr(post, "like_count", None) or 0
    if existing:
        db.delete(existing)
        post.like_count = max(0, lc - 1)
        liked = False
    else:
        db.add(PostLike(post_id=post_id, user_id=current_user.id))
        post.like_count = lc + 1
        liked = True
        if post.user_id and post.user_id != current_user.id:
            title_short = (post.title or "")[:80]
            liker = (current_user.nickname or "").strip() or "누군가"
            _notify(
                db,
                user_id=post.user_id,
                kind="post_liked",
                title="내 글에 좋아요가 달렸어요",
                body=f"{liker} · 글: {title_short}",
                post_id=post_id,
            )
    db.commit()
    db.refresh(post)

    return LikeToggleResponse(
        liked=liked,
        like_count=getattr(post, "like_count", None) or 0,
    )

@router.post("/posts/{post_id}/comments", response_model=CommentResponse)
def create_comment(
    post_id: int,
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    parent_id = comment.parent_id
    parent: Comment | None = None
    if parent_id is not None:
        parent = (
            db.query(Comment)
            .filter(
                Comment.id == parent_id,
                Comment.post_id == post_id,
                Comment.deleted_at.is_(None),
            )
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=400,
                detail="대댓글 대상을 찾을 수 없습니다.",
            )

    new_comment = Comment(
        content=comment.content,
        post_id=post_id,
        user_id=current_user.id,
        parent_id=parent_id,
        is_anonymous=bool(comment.is_anonymous),
    )
    db.add(new_comment)
    db.flush()

    title_short = (post.title or "")[:80]
    if parent_id is not None and parent and parent.user_id:
        if parent.user_id != current_user.id:
            _notify(
                db,
                user_id=parent.user_id,
                kind="reply_to_comment",
                title="내 댓글에 답글이 달렸어요",
                body=f"글: {title_short}",
                post_id=post_id,
                comment_id=new_comment.id,
            )
    elif post.user_id and post.user_id != current_user.id:
        _notify(
            db,
            user_id=post.user_id,
            kind="comment_on_post",
            title="내 글에 댓글이 달렸어요",
            body=f"글: {title_short}",
            post_id=post_id,
            comment_id=new_comment.id,
        )

    db.commit()
    db.refresh(new_comment)

    nick_map = _nickname_map(
        db, {new_comment.user_id} if new_comment.user_id else set()
    )
    reply_map = _comment_reply_counts(db, [new_comment.id])
    return _comment_to_response(
        new_comment,
        nick_map,
        reply_map,
        viewer_user_id=current_user.id,
        viewer_is_admin=bool(getattr(current_user, "is_admin", False)),
    )


@router.get("/posts/{post_id}/comments", response_model=list[CommentResponse])
def get_comments(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    _get_post_or_404(db, post_id, current_user)
    q = db.query(Comment).filter(
        Comment.post_id == post_id,
        Comment.deleted_at.is_(None),
    )
    if current_user:
        blocked = _get_blocked_ids(db, current_user.id)
        if blocked:
            q = q.filter(
                or_(Comment.user_id.is_(None), ~Comment.user_id.in_(blocked))
            )
    comments = q.order_by(Comment.id.asc()).all()
    ids = {c.user_id for c in comments if c.user_id}
    nick_map = _nickname_map(db, ids)
    cids = [c.id for c in comments]
    reply_map = _comment_reply_counts(db, cids)
    viewer_id = current_user.id if current_user else None
    viewer_admin = (
        bool(getattr(current_user, "is_admin", False)) if current_user else False
    )
    return [
        _comment_to_response(
            c,
            nick_map,
            reply_map,
            viewer_user_id=viewer_id,
            viewer_is_admin=viewer_admin,
        )
        for c in comments
    ]
@router.post("/posts/{post_id}/votes", response_model=VoteResponse)
def create_vote(
    post_id: int,
    vote: VoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)

    if is_board_category(post.category):
        raise HTTPException(
            status_code=400,
            detail="공지·건의 게시판 글에는 투표할 수 없어요.",
        )

    if _vote_deadline_passed(post):
        raise HTTPException(
            status_code=400,
            detail="투표 마감 시간이 지났습니다.",
        )

    options = post_option_list(post)
    choice = vote.selected_option.strip()
    if choice not in options:
        raise HTTPException(
            status_code=400,
            detail="선택지에 없는 항목입니다.",
        )

    if post.user_id is not None and post.user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="본인이 쓴 글에는 투표할 수 없어요.",
        )

    existing = (
        db.query(Vote)
        .filter(Vote.post_id == post_id, Vote.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="이미 이 글에 투표했습니다. 투표는 변경할 수 없습니다.",
        )

    new_vote = Vote(
        post_id=post_id,
        user_id=current_user.id,
        selected_option=choice,
    )
    try:
        db.add(new_vote)
        db.commit()
        db.refresh(new_vote)
        return new_vote
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="투표 처리 중 충돌이 났습니다. 다시 시도해 주세요.",
        )


@router.get("/posts/{post_id}/votes/me", response_model=VoteResponse | None)
def get_my_vote(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 로그인 사용자의 이 글에 대한 투표 (없으면 null)"""
    _get_post_or_404(db, post_id, current_user)
    v = (
        db.query(Vote)
        .filter(Vote.post_id == post_id, Vote.user_id == current_user.id)
        .first()
    )
    return v

@router.get("/posts/{post_id}/votes", response_model=list[VoteCountResponse])
def get_vote_counts(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)

    options = post_option_list(post)
    votes = db.query(Vote).filter(Vote.post_id == post_id).all()

    results = []
    for option in options:
        count = sum(1 for vote in votes if vote.selected_option.strip() == option)
        results.append({"option": option, "count": count})

    return results
@router.post("/posts/{post_id}/publish", response_model=PostResponse)
def publish_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI 임시저장 글을 게시판에 공개한다."""
    post = _get_post_or_404(db, post_id, current_user)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 게시할 수 있습니다.")
    if bool(getattr(post, "is_published", True)):
        raise HTTPException(status_code=400, detail="이미 게시된 글이에요.")
    if (getattr(post, "post_kind", None) or "community") == "ai":
        if not (getattr(post, "ai_recommended", None) or "").strip():
            raise HTTPException(
                status_code=400,
                detail="AI 추천을 완료한 뒤에 게시할 수 있어요.",
            )
    post.is_published = True
    db.commit()
    db.refresh(post)

    # 연결된 AI 세션이 있으면 정리 (만료 전 마이페이지에서 게시한 경우)
    linked_sess = (
        db.query(AISession)
        .filter(
            AISession.draft_post_id == post_id,
            AISession.user_id == current_user.id,
        )
        .first()
    )
    if linked_sess:
        _delete_ai_session(db, linked_sess.id, linked_sess)

    nick_map = _nickname_map(db, {current_user.id})
    return _post_to_response(post, nick_map)


@router.patch("/posts/{post_id}", response_model=PostResponse)
def update_post(
    post_id: int,
    body: PostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 수정할 수 있습니다.")
    data = body.model_dump(exclude_unset=True)
    new_cat = data.get("category", post.category)
    if is_notice_category(new_cat) and not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=403,
            detail="공지사항은 관리자만 작성·수정할 수 있어요.",
        )
    if not data:
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다.")
    if "title" in data:
        post.title = data["title"]
    if "content" in data:
        post.content = data["content"]
    if "category" in data:
        post.category = data["category"]
    if "options" in data:
        post.options = ",".join(data["options"])
    if "tags" in data:
        post.tags = ",".join(data["tags"]) if data["tags"] else ""
    if "vote_deadline_at" in data:
        post.vote_deadline_at = data["vote_deadline_at"]
    if "ai_transcript_public" in data:
        if (getattr(post, "post_kind", None) or "community") != "ai":
            raise HTTPException(
                status_code=400,
                detail="AI 글에서만 대화 공개 설정을 바꿀 수 있어요.",
            )
        if not (getattr(post, "ai_recommended", None) or "").strip():
            raise HTTPException(
                status_code=400,
                detail="AI 추천을 완료한 뒤에만 대화 공개 여부를 바꿀 수 있어요.",
            )
        post.ai_transcript_public = bool(data["ai_transcript_public"])
    if is_board_category(post.category):
        post.options = ""
        post.vote_deadline_at = None
    db.commit()
    db.refresh(post)
    nick_map = _nickname_map(db, {post.user_id} if post.user_id else set())
    return _post_to_response(post, nick_map)


@router.delete("/posts/{post_id}", response_model=MessageResponse)
@router.patch(
    "/posts/{post_id}/comments/{comment_id}",
    response_model=CommentResponse,
)
def update_comment(
    post_id: int,
    comment_id: int,
    body: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_post_or_404(db, post_id, current_user)
    c = (
        db.query(Comment)
        .filter(
            Comment.id == comment_id,
            Comment.post_id == post_id,
        )
        .first()
    )
    if not c or c.deleted_at is not None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if c.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 수정할 수 있습니다.")
    c.content = body.content
    db.commit()
    db.refresh(c)
    nick_map = _nickname_map(db, {c.user_id} if c.user_id else set())
    reply_map = _comment_reply_counts(db, [c.id])
    return _comment_to_response(
        c,
        nick_map,
        reply_map,
        viewer_user_id=current_user.id,
        viewer_is_admin=bool(getattr(current_user, "is_admin", False)),
    )


@router.delete(
    "/posts/{post_id}/comments/{comment_id}",
    response_model=MessageResponse,
)
def delete_comment(
    post_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_post_or_404(db, post_id, current_user)
    c = (
        db.query(Comment)
        .filter(
            Comment.id == comment_id,
            Comment.post_id == post_id,
        )
        .first()
    )
    if not c or c.deleted_at is not None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if c.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 삭제할 수 있습니다.")
    c.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="댓글이 삭제되었습니다.")
