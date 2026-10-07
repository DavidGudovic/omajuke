#!/usr/bin/sh
# tests/harness.sh <core|ui> <case>
# Runs one harness case in its own headless Quickshell and reports PASS or FAIL.
#
# Safety contract. This script signals a process only when both hold:
#   1. its PID was recorded in a file inside the run directory created below;
#   2. /proc/<pid>/environ shows the process carries this run's XDG_RUNTIME_DIR.
# It never selects a process by name or command line, and it stops before
# touching anything if the run directory is not exactly what it asked for.
set -eu

KIND=${1:?usage: harness.sh <core|ui> <case>}
CASE=${2:?usage: harness.sh <core|ui> <case>}
case "$KIND" in core|ui) ;; *) echo "harness: unknown kind" >&2; exit 2 ;; esac
case "$CASE" in ''|*[!a-z0-9_]*) echo "harness: bad case name" >&2; exit 2 ;; esac

REPO=$(cd "$(dirname "$0")/.." && pwd)
QS=${OMAJUKE_TEST_QS:-/usr/bin/quickshell}
SHELL_DIR=${OMARCHY_PATH:-/usr/share/omarchy}/shell
BASE=${OMAJUKE_TEST_BASE:-${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is not set}}

# Short on purpose: unix socket paths below it must stay under 100 bytes.
RUN=$(/usr/bin/mktemp -d "$BASE/oj-test.XXXXXX")
case "$RUN" in /*/oj-test.??????) ;; *) echo "harness: unusable run dir" >&2; exit 1 ;; esac
if [ ! -d "$RUN" ] || [ -L "$RUN" ] || [ ! -O "$RUN" ]; then echo "harness: unusable run dir" >&2; exit 1; fi
mkdir "$RUN/oj-stub" "$RUN/sbx" "$RUN/sbx/home" "$RUN/sbx/config" "$RUN/sbx/cache"

# Prints the PID in file $1 if that process belongs to this run.
ours() {
  [ -f "$1" ] || return 1
  pid=$(cat "$1")
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  [ -r "/proc/$pid/environ" ] || return 1
  tr '\0' '\n' < "/proc/$pid/environ" | grep -qxF "XDG_RUNTIME_DIR=$RUN" || return 1
  echo "$pid"
}
cleanup() {
  for f in "$RUN/qs.pid" "$RUN"/oj-stub/*.pid; do
    if p=$(ours "$f"); then kill -KILL "$p" 2>/dev/null || true; fi
  done
  rm -rf -- "$RUN"
}
trap cleanup EXIT

if [ "$KIND" = ui ]; then
  # qs.Ui and qs.Commons resolve against the shell root, so the UI harness gets
  # a throwaway root with links to the first-party kit (never inside the repo).
  # Only shell.qml is copied: it imports nothing from the repo and loads the
  # mock, the fakes and the cases from $OMAJUKE_REPO by file URL. A copied file
  # with a relative import would point outside the root, which cannot work.
  ROOT=$RUN/root
  mkdir "$ROOT"
  cp -- "$REPO/tests/harness-ui/shell.qml" "$ROOT/shell.qml"
  ln -s -- "$SHELL_DIR/Ui" "$ROOT/Ui"
  ln -s -- "$SHELL_DIR/Commons" "$ROOT/Commons"
else
  ROOT=$REPO/tests/harness
fi

# Per-case environment. The signature is a dummy: no socket exists for it under
# the private runtime dir, so nothing can reach a compositor. The cursor theme
# is a dummy as well: it stands for what a session tells a window, so that a
# case can see which children are handed it.
HIS=oj-harness-dummy
PROXY=
CURSOR=
case "$CASE" in
  hypr_none) HIS= ;;
  proxy_hold) PROXY=http://127.0.0.1:9 ;;
  runner) CURSOR=oj-harness-dummy ;;
esac

env -i HOME="$RUN/sbx/home" XDG_RUNTIME_DIR="$RUN" XDG_STATE_HOME="$RUN/sbx/state" \
  XDG_DATA_HOME="$RUN/sbx/data" XDG_CONFIG_HOME="$RUN/sbx/config" XDG_CACHE_HOME="$RUN/sbx/cache" \
  PATH=/usr/bin LANG=C.UTF-8 QT_QPA_PLATFORM=offscreen \
  QS_DISABLE_CRASH_HANDLER=1 QS_NO_RELOAD_POPUP=1 QS_DISABLE_FILE_WATCHER=1 \
  ${HIS:+HYPRLAND_INSTANCE_SIGNATURE="$HIS"} ${PROXY:+https_proxy="$PROXY"} \
  ${CURSOR:+XCURSOR_THEME="$CURSOR"} \
  OMAJUKE_REPO="$REPO" OMAJUKE_KIND="$KIND" OMAJUKE_CASE="$CASE" \
  /usr/bin/timeout -k 2 60 "$QS" -p "$ROOT/shell.qml" > "$RUN/out.txt" 2>&1 &
WRAP=$!

# Tether cases: the script, not the case, kills the shell, once the case says
# its child is up. Only the PID the harness shell recorded for itself is used.
case "$CASE" in tether*)
  n=0
  until grep -q 'OJ-READY' "$RUN/out.txt" 2>/dev/null; do
    n=$((n + 1))
    if [ "$n" -gt 300 ]; then echo "OJ-VERDICT FAIL $KIND $CASE (never ready)"; exit 1; fi
    sleep 0.1
  done
  p=$(ours "$RUN/qs.pid") || { echo "OJ-VERDICT FAIL $KIND $CASE (no shell pid)"; exit 1; }
  kill -KILL "$p"
  ;;
esac
wait "$WRAP" 2>/dev/null || true

sleep 1                                           # children get one second to notice
left=0
for f in "$RUN"/oj-stub/*.pid; do
  if p=$(ours "$f"); then echo "harness: process $p outlived the shell" >&2; left=1; fi
done

verdict=FAIL
case "$CASE" in
  tether*) [ "$left" -eq 0 ] && verdict=PASS ;;
  *) [ "$left" -eq 0 ] && grep -q "OJ-RESULT PASS $CASE " "$RUN/out.txt" && verdict=PASS ;;
esac
grep -ao 'OJ-RESULT .*' "$RUN/out.txt" || true
[ "$verdict" = PASS ] || grep -a -e ' WARN' -e 'ERROR' "$RUN/out.txt" | tail -n 20 >&2 || true
echo "OJ-VERDICT $verdict $KIND $CASE"
[ "$verdict" = PASS ]
