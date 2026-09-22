import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

Title = Annotated[str, Field(min_length=1, max_length=200)]
Description = Annotated[str, Field(max_length=10000)]
Severity = Literal["SEV1", "SEV2", "SEV3", "SEV4"]
Status = Literal["open", "mitigated", "resolved"]


class IncidentCreate(BaseModel):
    service_id: uuid.UUID
    title: Title
    severity: Severity
    description: Description | None = None


class IncidentUpdate(BaseModel):
    title: Title | None = None
    description: Description | None = None
    severity: Severity | None = None
    status: Status | None = None


class IncidentRead(BaseModel):
    id: uuid.UUID
    service_id: uuid.UUID
    service_name: str
    title: str
    description: str | None
    severity: str
    status: str
    opened_at: datetime
    mitigated_at: datetime | None
    resolved_at: datetime | None
    reopen_count: int
    created_at: datetime
    updated_at: datetime
    time_to_mitigate_seconds: float | None
    time_to_resolve_seconds: float | None
