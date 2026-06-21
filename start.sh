#!/usr/bin/env bash
# Production start script for आहार Tracker (FastAPI + SQLite + static site)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [[ ! -d ".venv" ]]; then
  echo "ERROR: Virtual environment not found at $APP_DIR/.venv" >&2
  echo "Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

HOST="${AHAR_HOST:-0.0.0.0}"
PORT="${AHAR_PORT:-8001}"
WORKERS="${AHAR_WORKERS:-1}"

mkdir -p data
chmod 700 data 2>/dev/null || true

echo "Starting आहार Tracker on ${HOST}:${PORT} (workers=${WORKERS})"

exec "$APP_DIR/.venv/bin/uvicorn" server.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --workers "$WORKERS" \
  --app-dir "$APP_DIR/src"
