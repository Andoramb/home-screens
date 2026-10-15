#!/usr/bin/env bash
# Display-only kiosk launcher. Reads DISPLAY_URL/BACKEND_URL from kiosk.conf,
# waits for the hub to respond, then launches Chromium pointed at the hub.
#
# This file used to be a heredoc inside install.sh, which meant every Pi
# froze its launcher at flash time — a Pi installed in March never gained a
# Chromium flag added in June. It is now a real repo file so the hub can
# serve it back to spokes through /api/display/kiosk-bundle (see
# scripts/kiosk-update.sh). Keep it self-contained: it is copied to
# ${APP_DIR}/scripts/ and runs with no repo checkout around it.
#
# NOTE ON THE FILENAME: this installs AS ${APP_DIR}/scripts/kiosk-launcher.sh,
# because that path is baked into the ~/.bash_profile autologin block on every
# Pi already in the field (see write_kiosk_block in lib/common.sh). The repo
# file carries the "-display" suffix only to distinguish it from the hub's
# launcher variant, which upgrade.sh generates at the same installed path.
#
# Boot-time strategy:
#   1. Try the hub immediately. If reachable, launch chromium with DISPLAY_URL.
#   2. Otherwise launch chromium with a local "Connecting…" splash and start a
#      background watcher. The watcher polls the hub; the moment it answers it
#      sends SIGTERM to chromium. labwc's autologin cycle then restarts the
#      whole stack and we re-enter this script — this time the immediate health
#      check succeeds and we open DISPLAY_URL directly.
#
# This pattern relies on the existing labwc-restart-on-exit cycle from the
# full install, so there is no DevTools fragility and no "exec foo &" confusion.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"

DISPLAY_URL=""
BACKEND_URL=""
DISPLAY_TRANSFORM=""
DISPLAY_MODE=""
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

if [ -z "${DISPLAY_URL}" ]; then
  echo "[kiosk-launcher] DISPLAY_URL not set in ${KIOSK_CONF}" >&2
  exit 1
fi

HUB_BASE_URL="${BACKEND_URL:-${DISPLAY_URL%/display/*}}"
SPLASH_URL="file://${APP_DIR}/share/connecting.html"

# hub_up <curl timeout>: is the hub answering. GET /api/health needs no login
# and ignores the hub's IP allowlist, so a spoke that is not allowlisted still
# learns whether the hub is up. A display-only install fetches this launcher
# from main, independently of the hub's version, so a hub from before that
# route answers 404 there; /api/system/build-id is the public route every hub
# has had, and it is asked next.
hub_up() {
  curl -fsS --max-time "$1" "${HUB_BASE_URL}/api/health" >/dev/null 2>&1 \
    || curl -fsS --max-time "$1" "${HUB_BASE_URL}/api/system/build-id" >/dev/null 2>&1
}

# Single immediate health check. We don't loop here because labwc's
# autologin-on-exit cycle re-runs this script every few seconds anyway,
# and we want the splash to render in the meantime.
HUB_UP="false"
hub_up 5 && HUB_UP="true"

# The update check runs BEFORE any of the boot side effects below, because it
# can end in `exec "$0"`. Anything started first would be started twice: the
# backgrounded screen-settings and wtype subshells survive an exec, so a
# relaunching boot would set the screen up twice.
if [ "${HUB_UP}" = "true" ] && [ -z "${HS_KIOSK_RELAUNCHED:-}" ]; then
  # The hub answered, so this is the cheapest moment to pull the shell layer
  # forward: we are about to start Chromium anyway, so applying an update and
  # re-execing costs the user nothing. kiosk-update.sh exits 10 when it
  # actually swapped files in.
  #
  # HS_KIOSK_RELAUNCHED guards against an exec loop: if the freshly installed
  # launcher somehow reports "applied" again, the second pass skips the check
  # entirely and just starts Chromium.
  UPDATER="${APP_DIR}/scripts/kiosk-update.sh"
  if [ -x "${UPDATER}" ]; then
    UPDATE_RC=0
    "${UPDATER}" --timeout 20 || UPDATE_RC=$?
    if [ "${UPDATE_RC}" -eq 10 ]; then
      echo "[kiosk-launcher] display software updated — relaunching" >&2
      export HS_KIOSK_RELAUNCHED=1
      # "$0" rather than a literal name: the updater just replaced this file
      # by rename, so re-execing the same path picks up the new script.
      exec "$0" "$@"
    fi
  fi
