"use strict"
// Tests for lib/Settings.js: the table of settings, how the plugin's entry
// in the bar configuration is found and copied, which source wins for each
// value, and what is written back to the host. The input and expectation
// rows live in tests/vectors/settings.js and run in both engines; this file
// holds what a table cannot say: properties that must hold for every
// combination, objects that run code when they are read, and what the
// functions leave untouched.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var Settings = load.lib("Settings")
var Const = load.lib("Const")
var Vectors = load.vectors("settings")

var REPO = path.join(__dirname, "..", "..")
var ME = "example.plugin"

// The table of settings, written out a second time: the default, the value
// that holds before the settings are known, and every stored value that is
// accepted with the typed value it stands for.
var SWITCH = [[true, true], [false, false], ["true", true], ["false", false]]
var TABLE = {
  autoplay: { def: true, early: false, accepted: SWITCH },
  maxHeight: {
    def: 720, early: 720,
    accepted: [[480, 480], [720, 720], [1080, 1080], ["480", 480], ["720", 720], ["1080", 1080]]
  },
  videoSize: {
    def: "quarter", early: "quarter",
    accepted: [["sixth", "sixth"], ["quarter", "quarter"], ["third", "third"], ["half", "half"]]
  },
  videoCorner: {
    def: "bottom-right", early: "bottom-right",
    accepted: [["top-left", "top-left"], ["top-right", "top-right"], ["bottom-left", "bottom-left"],
      ["bottom-right", "bottom-right"]]
  },
  keepAwake: { def: true, early: true, accepted: SWITCH },
  sponsorSkip: {
    def: "ask", early: "ask", accepted: [[true, "on"], [false, "off"], ["true", "on"], ["false", "off"]]
  },
  markWatched: { def: false, early: false, accepted: SWITCH },
  evenVolume: { def: false, early: false, accepted: SWITCH },
  rememberHistory: { def: true, early: false, accepted: SWITCH },
  preload: { def: true, early: false, accepted: SWITCH }
}
var KEYS = Object.keys(TABLE)
var MIRRORED = ["rememberHistory", "preload", "autoplay"]

// Values no setting accepts, whatever its type.
var NEVER = [
  undefined, null, 0, 1, -1, 0.5, NaN, Infinity, "", " ", "yes", "no", "on", "off", "ask", "True", "FALSE",
  " true", "true ", "1", "0", "720p", "0720", "7.2e2", "Quarter", "center", "top_left", "constructor",
  "__proto__", "toString", [], [true], ["true"], {}, { value: true }, function() { return true }
]

function bar(entry) {
  return { position: "top", layout: { left: [], center: [], right: [entry] } }
}

function mine(settings) {
  return Object.assign({ id: ME }, settings)
}

function one(key, value) {
  var object = {}
  object[key] = value
  return object
}

// A plain copy, so that results can be compared whatever their prototype.
function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function known(raw, mirror, pending) {
  return Settings.coerce(raw, mirror, pending, true)
}

function freezeDeep(value) {
  if (value !== null && typeof value === "object") {
    Object.keys(value).forEach(function(key) { freezeDeep(value[key]) })
    Object.freeze(value)
  }
  return value
}

test("the module exports what the store and the state file use", function() {
  assert.deepStrictEqual(Object.keys(Settings).sort(), [
    "CONSERVATIVE", "CORNERS", "DEFAULTS", "MIRRORED", "SENT_MAX", "choices", "coerce", "earlierSent",
    "extract", "overlay", "unsettled", "withChange"
  ])
})

test("the defaults are the documented table, in its order", function() {
  var expected = {}
  KEYS.forEach(function(key) { expected[key] = TABLE[key].def })
  assert.deepStrictEqual(Settings.DEFAULTS, expected)
  assert.deepStrictEqual(Object.keys(Settings.DEFAULTS), KEYS)
})

