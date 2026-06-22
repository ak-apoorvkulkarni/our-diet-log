"""FastAPI application — static site + REST API + SQLite."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

import server.config  # noqa: F401
from server.api_routes import router as api_router
from server.auth_routes import router as auth_router
from server.bootstrap import bootstrap_users_from_env
from server.db import db_status, init_db

ROOT = Path(__file__).resolve().parents[2]

app = FastAPI(title="Ahar Tracker", version="1.0.0")


class NoCacheJsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/js/") or path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response


app.add_middleware(NoCacheJsMiddleware)
app.include_router(auth_router)
app.include_router(api_router)


@app.on_event("startup")
def on_startup() -> None:
    (ROOT / "data").mkdir(parents=True, exist_ok=True)
    init_db()
    bootstrap_users_from_env()


@app.get("/api/health")
def health() -> dict:
    status = db_status()
    return {"ok": True, "service": "ahar-tracker", **status}


@app.get("/health", response_model=None)
def health_plain() -> FileResponse:
    return FileResponse(ROOT / "health", media_type="text/plain")


# Static assets — API routes registered above take precedence.
for sub in ("css", "js", "assets"):
    mount = ROOT / sub
    if mount.is_dir():
        app.mount(f"/{sub}", StaticFiles(directory=str(mount)), name=sub)


@app.get("/", response_model=None)
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/{full_path:path}", response_model=None)
def spa_fallback(full_path: str) -> FileResponse | JSONResponse:
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    candidate = ROOT / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(ROOT / "index.html")
