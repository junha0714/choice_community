"""OAuth code exchange · 사용자 upsert."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from auth import SECRET_KEY, ALGORITHM, create_access_token
from models import User
from oauth_config import OAuthProviderConfig, google_config, kakao_config

OAUTH_STATE_EXPIRE_MINUTES = 10


def create_oauth_state(provider: str) -> str:
    if not SECRET_KEY:
        raise HTTPException(status_code=503, detail="JWT_SECRET이 설정되지 않았습니다.")
    expire = datetime.now(timezone.utc) + timedelta(minutes=OAUTH_STATE_EXPIRE_MINUTES)
    payload = {
        "typ": "oauth_state",
        "provider": provider,
        "nonce": secrets.token_urlsafe(16),
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_oauth_state(state: str, provider: str) -> None:
    if not SECRET_KEY:
        raise HTTPException(status_code=503, detail="JWT_SECRET이 설정되지 않았습니다.")
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="유효하지 않은 OAuth state입니다.")
    if payload.get("typ") != "oauth_state" or payload.get("provider") != provider:
        raise HTTPException(status_code=400, detail="유효하지 않은 OAuth state입니다.")


def _provider_config(provider: str) -> OAuthProviderConfig:
    if provider == "google":
        cfg = google_config()
    elif provider == "kakao":
        cfg = kakao_config()
    else:
        raise HTTPException(status_code=404, detail="지원하지 않는 로그인 방식입니다.")
    if not cfg.enabled:
        raise HTTPException(
            status_code=503,
            detail=f"{provider} 로그인이 아직 설정되지 않았습니다.",
        )
    return cfg


def build_authorize_url(provider: str) -> str:
    cfg = _provider_config(provider)
    state = create_oauth_state(provider)
    if provider == "google":
        params = {
            "client_id": cfg.client_id,
            "redirect_uri": cfg.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    params = {
        "client_id": cfg.client_id,
        "redirect_uri": cfg.redirect_uri,
        "response_type": "code",
        "state": state,
    }
    return f"https://kauth.kakao.com/oauth/authorize?{urlencode(params)}"


async def _exchange_google_code(cfg: OAuthProviderConfig, code: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": cfg.client_id,
                "client_secret": cfg.client_secret,
                "redirect_uri": cfg.redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Google 토큰 교환에 실패했습니다.")
        access_token = token_res.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Google access token이 없습니다.")
        profile_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if profile_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Google 프로필 조회에 실패했습니다.")
        return profile_res.json()


async def _exchange_kakao_code(cfg: OAuthProviderConfig, code: str) -> dict:
    data = {
        "grant_type": "authorization_code",
        "client_id": cfg.client_id,
        "redirect_uri": cfg.redirect_uri,
        "code": code,
    }
    if cfg.client_secret:
        data["client_secret"] = cfg.client_secret
    async with httpx.AsyncClient(timeout=20.0) as client:
        token_res = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="카카오 토큰 교환에 실패했습니다.")
        access_token = token_res.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="카카오 access token이 없습니다.")
        profile_res = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if profile_res.status_code != 200:
            raise HTTPException(status_code=400, detail="카카오 프로필 조회에 실패했습니다.")
        return profile_res.json()


def _profile_from_google(data: dict) -> tuple[str, str | None, str | None]:
    subject = str(data.get("sub") or "").strip()
    if not subject:
        raise HTTPException(status_code=400, detail="Google 사용자 ID를 확인할 수 없습니다.")
    email = (data.get("email") or "").strip().lower() or None
    nickname = (data.get("name") or "").strip() or None
    return subject, email, nickname


def _profile_from_kakao(data: dict) -> tuple[str, str | None, str | None]:
    subject = str(data.get("id") or "").strip()
    if not subject:
        raise HTTPException(status_code=400, detail="카카오 사용자 ID를 확인할 수 없습니다.")
    account = data.get("kakao_account") if isinstance(data.get("kakao_account"), dict) else {}
    profile = account.get("profile") if isinstance(account.get("profile"), dict) else {}
    email = (account.get("email") or "").strip().lower() or None
    nickname = (profile.get("nickname") or "").strip() or None
    return subject, email, nickname


def _unique_oauth_email(db: Session, provider: str, subject: str) -> str:
    base = f"{provider}_{subject}@oauth.local"
    if not db.query(User).filter(User.email == base).first():
        return base
    for i in range(1, 100):
        candidate = f"{provider}_{subject}_{i}@oauth.local"
        if not db.query(User).filter(User.email == candidate).first():
            return candidate
    raise HTTPException(status_code=500, detail="계정 이메일을 생성할 수 없습니다.")


def upsert_oauth_user(
    db: Session,
    *,
    provider: str,
    subject: str,
    email: str | None,
    nickname: str | None,
) -> User:
    user = (
        db.query(User)
        .filter(User.auth_provider == provider, User.provider_subject == subject)
        .first()
    )
    if user:
        if getattr(user, "is_banned", False):
            raise HTTPException(status_code=403, detail="이용이 제한된 계정입니다.")
        if nickname and not user.nickname:
            user.nickname = nickname
            db.commit()
            db.refresh(user)
        return user

    if email:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="이미 이 이메일로 가입된 계정이 있어요. 이메일 로그인을 이용해 주세요.",
            )
        email_norm = email
    else:
        email_norm = _unique_oauth_email(db, provider, subject)

    user = User(
        email=email_norm,
        hashed_password=None,
        nickname=nickname,
        auth_provider=provider,
        provider_subject=subject,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


async def complete_oauth_login(db: Session, *, provider: str, code: str) -> str:
    cfg = _provider_config(provider)
    if provider == "google":
        profile = await _exchange_google_code(cfg, code)
        subject, email, nickname = _profile_from_google(profile)
    else:
        profile = await _exchange_kakao_code(cfg, code)
        subject, email, nickname = _profile_from_kakao(profile)

    user = upsert_oauth_user(
        db,
        provider=provider,
        subject=subject,
        email=email,
        nickname=nickname,
    )
    try:
        return create_access_token(user_id=user.id, email=user.email)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
