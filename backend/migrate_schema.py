"""기존 DB에 새 컬럼이 없을 때 ALTER로 보강 (create_all은 기존 테이블을 변경하지 않음)."""
from sqlalchemy import inspect, text

from categories import LEGACY_CATEGORY_MAP
from database import engine


def _add_column_if_missing(
    table_name: str,
    column_name: str,
    sql_postgres: str,
    sql_sqlite: str,
) -> None:
    insp = inspect(engine)
    if table_name not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns(table_name)}
    if column_name in cols:
        return
    dialect = engine.dialect.name
    sql = sql_sqlite if dialect == "sqlite" else sql_postgres
    with engine.begin() as conn:
        conn.execute(text(sql))


def _migrate_post_categories() -> None:
    """구 카테고리명을 신규 11종 분류로 일괄 변경."""
    insp = inspect(engine)
    if "posts" not in insp.get_table_names():
        return
    with engine.begin() as conn:
        for old, new in LEGACY_CATEGORY_MAP.items():
            conn.execute(
                text("UPDATE posts SET category = :new WHERE category = :old"),
                {"old": old, "new": new},
            )


def run_schema_migrations() -> None:
    _migrate_post_categories()
    _add_column_if_missing(
        "users",
        "is_admin",
        "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    )
    _add_column_if_missing(
        "users",
        "is_banned",
        "ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0",
    )
    _add_column_if_missing(
        "posts",
        "deleted_at",
        "ALTER TABLE posts ADD COLUMN deleted_at TIMESTAMPTZ",
        "ALTER TABLE posts ADD COLUMN deleted_at DATETIME",
    )
    _add_column_if_missing(
        "posts",
        "is_hidden",
        "ALTER TABLE posts ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE posts ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0",
    )
    _add_column_if_missing(
        "comments",
        "deleted_at",
        "ALTER TABLE comments ADD COLUMN deleted_at TIMESTAMPTZ",
        "ALTER TABLE comments ADD COLUMN deleted_at DATETIME",
    )
    _add_column_if_missing(
        "posts",
        "tags",
        "ALTER TABLE posts ADD COLUMN tags TEXT",
        "ALTER TABLE posts ADD COLUMN tags TEXT",
    )
    _add_column_if_missing(
        "comments",
        "parent_id",
        "ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id)",
        "ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id)",
    )
    _add_column_if_missing(
        "comments",
        "is_anonymous",
        "ALTER TABLE comments ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE comments ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0",
    )
    _add_column_if_missing(
        "posts",
        "vote_deadline_at",
        "ALTER TABLE posts ADD COLUMN vote_deadline_at TIMESTAMPTZ",
        "ALTER TABLE posts ADD COLUMN vote_deadline_at DATETIME",
    )
    _add_column_if_missing(
        "posts",
        "ai_transcript_public",
        "ALTER TABLE posts ADD COLUMN ai_transcript_public BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE posts ADD COLUMN ai_transcript_public INTEGER NOT NULL DEFAULT 0",
    )
    _add_column_if_missing(
        "posts",
        "ai_question_steps",
        "ALTER TABLE posts ADD COLUMN ai_question_steps INTEGER",
        "ALTER TABLE posts ADD COLUMN ai_question_steps INTEGER",
    )
    _add_column_if_missing(
        "ai_sessions",
        "ai_question_steps",
        "ALTER TABLE ai_sessions ADD COLUMN ai_question_steps INTEGER",
        "ALTER TABLE ai_sessions ADD COLUMN ai_question_steps INTEGER",
    )
    _add_column_if_missing(
        "posts",
        "is_published",
        "ALTER TABLE posts ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE posts ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1",
    )
    _add_column_if_missing(
        "ai_sessions",
        "draft_post_id",
        "ALTER TABLE ai_sessions ADD COLUMN draft_post_id INTEGER REFERENCES posts(id)",
        "ALTER TABLE ai_sessions ADD COLUMN draft_post_id INTEGER REFERENCES posts(id)",
    )
    for col, sql_pg, sql_sq in [
        (
            "default_ai_mode",
            "ALTER TABLE users ADD COLUMN default_ai_mode VARCHAR(20) NOT NULL DEFAULT 'quick'",
            "ALTER TABLE users ADD COLUMN default_ai_mode VARCHAR(20) NOT NULL DEFAULT 'quick'",
        ),
        (
            "default_ai_transcript_public",
            "ALTER TABLE users ADD COLUMN default_ai_transcript_public BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN default_ai_transcript_public INTEGER NOT NULL DEFAULT 0",
        ),
        (
            "notify_comment",
            "ALTER TABLE users ADD COLUMN notify_comment BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN notify_comment INTEGER NOT NULL DEFAULT 1",
        ),
        (
            "notify_reply",
            "ALTER TABLE users ADD COLUMN notify_reply BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN notify_reply INTEGER NOT NULL DEFAULT 1",
        ),
        (
            "notify_like",
            "ALTER TABLE users ADD COLUMN notify_like BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN notify_like INTEGER NOT NULL DEFAULT 1",
        ),
        (
            "notify_vote_end",
            "ALTER TABLE users ADD COLUMN notify_vote_end BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN notify_vote_end INTEGER NOT NULL DEFAULT 1",
        ),
    ]:
        _add_column_if_missing("users", col, sql_pg, sql_sq)
    _add_column_if_missing(
        "users",
        "auth_provider",
        "ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'email'",
        "ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'email'",
    )
    _add_column_if_missing(
        "users",
        "provider_subject",
        "ALTER TABLE users ADD COLUMN provider_subject VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN provider_subject VARCHAR(255)",
    )
    _make_users_password_nullable()


def _make_users_password_nullable() -> None:
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"]: c for c in insp.get_columns("users")}
    if "hashed_password" not in cols:
        return
    if cols["hashed_password"].get("nullable"):
        return
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL"))