test("before the settings are known nothing is remembered, preloaded, autoplayed or reported", function() {
  var expected = {}
  KEYS.forEach(function(key) { expected[key] = TABLE[key].early })
  assert.deepStrictEqual(Settings.CONSERVATIVE, expected)
  assert.deepStrictEqual(Object.keys(Settings.CONSERVATIVE), KEYS)
  assert.strictEqual(Settings.CONSERVATIVE.rememberHistory, false)
  assert.strictEqual(Settings.CONSERVATIVE.preload, false)
  assert.strictEqual(Settings.CONSERVATIVE.autoplay, false)
  assert.strictEqual(Settings.CONSERVATIVE.markWatched, false)
  assert.strictEqual(Settings.CONSERVATIVE.sponsorSkip, "ask")
  // The rest cannot give anything away and stays at its default.
  KEYS.forEach(function(key) {
    if (MIRRORED.indexOf(key) !== -1) return
    assert.strictEqual(Settings.CONSERVATIVE[key], Settings.DEFAULTS[key], key)
  })
})

test("the mirrored choices are the three whose default is the less private value", function() {
  assert.deepStrictEqual(Array.prototype.slice.call(Settings.MIRRORED), MIRRORED)
  MIRRORED.forEach(function(key) {
    assert.strictEqual(Settings.DEFAULTS[key], true, key)
    assert.strictEqual(Settings.CONSERVATIVE[key], false, key)
  })
  assert.deepStrictEqual(Array.prototype.slice.call(Settings.CORNERS),
    ["top-left", "top-right", "bottom-left", "bottom-right"])
})

test("the exported tables cannot be changed", function() {
  var tables = [Settings.DEFAULTS, Settings.CONSERVATIVE, Settings.MIRRORED, Settings.CORNERS]
  tables.forEach(function(table) { assert.ok(Object.isFrozen(table)) })
  assert.throws(function() { Settings.DEFAULTS.rememberHistory = false }, TypeError)
  assert.throws(function() { Settings.CONSERVATIVE.rememberHistory = true }, TypeError)
  assert.throws(function() { Settings.MIRRORED.push("markWatched") }, TypeError)
  assert.throws(function() { Settings.MIRRORED.length = 0 }, TypeError)
})

test("coerce answers with the conservative table itself until known is true", function() {
  var raw = { rememberHistory: true, preload: true, autoplay: true, markWatched: true, sponsorSkip: true }
  var notKnown = [false, undefined, null, 0, 1, "true", "known", {}, []]
  notKnown.forEach(function(value) {
    assert.strictEqual(Settings.coerce(raw, raw, raw, value), Settings.CONSERVATIVE)
  })
  assert.strictEqual(Settings.coerce(raw, raw, raw), Settings.CONSERVATIVE)
  assert.notStrictEqual(known(raw, raw, raw), Settings.CONSERVATIVE)
})

test("known settings are a fresh, complete object every time", function() {
  var first = known({}, {}, {})
  var second = known({}, {}, {})
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first, Settings.DEFAULTS)
  assert.deepStrictEqual(first, Settings.DEFAULTS)
  first.rememberHistory = false
  assert.strictEqual(known({}, {}, {}).rememberHistory, true)
  assert.strictEqual(Settings.DEFAULTS.rememberHistory, true)
})

test("every accepted stored value yields its typed value, in the entry and as a pending change", function() {
  KEYS.forEach(function(key) {
    TABLE[key].accepted.forEach(function(pair) {
      var expected = Object.assign({}, Settings.DEFAULTS, one(key, pair[1]))
      var label = key + " = " + JSON.stringify(pair[0])
      assert.deepStrictEqual(known(one(key, pair[0]), {}, {}), expected, label)
      assert.deepStrictEqual(known({}, {}, one(key, pair[0])), expected, label + " (pending)")
    })
  })
})

