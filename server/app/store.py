"""Row shaping and small persistence helpers shared by the API and the hub."""

from __future__ import annotations

import json
import sqlite3
import time

ROLES = ("unassigned", "mining", "music")


def now_ms() -> int:
    return int(time.time() * 1000)


def dumps(value) -> str | None:
    if value is None:
        return None
    return json.dumps(value, separators=(",", ":"))


def loads(text: str | None, fallback=None):
    if not text:
        return fallback
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return fallback


def event(
    conn: sqlite3.Connection,
    kind: str,
    agent_id: str | None = None,
    data=None,
) -> None:
    conn.execute(
        "INSERT INTO events (ts, agent_id, kind, data_json) VALUES (?, ?, ?, ?)",
        (now_ms(), agent_id, kind, dumps(data)),
    )


def public_agent(row: sqlite3.Row, online: bool = False) -> dict:
    return {
        "id": row["id"],
        "label": row["label"],
        "computerId": row["computer_id"],
        "role": row["role"],
        "status": row["status"],
        "state": row["state"],
        "online": online,
        "channel": row["channel"],
        "runtime": row["runtime"],
        "fuel": row["fuel"],
        "pose": loads(row["pose_json"]),
        "inventory": loads(row["inventory_json"], []),
        "pairingCode": row["pairing_code"] if row["status"] == "pending" else None,
        "createdAt": row["created_at"],
        "approvedAt": row["approved_at"],
        "lastSeen": row["last_seen"],
        "config": loads(row["config_json"], {}),
    }


def get_agent(conn: sqlite3.Connection, agent_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
