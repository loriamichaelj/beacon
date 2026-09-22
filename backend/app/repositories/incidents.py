from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import InstrumentedAttribute

from app.models.incident import Incident
from app.models.service import Service
from sqlalchemy.ext.asyncio import AsyncSession

SORT_FIELDS: dict[str, InstrumentedAttribute[object]] = {
    "opened_at": Incident.opened_at,
    "severity": Incident.severity,
    "status": Incident.status,
    "title": Incident.title,
}


async def service_exists(session: AsyncSession, service_id: UUID) -> bool:
    result = await session.execute(select(Service.id).where(Service.id == service_id))
    return result.first() is not None


def _order_by(sort: str) -> ColumnElement[object]:
    descending = sort.startswith("-")
    column = SORT_FIELDS[sort[1:] if descending else sort]
    return column.desc() if descending else column.asc()


async def list_incidents(
    session: AsyncSession,
    *,
    service_id: UUID | None,
    statuses: list[str] | None,
    severities: list[str] | None,
    opened_after: datetime | None,
    opened_before: datetime | None,
    sort: str,
    limit: int,
    offset: int,
) -> tuple[list[tuple[Incident, str]], int]:
    filters: list[ColumnElement[bool]] = []
    if service_id is not None:
        filters.append(Incident.service_id == service_id)
    if statuses:
        filters.append(Incident.status.in_(statuses))
    if severities:
        filters.append(Incident.severity.in_(severities))
    if opened_after is not None:
        filters.append(Incident.opened_at >= opened_after)
    if opened_before is not None:
        filters.append(Incident.opened_at <= opened_before)

    total = (
        await session.execute(select(func.count()).select_from(Incident).where(*filters))
    ).scalar_one()

    stmt = (
        select(Incident, Service.name)
        .join(Service, Service.id == Incident.service_id)
        .where(*filters)
        .order_by(_order_by(sort))
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()
    return [(row[0], row[1]) for row in rows], total


async def get_incident(session: AsyncSession, incident_id: UUID) -> tuple[Incident, str] | None:
    stmt = (
        select(Incident, Service.name)
        .join(Service, Service.id == Incident.service_id)
        .where(Incident.id == incident_id)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        return None
    return row[0], row[1]


async def create_incident(session: AsyncSession, data: dict[str, object]) -> Incident:
    incident = Incident(**data)
    session.add(incident)
    await session.commit()
    await session.refresh(incident)
    return incident


async def save(session: AsyncSession, incident: Incident, data: dict[str, object]) -> Incident:
    for field, value in data.items():
        setattr(incident, field, value)
    await session.commit()
    await session.refresh(incident)
    return incident


async def delete_incident(session: AsyncSession, incident: Incident) -> None:
    await session.delete(incident)
    await session.commit()
