.pragma library

// Input and expectation table for lib/FeedUrls.js: which feeds exist and
// the address of each, which playlist ids may be opened, what is kept of
// yt-dlp's answer for a feed or a playlist and what is refused or dropped,
// and how long a fetched list counts as fresh. Every answer in here is made
// up: synthetic ids, titles and hosts. The same table runs under node and
// inside Qt's JavaScript engine.

// ---- Building answers ----

// yt-dlp prints its JSON escaped to ASCII. The answers are written as
// objects and put into that form here, so that they can be read.
function _json(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, function(ch) {
    return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4)
  })
}

function _answer(entries) {
  return { _type: "playlist", id: "synthetic", title: "Synthetic list", entries: entries }
}

// A video and a playlist entry with the fields yt-dlp gives them, among
// them several that are never read.
function _video(id, title, channel, duration) {
  return {
    _type: "url", ie_key: "Youtube", id: id, url: "https://media.example/watch?v=" + id, title: title,
    description: "Synthetic description", duration: duration, channel_id: null, channel: channel,
    uploader: channel, thumbnails: [{ url: "https://thumbs.example/" + id + ".jpg", height: 94, width: 168 }],
    view_count: 1234, live_status: null
  }
}

function _playlist(id, title) {
  return {
    _type: "url", ie_key: "YoutubeTab", id: id, url: "https://media.example/playlist?list=" + id,
    title: title, thumbnails: [{ url: "https://thumbs.example/" + id + ".jpg" }]
  }
}

// The text of an answer that holds these entries.
function _text(entries) {
  return _json(_answer(entries))
}

// ---- Building expectations ----

function _track(id, title, channel, duration, live) {
  return { id: id, title: title, channel: channel, duration: duration, live: live }
}

function _row(id, title, count) {
  return { id: id, title: title, count: count }
}

function _tracks(tracks) {
  return { ok: true, tracks: tracks, playlists: [] }
}

function _rows(rows) {
  return { ok: true, tracks: [], playlists: rows }
}

var _NO = { ok: false }

// ---- Long and large inputs ----

var _A25 = "aaaaaaaaaaaaaaaaaaaaaaaaa"
var _A100 = _A25 + _A25 + _A25 + _A25
var _A300 = _A100 + _A100 + _A100

function _digits(n, width) {
  return ("0000000000000000" + n).slice(-width)
}

// n small video entries with ids V0000000001, V0000000002 and so on, and
// the tracks the first n of them become.
function _manyVideos(n) {
  var entries = []
  for (var i = 1; i <= n; i++) {
    entries.push({ ie_key: "Youtube", id: "V" + _digits(i, 10), title: "Title " + i, duration: i })
  }
  return entries
}

function _manyTracks(n) {
  var tracks = []
  for (var i = 1; i <= n; i++) tracks.push(_track("V" + _digits(i, 10), "Title " + i, "", i, false))
  return tracks
}

// The same for playlist entries, with ids PL0000000000000001 and so on.
function _manyPlaylists(n) {
  var entries = []
  for (var i = 1; i <= n; i++) entries.push({ id: "PL" + _digits(i, 16), title: "List " + i })
  return entries
}

function _manyRows(n) {
  var rows = []
  for (var i = 1; i <= n; i++) rows.push(_row("PL" + _digits(i, 16), "List " + i, null))
  return rows
}

// An array inside an array, depth times.
function _nested(depth) {
  var value = "x"
  for (var i = 0; i < depth; i++) value = [value]
  return value
}

// The text unit repeated count times, built by doubling.
function _repeat(unit, count) {
  var text = ""
  var chunk = unit
  var left = count
  while (left > 0) {
    if (left % 2 === 1) text += chunk
    chunk += chunk
    left = Math.floor(left / 2)
  }
  return text
}

// The text with blanks in front of it, length characters in all.
function _padded(text, length) {
  return _repeat(" ", length - text.length) + text
}

// One case per character of chars: the case make(character) returns.
function _perCharacter(chars, make) {
  var cases = []
  for (var i = 0; i < chars.length; i++) cases.push(make(chars.charAt(i)))
  return cases
}

// Every printable ASCII character outside the alphabet of a playlist id.
var _NOT_ID = " !\"#$%&'()*+,./:;<=>?@[\\]^\u0060{|}~"

function _noListId(ch) {
  return { fn: "playlistUrl", args: ["PL" + ch + "01"], expect: "" }
}

// ---- Answers used by several cases ----

var _A = "AAAAAAAAAAA"
var _B = "BBBBBBBBBBB"
var _C = "abcDEF12345"
var _LIST = "PL0000000000000001"
var _LIST_LONG = "PLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

var _THREE = _text([
  _video(_A, "First synthetic title", "Example Channel", 213),
  _video(_B, "Second synthetic title", "Another Channel", 3601),
  _video(_C, "Third synthetic title", "Example Channel", 59)
])
var _THREE_TRACKS = [
  _track(_A, "First synthetic title", "Example Channel", 213, false),
  _track(_B, "Second synthetic title", "Another Channel", 3601, false),
  _track(_C, "Third synthetic title", "Example Channel", 59, false)
]

// History rows name no channel: the keys are there and hold null.
var _HISTORY = _text([
  _video(_A, "Watched first", null, 213),
  _video(_B, "Watched second", null, 0),
  { id: _C, title: "Watched third" }
])

var _TWO_LISTS = _text([_playlist(_LIST, "Synthetic playlist"), _playlist(_LIST_LONG, "Another playlist")])

// ---- Answers spelled by hand ----

// What the builders above cannot produce: an answer that is cut short, one
// that is not JSON, one with a character yt-dlp would have escaped, and
// fields that sit on a "__proto__" key.
var _EMPTY = "{\"_type\":\"playlist\",\"entries\":[]}"
var _OPEN = "{\"_type\":\"playlist\",\"entries\":["
var _CUT_SHORT = _OPEN + "{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\"}"
var _NOT_A_NUMBER = _OPEN + "{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"duration\":NaN}]}"
var _INFINITE = _OPEN + "{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"duration\":Infinity}]}"
var _HALF_PAIR = _OPEN + "{\"id\":\"AAAAAAAAAAA\",\"title\":\"a\\ud83db\"}]}"
var _RAW_ACCENT = _OPEN + "{\"id\":\"AAAAAAAAAAA\",\"title\":\"caf\u00e9\"}]}"
var _RAW_ACCENT_LIST = _OPEN + "{\"id\":\"PL01\",\"title\":\"caf\u00e9\"}]}"
var _INHERITED_VIDEO = _OPEN + "{\"__proto__\":{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\"}}]}"
var _INHERITED_LIST = _OPEN + "{\"__proto__\":{\"id\":\"PL01\",\"title\":\"t\"}}]}"
var _INHERITED_ANSWER = "{\"__proto__\":" + _EMPTY + "}"

