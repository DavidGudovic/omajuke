"use strict"
// Tests for lib/FeedUrls.js: the vector table (also run inside Qt's engine),
// and the properties a table cannot state, such as "every address a signed-in
// request can go to is on www.youtube.com", "no answer, however broken, makes
// the reader throw" and "what comes back is always fresh, capped rows". The
// reader is also compared, on thousands of generated answers, with a second
// one written here from the rules alone.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var FeedUrls = load.lib("FeedUrls")
var Const = load.lib("Const")
var Clean = load.lib("Clean")
var table = load.vectors("feedurls")

var KINDS = ["foryou", "subs", "later", "playlists", "history"]
var VIDEO_KINDS = ["foryou", "subs", "later", "history"]
var PATHS = {
  foryou: "/feed/recommended", subs: "/feed/subscriptions", later: "/playlist", playlists: "/feed/playlists",
  history: "/feed/history"
}
var NO = { ok: false }

// Characters the cleaner removes: none may be left in a kept text.
var INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/

var ID_A = "AAAAAAAAAAA"
var ID_B = "BBBBBBBBBBB"
var LIST = "PL0000000000000001"

// yt-dlp prints its JSON escaped to ASCII.
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, function(ch) {
    return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4)
  })
}

function answer(entries) {
  return asciiJson({ _type: "playlist", id: "synthetic", title: "Synthetic list", entries: entries })
}

function video(id, title) {
  return {
    _type: "url", ie_key: "Youtube", id: id, url: "https://media.example/watch?v=" + id, title: title,
    duration: 100, channel: "Example Channel", uploader: "Example Channel", live_status: null
  }
}

function playlist(id, title) {
  return { _type: "url", ie_key: "YoutubeTab", id: id, url: "https://media.example/playlist?list=" + id,
    title: title, playlist_count: 3 }
}

// The shape every track and every playlist row has to have, whatever the
// answer looked like.
function assertTrack(track, label) {
  assert.deepStrictEqual(Object.keys(track), ["id", "title", "channel", "duration", "live"], label)
  assert.match(track.id, /^[A-Za-z0-9_-]{11}$/, label)
  assert.strictEqual(typeof track.title, "string", label)
  assert.ok(track.title.length >= 1 && track.title.length <= Const.LIMITS.titleChars, label)
  assert.strictEqual(typeof track.channel, "string", label)
  assert.ok(track.channel.length <= Const.LIMITS.channelChars, label)
  assert.ok(track.duration === null || (Number.isInteger(track.duration) && track.duration >= 0
    && track.duration <= Const.LIMITS.durationSeconds), label)
  assert.strictEqual(typeof track.live, "boolean", label)
  assert.doesNotMatch(track.title + track.channel, INVISIBLE, label)
}

function assertRow(row, label) {
  assert.deepStrictEqual(Object.keys(row), ["id", "title", "count"], label)
  assert.match(row.id, /^[A-Za-z0-9_-]{2,64}$/, label)
  assert.strictEqual(typeof row.title, "string", label)
  assert.ok(row.title.length >= 1 && row.title.length <= Const.LIMITS.titleChars, label)
  assert.ok(row.count === null || (Number.isInteger(row.count) && row.count >= 0 && row.count <= 99999),
    label)
  assert.doesNotMatch(row.title, INVISIBLE, label)
}

// Checks whatever parse() returned for a kind, and returns the number of
// rows it held.
function assertAnswer(result, kind, label) {
  if (result.ok !== true) {
    assert.deepStrictEqual(result, NO, label)
    return 0
  }
  assert.deepStrictEqual(Object.keys(result), ["ok", "tracks", "playlists"], label)
  assert.ok(Array.isArray(result.tracks) && Array.isArray(result.playlists), label)
  assert.ok(result.tracks.length <= Const.LIMITS.feedCount, label)
  assert.ok(result.playlists.length <= Const.LIMITS.feedCount, label)
  if (kind === "playlists") assert.strictEqual(result.tracks.length, 0, label)
  else assert.strictEqual(result.playlists.length, 0, label)
  result.tracks.forEach(function(track) { assertTrack(track, label) })
  result.playlists.forEach(function(row) { assertRow(row, label) })
  var ids = result.tracks.concat(result.playlists).map(function(row) { return row.id })
  assert.strictEqual(new Set(ids).size, ids.length, label)
  return ids.length
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

// ---- A second reader ----

// The rules for an answer, written out again as plainly as possible: loops
// over characters where the module uses patterns, a Set where it uses a
// Map. Only the text cleaner is shared; it has tests of its own.
var ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"

function carried(object, key) {
  return Object.getOwnPropertyNames(object).indexOf(key) !== -1 ? object[key] : undefined
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function spelledWithIdAlphabet(text, shortest, longest) {
  if (typeof text !== "string" || text.length < shortest || text.length > longest) return false
  for (var i = 0; i < text.length; i++) {
    if (ID_ALPHABET.indexOf(text.charAt(i)) === -1) return false
  }
  return true
}

// The entries of an answer, or null when the text is not one.
function expectedEntries(text) {
  if (typeof text !== "string" || text.length > 1048576) return null
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i)
    if (code !== 10 && (code < 32 || code > 126)) return null
  }
  var answer
  try {
    answer = JSON.parse(text)
  } catch (error) {
    return null
  }
  if (!isPlainObject(answer) || carried(answer, "_type") !== "playlist") return null
  var entries = carried(answer, "entries")
  return Array.isArray(entries) ? entries : null
}

function expectedTrack(entry) {
  if (!isPlainObject(entry) || carried(entry, "live_status") === "is_upcoming") return null
  var id = carried(entry, "id")
  var title = carried(entry, "title")
  if (!spelledWithIdAlphabet(id, 11, 11) || typeof title !== "string") return null
  title = Clean.text(title, 300)
  if (title === "") return null
  var channel = carried(entry, "channel")
  if (typeof channel !== "string") channel = carried(entry, "uploader")
  var length = carried(entry, "duration")
  var known = typeof length === "number" && length >= 0 && length <= 172800
  return {
    id: id,
    title: title,
    channel: typeof channel === "string" ? Clean.text(channel, 120) : "",
    duration: known ? Math.round(length) + 0 : null,
    live: carried(entry, "live_status") === "is_live" || !known
  }
}

function expectedRow(entry) {
  if (!isPlainObject(entry) || carried(entry, "ie_key") === "Youtube") return null
  var id = carried(entry, "id")
  var title = carried(entry, "title")
  if (!spelledWithIdAlphabet(id, 2, 64) || typeof title !== "string") return null
  title = Clean.text(title, 300)
  if (title === "") return null
  var count = carried(entry, "playlist_count")
  var known = typeof count === "number" && count >= 0 && count <= 99999
  return { id: id, title: title, count: known ? Math.floor(count) + 0 : null }
}

