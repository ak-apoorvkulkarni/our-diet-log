"""Optional bootstrap users from environment variables."""

from __future__ import annotations

import os

from server import users as user_repo


def bootstrap_users_from_env() -> None:
    """AHAR_BOOTSTRAP_USERS=user1:password1,user2:password2"""
    raw = os.environ.get("AHAR_BOOTSTRAP_USERS", "").strip()
    if not raw:
        return
    for part in raw.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        username, password = part.split(":", 1)
        username = username.strip()
        password = password.strip()
        if not username or not password:
            continue
        if user_repo.get_user_by_username(username):
            continue
        try:
            user_repo.create_user(username, password, username)
            print(f"Bootstrap user created: {username}")
        except ValueError as exc:
            print(f"Bootstrap skip {username}: {exc}")
