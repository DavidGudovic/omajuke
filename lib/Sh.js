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

// ---- Shell constants of signing in ----

// The data directory, where the saved login lives. Parameters: $1 the data
// dir, $2 the login file. Prints "bad-dir" (and exits 3) when the directory
// cannot be trusted, else "jar" when a login file of ours is there, and
// "ok" last. The directory gets the checks PREPARE gives its own: not a
// link, ours, made 700. Only the dotted temporary files COOKIE_EXPORT
// creates are deleted from it. Whether the user is signed in is asked here
// and nowhere else; the file itself is never read to find out.
var PREPARE_DATA = [
  'umask 077',
  'if [ -L "$1" ]; then echo bad-dir; exit 3; fi',
  '/usr/bin/mkdir -p -- "$1" || { echo bad-dir; exit 3; }',
  'if [ ! -d "$1" ] || [ ! -O "$1" ]; then echo bad-dir; exit 3; fi',
  '/usr/bin/chmod 700 -- "$1" || { echo bad-dir; exit 3; }',
  "/usr/bin/find \"$1\" -maxdepth 1 -type f -name '.cookies.txt.??????' -delete",
  'if [ -f "$2" ] && [ ! -L "$2" ] && [ -O "$2" ]; then',
  '  /usr/bin/chmod 600 -- "$2" && echo jar',
  'fi',
  'echo ok'
].join("\n")

// The directory of one sign-in attempt, with the browser profile and the
// empty configuration directory inside it. Parameters: $1 the attempt dir,
// $2 the browser family; standard input is the preferences file of a
// Firefox profile (read only for "firefox"). mkdir without -p fails on a
// directory that is already there, so an attempt never starts on a profile
// someone else prepared. Exit 4: the directory exists or cannot be made;
// 5: something inside it failed, and it is gone again.
var SIGNIN_DIRS = [
  'umask 077',
  '/usr/bin/mkdir -- "$1" || exit 4',
  'if /usr/bin/mkdir -- "$1/profile" "$1/config"; then',
  '  if [ "$2" != firefox ] || /usr/bin/cat > "$1/profile/user.js"; then exit 0; fi',
  'fi',
  '/usr/bin/rm -rf -- "$1"',
  'exit 5'
].join("\n")

// The names yt-dlp knows the supported browsers' cookie stores by. The
// export refuses any other first parameter: yt-dlp reads more than a name
// out of that argument, and only a bare name leaves the profile to us.
var COOKIE_BROWSERS = Object.freeze(["chrome", "chromium", "brave", "vivaldi", "firefox"])

// Turns the cookies of a sign-in attempt's browser profile into the saved
// login. Parameters: $1 yt-dlp's name for the browser, $2 the profile dir,
// $3 the attempt dir, $4 the login file, $5 yt-dlp. Prints exactly one
// word: "ok", "not-signed-in" or "error".
//
// yt-dlp is run without a URL: it reads the profile's cookie store, writes
// all of it to a file inside the attempt directory and stops. Only the
// profile of this attempt is ever named (it must be "$3/profile", a real
// directory of ours), with the store's plain-text key, so neither the
// everyday profile nor a keyring is touched. Of that file only the rows of
// youtube.com and its subdomains are kept, and only whole rows of seven
// fields; a login needs LOGIN_INFO and one of the two keys requests are
// signed with. The rows go into a temporary file that mktemp creates
// exclusively with mode 600 in the data directory, so the login is private
// from its first byte, and the rename swaps it in in one step.
//
// Cookie values pass through this shell's variables and its own printf and
// nowhere else: they are in no command line, no environment and no output.
// The attempt directory, with the profile and the unfiltered export, is
// removed on every exit the shell makes itself. A shell that is killed
// outright runs no trap, so the caller removes the directory once more.
var COOKIE_EXPORT = [
  'umask 077',
  't=',
  "trap '/usr/bin/rm -rf -- \"$3\"; [ -z \"$t\" ] || /usr/bin/rm -f -- \"$t\"' EXIT",
  "trap 'exit 1' HUP INT TERM",
  'case "$1" in chrome|chromium|brave|vivaldi|firefox) ;; *) echo error; exit 1 ;; esac',
  'case "$2" in "$3/profile") ;; *) echo error; exit 1 ;; esac',
  '[ -d "$2" ] && [ ! -L "$2" ] && [ -O "$2" ] || { echo error; exit 1; }',
  'd="${4%/*}"',
  '[ -d "$d" ] && [ ! -L "$d" ] && [ -O "$d" ] || { echo error; exit 1; }',
  'e="$3/export.txt"',
  'TMPDIR="$3"',
  'export TMPDIR',
  '"$5" --ignore-config --no-plugin-dirs --no-cache-dir --no-remote-components'
    + ' --cookies-from-browser "$1+basictext:$2" --cookies "$e" < /dev/null > /dev/null 2>&1',
  '[ -f "$e" ] && [ ! -L "$e" ] || { echo error; exit 1; }',
  't=$(/usr/bin/mktemp -- "$d/.cookies.txt.XXXXXX") || { t=; echo error; exit 1; }',
  "tab=$(printf '\\t')",
  'login=0',
  'sapi=0',
  '{',
  '  echo "# Netscape HTTP Cookie File"',
  '  echo',
  '  while IFS= read -r line || [ -n "$line" ]; do',
  '    case "$line" in',
  '      "#HttpOnly_"*) row="${line#?HttpOnly_}" ;;',
  '      "#"*|"") continue ;;',
  '      *) row="$line" ;;',
  '    esac',
  '    case "$row" in',
  '      *"$tab"*"$tab"*"$tab"*"$tab"*"$tab"*"$tab"*"$tab"*) continue ;;',
  '      *"$tab"*"$tab"*"$tab"*"$tab"*"$tab"*"$tab"*) ;;',
  '      *) continue ;;',
  '    esac',
  '    domain="${row%%$tab*}"',
  '    case "$domain" in *[!a-z0-9.-]*) continue ;; esac',
  '    case "$domain" in youtube.com|*.youtube.com) ;; *) continue ;; esac',
  '    rest="${row#*$tab}"',
  '    rest="${rest#*$tab}"',
  '    rest="${rest#*$tab}"',
  '    rest="${rest#*$tab}"',
  '    rest="${rest#*$tab}"',
  '    name="${rest%%$tab*}"',
  '    case "$name" in',
  '      LOGIN_INFO) login=1 ;;',
  '      SAPISID|__Secure-3PAPISID) sapi=1 ;;',
  '    esac',
  "    printf '%s\\n' \"$line\"",
  '  done < "$e"',
  '} > "$t"',
  'if [ "$login" = 1 ] && [ "$sapi" = 1 ]; then',
  '  if /usr/bin/mv -fT -- "$t" "$4"; then t=; echo ok; exit 0; fi',
  '  echo error',
  '  exit 1',
  'fi',
  'echo not-signed-in',
  'exit 0'
].join("\n")

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