// The first fifty rows the entries give, each id once.
function expectedRows(entries, toRow) {
  var seen = new Set()
  var rows = []
  entries.forEach(function(entry) {
    var row = rows.length < 50 ? toRow(entry) : null
    if (row === null || seen.has(row.id)) return
    seen.add(row.id)
    rows.push(row)
  })
  return rows
}

function expectedParse(kind, text) {
  var entries = expectedEntries(text)
  if (entries === null) return { ok: false }
  if (kind === "playlists") return { ok: true, tracks: [], playlists: expectedRows(entries, expectedRow) }
  return { ok: true, tracks: expectedRows(entries, expectedTrack), playlists: [] }
}

// ---- Generated answers ----

// A small generator with a fixed start, so that every run sees the same
// answers and a failure can be reproduced.
function generator(seed) {
  var state = seed >>> 0
  function next() {
    state = (state ^ (state << 13)) >>> 0
    state = (state ^ (state >>> 17)) >>> 0
    state = (state ^ (state << 5)) >>> 0
    return state / 4294967296
  }
  return {
    chance: function(percent) { return next() * 100 < percent },
    below: function(count) { return Math.floor(next() * count) },
    pick: function(list) { return list[Math.floor(next() * list.length)] }
  }
}

// Field values as JSON text, good ones first. Written as text, so that a
// key can be said twice and a "__proto__" key stays a key.
var GEN_IDS = [
  "\"AAAAAAAAAAA\"", "\"BBBBBBBBBBB\"", "\"abcDEF12345\"", "\"-_-_-_-_-_-\"", "\"constructor\"",
  "\"WL\"", "\"LL\"", "\"PL0000000000000001\"", "\"__proto__\"", "\"RDAAAAAAAAAAA\"",
  "\"" + "a".repeat(64) + "\"", "\"" + "a".repeat(65) + "\"", "\"A\"", "\"\"", "\"AAAAAAAAAA!\"",
  "\"AAAAA AAAAA\"", "\"AAAAAAAAAAA\\n\"", "\"PL01&list=LL\"", "\"PL\\u00e901\"", "7", "null", "true",
  "[\"AAAAAAAAAAA\"]", "{\"id\":\"AAAAAAAAAAA\"}"
]
var GEN_TITLES = [
  "\"A title\"", "\"Another title\"", "\"  spaced \\t out \\n\"", "\"caf\\u00e9 \\u65e5\\u672c\"",
  "\"a\\u0000b\\u202ec\\u200b\"", "\"<b>bold</b> &amp;\"", "\"x\\ud83d\\ude00\"", "\"a\\ud83db\"",
  "\"" + "y".repeat(400) + "\"", "\"" + "\\ud83d\\ude00".repeat(160) + "\"",
  "\"x" + "\\ud83d\\ude00".repeat(160) + "\"", "\"\"", "\" \"", "\"\\u200b\\u00a0\"", "\"\\ud83d\"",
  "null", "7", "[\"t\"]", "{\"t\":1}", "true"
]
var GEN_NAMES = [
  "\"A channel\"", "\" padded  name \"", "\"\\u0440\\u043e\\u043a\"", "\"" + "c".repeat(200) + "\"", "\"\"",
  "\"\\u200b\"", "null", "7", "[\"c\"]", "{}"
]
var GEN_LENGTHS = [
  "0", "-0.0", "1", "59.4", "59.5", "0.49", "213", "172800", "172800.4", "172800.5", "172801", "-1", "-0.4",
  "1e3", "1e308", "-1e308", "null", "\"213\"", "[213]", "true"
]
var GEN_STATES = [
  "null", "\"is_live\"", "\"is_upcoming\"", "\"was_live\"", "\"not_live\"", "\"IS_LIVE\"", "true", "7",
  "[\"is_upcoming\"]"
]
var GEN_EXTRACTORS = [
  "\"Youtube\"", "\"YoutubeTab\"", "\"YoutubePlaylist\"", "\"youtube\"", "\"Youtube \"", "null", "7",
  "[\"Youtube\"]"
]
var GEN_COUNTS = [
  "0", "-0.0", "1", "12.9", "99999", "99999.5", "100000", "-1", "-0.5", "1e308", "null", "\"3\"", "[3]",
  "true"
]
var GEN_OTHERS = ["null", "7", "true", "\"AAAAAAAAAAA\"", "\"playlist\"", "[]", "[[]]", "{}"]
// What a "__proto__" key may hold: a whole row that is not the entry's own.
var GEN_BELOW = "{\"id\":\"BBBBBBBBBBB\",\"title\":\"Below\",\"ie_key\":\"Youtube\"}"
// Characters and marks that land somewhere in an answer by accident.
var GEN_FOREIGN = ["\t", "\r", "\u0000", "\u007f", "\u00e9", "\ud83d"]
var GEN_MARKS = [",", "]", "}", "\"", "\\", "'", ":", "x"]

function generatedEntry(gen) {
  if (gen.chance(4)) return gen.pick(GEN_OTHERS)
  var fields = []
  // The first few of each list are the good values.
  var good = function(list, few) { return gen.chance(75) ? list[gen.below(few)] : gen.pick(list) }
  if (gen.chance(95)) fields.push("\"id\":" + good(GEN_IDS, 11))
  if (gen.chance(95)) fields.push("\"title\":" + good(GEN_TITLES, 8))
  if (gen.chance(50)) fields.push("\"channel\":" + gen.pick(GEN_NAMES))
  if (gen.chance(30)) fields.push("\"uploader\":" + gen.pick(GEN_NAMES))
  if (gen.chance(60)) fields.push("\"duration\":" + gen.pick(GEN_LENGTHS))
  if (gen.chance(30)) fields.push("\"live_status\":" + gen.pick(GEN_STATES))
  if (gen.chance(50)) fields.push("\"ie_key\":" + gen.pick(GEN_EXTRACTORS))
  if (gen.chance(30)) fields.push("\"playlist_count\":" + gen.pick(GEN_COUNTS))
  if (gen.chance(8)) fields.push("\"id\":" + gen.pick(GEN_IDS))
  if (gen.chance(5)) fields.push("\"__proto__\":" + GEN_BELOW)
  if (gen.chance(5)) fields.push("\"hasOwnProperty\":" + gen.pick(GEN_OTHERS))
  // The order matters where a key is said twice.
  for (var i = fields.length - 1; i > 0; i--) {
    var j = gen.below(i + 1)
    var held = fields[i]
    fields[i] = fields[j]
    fields[j] = held
  }
  return "{" + fields.join(",") + "}"
}

