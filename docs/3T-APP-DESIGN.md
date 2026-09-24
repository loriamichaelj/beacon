# Design Doc: Beacon — Service Catalog & Incident Tracker

**Author:** M.L.
**Status:** v1.5 — Phase A (app build) implemented; Phase B (AWS on EC2) live in dev, see `CLOUD-DEVOPS-DESIGN.md`
**Scope:** Application tier only (React frontend, FastAPI backend, PostgreSQL schema), built and verified on **localhost**. The DevOps and cloud work (**GitHub Actions** CI/CD, **AWS** infrastructure, containers, deployment) happens in a later phase and is **out of scope** for this document. The exceptions are the Operational Contract in §11 and the CI-readiness rules in §13.1, which the application must honor so that phase has fixed targets to build against.

---

## Build Status (as of 2026-09-23)

**Phase A is implemented on the `dev` branch.** Every checklist item in §15 is ticked, and all nine steps of the §14 plan are done. Phase B (container image, GitHub Actions, Terraform, AWS) has since been built and is deployed to dev; it is documented in `CLOUD-DEVOPS-DESIGN.md` and `RUNBOOK.md`, not here. The app-side changes it required are noted in §11.

| Area | State |
|---|---|
| Backend (FastAPI, async SQLAlchemy) | Complete: services and incidents APIs, incident state machine, problem+json errors, JSON logging with request ID, `/healthz`, `/readyz`, `/metrics`, graceful SIGTERM handling |
| Schema | Complete: two Alembic migrations (see §6.1) |
| Seed script | Complete and idempotent (`python -m scripts.seed`) |
| Frontend (React, Vite, TanStack Query) | Complete: all §10.1 routes, zod-validated forms, loading/empty/error states, delete confirmation |
| Tests | Backend: 38 test functions (unit: state machine; integration: services API, incidents API, health, migration round-trip, seed) against testcontainers Postgres. Frontend: 12 Vitest tests across 4 files |
| Tooling | `make lint` and `make build-web` verified today; lockfiles committed (`uv.lock`, `package-lock.json`) |
| README | Written: setup, commands, env vars, pointer to §11 |

**Verified on 2026-09-23:** `make lint` (ruff, ruff format, mypy strict on 26 source files, eslint, prettier) passes. The frontend tests pass (12 of 12) and `make build-web` produces `frontend/dist/`. The 11 backend unit tests pass. The Docker daemon was not running in that session, so the testcontainers-backed integration tests, coverage, and the "database stopped" health checks in §15 were **not re-run** that day. Their checkmarks reflect the earlier Phase A sign-off. Re-run `make test` with Docker up to reconfirm.

**Deviations from the original design (all intentional):**
- **Two migrations, not one.** The schema in §6.1 is the *combined* result of `29430f6acafd` (initial schema) and `f945c88052c9` (adds `reopen_count`, the `incidents_resolved_requires_mitigated` constraint, and the tightened `incidents_time_order`). The second migration backfills `mitigated_at` on any pre-existing resolved rows. Its `downgrade()` restores the earlier constraints.
- **Package manager is npm** (`package-lock.json`), not pnpm.
- **Local Postgres is on host port 5434**, not 5432 (see §12).
- **`/readyz` during shutdown** returns `{"status":"not_ready","checks":{"shutdown":"in_progress"}}`. When the DB check fails it returns `{"status":"not_ready","checks":{"database":"failed"}}`. Both use status 503.
- **`DB_SSL=require`** encrypts the connection but does not verify the server certificate or hostname. Only `verify-full` does, and it requires `DB_SSL_ROOT_CERT`. Use `verify-full` for RDS in Phase B.

**Known follow-ups (none block Phase A):**
- `app/errors.py` uses `HTTP_422_UNPROCESSABLE_ENTITY`, which Starlette now deprecates in favor of `HTTP_422_UNPROCESSABLE_CONTENT`. It emits a `StarletteDeprecationWarning` during tests.
- Fresh-environment reachability (a clean checkout reaching a working app from the README alone) is deferred to Phase B's first run elsewhere, as noted in §15. The `≥ 85%` coverage target in §13 was not re-measured on 2026-09-23 (needs Docker).
- Phase B work (container image, GitHub Actions, IaC, AWS deployment) is done for dev; see `CLOUD-DEVOPS-DESIGN.md`. Observability wiring (dashboards, alarms) is still future work.

