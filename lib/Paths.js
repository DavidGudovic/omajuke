.pragma library
.import "Const.js" as Const

// Every path OmaJuke reads, writes or removes. resolve() derives them once
// from the session's XDG variables and refuses a base it cannot vouch for,
// with no fallback to a shared directory. owns() is the gate in front of
// every write and removal, and kind() says which of the plugin's files a
// path is, so that each operation can be held to the files it is meant for.
// The runtime files are named by a counter (infoFile(), thumbFile(),
// jarCopyFile(), signinAttemptDir()), so no video id ever appears in a file
// name or in the argv of a job that handles the file.

// The runtime base ends up in mpv option values and unix socket paths, so
// it is held to a plain character set and a short length.
var _RUNTIME_BASE = /^\/[A-Za-z0-9._\/-]{1,64}$/

// A unix socket address holds 108 bytes. The runtime paths are ASCII, so
// characters are bytes here.
var _SOCK_CHARS = 100

var _CONTROL = /[\u0000-\u001f\u007f]/
var _SLASH_RUNS = /\/{2,}/g

// Counters name the runtime files: one to ten digits.
var _DIGITS = /^[0-9]{1,10}$/
var _COUNTER_MAX = 9999999999

function _isSet(value) {
  return typeof value === "string" && value !== ""
}

// True when no segment is empty, "." or "..": the path has no doubled or
// trailing slash and names exactly the directory it spells.
function _plainSegments(path) {
  var parts = path.split("/")
  // parts[0] is the empty text in front of the leading slash.
  for (var i = 1; i < parts.length; i++) {
    if (parts[i] === "" || parts[i] === "." || parts[i] === "..") return false
  }
  return true
}

// The state or data base directory: the XDG variable when it is set, else
// the default below HOME. Returns null when neither gives a path that can
// be trusted. The result has no doubled and no trailing slash (the root
// directory comes back as ""), so base + "/" + name is always one spelling.
function _homeBase(xdg, home, fallback) {
  var base = ""
  if (_isSet(xdg)) base = xdg
  else if (_isSet(home)) base = home + fallback
  if (base.charAt(0) !== "/" || _CONTROL.test(base)) return null
  if (base.split("/").indexOf("..") !== -1) return null
  base = base.replace(_SLASH_RUNS, "/")
  return base.charAt(base.length - 1) === "/" ? base.slice(0, base.length - 1) : base
}

function _resolved(paths) {
  return paths !== null && typeof paths === "object" && paths.ok === true
}

function _isCounter(n) {
  return typeof n === "number" && isFinite(n) && Math.floor(n) === n && n >= 1 && n <= _COUNTER_MAX
}

// True when path is exactly dir + "/" + digits + suffix. The name is cut
// out and tested, then the whole path is rebuilt and compared: nothing is
// decided by a prefix.
function _isNumbered(path, dir, suffix) {
  if (!_isSet(dir) || dir.charAt(0) !== "/") return false
  var name = path.slice(dir.length + 1, path.length - suffix.length)
  return _DIGITS.test(name) && path === dir + "/" + name + suffix
}

// env: { XDG_RUNTIME_DIR, XDG_STATE_HOME, XDG_DATA_HOME, HOME }, each a
// string or null. Returns { ok: false } or the complete table of paths.
function resolve(env) {
  if (env === null || typeof env !== "object") return { ok: false }
  var runtimeBase = env.XDG_RUNTIME_DIR
  if (typeof runtimeBase !== "string" || !_RUNTIME_BASE.test(runtimeBase)) return { ok: false }
  if (!_plainSegments(runtimeBase)) return { ok: false }

  var stateBase = _homeBase(env.XDG_STATE_HOME, env.HOME, "/.local/state")
  var dataBase = _homeBase(env.XDG_DATA_HOME, env.HOME, "/.local/share")
  if (stateBase === null || dataBase === null) return { ok: false }
  // The saved login lives below the data base, and its path is handed to
  // yt-dlp and mpv: yt-dlp reads "::" as a separator in a browser
  // specification, and mpv splits option lists at commas.
  if (dataBase.indexOf("::") !== -1 || dataBase.indexOf(",") !== -1) return { ok: false }

  var runtimeDir = runtimeBase + "/" + Const.DIR_NAME
  var sock = runtimeDir + "/mpv.sock"
  if (sock.length > _SOCK_CHARS) return { ok: false }
  var stateDir = stateBase + "/" + Const.DIR_NAME
  var dataDir = dataBase + "/" + Const.DIR_NAME
  return {
    ok: true,
    runtimeBase: runtimeBase,
    runtimeDir: runtimeDir,
    sock: sock,
    infoDir: runtimeDir + "/info",
    thumbsDir: runtimeDir + "/thumbs",
    ytCacheDir: runtimeDir + "/ytcache",
    denoDir: runtimeDir + "/deno",
    jarDir: runtimeDir + "/jar",
    signinDir: runtimeDir + "/signin",
    stateDir: stateDir,
    stateFile: stateDir + "/state.json",
    dataDir: dataDir,
    jarFile: dataDir + "/cookies.txt"
  }
}

// Which of the plugin's own files a path is, or "" for anything else. Only
// these exact shapes have a name:
//   "state"          the state file
//   "info"           a numbered info file
//   "thumb"          a numbered thumbnail
//   "jar"            the saved login (a cookie file)
//   "jarCopy"        a numbered throwaway copy of it, for one yt-dlp run
//   "signinAttempt"  the numbered directory of one sign-in attempt, which
//                    holds a browser profile and is only ever removed whole
// The socket has none, because no job writes or removes it while the
// service lives.
function kind(paths, path) {
  if (!_resolved(paths) || typeof path !== "string") return ""
  if (_isSet(paths.stateFile) && path === paths.stateFile) return "state"
  if (_isSet(paths.jarFile) && path === paths.jarFile) return "jar"
  if (_isNumbered(path, paths.infoDir, ".json")) return "info"
  if (_isNumbered(path, paths.thumbsDir, ".jpg")) return "thumb"
  if (_isNumbered(path, paths.jarDir, ".txt")) return "jarCopy"
  return _isNumbered(path, paths.signinDir, "") ? "signinAttempt" : ""
}

// True only for the exact shapes OmaJuke writes and removes: the ones
// kind() names.
function owns(paths, path) {
  return kind(paths, path) !== ""
}

function _numbered(paths, dir, n, suffix) {
  return _resolved(paths) && _isSet(dir) && _isCounter(n) ? dir + "/" + n + suffix : ""
}

// The info file, the thumbnail, the copy of the saved login and the sign-in
// attempt directory for counter n (a whole number from 1). Anything else
// yields "", which owns() refuses.
function infoFile(paths, n) {
  return _numbered(paths, paths ? paths.infoDir : "", n, ".json")
}

function thumbFile(paths, n) {
  return _numbered(paths, paths ? paths.thumbsDir : "", n, ".jpg")
}

function jarCopyFile(paths, n) {
  return _numbered(paths, paths ? paths.jarDir : "", n, ".txt")
}

function signinAttemptDir(paths, n) {
  return _numbered(paths, paths ? paths.signinDir : "", n, "")
}

if (typeof module !== "undefined") {
  module.exports = {
    resolve: resolve,
    kind: kind,
    owns: owns,
    infoFile: infoFile,
    thumbFile: thumbFile,
    jarCopyFile: jarCopyFile,
    signinAttemptDir: signinAttemptDir
  }
}
