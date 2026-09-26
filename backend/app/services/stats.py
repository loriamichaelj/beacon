from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import incident_events as events_repo
from app.repositories import stats as repo
from app.schemas.incident_event import ActivityRead
from app.schemas.stats import (
    ActiveIncidents,
    Hotspot,
    OverviewStats,
    SeriesPoint,
    SeverityCounts,
    StatsWindow,
)

HOTSPOT_LIMIT = 5
SEVERITY_BY_RANK = {rank: sev for sev, rank in repo.SEVERITY_RANK.items()}


def bucket_for(days: int) -> Literal["day", "week"]:
    return "day" if days <= 31 else "week"


def bucket_starts(start: datetime, end: datetime, bucket: Literal["day", "week"]) -> list[datetime]:
    """Every UTC bucket start from the one containing `start` up to `end`.

    Weeks start Monday 00:00 UTC, matching Postgres date_trunc('week').
    """
    first = start.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    if bucket == "week":
        first -= timedelta(days=first.weekday())
    step = timedelta(days=1 if bucket == "day" else 7)
    starts = []
    current = first
    while current < end:
        starts.append(current)
        current += step
    return starts


async def overview(
    session: AsyncSession, *, days: int, service_id: UUID | None, now: datetime | None = None
) -> OverviewStats:
    end = now or datetime.now(UTC)
    start = end - timedelta(days=days)
    bucket = bucket_for(days)

    by_severity = SeverityCounts()
    status_totals = {"open": 0, "mitigated": 0}
    for status, severity, count in await repo.active_counts(session, service_id):
        status_totals[status] += count
        setattr(by_severity, severity, getattr(by_severity, severity) + count)

    opened, reopened = await repo.count_opened(session, service_id, start, end)
    opened_previous, _ = await repo.count_opened(session, service_id, start - (end - start), start)
    resolved, median_ttm, median_ttr = await repo.resolution_stats(session, service_id, start, end)

    points = {
        s: SeriesPoint(start=s, total=0, by_severity=SeverityCounts())
        for s in bucket_starts(start, end, bucket)
    }
    for bucket_start, severity, count in await repo.opened_series(
        session, service_id, start, end, bucket
    ):
        point = points.get(bucket_start.replace(tzinfo=UTC))
        if point is None:  # can't happen for rows inside the window; be defensive
            continue
        point.total += count
        setattr(point.by_severity, severity, getattr(point.by_severity, severity) + count)

    hotspots = [
        Hotspot(
            service_id=service.id,
            service_name=service.name,
            tier=service.tier,
            active=active,
            worst_severity=SEVERITY_BY_RANK[worst],
        )
        for service, active, worst in (
            await repo.hotspots(session, HOTSPOT_LIMIT) if service_id is None else []
        )
    ]

    return OverviewStats(
        window=StatsWindow(days=days, start=start, end=end, bucket=bucket),
        active=ActiveIncidents(
            open=status_totals["open"],
            mitigated=status_totals["mitigated"],
            by_severity=by_severity,
        ),
        opened=opened,
        opened_previous=opened_previous,
        resolved=resolved,
        reopened=reopened,
        median_time_to_mitigate_seconds=median_ttm,
        median_time_to_resolve_seconds=median_ttr,
        series=list(points.values()),
        hotspots=hotspots,
    )


async def recent_activity(
    session: AsyncSession, *, service_id: UUID | None, limit: int
) -> list[ActivityRead]:
    rows = await events_repo.recent(session, service_id=service_id, limit=limit)
    return [
        ActivityRead(
            id=event.id,
            incident_id=event.incident_id,
            kind=event.kind,  # type: ignore[arg-type]
            from_value=event.from_value,
            to_value=event.to_value,
            body=event.body,
            created_at=event.created_at,
            incident_title=incident.title,
            incident_severity=incident.severity,
            service_id=incident.service_id,
            service_name=service_name,
        )
        for event, incident, service_name in rows
    ]
