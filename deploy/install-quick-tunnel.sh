#!/usr/bin/env bash
# Install Quick Tunnel systemd service on the Ubuntu server.
# Run from your Mac (not while SSH'd into the server):
#   bash deploy/install-quick-tunnel.sh apoorv-server@192.168.2.50
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash deploy/install-quick-tunnel.sh USER@SERVER"
  echo "Example: bash deploy/install-quick-tunnel.sh apoorv-server@192.168.2.50"
  exit 1
fi

REMOTE="$1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="/opt/ahar-tracker"

echo "==> Copying setup script to server..."
ssh "$REMOTE" "mkdir -p $APP_DIR/deploy"
scp "$ROOT/deploy/setup-quick-tunnel.sh" "$ROOT/deploy/get-quick-tunnel-url.sh" \
  "$REMOTE:$APP_DIR/deploy/"

echo "==> Installing cloudflared-quick-ahar systemd service..."
ssh -t "$REMOTE" "sudo bash $APP_DIR/deploy/setup-quick-tunnel.sh"

echo ""
echo "==> Fetching public URL..."
URL="$(ssh "$REMOTE" "bash $APP_DIR/deploy/get-quick-tunnel-url.sh" 2>/dev/null || true)"
if [[ -n "$URL" ]]; then
  echo ""
  echo "============================================"
  echo "  Public app URL:"
  echo "  ${URL}/"
  echo "============================================"
  echo ""
  echo "Open this URL in a browser to access the app."
else
  echo "URL not ready yet. On the server run:"
  echo "  bash $APP_DIR/deploy/get-quick-tunnel-url.sh"
fi
