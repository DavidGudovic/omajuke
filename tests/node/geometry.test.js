"use strict"
// Tests for lib/Geometry.js: the vector table (also run inside Qt's
// engine), the margins of every corner worked out a second time, the round
// trip (a window placed the way a placement says is read back as that
// placement, also through the rule line lib/Lua.js makes of it), and sweeps
// of malformed input, values that cannot even be read among them, each of
// which has to end in a plain refusal or in whole numbers within bounds.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Geometry = load.lib("Geometry")
var Lua = load.lib("Lua")
var table = load.vectors("geometry")

var CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"]
var SIZES = [["sixth", 17], ["quarter", 25], ["third", 33], ["half", 50]]
var NO = { ok: false }

function monitor(changes) {
  return Object.assign({
    id: 0, name: "HDMI-A-1", width: 1920, height: 1080, x: 0, y: 0, scale: 1, transform: 0, focused: true,
    reserved: [0, 30, 0, 0]
  }, changes)
}

function settings(size, corner) {
  return { videoSize: size, videoCorner: corner }
}

function client(at, size) {
  return { class: "OmaJuke", at: at, size: size, floating: true, fullscreen: 0 }
}

// The size a monitor has on the desktop: turned a quarter by the odd
// transforms, then divided by its scale.
function logical(entry) {
  var turned = entry.transform % 2 === 1
  return {
    w: Math.round((turned ? entry.height : entry.width) / entry.scale),
    h: Math.round((turned ? entry.width : entry.height) / entry.scale)
  }
}

// The window a placement leads to on a monitor, in desktop coordinates:
// pct percent of the monitor's width, sixteen by nine, at its margins from
// its corner, rounded the way Hyprland rounds a box.
function windowFor(p, entry) {
  var size = logical(entry)
  var w = size.w * p.pct / 100
  var h = w * 9 / 16
  var x = p.corner.indexOf("left") !== -1 ? p.marginX : size.w - w - p.marginX
  var y = p.corner.indexOf("top") !== -1 ? p.marginY : size.h - h - p.marginY
  var left = Math.round(x)
  var top = Math.round(y)
  return client([entry.x + left, entry.y + top], [Math.round(x + w) - left, Math.round(y + h) - top])
}

// The window Hyprland opens for a rule line on a monitor of the given
// desktop size: the size and move entries of the line itself, worked out
// (a product binds tighter than a difference, and there is nothing else in
// them), then rounded at the near and the far corner of the box.
function windowOf(line, entry, size) {
  var found = /size = \{ (\S+), (\S+) \}, move = \{ (\S+), (\S+) \} \}\)/.exec(line)
  assert.ok(found, line)
  var value = function(text) {
    var quoted = /^"\((.+)\)"$/.exec(text)
    return (quoted ? quoted[1] : text).split("-").reduce(function(total, term, index) {
      var product = term.split("*").reduce(function(factors, factor) {
        if (factor === "monitor_w") return factors * size.w
        if (factor === "monitor_h") return factors * size.h
        assert.match(factor, /^[0-9]+(\.[0-9]+)?$/)
        return factors * Number(factor)
      }, 1)
      return index === 0 ? product : total - product
    }, 0)
  }
  var w = value(found[1])
  var h = value(found[2])
  var x = value(found[3])
  var y = value(found[4])
  var left = Math.round(x)
  var top = Math.round(y)
  return client([entry.x + left, entry.y + top], [Math.round(x + w) - left, Math.round(y + h) - top])
}

// Gaps written as CSS shorthand, spelled out as [top, right, bottom, left].
function expandGaps(values) {
  if (values.length === 1) return [values[0], values[0], values[0], values[0]]
  if (values.length === 2) return [values[0], values[1], values[0], values[1]]
  if (values.length === 3) return [values[0], values[1], values[2], values[1]]
  return values
}

function clampMargin(value) {
  return Math.max(0, Math.min(2000, Math.ceil(value)))
}

// A whole number within bounds. A negative zero is not one: it compares
// equal to zero and still is a different value to whatever stores it.
function isWhole(value, min, max) {
  return Number.isInteger(value) && !Object.is(value, -0) && value >= min && value <= max
}

// A placement is either the bare refusal or exactly these five fields.
function assertSoundPlacement(result, label) {
  if (result.ok !== true) return assert.deepStrictEqual(result, NO, label)
  assert.deepStrictEqual(Object.keys(result), ["ok", "pct", "corner", "marginX", "marginY"], label)
  assert.ok(isWhole(result.pct, 10, 90), label)
  assert.ok(CORNERS.indexOf(result.corner) !== -1, label)
  assert.ok(isWhole(result.marginX, 0, 2000), label)
  assert.ok(isWhole(result.marginY, 0, 2000), label)
}

function assertSoundReading(result, label) {
  if (result.ok !== true) return assert.deepStrictEqual(result, NO, label)
  assert.deepStrictEqual(Object.keys(result), ["ok", "name", "corner", "widthPct"], label)
  assert.match(result.name, /^[A-Za-z0-9_-]{1,32}$/, label)
  assert.ok(CORNERS.indexOf(result.corner) !== -1, label)
  assert.ok(isWhole(result.widthPct, 10, 90), label)
}

