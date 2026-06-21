"""FastAPI dependencies."""

from __future__ import annotations

from fastapi import HTTPException, Request

from server.sessions import SESSION_COOKIE, get_session_user


def current_user(request: Request) -> dict | None:
    return get_session_user(request.cookies.get(SESSION_COOKIE))


def require_user(request: Request) -> dict:
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
