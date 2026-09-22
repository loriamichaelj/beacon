"""incident reopen count and lifecycle constraints

Revision ID: f945c88052c9
Revises: 29430f6acafd
Create Date: 2026-09-22 08:33:23.468826

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f945c88052c9"
down_revision: str | None = "29430f6acafd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE incidents ADD COLUMN reopen_count SMALLINT NOT NULL DEFAULT 0")
    op.execute(
        """
        ALTER TABLE incidents ADD CONSTRAINT incidents_reopen_count_nonneg
          CHECK (reopen_count >= 0)
        """
    )
    # Backfill any pre-existing resolved incidents that predate this
    # constraint (e.g. rows written by an older build of the seed script)
    # before requiring it. Best-effort: resolved_at is a safe stand-in
    # since incidents_time_order already guarantees mitigated_at <=
    # resolved_at once both are set.
    op.execute(
        "UPDATE incidents SET mitigated_at = resolved_at "
        "WHERE status = 'resolved' AND mitigated_at IS NULL"
    )
    op.execute(
        """
        ALTER TABLE incidents ADD CONSTRAINT incidents_resolved_requires_mitigated
          CHECK (status <> 'resolved' OR mitigated_at IS NOT NULL)
        """
    )
    op.execute("ALTER TABLE incidents DROP CONSTRAINT incidents_time_order")
    op.execute(
        """
        ALTER TABLE incidents ADD CONSTRAINT incidents_time_order
          CHECK (
            (mitigated_at IS NULL OR mitigated_at >= opened_at) AND
            (resolved_at  IS NULL OR resolved_at  >= opened_at) AND
            (resolved_at IS NULL OR mitigated_at IS NULL OR resolved_at >= mitigated_at)
          )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE incidents DROP CONSTRAINT incidents_time_order")
    op.execute(
        """
        ALTER TABLE incidents ADD CONSTRAINT incidents_time_order
          CHECK (
            (mitigated_at IS NULL OR mitigated_at >= opened_at) AND
            (resolved_at  IS NULL OR resolved_at  >= opened_at)
          )
        """
    )
    op.execute("ALTER TABLE incidents DROP CONSTRAINT incidents_resolved_requires_mitigated")
    op.execute("ALTER TABLE incidents DROP CONSTRAINT incidents_reopen_count_nonneg")
    op.execute("ALTER TABLE incidents DROP COLUMN reopen_count")