// Values no field should hold, of every kind a parsed answer or a stored
// file can carry, and a few only a bug could produce.
var ODD = [
  undefined, null, true, false, 0, -0, 1, -1, 0.5, -0.5, 7, 25, 2000, 2001, 1e21, -1e21, 9007199254740993,
  NaN, Infinity, -Infinity, "", " ", "0", "1", "25", "quarter", "bottom-right", "constructor", "__proto__",
  "toString", "length", "10 10 10 10", "\u0000", "a".repeat(5000), [], [0], [0, 0], [0, 0, 0, 0],
  [1, 2, 3, 4, 5], ["1", "2"], [null, null, null, null], [NaN, NaN, NaN, NaN], [[]], {}, { length: 4 },
  { 0: 0, 1: 0, 2: 0, 3: 0, length: 4 }, { css: "1" }, { int: 1 }, { ok: true }, function() { return 1 }
]

// What can stand where data is expected and is not data at all: values
// that fail when they are read, and kinds JSON never yields.
function unreadable() {
  var refuse = function() { throw new Error("unreadable") }
  var throwing = {}
  var fields = ["name", "width", "height", "x", "y", "scale", "transform", "focused", "reserved", "css",
    "int", "videoSize", "videoCorner", "corner", "widthPct", "at", "size", "floating", "fullscreen",
    "HDMI-A-1", "length", "0", "1"]
  fields.forEach(function(field) {
    Object.defineProperty(throwing, field, { enumerable: true, get: refuse })
  })
  var revokedObject = Proxy.revocable({}, {})
  revokedObject.revoke()
  var revokedList = Proxy.revocable([], {})
  revokedList.revoke()
  var throwingList = [0, 0]
  Object.defineProperty(throwingList, 0, { enumerable: true, get: refuse })
  return [
    throwing, throwingList, revokedObject.proxy, revokedList.proxy,
    new Proxy({}, { get: refuse, has: refuse, getOwnPropertyDescriptor: refuse }),
    new Proxy([monitor()], { get: refuse }), new Proxy([0, 0, 0, 0], { get: refuse }),
    Symbol("s"), 10n, new Date(0), /x/, new Map(), new Set(), Object.create(null),
    { toString: refuse, valueOf: refuse }
  ]
}

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

function label(value) {
  try {
    return String(JSON.stringify(value)).slice(0, 300)
  } catch (error) {
    return "unprintable"
  }
}

// ---- The table ----

