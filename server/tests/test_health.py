import sqlite3

from fastapi.testclient import TestClient

from app import db
from app.config import config
from app.main import app


def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(config, "data_dir", tmp_path)
    monkeypatch.setattr(config, "check_tunnel", False)
    return TestClient(app)


def test_health_reports_ok(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["service"] == "tethys"
    assert body["database"]["schema"] == db.SCHEMA_VERSION
    assert (tmp_path / "tethys.db").exists()


def test_schema_is_created_once(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch):
        pass
    with _client(tmp_path, monkeypatch):
        pass

    with sqlite3.connect(tmp_path / "tethys.db") as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        version = conn.execute("PRAGMA user_version").fetchone()[0]

    assert {
        "agents",
        "jobs",
        "commands",
        "events",
        "releases",
        "playlists",
    } <= tables
    assert version == db.SCHEMA_VERSION


def test_unknown_path_does_not_shadow_api(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/does-not-exist")

    assert response.status_code == 404
