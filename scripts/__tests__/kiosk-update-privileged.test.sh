#!/usr/bin/env bash
# Behavioural test for the package pass in scripts/kiosk-update-privileged.sh
# against stub apt-get, apt-mark, dpkg, dpkg-query, df, systemctl and logger.
#
# The helper runs as root through one sudoers line and takes no input, so the
# only thing the unprivileged updater can tell it is "the hub allows a restart
# now" (the window file). What follows checks that the programs the kiosk
# runs are brought up to date inside that window only, that a replaced one is
# reported for the restart, and that none of it can fail the helper.
set -euo pipefail

cd "$(dirname "$0")/.."   # scripts/
SCRIPTS_DIR="$(pwd)"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

APP_DIR="${WORK}/app"
BIN="${WORK}/bin"
mkdir -p "${APP_DIR}/data" "${BIN}"
HELPER="${WORK}/helper.sh"
install -m 0755 "${SCRIPTS_DIR}/kiosk-update-privileged.sh" "${HELPER}"

DB="${WORK}/dpkg.db"
ARCHIVE="${WORK}/archive.db"
CALLS="${WORK}/calls.log"
LOGGER="${WORK}/logger.log"
ARCHIVE_DOWN="${WORK}/archive-down"

# Stub dpkg: -s answers whether the fake database holds the package.
cat > "${BIN}/dpkg" <<STUB
#!/usr/bin/env bash
[ "\$1" = "-s" ] && grep -q "^\$2=" "${DB}"
STUB
cat > "${BIN}/dpkg-query" <<STUB
#!/usr/bin/env bash
shift 2
for p in "\$@"; do v=\$(grep "^\$p=" "${DB}" | cut -d= -f2-); [ -n "\$v" ] && printf '%s %s\n' "\$p" "\$v"; done
exit 0
STUB
# Stub apt-get: update fails while the archive-down file exists; install
# moves every named package to the archive's version.
cat > "${BIN}/apt-get" <<STUB
#!/usr/bin/env bash
echo "apt-get \$*" >> "${CALLS}"
case "\$1" in
  update) [ ! -e "${ARCHIVE_DOWN}" ]; exit \$? ;;
  install)
    case " \$* " in *" --download-only "*) [ -e "${WORK}/download-fails" ] && exit 124; exit 0 ;; esac
    for a in "\$@"; do
      case "\$a" in -*|install) continue ;; esac
      new=\$(grep "^\$a=" "${ARCHIVE}" | cut -d= -f2-)
      [ -n "\$new" ] && sed -i.bak "s|^\$a=.*|\$a=\$new|" "${DB}"
    done ;;
