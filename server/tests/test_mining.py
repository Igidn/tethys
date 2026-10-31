"""Server-side mining plan tests.

Validates the Python plan against the shared golden vectors in
agents/tests/plan_vectors.json, and tests the job lifecycle endpoints.
"""

import json
import os

import pytest

from app import mining


def _load_vectors():
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    path = os.path.join(repo_root, "agents", "tests", "plan_vectors.json")
    with open(path) as f:
        return json.load(f)


# --- Plan vectors ----------------------------------------------------------

VECTORS = _load_vectors()["vectors"]


def _mining_legs(spec):
    """Build the mining-only plan (lane-adjusted, no descent leg)."""
    ls = mining.lane_spec(spec)
    return mining.build(ls)


@pytest.mark.parametrize("vector", VECTORS, ids=lambda v: v["name"])
def test_plan_matches_golden_vector(vector):
    """The Python plan must produce the same leg sequence as the golden vector."""
    spec = vector["spec"]
    legs = _mining_legs(spec)

    # Total blocks must match.
    assert mining.total(legs) == vector["expectedTotal"], (
        f"total blocks: expected {vector['expectedTotal']}, got {mining.total(legs)}"
    )

    # Leg count must match.
    assert len(legs) == vector["expectedLegCount"], (
        f"leg count: expected {vector['expectedLegCount']}, got {len(legs)}"
    )


def test_plan_normalize_and_complete():
    spec = {
        "kind": "branchMine",
        "sector": {"x0": 0, "x1": 8, "z0": 0, "z1": 8},
        "startY": 0, "endY": -1,
        "layerStep": 1, "spacing": 4,
        "maxTripBlocks": 64, "maxVeinBlocks": 8, "reserve": 64,
    }
    legs = _mining_legs(spec)
    progress = mining.copy_progress()
    assert not mining.complete(legs, progress)
    # Advance past the first leg.
    progress["offset"] = legs[0]["length"]
    assert mining.normalize(legs, progress) is False
    # Consume the rest.
    while not mining.complete(legs, progress):
        progress["offset"] = legs[progress["leg"] - 1]["length"]
        mining.normalize(legs, progress)
    assert mining.complete(legs, progress)


def test_plan_progress_percent():
    spec = {
        "kind": "branchMine",
        "sector": {"x0": 0, "x1": 16, "z0": 0, "z1": 16},
        "startY": 0, "endY": 0,
        "layerStep": 1, "spacing": 4,
        "maxTripBlocks": 64, "maxVeinBlocks": 8, "reserve": 64,
    }
    legs = _mining_legs(spec)
    total = mining.total(legs)
    assert total > 0
    pct = mining.progress_percent(legs, {"leg": 1, "offset": 0})
    assert pct == 0.0
    pct = mining.progress_percent(legs, {"leg": 1, "offset": total})
    assert pct == 100.0


# --- Plan validation -------------------------------------------------------

def test_validate_accepts_valid_spec():
    ok, err = mining.validate({
        "kind": "branchMine",
        "sector": {"x0": 0, "x1": 16, "z0": 0, "z1": 16},
        "startY": -750, "endY": -800,
        "layerStep": 1, "spacing": 4,
        "maxTripBlocks": 64, "maxVeinBlocks": 8, "reserve": 1564,
    })
    assert ok is True, err


def test_validate_rejects_invalid():
    cases = [
        (None, "missing mission spec"),
        ("not-a-table", "missing mission spec"),
        ({"kind": "notamine"}, "unknown mission kind"),
        ({"kind": "branchMine"}, "missing sector"),
        ({"kind": "branchMine", "sector": {}}, "missing Y range"),
        ({"kind": "branchMine", "sector": {"x0": 0, "x1": 16, "z0": 0, "z1": 16},
          "startY": 10, "endY": 0}, "startY must be <= 0"),
        ({"kind": "branchMine", "sector": {"x0": 0, "x1": 16, "z0": 0, "z1": 16},
          "startY": 0, "endY": 10}, "endY must be at or below startY"),
        ({"kind": "branchMine", "sector": {"x0": 0, "x1": 0, "z0": 0, "z1": 16},
          "startY": 0, "endY": 0}, "sector is empty"),
    ]
    for spec, expected in cases:
        ok, err = mining.validate(spec)
        assert ok is False, f"spec {spec} should be invalid"
        assert expected in err, f"expected '{expected}' in '{err}'"


