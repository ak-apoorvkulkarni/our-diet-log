#!/usr/bin/env bash
# One-time server setup helper for Ubuntu.
# Run from /opt/ahar-tracker as the user that will run the app:
#   cd /opt/ahar-tracker && bash deploy/setup-server.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
APP_USER="$(whoami)"
PORT="${AHAR_PORT:-8001}"

echo "==> Ahar Tracker server setup"
echo "    App dir:  $APP_DIR"
echo "    App user: $APP_USER"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Run: sudo apt install -y python3 python3-venv python3-pip"
  exit 1
fi

if [[ ! -d ".venv" ]]; then
  echo "==> Creating Python virtual environment..."
  python3 -m venv .venv
fi

echo "==> Installing dependencies..."
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q

if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

# shellcheck disable=SC1091
source .env 2>/dev/null || true
PORT="${AHAR_PORT:-8001}"

mkdir -p data
chmod 700 data
chmod +x start.sh deploy/restart-service.sh deploy/get-quick-tunnel-url.sh 2>/dev/null || true

echo "==> Initializing SQLite database..."
.venv/bin/python -c "import sys; sys.path.insert(0,'src'); from server.db import init_db; init_db()"

# Install systemd service using the current user (not hard-coded)
sed \
  -e "s/^User=.*/User=$APP_USER/" \
  -e "s/^Group=.*/Group=$APP_USER/" \
  -e "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
  -e "s|^EnvironmentFile=.*|EnvironmentFile=-$APP_DIR/.env|" \
  -e "s|^ExecStart=.*|ExecStart=$APP_DIR/start.sh|" \
  "$APP_DIR/deploy/ahar-tracker.service" | sudo tee /etc/systemd/system/ahar-tracker.service > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable ahar-tracker
sudo systemctl restart ahar-tracker

sleep 2
if curl -sf "http://127.0.0.1:${PORT}/api/health" | grep -q '"ok"'; then
  echo "==> Health check OK"
else
  echo "ERROR: Health check failed. Run: sudo journalctl -u ahar-tracker -n 30 --no-pager"
  exit 1
fi

SERVER_IP="$(hostname -I | awk '{print $1}')"
DB_PATH="${AHAR_DB_PATH:-data/ahar_tracker.db}"
echo ""
echo "============================================"
echo "  App is running!"
echo ""
echo "  Database:      $APP_DIR/$DB_PATH"
echo "  Register:      http://${SERVER_IP}:${PORT}/  (create account in browser)"
echo "  Health:        http://127.0.0.1:${PORT}/api/health"
echo ""
echo "  Meals + accounts are stored on THIS server (SQLite)."
echo "  For HTTPS from phones, run:"
echo "    sudo bash deploy/setup-quick-tunnel.sh"
echo "    bash deploy/get-quick-tunnel-url.sh"
echo "============================================"
echo ""
echo "Commands:"
echo "  sudo systemctl status ahar-tracker"
echo "  sudo journalctl -u ahar-tracker -f"
echo "  bash deploy/get-quick-tunnel-url.sh"