test("a value outside the table leaves the default, for every setting", function() {
  KEYS.forEach(function(key) {
    var accepted = TABLE[key].accepted.map(function(pair) { return pair[0] })
    var others = NEVER.slice()
    // What other settings accept is no value for this one.
    KEYS.forEach(function(other) {
      TABLE[other].accepted.forEach(function(pair) {
        if (accepted.indexOf(pair[0]) === -1) others.push(pair[0])
      })
    })
    others.forEach(function(value) {
      assert.deepStrictEqual(known(one(key, value), {}, {}), Settings.DEFAULTS, key + " = " + String(value))
      assert.strictEqual(Settings.withChange({}, key, value), null, key + " = " + String(value))
    })
  })
})

test("whatever the inputs are, the answer has exactly the ten keys with a value from the table", function() {
  var odd = NEVER.concat([Object.create(null), Object.create({ rememberHistory: false }), "raw", 7, true])
  odd.forEach(function(raw) {
    odd.forEach(function(mirror) {
      var values = Settings.coerce(raw, mirror, raw, true)
      assert.deepStrictEqual(Object.keys(values), KEYS)
      KEYS.forEach(function(key) {
        var typed = TABLE[key].accepted.map(function(pair) { return pair[1] }).concat([TABLE[key].def])
        assert.ok(typed.indexOf(values[key]) !== -1, key)
      })
    })
  })
})

test("a mirrored choice: pending, then the entry, then the mirror, then the default", function() {
  var pendings = [undefined, true, false, "true", "false", "junk"]
  var entries = [undefined, true, false, "true", "false", "junk", null, 0]
  var mirrors = [undefined, true, false, "true", "false", 0, null]
  var typed = function(value) {
    if (value === true || value === "true") return true
    if (value === false || value === "false") return false
    return undefined
  }
  MIRRORED.forEach(function(key) {
    pendings.forEach(function(pending) {
      entries.forEach(function(entry) {
        mirrors.forEach(function(mirror) {
          var expected = typed(pending)
          if (expected === undefined) expected = typed(entry)
          // The mirror holds booleans; text in it is not a choice.
          if (expected === undefined && typeof mirror === "boolean") expected = mirror
          if (expected === undefined) expected = true
          var values = known(
            entry === undefined ? {} : one(key, entry),
            mirror === undefined ? {} : one(key, mirror),
            pending === undefined ? {} : one(key, pending))
          var label = key + ": pending " + String(pending) + ", entry " + String(entry) + ", mirror "
            + String(mirror)
          assert.strictEqual(values[key], expected, label)
          // And no other setting moved.
          assert.deepStrictEqual(Object.assign({}, values, one(key, true)), Settings.DEFAULTS, label)
        })
      })
    })
  })
})

test("only the three mirrored choices are read from the mirror", function() {
  var mirror = {}
  KEYS.forEach(function(key) { mirror[key] = TABLE[key].accepted[1][0] })
  var values = known({}, mirror, {})
  KEYS.forEach(function(key) {
    var expected = MIRRORED.indexOf(key) === -1 ? TABLE[key].def : false
    assert.strictEqual(values[key], expected, key)
  })
})

test("an opt-out survives the entry being deleted and added again without the key", function() {
  // The user switched history off: the entry says so, and so does the mirror.
  var entry = Settings.extract(bar(mine({ rememberHistory: false })), ME)
  var mirror = { rememberHistory: false }
  assert.strictEqual(known(entry, mirror, {}).rememberHistory, false)
  // Disable deletes the entry; enable adds a bare one.
  var bare = Settings.extract(bar({ id: ME }), ME)
  assert.deepStrictEqual(plain(bare), { id: ME })
  assert.strictEqual(known(bare, mirror, {}).rememberHistory, false)
  // Without the mirror the same entry would switch history back on.
  assert.strictEqual(known(bare, {}, {}).rememberHistory, true)
  // And a later explicit choice in the entry wins again.
  var back = Settings.extract(bar(mine({ rememberHistory: "true" })), ME)
  assert.strictEqual(known(back, mirror, {}).rememberHistory, true)
  assert.deepStrictEqual(plain(Settings.choices(back)), { rememberHistory: true })
})