---

## 1. Summary

**Beacon** is a minimal three-tier web app that tracks **services** (name, tier, owning team, runbook) and **incidents** raised against them (severity, status, timestamps). It exposes a versioned REST API with full CRUD, liveness/readiness endpoints, and a React UI for managing both resources.

The app is deliberately small but production-shaped: typed contracts, migrations, validation, structured logs, health probes, and tests. It is designed to serve as a realistic workload for platform and SRE engineering work.

## 2. Goals and Non-Goals

### Goals
- CRUD for `services` and `incidents` via REST API and UI.
- Enforced incident lifecycle (state machine) with consistent timestamps.
- `/healthz` (liveness) and `/readyz` (readiness) endpoints with correct semantics.
- 12-factor configuration: all config via environment variables, no secrets in code.
- Stateless backend that can run as N replicas behind a load balancer.
- Schema managed exclusively by Alembic migrations.
- Automated tests for API, data layer, and core UI flows.

### Non-Goals (v1)
- Authentication/authorization (API is open; assume network-level protection). Design must not preclude adding OIDC (e.g., Amazon Cognito) later.
- Multi-tenancy.
- Real-time updates (websockets/SSE).
- Incident timeline/comments, paging integrations, notifications.
- OpenTelemetry tracing (planned for v2; leave a clean seam for it).
- Dockerfiles, GitHub Actions workflows, Terraform, and any AWS resources. These belong to Phase B (§2.1) and must not be created during the app build.

### 2.1 Delivery Approach

| Phase | Scope | Environment | Exit criteria |
|---|---|---|---|
| **A — App build** (this doc) — **implemented** | Backend, frontend, schema, tests, local dev tooling | Localhost only: app processes run natively, Postgres runs via `compose.dev.yml` | Every item in §15 verified on localhost; `make lint` and `make test` pass |
| **B — DevOps & Cloud** (separate effort) — **not started** | Containerization, GitHub Actions CI/CD, AWS infrastructure as code, deployment, observability wiring | GitHub Actions + AWS | Defined separately |

Phase A decisions that affect Phase B are captured in §11 (Operational Contract) and §13.1 (CI readiness). The app must not hardcode anything AWS-specific (account IDs, regions, ARNs, endpoints). All environment differences come in through environment variables.

## 3. Architecture

```mermaid
flowchart LR
  U[Browser] -->|HTTPS| FE[React SPA<br/>static assets]
  U -->|/api/v1/*| BE[FastAPI<br/>uvicorn, stateless]
  BE -->|asyncpg, pooled| DB[(PostgreSQL 16)]
  P[Platform probes] -->|/healthz /readyz| BE
  M[Metrics scraper] -->|/metrics| BE
```

- **Frontend:** static SPA built by Vite. Calls the API at a same-origin relative path `/api/v1` by default. In local dev, the Vite dev server proxies `/api` to the backend.
- **Backend:** FastAPI with async SQLAlchemy 2.x over asyncpg. No local state; no in-process caching of mutable data.
- **Database:** PostgreSQL 16. Schema owned by Alembic. `gen_random_uuid()` is available natively (PG13+), so no extension is needed.

## 4. Tech Stack

Pin exact versions in lockfiles. Use current stable releases at implementation time; the majors below are the design baseline.

| Layer | Choice |
|---|---|
| Backend runtime | Python 3.12 |
| Web framework | FastAPI + uvicorn |
| Validation / settings | Pydantic v2, pydantic-settings |
| ORM / driver | SQLAlchemy 2.x (async), asyncpg |
| Migrations | Alembic |
| Metrics | prometheus-client (or prometheus-fastapi-instrumentator) |
| Backend tooling | uv (deps), ruff (lint + format), mypy (strict on `app/`), pytest, pytest-asyncio, httpx, testcontainers[postgres] |
| Frontend | React 18+, TypeScript (strict), Vite |
| Data fetching / routing | TanStack Query, React Router |
| Forms | react-hook-form + zod |
| Frontend tooling | pnpm or npm, ESLint, Prettier, Vitest, React Testing Library, MSW |
| Database | PostgreSQL 16 |

