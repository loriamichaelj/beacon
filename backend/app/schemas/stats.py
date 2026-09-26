import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SeverityCounts(BaseModel):
    SEV1: int = 0
    SEV2: int = 0
    SEV3: int = 0
    SEV4: int = 0


class StatsWindow(BaseModel):
    days: int
    start: datetime
    end: datetime
    bucket: Literal["day", "week"]


class ActiveIncidents(BaseModel):
    """Incidents not yet resolved, right now (not limited to the window)."""

    open: int
    mitigated: int
    by_severity: SeverityCounts


class SeriesPoint(BaseModel):
    start: datetime
    total: int
    by_severity: SeverityCounts


class Hotspot(BaseModel):
    service_id: uuid.UUID
    service_name: str
    tier: int
    active: int
    worst_severity: str


class OverviewStats(BaseModel):
    window: StatsWindow
    active: ActiveIncidents
    opened: int
    opened_previous: int
    resolved: int
    reopened: int
    median_time_to_mitigate_seconds: float | None
    median_time_to_resolve_seconds: float | None
    series: list[SeriesPoint]
    hotspots: list[Hotspot]
