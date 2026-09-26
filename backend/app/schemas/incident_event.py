import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

EventKind = Literal["opened", "status_changed", "severity_changed", "note"]
NoteBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class NoteCreate(BaseModel):
    body: NoteBody


class IncidentEventRead(BaseModel):
    id: int
    incident_id: uuid.UUID
    kind: EventKind
    from_value: str | None
    to_value: str | None
    body: str | None
    created_at: datetime


class ActivityRead(IncidentEventRead):
    """An event plus enough incident context to render it in a global feed."""

    incident_title: str
    incident_severity: str
    service_id: uuid.UUID
    service_name: str


ActivityLimit = Annotated[int, Field(ge=1, le=50)]
