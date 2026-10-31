"""Enrollment, pairing, and boot registration."""

from __future__ import annotations

import re
import secrets
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from .auth import hash_secret, require_agent, verify_secret
from .db import get_db
from .store import dumps, event, loads, now_ms

router = APIRouter(prefix="/api", tags=["enroll"])

ID_RE = re.compile(r"^[0-9a-f]{16}$")
SECRET_RE = re.compile(r"^[0-9a-f]{32}$")

# No 0/O/1/I: the operator reads this off a screen and types it.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6


class EnrollIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    secret: str
    computerId: int | None = None
    label: str | None = None
    version: str | None = None


class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    computerId: int | None = None
    label: str | None = None
    version: str | None = None
    state: str | None = None


def new_code(conn: sqlite3.Connection) -> str:
    for _ in range(32):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        taken = conn.execute(
            "SELECT 1 FROM agents WHERE pairing_code = ?", (code,)
        ).fetchone()
        if not taken:
            return code
    raise HTTPException(status_code=500, detail="could not allocate a pairing code")


def _touch_machine(conn: sqlite3.Connection, payload: EnrollIn) -> None:
    conn.execute(
        """
        UPDATE agents
           SET computer_id = COALESCE(?, computer_id),
               label = COALESCE(?, label),
               runtime = COALESCE(?, runtime)
         WHERE id = ?
        """,
        (payload.computerId, payload.label, payload.version, payload.id),
    )


@router.post("/enroll")
def enroll(payload: EnrollIn, conn: sqlite3.Connection = Depends(get_db)):
    """Register a machine and return its pairing code.

    Idempotent: a reinstall with the same id and secret keeps its pairing code,
    or goes straight through if it was already approved.
    """
    if not ID_RE.match(payload.id) or not SECRET_RE.match(payload.secret):
        raise HTTPException(status_code=400, detail="id must be 16 hex, secret 32 hex")

    row = conn.execute("SELECT * FROM agents WHERE id = ?", (payload.id,)).fetchone()

    if row is not None:
        if row["status"] == "removed":
            raise HTTPException(status_code=403, detail="this machine was removed")
        if not verify_secret(payload.secret, row["secret_hash"]):
            raise HTTPException(status_code=409, detail="id is registered with a different secret")

        _touch_machine(conn, payload)

        if row["status"] == "active":
            event(conn, "reenrolled", payload.id, {"computerId": payload.computerId})
            return {
                "status": "active",
                "agentId": payload.id,
                "code": None,
                "role": row["role"],
            }

        code = row["pairing_code"] or new_code(conn)
        conn.execute(
            "UPDATE agents SET pairing_code = ? WHERE id = ?", (code, payload.id)
        )
        return {"status": "pending", "agentId": payload.id, "code": code}

    code = new_code(conn)
    conn.execute(
        """
        INSERT INTO agents
               (id, secret_hash, computer_id, label, role, status, pairing_code,
                created_at, runtime)
        VALUES (?, ?, ?, ?, 'unassigned', 'pending', ?, ?, ?)
        """,
        (
            payload.id,
            hash_secret(payload.secret),
            payload.computerId,
            payload.label,
            code,
            now_ms(),
            payload.version,
        ),
    )
    event(
        conn,
        "enrolled",
        payload.id,
        {"computerId": payload.computerId, "label": payload.label},
    )
    return {"status": "pending", "agentId": payload.id, "code": code}


@router.get("/enroll/status")
def enroll_status(agent: sqlite3.Row = Depends(require_agent)):
    if agent["status"] == "removed":
        raise HTTPException(status_code=403, detail="this machine was removed")
    if agent["status"] == "pending":
        return {"status": "pending", "code": agent["pairing_code"]}
    return {
        "status": "active",
        "role": agent["role"],
        "config": loads(agent["config_json"], {}),
    }


@router.post("/register")
def register(
    payload: RegisterIn,
    agent: sqlite3.Row = Depends(require_agent),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Called on every boot. Idempotent."""
    if agent["status"] == "removed":
        raise HTTPException(status_code=403, detail="this machine was removed")
    if agent["status"] == "pending":
        raise HTTPException(status_code=409, detail="pending approval")

    conn.execute(
        """
        UPDATE agents
           SET last_seen = ?,
               label = COALESCE(?, label),
               computer_id = COALESCE(?, computer_id),
               runtime = COALESCE(?, runtime),
               state = COALESCE(?, state)
         WHERE id = ?
        """,
        (
            now_ms(),
            payload.label,
            payload.computerId,
            payload.version,
            payload.state,
            agent["id"],
        ),
    )
    return {
        "ok": True,
        "agentId": agent["id"],
        "role": agent["role"],
        "config": loads(agent["config_json"], {}),
        "serverTime": now_ms(),
        "runtime": None,
    }
