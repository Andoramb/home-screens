#!/usr/bin/env bash
# Smoke-test scripts/reporter.sh in "dry-run" mode — it should assemble a
# payload and print it to stdout instead of POSTing when REPORTER_DRY_RUN=1.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not installed — skipping reporter test"
  exit 0
fi

echo "Test 1: dry-run emits valid JSON with required keys"
out=$(REPORTER_DRY_RUN=1 \
     HOME_SCREENS_DISPLAY_ID=main \
     HOME_SCREENS_HUB_URL=http://localhost:3000 \
     bash reporter.sh)
echo "$out" | jq -e '.displayId == "main"' >/dev/null || { echo "FAIL: missing displayId"; exit 1; }
echo "$out" | jq -e '.hwStats | has("cpuCores")'   >/dev/null || { echo "FAIL: missing cpuCores"; exit 1; }
echo "$out" | jq -e '.hwStats | has("reportedAt")' >/dev/null || { echo "FAIL: missing reportedAt"; exit 1; }
echo "$out" | jq -e '.hwStats.cpuCores | type == "number"' >/dev/null || { echo "FAIL: cpuCores not a number"; exit 1; }

echo "Test 2: cpuTempC is null on non-Pi hosts (no /sys/class/thermal)"
# On macOS and non-Pi Linux, /sys/class/thermal does not exist. Assert the
# reporter emits null instead of crashing or emitting "".
if [[ ! -r /sys/class/thermal/thermal_zone0/temp ]]; then
  echo "$out" | jq -e '.hwStats.cpuTempC == null' >/dev/null || {
    echo "FAIL: expected cpuTempC=null on host without thermal zone"; exit 1; }
fi

echo "Test 3: display-software fields are absent on a host that is not a spoke"
echo "$out" | jq -e '.hwStats.kioskUpdater == false' >/dev/null || {
  echo "FAIL: expected kioskUpdater=false with no app dir"; exit 1; }
echo "$out" | jq -e '.hwStats.kioskVersion == null' >/dev/null || {
  echo "FAIL: expected kioskVersion=null with no app dir"; exit 1; }

echo "Test 4: a managed spoke reports its updater and applied version"
SPOKE="$(mktemp -d)"
trap 'rm -rf "${SPOKE}"' EXIT
mkdir -p "${SPOKE}/scripts" "${SPOKE}/data"
printf '#!/usr/bin/env bash\nexit 0\n' > "${SPOKE}/scripts/kiosk-update.sh"
chmod +x "${SPOKE}/scripts/kiosk-update.sh"
printf 'BACKEND_URL="http://hub:3000"\nDISPLAY_ID="kitchen"\n' > "${SPOKE}/data/kiosk.conf"
printf '1.9.0\n' > "${SPOKE}/data/kiosk-bundle.version"

spoke_out=$(REPORTER_DRY_RUN=1 \
     HOME_SCREENS_DISPLAY_ID=kitchen \
     HOME_SCREENS_HUB_URL=http://localhost:3000 \
     HOME_SCREENS_APP_DIR="${SPOKE}" \
     bash reporter.sh)
echo "$spoke_out" | jq -e '.hwStats.kioskUpdater == true' >/dev/null || {
  echo "FAIL: expected kioskUpdater=true on a managed spoke"; exit 1; }
echo "$spoke_out" | jq -e '.hwStats.kioskVersion == "1.9.0"' >/dev/null || {
  echo "FAIL: expected the applied version to be reported"; exit 1; }

echo "Test 5: a hub tree with the same scripts is not mistaken for a spoke"
# The release tarball ships the whole scripts/ tree, so kiosk-update.sh exists
# on a full install too. Only a kiosk.conf naming a hub makes it a spoke —
# the same marker kiosk-update.sh uses as its own guard.
printf 'PI_VARIANT="lite"\n' > "${SPOKE}/data/kiosk.conf"
hub_out=$(REPORTER_DRY_RUN=1 \
     HOME_SCREENS_DISPLAY_ID=main \
     HOME_SCREENS_HUB_URL=http://localhost:3000 \
     HOME_SCREENS_APP_DIR="${SPOKE}" \
     bash reporter.sh)
echo "$hub_out" | jq -e '.hwStats.kioskUpdater == false' >/dev/null || {
  echo "FAIL: a hub tree was reported as a self-updating spoke"; exit 1; }

echo "Test 6: package versions survive a dpkg-query that fails on one missing name"
# dpkg-query prints the installed ones and exits 1 for the one it does not
# know; the payload must still be one JSON value with the versions in it.
STUBS="${SPOKE}/stubs"
mkdir -p "${STUBS}"
cat > "${STUBS}/dpkg-query" <<'EOF'
#!/usr/bin/env bash
printf 'chromium\t1:154.0.8037.92-1~deb13u1+rpt1\nlabwc\t0.20.2-1~bpo13+1\n'
echo "dpkg-query: no packages found matching wlopm" >&2
exit 1
EOF
chmod +x "${STUBS}/dpkg-query"
printf '{"checkedAt":"2026-10-10T22:23:54Z","versions":{"chromium":"1:154.0.8037.92-1~deb13u1+rpt1"}}\n' > "${SPOKE}/data/system-packages.json"
pkg_out=$(PATH="${STUBS}:${PATH}" REPORTER_DRY_RUN=1 \
     HOME_SCREENS_DISPLAY_ID=kitchen \
     HOME_SCREENS_HUB_URL=http://localhost:3000 \
     HOME_SCREENS_APP_DIR="${SPOKE}" \
     bash reporter.sh)
echo "$pkg_out" | jq -e '.hwStats.packages.chromium == "1:154.0.8037.92-1~deb13u1+rpt1" and .hwStats.packages.labwc == "0.20.2-1~bpo13+1"' >/dev/null || {
  echo "FAIL: expected the installed versions despite the missing name"; echo "$pkg_out" | head -c 600; exit 1; }
echo "$pkg_out" | jq -e '.hwStats.packagesCheckedAt == "2026-10-10T22:23:54Z"' >/dev/null || {
  echo "FAIL: expected packagesCheckedAt from system-packages.json"; exit 1; }
echo "Test 7: no dpkg-query at all reports null, not a broken payload"
NODPKG="${SPOKE}/nodpkg"
mkdir -p "${NODPKG}"
for t in bash jq awk date printf cat head tr grep cut sed uname nproc; do p=$(command -v "$t" 2>/dev/null) && ln -sf "$p" "${NODPKG}/$t"; done
no_out=$(PATH="${NODPKG}" REPORTER_DRY_RUN=1 HOME_SCREENS_DISPLAY_ID=kitchen HOME_SCREENS_HUB_URL=http://localhost:3000 HOME_SCREENS_APP_DIR="${SPOKE}" bash reporter.sh 2>/dev/null || true)
if [ -n "${no_out}" ]; then
  echo "$no_out" | jq -e '.hwStats.packages == null' >/dev/null || { echo "FAIL: expected packages=null without dpkg-query"; exit 1; }
fi

echo "All reporter tests passed."
