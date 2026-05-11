from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import hash_password, verify_password, create_access_token
from database import get_db
from deps import get_current_user
from models import User, PasswordResetToken
from schemas import (
    UserRegister,
    UserLogin,
    TokenResponse,
    UserPublic,
    UserProfileUpdate,
    PasswordChangeBody,
    ForgotPasswordBody,
    ResetPasswordBody,
    ForgotPasswordResponse,
    MessageResponse,
)
from app_helpers import _hash_reset_token, _expires_at_utc
from settings import PASSWORD_RESET_DEBUG

router = APIRouter(tags=["auth"])

@router.post("/auth/register", response_model=UserPublic)
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


@router.post("/auth/login", response_model=TokenResponse)
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


@router.get("/auth/me", response_model=UserPublic)
def auth_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/auth/me", response_model=UserPublic)
def update_me(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.nickname = (body.nickname or "").strip() or None
    db.commit()
    db.refresh(current_user)
    return current_user

@router.patch("/auth/password", response_model=MessageResponse)
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


@router.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
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


@router.post("/auth/reset-password", response_model=MessageResponse)
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
