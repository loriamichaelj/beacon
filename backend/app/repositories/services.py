from uuid import UUID

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.errors import ConflictError
from app.models.incident import Incident
from app.models.service import Service

SORT_FIELDS: dict[str, InstrumentedAttribute[object]] = {
    "name": Service.name,
    "tier": Service.tier,
    "owner_team": Service.owner_team,
    "created_at": Service.created_at,
}


def _open_incident_count_expr() -> ColumnElement[int]:
    return (
        select(func.count(Incident.id))
        .where(Incident.service_id == Service.id, Incident.status == "open")
        .correlate(Service)
        .scalar_subquery()
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
) -> tuple[list[tuple[Service, int]], int]:
    filters: list[ColumnElement[bool]] = []
    if tier is not None:
        filters.append(Service.tier == tier)
    if owner_team is not None:
        filters.append(Service.owner_team == owner_team)
    if q:
        filters.append(func.lower(Service.name).contains(q.lower()))

    total = (
        await session.execute(select(func.count()).select_from(Service).where(*filters))
    ).scalar_one()

    descending = sort.startswith("-")
    column = SORT_FIELDS[sort[1:] if descending else sort]
    order = column.desc() if descending else column.asc()

    stmt = (
        select(Service, _open_incident_count_expr())
        .where(*filters)
        .order_by(order)
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()
    items = [(row[0], row[1]) for row in rows]
    return items, total


async def get_service(session: AsyncSession, service_id: UUID) -> tuple[Service, int] | None:
    stmt = select(Service, _open_incident_count_expr()).where(Service.id == service_id)
    row = (await session.execute(stmt)).first()
    if row is None:
        return None
    return row[0], row[1]


async def create_service(session: AsyncSession, data: dict[str, object]) -> Service:
    service = Service(**data)
    session.add(service)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(f"Service name '{data.get('name')}' already exists.") from exc
    await session.refresh(service)
    return service


async def update_service(
    session: AsyncSession, service: Service, data: dict[str, object]
) -> Service:
    for field, value in data.items():
        setattr(service, field, value)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError("Service name already exists.") from exc
    await session.refresh(service)
    return service


async def delete_service(session: AsyncSession, service: Service) -> None:
    incident_count = (
        await session.execute(
            select(func.count(Incident.id)).where(Incident.service_id == service.id)
        )
    ).scalar_one()
    if incident_count > 0:
        raise ConflictError(f"Service has {incident_count} incident(s) and cannot be deleted.")

    await session.delete(service)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError("Service has incidents and cannot be deleted.") from exc
