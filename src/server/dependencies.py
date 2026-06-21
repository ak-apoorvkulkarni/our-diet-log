"""FastAPI dependencies."""

from __future__ import annotations

from fastapi import HTTPException, Request

from server.sessions import SESSION_COOKIE, get_session_user


def session_id_from_request(request: Request) -> str | None:
    cookie = request.cookies.get(SESSION_COOKIE)
    if cookie:
        return cookie
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        return token or None
    return None


def current_user(request: Request) -> dict | None:
    return get_session_user(session_id_from_request(request))


def require_user(request: Request) -> dict:
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
