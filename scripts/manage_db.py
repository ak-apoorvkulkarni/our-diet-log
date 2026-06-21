#!/usr/bin/env python3
"""Admin CLI — create and list user accounts (registration is disabled in the app)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import server.config  # noqa: F401 — load .env
from server.bootstrap import bootstrap_users_from_env
from server.db import get_db_path, init_db
from server import users as user_repo


def cmd_init(_: argparse.Namespace) -> int:
    init_db()
    print(f"Database ready: {get_db_path().resolve()}")
    print(f"Users: {user_repo.count_users()}")
    return 0


def cmd_bootstrap(_: argparse.Namespace) -> int:
    init_db()
    bootstrap_users_from_env()
    print(f"Total users: {user_repo.count_users()}")
    return 0


def cmd_create_user(args: argparse.Namespace) -> int:
    init_db()
    name = args.display_name or args.username
    try:
        user = user_repo.create_user(args.username, args.password, name)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"Created user: {user['username']}")
    print(f"  id:           {user['id']}")
    print(f"  display name: {user.get('display_name') or user['username']}")
    print("Share the username and password with the user manually.")
    return 0


def cmd_list_users(_: argparse.Namespace) -> int:
    init_db()
    from server.db import get_connection

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, username, display_name, created_at FROM users WHERE is_active = 1 ORDER BY username"
        ).fetchall()
    print(f"Database: {get_db_path().resolve()}")
    if not rows:
        print("No users yet. Create one: .venv/bin/python scripts/manage_db.py create-user NAME PASSWORD")
        return 0
    for row in rows:
        print(f"  {row['username']}")
        print(f"    id: {row['id']}")
        print(f"    display: {row['display_name'] or row['username']}")
        print(f"    since: {row['created_at'][:19]}")
    return 0


def cmd_delete_user(args: argparse.Namespace) -> int:
    init_db()
    from server import repository as repo

    user = user_repo.get_user_by_username(args.username)
    if not user:
        print(f"ERROR: User not found: {args.username}", file=sys.stderr)
        return 1
    uid = user["id"]
    hid = repo.load_user_household_id_from_profile(uid)
    if hid:
        repo.delete_user_data(uid)
        if hid == repo.household_id_for_user(uid):
            repo.delete_household(hid)
    else:
        repo.delete_user_data(uid)
    user_repo.delete_user_account(uid)
    print(f"Deleted user: {args.username}")
    print(f"Remaining users: {user_repo.count_users()}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Ahar Tracker — admin user management")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="Create database schema").set_defaults(func=cmd_init)
    sub.add_parser("bootstrap", help="Create users from AHAR_BOOTSTRAP_USERS in .env").set_defaults(
        func=cmd_bootstrap
    )

    p_create = sub.add_parser("create-user", help="Create a user (admin only)")
    p_create.add_argument("username")
    p_create.add_argument("password")
    p_create.add_argument("--display-name", "-n", default="", help="Shown in the app")
    p_create.set_defaults(func=cmd_create_user)

    sub.add_parser("list-users", help="List all accounts").set_defaults(func=cmd_list_users)

    p_del = sub.add_parser("delete-user", help="Delete a user and their data")
    p_del.add_argument("username")
    p_del.set_defaults(func=cmd_delete_user)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
