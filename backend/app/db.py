import asyncio
import ssl
from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings


def _build_ssl_context(settings: Settings) -> ssl.SSLContext | bool:
    if settings.db_ssl == "disable":
        return False
    if settings.db_ssl == "require":
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return context
    context = ssl.create_default_context(cafile=settings.db_ssl_root_cert or None)
    return context


def create_engine(settings: Settings) -> AsyncEngine:
    connect_args: dict[str, object] = {
        "server_settings": {
            "statement_timeout": str(settings.db_statement_timeout_ms),
        },
    }
    ssl_context = _build_ssl_context(settings)
    if ssl_context is not False:
        connect_args["ssl"] = ssl_context

    return create_async_engine(
        settings.database_url.get_secret_value(),
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    session_factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with session_factory() as session:
        yield session


async def check_database(engine: AsyncEngine, timeout_seconds: float) -> bool:
    try:
        async with asyncio.timeout(timeout_seconds):
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
