from fastapi.testclient import TestClient


def _create_service(client: TestClient, **overrides: object) -> dict:
    payload = {"name": "checkout-api", "tier": 1, "owner_team": "payments"}
    payload.update(overrides)
    resp = client.post("/api/v1/services", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_incident(client: TestClient, service_id: str, **overrides: object) -> dict:
    payload = {
        "service_id": service_id,
        "title": "Elevated error rate",
        "severity": "SEV2",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/incidents", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_incident_defaults_to_open(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])
    assert incident["status"] == "open"
    assert incident["service_name"] == service["name"]
    assert incident["mitigated_at"] is None
    assert incident["resolved_at"] is None
    assert incident["time_to_mitigate_seconds"] is None
    assert incident["time_to_resolve_seconds"] is None


def test_create_incident_unknown_service_returns_422(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/incidents",
        json={
            "service_id": "00000000-0000-0000-0000-000000000000",
            "title": "X",
            "severity": "SEV1",
        },
    )
    assert resp.status_code == 422


def test_get_missing_incident_returns_404(client: TestClient) -> None:
    resp = client.get("/api/v1/incidents/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_valid_transition_open_to_resolved_sets_timestamps(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])

    resp = client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "resolved"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "resolved"
    assert body["mitigated_at"] is not None
    assert body["resolved_at"] is not None
    assert body["time_to_resolve_seconds"] is not None


def test_invalid_transition_resolved_to_mitigated_returns_422(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])
    client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "resolved"})

    resp = client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "mitigated"})
    assert resp.status_code == 422
    assert "resolved" in resp.json()["detail"].lower()
    assert "mitigated" in resp.json()["detail"].lower()


def test_reopen_clears_timestamps_and_increments_reopen_count(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])
    assert incident["reopen_count"] == 0
    client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "resolved"})

    resp = client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "open"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "open"
    assert body["mitigated_at"] is None
    assert body["resolved_at"] is None
    assert body["reopen_count"] == 1


def test_reopen_count_accumulates_across_multiple_reopen_cycles(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])

    client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "resolved"})
    client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "open"})
    client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "resolved"})
    resp = client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "open"})

    assert resp.status_code == 200
    assert resp.json()["reopen_count"] == 2


def test_same_status_patch_is_a_noop(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])

    resp = client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "open"})
    assert resp.status_code == 200
    assert resp.json()["mitigated_at"] is None
    assert resp.json()["resolved_at"] is None


def test_non_status_field_update(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])

    resp = client.patch(f"/api/v1/incidents/{incident['id']}", json={"title": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Renamed"
    assert resp.json()["status"] == "open"


def test_delete_incident_returns_204(client: TestClient) -> None:
    service = _create_service(client)
    incident = _create_incident(client, service["id"])

    resp = client.delete(f"/api/v1/incidents/{incident['id']}")
    assert resp.status_code == 204
    assert client.get(f"/api/v1/incidents/{incident['id']}").status_code == 404


def test_list_filters_by_service_status_and_severity(client: TestClient) -> None:
    service_a = _create_service(client, name="service-a")
    service_b = _create_service(client, name="service-b")
    inc1 = _create_incident(client, service_a["id"], title="A1", severity="SEV1")
    _create_incident(client, service_a["id"], title="A2", severity="SEV3")
    _create_incident(client, service_b["id"], title="B1", severity="SEV1")
    client.patch(f"/api/v1/incidents/{inc1['id']}", json={"status": "resolved"})

    resp = client.get("/api/v1/incidents", params={"service_id": service_a["id"]})
    assert resp.json()["total"] == 2

    resp = client.get("/api/v1/incidents", params={"severity": "SEV1"})
    assert resp.json()["total"] == 2

    resp = client.get("/api/v1/incidents", params={"status": "resolved"})
    assert resp.json()["total"] == 1


def test_list_default_sort_is_opened_at_descending(client: TestClient) -> None:
    service = _create_service(client)
    first = _create_incident(client, service["id"], title="first")
    second = _create_incident(client, service["id"], title="second")

    resp = client.get("/api/v1/incidents")
    ids = [item["id"] for item in resp.json()["items"]]
    assert ids.index(second["id"]) < ids.index(first["id"])


def test_delete_service_with_incidents_returns_409(client: TestClient) -> None:
    service = _create_service(client)
    _create_incident(client, service["id"])

    resp = client.delete(f"/api/v1/services/{service['id']}")
    assert resp.status_code == 409
    assert "incident" in resp.json()["detail"].lower()


def test_search_incidents_by_title(client: TestClient) -> None:
    service = _create_service(client)
    _create_incident(client, service["id"], title="Checkout latency spike")
    _create_incident(client, service["id"], title="Disk full on 100% of nodes")

    resp = client.get("/api/v1/incidents", params={"q": "LATENCY"})
    assert [i["title"] for i in resp.json()["items"]] == ["Checkout latency spike"]
    # LIKE wildcards in the search are literal characters, not patterns.
    resp = client.get("/api/v1/incidents", params={"q": "100%"})
    assert resp.json()["total"] == 1
    resp = client.get("/api/v1/incidents", params={"q": "_"})
    assert resp.json()["total"] == 0
