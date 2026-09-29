#!/usr/bin/env bash
# Behavioural test for scripts/kiosk-outputs.sh against stub wlr-randr,
# kanshi, pgrep, pkill, systemd-cat and logger.
#
# The script's whole job is that a rotated wall stays rotated, so beyond the
# kanshi config it writes, most of what follows checks the fallbacks: every
# path where kanshi cannot help still sets the screen once, as before.
set -euo pipefail

cd "$(dirname "$0")/.."   # scripts/
SCRIPTS_DIR="$(pwd)"

WORK="$(mktemp -d)"
KANSHI_PIDS="${WORK}/kanshi.pids"
# Stub kanshi processes stay up so that "is it still running" can be asked;
# they write their pid down so they can be stopped.
stop_stub_kanshi() {
  if [ -s "${KANSHI_PIDS}" ]; then
    xargs kill 2>/dev/null < "${KANSHI_PIDS}" || true
  fi
  : > "${KANSHI_PIDS}"
}
cleanup() {
  stop_stub_kanshi
  rm -rf "${WORK}"
}
trap cleanup EXIT

APP_DIR="${WORK}/app"
BIN="${WORK}/bin"
RUN_DIR="${WORK}/run"
HOME_DIR="${WORK}/home"
KANSHI_CONF="${HOME_DIR}/.config/kanshi/config"
mkdir -p "${APP_DIR}/scripts" "${APP_DIR}/data" "${BIN}" "${RUN_DIR}" "${HOME_DIR}"
install -m 0755 "${SCRIPTS_DIR}/kiosk-outputs.sh" "${APP_DIR}/scripts/kiosk-outputs.sh"
: > "${RUN_DIR}/wayland-0"

LISTING="${WORK}/listing"
WLR_LOG="${WORK}/wlr-randr.log"
KANSHI_LOG="${WORK}/kanshi.log"
PKILL_LOG="${WORK}/pkill.log"
LOGGER_LOG="${WORK}/logger.log"
PGREP_ANSWER="${WORK}/pgrep-answer"
REFUSE_MODES="${WORK}/refuse-modes"
KANSHI_DIES="${WORK}/kanshi-dies"