// JSON allows a tab or a line end between two values and the delete
// character inside a text. yt-dlp prints none of them.
var _TABBED = "{\"_type\":\"playlist\",\t\"entries\":[]}"
var _DELETE_VIDEO = _OPEN + "{\"id\":\"AAAAAAAAAAA\",\"title\":\"a\u007fb\"}]}"
var _DELETE_LIST = _OPEN + "{\"id\":\"PL01\",\"title\":\"a\u007fb\"}]}"

// The most a feed job may send, in characters.
var _MOST = 1048576

// ---- Command lines ----

// The tools and paths as the plugin has them, a throwaway copy of the
// login, and the flags every signed-in call starts with. The lists are
// written out here a second time on purpose: a flag changes only when both
// places are edited.
var _RUNTIME = "/run/user/1000/omajuke"
var _YTDLP = "/usr/bin/yt-dlp"
var _TOOLS = { ytdlp: _YTDLP }
var _PATHS = {
  ok: true, runtimeBase: "/run/user/1000", runtimeDir: _RUNTIME, sock: _RUNTIME + "/mpv.sock",
  infoDir: _RUNTIME + "/info", thumbsDir: _RUNTIME + "/thumbs", ytCacheDir: _RUNTIME + "/ytcache",
  denoDir: _RUNTIME + "/deno", jarDir: _RUNTIME + "/jar", signinDir: _RUNTIME + "/signin",
  stateDir: "/home/user/.local/state/omajuke", stateFile: "/home/user/.local/state/omajuke/state.json",
  dataDir: "/home/user/.local/share/omajuke", jarFile: "/home/user/.local/share/omajuke/cookies.txt"
}
var _COPY = _RUNTIME + "/jar/7.txt"

function _signedIn(copy, own) {
  return [
    _YTDLP, "--ignore-config", "--no-plugin-dirs", "--cache-dir", _RUNTIME + "/ytcache", "--color", "never",
    "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10",
    "--cookies", copy
  ].concat(own)
}

var _FEED_FLAGS = ["--flat-playlist", "--playlist-items", "1:50", "-J", "-a", "-"]
var _VERIFY_FLAGS = ["--flat-playlist", "--playlist-items", "1:1", "-J", "-a", "-"]
var _MARK_FLAGS = ["--mark-watched", "--simulate", "--quiet", "-a", "-"]

var _FEED_ARGV = _signedIn(_COPY, _FEED_FLAGS)
var _VERIFY_ARGV = _signedIn(_COPY, _VERIFY_FLAGS)
var _MARK_ARGV = _signedIn(_COPY, _MARK_FLAGS)

// The same paths with one entry changed.
function _pathsWith(key, value) {
  var paths = {
    ok: true, runtimeBase: "/run/user/1000", runtimeDir: _RUNTIME, sock: _RUNTIME + "/mpv.sock",
    infoDir: _RUNTIME + "/info", thumbsDir: _RUNTIME + "/thumbs", ytCacheDir: _RUNTIME + "/ytcache",
    denoDir: _RUNTIME + "/deno", jarDir: _RUNTIME + "/jar", signinDir: _RUNTIME + "/signin",
    stateDir: "/home/user/.local/state/omajuke", stateFile: "/home/user/.local/state/omajuke/state.json",
    dataDir: "/home/user/.local/share/omajuke", jarFile: "/home/user/.local/share/omajuke/cookies.txt"
  }
  if (key === "ok") paths.ok = value
  if (key === "ytCacheDir") paths.ytCacheDir = value
  if (key === "jarDir") paths.jarDir = value
  return paths
}

// What is not a throwaway copy of the login: the saved login itself, any
// other file of the plugin, a file beside the copies, and every spelling
// that only resembles a copy.
var _NOT_A_COPY = [
  "/home/user/.local/share/omajuke/cookies.txt", _RUNTIME + "/info/7.json", _RUNTIME + "/thumbs/7.jpg",
  _RUNTIME + "/signin/7", _RUNTIME + "/mpv.sock", "/home/user/.local/state/omajuke/state.json",
  _RUNTIME + "/jar", _RUNTIME + "/jar/", _RUNTIME + "/jar/7", _RUNTIME + "/jar/7.json",
  _RUNTIME + "/jar/a.txt",
  _RUNTIME + "/jar/-1.txt", _RUNTIME + "/jar/7.txt ", _RUNTIME + "/jar/7.txt\n", _RUNTIME + "/jar//7.txt",
  _RUNTIME + "/jar/../jar/7.txt", _RUNTIME + "/jar/7.txt/", _RUNTIME + "/jar/12345678901.txt",
  _RUNTIME + "/jar/x/7.txt", "jar/7.txt", "7.txt", "/etc/hostname", "--cookies-from-browser", "-", "",
  "constructor", "__proto__"
]

// One refusal per builder for each of those, and for each value that is
// no path at all.
function _refusedCopies() {
  var builders = ["feedArgv", "verifyArgv", "markArgv"]
  var others = [null, undefined, 7, true, [_COPY], { path: _COPY }]
  var cases = []
  for (var b = 0; b < builders.length; b++) {
    for (var i = 0; i < _NOT_A_COPY.length; i++) {
      cases.push({ fn: builders[b], args: [_TOOLS, _PATHS, _NOT_A_COPY[i]], expect: null })
    }
    for (var k = 0; k < others.length; k++) {
      cases.push({ fn: builders[b], args: [_TOOLS, _PATHS, others[k]], expect: null })
    }
  }
  return cases
}
var _ONE_VIDEO = _OPEN + "{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"duration\":5}]}"
var _ONE_LIST = _OPEN + "{\"id\":\"PL01\",\"title\":\"t\"}]}"

