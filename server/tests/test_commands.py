import json
import time

from app import commands, db
from app.store import now_ms

ID = "a" * 16
SECRET = "b" * 32
AGENT = {"X-Agent-Id": ID, "X-Agent-Secret": SECRET}
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


def enroll(client):
    response = client.post(
        "/api/enroll",
        json={
            "id": ID,
            "secret": SECRET,
            "computerId": 12,
            "label": "turtle-1",
            "version": "0.1.0",
        },
    )
    assert response.status_code == 200
    return response.json()


def approve(client, role: str = "mining") -> str:
    agent_id = enroll(client)["agentId"]
    response = client.post(
        f"/api/agents/{agent_id}/approve", json={"role": role}, headers=ADMIN
    )
    assert response.status_code == 200
    return agent_id


def wait_for(producer, attempts: int = 60):
    for _ in range(attempts):
        value = producer()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError("condition never became true")


def command_state(client, command_id: str) -> dict:
    rows = client.get("/api/state", headers=ADMIN).json()["commands"]
    return next(row for row in rows if row["id"] == command_id)


def test_role_change_while_offline_is_delivered_on_connect(client):
    agent_id = approve(client)
    client.post(f"/api/agents/{agent_id}/role", json={"role": "music"}, headers=ADMIN)

    with client.websocket_connect("/ws") as ws:
        ws.send_json(HELLO)
        welcome = ws.receive_json()
        assert welcome["role"] == "music"

        command = ws.receive_json()
        assert command["type"] == "command"
        assert command["op"] == "setRole"
        assert command["payload"] == {"role": "music"}

        ws.send_json({"type": "ack", "id": command["id"], "status": "role-assigned"})

        row = wait_for(lambda: command_state(client, command["id"])["state"] == "done")
        assert row


def test_a_repeated_role_change_is_collapsed(client):
    agent_id = approve(client)
    for _ in range(3):
        client.post(
            f"/api/agents/{agent_id}/role", json={"role": "music"}, headers=ADMIN
        )

    pending = [
        row
        for row in client.get("/api/state", headers=ADMIN).json()["commands"]
        if row["op"] == "setRole"
    ]
    assert len(pending) == 1


def test_a_different_role_still_queues(client):
    agent_id = approve(client)
    client.post(f"/api/agents/{agent_id}/role", json={"role": "music"}, headers=ADMIN)
    client.post(f"/api/agents/{agent_id}/role", json={"role": "mining"}, headers=ADMIN)

    queued = [
        row["payload"]["role"]
        for row in client.get("/api/state", headers=ADMIN).json()["commands"]
        if row["op"] == "setRole"
    ]
    assert queued == ["mining", "music"]


def test_commands_retry_until_the_attempt_limit(client):
    approve(client)
    with db.session() as conn:
        row = commands.enqueue(conn, ID, "reboot", {})
        commands.mark_sent(conn, [row])

        for _ in range(commands.MAX_ATTEMPTS):
            conn.execute(
                "UPDATE commands SET sent_at = ? WHERE id = ?",
                (now_ms() - commands.ACK_TIMEOUT_MS - 1, row["id"]),
            )
            due = commands.due(conn, ID)
            if due:
                commands.mark_sent(conn, due)

        final = conn.execute(
            "SELECT * FROM commands WHERE id = ?", (row["id"],)
        ).fetchone()

    assert final["state"] == "failed"
    assert final["attempts"] == commands.MAX_ATTEMPTS


def test_ack_after_the_limit_does_not_resurrect_a_command(client):
    approve(client)
    with db.session() as conn:
        row = commands.enqueue(conn, ID, "reboot", {})
        commands.mark_sent(conn, [row])
        conn.execute(
            "UPDATE commands SET state = 'failed' WHERE id = ?", (row["id"],)
        )
        acked = commands.ack(conn, ID, row["id"], "ok")

    assert acked["state"] == "failed"


def test_reboot_queues_a_command(client):
    agent_id = approve(client)

    response = client.post(f"/api/agents/{agent_id}/reboot", headers=ADMIN)

    assert response.status_code == 200
    assert response.json()["command"]["op"] == "reboot"
    assert response.json()["command"]["state"] == "pending"


def test_remove_asks_the_agent_to_wipe_first(client):
    agent_id = approve(client)

    response = client.delete(f"/api/agents/{agent_id}", headers=ADMIN)

    assert response.status_code == 200
    assert response.json()["removed"] is False
    state = client.get("/api/state", headers=ADMIN).json()
    agent = next(item for item in state["agents"] if item["id"] == agent_id)
    assert agent["status"] == "removing"
    assert any(row["op"] == "wipe" for row in state["commands"])


def test_wipe_ack_marks_the_machine_removed(client):
    agent_id = approve(client)
    client.delete(f"/api/agents/{agent_id}", headers=ADMIN)

    with client.websocket_connect("/ws") as ws:
        ws.send_json(HELLO)
        ws.receive_json()  # welcome
        command = ws.receive_json()
        assert command["op"] == "wipe"
        ws.send_json({"type": "ack", "id": command["id"], "status": "wiped"})

        def gone() -> bool:
            state = client.get("/api/state", headers=ADMIN).json()
            return all(item["id"] != agent_id for item in state["agents"])

        assert wait_for(gone)


def test_force_remove_skips_the_wipe(client):
    agent_id = approve(client)

    response = client.delete(f"/api/agents/{agent_id}?force=true", headers=ADMIN)

    assert response.status_code == 200
    assert response.json()["removed"] is True
    state = client.get("/api/state", headers=ADMIN).json()
    assert all(item["id"] != agent_id for item in state["agents"])
    assert client.post("/api/enroll", json={"id": ID, "secret": SECRET}).status_code == 403


def test_removed_machine_cannot_connect(client):
    agent_id = approve(client)
    client.delete(f"/api/agents/{agent_id}?force=true", headers=ADMIN)

    with client.websocket_connect("/ws") as ws:
        ws.send_json(HELLO)
        message = ws.receive_json()

    assert message["type"] == "error"
    assert message["error"] == "removed"


def test_stream_emits_a_state_snapshot(client):
    approve(client)

    with client.stream("GET", "/api/stream", headers=ADMIN) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        for line in response.iter_lines():
            if line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                assert payload["counts"]["agents"] == 1
                assert payload["agents"][0]["id"] == ID
                break
        else:
            raise AssertionError("stream closed without a state frame")


def test_stream_requires_the_token(client):
    assert client.get("/api/stream").status_code == 401
