"""SQLite database for आहार Tracker server."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from server.config import AHAR_DB_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    household_id TEXT,
    created_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    members_json TEXT NOT NULL DEFAULT '[]',
    slots_json TEXT NOT NULL DEFAULT '{}',
    profiles_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_state (
    user_id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS meal_images (
    user_id TEXT NOT NULL,
    meal_id TEXT NOT NULL,
    data_url TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, meal_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invites (
    token TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    from_uid TEXT NOT NULL,
    to_username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    used_at TEXT,
    used_by TEXT
);

CREATE TABLE IF NOT EXISTS legacy_household_state (
    household_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def get_db_path() -> Path:
    path = AHAR_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(_SCHEMA)
        conn.commit()


def db_status() -> dict:
    path = get_db_path().resolve()
    with get_connection() as conn:
        users = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        meals = conn.execute(
            "SELECT COALESCE(SUM(json_array_length(json_extract(state_json, '$.meals'))), 0) AS n FROM user_state"
        ).fetchone()["n"]
    return {"path": str(path), "users": int(users), "meals": int(meals)}


def json_dumps(obj: object) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def json_loads(text: str | None) -> object:
    if not text:
        return None
    return json.loads(text)
