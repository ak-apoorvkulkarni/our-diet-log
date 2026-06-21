"""REST API for app state, households, invites, and meal images."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import repository as repo
from server import users as user_repo
from server.dependencies import require_user

router = APIRouter(tags=["api"])


class ProfileIn(BaseModel):
    household_id: str | None = None
    display_name: str | None = None


class StateIn(BaseModel):
    household_id: str
    state: dict[str, Any]


class InviteIn(BaseModel):
    to_username: str = Field(min_length=3)


class MealImageIn(BaseModel):
    data_url: str


class RemovePartnerIn(BaseModel):
    partner_uid: str


@router.get("/api/users/me/profile")
def get_profile(user: dict = Depends(require_user)) -> dict:
    full = user_repo.get_user_by_id(user["id"])
    return {
        "household_id": (full or {}).get("household_id"),
        "display_name": (full or {}).get("display_name") or user["username"],
    }


@router.put("/api/users/me/profile")
def put_profile(body: ProfileIn, user: dict = Depends(require_user)) -> dict:
    user_repo.update_user_profile(
        user["id"],
        household_id=body.household_id,
        display_name=body.display_name,
    )
    return {"ok": True}


@router.get("/api/users/me/state")
def get_my_state(user: dict = Depends(require_user)) -> dict:
    state = repo.load_user_state(user["id"])
    return {"state": state}


@router.put("/api/users/me/state")
def put_my_state(body: StateIn, user: dict = Depends(require_user)) -> dict:
    repo.ensure_household_exists(body.household_id, user["id"])
    repo.save_user_state(user["id"], body.household_id, body.state)
    if body.state.get("users"):
        name = ""
        for u in body.state["users"]:
            if u.get("id") == "u1" and u.get("name"):
                name = str(u["name"])
                break
        if name:
            user_repo.update_user_profile(user["id"], display_name=name)
    return {"ok": True}


@router.get("/api/users/{uid}/state")
def get_user_state(uid: str, user: dict = Depends(require_user)) -> dict:
    try:
        repo.assert_can_read_user_state(user["id"], uid)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"state": repo.load_user_state(uid)}


@router.get("/api/households/{household_id}")
def get_household(household_id: str, user: dict = Depends(require_user)) -> dict:
    meta = repo.load_household_meta(household_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Household not found")
    if not repo._user_in_household(meta, user["id"]):
        raise HTTPException(status_code=403, detail="Not a household member")
    return meta


@router.post("/api/households/{household_id}/ensure")
def ensure_household(household_id: str, user: dict = Depends(require_user)) -> dict:
    try:
        repo.ensure_household_exists(household_id, user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/api/households/{household_id}/legacy-state")
def get_legacy_state(household_id: str, user: dict = Depends(require_user)) -> dict:
    meta = repo.load_household_meta(household_id)
    if meta and not repo._user_in_household(meta, user["id"]):
        raise HTTPException(status_code=403, detail="Not a household member")
    return {"state": repo.load_household_state(household_id)}


@router.get("/api/households/{household_id}/partner")
def get_partner(household_id: str, user: dict = Depends(require_user)) -> dict:
    uid = repo.partner_uid_from_household(household_id, user["id"])
    return {"partner_uid": uid}


@router.post("/api/households/{household_id}/invites")
def post_invite(household_id: str, body: InviteIn, user: dict = Depends(require_user)) -> dict:
    meta = repo.load_household_meta(household_id)
    if not meta or not repo._user_in_household(meta, user["id"]):
        raise HTTPException(status_code=403, detail="Not a household member")
    token = repo.create_invite(household_id, user["id"], body.to_username)
    return {"token": token}


@router.post("/api/invites/{token}/accept")
def accept_invite_route(token: str, user: dict = Depends(require_user)) -> dict:
    try:
        household_id = repo.accept_invite(
            token,
            user["id"],
            user.get("display_name") or user["username"],
            user["username"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"household_id": household_id}


@router.post("/api/households/{household_id}/partners/remove")
def remove_partner_route(
    household_id: str, body: RemovePartnerIn, user: dict = Depends(require_user)
) -> dict:
    try:
        repo.remove_partner(household_id, user["id"], body.partner_uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.put("/api/users/me/meals/{meal_id}/image")
def put_meal_image(meal_id: str, body: MealImageIn, user: dict = Depends(require_user)) -> dict:
    try:
        repo.save_meal_image(user["id"], meal_id, body.data_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/api/users/{uid}/meals/{meal_id}/image")
def get_meal_image(uid: str, meal_id: str, user: dict = Depends(require_user)) -> dict:
    try:
        repo.assert_can_read_user_state(user["id"], uid)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    data_url = repo.load_meal_image(uid, meal_id)
    if not data_url:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"data_url": data_url}


@router.delete("/api/users/me/meals/{meal_id}/image")
def delete_meal_image_route(meal_id: str, user: dict = Depends(require_user)) -> dict:
    repo.delete_meal_image(user["id"], meal_id)
    return {"ok": True}


@router.delete("/api/users/me/meal-images")
def delete_all_meal_images(user: dict = Depends(require_user)) -> dict:
    repo.delete_all_meal_images(user["id"])
    return {"ok": True}
