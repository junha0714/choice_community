from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Post, Comment, Vote
from typing import Sequence
from categories import ALLOWED_CATEGORIES, BOARD_CATEGORIES, CHOICE_CATEGORIES, normalize_category
from schemas import (
    CategoryStat,
    PopularPostBrief,
    PopularPostByViewsBrief,
    RecentCommentBrief,
    ShellSidebarResponse,
    StatsSummary,
    TrendingPostBrief,
    TrendingPostsBundle,
)
from app_helpers import _nickname_map

router = APIRouter(tags=["stats"])


def _choice_posts_query(db: Session, days: int | None = None):
    """고민 글만 (공지·건의 제외). days>0 이면 최근 N일."""
    q = db.query(Post).filter(
        Post.deleted_at.is_(None),
        Post.is_hidden == False,
        func.coalesce(Post.is_published, True).is_(True),
        ~Post.category.in_(BOARD_CATEGORIES),
    )
    if days is not None and days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        q = q.filter(Post.created_at >= cutoff)
    return q


def _trending_briefs(db: Session, posts: Sequence[Post]) -> list[TrendingPostBrief]:
    if not posts:
        return []
    ids = [p.id for p in posts]
    vote_rows = (
        db.query(Vote.post_id, func.count(Vote.id))
        .filter(Vote.post_id.in_(ids))
        .group_by(Vote.post_id)
        .all()
    )
    vote_map = {int(pid): int(cnt) for pid, cnt in vote_rows}
    comment_rows = (
        db.query(Comment.post_id, func.count(Comment.id))
        .filter(Comment.post_id.in_(ids), Comment.deleted_at.is_(None))
        .group_by(Comment.post_id)
        .all()
    )
    comment_map = {int(pid): int(cnt) for pid, cnt in comment_rows}
    return [
        TrendingPostBrief(
            id=p.id,
            title=p.title,
            category=p.category,
            view_count=getattr(p, "view_count", None) or 0,
            like_count=getattr(p, "like_count", None) or 0,
            vote_count=vote_map.get(p.id, 0),
            comment_count=comment_map.get(p.id, 0),
        )
        for p in posts
    ]

@router.get("/stats/categories", response_model=list[CategoryStat])
def stats_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(Post.category, func.count(Post.id))
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
        )
        .group_by(Post.category)
        .all()
    )
    count_map: dict[str, int] = {}
    for cat, cnt in rows:
        norm = normalize_category(cat)
        count_map[norm] = count_map.get(norm, 0) + int(cnt)
    return [
        CategoryStat(category=cat, count=count_map.get(cat, 0))
        for cat in ALLOWED_CATEGORIES
    ]


@router.get("/stats/popular-posts", response_model=list[PopularPostBrief])
def stats_popular_posts(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    rows = (
        db.query(Post, func.count(Vote.id).label("vc"))
        .outerjoin(Vote, Post.id == Vote.post_id)
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
        )
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


@router.get("/stats/trending-posts", response_model=TrendingPostsBundle)
def stats_trending_posts(
    limit: int = 5,
    days: int | None = None,
    db: Session = Depends(get_db),
):
    """
    사이드바용 인기 고민 (투표·조회·좋아요).
    days 미지정/0: 전체 기간. 운영 시 days=7 등으로 점차 좁힐 수 있음.
    """
    limit = min(max(limit, 1), 20)
    period_days = days if days is not None and days > 0 else None

    vote_rows = (
        db.query(Post)
        .outerjoin(Vote, Post.id == Vote.post_id)
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
            ~Post.category.in_(BOARD_CATEGORIES),
        )
    )
    if period_days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)
        vote_rows = vote_rows.filter(Post.created_at >= cutoff)
    vote_rows = (
        vote_rows.group_by(Post.id)
        .order_by(func.count(Vote.id).desc(), Post.id.desc())
        .limit(limit)
        .all()
    )

    view_rows = (
        _choice_posts_query(db, period_days)
        .order_by(Post.view_count.desc(), Post.id.desc())
        .limit(limit)
        .all()
    )
    like_rows = (
        _choice_posts_query(db, period_days)
        .order_by(Post.like_count.desc(), Post.id.desc())
        .limit(limit)
        .all()
    )

    return TrendingPostsBundle(
        by_votes=_trending_briefs(db, vote_rows),
        by_views=_trending_briefs(db, view_rows),
        by_likes=_trending_briefs(db, like_rows),
    )


@router.get("/stats/shell", response_model=ShellSidebarResponse)
def stats_shell(db: Session = Depends(get_db)):
    """사이드바용 카테고리·통계·트렌딩 (한 번에)."""
    return ShellSidebarResponse(
        choice_categories=list(CHOICE_CATEGORIES),
        category_stats=stats_categories(db),
        trending=stats_trending_posts(limit=5, db=db),
    )


@router.get("/stats/popular-posts-by-views", response_model=list[PopularPostByViewsBrief])
def stats_popular_posts_by_views(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    rows = (
        db.query(Post)
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
        )
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


@router.get("/stats/recent-comments", response_model=list[RecentCommentBrief])
def stats_recent_comments(limit: int = 5, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 20)
    comments = (
        db.query(Comment)
        .join(Post, Comment.post_id == Post.id)
        .filter(
            Comment.deleted_at.is_(None),
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
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


@router.get("/stats/summary", response_model=StatsSummary)
def stats_summary(db: Session = Depends(get_db)):
    """홈 히어로 영역용 요약 통계."""
    total_posts = (
        db.query(func.count(Post.id))
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
        )
        .scalar()
        or 0
    )
    total_votes = (
        db.query(func.count(Vote.id))
        .join(Post, Vote.post_id == Post.id)
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
        )
        .scalar()
        or 0
    )
    ai_recommendations = (
        db.query(func.count(Post.id))
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
            func.coalesce(Post.is_published, True).is_(True),
            Post.post_kind == "ai",
            Post.ai_recommended.isnot(None),
        )
        .scalar()
        or 0
    )
    return StatsSummary(
        total_posts=int(total_posts),
        total_votes=int(total_votes),
        ai_recommendations=int(ai_recommendations),
    )
