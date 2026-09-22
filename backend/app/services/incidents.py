from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import NotFoundError, UnprocessableError
from app.models.incident import Incident
from app.repositories import incidents as repo
from app.schemas.incident import IncidentCreate, IncidentRead, IncidentUpdate
from app.schemas.pagination import Page


class InvalidTransitionError(Exception):
    def __init__(self, from_status: str, to_status: str) -> None:
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(f"Cannot transition incident from '{from_status}' to '{to_status}'.")


@dataclass(frozen=True)
class TransitionResult:
    status: str
    mitigated_at: datetime | None
    resolved_at: datetime | None
    reopen_count: int


def apply_transition(
    *,
    current_status: str,
    current_mitigated_at: datetime | None,
    current_resolved_at: datetime | None,
    current_reopen_count: int,
    new_status: str,
    now: datetime,
) -> TransitionResult:
    """Pure incident-lifecycle state machine per DESIGN.md §7.

    Takes the current persisted state and the requested new status, and
    returns the status/timestamps/counter that should be persisted. Raises
    InvalidTransitionError for any transition not listed in §7.
    """
    if new_status == current_status:
        return TransitionResult(
            current_status, current_mitigated_at, current_resolved_at, current_reopen_count
        )

    if current_status == "open" and new_status == "mitigated":
        return TransitionResult("mitigated", now, current_resolved_at, current_reopen_count)

    if current_status == "open" and new_status == "resolved":
        return TransitionResult(
            "resolved", current_mitigated_at or now, now, current_reopen_count
        )

    if current_status == "mitigated" and new_status == "resolved":
        return TransitionResult("resolved", current_mitigated_at, now, current_reopen_count)

    if current_status == "resolved" and new_status == "open":
        return TransitionResult("open", None, None, current_reopen_count + 1)

    if current_status == "mitigated" and new_status == "open":
        return TransitionResult(
            "open", None, current_resolved_at, current_reopen_count + 1
        )

    raise InvalidTransitionError(current_status, new_status)


def _ttr_seconds(opened_at: datetime, at: datetime | None) -> float | None:
    if at is None:
        return None
    return (at - opened_at).total_seconds()


def _to_read(incident: Incident, service_name: str) -> IncidentRead:
    return IncidentRead(
        id=incident.id,
        service_id=incident.service_id,
        service_name=service_name,
        title=incident.title,
        description=incident.description,
        severity=incident.severity,
        status=incident.status,
        opened_at=incident.opened_at,
        mitigated_at=incident.mitigated_at,
        resolved_at=incident.resolved_at,
        reopen_count=incident.reopen_count,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
        time_to_mitigate_seconds=_ttr_seconds(incident.opened_at, incident.mitigated_at),
        time_to_resolve_seconds=_ttr_seconds(incident.opened_at, incident.resolved_at),
    )


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
) -> Page[IncidentRead]:
    rows, total = await repo.list_incidents(
        session,
        service_id=service_id,
        statuses=statuses,
        severities=severities,
        opened_after=opened_after,
        opened_before=opened_before,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    items = [_to_read(incident, service_name) for incident, service_name in rows]
    return Page[IncidentRead](items=items, total=total, limit=limit, offset=offset)


async def get_incident(session: AsyncSession, incident_id: UUID) -> IncidentRead:
    row = await repo.get_incident(session, incident_id)
    if row is None:
        raise NotFoundError(f"Incident {incident_id} not found.")
    incident, service_name = row
    return _to_read(incident, service_name)


async def create_incident(session: AsyncSession, payload: IncidentCreate) -> IncidentRead:
    if not await repo.service_exists(session, payload.service_id):
        raise UnprocessableError(f"Unknown service_id '{payload.service_id}'.")

    data: dict[str, object] = payload.model_dump()
    incident = await repo.create_incident(session, data)
    row = await repo.get_incident(session, incident.id)
    assert row is not None
    return _to_read(*row)


async def update_incident(
    session: AsyncSession, incident_id: UUID, payload: IncidentUpdate
) -> IncidentRead:
    row = await repo.get_incident(session, incident_id)
    if row is None:
        raise NotFoundError(f"Incident {incident_id} not found.")
    incident, service_name = row

    data: dict[str, object] = payload.model_dump(exclude_unset=True, exclude={"status"})

    if payload.status is not None and payload.status != incident.status:
        try:
            transition = apply_transition(
                current_status=incident.status,
                current_mitigated_at=incident.mitigated_at,
                current_resolved_at=incident.resolved_at,
                current_reopen_count=incident.reopen_count,
                new_status=payload.status,
                now=datetime.now(UTC),
            )
        except InvalidTransitionError as exc:
            raise UnprocessableError(str(exc)) from exc
        data["status"] = transition.status
        data["mitigated_at"] = transition.mitigated_at
        data["resolved_at"] = transition.resolved_at
        data["reopen_count"] = transition.reopen_count

    incident = await repo.save(session, incident, data)
    return _to_read(incident, service_name)


async def delete_incident(session: AsyncSession, incident_id: UUID) -> None:
    row = await repo.get_incident(session, incident_id)
    if row is None:
        raise NotFoundError(f"Incident {incident_id} not found.")
    incident, _service_name = row
    await repo.delete_incident(session, incident)
