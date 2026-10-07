"use strict"
// Tests for lib/StateFile.js, the format of state.json. The input and
// expectation rows live in tests/vectors/statefile.js and run in both
// engines; this file holds what a table cannot say: that every state the
// reader lets through is valid whatever the file held, that what is written
// is one line of printable ASCII that reads back as the same state, that
// the largest possible state fits under the read cap, and that with history
// off nothing about what was played is in the text.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var StateFile = load.lib("StateFile")
var Const = load.lib("Const")
var Clean = load.lib("Clean")

var REPO = path.join(__dirname, "..", "..")
var STATE_KEYS = [
  "volume", "muted", "proxyAck", "prefs", "recents", "queue", "video", "shortcuts", "outputDevice"
]
var MIRRORED = ["rememberHistory", "preload", "autoplay"]
var CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"]
var PRINTABLE = /^[\x20-\x7e]*$/

var A = { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false }
var B = { id: "BBBBBBBBBBB", title: "B title", channel: "B channel", duration: null, live: true }

function item(track, auto) {
  return Object.assign({}, track, { auto: auto })
}

// A state with something in every key.
function rich() {
  return StateFile.withChanges(StateFile.defaults(), {
    volume: 55, muted: true, proxyAck: true,
    prefs: { rememberHistory: true, preload: false },
    recents: [A, B],
    queue: { items: [item(B, false), item(A, true), item(A, false)], index: 1 },
    video: {
      "DP-1": { corner: "bottom-right", widthPct: 25 }, constructor: { corner: "top-left", widthPct: 50 }
    },
    shortcuts: {
      panel: "SUPER + Y", video: "SUPER + CTRL + ALT + V", output: "", playPause: "SUPER + CTRL + ALT + K",
      next: "", previous: "", dirty: true, asked: true
    },
    outputDevice: "alsa/default"
  })
}

// A plain copy, so that states can be compared whatever their prototypes.
function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function assertTrack(track, keys, label) {
  assert.deepStrictEqual(Object.keys(track), keys, label)
  assert.match(track.id, /^[A-Za-z0-9_-]{11}$/, label)
  assert.strictEqual(typeof track.title, "string", label)
  assert.ok(track.title.length <= Const.LIMITS.titleChars, label)
  assert.strictEqual(Clean.text(track.title, Const.LIMITS.titleChars), track.title, label)
  assert.strictEqual(typeof track.channel, "string", label)
  assert.ok(track.channel.length <= Const.LIMITS.channelChars, label)
  assert.strictEqual(Clean.text(track.channel, Const.LIMITS.channelChars), track.channel, label)
  if (track.duration !== null) {
    assert.ok(Number.isInteger(track.duration), label)
    assert.ok(track.duration >= 0 && track.duration <= Const.LIMITS.durationSeconds, label)
  }
  assert.strictEqual(typeof track.live, "boolean", label)
  if (track.duration === null) assert.strictEqual(track.live, true, label)
}

// Everything the rest of the service relies on about a state, checked
// without any help from the module under test.
function assertValid(state, label) {
  assert.deepStrictEqual(Object.keys(state), STATE_KEYS, label)
  assert.ok(Number.isInteger(state.volume) && state.volume >= 0 && state.volume <= 100, label)
  assert.strictEqual(typeof state.muted, "boolean", label)
  assert.strictEqual(typeof state.proxyAck, "boolean", label)

  assert.strictEqual(Object.getPrototypeOf(state.prefs), null, label)
  Object.keys(state.prefs).forEach(function(key) {
    assert.ok(MIRRORED.indexOf(key) !== -1, label)
    assert.strictEqual(typeof state.prefs[key], "boolean", label)
  })

  assert.ok(Array.isArray(state.recents) && state.recents.length <= Const.LIMITS.recents, label)
  var ids = state.recents.map(function(track) { return track.id })
  assert.strictEqual(new Set(ids).size, ids.length, label)
  state.recents.forEach(function(track) {
    assertTrack(track, ["id", "title", "channel", "duration", "live"], label)
  })

  assert.deepStrictEqual(Object.keys(state.queue), ["items", "index"], label)
  var items = state.queue.items
  assert.ok(Array.isArray(items) && items.length <= Const.LIMITS.queueItems, label)
  items.forEach(function(track) {
    assertTrack(track, ["id", "title", "channel", "duration", "live", "auto"], label)
    assert.strictEqual(typeof track.auto, "boolean", label)
  })
  var index = state.queue.index
  assert.ok(Number.isInteger(index) && index >= -1 && index < Math.max(items.length, 0), label)
  assert.ok(!Object.is(index, -0), label)

  assert.strictEqual(Object.getPrototypeOf(state.video), null, label)
  var monitors = Object.keys(state.video)
  assert.ok(monitors.length <= 8, label)
  monitors.forEach(function(name) {
    assert.match(name, /^[A-Za-z0-9_-]{1,32}$/, label)
    var place = state.video[name]
    assert.deepStrictEqual(Object.keys(place), ["corner", "widthPct"], label)
    assert.ok(CORNERS.indexOf(place.corner) !== -1, label)
    assert.ok(Number.isInteger(place.widthPct) && place.widthPct >= 10 && place.widthPct <= 90, label)
  })

  var combos = ["panel", "video", "output", "playPause", "next", "previous"]
  assert.deepStrictEqual(Object.keys(state.shortcuts), combos.concat(["dirty", "asked"]), label)
  combos.forEach(function(action) {
    assert.strictEqual(typeof state.shortcuts[action], "string", label)
    assert.ok(state.shortcuts[action].length <= 64, label)
  })
  assert.strictEqual(typeof state.shortcuts.dirty, "boolean", label)
  assert.strictEqual(typeof state.shortcuts.asked, "boolean", label)

  assert.strictEqual(typeof state.outputDevice, "string", label)
  assert.ok(state.outputDevice.length <= 256, label)
  assert.ok(!/[\u0000-\u001f\u007f]/.test(state.outputDevice), label)
}

