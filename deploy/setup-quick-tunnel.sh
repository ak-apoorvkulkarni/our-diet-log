#!/usr/bin/env bash
# Install Cloudflare Quick Tunnel as a systemd service (no domain required).
# Run ON THE UBUNTU SERVER:
#   sudo bash deploy/setup-quick-tunnel.sh
# Or from your Mac:
#   bash deploy/install-quick-tunnel.sh apoorv-server@192.168.2.50
set -euo pipefail

SERVICE_NAME=cloudflared-quick-ahar
SERVICE=/etc/systemd/system/${SERVICE_NAME}.service
APP_DIR="${AHAR_APP_DIR:-/opt/ahar-tracker}"
URL_FILE="${APP_DIR}/data/quick-tunnel.url"
APP_PORT="${AHAR_PORT:-8001}"
CLOUDFLARED_BIN="$(command -v cloudflared || true)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash $0"
  exit 1
fi

if [[ -f "${APP_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  source "${APP_DIR}/.env"
  APP_PORT="${AHAR_PORT:-8001}"
fi

if [[ -z "$CLOUDFLARED_BIN" ]]; then
  echo "cloudflared not found. Install it first (see deployment.md)."
  exit 1
fi

mkdir -p "$APP_DIR/data"

cat > "$SERVICE" << EOF
[Unit]
Description=Cloudflare Quick Tunnel - Ahar Tracker
After=network-online.target ahar-tracker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${CLOUDFLARED_BIN} tunnel --url http://127.0.0.1:${APP_PORT}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

chmod +x "$APP_DIR/deploy/get-quick-tunnel-url.sh" 2>/dev/null || true

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "Waiting for tunnel URL..."
URL=""
for _ in 1 2 3 4 5 6; do
  sleep 3
  URL="$(journalctl -u "$SERVICE_NAME" -n 80 --no-pager | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
  if [[ -n "$URL" ]]; then
    break
  fi
done

echo ""
systemctl status "$SERVICE_NAME" --no-pager -l | head -15
echo ""
if [[ -n "$URL" ]]; then
  printf '%s\n' "$URL" > "$URL_FILE"
  chmod 644 "$URL_FILE"
  echo "============================================"
  echo "Your public URL (save this):"
  echo "  ${URL}/"
  echo "============================================"
  echo "Saved to: $URL_FILE"
  echo ""
  echo "Open this HTTPS URL in a browser to use the app from any device."
  echo "URL changes after reboot or tunnel restart — re-run:"
  echo "  bash $APP_DIR/deploy/get-quick-tunnel-url.sh"
else
  echo "URL not found yet. Run:"
  echo "  bash $APP_DIR/deploy/get-quick-tunnel-url.sh"
fi
