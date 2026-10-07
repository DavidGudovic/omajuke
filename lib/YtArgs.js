.pragma library
.import "Const.js" as Const
.import "Paths.js" as Paths

// The command lines of the yt-dlp calls that search, look a video up and
// ask for related tracks, and the flags every yt-dlp call starts with.
// Each list is a constant apart from three slots: the path of yt-dlp, the
// cache folder inside our runtime directory and, for the one call here
// that uses the account, the path of a cookie file. What else varies, the
// video height, only picks one of three constant format texts. The calls
// that read the account's lists, check a new login and report a video as
// watched are built in lib/FeedUrls.js, on base() of this file: each
// command line is written in one place only.
//
// Nothing about what is looked up is ever in a command line: the query or
// the address reaches yt-dlp on its standard input ("-a -"), so no builder
// here takes a query, an address or a video id.
//
// There are two kinds of call and nothing in between. A call that is not
// signed in carries SIGNED_OUT. A call that uses the account carries
// "--cookies" and the path of a throwaway copy of the saved login, for one
// run: yt-dlp writes the file it is given anew, so it never gets the saved
// one. It also keeps its warnings, because that is where yt-dlp says that
// YouTube no longer accepts the login.

// Seconds yt-dlp waits on one connection before it gives up.
var _SOCKET_TIMEOUT = "10"

// What every call that is not signed in adds right behind base(): no cookie
// file, and no warnings, so that a burst of them cannot push the one error
// line out of the part of stderr that is kept. The pair stays apart from
// base() because it is what "not signed in" means: a call with a cookie
// file carries neither flag.
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

// The path of yt-dlp from the tool table, read once, so that what was
// checked is what is run, or "" when there is none.
function _tool(tools) {
  if (!_isObject(tools)) return ""
  var path = tools.ytdlp
  return typeof path === "string" && path.charAt(0) === "/" ? path : ""
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

// What a lookup asks yt-dlp to print about a video: these fields and no
// others. They are what a track is read from here and what mpv's yt-dlp
// hook needs to play the video without looking it up again.
//
// yt-dlp can also print everything it knows ("-J"), and that is not asked
// for, because of its size. For a video with automatic captions, which is
// most videos in which somebody speaks, the whole record lists every
// caption language in every file format and comes to more than ten
// megabytes, nearly all of it captions. An answer is read up to four
// mebibytes (Const.LIMITS.resolveBytes) and refused beyond that, so such a
// video could not be played. Reading more is no way out: the text is
// checked and parsed on the thread that draws the shell, written to disk,
// and read once more by yt-dlp when mpv plays it. With the fields below
// the same answer is under half a megabyte.
//
// The names are written out here and joined once: nothing a user typed or
// YouTube sent is ever part of this text.
var _FIELDS = [
  "id", "title", "fulltitle", "channel", "channel_id", "uploader", "uploader_id", "duration", "is_live",
  "was_live", "live_status", "_type", "formats", "requested_formats", "format", "format_id", "ext",
  "protocol", "http_headers", "extractor", "extractor_key", "webpage_url", "webpage_url_basename",
  "webpage_url_domain", "original_url", "display_id", "chapters", "availability", "age_limit",
  "release_timestamp", "start_time", "end_time", "acodec", "vcodec", "tbr", "abr", "vbr", "asr",
  "audio_channels", "width", "height", "fps", "language", "epoch", "_version"
].join(",")

// The same as an output template of yt-dlp: an object of those fields,
// printed as one line of JSON.
var _PRINT = "%(.{" + _FIELDS + "})j"

// The flags of a lookup of one video, signed in or not.
function _lookup(maxHeight) {
  return ["--no-playlist", "-f", format(maxHeight), "--print", _PRINT, "-a", "-"]
}

// A complete command line for a call that is not signed in: the tool, the
// common flags, the signed-out pair, and the flags of that kind of call.
function _call(tools, paths, own) {
  var tool = _tool(tools)
  var common = base(paths)
  if (tool === "" || common === null) return null
  return [tool].concat(common, _signedOut(), own)
}

// A complete command line for a call that uses the account, or null. copy
// must be one of the numbered throwaway copies in our runtime directory:
// the saved login itself, or a file anywhere else, gets no command line.
function _withAccount(tools, paths, copy, own) {
  var tool = _tool(tools)
  var common = base(paths)
  if (tool === "" || common === null) return null
  if (typeof copy !== "string" || Paths.kind(paths, copy) !== "jarCopy") return null
  return [tool].concat(common, ["--cookies", copy], own)
}

// The first so many entries of a list, each named without being looked up.
function _list(count) {
  return ["--flat-playlist", "--playlist-items", "1:" + count, "-J", "-a", "-"]
}

// ---- Calls that are not signed in ----

// A search. Standard input: "ytsearch<count>:<query>" and a line break. The
// answer is one JSON object that lists the results without looking any of
// them up.
function search(tools, paths) {
  return _call(tools, paths, ["--flat-playlist", "-J", "-a", "-"])
}

// One video. Standard input: its watch address and a line break. The answer
// is one line of JSON with the fields of _FIELDS, which mpv's own yt-dlp
// hook can be handed later, so that the video is looked up once and not
// again when it is played. The same call looks a video up ahead of a play.
function resolve(tools, paths, maxHeight) {
  return _call(tools, paths, _lookup(maxHeight))
}

// The tracks YouTube relates to one video. Standard input: the address of
// that video's mix and a line break. Only the head of the list is asked
// for: a mix has no end.
function mix(tools, paths) {
  return _call(tools, paths, _list(Const.LIMITS.mixFetch))
}

// ---- The call that uses the account ----

// resolve() with the account, for a video YouTube shows only to a signed-in
// user and only when the user asked to play it that way.
function resolveWithAccount(tools, paths, maxHeight, copy) {
  return _withAccount(tools, paths, copy, _lookup(maxHeight))
}

if (typeof module !== "undefined") {
  module.exports = {
    SIGNED_OUT: SIGNED_OUT,
    base: base,
    format: format,
    search: search,
    resolve: resolve,
    mix: mix,
    resolveWithAccount: resolveWithAccount
  }
}
