"""Agent WebSocket hub: authentication, commands, heartbeat, and tracking."""

from __future__ import annotations

import asyncio
import logging
import sqlite3

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import commands, db
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
        self._send_lock = asyncio.Lock()

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

    def notify(self, agent_id: str) -> None:
        """Ask a connected machine to pick up newly queued work now."""
        if agent_id in self._connections and self._loop is not None:
            asyncio.run_coroutine_threadsafe(self.flush(agent_id), self._loop)

    async def flush(self, agent_id: str) -> None:
        """Send every due command, in order, to a connected machine."""
        ws = self._connections.get(agent_id)
        if ws is None:
            return

        try:
            with db.session() as conn:
                rows = commands.due(conn, agent_id)
                commands.mark_sent(conn, rows)
        except sqlite3.OperationalError as error:
            # Another writer holds the database briefly. Nothing was marked,
            # so the next sweep will pick the same commands up.
            log.warning("command flush deferred for %s: %s", agent_id, error)
            return

        for row in rows:
            try:
                async with self._send_lock:
                    await ws.send_json(commands.envelope(row))
            except Exception:
                self.detach(agent_id, ws)
                return

    async def _sweep_loop(self) -> None:
        interval = max(2.0, config.stale_ms / 2000)
        while True:
            await asyncio.sleep(interval)
            for agent_id in self.online_ids:
                try:
                    await self.flush(agent_id)
                except Exception:
                    log.exception("command flush failed for %s", agent_id)
            self._mark_stale()

    def _mark_stale(self) -> None:
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

    # Anything queued while the machine was offline goes out before it idles.
    await hub.flush(agent_id)

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
            await _handle(agent_id, message, ws)
    finally:
        hub.detach(agent_id, ws)
        with db.session() as conn:
            event(conn, "disconnected", agent_id)


async def _handle(agent_id: str, message, ws: WebSocket) -> None:
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

    if kind == "result" and message.get("missionId"):
        # Phase 3: a job result from the miner (done / paused / failed).
        job_id = str(message.get("missionId") or "")
        status = str(message.get("status") or "failed")
        with db.session() as conn:
            row = conn.execute(
                "SELECT * FROM jobs WHERE id = ? AND agent_id = ?",
                (job_id, agent_id),
            ).fetchone()
            if row:
                conn.execute(
                    """
                    UPDATE jobs
                       SET state = ?,
                           stats_json = ?,
                           progress_json = ?,
                           updated_at = ?
                     WHERE id = ?
                    """,
                    (
                        status,
                        dumps(message.get("stats")),
                        dumps(message.get("progress")),
                        now_ms(),
                        job_id,
                    ),
                )
                event(
                    conn,
                    f"job_{status}",
                    agent_id,
                    {"id": job_id, "status": status, "error": message.get("error")},
                )
        return

    if kind in ("ack", "result"):
        command_id = str(message.get("id") or "")
        status = str(message.get("status") or ("ok" if kind == "result" else ""))
        with db.session() as conn:
            row = commands.ack(conn, agent_id, command_id, status, message.get("result"))
            if row is not None and row["op"] == "wipe" and row["state"] == "done":
                conn.execute(
                    "UPDATE agents SET status = 'removed', pairing_code = NULL WHERE id = ?",
                    (agent_id,),
                )
                event(conn, "removed", agent_id, {"reason": "wiped"})
        if row is not None and row["op"] == "wipe" and row["state"] == "done":
            await _safe_close(ws, 4003, "removed")
        return

    if kind == "progress":
        # Phase 3: update the active job's progress and stats.
        job_id = message.get("missionId") or message.get("jobId")
        if job_id:
            with db.session() as conn:
                row = conn.execute(
                    "SELECT * FROM jobs WHERE id = ? AND agent_id = ?",
                    (job_id, agent_id),
                ).fetchone()
                if row:
                    conn.execute(
                        """
                        UPDATE jobs
                           SET progress_json = ?,
                               stats_json = ?,
                               updated_at = ?
                         WHERE id = ?
                        """,
                        (
                            dumps(message.get("progress")),
                            dumps(message.get("stats")),
                            now_ms(),
                            job_id,
                        ),
                    )
                    event(
                        conn,
                        "job_progress",
                        agent_id,
                        {"id": job_id, "progress": message.get("progress")},
                    )
        else:
            # Legacy: keep the raw event.
            event(conn, "agent_progress", agent_id, message)
        return

    log.debug("unhandled message from %s: %s", agent_id, kind)
