from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Post, Comment, Vote
from categories import ALLOWED_CATEGORIES
from schemas import (
    CategoryStat,
    PopularPostBrief,
    PopularPostByViewsBrief,
    RecentCommentBrief,
    StatsSummary,
)
from app_helpers import _nickname_map

router = APIRouter(tags=["stats"])

@router.get("/stats/categories", response_model=list[CategoryStat])
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


@router.get("/stats/popular-posts", response_model=list[PopularPostBrief])
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


@router.get("/stats/popular-posts-by-views", response_model=list[PopularPostByViewsBrief])
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
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .scalar()
        or 0
    )
    total_votes = (
        db.query(func.count(Vote.id))
        .join(Post, Vote.post_id == Post.id)
        .filter(Post.deleted_at.is_(None), Post.is_hidden == False)
        .scalar()
        or 0
    )
    ai_recommendations = (
        db.query(func.count(Post.id))
        .filter(
            Post.deleted_at.is_(None),
            Post.is_hidden == False,
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
