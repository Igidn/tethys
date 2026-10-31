ID = "a" * 16
SECRET = "b" * 32
AGENT = {"X-Agent-Id": ID, "X-Agent-Secret": SECRET}
ADMIN = {"Authorization": "Bearer test-token"}
ALPHABET = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")


def enroll(client, **overrides):
    payload = {
        "id": ID,
        "secret": SECRET,
        "computerId": 12,
        "label": "turtle-1",
        "version": "0.1.0",
    }
    payload.update(overrides)
    return client.post("/api/enroll", json=payload)


def pending_id(client) -> str:
    return client.get("/api/state", headers=ADMIN).json()["pending"][0]["id"]


def test_enroll_returns_a_pairing_code(client):
    response = enroll(client)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending"
    assert len(body["code"]) == 6
    assert set(body["code"]) <= ALPHABET


def test_enroll_is_idempotent(client):
    first = enroll(client).json()
    second = enroll(client).json()

    assert first["code"] == second["code"]
    assert len(client.get("/api/state", headers=ADMIN).json()["pending"]) == 1


def test_enroll_rejects_a_different_secret(client):
    enroll(client)

    response = enroll(client, secret="c" * 32)

    assert response.status_code == 409


def test_enroll_rejects_malformed_identity(client):
    assert enroll(client, id="nope").status_code == 400
    assert enroll(client, secret="short").status_code == 400


def test_register_waits_for_approval(client):
    enroll(client)

    response = client.post("/api/register", json={"state": "idle"}, headers=AGENT)

    assert response.status_code == 409


def test_approve_activates_the_machine(client):
    code = enroll(client).json()["code"]
    agent_id = pending_id(client)

    state = client.get("/api/state", headers=ADMIN).json()
    assert [agent["pairingCode"] for agent in state["pending"]] == [code]

    response = client.post(
        f"/api/agents/{agent_id}/approve",
        json={"role": "mining", "config": {"sector": 48}},
        headers=ADMIN,
    )

    assert response.status_code == 200
    assert response.json()["agent"]["status"] == "active"
    assert client.get("/api/state", headers=ADMIN).json()["pending"] == []

    registered = client.post("/api/register", json={"state": "idle"}, headers=AGENT)
    assert registered.status_code == 200
    assert registered.json()["role"] == "mining"
    assert registered.json()["config"] == {"sector": 48}


def test_enroll_status_reports_the_role(client):
    enroll(client)
    agent_id = pending_id(client)
    client.post(
        f"/api/agents/{agent_id}/approve",
        json={"role": "music"},
        headers=ADMIN,
    )

    response = client.get("/api/enroll/status", headers=AGENT)

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert response.json()["role"] == "music"


def test_admin_endpoints_require_the_token(client):
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/state", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_agent_endpoints_require_credentials(client):
    enroll(client)

    assert client.get("/api/enroll/status").status_code == 401
    assert (
        client.get("/api/enroll/status", headers={"X-Agent-Id": ID}).status_code == 401
    )
    assert (
        client.get(
            "/api/enroll/status",
            headers={"X-Agent-Id": ID, "X-Agent-Secret": "d" * 32},
        ).status_code
        == 401
    )


def test_removed_machine_cannot_rejoin(client):
    enroll(client)
    agent_id = pending_id(client)

    assert (
        client.delete(f"/api/agents/{agent_id}?force=true", headers=ADMIN).status_code
        == 200
    )
    assert enroll(client).status_code == 403
    assert client.post("/api/register", json={}, headers=AGENT).status_code == 403


def test_approve_rejects_unknown_roles(client):
    enroll(client)
    agent_id = pending_id(client)

    response = client.post(
        f"/api/agents/{agent_id}/approve", json={"role": "overlord"}, headers=ADMIN
    )

    assert response.status_code == 400
