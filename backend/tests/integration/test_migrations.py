import asyncio
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


@pytest.fixture
def migration_target(monkeypatch: pytest.MonkeyPatch, postgres_dsn: str) -> str:
    # alembic/env.py resolves DATABASE_URL through app settings, and drives
    # its own asyncio.run() internally, so this test must stay synchronous
    # (no event loop already running) for command.upgrade/downgrade to work.
    monkeypatch.setenv("DATABASE_URL", postgres_dsn)
    get_settings.cache_clear()
    return postgres_dsn


async def _table_names(dsn: str) -> set[str]:
    engine = create_async_engine(dsn)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public'"
                )
            )
            return {row[0] for row in result}
    finally:
        await engine.dispose()


def test_migration_round_trip_on_empty_database(migration_target: str) -> None:
    cfg = _alembic_config()

    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")

    table_names = asyncio.run(_table_names(migration_target))

    assert {"services", "incidents"} <= table_names
