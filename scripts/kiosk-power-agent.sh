#!/usr/bin/env bash
# Home Screens panel power agent.
#
# Sleep in Home Screens is a black layer the browser paints over the page; the
# HDMI signal stays live and an LCD backlight glows in a dark room. This agent
# is what actually cuts the panel's power. It runs inside the kiosk session
# (spawned by the kiosk launcher before Chromium starts, on hub Pis and
# display-only spokes alike), polls the hub's power-state endpoint, and drives
# the panel with wlopm, which speaks the wlr-output-power-management protocol
# labwc implements. Unlike `wlr-randr --off`, wlopm keeps the output in the
# layout, so the Chromium window, rotation and mode all survive. Some monitors
# drop off the HDMI connection once their signal stops, though, and come back
# as a new output with labwc's defaults; kanshi (see kiosk-outputs.sh) puts
# the rotation and resolution back when they do.
#
# The hub decides, this script obeys. `GET /api/display/power-state` answers
# `off` only while the display has opted in (Sleep & dimming > "Switch the
# screen's power off too"), its browser reports asleep, and that heartbeat is
# fresh. Every ambiguity on either side resolves to ON: three failed polls in
# a row force the panel on, and the EXIT trap turns it on when this script
# dies, so a kiosk restart mid-sleep never strands the panel dark.
#
# It asks every 3 s while the panel is off, so a touch or a remote wake lights
# the panel almost at once, and every 15 s while it is on: that is nearly all
# of the time, and it only delays the panel following the overlay into sleep.
#
# Some monitors drop their HDMI connection every few seconds while they sit
# without a signal, looking for one. labwc switches a returning screen on by
# itself, so each return lit the panel until the next 3 s check: a flash
# every ten seconds all night. From labwc 0.8.3 scripts/labwc-rc.sh turns
# that off (<core><autoEnableOutputs>no</autoEnableOutputs></core>) and
# leaves switching screens on to kanshi. While that line is in rc.xml, this
# agent stops kanshi before it cuts the power and starts it again (through
# kiosk-outputs.sh, the owner of kanshi and its config) when the hub says on,
# so a monitor that reconnects while dark is created switched off and stays
# that way. A state file in XDG_RUNTIME_DIR (home-screens-panel: "on" or
# "off") tells kiosk-outputs.sh not to light the screen for a save made
# meanwhile. The 3 s re-check stays for every other setup, and now says in
# the journal when it had to switch a screen off again.
#
# Usage:
#   kiosk-power-agent.sh [<watch-pid>]
#
#   watch-pid   Exit (and restore power) once this pid is gone. The launcher
#               passes its own $$, which `exec chromium` preserves, so the
#               agent lives exactly as long as the browser.
#
# Configuration comes from data/kiosk.conf (BACKEND_URL, DISPLAY_ID). A hub Pi
# has neither: it asks as `main` at localhost on the port in data/port.conf.
#
# Test hooks (never set in production):
#   HS_POWER_STATE_URL          full URL to poll instead of the hub (curl handles file://)
#   HS_POWER_POLL_SECONDS       poll interval while the panel is off (default 3)
#   HS_POWER_IDLE_POLL_SECONDS  poll interval while the panel is on (default 15)
#   HS_POWER_RETRY_SECONDS      how often to look for a missing wlopm (default 60)
#   HS_POWER_REASSERT_LOG_SECONDS  how often repeated switch-offs are summed up (default 600)
#
# Keep this self-contained: it ships to spokes through the kiosk bundle and
# runs with no repo checkout around it.
set -u

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
WATCH_PID="${1:-}"
POLL_SECONDS="${HS_POWER_POLL_SECONDS:-3}"
IDLE_POLL_SECONDS="${HS_POWER_IDLE_POLL_SECONDS:-15}"
RETRY_SECONDS="${HS_POWER_RETRY_SECONDS:-60}"
REASSERT_LOG_SECONDS="${HS_POWER_REASSERT_LOG_SECONDS:-600}"
USER_ID="$(id -u)"
XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${USER_ID}}"
PANEL_STATE_FILE="${XDG_RUNTIME_DIR}/home-screens-panel"
# Left by kiosk-outputs.sh when a save arrived while the screen was held off
# and nothing could apply it; the wake replays it (see set_power).
DEFERRED_FILE="${XDG_RUNTIME_DIR}/home-screens-outputs-deferred"
LABWC_RC="${HOME}/.config/labwc/rc.xml"
OUTPUTS_SCRIPT="${APP_DIR}/scripts/kiosk-outputs.sh"
# Consecutive failed polls before the panel is forced on. Only a dark panel
# polls fast enough for this to matter, so it is nine seconds of hub silence —
# long enough to ride out a restart of the hub service, short enough that a
# dead hub never leaves a dark panel for long.
MAX_FAILURES=3

log() {
  logger -t home-screens-power "$*" 2>/dev/null || true
}

