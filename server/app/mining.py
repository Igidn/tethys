"""Server-side mining plan.

Mirrors agents/mining/plan.lua (and the Lua plan.lua) so the server can
generate and validate branch-mine plans identically to the turtle. Both
implementations must produce the same leg sequence for the same spec; the
shared golden vectors in agents/tests/plan_vectors.json pin this down.
"""

from __future__ import annotations

from typing import Any

DX = {0: 0, 1: 1, 2: 0, 3: -1}
DZ = {0: -1, 1: 0, 2: 1, 3: 0}

HARD = {
    "maxDepth": 2000,
    "maxWidth": 1024,
}


def _add_line(legs: list[dict[str, Any]], dir_: int, length: int,
              layer: int, strip: int) -> None:
    if length > 0:
        legs.append({
            "kind": "line",
            "dir": dir_,
            "length": length,
            "layer": layer,
            "strip": strip,
        })


def build(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Build a deterministic serpentine branch-mine plan.

    The plan is base-relative: it starts at (0, 0, 0) facing north. The first
    leg descends `startY` blocks (if startY < 0), then walks to the sector
    corner, then mines serpentine layers.
    """
    sector = spec.get("sector") or {}
    x0 = sector.get("x0", 0)
    x1 = sector.get("x1", 0)
    z0 = sector.get("z0", 0)
    z1 = sector.get("z1", 0)
    legs: list[dict[str, Any]] = []

    start_y = spec.get("startY", 0)
    if start_y < 0:
        legs.append({
            "kind": "down",
            "dir": 0,
            "length": -start_y,
            "layer": 0,
            "strip": 0,
        })

    if x0 < 0:
        _add_line(legs, 3, -x0, 0, 0)  # west
    elif x0 > 0:
        _add_line(legs, 1, x0, 0, 0)  # east
    if z0 < 0:
        _add_line(legs, 0, -z0, 0, 0)  # north
    elif z0 > 0:
        _add_line(legs, 2, z0, 0, 0)  # south

    width = x1 - x0
    spacing = spec.get("spacing", 4)
    strips = (z1 - z0) // spacing + 1
    y = start_y
    layer = 0
    z_dir = 1
    x_dir = 1  # east; flips every strip

    while y >= spec.get("endY", 0):
        for strip in range(strips):
            _add_line(legs, x_dir, width, layer, strip)
            x_dir = 3 if x_dir == 1 else 1
            if strip < strips - 1:
                connector_dir = 2 if z_dir == 1 else 0
                _add_line(legs, connector_dir, spacing, layer, strip)

        layer_step = spec.get("layerStep", 1)
        if y - layer_step < spec.get("endY", 0):
            break
        legs.append({
            "kind": "down",
            "dir": 0,
            "length": layer_step,
            "layer": layer,
            "strip": strips - 1,
        })
        y -= layer_step
        z_dir = -z_dir
        layer += 1

    return legs


def total(legs: list[dict[str, Any]]) -> int:
    return sum(leg["length"] for leg in legs)


def blocks_before(legs: list[dict[str, Any]], leg_index: int) -> int:
    return sum(
        legs[i]["length"]
        for i in range(min(leg_index - 1, len(legs)))
    )


def progress_percent(legs: list[dict[str, Any]],
                     progress: dict[str, int]) -> float:
    tot = total(legs)
    if tot == 0:
        return 100.0
    done = blocks_before(legs, progress.get("leg", 1)) + max(
        0, progress.get("offset", 0)
    )
    return min(100.0, (done / tot) * 100.0)


def copy_progress(p: dict[str, int] | None = None) -> dict[str, int]:
    p = p or {}
    return {
        "leg": p.get("leg", 1),
        "offset": p.get("offset", 0),
        "layer": p.get("layer", 0),
        "strip": p.get("strip", 0),
    }


def normalize(legs: list[dict[str, Any]],
              progress: dict[str, int]) -> bool:
    """Advance past complete legs. Returns True when the whole plan is done."""
    while progress["leg"] <= len(legs):
        leg = legs[progress["leg"] - 1]
        if progress["offset"] < leg["length"]:
            progress["layer"] = leg["layer"]
            progress["strip"] = leg["strip"]
            return False
        progress["leg"] += 1
        progress["offset"] = 0
    return True


def complete(legs: list[dict[str, Any]],
             progress: dict[str, int]) -> bool:
    return progress["leg"] > len(legs)


def validate(spec: dict[str, Any], hard: dict[str, Any] | None = None):
    """Validate a mining spec. Returns (ok, error_message)."""
    hard = hard or HARD
    if not isinstance(spec, dict):
        return False, "missing mission spec"
    if spec.get("kind") != "branchMine":
        return False, "unknown mission kind"
    if not isinstance(spec.get("sector"), dict):
        return False, "missing sector"
    if not isinstance(spec.get("startY"), (int, float)) or \
            not isinstance(spec.get("endY"), (int, float)):
        return False, "missing Y range"
    if spec["startY"] > 0:
        return False, "startY must be <= 0 (base is y=0)"
    if spec["endY"] > spec["startY"]:
        return False, "endY must be at or below startY"
    width = spec["sector"].get("x1", 0) - spec["sector"].get("x0", 0)
    depth = spec["sector"].get("z1", 0) - spec["sector"].get("z0", 0)
    if width < 1 or depth < 1:
        return False, "sector is empty"
    if width > hard["maxWidth"] or depth > hard["maxWidth"]:
        return False, "sector exceeds local cap"
    if spec["startY"] < 0 and -spec["endY"] > hard["maxDepth"]:
        return False, "depth exceeds local cap"
    layer_step = spec.get("layerStep", 1)
    if not isinstance(layer_step, (int, float)) or layer_step < 1:
        return False, "layerStep must be >= 1"
    spacing = spec.get("spacing", 4)
    if not isinstance(spacing, (int, float)) or spacing < 2:
        return False, "spacing must be >= 2"
    max_trip = spec.get("maxTripBlocks", 64)
    if not isinstance(max_trip, (int, float)) or max_trip < 1:
        return False, "maxTripBlocks must be >= 1"
    max_vein = spec.get("maxVeinBlocks", 8)
    if not isinstance(max_vein, (int, float)) or max_vein < 0:
        return False, "maxVeinBlocks must be >= 0"
    reserve = spec.get("reserve", 64)
    if not isinstance(reserve, (int, float)) or reserve < 0:
        return False, "reserve must be >= 0"
    return True, None


def lane_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """Compute the lane-adjusted spec for the mining plan.

    Lanes split the X range; all lanes share the same Z range. Returns a spec
    with a sector relative to the lane's descent point (x0=0), startY=0 (the
    descent is handled separately by the miner), and endY as the relative
    depth below the mining level.
    """
    sector = spec.get("sector") or {}
    lane = spec.get("lane", 0)
    lane_count = spec.get("laneCount", 1)
    if lane_count < 1:
        lane_count = 1
    if lane < 0:
        lane = 0
    if lane >= lane_count:
        lane = lane_count - 1

    width = sector.get("x1", 0) - sector.get("x0", 0)
    lane_width = width // lane_count
    x0 = sector.get("x0", 0) + lane * lane_width
    x1 = sector.get("x1", 0) if lane == lane_count - 1 else x0 + lane_width
    if x1 < x0 + 1:
        x1 = x0 + 1

    start_y = spec.get("startY", 0)
    end_y = spec.get("endY", 0)

    return {
        "kind": spec.get("kind", "branchMine"),
        "sector": {
            "x0": 0,
            "x1": x1 - x0,
            "z0": 0,
            "z1": sector.get("z1", 0) - sector.get("z0", 0),
        },
        "startY": 0,
        "endY": end_y - start_y,
        "layerStep": spec.get("layerStep", 1),
        "spacing": spec.get("spacing", 4),
        "maxTripBlocks": spec.get("maxTripBlocks", 64),
        "maxVeinBlocks": spec.get("maxVeinBlocks", 8),
        "reserve": spec.get("reserve", 64),
        "base": {"x": 0, "y": 0, "z": 0, "f": 0},
    }