## 5. Repository Layout

Repository name: `beacon`. Phase B will add `.github/workflows/`, `infra/`, and Dockerfiles; do not create them in Phase A.

```
beacon/
├── docs/
│   └── 3T-APP-DESIGN.md
├── README.md
├── Makefile                  # dev convenience targets (see §12)
├── compose.dev.yml           # local Postgres ONLY, for development
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/         # 29430f6acafd initial schema; f945c88052c9 reopen_count + lifecycle constraints
│   ├── uv.lock
│   ├── app/
│   │   ├── main.py           # app factory, lifespan, middleware, routers
│   │   ├── config.py         # pydantic-settings Settings
│   │   ├── db.py             # async engine, session dependency
│   │   ├── logging.py        # JSON logging, request-id context
│   │   ├── metrics.py        # Prometheus metrics (beacon_* prefix)
│   │   ├── errors.py         # problem+json handlers
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response models (incl. pagination envelope)
│   │   ├── repositories/     # DB access, no HTTP concerns
│   │   ├── services/         # business rules (incident state machine)
│   │   └── api/
│   │       ├── health.py
│   │       └── v1/
│   │           ├── services.py
│   │           └── incidents.py
│   ├── scripts/
│   │   └── seed.py
│   └── tests/
│       ├── unit/
│       └── integration/
└── frontend/
    ├── package.json
    ├── package-lock.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/              # typed client + TanStack Query hooks
        ├── types/            # API types (mirror backend schemas)
        ├── schemas/          # zod form schemas
        ├── hooks/            # e.g. useDocumentTitle
        ├── pages/            # services/ and incidents/
        ├── components/       # Layout, ServiceForm, ConfirmDialog, AsyncState
        └── test/             # MSW server, setup, render utils
```

Layering rule for the backend: `api` → `services` → `repositories` → `models`. Routers contain no SQL, and repositories contain no HTTP exceptions.

## 6. Data Model

### 6.1 Schema (cumulative result of both Alembic migrations)

The SQL below is the state after `alembic upgrade head`. `reopen_count`, `incidents_reopen_count_nonneg`, `incidents_resolved_requires_mitigated`, and the three-clause `incidents_time_order` were added by the second migration, `f945c88052c9`.

