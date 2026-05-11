from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import User, Notification
from schemas import (
    PaginatedNotifications,
    NotificationUnreadCount,
    NotificationResponse,
    MessageResponse,
)

router = APIRouter(tags=["notifications"])

@router.get("/notifications", response_model=PaginatedNotifications)
def list_notifications(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    total = q.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    rows = (
        q.order_by(Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedNotifications(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/notifications/unread-count", response_model=NotificationUnreadCount)
def notifications_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.user_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .scalar()
    )
    return NotificationUnreadCount(count=int(n or 0))


@router.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(n)
    return n


@router.post("/notifications/read-all", response_model=MessageResponse)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    rows = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .all()
    )
    for n in rows:
        n.read_at = now
    db.commit()
    return MessageResponse(message="모두 읽음으로 표시했습니다.")
