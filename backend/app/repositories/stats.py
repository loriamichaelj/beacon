from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import ColumnElement, and_, case, extract, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.models.service import Service

ACTIVE_STATUSES = ("open", "mitigated")
# Lower rank = more severe; used to pick a service's worst active severity.
SEVERITY_RANK = {"SEV1": 1, "SEV2": 2, "SEV3": 3, "SEV4": 4}


def _scope(service_id: UUID | None) -> list[ColumnElement[bool]]:
    return [Incident.service_id == service_id] if service_id is not None else []


async def active_counts(
    session: AsyncSession, service_id: UUID | None
) -> list[tuple[str, str, int]]:
    """(status, severity, count) for unresolved incidents."""
    stmt = (
        select(Incident.status, Incident.severity, func.count())
        .where(Incident.status.in_(ACTIVE_STATUSES), *_scope(service_id))
        .group_by(Incident.status, Incident.severity)
    )
    return [(row[0], row[1], row[2]) for row in (await session.execute(stmt)).all()]


async def count_opened(
    session: AsyncSession, service_id: UUID | None, start: datetime, end: datetime
) -> tuple[int, int]:
    """(opened in [start, end), of which reopened at least once)."""
    stmt = select(
        func.count(),
        func.count().filter(Incident.reopen_count > 0),
    ).where(Incident.opened_at >= start, Incident.opened_at < end, *_scope(service_id))
    row = (await session.execute(stmt)).one()
    return row[0], row[1]


async def resolution_stats(
    session: AsyncSession, service_id: UUID | None, start: datetime, end: datetime
) -> tuple[int, float | None, float | None]:
    """(resolved in window, median time to mitigate, median time to resolve).

    Medians are over incidents mitigated / resolved inside the window, so
    the numbers describe how the team responded during it.
    """
    in_window = and_(Incident.resolved_at >= start, Incident.resolved_at < end)
    resolved = (
        await session.execute(select(func.count()).where(in_window, *_scope(service_id)))
    ).scalar_one()

    ttm = extract("epoch", Incident.mitigated_at - Incident.opened_at)
    ttr = extract("epoch", Incident.resolved_at - Incident.opened_at)
    median_ttm = (
        await session.execute(
            select(func.percentile_cont(0.5).within_group(ttm)).where(
                Incident.mitigated_at >= start, Incident.mitigated_at < end, *_scope(service_id)
            )
        )
    ).scalar_one()
    median_ttr = (
        await session.execute(
            select(func.percentile_cont(0.5).within_group(ttr)).where(
                in_window, *_scope(service_id)
            )
        )
    ).scalar_one()
    return (
        resolved,
        float(median_ttm) if median_ttm is not None else None,
        float(median_ttr) if median_ttr is not None else None,
    )


async def opened_series(
    session: AsyncSession,
    service_id: UUID | None,
    start: datetime,
    end: datetime,
    bucket: Literal["day", "week"],
) -> list[tuple[datetime, str, int]]:
    """(bucket start in UTC, severity, count) for incidents opened in the window."""
    bucket_start = func.date_trunc(literal(bucket), func.timezone("UTC", Incident.opened_at))
    stmt = (
        select(bucket_start.label("bucket"), Incident.severity, func.count())
        .where(Incident.opened_at >= start, Incident.opened_at < end, *_scope(service_id))
        .group_by("bucket", Incident.severity)
    )
    return [(row[0], row[1], row[2]) for row in (await session.execute(stmt)).all()]


async def hotspots(session: AsyncSession, limit: int) -> list[tuple[Service, int, int]]:
    """(service, active incident count, worst active severity rank), most active first."""
    rank = case(SEVERITY_RANK, value=Incident.severity)
    stmt = (
        select(Service, func.count(Incident.id).label("active"), func.min(rank).label("worst"))
        .join(Incident, Incident.service_id == Service.id)
        .where(Incident.status.in_(ACTIVE_STATUSES))
        .group_by(Service.id)
        .order_by(func.min(rank).asc(), func.count(Incident.id).desc(), Service.tier.asc())
        .limit(limit)
    )
    return [(row[0], row[1], row[2]) for row in (await session.execute(stmt)).all()]