```sql
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
);
CREATE UNIQUE INDEX services_name_lower_uq ON services (lower(name));

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
  reopen_count SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT incidents_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT incidents_reopen_count_nonneg CHECK (reopen_count >= 0),
  CONSTRAINT incidents_resolved_consistency
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CONSTRAINT incidents_resolved_requires_mitigated
    CHECK (status <> 'resolved' OR mitigated_at IS NOT NULL),
  CONSTRAINT incidents_time_order
    CHECK (
      (mitigated_at IS NULL OR mitigated_at >= opened_at) AND
      (resolved_at  IS NULL OR resolved_at  >= opened_at) AND
      (resolved_at IS NULL OR mitigated_at IS NULL OR resolved_at >= mitigated_at)
    )
);
CREATE INDEX incidents_service_status_idx ON incidents (service_id, status);
CREATE INDEX incidents_opened_at_idx ON incidents (opened_at DESC);

-- Keep updated_at correct regardless of which client writes.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER services_set_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER incidents_set_updated_at BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 6.2 Design decisions
- **UUID PKs** are safe to expose in URLs and avoid enumeration. They are generated by the DB so clients can't supply them.
- **`TEXT` + `CHECK` instead of Postgres `ENUM`.** Adding a value to a native enum is an awkward migration; a CHECK constraint change is trivial.
- **`ON DELETE RESTRICT`.** A service with incidents cannot be deleted, which preserves incident history. The API surfaces this as `409 Conflict`.
- **Case-insensitive unique service name** via a functional index.
- **Invariants live in the DB, not only in Python.** The DB is the last line of defense against bad writes from scripts or future services. This includes not just `resolved_at`/`status` consistency, but that a `resolved` incident must also carry a `mitigated_at`, and that `mitigated_at` can never be later than `resolved_at` — so a bypassed or buggy application layer (seed script, admin tool, future client) can't leave the timestamps in a state the API's own lifecycle would never produce.
- **All timestamps are `TIMESTAMPTZ`, stored and returned in UTC** (ISO 8601 with `Z`).
- **`reopen_count` instead of a full history.** Reopening nulls out `mitigated_at`/`resolved_at` (see §7), which would otherwise make it invisible that an incident was ever reopened at all. A single incrementing counter records the fact without building the full timeline/audit log that's explicitly out of scope for v1 (§2, §16).

## 7. Incident Lifecycle

| From → To | Allowed | Side effects |
|---|---|---|
| `open` → `mitigated` | Yes | `mitigated_at = now()` |
| `open` → `resolved` | Yes | `resolved_at = now()`; `mitigated_at = now()` if null |
| `mitigated` → `resolved` | Yes | `resolved_at = now()` |
| `resolved` → `open` (reopen) | Yes | `resolved_at = NULL`, `mitigated_at = NULL`, `reopen_count += 1` |
| `mitigated` → `open` | Yes | `mitigated_at = NULL`, `reopen_count += 1` |
| same → same | No-op | No timestamp or counter change |
| anything else | No | `422` with a problem detail naming the invalid transition |

- **Reopening discards mitigation/resolution timestamps but not the fact of reopening.** `resolved → open` and `mitigated → open` null out `mitigated_at`/`resolved_at` rather than preserving prior values, so re-running the same lifecycle produces fresh timestamps instead of stale history — but each also increments `reopen_count`, so it's visible that an incident took more than one pass without needing a full timeline. This is intentional given the v1 non-goal of no incident timeline/audit log (§2); a full history of transitions is deferred to the v2 audit log (§16), not reconstructable from `incidents` alone in v1.
- Transition logic lives in `app/services/incidents.py` as a pure function (easy to unit test). The repository only persists.
- Clients **cannot** set `opened_at`, `mitigated_at`, `resolved_at`, `reopen_count`, `created_at`, or `updated_at` directly. These fields are server-controlled and ignored or rejected on input.
- Derived, read-only response fields: `time_to_mitigate_seconds` and `time_to_resolve_seconds` (null until applicable).

## 8. API Specification

Base path: `/api/v1`. JSON only. FastAPI must serve the OpenAPI schema at `/api/v1/openapi.json` and docs at `/api/v1/docs`.

### 8.1 Conventions
- **Pagination:** `?limit=` (default 20, max 100) and `?offset=` (default 0). The response envelope is:
  ```json
  { "items": [...], "total": 42, "limit": 20, "offset": 0 }
  ```
- **Sorting:** `?sort=` accepts a whitelisted field name, with `-` prefix for descending. Unknown sort fields return `422`.
  - Services: `name` (default), `tier`, `owner_team`, `created_at`, `updated_at`.
  - Incidents: `opened_at` (default: `-opened_at`), `severity`, `status`, `title`, `created_at`, `updated_at`.
- **Updates:** `PATCH` with partial bodies. There is no `PUT`.
- **Errors:** RFC 9457 `application/problem+json`:
  ```json
  {
    "type": "about:blank",
    "title": "Conflict",
    "status": 409,
    "detail": "Service has 3 incidents and cannot be deleted.",
    "instance": "/api/v1/services/3f2c..."
  }
  ```
  Pydantic validation errors map to `422` with an `errors` array of `{loc, msg}` alongside the standard problem fields:

  ```json
  {
    "type": "about:blank",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "Request validation failed.",
    "instance": "/api/v1/incidents",
    "errors": [
      { "loc": ["body", "severity"], "msg": "Input should be 'SEV1', 'SEV2', 'SEV3' or 'SEV4'" }
    ]
  }
  ```
- **Request ID:** accept the inbound `X-Request-ID` header, or generate a UUID4 if absent. Echo it on the response and include it in every log line.

### 8.2 Services

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/services` | 200 list | 422 |
| POST | `/services` | 201 + `Location` header | 409 duplicate name, 422 |
| GET | `/services/{id}` | 200 | 404 |
| PATCH | `/services/{id}` | 200 | 404, 409, 422 |
| DELETE | `/services/{id}` | 204 | 404, 409 has incidents |