fi

# labwc switches a newly connected screen on by itself. Some monitors drop
# their HDMI connection every few seconds while they sit without a signal, so
# while the power agent held the screen off, every return lit it for up to
# 3 s: a flash every ten seconds all night. From labwc 0.8.3 the setting
# below leaves switching screens on to kanshi, which the power agent stops
# while the screen is off. The hub's rc.xml gets it from scripts/labwc-rc.sh;
# a display-only Pi's rc.xml was written once by install.sh, so it is added
# here, once, and labwc reloads. Needs kanshi, which is what switches the
# screen on at boot from then on. The labwc version comes from LABWC_VER,
# which labwc sets for its session, with the binary as the fallback.
LABWC_RC="${HOME}/.config/labwc/rc.xml"
labwc_at_least() {
  local have major minor patch wmajor wminor wpatch
  have="${LABWC_VER:-$(labwc --version 2>/dev/null)}"
  have="$(printf '%s\n' "${have}" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)"
  [ -n "${have}" ] || return 1
  IFS=. read -r major minor patch <<< "${have}"
  IFS=. read -r wmajor wminor wpatch <<< "$1"
  [ "${major}" -gt "${wmajor}" ] && return 0
  [ "${major}" -lt "${wmajor}" ] && return 1
  [ "${minor}" -gt "${wminor}" ] && return 0
  [ "${minor}" -lt "${wminor}" ] && return 1
  [ "${patch}" -ge "${wpatch}" ]
}
if [ -f "${LABWC_RC}" ] && ! grep -q 'autoEnableOutputs' "${LABWC_RC}" \
   && command -v kanshi >/dev/null 2>&1 && labwc_at_least 0.8.3; then
  sed -i 's|<labwc_config>|<labwc_config>\n  <core>\n    <autoEnableOutputs>no</autoEnableOutputs>\n  </core>|' "${LABWC_RC}"
  pkill -HUP -x labwc 2>/dev/null || true
fi

# Rotation and resolution, from kiosk.conf. Same flow as the full install:
# kiosk-outputs.sh hands them to kanshi and starts it, and kanshi puts them
# back whenever a monitor reconnects; labwc itself forgets them. The wait lets
# labwc finish bringing its outputs up.
#
# The helper can be missing for one boot. A kiosk-update.sh from before it
# existed installs only the files it knows, this launcher among them, and
# relaunches straight into it; the next update check fetches the rest. Until
# then set the screen once, the way this launcher always did, rather than
# leave a portrait wall sideways. The awk is the one in kiosk-outputs.sh
# (scripts/__tests__/output-detection.test.ts keeps the two identical).
#
# With <core><autoEnableOutputs>no</autoEnableOutputs></core> in rc.xml (see
# below) labwc leaves the screen off until kanshi switches it on, so this runs
# in the foreground: wait up to 2 s for labwc to list the screen, start
# kanshi, then wait up to 5 s for a lit screen before Chromium opens, or it
# would size its window to no screen at all. On a setup without that line
# both waits end at once.
if [ -x "${APP_DIR}/scripts/kiosk-outputs.sh" ]; then
  for _i in $(seq 1 10); do
    wlr-randr 2>/dev/null | grep -q '^[^[:space:]]' && break
    sleep 0.2
  done
  "${APP_DIR}/scripts/kiosk-outputs.sh" start
  for _i in $(seq 1 25); do
    wlr-randr 2>/dev/null | grep -Eq '^[[:space:]]+Enabled: yes' && break
    sleep 0.2
  done
