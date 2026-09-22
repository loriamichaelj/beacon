from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import UnprocessableError
from app.schemas.pagination import Page
from app.schemas.service import ServiceCreate, ServiceRead, ServiceUpdate
from app.services import services as service_layer

router = APIRouter(prefix="/services", tags=["services"])

SORT_WHITELIST = frozenset(
    f"{prefix}{field}"
    for field in ("name", "tier", "owner_team", "created_at")
    for prefix in ("", "-")
)


def _validated_sort(sort: str = Query(default="name")) -> str:
    if sort not in SORT_WHITELIST:
        raise UnprocessableError(f"Unknown sort field '{sort}'.")
    return sort


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SortDep = Annotated[str, Depends(_validated_sort)]


@router.get("", response_model=Page[ServiceRead])
async def list_services(
    session: SessionDep,
    sort: SortDep,
    tier: Annotated[int | None, Query(ge=0, le=3)] = None,
    owner_team: str | None = None,
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ServiceRead]:
    return await service_layer.list_services(
        session,
        tier=tier,
        owner_team=owner_team,
        q=q,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(
    payload: ServiceCreate, response: Response, session: SessionDep
) -> ServiceRead:
    created = await service_layer.create_service(session, payload)
    response.headers["Location"] = f"/api/v1/services/{created.id}"
    return created


@router.get("/{service_id}", response_model=ServiceRead)
async def get_service(service_id: UUID, session: SessionDep) -> ServiceRead:
    return await service_layer.get_service(session, service_id)


@router.patch("/{service_id}", response_model=ServiceRead)
async def update_service(
    service_id: UUID, payload: ServiceUpdate, session: SessionDep
) -> ServiceRead:
    return await service_layer.update_service(session, service_id, payload)


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(service_id: UUID, session: SessionDep) -> None:
    await service_layer.delete_service(session, service_id)
