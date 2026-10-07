.pragma library

// Input and expectation table for lib/StateFile.js: what a state file may
// hold, what is made of a file that holds something else, and the exact
// text that is written. Most rows are hostile on purpose: wrong types,
// numbers out of range, lists far too long, keys that name members of
// Object.prototype, text that is not ASCII. The same table runs under node
// and inside Qt's JavaScript engine, so both must agree on every row. All
// ids and names are synthetic.

var MODULE = "StateFile"

var _NO = { ok: false }

// A shortcuts entry: no combination for any action and nothing unconfirmed,
// except what is given.
function _keys(given) {
  var keys = {
    panel: "", video: "", output: "", playPause: "", next: "", previous: "", dirty: false, asked: false
  }
  var names = Object.keys(given)
  for (var i = 0; i < names.length; i++) keys[names[i]] = given[names[i]]
  return keys
}

// The state of a first start.
// The members a file written before the last three actions existed lacks.
var _LATER = "\"playPause\":\"\",\"next\":\"\",\"previous\":\"\","

var _DEFAULTS = {
  volume: 70, muted: false, proxyAck: false, prefs: {}, recents: [], queue: { items: [], index: -1 },
  video: {}, shortcuts: _keys({}), outputDevice: ""
}

// What is written for it, with and without history.
var _HEAD = "{\"version\":1,\"volume\":70,\"muted\":false,\"proxyAck\":false,\"prefs\":{}"
var _EMPTY_HISTORY = ",\"recents\":[],\"queue\":{\"items\":[],\"index\":-1}"

var _A = { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false }
var _B = { id: "BBBBBBBBBBB", title: "B title", channel: "B channel", duration: 100, live: false }
var _A_TEXT = "{\"id\":\"AAAAAAAAAAA\",\"title\":\"A title\",\"channel\":\"A channel\",\"duration\":213,"
  + "\"live\":false}"
var _B_ITEM_TEXT = "{\"id\":\"BBBBBBBBBBB\",\"title\":\"B title\",\"channel\":\"B channel\",\"duration\":100,"
  + "\"live\":false,\"auto\":true}"

// A copy of base with the members of changes laid over it, in base's order.
// Only ever used on the literals of this file.
function _with(base, changes) {
  var copy = {}
  var key
  for (key in base) copy[key] = base[key]
  for (key in changes) copy[key] = changes[key]
  return copy
}

// The text unit repeated count times.
function _repeat(unit, count) {
  return new Array(count + 1).join(unit)
}

// What JSON.parse makes of a text: used for objects that carry a key such
// as "__proto__" as plain data, which an object literal cannot spell.
function _parsed(text) {
  return JSON.parse(text)
}

// An object that only inherits its members.
function _inheriting(base) {
  return Object.create(base)
}

// The text of a version 1 file with these keys.
function _file(fields) {
  return JSON.stringify(_with({ version: 1 }, fields))
}

// The state such a file is read as.
function _state(changes) {
  return _with(_DEFAULTS, changes)
}

function _ok(changes) {
  return { ok: true, state: _state(changes) }
}

// A queue item: a track that also says whether autoplay added it.
function _item(track, auto) {
  return _with(track, { auto: auto })
}

// Track number n of a long list: each with an id of its own.
function _numbered(n) {
  return _with(_A, { id: "AAAAAAA" + String(10000 + n).slice(1), title: "Track " + n })
}

function _tracks(count) {
  var list = []
  for (var i = 0; i < count; i++) list.push(_numbered(i))
  return list
}

function _items(count) {
  var list = []
  for (var i = 0; i < count; i++) list.push(_item(_numbered(i), false))
  return list
}

// count values that are no tracks, followed by the tracks of rest.
function _junkThen(count, rest) {
  var list = []
  for (var i = 0; i < count; i++) list.push(i % 2 === 0 ? i : { id: "short", title: "x" })
  return list.concat(rest)
}

// count monitors, named "M" and their number, with a valid placement each.
function _monitors(count) {
  var table = {}
  for (var i = 0; i < count; i++) table["M" + i] = { corner: "top-left", widthPct: 10 + i }
  return table
}

// JSON text of arrays nested depth levels deep.
function _nested(depth) {
  return _repeat("[", depth) + _repeat("]", depth)
}

// A valid file of exactly length characters.
function _padded(length) {
  var body = "{\"version\":1}"
  return body + _repeat(" ", length - body.length)
}

// ---- The largest state there can be ----

// 30 recents and 200 queue items, every title and channel at its full
// length in characters that take six bytes each once escaped, the longest
// numbers, every remembered choice, eight monitors with the longest names,
// the longest shortcut texts and device name.
var _WIDE = "\u4e00"
var _WIDE_ESCAPED = "\\u4e00"

function _bigId(n) {
  return "ZZZZZZZ" + String(10000 + n).slice(1)
}

function _bigTrack(n) {
  return {
    id: _bigId(n), title: _repeat(_WIDE, 300), channel: _repeat(_WIDE, 120), duration: 172800, live: false
  }
}

// The same track as it is written, spelled out by hand.
function _bigTrackText(n, tail) {
  return "{\"id\":\"" + _bigId(n) + "\",\"title\":\"" + _repeat(_WIDE_ESCAPED, 300) + "\",\"channel\":\""
    + _repeat(_WIDE_ESCAPED, 120) + "\",\"duration\":172800,\"live\":false" + tail + "}"
}

function _bigMonitor(n) {
  return _repeat("M", 31) + n
}

