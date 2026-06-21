#!/usr/bin/env bash
# Print the current Quick Tunnel public URL (run on the server).
set -euo pipefail

SERVICE=cloudflared-quick-ahar
URL_FILE="${AHAR_QUICK_TUNNEL_URL_FILE:-/opt/ahar-tracker/data/quick-tunnel.url}"

if [[ -f "$URL_FILE" ]]; then
  URL="$(tr -d '[:space:]' < "$URL_FILE")"
  if [[ -n "$URL" ]]; then
    echo "$URL"
    exit 0
  fi
fi

if ! systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
  echo "ERROR: $SERVICE is not running. Start it with: sudo systemctl start $SERVICE" >&2
  exit 1
fi

URL="$(journalctl -u "$SERVICE" -n 80 --no-pager | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)"
if [[ -z "$URL" ]]; then
  echo "ERROR: URL not found in logs yet. Try again in a few seconds." >&2
  exit 1
fi

echo "$URL"
