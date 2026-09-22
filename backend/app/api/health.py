from typing import Any

from fastapi import APIRouter, Request, Response, status
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.db import check_database
from app.metrics import DB_POOL_CHECKED_OUT, DB_POOL_SIZE

router = APIRouter(include_in_schema=False)

EXCLUDED_PATHS = frozenset({"/healthz", "/readyz", "/metrics"})


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request, response: Response) -> dict[str, Any]:
    if request.app.state.shutting_down:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready", "checks": {"shutdown": "in_progress"}}

    settings = request.app.state.settings
    ok = await check_database(request.app.state.engine, settings.readiness_db_timeout_seconds)
    if ok:
        return {"status": "ready", "checks": {"database": "ok"}}

    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "not_ready", "checks": {"database": "failed"}}


@router.get("/metrics")
async def metrics(request: Request) -> Response:
    pool = request.app.state.engine.pool
    DB_POOL_SIZE.set(pool.size())
    DB_POOL_CHECKED_OUT.set(pool.checkedout())
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
