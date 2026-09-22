# Beacon

Beacon is a minimal three-tier web app that tracks **services** (name,
tier, owning team, runbook) and **incidents** raised against them
(severity, status, timestamps). It exposes a versioned REST API with
full CRUD, liveness/readiness endpoints, and a React UI for managing
both resources.

This repository currently covers **Phase A: the application itself**,
built and verified on localhost. Containers, CI/CD, and AWS
infrastructure are a separate later phase. See
[`docs/DESIGN.md`](docs/DESIGN.md) for the full design, including the
[Operational Contract](docs/DESIGN.md#11-operational-contract) that
phase will build against.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x (async) + asyncpg, Alembic
- **Frontend:** React 18, TypeScript, Vite, TanStack Query, React Router
- **Database:** PostgreSQL 16

## Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js (LTS) and npm
- Docker (for local Postgres only)

## Setup

```bash
git clone <this-repo> && cd beacon

# Backend
cd backend
cp .env.example .env
uv sync --group dev
cd ..

# Frontend
cd frontend
cp .env.example .env
npm install
cd ..

# Database (Postgres 16 in Docker, mapped to host port 5434 -
# not the default 5432, since a dev machine may already have a
# native Postgres server bound to it)
make db-up
make migrate
make seed
```

Then, in two separate terminals:

```bash
make api   # http://localhost:8000
make web   # http://localhost:5173
```

Open http://localhost:5173 - it redirects to `/services`, seeded with
8 services and 20 incidents in mixed states.

## Commands

| Command | Description |
|---|---|
| `make db-up` / `make db-down` | Start/stop the local Postgres container |
| `make migrate` | Run `alembic upgrade head` |
| `make seed` | Insert idempotent local dev seed data |
| `make api` | Run the backend with `uvicorn --reload` |
| `make web` | Run the Vite dev server (proxies `/api` to `localhost:8000`) |
| `make test` | Run backend (pytest) and frontend (Vitest) test suites |
| `make lint` | Run ruff, mypy, eslint, and prettier checks |
| `make build-web` | Production build of the SPA into `frontend/dist/` |

Backend tests that hit the database use
[testcontainers](https://testcontainers.com/) and start their own
disposable Postgres - they don't depend on `make db-up`.

## Environment variables

Real `.env` files are gitignored. Each side documents its own
variables in an `.env.example`:

- [`backend/.env.example`](backend/.env.example) - `DATABASE_URL`,
  pool/timeout tuning, `DB_SSL*`, `CORS_ALLOWED_ORIGINS`, etc. Full
  reference: [DESIGN.md §11](docs/DESIGN.md#11-operational-contract).
- [`frontend/.env.example`](frontend/.env.example) - `VITE_API_BASE_URL`
  (defaults to the same-origin relative `/api/v1`).

## API

With the backend running, interactive docs are at
http://localhost:8000/api/v1/docs (OpenAPI schema at
`/api/v1/openapi.json`). Health/ops endpoints live outside the
versioned API and are excluded from that schema:

| Path | Purpose |
|---|---|
| `GET /healthz` | Liveness (no dependency checks) |
| `GET /readyz` | Readiness (checks the database) |
| `GET /metrics` | Prometheus exposition |

## Project layout

```
beacon/
├── docs/DESIGN.md      # full design doc
├── compose.dev.yml     # local Postgres only - not a deployment artifact
├── backend/            # FastAPI app, Alembic migrations, tests
└── frontend/           # React + Vite SPA
```

See [DESIGN.md §5](docs/DESIGN.md#5-repository-layout) for the full
backend/frontend layout and layering rules.
