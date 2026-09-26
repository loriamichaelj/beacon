from fastapi.testclient import TestClient


def _service(client: TestClient, name: str, tier: int = 1) -> dict:
    resp = client.post(
        "/api/v1/services", json={"name": name, "tier": tier, "owner_team": "payments"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _incident(client: TestClient, service_id: str, severity: str, title: str = "Boom") -> dict:
    resp = client.post(
        "/api/v1/incidents",
        json={"service_id": service_id, "title": title, "severity": severity},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_overview_on_an_empty_database(client: TestClient) -> None:
    resp = client.get("/api/v1/stats/overview?days=7")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["window"]["days"] == 7
    assert body["window"]["bucket"] == "day"
    assert body["active"] == {
        "open": 0,
        "mitigated": 0,
        "by_severity": {"SEV1": 0, "SEV2": 0, "SEV3": 0, "SEV4": 0},
    }
    assert body["opened"] == 0
    assert body["median_time_to_resolve_seconds"] is None
    # A 7-day window touches 8 UTC calendar days (a partial one at each end).
    assert len(body["series"]) == 8
    assert all(p["total"] == 0 for p in body["series"])
    assert body["hotspots"] == []


def test_overview_counts_and_hotspots(client: TestClient) -> None:
    api = _service(client, "checkout-api", tier=0)
    web = _service(client, "storefront", tier=2)
    a = _incident(client, api["id"], "SEV1")
    _incident(client, api["id"], "SEV3")
    b = _incident(client, web["id"], "SEV2")
    c = _incident(client, web["id"], "SEV4")
    client.patch(f"/api/v1/incidents/{a['id']}", json={"status": "mitigated"})
    client.patch(f"/api/v1/incidents/{b['id']}", json={"status": "resolved"})
    client.patch(f"/api/v1/incidents/{c['id']}", json={"status": "resolved"})
    client.patch(f"/api/v1/incidents/{c['id']}", json={"status": "open"})

    body = client.get("/api/v1/stats/overview").json()
    assert body["window"]["days"] == 30
    assert body["active"]["open"] == 2
    assert body["active"]["mitigated"] == 1
    assert body["active"]["by_severity"] == {"SEV1": 1, "SEV2": 0, "SEV3": 1, "SEV4": 1}
    assert body["opened"] == 4
    assert body["opened_previous"] == 0
    assert body["resolved"] == 1
    assert body["reopened"] == 1
    assert body["median_time_to_resolve_seconds"] is not None
    assert sum(p["total"] for p in body["series"]) == 4
    assert body["series"][-1]["by_severity"]["SEV1"] == 1
    # Worst active severity first: checkout-api has an active SEV1.
    assert [(h["service_name"], h["active"], h["worst_severity"]) for h in body["hotspots"]] == [
        ("checkout-api", 2, "SEV1"),
        ("storefront", 1, "SEV4"),
    ]


def test_overview_scoped_to_a_service(client: TestClient) -> None:
    api = _service(client, "checkout-api")
    web = _service(client, "storefront")
    _incident(client, api["id"], "SEV1")
    _incident(client, web["id"], "SEV2")

    body = client.get(f"/api/v1/stats/overview?service_id={api['id']}").json()
    assert body["opened"] == 1
    assert body["active"]["by_severity"]["SEV1"] == 1
    assert body["active"]["by_severity"]["SEV2"] == 0


def test_long_windows_use_weekly_buckets(client: TestClient) -> None:
    body = client.get("/api/v1/stats/overview?days=90").json()
    assert body["window"]["bucket"] == "week"
    assert 13 <= len(body["series"]) <= 14


def test_overview_rejects_bad_window(client: TestClient) -> None:
    assert client.get("/api/v1/stats/overview?days=0").status_code == 422
    assert client.get("/api/v1/stats/overview?days=366").status_code == 422


def test_activity_feed_is_newest_first_with_context(client: TestClient) -> None:
    api = _service(client, "checkout-api")
    incident = _incident(client, api["id"], "SEV2", title="Latency spike")
    client.patch(f"/api/v1/incidents/{incident['id']}", json={"status": "mitigated"})
    client.post(f"/api/v1/incidents/{incident['id']}/events", json={"body": "Scaled out."})

    feed = client.get("/api/v1/activity?limit=2").json()
    assert [e["kind"] for e in feed] == ["note", "status_changed"]
    assert feed[0]["incident_title"] == "Latency spike"
    assert feed[0]["service_name"] == "checkout-api"
    assert client.get("/api/v1/activity?limit=51").status_code == 422
