#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-local}"

export NEKO_PORT="${NEKO_PORT:-8765}"

case "$MODE" in
  local)
    unset NEKO_HOST
    ;;
  lan)
    export NEKO_HOST="0.0.0.0"
    ;;
  *)
    echo "Usage: ./run-linux.sh [local|lan]" >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR"
python3 ./backend/server.py