// The top-level keys of a written file.
function writtenKeys(text) {
  return Object.keys(JSON.parse(text))
}

// A small repeatable source of numbers, so that a failure can be run again.
function generator(seed) {
  var value = seed
  return function(below) {
    value = (value * 1103515245 + 12345) % 2147483648
    return value % below
  }
}

// lib/StateFile.js with other limits in the Const it imports, loaded the
// way load.js loads it.
function withLimits(limits) {
  var names = []
  var files = []
  var source = fs.readFileSync(path.join(REPO, "lib", "StateFile.js"), "utf8")
  var body = source.split("\n").map(function(line) {
    var found = /^\.import "([A-Za-z0-9]+)\.js" as ([A-Z][A-Za-z0-9]*)\s*$/.exec(line)
    if (found) {
      files.push(found[1])
      names.push(found[2])
      return ""
    }
    return /^\.pragma library\s*$/.test(line) ? "" : line
  }).join("\n")
  var deps = files.map(function(file) {
    if (file !== "Const") return load.lib(file)
    return Object.assign({}, Const, { LIMITS: Object.assign({}, Const.LIMITS, limits) })
  })
  assert.ok(files.indexOf("Const") !== -1)
  var mod = { exports: {} }
  new Function(names.concat(["module"]).join(","), body).apply(null, deps.concat([mod]))
  return mod.exports
}

// The largest state there can be: full lists, every text at its full length
// in characters that take six bytes each once escaped.
function largest() {
  var wide = "\u4e00"
  var track = function(n) {
    return {
      id: "ZZZZZZZ" + String(10000 + n).slice(1), title: wide.repeat(Const.LIMITS.titleChars),
      channel: wide.repeat(Const.LIMITS.channelChars), duration: Const.LIMITS.durationSeconds, live: false
    }
  }
  var recents = []
  var items = []
  var video = {}
  var i
  for (i = 0; i < Const.LIMITS.recents; i++) recents.push(track(i))
  for (i = 0; i < Const.LIMITS.queueItems; i++) items.push(item(track(1000 + i), false))
  for (i = 0; i < 8; i++) video["M".repeat(31) + i] = { corner: "bottom-right", widthPct: 90 }
  return StateFile.withChanges(StateFile.defaults(), {
    volume: 100, prefs: { rememberHistory: false, preload: false, autoplay: false },
    recents: recents, queue: { items: items, index: items.length - 1 }, video: video,
    shortcuts: {
      panel: wide.repeat(64), video: wide.repeat(64), output: wide.repeat(64), playPause: wide.repeat(64),
      next: wide.repeat(64), previous: wide.repeat(64), dirty: false, asked: false
    },
    outputDevice: wide.repeat(256)
  })
}

test("the module exports the reader, the writer and the two ways to make a state", function() {
  assert.deepStrictEqual(Object.keys(StateFile).sort(), ["defaults", "parse", "serialize", "withChanges"])
})

