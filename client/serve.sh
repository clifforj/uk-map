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
# Only the const's own placeholder value gets substituted here — main.js
# also contains the literal string __TILE_HOSTNAME__ as replaceAll's search
# argument (it uses that token to substitute style.json's placeholder at
# runtime), and a blind file-wide sed would corrupt that string too, since
# it's textually identical to the const's placeholder.
sed "s/^const TILE_HOSTNAME = \"__TILE_HOSTNAME__\";\$/const TILE_HOSTNAME = \"$TILE_HOSTNAME\";/" \
  "$SCRIPT_DIR/main.js" > "$WORKDIR/main.js"

echo "Serving client/ on http://localhost:$PORT (tile hostname: $TILE_HOSTNAME)"
# Plain `python3 -m http.server` sends no Cache-Control header, so browsers
# can silently reuse a stale main.js from an earlier run — the served
# directory is a fresh temp copy every time, but it's served from the same
# URL, and nothing tells the browser the old response is no longer valid.
python3 -c '
import functools, http.server, sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

directory, port = sys.argv[1], int(sys.argv[2])
handler = functools.partial(NoCacheHandler, directory=directory)
http.server.test(HandlerClass=handler, port=port)
' "$WORKDIR" "$PORT"
