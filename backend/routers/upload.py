from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import User
from settings import UPLOAD_DIR, UPLOAD_ALLOWED_EXT, UPLOAD_MAX_BYTES

router = APIRouter(tags=["upload"])

@router.post("/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """본문에 삽입할 이미지 업로드. 반환 URL을 마크다운/텍스트에 넣으면 됩니다."""
    name = (file.filename or "").lower()
    ext = os.path.splitext(name)[1]
    if ext not in UPLOAD_ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail="jpg, png, gif, webp만 업로드할 수 있어요.",
        )
    raw = await file.read()
    if len(raw) > UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail="파일 크기는 5MB 이하여야 합니다.",
        )
    fn = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, fn)
    with open(path, "wb") as f:
        f.write(raw)
    return {"url": f"/uploads/{fn}"}
