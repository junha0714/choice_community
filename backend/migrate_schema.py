"""기존 DB에 새 컬럼이 없을 때 ALTER로 보강 (create_all은 기존 테이블을 변경하지 않음)."""
from sqlalchemy import inspect, text

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


def run_schema_migrations() -> None:
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
