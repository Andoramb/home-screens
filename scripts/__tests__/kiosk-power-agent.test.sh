#!/usr/bin/env bash
# Behavioural test for scripts/kiosk-power-agent.sh against a stub wlopm and
# a file:// power-state endpoint.
#
# The agent's whole job is to never strand a panel dark, so most of what
# follows checks the ON paths: hub says on, hub goes silent, the agent dies.
set -euo pipefail

cd "$(dirname "$0")/.."   # scripts/
SCRIPTS_DIR="$(pwd)"

for tool in curl; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} not installed — skipping kiosk-power-agent test"
    exit 0
  fi
done

WORK="$(mktemp -d)"
AGENT_PID=""
WATCH_PID=""
cleanup() {
  [ -n "${AGENT_PID}" ] && kill "${AGENT_PID}" 2>/dev/null || true
  [ -n "${WATCH_PID}" ] && kill "${WATCH_PID}" 2>/dev/null || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

APP_DIR="${WORK}/app"
mkdir -p "${APP_DIR}/scripts" "${APP_DIR}/data" "${WORK}/bin"
install -m 0755 "${SCRIPTS_DIR}/kiosk-power-agent.sh" "${APP_DIR}/scripts/kiosk-power-agent.sh"
# A home with no labwc config, so the tests above the kanshi ones run the
# agent as every setup but the one labwc-rc.sh prepares (tests 11 on).
export HOME="${WORK}/home-plain"
mkdir -p "${HOME}"

ARGV_LOG="${WORK}/wlopm.log"
LISTING="${WORK}/listing"
STATE="${WORK}/state.json"
: > "${ARGV_LOG}"
echo "HDMI-A-1 on" > "${LISTING}"
echo '{"power":"on"}' > "${STATE}"

# Stub wlopm: logs every invocation, and with no arguments prints whatever
# listing the test currently wants the compositor to report.
# While the refuse-off file exists, --off fails as a wlopm that could not
# reach the compositor would.
REFUSE_OFF="${WORK}/refuse-off"
cat > "${WORK}/bin/wlopm" <<EOF
#!/usr/bin/env bash
if [ \$# -eq 0 ]; then cat "${LISTING}"; exit 0; fi
echo "\$*" >> "${ARGV_LOG}"
if [ -e "${REFUSE_OFF}" ] && [ "\$1" = "--off" ]; then exit 1; fi
exit 0
EOF
chmod +x "${WORK}/bin/wlopm"

# The pid the agent watches; killing it is how the launcher's exit is simulated.
sleep 300 &
WATCH_PID=$!

PATH="${WORK}/bin:${PATH}" \
HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_POLL_SECONDS=0.2 HS_POWER_IDLE_POLL_SECONDS=0.2 \
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!

# wait_for <pattern> <count> <label>: poll the argv log until it holds at
# least <count> lines matching <pattern>.
wait_for() {
  local pattern="$1" count="$2" label="$3" i
  for i in $(seq 1 50); do
    if [ "$(grep -c -- "${pattern}" "${ARGV_LOG}" || true)" -ge "${count}" ]; then
      return 0
    fi
    sleep 0.1
  done
  echo "FAIL: ${label}"
  echo "--- wlopm argv log ---"; cat "${ARGV_LOG}"
  exit 1
}

count_of() {
  grep -c -- "$1" "${ARGV_LOG}" || true
}

echo "Test 1: asserts the panel on at startup"
wait_for '^--on \*$' 1 "expected an initial wlopm --on"

echo "Test 2: hub says off → panel off, once"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 1 "expected wlopm --off after the hub answered off"
echo "HDMI-A-1 off" > "${LISTING}"
sleep 1
[ "$(count_of '^--off \*$')" -eq 1 ] || { echo "FAIL: --off repeated while the output already reported off"; cat "${ARGV_LOG}"; exit 1; }

echo "Test 3: output flaps back on → off is re-asserted"
echo "HDMI-A-1 on" > "${LISTING}"
wait_for '^--off \*$' 2 "expected a second wlopm --off after the listing showed the output on"
echo "HDMI-A-1 off" > "${LISTING}"

echo "Test 4: hub says on → panel on"
echo '{"power":"on"}' > "${STATE}"
wait_for '^--on \*$' 2 "expected wlopm --on after the hub answered on"

echo "Test 5: hub goes silent while off → panel forced on after three failures"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 3 "expected wlopm --off before simulating hub silence"
rm -f "${STATE}"
wait_for '^--on \*$' 3 "expected wlopm --on after the hub went silent"

echo "Test 6: malformed answer counts as on"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 4 "expected wlopm --off before the malformed answer"
echo 'not json' > "${STATE}"
wait_for '^--on \*$' 4 "expected wlopm --on after a malformed answer"

echo "Test 7: the watched pid dying ends the agent and restores power"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 5 "expected wlopm --off before killing the watched pid"
kill "${WATCH_PID}" 2>/dev/null
wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""
for i in $(seq 1 50); do
  kill -0 "${AGENT_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${AGENT_PID}" 2>/dev/null; then
  echo "FAIL: agent kept running after the watched pid exited"; exit 1
fi
AGENT_PID=""
wait_for '^--on \*$' 5 "expected wlopm --on from the EXIT trap"

echo "Test 7b: a termination signal ends the agent and restores power"
: > "${ARGV_LOG}"
echo '{"power":"off"}' > "${STATE}"
sleep 300 &
WATCH_PID=$!
PATH="${WORK}/bin:${PATH}" \
HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_POLL_SECONDS=0.2 HS_POWER_IDLE_POLL_SECONDS=0.2 \
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
wait_for '^--off \*$' 1 "expected wlopm --off before sending TERM"
kill -TERM "${AGENT_PID}"
for i in $(seq 1 50); do
  kill -0 "${AGENT_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${AGENT_PID}" 2>/dev/null; then
  echo "FAIL: agent kept running after SIGTERM"; exit 1
fi
wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
# Exactly the startup --on and the trap's --on: a handler that merely
# returned would have polled again and switched the panel off a second time.
[ "$(count_of '^--off \*$')" -eq 1 ] || { echo "FAIL: --off re-issued after SIGTERM"; cat "${ARGV_LOG}"; exit 1; }
wait_for '^--on \*$' 2 "expected wlopm --on from the EXIT trap after SIGTERM"
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""

echo "Test 8: no wlopm on PATH → waits without touching anything, and exits with the watched pid"
: > "${ARGV_LOG}"
sleep 300 &
WATCH_PID=$!
PATH="/usr/bin:/bin" HS_POWER_STATE_URL="file://${STATE}" HS_POWER_RETRY_SECONDS=0.2 \
  bash "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
sleep 1
kill -0 "${AGENT_PID}" 2>/dev/null || { echo "FAIL: agent exited instead of waiting for wlopm"; exit 1; }
[ ! -s "${ARGV_LOG}" ] || { echo "FAIL: wlopm was called without being on PATH"; exit 1; }
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""
for i in $(seq 1 50); do
  kill -0 "${AGENT_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${AGENT_PID}" 2>/dev/null; then
  echo "FAIL: waiting agent kept running after the watched pid exited"; exit 1
fi
wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
[ ! -s "${ARGV_LOG}" ] || { echo "FAIL: a waiting agent must not touch wlopm on exit"; exit 1; }

echo "Test 9: wlopm installed later → the waiting agent starts without a restart"
# The nightly update can install the package long after the launcher started
# this agent. A late PATH directory stands in for apt landing the binary.
LATE_BIN="${WORK}/late-bin"
mkdir -p "${LATE_BIN}"
: > "${ARGV_LOG}"
echo '{"power":"off"}' > "${STATE}"
echo "HDMI-A-1 on" > "${LISTING}"
sleep 300 &
WATCH_PID=$!
PATH="${LATE_BIN}:/usr/bin:/bin" HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_RETRY_SECONDS=0.2 HS_POWER_POLL_SECONDS=0.2 HS_POWER_IDLE_POLL_SECONDS=0.2 \
  bash "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
sleep 0.6
[ ! -s "${ARGV_LOG}" ] || { echo "FAIL: wlopm was called before it existed"; exit 1; }
cp "${WORK}/bin/wlopm" "${LATE_BIN}/wlopm"
wait_for '^--on \*$' 1 "expected the startup --on once wlopm appeared"
wait_for '^--off \*$' 1 "expected --off from normal polling once wlopm appeared"
kill "${AGENT_PID}" 2>/dev/null; wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""

echo "Test 10: a lit panel asks every idle interval, a dark one every poll interval"
: > "${ARGV_LOG}"
echo '{"power":"off"}' > "${STATE}"
echo "HDMI-A-1 off" > "${LISTING}"
sleep 300 &
WATCH_PID=$!
PATH="${WORK}/bin:${PATH}" \
HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_POLL_SECONDS=0.2 HS_POWER_IDLE_POLL_SECONDS=3 \
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
wait_for '^--off \*$' 1 "expected --off from the first poll"
# Dark: the fast interval, so the hub's on is followed at once.
echo '{"power":"on"}' > "${STATE}"
wait_for '^--on \*$' 2 "expected --on within a fast poll of the hub answering on"
# Lit: the idle interval, so an off is not followed within a second...
echo '{"power":"off"}' > "${STATE}"
sleep 1
[ "$(count_of '^--off \*$')" -eq 1 ] || { echo "FAIL: a lit panel polled faster than the idle interval"; cat "${ARGV_LOG}"; exit 1; }
# ...but is followed once the idle interval is up.
wait_for '^--off \*$' 2 "expected --off after the idle interval"
kill "${AGENT_PID}" 2>/dev/null; wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""

# --- With labwc told to leave new screens off (scripts/labwc-rc.sh) --------
#
# The agent then stops kanshi while the screen is off and starts it again,
# through kiosk-outputs.sh, when the hub says on. Stubs for pkill, wlr-randr,
# logger and kiosk-outputs.sh log into the same argv log as wlopm, prefixed,
# so the order of events can be read off one file.
GATED_HOME="${WORK}/home-gated"
RUN_DIR="${WORK}/run"
WLR_LISTING="${WORK}/wlr-listing"
LOGGER_LOG="${WORK}/logger.log"
mkdir -p "${GATED_HOME}/.config/labwc" "${RUN_DIR}"
cat > "${GATED_HOME}/.config/labwc/rc.xml" <<'EOF'
<?xml version="1.0"?>
<labwc_config>
  <core>
    <autoEnableOutputs>no</autoEnableOutputs>
  </core>
</labwc_config>
EOF
cat > "${WORK}/bin/pkill" <<EOF
#!/usr/bin/env bash
echo "pkill \$*" >> "${ARGV_LOG}"
exit 0
EOF
cat > "${WORK}/bin/wlr-randr" <<EOF
#!/usr/bin/env bash
cat "${WLR_LISTING}"
EOF
cat > "${WORK}/bin/logger" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${LOGGER_LOG}"
EOF
# kiosk-outputs.sh's part here is to start kanshi, which lights the screen.
cat > "${APP_DIR}/scripts/kiosk-outputs.sh" <<EOF
#!/usr/bin/env bash
echo "outputs \$*" >> "${ARGV_LOG}"
printf 'HDMI-A-1 "Panel"\n  Enabled: yes\n' > "${WLR_LISTING}"
EOF
chmod +x "${WORK}/bin/pkill" "${WORK}/bin/wlr-randr" "${WORK}/bin/logger" "${APP_DIR}/scripts/kiosk-outputs.sh"

# line_of <pattern> <nth>: the argv log line number of the nth match.
line_of() {
  grep -n -- "$1" "${ARGV_LOG}" | sed -n "$2p" | cut -d: -f1
}

start_gated_agent() {
  sleep 300 &
  WATCH_PID=$!
  HOME="${GATED_HOME}" XDG_RUNTIME_DIR="${RUN_DIR}" PATH="${WORK}/bin:${PATH}" \
  HS_POWER_STATE_URL="file://${STATE}" \
  HS_POWER_POLL_SECONDS=0.2 HS_POWER_IDLE_POLL_SECONDS=0.2 HS_POWER_REASSERT_LOG_SECONDS=1 \
    "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
  AGENT_PID=$!
}

stop_gated_agent() {
  kill "${AGENT_PID}" 2>/dev/null; wait "${AGENT_PID}" 2>/dev/null || true
  AGENT_PID=""
  kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
  WATCH_PID=""
}

echo "Test 11: going dark stops kanshi first and notes the state for kiosk-outputs.sh"
: > "${ARGV_LOG}"; : > "${LOGGER_LOG}"
printf 'HDMI-A-1 "Panel"\n  Enabled: yes\n' > "${WLR_LISTING}"
echo "HDMI-A-1 on" > "${LISTING}"
echo '{"power":"off"}' > "${STATE}"
start_gated_agent
wait_for '^--off \*$' 1 "expected wlopm --off"
grep -qx -- "pkill -u $(id -u) -x kanshi" "${ARGV_LOG}" || { echo "FAIL: kanshi was not stopped"; cat "${ARGV_LOG}"; exit 1; }
[ "$(line_of '^pkill ' 1)" -lt "$(line_of '^--off \*$' 1)" ] || { echo "FAIL: kanshi must stop before the power is cut"; cat "${ARGV_LOG}"; exit 1; }
[ "$(cat "${RUN_DIR}/home-screens-panel")" = "off" ] || { echo "FAIL: state file should say off"; exit 1; }
echo "HDMI-A-1 off" > "${LISTING}"

echo "Test 12: a screen that never went away is lit first, then kanshi comes back"
echo '{"power":"on"}' > "${STATE}"
wait_for '^outputs start$' 1 "expected kiosk-outputs.sh start after the hub answered on"
[ "$(line_of '^--on \*$' 2)" -lt "$(line_of '^outputs start$' 1)" ] || { echo "FAIL: a lit screen must not wait for kanshi"; cat "${ARGV_LOG}"; exit 1; }
[ "$(cat "${RUN_DIR}/home-screens-panel")" = "on" ] || { echo "FAIL: state file should say on"; exit 1; }

echo "Test 13: a screen that reconnected while dark waits for kanshi, so it does not come up sideways"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 2 "expected wlopm --off again"
echo "HDMI-A-1 off" > "${LISTING}"
printf 'HDMI-A-1 "Panel"\n  Enabled: no\n' > "${WLR_LISTING}"
echo '{"power":"on"}' > "${STATE}"
wait_for '^--on \*$' 3 "expected wlopm --on"
[ "$(line_of '^outputs start$' 2)" -lt "$(line_of '^--on \*$' 3)" ] || { echo "FAIL: kanshi must start before the power comes on for a reconnected screen"; cat "${ARGV_LOG}"; exit 1; }

echo "Test 14: a screen that comes back on by itself is noted once, then summed up"
echo '{"power":"off"}' > "${STATE}"
wait_for '^--off \*$' 3 "expected wlopm --off before the flaps"
echo "HDMI-A-1 on" > "${LISTING}"
wait_for '^--off \*$' 5 "expected repeated --off while the listing shows the screen on"
grep -q 'switched the screen off again after it came back on' "${LOGGER_LOG}" || { echo "FAIL: expected the first flap noted"; cat "${LOGGER_LOG}"; exit 1; }
sleep 1.2
wait_for '^--off \*$' 7 "expected more --off"
grep -q 'switched the screen off again [0-9]* times' "${LOGGER_LOG}" || { echo "FAIL: expected a summed-up note"; cat "${LOGGER_LOG}"; exit 1; }
[ "$(grep -c 'switched the screen off again' "${LOGGER_LOG}")" -le 3 ] || { echo "FAIL: flaps were noted on every poll"; cat "${LOGGER_LOG}"; exit 1; }
echo "HDMI-A-1 off" > "${LISTING}"

echo "Test 15: the exit trap brings kanshi back and drops the state file"
kill -TERM "${AGENT_PID}"
wait "${AGENT_PID}" 2>/dev/null || true
AGENT_PID=""
wait_for '^outputs start$' 3 "expected kiosk-outputs.sh start from the EXIT trap"
[ ! -e "${RUN_DIR}/home-screens-panel" ] || { echo "FAIL: state file left behind"; exit 1; }
kill "${WATCH_PID}" 2>/dev/null; wait "${WATCH_PID}" 2>/dev/null || true
WATCH_PID=""

echo "Test 16: a connected screen found off while awake has kanshi started again"
: > "${ARGV_LOG}"
printf 'HDMI-A-1 "Panel"\n  Enabled: no\n' > "${WLR_LISTING}"
echo '{"power":"on"}' > "${STATE}"
start_gated_agent
wait_for '^outputs start$' 1 "expected kiosk-outputs.sh start for a dark screen while awake"
sleep 0.6
[ "$(count_of '^outputs start$')" -eq 1 ] || { echo "FAIL: kanshi restarted again after the screen was lit"; cat "${ARGV_LOG}"; exit 1; }
stop_gated_agent

echo "Test 17: without that line in rc.xml nothing about kanshi changes"
: > "${ARGV_LOG}"
printf 'HDMI-A-1 "Panel"\n  Enabled: yes\n' > "${WLR_LISTING}"
echo "HDMI-A-1 on" > "${LISTING}"
echo '{"power":"off"}' > "${STATE}"
sleep 300 &
WATCH_PID=$!
XDG_RUNTIME_DIR="${RUN_DIR}" PATH="${WORK}/bin:${PATH}" \
HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_POLL_SECONDS=0.2 HS_POWER_IDLE_POLL_SECONDS=0.2 \
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
wait_for '^--off \*$' 1 "expected wlopm --off"
echo "HDMI-A-1 off" > "${LISTING}"
echo '{"power":"on"}' > "${STATE}"
wait_for '^--on \*$' 2 "expected wlopm --on"
sleep 0.3
if grep -q '^pkill \|^outputs ' "${ARGV_LOG}"; then echo "FAIL: kanshi was touched without the rc.xml line"; cat "${ARGV_LOG}"; exit 1; fi
stop_gated_agent

echo "Test 18: a power-off that fails puts kanshi and the state file back"
: > "${ARGV_LOG}"
printf 'HDMI-A-1 "Panel"\n  Enabled: yes\n' > "${WLR_LISTING}"
echo "HDMI-A-1 on" > "${LISTING}"
echo '{"power":"off"}' > "${STATE}"
: > "${REFUSE_OFF}"
start_gated_agent
wait_for '^--off \*$' 1 "expected the failing wlopm --off"
wait_for '^outputs start$' 1 "expected kanshi started again after the failed power-off"
[ "$(line_of '^pkill ' 1)" -lt "$(line_of '^outputs start$' 1)" ] || { echo "FAIL: kanshi should have been stopped, then restarted"; cat "${ARGV_LOG}"; exit 1; }
[ "$(cat "${RUN_DIR}/home-screens-panel")" = "on" ] || { echo "FAIL: state file should be back to on"; exit 1; }
# The hub turning round to on before a retry succeeds leaves nothing stuck.
rm -f "${REFUSE_OFF}"
echo '{"power":"on"}' > "${STATE}"
sleep 0.6
[ "$(cat "${RUN_DIR}/home-screens-panel")" = "on" ] || { echo "FAIL: state file should still say on"; exit 1; }
stop_gated_agent

echo "Test 19: a save deferred while dark is applied at wake even when kanshi was never stopped"
: > "${ARGV_LOG}"
echo "HDMI-A-1 on" > "${LISTING}"
echo '{"power":"off"}' > "${STATE}"
sleep 300 &
WATCH_PID=$!
# A plain home: no rc.xml line, so this agent never touches kanshi.
XDG_RUNTIME_DIR="${RUN_DIR}" PATH="${WORK}/bin:${PATH}" \
HS_POWER_STATE_URL="file://${STATE}" \
HS_POWER_POLL_SECONDS=0.2 HS_POWER_IDLE_POLL_SECONDS=0.2 \
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "${WATCH_PID}" &
AGENT_PID=$!
wait_for '^--off \*$' 1 "expected wlopm --off"
echo "HDMI-A-1 off" > "${LISTING}"
: > "${RUN_DIR}/home-screens-outputs-deferred"   # what kiosk-outputs.sh leaves for a save it could not apply
echo '{"power":"on"}' > "${STATE}"
wait_for '^--on \*$' 2 "expected wlopm --on"
wait_for '^outputs start$' 1 "expected kiosk-outputs.sh start to replay the deferred save"
rm -f "${RUN_DIR}/home-screens-outputs-deferred"
stop_gated_agent

echo "All kiosk-power-agent tests passed."
