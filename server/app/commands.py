"""Persisted command queue.

A command is written to SQLite before it is sent, so an operator action taken
while a machine is offline still happens when it reconnects. Delivery is
at-least-once: the agent keeps a small ledger of command ids and re-acks a
duplicate without running it twice.
"""

from __future__ import annotations

import secrets
import sqlite3

from .store import dumps, event, loads, now_ms

OPS = ("setRole", "setConfig", "reboot", "startJob", "abort", "returnHome", "update", "wipe")

# The link loop receives every 0.5s, so a healthy agent acks in under a second.
# Fifteen seconds leaves room for a slow turtle without retrying needlessly.
ACK_TIMEOUT_MS = 15_000
MAX_ATTEMPTS = 4

DONE = {"ok", "done", "ack", "role-assigned", "config-set", "rebooting", "wiped"}
PENDING = ("pending", "sent")


def new_id() -> str:
    return secrets.token_hex(8)


def enqueue(
    conn: sqlite3.Connection,
    agent_id: str,
    op: str,
    payload: dict | None = None,
) -> sqlite3.Row:
    """Queue a command, collapsing a repeat of the newest pending one.

    Without this, clicking a role twice in the dashboard would run the command
    twice on the machine. A genuinely different payload still queues.
    """
    if op not in OPS:
        raise ValueError(f"unknown op {op!r}")

    body = dumps(payload)
    latest = conn.execute(
        """
        SELECT * FROM commands
         WHERE agent_id = ? AND state IN ('pending', 'sent')
         ORDER BY created_at DESC, rowid DESC LIMIT 1
        """,
        (agent_id,),
    ).fetchone()
    if latest is not None and latest["op"] == op and latest["payload_json"] == body:
        return latest

    command_id = new_id()
    conn.execute(
        """
        INSERT INTO commands (id, agent_id, op, payload_json, state, attempts, created_at)
        VALUES (?, ?, ?, ?, 'pending', 0, ?)
        """,
        (command_id, agent_id, op, body, now_ms()),
    )
    event(conn, "command_queued", agent_id, {"id": command_id, "op": op})
    return conn.execute("SELECT * FROM commands WHERE id = ?", (command_id,)).fetchone()


def due(conn: sqlite3.Connection, agent_id: str) -> list[sqlite3.Row]:
    """Commands to send now: never sent, or sent long enough ago to retry."""
    cutoff = now_ms() - ACK_TIMEOUT_MS
    conn.execute(
        """
        UPDATE commands
           SET state = 'failed'
         WHERE agent_id = ?
           AND state = 'sent'
           AND attempts >= ?
           AND sent_at IS NOT NULL
           AND sent_at < ?
        """,
        (agent_id, MAX_ATTEMPTS, cutoff),
    )
    return conn.execute(
        """
        SELECT * FROM commands
         WHERE agent_id = ?
           AND (state = 'pending'
                OR (state = 'sent' AND sent_at IS NOT NULL AND sent_at < ?))
         ORDER BY created_at, rowid
        """,
        (agent_id, cutoff),
    ).fetchall()


def mark_sent(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> None:
    now = now_ms()
    for row in rows:
        conn.execute(
            """
            UPDATE commands
               SET state = 'sent', attempts = attempts + 1, sent_at = ?
             WHERE id = ?
            """,
            (now, row["id"]),
        )


def ack(
    conn: sqlite3.Connection,
    agent_id: str,
    command_id: str,
    status: str,
    result=None,
) -> sqlite3.Row | None:
    row = conn.execute(
        "SELECT * FROM commands WHERE id = ? AND agent_id = ?",
        (command_id, agent_id),
    ).fetchone()
    if row is None:
        return None
    if row["state"] in ("done", "failed"):
        return row

    state = "done" if str(status).lower() in DONE else "failed"
    conn.execute(
        """
        UPDATE commands
           SET state = ?, acked_at = ?, result_json = ?
         WHERE id = ?
        """,
        (state, now_ms(), dumps(result), command_id),
    )
    event(
        conn,
        f"command_{state}",
        agent_id,
        {"id": command_id, "op": row["op"], "status": status},
    )
    return conn.execute("SELECT * FROM commands WHERE id = ?", (command_id,)).fetchone()


def public_command(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "op": row["op"],
        "state": row["state"],
        "attempts": row["attempts"],
        "payload": loads(row["payload_json"], {}),
        "result": loads(row["result_json"]),
        "createdAt": row["created_at"],
        "ackedAt": row["acked_at"],
    }


def envelope(row: sqlite3.Row) -> dict:
    """Wire format for the agent."""
    return {
        "v": 1,
        "type": "command",
        "id": row["id"],
        "op": row["op"],
        "payload": loads(row["payload_json"], {}),
    }
