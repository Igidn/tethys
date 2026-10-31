import time

ID = "a" * 16
SECRET = "b" * 32
ADMIN = {"Authorization": "Bearer test-token"}

HELLO = {
    "v": 1,
    "type": "hello",
    "id": ID,
    "secret": SECRET,
    "computerId": 12,
    "label": "turtle-1",
    "fw": "0.1.0",
    "state": "idle",
}


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


def approve(client, role: str) -> str:
    agent_id = client.get("/api/state", headers=ADMIN).json()["pending"][0]["id"]
    client.post(
        f"/api/agents/{agent_id}/approve", json={"role": role}, headers=ADMIN
    )
    return agent_id


def wait_for_agent(client, agent_id: str, predicate, attempts: int = 40):
    for _ in range(attempts):
        state = client.get("/api/state", headers=ADMIN).json()
        agent = next((item for item in state["agents"] if item["id"] == agent_id), None)
        if agent is not None and predicate(agent):
            return agent
        time.sleep(0.05)
    raise AssertionError("condition never became true")


def test_socket_rejects_a_bad_secret(client):
    enroll(client)
    approve(client, "mining")

    with client.websocket_connect("/ws") as ws:
        ws.send_json({**HELLO, "secret": "c" * 32})
        message = ws.receive_json()

    assert message["type"] == "error"
    assert "authentication" in message["error"]


def test_socket_rejects_a_pending_machine(client):
    enroll(client)

    with client.websocket_connect("/ws") as ws:
        ws.send_json(HELLO)
        message = ws.receive_json()

    assert message["type"] == "error"
    assert message["error"] == "pending approval"


def test_welcome_carries_the_role_and_marks_the_machine_online(client):
    agent_id = enroll(client) and approve(client, "music")

    with client.websocket_connect("/ws") as ws:
        ws.send_json(HELLO)
        welcome = ws.receive_json()

        assert welcome["type"] == "welcome"
        assert welcome["agentId"] == ID
        assert welcome["role"] == "music"
        assert welcome["heartbeatMs"] > 0

        agent = wait_for_agent(client, agent_id, lambda item: item["online"])
        assert agent["label"] == "turtle-1"


def test_heartbeat_updates_telemetry(client):
    agent_id = enroll(client) and approve(client, "mining")

    with client.websocket_connect("/ws") as ws:
        ws.send_json(HELLO)
        ws.receive_json()

        ws.send_json(
            {
                "type": "heartbeat",
                "state": "running",
                "fuel": 1234,
                "pose": {"x": 1, "y": 2, "z": 3, "f": 0},
            }
        )

        agent = wait_for_agent(client, agent_id, lambda item: item["fuel"] == 1234)
        assert agent["state"] == "running"
        assert agent["pose"] == {"x": 1, "y": 2, "z": 3, "f": 0}
