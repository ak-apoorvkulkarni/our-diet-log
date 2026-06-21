"""Session management for cookie-based login."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from server.db import get_connection

SESSION_COOKIE = "ahar_session"
SESSION_DAYS_DEFAULT = 7
SESSION_DAYS_REMEMBER = 30


def session_days(remember_me: bool) -> int:
    return SESSION_DAYS_REMEMBER if remember_me else SESSION_DAYS_DEFAULT


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_session(user_id: str, days: int = SESSION_DAYS_DEFAULT) -> str:
    session_id = str(uuid4())
    created = _now()
    expires = created + timedelta(days=days)
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO sessions (id, user_id, expires_at, created_at)
               VALUES (?, ?, ?, ?)""",
            (session_id, user_id, expires.isoformat(), created.isoformat()),
        )
        conn.commit()
    return session_id


def get_session_user(session_id: str | None) -> dict | None:
    if not session_id:
        return None
    with get_connection() as conn:
        row = conn.execute(
            """SELECT s.id AS session_id, s.expires_at, u.id, u.username, u.display_name, u.household_id
               FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.id = ? AND u.is_active = 1""",
            (session_id,),
        ).fetchone()
    if not row:
        return None
    expires = datetime.fromisoformat(row["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if _now() > expires:
        delete_session(session_id)
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"] or row["username"],
        "household_id": row["household_id"],
        "session_id": row["session_id"],
    }


def delete_session(session_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()


def delete_user_sessions(user_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
