"use strict"
// Tests for lib/Devices.js: the vector table (also run inside Qt's engine),
// and what a table cannot state: that a device name comes back exactly as
// it went in or not at all, that a label is clean whatever the device calls
// itself, that every answer names an entry of the list it was given, that
// a list nobody filtered is read by the same rules as one that was, and
// that no report from mpv, however large or odd, costs more than a moment.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Devices = load.lib("Devices")
var Clean = load.lib("Clean")
var table = load.vectors("devices")

// The limits the module documents: entries of a report that are looked at,
// entries kept, label length in UTF-16 units, node name length.
var SCAN = 256
var MAX = 64
var LABEL_CHARS = 80
var NODE_CHARS = 200

var NODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:+-"

// What a label must never contain, as ranges of UTF-16 units: controls,
// the soft hyphen, bidi and zero-width marks, line separators, the byte
// order mark, the interlinear annotation marks.
var BANNED = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x200b, 0x200f], [0x2028, 0x202e],
  [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]
]

// The pieces hostile descriptions are made of.
var TEXT_ALPHABET = [
  "a", "b", "Z", "9", "\u00e9", "\u65e5", " ", " ", "\t", "\n", "\r", "\u00a0", "\u3000", "\u2028", "\u0000",
  "\u001b", "\u007f", "\u0085", "\u00ad", "\u200b", "\u200d", "\u202e", "\u2066", "\ufeff", "\ufffa",
  "\ud83d", "\ude00", "\ud83d\ude00", "#", "<", ">", "&", "/", "\\", "\"", "'", "-", "."
]

// Values no caller should pass, and which must not make anything throw.
var bare = Object.create(null)
var refuse = function() { throw new Error("no") }
var hostile = { toString: refuse, valueOf: refuse }
// Reading a key from this one throws. It carries no key of its own, so
// nothing should ever be read from it.
var trap = new Proxy({}, { get: refuse })
var ODD = [
  undefined, null, 0, 1, -1, NaN, Infinity, true, false, "", "auto", "pipewire/sink", "constructor",
  "__proto__", [], [null], [[]], ["auto"], {}, { length: 3 }, { name: 42 }, bare, hostile, trap,
  function() {}, Symbol("auto"), new String("auto")
]

function inRanges(ranges, code) {
  return ranges.some(function(range) { return code >= range[0] && code <= range[1] })
}

function hasBanned(string) {
  for (var i = 0; i < string.length; i++) {
    if (inRanges(BANNED, string.charCodeAt(i))) return true
  }
  return false
}

function hasLoneSurrogate(string) {
  return /[\ud800-\udfff]/.test(string.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""))
}

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

function randomFrom(random, alphabet, length) {
  var string = ""
  for (var i = 0; i < length; i++) string += alphabet[random(alphabet.length)]
  return string
}

function randomSink(random) {
  return "pipewire/" + randomFrom(random, NODE_ALPHABET, 1 + random(NODE_CHARS))
}

function sink(number) {
  return { name: "pipewire/sink-" + number, description: "Sink " + number }
}

function names(outputs) {
  return outputs.map(function(output) { return output.name })
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

// ---- A second statement of how a list of outputs is read ----

// A device name, decided one character at a time.
function isDeviceName(name) {
  if (typeof name !== "string") return false
  if (name === "auto") return true
  if (name.slice(0, 9) !== "pipewire/") return false
  var node = name.slice(9)
  if (node.length < 1 || node.length > NODE_CHARS) return false
  for (var i = 0; i < node.length; i++) {
    if (NODE_ALPHABET.indexOf(node.charAt(i)) === -1) return false
  }
  return true
}

// The names a list offers: those of its first 64 entries that are device
// names, each one once, in the order they first appear.
function listedNames(list) {
  var found = []
  if (!Array.isArray(list)) return found
  list.slice(0, MAX).forEach(function(entry) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return
    if (!Object.prototype.hasOwnProperty.call(entry, "name") || !isDeviceName(entry.name)) return
    if (found.indexOf(entry.name) === -1) found.push(entry.name)
  })
  return found
}

function expectedNext(found, current) {
  if (found.length === 0) return ""
  var index = found.indexOf(current)
  if (index === -1) return found[0]
  return found.length === 1 ? "" : found[(index + 1) % found.length]
}

function expectedPlan(found, saved, active) {
  if (found.length === 0) return { device: "", send: false, fallback: false }
  var wanted = typeof saved === "string" && saved !== "" ? saved : "auto"
  var device = wanted === "auto" || found.indexOf(wanted) !== -1 ? wanted : "auto"
  return { device: device, send: active !== device, fallback: device !== wanted }
}

