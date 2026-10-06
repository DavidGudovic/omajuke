.pragma library

// Input and expectation table for lib/Track.js: what becomes a track and
// what is refused, from each of the three sources (yt-dlp's JSON, the saved
// state, a row handed back by the panel). Most rows are hostile on purpose:
// wrong types, numbers no clock can show, huge and deeply nested documents,
// keys that name members of Object.prototype. The same table runs under
// node and inside Qt's JavaScript engine, so both must agree on every row.
// All ids, names and addresses are synthetic.

var _ID = "AAAAAAAAAAA"
var _OTHER = "BBBBBBBBBBB"
var _MEDIA = "https://rr1---sn-test.googlevideo.com/videoplayback?id=synthetic"
var _HOST = "https://rr1---sn-test.googlevideo.com"

// The track the readers make of each base document below, and what they
// answer for a document they refuse.
var _TRACK = { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false }
var _NO = { ok: false }

// A copy of base with the members of changes laid over it. Only ever used on
// the literals of this file.
function _with(base, changes) {
  var copy = {}
  var key
  for (key in base) copy[key] = base[key]
  for (key in changes) copy[key] = changes[key]
  return copy
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

// One entry of a flat search answer, in yt-dlp's shape.
function _flat(changes) {
  return _with({
    _type: "url", ie_key: "Youtube", id: _ID, url: "https://www.youtube.com/watch?v=" + _ID,
    title: "A title", description: "Never read.", duration: 213, channel: "A channel",
    uploader: "An uploader",
    thumbnails: [{ url: "https://i.ytimg.com/vi/" + _ID + "/hq720.jpg", height: 404, width: 720 }],
    live_status: null, view_count: 1000
  }, changes)
}

// The answer of a resolve for one video, cut down to what matters here.
function _info(changes) {
  return _with({
    id: _ID, title: "A title", channel: "A channel", uploader: "An uploader", duration: 213,
    live_status: "not_live", is_live: false,
    formats: [{ format_id: "251", vcodec: "none", url: _MEDIA + "&itag=251" }],
    requested_formats: [
      { format_id: "247", vcodec: "vp9", url: _MEDIA + "&itag=247" },
      { format_id: "251", vcodec: "none", url: _MEDIA + "&itag=251" }
    ],
    _type: "video"
  }, changes)
}

function _text(value) {
  return JSON.stringify(value)
}

function _list(entries) {
  return _text({ _type: "playlist", entries: entries })
}

// The same, for entries that are spelled out as JSON text.
function _listOf(entriesText) {
  return "{\"_type\":\"playlist\",\"entries\":[" + entriesText + "]}"
}

// The resolve answer whose chosen formats are the given list.
function _requested(formats) {
  return _text(_info({ requested_formats: formats }))
}

// The resolve answer whose only chosen video format has this address.
function _videoAt(url) {
  return _requested([{ vcodec: "vp9", url: url }])
}

function _many(value, count) {
  var list = []
  for (var i = 0; i < count; i++) list.push(value)
  return list
}

// count entries with ids AAAAAAA0000, AAAAAAA0001 and so on.
function _entries(count) {
  var list = []
  for (var i = 0; i < count; i++) {
    var digits = String(10000 + i).slice(1)
    list.push(_flat({ id: "AAAAAAA" + digits, title: "Track " + i }))
  }
  return list
}

// The tracks the reader makes of the first count of those entries.
function _tracks(count) {
  var list = []
  for (var i = 0; i < count; i++) {
    var digits = String(10000 + i).slice(1)
    list.push(_with(_TRACK, { id: "AAAAAAA" + digits, title: "Track " + i }))
  }
  return list
}

// JSON text of arrays nested depth levels deep.
function _nested(depth) {
  return _repeat("[", depth) + _repeat("]", depth)
}

// A valid, empty playlist answer of exactly length characters.
function _paddedList(length) {
  var head = "{\"_type\":\"playlist\",\"entries\":[],\"pad\":\""
  var tail = "\"}"
  return head + _repeat("x", length - head.length - tail.length) + tail
}

// A valid resolve answer of exactly length characters.
function _paddedInfo(length) {
  var body = _text(_info({ pad: "" }))
  var cut = body.indexOf("\"pad\":\"\"") + 7
  return body.slice(0, cut) + _repeat("x", length - body.length) + body.slice(cut)
}

// What JSON.parse makes of a text: used for objects that carry a key such
// as "__proto__" as plain data, which an object literal cannot spell.
function _parsed(text) {
  return JSON.parse(text)
}

// An object that only inherits its fields.
function _inheriting(base) {
  return Object.create(base)
}

// A list that carries the fields as named members of its own.
function _listWith(fields) {
  var list = []
  for (var key in fields) list[key] = fields[key]
  return list
}

// A stored track and a panel row look alike.
var _STORED = { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false }

// The answers for the base resolve document, with and without a video
// stream, and the track of unknown length that counts as live.
var _RESOLVED = { ok: true, track: _TRACK, videoUrl: _MEDIA + "&itag=247" }
var _NO_VIDEO = { ok: true, track: _TRACK, videoUrl: "" }
var _UNKNOWN_LENGTH = _with(_TRACK, { duration: null, live: true })

var MODULE = "Track"
var CASES = [
  // ---- fromFlatEntry: what a search entry becomes ----
  { fn: "fromFlatEntry", args: [_flat({})], expect: _TRACK },
  { fn: "fromFlatEntry", args: [{ id: _ID, title: "A title" }],
    expect: { id: _ID, title: "A title", channel: "", duration: null, live: true } },
  { fn: "fromFlatEntry", args: [_flat({ duration: null, live_status: "is_live" })],
    expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: 100, live_status: "is_live" })],
    expect: { id: _ID, title: "A title", channel: "A channel", duration: 100, live: true } },
  // A stream that runs around the clock has no length and no live mark.
  { fn: "fromFlatEntry", args: [_flat({ duration: null })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ live_status: "was_live" })], expect: _TRACK },
  { fn: "fromFlatEntry", args: [_flat({ live_status: "post_live" })], expect: _TRACK },
  { fn: "fromFlatEntry", args: [_flat({ live_status: "not_live" })], expect: _TRACK },
  { fn: "fromFlatEntry", args: [_flat({ live_status: "IS_LIVE" })], expect: _TRACK },
  { fn: "fromFlatEntry", args: [_flat({ live_status: 1 })], expect: _TRACK },
  { fn: "fromFlatEntry", args: [_flat({ live_status: ["is_live"] })], expect: _TRACK },
  // Not started yet: nothing to play.
  { fn: "fromFlatEntry", args: [_flat({ live_status: "is_upcoming" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ live_status: "is_upcoming", duration: null })], expect: null },

  // ---- fromFlatEntry: the duration ----
  { fn: "fromFlatEntry", args: [_flat({ duration: 0 })], expect: _with(_TRACK, { duration: 0 }) },
  { fn: "fromFlatEntry", args: [_flat({ duration: 0.4 })], expect: _with(_TRACK, { duration: 0 }) },
  { fn: "fromFlatEntry", args: [_flat({ duration: 0.5 })], expect: _with(_TRACK, { duration: 1 }) },
  { fn: "fromFlatEntry", args: [_flat({ duration: 187.6 })], expect: _with(_TRACK, { duration: 188 }) },
  { fn: "fromFlatEntry", args: [_flat({ duration: 172800 })], expect: _with(_TRACK, { duration: 172800 }) },
  { fn: "fromFlatEntry", args: [_flat({ duration: 172799.6 })], expect: _with(_TRACK, { duration: 172800 }) },
  { fn: "fromFlatEntry", args: [_flat({ duration: 172800.4 })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: 172801 })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: -1 })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: -0.1 })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: NaN })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: Infinity })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: -Infinity })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: 1e308 })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: "213" })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: true })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: [213] })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: { valueOf: 213 } })], expect: _UNKNOWN_LENGTH },
  { fn: "fromFlatEntry", args: [_flat({ duration: undefined })], expect: _UNKNOWN_LENGTH },

  // ---- fromFlatEntry: the title must be text, and something must be left of it ----
  { fn: "fromFlatEntry", args: [_flat({ title: undefined })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: null })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: "" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: " \u200b\u200e\n " })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: 12345 })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: true })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: ["A title"] })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: { toString: "A title" } })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ title: "  a\u202eb\n c\u0007  " })],
    expect: _with(_TRACK, { title: "ab c" }) },
  { fn: "fromFlatEntry", args: [_flat({ title: "a\ud83db \ud83c\udfb5" })],
    expect: _with(_TRACK, { title: "ab \ud83c\udfb5" }) },
  { fn: "fromFlatEntry", args: [_flat({ title: "<img src=\"http://127.0.0.1:9/x\"> & <b>x</b>" })],
    expect: _with(_TRACK, { title: "<img src=\"http://127.0.0.1:9/x\"> & <b>x</b>" }) },
  { fn: "fromFlatEntry", args: [_flat({ title: _repeat("x", 400) })],
    expect: _with(_TRACK, { title: _repeat("x", 300) }) },
  { fn: "fromFlatEntry", args: [_flat({ title: _repeat("x", 299) + "\ud83c\udfb5" })],
    expect: _with(_TRACK, { title: _repeat("x", 299) }) },

  // ---- fromFlatEntry: the channel, with the uploader as second choice ----
  { fn: "fromFlatEntry", args: [_flat({ channel: null })],
    expect: _with(_TRACK, { channel: "An uploader" }) },
  { fn: "fromFlatEntry", args: [_flat({ channel: undefined })],
    expect: _with(_TRACK, { channel: "An uploader" }) },
  { fn: "fromFlatEntry", args: [_flat({ channel: 7 })], expect: _with(_TRACK, { channel: "An uploader" }) },
  { fn: "fromFlatEntry", args: [_flat({ channel: 7, uploader: 8 })], expect: _with(_TRACK, { channel: "" }) },
  { fn: "fromFlatEntry", args: [_flat({ channel: null, uploader: null })],
    expect: _with(_TRACK, { channel: "" }) },
  // An empty channel is still the channel.
  { fn: "fromFlatEntry", args: [_flat({ channel: "" })], expect: _with(_TRACK, { channel: "" }) },
  { fn: "fromFlatEntry", args: [_flat({ channel: " \u202ec\u0000h " })],
    expect: _with(_TRACK, { channel: "ch" }) },
  { fn: "fromFlatEntry", args: [_flat({ channel: _repeat("y", 200) })],
    expect: _with(_TRACK, { channel: _repeat("y", 120) }) },

  // ---- fromFlatEntry: the id ----
  { fn: "fromFlatEntry", args: [_flat({ id: "constructor" })], expect: _with(_TRACK, { id: "constructor" }) },
  { fn: "fromFlatEntry", args: [_flat({ id: "--no-config" })], expect: _with(_TRACK, { id: "--no-config" }) },
  { fn: "fromFlatEntry", args: [_flat({ id: "___________" })], expect: _with(_TRACK, { id: "___________" }) },
  { fn: "fromFlatEntry", args: [_flat({ id: "" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: "AAAAAAAAAA" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: "AAAAAAAAAAAA" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: "AAAAAAAAAA\n" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: "AAAAAAAAAA/" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: "../../../etc" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: "__proto__" })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: 12345678901 })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: null })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: undefined })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: ["AAAAAAAAAAA"] })], expect: null },
  { fn: "fromFlatEntry", args: [_flat({ id: { length: 11 } })], expect: null },

  // ---- fromFlatEntry: anything that is not an entry ----
  { fn: "fromFlatEntry", args: [null], expect: null },
  { fn: "fromFlatEntry", args: [undefined], expect: null },
  { fn: "fromFlatEntry", args: [], expect: null },
  { fn: "fromFlatEntry", args: ["AAAAAAAAAAA"], expect: null },
  { fn: "fromFlatEntry", args: [5], expect: null },
  { fn: "fromFlatEntry", args: [true], expect: null },
  { fn: "fromFlatEntry", args: [[]], expect: null },
  { fn: "fromFlatEntry", args: [[_flat({})]], expect: null },
  { fn: "fromFlatEntry", args: [_listWith(_flat({}))], expect: null },
  { fn: "fromFlatEntry", args: [{}], expect: null },

  // ---- fromFlatEntry: only what the entry itself carries is data ----
  { fn: "fromFlatEntry", args: [_inheriting(_flat({}))], expect: null },
  { fn: "fromFlatEntry", args: [_parsed("{\"__proto__\":{\"id\":\"AAAAAAAAAAA\",\"title\":\"A title\"}}")],
    expect: null },
  { fn: "fromFlatEntry",
    args: [_parsed("{\"id\":\"AAAAAAAAAAA\",\"title\":\"A title\",\"hasOwnProperty\":1,\"constructor\":2,"
      + "\"toString\":3,\"__proto__\":{\"channel\":\"inherited\",\"duration\":5}}")],
    expect: { id: _ID, title: "A title", channel: "", duration: null, live: true } },

  // ---- listFromPlaylistJson: not an answer at all ----
  { fn: "listFromPlaylistJson", args: [null, 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [undefined, 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [5, 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [{ _type: "playlist", entries: [] }, 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [[], 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["", 20], expect: _NO },
  // What yt-dlp prints for a failed lookup.
  { fn: "listFromPlaylistJson", args: ["null", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [" null\n", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["{", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["[]", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["5", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["true", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["\"playlist\"", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["{}", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["{\"_type\":\"playlist\",\"entries\":[]} trailing", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["{'_type':'playlist','entries':[]}", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["{\"_type\":\"playlist\",\"entries\":[NaN]}", 20], expect: _NO },
  // One video instead of a list.
  { fn: "listFromPlaylistJson", args: [_text(_info({})), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ entries: [_flat({})] }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ _type: "Playlist", entries: [] }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ _type: ["playlist"], entries: [] }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ _type: "playlist" }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ _type: "playlist", entries: null }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ _type: "playlist", entries: {} }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ _type: "playlist", entries: "x" }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text({ _type: "playlist", entries: 5 }), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_text([{ _type: "playlist", entries: [] }]), 20], expect: _NO },

  // ---- listFromPlaylistJson: the text must be the ASCII yt-dlp writes ----
  { fn: "listFromPlaylistJson", args: [_list([_flat({ title: "caf\u00e9" })]), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_list([]) + "\ufffd", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["\ufeff" + _list([]), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_list([]) + "\u0000", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_list([]) + "\r\n", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: ["\t" + _list([]), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_list([]) + "\u007f", 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [" \n" + _list([]) + "\n", 20], expect: { ok: true, tracks: [] } },
  // Escaped, the same characters are fine, and the cleaner sees them.
  { fn: "listFromPlaylistJson",
    args: [_listOf("{\"id\":\"AAAAAAAAAAA\",\"title\":\"caf\\u00e9 \\ud83c\\udfb5\"}"), 20],
    expect: { ok: true,
      tracks: [{ id: _ID, title: "caf\u00e9 \ud83c\udfb5", channel: "", duration: null, live: true }] } },
  { fn: "listFromPlaylistJson",
    args: [_listOf("{\"id\":\"AAAAAAAAAAA\",\"title\":\"a\\ud83db\\u202e\\u0000c\"}"), 20],
    expect: { ok: true, tracks: [{ id: _ID, title: "abc", channel: "", duration: null, live: true }] } },

  // ---- listFromPlaylistJson: lists ----
  { fn: "listFromPlaylistJson", args: [_list([]), 20], expect: { ok: true, tracks: [] } },
  // What a search without network leaves on stdout.
  { fn: "listFromPlaylistJson", args: [_list([null]), 20], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list([_flat({})]), 20], expect: { ok: true, tracks: [_TRACK] } },
  { fn: "listFromPlaylistJson",
    args: [_list([null, 5, "AAAAAAAAAAA", [], [_flat({})], _flat({ id: "short" }), _flat({ title: 5 }),
      _flat({ id: _OTHER, live_status: "is_upcoming" }), _flat({})]), 20],
    expect: { ok: true, tracks: [_TRACK] } },
  // The first of two entries with one id wins.
  { fn: "listFromPlaylistJson",
    args: [_list([_flat({}), _flat({ title: "Again" }), _flat({ id: _OTHER }), _flat({})]), 20],
    expect: { ok: true, tracks: [_TRACK, _with(_TRACK, { id: _OTHER })] } },
  // An entry that was refused does not block its id for a later one.
  { fn: "listFromPlaylistJson", args: [_list([_flat({ title: "" }), _flat({})]), 20],
    expect: { ok: true, tracks: [_TRACK] } },
  { fn: "listFromPlaylistJson",
    args: [_list([_flat({ id: "constructor" }), _flat({ id: "constructor" }), _flat({ id: "__proto__" }),
      _flat({ id: "__proto__AA" }), _flat({ id: "toString___" }), _flat({ id: "__proto__AA" })]), 20],
    expect: { ok: true, tracks: [_with(_TRACK, { id: "constructor" }), _with(_TRACK, { id: "__proto__AA" }),
      _with(_TRACK, { id: "toString___" })] } },

  // ---- listFromPlaylistJson: the cap ----
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), 20], expect: { ok: true, tracks: _tracks(20) } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), 5], expect: { ok: true, tracks: _tracks(5) } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), 1], expect: { ok: true, tracks: _tracks(1) } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), 100], expect: { ok: true, tracks: _tracks(25) } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), 2.9], expect: { ok: true, tracks: _tracks(2) } },
  // Refused entries and repeats do not use up the cap.
  { fn: "listFromPlaylistJson", args: [_list(_many(null, 30).concat(_entries(3), _entries(25))), 20],
    expect: { ok: true, tracks: _tracks(20) } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), 0], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), -1], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), 0.5], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), NaN], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), "20"], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25)), null], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(25))], expect: { ok: true, tracks: [] } },

  // ---- listFromPlaylistJson: size and depth ----
  { fn: "listFromPlaylistJson", args: [_list(_many(null, 10000)), 20], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_list(_many(_flat({}), 2000)), 20],
    expect: { ok: true, tracks: [_TRACK] } },
  { fn: "listFromPlaylistJson", args: [_list(_entries(3000)), 20],
    expect: { ok: true, tracks: _tracks(20) } },
  { fn: "listFromPlaylistJson", args: [_paddedList(1048576), 20], expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson", args: [_paddedList(1048577), 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [{ gen: "repeat", unit: "[", count: 300000 }, 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [{ gen: "repeat", unit: "{\"a\":", count: 100000 }, 20], expect: _NO },
  { fn: "listFromPlaylistJson", args: [_nested(5000), 20], expect: _NO },
  // Nesting both engines still parse: the nested entry is simply not a track.
  { fn: "listFromPlaylistJson", args: [_listOf(_nested(500)), 20],
    expect: { ok: true, tracks: [] } },

  // ---- listFromPlaylistJson: keys that name members of Object.prototype ----
  { fn: "listFromPlaylistJson", args: ["{\"__proto__\":" + _list([_flat({})]) + "}", 20], expect: _NO },
  { fn: "listFromPlaylistJson",
    args: [_listOf("{\"__proto__\":{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\"}}"), 20],
    expect: { ok: true, tracks: [] } },
  { fn: "listFromPlaylistJson",
    args: ["{\"_type\":\"playlist\",\"constructor\":1,\"hasOwnProperty\":2,"
      + "\"__proto__\":{\"title\":\"polluted\",\"entries\":5},"
      + "\"entries\":[{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\","
      + "\"__proto__\":{\"title\":\"polluted\",\"channel\":\"polluted\"}}]}", 20],
    expect: { ok: true, tracks: [{ id: _ID, title: "t", channel: "", duration: null, live: true }] } },
  // Had any of the texts above reached Object.prototype, this row without a
  // title would find one there.
  { fn: "fromUi", args: [{ id: _ID }], expect: null },

  // ---- fromInfoJson: the answer for one video ----
  { fn: "fromInfoJson", args: [_text(_info({})), _ID], expect: _RESOLVED },
  { fn: "fromInfoJson", args: [_text(_info({})) + "\n", _ID], expect: _RESOLVED },
  { fn: "fromInfoJson", args: [_text(_info({ _type: undefined })), _ID], expect: _RESOLVED },
  { fn: "fromInfoJson", args: [_text(_info({ _type: "playlist" })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ _type: "url" })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ _type: null })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ _type: 5 })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text([_info({})]), _ID], expect: _NO },
  { fn: "fromInfoJson", args: ["null", _ID], expect: _NO },
  { fn: "fromInfoJson", args: ["", _ID], expect: _NO },
  { fn: "fromInfoJson", args: ["{", _ID], expect: _NO },
  { fn: "fromInfoJson", args: ["{}", _ID], expect: _NO },
  { fn: "fromInfoJson", args: [null, _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_info({}), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [5, _ID], expect: _NO },

  // ---- fromInfoJson: it must be about the video that was asked for ----
  { fn: "fromInfoJson", args: [_text(_info({ id: _OTHER })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({})), _OTHER], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ id: undefined })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ id: null })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ id: [_ID] })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ id: "constructor" })), "constructor"],
    expect: { ok: true, track: _with(_TRACK, { id: "constructor" }), videoUrl: _MEDIA + "&itag=247" } },
  { fn: "fromInfoJson", args: [_text(_info({})), ""], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({})), "AAAAAAAAAA"], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({})), null], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({})), [_ID]], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({}))], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ id: "short" })), "short"], expect: _NO },
  { fn: "fromInfoJson", args: ["{\"__proto__\":" + _text(_info({})) + "}", _ID], expect: _NO },
  // Of two "id" keys the last one counts, as it does for the program that
  // reads the same text from the info file.
  { fn: "fromInfoJson", args: ["{\"id\":\"AAAAAAAAAAA\"," + _text(_info({ id: _OTHER })).slice(1), _ID],
    expect: _NO },
  { fn: "fromInfoJson", args: ["{\"id\":\"AAAAAAAAAAA\"," + _text(_info({ id: _OTHER })).slice(1), _OTHER],
    expect: { ok: true, track: _with(_TRACK, { id: _OTHER }), videoUrl: _MEDIA + "&itag=247" } },

  // ---- fromInfoJson: there must be formats ----
  { fn: "fromInfoJson", args: [_text(_info({ formats: undefined })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ formats: [] })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ formats: null })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ formats: {} })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ formats: { length: 1 } })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ formats: "x" })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ formats: 5 })), _ID], expect: _NO },

  // ---- fromInfoJson: title, channel, length and live as for a search entry ----
  { fn: "fromInfoJson", args: [_text(_info({ title: "" })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ title: 5 })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ title: undefined })), _ID], expect: _NO },
  { fn: "fromInfoJson",
    args: ["{\"id\":\"AAAAAAAAAAA\",\"title\":\"A,vid=1 \\u202e\\\"q\\\"\\u200b \",\"formats\":[{}]}", _ID],
    expect: { ok: true, track: { id: _ID, title: "A,vid=1 \"q\"", channel: "", duration: null, live: true },
      videoUrl: "" } },
  { fn: "fromInfoJson", args: [_text(_info({ channel: null })), _ID],
    expect: { ok: true, track: _with(_TRACK, { channel: "An uploader" }), videoUrl: _MEDIA + "&itag=247" } },
  { fn: "fromInfoJson", args: [_text(_info({ duration: 212.5 })), _ID],
    expect: { ok: true, track: _with(_TRACK, { duration: 213 }), videoUrl: _MEDIA + "&itag=247" } },
  { fn: "fromInfoJson", args: [_text(_info({ duration: null })), _ID],
    expect: { ok: true, track: _UNKNOWN_LENGTH, videoUrl: _MEDIA + "&itag=247" } },
  { fn: "fromInfoJson", args: [_text(_info({ is_live: true })), _ID],
    expect: { ok: true, track: _with(_TRACK, { live: true }), videoUrl: _MEDIA + "&itag=247" } },
  { fn: "fromInfoJson", args: [_text(_info({ live_status: "is_live" })), _ID],
    expect: { ok: true, track: _with(_TRACK, { live: true }), videoUrl: _MEDIA + "&itag=247" } },
  { fn: "fromInfoJson", args: [_text(_info({ is_live: "true" })), _ID], expect: _RESOLVED },
  { fn: "fromInfoJson", args: [_text(_info({ is_live: 1 })), _ID], expect: _RESOLVED },
  // A resolve that came back for a video that has not started is yt-dlp's
  // business to refuse; what it did return is read like any other.
  { fn: "fromInfoJson", args: [_text(_info({ live_status: "is_upcoming" })), _ID], expect: _RESOLVED },

  // ---- fromInfoJson: the text must be the ASCII yt-dlp writes, and bounded ----
  { fn: "fromInfoJson", args: [_text(_info({ title: "caf\u00e9" })), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({})) + "\u0000", _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({})) + "\r\n", _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({})) + "\ufffd", _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_paddedInfo(2000000), _ID], expect: _RESOLVED },
  { fn: "fromInfoJson", args: [_paddedInfo(4194304), _ID], expect: _RESOLVED },
  { fn: "fromInfoJson", args: [_paddedInfo(4194305), _ID], expect: _NO },
  { fn: "fromInfoJson", args: [{ gen: "repeat", unit: "[", count: 300000 }, _ID], expect: _NO },
  { fn: "fromInfoJson", args: [_text(_info({ formats: _many({ url: _MEDIA }, 10000) })), _ID],
    expect: _RESOLVED },

  // ---- fromInfoJson: the video address ----
  { fn: "fromInfoJson", args: [_requested(undefined), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested(null), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested("x"), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested({}), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([]), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([null, 5, "x", [], [{ vcodec: "vp9", url: _MEDIA }]]), _ID],
    expect: _NO_VIDEO },
  // Audio only: nothing to show.
  { fn: "fromInfoJson", args: [_requested([{ vcodec: "none", url: _MEDIA }]), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([{ url: _MEDIA }]), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([{ vcodec: 5, url: _MEDIA }]), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([{ vcodec: null, url: _MEDIA }]), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([{ vcodec: "vp9" }]), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([{ vcodec: "vp9", url: 5 }]), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_requested([{ vcodec: "vp9", url: [_MEDIA] }]), _ID],
    expect: _NO_VIDEO },
  // The first format that has video and an address we accept.
  { fn: "fromInfoJson",
    args: [_requested([{ vcodec: "none", url: _MEDIA + "&a" }, { vcodec: "avc1", url: _MEDIA + "&b" },
      { vcodec: "vp9", url: _MEDIA + "&c" }]), _ID],
    expect: _with(_RESOLVED, { videoUrl: _MEDIA + "&b" }) },
  { fn: "fromInfoJson",
    args: [_requested([{ vcodec: "vp9", url: "https://media.example/x" },
      { vcodec: "avc1", url: _MEDIA + "&b" }]), _ID],
    expect: _with(_RESOLVED, { videoUrl: _MEDIA + "&b" }) },
  // A format in "formats" is never chosen: only what yt-dlp selected counts.
  { fn: "fromInfoJson",
    args: [_text(_info({ formats: [{ vcodec: "vp9", url: _MEDIA + "&f" }], requested_formats: undefined })),
      _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt(_HOST + "/" + _repeat("a", 4000)), _ID],
    expect: _with(_RESOLVED, { videoUrl: _HOST + "/" + _repeat("a", 4000) }) },
  { fn: "fromInfoJson", args: [_videoAt("https://manifest.googlevideo.com/api/manifest/hls_playlist/x"), _ID],
    expect: _with(_RESOLVED, { videoUrl: "https://manifest.googlevideo.com/api/manifest/hls_playlist/x" }) },

  // ---- fromInfoJson: addresses that are not YouTube's media hosts over https ----
  { fn: "fromInfoJson", args: [_videoAt(_HOST + "/" + _repeat("a", 4001)), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("http://rr1---sn-test.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("HTTPS://rr1---sn-test.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com.media.example/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.notgooglevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com@media.example/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://user:secret@rr1.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com\\@media.example/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://media.example/?u=https://rr1.googlevideo.com/x"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com/"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com:443/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://RR1.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1_x.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com/video playback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com/videoplayback\n"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("https://rr1.googlevideo.com/video\nplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt(" https://rr1.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("file:///etc/hostname"), _ID], expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt("//rr1.googlevideo.com/videoplayback"), _ID],
    expect: _NO_VIDEO },
  { fn: "fromInfoJson", args: [_videoAt(""), _ID], expect: _NO_VIDEO },

  // ---- fromStored: a track read back from the state file ----
  { fn: "fromStored", args: [_STORED], expect: _TRACK },
  // A queue item's own members stay behind.
  { fn: "fromStored", args: [_with(_STORED, { key: 7, auto: true, extra: { a: 1 } })], expect: _TRACK },
  // A track started over IPC has no title until it was resolved.
  { fn: "fromStored", args: [{ id: _ID, title: "", channel: "", duration: null, live: false }],
    expect: { id: _ID, title: "", channel: "", duration: null, live: true } },
  { fn: "fromStored", args: [{ id: _ID, title: "A title" }],
    expect: { id: _ID, title: "A title", channel: "", duration: null, live: true } },
  { fn: "fromStored", args: [_with(_STORED, { live: true })], expect: _with(_TRACK, { live: true }) },
  { fn: "fromStored", args: [_with(_STORED, { live: "yes" })], expect: _TRACK },
  { fn: "fromStored", args: [_with(_STORED, { live: 1 })], expect: _TRACK },
  { fn: "fromStored", args: [_with(_STORED, { duration: 172801 })], expect: _UNKNOWN_LENGTH },
  { fn: "fromStored", args: [_with(_STORED, { duration: NaN })], expect: _UNKNOWN_LENGTH },
  { fn: "fromStored", args: [_with(_STORED, { duration: Infinity })], expect: _UNKNOWN_LENGTH },
  { fn: "fromStored", args: [_with(_STORED, { duration: "213" })], expect: _UNKNOWN_LENGTH },
  { fn: "fromStored", args: [_with(_STORED, { duration: 212.5 })], expect: _TRACK },
  { fn: "fromStored", args: [_with(_STORED, { title: " a\u202e\tb\u0000 ", channel: "\u200bc\ud83d" })],
    expect: _with(_TRACK, { title: "a b", channel: "c" }) },
  { fn: "fromStored", args: [_with(_STORED, { title: _repeat("x", 1000), channel: _repeat("y", 1000) })],
    expect: _with(_TRACK, { title: _repeat("x", 300), channel: _repeat("y", 120) }) },
  { fn: "fromStored", args: [_with(_STORED, { channel: 5 })], expect: _with(_TRACK, { channel: "" }) },
  { fn: "fromStored", args: [_with(_STORED, { id: "constructor" })],
    expect: _with(_TRACK, { id: "constructor" }) },
  { fn: "fromStored", args: [_with(_STORED, { id: "__proto__" })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { id: "short" })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { id: 5 })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { id: [_ID] })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { id: undefined })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { title: undefined })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { title: null })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { title: 5 })], expect: null },
  { fn: "fromStored", args: [_with(_STORED, { title: ["A title"] })], expect: null },
  { fn: "fromStored", args: [null], expect: null },
  { fn: "fromStored", args: [undefined], expect: null },
  { fn: "fromStored", args: [], expect: null },
  { fn: "fromStored", args: ["AAAAAAAAAAA"], expect: null },
  { fn: "fromStored", args: [5], expect: null },
  { fn: "fromStored", args: [[]], expect: null },
  { fn: "fromStored", args: [[_STORED]], expect: null },
  { fn: "fromStored", args: [_listWith(_STORED)], expect: null },
  { fn: "fromStored", args: [{}], expect: null },
  // The state file is outside text like any other: inherited fields are not data.
  { fn: "fromStored", args: [_inheriting(_STORED)], expect: null },
  { fn: "fromStored", args: [_parsed("{\"__proto__\":{\"id\":\"AAAAAAAAAAA\",\"title\":\"A title\"}}")],
    expect: null },
  { fn: "fromStored",
    args: [_parsed("{\"id\":\"AAAAAAAAAAA\",\"title\":\"A title\",\"__proto__\":{\"channel\":\"inherited\"},"
      + "\"constructor\":{\"prototype\":{\"live\":true}}}")],
    expect: { id: _ID, title: "A title", channel: "", duration: null, live: true } },

  // ---- fromUi: a row handed back by the panel ----
  { fn: "fromUi", args: [_STORED], expect: _TRACK },
  { fn: "fromUi", args: [_with(_STORED, { key: 7, auto: true, extra: { a: 1 } })], expect: _TRACK },
  { fn: "fromUi", args: [{ id: _ID, title: "", channel: "", duration: null, live: false }],
    expect: { id: _ID, title: "", channel: "", duration: null, live: true } },
  { fn: "fromUi", args: [{ id: _ID, title: "A title" }],
    expect: { id: _ID, title: "A title", channel: "", duration: null, live: true } },
  { fn: "fromUi", args: [_with(_STORED, { live: true })], expect: _with(_TRACK, { live: true }) },
  { fn: "fromUi", args: [_with(_STORED, { live: "yes" })], expect: _TRACK },
  { fn: "fromUi", args: [_with(_STORED, { duration: -5 })], expect: _UNKNOWN_LENGTH },
  { fn: "fromUi", args: [_with(_STORED, { duration: NaN })], expect: _UNKNOWN_LENGTH },
  { fn: "fromUi", args: [_with(_STORED, { duration: "213" })], expect: _UNKNOWN_LENGTH },
  { fn: "fromUi", args: [_with(_STORED, { title: "A,vid=1 \"q\"" })],
    expect: _with(_TRACK, { title: "A,vid=1 \"q\"" }) },
  { fn: "fromUi", args: [_with(_STORED, { title: " a\u202e\tb\u0000 ", channel: "\u200bc\ud83d" })],
    expect: _with(_TRACK, { title: "a b", channel: "c" }) },
  { fn: "fromUi", args: [_with(_STORED, { title: _repeat("x", 1000), channel: _repeat("y", 1000) })],
    expect: _with(_TRACK, { title: _repeat("x", 300), channel: _repeat("y", 120) }) },
  { fn: "fromUi", args: [_with(_STORED, { channel: { toString: "c" } })],
    expect: _with(_TRACK, { channel: "" }) },
  { fn: "fromUi", args: [_with(_STORED, { id: "constructor" })],
    expect: _with(_TRACK, { id: "constructor" }) },
  { fn: "fromUi", args: [_with(_STORED, { id: "--no-config" })],
    expect: _with(_TRACK, { id: "--no-config" }) },
  { fn: "fromUi", args: [_with(_STORED, { id: "__proto__" })], expect: null },
  { fn: "fromUi", args: [_with(_STORED, { id: "AAAAAAAAAAA\n" })], expect: null },
  { fn: "fromUi", args: [_with(_STORED, { id: 5 })], expect: null },
  { fn: "fromUi", args: [_with(_STORED, { id: [_ID] })], expect: null },
  { fn: "fromUi", args: [_with(_STORED, { title: undefined })], expect: null },
  { fn: "fromUi", args: [_with(_STORED, { title: 5 })], expect: null },
  { fn: "fromUi", args: [_with(_STORED, { title: { length: 5 } })], expect: null },
  { fn: "fromUi", args: [null], expect: null },
  { fn: "fromUi", args: [undefined], expect: null },
  { fn: "fromUi", args: [], expect: null },
  { fn: "fromUi", args: ["AAAAAAAAAAA"], expect: null },
  { fn: "fromUi", args: [5], expect: null },
  { fn: "fromUi", args: [true], expect: null },
  { fn: "fromUi", args: [[]], expect: null },
  { fn: "fromUi", args: [[_STORED]], expect: null },
  { fn: "fromUi", args: [_listWith(_STORED)], expect: null },
  { fn: "fromUi", args: [{}], expect: null }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
