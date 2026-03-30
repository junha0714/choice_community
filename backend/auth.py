"""JWT · 비밀번호 해시 (회원가입/로그인용)

passlib+bcrypt 최신 조합에서 초기화 시 72바이트 오류가 나는 경우가 있어,
bcrypt 공식 패키지로 직접 해시합니다.
"""
from datetime import datetime, timedelta, timezone

import os
import bcrypt
from jose import JWTError, jwt
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET", "").strip()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7일

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
