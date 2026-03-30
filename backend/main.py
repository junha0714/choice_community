from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_
import os
import re
import json
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from openai import OpenAI
from dotenv import load_dotenv

from database import engine, get_db
from models import Base
from models import (
    Post,
    Comment,
    Vote,
    AIInteraction,
    User,
    PostLike,
    Report,
    UserBlock,
    PasswordResetToken,
)
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
    AIQuestionFlowResponse,
    AIAnswerRequest,
    UserRegister,
    UserLogin,
    TokenResponse,
    UserPublic,
    UserProfileUpdate,
    CategoryStat,
    PopularPostBrief,
    PopularPostByViewsBrief,
    RecentCommentBrief,
    LikeToggleResponse,
    ReportCreate,
    ReportResponse,
    ReportAdminPatch,
    UserBlockCreate,
    UserBlockResponse,
    PasswordChangeBody,
    ForgotPasswordBody,
    ResetPasswordBody,
    ForgotPasswordResponse,
    MessageResponse,
    AdminUserBrief,
    AdminUserPatch,
    AdminPostPatch,
    PaginatedReports,
    PaginatedAdminUsers,
)
from auth import hash_password, verify_password, create_access_token
from deps import get_current_user, get_current_user_optional, get_current_admin
from migrate_schema import run_schema_migrations
from categories import ALLOWED_CATEGORIES



load_dotenv()

PASSWORD_RESET_DEBUG = os.getenv("PASSWORD_RESET_DEBUG", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 테이블 생성
Base.metadata.create_all(bind=engine)
run_schema_migrations()


def _nickname_map(db: Session, user_ids: set[int]) -> dict[int, str | None]:
    if not user_ids:
        return {}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: u.nickname for u in users}


def _post_to_response(
    post: Post,
    nick_map: dict[int, str | None],
    *,
    liked_by_me: bool | None = None,
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
        view_count=getattr(post, "view_count", None) or 0,
        like_count=getattr(post, "like_count", None) or 0,
        liked_by_me=liked_by_me,
        ai_recommended=getattr(post, "ai_recommended", None),
        ai_reason=getattr(post, "ai_reason", None),
        user_id=post.user_id,
        author_nickname=nick_map.get(post.user_id) if post.user_id else None,
        created_at=post.created_at,
        is_hidden=bool(getattr(post, "is_hidden", False)),
    )


def _posts_ilike_pattern(raw: str) -> str:
    """ILIKE용 패턴. %, _ 와일드카드·과도한 길이 방지."""
    s = (raw or "").strip()[:200]
    s = s.replace("%", "").replace("_", "")
    return f"%{s}%" if s else ""


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
        q = q.filter(Post.is_hidden == False)
    if current_user:
        blocked = _get_blocked_ids(db, current_user.id)
        if blocked:
            q = q.filter(or_(Post.user_id.is_(None), ~Post.user_id.in_(blocked)))
    return q


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


def _parse_ai_json_response(raw: str | None) -> dict:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```\w*\n?", "", s)
        s = re.sub(r"\n?```\s*$", "", s).strip()
    brace = re.search(r"\{[\s\S]*\}", s)
    return json.loads(brace.group(0) if brace else s)


def _ai_max_question_steps(post: Post) -> int:
    """저장된 질문 개수가 이 값에 도달하면 다음 답변 후 최종 추천. simple=3, detailed=5."""
    if (getattr(post, "ai_mode", None) or "simple") == "detailed":
        return 5
    return 3


def _require_ai_post(post: Post) -> None:
    """AI 질문/추천 API는 post_kind가 ai인 글에서만 사용 가능."""
    if (getattr(post, "post_kind", None) or "community") != "ai":
        raise HTTPException(
            status_code=400,
            detail="AI 질문·추천은 'AI와 함께 고민하기'로 작성한 글에서만 사용할 수 있어요.",
        )


@app.post("/auth/register", response_model=UserPublic)
def register(body: UserRegister, db: Session = Depends(get_db)):
    email_norm = str(body.email).lower().strip()
    if db.query(User).filter(User.email == email_norm).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")

    nickname = (body.nickname or "").strip() or None

    user = User(
        email=email_norm,
        hashed_password=hash_password(body.password),
        nickname=nickname,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    email = str(body.email).lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )
    if getattr(user, "is_banned", False):
        raise HTTPException(
            status_code=403,
            detail="이용이 제한된 계정입니다.",
        )
    try:
        token = create_access_token(user_id=user.id, email=user.email)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return TokenResponse(access_token=token)


