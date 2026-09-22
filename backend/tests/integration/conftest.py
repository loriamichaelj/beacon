from collections.abc import AsyncIterator, Iterator

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from testcontainers.community.postgres import PostgresContainer

import app.main as main_module
from app.config import get_settings
from tests.integration._alembic import alembic_config


@pytest.fixture(scope="session")
def postgres_dsn() -> Iterator[str]:
    with PostgresContainer("postgres:16", driver="asyncpg") as postgres:
        yield postgres.get_connection_url()


@pytest.fixture(scope="session")
def migrated_dsn(postgres_dsn: str, monkeypatch_session: pytest.MonkeyPatch) -> str:
    monkeypatch_session.setenv("DATABASE_URL", postgres_dsn)
    get_settings.cache_clear()
    command.upgrade(alembic_config(), "head")
    return postgres_dsn


@pytest.fixture(scope="session")
def monkeypatch_session() -> Iterator[pytest.MonkeyPatch]:
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


async def _truncate_all(dsn: str) -> None:
    engine = create_async_engine(dsn)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("TRUNCATE incidents, services RESTART IDENTITY CASCADE"))
    finally:
        await engine.dispose()


@pytest.fixture
def client(migrated_dsn: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DATABASE_URL", migrated_dsn)
    get_settings.cache_clear()
    app = main_module.create_app()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _clean_tables(migrated_dsn: str) -> Iterator[None]:
    yield
    import asyncio

    asyncio.run(_truncate_all(migrated_dsn))
