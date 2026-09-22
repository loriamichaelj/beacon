import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.main as main_module
from app.config import get_settings


def _make_app(monkeypatch: pytest.MonkeyPatch, database_url: str) -> FastAPI:
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    return main_module.create_app()


def test_healthz_returns_ok_without_touching_database(
    monkeypatch: pytest.MonkeyPatch, postgres_dsn: str
) -> None:
    app = _make_app(monkeypatch, postgres_dsn)
    with TestClient(app) as client:
        resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_readyz_ok_when_database_up(
    monkeypatch: pytest.MonkeyPatch, postgres_dsn: str
) -> None:
    app = _make_app(monkeypatch, postgres_dsn)
    with TestClient(app) as client:
        resp = client.get("/readyz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ready", "checks": {"database": "ok"}}


def test_readyz_returns_503_when_database_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("READINESS_DB_TIMEOUT_SECONDS", "0.5")
    unreachable = "postgresql+asyncpg://beacon:beacon@localhost:1/beacon"
    app = _make_app(monkeypatch, unreachable)
    with TestClient(app) as client:
        resp = client.get("/readyz")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"] == "failed"


def test_request_id_is_generated_and_echoed(
    monkeypatch: pytest.MonkeyPatch, postgres_dsn: str
) -> None:
    app = _make_app(monkeypatch, postgres_dsn)
    with TestClient(app) as client:
        resp = client.get("/healthz", headers={"X-Request-ID": "test-rid"})
        assert resp.headers["X-Request-ID"] == "test-rid"

        resp_no_header = client.get("/healthz")
        assert resp_no_header.headers["X-Request-ID"]


def test_metrics_endpoint_exposes_build_info(
    monkeypatch: pytest.MonkeyPatch, postgres_dsn: str
) -> None:
    app = _make_app(monkeypatch, postgres_dsn)
    with TestClient(app) as client:
        resp = client.get("/metrics")
    assert resp.status_code == 200
    assert b"beacon_build_info" in resp.content


def test_health_endpoints_excluded_from_openapi_schema(
    monkeypatch: pytest.MonkeyPatch, postgres_dsn: str
) -> None:
    app = _make_app(monkeypatch, postgres_dsn)
    with TestClient(app) as client:
        schema = client.get("/api/v1/openapi.json").json()
    paths = schema["paths"]
    assert "/healthz" not in paths
    assert "/readyz" not in paths
    assert "/metrics" not in paths
