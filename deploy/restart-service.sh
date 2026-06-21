#!/usr/bin/env bash
# Restart Ahar Tracker on the server (run while SSH'd in, no Mac needed).
#   cd /opt/ahar-tracker && bash deploy/restart-service.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${AHAR_PORT:-8001}"

if [[ -f "$APP_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  PORT="${AHAR_PORT:-8001}"
fi

echo "==> Restarting ahar-tracker..."
sudo systemctl restart ahar-tracker
sleep 2

if curl -sf "http://127.0.0.1:${PORT}/api/health" | grep -q '"ok"'; then
  echo "==> Health check OK"
else
  echo "ERROR: Service not responding. Check: sudo journalctl -u ahar-tracker -n 30 --no-pager"
  exit 1
fi

SERVER_IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "App:     http://${SERVER_IP}:${PORT}/"
echo "Tunnel:  bash $APP_DIR/deploy/get-quick-tunnel-url.sh"
