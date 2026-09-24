# Beacon

Beacon is a minimal three-tier web app that tracks **services** (name,
tier, owning team, runbook) and **incidents** raised against them
(severity, status, timestamps). It exposes a versioned REST API with
full CRUD, liveness/readiness endpoints, and a React UI for managing
both resources.

The repository covers two phases:

- **Phase A, the application:** built and verified on localhost. See
  [`docs/3T-APP-DESIGN.md`](docs/3T-APP-DESIGN.md), including the
  [Operational Contract](docs/3T-APP-DESIGN.md#11-operational-contract).
- **Phase B, cloud and DevOps:** AWS on EC2, deployed by GitHub Actions. It's live
  in **dev**; stage and prod are designed but not provisioned. See
  [`docs/CLOUD-DEVOPS-DESIGN.md`](docs/CLOUD-DEVOPS-DESIGN.md) for the design and
  [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for operating it.

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

## Deployment (AWS)

Everything runs through GitHub Actions; there's no local AWS access. In
short:

- **Infrastructure:** Terraform (`infra/`), with state in S3. There's one
  shared VPC with private subnets and VPC endpoints (no NAT), plus, per
  environment, an ALB, an Auto Scaling Group of EC2 instances, and RDS
  PostgreSQL 16.
- **Instances:** a Packer-built base AMI (`ami/`) with Nginx on the host
  serving the SPA and proxying `/api` to the backend, which runs as a Docker
  container. Access is via SSM Session Manager only; there's no SSH.
- **Releases:** a release is the backend image tarball plus the frontend
  tarball in S3, keyed by a hash of the app code (`make version`). It's built
  once in dev and promoted unchanged.
- **Deploys:** `deploy` tests, builds, runs migrations on a short-lived
  instance inside the VPC, replaces instances with no downtime, then smoke
  tests with curl and a headless browser.
- **Rollbacks:** `rollback` picks the previous release by default, or a
  commit SHA or version, guarded by rules for published, proven, and
  schema-compatible targets.
- **CI:** every push to `dev` runs lint and tests; PRs into `main` lint the
  workflows.
- **Failures:** a failed deploy or rollback opens a
  `[<env>] pipeline failure` issue that closes on the next success.

Branches: `dev` holds the app, infra, and scripts and is promoted to
`stage` and then `prod` by PR (both protected). `main` holds only the
workflows.

## Environment variables

Real `.env` files are gitignored. Each side documents its own
variables in an `.env.example`:

- [`backend/.env.example`](backend/.env.example) - `DATABASE_URL`,
  pool/timeout tuning, `DB_SSL*`, `CORS_ALLOWED_ORIGINS`, etc. Full
  reference: [3T-APP-DESIGN.md §11](docs/3T-APP-DESIGN.md#11-operational-contract).
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
├── docs/
│   ├── 3T-APP-DESIGN.md       # application design (Phase A)
│   ├── CLOUD-DEVOPS-DESIGN.md # cloud & DevOps design (Phase B)
│   └── RUNBOOK.md             # operating it on AWS
├── compose.dev.yml     # local Postgres only - not a deployment artifact
├── backend/            # FastAPI app, Alembic migrations, tests, Dockerfile, seed
├── frontend/           # React + Vite SPA
├── infra/
│   ├── project.env     # name prefixes, region, OIDC subject (one place)
│   ├── bootstrap/      # state/releases buckets, deploy roles (IAM)
│   ├── network/        # shared VPC, subnets, VPC endpoints
│   └── env/            # per-environment ALB, ASG, RDS (+ environments/*.tfvars)
├── ami/                # Packer base image: Nginx config, deploy/migrate host scripts
├── scripts/
│   ├── release/        # version + packaging
│   ├── deploy/         # preflight, publish, migrations, rollout, smoke tests, rollback rules, seed
│   └── bootstrap/      # state bucket creation
└── .github/workflows/dev-ci.yml  # trigger stub: tests on every push to dev
```

Workflows live on the `main` branch; see the runbook for the full list.

See [3T-APP-DESIGN.md §5](docs/3T-APP-DESIGN.md#5-repository-layout) for the full
backend/frontend layout and layering rules.
