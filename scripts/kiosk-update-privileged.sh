#!/usr/bin/env bash
# Root half of the spoke self-update. Installed to a root-owned fixed path
# (/usr/local/lib/home-screens/kiosk-update-privileged.sh) and invoked by the
# unprivileged updater through a narrow sudoers drop-in:
#
#   <user> ALL=(root) NOPASSWD: /usr/local/lib/home-screens/kiosk-update-privileged.sh
#
# It takes NO arguments — deliberately. Everything it installs comes from one
# hard-coded staging directory, and it copies exactly the filenames listed in
# SYSTEM_FILES below to exactly the destinations listed there. There is no
# path the caller can influence, so the sudoers grant stays a grant to do one
# specific job rather than a general "copy any file as root" primitive.
#
# (An honest note on the trust boundary: the staged contents are written by
# the kiosk user, so this is not a defense against a compromised kiosk
# account — on a single-purpose Pi that account is the whole machine. What it
# does buy is that a bug in the updater cannot scribble on arbitrary root
# paths, and that the sudoers line reads as a single reviewable capability.)
set -euo pipefail

# HS_HELPER_APP_DIR and HS_HELPER_SELF exist for
# scripts/__tests__/kiosk-update-privileged.test.sh. They cannot reach a
# device's helper: sudo resets the environment, and the sudoers line above
# grants the command with no SETENV.
APP_DIR="${HS_HELPER_APP_DIR:-/opt/home-screens/current}"
STAGING="${APP_DIR}/data/kiosk-update-staging/system"
SELF="${HS_HELPER_SELF:-/usr/local/lib/home-screens/kiosk-update-privileged.sh}"

log() {
  logger -t home-screens-kiosk-update "privileged: $*" 2>/dev/null || true
}

# Packages the shell layer has grown to need since a Pi was flashed. The
# bundle can ship scripts but not apt packages, and this helper is the only
# root the spoke has, so it installs them here: a fixed list, no caller
# input, so the sudoers grant stays one reviewable capability. Best-effort
# and bounded: a spoke with no route to the archive just keeps its black
# overlay (the power agent waits for wlopm rather than exiting), and sets its
# rotation once at boot the old way (kiosk-outputs.sh falls back when kanshi
# is missing). This runs before the staging check so the updater can call the
# helper with nothing staged, on its timer tick, purely to retry a package
# that failed before.
for pkg in wlopm kanshi; do
  if ! dpkg -s "${pkg}" >/dev/null 2>&1; then
    if timeout 180 apt-get install -y -qq -o DPkg::Lock::Timeout=60 "${pkg}" >/dev/null 2>&1; then
      log "installed package ${pkg}"
    else
      log "could not install package ${pkg}; will retry on the next update"
    fi
  fi
done

# --- Newer versions of the programs the kiosk runs --------------------------
# The same list as SYSTEM_PACKAGES in scripts/lib/common.sh, copied because
# this helper takes no input; scripts/__tests__/kiosk-packages.test.ts keeps
# the copies identical. A spoke keeps the Chromium and labwc it was flashed
# with otherwise. This runs only while the hub says the display may restart:
# kiosk-update.sh touches the window file on such a tick, and restarts the
# kiosk right after when the changed file says a program was replaced, so a
# Chromium whose files changed under it never runs for hours. The window
# file is written by the kiosk user and decides only when; what is installed
# is fixed here. Bounded and best effort throughout: a spoke that cannot
# reach the archive keeps what it has.
SYSTEM_PACKAGES="chromium labwc kanshi wlopm wlr-randr wtype"
SYSTEM_PACKAGE_HOLDS=""
WINDOW_FILE="${APP_DIR}/data/kiosk-upgrade-window"
CHANGED_FILE="${APP_DIR}/data/kiosk-session-packages-changed"
RECORD_FILE="${APP_DIR}/data/system-packages.json"
HOLDS_FILE="${APP_DIR}/data/system-package-holds"

