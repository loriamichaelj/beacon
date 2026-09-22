from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import NotFoundError
from app.models.service import Service
from app.repositories import services as repo
from app.schemas.pagination import Page
from app.schemas.service import ServiceCreate, ServiceRead, ServiceUpdate


def _to_read(service: Service, open_incident_count: int) -> ServiceRead:
    return ServiceRead(
        id=service.id,
        name=service.name,
        tier=service.tier,
        owner_team=service.owner_team,
        runbook_url=service.runbook_url,  # type: ignore[arg-type]
        description=service.description,
        created_at=service.created_at,
        updated_at=service.updated_at,
        open_incident_count=open_incident_count,
    )


async def list_services(
    session: AsyncSession,
    *,
    tier: int | None,
    owner_team: str | None,
    q: str | None,
    sort: str,
    limit: int,
    offset: int,
) -> Page[ServiceRead]:
    rows, total = await repo.list_services(
        session,
        tier=tier,
        owner_team=owner_team,
        q=q,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    items = [_to_read(service, count) for service, count in rows]
    return Page[ServiceRead](items=items, total=total, limit=limit, offset=offset)


async def get_service(session: AsyncSession, service_id: UUID) -> ServiceRead:
    row = await repo.get_service(session, service_id)
    if row is None:
        raise NotFoundError(f"Service {service_id} not found.")
    service, count = row
    return _to_read(service, count)


async def create_service(session: AsyncSession, payload: ServiceCreate) -> ServiceRead:
    data: dict[str, object] = payload.model_dump()
    if data.get("runbook_url") is not None:
        data["runbook_url"] = str(data["runbook_url"])
    service = await repo.create_service(session, data)
    return _to_read(service, 0)


async def update_service(
    session: AsyncSession, service_id: UUID, payload: ServiceUpdate
) -> ServiceRead:
    row = await repo.get_service(session, service_id)
    if row is None:
        raise NotFoundError(f"Service {service_id} not found.")
    service, count = row

    data: dict[str, object] = payload.model_dump(exclude_unset=True)
    if data.get("runbook_url") is not None:
        data["runbook_url"] = str(data["runbook_url"])

    service = await repo.update_service(session, service, data)
    return _to_read(service, count)


async def delete_service(session: AsyncSession, service_id: UUID) -> None:
    row = await repo.get_service(session, service_id)
    if row is None:
        raise NotFoundError(f"Service {service_id} not found.")
    service, _count = row
    await repo.delete_service(session, service)