function _bigState() {
  var recents = []
  var items = []
  var video = {}
  var i
  for (i = 0; i < 30; i++) recents.push(_bigTrack(i))
  for (i = 0; i < 200; i++) items.push(_item(_bigTrack(1000 + i), false))
  for (i = 0; i < 8; i++) video[_bigMonitor(i)] = { corner: "bottom-right", widthPct: 90 }
  return {
    volume: 100, muted: false, proxyAck: false,
    prefs: { rememberHistory: false, preload: false, autoplay: false },
    recents: recents, queue: { items: items, index: 199 }, video: video,
    shortcuts: _keys({
      panel: _repeat(_WIDE, 64), video: _repeat(_WIDE, 64), output: _repeat(_WIDE, 64),
      playPause: _repeat(_WIDE, 64), next: _repeat(_WIDE, 64), previous: _repeat(_WIDE, 64)
    }),
    outputDevice: _repeat(_WIDE, 256)
  }
}

function _bigText() {
  var recents = []
  var items = []
  var video = []
  var i
  for (i = 0; i < 30; i++) recents.push(_bigTrackText(i, ""))
  for (i = 0; i < 200; i++) items.push(_bigTrackText(1000 + i, ",\"auto\":false"))
  var place = "\":{\"corner\":\"bottom-right\",\"widthPct\":90}"
  for (i = 0; i < 8; i++) video.push("\"" + _bigMonitor(i) + place)
  var combo = "\"" + _repeat(_WIDE_ESCAPED, 64) + "\""
  return "{\"version\":1,\"volume\":100,\"muted\":false,\"proxyAck\":false,"
    + "\"prefs\":{\"rememberHistory\":false,\"preload\":false,\"autoplay\":false},"
    + "\"recents\":[" + recents.join(",") + "],"
    + "\"queue\":{\"items\":[" + items.join(",") + "],\"index\":199},"
    + "\"video\":{" + video.join(",") + "},"
    + "\"shortcuts\":{\"panel\":" + combo + ",\"video\":" + combo + ",\"output\":" + combo
    + ",\"playPause\":" + combo + ",\"next\":" + combo + ",\"previous\":" + combo + ",\"dirty\":false,"
    + "\"asked\":false},\"outputDevice\":\"" + _repeat(_WIDE_ESCAPED, 256) + "\"}"
}

var _BIG = _bigState()
var _BIG_TEXT = _bigText()

// One remembered placement, as text.
var _PLACE = "{\"corner\":\"top-left\",\"widthPct\":20}"

// A line of Lua someone might hope to see run, as a shortcut text.
var _LUA = "F1\") os.execute(\"x"