test("sponsorSkip asks until the user has answered", function() {
  assert.strictEqual(known({}, {}, {}).sponsorSkip, "ask")
  assert.strictEqual(known({}, { sponsorSkip: true }, {}).sponsorSkip, "ask")
  assert.strictEqual(known({ sponsorSkip: "on" }, {}, {}).sponsorSkip, "ask")
  assert.strictEqual(known({ sponsorSkip: true }, {}, {}).sponsorSkip, "on")
  assert.strictEqual(known({ sponsorSkip: false }, {}, {}).sponsorSkip, "off")
  // The answer is stored as a boolean and reads back as the same word.
  var yes = Settings.withChange({}, "sponsorSkip", true)
  var no = Settings.withChange({}, "sponsorSkip", false)
  assert.strictEqual(yes.sponsorSkip, true)
  assert.strictEqual(no.sponsorSkip, false)
  assert.strictEqual(known(yes, {}, {}).sponsorSkip, "on")
  assert.strictEqual(known(no, {}, {}).sponsorSkip, "off")
})

test("extract copies into a table without a prototype", function() {
  var text = "{\"id\":\"example.plugin\",\"__proto__\":{\"rememberHistory\":false},\"constructor\":\"c\","
    + "\"toString\":\"t\",\"evenVolume\":true}"
  var found = Settings.extract(bar(JSON.parse(text)), ME)
  assert.strictEqual(Object.getPrototypeOf(found), null)
  assert.deepStrictEqual(Object.keys(found), ["id", "constructor", "toString", "evenVolume"])
  assert.strictEqual(found.constructor, "c")
  assert.strictEqual(found.rememberHistory, undefined)
  assert.strictEqual(found.hasOwnProperty, undefined)
  assert.strictEqual(known(found, {}, {}).rememberHistory, true)
  assert.strictEqual(known(found, {}, {}).evenVolume, true)
})

test("every table the module hands out has no prototype", function() {
  var raw = { id: ME, autoplay: "false", custom: "x" }
  var tables = [
    Settings.extract(bar(raw), ME), Settings.withChange(raw, "preload", false), Settings.overlay(raw, raw),
    Settings.overlay(null, null), Settings.unsettled(raw, {}, {}), Settings.unsettled(null, null, null),
    Settings.choices(raw), Settings.choices(null)
  ]
  tables.forEach(function(table, index) {
    assert.strictEqual(Object.getPrototypeOf(table), null, "table " + index)
  })
})

test("hostile keys leave Object.prototype as it was", function() {
  var before = Object.getOwnPropertyNames(Object.prototype).sort()
  var text = "{\"id\":\"example.plugin\",\"__proto__\":{\"polluted\":true},"
    + "\"constructor\":{\"prototype\":{\"polluted\":true}},\"prototype\":{\"polluted\":true}}"
  var hostile = JSON.parse(text)
  var raw = Settings.extract(bar(hostile), ME)
  Settings.coerce(hostile, hostile, hostile, true)
  Settings.withChange(hostile, "evenVolume", true)
  Settings.overlay(hostile, hostile)
  Settings.unsettled(hostile, hostile, hostile)
  Settings.choices(hostile)
  Settings.withChange(raw, "__proto__", true)
  assert.strictEqual({}.polluted, undefined)
  assert.strictEqual(Object.prototype.polluted, undefined)
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before)
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
  var entry = trap({ id: ME }, ["rememberHistory", "custom"])
  var config = trap({}, ["layout"])
  var listed = { layout: trap({}, ["left", "center", "right"]) }
  var withId = bar(trap({}, ["id"]))
  assert.strictEqual(Settings.extract(config, ME), null)
  assert.strictEqual(Settings.extract(listed, ME), null)
  assert.strictEqual(Settings.extract(withId, ME), null)
  assert.deepStrictEqual(plain(Settings.extract(bar(entry), ME)), { id: ME })
  assert.deepStrictEqual(known(entry, entry, entry), Settings.DEFAULTS)
  assert.deepStrictEqual(plain(Settings.withChange(entry, "evenVolume", true)),
    { id: Const.PLUGIN_ID, evenVolume: true })
  assert.deepStrictEqual(plain(Settings.overlay(entry, entry)), { id: ME })
  assert.deepStrictEqual(plain(Settings.unsettled(entry, entry, entry)), {})
  assert.deepStrictEqual(plain(Settings.choices(entry)), {})
  assert.strictEqual(runs, 0)
})

