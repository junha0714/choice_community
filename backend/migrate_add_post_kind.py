"""
기존 PostgreSQL DB에 posts.post_kind 컬럼을 추가합니다.

실행: backend 폴더에서
  venv\\Scripts\\python migrate_add_post_kind.py
"""
from sqlalchemy import text

from database import engine


def main() -> None:
    stmt = """
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_kind VARCHAR(20) NOT NULL DEFAULT 'community'
    """
    with engine.connect() as conn:
        conn.execute(text(stmt))
        conn.commit()
    print("OK: post_kind 컬럼 추가 완료 (이미 있으면 스킵)")


if __name__ == "__main__":
    main()