test("the defaults are a complete, valid and fresh state", function() {
  var state = StateFile.defaults()
  assertValid(state, "defaults")
  assert.deepStrictEqual(plain(state), {
    volume: 70, muted: false, proxyAck: false, prefs: {}, recents: [], queue: { items: [], index: -1 },
    video: {},
    shortcuts: {
      panel: "", video: "", output: "", playPause: "", next: "", previous: "", dirty: false, asked: false
    },
    outputDevice: ""
  })
  state.recents.push(A)
  state.prefs.rememberHistory = false
  state.queue.items.push(A)
  assert.deepStrictEqual(plain(StateFile.defaults()), plain(StateFile.parse("{\"version\":1}").state))
  assert.strictEqual(StateFile.defaults().recents.length, 0)
})

test("a state is written and read back unchanged", function() {
  var state = rich()
  assertValid(state, "rich")
  var text = StateFile.serialize(state, true)
  var read = StateFile.parse(text + "\n")
  assert.strictEqual(read.ok, true)
  assertValid(read.state, "read back")
  assert.deepStrictEqual(plain(read.state), plain(state))
  // Writing what was read gives the same text again.
  assert.strictEqual(StateFile.serialize(read.state, true), text)
  assert.deepStrictEqual(writtenKeys(text), [
    "version", "volume", "muted", "proxyAck", "prefs", "recents", "queue", "video", "shortcuts",
    "outputDevice"
  ])
})

test("the text is one line of printable ASCII, whatever the state holds", function() {
  // Shortcut texts are kept verbatim, so every UTF-16 unit can be put in
  // one, 64 at a time.
  for (var start = 0; start < 0x10000; start += 192) {
    var codes = []
    for (var code = start; code < start + 192 && code < 0x10000; code++) codes.push(code)
    var unit = function(from) { return String.fromCharCode.apply(null, codes.slice(from, from + 64)) }
    var state = StateFile.withChanges(StateFile.defaults(), {
      shortcuts: { panel: unit(0), video: unit(64), output: unit(128), dirty: false }
    })
    var text = StateFile.serialize(state, true)
    assert.match(text, PRINTABLE, "units from " + start)
    assert.strictEqual(Buffer.byteLength(text, "utf8"), text.length)
    var read = StateFile.parse(text)
    assert.strictEqual(read.ok, true, "units from " + start)
    assert.deepStrictEqual(read.state.shortcuts, state.shortcuts, "units from " + start)
  }
})

test("titles in any script are written as escapes and survive", function() {
  var titles = [
    "\u043f\u0440\u0438\u0432\u0435\u0442 \u043c\u0438\u0440", "\u4e16\u754c\u3053\u3093\u306b\u3061\u306f",
    "\ud83d\ude00 \ud83c\udfb5 emoji", "caf\u00e9 \u00fc\u00f1\u00ee", "\u05e9\u05dc\u05d5\u05dd",
    "a \"quoted\" \\ back/slash", "<img src=x> & 'more'", "\uffff\ufffd\u2603"
  ]
  var recents = titles.map(function(title, index) {
    return { id: "AAAAAAAAAA" + index, title: title, channel: title, duration: 10, live: false }
  })
  var state = StateFile.withChanges(StateFile.defaults(), { recents: recents })
  var text = StateFile.serialize(state, true)
  assert.match(text, PRINTABLE)
  titles.forEach(function(title) {
    if (/[^\x20-\x7e]/.test(title)) assert.ok(text.indexOf(title) === -1)
  })
  var read = StateFile.parse(text)
  assert.deepStrictEqual(read.state.recents.map(function(track) { return track.title }), titles)
  assert.deepStrictEqual(read.state.recents.map(function(track) { return track.channel }), titles)
})

test("no UTF-16 unit takes more than six bytes in the file", function() {
  var base = StateFile.serialize(StateFile.withChanges(StateFile.defaults(), {
    shortcuts: {
      panel: "", video: "", output: "", playPause: "", next: "", previous: "", dirty: true, asked: false
    }
  }), false).length
  for (var code = 0; code < 0x10000; code++) {
    var state = StateFile.withChanges(StateFile.defaults(), {
      shortcuts: {
        panel: String.fromCharCode(code), video: "", output: "", playPause: "", next: "", previous: "",
        dirty: true, asked: false
      }
    })
    var cost = StateFile.serialize(state, false).length - base
    assert.ok(cost >= 1 && cost <= 6, "U+" + code.toString(16) + " costs " + cost)
  }
})