package_versions() {
  [ $# -gt 0 ] || return 0
  dpkg-query -W -f='${Package} ${Version}\n' "$@" 2>/dev/null | awk 'NF == 2' || true
}

# data/system-packages.json: what is installed and when it was last checked,
# the same file setup-system writes on a hub, read by the reporter.
write_record() {
  local line name version first="true" json
  json="{\"checkedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"versions\":{"
  while read -r name version; do
    [ -n "${name}" ] || continue
    version="$(printf '%s' "${version}" | tr -cd 'A-Za-z0-9.:+~-')"
    [ "${first}" = "true" ] || json="${json},"
    json="${json}\"${name}\":\"${version}\""
    first="false"
  done <<< "$(package_versions "$@")"
  json="${json}}}"
  printf '%s\n' "${json}" > "${RECORD_FILE}.tmp" 2>/dev/null && chmod 0644 "${RECORD_FILE}.tmp" \
    && mv -f "${RECORD_FILE}.tmp" "${RECORD_FILE}" 2>/dev/null || true
}

upgrade_system_packages() {
  local installed="" pkg free_kb
  for pkg in ${SYSTEM_PACKAGES}; do
    dpkg -s "${pkg}" >/dev/null 2>&1 && installed="${installed} ${pkg}"
  done
  installed="${installed# }"
  [ -n "${installed}" ] || return 0

  free_kb="$(df --output=avail -k "${APP_DIR}" 2>/dev/null | tail -n 1 | tr -d ' ')"
  if [ -n "${free_kb}" ] && [ "${free_kb}" -lt "${HS_MIN_FREE_KB:-409600}" ]; then
    log "not enough free space to update the display's programs; they stay as they are"
    # shellcheck disable=SC2086
    write_record ${installed}
    return 0
  fi

  local placed=""
  [ -f "${HOLDS_FILE}" ] && placed="$(tr '\n' ' ' < "${HOLDS_FILE}")"
  for pkg in ${placed}; do
    case " ${SYSTEM_PACKAGE_HOLDS} " in
      *" ${pkg} "*) ;;
      *) apt-mark unhold "${pkg}" >/dev/null 2>&1 || true ;;
    esac
  done
  for pkg in ${SYSTEM_PACKAGE_HOLDS}; do
    apt-mark hold "${pkg}" >/dev/null 2>&1 || true
  done
  if [ -n "${SYSTEM_PACKAGE_HOLDS}${placed}" ]; then
    printf '%s\n' "${SYSTEM_PACKAGE_HOLDS}" > "${HOLDS_FILE}" 2>/dev/null || true
  fi

  # Held packages stay out of the request: a held package with an update
  # waiting makes apt refuse everything named with it.
  local held wanted=""
  held="$(apt-mark showhold 2>/dev/null | tr '\n' ' ')"
  for pkg in ${installed}; do
    case " ${held} " in
      *" ${pkg} "*) ;;
      *) wanted="${wanted} ${pkg}" ;;
    esac
  done
  wanted="${wanted# }"
  if [ -z "${wanted}" ]; then
    # shellcheck disable=SC2086
    write_record ${installed}
    return 0
  fi

  if ! timeout "${HS_APT_UPDATE_TIMEOUT:-60}" apt-get update -qq \
        -o DPkg::Lock::Timeout=60 -o Acquire::Retries=2 >/dev/null 2>&1; then
    log "could not reach the package archive; the display's programs stay as they are"
    # shellcheck disable=SC2086
    write_record ${installed}
    return 0
  fi
  local before after changed
  # shellcheck disable=SC2086
  before="$(package_versions ${installed})"
  # The download is a step of its own, so a slow night ends with files in
  # apt's cache and nothing half installed; the next tick picks it up.
  # shellcheck disable=SC2086
  if ! timeout "${HS_APT_DOWNLOAD_TIMEOUT:-240}" \
        apt-get install --only-upgrade --download-only -y -qq -o DPkg::Lock::Timeout=60 \
        ${wanted} >/dev/null 2>&1; then
    log "still downloading newer versions of the display's programs; they install at the next check"
    # shellcheck disable=SC2086
    write_record ${installed}
    return 0
  fi
  # shellcheck disable=SC2086
  if ! DEBIAN_FRONTEND=noninteractive timeout "${HS_APT_UPGRADE_TIMEOUT:-180}" \
        apt-get install --only-upgrade -y -qq -o DPkg::Lock::Timeout=60 \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
        ${wanted} >/dev/null 2>&1; then
    log "updating the display's programs did not finish; they stay as they are until the next check"
  fi
  # shellcheck disable=SC2086
  after="$(package_versions ${installed})"
  changed="$(comm -13 <(printf '%s\n' "${before}" | sort) <(printf '%s\n' "${after}" | sort) | awk '{ print $1 }' | tr '\n' ' ')"
  changed="${changed% }"
  # shellcheck disable=SC2086
  write_record ${installed}
  if [ -n "${changed}" ]; then
    log "updated the display's programs: ${changed}"
    printf '%s\n' "${changed}" > "${CHANGED_FILE}.tmp" 2>/dev/null && chmod 0644 "${CHANGED_FILE}.tmp" \
      && mv -f "${CHANGED_FILE}.tmp" "${CHANGED_FILE}" 2>/dev/null || true
  fi
  return 0
}

