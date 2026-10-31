"""Test environment. Must run before app.config is imported."""

import os

os.environ["ADMIN_TOKEN"] = "test-token"
os.environ["CHECK_TUNNEL"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import config  # noqa: E402
from app.main import app  # noqa: E402

TOKEN = "test-token"
ADMIN = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "data_dir", tmp_path)
    monkeypatch.setattr(config, "check_tunnel", False)
    with TestClient(app) as test_client:
        yield test_client