test("the largest possible state fits under the read cap and survives", function() {
  var state = largest()
  assertValid(state, "largest")
  assert.strictEqual(state.recents.length + state.queue.items.length, 230)
  var text = StateFile.serialize(state, true)
  assert.match(text, PRINTABLE)
  var bytes = Buffer.byteLength(text + "\n", "utf8")
  assert.strictEqual(bytes, text.length + 1)
  assert.ok(bytes <= Const.LIMITS.stateBytes, bytes + " bytes")
  // It really is large: 230 tracks of 420 units at six bytes each.
  assert.ok(bytes > 230 * 420 * 6, bytes + " bytes")
  var read = StateFile.parse(text + "\n")
  assert.strictEqual(read.ok, true)
  assert.deepStrictEqual(plain(read.state), plain(state))
  assert.strictEqual(read.state.recents.length, Const.LIMITS.recents)
  assert.strictEqual(read.state.queue.items.length, Const.LIMITS.queueItems)
  read.state.recents.concat(read.state.queue.items).forEach(function(track) {
    assert.strictEqual(track.title, "\u4e00".repeat(300))
    assert.strictEqual(track.channel, "\u4e00".repeat(120))
  })
  // The vector table holds the same state, with its text spelled out by hand.
  var spelled = load.vectors("statefile").CASES.filter(function(c) {
    return c.fn === "serialize" && c.expect.length > 500000
  })
  assert.strictEqual(spelled.length, 1)
  assert.strictEqual(spelled[0].expect, text)
})

test("a state that would not fit loses the oldest recents first, then the end of the queue", function() {
  var tracks = function(count, prefix) {
    var list = []
    for (var i = 0; i < count; i++) {
      list.push({ id: prefix + String(1000 + i).slice(1), title: "t".repeat(50), channel: "", duration: 1,
        live: false })
    }
    return list
  }
  var state = StateFile.withChanges(StateFile.defaults(), {
    recents: tracks(10, "RRRRRRRR"), queue: { items: tracks(10, "QQQQQQQQ"), index: 9 }
  })
  var full = StateFile.serialize(state, true)
  // The length of the text when only so many recents and items are left.
  var cut = function(recents, items) {
    return StateFile.serialize(StateFile.withChanges(state, {
      recents: state.recents.slice(0, recents),
      queue: { items: state.queue.items.slice(0, items), index: Math.min(9, items - 1) }
    }), true).length
  }
  // Each row: a cap on the file in bytes, and what must be left under it.
  // The file is the text and one newline.
  var rows = [
    [full.length + 1, 10, 10], [full.length + 500, 10, 10], [full.length, 9, 10], [cut(9, 10) + 1, 9, 10],
    [cut(9, 10), 8, 10], [cut(1, 10) + 1, 1, 10], [cut(1, 10), 0, 10], [cut(0, 10) + 1, 0, 10],
    [cut(0, 10), 0, 9], [cut(0, 5) + 1, 0, 5], [cut(0, 1) + 1, 0, 1], [cut(0, 1), 0, 0],
    [cut(0, 0) + 1, 0, 0], [50, 0, 0], [1, 0, 0]
  ]
  rows.forEach(function(row) {
    var label = "cap " + row[0]
    var text = withLimits({ stateBytes: row[0] }).serialize(state, true)
    var read = StateFile.parse(text)
    assert.strictEqual(read.ok, true, label)
    assertValid(read.state, label)
    // What is left is the newest recents and the front of the queue, and
    // the queue is only touched once no recents are left.
    assert.deepStrictEqual(read.state.recents, state.recents.slice(0, row[1]), label)
    assert.deepStrictEqual(read.state.queue.items, state.queue.items.slice(0, row[2]), label)
    assert.strictEqual(read.state.queue.index, Math.min(9, row[2] - 1), label)
    // The index is right in the text itself, not only once it was read.
    assert.strictEqual(JSON.parse(text).queue.index, Math.min(9, row[2] - 1), label)
    if (row[1] + row[2] > 0) assert.ok(text.length + 1 <= row[0], label)
  })
  // The same limit bounds what is read.
  assert.strictEqual(withLimits({ stateBytes: full.length }).parse(full).ok, true)
  assert.strictEqual(withLimits({ stateBytes: full.length - 1 }).parse(full).ok, false)
})

