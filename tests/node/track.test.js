"use strict"
// Tests for lib/Track.js: the vector table (also run inside Qt's engine),
// the two synthetic yt-dlp fixtures, and the guarantees a table cannot
// state: what every track looks like whatever went in, that nothing of the
// input is carried over, and that no input makes the readers slow or throw.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var Track = load.lib("Track")
var Const = load.lib("Const")
var Ids = load.lib("Ids")
var table = load.vectors("track")

var FIXTURES = path.join(__dirname, "..", "fixtures")
var ID = "AAAAAAAAAAA"
var OTHER = "BBBBBBBBBBB"
var MEDIA = "https://rr1---sn-test.googlevideo.com/videoplayback?id=synthetic"
var KEYS = ["id", "title", "channel", "duration", "live"]
var NO = { ok: false }

// The characters the cleaner never lets through (see clean.test.js).
var BANNED = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u200b-\\u200f\\u2028-\\u202e"
  + "\\u2060-\\u206f\\ufeff\\ufff9-\\ufffb]")

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8")
}

// JSON the way yt-dlp writes it: everything outside ASCII escaped.
function ascii(value) {
  return JSON.stringify(value).replace(/[^\x20-\x7e]/g, function(ch) {
    return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")
  })
}

function flat(changes) {
  return Object.assign({
    _type: "url", ie_key: "Youtube", id: ID, url: "https://www.youtube.com/watch?v=" + ID, title: "A title",
    description: "Never read.", duration: 213, channel: "A channel", uploader: "An uploader",
    thumbnails: [{ url: "https://i.ytimg.com/vi/" + ID + "/hq720.jpg" }], live_status: null, view_count: 1000
  }, changes)
}

function info(changes) {
  return Object.assign({
    id: ID, title: "A title", channel: "A channel", duration: 213, live_status: "not_live", is_live: false,
    formats: [{ format_id: "251", vcodec: "none", url: MEDIA + "&itag=251" }],
    requested_formats: [
      { vcodec: "vp9", url: MEDIA + "&itag=247" }, { vcodec: "none", url: MEDIA + "&itag=251" }
    ],
    _type: "video"
  }, changes)
}

function list(entries) {
  return ascii({ _type: "playlist", entries: entries })
}

function hasLoneSurrogate(string) {
  return /[\ud800-\udfff]/.test(string.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""))
}

