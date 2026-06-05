"""JWT · 비밀번호 해시 (회원가입/로그인용)

passlib+bcrypt 최신 조합에서 초기화 시 72바이트 오류가 나는 경우가 있어,
bcrypt 공식 패키지로 직접 해시합니다.
"""
from datetime import datetime, timedelta, timezone

import os
from pathlib import Path

import bcrypt
from jose import JWTError, jwt
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET", "").strip()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7일 (같은 브라우저 세션 안에서만 유지)
# 같은 세션에서 토큰 만료 직후 /auth/refresh 허용 (브라우저 닫으면 sessionStorage 삭제됨)
REFRESH_GRACE_DAYS = 1

# bcrypt는 원문이 72바이트를 넘기면 안 됨 (UTF-8 기준)
_MAX_PW_BYTES = 72


def _password_bytes(plain: str) -> bytes:
    b = plain.encode("utf-8")
    if len(b) > _MAX_PW_BYTES:
        return b[:_MAX_PW_BYTES]
    return b


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(_password_bytes(plain), salt)
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            _password_bytes(plain),
            hashed.encode("utf-8"),
        )
    except ValueError:
        return False


def create_access_token(*, user_id: int, email: str) -> str:
    if not SECRET_KEY:
        raise ValueError("JWT_SECRET이 설정되지 않았습니다. backend/.env에 JWT_SECRET을 추가하세요.")
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    if not SECRET_KEY:
        raise JWTError("JWT_SECRET 미설정")
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def decode_token_for_refresh(token: str) -> dict:
    """서명은 검증하되 만료는 REFRESH_GRACE_DAYS 이내면 허용."""
    if not SECRET_KEY:
        raise JWTError("JWT_SECRET 미설정")
    payload = jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM],
        options={"verify_exp": False},
    )
    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)
        grace_start = datetime.now(timezone.utc) - timedelta(days=REFRESH_GRACE_DAYS)
        if exp_dt < grace_start:
            raise JWTError("refresh grace exceeded")
    return payload