List filters: `tier`, `owner_team`, `q` (case-insensitive substring match on name).

**ServiceCreate:** `name` (1–100), `tier` (0–3), `owner_team` (1–100), `runbook_url` (optional, valid http/https URL), `description` (optional, max 2000).
**ServiceUpdate:** all fields optional, same rules.
**ServiceRead:** all columns plus `open_incident_count` (int).

### 8.3 Incidents

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/incidents` | 200 list | 422 |
| POST | `/incidents` | 201 + `Location` header | 422 (includes unknown `service_id`) |
| GET | `/incidents/{id}` | 200 | 404 |
| PATCH | `/incidents/{id}` | 200 | 404, 422 invalid transition |
| DELETE | `/incidents/{id}` | 204 | 404 |

List filters: `service_id`, `status` (repeatable), `severity` (repeatable), `opened_after`, `opened_before`.

**IncidentCreate:** `service_id`, `title` (1–200), `severity`, `description` (optional, max 10000). Status always starts as `open`.
**IncidentUpdate:** optional `title`, `description`, `severity`, `status`. A `status` change runs through the state machine.
**IncidentRead:** all columns plus `service_name`, `time_to_mitigate_seconds`, `time_to_resolve_seconds`.

### 8.4 Health and Metrics (outside `/api/v1`, not in the public OpenAPI schema)

| Path | Purpose | Behavior |
|---|---|---|
| `GET /healthz` | Liveness | Returns `200 {"status":"ok"}` if the process can serve requests. **Must not touch the database or any dependency.** |
| `GET /readyz` | Readiness | Runs `SELECT 1` with a hard timeout (`READINESS_DB_TIMEOUT_SECONDS`, default 1s). Returns `200 {"status":"ready","checks":{"database":"ok"}}` or `503 {"status":"not_ready","checks":{"database":"failed"}}`. Also returns `503 {"status":"not_ready","checks":{"shutdown":"in_progress"}}` while the app is shutting down. |
| `GET /metrics` | Prometheus exposition | Request count and latency histogram by method, route template, and status; DB pool stats (`beacon_db_pool_size`, `beacon_db_pool_checked_out`); build info (`beacon_build_info`, labeled `version` and `git_sha`). All custom metric names use the `beacon_` prefix (e.g., `beacon_http_request_duration_seconds`). |

Health, readiness, and metrics requests are excluded from access logs and from request metrics to avoid noise.

## 9. Backend Behavior Requirements

- **Configuration:** a single `Settings` class (pydantic-settings) reads environment variables. The app fails fast at startup on missing or invalid required config. It never logs secret values.
- **DB connection:** an async engine is created in the lifespan handler with a bounded pool (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`), `pool_pre_ping=True`, and a statement timeout set via connection options (`DB_STATEMENT_TIMEOUT_MS`).
- **Migrations are never run on app startup.** Running them at startup races when N replicas boot at once. Expose them as a separate command (`alembic upgrade head`) for the platform to run as a one-off job.
- **Graceful shutdown:** on SIGTERM, flip readiness to 503, let in-flight requests finish within uvicorn's graceful timeout, then dispose the engine.
- **Logging:** JSON to stdout, one object per line. Fields: `timestamp`, `level`, `service` (always `beacon-api`), `logger`, `message`, `request_id`, and for access logs `method`, `path`, `route`, `status`, `duration_ms`. Level is set by `LOG_LEVEL`.
- **CORS:** disabled by default (same-origin deployment). If `CORS_ALLOWED_ORIGINS` is set, allow only those explicit origins. Never use `*`.
- **Unhandled exceptions** return `500` problem+json with a generic `detail`. The stack trace goes to logs only, never to the response body.
- **Integrity errors:** translate Postgres unique-violation errors to `409` and foreign-key violations to `409` (on delete) or `422` (on create). Clients should never see a raw `500` for these.
- **Seed script:** `python -m scripts.seed` inserts about 8 services across tiers and about 20 incidents in mixed states. It must be idempotent (skip if data exists).

