import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, HttpUrl

Name = Annotated[str, Field(min_length=1, max_length=100)]
OwnerTeam = Annotated[str, Field(min_length=1, max_length=100)]
Description = Annotated[str, Field(max_length=2000)]
Tier = Annotated[int, Field(ge=0, le=3)]


class ServiceCreate(BaseModel):
    name: Name
    tier: Tier
    owner_team: OwnerTeam
    runbook_url: HttpUrl | None = None
    description: Description | None = None


class ServiceUpdate(BaseModel):
    name: Name | None = None
    tier: Tier | None = None
    owner_team: OwnerTeam | None = None
    runbook_url: HttpUrl | None = None
    description: Description | None = None


class ServiceRead(BaseModel):
    id: uuid.UUID
    name: str
    tier: int
    owner_team: str
    runbook_url: HttpUrl | None
    description: str | None
    created_at: datetime
    updated_at: datetime
    open_incident_count: int
