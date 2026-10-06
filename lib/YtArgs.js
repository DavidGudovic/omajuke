.pragma library

// The command lines of the yt-dlp calls OmaJuke makes itself, and the only
// place a flag for them is written. Each list is a constant apart from two
// slots: the path of yt-dlp and the cache folder inside our runtime
// directory. The third thing that varies, the video height, only picks one
// of three constant format texts.
//
// Nothing about what is looked up is ever in a command line: the query or
// the address reaches yt-dlp on its standard input ("-a -"), so no builder
// here takes a query, an address or a video id.

// Seconds yt-dlp waits on one connection before it gives up.
var _SOCKET_TIMEOUT = "10"

// What every call that is not signed in adds right behind base(): no cookie
// file, and no warnings, so that a burst of them cannot push the one error
// line out of the part of stderr that is kept. Every call this version
// makes is such a call. The pair stays apart from base() because it is what
// "not signed in" means: a call with a cookie file could carry neither flag.
function _signedOut() {
  return ["--no-cookies", "--no-warnings"]
}

// The same list, for whoever wants to read it. The builders below do not
// read it back: this file is shared by everything that imports it, and Qt's
// engine lets a frozen list be written to all the same.
var SIGNED_OUT = Object.freeze(_signedOut())

function _isObject(value) {
  return value !== null && typeof value === "object"
}

// The path of yt-dlp from the tool table, or "" when there is none.
function _tool(tools) {
  if (!_isObject(tools) || typeof tools.ytdlp !== "string") return ""
  return tools.ytdlp.charAt(0) === "/" ? tools.ytdlp : ""
}

// The folder yt-dlp keeps its player cache in, or "" when paths is not a
// resolved table of lib/Paths.js.
function _cacheDir(paths) {
  if (!_isObject(paths) || paths.ok !== true || typeof paths.ytCacheDir !== "string") return ""
  return paths.ytCacheDir.charAt(0) === "/" ? paths.ytCacheDir : ""
}

// The flags of every call, signed in or not. Returns a fresh list, or null
// without resolved paths: yt-dlp must never run with its cache somewhere
// else.
function base(paths) {
  var cacheDir = _cacheDir(paths)
  if (cacheDir === "") return null
  return [
    // A user configuration could name a browser to read cookies from, and
    // that would be the everyday profile.
    "--ignore-config",
    // No third-party code in our child.
    "--no-plugin-dirs",
    // The cache of YouTube's player code lives on tmpfs with the rest of our
    // runtime files, not in the cache folder all yt-dlp runs of the user
    // share.
    "--cache-dir", cacheDir,
    "--color", "never",
    "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components",
    "--socket-timeout", _SOCKET_TIMEOUT
  ]
}

// The streams asked for, by the largest video height the user allows. One
// of three constant texts; anything but 480 or 1080 gets the middle one,
// which is also the default of the setting. Asking for video costs nothing
// here (it is a choice inside the answer), and mpv still plays audio only.
function format(maxHeight) {
  if (maxHeight === 480) return "bestvideo[height<=?480]+bestaudio/best"
  if (maxHeight === 1080) return "bestvideo[height<=?1080]+bestaudio/best"
  return "bestvideo[height<=?720]+bestaudio/best"
}

// A complete command line for a call that is not signed in: the tool, the
// common flags, the signed-out pair, and the flags of that kind of call.
function _call(tools, paths, own) {
  var tool = _tool(tools)
  var common = base(paths)
  if (tool === "" || common === null) return null
  return [tool].concat(common, _signedOut(), own)
}

// A search. Standard input: "ytsearch<count>:<query>" and a line break. The
// answer is one JSON object that lists the results without looking any of
// them up.
function search(tools, paths) {
  return _call(tools, paths, ["--flat-playlist", "-J", "-a", "-"])
}

// Everything about one video. Standard input: its watch address and a line
// break. The answer is the JSON mpv's own yt-dlp hook can be handed later,
// so that the video is looked up once and not again when it is played.
function resolve(tools, paths, maxHeight) {
  return _call(tools, paths, ["--no-playlist", "-f", format(maxHeight), "-J", "-a", "-"])
}

if (typeof module !== "undefined") {
  module.exports = { SIGNED_OUT: SIGNED_OUT, base: base, format: format, search: search, resolve: resolve }
}
