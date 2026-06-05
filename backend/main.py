import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# database import보다 먼저 .env 적용
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

from database import engine
from migrate_schema import run_schema_migrations
from models import Base

from routers import admin as admin_router
from routers import ai as ai_router
from routers import auth as auth_router
from routers import oauth as oauth_router
from routers import meta as meta_router
from routers import notifications as notifications_router
from routers import posts as posts_router
from routers import social as social_router
from routers import stats as stats_router
from routers import upload as upload_router
from settings import UPLOAD_DIR

os.makedirs(UPLOAD_DIR, exist_ok=True)

Base.metadata.create_all(bind=engine)
run_schema_migrations()

app = FastAPI(title="PickTalk API", description="PickTalk backend")

# 브라우저 → 다른 포트/호스트의 API는 CORS 통과가 필요합니다.
# - 로컬: localhost / 127.0.0.1 / [::1] + 임의 포트(Next dev 포트 변경 대비)
# - 배포 프리뷰·별도 도메인: CORS_EXTRA_ORIGINS=https://a.vercel.app,https://b.com
_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://choice-community.vercel.app",
]
_extra = os.getenv("CORS_EXTRA_ORIGINS", "").strip()
if _extra:
    for part in _extra.split(","):
        o = part.strip()
        if o and o not in _cors_origins:
            _cors_origins.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Next가 3001 등으로 뜨거나, IPv6(::1)로 접속할 때도 허용
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(auth_router.router)
app.include_router(oauth_router.router)
app.include_router(meta_router.router)
app.include_router(stats_router.router)
app.include_router(posts_router.router)
app.include_router(ai_router.router)
app.include_router(upload_router.router)
app.include_router(notifications_router.router)
app.include_router(social_router.router)
app.include_router(admin_router.router)