test("exports exactly the documented functions", function() {
  assert.deepStrictEqual(Object.keys(Geometry).sort(), ["fromWindow", "placement"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Geometry, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Geometry).forEach(function(name) {
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

// ---- placement ----

test("placement: each size setting is its percentage, in every corner", function() {
  SIZES.forEach(function(size) {
    CORNERS.forEach(function(corner) {
      var result = Geometry.placement([monitor()], { css: "0 0 0 0" }, settings(size[0], corner), null)
      assert.strictEqual(result.pct, size[1])
      assert.strictEqual(result.corner, corner)
    })
  })
})

test("placement: a corner's margins are the reserved space plus the gap at its own two edges", function() {
  var reservedSets = [[0, 0, 0, 0], [3, 5, 7, 11], [0, 30, 0, 0], [0, 0, 0, 48], [64, 0, 64, 0],
    [1990, 1995, 2000, 2005], [0.25, 0.5, 0.75, 1.5], [-3, -5, -7, -11]]
  var gapSets = [[0], [4], [10], [13, 17], [13, 17, 19], [13, 17, 19, 23], [-2, -4, -6, -8], [99999]]
  var count = 0
  reservedSets.forEach(function(reserved) {
    gapSets.forEach(function(values) {
      var gaps = expandGaps(values)
      // Reserved space is listed left, top, right, bottom.
      var left = clampMargin(reserved[0] + gaps[3])
      var top = clampMargin(reserved[1] + gaps[0])
      var right = clampMargin(reserved[2] + gaps[1])
      var bottom = clampMargin(reserved[3] + gaps[2])
      var expected = {
        "top-left": [left, top], "top-right": [right, top], "bottom-left": [left, bottom],
        "bottom-right": [right, bottom]
      }
      CORNERS.forEach(function(corner) {
        var result = Geometry.placement([monitor({ reserved: reserved })], { css: values.join(" ") },
          settings("quarter", corner), null)
        assert.deepStrictEqual(result,
          { ok: true, pct: 25, corner: corner, marginX: expected[corner][0], marginY: expected[corner][1] })
        if (values.length === 1) {
          var plain = Geometry.placement([monitor({ reserved: reserved })], { int: values[0] },
            settings("quarter", corner), null)
          assert.deepStrictEqual(plain, result)
        }
        count++
      })
    })
  })
  assert.strictEqual(count, 8 * 8 * 4)
})

test("placement: the monitor's size, position, scale and turn change nothing", function() {
  var sizes = [[1920, 1080], [1280, 1024], [3840, 2160], [5120, 1440], [1080, 1920], [1, 1], [65536, 65536]]
  var scales = [0.25, 0.5, 1, 1.25, 1.5, 1.6666667, 2, 3, 8]
  var gaps = { css: "8 6 4 2" }
  var count = 0
  CORNERS.forEach(function(corner) {
    var chosen = settings("third", corner)
    var base = Geometry.placement([monitor({ reserved: [1, 30, 2, 3] })], gaps, chosen, null)
    assert.strictEqual(base.ok, true)
    sizes.forEach(function(size) {
      scales.forEach(function(scale) {
        for (var transform = 0; transform <= 7; transform++) {
          var entry = monitor({
            width: size[0], height: size[1], scale: scale, transform: transform, x: -7 * size[0], y: size[1],
            reserved: [1, 30, 2, 3]
          })
          var result = Geometry.placement([entry], gaps, chosen, null)
          // Only a monitor scaled down to nothing is refused.
          if (logical(entry).w < 1 || logical(entry).h < 1) assert.deepStrictEqual(result, NO)
          else assert.deepStrictEqual(result, base)
          count++
        }
      })
    })
  })
  assert.strictEqual(count, 4 * 7 * 9 * 8)
})

test("placement: of several monitors the focused one decides, wherever it stands in the list", function() {
  var gaps = { css: "0" }
  var plain = settings("quarter", "bottom-right")
  for (var total = 1; total <= 6; total++) {
    for (var focused = 0; focused < total; focused++) {
      var list = []
      for (var i = 0; i < total; i++) {
        list.push(monitor({
          name: "OUT-" + i, x: 1920 * i, focused: i === focused, reserved: [0, 0, 100 + i, 0]
        }))
      }
      var kept = {}
      kept["OUT-" + focused] = { corner: "bottom-right", widthPct: 40 + focused }
      assert.deepStrictEqual(Geometry.placement(list, gaps, plain, kept),
        { ok: true, pct: 40 + focused, corner: "bottom-right", marginX: 100 + focused, marginY: 0 })
    }
  }
})

test("placement: every remembered width from 10 to 90 is used, and nothing outside", function() {
  for (var pct = -5; pct <= 105; pct++) {
    var kept = { "HDMI-A-1": { corner: "top-right", widthPct: pct } }
    var result = Geometry.placement([monitor()], { css: "0" }, settings("half", "bottom-left"), kept)
    assert.strictEqual(result.pct, pct >= 10 && pct <= 90 ? pct : 50, String(pct))
    assert.strictEqual(result.corner, "top-right")
  }
})

test("placement: only an entry the remembered table itself holds counts", function() {
  var plain = settings("quarter", "bottom-right")
  var gaps = { css: "0" }
  var entry = { corner: "top-left", widthPct: 40 }
  var used = { ok: true, pct: 40, corner: "top-left", marginX: 0, marginY: 30 }
  var unused = { ok: true, pct: 25, corner: "bottom-right", marginX: 0, marginY: 0 }

  // Inherited: not the table's own.
  var inherited = Object.create({ "HDMI-A-1": entry })
  assert.deepStrictEqual(Geometry.placement([monitor()], gaps, plain, inherited), unused)

  // A table without a prototype is the stored form, and works.
  var bare = Object.create(null)
  bare["HDMI-A-1"] = entry
  assert.deepStrictEqual(Geometry.placement([monitor()], gaps, plain, bare), used)

  // Names every ordinary object answers to find nothing in an empty table.
  var inheritedNames = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf",
    "__defineGetter__", "__lookupGetter__", "propertyIsEnumerable", "toLocaleString"]
  inheritedNames.forEach(function(name) {
    assert.deepStrictEqual(Geometry.placement([monitor({ name: name })], gaps, plain, {}), unused, name)
    var own = Object.create(null)
    own[name] = entry
    assert.deepStrictEqual(Geometry.placement([monitor({ name: name })], gaps, plain, own), used, name)
  })

  // A file may hold "__proto__" as an ordinary key: JSON keeps it as one.
  var parsed = JSON.parse("{\"__proto__\": {\"corner\": \"top-left\", \"widthPct\": 40}}")
  assert.deepStrictEqual(Geometry.placement([monitor({ name: "__proto__" })], gaps, plain, parsed), used)
  assert.deepStrictEqual(Geometry.placement([monitor()], gaps, plain, parsed), unused)
  // An entry that inherits its fields has none of its own, yet reading them
  // is harmless: they are checked like any other value.
  var heir = { "HDMI-A-1": Object.create(entry) }
  assert.deepStrictEqual(Geometry.placement([monitor()], gaps, plain, heir), used)

  assert.strictEqual({}.widthPct, undefined)
  assert.strictEqual({}.corner, undefined)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(Object.prototype, "HDMI-A-1"), false)
})

test("placement: one malformed field at a time ends in a refusal or a sound result", function() {
  var gaps = { css: "10 10 10 10" }
  var plain = settings("quarter", "bottom-right")
  var fields = ["name", "width", "height", "x", "y", "scale", "transform", "focused", "reserved"]
  ODD.forEach(function(value) {
    fields.forEach(function(field) {
      var changes = {}
      changes[field] = value
      var result = Geometry.placement([monitor(changes)], gaps, plain, null)
      assertSoundPlacement(result, field + " = " + label(value))
      // Only the name may be anything: it is not needed to place a window.
      if (field === "name") assert.strictEqual(result.ok, true, label(value))
    })
    assertSoundPlacement(Geometry.placement(value, gaps, plain, null), "monitors = " + label(value))
    assertSoundPlacement(Geometry.placement([value], gaps, plain, null), "entry = " + label(value))
    assertSoundPlacement(Geometry.placement([monitor()], value, plain, null), "gaps = " + label(value))
    assertSoundPlacement(Geometry.placement([monitor()], { css: value }, plain, null), "css")
    assertSoundPlacement(Geometry.placement([monitor()], { int: value }, plain, null), "int")
    assertSoundPlacement(Geometry.placement([monitor()], gaps, value, null), "settings = " + label(value))
    assertSoundPlacement(Geometry.placement([monitor()], gaps, settings(value, "top-left"), null),
      "size = " + label(value))
    assertSoundPlacement(Geometry.placement([monitor()], gaps, settings("half", value), null),
      "corner = " + label(value))
    var whole = Geometry.placement([monitor()], gaps, plain, value)
    assertSoundPlacement(whole, "remembered = " + label(value))
    assert.strictEqual(whole.ok, true, "remembered = " + label(value))
    var kept = Geometry.placement([monitor()], gaps, plain, { "HDMI-A-1": value })
    assert.deepStrictEqual(kept, Geometry.placement([monitor()], gaps, plain, null), label(value))
    var storedFields = ["corner", "widthPct"]
    storedFields.forEach(function(field) {
      var entry = { corner: "top-left", widthPct: 40 }
      entry[field] = value
      var result = Geometry.placement([monitor()], gaps, plain, { "HDMI-A-1": entry })
      assertSoundPlacement(result, field + " = " + label(value))
      assert.strictEqual(result.ok, true)
    })
  })
})

test("placement: any mix of malformed fields ends in a refusal or a sound result", function() {
  var random = makeRandom(20240229)
  // About one field in twelve is replaced, so roughly a third of the rounds
  // are entirely well-formed.
  var pick = function(usual) { return random(12) === 0 ? ODD[random(ODD.length)] : usual }
  var accepted = 0
  for (var round = 0; round < 30000; round++) {
    var entry = {
      name: pick("HDMI-A-1"), width: pick(1920), height: pick(1080), x: pick(0), y: pick(0), scale: pick(1),
      transform: pick(0), focused: random(8) === 0 ? ODD[random(ODD.length)] : true,
      reserved: [pick(0), pick(30), pick(0), pick(0)]
    }
    var gaps = random(2) === 0 ? { css: pick("4 4 4 4") } : { int: pick(4) }
    var chosen = { videoSize: pick("quarter"), videoCorner: pick("top-right") }
    var kept = { "HDMI-A-1": { corner: pick("bottom-left"), widthPct: pick(40) } }
    var result = Geometry.placement([entry], gaps, chosen, random(2) === 0 ? kept : pick(null))
    assertSoundPlacement(result, label([entry, gaps, chosen]))
    if (result.ok) accepted++
  }
  // The sweep is worth something only if both outcomes occur often.
  assert.ok(accepted > 3000 && accepted < 27000, String(accepted))
})

test("placement: gap text of any length is refused at once", function() {
  var texts = ["10 ".repeat(100000), "1".repeat(1000000), " ".repeat(1000000), "-".repeat(1000000),
    "10 10 10 10" + " ".repeat(1000000), "9".repeat(6), "1 2 3 4 5"]
  var start = process.hrtime.bigint()
  texts.forEach(function(text) {
    var result = Geometry.placement([monitor()], { css: text }, settings("quarter", "top-left"), null)
    assert.deepStrictEqual(result, NO)
  })
  assert.ok(Number(process.hrtime.bigint() - start) / 1e6 < 500)
})

test("input of any size or depth is answered at once", function() {
  var deep = {}
  var level = deep
  for (var i = 0; i < 100000; i++) {
    level.reserved = { at: [level] }
    level = level.reserved
  }
  var wide = new Array(1e6).fill(monitor())
  var long = "A".repeat(1e6)
  var many = {}
  for (var k = 0; k < 100000; k++) many["OUT-" + k] = { corner: "top-left", widthPct: 40 }
  many["HDMI-A-1"] = { corner: "top-right", widthPct: 44 }
  var gaps = { css: "0" }
  var plain = settings("quarter", "bottom-right")
  var good = client([1430, 800], [480, 270])
  var usual = { ok: true, pct: 25, corner: "bottom-right", marginX: 0, marginY: 0 }
  var start = process.hrtime.bigint()
  var one = [monitor()]
  var refused = [
    Geometry.placement(wide, gaps, plain, null), Geometry.placement(deep, gaps, plain, null),
    Geometry.placement([deep], gaps, plain, null),
    Geometry.placement([monitor({ reserved: wide })], gaps, plain, null),
    Geometry.placement([monitor({ reserved: deep })], gaps, plain, null),
    Geometry.placement([monitor({ width: wide })], gaps, plain, null),
    Geometry.placement(one, deep, plain, null), Geometry.placement(one, { css: wide }, plain, null),
    Geometry.placement(one, gaps, deep, null), Geometry.placement(one, gaps, settings(long, long), null),
    Geometry.fromWindow(good, wide), Geometry.fromWindow(good, deep), Geometry.fromWindow(deep, one),
    Geometry.fromWindow(client(wide, wide), one), Geometry.fromWindow(client(deep, deep), one),
    Geometry.fromWindow(good, [monitor({ name: long })])
  ]
  // What is only looked up, or not needed, may be as large as it likes.
  var placed = [
    Geometry.placement([monitor({ name: long })], gaps, plain, null),
    Geometry.placement(one, gaps, plain, wide), Geometry.placement(one, gaps, plain, deep),
    Geometry.placement(one, gaps, plain, { "HDMI-A-1": deep })
  ]
  var kept = Geometry.placement(one, gaps, plain, many)
  assert.ok(Number(process.hrtime.bigint() - start) / 1e6 < 500)
  refused.forEach(function(result, n) { assert.deepStrictEqual(result, NO, String(n)) })
  placed.forEach(function(result, n) { assert.deepStrictEqual(result, usual, String(n)) })
  assert.deepStrictEqual(kept, { ok: true, pct: 44, corner: "top-right", marginX: 0, marginY: 30 })
})

test("placement: every result makes a rule that passes the gate", function() {
  var reservedSets = [[0, 0, 0, 0], [0, 30, 0, 0], [5000, 5000, 5000, 5000], [7, 77, 777, 1777]]
  var count = 0
  reservedSets.forEach(function(reserved) {
    CORNERS.forEach(function(corner) {
      var cases = SIZES.map(function(size) { return [size[0], null] })
      for (var pct = 10; pct <= 90; pct++) cases.push(["half", { "HDMI-A-1": { widthPct: pct } }])
      cases.forEach(function(c) {
        var p = Geometry.placement([monitor({ reserved: reserved })], { css: "9 99 999 0" },
          settings(c[0], corner), c[1])
        var line = Lua.rule(p)
        var code = corner.charAt(0) + corner.charAt(corner.indexOf("-") + 1)
        var signature = "\"" + [p.pct, code, p.marginX, p.marginY].join("-") + "\""
        assert.strictEqual(line.indexOf("if _G.__omajuke_rule ~= " + signature + " then "), 0, line)
        assert.strictEqual(Lua.check(line), true, line)
        count++
      })
    })
  })
  assert.strictEqual(count, 4 * 4 * 85)
  // A refusal makes no rule.
  assert.strictEqual(Lua.rule(Geometry.placement(null, null, null, null)), "")
})

test("placement: a margin that comes to nothing is a plain zero, never a negative one", function() {
  // A small negative number rounded up is a negative zero, and JSON can
  // spell one outright.
  var inputs = [
    [[-0.5, -0.5, -0.5, -0.5], { int: 0 }],
    [[-0.25, -0.75, -0.001, -0.999], { css: "0" }],
    [[0.5, 0.5, 0.5, 0.5], { css: "-1 -1 -1 -1" }],
    [JSON.parse("[-0, -0, -0, -0]"), JSON.parse("{\"int\": -0}")],
    [JSON.parse("[-0, -0, -0, -0]"), { css: "-0 -0 -0 -0" }],
    [[0, 0, 0, 0], { css: "-0" }]
  ]
  inputs.forEach(function(input, i) {
    CORNERS.forEach(function(corner) {
      var result = Geometry.placement([monitor({ reserved: input[0] })], input[1],
        settings("quarter", corner), null)
      assert.strictEqual(result.ok, true, String(i))
      assert.ok(Object.is(result.marginX, 0), "marginX of input " + i + " at " + corner)
      assert.ok(Object.is(result.marginY, 0), "marginY of input " + i + " at " + corner)
      assertSoundPlacement(result, String(i))
    })
  })
})

test("placement: the entry that says it is focused is the entry that is used", function() {
  var reads = 0
  var list = []
  // Focused at the first look, another monitor at every later one.
  Object.defineProperty(list, 0, {
    enumerable: true,
    get: function() {
      reads++
      return reads === 1 ? monitor({ reserved: [0, 0, 7, 9] })
        : monitor({ name: "DP-9", focused: reads === 2, reserved: [500, 500, 500, 500] })
    }
  })
  var result = Geometry.placement(list, { css: "0" }, settings("quarter", "bottom-right"), null)
  assert.deepStrictEqual(result, { ok: true, pct: 25, corner: "bottom-right", marginX: 7, marginY: 9 })
  assert.strictEqual(reads, 1)
})

test("a monitor list is as long as it first says, however often it would answer", function() {
  // A list that reports one more entry every time it is asked would keep a
  // loop that asks each round going for ever. The trap gives up after a
  // thousand questions so that such a loop fails here instead of hanging.
  var growing = function(counter) {
    return new Proxy([monitor()], {
      get: function(target, key) {
        if (key !== "length") return target[key]
        counter.asked++
        if (counter.asked > 1000) throw new Error("asked for the length " + counter.asked + " times")
        return counter.asked
      }
    })
  }
  var placing = { asked: 0 }
  var placed = Geometry.placement(growing(placing), { css: "0" }, settings("half", "top-left"), null)
  assert.deepStrictEqual(placed, { ok: true, pct: 50, corner: "top-left", marginX: 0, marginY: 30 })
  assert.strictEqual(placing.asked, 1)
  var reading = { asked: 0 }
  assert.deepStrictEqual(Geometry.fromWindow(client([1430, 800], [480, 270]), growing(reading)),
    { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 25 })
  assert.strictEqual(reading.asked, 1)

  // A length that is no length at all.
  var lengths = [-1, 0.5, 33, 1e9, Infinity, NaN, "1", null, undefined]
  lengths.forEach(function(length) {
    var odd = new Proxy([monitor()], {
      get: function(target, key) { return key === "length" ? length : target[key] }
    })
    assert.deepStrictEqual(Geometry.placement(odd, { css: "0" }, settings("half", "top-left"), null), NO)
    assert.deepStrictEqual(Geometry.fromWindow(client([1430, 800], [480, 270]), odd), NO)
  })
})

test("placement: leaves its arguments alone and returns a fresh object each time", function() {
  var monitors = [monitor(), monitor({ name: "DP-3", focused: false })]
  var gaps = { css: "1 2 3 4" }
  var chosen = settings("quarter", "top-left")
  var kept = { "HDMI-A-1": { corner: "bottom-left", widthPct: 44 } }
  var before = JSON.stringify([monitors, gaps, chosen, kept])
  var first = Geometry.placement(monitors, gaps, chosen, kept)
  first.pct = 99
  first.corner = "nowhere"
  var second = Geometry.placement(monitors, gaps, chosen, kept)
  assert.notStrictEqual(first, second)
  assert.deepStrictEqual(second, { ok: true, pct: 44, corner: "bottom-left", marginX: 4, marginY: 3 })
  assert.strictEqual(JSON.stringify([monitors, gaps, chosen, kept]), before)
  var refused = Geometry.placement(null, gaps, chosen, kept)
  refused.ok = true
  assert.deepStrictEqual(Geometry.placement(null, gaps, chosen, kept), NO)
})

// ---- fromWindow ----

test("fromWindow: a window placed as a placement says is read back as that placement", function() {
  var monitors = [
    monitor(), monitor({ width: 1280, height: 1024, x: 1920, y: -300, name: "DP-3" }),
    monitor({ width: 3840, height: 2160, scale: 1.5 }), monitor({ width: 2880, height: 1800, scale: 2 }),
    monitor({ transform: 1 }), monitor({ width: 3840, height: 2160, scale: 2, transform: 3, x: -1080 }),
    monitor({ width: 3440, height: 1440 }), monitor({ width: 1270, height: 697 })
  ]
  var count = 0
  monitors.forEach(function(entry) {
    var size = logical(entry)
    CORNERS.forEach(function(corner) {
      for (var pct = 10; pct <= 90; pct++) {
        var p = { pct: pct, corner: corner, marginX: 6, marginY: 8 }
        var win = windowFor(p, entry)
        // A window larger than the space between its margins reaches past
        // the middle and is nearer to the opposite corner, or hangs off the
        // monitor: nothing to read back.
        if (win.size[0] + 2 * p.marginX >= size.w || win.size[1] + 2 * p.marginY >= size.h) continue
        assert.deepStrictEqual(Geometry.fromWindow(win, [entry]),
          { ok: true, name: entry.name, corner: corner, widthPct: pct }, label([p, entry]))
        count++
      }
    })
  })
  assert.ok(count > 1500, String(count))
})

test("fromWindow: what is read back and stored places the next window the same way", function() {
  var entry = monitor()
  var gaps = { css: "10 10 10 10" }
  CORNERS.forEach(function(corner) {
    for (var pct = 10; pct <= 85; pct++) {
      var kept = {}
      kept[entry.name] = { corner: corner, widthPct: pct }
      var p = Geometry.placement([entry], gaps, settings("quarter", "bottom-right"), kept)
      var seen = Geometry.fromWindow(windowFor(p, entry), [entry])
      assert.deepStrictEqual({ corner: seen.corner, widthPct: seen.widthPct }, kept[entry.name])
    }
  })
})

test("fromWindow: the width is the nearest whole percentage, halves going up, from 10 to 90", function() {
  var widths = [1920, 1270, 1000, 200, 3, 1]
  widths.forEach(function(monitorWidth) {
    var entry = monitor({ width: monitorWidth })
    for (var w = 1; w <= monitorWidth; w++) {
      // The same rounding in whole numbers only.
      var nearest = Math.floor((200 * w + monitorWidth) / (2 * monitorWidth))
      var expected = Math.max(10, Math.min(90, nearest))
      var seen = Geometry.fromWindow(client([0, 500], [w, 10]), [entry])
      if (seen.widthPct !== expected) assert.fail(w + " of " + monitorWidth + ": " + seen.widthPct)
    }
  })
})

test("fromWindow: the monitor is the one that holds the centre, and no other", function() {
  var left = monitor({ name: "LEFT-1", width: 1280, height: 1024, x: -1280, y: 0 })
  var middle = monitor({ name: "MIDDLE-1", x: 0, y: 0 })
  var turned = monitor({ name: "TURNED-1", transform: 1, x: 1920, y: -400 })
  var scaled = monitor({ name: "SCALED-1", width: 3840, height: 2160, scale: 2, x: 0, y: 1080 })
  var list = [left, middle, turned, scaled]
  var boxes = list.map(function(entry) {
    var size = logical(entry)
    return { name: entry.name, x0: entry.x, y0: entry.y, x1: entry.x + size.w, y1: entry.y + size.h }
  })
  var sizes = [[320, 180], [321, 181], [1, 1], [2, 2]]
  var found = 0
  sizes.forEach(function(size) {
    for (var x = -1700; x <= 3300; x += 97) {
      for (var y = -700; y <= 2500; y += 89) {
        var cx = x + size[0] / 2
        var cy = y + size[1] / 2
        var holders = boxes.filter(function(b) { return cx >= b.x0 && cx < b.x1 && cy >= b.y0 && cy < b.y1 })
        var seen = Geometry.fromWindow(client([x, y], size), list)
        assert.ok(holders.length <= 1)
        if (holders.length === 0) assert.deepStrictEqual(seen, NO, x + "," + y)
        else assert.strictEqual(seen.name, holders[0].name, x + "," + y)
        if (seen.ok) found++
      }
    }
  })
  assert.ok(found > 1000, String(found))
})

test("fromWindow: every pixel of a monitor's edge is on it, the next pixel is not", function() {
  var scales = [0.5, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
  scales.forEach(function(scale) {
    for (var transform = 0; transform <= 7; transform++) {
      var entry = monitor({ scale: scale, transform: transform, x: 100, y: -50 })
      var size = logical(entry)
      var dot = function(x, y) { return Geometry.fromWindow(client([x, y], [1, 1]), [entry]).ok }
      var name = scale + " " + transform
      assert.strictEqual(dot(100, -50), true, name)
      assert.strictEqual(dot(99, -50), false, name)
      assert.strictEqual(dot(100, -51), false, name)
      assert.strictEqual(dot(100 + size.w - 1, -50 + size.h - 1), true, name)
      assert.strictEqual(dot(100 + size.w, -50 + size.h - 1), false, name)
      assert.strictEqual(dot(100 + size.w - 1, -50 + size.h), false, name)
    }
  })
})

test("fromWindow: one malformed field at a time ends in a refusal or a sound reading", function() {
  var good = client([1430, 800], [480, 270])
  var fields = ["name", "width", "height", "x", "y", "scale", "transform", "focused", "reserved"]
  ODD.forEach(function(value) {
    fields.forEach(function(field) {
      var changes = {}
      changes[field] = value
      assertSoundReading(Geometry.fromWindow(good, [monitor(changes)]), field + " = " + label(value))
      // A second, readable monitor under the same window is still found,
      // unless the first one was readable too and only lacked a name.
      var both = Geometry.fromWindow(good, [monitor(changes), monitor({ name: "DP-9" })])
      assertSoundReading(both, field + " = " + label(value))
    })
    var windowFields = ["at", "size", "floating", "fullscreen", "class", "monitor"]
    windowFields.forEach(function(field) {
      var win = client([1430, 800], [480, 270])
      win[field] = value
      assertSoundReading(Geometry.fromWindow(win, [monitor()]), field + " = " + label(value))
    })
    assertSoundReading(Geometry.fromWindow(value, [monitor()]), "window = " + label(value))
    assertSoundReading(Geometry.fromWindow(good, value), "monitors = " + label(value))
    assertSoundReading(Geometry.fromWindow(good, [value]), "entry = " + label(value))
    assertSoundReading(Geometry.fromWindow(client([value, 800], [480, 270]), [monitor()]), label(value))
    assertSoundReading(Geometry.fromWindow(client([1430, 800], [480, value]), [monitor()]), label(value))
  })
})

test("fromWindow: any mix of malformed fields ends in a refusal or a sound reading", function() {
  var random = makeRandom(19700101)
  var pick = function(usual) { return random(12) === 0 ? ODD[random(ODD.length)] : usual }
  var accepted = 0
  for (var round = 0; round < 30000; round++) {
    var entry = {
      name: pick("HDMI-A-1"), width: pick(1920), height: pick(1080), x: pick(0), y: pick(0), scale: pick(1),
      transform: pick(random(8)), reserved: [pick(0), pick(30), pick(0), pick(0)]
    }
    var win = {
      at: [pick(random(1900)), pick(random(1000))], size: [pick(1 + random(900)), pick(1 + random(500))],
      floating: pick(true), fullscreen: pick(0)
    }
    var result = Geometry.fromWindow(win, [pick(entry), entry])
    assertSoundReading(result, label([win, entry]))
    if (result.ok) accepted++
  }
  assert.ok(accepted > 3000 && accepted < 27000, String(accepted))
})

test("fromWindow: leaves its arguments alone and returns a fresh object each time", function() {
  var monitors = [monitor(), monitor({ name: "DP-3", x: 1920 })]
  var win = client([1430, 800], [480, 270])
  var before = JSON.stringify([win, monitors])
  var first = Geometry.fromWindow(win, monitors)
  first.name = "changed"
  var second = Geometry.fromWindow(win, monitors)
  assert.notStrictEqual(first, second)
  assert.deepStrictEqual(second, { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 25 })
  assert.strictEqual(JSON.stringify([win, monitors]), before)
})

test("neither function throws on input whose fields cannot even be read as numbers", function() {
  var bare = Object.create(null)
  var hostile = [bare, [bare], { at: bare, size: bare }, { css: bare },
    { videoSize: bare, videoCorner: bare }, { "HDMI-A-1": bare }, Object.create(Object.create(null))]
  hostile.forEach(function(value) {
    hostile.forEach(function(other) {
      assertSoundPlacement(Geometry.placement(value, other, value, other), "bare")
      assertSoundPlacement(Geometry.placement([monitor()], other, settings("half", "top-left"), value),
        "bare")
      assertSoundReading(Geometry.fromWindow(value, other), "bare")
      assertSoundReading(Geometry.fromWindow(value, [monitor(), other]), "bare")
    })
  })
})

test("neither function throws on a value that fails when it is read, wherever it stands", function() {
  var gaps = { css: "10 10 10 10" }
  var plain = settings("quarter", "bottom-right")
  var good = client([1430, 800], [480, 270])
  var monitorFields = ["name", "width", "height", "x", "y", "scale", "transform", "focused", "reserved"]
  var windowFields = ["at", "size", "floating", "fullscreen"]
  var calls = 0
  var sound = function(kind, label, call) {
    var result
    assert.doesNotThrow(function() { result = call() }, label)
    if (kind === "placement") assertSoundPlacement(result, label)
    else assertSoundReading(result, label)
    calls++
    return result
  }
  unreadable().forEach(function(value, i) {
    var label = "value " + i
    // In place of each argument, and of an entry of the list.
    sound("placement", label, function() { return Geometry.placement(value, gaps, plain, null) })
    sound("placement", label, function() { return Geometry.placement([value], gaps, plain, null) })
    sound("placement", label, function() { return Geometry.placement([monitor(), value], gaps, plain, null) })
    sound("placement", label, function() { return Geometry.placement([monitor()], value, plain, null) })
    sound("placement", label, function() { return Geometry.placement([monitor()], gaps, value, null) })
    sound("placement", label, function() { return Geometry.placement([monitor()], gaps, plain, value) })
    sound("placement", label, function() { return Geometry.placement(value, value, value, value) })
    sound("reading", label, function() { return Geometry.fromWindow(value, [monitor()]) })
    sound("reading", label, function() { return Geometry.fromWindow(good, value) })
    sound("reading", label, function() { return Geometry.fromWindow(good, [value]) })
    sound("reading", label, function() { return Geometry.fromWindow(good, [value, monitor()]) })
    sound("reading", label, function() { return Geometry.fromWindow(value, value) })
    // In place of each field.
    monitorFields.forEach(function(field) {
      var changes = {}
      changes[field] = value
      sound("placement", label + " " + field, function() {
        return Geometry.placement([monitor(changes)], gaps, plain, null)
      })
      sound("reading", label + " " + field, function() {
        return Geometry.fromWindow(good, [monitor(changes)])
      })
    })
    sound("placement", label, function() {
      return Geometry.placement([monitor()], { css: value }, plain, null)
    })
    sound("placement", label, function() {
      return Geometry.placement([monitor()], { int: value }, plain, null)
    })
    sound("placement", label, function() {
      return Geometry.placement([monitor()], gaps, settings(value, "top-left"), null)
    })
    sound("placement", label, function() {
      return Geometry.placement([monitor()], gaps, settings("half", value), null)
    })
    sound("placement", label, function() {
      return Geometry.placement([monitor()], gaps, plain, { "HDMI-A-1": value })
    })
    sound("placement", label, function() {
      return Geometry.placement([monitor()], gaps, plain, { "HDMI-A-1": { corner: value, widthPct: value } })
    })
    windowFields.forEach(function(field) {
      var win = client([1430, 800], [480, 270])
      win[field] = value
      sound("reading", label + " " + field, function() { return Geometry.fromWindow(win, [monitor()]) })
    })
    sound("reading", label, function() {
      return Geometry.fromWindow(client([value, 800], [480, value]), [monitor()])
    })
  })
  assert.ok(calls > 500, String(calls))

  // What cannot be read is refused, not guessed at.
  var throwing = unreadable()[0]
  assert.deepStrictEqual(Geometry.placement([throwing], gaps, plain, null), NO)
  assert.deepStrictEqual(Geometry.placement([monitor()], throwing, plain, null), NO)
  assert.deepStrictEqual(Geometry.placement([monitor()], gaps, throwing, null), NO)
  assert.deepStrictEqual(Geometry.placement([monitor()], gaps, plain, throwing), NO)
  assert.deepStrictEqual(Geometry.fromWindow(throwing, [monitor()]), NO)
  assert.deepStrictEqual(Geometry.fromWindow(good, [throwing]), NO)
})

// ---- Both modules together ----

test("a rule made from a placement opens a window that is read back as that placement", function() {
  // Placement, the rule line, the window Hyprland would open for that line
  // and the reading of that window, for monitors of many shapes. Hyprland
  // prints a scale with two decimals, so the entry carries less than the
  // desktop size was worked out from.
  var random = makeRandom(31)
  var pick = function(list) { return list[random(list.length)] }
  var modes = [[1920, 1080], [3840, 2160], [1366, 768], [1280, 1024], [3440, 1440], [2880, 1800], [1601, 899],
    [2256, 1504], [1680, 1050]]
  var scales = [1, 1.25, 1.5, 1.6, 5 / 3, 4 / 3, 2, 1.875, 0.8, 3]
  var compared = 0
  var cornersCompared = 0
  for (var round = 0; round < 20000; round++) {
    var mode = pick(modes)
    var scale = pick(scales)
    var transform = random(8)
    var turned = transform % 2 === 1
    var size = {
      w: Math.round((turned ? mode[1] : mode[0]) / scale), h: Math.round((turned ? mode[0] : mode[1]) / scale)
    }
    var entry = monitor({
      width: mode[0], height: mode[1], scale: Number(scale.toFixed(2)), transform: transform,
      x: 1000 * random(5) - 2000, y: 500 * random(5) - 1000,
      reserved: [random(4) === 0 ? random(80) : 0, random(2) === 0 ? 20 + random(30) : 0,
        random(6) === 0 ? random(80) : 0, random(4) === 0 ? random(60) : 0]
    })
    var gaps = [random(21), random(21), random(21), random(21)]
    var kept = {}
    kept[entry.name] = { corner: pick(CORNERS), widthPct: 10 + random(81) }
    var p = Geometry.placement([entry], { css: gaps.join(" ") }, settings("quarter", "top-left"), kept)
    var where = label([entry, gaps, kept])
    assertSoundPlacement(p, where)
    // The margins, worked out a second time: gaps come as top, right,
    // bottom, left and reserved space as left, top, right, bottom.
    var atLeft = p.corner.indexOf("left") !== -1
    var atTop = p.corner.indexOf("top") !== -1
    assert.strictEqual(p.marginX, atLeft ? entry.reserved[0] + gaps[3] : entry.reserved[2] + gaps[1], where)
    assert.strictEqual(p.marginY, atTop ? entry.reserved[1] + gaps[0] : entry.reserved[3] + gaps[2], where)

    var line = Lua.rule(p)
    assert.strictEqual(Lua.check(line), true, where)
    var win = windowOf(line, entry, size)
    var seen = Geometry.fromWindow(win, [entry])
    assertSoundReading(seen, where)
    assert.strictEqual(seen.ok, true, where)
    assert.strictEqual(seen.name, entry.name, where)
    assert.strictEqual(seen.widthPct, p.pct, where)
    compared++
    // A window that reaches past the middle of the space between its
    // margins is as near to the opposite corner: only the others say where
    // they were put.
    if (win.size[0] + 2 * p.marginX >= size.w || win.size[1] + 2 * p.marginY >= size.h) continue
    assert.strictEqual(seen.corner, p.corner, where)
    cornersCompared++
  }
  assert.strictEqual(compared, 20000)
  assert.ok(cornersCompared > 15000, String(cornersCompared))
})
