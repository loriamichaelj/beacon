.PHONY: db-up db-down migrate seed api web test lint build-web

db-up:
	docker compose -f compose.dev.yml up -d

db-down:
	docker compose -f compose.dev.yml down

migrate:
	cd backend && uv run alembic upgrade head

seed:
	cd backend && uv run python -m scripts.seed

api:
	cd backend && uv run uvicorn app.main:app --reload

web:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app
	cd frontend && npm run lint

build-web:
	cd frontend && npm run build
