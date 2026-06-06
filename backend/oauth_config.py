"""Google / Kakao OAuth 환경 변수."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv()


def _ensure_env_loaded() -> None:
    """uvicorn --reload 는 .env 변경을 안 읽으므로 OAuth 설정 조회 시 재로드."""
    load_dotenv(_BACKEND_DIR / ".env")
    load_dotenv()


def _env(name: str) -> str:
    _ensure_env_loaded()
    value = os.getenv(name, "").strip()
    # KEY=  # 주석 형태는 dotenv가 "# ..." 를 값으로 읽는 경우가 있음
    if value.startswith("#"):
        return ""
    return value


@dataclass(frozen=True)
class OAuthProviderConfig:
    enabled: bool
    client_id: str
    client_secret: str
    redirect_uri: str


def google_config() -> OAuthProviderConfig:
    client_id = _env("GOOGLE_CLIENT_ID")
    client_secret = _env("GOOGLE_CLIENT_SECRET")
    redirect_uri = _env("GOOGLE_REDIRECT_URI")
    return OAuthProviderConfig(
        enabled=bool(client_id and client_secret and redirect_uri),
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
    )


def kakao_config() -> OAuthProviderConfig:
    client_id = _env("KAKAO_REST_API_KEY")
    client_secret = _env("KAKAO_CLIENT_SECRET")
    redirect_uri = _env("KAKAO_REDIRECT_URI")
    return OAuthProviderConfig(
        enabled=bool(client_id and redirect_uri),
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
    )


def oauth_frontend_success_url() -> str:
    return _env("OAUTH_FRONTEND_SUCCESS_URL") or "http://localhost:3000/auth/callback"


def oauth_providers_status() -> dict[str, bool]:
    return {
        "google": google_config().enabled,
        "kakao": kakao_config().enabled,
    }