var CASES = [
  // ---- defaults ----
  { fn: "defaults", args: [], expect: _DEFAULTS },

  // ---- parse: what is no state file ----
  { fn: "parse", args: [], expect: _NO },
  { fn: "parse", args: [null], expect: _NO },
  { fn: "parse", args: [5], expect: _NO },
  { fn: "parse", args: [{ version: 1 }], expect: _NO },
  { fn: "parse", args: [["{\"version\":1}"]], expect: _NO },
  { fn: "parse", args: [""], expect: _NO },
  { fn: "parse", args: ["\n"], expect: _NO },
  { fn: "parse", args: ["garbage"], expect: _NO },
  { fn: "parse", args: ["{"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1}}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1} trailing"], expect: _NO },
  { fn: "parse", args: ["{'version':1}"], expect: _NO },
  { fn: "parse", args: ["null"], expect: _NO },
  { fn: "parse", args: ["true"], expect: _NO },
  { fn: "parse", args: ["1"], expect: _NO },
  { fn: "parse", args: ["\"{\\\"version\\\":1}\""], expect: _NO },
  { fn: "parse", args: ["[]"], expect: _NO },
  { fn: "parse", args: ["[{\"version\":1}]"], expect: _NO },
  { fn: "parse", args: [_nested(100000)], expect: _NO },

  // ---- parse: the version ----
  { fn: "parse", args: ["{}"], expect: _NO },
  { fn: "parse", args: ["{\"volume\":50}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":2,\"volume\":50}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":0}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":\"1\"}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1.5}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":true}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":[1]}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":null}"], expect: _NO },
  { fn: "parse", args: ["{\"Version\":1}"], expect: _NO },
  // A version that is only inherited is not the file's version.
  { fn: "parse", args: ["{\"__proto__\":{\"version\":1}}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1}"], expect: _ok({}) },
  { fn: "parse", args: ["{\"version\":1.0}"], expect: _ok({}) },
  { fn: "parse", args: [" {\n  \"version\": 1\n}\n"], expect: _ok({}) },

  // ---- parse: only printable ASCII and newlines ----
  { fn: "parse", args: ["{\"version\":1,\"outputDevice\":\"caf\u00e9\"}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1,\"outputDevice\":\"\u4e16\u754c\"}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1}\u00a0"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1}\ufffd"], expect: _NO },
  { fn: "parse", args: ["\ufeff{\"version\":1}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1}\r\n"], expect: _NO },
  { fn: "parse", args: ["{\t\"version\":1}"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1}\u007f"], expect: _NO },
  { fn: "parse", args: ["{\"version\":1}\u0000"], expect: _NO },
  // The same characters as escapes are fine: that is how they are written.
  { fn: "parse", args: ["{\"version\":1,\"outputDevice\":\"caf\\u00e9 \\u4e16\\u754c\"}"],
    expect: _ok({ outputDevice: "caf\u00e9 \u4e16\u754c" }) },

  // ---- parse: the size ----
  { fn: "parse", args: [_padded(1048576)], expect: _ok({}) },
  { fn: "parse", args: [_padded(1048577)], expect: _NO },

  // ---- parse: volume, muted, proxyAck ----
  { fn: "parse", args: [_file({ volume: 0 })], expect: _ok({ volume: 0 }) },
  { fn: "parse", args: [_file({ volume: 100 })], expect: _ok({ volume: 100 }) },
  { fn: "parse", args: [_file({ volume: 101 })], expect: _ok({ volume: 100 }) },
  { fn: "parse", args: [_file({ volume: 250 })], expect: _ok({ volume: 100 }) },
  { fn: "parse", args: [_file({ volume: -5 })], expect: _ok({ volume: 0 }) },
  { fn: "parse", args: [_file({ volume: 55.4 })], expect: _ok({ volume: 55 }) },
  { fn: "parse", args: [_file({ volume: 55.5 })], expect: _ok({ volume: 56 }) },
  { fn: "parse", args: ["{\"version\":1,\"volume\":-0.2}"], expect: _ok({ volume: 0 }) },
  // (A number too large to hold, such as 1e999, is not in this table: Qt's
  // JSON refuses the whole text, node reads it as Infinity. Each engine's
  // own test has a row for it.)
  { fn: "parse", args: [_file({ volume: "55" })], expect: _ok({}) },
  { fn: "parse", args: [_file({ volume: null })], expect: _ok({}) },
  { fn: "parse", args: [_file({ volume: true })], expect: _ok({}) },
  { fn: "parse", args: [_file({ volume: [55] })], expect: _ok({}) },
  { fn: "parse", args: [_file({ volume: { valueOf: 55 } })], expect: _ok({}) },
  { fn: "parse", args: [_file({ muted: true, proxyAck: true })],
    expect: _ok({ muted: true, proxyAck: true }) },
  { fn: "parse", args: [_file({ muted: "true", proxyAck: 1 })], expect: _ok({}) },
  { fn: "parse", args: [_file({ muted: [true], proxyAck: { ack: true } })], expect: _ok({}) },
  { fn: "parse", args: [_file({ muted: null, proxyAck: "yes" })], expect: _ok({}) },

  // ---- parse: prefs, the remembered privacy choices ----
  { fn: "parse", args: [_file({ prefs: { rememberHistory: false } })],
    expect: _ok({ prefs: { rememberHistory: false } }) },
  { fn: "parse", args: [_file({ prefs: { autoplay: true, preload: false, rememberHistory: true } })],
    expect: _ok({ prefs: { rememberHistory: true, preload: false, autoplay: true } }) },
  // Nothing but the three, and nothing but booleans.
  { fn: "parse",
    args: [_file({ prefs: { rememberHistory: false, markWatched: true, sponsorSkip: true,
      evenVolume: true } })],
    expect: _ok({ prefs: { rememberHistory: false } }) },
  { fn: "parse", args: [_file({ prefs: { rememberHistory: "false", preload: 0, autoplay: null } })],
    expect: _ok({}) },
  { fn: "parse", args: [_file({ prefs: [false, false, false] })], expect: _ok({}) },
  { fn: "parse", args: [_file({ prefs: "rememberHistory" })], expect: _ok({}) },
  { fn: "parse", args: [_file({ prefs: null })], expect: _ok({}) },
  { fn: "parse",
    args: ["{\"version\":1,\"prefs\":{\"__proto__\":{\"rememberHistory\":false},\"constructor\":true}}"],
    expect: _ok({}) },

  // ---- parse: recents ----
  { fn: "parse", args: [_file({ recents: [_A, _B] })], expect: _ok({ recents: [_A, _B] }) },
  // A queue item's own members stay behind.
  { fn: "parse", args: [_file({ recents: [_with(_A, { key: 7, auto: true, playedAt: 1700000000 })] })],
    expect: _ok({ recents: [_A] }) },
  // Each id once: the first one stays.
  { fn: "parse", args: [_file({ recents: [_A, _B, _with(_A, { title: "Again" }), _B] })],
    expect: _ok({ recents: [_A, _B] }) },
  { fn: "parse",
    args: [_file({ recents: [null, 5, "AAAAAAAAAAA", [], [_A], { id: "short", title: "x" },
      { id: "AAAAAAAAAAA" }, { title: "no id" }, _B] })],
    expect: _ok({ recents: [_B] }) },
  { fn: "parse",
    args: [_file({ recents: [_with(_A, { id: "constructor" }), _with(_A, { id: "__proto__AA" })] })],
    expect: _ok({ recents: [_with(_A, { id: "constructor" }), _with(_A, { id: "__proto__AA" })] }) },
  // Titles are cleaned like any other outside text.
  { fn: "parse",
    args: ["{\"version\":1,\"recents\":[{\"id\":\"AAAAAAAAAAA\",\"title\":\" a\\u202e\\tb\\u0000 \","
      + "\"channel\":\"\\u200bc\\ud83d\",\"duration\":213,\"live\":false}]}"],
    expect: _ok({ recents: [_with(_A, { title: "a b", channel: "c" })] }) },
  { fn: "parse",
    args: [_file({ recents: [_with(_A, { title: _repeat("x", 1000), channel: _repeat("y", 500) })] })],
    expect: _ok({ recents: [_with(_A, { title: _repeat("x", 300), channel: _repeat("y", 120) })] }) },
  { fn: "parse", args: [_file({ recents: [_with(_A, { duration: -1 }), _with(_B, { duration: 172801 })] })],
    expect: _ok({ recents: [_with(_A, { duration: null, live: true }),
      _with(_B, { duration: null, live: true })] }) },
  // The first thirty that are valid.
  { fn: "parse", args: [_file({ recents: _tracks(30) })], expect: _ok({ recents: _tracks(30) }) },
  { fn: "parse", args: [_file({ recents: _tracks(45) })], expect: _ok({ recents: _tracks(30) }) },
  { fn: "parse", args: [_file({ recents: _junkThen(10000, _tracks(31)) })],
    expect: _ok({ recents: _tracks(30) }) },
  { fn: "parse", args: [_file({ recents: _A })], expect: _ok({}) },
  { fn: "parse", args: [_file({ recents: { 0: _A, length: 1 } })], expect: _ok({}) },
  { fn: "parse", args: [_file({ recents: "AAAAAAAAAAA" })], expect: _ok({}) },
  { fn: "parse", args: ["{\"version\":1,\"recents\":" + _nested(500) + "}"], expect: _ok({}) },

  // ---- parse: the queue ----
  { fn: "parse", args: [_file({ queue: { items: [_item(_A, false), _item(_B, true)], index: 1 } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_B, true)], index: 1 } }) },
  // The same video may be queued twice, and "auto" is true or it is false.
  { fn: "parse",
    args: [_file({ queue: { items: [_A, _item(_A, "yes"), _item(_A, 1), _item(_A, true)], index: 0 } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_A, false), _item(_A, false), _item(_A, true)],
      index: 0 } }) },
  { fn: "parse",
    args: [_file({ queue: { items: [null, 5, { id: "short" }, _item(_B, false), [_A]], index: 3 } })],
    expect: _ok({ queue: { items: [_item(_B, false)], index: 0 } }) },
  // The index names an item or is -1.
  { fn: "parse", args: [_file({ queue: { items: [_A, _B], index: 5 } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_B, false)], index: 1 } }) },
  { fn: "parse", args: [_file({ queue: { items: [_A, _B], index: -1 } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_B, false)], index: -1 } }) },
  { fn: "parse", args: [_file({ queue: { items: [_A, _B], index: -7 } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_B, false)], index: -1 } }) },
  { fn: "parse", args: [_file({ queue: { items: [_A, _B], index: 0.5 } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_B, false)], index: -1 } }) },
  { fn: "parse", args: [_file({ queue: { items: [_A, _B], index: "1" } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_B, false)], index: -1 } }) },
  { fn: "parse", args: [_file({ queue: { items: [_A, _B] } })],
    expect: _ok({ queue: { items: [_item(_A, false), _item(_B, false)], index: -1 } }) },
  { fn: "parse", args: ["{\"version\":1,\"queue\":{\"items\":[" + _A_TEXT + "],\"index\":-0}}"],
    expect: _ok({ queue: { items: [_item(_A, false)], index: 0 } }) },
  { fn: "parse", args: [_file({ queue: { items: [], index: 0 } })], expect: _ok({}) },
  { fn: "parse", args: [_file({ queue: { index: 3 } })], expect: _ok({}) },
  // The first two hundred that are valid.
  { fn: "parse", args: [_file({ queue: { items: _tracks(200), index: 199 } })],
    expect: _ok({ queue: { items: _items(200), index: 199 } }) },
  { fn: "parse", args: [_file({ queue: { items: _tracks(250), index: 249 } })],
    expect: _ok({ queue: { items: _items(200), index: 199 } }) },
  { fn: "parse", args: [_file({ queue: { items: _junkThen(10000, _tracks(3)), index: 10001 } })],
    expect: _ok({ queue: { items: _items(3), index: 2 } }) },
  { fn: "parse", args: [_file({ queue: [_A] })], expect: _ok({}) },
  { fn: "parse", args: [_file({ queue: null })], expect: _ok({}) },
  { fn: "parse", args: [_file({ queue: { items: _A, index: 0 } })], expect: _ok({}) },
  { fn: "parse",
    args: ["{\"version\":1,\"queue\":{\"__proto__\":{\"items\":[" + _A_TEXT + "],\"index\":0}}}"],
    expect: _ok({}) },

  // ---- parse: video, a table indexed by monitor names ----
  { fn: "parse", args: [_file({ video: { "DP-1": { corner: "bottom-right", widthPct: 25 } } })],
    expect: _ok({ video: { "DP-1": { corner: "bottom-right", widthPct: 25 } } }) },
  { fn: "parse",
    args: [_file({ video: { "eDP-1": { corner: "top-left", widthPct: 10, extra: 1 },
      HDMI_A_1: { corner: "bottom-left", widthPct: 90 } } })],
    expect: _ok({ video: { "eDP-1": { corner: "top-left", widthPct: 10 },
      HDMI_A_1: { corner: "bottom-left", widthPct: 90 } } }) },
  // A monitor may be called anything a monitor may be called.
  { fn: "parse",
    args: ["{\"version\":1,\"video\":{\"constructor\":{\"corner\":\"top-left\",\"widthPct\":20},"
      + "\"__proto__\":{\"corner\":\"top-right\",\"widthPct\":30},"
      + "\"toString\":{\"corner\":\"bottom-left\",\"widthPct\":40}}}"],
    expect: { ok: true, state: _state({ video: _parsed("{\"constructor\":{\"corner\":\"top-left\","
      + "\"widthPct\":20},\"__proto__\":{\"corner\":\"top-right\",\"widthPct\":30},"
      + "\"toString\":{\"corner\":\"bottom-left\",\"widthPct\":40}}") }) } },
  // Names that are no monitor names.
  { fn: "parse",
    args: ["{\"version\":1,\"video\":{\"\":" + _PLACE + ",\"DP 1\":" + _PLACE + ",\"DP/1\":" + _PLACE
      + ",\"DP.1\":" + _PLACE + ",\"DP:1\":" + _PLACE + ",\"" + _repeat("M", 33) + "\":" + _PLACE
      + ",\"" + _repeat("M", 32) + "\":" + _PLACE + "}}"],
    expect: _ok({ video: _parsed("{\"" + _repeat("M", 32) + "\":" + _PLACE + "}") }) },
  // An entry is kept only when every part of it is valid.
  { fn: "parse",
    args: [_file({ video: {
      a: { corner: "center", widthPct: 25 }, b: { corner: "top-left", widthPct: 9 },
      c: { corner: "top-left", widthPct: 91 }, d: { corner: "top-left", widthPct: 25.5 },
      e: { corner: "top-left", widthPct: "25" }, f: { corner: "top-left" }, g: { widthPct: 25 },
      h: { corner: ["top-left"], widthPct: 25 }, i: "top-left", j: null, k: ["top-left", 25],
      l: { corner: "constructor", widthPct: 25 }, ok: { corner: "top-right", widthPct: 50 }
    } })],
    expect: _ok({ video: { ok: { corner: "top-right", widthPct: 50 } } }) },
  // Eight monitors at most.
  { fn: "parse", args: [_file({ video: _monitors(8) })], expect: _ok({ video: _monitors(8) }) },
  { fn: "parse", args: [_file({ video: _monitors(20) })], expect: _ok({ video: _monitors(8) }) },
  { fn: "parse", args: [_file({ video: [{ corner: "top-left", widthPct: 25 }] })], expect: _ok({}) },
  { fn: "parse", args: [_file({ video: "DP-1" })], expect: _ok({}) },

  // ---- parse: shortcuts, kept as inert text ----
  { fn: "parse",
    args: [_file({ shortcuts: { panel: "", video: "SUPER + CTRL + ALT + V", output: "", dirty: false } })],
    expect: _ok({ shortcuts: _keys({ video: "SUPER + CTRL + ALT + V" }) }) },
  { fn: "parse", args: [_file({ shortcuts: { panel: "SUPER + Y", dirty: true, extra: "x" } })],
    expect: _ok({ shortcuts: _keys({ panel: "SUPER + Y", dirty: true }) }) },
  // Whatever the text says, it is only text here.
  { fn: "parse", args: [_file({ shortcuts: { panel: _LUA, video: "]] os.exit() --[[", output: "a\nb" } })],
    expect: _ok({ shortcuts: _keys({ panel: _LUA, video: "]] os.exit() --[[", output: "a\nb" }) }) },
  { fn: "parse", args: [_file({ shortcuts: { panel: "constructor", video: "__proto__", output: "all" } })],
    expect: _ok({ shortcuts: _keys({ panel: "constructor", video: "__proto__", output: "all" }) }) },
  { fn: "parse", args: [_file({ shortcuts: { panel: _repeat("K", 64), video: _repeat("K", 65) } })],
    expect: _ok({ shortcuts: _keys({ panel: _repeat("K", 64) }) }) },
  { fn: "parse",
    args: [_file({ shortcuts: { panel: 5, video: ["SUPER + V"], output: null, dirty: "true" } })],
    expect: _ok({}) },
  // Half of a surrogate pair is kept like any other unit.
  { fn: "parse", args: ["{\"version\":1,\"shortcuts\":{\"panel\":\"a\\ud83db\"}}"],
    expect: _ok({ shortcuts: _keys({ panel: "a\ud83db" }) }) },
  // The question was answered: kept, and only a real true counts.
  { fn: "parse", args: [_file({ shortcuts: { asked: true } })],
    expect: _ok({ shortcuts: _keys({ asked: true }) }) },
  { fn: "parse", args: [_file({ shortcuts: { asked: "true", panel: "SUPER + Y" } })],
    expect: _ok({ shortcuts: _keys({ panel: "SUPER + Y" }) }) },
  { fn: "parse", args: [_file({ shortcuts: ["SUPER + Y"] })], expect: _ok({}) },
  { fn: "parse", args: [_file({ shortcuts: "SUPER + Y" })], expect: _ok({}) },
  { fn: "parse",
    args: ["{\"version\":1,\"shortcuts\":{\"__proto__\":{\"panel\":\"SUPER + Y\",\"dirty\":true}}}"],
    expect: _ok({}) },

  // ---- parse: outputDevice ----
  { fn: "parse", args: [_file({ outputDevice: "pipewire/alsa_output.usb-Example_DAC-00.analog-stereo" })],
    expect: _ok({ outputDevice: "pipewire/alsa_output.usb-Example_DAC-00.analog-stereo" }) },
  { fn: "parse", args: [_file({ outputDevice: _repeat("d", 256) })],
    expect: _ok({ outputDevice: _repeat("d", 256) }) },
  { fn: "parse", args: [_file({ outputDevice: _repeat("d", 257) })], expect: _ok({}) },
  { fn: "parse", args: [_file({ outputDevice: "a\nb" })], expect: _ok({}) },
  { fn: "parse", args: [_file({ outputDevice: "a\u0000b" })], expect: _ok({}) },
  { fn: "parse", args: [_file({ outputDevice: "a\u001bb" })], expect: _ok({}) },
  { fn: "parse", args: ["{\"version\":1,\"outputDevice\":\"a\\u007fb\"}"], expect: _ok({}) },
  { fn: "parse", args: [_file({ outputDevice: 5 })], expect: _ok({}) },
  { fn: "parse", args: [_file({ outputDevice: ["auto"] })], expect: _ok({}) },
  { fn: "parse", args: [_file({ outputDevice: "constructor" })],
    expect: _ok({ outputDevice: "constructor" }) },

  // ---- parse: everything else is dropped ----
  { fn: "parse",
    args: [_file({ volume: 10, searchQuery: "private words", cookies: "x", feed: [_A], url: "file:///x",
      path: "/home/user/x", account: "someone", playedAt: 1700000000, counts: { AAAAAAAAAAA: 9 } })],
    expect: _ok({ volume: 10 }) },
  { fn: "parse",
    args: ["{\"version\":1,\"__proto__\":{\"volume\":5,\"muted\":true,\"recents\":[" + _A_TEXT + "]}}"],
    expect: _ok({}) },
  { fn: "parse", args: ["{\"version\":1,\"constructor\":{\"prototype\":{\"muted\":true}},\"toString\":5}"],
    expect: _ok({}) },
  // A key that is written twice: the later one counts, as in any JSON.
  { fn: "parse", args: ["{\"version\":2,\"version\":1,\"volume\":10,\"volume\":20}"],
    expect: _ok({ volume: 20 }) },
  { fn: "parse", args: ["{\"version\":1,\"version\":2}"], expect: _NO },

  // ---- parse: the whole of it ----
  { fn: "parse",
    args: [_file({ volume: 55, muted: true, proxyAck: true, prefs: { rememberHistory: false },
      recents: [_A], queue: { items: [_item(_B, true)], index: 0 },
      video: { "DP-1": { corner: "bottom-right", widthPct: 25 } },
      shortcuts: _keys({ video: "SUPER + CTRL + ALT + V" }),
      outputDevice: "alsa/default" })],
    expect: { ok: true, state: { volume: 55, muted: true, proxyAck: true, prefs: { rememberHistory: false },
      recents: [_A], queue: { items: [_item(_B, true)], index: 0 },
      video: { "DP-1": { corner: "bottom-right", widthPct: 25 } },
      shortcuts: _keys({ video: "SUPER + CTRL + ALT + V" }),
      outputDevice: "alsa/default" } } },

  // ---- serialize: with and without history ----
  { fn: "serialize", args: [_DEFAULTS, true], expect: _HEAD + _EMPTY_HISTORY + "}" },
  { fn: "serialize", args: [_DEFAULTS, false], expect: _HEAD + "}" },
  { fn: "serialize", args: [_state({ recents: [_A], queue: { items: [_item(_B, true)], index: 0 } }), true],
    expect: _HEAD + ",\"recents\":[" + _A_TEXT + "],\"queue\":{\"items\":[" + _B_ITEM_TEXT
      + "],\"index\":0}}" },
  // Without history there is no key for it and no trace of a title.
  { fn: "serialize", args: [_state({ recents: [_A], queue: { items: [_item(_B, true)], index: 0 } }), false],
    expect: _HEAD + "}" },
  // History is written for the answer true and for nothing else.
  { fn: "serialize", args: [_state({ recents: [_A] })], expect: _HEAD + "}" },
  { fn: "serialize", args: [_state({ recents: [_A] }), "true"], expect: _HEAD + "}" },
  { fn: "serialize", args: [_state({ recents: [_A] }), 1], expect: _HEAD + "}" },
  { fn: "serialize", args: [_state({ recents: [_A] }), null], expect: _HEAD + "}" },
  { fn: "serialize", args: [_state({ recents: [_A] }), {}], expect: _HEAD + "}" },

  // ---- serialize: the other keys ----
  { fn: "serialize",
    args: [_state({ volume: 5, muted: true, proxyAck: true,
      prefs: { autoplay: true, rememberHistory: false } }), false],
    expect: "{\"version\":1,\"volume\":5,\"muted\":true,\"proxyAck\":true,"
      + "\"prefs\":{\"rememberHistory\":false,\"autoplay\":true}}" },
  // What a feature never used is not written at all.
  { fn: "serialize", args: [_state({ video: { "DP-1": { corner: "top-left", widthPct: 33 } } }), false],
    expect: _HEAD + ",\"video\":{\"DP-1\":{\"corner\":\"top-left\",\"widthPct\":33}}}" },
  { fn: "serialize",
    args: [_state({ shortcuts: _keys({ panel: "SUPER + Y" }) }), false],
    expect: _HEAD
      + ",\"shortcuts\":{\"panel\":\"SUPER + Y\",\"video\":\"\",\"output\":\"\"," + _LATER
      + "\"dirty\":false,\"asked\":false}}" },
  { fn: "serialize", args: [_state({ shortcuts: _keys({ dirty: true }) }), false],
    expect: _HEAD + ",\"shortcuts\":{\"panel\":\"\",\"video\":\"\",\"output\":\"\"," + _LATER
      + "\"dirty\":true,\"asked\":false}}" },
  { fn: "serialize", args: [_state({ shortcuts: _keys({ asked: true }) }), false],
    expect: _HEAD + ",\"shortcuts\":{\"panel\":\"\",\"video\":\"\",\"output\":\"\"," + _LATER
      + "\"dirty\":false,\"asked\":true}}" },
  { fn: "serialize", args: [_state({ outputDevice: "alsa/default" }), false],
    expect: _HEAD + ",\"outputDevice\":\"alsa/default\"}" },
  { fn: "serialize",
    args: [_state({ video: _parsed("{\"__proto__\":{\"corner\":\"top-left\",\"widthPct\":33}}") }), false],
    expect: _HEAD + ",\"video\":{\"__proto__\":{\"corner\":\"top-left\",\"widthPct\":33}}}" },

  // ---- serialize: printable ASCII only ----
  { fn: "serialize",
    args: [_state({ recents: [_with(_A, {
      title: "\u043f\u0440\u0438\u0432\u0435\u0442 \u4e16\u754c \ud83d\ude00",
      channel: "caf\u00e9 \u00ff\u0100\uffff"
    })] }), true],
    expect: _HEAD + ",\"recents\":[{\"id\":\"AAAAAAAAAAA\","
      + "\"title\":\"\\u043f\\u0440\\u0438\\u0432\\u0435\\u0442 \\u4e16\\u754c \\ud83d\\ude00\","
      + "\"channel\":\"caf\\u00e9 \\u00ff\\u0100\\uffff\",\"duration\":213,\"live\":false}],"
      + "\"queue\":{\"items\":[],\"index\":-1}}" },
  // What JSON escapes by itself stays as JSON writes it.
  { fn: "serialize",
    args: [_state({ recents: [_with(_A, { title: "a \"q\" \\ / ~", channel: "<b>&amp;" })] }), true],
    expect: _HEAD + ",\"recents\":[{\"id\":\"AAAAAAAAAAA\",\"title\":\"a \\\"q\\\" \\\\ / ~\","
      + "\"channel\":\"<b>&amp;\",\"duration\":213,\"live\":false}],\"queue\":{\"items\":[],\"index\":-1}}" },
  // Shortcut texts are kept as they are, so they can hold anything.
  { fn: "serialize",
    args: [_state({ shortcuts: _keys({ panel: "a\u007fb\u0001c\u0080", video: _LUA, output: "a\nb\tc" }) }),
      false],
    expect: _HEAD + ",\"shortcuts\":{\"panel\":\"a\\u007fb\\u0001c\\u0080\","
      + "\"video\":\"F1\\\") os.execute(\\\"x\",\"output\":\"a\\nb\\tc\"," + _LATER
      + "\"dirty\":false,\"asked\":false}}" },
  { fn: "serialize", args: [_state({ outputDevice: "\u00e9\u4e16" }), false],
    expect: _HEAD + ",\"outputDevice\":\"\\u00e9\\u4e16\"}" },

  // ---- serialize: nothing unchecked is written ----
  { fn: "serialize", args: [null, true], expect: _HEAD + _EMPTY_HISTORY + "}" },
  { fn: "serialize", args: [undefined, false], expect: _HEAD + "}" },
  { fn: "serialize", args: ["state", true], expect: _HEAD + _EMPTY_HISTORY + "}" },
  { fn: "serialize", args: [[_DEFAULTS], true], expect: _HEAD + _EMPTY_HISTORY + "}" },
  { fn: "serialize", args: [{}, true], expect: _HEAD + _EMPTY_HISTORY + "}" },
  { fn: "serialize",
    args: [{ volume: "loud", muted: "yes", proxyAck: 1, prefs: "none", recents: "all", queue: 5, video: [],
      shortcuts: null, outputDevice: 7 }, true],
    expect: _HEAD + _EMPTY_HISTORY + "}" },
  { fn: "serialize", args: [_inheriting(_state({ volume: 5, recents: [_A] })), true],
    expect: _HEAD + _EMPTY_HISTORY + "}" },
  { fn: "serialize",
    args: [_state({ searchQuery: "private words", cookies: "x", version: 9, recents: [_with(_A, { key: 3,
      url: "file:///x", playedAt: 1700000000 })] }), true],
    expect: _HEAD + ",\"recents\":[" + _A_TEXT + "],\"queue\":{\"items\":[],\"index\":-1}}" },
  { fn: "serialize",
    args: [_state({ volume: 250, recents: [_with(_A, { title: _repeat("x", 1000) })] }), true],
    expect: "{\"version\":1,\"volume\":100,\"muted\":false,\"proxyAck\":false,\"prefs\":{},"
      + "\"recents\":[{\"id\":\"AAAAAAAAAAA\",\"title\":\"" + _repeat("x", 300) + "\","
      + "\"channel\":\"A channel\",\"duration\":213,\"live\":false}],"
      + "\"queue\":{\"items\":[],\"index\":-1}}" },
  { fn: "serialize", args: [_state({ recents: _tracks(45), queue: { items: [_A, _A], index: 9 } }), true],
    expect: _HEAD + ",\"recents\":" + JSON.stringify(_tracks(30)) + ",\"queue\":{\"items\":["
      + JSON.stringify(_item(_A, false)) + "," + JSON.stringify(_item(_A, false)) + "],\"index\":1}}" },

  // ---- the largest state there can be is written whole and read back ----
  { fn: "serialize", args: [_BIG, true], expect: _BIG_TEXT },
  { fn: "parse", args: [_BIG_TEXT], expect: { ok: true, state: _BIG } },
  { fn: "parse", args: [_BIG_TEXT + "\n"], expect: { ok: true, state: _BIG } },

  // ---- withChanges: only keys of the state ----
  { fn: "withChanges", args: [_DEFAULTS, {}], expect: null },
  { fn: "withChanges", args: [_DEFAULTS, null], expect: null },
  { fn: "withChanges", args: [_DEFAULTS], expect: null },
  { fn: "withChanges", args: [_DEFAULTS, "volume"], expect: null },
  { fn: "withChanges", args: [_DEFAULTS, ["volume", 5]], expect: null },
  { fn: "withChanges", args: [_DEFAULTS, { version: 2 }], expect: null },
  { fn: "withChanges", args: [_DEFAULTS, { searchQuery: "private words", Volume: 5, "volume ": 5 }],
    expect: null },
  { fn: "withChanges", args: [_DEFAULTS, _inheriting({ volume: 5 })], expect: null },
  { fn: "withChanges", args: [_DEFAULTS, _parsed("{\"__proto__\":{\"volume\":5}}")], expect: null },
  { fn: "withChanges", args: [_DEFAULTS, _parsed("{\"constructor\":5,\"toString\":5}")], expect: null },

  // ---- withChanges: each key is validated on its way in ----
  { fn: "withChanges", args: [_DEFAULTS, { volume: 33 }], expect: _state({ volume: 33 }) },
  { fn: "withChanges", args: [_DEFAULTS, { volume: 33.6, searchQuery: "private words" }],
    expect: _state({ volume: 34 }) },
  { fn: "withChanges", args: [_DEFAULTS, { volume: 250 }], expect: _state({ volume: 100 }) },
  { fn: "withChanges", args: [_state({ volume: 33 }), { volume: "loud" }], expect: _DEFAULTS },
  { fn: "withChanges", args: [_state({ volume: 33 }), { volume: undefined }], expect: _DEFAULTS },
  { fn: "withChanges", args: [_DEFAULTS, { muted: true, proxyAck: true }],
    expect: _state({ muted: true, proxyAck: true }) },
  { fn: "withChanges", args: [_state({ muted: true, proxyAck: true }), { muted: "no", proxyAck: 0 }],
    expect: _DEFAULTS },
  { fn: "withChanges",
    args: [_DEFAULTS, { prefs: { rememberHistory: false, sponsorSkip: true, preload: "false" } }],
    expect: _state({ prefs: { rememberHistory: false } }) },
  { fn: "withChanges", args: [_state({ prefs: { rememberHistory: false } }), { prefs: null }],
    expect: _DEFAULTS },
  { fn: "withChanges", args: [_DEFAULTS, { recents: [_A, _A, { id: "short" }, _with(_B, { key: 4 })] }],
    expect: _state({ recents: [_A, _B] }) },
  { fn: "withChanges", args: [_DEFAULTS, { recents: _tracks(45) }],
    expect: _state({ recents: _tracks(30) }) },
  // A queue item comes with a key of its own, which is not kept.
  { fn: "withChanges",
    args: [_DEFAULTS, { queue: {
      items: [_with(_A, { key: 1, auto: false }), _with(_B, { key: 2, auto: true })], index: 1
    } }],
    expect: _state({ queue: { items: [_item(_A, false), _item(_B, true)], index: 1 } }) },
  { fn: "withChanges", args: [_DEFAULTS, { queue: { items: _tracks(250), index: 220 } }],
    expect: _state({ queue: { items: _items(200), index: 199 } }) },
  { fn: "withChanges", args: [_state({ queue: { items: [_item(_A, false)], index: 0 } }), { queue: null }],
    expect: _DEFAULTS },
  { fn: "withChanges",
    args: [_DEFAULTS, { video: { constructor: { corner: "top-left", widthPct: 25 }, bad: { corner: "x" } } }],
    expect: _state({ video: { constructor: { corner: "top-left", widthPct: 25 } } }) },
  { fn: "withChanges", args: [_DEFAULTS, { shortcuts: { video: "SUPER + V", dirty: true } }],
    expect: _state({ shortcuts: _keys({ video: "SUPER + V", dirty: true }) }) },
  { fn: "withChanges", args: [_DEFAULTS, { outputDevice: "alsa/default" }],
    expect: _state({ outputDevice: "alsa/default" }) },
  { fn: "withChanges", args: [_state({ outputDevice: "alsa/default" }), { outputDevice: "a\nb" }],
    expect: _DEFAULTS },

  // Numbers that are no numbers. (A file cannot hold these; a caller can.)
  { fn: "withChanges", args: [_state({ volume: 33 }), { volume: NaN }], expect: _DEFAULTS },
  { fn: "withChanges", args: [_state({ volume: 33 }), { volume: Infinity }], expect: _DEFAULTS },
  { fn: "withChanges", args: [_state({ volume: 33 }), { volume: -Infinity }], expect: _DEFAULTS },
  { fn: "withChanges", args: [_DEFAULTS, { queue: { items: [_A, _B], index: NaN } }],
    expect: _state({ queue: { items: [_item(_A, false), _item(_B, false)], index: -1 } }) },
  { fn: "withChanges", args: [_DEFAULTS, { queue: { items: [_A, _B], index: Infinity } }],
    expect: _state({ queue: { items: [_item(_A, false), _item(_B, false)], index: -1 } }) },
  { fn: "withChanges",
    args: [_DEFAULTS, { video: { a: { corner: "top-left", widthPct: NaN },
      b: { corner: "top-left", widthPct: Infinity }, c: { corner: "top-left", widthPct: 50 } } }],
    expect: _state({ video: { c: { corner: "top-left", widthPct: 50 } } }) },
  { fn: "withChanges",
    args: [_DEFAULTS, { recents: [_with(_A, { duration: NaN }), _with(_B, { duration: Infinity })] }],
    expect: _state({ recents: [_with(_A, { duration: null, live: true }),
      _with(_B, { duration: null, live: true })] }) },
  { fn: "serialize", args: [_state({ volume: NaN, queue: { items: [_A], index: Infinity } }), true],
    expect: _HEAD + ",\"recents\":[],\"queue\":{\"items\":[" + JSON.stringify(_item(_A, false))
      + "],\"index\":-1}}" },

  // ---- withChanges: the rest is carried over ----
  { fn: "withChanges",
    args: [_state({ volume: 5, recents: [_A], prefs: { rememberHistory: false },
      outputDevice: "alsa/default" }), { muted: true }],
    expect: _state({ volume: 5, muted: true, recents: [_A], prefs: { rememberHistory: false },
      outputDevice: "alsa/default" }) },
  { fn: "withChanges",
    args: [_state({ volume: 5 }), _parsed("{\"__proto__\":{\"volume\":9},\"muted\":true}")],
    expect: _state({ volume: 5, muted: true }) },
  // Without a state to start from, the defaults are.
  { fn: "withChanges", args: [null, { volume: 5 }], expect: _state({ volume: 5 }) },
  { fn: "withChanges", args: ["state", { volume: 5 }], expect: _state({ volume: 5 }) },
  { fn: "withChanges", args: [{}, { volume: 5 }], expect: _state({ volume: 5 }) },
  { fn: "withChanges", args: [_inheriting(_state({ muted: true })), { volume: 5 }],
    expect: _state({ volume: 5 }) }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
