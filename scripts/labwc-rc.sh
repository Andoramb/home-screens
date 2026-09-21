#!/usr/bin/env bash
# Writes labwc's rc.xml for the hub's kiosk session, the only writer of that
# file on a full install.
#
# Usage: labwc-rc.sh [--create]
#   --create   write the file whatever is there, or when nothing is
#              (setup-system, which only runs on a kiosk install). Without it
#              the file is replaced only when it carries the marker line below,
#              which is to say only when an earlier run of this script wrote
#              it. The app calls this after every save that changes kiosk.conf,
#              and the app also runs on laptops and on desktops whose labwc
#              config belongs to the person using them: an rc.xml merely
#              existing says nothing about whose it is.
#
# Prints "changed" when it rewrote the file, nothing otherwise.
#
# The file is owned outright rather than merged with what is there: that is
# what let one release remove the ToggleFullscreen rule from every install.
# The price was that an update erased anything added by hand, and the one
# thing people do add by hand is a touch calibration matrix, because labwc
# turns the picture with the output but leaves touch input where it was. So
# the matrix is written from here instead, read out of kiosk.conf:
#
#   DISPLAY_TRANSFORM   touch follows the rotation (the table below)
#   TOUCH_MATRIX        six numbers that replace the table, for a panel that
#                       reports an axis backwards or is mounted differently
#                       from its touch layer; "1 0 0 0 1 0" leaves touch alone
#
# The matrix is always written, the one that changes nothing included. labwc
# before 0.9.8 only ever sets a matrix on reload and never clears one, so
# dropping the block when a screen goes back to unrotated left touch turned
# until the next reboot. (From 0.9.8 it resets to the device default first.)
# The cost: a default matrix set through udev is overridden; type those six
# numbers into Settings instead.
#
# The matrix is the first two rows of libinput's 3x3 calibration matrix, and
# `category="touch"` applies it to every touchscreen, so no device name is
# needed.
set -u

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
LABWC_DIR="${HOME}/.config/labwc"
RC="${LABWC_DIR}/rc.xml"

MARKER="Written by Home Screens"
if [ "${1:-}" != "--create" ] && ! grep -q "${MARKER}" "${RC}" 2>/dev/null; then
  exit 0
fi

DISPLAY_TRANSFORM=""
TOUCH_MATRIX=""
# shellcheck disable=SC1090
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

NUM='-?[0-9]+(\.[0-9]+)?'
SIX_NUMBERS="^(${NUM} ){5}${NUM}\$"
if [[ "${TOUCH_MATRIX}" =~ ${SIX_NUMBERS} ]]; then
  MATRIX="${TOUCH_MATRIX}"
else
  # libinput's own matrices for a screen turned clockwise by this much.
  case "${DISPLAY_TRANSFORM}" in
    90)  MATRIX="0 -1 1 1 0 0" ;;
    180) MATRIX="-1 0 1 0 -1 1" ;;
    270) MATRIX="0 1 0 -1 0 1" ;;
    *)   MATRIX="1 0 0 0 1 0" ;;
  esac
fi

DESIRED_RC="<?xml version=\"1.0\"?>
<!-- ${MARKER} (scripts/labwc-rc.sh) and replaced on every update. Touch alignment is set in Settings, not here. -->
<labwc_config>
  <windowRules>
    <windowRule identifier=\"*\" serverDecoration=\"no\" skipTaskbar=\"yes\" skipWindowSwitcher=\"yes\" />
  </windowRules>
  <keyboard>
    <keybind key=\"W-h\">
      <action name=\"HideCursor\"/>
    </keybind>
  </keyboard>
  <libinput>
    <device category=\"touch\">
      <calibrationMatrix>${MATRIX}</calibrationMatrix>
    </device>
  </libinput>
</labwc_config>"

if [ -f "${RC}" ] && [ "$(cat "${RC}")" = "${DESIRED_RC}" ]; then
  exit 0
fi

mkdir -p "${LABWC_DIR}"
echo "${DESIRED_RC}" > "${RC}"
# A running labwc keeps its config in memory, so reload it: otherwise the new
# matrix waits for a reboot, and a Chromium relaunch under this session would
# still meet old window rules. No labwc runs inside the image-build chroot,
# and pkill's miss is harmless there.
pkill -HUP -x labwc 2>/dev/null || true
echo "changed"
