from fastapi.testclient import TestClient


def _create(client: TestClient, **overrides: object) -> dict:
    payload = {
        "name": "checkout-api",
        "tier": 1,
        "owner_team": "payments",
        "runbook_url": "https://runbooks.example.com/checkout-api",
        "description": "Handles checkout.",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/services", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_and_get_service(client: TestClient) -> None:
    created = _create(client)
    assert created["name"] == "checkout-api"
    assert created["open_incident_count"] == 0

    resp = client.get(f"/api/v1/services/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_create_duplicate_name_case_insensitive_returns_409(client: TestClient) -> None:
    _create(client, name="checkout-api")
    resp = client.post(
        "/api/v1/services",
        json={
            "name": "Checkout-API",
            "tier": 2,
            "owner_team": "payments",
        },
    )
    assert resp.status_code == 409
    assert resp.headers["content-type"] == "application/problem+json"


def test_create_validation_error_returns_422_with_errors_array(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/services",
        json={"name": "", "tier": 9, "owner_team": "payments"},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert isinstance(body["errors"], list)
    assert len(body["errors"]) >= 1


def test_get_missing_service_returns_404(client: TestClient) -> None:
    resp = client.get("/api/v1/services/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_patch_updates_fields(client: TestClient) -> None:
    created = _create(client)
    resp = client.patch(
        f"/api/v1/services/{created['id']}",
        json={"description": "Updated description."},
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated description."
    assert resp.json()["name"] == created["name"]


def test_delete_service_without_incidents_returns_204(client: TestClient) -> None:
    created = _create(client)
    resp = client.delete(f"/api/v1/services/{created['id']}")
    assert resp.status_code == 204

    resp = client.get(f"/api/v1/services/{created['id']}")
    assert resp.status_code == 404


def test_list_filters_pagination_and_sort(client: TestClient) -> None:
    _create(client, name="alpha-service", tier=0, owner_team="team-a")
    _create(client, name="beta-service", tier=1, owner_team="team-b")
    _create(client, name="gamma-service", tier=1, owner_team="team-a")

    resp = client.get("/api/v1/services", params={"tier": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert {item["name"] for item in body["items"]} == {"beta-service", "gamma-service"}

    resp = client.get("/api/v1/services", params={"owner_team": "team-a"})
    assert resp.json()["total"] == 2

    resp = client.get("/api/v1/services", params={"q": "beta"})
    assert resp.json()["total"] == 1

    resp = client.get("/api/v1/services", params={"sort": "-name", "limit": 2})
    body = resp.json()
    assert body["limit"] == 2
    assert [item["name"] for item in body["items"]] == ["gamma-service", "beta-service"]


def test_unknown_sort_field_returns_422(client: TestClient) -> None:
    resp = client.get("/api/v1/services", params={"sort": "nope"})
    assert resp.status_code == 422
