"""Agent WebSocket hub: authentication, heartbeat, and connection tracking."""

from __future__ import annotations

import asyncio
import logging
import sqlite3

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import db
from .auth import verify_secret
from .config import config
from .store import dumps, event, loads, now_ms

log = logging.getLogger("tethys.hub")
router = APIRouter()


async def _safe_close(ws: WebSocket, code: int, reason: str) -> None:
    try:
        await ws.close(code=code, reason=reason)
    except Exception:
        pass


class Hub:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._sweeper: asyncio.Task | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def is_online(self, agent_id: str) -> bool:
        return agent_id in self._connections

    @property
    def online_ids(self) -> list[str]:
        return list(self._connections)

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._sweeper = asyncio.create_task(self._sweep_loop())

    async def stop(self) -> None:
        if self._sweeper is not None:
            self._sweeper.cancel()
            try:
                await self._sweeper
            except asyncio.CancelledError:
                pass
            self._sweeper = None
        for ws in list(self._connections.values()):
            await _safe_close(ws, 1001, "shutdown")
        self._connections.clear()

    async def attach(self, ws: WebSocket, agent_id: str) -> None:
        previous = self._connections.get(agent_id)
        if previous is not None and previous is not ws:
            await _safe_close(previous, 4002, "replaced")
        self._connections[agent_id] = ws

    def detach(self, agent_id: str, ws: WebSocket) -> None:
        if self._connections.get(agent_id) is ws:
            del self._connections[agent_id]

    def drop(self, agent_id: str) -> None:
        """Close a connection from synchronous code."""
        ws = self._connections.pop(agent_id, None)
        if ws is not None and self._loop is not None:
            asyncio.run_coroutine_threadsafe(
                _safe_close(ws, 4003, "removed"), self._loop
            )

    async def _sweep_loop(self) -> None:
        interval = max(2.0, config.stale_ms / 2000)
        while True:
            await asyncio.sleep(interval)
            cutoff = now_ms() - config.stale_ms
            try:
                with db.session() as conn:
                    rows = conn.execute(
                        """
                        SELECT id, state FROM agents
                         WHERE status = 'active'
                           AND last_seen IS NOT NULL
                           AND last_seen < ?
                        """,
                        (cutoff,),
                    ).fetchall()
                    for row in rows:
                        if self.is_online(row["id"]) or row["state"] == "stale":
                            continue
                        conn.execute(
                            "UPDATE agents SET state = 'stale' WHERE id = ?",
                            (row["id"],),
                        )
                        event(conn, "stale", row["id"])
            except Exception:  # keep the sweeper alive across transient errors
                log.exception("stale sweep failed")


hub = Hub()


@router.websocket("/ws")
async def agent_socket(ws: WebSocket) -> None:
    await ws.accept()

    try:
        hello = await asyncio.wait_for(ws.receive_json(), timeout=10)
    except Exception:
        await _safe_close(ws, 4001, "hello timeout")
        return

    if not isinstance(hello, dict) or hello.get("type") != "hello":
        await _safe_close(ws, 4001, "expected hello")
        return

    agent_id = str(hello.get("id") or "")
    secret = str(hello.get("secret") or "")

    with db.session() as conn:
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()

    if row is None or not verify_secret(secret, row["secret_hash"]):
        await ws.send_json({"v": 1, "type": "error", "error": "authentication failed"})
        await _safe_close(ws, 4003, "authentication failed")
        return

    if row["status"] == "removed":
        await ws.send_json({"v": 1, "type": "error", "error": "removed"})
        await _safe_close(ws, 4003, "removed")
        return

    if row["status"] == "pending":
        await ws.send_json({"v": 1, "type": "error", "error": "pending approval"})
        await _safe_close(ws, 4003, "pending approval")
        return

    await hub.attach(ws, agent_id)

    with db.session() as conn:
        conn.execute(
            """
            UPDATE agents
               SET last_seen = ?, state = COALESCE(?, state),
                   label = COALESCE(?, label),
                   runtime = COALESCE(?, runtime)
             WHERE id = ?
            """,
            (now_ms(), hello.get("state"), hello.get("label"), hello.get("fw"), agent_id),
        )
        event(conn, "connected", agent_id, {"fw": hello.get("fw")})

    await ws.send_json(
        {
            "v": 1,
            "type": "welcome",
            "agentId": agent_id,
            "role": row["role"],
            "config": loads(row["config_json"], {}),
            "serverTime": now_ms(),
            "heartbeatMs": config.heartbeat_ms,
            "runtime": None,
        }
    )

    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    ws.receive_json(), timeout=config.stale_ms / 1000
                )
            except asyncio.TimeoutError:
                await _safe_close(ws, 4004, "heartbeat timeout")
                break
            except (WebSocketDisconnect, RuntimeError):
                break
            await _handle(agent_id, message)
    finally:
        hub.detach(agent_id, ws)
        with db.session() as conn:
            event(conn, "disconnected", agent_id)


async def _handle(agent_id: str, message) -> None:
    if not isinstance(message, dict):
        return

    kind = message.get("type")
    fuel = message.get("fuel")
    if not isinstance(fuel, int):
        fuel = None

    if kind == "heartbeat":
        with db.session() as conn:
            conn.execute(
                """
                UPDATE agents
                   SET last_seen = ?,
                       state = COALESCE(?, state),
                       pose_json = COALESCE(?, pose_json),
                       fuel = COALESCE(?, fuel),
                       inventory_json = COALESCE(?, inventory_json),
                       runtime = COALESCE(?, runtime)
                 WHERE id = ?
                """,
                (
                    now_ms(),
                    message.get("state") if isinstance(message.get("state"), str) else None,
                    dumps(message.get("pose")),
                    fuel,
                    dumps(message.get("inventory")),
                    message.get("fw"),
                    agent_id,
                ),
            )
        return

    if kind == "pong":
        with db.session() as conn:
            conn.execute("UPDATE agents SET last_seen = ? WHERE id = ?", (now_ms(), agent_id))
        return

    if kind == "event":
        with db.session() as conn:
            event(conn, str(message.get("kind") or "event"), agent_id, message.get("data"))
        return

    if kind in ("ack", "result", "progress"):
        # Phase 2 turns these into job state transitions.
        with db.session() as conn:
            event(conn, f"agent_{kind}", agent_id, message)
        return

    log.debug("unhandled message from %s: %s", agent_id, kind)
