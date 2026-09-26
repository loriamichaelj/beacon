"""incident events (activity timeline)

Revision ID: 7c2e9a41d5b8
Revises: f945c88052c9
Create Date: 2026-09-25 22:30:00.000000

Additive only (expand): the previous release never reads or writes this
table, so it stays compatible with the schema during an instance refresh
and after a rollback (CLOUD-DEVOPS-DESIGN.md §7.1.2).

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c2e9a41d5b8"
down_revision: str | None = "f945c88052c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE incident_events (
          id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
          kind         TEXT NOT NULL
                       CHECK (kind IN ('opened','status_changed','severity_changed','note')),
          from_value   TEXT,
          to_value     TEXT,
          body         TEXT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT incident_events_note_body
            CHECK (kind <> 'note' OR char_length(body) BETWEEN 1 AND 5000)
        )
        """
    )
    op.execute(
        "CREATE INDEX incident_events_incident_idx ON incident_events (incident_id, created_at)"
    )
    op.execute("CREATE INDEX incident_events_created_at_idx ON incident_events (created_at DESC)")

    # Backfill a best-effort history from the lifecycle timestamps, so existing
    # incidents don't show an empty timeline. Reopens before this migration
    # aren't recoverable (reopening nulls the timestamps, §7).
    op.execute(
        """
        INSERT INTO incident_events (incident_id, kind, to_value, created_at)
        SELECT id, 'opened', severity, opened_at FROM incidents
        """
    )
    op.execute(
        """
        INSERT INTO incident_events (incident_id, kind, from_value, to_value, created_at)
        SELECT id, 'status_changed', 'open', 'mitigated', mitigated_at FROM incidents
        WHERE mitigated_at IS NOT NULL AND (resolved_at IS NULL OR mitigated_at < resolved_at)
        """
    )
    op.execute(
        """
        INSERT INTO incident_events (incident_id, kind, from_value, to_value, created_at)
        SELECT id, 'status_changed',
               CASE WHEN mitigated_at < resolved_at THEN 'mitigated' ELSE 'open' END,
               'resolved', resolved_at
        FROM incidents WHERE resolved_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE incident_events")
