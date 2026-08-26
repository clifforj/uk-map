#!/usr/bin/env bash
# Serves client/ on localhost for local testing (see issue 5.2's Findings —
# the demo isn't deployed anywhere; running it locally is the plan).
#
# TILE_HOSTNAME never gets committed to this public repo, so this script
# substitutes it into a throwaway copy of client/ in a temp directory rather
# than editing main.js in place. Pass the hostname as an argument or set the
# TILE_HOSTNAME env var.
#
# Usage:
#   ./serve.sh <tile-hostname> [port]
#   TILE_HOSTNAME=tiles.example.com ./serve.sh

set -euo pipefail

TILE_HOSTNAME="${1:-${TILE_HOSTNAME:-}}"
PORT="${2:-8000}"

if [ -z "$TILE_HOSTNAME" ]; then
  echo "Usage: $0 <tile-hostname> [port]" >&2
  echo "   or: TILE_HOSTNAME=<tile-hostname> $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

cp "$SCRIPT_DIR/index.html" "$SCRIPT_DIR/style.json" "$WORKDIR/"
sed "s/__TILE_HOSTNAME__/$TILE_HOSTNAME/g" "$SCRIPT_DIR/main.js" > "$WORKDIR/main.js"

echo "Serving client/ on http://localhost:$PORT (tile hostname: $TILE_HOSTNAME)"
python3 -m http.server "$PORT" --directory "$WORKDIR"