# Stub wlr-randr: with no arguments it prints the listing the test wants the
# compositor to report; otherwise it logs its arguments. --mode fails while
# the refuse-modes file exists, as for a mode the monitor does not list.
cat > "${BIN}/wlr-randr" <<EOF
#!/usr/bin/env bash
if [ \$# -eq 0 ]; then cat "${LISTING}"; exit 0; fi
echo "\$*" >> "${WLR_LOG}"
if [ -e "${REFUSE_MODES}" ] && [ "\${3:-}" = "--mode" ]; then exit 1; fi
exit 0
EOF

# Stub kanshi: logs how it was started, then stays up like the real daemon,
# or exits at once while the kanshi-dies file exists (a config it rejects).
cat > "${BIN}/kanshi" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${KANSHI_LOG}"
if [ -e "${KANSHI_DIES}" ]; then exit 1; fi
echo "\$\$" >> "${KANSHI_PIDS}"
exec sleep 30
EOF

# Stub pgrep: answers whatever pid the test wrote, or nothing.
cat > "${BIN}/pgrep" <<EOF
#!/usr/bin/env bash
if [ -s "${PGREP_ANSWER}" ]; then cat "${PGREP_ANSWER}"; exit 0; fi
exit 1
EOF

cat > "${BIN}/pkill" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${PKILL_LOG}"
exit 0
EOF

# Stub systemd-cat: drops its -t option and runs the command, as the real one
# execs it.
cat > "${BIN}/systemd-cat" <<EOF
#!/usr/bin/env bash
[ "\${1:-}" = "-t" ] && shift 2
exec "\$@"
EOF

cat > "${BIN}/logger" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${LOGGER_LOG}"
EOF
chmod +x "${BIN}"/*

# One output block as wlr-randr prints it: name, enabled, then its modes.
block() {
  local name="$1" enabled="$2"
  shift 2
  echo "${name} \"Some Vendor MODEL 1234 (${name})\""
  echo "  Make: Some Vendor"
  echo "  Enabled: ${enabled}"
  echo "  Modes:"
  local mode
  for mode in "$@"; do
    echo "    ${mode} px, 60.000000 Hz"
  done
  echo "  Position: 0,0"
  echo "  Transform: normal"
}

reset_state() {
  : > "${WLR_LOG}"
  : > "${KANSHI_LOG}"
  : > "${PKILL_LOG}"
  : > "${LOGGER_LOG}"
  : > "${PGREP_ANSWER}"
  rm -f "${REFUSE_MODES}" "${KANSHI_DIES}"
  rm -rf "${HOME_DIR}/.config"
  stop_stub_kanshi
  block HDMI-A-1 yes 1920x1080 1280x720 > "${LISTING}"
  printf 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="90"\nPI_VARIANT="lite"\n' > "${APP_DIR}/data/kiosk.conf"
}

# run <action> [PATH]: the script as a launcher or the app would run it, with
# the stubs first on PATH (or the PATH given).
run() {
  local path="${2:-${BIN}:/usr/bin:/bin}"
  env -i HOME="${HOME_DIR}" PATH="${path}" XDG_RUNTIME_DIR="${RUN_DIR}" \
    HS_OUTPUTS_START_WAIT=0.3 \
    bash "${APP_DIR}/scripts/kiosk-outputs.sh" "$1"
}

fail() {
  echo "FAIL: $1"
  for f in "${KANSHI_CONF}" "${WLR_LOG}" "${KANSHI_LOG}" "${PKILL_LOG}" "${LOGGER_LOG}"; do
    echo "--- ${f#"${WORK}"/}"
    cat "${f}" 2>/dev/null || echo "(absent)"
  done
  exit 1
}

expect_config_line() {
  grep -qxF -- "$1" "${KANSHI_CONF}" 2>/dev/null || fail "expected the kanshi config to hold: $1"
}

# A kanshi config with exactly these lines, the header comment aside.
expect_config() {
  local want got
  want="$(printf '%s\n' "$@")"
  got="$(grep -v '^#' "${KANSHI_CONF}" 2>/dev/null || true)"
  [ "${got}" = "${want}" ] || { echo "--- want"; echo "${want}"; fail "kanshi config did not match"; }
}

expect_no_config() {
  [ ! -e "${KANSHI_CONF}" ] || fail "expected no kanshi config to be written"
}

expect_wlr() {
  grep -qxF -- "$1" "${WLR_LOG}" || fail "expected wlr-randr $1"
}

expect_no_wlr() {
  [ ! -s "${WLR_LOG}" ] || fail "expected no wlr-randr changes"
}

expect_no_kanshi_start() {
  [ ! -s "${KANSHI_LOG}" ] || fail "expected kanshi not to be started"
}

echo "Test 1: a launcher with no kanshi running writes the config and starts kanshi"
reset_state
run start
expect_config \
  'profile home-screens {' \
  '  output * transform 90 mode 1920x1080' \
  '}' \
  'profile home-screens-two-screens {' \
  '  output HDMI-A-1 transform 90 mode 1920x1080' \
  '  output *' \
  '}'
head -n 1 "${KANSHI_CONF}" | grep -q 'Written by Home Screens' || fail "expected the ownership marker on the first line"
grep -qxF -- "-c ${KANSHI_CONF}" "${KANSHI_LOG}" || fail "expected kanshi started with -c ${KANSHI_CONF}"
expect_no_wlr
if ls "${KANSHI_CONF}".tmp.* > /dev/null 2>&1; then fail "left a temporary config behind"; fi

echo "Test 2: a launcher that finds kanshi running reloads it instead of starting another"
reset_state
echo 4242 > "${PGREP_ANSWER}"
run start
expect_config_line '  output * transform 90 mode 1920x1080'
grep -qxF -- "-HUP -u $(id -u) -x kanshi" "${PKILL_LOG}" || fail "expected kanshi reloaded with SIGHUP"
expect_no_kanshi_start
expect_no_wlr

echo "Test 3: a save with kanshi running rewrites the config and reloads it"
reset_state
echo 4242 > "${PGREP_ANSWER}"
run start
printf 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="270"\n' > "${APP_DIR}/data/kiosk.conf"
: > "${PKILL_LOG}"
run apply
expect_config_line '  output * transform 270 mode 1920x1080'
expect_config_line '  output HDMI-A-1 transform 270 mode 1920x1080'
grep -qxF -- "-HUP -u $(id -u) -x kanshi" "${PKILL_LOG}" || fail "expected the save to reload kanshi"
expect_no_kanshi_start
expect_no_wlr

echo "Test 4: a save never starts kanshi, and sets the screen once when none is running"
reset_state
run apply
expect_config_line '  output * transform 90 mode 1920x1080'
expect_no_kanshi_start
[ ! -s "${PKILL_LOG}" ] || fail "nothing was running to reload"
expect_wlr '--output HDMI-A-1 --transform 90'
expect_wlr '--output HDMI-A-1 --mode 1920x1080'

echo "Test 5: no kanshi installed sets the screen once and writes no config"
reset_state
# A PATH holding every stub but kanshi.
NO_KANSHI_BIN="${WORK}/bin-no-kanshi"
rm -rf "${NO_KANSHI_BIN}"; mkdir -p "${NO_KANSHI_BIN}"
for stub in wlr-randr pgrep pkill systemd-cat logger; do cp "${BIN}/${stub}" "${NO_KANSHI_BIN}/"; done
run start "${NO_KANSHI_BIN}:/usr/bin:/bin"
expect_no_config
expect_wlr '--output HDMI-A-1 --transform 90'
expect_wlr '--output HDMI-A-1 --mode 1920x1080'
: > "${WLR_LOG}"
run apply "${NO_KANSHI_BIN}:/usr/bin:/bin"
expect_wlr '--output HDMI-A-1 --transform 90'

echo "Test 6: a resolution the monitor does not list stays out of the profile and is tried once"
reset_state
printf 'DISPLAY_MODE="1234x567"\nDISPLAY_TRANSFORM="90"\n' > "${APP_DIR}/data/kiosk.conf"
touch "${REFUSE_MODES}"
run start
expect_config_line '  output * transform 90'
expect_config_line '  output HDMI-A-1 transform 90'
if grep -v '^#' "${KANSHI_CONF}" | grep -q 'mode'; then fail "an unlisted mode reached the profile"; fi
expect_wlr '--output HDMI-A-1 --mode 1234x567'
expect_wlr '--output HDMI-A-1 --custom-mode 1234x567'
if grep -q -- '--transform' "${WLR_LOG}"; then fail "kanshi owns the rotation; wlr-randr must not set it too"; fi

echo "Test 7: two screens, the first switched off: the lit one is named in the two-screen profile"
reset_state
{ block DP-1 no 1920x1080; block HDMI-A-2 yes 1920x1080; } > "${LISTING}"
run start
expect_config_line '  output * transform 90 mode 1920x1080'
expect_config_line '  output HDMI-A-2 transform 90 mode 1920x1080'
expect_no_wlr

echo "Test 8: three screens: no profile can match, so the screen is also set once"
reset_state
{ block HDMI-A-1 yes 1920x1080; block HDMI-A-2 yes 1920x1080; block DSI-1 yes 800x480; } > "${LISTING}"
echo 4242 > "${PGREP_ANSWER}"
run apply
expect_wlr '--output HDMI-A-1 --transform 90'
expect_wlr '--output HDMI-A-1 --mode 1920x1080'

echo "Test 9: a save leaves someone else's kanshi config alone and sets the screen once"
reset_state
mkdir -p "$(dirname "${KANSHI_CONF}")"
printf 'profile desk {\n  output HDMI-A-1 transform 180\n}\n' > "${KANSHI_CONF}"
echo 4242 > "${PGREP_ANSWER}"
run apply
grep -q 'profile desk' "${KANSHI_CONF}" || fail "a save replaced a config Home Screens did not write"
[ ! -s "${PKILL_LOG}" ] || fail "a save reloaded a kanshi reading someone else's config"
expect_wlr '--output HDMI-A-1 --transform 90'

echo "Test 10: a launcher moves someone else's config aside once, then owns the file"
reset_state
mkdir -p "$(dirname "${KANSHI_CONF}")"
printf 'profile desk {\n  output HDMI-A-1 transform 180\n}\n' > "${KANSHI_CONF}"
run start
grep -q 'profile desk' "${KANSHI_CONF}.before-home-screens" || fail "expected the old config kept beside ours"
expect_config_line '  output * transform 90 mode 1920x1080'
# Someone else writes the file again; the first backup must survive.
printf 'profile second {\n  output * transform 180\n}\n' > "${KANSHI_CONF}"
stop_stub_kanshi
run start
grep -q 'profile desk' "${KANSHI_CONF}.before-home-screens" || fail "the first backup was overwritten"
expect_config_line '  output * transform 90 mode 1920x1080'

echo "Test 11: no rotation in kiosk.conf, or a value that is not a rotation, writes normal"
reset_state
printf 'DISPLAY_MODE="1920x1080"\n' > "${APP_DIR}/data/kiosk.conf"
run start
expect_config_line '  output * transform normal mode 1920x1080'
reset_state
printf 'DISPLAY_TRANSFORM="45; rm -rf /"\n' > "${APP_DIR}/data/kiosk.conf"
run start
expect_config_line '  output * transform normal'
expect_config_line '  output HDMI-A-1 transform normal'

echo "Test 12: kanshi that stops right after starting falls back to setting the screen once"
reset_state
touch "${KANSHI_DIES}"
run start
[ -s "${KANSHI_LOG}" ] || fail "expected a start attempt"
expect_wlr '--output HDMI-A-1 --transform 90'
expect_wlr '--output HDMI-A-1 --mode 1920x1080'

echo "Test 13: no compositor (a laptop, a chroot) does nothing at all, and says so with exit 3"
reset_state
rm -f "${RUN_DIR}/wayland-0"
for action in start apply; do
  set +e
  run "${action}"
  RC=$?
  set -e
  [ "${RC}" -eq 3 ] || fail "expected exit 3 from ${action} with no compositor, got ${RC}"
done
expect_no_config
expect_no_wlr
expect_no_kanshi_start
: > "${RUN_DIR}/wayland-0"

echo "Test 14: no screen reported at boot still writes a profile kanshi applies later"
reset_state
: > "${LISTING}"
run start
expect_config_line '  output * transform 90'
expect_config_line '  output HDMI-A-1 transform 90'
grep -qxF -- "-c ${KANSHI_CONF}" "${KANSHI_LOG}" || fail "expected kanshi started for a screen that is not on yet"

echo "Test 15: a save or a start while the monitor is disconnected keeps the resolution it had"
reset_state
echo 4242 > "${PGREP_ANSWER}"
run start
expect_config_line '  output * transform 90 mode 1920x1080'
# The monitor drops off the HDMI line (standby); someone saves a new rotation.
: > "${LISTING}"
printf 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="270"\n' > "${APP_DIR}/data/kiosk.conf"
run apply
expect_config_line '  output * transform 270 mode 1920x1080'
expect_config_line '  output HDMI-A-1 transform 270 mode 1920x1080'
# The Pi restarts with the screen still in standby.
run start
expect_config_line '  output * transform 270 mode 1920x1080'

echo "Test 16: a different resolution saved while the monitor is disconnected is not trusted"
reset_state
echo 4242 > "${PGREP_ANSWER}"
run start
: > "${LISTING}"
printf 'DISPLAY_MODE="1280x720"\nDISPLAY_TRANSFORM="90"\n' > "${APP_DIR}/data/kiosk.conf"
run apply
expect_config_line '  output * transform 90'
if grep -v '^#' "${KANSHI_CONF}" | grep -q 'mode'; then fail "a mode nobody checked reached the profile"; fi

echo "Test 17: a resolution the monitor stops listing leaves the profile once it is connected again"
reset_state
echo 4242 > "${PGREP_ANSWER}"
run start
expect_config_line '  output * transform 90 mode 1920x1080'
block HDMI-A-1 yes 1280x720 > "${LISTING}"
run apply
expect_config_line '  output * transform 90'
if grep -v '^#' "${KANSHI_CONF}" | grep -q 'mode'; then fail "a mode the monitor no longer lists stayed in the profile"; fi

echo "Test 18: anything but start or apply is refused"
reset_state
set +e
env -i HOME="${HOME_DIR}" PATH="${BIN}:/usr/bin:/bin" XDG_RUNTIME_DIR="${RUN_DIR}" \
  bash "${APP_DIR}/scripts/kiosk-outputs.sh" > /dev/null 2>&1
RC=$?
set -e
[ "${RC}" -eq 2 ] || fail "expected exit 2 with no action, got ${RC}"
expect_no_config

echo "All kiosk-outputs tests passed."