# --- Job lifecycle ---------------------------------------------------------

ID = "a" * 16
SECRET = "b" * 32
AGENT = {"X-Agent-Id": ID, "X-Agent-Secret": SECRET}
ADMIN = {"Authorization": "Bearer test-token"}


def enroll_and_approve(client, role: str = "mining"):
    client.post("/api/enroll", json={
        "id": ID, "secret": SECRET, "computerId": 12, "label": "turtle-1",
        "version": "0.1.0",
    })
    state = client.get("/api/state", headers=ADMIN).json()
    agent_id = state["pending"][0]["id"]
    client.post(
        f"/api/agents/{agent_id}/approve",
        json={"role": role, "config": {}},
        headers=ADMIN,
    )
    return agent_id


def test_start_job_creates_job_and_queues_command(client):
    agent_id = enroll_and_approve(client)
    spec = {
        "kind": "branchMine",
        "lane": 0, "laneCount": 1,
        "sector": {"x0": 0, "x1": 16, "z0": 0, "z1": 16},
        "startY": -750, "endY": -753,
        "layerStep": 1, "spacing": 4,
        "maxTripBlocks": 64, "maxVeinBlocks": 8, "reserve": 1564,
        "base": {"x": 0, "y": 0, "z": 0, "f": 0},
    }
    response = client.post(
        f"/api/agents/{agent_id}/jobs",
        json={"kind": "branchMine", "spec": spec},
        headers=ADMIN,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    job_id = body["jobId"]
    assert body["command"]["op"] == "startJob"
    assert body["command"]["payload"]["job"]["id"] == job_id

    # Job should be in the offered state.
    jobs = client.get("/api/jobs", headers=ADMIN).json()["jobs"]
    job = next(j for j in jobs if j["id"] == job_id)
    assert job["state"] == "offered"
    assert job["agentId"] == agent_id


def test_start_job_rejects_non_miner(client):
    agent_id = enroll_and_approve(client, role="music")
    response = client.post(
        f"/api/agents/{agent_id}/jobs",
        json={"kind": "branchMine", "spec": {}},
        headers=ADMIN,
    )
    assert response.status_code == 400


def test_abort_job(client):
    agent_id = enroll_and_approve(client)
    spec = {
        "kind": "branchMine",
        "lane": 0, "laneCount": 1,
        "sector": {"x0": 0, "x1": 16, "z0": 0, "z1": 16},
        "startY": -10, "endY": -11,
        "layerStep": 1, "spacing": 4,
        "maxTripBlocks": 64, "maxVeinBlocks": 8, "reserve": 64,
        "base": {"x": 0, "y": 0, "z": 0, "f": 0},
    }
    create = client.post(
        f"/api/agents/{agent_id}/jobs",
        json={"kind": "branchMine", "spec": spec},
        headers=ADMIN,
    )
    job_id = create.json()["jobId"]

    response = client.post(f"/api/jobs/{job_id}/abort", headers=ADMIN)
    assert response.status_code == 200
    assert response.json()["ok"] is True

    jobs = client.get("/api/jobs", headers=ADMIN).json()["jobs"]
    job = next(j for j in jobs if j["id"] == job_id)
    assert job["state"] == "failed"


def test_abort_unknown_job(client):
    response = client.post("/api/jobs/nonexistent/abort", headers=ADMIN)
    assert response.status_code == 404
