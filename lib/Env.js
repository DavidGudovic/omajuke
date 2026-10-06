.pragma library

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
// bus for MPRIS, and it is given the session's display, which it would use
// only to open a window (this version plays audio and opens none). Returns
// null without resolved paths, like net().
function mpv(paths) {
  var env = net(paths)
  if (env === null) return null
  env.WAYLAND_DISPLAY = null
  env.DBUS_SESSION_BUS_ADDRESS = null
  return env
}

// hyprctl finds the compositor through the instance signature.
function hypr() {
  var env = local()
  env.HYPRLAND_INSTANCE_SIGNATURE = null
  return env
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
    proxySet: proxySet
  }
}
