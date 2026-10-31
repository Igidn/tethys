"""Operator API. Every route requires the admin token."""

from __future__ import annotations

import asyncio
import json
import sqlite3

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict

from . import commands, db
from .auth import require_admin
from .config import config
from .db import get_db
from .hub import hub
from .store import ROLES, event, get_agent, loads, now_ms, public_agent

router = APIRouter(prefix="/api", tags=["admin"], dependencies=[Depends(require_admin)])


class ApproveIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str = "unassigned"
    config: dict | None = None


class RoleIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str


class ConfigIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    config: dict = {}


def _recent_commands(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM commands ORDER BY created_at DESC, rowid DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [commands.public_command(row) for row in rows]


def build_state(request: Request, conn: sqlite3.Connection) -> dict:
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
            "removing": sum(1 for agent in agents if agent["status"] == "removing"),
            "mining": sum(1 for agent in agents if agent["role"] == "mining"),
            "music": sum(1 for agent in agents if agent["role"] == "music"),
        },
        "commands": _recent_commands(conn),
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


@router.get("/state")
def state(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    return build_state(request, conn)


@router.get("/stream")
async def stream(request: Request, authorization: str | None = Header(default=None)):
    """Server-sent state snapshots, emitted only when something changed.

    The dashboard reads this with `fetch` so the bearer token stays in a header
    instead of a URL.
    """
    require_admin(authorization)

    async def frames():
        last = ""
        keepalive = 0
        while True:
            if await request.is_disconnected():
                break
            with db.session() as conn:
                payload = json.dumps(build_state(request, conn), separators=(",", ":"))
            if payload != last:
                last = payload
                keepalive = 0
                yield f"event: state\ndata: {payload}\n\n"
            else:
                keepalive += 1
                if keepalive >= 15:
                    keepalive = 0
                    yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        frames(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    if row["status"] in ("removed", "removing"):
        raise HTTPException(status_code=409, detail="this machine is being removed")
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
        (payload.role, json.dumps(payload.config or {}), now_ms(), agent_id),
    )
    event(conn, "approved", agent_id, {"role": payload.role})

    # No command is queued here: a pending machine cannot hold a socket, so the
    # role arrives in the welcome on its first connect.

    updated = get_agent(conn, agent_id)
    return {"ok": True, "agent": public_agent(updated, hub.is_online(agent_id))}


@router.post("/agents/{agent_id}/role")
def set_role(
    agent_id: str,
    payload: RoleIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] in ("removed", "removing"):
        raise HTTPException(status_code=409, detail="this machine is being removed")
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {', '.join(ROLES)}")

    conn.execute("UPDATE agents SET role = ? WHERE id = ?", (payload.role, agent_id))
    event(conn, "role_changed", agent_id, {"role": payload.role})
    commands.enqueue(conn, agent_id, "setRole", {"role": payload.role})
    conn.commit()  # the socket may read this on another connection
    hub.notify(agent_id)

    updated = get_agent(conn, agent_id)
    return {"ok": True, "agent": public_agent(updated, hub.is_online(agent_id))}


@router.post("/agents/{agent_id}/config")
def set_config(
    agent_id: str,
    payload: ConfigIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] in ("removed", "removing"):
        raise HTTPException(status_code=409, detail="this machine is being removed")

    conn.execute(
        "UPDATE agents SET config_json = ? WHERE id = ?",
        (json.dumps(payload.config), agent_id),
    )
    event(conn, "config_changed", agent_id)
    commands.enqueue(conn, agent_id, "setConfig", {"config": payload.config})
    conn.commit()  # the socket may read this on another connection
    hub.notify(agent_id)

    updated = get_agent(conn, agent_id)
    return {"ok": True, "agent": public_agent(updated, hub.is_online(agent_id))}


@router.post("/agents/{agent_id}/reboot")
def reboot(agent_id: str, conn: sqlite3.Connection = Depends(get_db)):
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] in ("removed", "removing"):
        raise HTTPException(status_code=409, detail="this machine is being removed")

    command = commands.enqueue(conn, agent_id, "reboot", {})
    event(conn, "reboot_queued", agent_id)
    conn.commit()  # the socket may read this on another connection
    hub.notify(agent_id)
    return {"ok": True, "command": commands.public_command(command)}


