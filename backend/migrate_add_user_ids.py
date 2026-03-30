"""
기존 PostgreSQL DB에 user_id 컬럼을 추가합니다.
(처음부터 테이블을 새로 만들었다면 생략 가능)

실행: backend 폴더에서
  venv\\Scripts\\python migrate_add_user_ids.py
"""
from sqlalchemy import text

from database import engine


def main() -> None:
    stmts = [
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
    ]
    with engine.connect() as conn:
        for s in stmts:
            conn.execute(text(s))
        conn.commit()
    print("OK: user_id 컬럼 추가 완료 (이미 있으면 스킵)")

    # 글당 1투표: 부분 유니크 인덱스 (user_id가 있는 행만)
    idx = """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_vote_post_user
    ON votes (post_id, user_id)
    WHERE user_id IS NOT NULL
    """
    with engine.connect() as conn:
        conn.execute(text(idx))
        conn.commit()
    print("OK: 투표 유니크 인덱스 (선택)")


if __name__ == "__main__":
    main()