test("without history the text holds no recents, no queue and no trace of a title", function() {
  var state = rich()
  var text = StateFile.serialize(state, false)
  assert.deepStrictEqual(writtenKeys(text), [
    "version", "volume", "muted", "proxyAck", "prefs", "video", "shortcuts", "outputDevice"
  ])
  var words = ["recents", "queue", "items", "AAAAAAAAAAA", "BBBBBBBBBBB", "A title", "B title", "A channel",
    "B channel", "duration", "auto"]
  words.forEach(function(word) { assert.ok(text.indexOf(word) === -1, word) })
  // Everything else is still there, and reads back with empty lists.
  var read = StateFile.parse(text)
  assert.strictEqual(read.ok, true)
  var expected = plain(state)
  expected.recents = []
  expected.queue = { items: [], index: -1 }
  assert.deepStrictEqual(plain(read.state), expected)
  // Only the answer true writes history.
  var others = [undefined, null, 0, 1, "true", "yes", {}, [], [true]]
  others.forEach(function(persist) {
    assert.strictEqual(StateFile.serialize(state, persist), text, String(persist))
  })
  assert.notStrictEqual(StateFile.serialize(state, true), text)
})

test("a file of a first start holds nothing but the basics", function() {
  var text = StateFile.serialize(StateFile.defaults(), true)
  assert.deepStrictEqual(writtenKeys(text),
    ["version", "volume", "muted", "proxyAck", "prefs", "recents", "queue"])
  assert.deepStrictEqual(writtenKeys(StateFile.serialize(StateFile.defaults(), false)),
    ["version", "volume", "muted", "proxyAck", "prefs"])
})

test("nothing but the documented keys is ever written", function() {
  var state = plain(rich())
  var extras = {
    searchQuery: "private words", feed: [A], url: "https://example.invalid/x", path: "/home/user/x",
    account: "someone", cookies: "x", playedAt: 1700000000, counts: { AAAAAAAAAAA: 9 }, version: 7
  }
  Object.assign(state, extras)
  state.recents = state.recents.map(function(track) { return Object.assign({}, track, extras, { key: 5 }) })
  state.queue.items = state.queue.items.map(function(track) {
    return Object.assign({ key: 9 }, track, extras)
  })
  Object.assign(state.queue, extras)
  Object.assign(state.shortcuts, extras)
  Object.assign(state.prefs, extras)
  state.video["DP-1"] = Object.assign({}, state.video["DP-1"], extras)
  var text = StateFile.serialize(state, true)
  assert.strictEqual(text, StateFile.serialize(rich(), true))
  Object.keys(extras).forEach(function(key) {
    if (key !== "version") assert.ok(text.indexOf("\"" + key + "\"") === -1, key)
  })
  assert.strictEqual(JSON.parse(text).version, 1)
  assert.ok(text.indexOf("private words") === -1)
})

test("prefs holds the mirrored choices as booleans, in a table without a prototype", function() {
  var read = StateFile.parse("{\"version\":1,\"prefs\":{\"rememberHistory\":false,\"preload\":\"false\","
    + "\"autoplay\":true,\"markWatched\":true,\"__proto__\":{\"preload\":false},\"constructor\":false}}")
  assert.strictEqual(read.ok, true)
  assert.strictEqual(Object.getPrototypeOf(read.state.prefs), null)
  assert.deepStrictEqual(Object.keys(read.state.prefs), ["rememberHistory", "autoplay"])
  assert.strictEqual(read.state.prefs.rememberHistory, false)
  assert.strictEqual(read.state.prefs.preload, undefined)
  assert.strictEqual(read.state.prefs.constructor, undefined)
  var text = StateFile.serialize(read.state, false)
  assert.ok(text.indexOf("\"prefs\":{\"rememberHistory\":false,\"autoplay\":true}") !== -1)
})

test("a monitor called constructor or __proto__ is just a key of the video table", function() {
  var read = StateFile.parse("{\"version\":1,\"video\":{"
    + "\"constructor\":{\"corner\":\"top-left\",\"widthPct\":20},"
    + "\"__proto__\":{\"corner\":\"top-right\",\"widthPct\":30},"
    + "\"hasOwnProperty\":{\"corner\":\"bottom-left\",\"widthPct\":40}}}")
  assert.strictEqual(read.ok, true)
  var video = read.state.video
  assert.strictEqual(Object.getPrototypeOf(video), null)
  assert.deepStrictEqual(Object.keys(video), ["constructor", "__proto__", "hasOwnProperty"])
  assert.deepStrictEqual(video.constructor, { corner: "top-left", widthPct: 20 })
  assert.deepStrictEqual(video["__proto__"], { corner: "top-right", widthPct: 30 })
  // A monitor that is not in the table is simply not there.
  var absent = ["toString", "valueOf", "DP-1", "isPrototypeOf"]
  absent.forEach(function(name) { assert.strictEqual(video[name], undefined, name) })
  assert.strictEqual({}.corner, undefined)
  // And the table goes through a write and a read as it is.
  var again = StateFile.parse(StateFile.serialize(read.state, false))
  assert.deepStrictEqual(Object.keys(again.state.video), ["constructor", "__proto__", "hasOwnProperty"])
  assert.strictEqual(Object.getPrototypeOf(again.state.video), null)
  assertValid(again.state, "video")
})