@router.post("/agents/{agent_id}/uninstall")
def uninstall(agent_id: str, conn: sqlite3.Connection = Depends(get_db)):
    """Queue a wipe. The machine stays `removing` until it acknowledges."""
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] == "removed":
        return {"ok": True, "agent": None}

    conn.execute("UPDATE agents SET status = 'removing' WHERE id = ?", (agent_id,))
    command = commands.enqueue(conn, agent_id, "wipe", {"reason": "uninstall"})
    event(conn, "uninstall_queued", agent_id)
    conn.commit()  # the socket may read this on another connection
    hub.notify(agent_id)

    updated = get_agent(conn, agent_id)
    return {
        "ok": True,
        "agent": public_agent(updated, hub.is_online(agent_id)),
        "command": commands.public_command(command),
    }


@router.delete("/agents/{agent_id}")
def remove(
    agent_id: str,
    force: bool = False,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Remove a machine.

    The default asks the agent to wipe itself first, so the runtime and startup
    hook do not linger on the computer. `force` drops it from the fleet now;
    the next reconnect is rejected and the files stay until a manual reinstall.
    """
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] == "removed":
        return {"ok": True, "removed": True}

    if force:
        conn.execute(
            "UPDATE agents SET status = 'removed', pairing_code = NULL WHERE id = ?",
            (agent_id,),
        )
        event(conn, "removed", agent_id, {"reason": "forced"})
        hub.drop(agent_id)
        return {"ok": True, "removed": True}

    conn.execute("UPDATE agents SET status = 'removing' WHERE id = ?", (agent_id,))
    commands.enqueue(conn, agent_id, "wipe", {"reason": "removed"})
    event(conn, "remove_queued", agent_id)
    conn.commit()  # the socket may read this on another connection
    hub.notify(agent_id)

    updated = get_agent(conn, agent_id)
    return {
        "ok": True,
        "removed": False,
        "agent": public_agent(updated, hub.is_online(agent_id)),
    }


class JobIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    kind: str = "branchMine"
    spec: dict


@router.post("/agents/{agent_id}/jobs")
def start_job(
    agent_id: str,
    payload: JobIn,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Start a mining job on an agent. Queues a startJob command."""
    row = get_agent(conn, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["status"] in ("removed", "removing"):
        raise HTTPException(status_code=409, detail="this machine is being removed")
    if row["status"] != "active":
        raise HTTPException(status_code=409, detail="this machine is not active")
    if row["role"] != "mining":
        raise HTTPException(status_code=400, detail="this machine is not a miner")

    import secrets

    job_id = secrets.token_hex(8)
    conn.execute(
        """
        INSERT INTO jobs (id, agent_id, kind, spec_json, state, progress_json,
                          stats_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'offered', '{}', '{}', ?, ?)
        """,
        (
            job_id,
            agent_id,
            payload.kind,
            json.dumps(payload.spec),
            now_ms(),
            now_ms(),
        ),
    )
    event(conn, "job_offered", agent_id, {"id": job_id, "kind": payload.kind})

    # Queue the startJob command so the agent picks it up on connect.
    command = commands.enqueue(
        conn,
        agent_id,
        "startJob",
        {"job": {"id": job_id, "kind": payload.kind, "spec": payload.spec}},
    )
    conn.commit()
    hub.notify(agent_id)

    return {
        "ok": True,
        "jobId": job_id,
        "command": commands.public_command(command),
    }


@router.post("/jobs/{job_id}/abort")
def abort_job(
    job_id: str,
    conn: sqlite3.Connection = Depends(get_db),
):
    """Abort a job. Queues an abort command on the agent."""
    row = conn.execute(
        "SELECT * FROM jobs WHERE id = ?", (job_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown job")

    agent_id = row["agent_id"]
    agent = get_agent(conn, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    if row["state"] in ("done", "failed"):
        return {"ok": True, "state": row["state"]}

    conn.execute(
        "UPDATE jobs SET state = 'failed', updated_at = ? WHERE id = ?",
        (now_ms(), job_id),
    )
    event(conn, "job_aborted", agent_id, {"id": job_id})

    command = commands.enqueue(conn, agent_id, "abort", {"jobId": job_id})
    conn.commit()
    hub.notify(agent_id)

    return {"ok": True, "jobId": job_id, "command": commands.public_command(command)}


@router.get("/jobs")
def list_jobs(conn: sqlite3.Connection = Depends(get_db)):
    """List all jobs."""
    rows = conn.execute(
        "SELECT * FROM jobs ORDER BY created_at DESC"
    ).fetchall()
    return {
        "jobs": [
            {
                "id": row["id"],
                "agentId": row["agent_id"],
                "kind": row["kind"],
                "state": row["state"],
                "progress": loads(row["progress_json"], {}),
                "stats": loads(row["stats_json"], {}),
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            for row in rows
        ]
    }
