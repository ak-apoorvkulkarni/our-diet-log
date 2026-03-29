#!/usr/bin/env bash
#
# Local static preview (same as: python3 -m http.server 8080).
# Developer: Apoorv Kulkarni, https://ak-apoorvkulkarni.github.io/
#
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "Serving http://localhost:${PORT}/  (Ctrl+C to stop)"
exec python3 -m http.server "$PORT"
