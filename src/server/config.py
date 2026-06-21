"""Load environment from .env before other server imports."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

AHAR_HOST = os.environ.get("AHAR_HOST", "0.0.0.0")
AHAR_PORT = int(os.environ.get("AHAR_PORT", "8001"))
AHAR_DB_PATH = Path(os.environ.get("AHAR_DB_PATH", str(ROOT / "data" / "ahar_tracker.db")))
AHAR_ALLOW_PUBLIC_REGISTER = os.environ.get("AHAR_ALLOW_PUBLIC_REGISTER", "false").lower() in (
    "1",
    "true",
    "yes",
)
AHAR_COOKIE_SECURE = os.environ.get("AHAR_COOKIE_SECURE", "true").lower() in (
    "1",
    "true",
    "yes",
)
