"""initial schema

Revision ID: 29430f6acafd
Revises:
Create Date: 2026-09-21 16:13:59.465987

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "29430f6acafd"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE services (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name         TEXT NOT NULL,
          tier         SMALLINT NOT NULL CHECK (tier BETWEEN 0 AND 3),
          owner_team   TEXT NOT NULL,
          runbook_url  TEXT,
          description  TEXT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT services_name_len CHECK (char_length(name) BETWEEN 1 AND 100),
          CONSTRAINT services_owner_len CHECK (char_length(owner_team) BETWEEN 1 AND 100)
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX services_name_lower_uq ON services (lower(name))")

    op.execute(
        """
        CREATE TABLE incidents (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          service_id   UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
          title        TEXT NOT NULL,
          description  TEXT,
          severity     TEXT NOT NULL CHECK (severity IN ('SEV1','SEV2','SEV3','SEV4')),
          status       TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','mitigated','resolved')),
          opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          mitigated_at TIMESTAMPTZ,
          resolved_at  TIMESTAMPTZ,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT incidents_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
          CONSTRAINT incidents_resolved_consistency
            CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
          CONSTRAINT incidents_time_order
            CHECK (
              (mitigated_at IS NULL OR mitigated_at >= opened_at) AND
              (resolved_at  IS NULL OR resolved_at  >= opened_at)
            )
        )
        """
    )
    op.execute("CREATE INDEX incidents_service_status_idx ON incidents (service_id, status)")
    op.execute("CREATE INDEX incidents_opened_at_idx ON incidents (opened_at DESC)")

    op.execute(
        """
        CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER services_set_updated_at BEFORE UPDATE ON services
          FOR EACH ROW EXECUTE FUNCTION set_updated_at()
        """
    )
    op.execute(
        """
        CREATE TRIGGER incidents_set_updated_at BEFORE UPDATE ON incidents
          FOR EACH ROW EXECUTE FUNCTION set_updated_at()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS incidents_set_updated_at ON incidents")
    op.execute("DROP TRIGGER IF EXISTS services_set_updated_at ON services")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
    op.execute("DROP TABLE IF EXISTS incidents")
    op.execute("DROP TABLE IF EXISTS services")
