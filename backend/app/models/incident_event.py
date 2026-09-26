import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Identity, Text
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class IncidentEvent(Base):
    """One entry in an incident's activity timeline.

    `kind` decides which columns are meaningful:
      opened            to_value = initial severity
      status_changed    from_value -> to_value (statuses)
      severity_changed  from_value -> to_value (severities)
      note              body
    """

    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    from_value: Mapped[str | None] = mapped_column(Text)
    to_value: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
