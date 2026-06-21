"""Password hashing for server login."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import bcrypt


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False


def new_user_record(username: str, plain_password: str, display_name: str = "") -> dict:
    return {
        "id": str(uuid4()),
        "username": username.strip().lower(),
        "password_hash": hash_password(plain_password),
        "display_name": display_name.strip() or username.strip(),
        "household_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": 1,
    }
