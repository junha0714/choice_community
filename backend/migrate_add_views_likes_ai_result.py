"""
posts: view_count, like_count, ai_recommended, ai_reason
post_likes 테이블 추가

실행: backend 폴더에서
  venv\\Scripts\\python migrate_add_views_likes_ai_result.py
"""
from sqlalchemy import text

from database import engine


def main() -> None:
    stmts = [
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_recommended TEXT",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_reason TEXT",
        """
        CREATE TABLE IF NOT EXISTS post_likes (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL REFERENCES posts(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_post_like_post_user
        ON post_likes (post_id, user_id)
        """,
    ]
    with engine.connect() as conn:
        for s in stmts:
            conn.execute(text(s))
        conn.commit()
    print("OK: 조회수·좋아요·AI 결과 컬럼 및 post_likes 테이블")


if __name__ == "__main__":
    main()
