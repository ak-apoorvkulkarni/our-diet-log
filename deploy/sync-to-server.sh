#!/usr/bin/env bash
# Sync local code to the Ubuntu server and restart (no git push/pull).
# Run from your Mac in the project root:
#   bash deploy/sync-to-server.sh
#   bash deploy/sync-to-server.sh apoorv-server@192.168.2.50
#   bash deploy/sync-to-server.sh --install-deps   # also pip install on server
set -euo pipefail

REMOTE="${REMOTE:-apoorv-server@192.168.2.50}"
APP_DIR="${APP_DIR:-/opt/ahar-tracker}"
INSTALL_DEPS=0

for arg in "$@"; do
  case "$arg" in
    --install-deps) INSTALL_DEPS=1 ;;
    -h|--help)
      echo "Usage: bash deploy/sync-to-server.sh [USER@HOST] [--install-deps]"
      echo "  Syncs code via rsync, restarts ahar-tracker, prints health + tunnel URL."
      exit 0
      ;;
    *)
      if [[ "$arg" != --* ]]; then
        REMOTE="$arg"
      fi
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# This script copies FROM your Mac TO the server. Do not run it while SSH'd into the server.
if [[ "$ROOT" == "/opt/ahar-tracker" ]] || [[ "$(hostname -s 2>/dev/null || hostname)" == apoorv-server* ]]; then
  echo "ERROR: You are on the server already. Do not run sync-to-server.sh here."
  echo ""
  echo "  Run this instead:"
  echo "    cd /opt/ahar-tracker && bash deploy/update-on-server.sh"
  echo ""
  echo "  Or restart only (no git pull):"
  echo "    bash deploy/restart-service.sh"
  echo ""
  echo "  To deploy from your Mac (new terminal, not SSH):"
  echo "    cd .../diet_tracker && bash deploy/sync-to-server.sh"
  exit 1
fi

echo "==> Syncing to ${REMOTE}:${APP_DIR}"

rsync -avz --delete \
  --exclude '.git/' \
  --exclude '.venv/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude '.cursor/' \
  --exclude '.DS_Store' \
  --exclude 'node_modules/' \
  "$ROOT/" "${REMOTE}:${APP_DIR}/"

if [[ "$INSTALL_DEPS" -eq 1 ]]; then
  echo "==> Installing Python dependencies on server..."
  ssh "$REMOTE" "cd ${APP_DIR} && .venv/bin/pip install -r requirements.txt -q"
fi

echo "==> Ensuring scripts are executable and restarting service..."
# -t gives sudo a real terminal so it can ask for your server password once.
ssh -t "$REMOTE" "chmod +x ${APP_DIR}/start.sh ${APP_DIR}/deploy/*.sh 2>/dev/null || true; bash ${APP_DIR}/deploy/restart-service.sh"

echo ""
echo "==> Tunnel URL (if configured):"
ssh "$REMOTE" "bash ${APP_DIR}/deploy/get-quick-tunnel-url.sh" 2>/dev/null || echo "(tunnel not running — bash deploy/install-quick-tunnel.sh ${REMOTE})"

echo ""
echo "Done. Code is live on the server (database and .env on server were not overwritten)."
