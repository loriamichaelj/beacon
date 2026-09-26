import asyncio
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
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
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
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

    assert {"services", "incidents", "incident_events"} <= table_names


async def _execute(dsn: str, *statements: str) -> list[tuple[object, ...]]:
    engine = create_async_engine(dsn)
    try:
        async with engine.begin() as conn:
            result = None
            for statement in statements:
                result = await conn.execute(text(statement))
            return (
                [tuple(row) for row in result] if result is not None and result.returns_rows else []
            )
    finally:
        await engine.dispose()


def test_incident_events_migration_backfills_history(migration_target: str) -> None:
    cfg = _alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "f945c88052c9")

    asyncio.run(
        _execute(
            migration_target,
            "INSERT INTO services (id, name, tier, owner_team) "
            "VALUES ('00000000-0000-0000-0000-000000000001', 'api', 1, 'team')",
            # open; mitigated; resolved via mitigated; resolved directly from open
            "INSERT INTO incidents "
            "(title, service_id, severity, status, opened_at, mitigated_at, resolved_at) VALUES "
            "('a', '00000000-0000-0000-0000-000000000001', 'SEV1', 'open', "
            " '2026-01-01T00:00Z', NULL, NULL),"
            "('b', '00000000-0000-0000-0000-000000000001', 'SEV2', 'mitigated', "
            " '2026-01-01T00:00Z', '2026-01-01T01:00Z', NULL),"
            "('c', '00000000-0000-0000-0000-000000000001', 'SEV3', 'resolved', "
            " '2026-01-01T00:00Z', '2026-01-01T01:00Z', '2026-01-01T02:00Z'),"
            "('d', '00000000-0000-0000-0000-000000000001', 'SEV4', 'resolved', "
            " '2026-01-01T00:00Z', '2026-01-01T03:00Z', '2026-01-01T03:00Z')",
        )
    )
    command.upgrade(cfg, "head")

    rows = asyncio.run(
        _execute(
            migration_target,
            "SELECT i.title, e.kind, e.from_value, e.to_value FROM incident_events e "
            "JOIN incidents i ON i.id = e.incident_id ORDER BY i.title, e.created_at, e.id",
        )
    )
    assert rows == [
        ("a", "opened", None, "SEV1"),
        ("b", "opened", None, "SEV2"),
        ("b", "status_changed", "open", "mitigated"),
        ("c", "opened", None, "SEV3"),
        ("c", "status_changed", "open", "mitigated"),
        ("c", "status_changed", "mitigated", "resolved"),
        ("d", "opened", None, "SEV4"),
        ("d", "status_changed", "open", "resolved"),
    ]
    asyncio.run(_execute(migration_target, "TRUNCATE incidents, services CASCADE"))
