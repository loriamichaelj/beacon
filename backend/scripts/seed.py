"""Idempotent local dev seed data: python -m scripts.seed"""

import asyncio
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.config import get_settings
from app.db import create_engine, create_session_factory
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.service import Service

SERVICES: list[dict[str, object]] = [
    {
        "name": "checkout-api",
        "tier": 0,
        "owner_team": "payments",
        "runbook_url": "https://runbooks.example.com/checkout-api",
        "description": "Handles cart checkout and payment authorization.",
    },
    {
        "name": "user-auth",
        "tier": 0,
        "owner_team": "identity",
        "runbook_url": "https://runbooks.example.com/user-auth",
        "description": "Authentication and session management.",
    },
    {
        "name": "inventory-service",
        "tier": 1,
        "owner_team": "catalog",
        "runbook_url": "https://runbooks.example.com/inventory-service",
        "description": "Tracks stock levels across warehouses.",
    },
    {
        "name": "notification-gateway",
        "tier": 1,
        "owner_team": "growth",
        "runbook_url": None,
        "description": "Fans out email/SMS/push notifications.",
    },
    {
        "name": "search-indexer",
        "tier": 2,
        "owner_team": "catalog",
        "runbook_url": "https://runbooks.example.com/search-indexer",
        "description": "Builds and refreshes the product search index.",
    },
    {
        "name": "recommendation-engine",
        "tier": 2,
        "owner_team": "growth",
        "runbook_url": None,
        "description": "Generates personalized product recommendations.",
    },
    {
        "name": "internal-admin-ui",
        "tier": 3,
        "owner_team": "platform",
        "runbook_url": None,
        "description": "Internal tooling for support staff.",
    },
    {
        "name": "batch-reporting",
        "tier": 3,
        "owner_team": "data",
        "runbook_url": "https://runbooks.example.com/batch-reporting",
        "description": "Nightly batch jobs for financial reporting.",
    },
]

SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"]
INCIDENT_COUNT = 20


def _incident_timestamps(
    status: str, opened_at: datetime
) -> tuple[datetime | None, datetime | None]:
    if status == "open":
        return None, None
    if status == "mitigated":
        return opened_at + timedelta(minutes=random.randint(5, 120)), None
    # status == "resolved": mitigated_at is required whenever an incident is
    # resolved (3T-APP-DESIGN.md §6.1 incidents_resolved_requires_mitigated).
    mitigated_at = opened_at + timedelta(minutes=random.randint(5, 60))
    resolved_at = mitigated_at + timedelta(minutes=random.randint(5, 180))
    return mitigated_at, resolved_at


def _build_incidents(services: list[Service]) -> list[Incident]:
    titles = [
        "Elevated error rate",
        "Latency spike on primary endpoint",
        "Database connection pool exhausted",
        "Failed background job",
        "Increased 5xx responses",
        "Degraded downstream dependency",
        "Memory usage approaching limit",
        "Queue backlog growing",
        "Intermittent timeouts",
        "Data inconsistency detected",
    ]
    statuses = ["open", "mitigated", "resolved"]
    now = datetime.now(UTC)

    incidents = []
    for i in range(INCIDENT_COUNT):
        service = random.choice(services)
        status = random.choices(statuses, weights=[3, 2, 5])[0]
        opened_at = now - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
        mitigated_at, resolved_at = _incident_timestamps(status, opened_at)
        incidents.append(
            Incident(
                service_id=service.id,
                title=f"{random.choice(titles)} ({i + 1})",
                description="Seed data for local development.",
                severity=random.choice(SEVERITIES),
                status=status,
                opened_at=opened_at,
                mitigated_at=mitigated_at,
                resolved_at=resolved_at,
            )
        )
    return incidents


NOTES = [
    "Paged the on-call engineer; investigating dashboards.",
    "Rolled back the most recent deploy as a precaution.",
    "Scaled out the service to absorb the extra load.",
    "Root cause identified; follow-up ticket filed.",
]


def _build_events(incident: Incident) -> list[IncidentEvent]:
    """The timeline the lifecycle timestamps imply, plus an occasional note."""
    events = [
        IncidentEvent(
            incident_id=incident.id,
            kind="opened",
            to_value=incident.severity,
            created_at=incident.opened_at,
        )
    ]
    mitigated_at, resolved_at = incident.mitigated_at, incident.resolved_at
    if mitigated_at is not None and (resolved_at is None or mitigated_at < resolved_at):
        events.append(
            IncidentEvent(
                incident_id=incident.id,
                kind="status_changed",
                from_value="open",
                to_value="mitigated",
                created_at=mitigated_at,
            )
        )
    if random.random() < 0.5:
        note_at = incident.opened_at + (
            (mitigated_at - incident.opened_at) / 2
            if mitigated_at is not None
            else timedelta(minutes=random.randint(5, 30))
        )
        events.append(
            IncidentEvent(
                incident_id=incident.id,
                kind="note",
                body=random.choice(NOTES),
                created_at=min(note_at, datetime.now(UTC)),
            )
        )
    if resolved_at is not None:
        events.append(
            IncidentEvent(
                incident_id=incident.id,
                kind="status_changed",
                from_value="mitigated" if mitigated_at and mitigated_at < resolved_at else "open",
                to_value="resolved",
                created_at=resolved_at,
            )
        )
    return events


async def seed() -> None:
    settings = get_settings()
    engine = create_engine(settings)
    session_factory = create_session_factory(engine)

    try:
        async with session_factory() as session:
            existing = (await session.execute(select(func.count(Service.id)))).scalar_one()
            if existing > 0:
                print(f"Database already has {existing} service(s); skipping seed.")
                return

            services = [Service(**data) for data in SERVICES]
            session.add_all(services)
            await session.flush()

            incidents = _build_incidents(services)
            session.add_all(incidents)
            await session.flush()

            session.add_all([event for i in incidents for event in _build_events(i)])

            await session.commit()
            print(f"Seeded {len(services)} services and {len(incidents)} incidents.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
