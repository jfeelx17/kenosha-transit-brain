#!/usr/bin/env bash
# Run the whole Kenosha Loop stack on this machine with one command.
#
#   Flask data hub (uploads, knowledge base)  -> http://localhost:5000
#   Next.js map app (Kenosha Loop PWA)        -> http://localhost:3000
#
# Usage:
#   ./scripts/dev.sh           live Kenosha Transit data, Next.js dev server (hot reload)
#   ./scripts/dev.sh --mock    built-in fake buses/arrivals; works offline or after service hours
#   ./scripts/dev.sh --prod    production build + `next start` (what you want for daily use)
#
# Ctrl+C stops both servers.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MOCK=0
PROD=0
for arg in "$@"; do
  case "$arg" in
    --mock) MOCK=1 ;;
    --prod) PROD=1 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

# ---- prerequisites --------------------------------------------------------
command -v python3 >/dev/null || { echo "python3 not found. Debian/Ubuntu/Chromebook: sudo apt install python3 python3-venv"; exit 1; }
command -v node >/dev/null   || { echo "node not found. Install Node 20+ (see docs/RUN_LOCAL.md)"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $(node -v) is too old for Next.js 16 (needs >= 20.9). See docs/RUN_LOCAL.md."; exit 1
fi

# ---- Python side ------------------------------------------------------------
if [ ! -x .venv/bin/python ]; then
  echo "Creating Python virtualenv in .venv ..."
  python3 -m venv .venv
fi
if ! .venv/bin/python -c "import flask" 2>/dev/null; then
  echo "Installing Python dependencies ..."
  .venv/bin/pip install -q -r requirements.txt
fi

# ---- Node side --------------------------------------------------------------
if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies (first run only) ..."
  (cd frontend && npm install --no-audit --no-fund)
fi

# ---- start both -------------------------------------------------------------
export HOST="${HOST:-0.0.0.0}"          # 0.0.0.0 so Chrome OS and phones on your Wi-Fi can reach it
FLASK_PORT="${FLASK_PORT:-5000}"
PYTHON="$ROOT/.venv/bin/python"
export PYTHON                            # upload_server.py uses it to run process_uploads.py

# Each server runs in its own process group so Ctrl+C can stop npm -> next -> workers together.
PIDS=()
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping servers ..."
  for pid in "${PIDS[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

PORT="$FLASK_PORT" setsid "$PYTHON" scripts/upload_server.py &
PIDS+=($!)

if [ "$MOCK" = 1 ]; then export KENOSHA_MOCK=1; else unset KENOSHA_MOCK || true; fi
if [ "$PROD" = 1 ]; then
  setsid bash -c 'cd frontend && npm run build && npm run start' &
else
  setsid bash -c 'cd frontend && npm run dev' &
fi
PIDS+=($!)

sleep 2
echo
echo "============================================================"
echo "  Kenosha Loop is starting"
echo "    Map app  : http://localhost:3000   $([ "$MOCK" = 1 ] && echo '(MOCK DATA)' || echo '(live data)')"
echo "    Data hub : http://localhost:${FLASK_PORT}"
echo "  Press Ctrl+C to stop both."
echo "============================================================"
echo

wait
