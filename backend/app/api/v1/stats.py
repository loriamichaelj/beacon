from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.schemas.incident_event import ActivityLimit, ActivityRead
from app.schemas.stats import OverviewStats
from app.services import stats as service_layer

router = APIRouter(tags=["stats"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/stats/overview", response_model=OverviewStats)
async def overview(
    session: SessionDep,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    service_id: UUID | None = None,
) -> OverviewStats:
    return await service_layer.overview(session, days=days, service_id=service_id)


@router.get("/activity", response_model=list[ActivityRead])
async def recent_activity(
    session: SessionDep,
    limit: Annotated[ActivityLimit, Query()] = 10,
    service_id: UUID | None = None,
) -> list[ActivityRead]:
    """The most recent timeline events across incidents, newest first."""
    return await service_layer.recent_activity(session, service_id=service_id, limit=limit)
