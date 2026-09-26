from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.service import Service


def add(session: AsyncSession, event: IncidentEvent) -> None:
    """Stage an event; it commits with the caller's incident write."""
    session.add(event)


async def list_for_incident(
    session: AsyncSession, incident_id: UUID, *, limit: int, offset: int
) -> tuple[list[IncidentEvent], int]:
    total = (
        await session.execute(
            select(func.count())
            .select_from(IncidentEvent)
            .where(IncidentEvent.incident_id == incident_id)
        )
    ).scalar_one()
    stmt = (
        select(IncidentEvent)
        .where(IncidentEvent.incident_id == incident_id)
        .order_by(IncidentEvent.created_at.asc(), IncidentEvent.id.asc())
        .limit(limit)
        .offset(offset)
    )
    return list((await session.execute(stmt)).scalars()), total


async def create_note(session: AsyncSession, incident_id: UUID, body: str) -> IncidentEvent:
    event = IncidentEvent(incident_id=incident_id, kind="note", body=body)
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def recent(
    session: AsyncSession, *, service_id: UUID | None, limit: int
) -> list[tuple[IncidentEvent, Incident, str]]:
    stmt = (
        select(IncidentEvent, Incident, Service.name)
        .join(Incident, Incident.id == IncidentEvent.incident_id)
        .join(Service, Service.id == Incident.service_id)
        .order_by(IncidentEvent.created_at.desc(), IncidentEvent.id.desc())
        .limit(limit)
    )
    if service_id is not None:
        stmt = stmt.where(Incident.service_id == service_id)
    rows = (await session.execute(stmt)).all()
    return [(row[0], row[1], row[2]) for row in rows]
