from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import User, Post, Comment, Report, UserBlock
from schemas import (
    ReportCreate,
    ReportResponse,
    UserBlockCreate,
    UserBlockResponse,
    MessageResponse,
)
from app_helpers import _validate_report_target

router = APIRouter(tags=["social"])

@router.post("/reports", response_model=ReportResponse)
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


@router.get("/users/blocks", response_model=list[UserBlockResponse])
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


@router.post("/users/blocks", response_model=UserBlockResponse)
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


@router.delete("/users/blocks/{blocked_user_id}", response_model=MessageResponse)
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
