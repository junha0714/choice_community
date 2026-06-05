from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from oauth_config import oauth_frontend_success_url, oauth_providers_status
from oauth_service import (
    build_authorize_url,
    complete_oauth_login,
    verify_oauth_state,
)
from schemas import OAuthProvidersResponse

router = APIRouter(tags=["auth"])


@router.get("/auth/oauth/providers", response_model=OAuthProvidersResponse)
def get_oauth_providers():
    status = oauth_providers_status()
    return OAuthProvidersResponse(google=status["google"], kakao=status["kakao"])


@router.get("/auth/oauth/{provider}/start")
def oauth_start(provider: str):
    if provider not in ("google", "kakao"):
        raise HTTPException(status_code=404, detail="지원하지 않는 로그인 방식입니다.")
    url = build_authorize_url(provider)
    return RedirectResponse(url=url, status_code=302)


@router.get("/auth/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    frontend = oauth_frontend_success_url().rstrip("/")
    if error:
        params = urlencode({"error": error})
        return RedirectResponse(url=f"{frontend}?{params}", status_code=302)
    if not code or not state:
        params = urlencode({"error": "missing_code"})
        return RedirectResponse(url=f"{frontend}?{params}", status_code=302)
    if provider not in ("google", "kakao"):
        params = urlencode({"error": "invalid_provider"})
        return RedirectResponse(url=f"{frontend}?{params}", status_code=302)

    try:
        verify_oauth_state(state, provider)
        token = await complete_oauth_login(db, provider=provider, code=code)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "oauth_failed"
        params = urlencode({"error": detail})
        return RedirectResponse(url=f"{frontend}?{params}", status_code=302)

    return RedirectResponse(url=f"{frontend}#access_token={token}", status_code=302)
