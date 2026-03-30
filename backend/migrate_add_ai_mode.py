"""
posts.ai_mode 컬럼 추가 (simple | detailed, AI 글만 사용)

실행: backend 폴더에서
  venv\\Scripts\\python migrate_add_ai_mode.py
"""
from sqlalchemy import text

from database import engine


def main() -> None:
    stmt = """
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_mode VARCHAR(20)
    """
    with engine.connect() as conn:
        conn.execute(text(stmt))
        conn.commit()
    print("OK: ai_mode 컬럼 추가")


if __name__ == "__main__":
    main()
