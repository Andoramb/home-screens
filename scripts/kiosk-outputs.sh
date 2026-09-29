#!/usr/bin/env bash
# Home Screens screen settings: puts the kiosk screen's rotation and
# resolution in place through kanshi, so they come back when a monitor
# reconnects.
#
# labwc keeps no output settings of its own, and wlr-randr only changes the
# output that exists right now. Some monitors drop off the HDMI connection
# whenever they lose signal (in standby, when the panel power agent switches
# them off, when someone presses the power button or changes input). When one
# comes back, labwc builds a fresh output with its defaults: the rotation is
# gone and a portrait wall shows landscape. kanshi is a small daemon that
# applies a profile each time the set of connected screens changes, so it puts
# the rotation back within milliseconds of the monitor reappearing. Raspberry
# Pi OS's own desktop uses it for the same job.
#
# This script is the only writer of those settings. The kiosk launchers and
# the app's save path call it instead of running wlr-randr themselves.
#
# Usage:
#   kiosk-outputs.sh start   From a kiosk launcher, inside the labwc session.
#                            Writes kanshi's config and starts kanshi, or
#                            reloads one that is already running (Raspberry Pi
#                            OS Desktop can autostart its own).
#   kiosk-outputs.sh apply   From everything else: a settings save, or
#                            rotate-display.sh. Rewrites the config and
#                            reloads the running kanshi. Never starts one: the
#                            save path runs inside the home-screens service,
#                            and anything started from there is killed with
#                            the service on its next restart (KillMode=mixed).
#
# Where kanshi cannot do the job (not installed yet, not running, a config
# someone else wrote, more screens than a profile covers) this falls back to
# what the launchers always did: wlr-randr sets the rotation and resolution
# once, and a reconnect loses them again.
#
# Exit status: 0 when the settings were handed over, 2 for a bad action, and
# 3 when there is no kiosk session to hand them to. Nothing is wrong in that
# last case and nothing was changed; rotate-display.sh uses it to say the
# rotation waits for the next restart instead of claiming it is on the screen.
#
# Reads DISPLAY_TRANSFORM and DISPLAY_MODE from data/kiosk.conf.
#
# kanshi behaviour this leans on (read from its source, 1.3.1 to 1.7, and
# checked on a Pi):
#   - SIGHUP rereads the config and applies the matching profile at once.
#   - A profile matches only when it names exactly as many outputs as are
#     connected, so one profile covers one screen and a second covers two.
#     kanshi 1.7 rejects a profile that names the same output twice, which
#     rules out a three-screen profile made of wildcards.
#   - A mode the monitor does not list fails the whole profile, rotation
#     included, so a mode is only written when the monitor lists it (or did
#     the last time it was connected; see KANSHI_MODE below).
#   - Applying a profile switches a dark panel back on. The power agent turns
#     it off again within a few seconds, so a save made while the wall sleeps
#     lights it briefly.
#
# Test hooks (never set in production):
#   HS_OUTPUTS_START_WAIT   seconds to wait before checking a started kanshi
#                           is still running (default 1)
#
# Keep this self-contained: it ships to display-only Pis through the kiosk
# bundle and runs with no repo checkout around it.
set -u

ACTION="${1:-}"
case "${ACTION}" in
  start|apply) ;;
  *)
    echo "usage: $0 start|apply" >&2
    exit 2
    ;;
esac

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
KANSHI_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/kanshi"
KANSHI_CONF="${KANSHI_DIR}/config"
KANSHI_BACKUP="${KANSHI_CONF}.before-home-screens"
MARKER="Written by Home Screens"
START_WAIT="${HS_OUTPUTS_START_WAIT:-1}"
USER_ID="$(id -u)"

log() {
  logger -t home-screens-outputs "$*" 2>/dev/null || true
}

# The save path runs inside the home-screens service, which sets neither
# variable; the kiosk session has both.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${USER_ID}}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
if [ ! -e "${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY}" ]; then
  # No compositor: a laptop or a Docker box running the app, a hub with no
  # screen attached, the image build chroot. Nothing to set.
  exit 3