@app.get("/auth/me", response_model=UserPublic)
def auth_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.patch("/auth/me", response_model=UserPublic)
def update_me(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.nickname = (body.nickname or "").strip() or None
    db.commit()
    db.refresh(current_user)
    return current_user


@app.get("/")
def root():
    return {"message": "Backend + PostgreSQL 연결 성공"}


@app.get("/meta/categories")
def meta_categories():
    """글 작성 시 선택 가능한 카테고리 목록."""
    return {"categories": list(ALLOWED_CATEGORIES)}


@app.post("/posts", response_model=PostResponse)
def create_post(
    post: PostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai_mode_val = None
    if post.post_kind == "ai":
        ai_mode_val = post.ai_mode or "simple"

    new_post = Post(
        title=post.title,
        content=post.content,
        category=post.category,
        options=",".join(post.options),  # 일단 문자열로 저장
        user_id=current_user.id,
        post_kind=post.post_kind,
        ai_mode=ai_mode_val,
    )

    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    return _post_to_response(
        new_post,
        {current_user.id: current_user.nickname},
    )


@app.get("/posts", response_model=PaginatedPosts)
def get_posts(
    category: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 50)

    query = _posts_list_query(db, current_user)
    if category:
        query = query.filter(Post.category == category.strip())
    pattern = _posts_ilike_pattern(q or "")
    if pattern:
        query = query.filter(
            or_(
                Post.title.ilike(pattern),
                Post.content.ilike(pattern),
                Post.options.ilike(pattern),
            )
        )
    total = query.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    posts = (
        query.order_by(Post.id.desc())
        .offset((page - 1) * page_size)
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

    items = [
        _post_to_response(
            p,
            nick_map,
            liked_by_me=liked_map.get(p.id) if current_user else None,
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


@app.get("/stats/categories", response_model=list[CategoryStat])
def stats_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(Post.category, func.count(Post.id))
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .group_by(Post.category)
        .all()
    )
    count_map = {r[0]: int(r[1]) for r in rows}
    return [
        CategoryStat(category=cat, count=count_map.get(cat, 0))
        for cat in ALLOWED_CATEGORIES
    ]


@app.get("/stats/popular-posts", response_model=list[PopularPostBrief])
def stats_popular_posts(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    rows = (
        db.query(Post, func.count(Vote.id).label("vc"))
        .outerjoin(Vote, Post.id == Vote.post_id)
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .group_by(Post.id)
        .order_by(func.count(Vote.id).desc(), Post.id.desc())
        .limit(limit)
        .all()
    )
    return [
        PopularPostBrief(
            id=p.id,
            title=p.title,
            category=p.category,
            vote_count=int(vc),
        )
        for p, vc in rows
    ]


@app.get("/stats/popular-posts-by-views", response_model=list[PopularPostByViewsBrief])
def stats_popular_posts_by_views(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    rows = (
        db.query(Post)
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .order_by(Post.view_count.desc(), Post.id.desc())
        .limit(limit)
        .all()
    )
    return [
        PopularPostByViewsBrief(
            id=p.id,
            title=p.title,
            category=p.category,
            view_count=getattr(p, "view_count", None) or 0,
        )
        for p in rows
    ]


@app.get("/stats/recent-comments", response_model=list[RecentCommentBrief])
def stats_recent_comments(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    comments = (
        db.query(Comment)
        .join(Post, Comment.post_id == Post.id)
        .filter(
            Comment.deleted_at.is_(None),
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
        )
        .order_by(Comment.id.desc())
        .limit(limit)
        .all()
    )
    if not comments:
        return []

    post_ids = {c.post_id for c in comments}
    posts = {p.id: p for p in db.query(Post).filter(Post.id.in_(post_ids)).all()}
    user_ids = {c.user_id for c in comments if c.user_id}
    nick_map = _nickname_map(db, user_ids)

    out: list[RecentCommentBrief] = []
    for c in comments:
        pt = posts.get(c.post_id)
        title = pt.title if pt else "(글 없음)"
        text = c.content if len(c.content) <= 100 else c.content[:100] + "…"
        out.append(
            RecentCommentBrief(
                id=c.id,
                content=text,
                post_id=c.post_id,
                post_title=title,
                author_nickname=nick_map.get(c.user_id) if c.user_id else None,
                created_at=c.created_at,
            )
        )
    return out


@app.get("/posts/me", response_model=list[PostResponse])
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


@app.get("/posts/{post_id}", response_model=PostResponse)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)

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

    return _post_to_response(post, nick_map, liked_by_me=liked_by_me)


@app.post("/posts/{post_id}/like", response_model=LikeToggleResponse)
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
    db.commit()
    db.refresh(post)

    return LikeToggleResponse(
        liked=liked,
        like_count=getattr(post, "like_count", None) or 0,
    )

@app.post("/posts/{post_id}/comments", response_model=CommentResponse)
def create_comment(
    post_id: int,
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_post_or_404(db, post_id, current_user)

    new_comment = Comment(
        content=comment.content,
        post_id=post_id,
        user_id=current_user.id,
    )

    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    return CommentResponse(
        id=new_comment.id,
        content=new_comment.content,
        post_id=new_comment.post_id,
        user_id=new_comment.user_id,
        author_nickname=current_user.nickname,
        created_at=new_comment.created_at,
    )


@app.get("/posts/{post_id}/comments", response_model=list[CommentResponse])
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
    return [
        CommentResponse(
            id=c.id,
            content=c.content,
            post_id=c.post_id,
            user_id=c.user_id,
            author_nickname=nick_map.get(c.user_id) if c.user_id else None,
            created_at=c.created_at,
        )
        for c in comments
    ]

def _post_option_list(post: Post) -> list[str]:
    return [o.strip() for o in post.options.split(",") if o.strip()]


@app.post("/posts/{post_id}/votes", response_model=VoteResponse)
def create_vote(
    post_id: int,
    vote: VoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)

    options = _post_option_list(post)
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


@app.get("/posts/{post_id}/votes/me", response_model=VoteResponse | None)
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

@app.get("/posts/{post_id}/votes", response_model=list[VoteCountResponse])
def get_vote_counts(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    post = _get_post_or_404(db, post_id, current_user)

    options = _post_option_list(post)
    votes = db.query(Vote).filter(Vote.post_id == post_id).all()

    results = []
    for option in options:
        count = sum(1 for vote in votes if vote.selected_option.strip() == option)
        results.append({"option": option, "count": count})

    return results

@app.post("/posts/{post_id}/start-ai", response_model=AIQuestionFlowResponse)
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
    db.commit()

    try:
        mode = getattr(post, "ai_mode", None) or "simple"
        if mode == "detailed":
            sys_first = (
                "너는 사용자의 선택을 돕는 AI 도우미야. "
                "고민 본문과 모든 선택지를 읽고, 선택지들을 비교·균형 있게 탐색할 수 있는 첫 질문 1개를 만든다. "
                "단순 인사나 제목 반복 금지. 우선순위·트레이드오프·우려를 끌어낼 수 있게. "
                "질문은 한국어로, 문단 하나 분량 이내. "
                "반드시 JSON만 출력. 형식: {\"question\":\"질문내용\"}"
            )
            user_first = (
                f"고민 내용(본문):\n{post.content}\n\n"
                f"제목: {post.title}\n카테고리: {post.category}\n"
                f"선택지(모두 비교 대상): {post.options}\n\n"
                "첫 질문 1개만 만들어줘."
            )
        else:
            sys_first = (
                "너는 사용자의 선택을 돕는 AI 도우미야. "
                "반드시 사용자가 적은 '고민 내용' 본문을 구체적으로 읽고, 그 내용에 직접적으로 닿는 첫 질문 1개만 만들어. "
                "제목이나 카테고리만 반복하지 말고, 본문에 나온 상황·감정·제약을 반영해. "
                "질문은 짧고 자연스럽게. "
                "반드시 JSON 형식으로만 답해. "
                '형식: {"question":"질문내용"}'
            )
            user_first = (
                f"고민 내용(본문):\n{post.content}\n\n"
                f"참고 — 제목: {post.title}\n"
                f"카테고리: {post.category}\n"
                f"선택지: {post.options}\n\n"
                "위 고민 본문을 바탕으로 가장 먼저 물어볼 질문 1개만 만들어줘."
            )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": sys_first},
                {"role": "user", "content": user_first},
            ]
        )

        content = response.choices[0].message.content
        data = _parse_ai_json_response(content)
        question_text = data["question"]

        interaction = AIInteraction(
            post_id=post_id,
            step_number=1,
            question=question_text,
            answer=None
        )

        db.add(interaction)
        db.commit()

        return {
            "type": "question",
            "step": 1,
            "question": question_text
        }

    except Exception as e:
        print("=== start_ai error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/posts/{post_id}/next-ai", response_model=AIQuestionFlowResponse)
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
    mode = getattr(post, "ai_mode", None) or "simple"

    try:
        if current_step >= max_steps:
            if mode == "detailed":
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "너는 사용자의 선택을 돕는 AI 도우미야. "
                                "고민·선택지·질문/답변을 모두 반영해 최종 추천 1개를 한다. "
                                "recommended는 반드시 아래 선택지 문자열 중 하나와 정확히 일치해야 한다. "
                                "comparison에서는 나열된 모든 선택지를 빠짐없이 다루고, 각각에 대해 장점·단점·이 상황에서의 적합성을 구체적으로 비교한다. "
                                "마크다운 사용 가능. ## 선택지이름 형식으로 소제목을 단다. "
                                "반드시 JSON만 출력한다. "
                                '형식: {"recommended":"선택지 중 하나","reason":"2~4문장 요약","comparison":"선택지별 상세 비교 본문"}'
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"제목: {post.title}\n"
                                f"카테고리: {post.category}\n"
                                f"고민 내용:\n{post.content}\n\n"
                                f"선택지: {post.options}\n\n"
                                f"질문/답변 기록:\n{conversation_text}\n\n"
                                "최종 추천과 선택지별 비교를 작성해줘."
                            ),
                        },
                    ],
                )
                content = response.choices[0].message.content
                data = _parse_ai_json_response(content)
                rec = data.get("recommended", "").strip()
                reason_short = (data.get("reason") or "").strip()
                comp = (data.get("comparison") or "").strip()
                if comp:
                    full_reason = f"{reason_short}\n\n---\n\n{comp}".strip()
                else:
                    full_reason = reason_short
                post.ai_recommended = rec
                post.ai_reason = full_reason
                db.commit()
                db.refresh(post)
                return {
                    "type": "result",
                    "recommended": rec,
                    "reason": full_reason,
                }

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "너는 사용자의 선택을 돕는 AI 도우미야. "
                            "지금까지의 고민 내용, 선택지, 질문/답변을 바탕으로 최종 추천 1개와 이유를 제공해. "
                            "반드시 JSON 형식으로만 답해. "
                            '형식: {"recommended":"추천선택지","reason":"추천이유"}'
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"제목: {post.title}\n"
                            f"카테고리: {post.category}\n"
                            f"고민 내용: {post.content}\n"
                            f"선택지: {post.options}\n\n"
                            f"질문/답변 기록:\n{conversation_text}\n\n"
                            "최종 추천을 해줘."
                        ),
                    },
                ],
            )

            content = response.choices[0].message.content
            data = _parse_ai_json_response(content)

            post.ai_recommended = data["recommended"]
            post.ai_reason = data["reason"]
            db.commit()
            db.refresh(post)

            return {
                "type": "result",
                "recommended": data["recommended"],
                "reason": data["reason"],
            }

        next_step = current_step + 1

        if mode == "detailed":
            sys_next = (
                "너는 사용자의 선택을 돕는 AI 도우미야. "
                "고민 본문·선택지·이전 질문/답변을 바탕으로 다음 질문 1개만 만든다. "
                "가능하면 특정 선택지들을 짝지어 비교하거나, 우선순위를 좁히는 질문을 한다. "
                "이미 물어본 것과 중복 금지. "
                "반드시 JSON만. 형식: {\"question\":\"질문내용\"}"
            )
            user_next = (
                f"고민 내용(본문):\n{post.content}\n\n"
                f"선택지: {post.options}\n\n"
                f"이전 질문/답변:\n{conversation_text}\n\n"
                "다음 질문 1개."
            )
        else:
            sys_next = (
                "너는 사용자의 선택을 돕는 AI 도우미야. "
                "고민 본문과 이전 질문/답변을 바탕으로 다음으로 물어봐야 할 질문 1개만 만들어. "
                "본문에 나온 맥락을 유지하고, 이미 물어본 내용과 중복되지 않게 해. "
                "반드시 JSON 형식으로만 답해. "
                '형식: {"question":"질문내용"}'
            )
            user_next = (
                f"고민 내용(본문):\n{post.content}\n\n"
                f"선택지: {post.options}\n\n"
                f"이전 질문/답변 기록:\n{conversation_text}\n\n"
                "다음 질문 1개를 만들어줘."
            )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": sys_next},
                {"role": "user", "content": user_next},
            ],
        )

        content = response.choices[0].message.content
        data = _parse_ai_json_response(content)
        next_question = data["question"]

        interaction = AIInteraction(
            post_id=post_id,
            step_number=next_step,
            question=next_question,
            answer=None
        )

        db.add(interaction)
        db.commit()

        return {
            "type": "question",
            "step": next_step,
            "question": next_question
        }

    except Exception as e:
        print("=== next_ai error ===")
        print(repr(e))
        raise HTTPException(status_code=500, detail=str(e))


