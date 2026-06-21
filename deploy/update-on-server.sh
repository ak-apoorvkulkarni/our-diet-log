#!/usr/bin/env bash
# Run ON THE SERVER (while SSH'd in). Pulls latest code and restarts.
#   cd /opt/ahar-tracker && bash deploy/update-on-server.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
BRANCH="${AHAR_GIT_BRANCH:-Ahhar_Server_V1.O}"

echo "==> Pulling latest code (branch: $BRANCH)..."
git pull origin "$BRANCH"

echo "==> Restarting ahar-tracker..."
bash deploy/restart-service.sh

echo ""
echo "==> Tunnel URL:"
bash deploy/get-quick-tunnel-url.sh 2>/dev/null || echo "(run: bash deploy/get-quick-tunnel-url.sh)"