## 10. Frontend Requirements

### 10.1 Pages

| Route | Page | Content |
|---|---|---|
| `/` | Redirect | Redirects to `/services` |
| `/services` | Service list | Table (name, tier, owner, open incidents) with search, tier filter, pagination, and a "New service" button |
| `/services/new` | Create form | Validated form |
| `/services/:id` | Service detail | Fields, edit and delete actions, and the service's incidents |
| `/services/:id/edit` | Edit form | Pre-filled form |
| `/incidents` | Incident list | Table (title, service, severity, status, opened, TTR) with status and severity filters and pagination |
| `/incidents/new` | Create form | Service picker, title, severity, description |
| `/incidents/:id` | Incident detail | Fields plus status-transition buttons that show only the valid next states from §7 |

### 10.2 Behavior
- **API client:** a single typed `fetch` wrapper in `src/api/`. It parses problem+json into a typed `ApiError`, attaches `X-Request-ID`, and uses a base URL from `import.meta.env.VITE_API_BASE_URL` with default `/api/v1`.
- **Data fetching:** TanStack Query for all server state. Invalidate list queries after mutations. No global state library.
- **Forms:** zod schemas mirror backend constraints. Server-side 422 errors map back onto their form fields.
- **UX states:** every data view handles loading, empty, and error states. Delete requires confirmation. A `409` on service delete shows the server's `detail` message.
- **Accessibility:** semantic HTML, labeled inputs, keyboard-operable dialogs.
- **Branding:** app name "Beacon" in the header and `<title>` (e.g., "Services · Beacon"). No third-party logos.
- **Styling:** minimal and clean. Plain CSS modules or a single lightweight approach; no heavy UI framework required.
- **Build output:** fully static (`dist/`), with no runtime Node server required.

> **Note:** `VITE_*` variables are baked in at build time. The default of a same-origin relative `/api/v1` avoids needing per-environment builds and CORS. Keep it that way unless there's a strong reason not to.

## 11. Operational Contract

This is what the platform side can rely on. The application must satisfy every item.

| Item | Contract |
|---|---|
| Backend listen address | `0.0.0.0:${PORT}`, default `8000` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port ${PORT}` (worker count configurable) |
| Migration command | `alembic upgrade head` (idempotent, run as a separate job) |
| Liveness | `GET /healthz` — no dependency checks |
| Readiness | `GET /readyz` — DB check with timeout; 503 during shutdown |
| Metrics | `GET /metrics` — Prometheus text format |
| Logs | JSON to stdout; nothing written to local disk |
| State | Stateless; safe to run N replicas |
| Shutdown | Graceful on SIGTERM |
| Filesystem | No writes outside `/tmp`; compatible with a read-only root filesystem |
| Frontend artifact | Static files in `frontend/dist/`, servable by any static host or CDN with SPA fallback to `index.html` |

### Environment variables (backend)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | `postgresql+asyncpg://user:pass@host:5432/beacon`. Secret. Locally from `.env`. On AWS it comes from an SSM Parameter Store SecureString that the instance's `deploy.sh` writes into the container's env-file at boot. The app reads only the env var and has no AWS SDK dependency for this. |
| `PORT` | No | `8000` | |
| `LOG_LEVEL` | No | `INFO` | |
| `DB_POOL_SIZE` | No | `5` | Per process. Total connections = replicas × workers × (pool + overflow); keep below the DB's `max_connections`. |
| `DB_MAX_OVERFLOW` | No | `5` | |
| `DB_STATEMENT_TIMEOUT_MS` | No | `5000` | |
| `READINESS_DB_TIMEOUT_SECONDS` | No | `1.0` | |
| `CORS_ALLOWED_ORIGINS` | No | empty | Comma-separated list |
| `APP_VERSION` / `GIT_SHA` | No | `dev` / `unknown` | Exposed in build-info metric and logs |
| `DB_SSL` | No | `disable` | One of `disable`, `require`, `verify-full`. Local dev uses `disable`. Phase B sets `require` or `verify-full` for Amazon RDS for PostgreSQL. `require` encrypts but does not verify the certificate; prefer `verify-full`. |
| `DB_SSL_ROOT_CERT` | No | empty | Path to a CA bundle (e.g., the RDS global bundle). Required when `DB_SSL=verify-full`. |