# --- 글/댓글 수정·삭제 ---


@app.patch("/posts/{post_id}", response_model=PostResponse)
def update_post(
    post_id: int,
    body: PostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id, current_user)
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="작성자만 수정할 수 있습니다.")
    if body.title is not None:
        post.title = body.title
    if body.content is not None:
        post.content = body.content
    if body.category is not None:
        post.category = body.category
    if body.options is not None:
        post.options = ",".join(body.options)
    if not any(
        x is not None for x in (body.title, body.content, body.category, body.options)
    ):
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다.")
    db.commit()
    db.refresh(post)
    nick_map = _nickname_map(db, {post.user_id} if post.user_id else set())
    return _post_to_response(post, nick_map)


@app.delete("/posts/{post_id}", response_model=MessageResponse)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    is_author = post.user_id is not None and post.user_id == current_user.id
    is_admin = getattr(current_user, "is_admin", False)
    if not is_author and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="작성자 또는 관리자만 삭제할 수 있습니다.",
        )
    if post.deleted_at is not None:
        raise HTTPException(status_code=400, detail="이미 삭제된 글입니다.")
    post.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="글이 삭제되었습니다.")


@app.patch(
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
    return CommentResponse(
        id=c.id,
        content=c.content,
        post_id=c.post_id,
        user_id=c.user_id,
        author_nickname=nick_map.get(c.user_id) if c.user_id else None,
        created_at=c.created_at,
    )


@app.delete(
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


# --- 비밀번호 ---


@app.patch("/auth/password", response_model=MessageResponse)
def change_password(
    body: PasswordChangeBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="현재 비밀번호가 올바르지 않습니다.",
        )
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    return MessageResponse(message="비밀번호가 변경되었습니다.")


def _expires_at_utc(expires_at: datetime) -> datetime:
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=timezone.utc)
    return expires_at.astimezone(timezone.utc)


@app.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(body: ForgotPasswordBody, db: Session = Depends(get_db)):
    email = str(body.email).lower().strip()
    user = db.query(User).filter(User.email == email).first()
    reset_token: str | None = None
    if user:
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id
        ).delete()
        raw = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=_hash_reset_token(raw),
                expires_at=expires,
            )
        )
        db.commit()
        if PASSWORD_RESET_DEBUG:
            reset_token = raw
    msg = "등록된 이메일이면 비밀번호 재설정 안내가 발송됩니다."
    if reset_token:
        msg += " (개발 모드: 응답의 토큰으로 /auth/reset-password 호출)"
    return ForgotPasswordResponse(message=msg, reset_token=reset_token)