test("hostile shortcut texts survive only as inert strings", function() {
  var hostile = [
    "F1\") os.execute(\"x", "]] os.exit() --[[", "SUPER + Y\nhl.bind(\"x\")", "all", "constructor",
    "__proto__", "$(id)", "`id`", "; rm -rf ~", "--no-config", "K".repeat(64), "\u0000\u001b[31m", "a/b"
  ]
  hostile.forEach(function(text) {
    var file = JSON.stringify({
      version: 1, shortcuts: { panel: text, video: text, output: text, dirty: false }
    })
    var read = StateFile.parse(file.replace(/[^\x20-\x7e]/g, function(unit) {
      return "\\u" + ("0000" + unit.charCodeAt(0).toString(16)).slice(-4)
    }))
    assert.strictEqual(read.ok, true, text)
    assertValid(read.state, text)
    assert.deepStrictEqual(read.state.shortcuts, {
      panel: text, video: text, output: text, playPause: "", next: "", previous: "", dirty: false,
      asked: false
    })
    // Nothing else in the state was touched by it.
    var rest = plain(read.state)
    rest.shortcuts = plain(StateFile.defaults().shortcuts)
    assert.deepStrictEqual(rest, plain(StateFile.defaults()), text)
    var written = StateFile.serialize(read.state, true)
    assert.match(written, PRINTABLE, text)
    assert.deepStrictEqual(StateFile.parse(written).state.shortcuts, read.state.shortcuts, text)
  })
  // Too long, or not a string: gone.
  var gone = ["K".repeat(65), 5, null, ["SUPER + Y"], { combo: "SUPER + Y" }, true]
  gone.forEach(function(value) {
    var read = StateFile.parse(JSON.stringify({ version: 1, shortcuts: { panel: value } }))
    assert.strictEqual(read.state.shortcuts.panel, "", String(value))
  })
})

test("a wrong version resets, however good the rest looks", function() {
  var good = JSON.parse(StateFile.serialize(rich(), true))
  var versions = [0, 2, 1.5, -1, "1", null, true, [1], { n: 1 }]
  versions.forEach(function(version) {
    var text = JSON.stringify(Object.assign({}, good, { version: version }))
    assert.deepStrictEqual(StateFile.parse(text), { ok: false }, String(version))
  })
  delete good.version
  assert.deepStrictEqual(StateFile.parse(JSON.stringify(good)), { ok: false })
})

test("text that is not printable ASCII is refused unread", function() {
  var good = StateFile.serialize(rich(), true)
  assert.strictEqual(StateFile.parse(good).ok, true)
  assert.strictEqual(StateFile.parse(good + "\n").ok, true)
  // Any other unit anywhere in the text: refused. Sampled over the whole
  // range, and every one of the first 300.
  var position = good.indexOf("A title")
  for (var code = 0; code < 0x10000; code += code < 300 ? 1 : 97) {
    var allowed = code === 0x0a || (code >= 0x20 && code <= 0x7e)
    if (allowed) continue
    var unit = String.fromCharCode(code)
    var inside = good.slice(0, position) + unit + good.slice(position)
    assert.deepStrictEqual(StateFile.parse(inside), { ok: false }, "U+" + code.toString(16))
    assert.deepStrictEqual(StateFile.parse(good + unit), { ok: false }, "U+" + code.toString(16))
    assert.deepStrictEqual(StateFile.parse(unit + good), { ok: false }, "U+" + code.toString(16))
  }
  // What a damaged read looks like: the replacement character in a title.
  var damaged = good.replace("A title", "A t\ufffdtle")
  assert.deepStrictEqual(StateFile.parse(damaged), { ok: false })
})

