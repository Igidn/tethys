"""SQLite access. One connection per request, WAL, no ORM."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import config

SCHEMA_VERSION = 1
SCHEMA_FILE = Path(__file__).with_name("schema.sql")


def connect() -> sqlite3.Connection:
    config.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.db_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency. Commits when the request succeeds."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init() -> None:
    """Create the schema and record its version."""
    with session() as conn:
        conn.executescript(SCHEMA_FILE.read_text())
        current = conn.execute("PRAGMA user_version").fetchone()[0]
        if current > SCHEMA_VERSION:
            raise RuntimeError(
                f"database is at schema {current}, this build only knows {SCHEMA_VERSION}"
            )
        if current < SCHEMA_VERSION:
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


def ping() -> bool:
    try:
        with session() as conn:
            conn.execute("SELECT 1").fetchone()
        return True
    except sqlite3.Error:
        return False
