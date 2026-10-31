"""Agent and admin authentication."""

from __future__ import annotations

import hashlib
import hmac
import sqlite3

from fastapi import Depends, Header, HTTPException

from .config import config
from .db import get_db


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def verify_secret(secret: str, stored: str | None) -> bool:
    if not secret or not stored:
        return False
    return hmac.compare_digest(hash_secret(secret), stored)


def require_agent(
    x_agent_id: str | None = Header(default=None, alias="X-Agent-Id"),
    x_agent_secret: str | None = Header(default=None, alias="X-Agent-Secret"),
    conn: sqlite3.Connection = Depends(get_db),
) -> sqlite3.Row:
    if not x_agent_id or not x_agent_secret:
        raise HTTPException(status_code=401, detail="missing agent credentials")

    row = conn.execute("SELECT * FROM agents WHERE id = ?", (x_agent_id,)).fetchone()
    if row is None or not verify_secret(x_agent_secret, row["secret_hash"]):
        raise HTTPException(status_code=401, detail="invalid agent credentials")
    return row


def require_admin(authorization: str | None = Header(default=None)) -> None:
    if not config.admin_token:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    if not hmac.compare_digest(authorization[7:].strip(), config.admin_token):
        raise HTTPException(status_code=401, detail="invalid token")
