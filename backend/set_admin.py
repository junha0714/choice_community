"""관리자 플래그 설정. backend 폴더에서 실행:

    python set_admin.py you@example.com

PostgreSQL 등에서 직접 하려면:

    UPDATE users SET is_admin = true WHERE email = 'you@example.com';
"""
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from database import SessionLocal  # noqa: E402
from models import User  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print("사용법: python set_admin.py 이메일주소")
        sys.exit(1)
    email = sys.argv[1].lower().strip()
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            print("해당 이메일 사용자가 없습니다.")
            sys.exit(1)
        u.is_admin = True
        db.commit()
        print(f"완료: {email} 계정에 관리자 권한을 부여했습니다.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