var MODULE = "FeedUrls"
var CASES = [
  // ---- isKind: the five feeds ----
  { fn: "isKind", args: ["foryou"], expect: true },
  { fn: "isKind", args: ["subs"], expect: true },
  { fn: "isKind", args: ["later"], expect: true },
  { fn: "isKind", args: ["playlists"], expect: true },
  { fn: "isKind", args: ["history"], expect: true },

  // ---- isKind: anything else ----
  { fn: "isKind", args: [""], expect: false },
  { fn: "isKind", args: ["home"], expect: false },
  { fn: "isKind", args: ["trending"], expect: false },
  { fn: "isKind", args: ["channels"], expect: false },
  { fn: "isKind", args: ["recommended"], expect: false },
  { fn: "isKind", args: ["subscriptions"], expect: false },
  { fn: "isKind", args: ["History"], expect: false },
  { fn: "isKind", args: ["HISTORY"], expect: false },
  { fn: "isKind", args: [" history"], expect: false },
  { fn: "isKind", args: ["history\n"], expect: false },
  { fn: "isKind", args: ["history\u0000"], expect: false },
  { fn: "isKind", args: ["constructor"], expect: false },
  { fn: "isKind", args: ["__proto__"], expect: false },
  { fn: "isKind", args: ["length"], expect: false },
  { fn: "isKind", args: ["indexOf"], expect: false },
  { fn: "isKind", args: ["0"], expect: false },
  { fn: "isKind", args: [0], expect: false },
  { fn: "isKind", args: [4], expect: false },
  { fn: "isKind", args: [null], expect: false },
  { fn: "isKind", args: [true], expect: false },
  { fn: "isKind", args: [["history"]], expect: false },
  { fn: "isKind", args: [{ kind: "history" }], expect: false },
  { fn: "isKind", args: [], expect: false },
  { fn: "isKind", args: [{ gen: "repeat", unit: "history", count: 50000 }], expect: false },

  // ---- url: one constant address per feed ----
  { fn: "url", args: ["foryou"], expect: "https://www.youtube.com/feed/recommended" },
  { fn: "url", args: ["subs"], expect: "https://www.youtube.com/feed/subscriptions" },
  { fn: "url", args: ["later"], expect: "https://www.youtube.com/playlist?list=WL" },
  { fn: "url", args: ["playlists"], expect: "https://www.youtube.com/feed/playlists" },
  { fn: "url", args: ["history"], expect: "https://www.youtube.com/feed/history" },

  // ---- url: nothing but a kind selects an address ----
  { fn: "url", args: [""], expect: "" },
  { fn: "url", args: ["trending"], expect: "" },
  { fn: "url", args: ["channels"], expect: "" },
  { fn: "url", args: ["History"], expect: "" },
  { fn: "url", args: ["history "], expect: "" },
  { fn: "url", args: ["history\n"], expect: "" },
  { fn: "url", args: ["history/../../watch"], expect: "" },
  { fn: "url", args: ["feed/history"], expect: "" },
  { fn: "url", args: ["/feed/history"], expect: "" },
  { fn: "url", args: ["https://www.youtube.com/feed/history"], expect: "" },
  { fn: "url", args: ["https://tracker.invalid/feed/history"], expect: "" },
  { fn: "url", args: ["//tracker.invalid/feed"], expect: "" },
  { fn: "url", args: ["@tracker.invalid"], expect: "" },
  { fn: "url", args: ["constructor"], expect: "" },
  { fn: "url", args: ["__proto__"], expect: "" },
  { fn: "url", args: ["length"], expect: "" },
  { fn: "url", args: ["0"], expect: "" },
  { fn: "url", args: ["1"], expect: "" },
  // A number is not a position in the list.
  { fn: "url", args: [0], expect: "" },
  { fn: "url", args: [1], expect: "" },
  { fn: "url", args: [4], expect: "" },
  { fn: "url", args: [-1], expect: "" },
  { fn: "url", args: [null], expect: "" },
  { fn: "url", args: [true], expect: "" },
  { fn: "url", args: [["history"]], expect: "" },
  { fn: "url", args: [{ kind: "history" }], expect: "" },
  { fn: "url", args: [], expect: "" },
  { fn: "url", args: [{ gen: "repeat", unit: "a", count: 300000 }], expect: "" },
  { fn: "url", args: [{ gen: "codes", codes: [55357] }], expect: "" },

  // ---- isListId: 2 to 64 characters of the id alphabet ----
  { fn: "isListId", args: ["WL"], expect: true },
  { fn: "isListId", args: ["LL"], expect: true },
  { fn: "isListId", args: [_LIST], expect: true },
  { fn: "isListId", args: [_LIST_LONG], expect: true },
  { fn: "isListId", args: ["RDAAAAAAAAAAA"], expect: true },
  { fn: "isListId", args: ["a-b_c"], expect: true },
  { fn: "isListId", args: ["--"], expect: true },
  { fn: "isListId", args: ["--no-config"], expect: true },
  { fn: "isListId", args: ["constructor"], expect: true },
  { fn: "isListId", args: ["__proto__"], expect: true },
  // 64 characters, then one more.
  { fn: "isListId", args: ["PL" + _A25 + _A25 + _A25.slice(0, 12)], expect: true },
  { fn: "isListId", args: ["PL" + _A25 + _A25 + _A25.slice(0, 13)], expect: false },
  { fn: "isListId", args: [""], expect: false },
  { fn: "isListId", args: ["W"], expect: false },
  { fn: "isListId", args: ["W L"], expect: false },
  { fn: "isListId", args: [" WL"], expect: false },
  { fn: "isListId", args: ["WL "], expect: false },
  { fn: "isListId", args: ["WL\n"], expect: false },
  { fn: "isListId", args: ["WL\nLL"], expect: false },
  { fn: "isListId", args: ["WL\u0000"], expect: false },
  { fn: "isListId", args: ["WL&v=AAAAAAAAAAA"], expect: false },
  { fn: "isListId", args: ["WL#fragment"], expect: false },
  { fn: "isListId", args: ["WL?x=1"], expect: false },
  { fn: "isListId", args: ["WL/../feed"], expect: false },
  { fn: "isListId", args: ["../WL"], expect: false },
  { fn: "isListId", args: ["WL%26x"], expect: false },
  { fn: "isListId", args: ["WL=1"], expect: false },
  { fn: "isListId", args: ["WL+1"], expect: false },
  { fn: "isListId", args: ["WL.1"], expect: false },
  { fn: "isListId", args: ["WL:1"], expect: false },
  { fn: "isListId", args: ["WL@tracker.invalid"], expect: false },
  { fn: "isListId", args: ["WL\\"], expect: false },
  { fn: "isListId", args: ["PL\u0661\u0662"], expect: false },
  { fn: "isListId", args: ["PLcaf\u00e9"], expect: false },
  { fn: "isListId", args: ["https://www.youtube.com/playlist?list=WL"], expect: false },
  { fn: "isListId", args: [null], expect: false },
  { fn: "isListId", args: [12], expect: false },
  { fn: "isListId", args: [true], expect: false },
  { fn: "isListId", args: [["WL"]], expect: false },
  { fn: "isListId", args: [{ id: "WL" }], expect: false },
  { fn: "isListId", args: [], expect: false },
  { fn: "isListId", args: [{ gen: "repeat", unit: "A", count: 300000 }], expect: false },
  { fn: "isListId", args: [{ gen: "codes", codes: [80, 76, 55357] }], expect: false },

  // ---- playlistUrl: rebuilt from a valid id, or nothing ----
  { fn: "playlistUrl", args: ["WL"], expect: "https://www.youtube.com/playlist?list=WL" },
  { fn: "playlistUrl", args: [_LIST], expect: "https://www.youtube.com/playlist?list=PL0000000000000001" },
  { fn: "playlistUrl", args: [_LIST_LONG],
    expect: "https://www.youtube.com/playlist?list=PLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
  { fn: "playlistUrl", args: ["--no-config"], expect: "https://www.youtube.com/playlist?list=--no-config" },
  { fn: "playlistUrl", args: ["constructor"], expect: "https://www.youtube.com/playlist?list=constructor" },
  { fn: "playlistUrl", args: [""], expect: "" },
  { fn: "playlistUrl", args: ["W"], expect: "" },
  { fn: "playlistUrl", args: ["WL\n"], expect: "" },
  { fn: "playlistUrl", args: ["WL&list=LL"], expect: "" },
  { fn: "playlistUrl", args: ["WL#x"], expect: "" },
  { fn: "playlistUrl", args: ["WL/../../watch?v=AAAAAAAAAAA"], expect: "" },
  { fn: "playlistUrl", args: ["WL@tracker.invalid/"], expect: "" },
  { fn: "playlistUrl", args: ["https://tracker.invalid/playlist?list=WL"], expect: "" },
  { fn: "playlistUrl", args: ["https://www.youtube.com/playlist?list=WL"], expect: "" },
  { fn: "playlistUrl", args: [" WL"], expect: "" },
  { fn: "playlistUrl", args: [null], expect: "" },
  { fn: "playlistUrl", args: [12], expect: "" },
  { fn: "playlistUrl", args: [["WL"]], expect: "" },
  { fn: "playlistUrl", args: [], expect: "" },
  { fn: "playlistUrl", args: [{ gen: "repeat", unit: "A", count: 300000 }], expect: "" },

  // ---- parse: a list of videos, the same for every feed of videos ----
  { fn: "parse", args: ["foryou", _THREE], expect: _tracks(_THREE_TRACKS) },
  { fn: "parse", args: ["subs", _THREE], expect: _tracks(_THREE_TRACKS) },
  { fn: "parse", args: ["later", _THREE], expect: _tracks(_THREE_TRACKS) },
  { fn: "parse", args: ["history", _THREE], expect: _tracks(_THREE_TRACKS) },
  // Trailing whitespace, as a command prints it.
  { fn: "parse", args: ["foryou", _THREE + "\n"], expect: _tracks(_THREE_TRACKS) },

  // ---- parse: rows without a channel are kept, with an empty channel ----
  { fn: "parse", args: ["history", _HISTORY],
    expect: _tracks([
      _track(_A, "Watched first", "", 213, false), _track(_B, "Watched second", "", 0, false),
      _track(_C, "Watched third", "", null, true)
    ]) },
  // The uploader stands in for a missing channel, and only a string counts.
  { fn: "parse", args: ["history", _text([{ id: _A, title: "t", uploader: "Uploader", duration: 5 }])],
    expect: _tracks([_track(_A, "t", "Uploader", 5, false)]) },
  { fn: "parse", args: ["history", _text([{ id: _A, title: "t", channel: null, uploader: "Up" }])],
    expect: _tracks([_track(_A, "t", "Up", null, true)]) },
  { fn: "parse", args: ["history", _text([{ id: _A, title: "t", channel: 7, uploader: ["x"], duration: 5 }])],
    expect: _tracks([_track(_A, "t", "", 5, false)]) },
  { fn: "parse", args: ["history", _text([{ id: _A, title: "t", channel: { name: "x" }, duration: 5 }])],
    expect: _tracks([_track(_A, "t", "", 5, false)]) },
  { fn: "parse", args: ["history", _text([{ id: _A, title: "t", channel: "", duration: 5 }])],
    expect: _tracks([_track(_A, "t", "", 5, false)]) },

  // ---- parse: a missing or odd duration is unknown, and unknown counts as live ----
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t" }])],
    expect: _tracks([_track(_A, "t", "", null, true)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: null }])],
    expect: _tracks([_track(_A, "t", "", null, true)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: "213" }])],
    expect: _tracks([_track(_A, "t", "", null, true)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: -1 }])],
    expect: _tracks([_track(_A, "t", "", null, true)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: 172801 }])],
    expect: _tracks([_track(_A, "t", "", null, true)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: [213] }])],
    expect: _tracks([_track(_A, "t", "", null, true)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: 212.6 }])],
    expect: _tracks([_track(_A, "t", "", 213, false)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: 172800 }])],
    expect: _tracks([_track(_A, "t", "", 172800, false)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: 300, live_status: "is_live" }])],
    expect: _tracks([_track(_A, "t", "", 300, true)]) },
  { fn: "parse", args: ["subs", _text([{ id: _A, title: "t", duration: 300, live_status: "was_live" }])],
    expect: _tracks([_track(_A, "t", "", 300, false)]) },
  // Not started yet: nothing to play.
  { fn: "parse",
    args: ["subs", _text([{ id: _A, title: "t", live_status: "is_upcoming" }, _video(_B, "u", "c", 9)])],
    expect: _tracks([_track(_B, "u", "c", 9, false)]) },

  // ---- parse: what is not a video with a title is dropped ----
  { fn: "parse",
    args: ["foryou", _text([
      _playlist(_LIST, "A playlist among the videos"),
      { id: "UCAAAAAAAAAAAAAAAAAAAAAA", title: "A channel" },
      { id: "RDAAAAAAAAAAA", title: "A mix" },
      { id: "AAAAAAAAAA", title: "Ten characters" },
      { id: "AAAAAAAAAAAA", title: "Twelve characters" },
      { id: "AAAAAAAAAA!", title: "A character outside the alphabet" },
      { id: "AAAAA AAAAA", title: "A space" },
      { id: "AAAAAAAAAAA\n", title: "A line break" },
      { id: "", title: "An empty id" },
      { id: null, title: "No id" },
      { id: 12345678901, title: "A number" },
      { id: [_A], title: "An array" },
      { id: { id: _A }, title: "An object" },
      { title: "Nothing but a title" },
      { id: _A },
      { id: _A, title: null },
      { id: _A, title: 7 },
      { id: _A, title: ["t"] },
      { id: _A, title: "" },
      { id: _A, title: "   " },
      { id: _A, title: "\u200b\u202e\u0000" },
      _video(_B, "The one video", "Example Channel", 100)
    ])],
    expect: _tracks([_track(_B, "The one video", "Example Channel", 100, false)]) },
  { fn: "parse",
    args: ["later", _text([null, 7, "AAAAAAAAAAA", true, [], [_video(_A, "t", "c", 1)], {}, _nested(200),
      _video(_B, "Kept", "c", 1)])],
    expect: _tracks([_track(_B, "Kept", "c", 1, false)]) },
  // A "__proto__" key is a key like any other: what sits below it does not
  // become the entry's own id and title.
  { fn: "parse", args: ["later", _INHERITED_VIDEO], expect: _tracks([]) },

  // ---- parse: ids that look like something else are ordinary ids ----
  { fn: "parse",
    args: ["foryou", _text([
      { id: "constructor", title: "First", duration: 1 }, { id: "constructor", title: "Again", duration: 2 },
      { id: "--no-config", title: "Second", duration: 3 }, { id: "-AAAAAAAAAA", title: "Third", duration: 4 },
      { id: "___________", title: "Fourth", duration: 5 }
    ])],
    expect: _tracks([
      _track("constructor", "First", "", 1, false), _track("--no-config", "Second", "", 3, false),
      _track("-AAAAAAAAAA", "Third", "", 4, false), _track("___________", "Fourth", "", 5, false)
    ]) },
  // An entry may carry keys named like methods.
  { fn: "parse",
    args: ["foryou", _text([{ hasOwnProperty: 1, toString: 2, id: _A, title: "t", duration: 1 }])],
    expect: _tracks([_track(_A, "t", "", 1, false)]) },

  // ---- parse: each video once, in the order given ----
  { fn: "parse",
    args: ["subs",
      _text([_video(_A, "First", "c", 1), _video(_B, "Second", "c", 2), _video(_A, "Again", "d", 3)])],
    expect: _tracks([_track(_A, "First", "c", 1, false), _track(_B, "Second", "c", 2, false)]) },

  // ---- parse: text is cleaned and cut ----
  { fn: "parse", args: ["foryou", _text([_video(_A, "  two\twords\n", " a \u00a0 channel ", 1)])],
    expect: _tracks([_track(_A, "two words", "a channel", 1, false)]) },
  { fn: "parse", args: ["foryou", _text([_video(_A, "abc\u202edef\u200b\u0007", "\u2066ch\u2069", 1)])],
    expect: _tracks([_track(_A, "abcdef", "ch", 1, false)]) },
  { fn: "parse",
    args: ["foryou",
      _text([_video(_A, "caf\u00e9 \u65e5\u672c\u8a9e \ud83d\ude00", "\u0440\u043e\u043a", 1)])],
    expect: _tracks([
      _track(_A, "caf\u00e9 \u65e5\u672c\u8a9e \ud83d\ude00", "\u0440\u043e\u043a", 1, false)
    ]) },
  { fn: "parse", args: ["foryou", _text([_video(_A, "<img src=x onerror=alert(1)>", "<b>&amp;</b>", 1)])],
    expect: _tracks([_track(_A, "<img src=x onerror=alert(1)>", "<b>&amp;</b>", 1, false)]) },
  // Half a surrogate pair, spelled as an escape, is deleted.
  { fn: "parse", args: ["foryou", _HALF_PAIR], expect: _tracks([_track(_A, "ab", "", null, true)]) },
  // 325 and 125 characters come back as 300 and 120.
  { fn: "parse", args: ["foryou", _text([_video(_A, _A300 + _A25, _A100 + _A25, 1)])],
    expect: _tracks([_track(_A, _A300, _A100 + _A25.slice(0, 20), 1, false)]) },

  // ---- parse: at most fifty rows, however many were sent ----
  { fn: "parse", args: ["foryou", _text(_manyVideos(50))], expect: _tracks(_manyTracks(50)) },
  { fn: "parse", args: ["foryou", _text(_manyVideos(51))], expect: _tracks(_manyTracks(50)) },
  { fn: "parse", args: ["history", _text(_manyVideos(10000))], expect: _tracks(_manyTracks(50)) },
  // Dropped entries do not count towards the fifty.
  { fn: "parse", args: ["subs", _text(_manyPlaylists(2000).concat(_manyVideos(60)))],
    expect: _tracks(_manyTracks(50)) },

  // ---- parse: the playlists feed gives playlists ----
  { fn: "parse", args: ["playlists", _TWO_LISTS],
    expect: _rows([_row(_LIST, "Synthetic playlist", null), _row(_LIST_LONG, "Another playlist", null)]) },
  { fn: "parse",
    args: ["playlists", _text([
      { id: "WL", title: "Watch later", playlist_count: 12 }, { id: "LL", title: "Liked", playlist_count: 0 },
      { id: _LIST, title: "With a fraction", playlist_count: 12.9 }
    ])],
    expect: _rows([
      _row("WL", "Watch later", 12), _row("LL", "Liked", 0), _row(_LIST, "With a fraction", 12)
    ]) },
  // A count that is not a plain number of items is unknown.
  { fn: "parse",
    args: ["playlists", _text([
      { id: "PL01", title: "a", playlist_count: null }, { id: "PL02", title: "b", playlist_count: "12" },
      { id: "PL03", title: "c", playlist_count: -1 }, { id: "PL04", title: "d", playlist_count: 100000 },
      { id: "PL05", title: "e", playlist_count: [12] }, { id: "PL06", title: "f", playlist_count: true },
      { id: "PL07", title: "g", playlist_count: 99999 }, { id: "PL08", title: "h", playlist_count: { n: 1 } }
    ])],
    expect: _rows([
      _row("PL01", "a", null), _row("PL02", "b", null), _row("PL03", "c", null), _row("PL04", "d", null),
      _row("PL05", "e", null), _row("PL06", "f", null), _row("PL07", "g", 99999), _row("PL08", "h", null)
    ]) },
  // An entry yt-dlp marks as a single video is no playlist. Without that
  // mark the id decides, whatever its length.
  { fn: "parse", args: ["playlists", _THREE], expect: _rows([]) },
  { fn: "parse", args: ["playlists", _text([{ id: _A, title: "No extractor named" }])],
    expect: _rows([_row(_A, "No extractor named", null)]) },
  { fn: "parse", args: ["playlists", _text([{ id: _A, title: "Another one named", ie_key: "YoutubeTab" }])],
    expect: _rows([_row(_A, "Another one named", null)]) },
  { fn: "parse", args: ["playlists", _text([{ id: _A, title: "Lower case", ie_key: "youtube" }])],
    expect: _rows([_row(_A, "Lower case", null)]) },
  // Nothing without a usable id and title is a row.
  { fn: "parse",
    args: ["playlists", _text([
      _video(_A, "A video among the playlists", "c", 1),
      { id: "P", title: "One character" },
      { id: "PL" + _A25 + _A25 + _A25.slice(0, 13), title: "Sixty-five characters" },
      { id: "PL 01", title: "A space" },
      { id: "PL01&list=LL", title: "A second parameter" },
      { id: "PL01#x", title: "A fragment" },
      { id: "PL01/../watch", title: "A path" },
      { id: "PL01\n", title: "A line break" },
      { id: "https://tracker.invalid/playlist?list=PL01", title: "An address" },
      { id: "", title: "An empty id" },
      { id: null, title: "No id" },
      { id: 12, title: "A number" },
      { id: ["PL01"], title: "An array" },
      { title: "Nothing but a title" },
      { id: "PL01" },
      { id: "PL01", title: null },
      { id: "PL01", title: 7 },
      { id: "PL01", title: "" },
      { id: "PL01", title: " \u200b " },
      null, 7, "PL01", [], _nested(200),
      _playlist(_LIST, "The one playlist")
    ])],
    expect: _rows([_row(_LIST, "The one playlist", null)]) },
  { fn: "parse", args: ["playlists", _INHERITED_LIST], expect: _rows([]) },
  // Ids that look like something else are ordinary ids, each kept once.
  { fn: "parse",
    args: ["playlists", _text([
      { id: "__proto__", title: "First" }, { id: "__proto__", title: "Again" },
      { id: "constructor", title: "Second" }, { id: "--no-config", title: "Third" },
      { id: "constructor", title: "Again", ie_key: "YoutubeTab" }
    ])],
    expect: _rows([
      _row("__proto__", "First", null), _row("constructor", "Second", null),
      _row("--no-config", "Third", null)
    ]) },
  // The title is cleaned and cut like any other.
  { fn: "parse",
    args: ["playlists",
      _text([_playlist(_LIST, "  a\tlist \u202ename\u0000 "), _playlist("PL02", _A300 + _A25)])],
    expect: _rows([_row(_LIST, "a list name", null), _row("PL02", _A300, null)]) },
  { fn: "parse", args: ["playlists", _text(_manyPlaylists(51))], expect: _rows(_manyRows(50)) },
  { fn: "parse", args: ["playlists", _text(_manyPlaylists(10000))], expect: _rows(_manyRows(50)) },
  { fn: "parse", args: ["playlists", _text(_manyVideos(2000).concat(_manyPlaylists(60)))],
    expect: _rows(_manyRows(50)) },

  // ---- parse: an answer without rows is an answer ----
  { fn: "parse", args: ["foryou", _text([])], expect: _tracks([]) },
  { fn: "parse", args: ["history", _EMPTY], expect: _tracks([]) },
  { fn: "parse", args: ["playlists", _text([])], expect: _rows([]) },
  { fn: "parse", args: ["later", _text([null, null])], expect: _tracks([]) },

  // ---- parse: not a feed ----
  { fn: "parse", args: ["", _THREE], expect: _NO },
  { fn: "parse", args: ["trending", _THREE], expect: _NO },
  { fn: "parse", args: ["History", _THREE], expect: _NO },
  { fn: "parse", args: ["history\n", _THREE], expect: _NO },
  { fn: "parse", args: ["constructor", _THREE], expect: _NO },
  { fn: "parse", args: ["__proto__", _THREE], expect: _NO },
  { fn: "parse", args: [0, _THREE], expect: _NO },
  { fn: "parse", args: [null, _THREE], expect: _NO },
  { fn: "parse", args: [["history"], _THREE], expect: _NO },
  { fn: "parse", args: ["https://www.youtube.com/feed/history", _THREE], expect: _NO },

  // ---- parse: not a playlist answer ----
  { fn: "parse", args: ["foryou", ""], expect: _NO },
  { fn: "parse", args: ["foryou", "\n"], expect: _NO },
  { fn: "parse", args: ["foryou", "null"], expect: _NO },
  { fn: "parse", args: ["foryou", "true"], expect: _NO },
  { fn: "parse", args: ["foryou", "0"], expect: _NO },
  { fn: "parse", args: ["foryou", "\"playlist\""], expect: _NO },
  { fn: "parse", args: ["foryou", "[]"], expect: _NO },
  { fn: "parse", args: ["foryou", "{}"], expect: _NO },
  { fn: "parse", args: ["foryou", "[{\"_type\":\"playlist\",\"entries\":[]}]"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"entries\":[]}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"playlist\"}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"playlist\",\"entries\":null}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"playlist\",\"entries\":{}}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"playlist\",\"entries\":\"[]\"}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"playlist\",\"entries\":{\"length\":1,\"0\":{}}}"],
    expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"video\",\"entries\":[]}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"Playlist\",\"entries\":[]}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":[\"playlist\"],\"entries\":[]}"], expect: _NO },
  { fn: "parse", args: ["foryou", _json(_video(_A, "A single video", "c", 1))], expect: _NO },
  { fn: "parse", args: ["foryou", _INHERITED_ANSWER], expect: _NO },
  { fn: "parse", args: ["foryou", "ERROR: [youtube:tab] synthetic: Unable to download API page"],
    expect: _NO },
  { fn: "parse", args: ["foryou", "<!DOCTYPE html><html><body>Sign in</body></html>"], expect: _NO },
  // Cut short, followed by something, or said twice.
  { fn: "parse", args: ["foryou", _CUT_SHORT], expect: _NO },
  { fn: "parse", args: ["foryou", _EMPTY + " trailing"], expect: _NO },
  { fn: "parse", args: ["foryou", _EMPTY + "\n" + _EMPTY], expect: _NO },
  // What only a lenient reader would take.
  { fn: "parse", args: ["foryou", _NOT_A_NUMBER], expect: _NO },
  { fn: "parse", args: ["foryou", _INFINITE], expect: _NO },
  { fn: "parse", args: ["foryou", "{'_type':'playlist','entries':[]}"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"playlist\",\"entries\":[],}"], expect: _NO },
  // A character outside ASCII means damaged or foreign output.
  { fn: "parse", args: ["foryou", _RAW_ACCENT], expect: _NO },
  { fn: "parse", args: ["foryou", "\ufeff" + _EMPTY], expect: _NO },
  { fn: "parse", args: ["foryou", _EMPTY + "\u0000"], expect: _NO },
  { fn: "parse", args: ["foryou", "{\"_type\":\"playlist\",\t\"entries\":[]}"], expect: _NO },
  { fn: "parse", args: ["playlists", _RAW_ACCENT_LIST], expect: _NO },
  { fn: "parse", args: ["foryou", _EMPTY + "\r\n"], expect: _NO },
  { fn: "parse", args: ["foryou", _DELETE_VIDEO], expect: _NO },
  // The playlists feed is held to the same characters.
  { fn: "parse", args: ["playlists", _TABBED], expect: _NO },
  { fn: "parse", args: ["playlists", _EMPTY + "\r\n"], expect: _NO },
  { fn: "parse", args: ["playlists", _DELETE_LIST], expect: _NO },
  { fn: "parse", args: ["playlists", "\ufeff" + _EMPTY], expect: _NO },
  { fn: "parse", args: ["playlists", _EMPTY + "\u0000"], expect: _NO },
  { fn: "parse", args: ["foryou", { gen: "codes", codes: [55357] }], expect: _NO },
  { fn: "parse", args: ["playlists", { gen: "codes", codes: [123, 125, 56832] }], expect: _NO },
  // An answer of exactly the most a feed job may send is read, and one
  // character more makes the same answer too long.
  { fn: "parse", args: ["foryou", _padded(_ONE_VIDEO, _MOST)],
    expect: _tracks([_track(_A, "t", "", 5, false)]) },
  { fn: "parse", args: ["foryou", _padded(_ONE_VIDEO, _MOST + 1)], expect: _NO },
  { fn: "parse", args: ["playlists", _padded(_ONE_LIST, _MOST)], expect: _rows([_row("PL01", "t", null)]) },
  { fn: "parse", args: ["playlists", _padded(_ONE_LIST, _MOST + 1)], expect: _NO },
  // Longer than an answer may be.
  { fn: "parse", args: ["foryou", { gen: "repeat", unit: " ", count: 1048577 }], expect: _NO },
  { fn: "parse", args: ["playlists", { gen: "repeat", unit: " ", count: 1048577 }], expect: _NO },
  { fn: "parse", args: ["foryou", { gen: "repeat", unit: "[", count: 300000 }], expect: _NO },
  { fn: "parse", args: ["playlists", { gen: "repeat", unit: "[", count: 300000 }], expect: _NO },
  { fn: "parse", args: ["foryou", { gen: "repeat", unit: "{\"a\":", count: 100000 }], expect: _NO },
  // Not text.
  { fn: "parse", args: ["foryou", null], expect: _NO },
  { fn: "parse", args: ["foryou", 7], expect: _NO },
  { fn: "parse", args: ["foryou", true], expect: _NO },
  { fn: "parse", args: ["foryou", _answer([_video(_A, "An object, not its text", "c", 1)])], expect: _NO },
  { fn: "parse", args: ["foryou", [_THREE]], expect: _NO },
  { fn: "parse", args: ["foryou"], expect: _NO },
  { fn: "parse", args: ["playlists", null], expect: _NO },
  { fn: "parse", args: ["playlists", _answer([_playlist(_LIST, "An object, not its text")])], expect: _NO },
  { fn: "parse", args: ["playlists", ""], expect: _NO },
  { fn: "parse", args: ["playlists", "null"], expect: _NO },
  { fn: "parse", args: ["playlists", "[]"], expect: _NO },
  { fn: "parse", args: ["playlists", "{\"_type\":\"playlist\"}"], expect: _NO },
  { fn: "parse", args: ["playlists", "{\"_type\":\"playlist\",\"entries\":{}}"], expect: _NO },
  { fn: "parse", args: ["playlists", "{\"_type\":\"video\",\"entries\":[]}"], expect: _NO },
  { fn: "parse", args: ["playlists", _INHERITED_ANSWER], expect: _NO },
  { fn: "parse", args: ["playlists", _EMPTY + " trailing"], expect: _NO },
  { fn: "parse", args: [], expect: _NO },

  // ---- parseList: the videos of an opened playlist ----
  { fn: "parseList", args: [_THREE], expect: { ok: true, tracks: _THREE_TRACKS } },
  { fn: "parseList", args: [_HISTORY],
    expect: { ok: true, tracks: [
      _track(_A, "Watched first", "", 213, false), _track(_B, "Watched second", "", 0, false),
      _track(_C, "Watched third", "", null, true)
    ] } },
  { fn: "parseList", args: [_text([])], expect: { ok: true, tracks: [] } },
  { fn: "parseList", args: [_TWO_LISTS], expect: { ok: true, tracks: [] } },
  { fn: "parseList", args: [_text(_manyVideos(10000))], expect: { ok: true, tracks: _manyTracks(50) } },
  { fn: "parseList", args: [""], expect: _NO },
  { fn: "parseList", args: ["null"], expect: _NO },
  { fn: "parseList", args: ["{\"_type\":\"playlist\"}"], expect: _NO },
  { fn: "parseList", args: [_json(_video(_A, "A single video", "c", 1))], expect: _NO },
  { fn: "parseList", args: [_EMPTY + " trailing"], expect: _NO },
  { fn: "parseList", args: [_RAW_ACCENT], expect: _NO },
  { fn: "parseList", args: [_CUT_SHORT], expect: _NO },
  { fn: "parseList", args: [_INHERITED_ANSWER], expect: _NO },
  { fn: "parseList", args: [_INHERITED_VIDEO], expect: { ok: true, tracks: [] } },
  { fn: "parseList", args: [_padded(_ONE_VIDEO, _MOST)],
    expect: { ok: true, tracks: [_track(_A, "t", "", 5, false)] } },
  { fn: "parseList", args: [_padded(_ONE_VIDEO, _MOST + 1)], expect: _NO },
  { fn: "parseList", args: [_DELETE_VIDEO], expect: _NO },
  { fn: "parseList", args: [{ gen: "repeat", unit: " ", count: 1048577 }], expect: _NO },
  { fn: "parseList", args: [{ gen: "codes", codes: [55357] }], expect: _NO },
  { fn: "parseList", args: [null], expect: _NO },
  { fn: "parseList", args: [_answer([])], expect: _NO },
  { fn: "parseList", args: ["history"], expect: _NO },
  { fn: "parseList", args: [], expect: _NO },

  // ---- isFresh: five minutes from the fetch, and never before it ----
  { fn: "isFresh", args: [0, 0], expect: true },
  { fn: "isFresh", args: [1000, 1000], expect: true },
  { fn: "isFresh", args: [1000, 1001], expect: true },
  { fn: "isFresh", args: [1000, 300999], expect: true },
  { fn: "isFresh", args: [1000, 301000], expect: false },
  { fn: "isFresh", args: [1000, 301001], expect: false },
  { fn: "isFresh", args: [1760000000000, 1760000299999], expect: true },
  { fn: "isFresh", args: [1760000000000, 1760000300000], expect: false },
  { fn: "isFresh", args: [1760000000000, 1860000000000], expect: false },
  // The clock was set back.
  { fn: "isFresh", args: [1000, 999], expect: false },
  { fn: "isFresh", args: [1760000000000, 1750000000000], expect: false },
  { fn: "isFresh", args: [1760000000000, 0], expect: false },
  { fn: "isFresh", args: [0.5, 1.5], expect: true },
  { fn: "isFresh", args: [NaN, 1000], expect: false },
  { fn: "isFresh", args: [1000, NaN], expect: false },
  { fn: "isFresh", args: [Infinity, Infinity], expect: false },
  { fn: "isFresh", args: [-Infinity, 0], expect: false },
  { fn: "isFresh", args: [0, Infinity], expect: false },
  { fn: "isFresh", args: ["1000", 1000], expect: false },
  { fn: "isFresh", args: [1000, "1000"], expect: false },
  { fn: "isFresh", args: [null, 0], expect: false },
  { fn: "isFresh", args: [0, null], expect: false },
  { fn: "isFresh", args: [true, true], expect: false },
  { fn: "isFresh", args: [[0], [0]], expect: false },
  { fn: "isFresh", args: [{ at: 0 }, 0], expect: false },
  { fn: "isFresh", args: [1000], expect: false },
  { fn: "isFresh", args: [], expect: false },

  // ---- feedArgv, verifyArgv, markArgv: the three calls that carry the login ----
  { fn: "feedArgv", args: [_TOOLS, _PATHS, _COPY], expect: _FEED_ARGV },
  { fn: "verifyArgv", args: [_TOOLS, _PATHS, _COPY], expect: _VERIFY_ARGV },
  { fn: "markArgv", args: [_TOOLS, _PATHS, _COPY], expect: _MARK_ARGV },
  // Any counter names a copy.
  { fn: "feedArgv", args: [_TOOLS, _PATHS, _RUNTIME + "/jar/1.txt"],
    expect: _signedIn(_RUNTIME + "/jar/1.txt", _FEED_FLAGS) },
  { fn: "markArgv", args: [_TOOLS, _PATHS, _RUNTIME + "/jar/9999999999.txt"],
    expect: _signedIn(_RUNTIME + "/jar/9999999999.txt", _MARK_FLAGS) },
  // A stand-in for the tool, as a test run has it.
  { fn: "verifyArgv", args: [{ ytdlp: "/tmp/oj-test.1/stubs/yt-dlp.js" }, _PATHS, _COPY],
    expect: ["/tmp/oj-test.1/stubs/yt-dlp.js"].concat(_VERIFY_ARGV.slice(1)) },
  // No tool, or one that is not an absolute path.
  { fn: "feedArgv", args: [null, _PATHS, _COPY], expect: null },
  { fn: "feedArgv", args: [undefined, _PATHS, _COPY], expect: null },
  { fn: "feedArgv", args: ["/usr/bin/yt-dlp", _PATHS, _COPY], expect: null },
  { fn: "feedArgv", args: [{}, _PATHS, _COPY], expect: null },
  { fn: "feedArgv", args: [{ ytdlp: "" }, _PATHS, _COPY], expect: null },
  { fn: "feedArgv", args: [{ ytdlp: "yt-dlp" }, _PATHS, _COPY], expect: null },
  { fn: "feedArgv", args: [{ ytdlp: null }, _PATHS, _COPY], expect: null },
  { fn: "feedArgv", args: [{ ytdlp: ["/usr/bin/yt-dlp"] }, _PATHS, _COPY], expect: null },
  { fn: "verifyArgv", args: [{ ytdlp: "yt-dlp" }, _PATHS, _COPY], expect: null },
  { fn: "markArgv", args: [{ ytdlp: "yt-dlp" }, _PATHS, _COPY], expect: null },
  // Paths that were not resolved, or without a place for the cache or for
  // the copies.
  { fn: "feedArgv", args: [_TOOLS, null, _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, undefined, _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, { ok: false }, _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, _pathsWith("ok", false), _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, _pathsWith("ok", "true"), _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, _pathsWith("ytCacheDir", ""), _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, _pathsWith("ytCacheDir", "ytcache"), _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, _pathsWith("jarDir", ""), _COPY], expect: null },
  { fn: "feedArgv", args: [_TOOLS, _pathsWith("jarDir", "/run/user/1000/other/jar"), _COPY], expect: null },
  { fn: "verifyArgv", args: [_TOOLS, { ok: false }, _COPY], expect: null },
  { fn: "markArgv", args: [_TOOLS, { ok: false }, _COPY], expect: null },
  { fn: "feedArgv", args: [], expect: null },
  { fn: "verifyArgv", args: [], expect: null },
  { fn: "markArgv", args: [], expect: null }

  // ---- The cookie file: one more case per builder for everything that is not a copy ----
  // ---- playlistUrl: one more case for each character of _NOT_ID ----
].concat(_refusedCopies(), _perCharacter(_NOT_ID, _noListId))

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
