from fastapi.testclient import TestClient

MISSING = "00000000-0000-0000-0000-000000000000"


def _create_incident(client: TestClient, **overrides: object) -> dict:
    service = client.post(
        "/api/v1/services", json={"name": "checkout-api", "tier": 1, "owner_team": "payments"}
    ).json()
    payload = {"service_id": service["id"], "title": "Elevated error rate", "severity": "SEV2"}
    payload.update(overrides)
    resp = client.post("/api/v1/incidents", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _events(client: TestClient, incident_id: str) -> list[dict]:
    resp = client.get(f"/api/v1/incidents/{incident_id}/events")
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


def test_new_incident_has_an_opened_event(client: TestClient) -> None:
    incident = _create_incident(client, severity="SEV1")
    events = _events(client, incident["id"])
    assert [(e["kind"], e["to_value"]) for e in events] == [("opened", "SEV1")]
    assert events[0]["created_at"] == incident["opened_at"]


def test_status_and_severity_changes_are_recorded_in_order(client: TestClient) -> None:
    incident = _create_incident(client)
    url = f"/api/v1/incidents/{incident['id']}"
    assert client.patch(url, json={"status": "mitigated", "severity": "SEV1"}).status_code == 200
    assert client.patch(url, json={"status": "resolved"}).status_code == 200
    assert client.patch(url, json={"status": "open"}).status_code == 200

    events = _events(client, incident["id"])
    assert [(e["kind"], e["from_value"], e["to_value"]) for e in events] == [
        ("opened", None, "SEV2"),
        ("severity_changed", "SEV2", "SEV1"),
        ("status_changed", "open", "mitigated"),
        ("status_changed", "mitigated", "resolved"),
        ("status_changed", "resolved", "open"),
    ]


def test_no_op_updates_record_nothing(client: TestClient) -> None:
    incident = _create_incident(client)
    url = f"/api/v1/incidents/{incident['id']}"
    client.patch(url, json={"status": "open", "severity": "SEV2", "title": "Renamed"})
    assert [e["kind"] for e in _events(client, incident["id"])] == ["opened"]


def test_invalid_transition_records_nothing(client: TestClient) -> None:
    incident = _create_incident(client)
    url = f"/api/v1/incidents/{incident['id']}"
    client.patch(url, json={"status": "resolved"})
    resp = client.patch(url, json={"status": "mitigated", "severity": "SEV4"})
    assert resp.status_code == 422
    assert [e["kind"] for e in _events(client, incident["id"])] == ["opened", "status_changed"]
    assert client.get(url).json()["severity"] == "SEV2"


def test_add_note(client: TestClient) -> None:
    incident = _create_incident(client)
    resp = client.post(
        f"/api/v1/incidents/{incident['id']}/events", json={"body": "  Paged on-call.  "}
    )
    assert resp.status_code == 201, resp.text
    note = resp.json()
    assert note["kind"] == "note"
    assert note["body"] == "Paged on-call."
    assert _events(client, incident["id"])[-1]["id"] == note["id"]


def test_blank_or_oversized_note_returns_422(client: TestClient) -> None:
    incident = _create_incident(client)
    url = f"/api/v1/incidents/{incident['id']}/events"
    assert client.post(url, json={"body": "   "}).status_code == 422
    assert client.post(url, json={"body": "x" * 5001}).status_code == 422


def test_events_for_missing_incident_return_404(client: TestClient) -> None:
    assert client.get(f"/api/v1/incidents/{MISSING}/events").status_code == 404
    resp = client.post(f"/api/v1/incidents/{MISSING}/events", json={"body": "hi"})
    assert resp.status_code == 404


def test_deleting_an_incident_deletes_its_events(client: TestClient) -> None:
    incident = _create_incident(client)
    client.post(f"/api/v1/incidents/{incident['id']}/events", json={"body": "note"})
    assert client.delete(f"/api/v1/incidents/{incident['id']}").status_code == 204
    assert client.get("/api/v1/activity").json() == []