**TLS note:** asyncpg does **not** honor libpq's `sslmode` query parameter. Build an `ssl.SSLContext` from `DB_SSL` / `DB_SSL_ROOT_CERT` and pass it via `connect_args`. Also check your RDS parameter group: `rds.force_ssl` is enabled by default on recent RDS for PostgreSQL major versions, so plaintext connections will be rejected there.

### AWS-readiness requirements (satisfied in Phase A, used in Phase B)
- Container-friendly behavior per the table above. Phase B chose EC2: the backend runs as one Docker container per instance (read-only root filesystem, `--tmpfs /tmp`) in an Auto Scaling Group. The same image runs migrations (`alembic upgrade head`) and the dev seed (`python -m scripts.seed`). The app was unchanged apart from the fixes below.
- `/healthz` and `/readyz` are usable as-is for ALB target group health checks and Kubernetes or ECS container health checks.
- The backend is fully path-routable under `/api/*` (plus the probe and metrics paths). Phase B uses this with Nginx on each instance: it serves the SPA and proxies `/api/*`, `/healthz`, and `/readyz` to the container, behind one ALB, so everything stays same-origin and CORS stays off. `/metrics` is not exposed publicly.
- Fixes Phase B surfaced, now part of the app: (1) the backend always passes an explicit `ssl` setting to asyncpg (in the app and in Alembic's `env.py`), since omitting it silently meant unverified TLS and ignored `DB_SSL=verify-full`; (2) the frontend no longer requires `crypto.randomUUID`, which browsers withhold from plain-HTTP pages, for its request IDs.
- No reliance on local disk, sticky sessions, or instance metadata.

## 12. Local Development

Localhost is the only environment for Phase A. The backend and frontend run as native processes; only Postgres runs in a container.

- `compose.dev.yml` runs **only** Postgres 16 for local development, with a named volume and a healthcheck. Database, user, and volume are all named `beacon` (password from `.env`). It is not a deployment artifact.
- Default local URLs: API at `http://localhost:8000`, UI at `http://localhost:5173`, Postgres at `localhost:5434` (mapped from the container's `5432`; `5434` is used instead of the Postgres default because local dev machines may already have a native Postgres server bound to `5432`).
- Makefile targets:
  - `make db-up` / `make db-down`
  - `make migrate` — `alembic upgrade head`
  - `make seed`
  - `make api` — uvicorn with `--reload`
  - `make web` — Vite dev server with `/api` proxied to `localhost:8000`
  - `make test` — backend and frontend tests
  - `make lint` — ruff, mypy, eslint, prettier check
  - `make build-web` — production build of the SPA into `frontend/dist/`
- `backend/.env.example` and `frontend/.env.example` document every variable. Real `.env` files are gitignored.

## 13. Testing Strategy

| Level | Scope | Tooling |
|---|---|---|
| Unit (backend) | Incident state machine (every allowed and disallowed transition), schema validation, derived fields | pytest |
| Integration (backend) | Every endpoint against a real Postgres (testcontainers): CRUD, filters, pagination, sort whitelist, 404/409/422 paths, DB constraint enforcement, `/readyz` returning 503 when the DB is unreachable | pytest, httpx AsyncClient, testcontainers |
| Migration | `alembic upgrade head` then `downgrade base` then `upgrade head` on an empty DB | pytest |
| Frontend | List rendering, form validation, 422 mapping to fields, delete confirmation, 409 message display, transition buttons showing only valid states | Vitest, RTL, MSW |

Coverage target: ≥ 85% line coverage on `backend/app/`. Don't chase coverage on the frontend; cover the flows above.

### 13.1 CI Readiness (for GitHub Actions in Phase B)

No workflows are written in Phase A, but the project must be trivially runnable by them:

- `make lint` and `make test` are non-interactive, exit non-zero on failure, and need nothing beyond Docker, Python 3.12, and Node LTS. That matches the stock `ubuntu-latest` runner.
- Lockfiles are committed (`uv.lock`, `pnpm-lock.yaml` or `package-lock.json`) so CI installs are reproducible and cacheable.
- Integration tests start their own Postgres via testcontainers and don't depend on `compose.dev.yml` or a pre-existing database.
- Tests make no outbound network calls other than pulling the Postgres test image.
- Test reports are written in machine-readable form: `backend/reports/junit.xml` and `backend/reports/coverage.xml` (pytest), and `frontend/reports/junit.xml` (Vitest). `reports/` is gitignored.
- `make build-web` produces `frontend/dist/` with no environment-specific values baked in (relies on the relative `/api/v1` default).
- The app reads `APP_VERSION` and `GIT_SHA` from the environment so the pipeline can stamp builds.

## 14. Implementation Plan

Build in this order. Each phase must pass its checks before starting the next. **All nine steps are complete.**

1. ✅ **Scaffold.** Repo layout, tooling configs, Makefile, `compose.dev.yml`, `.env.example` files. *Done when* `make lint` passes on the empty skeleton.
2. ✅ **Backend foundation.** Settings, logging with request ID, problem+json error handlers, DB engine and lifespan, `/healthz`, `/readyz`, `/metrics`. *Done when* health tests pass, including readiness failure with the DB down.
3. ✅ **Schema.** Initial Alembic migration implementing §6 exactly, plus the migration round-trip test. *Done when* constraints are verified by integration tests.
4. ✅ **Services API.** Full CRUD per §8.2, with tests.
5. ✅ **Incidents API.** Full CRUD per §8.3, state machine per §7, with tests.
6. ✅ **Seed script.**
7. ✅ **Frontend.** API client, then services pages, then incidents pages, with tests.
8. ✅ **README.** Setup, commands, env vars, and a pointer to the Operational Contract.
9. ✅ **Phase A sign-off.** Run through §15 on localhost. This ends Phase A; stop here. GitHub Actions and AWS work begins as a separate effort.

## 15. Acceptance Criteria

- [x] All endpoints in §8 behave as specified, including every listed error status.
- [x] Invalid incident transitions are rejected with 422; timestamps follow §7 exactly.
- [x] Deleting a service that has incidents returns 409 and leaves data unchanged.
- [x] `/healthz` returns 200 with the database stopped; `/readyz` returns 503 with the database stopped.
- [x] No raw Postgres or Python error text ever appears in an API response.
- [x] App starts without running migrations; `alembic upgrade head` works on an empty DB and is idempotent.
- [x] Logs are valid JSON lines and every request log carries `request_id`.
- [x] UI supports create, read, update, and delete for both resources, with loading, empty, and error states.
- [x] `make lint` and `make test` pass cleanly.
- [x] CI-readiness items in §13.1 hold (lockfiles committed, JUnit/coverage reports generated, no dependency on `compose.dev.yml` in tests). Fresh-environment reachability (a clean checkout/container reaching a working app using only the README/Operational Contract) is verified in Phase B when the app first runs somewhere other than this development machine, not as a Phase A localhost check.
- [x] No Dockerfiles, workflows, IaC, or AWS-specific values exist in the repo.

## 16. Future Work (v2+)

- OIDC authentication (Amazon Cognito or another OIDC provider) and role-based write access.
- OpenTelemetry traces and metrics (FastAPI, SQLAlchemy, and fetch instrumentation), exportable via the AWS Distro for OpenTelemetry collector.
- Incident timeline events and an audit log table.
- Optimistic concurrency control on `PATCH` via `ETag` / `If-Match`.
- Cursor-based pagination for large incident histories.
- SLO dashboards: API availability and p95 latency per route.
