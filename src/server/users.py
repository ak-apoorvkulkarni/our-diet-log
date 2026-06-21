"""User account operations."""

from __future__ import annotations

from server.auth import new_user_record, verify_password
from server.db import get_connection


def count_users() -> int:
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    return int(row["n"]) if row else 0


def get_user_by_username(username: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? AND is_active = 1",
            (username.strip().lower(),),
        ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ? AND is_active = 1",
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user.get("display_name") or user["username"],
        "household_id": user.get("household_id"),
    }


def create_user(username: str, plain_password: str, display_name: str = "") -> dict:
    if get_user_by_username(username):
        raise ValueError("Username already taken")
    if len(plain_password) < 6:
        raise ValueError("Password must be at least 6 characters")
    record = new_user_record(username, plain_password, display_name)
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO users (id, username, password_hash, display_name, household_id, created_at, is_active)
               VALUES (:id, :username, :password_hash, :display_name, :household_id, :created_at, :is_active)""",
            record,
        )
        conn.commit()
    return _public_user(record)


def authenticate_user(username: str, plain_password: str) -> dict | None:
    user = get_user_by_username(username)
    if not user:
        return None
    if not verify_password(plain_password, user["password_hash"]):
        return None
    return _public_user(user)


def update_user_profile(user_id: str, *, household_id: str | None = None, display_name: str | None = None) -> None:
    patches: list[str] = []
    values: list[object] = []
    if household_id is not None:
        patches.append("household_id = ?")
        values.append(household_id)
    if display_name is not None:
        patches.append("display_name = ?")
        values.append(display_name)
    if not patches:
        return
    values.append(user_id)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE users SET {', '.join(patches)} WHERE id = ? AND is_active = 1",
            values,
        )
        conn.commit()


def delete_user_account(user_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM meal_images WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM user_state WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()


def delete_user_by_username(username: str) -> dict | None:
    user = get_user_by_username(username)
    if not user:
        return None
    delete_user_account(user["id"])
    return {"id": user["id"], "username": user["username"]}
