#!/usr/bin/env bash
# Exercise `upgrade.sh health-check` against a local fixture server.
#
# The action is the gate between "the new release was unpacked" and "the
# rollback tree may go", so what matters is that it passes only on a 200 from
# GET /api/health, and that a server which is bound to the port but refuses
# or errors on that route does not pass.
set -euo pipefail

cd "$(dirname "$0")/.."   # scripts/
SCRIPTS_DIR="$(pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not installed, skipping health-check test"
  exit 0
fi

WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  [ -n "${SERVER_PID}" ] && kill "${SERVER_PID}" 2>/dev/null || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

# A copy of the script tree, so the action runs against a scratch APP_DIR and
# never reads the real data/ folder.
APP_DIR="${WORK}/app"
mkdir -p "${APP_DIR}/scripts/lib" "${APP_DIR}/data"
install -m 0755 "${SCRIPTS_DIR}/upgrade.sh" "${APP_DIR}/scripts/upgrade.sh"
install -m 0644 "${SCRIPTS_DIR}/lib/common.sh" "${APP_DIR}/scripts/lib/common.sh"
UPGRADE="${APP_DIR}/scripts/upgrade.sh"

PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"

# start_server <status for /api/health>
# Every other path answers 401, the way a guarded route does once a password
# is set. /api/health answers the given status with a health body.
start_server() {
  local health_status="$1"
  python3 - "${PORT}" "${health_status}" <<'PY' &
import json, signal, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

# Exit normally on SIGTERM so bash prints no "Terminated" line for the job.
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

port, health_status = int(sys.argv[1]), int(sys.argv[2])

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        if self.path == '/api/health':
            body = json.dumps({"ok": True, "version": "9.8.7", "build": "abc", "schema": 3, "uptime": 12}, separators=(",", ":")).encode()
            self.send_response(health_status)
        else:
            body = b'{"error":"Authentication required"}'
            self.send_response(401)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

HTTPServer(('127.0.0.1', port), Handler).serve_forever()
PY
  SERVER_PID=$!
  local i
  for i in $(seq 1 50); do
    curl -s -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null && return 0
    sleep 0.1
  done
  echo "FAIL: fixture server did not start"
  exit 1
}

stop_server() {
  [ -n "${SERVER_PID}" ] && kill "${SERVER_PID}" 2>/dev/null || true
  wait "${SERVER_PID}" 2>/dev/null || true
  SERVER_PID=""
}

check() { # $1 = label; runs health-check with fast retries, prints its output, returns its exit code
  HS_HEALTH_ATTEMPTS=3 HS_HEALTH_SLEEP=0.1 bash "${UPGRADE}" health-check "${PORT}"
}

echo "Test 1: a 200 from /api/health passes and names the version"
start_server 200
out="$(check)" || { echo "FAIL: health-check exited non-zero on a healthy server: ${out}"; exit 1; }
grep -q '"ok":true' <<< "${out}" || { echo "FAIL: expected ok:true, got ${out}"; exit 1; }
grep -q '"version":"9.8.7"' <<< "${out}" || { echo "FAIL: expected the version in the answer, got ${out}"; exit 1; }
echo "ok: ${out}"
stop_server

echo "Test 2: a server that answers but errors on /api/health does not pass"
start_server 500
if out="$(check)"; then
  echo "FAIL: health-check passed on a 500: ${out}"
  exit 1
fi
grep -q '"ok":false' <<< "${out}" || { echo "FAIL: expected ok:false, got ${out}"; exit 1; }
echo "ok: ${out}"
stop_server

echo "Test 3: a server that refuses /api/health does not pass (a 401 used to count)"
start_server 401
if out="$(check)"; then
  echo "FAIL: health-check passed on a 401: ${out}"
  exit 1
fi
echo "ok: ${out}"
stop_server

echo "Test 4: nothing listening does not pass"
if out="$(check)"; then
  echo "FAIL: health-check passed with no server: ${out}"
  exit 1
fi
echo "ok: ${out}"

echo "All health-check tests passed"
