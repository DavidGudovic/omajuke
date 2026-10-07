.pragma library
.import "Const.js" as Const

// The environment of every child process. A child starts from an empty
// environment and gets exactly one of the profiles below: a fixed value
// where OmaJuke decides it, and null where the child may have the session's
// own value of that one variable (if the session has none, the child has
// none either).
//
// No profile carries a secret, a query, a URL or a title, and none carries
// a proxy variable: mpv would ignore it for media streams while yt-dlp and
// curl honoured it, so part of the traffic would leave the proxy unnoticed.
// All children connect directly, and proxySet() lets the service say so
// before the first request.

// The variables that would make a tool use a proxy. Read from the session
// only to detect one; never passed on.
var PROXY_NAMES = ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]

// Tools that touch only local files.
function local() {
  return { PATH: "/usr/bin", LANG: "C.UTF-8", HOME: null, XDG_RUNTIME_DIR: null }
}

// The directory deno keeps its cache in, or "" when paths is not a resolved
// table of lib/Paths.js.
function _denoDir(paths) {
  var usable = paths !== null && typeof paths === "object" && paths.ok === true
  return usable && typeof paths.denoDir === "string" ? paths.denoDir : ""
}

// yt-dlp and curl. yt-dlp may run deno to solve YouTube's player
// challenges: its cache stays in our runtime directory and it never checks
// for updates. Returns null without resolved paths, so that no network job
// can start with deno writing somewhere else (the runner refuses a job
// that has no environment).
function net(paths) {
  var denoDir = _denoDir(paths)
  if (denoDir === "") return null
  var env = local()
  env.DENO_NO_UPDATE_CHECK = "1"
  env.DENO_DIR = denoDir
  return env
}

// mpv, which also runs yt-dlp through its own hook. It needs the session
// bus for MPRIS and the session's display for the video window. A window
// also needs what the session says about drawing it: the cursor theme, and
// the names by which a graphics driver is chosen on machines that have more
// than one. Without them the window would come up with a wrong cursor or
// without hardware decoding. Returns null without resolved paths, like
// net().
function mpv(paths) {
  var env = net(paths)
  if (env === null) return null
  env.WAYLAND_DISPLAY = null
  env.DBUS_SESSION_BUS_ADDRESS = null
  env.XCURSOR_THEME = null
  env.XCURSOR_SIZE = null
  env.LIBVA_DRIVER_NAME = null
  env.GBM_BACKEND = null
  env.__GLX_VENDOR_LIBRARY_NAME = null
  env.__EGL_VENDOR_LIBRARY_FILENAMES = null
  env.NVD_BACKEND = null
  return env
}

// hyprctl finds the compositor through the instance signature.
function hypr() {
  var env = local()
  env.HYPRLAND_INSTANCE_SIGNATURE = null
  return env
}

// The directory of one sign-in attempt, as lib/Paths.js names it: plain
// characters, and at its end OmaJuke's runtime directory, the directory of
// the attempts and the counter of this one.
var _PLAIN_PATH = /^\/[A-Za-z0-9._\/-]+$/
var _ATTEMPT_CHARS = 128
var _COUNTER = /^[0-9]{1,10}$/

function _isAttemptDir(dir) {
  if (typeof dir !== "string" || dir.length > _ATTEMPT_CHARS || !_PLAIN_PATH.test(dir)) return false
  var parts = dir.split("/")
  // parts[0] is the empty text in front of the leading slash.
  for (var i = 1; i < parts.length; i++) {
    if (parts[i] === "" || parts[i] === "." || parts[i] === "..") return false
  }
  var last = parts.length - 1
  return last >= 4 && _COUNTER.test(parts[last]) && parts[last - 1] === "signin"
    && parts[last - 2] === Const.DIR_NAME
}

// The browser a user signs in with: a real window in the user's session, so
// it gets the display, the session bus and what a desktop program reads to
// look and speak like the rest of the desktop. Its configuration directory
// is not the user's but an empty one inside the attempt directory: the
// browsers' start scripts read extra flags from a file there, and a flag of
// that kind can switch on an extension, a keyring or a debugging port that
// no flag of ours could switch off again. Returns null unless attemptDir is
// a sign-in attempt directory, so no browser can start on anything else.
function browser(attemptDir) {
  if (!_isAttemptDir(attemptDir)) return null
  return {
    PATH: "/usr/bin",
    XDG_CONFIG_HOME: attemptDir + "/config",
    HOME: null,
    XDG_RUNTIME_DIR: null,
    WAYLAND_DISPLAY: null,
    DISPLAY: null,
    DBUS_SESSION_BUS_ADDRESS: null,
    XDG_CURRENT_DESKTOP: null,
    XDG_SESSION_TYPE: null,
    XDG_DATA_DIRS: null,
    LANG: null
  }
}

// True when the session has a proxy configured. env maps each of
// PROXY_NAMES to the session's value, or to null when it is unset. Only a
// plain value the object holds itself counts.
function proxySet(env) {
  if (env === null || typeof env !== "object") return false
  for (var i = 0; i < PROXY_NAMES.length; i++) {
    var own = Object.getOwnPropertyDescriptor(env, PROXY_NAMES[i])
    if (own !== undefined && typeof own.value === "string" && own.value !== "") return true
  }
  return false
}

if (typeof module !== "undefined") {
  module.exports = {
    PROXY_NAMES: PROXY_NAMES,
    local: local,
    net: net,
    mpv: mpv,
    hypr: hypr,
    browser: browser,
    proxySet: proxySet
  }
}