// A list as filter() would never make it: names that repeat, entries that
// are no outputs, labels nobody cleaned.
function randomList(random) {
  var pool = ["auto", "auto", "pipewire/a", "pipewire/b", "pipewire/c", "pipewire/d", "pipewire", "pulse/a",
    "pipewire/a ", "", "constructor", "__proto__", null, 7]
  var list = []
  var size = random(10) === 0 ? 60 + random(20) : random(9)
  for (var i = 0; i < size; i++) {
    var kind = random(14)
    if (kind === 0) list.push(null)
    else if (kind === 1) list.push(["auto"])
    else if (kind === 2) list.push("pipewire/a")
    else if (kind === 3) list.push({ label: "No name" })
    else if (kind === 4) list.push({ name: "pipewire/n" + random(70), label: "Sink" })
    else list.push({ name: pool[random(pool.length)], label: randomFrom(random, TEXT_ALPHABET, random(120)) })
  }
  return list
}

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(Devices).sort(), ["AUTO", "filter", "has", "mark", "next", "plan"])
  assert.strictEqual(Devices.AUTO, "auto")
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Devices, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Devices).forEach(function(name) {
    if (typeof Devices[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("a sink name comes back as the very same text", function() {
  var random = makeRandom(1)
  for (var i = 0; i < 2000; i++) {
    var name = randomSink(random)
    var outputs = Devices.filter([{ name: name, description: "Sink" }])
    assert.deepStrictEqual(outputs, [{ name: name, label: "Sink" }])
    assert.strictEqual(Devices.has(outputs, name), true, name)
    assert.strictEqual(Devices.next(outputs, "auto"), name)
    assert.strictEqual(Devices.mark(outputs, name)[0].name, name)
    assert.strictEqual(Devices.mark(outputs, name)[0].current, true)
    assert.deepStrictEqual(Devices.plan(outputs, name, "auto"), { device: name, send: true, fallback: false })
  }
})

test("a node name holds letters, digits and five punctuation marks, and no other unit", function() {
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var allowed = NODE_ALPHABET.indexOf(ch) !== -1
    var candidates = ["pipewire/" + ch, "pipewire/a" + ch + "b", "pipewire/ab" + ch]
    candidates.forEach(function(name) {
      var outputs = Devices.filter([{ name: name, description: "Sink" }])
      assert.deepStrictEqual(names(outputs), allowed ? [name] : [], code.toString(16))
    })
    // Nothing may stand in front of the backend or behind the name.
    assert.deepStrictEqual(Devices.filter([{ name: ch + "pipewire/sink", description: "Sink" }]), [])
    assert.deepStrictEqual(Devices.filter([{ name: ch + "auto", description: "Sink" }]), [])
    assert.deepStrictEqual(Devices.filter([{ name: "auto" + ch, description: "Sink" }]), [])
  }
})

test("a node name is one to two hundred characters long", function() {
  var lengths = [0, 1, 2, NODE_CHARS - 1, NODE_CHARS, NODE_CHARS + 1, 1000, 300000]
  lengths.forEach(function(length) {
    var name = "pipewire/" + "n".repeat(length)
    var expected = length >= 1 && length <= NODE_CHARS ? [name] : []
    var outputs = Devices.filter([{ name: name, description: "Sink" }])
    assert.deepStrictEqual(names(outputs), expected, String(length))
  })
})

test("a label is clean, bounded and never empty, whatever the device calls itself", function() {
  var random = makeRandom(2)
  for (var i = 0; i < 4000; i++) {
    var description = randomFrom(random, TEXT_ALPHABET, random(160))
    var outputs = Devices.filter([{ name: "pipewire/node.name", description: description }])
    var label = outputs[0].label
    var text = JSON.stringify(description)
    assert.strictEqual(outputs.length, 1, text)
    assert.ok(label.length >= 1 && label.length <= LABEL_CHARS, text)
    assert.strictEqual(hasBanned(label), false, text)
    assert.strictEqual(hasLoneSurrogate(label), false, text)
    assert.strictEqual(/ {2}|^ | $/.test(label), false, text)
    var cleaned = Clean.text(description, LABEL_CHARS)
    assert.strictEqual(label, cleaned === "" ? "node.name" : cleaned, text)
  }
})

test("a label taken from the node name is cut like any other", function() {
  for (var length = 1; length <= NODE_CHARS; length++) {
    var node = randomFrom(makeRandom(length), NODE_ALPHABET, length)
    var outputs = Devices.filter([{ name: "pipewire/" + node }])
    assert.strictEqual(outputs[0].name, "pipewire/" + node)
    assert.strictEqual(outputs[0].label, node.slice(0, LABEL_CHARS))
  }
})

test("the result is made of fresh objects with exactly the documented keys", function() {
  var report = [
    { name: "auto", description: "Autoselect device", extra: 1 },
    { name: "pipewire/sink-1", description: "Sink 1", label: "Planted", current: true, volume: 100 }
  ]
  var before = JSON.stringify(report)
  var outputs = Devices.filter(report)
  assert.deepStrictEqual(outputs, [
    { name: "auto", label: "System default" },
    { name: "pipewire/sink-1", label: "Sink 1" }
  ])
  outputs.forEach(function(output) {
    assert.strictEqual(report.indexOf(output), -1)
    assert.strictEqual(Object.getPrototypeOf(output), Object.prototype)
  })
  var marked = Devices.mark(outputs, "auto")
  assert.deepStrictEqual(Object.keys(marked[1]), ["name", "label", "current"])
  marked.forEach(function(output) { assert.strictEqual(outputs.indexOf(output), -1) })
  // Changing what came back changes neither the input nor a later answer.
  marked[0].name = "changed"
  outputs[1].label = "changed"
  outputs.push({ name: "pipewire/added", label: "Added" })
  assert.strictEqual(JSON.stringify(report), before)
  assert.deepStrictEqual(names(Devices.filter(report)), ["auto", "pipewire/sink-1"])
  assert.strictEqual(Devices.filter(report)[1].label, "Sink 1")
})

test("frozen input is read without complaint", function() {
  var report = Object.freeze([
    Object.freeze({ name: "auto", description: "Autoselect device" }),
    Object.freeze({ name: "pipewire/sink-1", description: "Sink 1" })
  ])
  var outputs = Object.freeze(Devices.filter(report).map(Object.freeze))
  assert.strictEqual(outputs.length, 2)
  assert.strictEqual(Devices.mark(outputs, "auto").length, 2)
  assert.strictEqual(Devices.has(outputs, "pipewire/sink-1"), true)
  assert.strictEqual(Devices.next(outputs, "auto"), "pipewire/sink-1")
  assert.strictEqual(Devices.plan(outputs, "pipewire/sink-1", "auto").send, true)
})

test("only what an entry itself carries is read", function() {
  var inherited = Object.create({ name: "pipewire/sink-1", description: "Inherited" })
  var half = Object.create({ description: "Inherited description" })
  half.name = "pipewire/sink-2"
  // A key spelled __proto__ in mpv's JSON is an ordinary key of that name.
  var planted = JSON.parse("{\"__proto__\":{\"name\":\"pipewire/sink-3\",\"description\":\"Planted\"}}")
  var outputs = Devices.filter([inherited, half, planted])
  assert.deepStrictEqual(outputs, [{ name: "pipewire/sink-2", label: "sink-2" }])
  var listed = Object.create({ name: "auto", label: "Inherited" })
  assert.deepStrictEqual(Devices.mark([listed], "auto"), [])
  var labelled = Object.create({ label: "Inherited label" })
  labelled.name = "pipewire/sink-4"
  assert.deepStrictEqual(Devices.mark([labelled], ""), [
    { name: "pipewire/sink-4", label: "sink-4", current: false }
  ])
  assert.strictEqual(Devices.has([listed], "auto"), false)
  assert.strictEqual(Devices.next([listed], ""), "")
  assert.strictEqual(({}).name, undefined)
  assert.strictEqual(({}).description, undefined)
})

test("an entry that answers with code instead of data is read once and safely", function() {
  var reads = 0
  var entry = {}
  Object.defineProperty(entry, "name", {
    enumerable: true,
    get: function() { reads++; return reads === 1 ? "pipewire/sink-1" : "pulse/other" }
  })
  Object.defineProperty(entry, "description", { enumerable: true, get: function() { return "Sink 1" } })
  var outputs = Devices.filter([entry])
  // The name that was tested is the name that was kept.
  assert.deepStrictEqual(outputs, [{ name: "pipewire/sink-1", label: "Sink 1" }])
  assert.strictEqual(reads, 1)
})

test("the list holds at most 64 entries, one of them kept for the system default", function() {
  var sinks = []
  for (var i = 1; i <= 100; i++) sinks.push(sink(i))
  var auto = { name: "auto", description: "Autoselect device" }
  var withAuto = Devices.filter([auto].concat(sinks))
  assert.strictEqual(withAuto.length, MAX)
  assert.strictEqual(withAuto[0].name, "auto")
  assert.strictEqual(withAuto[MAX - 1].name, "pipewire/sink-" + (MAX - 1))
  // The same sinks whether the system default is listed first, last or not at all.
  var autoLast = Devices.filter(sinks.concat([auto]))
  assert.deepStrictEqual(autoLast, withAuto)
  var withoutAuto = Devices.filter(sinks)
  assert.deepStrictEqual(withoutAuto, withAuto.slice(1))
  // The other functions accept no longer list either.
  var long = []
  for (var j = 1; j <= 100; j++) long.push({ name: "pipewire/sink-" + j, label: "Sink " + j })
  assert.strictEqual(Devices.mark(long, "").length, MAX)
  assert.strictEqual(Devices.has(long, "pipewire/sink-" + MAX), true)
  assert.strictEqual(Devices.has(long, "pipewire/sink-" + (MAX + 1)), false)
  assert.strictEqual(Devices.next(long, "pipewire/sink-" + MAX), "pipewire/sink-1")
})

test("only the first 256 entries of a report are looked at", function() {
  var report = []
  for (var i = 0; i < SCAN - 1; i++) report.push({ name: "alsa/device-" + i, description: "Other backend" })
  report.push(sink(1))
  report.push(sink(2))
  report.push({ name: "auto", description: "Autoselect device" })
  assert.deepStrictEqual(names(Devices.filter(report)), ["pipewire/sink-1"])
})

test("each name is listed once, with the description it had first", function() {
  var report = []
  for (var i = 0; i < 20; i++) {
    report.push({ name: "pipewire/sink-" + (i % 3), description: "Sink " + i })
    report.push({ name: "auto", description: "Auto " + i })
  }
  assert.deepStrictEqual(Devices.filter(report), [
    { name: "auto", label: "System default" },
    { name: "pipewire/sink-0", label: "Sink 0" },
    { name: "pipewire/sink-1", label: "Sink 1" },
    { name: "pipewire/sink-2", label: "Sink 2" }
  ])
})

test("cycling from any entry visits every entry once and comes back", function() {
  var random = makeRandom(3)
  for (var round = 0; round < 200; round++) {
    var report = random(2) === 0 ? [{ name: "auto", description: "Autoselect device" }] : []
    var count = random(12)
    for (var i = 0; i < count; i++) report.push({ name: randomSink(random), description: "Sink " + i })
    var outputs = Devices.filter(report)
    if (outputs.length < 2) {
      assert.strictEqual(Devices.next(outputs, outputs.length === 1 ? outputs[0].name : "auto"), "")
      continue
    }
    var start = outputs[random(outputs.length)].name
    var seen = [start]
    var current = Devices.next(outputs, start)
    while (current !== start) {
      assert.strictEqual(Devices.has(outputs, current), true)
      assert.strictEqual(seen.indexOf(current), -1)
      seen.push(current)
      assert.ok(seen.length <= outputs.length)
      current = Devices.next(outputs, current)
    }
    assert.deepStrictEqual(seen.slice().sort(), names(outputs).sort())
  }
})

test("every answer names an entry of the list, or the system default", function() {
  var random = makeRandom(4)
  var pool = ["auto", "", "pipewire", "pulse/sink", "constructor", null, undefined, 42]
  for (var i = 0; i < 12; i++) pool.push("pipewire/sink-" + i)
  for (var round = 0; round < 3000; round++) {
    var report = []
    var count = random(8)
    for (var j = 0; j < count; j++) {
      var name = pool[random(pool.length)]
      report.push({ name: name, description: "Entry " + j })
    }
    var outputs = Devices.filter(report)
    var saved = pool[random(pool.length)]
    var active = pool[random(pool.length)]
    var listed = names(outputs)

    var following = Devices.next(outputs, active)
    assert.ok(following === "" || listed.indexOf(following) !== -1)

    var marked = Devices.mark(outputs, active)
    assert.deepStrictEqual(names(marked), listed)
    assert.ok(marked.filter(function(output) { return output.current }).length <= 1)

    var plan = Devices.plan(outputs, saved, active)
    assert.deepStrictEqual(Object.keys(plan), ["device", "send", "fallback"])
    if (outputs.length === 0) {
      assert.deepStrictEqual(plan, { device: "", send: false, fallback: false })
      continue
    }
    assert.ok(plan.device === "auto" || listed.indexOf(plan.device) !== -1)
    assert.strictEqual(plan.send, active !== plan.device)
    if (plan.fallback) assert.strictEqual(plan.device, "auto")
    // Once mpv uses what the plan names, there is nothing left to send.
    assert.strictEqual(Devices.plan(outputs, saved, plan.device).send, false)
    assert.strictEqual(Devices.plan(outputs, saved, plan.device).device, plan.device)
  }
})

test("a list nobody filtered is read by the same rules as one that was", function() {
  var random = makeRandom(5)
  var asked = ["auto", "pipewire/a", "pipewire/b", "pipewire/c", "pipewire/n3", "pipewire", "", null, 7]
  var repeats = 0
  for (var round = 0; round < 4000; round++) {
    var list = randomList(random)
    var found = listedNames(list)
    var text = JSON.stringify(list)
    if (found.length < list.length) repeats++
    var current = asked[random(asked.length)]
    var saved = asked[random(asked.length)]

    var marked = Devices.mark(list, current)
    assert.deepStrictEqual(names(marked), found, text)
    marked.forEach(function(output) {
      assert.deepStrictEqual(Object.keys(output), ["name", "label", "current"], text)
      assert.strictEqual(output.current, output.name === current, text)
    })
    assert.ok(marked.filter(function(output) { return output.current }).length <= 1, text)

    asked.forEach(function(name) {
      assert.strictEqual(Devices.has(list, name), found.indexOf(name) !== -1, text)
    })
    assert.strictEqual(Devices.next(list, current), expectedNext(found, current), text)
    assert.deepStrictEqual(Devices.plan(list, saved, current), expectedPlan(found, saved, current), text)

    // What mark() returns is a list like any other, and reads the same.
    assert.deepStrictEqual(Devices.mark(marked, current), marked, text)
    assert.strictEqual(Devices.next(marked, current), Devices.next(list, current), text)
  }
  assert.ok(repeats > 1000, "lists with something to drop: " + repeats)
})

test("cycling visits every name once and comes back, whoever made the list", function() {
  var random = makeRandom(6)
  var moved = 0
  for (var round = 0; round < 1500; round++) {
    var list = randomList(random)
    var found = listedNames(list)
    if (found.length === 0) {
      assert.strictEqual(Devices.next(list, "auto"), "")
      continue
    }
    var start = found[random(found.length)]
    var seen = [start]
    var current = Devices.next(list, start)
    if (found.length === 1) {
      assert.strictEqual(current, "")
      continue
    }
    // Cycling that answers with the device already in use would go nowhere.
    while (current !== start) {
      assert.strictEqual(seen.indexOf(current), -1, JSON.stringify(list))
      seen.push(current)
      assert.ok(seen.length <= found.length, JSON.stringify(list))
      current = Devices.next(list, current)
    }
    assert.deepStrictEqual(seen.slice().sort(), found.slice().sort())
    moved++
  }
  assert.ok(moved > 300, "lists cycled: " + moved)
})

test("mark: a label is the one filter would have made, whoever made the list", function() {
  var random = makeRandom(7)
  for (var i = 0; i < 3000; i++) {
    var text = randomFrom(random, TEXT_ALPHABET, random(200))
    var sink = Devices.mark([{ name: "pipewire/node.name", label: text }], "")[0]
    var shown = JSON.stringify(text)
    assert.ok(sink.label.length >= 1 && sink.label.length <= LABEL_CHARS, shown)
    assert.strictEqual(hasBanned(sink.label), false, shown)
    assert.strictEqual(hasLoneSurrogate(sink.label), false, shown)
    var filtered = Devices.filter([{ name: "pipewire/node.name", description: text }])
    assert.strictEqual(sink.label, filtered[0].label, shown)
    // The system default has one label, and it is not the list's to choose.
    assert.strictEqual(Devices.mark([{ name: "auto", label: text }], "")[0].label, "System default")
  }
  // A label that is already clean comes back as it is.
  var outputs = Devices.filter([
    { name: "auto", description: "Autoselect device" },
    { name: "pipewire/sink-1", description: " \u202eSink\u0000  one " },
    { name: "pipewire/sink-2" }
  ])
  var marked = Devices.mark(outputs, "auto")
  marked.forEach(function(output, n) { assert.strictEqual(output.label, outputs[n].label) })
})

test("a device that goes away and comes back is left and taken up again", function() {
  var headset = { name: "pipewire/example_output.headset", description: "Example Headset" }
  var speakers = { name: "pipewire/example_output.speakers", description: "Example Speakers" }
  var auto = { name: "auto", description: "Autoselect device" }
  var saved = headset.name

  var both = Devices.filter([auto, speakers, headset])
  var first = Devices.plan(both, saved, "auto")
  assert.deepStrictEqual(first, { device: saved, send: true, fallback: false })

  var unplugged = Devices.filter([auto, speakers])
  var second = Devices.plan(unplugged, saved, first.device)
  assert.deepStrictEqual(second, { device: "auto", send: true, fallback: true })
  // The list changes again while the headset is still away: nothing is sent twice.
  var third = Devices.plan(Devices.filter([auto]), saved, second.device)
  assert.deepStrictEqual(third, { device: "auto", send: false, fallback: true })

  var fourth = Devices.plan(both, saved, third.device)
  assert.deepStrictEqual(fourth, { device: saved, send: true, fallback: false })
  var fifth = Devices.plan(both, saved, fourth.device)
  assert.deepStrictEqual(fifth, { device: saved, send: false, fallback: false })
})

test("no argument makes a function throw", function() {
  ODD.forEach(function(value) {
    assert.deepStrictEqual(Devices.filter(value), [])
    assert.deepStrictEqual(Devices.filter([value, value]), [])
    assert.deepStrictEqual(Devices.mark(value, value), [])
    assert.deepStrictEqual(Devices.mark([value], value), [])
    assert.strictEqual(Devices.has(value, value), false)
    assert.strictEqual(Devices.has([value], value), false)
    assert.strictEqual(Devices.next(value, value), "")
    assert.strictEqual(Devices.next([value], value), "")
    assert.deepStrictEqual(Devices.plan(value, value, value), { device: "", send: false, fallback: false })
    assert.deepStrictEqual(Devices.plan([value], value, value), { device: "", send: false, fallback: false })
  })
  var outputs = Devices.filter([{ name: "auto" }, sink(1)])
  ODD.forEach(function(value) {
    Devices.mark(outputs, value)
    Devices.has(outputs, value)
    Devices.next(outputs, value)
    Devices.plan(outputs, value, value)
    Devices.filter([{ name: value, description: value }, { name: "pipewire/sink-1", description: value }])
  })
  assert.strictEqual(Devices.filter().length, 0)
  assert.strictEqual(Devices.next(), "")
  assert.strictEqual(Devices.has(), false)
})

test("no report makes the functions slow", function() {
  var size = 200000
  var junk = []
  var sinks = []
  var same = []
  for (var i = 0; i < size; i++) {
    junk.push({ name: "alsa/device-" + i, description: "Other backend" })
    sinks.push({ name: "pipewire/sink-" + i, description: "Sink " + i })
    same.push({ name: "pipewire/sink", description: "\u202e".repeat(50) })
  }
  var reports = [
    junk, sinks, same,
    [{ name: "pipewire/" + "n".repeat(1 << 20), description: "Long name" }],
    [{ name: "pipewire/sink", description: " \u200b".repeat(1 << 19) }],
    [{ name: "pipewire/sink", description: "a".repeat(1 << 20) }],
    new Array(size).fill(null), new Array(size)
  ]
  reports.forEach(function(report, i) {
    var ms = elapsedMs(function() {
      var outputs = Devices.filter(report)
      assert.ok(outputs.length <= MAX)
      Devices.mark(report, "auto")
      Devices.has(report, "pipewire/sink-1")
      Devices.next(report, "pipewire/sink-1")
      Devices.plan(report, "pipewire/sink-1", "auto")
    })
    assert.ok(ms < 2000, "report " + i + " took " + Math.round(ms) + " ms")
  })
  // Lists with labels far longer than any label, as no filter made them.
  var labelled = []
  var padding = " \u200b".repeat(1 << 19)
  for (var j = 0; j < size; j++) labelled.push({ name: "pipewire/sink-" + j, label: padding + j })
  var listMs = elapsedMs(function() {
    assert.strictEqual(Devices.mark(labelled, "auto").length, MAX)
    Devices.has(labelled, "pipewire/sink-1")
    Devices.next(labelled, "pipewire/sink-1")
    Devices.plan(labelled, "pipewire/sink-1", "auto")
  })
  assert.ok(listMs < 2000, "labelled list took " + Math.round(listMs) + " ms")
})