test("whatever a file holds, the reader never throws and never lets an invalid state through", function() {
  var good = StateFile.serialize(rich(), true)
  var alphabet = "{}[]\",:\\ 0123456789.-+eEtruefalsn_AZaz\n" + "version" + "__proto__" + "constructor"
  var next = generator(20261006)
  var accepted = 0
  for (var round = 0; round < 4000; round++) {
    var text = good
    var edits = 1 + next(3)
    for (var e = 0; e < edits; e++) {
      var at = next(text.length + 1)
      var kind = next(4)
      if (kind === 0) text = text.slice(0, at) + text.slice(at + 1 + next(8))
      else if (kind === 1) text = text.slice(0, at) + alphabet[next(alphabet.length)] + text.slice(at)
      else if (kind === 2) text = text.slice(0, at) + alphabet[next(alphabet.length)] + text.slice(at + 1)
      else text = text.slice(0, at) + String(next(100000) - 50000) + text.slice(at + next(4))
    }
    var read
    assert.doesNotThrow(function() { read = StateFile.parse(text) }, "round " + round)
    if (read.ok !== true) {
      assert.deepStrictEqual(read, { ok: false }, "round " + round)
      continue
    }
    accepted++
    assert.deepStrictEqual(Object.keys(read), ["ok", "state"])
    assertValid(read.state, "round " + round)
    var written = StateFile.serialize(read.state, true)
    assert.match(written, PRINTABLE, "round " + round)
    assert.deepStrictEqual(plain(StateFile.parse(written).state), plain(read.state), "round " + round)
  }
  // The edits are small, so a good share of the files still parses: both
  // branches above were taken many times.
  assert.ok(accepted > 400 && accepted < 3600, accepted + " accepted")
  // Every prefix of a good file: never a throw, and only the whole file is one.
  for (var cut = 0; cut < good.length; cut++) {
    assert.deepStrictEqual(StateFile.parse(good.slice(0, cut)), { ok: false }, "cut " + cut)
  }
})

test("the queue index is a plain whole number, never a negative zero", function() {
  var read = StateFile.parse("{\"version\":1,\"queue\":{\"items\":[" + JSON.stringify(A) + "],\"index\":-0}}")
  assert.strictEqual(read.ok, true)
  assert.ok(Object.is(read.state.queue.index, 0))
  var changed = StateFile.withChanges(StateFile.defaults(), { queue: { items: [A], index: -0 } })
  assert.ok(Object.is(changed.queue.index, 0))
  assert.ok(Object.is(StateFile.withChanges(StateFile.defaults(), { volume: -0.4 }).volume, 0))
})

test("a number too large to hold never becomes part of a state", function() {
  // node reads 1e999 as Infinity. (Qt's JSON refuses the whole text, which
  // the vectors_store case checks; that is why this is not a vector.)
  var read = StateFile.parse("{\"version\":1,\"volume\":1e999,\"queue\":{\"items\":[],\"index\":1e999},"
    + "\"video\":{\"DP-1\":{\"corner\":\"top-left\",\"widthPct\":1e999}}}")
  assert.strictEqual(read.ok, true)
  assert.deepStrictEqual(plain(read.state), plain(StateFile.defaults()))
  var negative = StateFile.parse("{\"version\":1,\"volume\":-1e999}")
  assert.strictEqual(negative.state.volume, 70)
  assert.deepStrictEqual(StateFile.parse("{\"version\":1e999}"), { ok: false })
})

test("values of the wrong kind in a state object are never written", function() {
  var junk = [undefined, null, true, 5, -1, NaN, Infinity, "x", "__proto__", [], [5], {}, { length: 3 },
    function() {}, Object.create({ id: "AAAAAAAAAAA", title: "inherited" })]
  STATE_KEYS.forEach(function(key) {
    junk.forEach(function(value) {
      var state = plain(rich())
      state[key] = value
      var text
      assert.doesNotThrow(function() { text = StateFile.serialize(state, true) }, key)
      var read = StateFile.parse(text)
      assert.strictEqual(read.ok, true, key + " = " + String(value))
      assertValid(read.state, key + " = " + String(value))
      var changed
      assert.doesNotThrow(function() {
        var changes = {}
        changes[key] = value
        changed = StateFile.withChanges(rich(), changes)
      }, key)
      assertValid(changed, key + " = " + String(value))
    })
  })
})

test("a member that computes its value is never run", function() {
  var runs = 0
  var trap = function(target, keys) {
    keys.forEach(function(key) {
      Object.defineProperty(target, key, {
        enumerable: true,
        get: function() {
          runs++
          throw new Error("read")
        }
      })
    })
    return target
  }
  var trapped = trap({}, STATE_KEYS)
  assert.strictEqual(StateFile.serialize(trapped, true), StateFile.serialize(StateFile.defaults(), true))
  assert.strictEqual(StateFile.withChanges(StateFile.defaults(), trapped), null)
  var inside = {
    prefs: trap({}, MIRRORED), queue: trap({}, ["items", "index"]), video: { "DP-1": trap({}, ["corner"]) },
    shortcuts: trap({}, ["panel", "video", "output", "playPause", "next", "previous", "dirty", "asked"])
  }
  assert.deepStrictEqual(plain(StateFile.withChanges(StateFile.defaults(), inside)),
    plain(StateFile.defaults()))
  assert.strictEqual(runs, 0)
  // A track is read by lib/Track.js, which survives a member that throws.
  var track = trap({ id: "AAAAAAAAAAA" }, ["title"])
  assert.deepStrictEqual(StateFile.withChanges(StateFile.defaults(), { recents: [track, A] }).recents, [A])
})

