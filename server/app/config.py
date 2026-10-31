"""Configuration loaded from server/.env, with the shell environment winning."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_DIR.parent

_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def load_env_file(path: Path) -> None:
    """Minimal .env reader. Values already in os.environ are not overwritten."""
    try:
        text = path.read_text()
    except OSError:
        return

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        key = key.strip()
        if not sep or not _KEY.match(key):
            continue
        if key in os.environ:
            continue

        value = value.strip()
        if len(value) >= 2 and value[0] in "\"'" and value[-1] == value[0]:
            value = value[1:-1]
        else:
            value = re.sub(r"\s+#.*$", "", value).strip()
        os.environ[key] = value


def _int(key: str, fallback: int) -> int:
    try:
        return int(os.environ[key])
    except (KeyError, ValueError):
        return fallback


def _bool(key: str, fallback: bool) -> bool:
    value = os.environ.get(key)
    if value is None:
        return fallback
    return value.strip().lower() not in ("0", "false", "no", "off", "")


def _version() -> str:
    try:
        return (SERVER_DIR / "VERSION").read_text().strip()
    except OSError:
        return "0.0.0"


load_env_file(SERVER_DIR / ".env")


@dataclass
class Config:
    host: str
    port: int
    admin_token: str
    public_url: str
    github_repo: str
    live_tag: str
    data_dir: Path
    heartbeat_ms: int
    stale_ms: int
    command_retry_ms: int
    event_retention_days: int
    check_tunnel: bool
    version: str

    @property
    def db_path(self) -> Path:
        return self.data_dir / "tethys.db"


config = Config(
    host=os.environ.get("HOST", "127.0.0.1"),
    port=_int("PORT", 3000),
    admin_token=os.environ.get("ADMIN_TOKEN", ""),
    public_url=os.environ.get("PUBLIC_URL", "").rstrip("/"),
    github_repo=os.environ.get("GITHUB_REPO", "Igidn/tethys"),
    live_tag=os.environ.get("LIVE_TAG", "live"),
    data_dir=(SERVER_DIR / os.environ.get("DATA_DIR", "data")).resolve(),
    heartbeat_ms=_int("HEARTBEAT_MS", 5000),
    stale_ms=_int("STALE_MS", 20000),
    command_retry_ms=_int("COMMAND_RETRY_MS", 8000),
    event_retention_days=_int("EVENT_RETENTION_DAYS", 14),
    check_tunnel=_bool("CHECK_TUNNEL", True),
    version=_version(),
)
