"""Paths and upload-related constants (shared by main + routers)."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = str(BACKEND_DIR)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

_UPLOAD_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
UPLOAD_ALLOWED_EXT = _UPLOAD_ALLOWED_EXT
UPLOAD_MAX_BYTES = 5 * 1024 * 1024

PASSWORD_RESET_DEBUG = os.getenv("PASSWORD_RESET_DEBUG", "").strip().lower() in (
    "1",
    "true",
    "yes",
)