# A spoke can receive this script through the bundle before the apt package
# lands (the archive was unreachable, say); the nightly update retries the
# package without restarting Chromium. So a missing wlopm is a wait, not an
# exit: keep watching the browser and start the moment the command appears.
# Until then the black overlay covers sleep, exactly as before.
if ! command -v wlopm >/dev/null 2>&1; then
  log "wlopm is not installed; waiting for it before controlling panel power"
  while ! command -v wlopm >/dev/null 2>&1; do
    if [ -n "${WATCH_PID}" ] && ! kill -0 "${WATCH_PID}" 2>/dev/null; then
      exit 0
    fi
    sleep "${RETRY_SECONDS}"
  done
  log "wlopm is now installed; panel power control starting"
fi

BACKEND_URL=""
DISPLAY_ID=""
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

if [ -z "${DISPLAY_ID}" ]; then
  DISPLAY_ID="main"
fi
if [ -z "${BACKEND_URL}" ]; then
  PORT=3000
  if [ -f "${APP_DIR}/data/port.conf" ]; then
    _p=$(tr -d '[:space:]' < "${APP_DIR}/data/port.conf")
    [[ "${_p}" =~ ^[0-9]+$ ]] && PORT="${_p}"
  fi
  BACKEND_URL="http://localhost:${PORT}"
fi

if [ -n "${HS_POWER_STATE_URL:-}" ]; then
  URL="${HS_POWER_STATE_URL}"
  # A test URL is taken verbatim: no query parameters are appended to it.
  REPORT_APPLIED="false"
else
  URL="${BACKEND_URL}/api/display/power-state?display=${DISPLAY_ID}"
  REPORT_APPLIED="true"
fi

# The state this agent last set. Boot state is always on: labwc enables
# outputs when it starts, and we assert it below so a previous agent that
# died without its trap cannot leave a stale off behind.
APPLIED="on"
FAILURES=0
# Whether this agent stopped kanshi for the current dark spell.
KANSHI_STOPPED="false"

# Whether labwc has been told to leave new screens switched off (see the top
# of this file). Only then is stopping kanshi worth anything; on any other
# setup labwc lights a returning screen itself and kanshi only adds rotation.
kanshi_keeps_screens_dark() {
  grep -q '<autoEnableOutputs>no' "${LABWC_RC}" 2>/dev/null
}

# What the compositor lists: any head at all, and any head switched on. Both
# read as "no" when wlr-randr is missing, which leaves every decision below
# where it was.
listing() {
  wlr-randr 2>/dev/null || true
}
listing_has_heads() {
  printf '%s\n' "$1" | grep -q '^[^[:space:]]'
}
listing_has_lit_head() {
  printf '%s\n' "$1" | grep -Eq '^[[:space:]]+Enabled: yes'
}

# Writes the state kiosk-outputs.sh reads before setting a screen. Best
# effort: a runtime dir that cannot be written only costs the save-while-dark
# courtesy, never the power control.
write_panel_state() {
  { printf '%s\n' "$1" > "${PANEL_STATE_FILE}"; } 2>/dev/null || true
}

stop_kanshi() {
  if kanshi_keeps_screens_dark && pkill -u "${USER_ID}" -x kanshi 2>/dev/null; then
    KANSHI_STOPPED="true"
    log "stopped kanshi so a screen that reconnects stays dark"
  fi
}

# Starts kanshi again through kiosk-outputs.sh, which rewrites its config
# from kiosk.conf first, so a rotation saved while the wall slept lands now.
start_kanshi() {
  if [ "${KANSHI_STOPPED}" = "true" ]; then
    KANSHI_STOPPED="false"
    if [ -x "${OUTPUTS_SCRIPT}" ]; then
      "${OUTPUTS_SCRIPT}" start >/dev/null 2>&1 || true
      log "started kanshi again"
    fi
  fi
}

set_power() {
  # $1 is "on" or "off". Records what was applied only on success, so a
  # failed wlopm call is retried on the next tick rather than assumed.
  if [ "$1" = "off" ]; then
    write_panel_state off
    stop_kanshi
  else
    write_panel_state on
    # A screen that reconnected while dark exists but is switched off, and
    # kanshi is what switches it on with the right rotation and size: start
    # it first, so the screen does not come up sideways for a moment. The
    # usual case, a screen that never went away, is lit by wlopm alone and
    # kanshi starts afterwards, off the wake path.
    if [ "${KANSHI_STOPPED}" = "true" ]; then
      heads="$(listing)"
      if listing_has_heads "${heads}" && ! listing_has_lit_head "${heads}"; then
        start_kanshi
      fi
    fi
  fi
  if wlopm "--$1" '*' 2>/dev/null; then
    if [ "${APPLIED}" != "$1" ]; then
      log "panel $1"
    fi
    APPLIED="$1"
  else
    log "wlopm --$1 failed"
    if [ "$1" = "off" ]; then
      # The screen is still on, so undo what was done for a dark one: a hub
      # that says on before the retry lands would otherwise find APPLIED
      # already on, skip set_power, and leave kanshi stopped with the state
      # file saying off, deferring every save while the wall is awake.
      write_panel_state on
      start_kanshi
    fi
  fi
  if [ "$1" = "on" ]; then
    start_kanshi
    # A save made while the screen was held off, on a setup where kanshi was
    # not there to restart: kiosk-outputs.sh start reloads or starts kanshi,
    # or sets the screen once without it, and clears the marker.
    if [ -e "${DEFERRED_FILE}" ] && [ -x "${OUTPUTS_SCRIPT}" ]; then
      log "applying screen settings saved while the screen was off"
      "${OUTPUTS_SCRIPT}" start >/dev/null 2>&1 || true
    fi
  fi
}