function generatedAnswer(gen) {
  var entries = []
  var count = gen.chance(5) ? 45 + gen.below(80) : gen.below(14)
  for (var i = 0; i < count; i++) entries.push(generatedEntry(gen))
  // Many distinct rows, to reach the cap.
  if (gen.chance(4)) {
    for (var n = 0; n < 70; n++) {
      entries.push("{\"id\":\"V" + String(1000000000 + n) + "\",\"title\":\"T\"}")
      entries.push("{\"id\":\"PL" + n + "\",\"title\":\"L\",\"ie_key\":\"YoutubeTab\"}")
    }
  }
  var top = [
    "\"_type\":" + (gen.chance(95) ? "\"playlist\"" : gen.pick(GEN_OTHERS)),
    "\"entries\":" + (gen.chance(95) ? "[" + entries.join(",") + "]" : gen.pick(GEN_OTHERS))
  ]
  if (gen.chance(10)) top.reverse()
  if (gen.chance(20)) top.push("\"id\":\"synthetic\",\"title\":\"Synthetic list\"")
  if (gen.chance(3)) top.push("\"__proto__\":{\"_type\":\"playlist\",\"entries\":[]}")
  if (gen.chance(3)) top.shift()
  var text = "{" + top.join(",") + "}"
  var accident = gen.below(40)
  var at = gen.below(text.length + 1)
  if (accident === 0) return text.slice(0, at)
  if (accident === 1) return text.slice(0, at) + gen.pick(GEN_FOREIGN) + text.slice(at)
  if (accident === 2) return text.slice(0, at) + gen.pick(GEN_MARKS) + text.slice(at)
  if (accident === 3) return text + gen.pick(["\n", " ", "\n\n", " x", "\n" + text, "\r\n"])
  if (accident === 4) return gen.pick([" ", "\n", "[", "\ufeff"]) + text
  if (accident === 5) return " ".repeat(1048576 - text.length + gen.below(2)) + text
  return text
}

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(FeedUrls).sort(), [
    "CACHE_MS", "KINDS", "feedArgv", "isFresh", "isKind", "isListId", "markArgv", "parse", "parseList",
    "playlistUrl", "url", "verifyArgv"
  ])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(FeedUrls, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(FeedUrls).forEach(function(name) {
    if (typeof FeedUrls[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("there are five feeds, in a list no importer can change", function() {
  assert.deepStrictEqual(Array.prototype.slice.call(FeedUrls.KINDS), KINDS)
  assert.ok(Object.isFrozen(FeedUrls.KINDS))
  assert.throws(function() { FeedUrls.KINDS.push("trending") })
  assert.throws(function() { FeedUrls.KINDS[0] = "trending" })
  assert.strictEqual(FeedUrls.isKind("trending"), false)
  assert.strictEqual(FeedUrls.url("trending"), "")
  assert.strictEqual(FeedUrls.url("foryou"), "https://www.youtube.com/feed/recommended")
})

test("every feed address is https on www.youtube.com and nothing else", function() {
  var seen = new Set()
  KINDS.forEach(function(kind) {
    var text = FeedUrls.url(kind)
    var url = new URL(text)
    assert.strictEqual(url.href, text, kind)
    assert.strictEqual(url.protocol, "https:", kind)
    assert.strictEqual(url.hostname, "www.youtube.com", kind)
    assert.strictEqual(url.port, "", kind)
    assert.strictEqual(url.username, "", kind)
    assert.strictEqual(url.password, "", kind)
    assert.strictEqual(url.hash, "", kind)
    assert.strictEqual(url.pathname, PATHS[kind], kind)
    assert.strictEqual(url.search, kind === "later" ? "?list=WL" : "", kind)
    assert.strictEqual(seen.has(text), false, kind)
    seen.add(text)
  })
  assert.strictEqual(FeedUrls.url("later"), FeedUrls.playlistUrl("WL"))
})

test("every address is one safe line of yt-dlp's batch input", function() {
  var lists = ["WL", "LL", LIST, "--", "-x", "_x", "constructor", "a".repeat(64)]
  var addresses = KINDS.map(FeedUrls.url).concat(lists.map(FeedUrls.playlistUrl))
  addresses.forEach(function(text) {
    assert.match(text, /^https:\/\/www\.youtube\.com\/[\x21-\x7e]+$/, text)
    // The batch reader skips lines that start like this and cuts a line at " #".
    assert.doesNotMatch(text, /^[#;\]-]/, text)
    assert.doesNotMatch(text, /\s/, text)
    assert.strictEqual(text.indexOf("#"), -1, text)
  })
})

test("url: nothing but one of the five kinds selects an address", function() {
  var names = Object.getOwnPropertyNames(Object.prototype)
    .concat(Object.getOwnPropertyNames(Array.prototype), ["__proto__", "prototype", "-1", "0", "1", "4", "5"])
  names.forEach(function(name) {
    assert.strictEqual(FeedUrls.url(name), "", name)
    assert.strictEqual(FeedUrls.isKind(name), false, name)
    assert.deepStrictEqual(FeedUrls.parse(name, answer([])), NO, name)
  })
  var values = [
    0, 1, 4, -1, 0.5, NaN, null, undefined, true, false, ["history"], { kind: "history" },
    new String("history"),
    { toString: function() { return "history" } }, Symbol("history"), function() { return "history" }
  ]
  values.forEach(function(value, i) {
    assert.strictEqual(FeedUrls.url(value), "", "value " + i)
    assert.strictEqual(FeedUrls.isKind(value), false, "value " + i)
    assert.deepStrictEqual(FeedUrls.parse(value, answer([])), NO, "value " + i)
  })
  // Every one-character change of a kind is no kind.
  var marks = ["", " ", "\n", "\u0000", "s", "S", "/", ".", "-"]
  KINDS.forEach(function(kind) {
    for (var i = 0; i <= kind.length; i++) {
      marks.forEach(function(mark) {
        var changed = [kind.slice(0, i) + mark + kind.slice(i), kind.slice(0, i) + mark + kind.slice(i + 1)]
        changed.forEach(function(text) {
          if (KINDS.indexOf(text) === -1) assert.strictEqual(FeedUrls.url(text), "", JSON.stringify(text))
        })
      })
    }
    assert.strictEqual(FeedUrls.url(kind.toUpperCase()), "")
  })
})

test("isListId: two to sixty-four characters, each from the id alphabet", function() {
  for (var length = 0; length <= 70; length++) {
    var id = "a".repeat(length)
    assert.strictEqual(FeedUrls.isListId(id), length >= 2 && length <= 64, String(length))
    assert.strictEqual(FeedUrls.playlistUrl(id) !== "", length >= 2 && length <= 64, String(length))
  }
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var inAlphabet = /^[A-Za-z0-9_-]$/.test(ch)
    var hex = code.toString(16)
    assert.strictEqual(FeedUrls.isListId("PL" + ch), inAlphabet, hex)
    assert.strictEqual(FeedUrls.isListId(ch + "PL"), inAlphabet, hex)
    assert.strictEqual(FeedUrls.isListId("P" + ch + "L"), inAlphabet, hex)
    assert.strictEqual(FeedUrls.playlistUrl("PL" + ch) !== "", inAlphabet, hex)
  }
})

test("playlistUrl: the id is the whole value of the one parameter, on the one host", function() {
  var ids = [
    "WL", "LL", LIST, "PLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "RDAAAAAAAAAAA", "--", "-x", "--no-config", "__",
    "constructor", "__proto__", "a".repeat(64), "0123456789", "A-b_C"
  ]
  ids.forEach(function(id) {
    var text = FeedUrls.playlistUrl(id)
    assert.strictEqual(text, "https://www.youtube.com/playlist?list=" + id)
    var url = new URL(text)
    assert.strictEqual(url.href, text, id)
    assert.strictEqual(url.protocol, "https:", id)
    assert.strictEqual(url.hostname, "www.youtube.com", id)
    assert.strictEqual(url.username + url.password + url.port + url.hash, "", id)
    assert.strictEqual(url.pathname, "/playlist", id)
    assert.deepStrictEqual(Array.from(url.searchParams.keys()), ["list"], id)
    assert.strictEqual(url.searchParams.get("list"), id, id)
  })
})

test("playlistUrl: text that would change the address is refused, never repaired", function() {
  var hostile = [
    "WL&list=LL", "WL&v=" + ID_A, "WL#x", "WL?x=1", "WL/../feed/history", "../WL", "WL%2f", "WL%00", "WL\n",
    "WL\r\nHost: tracker.invalid", "WL\u0000", " WL", "WL ", "W L", "WL@tracker.invalid",
    "//tracker.invalid/WL",
    "https://tracker.invalid/playlist?list=WL", "https://www.youtube.com/playlist?list=WL", "WL;x", "WL,LL",
    "WL+LL", "WL=LL", "WL.LL", "WL:LL", "WL\\LL", "WL\"", "WL'", "WL\u0060", "$(id)", "\u202eWL", "W\u200bL",
    "\uff37\uff2c", "W\u0131", "", "W", "a".repeat(65), "a".repeat(1 << 20)
  ]
  hostile.forEach(function(id) {
    assert.strictEqual(FeedUrls.playlistUrl(id), "", JSON.stringify(id).slice(0, 60))
    assert.strictEqual(FeedUrls.isListId(id), false, JSON.stringify(id).slice(0, 60))
  })
  var values = [null, undefined, 12, true, ["WL"], { id: "WL" }, new String("WL"),
    { toString: function() { return "WL" } }, Symbol("WL")]
  values.forEach(function(value, i) {
    assert.strictEqual(FeedUrls.playlistUrl(value), "", "value " + i)
    assert.strictEqual(FeedUrls.isListId(value), false, "value " + i)
  })
})

test("parse: a list of videos is read the same way for every feed of videos", function() {
  var text = answer([video(ID_A, "First"), video(ID_B, "Second")])
  var expected = {
    ok: true,
    tracks: [
      { id: ID_A, title: "First", channel: "Example Channel", duration: 100, live: false },
      { id: ID_B, title: "Second", channel: "Example Channel", duration: 100, live: false }
    ],
    playlists: []
  }
  VIDEO_KINDS.forEach(function(kind) {
    assert.deepStrictEqual(FeedUrls.parse(kind, text), expected, kind)
  })
  assert.deepStrictEqual(FeedUrls.parseList(text), { ok: true, tracks: expected.tracks })
  // The playlists feed reads the same text as a list of playlists, and finds none.
  assert.deepStrictEqual(FeedUrls.parse("playlists", text), { ok: true, tracks: [], playlists: [] })
})

test("parse: a row without a channel is kept, as the history feed sends it", function() {
  var shapes = [
    { id: ID_A, title: "t", duration: 5 },
    { id: ID_A, title: "t", duration: 5, channel: null },
    { id: ID_A, title: "t", duration: 5, channel: null, uploader: null },
    { id: ID_A, title: "t", duration: 5, channel: 0, uploader: false },
    { id: ID_A, title: "t", duration: 5, channel: [], uploader: {} },
    { id: ID_A, title: "t", duration: 5, channel: "" },
    { id: ID_A, title: "t", duration: 5, channel: "\u200b" }
  ]
  shapes.forEach(function(entry, i) {
    assert.deepStrictEqual(FeedUrls.parse("history", answer([entry])), {
      ok: true, tracks: [{ id: ID_A, title: "t", channel: "", duration: 5, live: false }], playlists: []
    }, "shape " + i)
  })
})

test("parse: an empty answer and an unreadable one are told apart", function() {
  KINDS.forEach(function(kind) {
    assert.deepStrictEqual(FeedUrls.parse(kind, answer([])), { ok: true, tracks: [], playlists: [] }, kind)
    assert.deepStrictEqual(FeedUrls.parse(kind, ""), NO, kind)
    assert.deepStrictEqual(FeedUrls.parse(kind, "null"), NO, kind)
  })
  assert.deepStrictEqual(FeedUrls.parseList(answer([])), { ok: true, tracks: [] })
  assert.deepStrictEqual(FeedUrls.parseList(""), NO)
})

test("parse: every answer cut short is refused, at every length", function() {
  var texts = [
    answer([video(ID_A, "First"), video(ID_B, "caf\u00e9 \u65e5\u672c")]),
    answer([playlist(LIST, "A playlist"), playlist("WL", "Another")])
  ]
  texts.forEach(function(text) {
    for (var length = 0; length < text.length; length++) {
      var cut = text.slice(0, length)
      KINDS.forEach(function(kind) {
        assert.deepStrictEqual(FeedUrls.parse(kind, cut), NO, kind + " " + length)
      })
      assert.deepStrictEqual(FeedUrls.parseList(cut), NO, String(length))
    }
    assert.strictEqual(FeedUrls.parse("foryou", text).ok, true)
    assert.strictEqual(FeedUrls.parse("playlists", text).ok, true)
  })
})

test("parse: no value in any field makes the reader throw or lets a bad row through", function() {
  var lone = JSON.parse("\"a\\ud83db\"")
  var values = [
    null, true, false, 0, -1, -0, 1, 0.5, 1e21, 1e308, -1e308, 12345678901, "", " ", "x", "0", "213",
    ID_A, LIST, "constructor", "__proto__", "toString", "is_live", "is_upcoming", "Youtube", "YoutubeTab",
    "x".repeat(5000), "\u0000", "\u202e\u200b", "<b>bold</b>", lone, "\ud83d\ude00".repeat(200),
    [], [ID_A], [[]],
    {}, { id: ID_A }, { a: { b: { c: {} } } }, { length: 3 }, { toString: "x" }
  ]
  var fields = [
    "id", "title", "channel", "uploader", "duration", "live_status", "ie_key", "playlist_count",
    "_type", "url",
    "entries", "__proto__", "constructor", "hasOwnProperty"
  ]
  var checked = 0
  var rows = 0
  fields.forEach(function(field) {
    values.forEach(function(value, i) {
      var label = field + " " + i
      // Built as text, so that a "__proto__" key is a key and not a prototype.
      var hostile = asciiJson(value)
      var entries = [video(ID_A, "A video"), playlist(LIST, "A playlist")].map(function(entry) {
        var copy = asciiJson(entry)
        return copy.slice(0, -1) + "," + JSON.stringify(field) + ":" + hostile + "}"
      })
      var text = "{\"_type\":\"playlist\",\"entries\":[" + entries.join(",") + "]}"
      KINDS.forEach(function(kind) {
        var result
        assert.doesNotThrow(function() { result = FeedUrls.parse(kind, text) }, label)
        rows += assertAnswer(result, kind, label)
        checked++
      })
      var list
      assert.doesNotThrow(function() { list = FeedUrls.parseList(text) }, label)
      assert.strictEqual(list.ok, true, label)
      list.tracks.forEach(function(track) { assertTrack(track, label) })
      // The same value at the top of the answer.
      var top = "{\"_type\":\"playlist\",\"entries\":[]," + JSON.stringify(field) + ":" + hostile + "}"
      KINDS.forEach(function(kind) {
        var result
        assert.doesNotThrow(function() { result = FeedUrls.parse(kind, top) }, label)
        assertAnswer(result, kind, label)
      })
    })
  })
  assert.ok(checked > 2000, String(checked))
  // The check is not vacuous: most changed entries are still good rows.
  assert.ok(rows > 1000, String(rows))
})

test("parse: an answer that plants keys on a prototype changes nothing outside itself", function() {
  var before = Object.getOwnPropertyNames(Object.prototype).sort().join(",")
  var texts = [
    "{\"__proto__\":{\"_type\":\"playlist\",\"entries\":[],\"polluted\":true}}",
    "{\"_type\":\"playlist\",\"entries\":[{\"__proto__\":{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\","
      + "\"polluted\":true}}]}",
    "{\"_type\":\"playlist\",\"entries\":[{\"constructor\":{\"prototype\":{\"polluted\":true}},"
      + "\"id\":\"AAAAAAAAAAA\",\"title\":\"t\"}]}",
    "{\"_type\":\"playlist\",\"entries\":[],\"constructor\":{\"prototype\":{\"polluted\":true}}}"
  ]
  texts.forEach(function(text, i) {
    KINDS.forEach(function(kind) {
      var result = FeedUrls.parse(kind, text)
      assertAnswer(result, kind, "text " + i)
      assert.strictEqual(result.polluted, undefined)
      result.ok === true && result.tracks.concat(result.playlists).forEach(function(row) {
        assert.strictEqual(row.polluted, undefined)
      })
    })
    FeedUrls.parseList(text)
  })
  assert.strictEqual({}.polluted, undefined)
  assert.strictEqual([].polluted, undefined)
  assert.strictEqual(Object.getOwnPropertyNames(Object.prototype).sort().join(","), before)
})

test("parse: at most the feed cap comes back, and dropped entries do not use it up", function() {
  var cap = Const.LIMITS.feedCount
  assert.strictEqual(cap, 50)
  var videos = []
  var lists = []
  for (var i = 0; i < 3 * cap; i++) {
    // Every other entry is one the reader drops.
    var dropped = { id: "bad id " + i, title: "Dropped" }
    videos.push(i % 2 === 0 ? dropped : video("V" + String(1000000000 + i), "T" + i))
    lists.push(i % 2 === 0 ? dropped : playlist("PL" + i, "L" + i))
  }
  VIDEO_KINDS.forEach(function(kind) {
    var result = FeedUrls.parse(kind, answer(videos))
    assert.strictEqual(result.tracks.length, cap, kind)
    assert.strictEqual(result.tracks[0].id, "V1000000001")
    assert.strictEqual(result.tracks[cap - 1].id, "V" + String(1000000000 + 2 * cap - 1))
  })
  assert.strictEqual(FeedUrls.parseList(answer(videos)).tracks.length, cap)
  var rows = FeedUrls.parse("playlists", answer(lists)).playlists
  assert.strictEqual(rows.length, cap)
  assert.strictEqual(rows[0].id, "PL1")
  assert.strictEqual(rows[cap - 1].id, "PL" + (2 * cap - 1))
  // Fewer than the cap come back as they are.
  assert.strictEqual(FeedUrls.parse("foryou", answer(videos.slice(0, 20))).tracks.length, 10)
})

test("parse: titles and channel names come back cleaned and cut to their limits", function() {
  var long = "\u65e5".repeat(5000)
  var result = FeedUrls.parse("foryou", answer([
    { id: ID_A, title: long, channel: long, duration: 1 },
    { id: ID_B, title: "  a\u0000b\u202ec\n\nd  ", channel: "\u200bx\u00a0\u00a0y", duration: 1 }
  ]))
  assert.strictEqual(result.tracks[0].title, "\u65e5".repeat(Const.LIMITS.titleChars))
  assert.strictEqual(result.tracks[0].channel, "\u65e5".repeat(Const.LIMITS.channelChars))
  assert.strictEqual(result.tracks[1].title, "abc d")
  assert.strictEqual(result.tracks[1].channel, "x y")
  var lists = answer([playlist(LIST, long), playlist("WL", " a\u0007\tb ")])
  var rows = FeedUrls.parse("playlists", lists).playlists
  assert.strictEqual(rows[0].title, "\u65e5".repeat(Const.LIMITS.titleChars))
  assert.strictEqual(rows[1].title, "a b")
  // A cut never leaves half of a character behind.
  var faces = "\ud83d\ude00".repeat(400)
  var cut = FeedUrls.parse("playlists", answer([playlist(LIST, "x" + faces)])).playlists[0].title
  assert.strictEqual(cut.length, Const.LIMITS.titleChars - 1)
  assert.doesNotMatch(cut, /[\ud800-\udbff]$/)
})

test("parse: an answer may be as long as a feed job may send, and not one character longer", function() {
  var cap = Const.LIMITS.feedBytes
  var videos = answer([video(ID_A, "First")])
  var lists = answer([playlist(LIST, "A playlist")])
  var fits = function(text) { return " ".repeat(cap - text.length) + text }
  assert.strictEqual(fits(videos).length, cap)
  assert.strictEqual(FeedUrls.parse("foryou", fits(videos)).tracks.length, 1)
  assert.strictEqual(FeedUrls.parseList(fits(videos)).tracks.length, 1)
  assert.strictEqual(FeedUrls.parse("playlists", fits(lists)).playlists.length, 1)
  assert.deepStrictEqual(FeedUrls.parse("foryou", " " + fits(videos)), NO)
  assert.deepStrictEqual(FeedUrls.parseList(" " + fits(videos)), NO)
  assert.deepStrictEqual(FeedUrls.parse("playlists", " " + fits(lists)), NO)
})

test("parse: numbers JSON can spell but a count or a length cannot be", function() {
  var huge = "{\"_type\":\"playlist\",\"entries\":[{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\","
    + "\"duration\":1e999,"
    + "\"playlist_count\":1e999}]}"
  var track = FeedUrls.parse("foryou", huge).tracks[0]
  assert.strictEqual(track.duration, null)
  assert.strictEqual(track.live, true)
  assert.strictEqual(FeedUrls.parse("playlists", huge).playlists[0].count, null)
  var zero = "{\"_type\":\"playlist\",\"entries\":[{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"duration\":-0.0,"
    + "\"playlist_count\":-0.0}]}"
  assert.ok(Object.is(FeedUrls.parse("foryou", zero).tracks[0].duration, 0))
  assert.ok(Object.is(FeedUrls.parse("playlists", zero).playlists[0].count, 0))
  var counts = [[0, 0], [1, 1], [12.9, 12], [99999, 99999], [99999.5, null], [100000, null], [-1, null],
    [-0.5, null], ["3", null], [null, null], [[3], null], [true, null]]
  counts.forEach(function(pair) {
    var text = answer([{ id: LIST, title: "t", playlist_count: pair[0] }])
    var row = FeedUrls.parse("playlists", text).playlists[0]
    assert.strictEqual(row.count, pair[1], JSON.stringify(pair[0]))
  })
})

test("parse: every call returns rows of its own", function() {
  var text = answer([video(ID_A, "First")])
  var first = FeedUrls.parse("foryou", text)
  var second = FeedUrls.parse("foryou", text)
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first.tracks, second.tracks)
  assert.notStrictEqual(first.tracks[0], second.tracks[0])
  assert.notStrictEqual(first.playlists, second.playlists)
  first.tracks[0].title = "changed"
  first.tracks.push({ id: ID_B })
  first.playlists.push({ id: "WL" })
  assert.deepStrictEqual(FeedUrls.parse("foryou", text), second)
  var lists = answer([playlist(LIST, "A playlist")])
  var one = FeedUrls.parse("playlists", lists)
  var two = FeedUrls.parse("playlists", lists)
  assert.notStrictEqual(one.playlists[0], two.playlists[0])
  assert.notStrictEqual(one.tracks, two.tracks)
  assert.notStrictEqual(FeedUrls.parse("foryou", ""), FeedUrls.parse("foryou", ""))
})

test("parse: only a plain string is read as an answer", function() {
  var text = answer([video(ID_A, "First")])
  var values = [
    null, undefined, 0, 7, true, [text], { text: text }, new String(text), Buffer.from(text),
    { toString: function() { return text } }, JSON.parse(text), Symbol("x"), function() { return text }
  ]
  values.forEach(function(value, i) {
    KINDS.forEach(function(kind) {
      assert.deepStrictEqual(FeedUrls.parse(kind, value), NO, "value " + i)
    })
    assert.deepStrictEqual(FeedUrls.parseList(value), NO, "value " + i)
  })
})

test("parse: agrees with a second reader on thousands of generated answers", function() {
  var gen = generator(20260101)
  var seen = { answers: 0, refused: 0, tracks: 0, rows: 0, full: 0, withTracks: 0, withRows: 0 }
  for (var n = 0; n < 4000; n++) {
    var text = generatedAnswer(gen)
    var kind = VIDEO_KINDS[n % VIDEO_KINDS.length]
    var label = "answer " + n
    var videos = FeedUrls.parse(kind, text)
    var lists = FeedUrls.parse("playlists", text)
    assert.deepStrictEqual(videos, expectedParse(kind, text), label)
    assert.deepStrictEqual(lists, expectedParse("playlists", text), label)
    var opened = FeedUrls.parseList(text)
    assert.deepStrictEqual(opened, videos.ok ? { ok: true, tracks: videos.tracks } : NO, label)
    // Both readers refuse the same texts.
    assert.strictEqual(videos.ok, lists.ok, label)
    seen.answers++
    if (!videos.ok) {
      seen.refused++
      continue
    }
    seen.tracks += videos.tracks.length
    seen.rows += lists.playlists.length
    if (videos.tracks.length > 0) seen.withTracks++
    if (lists.playlists.length > 0) seen.withRows++
    if (videos.tracks.length === 50 || lists.playlists.length === 50) seen.full++
  }
  // The comparison is not vacuous: most answers are read, most of those
  // hold rows of both kinds, some are refused and some reach the cap.
  assert.ok(seen.refused > 300 && seen.refused < 1200, JSON.stringify(seen))
  assert.ok(seen.withTracks > 2000 && seen.withRows > 2000, JSON.stringify(seen))
  assert.ok(seen.tracks > 5000 && seen.rows > 5000, JSON.stringify(seen))
  assert.ok(seen.full > 50, JSON.stringify(seen))
})

test("parse: a field the answer does not carry is never taken from somewhere else", function() {
  // The plugin shares its JavaScript engine with the rest of the shell. If
  // other code there ever left members on Object.prototype, every parsed
  // object would seem to have them. The reader must go on seeing only what
  // the answer itself says.
  var planted = {
    _type: "playlist", entries: [video(ID_B, "Planted")], id: ID_B, title: "Planted", channel: "Planted",
    uploader: "Planted", duration: 7, live_status: "is_upcoming", ie_key: "Youtube", playlist_count: 7
  }
  var texts = [
    "{}", "{\"_type\":\"playlist\"}", "{\"entries\":[]}", "{\"_type\":\"playlist\",\"entries\":[{}]}",
    "{\"_type\":\"playlist\",\"entries\":[{\"id\":\"AAAAAAAAAAA\"},{\"title\":\"t\"},{\"id\":\"PL01\"}]}",
    "{\"_type\":\"playlist\",\"entries\":[{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\"}]}",
    "{\"_type\":\"playlist\",\"entries\":[{\"id\":\"PL01\",\"title\":\"t\"}]}"
  ]
  var read = function() {
    return texts.map(function(text) {
      return [FeedUrls.parse("history", text), FeedUrls.parse("playlists", text), FeedUrls.parseList(text)]
    })
  }
  var clean = read()
  var names = Object.keys(planted)
  var dirty
  names.forEach(function(name) {
    Object.defineProperty(Object.prototype, name, {
      value: planted[name], configurable: true, writable: true
    })
  })
  try {
    dirty = read()
  } finally {
    names.forEach(function(name) { delete Object.prototype[name] })
  }
  assert.strictEqual({}.id, undefined)
  assert.deepStrictEqual(dirty, clean)
  // And what was read is what the answers say, nothing more.
  assert.deepStrictEqual(clean[0], [NO, NO, NO])
  assert.deepStrictEqual(clean[1], [NO, NO, NO])
  assert.deepStrictEqual(clean[2], [NO, NO, NO])
  assert.deepStrictEqual(clean[4][0], { ok: true, tracks: [], playlists: [] })
  assert.deepStrictEqual(clean[4][1], { ok: true, tracks: [], playlists: [] })
  assert.deepStrictEqual(clean[5][0].tracks,
    [{ id: ID_A, title: "t", channel: "", duration: null, live: true }])
  assert.deepStrictEqual(clean[6][1].playlists, [{ id: "PL01", title: "t", count: null }])
})

test("isFresh: a list is fresh for five minutes from its fetch and never before it", function() {
  assert.strictEqual(FeedUrls.CACHE_MS, 5 * 60 * 1000)
  var fetched = 1760000000000
  var ages = [-86400000, -1, 0, 1, 1000, 299999, 300000, 300001, 600000, 86400000]
  ages.forEach(function(age) {
    assert.strictEqual(FeedUrls.isFresh(fetched, fetched + age), age >= 0 && age < 300000, String(age))
  })
  var odd = [NaN, Infinity, -Infinity, null, undefined, "1760000000000", true, [fetched], { at: fetched },
    new Date(fetched), BigInt(7)]
  odd.forEach(function(value, i) {
    assert.strictEqual(FeedUrls.isFresh(value, fetched), false, "value " + i)
    assert.strictEqual(FeedUrls.isFresh(fetched, value), false, "value " + i)
    assert.strictEqual(FeedUrls.isFresh(value, value), false, "value " + i)
  })
})

test("no input makes the functions slow", function() {
  var size = Const.LIMITS.feedBytes
  var many = []
  for (var i = 0; i < 12000; i++) {
    many.push({ ie_key: "Youtube", id: "V" + String(1000000000 + i), title: "T" + i })
  }
  var dropped = []
  for (var j = 0; j < 40000; j++) dropped.push({ id: j, title: 7 })
  var hostile = [
    "[".repeat(size), "{".repeat(size), "{\"a\":".repeat(size / 8), "\"".repeat(size), "\\".repeat(size),
    "0".repeat(size), " ".repeat(size), "\n".repeat(size), "a".repeat(size), "\u0000".repeat(size),
    "\ud83d".repeat(size), "{\"_type\":\"playlist\",\"entries\":[" + "0,".repeat(size / 2 - 40) + "0]}",
    "{\"_type\":\"playlist\",\"entries\":[" + "[],".repeat(size / 3 - 40) + "[]]}",
    answer(many), answer(dropped), answer(many.concat(many)), "x".repeat(4 * size)
  ]
  hostile.forEach(function(input, i) {
    var ms = elapsedMs(function() {
      KINDS.forEach(function(kind) { assertAnswer(FeedUrls.parse(kind, input), kind, "input " + i) })
      FeedUrls.parseList(input)
      FeedUrls.url(input)
      FeedUrls.isKind(input)
      FeedUrls.isListId(input)
      FeedUrls.playlistUrl(input)
    })
    assert.ok(ms < 3000, "input " + i + " took " + Math.round(ms) + " ms")
  })
})

// ---- The calls that carry the login ----

var Paths = load.lib("Paths")
var YtArgs = load.lib("YtArgs")

var SIGNED_IN = ["feedArgv", "verifyArgv", "markArgv"]
var ARGV_TOOLS = { ytdlp: "/usr/bin/yt-dlp" }
var ARGV_PATHS = Paths.resolve({
  XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
})

function signedIn(name, n) {
  return FeedUrls[name](ARGV_TOOLS, ARGV_PATHS, Paths.jarCopyFile(ARGV_PATHS, n === undefined ? 3 : n))
}

test("a signed-in call starts like every other call and then names its throwaway cookie file", function() {
  var common = ["/usr/bin/yt-dlp"].concat(YtArgs.base(ARGV_PATHS))
  SIGNED_IN.forEach(function(name) {
    var argv = signedIn(name)
    assert.deepStrictEqual(argv.slice(0, common.length), common, name)
    assert.deepStrictEqual(argv.slice(common.length, common.length + 2),
      ["--cookies", "/run/user/1000/omajuke/jar/3.txt"], name)
    assert.strictEqual(argv.filter(function(arg) { return arg === "--cookies" }).length, 1, name)
    argv.forEach(function(arg) { assert.strictEqual(typeof arg, "string", name) })
  })
})

test("a call with --cookies never has --no-warnings or --no-cookies", function() {
  // A login YouTube no longer accepts is reported as a warning: a call
  // that hid warnings could never notice it.
  SIGNED_IN.forEach(function(name) {
    var argv = signedIn(name)
    assert.ok(argv.indexOf("--cookies") !== -1, name)
    assert.strictEqual(argv.indexOf("--no-warnings"), -1, name)
    assert.strictEqual(argv.indexOf("--no-cookies"), -1, name)
    YtArgs.SIGNED_OUT.forEach(function(flag) {
      assert.strictEqual(argv.indexOf(flag), -1, name + " " + flag)
    })
  })
})

test("a signed-in call reads what to look up from standard input and names nothing itself", function() {
  SIGNED_IN.forEach(function(name) {
    var argv = signedIn(name)
    assert.deepStrictEqual(argv.slice(-2), ["-a", "-"], name)
    argv.forEach(function(arg, i) {
      assert.doesNotMatch(arg, /:\/\/|youtube|watch\?|list=/, name + " " + i)
      // Everything is an option, the value of the option in front of it,
      // or the dash that stands for standard input.
      var value = ["--cache-dir", "--color", "--socket-timeout", "--cookies", "--playlist-items", "-a"]
      if (i > 0 && arg.charAt(0) !== "-") assert.ok(value.indexOf(argv[i - 1]) !== -1, name + " " + arg)
    })
  })
})

test("a signed-in call never carries a flag that reads, writes or runs something else", function() {
  var never = [
    "-v", "--verbose", "--print-traffic", "--write-pages", "-o", "--output", "--exec", "--netrc",
    "--netrc-cmd", "--enable-file-urls", "--no-check-certificates", "--cookies-from-browser",
    "--config-locations", "--proxy", "--plugin-dirs", "--update", "-U", "--load-info-json",
    "--write-info-json", "--print-to-file", "--batch-file", "--download-archive", "--dump-pages"
  ]
  SIGNED_IN.forEach(function(name) {
    var argv = signedIn(name)
    never.forEach(function(flag) { assert.strictEqual(argv.indexOf(flag), -1, name + " " + flag) })
    var kept = ["--ignore-config", "--no-plugin-dirs", "--no-cookies-from-browser", "--no-remote-components"]
    kept.forEach(function(flag) { assert.ok(argv.indexOf(flag) !== -1, name + " " + flag) })
  })
})

test("only the watched report switches reporting on, and it fetches nothing", function() {
  var mark = signedIn("markArgv")
  assert.ok(mark.indexOf("--mark-watched") > mark.indexOf("--no-mark-watched"))
  assert.ok(mark.indexOf("--simulate") !== -1 && mark.indexOf("--quiet") !== -1)
  assert.strictEqual(mark.indexOf("-J"), -1)
  var lists = ["feedArgv", "verifyArgv"]
  lists.forEach(function(name) {
    var argv = signedIn(name)
    assert.strictEqual(argv.indexOf("--mark-watched"), -1, name)
    assert.ok(argv.indexOf("--no-mark-watched") !== -1, name)
    assert.ok(argv.indexOf("--flat-playlist") !== -1 && argv.indexOf("-J") !== -1, name)
  })
})

test("a list is asked for up to the feed cap, the check of a new login for one row", function() {
  var feed = signedIn("feedArgv")
  var verify = signedIn("verifyArgv")
  assert.strictEqual(feed[feed.indexOf("--playlist-items") + 1], "1:" + Const.LIMITS.feedCount)
  assert.strictEqual(verify[verify.indexOf("--playlist-items") + 1], "1:1")
})

test("the saved login itself is never the cookie file of a call", function() {
  var others = [
    ARGV_PATHS.jarFile, ARGV_PATHS.stateFile, ARGV_PATHS.jarDir, ARGV_PATHS.dataDir,
    Paths.infoFile(ARGV_PATHS, 3), Paths.thumbFile(ARGV_PATHS, 3), Paths.signinAttemptDir(ARGV_PATHS, 3),
    Paths.signinAttemptDir(ARGV_PATHS, 3) + "/export.txt", ARGV_PATHS.jarDir + "/3.txt.bak",
    "/home/user/.config/chromium/Default/Cookies", "/home/user/cookies.txt"
  ]
  SIGNED_IN.forEach(function(name) {
    others.forEach(function(file) {
      assert.strictEqual(FeedUrls[name](ARGV_TOOLS, ARGV_PATHS, file), null, name + " " + file)
    })
    // A copy that belongs to another runtime directory is not ours either.
    var elsewhere = Paths.resolve({ XDG_RUNTIME_DIR: "/run/user/1000/other", HOME: "/home/user" })
    assert.strictEqual(FeedUrls[name](ARGV_TOOLS, ARGV_PATHS, Paths.jarCopyFile(elsewhere, 3)), null, name)
  })
})

test("every signed-in call gets a list of its own", function() {
  SIGNED_IN.forEach(function(name) {
    var first = signedIn(name)
    first.push("--exec")
    first[1] = "changed"
    var second = signedIn(name)
    assert.strictEqual(second.indexOf("--exec"), -1, name)
    assert.strictEqual(second[1], "--ignore-config", name)
    assert.notStrictEqual(signedIn(name, 4)[second.indexOf("--cookies") + 1],
      second[second.indexOf("--cookies") + 1], name)
  })
})

test("a tool table whose entry cannot be read plainly gives no command", function() {
  var changing = { n: 0 }
  Object.defineProperty(changing, "ytdlp", {
    get: function() { return changing.n++ === 0 ? "/usr/bin/yt-dlp" : "/usr/bin/other" }
  })
  SIGNED_IN.forEach(function(name) {
    changing.n = 0
    var argv = FeedUrls[name](changing, ARGV_PATHS, Paths.jarCopyFile(ARGV_PATHS, 3))
    // Read once: what was checked is what is run.
    assert.strictEqual(argv[0], "/usr/bin/yt-dlp", name)
    assert.strictEqual(changing.n, 1, name)
  })
})

// These three are the only builders of the calls made for the account
// itself. Their exact lists are pinned in argv-yt.test.js beside every
// other yt-dlp command line; here it is shown that lib/YtArgs.js, whose
// common flags they start with, keeps no second copy of them, and that each
// refuses what it must.
test("the signed-in command lines are built here and nowhere else", function() {
  var counters = [1, 3, 4096]
  var refused = [ARGV_PATHS.jarFile, ARGV_PATHS.stateFile, Paths.infoFile(ARGV_PATHS, 3), "", null]
  var gone = ["feed", "verify", "mark"]
  gone.forEach(function(name) { assert.strictEqual(YtArgs[name], undefined, name) })
  SIGNED_IN.forEach(function(name) {
    var build = FeedUrls[name]
    counters.forEach(function(n) {
      var copy = Paths.jarCopyFile(ARGV_PATHS, n)
      var argv = build(ARGV_TOOLS, ARGV_PATHS, copy)
      assert.ok(Array.isArray(argv), name)
      // The flags every call has are the ones of lib/YtArgs.js, unchanged.
      assert.deepStrictEqual(argv.slice(1, 1 + YtArgs.base(ARGV_PATHS).length), YtArgs.base(ARGV_PATHS), name)
      assert.strictEqual(build({}, ARGV_PATHS, copy), null, name)
      assert.strictEqual(build(ARGV_TOOLS, { ok: false }, copy), null, name)
    })
    refused.forEach(function(file) { assert.strictEqual(build(ARGV_TOOLS, ARGV_PATHS, file), null, name) })
  })
})
