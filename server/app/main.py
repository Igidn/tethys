"""Tethys control plane entry point."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .api import router as api_router
from .config import REPO_ROOT, config
from .enroll import router as enroll_router
from .hub import hub
from .hub import router as ws_router
from .tunnel import ensure as ensure_tunnel

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tethys")

DIST = REPO_ROOT / "client" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    log.info("database %s (schema %d)", config.db_path, db.SCHEMA_VERSION)

    if config.check_tunnel:
        tunnel = ensure_tunnel(config.port, config.public_url)
        app.state.tunnel = tunnel
        if tunnel.verified:
            log.info("tunnel %s -> %s", tunnel.url, tunnel.target)
        elif tunnel.url:
            log.warning(
                "tunnel %s has no route to port %d: %s",
                tunnel.url,
                config.port,
                tunnel.detail,
            )
        else:
            log.warning("no tunnel: %s", tunnel.detail)
    else:
        app.state.tunnel = None

    if not config.admin_token:
        log.warning("ADMIN_TOKEN is empty: admin endpoints are unauthenticated")

    await hub.start()
    log.info("hub started")

    yield

    await hub.stop()


app = FastAPI(title="Tethys", version=config.version, lifespan=lifespan)

app.include_router(enroll_router)
app.include_router(api_router)
app.include_router(ws_router)


@app.get("/health")
def health(request: Request):
    ok = db.ping()
    tunnel = getattr(request.app.state, "tunnel", None)
    body = {
        "ok": ok,
        "service": "tethys",
        "version": config.version,
        "serverTime": int(time.time() * 1000),
        "database": {
            "path": str(config.db_path),
            "schema": db.SCHEMA_VERSION,
            "ok": ok,
        },
        "tunnel": tunnel.as_dict() if tunnel else None,
    }
    return JSONResponse(body, status_code=200 if ok else 503)


if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def dashboard(path: str):
    """Serve the built dashboard, with an SPA fallback. Never shadows /api."""
    if path.startswith(("api/", "ws")):
        raise HTTPException(status_code=404)

    index = DIST / "index.html"
    if not index.is_file():
        return JSONResponse(
            {
                "service": "tethys",
                "version": config.version,
                "message": "dashboard not built: cd client && npm run build",
            }
        )

    if path:
        candidate = (DIST / path).resolve()
        if candidate.is_file() and DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
    return FileResponse(index)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.host, port=config.port)