@app.post("/auth/reset-password", response_model=MessageResponse)
def reset_password_ep(body: ResetPasswordBody, db: Session = Depends(get_db)):
    th = _hash_reset_token(body.token.strip())
    row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == th)
        .first()
    )
    now = datetime.now(timezone.utc)
    if not row or _expires_at_utc(row.expires_at) < now:
        raise HTTPException(
            status_code=400,
            detail="만료되었거나 유효하지 않은 토큰입니다.",
        )
    user = db.query(User).filter(User.id == row.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="유효하지 않은 토큰입니다.")
    user.hashed_password = hash_password(body.new_password)
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id
    ).delete()
    db.commit()
    return MessageResponse(message="비밀번호가 재설정되었습니다. 로그인해 주세요.")


# --- 신고 · 차단 ---


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


@app.post("/reports", response_model=ReportResponse)
def create_report(
    body: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_report_target(db, body.target_type, body.target_id)
    if body.target_type == "user" and body.target_id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 신고할 수 없습니다.")
    r = Report(
        reporter_id=current_user.id,
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason.strip(),
        status="pending",
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@app.get("/users/blocks", response_model=list[UserBlockResponse])
def list_blocks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(UserBlock)
        .filter(UserBlock.blocker_id == current_user.id)
        .order_by(UserBlock.id.desc())
        .all()
    )
    return rows


@app.post("/users/blocks", response_model=UserBlockResponse)
def create_block(
    body: UserBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.blocked_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 차단할 수 없습니다.")
    if not db.query(User).filter(User.id == body.blocked_user_id).first():
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    existing = (
        db.query(UserBlock)
        .filter(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == body.blocked_user_id,
        )
        .first()
    )
    if existing:
        return existing
    row = UserBlock(
        blocker_id=current_user.id,
        blocked_id=body.blocked_user_id,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(UserBlock)
            .filter(
                UserBlock.blocker_id == current_user.id,
                UserBlock.blocked_id == body.blocked_user_id,
            )
            .first()
        )
        if existing:
            return existing
        raise HTTPException(status_code=409, detail="차단 처리에 실패했습니다.")


@app.delete("/users/blocks/{blocked_user_id}", response_model=MessageResponse)
def delete_block(
    blocked_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(UserBlock)
        .filter(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == blocked_user_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="차단 정보를 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    return MessageResponse(message="차단이 해제되었습니다.")


# --- 관리자 ---


@app.get("/admin/reports", response_model=PaginatedReports)
def admin_list_reports(
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = db.query(Report)
    if status in ("pending", "resolved", "dismissed"):
        q = q.filter(Report.status == status)
    total = q.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    rows = (
        q.order_by(Report.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedReports(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@app.patch("/admin/reports/{report_id}", response_model=ReportResponse)
def admin_patch_report(
    report_id: int,
    body: ReportAdminPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    r = db.query(Report).filter(Report.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")
    r.status = body.status
    r.admin_note = body.admin_note
    if body.status in ("resolved", "dismissed"):
        r.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(r)
    return r


@app.get("/admin/users", response_model=PaginatedAdminUsers)
def admin_list_users(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    q = db.query(User)
    total = q.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    rows = (
        q.order_by(User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedAdminUsers(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@app.patch("/admin/users/{user_id}", response_model=AdminUserBrief)
def admin_patch_user(
    user_id: int,
    body: AdminUserPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="본인 계정은 여기서 변경할 수 없습니다.")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    u.is_banned = body.is_banned
    db.commit()
    db.refresh(u)
    return u


@app.patch("/admin/posts/{post_id}", response_model=PostResponse)
def admin_patch_post(
    post_id: int,
    body: AdminPostPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    post.is_hidden = body.is_hidden
    db.commit()
    db.refresh(post)
    ids = {post.user_id} if post.user_id else set()
    nick_map = _nickname_map(db, ids)
    return _post_to_response(post, nick_map)


@app.delete("/admin/posts/{post_id}", response_model=MessageResponse)
def admin_delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """관리자 글 삭제(소프트 삭제). 작성자 삭제와 동일하게 deleted_at 설정."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if post.deleted_at is not None:
        raise HTTPException(status_code=400, detail="이미 삭제된 글입니다.")
    post.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return MessageResponse(message="관리자에 의해 글이 삭제되었습니다.")