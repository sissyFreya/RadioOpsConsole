from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_alembic_upgrade_head_on_empty_database():
    backend_root = Path(__file__).resolve().parents[1]
    cfg = Config(str(backend_root / "alembic.ini"))

    engine = create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as connection:
            cfg.attributes["connection"] = connection
            command.upgrade(cfg, "head")

            tables = set(inspect(connection).get_table_names())
            assert {
                "users",
                "nodes",
                "radios",
                "actions",
                "audit_events",
                "podcast_shows",
                "podcast_episodes",
                "live_sessions",
            }.issubset(tables)
    finally:
        engine.dispose()
