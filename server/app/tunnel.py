"""OpenTunnel route discovery and verification.

The route is expected to already exist and to point at our port. We never create
a second route: reusing the route keeps the public hostname stable, which is what
the CC:T allowlist and the published server.json depend on.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass, field

ARROW = "\u2192"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"}


@dataclass
class Tunnel:
    url: str | None = None
    host: str | None = None
    target: str | None = None
    verified: bool = False
    source: str = "none"
    detail: str = ""
    routes: list[tuple[str, str]] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "url": self.url,
            "host": self.host,
            "target": self.target,
            "verified": self.verified,
            "source": self.source,
            "detail": self.detail,
            "routes": [{"host": h, "target": t} for h, t in self.routes],
        }


def _run(args: list[str]) -> tuple[bool, str]:
    if not shutil.which("opentunnel"):
        return False, "opentunnel is not on PATH"
    try:
        done = subprocess.run(
            ["opentunnel", *args],
            capture_output=True,
            text=True,
            timeout=45,
        )
    except (subprocess.TimeoutExpired, OSError) as error:
        return False, str(error)
    return done.returncode == 0, f"{done.stdout}\n{done.stderr}".strip()


def parse_routes(text: str) -> list[tuple[str, str]]:
    routes: list[tuple[str, str]] = []
    for line in text.splitlines():
        if ARROW not in line:
            continue
        host, _, target = line.partition(ARROW)
        host, target = host.strip(), target.strip()
        if host and target:
            routes.append((host, target))
    return routes


def targets_port(target: str, port: int) -> bool:
    host, _, port_text = target.rpartition(":")
    if not port_text.isdigit() or int(port_text) != port:
        return False
    return not host or host.strip("[]") in LOCAL_HOSTS


def status() -> tuple[list[tuple[str, str]], str]:
    ok, output = _run(["status"])
    return (parse_routes(output) if ok else []), ("" if ok else output)


def ensure(port: int, public_url: str = "") -> Tunnel:
    """Return the public URL and whether a route actually points at `port`."""
    routes, detail = status()
    match = next((route for route in routes if targets_port(route[1], port)), None)

    if public_url:
        host = match[0] if match else None
        return Tunnel(
            url=public_url.rstrip("/"),
            host=host,
            target=match[1] if match else None,
            verified=match is not None,
            source="config",
            detail="" if match else f"no opentunnel route targets port {port}: {detail}",
            routes=routes,
        )

    if match:
        return Tunnel(
            url=f"https://{match[0]}",
            host=match[0],
            target=match[1],
            verified=True,
            source="discovered",
            routes=routes,
        )

    ok, output = _run(["route", "add", f"127.0.0.1:{port}"])
    if ok:
        routes = parse_routes(output) or status()[0]
        match = next((route for route in routes if targets_port(route[1], port)), None)
        if match:
            return Tunnel(
                url=f"https://{match[0]}",
                host=match[0],
                target=match[1],
                verified=True,
                source="created",
                routes=routes,
            )

    return Tunnel(
        detail=output or detail or "no tunnel found",
        routes=routes,
    )