test("no function changes what it is given", function() {
  var config = freezeDeep(bar(mine({ autoplay: "false", custom: "x", type: "custom", nested: { a: 1 } })))
  var raw = freezeDeep({ id: ME, autoplay: "false", custom: "x", type: "custom" })
  var pending = freezeDeep({ evenVolume: true })
  var mirror = freezeDeep({ rememberHistory: false })
  assert.doesNotThrow(function() {
    Settings.extract(config, ME)
    Settings.coerce(raw, mirror, pending, true)
    Settings.withChange(raw, "preload", false)
    Settings.overlay(raw, pending)
    Settings.unsettled(pending, raw, raw)
    Settings.choices(raw)
  })
  assert.deepStrictEqual(raw, { id: ME, autoplay: "false", custom: "x", type: "custom" })
})

test("an entry is cut to 32 keys, and never at the cost of a setting", function() {
  var crowded = { id: ME }
  for (var i = 0; i < 1000; i++) crowded["junk" + i] = i
  KEYS.forEach(function(key) { crowded[key] = TABLE[key].accepted[1][0] })
  var found = Settings.extract(bar(crowded), ME)
  var names = Object.keys(found)
  assert.strictEqual(names.length, Const.LIMITS.settingsKeys)
  KEYS.forEach(function(key) { assert.ok(names.indexOf(key) !== -1, key) })
  assert.strictEqual(names[0], "id")
  var values = known(found, {}, {})
  KEYS.forEach(function(key) { assert.strictEqual(values[key], TABLE[key].accepted[1][1], key) })
  // The same holds when the entry is written back.
  var entry = Settings.withChange(crowded, "evenVolume", true)
  assert.ok(Object.keys(entry).length <= Const.LIMITS.settingsKeys + 1)
  KEYS.forEach(function(key) { assert.ok(key in entry, key) })
})

test("withChange accepts exactly the table and stores JSON values", function() {
  KEYS.forEach(function(key) {
    TABLE[key].accepted.forEach(function(pair) {
      var entry = Settings.withChange({}, key, pair[0])
      var label = key + " = " + JSON.stringify(pair[0])
      assert.notStrictEqual(entry, null, label)
      assert.deepStrictEqual(Object.keys(entry), ["id", key], label)
      // What is stored reads back as the value that was meant.
      assert.strictEqual(known(entry, {}, {})[key], pair[1], label)
      var stored = entry[key]
      if (key === "sponsorSkip") assert.strictEqual(stored, pair[1] === "on", label)
      else assert.strictEqual(stored, pair[1], label)
      assert.notStrictEqual(typeof stored, "object", label)
    })
  })
})

test("the entry that is written carries the plugin's id and never a reserved key", function() {
  var manifest = JSON.parse(fs.readFileSync(path.join(REPO, "manifest.json"), "utf8"))
  var raws = [
    {}, null, { id: "other.plugin" }, { id: 5, type: "custom" }, { type: "t", exec: "e", source: "s" },
    JSON.parse("{\"__proto__\":{\"type\":\"custom\"},\"exec\":\"x\"}"), Object.create({ type: "custom" })
  ]
  raws.forEach(function(raw, index) {
    KEYS.forEach(function(key) {
      var entry = Settings.withChange(raw, key, TABLE[key].accepted[0][0])
      var names = Object.keys(entry)
      assert.strictEqual(names[0], "id", "raw " + index)
      assert.strictEqual(entry.id, Const.PLUGIN_ID)
      assert.strictEqual(entry.id, manifest.id)
      var reserved = ["type", "exec", "source"]
      reserved.forEach(function(name) {
        assert.ok(names.indexOf(name) === -1, name)
        assert.strictEqual(entry[name], undefined, name)
      })
      assert.strictEqual(names.filter(function(name) { return name === "id" }).length, 1)
    })
  })
})