fi

DISPLAY_TRANSFORM=""
DISPLAY_MODE=""
# shellcheck disable=SC1090
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

# kiosk.conf only ever carries the four real rotations; anything else reads as
# unrotated, which is also how the page treats it.
case "${DISPLAY_TRANSFORM}" in
  90|180|270) TRANSFORM="${DISPLAY_TRANSFORM}" ;;
  *) TRANSFORM="normal" ;;
esac
MODE=""
[[ "${DISPLAY_MODE}" =~ ^[0-9]+x[0-9]+$ ]] && MODE="${DISPLAY_MODE}"

LISTING="$(wlr-randr 2>/dev/null || true)"

# The output to drive: the first enabled one. wlr-randr lists disabled
# connectors too ("Enabled: no"), so taking the first line put the rotation on
# a dark screen whenever a second port was connected but switched off,
# including for anyone who ran `wlr-randr --output X --off` to get it out of
# the way. Falls back to the first output named, then to HDMI-A-1, so a
# machine that reports nothing behaves as it always did.
OUTPUT=$(printf '%s\n' "${LISTING}" | awk '/^[^[:space:]]/{n=$1;if(f=="")f=n}/^[[:space:]]+Enabled: yes/{if(n!=""){print n;d=1;exit}}END{if(!d)print(f!=""?f:"HDMI-A-1")}')

# Screens connected right now, enabled or not: kanshi counts both.
HEADS=$(printf '%s\n' "${LISTING}" | grep -c '^[^[:space:]]' || true)

# Whether the chosen output lists this mode (width x height, any refresh).
mode_listed() {
  printf '%s\n' "${LISTING}" | awk -v out="${OUTPUT}" -v want="$1" '
    /^[^[:space:]]/ { cur = $1; next }
    cur == out && $1 == want && $2 == "px," { found = 1 }
    END { exit found ? 0 : 1 }'
}

# A config this script wrote, or none at all. Raspberry Pi OS Desktop's screen
# settings tool writes the same file, and so could a person.
config_is_ours() {
  [ ! -e "${KANSHI_CONF}" ] || grep -q "${MARKER}" "${KANSHI_CONF}" 2>/dev/null
}

# Whether the config already in place is ours and carries this mode, which
# means the monitor listed it the last time this ran with it connected.
mode_kept() {
  [ -f "${KANSHI_CONF}" ] && config_is_ours \
    && grep -qE "^  output .* mode $1\$" "${KANSHI_CONF}" 2>/dev/null
}

# The mode goes in the profile when the monitor lists it. With no screen
# connected there is no list to check: a monitor that drops off the HDMI line
# in standby is gone whenever the wall sleeps, and a save or a boot at that
# moment used to write the profile without the resolution, so the monitor
# came back at its own preferred size on every reconnect from then on. The
# mode already in the profile was checked while the monitor was there, so it
# stays. The next run with a screen connected checks it again.
KANSHI_MODE=""
if [ -n "${MODE}" ]; then
  if mode_listed "${MODE}"; then
    KANSHI_MODE=" mode ${MODE}"
  elif [ "${HEADS}" -eq 0 ] && mode_kept "${MODE}"; then
    KANSHI_MODE=" mode ${MODE}"
  fi
fi

# What the launchers did before kanshi: set the resolution once, trying the
# monitor's own mode list first and a custom mode after.
set_mode_once() {
  wlr-randr --output "${OUTPUT}" --mode "${MODE}" 2>/dev/null \
    || wlr-randr --output "${OUTPUT}" --custom-mode "${MODE}" 2>/dev/null \
    || log "wlr-randr could not set ${MODE} on ${OUTPUT}"
}

# Rotation and resolution once, as separate calls so a mode the monitor
# refuses cannot stop the rotation.
apply_once() {
  wlr-randr --output "${OUTPUT}" --transform "${TRANSFORM}" 2>/dev/null \
    || log "wlr-randr could not set rotation ${TRANSFORM} on ${OUTPUT}"
  if [ -n "${MODE}" ]; then
    set_mode_once
  fi
}