# A window file older than ten minutes is a leftover from a tick that died,
# not permission.
if [ -n "$(find "${WINDOW_FILE}" -mmin -10 2>/dev/null)" ]; then
  rm -f "${WINDOW_FILE}"
  upgrade_system_packages
fi

if [ ! -d "${STAGING}" ]; then
  log "no staging directory — nothing more to do"
  exit 0
fi

# "<staged filename>|<destination>|<mode>"
SYSTEM_FILES=(
  "reporter.sh|/usr/local/bin/home-screens-reporter.sh|0755"
  "home-screens-reporter.service|/etc/systemd/system/home-screens-reporter.service|0644"
  "home-screens-reporter.timer|/etc/systemd/system/home-screens-reporter.timer|0644"
  "home-screens-kiosk-update.service|/etc/systemd/system/home-screens-kiosk-update.service|0644"
  "home-screens-kiosk-update.timer|/etc/systemd/system/home-screens-kiosk-update.timer|0644"
)

UNITS_CHANGED="false"

for entry in "${SYSTEM_FILES[@]}"; do
  IFS='|' read -r name dest mode <<< "${entry}"
  src="${STAGING}/${name}"
  [ -f "${src}" ] || continue
  # Skip unchanged files so a routine no-op update doesn't churn systemd.
  if [ -f "${dest}" ] && cmp -s "${src}" "${dest}"; then
    continue
  fi
  install -m "${mode}" -o root -g root "${src}" "${dest}"
  log "installed ${dest}"
  case "${dest}" in
    /etc/systemd/system/*) UNITS_CHANGED="true" ;;
  esac
done

if [ "${UNITS_CHANGED}" = "true" ]; then
  systemctl daemon-reload
  # try-restart is a no-op for a timer that isn't running, so this never
  # starts something the user disabled — it only re-arms what is already on.
  systemctl try-restart home-screens-reporter.timer 2>/dev/null || true
  systemctl try-restart home-screens-kiosk-update.timer 2>/dev/null || true
fi

# Replace ourselves last, and by rename rather than in-place write: the
# running bash keeps reading the old inode and finishes this script cleanly.
NEW_SELF="${STAGING}/kiosk-update-privileged.sh"
if [ -f "${NEW_SELF}" ] && ! cmp -s "${NEW_SELF}" "${SELF}"; then
  install -m 0755 -o root -g root "${NEW_SELF}" "${SELF}.new"
  mv -f "${SELF}.new" "${SELF}"
  log "installed ${SELF}"
fi

exit 0
