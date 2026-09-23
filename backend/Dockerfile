# Beacon backend image. Built once per release, shipped to EC2 as a
# `docker save` tarball via S3 (see docs/CLOUD-DEVOPS-DESIGN.md §6.4, §7.1).
#
# The same image serves two roles:
#   - API:        default CMD (uvicorn on 0.0.0.0:${PORT})
#   - Migrations: `docker run --rm <image> alembic upgrade head`

FROM ghcr.io/astral-sh/uv:0.12.15 AS uv

FROM python:3.12-slim AS builder
COPY --from=uv /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app

# Dependencies first, so source-only changes reuse this layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim
RUN groupadd --system --gid 10001 beacon \
 && useradd --system --uid 10001 --gid beacon --no-create-home beacon
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/alembic /app/alembic
COPY --from=builder /app/alembic.ini /app/alembic.ini

# APP_VERSION / GIT_SHA are stamped at build time so the image is
# self-describing; the runtime env can still override them.
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA}

USER beacon
EXPOSE 8000

# Shell form only to expand ${PORT}; `exec` keeps uvicorn as PID 1 so it
# receives SIGTERM directly. Worker count comes from WEB_CONCURRENCY.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