test("the vector table spells the plugin's id as Const has it", function() {
  var written = Vectors.CASES.filter(function(c) { return c.fn === "withChange" && c.expect !== null })
  assert.ok(written.length > 10)
  written.forEach(function(c) { assert.strictEqual(c.expect.id, Const.PLUGIN_ID) })
})

test("only short plain values ever travel to the host", function() {
  var raw = {
    id: ME, text: "x".repeat(64), long: "x".repeat(65), n: 1, nan: NaN, inf: Infinity, nested: { a: 1 },
    list: [1], nothing: null, missing: undefined, fn: function() {}, yes: true
  }
  var entry = Settings.withChange(raw, "evenVolume", true)
  assert.deepStrictEqual(plain(entry),
    { id: Const.PLUGIN_ID, text: "x".repeat(64), n: 1, yes: true, evenVolume: true })
  Object.keys(entry).forEach(function(key) {
    var value = entry[key]
    assert.ok(typeof value === "boolean" || typeof value === "number" || typeof value === "string", key)
    assert.match(key, /^[A-Za-z][A-Za-z0-9]{0,31}$/)
  })
})

test("a change is built on the changes that are still on their way", function() {
  var raw = Settings.extract(bar(mine({ autoplay: true, custom: "x" })), ME)
  // The first change went out; the host has not shown it yet.
  var first = Settings.withChange(raw, "rememberHistory", false)
  var pending = { rememberHistory: first.rememberHistory }
  var second = Settings.withChange(Settings.overlay(raw, pending), "evenVolume", true)
  assert.deepStrictEqual(plain(second),
    { id: Const.PLUGIN_ID, autoplay: true, custom: "x", rememberHistory: false, evenVolume: true })
  // Built on the entry alone, the second change would have undone the first.
  assert.strictEqual(Settings.withChange(raw, "evenVolume", true).rememberHistory, undefined)
})

test("a pending change settles when the entry shows it and yields when the entry moves on", function() {
  var before = { maxHeight: 720 }
  var pending = { maxHeight: 1080 }
  // Someone else's write: our key is as it was.
  assert.deepStrictEqual(plain(Settings.unsettled(pending, { maxHeight: 720, other: 1 }, before)), pending)
  assert.strictEqual(known({ maxHeight: 720 }, {}, pending).maxHeight, 1080)
  // Our write arrived.
  assert.deepStrictEqual(plain(Settings.unsettled(pending, { maxHeight: "1080" }, before)), {})
  // A different value arrived instead: the entry is what counts.
  assert.deepStrictEqual(plain(Settings.unsettled(pending, { maxHeight: 480 }, before)), {})
  // For every setting: a pending value equal to what the entry has is nothing to wait for.
  KEYS.forEach(function(key) {
    TABLE[key].accepted.forEach(function(pair) {
      var raw = one(key, pair[0])
      assert.deepStrictEqual(plain(Settings.unsettled(raw, raw, raw)), {}, key)
      assert.deepStrictEqual(plain(Settings.unsettled(raw, {}, {})), plain(raw), key)
    })
  })
})

test("choices reports what the entry itself decides about the mirrored three", function() {
  var combos = [undefined, true, false, "true", "false", "junk"]
  combos.forEach(function(history) {
    combos.forEach(function(preload) {
      var raw = { id: ME, evenVolume: true }
      var expected = {}
      if (history !== undefined) raw.rememberHistory = history
      if (preload !== undefined) raw.preload = preload
      if (history === true || history === "true") expected.rememberHistory = true
      if (history === false || history === "false") expected.rememberHistory = false
      if (preload === true || preload === "true") expected.preload = true
      if (preload === false || preload === "false") expected.preload = false
      assert.deepStrictEqual(plain(Settings.choices(raw)), expected)
    })
  })
})
