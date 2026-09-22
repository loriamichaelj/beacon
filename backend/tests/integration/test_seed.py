import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db import create_engine, create_session_factory
from app.models.incident import Incident
from app.models.service import Service
from scripts.seed import seed


async def _counts(session_factory: async_sessionmaker[AsyncSession]) -> tuple[int, int]:
    async with session_factory() as session:
        services = (await session.execute(select(func.count(Service.id)))).scalar_one()
        incidents = (await session.execute(select(func.count(Incident.id)))).scalar_one()
    return services, incidents


def test_seed_is_idempotent(monkeypatch: pytest.MonkeyPatch, migrated_dsn: str) -> None:
    monkeypatch.setenv("DATABASE_URL", migrated_dsn)
    get_settings.cache_clear()

    asyncio.run(seed())
    asyncio.run(seed())

    engine = create_engine(get_settings())
    session_factory = create_session_factory(engine)
    try:
        services_count, incidents_count = asyncio.run(_counts(session_factory))
    finally:
        asyncio.run(engine.dispose())

    assert services_count == 8
    assert incidents_count == 20