elif [ -n "${DISPLAY_TRANSFORM}" ] || [ -n "${DISPLAY_MODE}" ]; then
  OUTPUT=$(wlr-randr 2>/dev/null | awk '/^[^[:space:]]/{n=$1;if(f=="")f=n}/^[[:space:]]+Enabled: yes/{if(n!=""){print n;d=1;exit}}END{if(!d)print(f!=""?f:"HDMI-A-1")}')
  [ -n "${DISPLAY_TRANSFORM}" ] && (sleep 1 && wlr-randr --output "${OUTPUT}" --transform "${DISPLAY_TRANSFORM}") &
  [ -n "${DISPLAY_MODE}" ] && \
    (sleep 2 && wlr-randr --output "${OUTPUT}" --mode "${DISPLAY_MODE}" 2>/dev/null \
      || wlr-randr --output "${OUTPUT}" --custom-mode "${DISPLAY_MODE}" 2>/dev/null \
      || true) &
fi

(sleep 2 && wtype -M logo -k h -m logo) &

# Panel power agent: cuts the screen's power while the hub says this display
# is asleep (Sleep & dimming > "Switch the screen's power off too"). It
# watches our pid, which the exec below hands to Chromium, so it lives and
# dies with the browser. Must stay after the update-check block above: it
# would otherwise be started twice by a relaunching boot.
if [ -x "${APP_DIR}/scripts/kiosk-power-agent.sh" ]; then
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "$$" &
fi

CHROME_PREFS="${HOME}/.config/chromium/Default/Preferences"
if [ -f "${CHROME_PREFS}" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "${CHROME_PREFS}"
fi

# Purge session restore data so Chromium does not re-open the previous
# session's app window alongside the new --app window.  Without this, every
# reboot produces a duplicate tab that silently drains the command queue.
rm -rf "${HOME}/.config/chromium/Default/Sessions" 2>/dev/null || true

# Turn off Chromium's "Translate this page?" bubble. The page's <html lang>
# follows the configured locale, so a Danish display on an English-UI Chromium
# is offered a translation on every load. --disable-translate stopped doing
# anything years ago and no feature flag covers this: the offer is gated on the
# translate.enabled profile pref (what the TranslateEnabled policy sets), so
# seed it off before launch.
if [ -f "${CHROME_PREFS}" ]; then
  python3 -c 'import json,os,sys;p=sys.argv[1];d=json.load(open(p));d.setdefault("translate",{})["enabled"]=False;t=p+".tmp";f=open(t,"w");json.dump(d,f,separators=(",",":"));f.close();os.replace(t,p)' "${CHROME_PREFS}" 2>/dev/null || true
else
  mkdir -p "$(dirname "${CHROME_PREFS}")"
  echo '{"translate":{"enabled":false}}' > "${CHROME_PREFS}"
fi

if [ "${HUB_UP}" = "true" ]; then
  TARGET_URL="${DISPLAY_URL}"
else
  TARGET_URL="${SPLASH_URL}"
  # Background watcher: when the hub comes online, kill chromium so labwc
  # exits and the bash_profile auto-launch picks the real URL on the next
  # cycle. Loop terminates with chromium so we don't leak the watcher.
  (
    while sleep 5; do
      if hub_up 3; then
        pkill -TERM chromium 2>/dev/null || true
        break
      fi
    done
  ) &
fi

# Chromium's --kiosk flag requests fullscreen itself. labwc configs written
# before that flag fired ToggleFullscreen on every new window, which flipped
# Chromium's fullscreen straight back off and left its app title strip on
# screen. labwc has no non-toggle fullscreen action, so the rule has to go:
# strip it from an older rc.xml and reload labwc before Chromium maps.
LABWC_RC="${HOME}/.config/labwc/rc.xml"
if [ -f "${LABWC_RC}" ] && grep -q 'ToggleFullscreen' "${LABWC_RC}"; then
  sed -i '/ToggleFullscreen/d' "${LABWC_RC}"
  pkill -HUP -x labwc 2>/dev/null || true
fi

# Flag list must stay in step with the hub launcher in upgrade.sh and with
# start-display.sh. --remote-debugging-port is what lets a deploy reload the
# page over CDP instead of killing and relaunching the browser.
exec chromium \
  --app="${TARGET_URL}" \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --kiosk \
  --check-for-update-interval=31536000 \
  --password-store=basic \
  --ozone-platform=wayland \
  --remote-debugging-port=9222 \
  --ignore-gpu-blocklist \
  --enable-zero-copy \
  --num-raster-threads=2 \
  --force-gpu-mem-available-mb=256
