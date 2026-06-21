"""Authentication API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from server import users as user_repo
from server.dependencies import require_user
from server.sessions import SESSION_COOKIE, create_session, delete_session, session_days

router = APIRouter(tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=3)
    password: str = Field(min_length=8)
    remember_me: bool = True


class RegisterIn(BaseModel):
    username: str = Field(min_length=3)
    password: str = Field(min_length=8)
    display_name: str = ""
    remember_me: bool = True


def _set_session_cookie(response: Response, session_id: str, remember_me: bool) -> None:
    days = session_days(remember_me)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        max_age=days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE, path="/")


def _login_user(user: dict, response: Response, remember_me: bool) -> dict:
    days = session_days(remember_me)
    session_id = create_session(user["id"], days=days)
    _set_session_cookie(response, session_id, remember_me)
    return {"ok": True, "user": user}


@router.post("/api/auth/login")
def api_login(body: LoginIn, response: Response) -> dict:
    user = user_repo.authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return _login_user(user, response, body.remember_me)


@router.post("/api/auth/register")
def api_register(body: RegisterIn, response: Response) -> dict:
    try:
        user = user_repo.create_user(body.username, body.password, body.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _login_user(user, response, body.remember_me)


@router.post("/api/auth/logout")
def api_logout(request: Request, response: Response) -> dict:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        delete_session(session_id)
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/api/auth/me")
def api_me(user: dict = Depends(require_user)) -> dict:
    full = user_repo.get_user_by_id(user["id"])
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": (full or {}).get("display_name") or user["username"],
        "household_id": (full or {}).get("household_id"),
    }


@router.delete("/api/auth/me")
def api_delete_account(user: dict = Depends(require_user)) -> dict:
    from server import repository as repo

    uid = user["id"]
    hid = repo.load_user_household_id_from_profile(uid)
    partner = repo.partner_uid_from_household(hid, uid) if hid else None
    if partner:
        raise HTTPException(
            status_code=400,
            detail="Remove your partner or leave the household before deleting your account.",
        )
    if hid and hid == repo.household_id_for_user(uid):
        repo.delete_household(hid)
    repo.delete_user_data(uid)
    user_repo.delete_user_account(uid)
    return {"ok": True}
