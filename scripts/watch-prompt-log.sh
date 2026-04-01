#!/usr/bin/env bash
set -euo pipefail

MODE="tail"
LINES="${ASK_ARION_LOG_LINES:-80}"

usage() {
  cat <<'EOF'
Usage: ./scripts/watch-prompt-log.sh [--less] [--tail] [--lines N] [log_path]

Watches the Ask Arion prompt audit log in a readable way.

Options:
  --less       Open with less +F so you can pause, scroll, and search
  --tail       Follow with tail -F (default)
  --lines N    Show the last N lines first (default: 80)
  -h, --help   Show this help message

Behavior:
  - If log_path is provided, that path is used.
  - Otherwise the script prefers:
      1. /opt/ask-arion/runtime/prompt-audit.log
      2. ./runtime/prompt-audit.log relative to this repo

Examples:
  ./scripts/watch-prompt-log.sh
  ./scripts/watch-prompt-log.sh --less
  ./scripts/watch-prompt-log.sh --lines 120
  ./scripts/watch-prompt-log.sh /opt/ask-arion/runtime/prompt-audit.log
EOF
}

POSITIONAL_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --less)
      MODE="less"
      shift
      ;;
    --tail)
      MODE="tail"
      shift
      ;;
    --lines)
      if [[ $# -lt 2 ]]; then
        echo "--lines requires a value" >&2
        exit 1
      fi
      LINES="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      POSITIONAL_PATH="$1"
      shift
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "$POSITIONAL_PATH" ]]; then
  LOG_PATH="$POSITIONAL_PATH"
elif [[ -f /opt/ask-arion/runtime/prompt-audit.log || -d /opt/ask-arion/runtime ]]; then
  LOG_PATH="/opt/ask-arion/runtime/prompt-audit.log"
else
  LOG_PATH="$ROOT_DIR/runtime/prompt-audit.log"
fi

mkdir -p "$(dirname "$LOG_PATH")"
touch "$LOG_PATH"

echo "Watching Ask Arion prompt log:"
echo "  $LOG_PATH"
echo

if [[ "$MODE" == "less" ]]; then
  exec less +F "$LOG_PATH"
else
  exec tail -n "$LINES" -F "$LOG_PATH"
fi