esac
exit 0
STUB
cat > "${BIN}/apt-mark" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "showhold" ]; then cat "${WORK}/held" 2>/dev/null; exit 0; fi
echo "apt-mark \$*" >> "${CALLS}"
STUB
cat > "${BIN}/df" <<'STUB'
#!/usr/bin/env bash
printf 'Avail\n%s\n' "${HS_FREE_KB:-8000000}"
STUB
cat > "${BIN}/timeout" <<'STUB'
#!/usr/bin/env bash
shift; exec "$@"
STUB
cat > "${BIN}/systemctl" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "${BIN}/logger" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "${LOGGER}"
STUB
chmod +x "${BIN}"/*

reset_state() {
  : > "${CALLS}"; : > "${LOGGER}"
  rm -f "${ARCHIVE_DOWN}" "${WORK}/held" "${WORK}/download-fails" \
    "${APP_DIR}/data/kiosk-upgrade-window" "${APP_DIR}/data/kiosk-session-packages-changed" \
    "${APP_DIR}/data/system-packages.json" "${APP_DIR}/data/system-package-holds"
  printf 'chromium=150.0.1-1\nlabwc=0.9.8-1+rpt1\nkanshi=1.5.1-1\nwlopm=0.1.0-1\nwlr-randr=0.2.0-2\nwtype=0.4-1\n' > "${DB}"
  printf 'chromium=154.0.8037.92-1~deb13u1\nlabwc=0.20.2-1~bpo13+1\nkanshi=1.5.1-1\nwlopm=0.1.0-1\nwlr-randr=0.2.0-2\nwtype=0.4-1\n' > "${ARCHIVE}"
}

# run [VAR=value...]: the helper as sudo would start it, with the test seams
# pointing here and only the stubs plus the system tools on PATH.
run() {
  env -i PATH="${BIN}:/usr/bin:/bin" HOME="${WORK}" \
    HS_HELPER_APP_DIR="${APP_DIR}" HS_HELPER_SELF="${HELPER}" "$@" \
    bash "${HELPER}"
}

fail() {
  echo "FAIL: $1"
  for f in "${CALLS}" "${LOGGER}" "${DB}"; do echo "--- ${f#"${WORK}"/}"; cat "${f}" 2>/dev/null; done
  exit 1
}

echo "Test 1: with no window open, the helper leaves the programs alone"
reset_state
run
if grep -q 'only-upgrade' "${CALLS}"; then fail "upgraded outside the window"; fi
[ ! -e "${APP_DIR}/data/kiosk-session-packages-changed" ] || fail "reported a change with nothing done"

echo "Test 2: inside the window, the programs are brought to the archive version and the change is reported"
reset_state
: > "${APP_DIR}/data/kiosk-upgrade-window"
run
grep -q '^apt-get update -qq -o DPkg::Lock::Timeout=60 -o Acquire::Retries=2$' "${CALLS}" || fail "expected apt-get update"
grep -q 'install --only-upgrade --download-only .* chromium labwc kanshi wlopm wlr-randr wtype$' "${CALLS}" || fail "expected the download step over the list"
grep -q 'install --only-upgrade -y .* chromium labwc kanshi wlopm wlr-randr wtype$' "${CALLS}" || fail "expected the install step over the list"
grep -q '^labwc=0.20.2-1~bpo13+1$' "${DB}" || fail "labwc was not upgraded"
[ "$(cat "${APP_DIR}/data/kiosk-session-packages-changed")" = "chromium labwc" ] || fail "changed file should name chromium and labwc"
grep -q '"labwc":"0.20.2-1~bpo13+1"' "${APP_DIR}/data/system-packages.json" || fail "record should carry the new version"
grep -q '"checkedAt":"20' "${APP_DIR}/data/system-packages.json" || fail "record should say when it checked"
[ ! -e "${APP_DIR}/data/kiosk-upgrade-window" ] || fail "the window file should be used up"
grep -q "updated the display's programs: chromium labwc" "${LOGGER}" || fail "expected a journal line"

echo "Test 3: nothing new in the archive leaves no change to report"
reset_state
cp "${ARCHIVE}" "${DB}"
: > "${APP_DIR}/data/kiosk-upgrade-window"
run
[ ! -e "${APP_DIR}/data/kiosk-session-packages-changed" ] || fail "reported a change when nothing changed"
[ -e "${APP_DIR}/data/system-packages.json" ] || fail "the record is still written"

echo "Test 4: a window older than ten minutes is a leftover, not permission"
reset_state
: > "${APP_DIR}/data/kiosk-upgrade-window"
touch -t 202601010000 "${APP_DIR}/data/kiosk-upgrade-window"
run
if grep -q 'only-upgrade' "${CALLS}"; then fail "a stale window opened the upgrade"; fi

echo "Test 5: an archive that cannot be reached changes nothing, and the helper still exits 0"
reset_state
: > "${ARCHIVE_DOWN}"
: > "${APP_DIR}/data/kiosk-upgrade-window"
rc=0; run || rc=$?
[ "${rc}" -eq 0 ] || fail "helper failed because apt-get update failed (exit ${rc})"
if grep -q 'only-upgrade' "${CALLS}"; then fail "upgraded without a working archive"; fi
grep -q '^labwc=0.9.8-1+rpt1$' "${DB}" || fail "db changed"
grep -q 'could not reach the package archive' "${LOGGER}" || fail "expected a journal line about the archive"

echo "Test 6: too little free space skips the pass"
reset_state
: > "${APP_DIR}/data/kiosk-upgrade-window"
run HS_FREE_KB=100000
if grep -q 'apt-get' "${CALLS}"; then fail "ran apt with no room for Chromium"; fi
grep -q 'not enough free space' "${LOGGER}" || fail "expected a journal line about space"

echo "Test 7: the missing-package loop still runs before anything else"
reset_state
sed -i.bak '/^wlopm=/d' "${DB}"
run
grep -q '^apt-get install -y -qq -o DPkg::Lock::Timeout=60 wlopm$' "${CALLS}" || fail "expected the missing wlopm to be installed"

echo "Test 8: a held package is left out of the request and the others still update"
reset_state
echo labwc > "${WORK}/held"
: > "${APP_DIR}/data/kiosk-upgrade-window"
run
grep -q 'install --only-upgrade -y .* chromium kanshi wlopm wlr-randr wtype$' "${CALLS}" || fail "expected the request without labwc"
grep -q '^labwc=0.9.8-1+rpt1$' "${DB}" || fail "a held labwc was changed"
[ "$(cat "${APP_DIR}/data/kiosk-session-packages-changed")" = "chromium" ] || fail "changed file should name chromium only"

echo "Test 9: a download that does not finish leaves the install for the next check"
reset_state
: > "${WORK}/download-fails"
: > "${APP_DIR}/data/kiosk-upgrade-window"
run
if grep -q 'only-upgrade -y' "${CALLS}"; then fail "installed after an unfinished download"; fi
grep -q '^chromium=150.0.1-1$' "${DB}" || fail "db changed"
grep -q 'still downloading' "${LOGGER}" || fail "expected a journal line about the download"
[ ! -e "${APP_DIR}/data/kiosk-session-packages-changed" ] || fail "reported a change with nothing installed"

echo "All kiosk-update-privileged tests passed."