// What every track must look like, whatever it was made from.
function assertTrack(track, label) {
  assert.deepStrictEqual(Object.keys(track), KEYS, label)
  assert.strictEqual(Object.getPrototypeOf(track), Object.prototype, label)
  assert.strictEqual(Ids.isId(track.id), true, label)
  assert.strictEqual(typeof track.title, "string", label)
  assert.strictEqual(typeof track.channel, "string", label)
  assert.ok(track.title.length <= Const.LIMITS.titleChars, label)
  assert.ok(track.channel.length <= Const.LIMITS.channelChars, label)
  var texts = [track.title, track.channel]
  texts.forEach(function(text) {
    assert.ok(!BANNED.test(text) && !hasLoneSurrogate(text), label)
    assert.strictEqual(text, text.trim(), label)
  })
  if (track.duration !== null) {
    assert.ok(Number.isInteger(track.duration), label)
    assert.ok(track.duration >= 0 && track.duration <= Const.LIMITS.durationSeconds, label)
    assert.ok(!Object.is(track.duration, -0), label)
  }
  assert.strictEqual(typeof track.live, "boolean", label)
  if (track.duration === null) assert.strictEqual(track.live, true, label)
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

test("exports exactly the documented functions", function() {
  assert.deepStrictEqual(Object.keys(Track).sort(),
    ["fromFlatEntry", "fromInfoJson", "fromStored", "fromUi", "listFromPlaylistJson"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Track, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Track).forEach(function(name) {
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

// ---- The fixtures ----

test("fixtures: pure ASCII with a final newline, as yt-dlp writes its JSON", function() {
  var names = ["search.json", "video.json"]
  names.forEach(function(name) {
    var text = fixture(name)
    assert.ok(/^[\x20-\x7e\n]*$/.test(text), name)
    assert.ok(/\}\n$/.test(text), name)
  })
})

test("fixtures: search.json yields exactly these tracks, in this order", function() {
  var result = Track.listFromPlaylistJson(fixture("search.json"), Const.LIMITS.searchCount)
  var channel = "Synthetic Channel"
  assert.deepStrictEqual(result, { ok: true, tracks: [
    { id: "AAAAAAAAAAA", title: "Synthetic track one", channel: channel, duration: 213, live: false },
    // Cleaned: marks and the bell gone, the line break a space, rounded up.
    { id: "BBBBBBBBBBB", title: "Second track with marks and a line break", channel: channel, duration: 188,
      live: false },
    { id: "CCCCCCCCCCC", title: "Synthetic live stream", channel: channel, duration: null, live: true },
    { id: "DDDDDDDDDDD", title: "Synthetic stream of unknown length", channel: channel, duration: null,
      live: true },
    // The uploader stands in for a missing channel.
    { id: "FFFFFFFFFFF", title: "Synthetic track without a channel name", channel: "Synthetic Uploader",
      duration: 61, live: false },
    // Markup is text like any other. A length of zero is a length.
    { id: "GGGGGGGGGGG", title: "<img src=\"http://127.0.0.1:9/x\"> & <b>markup</b>", channel: channel,
      duration: 0, live: false },
    // The trailing half of a surrogate pair is gone.
    { id: "HHHHHHHHHHH", title: "\u65e5\u672c\u8a9e \ud83c\udfb5 caf\u00e9",
      channel: "\u041a\u0430\u043d\u0430\u043b", duration: 3600, live: false },
    { id: "IIIIIIIIIII", title: "long title ".repeat(27) + "lon", channel: channel, duration: 5400,
      live: false },
    { id: "NNNNNNNNNNN", title: "Synthetic track longer than two days", channel: channel, duration: null,
      live: true },
    { id: "constructor", title: "Synthetic track, id spelled like a member name", channel: "", duration: 213,
      live: false },
    { id: "--no-config", title: "Synthetic track, id spelled like an option", channel: channel,
      duration: null, live: true }
  ] })
  result.tracks.forEach(function(track) { assertTrack(track, track.id) })
})

test("fixtures: search.json also holds every kind of entry that must be dropped", function() {
  var entries = JSON.parse(fixture("search.json")).entries
  var dropped = entries.filter(function(entry) { return Track.fromFlatEntry(entry) === null })
  var reasons = dropped.map(function(entry) {
    if (entry === null || typeof entry !== "object") return "not an object"
    if (entry.live_status === "is_upcoming") return "not started"
    if (!Ids.isId(entry.id)) return "bad id"
    return typeof entry.title === "string" ? "empty title" : "no title"
  })
  assert.deepStrictEqual(reasons.sort(), ["bad id", "bad id", "empty title", "no title", "no title",
    "not an object", "not an object", "not started"])
  // One id is listed twice, and only its first entry counts.
  var ids = entries.map(function(entry) { return entry && entry.id })
  assert.strictEqual(ids.filter(function(id) { return id === ID }).length, 2)
})

test("fixtures: video.json resolves to the track the first service case plays", function() {
  var result = Track.fromInfoJson(fixture("video.json"), ID)
  assert.deepStrictEqual(result, {
    ok: true,
    // The raw title carries a bidi override, a zero-width space and a
    // trailing space, and comes out as the plain text below.
    track: { id: ID, title: "A,vid=1 \"q\"", channel: "c", duration: 5, live: false },
    videoUrl: MEDIA + "&itag=247"
  })
  assert.notStrictEqual(JSON.parse(fixture("video.json")).title, result.track.title)
  assert.strictEqual(Const.VIDEO_URL_RE.test(result.videoUrl), true)
})

test("fixtures: video.json answers for any id once the id is swapped in as text", function() {
  // What the yt-dlp stub does, before it picks the fields that were asked
  // for: no parsing, so the text stays pure ASCII.
  var text = fixture("video.json").split(ID).join(OTHER)
  assert.deepStrictEqual(Track.fromInfoJson(text, OTHER).track.id, OTHER)
  assert.deepStrictEqual(Track.fromInfoJson(text, ID), NO)
  assert.strictEqual(text.indexOf(ID), -1)
})

test("fixtures: synthetic ids and media hosts only", function() {
  var names = ["search.json", "video.json"]
  names.forEach(function(name) {
    var text = fixture(name)
    var hosts = text.match(/https?:\/\/[^\/"\\ ]+/g) || []
    hosts.forEach(function(host) {
      assert.ok(["https://www.youtube.com", "https://i.ytimg.com", "https://rr1---sn-test.googlevideo.com",
        "http://127.0.0.1:9"].indexOf(host) !== -1, name + ": " + host)
    })
    var watched = text.match(/watch\?v=[\w-]+/g) || []
    watched.forEach(function(ref) {
      var id = ref.slice("watch?v=".length)
      // One letter repeated, or one of the two ids that are words.
      assert.ok(/^([A-Z])\1+$/.test(id) || id === "short" || id === "constructor" || id === "--no-config",
        name + ": " + id)
    })
  })
})

// ---- What every track looks like ----

test("a track is a fresh plain object with exactly the five keys, in a fixed order", function() {
  var expected = { id: ID, title: "A title", channel: "A channel", duration: 213, live: false }
  // A queue item with its keys in another order: the result does not follow it.
  var stored = { key: 7, live: false, duration: 213, channel: "A channel", title: "A title", id: ID }
  var results = [
    Track.fromFlatEntry(flat()), Track.fromStored(stored), Track.fromUi(stored),
    Track.listFromPlaylistJson(list([flat()]), 20).tracks[0], Track.fromInfoJson(ascii(info()), ID).track
  ]
  results.forEach(function(track, i) {
    assertTrack(track, "result " + i)
    assert.deepStrictEqual(track, expected)
    assert.notStrictEqual(track, stored)
  })
  assert.deepStrictEqual(Object.keys(Track.fromInfoJson(ascii(info()), ID)), ["ok", "track", "videoUrl"])
  assert.deepStrictEqual(Object.keys(Track.listFromPlaylistJson(list([]), 20)), ["ok", "tracks"])
})

test("a refusal carries nothing but ok: false", function() {
  assert.deepStrictEqual(Object.keys(Track.fromInfoJson("null", ID)), ["ok"])
  assert.deepStrictEqual(Object.keys(Track.listFromPlaylistJson("null", 20)), ["ok"])
})

test("the caps are the ones in Const", function() {
  var long = "x".repeat(Const.LIMITS.titleChars + 50)
  var track = Track.fromFlatEntry(flat({ title: long, channel: long }))
  assert.strictEqual(track.title.length, Const.LIMITS.titleChars)
  assert.strictEqual(track.channel.length, Const.LIMITS.channelChars)
  var edge = Const.LIMITS.durationSeconds
  assert.strictEqual(Track.fromFlatEntry(flat({ duration: edge })).duration, edge)
  assert.strictEqual(Track.fromFlatEntry(flat({ duration: edge + 1 })).duration, null)
})

test("a duration is a whole number of seconds or null, never negative zero", function() {
  var cases = [
    [0, 0], [-0, 0], [0.4, 0], [0.5, 1], [213.6, 214], [172800, 172800], [172800.4, null], [172801, null],
    [-1, null], [-0.1, null], [NaN, null], [Infinity, null], ["213", null], [null, null], [undefined, null],
    [[213], null], [{}, null], [true, null], [1e308, null], [Number.MIN_VALUE, 0], [2147483648, null]
  ]
  var readers = [
    function(duration) { return Track.fromFlatEntry(flat({ duration: duration })) },
    function(duration) { return Track.fromStored({ id: ID, title: "t", duration: duration }) },
    function(duration) { return Track.fromUi({ id: ID, title: "t", duration: duration }) }
  ]
  cases.forEach(function(c) {
    readers.forEach(function(read) {
      var track = read(c[0])
      assert.ok(Object.is(track.duration, c[1]), String(c[0]) + " became " + String(track.duration))
      assert.strictEqual(track.live, c[1] === null)
    })
  })
})

test("a track read back from a track is the same track", function() {
  var texts = ["A title", "", "  a\u202eb \ud83d c  ", "x".repeat(500), "\u65e5\u672c\u8a9e \ud83c\udfb5"]
  texts.forEach(function(text) {
    var first = Track.fromUi({ id: ID, title: text, channel: text, duration: 12.5, live: false })
    assert.deepStrictEqual(Track.fromStored(first), first)
    assert.deepStrictEqual(Track.fromUi(first), first)
    // The saved state is JSON, so the round trip through JSON counts too.
    assert.deepStrictEqual(Track.fromStored(JSON.parse(JSON.stringify(first))), first)
  })
})

// ---- Nothing of the input is carried over ----

test("an entry's url, thumbnails and description are never read", function() {
  var touched = []
  var entry = flat()
  var unread = ["url", "thumbnails", "webpage_url", "description", "view_count", "ie_key", "_type"]
  unread.forEach(function(key) {
    Object.defineProperty(entry, key, { enumerable: true, get: function() { touched.push(key) } })
  })
  assert.deepStrictEqual(Track.fromFlatEntry(entry),
    { id: ID, title: "A title", channel: "A channel", duration: 213, live: false })
  assert.deepStrictEqual(touched, [])
})

test("values of the input are copied, never shared", function() {
  var entry = flat({ title: "A title" })
  var track = Track.fromFlatEntry(entry)
  entry.title = "Changed afterwards"
  entry.id = OTHER
  assert.strictEqual(track.title, "A title")
  assert.strictEqual(track.id, ID)
})

test("parsed JSON is read through own properties only", function() {
  assert.strictEqual(Track.fromFlatEntry(Object.create(flat())), null)
  assert.strictEqual(Track.fromStored(Object.create({ id: ID, title: "t" })), null)
  var inherited = Object.create({ channel: "inherited", duration: 5, live: true })
  inherited.id = ID
  inherited.title = "t"
  assert.deepStrictEqual(Track.fromStored(inherited),
    { id: ID, title: "t", channel: "", duration: null, live: true })
  // A parsed "__proto__" key is an own key and nothing more.
  var parsed = JSON.parse("{\"__proto__\":{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\"}}")
  assert.strictEqual(Track.fromFlatEntry(parsed), null)
  assert.strictEqual(Track.fromStored(parsed), null)
})

test("a panel row is read plainly, in case the list view wrapped it", function() {
  var row = { id: ID, title: "A title", channel: "A channel", duration: 213, live: false }
  assert.deepStrictEqual(Track.fromUi(Object.create(row)), row)
})

test("hostile keys in the input never reach Object.prototype", function() {
  var before = Object.getOwnPropertyNames(Object.prototype).sort()
  table.CASES.forEach(function(c) { load.runCase(Track, c) })
  var texts = [
    "{\"__proto__\":{\"polluted\":true},\"_type\":\"playlist\","
      + "\"entries\":[{\"__proto__\":{\"polluted\":true}}]}",
    "{\"constructor\":{\"prototype\":{\"polluted\":true}},\"_type\":\"playlist\",\"entries\":[]}",
    "{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"formats\":[{}],\"__proto__\":{\"polluted\":true}}"
  ]
  texts.forEach(function(text) {
    Track.listFromPlaylistJson(text, 20)
    Track.fromInfoJson(text, ID)
    Track.fromStored(JSON.parse(text))
    Track.fromUi(JSON.parse(text))
  })
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before)
  assert.strictEqual({}.polluted, undefined)
  assert.strictEqual([].polluted, undefined)
})

test("ids that name members of Object.prototype are told apart like any others", function() {
  var ids = ["constructor", "__proto__AA", "toString___", "valueOf____", "hasOwnPrope"]
  var entries = ids.concat(ids).map(function(id) { return flat({ id: id }) })
  var result = Track.listFromPlaylistJson(list(entries), 20)
  assert.deepStrictEqual(result.tracks.map(function(track) { return track.id }), ids)
})

// ---- The size and shape of what is accepted ----

test("the text caps are the runner's byte caps, tested before anything is parsed", function() {
  function padded(length) {
    var body = ascii({ _type: "playlist", entries: [flat()], pad: "" })
    return body.replace("\"pad\":\"\"", "\"pad\":\"" + "x".repeat(length - body.length) + "\"")
  }
  var cap = Math.max(Const.LIMITS.searchBytes, Const.LIMITS.mixBytes, Const.LIMITS.feedBytes)
  assert.strictEqual(padded(cap).length, cap)
  assert.strictEqual(Track.listFromPlaylistJson(padded(cap), 20).tracks.length, 1)
  assert.deepStrictEqual(Track.listFromPlaylistJson(padded(cap + 1), 20), NO)

  function paddedInfo(length) {
    var body = ascii(info({ pad: "" }))
    return body.replace("\"pad\":\"\"", "\"pad\":\"" + "x".repeat(length - body.length) + "\"")
  }
  assert.strictEqual(Track.fromInfoJson(paddedInfo(Const.LIMITS.resolveBytes), ID).ok, true)
  assert.deepStrictEqual(Track.fromInfoJson(paddedInfo(Const.LIMITS.resolveBytes + 1), ID), NO)
  // Too long is refused even when it is not JSON at all: nothing was parsed.
  assert.deepStrictEqual(Track.fromInfoJson("x".repeat(Const.LIMITS.resolveBytes + 1), ID), NO)
})

test("a realistic resolve answer of two megabytes is read", function() {
  var formats = []
  for (var i = 0; i < 3000; i++) {
    formats.push({ format_id: String(i), vcodec: "none", url: MEDIA + "&n=" + i + "&pad=" + "p".repeat(500) })
  }
  var text = ascii(info({ formats: formats }))
  assert.ok(text.length > 1500000 && text.length < Const.LIMITS.resolveBytes)
  assert.strictEqual(Track.fromInfoJson(text, ID).ok, true)
})

test("only ASCII text is parsed: one damaged character refuses the whole answer", function() {
  var good = ascii(info({ title: "caf\u00e9" }))
  var listed = list([flat()])
  assert.strictEqual(Track.fromInfoJson(good, ID).track.title, "caf\u00e9")
  for (var code = 0; code <= 0xffff; code += code < 0x100 ? 1 : 251) {
    var ch = String.fromCharCode(code)
    var allowed = code === 0x0a || (code >= 0x20 && code <= 0x7e)
    // Appended after the closing brace, where JSON itself allows only blanks.
    var blank = code === 0x0a || code === 0x20
    assert.strictEqual(Track.fromInfoJson(good + ch, ID).ok, allowed && blank, code.toString(16))
    assert.strictEqual(Track.listFromPlaylistJson(listed + ch, 20).ok, allowed && blank, code.toString(16))
  }
})

test("a number too large for a double never becomes a duration", function() {
  // Not in the vector table, because the engines differ here and both are
  // right: this one reads the number as Infinity, Qt's refuses the text.
  var entry = "{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"duration\":1e999}"
  var result = Track.listFromPlaylistJson("{\"_type\":\"playlist\",\"entries\":[" + entry + "]}", 20)
  assert.ok(result.ok === false || result.tracks[0].duration === null)
})

test("the video address is the first chosen format with video and an accepted address", function() {
  function url(requested) {
    return Track.fromInfoJson(ascii(info({ requested_formats: requested })), ID).videoUrl
  }
  assert.strictEqual(url([{ vcodec: "vp9", url: MEDIA }]), MEDIA)
  assert.strictEqual(url([{ vcodec: "none", url: MEDIA + "&a" }, { vcodec: "avc1", url: MEDIA + "&b" }]),
    MEDIA + "&b")
  assert.strictEqual(url([{ vcodec: "vp9", url: "https://media.example/x" }, { vcodec: "av01", url: MEDIA }]),
    MEDIA)
  // Whatever is returned passes the one pattern mpv's side tests against too.
  var random = makeRandom(7)
  var pieces = [
    "https://", "http://", "rr1", "---sn-test", ".googlevideo.com", ".media.example", "/", "@", ":443",
    "videoplayback", "?id=synthetic", " ", "\n", "\\", "#", "%0a", "..", "x"
  ]
  for (var i = 0; i < 3000; i++) {
    var address = ""
    for (var k = random(8) + 1; k > 0; k--) address += pieces[random(pieces.length)]
    var got = url([{ vcodec: "vp9", url: address }])
    assert.ok(got === "" || (got === address && Const.VIDEO_URL_RE.test(got)), JSON.stringify(address))
  }
})

// ---- Robustness ----

test("generated entries: every result keeps the guarantees", function() {
  var random = makeRandom(20261006)
  var values = [
    undefined, null, true, false, 0, -0, 1, 213, 213.5, -1, 172800, 172801, NaN, Infinity, 1e308, [], [ID],
    {}, { toString: 1 }, "is_live", "is_upcoming", "was_live", ID, OTHER, "constructor", "--no-config",
    "__proto__", "short", "", "A title", "  spaced  out  ", "a\u202eb", "\u200b", "tab\there", "line\nbreak",
    "\ud83d", "\ud83c\udfb5", "x".repeat(400)
  ]
  var keys = ["id", "title", "channel", "uploader", "duration", "live_status", "live", "is_live"]
  var made = 0
  for (var i = 0; i < 4000; i++) {
    var entry = {}
    keys.forEach(function(key) {
      if (random(5) > 0) entry[key] = values[random(values.length)]
    })
    // Often a real id and a text for a title, so that tracks do get made.
    if (random(3) > 0) entry.id = [ID, OTHER, "constructor", "--no-config"][random(4)]
    if (random(3) > 0) entry.title = values[values.length - 1 - random(10)]
    var results = [Track.fromFlatEntry(entry), Track.fromStored(entry), Track.fromUi(entry)]
    results.forEach(function(track, n) {
      if (track === null) return
      made++
      assertTrack(track, "entry " + i + " reader " + n)
    })
    var listed = Track.listFromPlaylistJson(list([entry, entry]), 20)
    assert.strictEqual(listed.ok, true)
    assert.ok(listed.tracks.length <= 1)
  }
  assert.ok(made > 1000, "only " + made + " tracks were made")
})

test("no function throws, whatever it is given", function() {
  var throwing = {}
  KEYS.forEach(function(key) {
    Object.defineProperty(throwing, key, { enumerable: true, get: function() { throw new Error("getter") } })
  })
  var revoked = Proxy.revocable({}, {})
  revoked.revoke()
  var trap = new Proxy({}, {
    get: function() { throw new Error("trap") },
    getOwnPropertyDescriptor: function() { throw new Error("trap") }
  })
  var odd = [
    undefined, null, 0, 1, NaN, "", "x", true, [], {}, Object.create(null), function() {}, Symbol("s"),
    new Date(0), /x/, new Map(), 10n, { id: Object.create(null), title: Object.create(null) },
    { id: ID, title: { toString: function() { throw new Error("toString") } } }, throwing, trap, revoked.proxy
  ]
  odd.forEach(function(value, i) {
    assert.doesNotThrow(function() {
      Track.fromFlatEntry(value)
      Track.fromStored(value)
      Track.fromUi(value)
      Track.listFromPlaylistJson(value, value)
      Track.listFromPlaylistJson(list([flat()]), value)
      Track.fromInfoJson(value, value)
      Track.fromInfoJson(ascii(info()), value)
    }, "value " + i)
  })
  // A row whose members cannot be read is simply not a track.
  assert.strictEqual(Track.fromUi(throwing), null)
  assert.strictEqual(Track.fromUi(trap), null)
  assert.strictEqual(Track.fromUi(revoked.proxy), null)
})

test("no input makes the readers slow", function() {
  var size = 1 << 20
  var hostile = [
    "[".repeat(size), "{\"a\":".repeat(size / 8), "\"".repeat(size), "\\".repeat(size),
    "[" + "0,".repeat(size / 2),
    "{\"_type\":\"playlist\",\"entries\":[" + "[".repeat(5000) + "]".repeat(5000) + "]}",
    list(new Array(50000).fill(null)), " ".repeat(size), "\n".repeat(size), "9".repeat(size),
    ascii(info({ requested_formats: [{ vcodec: "vp9", url: "https://" + "a.".repeat(size / 2) }] })),
    ascii(info({ requested_formats: [{ vcodec: "vp9", url: "https://a" + ".googlevideo.com".repeat(40000) }]
    })),
    ascii(info({ title: "\u202e".repeat(100000), channel: " ".repeat(100000) })),
    list([flat({ title: " #".repeat(100000), channel: "\ud83d".repeat(100000) })])
  ]
  hostile.forEach(function(text, i) {
    var ms = elapsedMs(function() {
      Track.listFromPlaylistJson(text, 20)
      Track.fromInfoJson(text, ID)
    })
    assert.ok(ms < 2000, "input " + i + " took " + Math.round(ms) + " ms")
  })
})
