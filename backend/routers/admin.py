from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_admin
from models import User, Report, Post
from schemas import (
    PaginatedReports,
    ReportAdminPatch,
    ReportResponse,
    PaginatedAdminUsers,
    AdminUserBrief,
    AdminUserPatch,
    AdminPostPatch,
    PostResponse,
    MessageResponse,
)
from app_helpers import _notify, _nickname_map, _post_to_response

router = APIRouter(tags=["admin"])

@router.get("/admin/reports", response_model=PaginatedReports)
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


@router.patch("/admin/reports/{report_id}", response_model=ReportResponse)
def admin_patch_report(
    report_id: int,
    body: ReportAdminPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    r = db.query(Report).filter(Report.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")
    prev = r.status
    r.status = body.status
    r.admin_note = body.admin_note
    if body.status in ("resolved", "dismissed"):
        r.resolved_at = datetime.now(timezone.utc)
    if body.status in ("resolved", "dismissed") and prev != body.status:
        label = "처리 완료" if body.status == "resolved" else "기각"
        note = (body.admin_note or "").strip()
        msg = f"신고가 {label}되었습니다."
        if note:
            msg += f" {note}"
        _notify(
            db,
            user_id=r.reporter_id,
            kind=f"report_{body.status}",
            title="신고 처리 결과",
            body=msg,
            report_id=r.id,
        )
    db.commit()
    db.refresh(r)
    return r


@router.get("/admin/users", response_model=PaginatedAdminUsers)
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


@router.patch("/admin/users/{user_id}", response_model=AdminUserBrief)
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


@router.patch("/admin/posts/{post_id}", response_model=PostResponse)
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


@router.delete("/admin/posts/{post_id}", response_model=MessageResponse)
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