if ! command -v kanshi >/dev/null 2>&1; then
  apply_once
  exit 0
fi

kanshi_config() {
  cat <<EOF
# ${MARKER} (scripts/kiosk-outputs.sh) from data/kiosk.conf, and replaced
# whenever the screen settings change. Set the rotation in Settings, not here.
profile home-screens {
  output * transform ${TRANSFORM}${KANSHI_MODE}
}
profile home-screens-two-screens {
  output ${OUTPUT} transform ${TRANSFORM}${KANSHI_MODE}
  output *
}
EOF
}

# Written beside the real file and renamed over it, so a reload never reads
# half a config.
write_config() {
  local tmp="${KANSHI_CONF}.tmp.$$"
  mkdir -p "${KANSHI_DIR}" 2>/dev/null || return 1
  if kanshi_config > "${tmp}" 2>/dev/null && mv -f "${tmp}" "${KANSHI_CONF}" 2>/dev/null; then
    return 0
  fi
  rm -f "${tmp}"
  return 1
}

kanshi_running() {
  [ -n "$(pgrep -u "${USER_ID}" -x kanshi 2>/dev/null)" ]
}

SETTINGS="rotation ${TRANSFORM}${KANSHI_MODE:+, ${MODE}}"

start_kanshi() {
  # systemd-cat puts kanshi's own messages in the journal, under
  # home-screens-kanshi. It execs kanshi, so the pid below is kanshi's.
  if command -v systemd-cat >/dev/null 2>&1; then
    systemd-cat -t home-screens-kanshi kanshi -c "${KANSHI_CONF}" < /dev/null &
  else
    kanshi -c "${KANSHI_CONF}" < /dev/null > /dev/null 2>&1 &
  fi
  local pid=$!
  # A config kanshi cannot read makes it exit at once. Notice that rather than
  # leave the screen unrotated.
  sleep "${START_WAIT}"
  if kill -0 "${pid}" 2>/dev/null; then
    log "started kanshi: ${SETTINGS}"
    return 0
  fi
  log "kanshi stopped right after starting; setting the screen once instead"
  return 1
}

if ! config_is_ours; then
  if [ "${ACTION}" = "apply" ]; then
    log "${KANSHI_CONF} was not written by Home Screens; leaving it alone and setting the screen once"
    apply_once
    exit 0
  fi
  # Only a kiosk launcher runs start, which makes this machine a Home Screens
  # kiosk: a config left over from the desktop's screen settings is stale by
  # definition. The first one is kept, once.
  if [ -e "${KANSHI_BACKUP}" ]; then
    log "replacing a kanshi config Home Screens did not write (the first one is kept at ${KANSHI_BACKUP})"
  elif mv -f "${KANSHI_CONF}" "${KANSHI_BACKUP}" 2>/dev/null; then
    log "moved a kanshi config Home Screens did not write to ${KANSHI_BACKUP}"
  fi
fi

if ! write_config; then
  log "could not write ${KANSHI_CONF}; setting the screen once instead"
  apply_once
  exit 0
fi

if kanshi_running; then
  pkill -HUP -u "${USER_ID}" -x kanshi 2>/dev/null || true
  log "reloaded kanshi: ${SETTINGS}"
elif [ "${ACTION}" = "start" ]; then
  if ! start_kanshi; then
    apply_once
    exit 0
  fi
else
  # A kiosk session that started before kanshi was installed: an update
  # waiting for its restart. The config is ready for the next session; set
  # the screen the old way until then.
  log "kanshi is not running yet; setting the screen once for now"
  apply_once
  exit 0
fi

if [ "${HEADS}" -gt 2 ]; then
  # No profile matches three screens (see the top of this file), so kanshi
  # leaves them alone.
  apply_once
elif [ -n "${MODE}" ] && [ -z "${KANSHI_MODE}" ]; then
  # The monitor does not list the configured resolution, so kanshi was not
  # given it. Try it once as a custom mode, as before; a reconnect loses it.
  set_mode_once
fi
exit 0
