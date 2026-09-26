import logging
import signal
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import FrameType
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.api.v1 import incidents as incidents_v1
from app.api.v1 import services as services_v1
from app.api.v1 import stats as stats_v1
from app.config import get_settings
from app.db import create_engine, create_session_factory
from app.errors import register_exception_handlers
from app.logging import configure_logging, log_access, request_id_ctx
from app.metrics import BUILD_INFO, HTTP_REQUEST_DURATION_SECONDS

access_logger = logging.getLogger("app.access")


def _install_sigterm_hook(app: FastAPI) -> None:
    """Flip readiness to not-ready as soon as SIGTERM arrives, without
    disturbing uvicorn's own SIGTERM handler (which stops the server).
    """
    previous_handler = signal.getsignal(signal.SIGTERM)

    def _handle_sigterm(signum: int, frame: FrameType | None) -> None:
        app.state.shutting_down = True
        if callable(previous_handler):
            previous_handler(signum, frame)

    try:
        signal.signal(signal.SIGTERM, _handle_sigterm)
    except ValueError:
        # Not running in the main thread (e.g. some test runners); skip.
        pass


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)

    app.state.settings = settings
    app.state.shutting_down = False
    app.state.engine = create_engine(settings)
    app.state.session_factory = create_session_factory(app.state.engine)

    BUILD_INFO.labels(version=settings.app_version, git_sha=settings.git_sha).set(1)
    _install_sigterm_hook(app)

    yield

    app.state.shutting_down = True
    await app.state.engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Beacon API",
        version=settings.app_version,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        lifespan=lifespan,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def observability_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("X-Request-ID") or str(uuid4())
        token = request_id_ctx.set(request_id)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        response.headers["X-Request-ID"] = request_id

        if request.url.path not in health.EXCLUDED_PATHS:
            route = request.scope.get("route")
            route_path = getattr(route, "path", request.url.path)
            log_access(
                access_logger,
                method=request.method,
                path=request.url.path,
                route=route_path,
                status=response.status_code,
                duration_ms=duration_ms,
            )
            HTTP_REQUEST_DURATION_SECONDS.labels(
                request.method, route_path, response.status_code
            ).observe(duration_ms / 1000)

        request_id_ctx.reset(token)
        return response

    register_exception_handlers(app)
    app.include_router(health.router)
    app.include_router(services_v1.router, prefix="/api/v1")
    app.include_router(incidents_v1.router, prefix="/api/v1")
    app.include_router(stats_v1.router, prefix="/api/v1")

    return app


app = create_app()
