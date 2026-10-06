.pragma library
.import "Const.js" as Const

// Every piece of shell text OmaJuke ever runs, and the command lines of its
// file operations. The shell snippets are constants: paths reach them only
// as positional parameters, so no data is ever part of shell text, and
// nothing is executed from the plugin directory. Everything else here is a
// plain argv array for a tool that is given by absolute path.
//
// The builders take paths from lib/Paths.js and counters, never a video id
// or any other outside text. Deciding whether a path may be written or
// removed is not done here: core/PrivateFs.qml asks Paths.owns() first.

// ---- Shell constants ----

// Start-up preparation. Parameters: $1 runtime dir, $2 state dir, $3 the
// MPRIS script, $4 the runtime base ($XDG_RUNTIME_DIR), $5 mpv, $6 yt-dlp.
// Prints constant tokens, one per line: "bad-dir" (and exits 3) when a
// directory cannot be trusted, else "state", "mpris", "mpv", "ytdlp" for
// what is there, and "ok" last.
//
// The base is checked first: it must be a real directory of ours with mode
// 700. In a shared base another user could swap the directory that holds
// mpv's socket. Both private directories are refused when they are links,
// made 700, and the runtime directory is emptied of what an earlier shell
// left. Only the dotted temporary files PRIVATE_WRITE creates are deleted
// from the state directory, so a file the user keeps next to the state
// file is never touched.
var PREPARE = [
  'umask 077',
  '[ -d "$4" ] && [ ! -L "$4" ] && [ -O "$4" ] && [ "$(/usr/bin/stat -c %a -- "$4")" = 700 ]'
    + ' || { echo bad-dir; exit 3; }',
  'for d in "$1" "$2"; do',
  '  if [ -L "$d" ]; then echo bad-dir; exit 3; fi',
  '  /usr/bin/mkdir -p -- "$d" || { echo bad-dir; exit 3; }',
  '  if [ ! -d "$d" ] || [ ! -O "$d" ]; then echo bad-dir; exit 3; fi',
  '  /usr/bin/chmod 700 -- "$d" || { echo bad-dir; exit 3; }',
  'done',
  '/usr/bin/rm -rf -- "$1/info" "$1/thumbs" "$1/jar" "$1/signin"',
  '/usr/bin/rm -f -- "$1/mpv.sock"',
  '/usr/bin/mkdir -p -- "$1/info" "$1/thumbs" "$1/jar" "$1/signin" "$1/ytcache" "$1/deno"'
    + ' || { echo bad-dir; exit 3; }',
  "/usr/bin/find \"$2\" -maxdepth 1 -type f -name '.state.json.??????' -delete",
  'if [ -f "$2/state.json" ] && [ ! -L "$2/state.json" ] && [ -O "$2/state.json" ]; then',
  '  /usr/bin/chmod 600 -- "$2/state.json" && echo state',
  'fi',
  'if [ -r "$3" ]; then echo mpris; fi',
  'if [ -x "$5" ]; then echo mpv; fi',
  'if [ -x "$6" ]; then echo ytdlp; fi',
  'echo ok'
].join("\n")

// Private atomic write of standard input to the file $1. mktemp creates the
// temporary file exclusively and with mode 600 inside our 700 directory, so
// the data is private from its first byte, and the rename swaps the visible
// file in one step. mv -T renames onto the target itself: a link planted
// there is replaced, never followed, and a directory there makes the write
// fail. (Without -T, mv would move the file into that directory, or into
// the one a planted link points to, and call it a success.) Exit 4: no
// temporary file; 5: the write or the rename failed, and the temporary file
// is gone again.
var PRIVATE_WRITE = [
  'umask 077',
  'd=${1%/*}',
  'b=${1##*/}',
  't=$(/usr/bin/mktemp -- "$d/.$b.XXXXXX") || exit 4',
  'if /usr/bin/cat > "$t" && /usr/bin/mv -fT -- "$t" "$1"; then exit 0; fi',
  '/usr/bin/rm -f -- "$t"',
  'exit 5'
].join("\n")

// Runs a tool so that every file it creates is private. The thumbnail fetch
// needs it: curl creates its files itself, with the mask it was started
// under.
var UMASK_EXEC = 'umask 077 && exec "$@"'

// ---- The wrapper of every runner job ----

// setpriv makes the job die with the shell however the shell dies. timeout
// ends the tool's whole process group at the deadline and kills what is
// left a moment later.
function wrap(tools, spec) {
  var grace = String(Const.TIMEOUTS.killGraceSec)
  return [tools.setpriv, "--pdeathsig", "TERM", tools.timeout, "-k", grace, String(spec.timeoutSec)]
    .concat(spec.umask077 ? [tools.sh, "-c", UMASK_EXEC, "omajuke"] : [], spec.argv)
}

// ---- File operations ----

function prepareArgv(tools, paths) {
  return [
    tools.sh, "-c", PREPARE, "omajuke-prepare",
    paths.runtimeDir, paths.stateDir, Const.MPRIS_SO, paths.runtimeBase, tools.mpv, tools.ytdlp
  ]
}

function writeArgv(tools, path) {
  return [tools.sh, "-c", PRIVATE_WRITE, "omajuke-write", path]
}

// One byte more than the cap is asked for, so that a file that is too large
// overflows the runner's cap instead of being read cut short.
function readArgv(tools, path, maxBytes) {
  return [tools.head, "-c", String(maxBytes + 1), "--", path]
}

function removeArgv(tools, paths) {
  return [tools.rm, "-f", "--"].concat(paths)
}

// Deletes the files directly inside dir and nothing else: not the
// directory, and nothing below a subdirectory.
function purgeArgv(tools, dir) {
  return [tools.find, dir, "-mindepth", "1", "-maxdepth", "1", "-type", "f", "-delete"]
}

// Removes everything prepare creates under the runtime dir. It runs
// detached while the service is being destroyed, so no runner can bound it
// and it must not die with the shell: timeout alone is its limit.
function cleanupArgv(tools, paths) {
  return [
    tools.timeout, "-k", String(Const.TIMEOUTS.killGraceSec), String(Const.TIMEOUTS.local),
    tools.rm, "-rf", "--",
    paths.sock, paths.infoDir, paths.thumbsDir, paths.jarDir, paths.signinDir, paths.ytCacheDir, paths.denoDir
  ]
}

if (typeof module !== "undefined") {
  module.exports = {
    PREPARE: PREPARE,
    PRIVATE_WRITE: PRIVATE_WRITE,
    UMASK_EXEC: UMASK_EXEC,
    wrap: wrap,
    prepareArgv: prepareArgv,
    writeArgv: writeArgv,
    readArgv: readArgv,
    removeArgv: removeArgv,
    purgeArgv: purgeArgv,
    cleanupArgv: cleanupArgv
  }
}
