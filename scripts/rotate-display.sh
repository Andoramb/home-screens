#!/usr/bin/env bash
set -euo pipefail

# Rotate the display on Raspberry Pi (Wayland/labwc).
#
# Usage:
#   bash scripts/rotate-display.sh          # interactive
#   bash scripts/rotate-display.sh 90       # rotate 90° clockwise (portrait)
#   bash scripts/rotate-display.sh 270      # rotate 270° (portrait, other way)
#   bash scripts/rotate-display.sh 180      # inverted
#   bash scripts/rotate-display.sh 0        # landscape (no rotation)
#
# The rotation is saved in data/kiosk.conf and put on the screen at once by
# kiosk-outputs.sh, which also keeps it there when the monitor reconnects.
#
# Run it as the user the kiosk runs as, without sudo: root has no kiosk
# session to put the rotation on, and its files would land in the wrong home.
#
# This ships to display-only Pis in the kiosk bundle, without lib/common.sh
# beside it, so the shared helpers are optional here.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/lib/common.sh" ]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/lib/common.sh"
else
  info() { echo "  $*"; }
fi

if [ -n "${1:-}" ]; then
  ANGLE="$1"
else
  echo ""
  echo "  Select rotation:"
  echo "  0)   Landscape (no rotation)"
  echo "  90)  Portrait (90° clockwise)"
  echo "  180) Inverted (180°)"
  echo "  270) Portrait (90° counter-clockwise)"
  echo ""
  read -rp "  Rotation [0]: " ANGLE
  ANGLE="${ANGLE:-0}"
fi

# kiosk.conf is sourced by bash, so only the four real rotations may reach it.
case "${ANGLE}" in
  0|90|180|270) ;;
  *)
    echo "  Rotation must be 0, 90, 180 or 270." >&2
    exit 1
    ;;
esac

if [ "$(id -u)" -eq 0 ]; then
  echo "  Run this without sudo, as the user the screen runs as." >&2
  exit 1
fi

APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"

# Change only the rotation line. On a display-only Pi this file also holds the
# hub's address and this display's id, and the launcher cannot start without
# them. The new text is written into the file that is there, not renamed over
# it, so the file keeps its owner: the app rewrites it on every save and
# cannot if it has become someone else's.
mkdir -p "$(dirname "${KIOSK_CONF}")"
TMP_CONF="${KIOSK_CONF}.tmp.$$"
if [ -f "${KIOSK_CONF}" ]; then
  grep -v '^DISPLAY_TRANSFORM=' "${KIOSK_CONF}" > "${TMP_CONF}" || true
else
  : > "${TMP_CONF}"
fi
if [ "${ANGLE}" != "0" ]; then
  echo "DISPLAY_TRANSFORM=\"${ANGLE}\"" >> "${TMP_CONF}"
fi
cat "${TMP_CONF}" > "${KIOSK_CONF}"
rm -f "${TMP_CONF}"

# Turn touch input with the picture (a no-op on a display-only Pi, which
# keeps its own rc.xml and does not ship the script).
[ -f "${APP_DIR}/scripts/labwc-rc.sh" ] && bash "${APP_DIR}/scripts/labwc-rc.sh" > /dev/null

# Put the rotation on the screen now. There may be no way to: the helper is
# not here yet (a display that has not updated), or no kiosk session is
# running for this user (over SSH as someone else), which the helper answers
# with a status other than 0. The rotation is saved either way.
APPLIED=0
if [ -x "${APP_DIR}/scripts/kiosk-outputs.sh" ] && "${APP_DIR}/scripts/kiosk-outputs.sh" apply; then
  APPLIED=1
fi

if [ "${APPLIED}" != "1" ]; then
  info "Rotation saved. It takes effect the next time this device restarts."
elif [ "${ANGLE}" = "0" ]; then
  info "Display set to landscape (no rotation)."
else
  info "Display rotated ${ANGLE}°."
fi

# Installs from before the kiosk launcher rotated from labwc's autostart. That
# line would set its own, older angle after the one above, so take it out.
# Only a rotation line: someone may keep another wlr-randr line of their own
# there, such as one that switches a second screen off.
AUTOSTART="${HOME}/.config/labwc/autostart"
if [ -f "${AUTOSTART}" ] && grep -q 'wlr-randr.*--transform' "${AUTOSTART}"; then
  grep -v 'wlr-randr.*--transform' "${AUTOSTART}" > "${AUTOSTART}.tmp.$$" || true
  cat "${AUTOSTART}.tmp.$$" > "${AUTOSTART}"
  rm -f "${AUTOSTART}.tmp.$$"
fi
