"""Operator API. Every route requires the admin token."""

from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from .auth import require_admin
from .config import config
from .db import get_db
from .hub import hub
from .store import ROLES, event, get_agent, now_ms, public_agent

router = APIRouter(prefix="/api", tags=["admin"], dependencies=[Depends(require_admin)])


class ApproveIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str = "unassigned"
    config: dict | None = None


@router.get("/state")
def state(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute("SELECT * FROM agents ORDER BY created_at").fetchall()
    agents = [
        public_agent(row, hub.is_online(row["id"]))
        for row in rows
        if row["status"] != "removed"
    ]
    pending = [agent for agent in agents if agent["status"] == "pending"]
    tunnel = getattr(request.app.state, "tunnel", None)

    return {
        "serverTime": now_ms(),
        "agents": agents,
        "pending": pending,
        "counts": {
            "agents": len(agents),
            "online": sum(1 for agent in agents if agent["online"]),
            "pending": len(pending),
            "mining": sum(1 for agent in agents if agent["role"] == "mining"),
            "music": sum(1 for agent in agents if agent["role"] == "music"),
        },
        "config": {
            "heartbeatMs": config.heartbeat_ms,
            "staleMs": config.stale_ms,
            "adminRequired": bool(config.admin_token),
            "githubRepo": config.github_repo,
            "liveTag": config.live_tag,
            "roles": list(ROLES),
        },
        "tunnel": tunnel.as_dict() if tunnel else None,
    }


@router.get("/events")
def events(
    limit: int = 100,
    since: int | None = None,
    conn: sqlite3.Connection = Depends(get_db),
):
    limit = max(1, min(limit, 500))
    if since is None:
        rows = conn.execute(
            "SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        rows = list(reversed(rows))
    else:
        rows = conn.execute(
            "SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?",
            (since, limit),
        ).fetchall()
    return {
        "events": [
            {
                "id": row["id"],
                "ts": row["ts"],
                "agentId": row["agent_id"],
                "kind": row["kind"],
                "data": row["data_json"],
            }
            for row in rows
        ]
    }


@router.post("/agents/{agent_id}/approve")
def approve(
    agent_id: str,
    payload: ApproveIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] == "removed":
        raise HTTPException(status_code=409, detail="this machine was removed")
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {', '.join(ROLES)}")

    conn.execute(
        """
        UPDATE agents
           SET status = 'active',
               role = ?,
               config_json = ?,
               approved_at = ?,
               pairing_code = NULL
         WHERE id = ?
        """,
        (
            payload.role,
            json.dumps(payload.config or {}),
            now_ms(),
            agent_id,
        ),
    )
    event(conn, "approved", agent_id, {"role": payload.role})

    updated = get_agent(conn, agent_id)
    return {"ok": True, "agent": public_agent(updated, hub.is_online(agent_id))}


@router.post("/agents/{agent_id}/role")
def set_role(
    agent_id: str,
    payload: ApproveIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {', '.join(ROLES)}")

    conn.execute("UPDATE agents SET role = ? WHERE id = ?", (payload.role, agent_id))
    event(conn, "role_changed", agent_id, {"role": payload.role})
    updated = get_agent(conn, agent_id)
    return {"ok": True, "agent": public_agent(updated, hub.is_online(agent_id))}


@router.delete("/agents/{agent_id}")
def remove(agent_id: str, conn: sqlite3.Connection = Depends(get_db)):
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] == "removed":
        return {"ok": True}

    conn.execute(
        "UPDATE agents SET status = 'removed', pairing_code = NULL WHERE id = ?",
        (agent_id,),
    )
    event(conn, "removed", agent_id)
    hub.drop(agent_id)
    return {"ok": True}
