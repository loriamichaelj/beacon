from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import UnprocessableError
from app.schemas.incident import IncidentCreate, IncidentRead, IncidentUpdate, Severity, Status
from app.schemas.pagination import Page
from app.services import incidents as service_layer

router = APIRouter(prefix="/incidents", tags=["incidents"])

SORT_WHITELIST = frozenset(
    f"{prefix}{field}"
    for field in ("opened_at", "severity", "status", "title")
    for prefix in ("", "-")
)


def _validated_sort(sort: str = Query(default="-opened_at")) -> str:
    if sort not in SORT_WHITELIST:
        raise UnprocessableError(f"Unknown sort field '{sort}'.")
    return sort


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SortDep = Annotated[str, Depends(_validated_sort)]


@router.get("", response_model=Page[IncidentRead])
async def list_incidents(
    session: SessionDep,
    sort: SortDep,
    service_id: UUID | None = None,
    status_filter: Annotated[list[Status] | None, Query(alias="status")] = None,
    severity: Annotated[list[Severity] | None, Query()] = None,
    opened_after: datetime | None = None,
    opened_before: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[IncidentRead]:
    return await service_layer.list_incidents(
        session,
        service_id=service_id,
        statuses=status_filter,
        severities=severity,
        opened_after=opened_after,
        opened_before=opened_before,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
async def create_incident(
    payload: IncidentCreate, response: Response, session: SessionDep
) -> IncidentRead:
    created = await service_layer.create_incident(session, payload)
    response.headers["Location"] = f"/api/v1/incidents/{created.id}"
    return created


@router.get("/{incident_id}", response_model=IncidentRead)
async def get_incident(incident_id: UUID, session: SessionDep) -> IncidentRead:
    return await service_layer.get_incident(session, incident_id)


@router.patch("/{incident_id}", response_model=IncidentRead)
async def update_incident(
    incident_id: UUID, payload: IncidentUpdate, session: SessionDep
) -> IncidentRead:
    return await service_layer.update_incident(session, incident_id, payload)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(incident_id: UUID, session: SessionDep) -> None:
    await service_layer.delete_incident(session, incident_id)
