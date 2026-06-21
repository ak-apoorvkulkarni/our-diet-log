#!/usr/bin/env bash
# Run ON THE SERVER after code is updated (git pull or sync from Mac).
#   cd /opt/ahar-tracker && bash deploy/apply-on-server.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
bash deploy/restart-service.sh
bash deploy/get-quick-tunnel-url.sh 2>/dev/null || true