# The 3 s re-check found a screen on while it should be off: a monitor that
# reconnected, or a save that reloaded kanshi. Said once at the time, then
# summed up, because one monitor can do this every ten seconds all night.
REASSERTS=0
REASSERTS_SAID_AT=-1
note_reassert() {
  REASSERTS=$((REASSERTS + 1))
  if [ "${REASSERTS_SAID_AT}" -lt 0 ]; then
    log "switched the screen off again after it came back on by itself"
    REASSERTS_SAID_AT="${SECONDS}"
  elif [ $((SECONDS - REASSERTS_SAID_AT)) -ge "${REASSERT_LOG_SECONDS}" ]; then
    log "switched the screen off again ${REASSERTS} times since the last note"
    REASSERTS=0
    REASSERTS_SAID_AT="${SECONDS}"
  fi
}

# Any output the compositor currently reports as on. Used while the desired
# state is off: some monitors run input detection after losing signal and
# briefly present as reconnected, which labwc auto-enables, so a single
# `--off` is not enough. Empty output (or an unparseable listing) is treated
# as "nothing to re-assert" rather than as a reason to hammer wlopm.
any_output_on() {
  wlopm 2>/dev/null | grep -Eq '[[:space:]]on$'
}

restore_on_exit() {
  rm -f "${PANEL_STATE_FILE}" 2>/dev/null || true
  wlopm --on '*' 2>/dev/null || true
  # kanshi comes back only while the browser is still there to need it. When
  # the browser is gone the session is ending, and the next session's launcher
  # starts its own kanshi; one started from here could land in that session
  # beside it.
  if [ -z "${WATCH_PID}" ] || kill -0 "${WATCH_PID}" 2>/dev/null; then
    start_kanshi
  fi
}
trap restore_on_exit EXIT
# A signal must end the loop, not just interrupt one sleep: a handler that
# returned would resume polling and could switch the panel straight back off.
# Exiting here runs the EXIT trap above, which is where power is restored.
trap 'exit 143' INT TERM

set_power on

while :; do
  if [ -n "${WATCH_PID}" ] && ! kill -0 "${WATCH_PID}" 2>/dev/null; then
    break
  fi

  poll_url="${URL}"
  if [ "${REPORT_APPLIED}" = "true" ]; then
    poll_url="${URL}&applied=${APPLIED}"
  fi

  if body=$(curl -fsS --max-time 3 "${poll_url}" 2>/dev/null); then
    FAILURES=0
    if printf '%s' "${body}" | grep -Eq '"power"[[:space:]]*:[[:space:]]*"off"'; then
      desired="off"
    else
      desired="on"
    fi
  else
    FAILURES=$((FAILURES + 1))
    if [ "${FAILURES}" -ge "${MAX_FAILURES}" ]; then
      desired="on"
    else
      desired="${APPLIED}"
    fi
  fi

  if [ "${desired}" != "${APPLIED}" ]; then
    set_power "${desired}"
  elif [ "${desired}" = "off" ] && any_output_on; then
    note_reassert
    set_power off
  elif [ "${desired}" = "on" ] && kanshi_keeps_screens_dark; then
    # Nothing but kanshi lights a screen on this setup. Should it be gone
    # (it crashed, or an earlier agent died after stopping it) a monitor that
    # reconnects would stay dark for good, so the idle tick checks for a
    # connected screen that is off and has kiosk-outputs.sh start kanshi,
    # which falls back to setting the screen once when it cannot.
    heads="$(listing)"
    if listing_has_heads "${heads}" && ! listing_has_lit_head "${heads}" && [ -x "${OUTPUTS_SCRIPT}" ]; then
      log "a connected screen is off while the display is awake; starting kanshi"
      "${OUTPUTS_SCRIPT}" start >/dev/null 2>&1 || true
    fi
  fi

  if [ "${APPLIED}" = "off" ]; then
    sleep "${POLL_SECONDS}"
  else
    sleep "${IDLE_POLL_SECONDS}"
  fi
done