test("hostile keys leave Object.prototype as it was", function() {
  var before = Object.getOwnPropertyNames(Object.prototype).sort()
  var payload = "{\"polluted\":true,\"volume\":1,\"muted\":true,\"rememberHistory\":false}"
  var text = "{\"version\":1,\"__proto__\":" + payload + ",\"prefs\":{\"__proto__\":" + payload + "},"
    + "\"video\":{\"__proto__\":" + payload + ",\"constructor\":{\"prototype\":" + payload + "}},"
    + "\"queue\":{\"__proto__\":" + payload + "},\"shortcuts\":{\"__proto__\":" + payload + "},"
    + "\"recents\":[{\"__proto__\":" + payload + "}],\"constructor\":{\"prototype\":" + payload + "}}"
  var read = StateFile.parse(text)
  assert.strictEqual(read.ok, true)
  assert.deepStrictEqual(plain(read.state), plain(StateFile.defaults()))
  StateFile.serialize(JSON.parse(text), true)
  StateFile.withChanges(JSON.parse(text), JSON.parse(text))
  assert.strictEqual({}.polluted, undefined)
  assert.strictEqual({}.volume, undefined)
  assert.strictEqual({}.rememberHistory, undefined)
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before)
})

test("a change replaces whole keys and leaves the others the very same objects", function() {
  var state = rich()
  var next = StateFile.withChanges(state, { volume: 10 })
  assert.notStrictEqual(next, state)
  assert.strictEqual(next.volume, 10)
  assert.strictEqual(state.volume, 55)
  var kept = ["prefs", "recents", "queue", "video", "shortcuts"]
  kept.forEach(function(key) { assert.strictEqual(next[key], state[key], key) })
  // A key that is named is always a new, validated value, even when it
  // means the same.
  var same = StateFile.withChanges(state, { prefs: state.prefs, recents: state.recents })
  assert.notStrictEqual(same.prefs, state.prefs)
  assert.notStrictEqual(same.recents, state.recents)
  assert.deepStrictEqual(plain(same), plain(state))
  assert.strictEqual(same.queue, state.queue)
  // What was handed in is not kept: later changes to it change nothing.
  var recents = [Object.assign({}, A)]
  var taken = StateFile.withChanges(state, { recents: recents })
  recents[0].title = "changed afterwards"
  recents.push(B)
  assert.deepStrictEqual(taken.recents, [A])
  assert.strictEqual(StateFile.withChanges(state, {}), null)
  assert.strictEqual(StateFile.withChanges(state, { nonsense: 1, version: 2 }), null)
})

test("the caps hold on the way in, whatever is handed over", function() {
  var many = []
  for (var i = 0; i < 5000; i++) many.push({ id: "AAAAAA" + String(100000 + i).slice(1), title: "t" + i })
  var video = {}
  for (var m = 0; m < 100; m++) video["M" + m] = { corner: "top-left", widthPct: 50 }
  var state = StateFile.withChanges(StateFile.defaults(), {
    recents: many, queue: { items: many, index: 4999 }, video: video,
    shortcuts: { panel: "K".repeat(65), video: "K".repeat(64) }, outputDevice: "d".repeat(257)
  })
  assertValid(state, "caps")
  assert.strictEqual(state.recents.length, Const.LIMITS.recents)
  assert.strictEqual(state.queue.items.length, Const.LIMITS.queueItems)
  assert.strictEqual(state.queue.index, Const.LIMITS.queueItems - 1)
  assert.strictEqual(Object.keys(state.video).length, 8)
  assert.deepStrictEqual(state.shortcuts, {
    panel: "", video: "K".repeat(64), output: "", playPause: "", next: "", previous: "", dirty: false,
    asked: false
  })
  assert.strictEqual(state.outputDevice, "")
  assert.strictEqual(state.recents[29].title, "t29")
  assert.strictEqual(state.queue.items[199].title, "t199")
})
