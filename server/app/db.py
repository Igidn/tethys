"""SQLite access. One connection per request, WAL, no ORM."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import config

SCHEMA_VERSION = 2
SCHEMA_FILE = Path(__file__).with_name("schema.sql")


def connect() -> sqlite3.Connection:
    config.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.db_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    # journal_mode is set once by init(); issuing it per connection needs an
    # exclusive lock and fails under concurrent writes.
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


def _migrate(conn: sqlite3.Connection, current: int) -> None:
    """Additive migrations. Never drop a column or a table here."""
    if current < 2:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(commands)")}
        if "sent_at" not in columns:
            conn.execute("ALTER TABLE commands ADD COLUMN sent_at INTEGER")
        if "result_json" not in columns:
            conn.execute("ALTER TABLE commands ADD COLUMN result_json TEXT")


def init() -> None:
    """Create the schema and record its version."""
    with session() as conn:
        conn.executescript(SCHEMA_FILE.read_text())
        current = conn.execute("PRAGMA user_version").fetchone()[0]
        if current > SCHEMA_VERSION:
            raise RuntimeError(
                f"database is at schema {current}, this build only knows {SCHEMA_VERSION}"
            )
        _migrate(conn, current)
        if current < SCHEMA_VERSION:
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


def ping() -> bool:
    try:
        with session() as conn:
            conn.execute("SELECT 1").fetchone()
        return True
    except sqlite3.Error:
        return False