// The same, and the saved login as well: for the moment the plugin is
// switched off or removed, when nothing of the user's account may stay.
function cleanupWithJarArgv(tools, paths) {
  return cleanupArgv(tools, paths).concat([paths.jarFile])
}

// ---- File operations of signing in ----

function prepareDataArgv(tools, paths) {
  return [tools.sh, "-c", PREPARE_DATA, "omajuke-prepare-data", paths.dataDir, paths.jarFile]
}

// family is "chromium" or "firefox".
function signinDirsArgv(tools, attemptDir, family) {
  return [tools.sh, "-c", SIGNIN_DIRS, "omajuke-signin-dirs", attemptDir, family]
}

// The profile is the one SIGNIN_DIRS made inside the attempt directory;
// no other can be named.
function cookieExportArgv(tools, browserName, attemptDir, jarFile) {
  return [
    tools.sh, "-c", COOKIE_EXPORT, "omajuke-export",
    browserName, attemptDir + "/profile", attemptDir, jarFile, tools.ytdlp
  ]
}

// Removes a directory with everything in it: a sign-in attempt directory,
// and nothing else is ever handed to it. A directory that is already gone
// is not an error.
function removeTreeArgv(tools, dir) {
  return [tools.rm, "-rf", "--", dir]
}

// Copies the saved login for one yt-dlp run. yt-dlp rewrites the cookie
// file it is given, so it only ever gets a copy. Run with the private
// umask: cp creates the copy itself.
function copyArgv(tools, from, to) {
  return [tools.cp, "--", from, to]
}

if (typeof module !== "undefined") {
  module.exports = {
    PREPARE: PREPARE,
    PRIVATE_WRITE: PRIVATE_WRITE,
    UMASK_EXEC: UMASK_EXEC,
    PREPARE_DATA: PREPARE_DATA,
    SIGNIN_DIRS: SIGNIN_DIRS,
    COOKIE_BROWSERS: COOKIE_BROWSERS,
    COOKIE_EXPORT: COOKIE_EXPORT,
    wrap: wrap,
    prepareArgv: prepareArgv,
    writeArgv: writeArgv,
    readArgv: readArgv,
    removeArgv: removeArgv,
    purgeArgv: purgeArgv,
    cleanupArgv: cleanupArgv,
    cleanupWithJarArgv: cleanupWithJarArgv,
    prepareDataArgv: prepareDataArgv,
    signinDirsArgv: signinDirsArgv,
    cookieExportArgv: cookieExportArgv,
    removeTreeArgv: removeTreeArgv,
    copyArgv: copyArgv
  }
}
