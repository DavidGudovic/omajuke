#!/usr/bin/sh
# tests/check.sh
# The one-command gate. Runs, in order, and stops at the first failure: the
# node tests, the plugin manifest check, qmllint through tests/lint-qml.js,
# then every headless harness case.
#
# Nothing here touches the live session. The node tests are pure, qmllint
# only reads the QML files, and each harness case runs through
# tests/harness.sh, which builds its own private environment. Test files and
# cases are found by listing their directories, so a new one is picked up by
# being there.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO"

node --test tests/node
omarchy plugin validate "$REPO"

# qmllint needs <dir>/qs/Commons/qmldir to resolve the shell's own modules,
# and the repository may hold no symlink, so the link lives in a throwaway
# directory outside it.
LINT=$(/usr/bin/mktemp -d)
case "$LINT" in /*) ;; *) exit 1 ;; esac
trap 'rm -rf -- "$LINT"' EXIT
case "$LINT/" in
  "$REPO"/*) echo "check: the temporary directory is inside the repository" >&2; exit 1 ;;
esac
ln -s -- "${OMARCHY_PATH:-/usr/share/omarchy}/shell" "$LINT/qs"

# Only files that exist are handed over: an unmatched pattern would reach
# qmllint as a file name and fail the lint for a directory that is merely
# still empty.
set --
for f in Service.qml BarWidget.qml Panel.qml core/*.qml ui/*.qml; do
  if [ -f "$f" ]; then set -- "$@" "$f"; fi
done
if [ "$#" -gt 0 ]; then
  # qmllint's exit status says little (0 on most findings, 255 on a syntax
  # error); the filter decides from the report.
  /usr/lib/qt6/bin/qmllint -I "$LINT" --json "$LINT/out.json" "$@" || true
  node tests/lint-qml.js "$LINT/out.json"
fi

for c in tests/harness/cases/*.qml; do
  if [ -f "$c" ]; then tests/harness.sh core "$(basename "$c" .qml)"; fi
done
for c in tests/harness-ui/cases/*.qml; do
  if [ -f "$c" ]; then tests/harness.sh ui "$(basename "$c" .qml)"; fi
done
echo "check: ok"
