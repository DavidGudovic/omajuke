"use strict"
// Tests for lib/Lua.js: the vector table (also run inside Qt's engine), and
// both halves of what the gate promises. Everything the three templates can
// return passes check(), shown over the whole space of valid input. And
// nothing else passes: every text one edit away from a valid line, and
// every valid line with an injection spliced in, is refused unless it is
// itself a line the templates return. What "a line the templates return"
// means is written out here a second time, independently of the module.
// Last, the names inside the lines: they follow the constants as these
// were when the file loaded, and a name of the wrong shape stops everything.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var Lua = load.lib("Lua")
var Const = load.lib("Const")
var table = load.vectors("lua")

// ---- The valid input space, spelled out without the module's help ----

var MODIFIERS = ["MOD4", "CONTROL", "MOD1", "SHIFT"]
var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
var KEYS = LETTERS.concat(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"])

var ACTIONS = [
  { name: "panel", words: "toggle", description: "OmaJuke: open panel" },
  { name: "video", words: "video toggle", description: "OmaJuke: show or hide video" },
  { name: "output", words: "output next", description: "OmaJuke: next audio output" },
  { name: "playPause", words: "playPause", description: "OmaJuke: play or pause" },
  { name: "next", words: "next", description: "OmaJuke: next track" },
  { name: "previous", words: "previous", description: "OmaJuke: previous track" }
]

var CORNERS = [
  { name: "top-left", code: "tl" },
  { name: "top-right", code: "tr" },
  { name: "bottom-left", code: "bl" },
  { name: "bottom-right", code: "br" }
]

// Margins that cover every number of digits and both ends of the range.
var MARGINS = [0, 1, 4, 9, 10, 30, 99, 100, 999, 1000, 1999, 2000]

// A subset of the modifiers in their fixed order, then one key. The mask
// has a bit per modifier; without one of the first three bits the key would
// be bare or shifted only.
function combinations(wanted) {
  var out = []
  for (var mask = 0; mask < 16; mask++) {
    if (((mask & 7) !== 0) !== wanted) continue
    var held = MODIFIERS.filter(function(name, bit) { return (mask & (1 << bit)) !== 0 })
    KEYS.forEach(function(key) { out.push(held.concat([key]).join(" + ")) })
  }
  return out
}

var ALIASES = combinations(true)
// What the key grammar alone would also allow: a bare key, or Shift and a key.
var TYPED_KEYS = combinations(false)

function expectedUnbind(alias) {
  return "hl.unbind(\"" + alias + "\")"
}

function expectedBind(alias, action) {
  return "hl.bind(\"" + alias + "\", hl.dsp.exec_cmd(\"omarchy-shell -q " + Const.PLUGIN_ID + " "
    + action.words + "\"), { description = \"" + action.description + "\" })"
}

// The rule, written out a second time: eight pieces joined by single
// spaces, the width a fraction with two decimals, the height 9/16 of it
// with six.
function expectedRule(pct, corner, marginX, marginY) {
  var f = (pct / 100).toFixed(2)
  var g = (pct * 9 / 1600).toFixed(6)
  var signature = [pct, corner.code, marginX, marginY].join("-")
  var fromRight = "\"(monitor_w-monitor_w*" + f + "-" + marginX + ")\""
  var fromBottom = "\"(monitor_h-monitor_w*" + g + "-" + marginY + ")\""
  var x = corner.code.charAt(1) === "l" ? String(marginX) : fromRight
  var y = corner.code.charAt(0) === "t" ? String(marginY) : fromBottom
  return [
    "if _G.__omajuke_rule ~= \"" + signature + "\" then",
    "hl.window_rule({ name = \"omajuke-video\", match = { class = \"^OmaJuke$\" },",
    "float = true, pin = true, no_initial_focus = true, keep_aspect_ratio = true, no_dim = true,",
    "border_size = 0, tag = \"-default-opacity\", opacity = \"1 1\",",
    "size = { \"(monitor_w*" + f + ")\", \"(monitor_w*" + g + ")\" },",
    "move = { " + x + ", " + y + " } })",
    "_G.__omajuke_rule = \"" + signature + "\"",
    "end"
  ].join(" ")
}

// Every bind and every removal there is. Rules are too many to list (over a
// billion), so isOurs() recognises them by their signature instead.
var SHORT_LINES = new Set()
ALIASES.forEach(function(alias) {
  SHORT_LINES.add(expectedUnbind(alias))
  ACTIONS.forEach(function(action) { SHORT_LINES.add(expectedBind(alias, action)) })
})

var SIGNED = /^if _G\.__omajuke_rule ~= "([0-9]{1,9})-(tl|tr|bl|br)-([0-9]{1,9})-([0-9]{1,9})" then /

// The answer check() has to give for any text at all.
function isOurs(text) {
  if (typeof text !== "string") return false
  if (SHORT_LINES.has(text)) return true
  var found = SIGNED.exec(text)
  if (!found) return false
  var pct = Number(found[1])
  var marginX = Number(found[3])
  var marginY = Number(found[4])
  if (pct < 10 || pct > 90 || marginX > 2000 || marginY > 2000) return false
  var corner = CORNERS.filter(function(c) { return c.code === found[2] })[0]
  return text === expectedRule(pct, corner, marginX, marginY)
}

function place(pct, corner, marginX, marginY) {
  return { pct: pct, corner: corner, marginX: marginX, marginY: marginY }
}

// ---- Edits and injections ----

// Every printable ASCII character, then the ones that should never get
// anywhere: controls, separators, invisible marks, look-alikes of the quote,
// the bracket and of letters and digits a combination uses, half a
// surrogate pair.
var ALPHABET = []
for (var code = 0x20; code <= 0x7e; code++) ALPHABET.push(String.fromCharCode(code))
ALPHABET = ALPHABET.concat([
  "\n", "\r", "\t", "\u0000", "\u001b", "\u007f", "\u0085", "\u00a0", "\u2028", "\u200b", "\u202e",
  "\ufeff", "\u201c", "\u201d", "\u2033", "\uff02", "\uff08", "\uff09", "\u0410", "\u0412", "\u041c",
  "\u039f", "\uff14", "\uff0b", "\ud83d", "\ude00"
])

// Calls visit with every text that is one edit away from the line: one
// character inserted, removed or replaced, or two neighbours swapped.
function eachEdit(line, visit) {
  for (var i = 0; i <= line.length; i++) {
    var head = line.slice(0, i)
    var tail = line.slice(i)
    for (var a = 0; a < ALPHABET.length; a++) visit(head + ALPHABET[a] + tail)
    if (i === line.length) break
    visit(head + tail.slice(1))
    for (var b = 0; b < ALPHABET.length; b++) {
      if (ALPHABET[b] !== tail.charAt(0)) visit(head + ALPHABET[b] + tail.slice(1))
    }
    if (tail.length > 1 && tail.charAt(0) !== tail.charAt(1)) {
      visit(head + tail.charAt(1) + tail.charAt(0) + tail.slice(2))
    }
  }
}

// Runs every edit of every line through check() and the oracle, which must
// agree on each one. Returns the edits that were accepted.
function sweepEdits(lines) {
  var accepted = new Set()
  lines.forEach(function(line) {
    eachEdit(line, function(edited) {
      var got = Lua.check(edited)
      if (got !== isOurs(edited)) assert.fail("check() is " + got + " for " + JSON.stringify(edited))
      if (got) accepted.add(edited)
    })
  })
  return accepted
}

// What an attacker would try to get into a line: ways out of a string,
// comments, long brackets, statement separators, further calls, shell and
// client syntax, and characters that only look like the right ones.
var PAYLOADS = [
  "\"", "'", "\"\"", "\" .. \"", "]]", "[[", "]==]", "--", "--[[", "--]]", "\n", "\r\n", "\n\n", ";", "; ",
  " os.execute(\"x\")", "; os.execute(\"x\")", "\") os.execute(\"x", "\" os.execute(\"x\") \"",
  "os.execute'x'", "io.popen(\"x\")", "hl.unbind(\"all\")", " hl.unbind(\"all\") ", "\") hl.unbind(\"all",
  "hl.dispatch(\"exit\")", "require(\"x\")", "load(\"x\")()", "\\", "\\\"", "\\n", "\\x22", "\\034",
  "\u0060x\u0060", "$(x)", "${x}", "| x", "&& x", "> x", "/", "/instances", "/--batch", "../", "%s", "%",
  "\u0000", "\u0000\"", "\u001b[2J", "\u007f", "\u00a0", "\u2028", "\u2029", "\u200b", "\u200e", "\u202e",
  "\ufeff", "\u201c", "\u201d", "\u2033", "\uff02", "\uff07", "\uff3d\uff3d", "\uff0d\uff0d", "\ud83d"
]

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

// ---- Evaluating a rule ----

// The value of one size or move entry of a rule on a monitor: a product
// binds tighter than a difference, and there is nothing else in them.
function evaluate(entry, monitor) {
  var found = /^"\(([a-z_0-9.*-]+)\)"$/.exec(entry)
  var expression = found ? found[1] : entry
  return expression.split("-").reduce(function(total, term, index) {
    var product = term.split("*").reduce(function(value, factor) {
      if (factor === "monitor_w") return value * monitor.w
      if (factor === "monitor_h") return value * monitor.h
      assert.match(factor, /^[0-9]+(\.[0-9]+)?$/)
      return value * Number(factor)
    }, 1)
    return index === 0 ? product : total - product
  }, 0)
}

// Where a rule puts the window on a monitor, before any rounding.
function boxOf(line, monitor) {
  var found = /size = \{ (\S+), (\S+) \}, move = \{ (\S+), (\S+) \} \}\)/.exec(line)
  assert.ok(found, line)
  return {
    w: evaluate(found[1], monitor),
    h: evaluate(found[2], monitor),
    x: evaluate(found[3], monitor),
    y: evaluate(found[4], monitor)
  }
}

// Hyprland rounds the near corner and the far corner of the box.
function rounded(box) {
  var x = Math.round(box.x)
  var y = Math.round(box.y)
  return { x: x, y: y, w: Math.round(box.x + box.w) - x, h: Math.round(box.y + box.h) - y }
}

function near(a, b) {
  return Math.abs(a - b) < 1e-6
}

// ---- Loading the module with other constants ----

// lib/Lua.js evaluated around a stand-in for lib/Const.js, to see what the
// templates do when a name inside them changes. The names in reveal are
// private parts of the module that the result should carry as well.
function loadWith(constants, reveal) {
  var file = path.join(__dirname, "..", "..", "lib", "Lua.js")
  var lines = fs.readFileSync(file, "utf8").split("\n")
  var directives = lines.filter(function(line) { return line.charAt(0) === "." })
  assert.deepStrictEqual(directives, [".pragma library", ".import \"Const.js\" as Const"])
  var body = lines.map(function(line) { return line.charAt(0) === "." ? "" : line })
  var revealed = reveal || []
  revealed.forEach(function(name) { body.push("module.exports." + name + " = " + name) })
  var mod = { exports: {} }
  new Function("Const", "module", body.join("\n"))(constants, mod)
  return mod.exports
}

// The three constants the module reads, with some of them replaced.
function names(overrides) {
  var real = { APP_NAME: Const.APP_NAME, DIR_NAME: Const.DIR_NAME, PLUGIN_ID: Const.PLUGIN_ID }
  return Object.assign(real, overrides)
}

// ---- The table ----

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(Lua).sort(), ["TESTED", "bind", "check", "rule", "unbind"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Lua, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Lua).forEach(function(name) {
    if (typeof Lua[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("every line the table expects check to accept is a line the templates return", function() {
  table.CASES.forEach(function(c, i) {
    if (c.fn !== "check" || c.expect !== true) return
    assert.strictEqual(isOurs(c.args[0]), true, "case " + i)
  })
})

test("TESTED lists release prefixes, each a full major and minor number", function() {
  assert.deepStrictEqual(Lua.TESTED.slice(), ["0.56."])
  // "0.5" would also stand at the start of 0.56 and of 0.50 to 0.59.
  Lua.TESTED.forEach(function(prefix) { assert.match(prefix, /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.$/) })
  // The list is frozen against a slip. That is all it is: under node a
  // write to it fails, Qt's engine carries it out, so nothing relies on it.
  assert.strictEqual(Object.isFrozen(Lua.TESTED), true)
  assert.throws(function() { Lua.TESTED.push("") }, TypeError)
})

// ---- Everything the templates return passes ----

test("the lines have their known sizes: 438 and at most 456 bytes, 156 and 38", function() {
  var quarter = Lua.rule(place(25, "bottom-right", 4, 4))
  var largest = Lua.rule(place(90, "bottom-right", 2000, 2000))
  var bound = Lua.bind("MOD4 + CONTROL + MOD1 + V", "video")
  var removed = Lua.unbind("MOD4 + CONTROL + MOD1 + V")
  assert.strictEqual(quarter.length, 438)
  assert.strictEqual(largest.length, 456)
  assert.strictEqual(bound.length, 156)
  assert.strictEqual(removed.length, 38)
})

test("there are 532 combinations, and bind and unbind return the exact line for each", function() {
  assert.strictEqual(ALIASES.length, 532)
  assert.strictEqual(new Set(ALIASES).size, 532)
  assert.strictEqual(SHORT_LINES.size, 532 * (ACTIONS.length + 1))
  ALIASES.forEach(function(alias) {
    var removed = Lua.unbind(alias)
    assert.strictEqual(removed, expectedUnbind(alias))
    assert.strictEqual(Lua.check(removed), true, removed)
    ACTIONS.forEach(function(action) {
      var bound = Lua.bind(alias, action.name)
      assert.strictEqual(bound, expectedBind(alias, action))
      assert.strictEqual(Lua.check(bound), true, bound)
    })
  })
})

test("rule returns the exact line for every size, corner and margin width, and it passes", function() {
  var longest = 0
  var count = 0
  for (var pct = 10; pct <= 90; pct++) {
    CORNERS.forEach(function(corner) {
      MARGINS.forEach(function(marginX) {
        MARGINS.forEach(function(marginY) {
          var line = Lua.rule(place(pct, corner.name, marginX, marginY))
          if (line !== expectedRule(pct, corner, marginX, marginY)) assert.fail(line)
          if (!Lua.check(line)) assert.fail(line)
          longest = Math.max(longest, line.length)
          count++
        })
      })
    })
  }
  assert.strictEqual(count, 81 * 4 * 144)
  assert.strictEqual(longest, 456)
})

test("rule returns the exact line for every margin from 0 to 2000, and it passes", function() {
  for (var margin = 0; margin <= 2000; margin++) {
    CORNERS.forEach(function(corner) {
      var line = Lua.rule(place(25, corner.name, margin, 2000 - margin))
      if (line !== expectedRule(25, corner, margin, 2000 - margin)) assert.fail(line)
      if (!Lua.check(line)) assert.fail(line)
    })
  }
})

test("the two fractions are a hundredth of the percentage and 9/16 of that", function() {
  for (var pct = 10; pct <= 90; pct++) {
    var line = Lua.rule(place(pct, "top-left", 0, 0))
    var found = /size = \{ "\(monitor_w\*(0\.[0-9]{2})\)", "\(monitor_w\*(0\.[0-9]{6})\)" \}/.exec(line)
    assert.ok(found, line)
    assert.strictEqual(Number(found[1]), pct / 100)
    assert.ok(near(Number(found[2]), pct / 100 * 9 / 16), line)
  }
})

test("every line is printable ASCII, far below the size cap, with none of the forbidden parts", function() {
  var lines = Array.from(SHORT_LINES)
  CORNERS.forEach(function(corner) {
    for (var pct = 10; pct <= 90; pct++) lines.push(Lua.rule(place(pct, corner.name, 2000, 2000)))
  })
  lines.forEach(function(line) {
    assert.match(line, /^[\x20-\x7e]+$/)
    assert.strictEqual(Buffer.byteLength(line), line.length)
    assert.ok(line.length <= 456, line)
    // The client sends "/eval " and the line. A request that fills blocks
    // of 1023 bytes exactly is the one the compositor chokes on.
    assert.notStrictEqual((6 + line.length) % 1023, 0)
    var forbidden = ["/", "\\", "\u0060", "--", "[[", "]]", "'", ";", "\n"]
    forbidden.forEach(function(part) { assert.strictEqual(line.indexOf(part), -1, line) })
    // hyprctl would take a leading hyphen for one of its own options.
    assert.notStrictEqual(line.charAt(0), "-")
  })
})

test("no line keeps a handle, calls a method or sets a global other than the rule's guard", function() {
  var lines = Array.from(SHORT_LINES)
  CORNERS.forEach(function(corner) { lines.push(Lua.rule(place(25, corner.name, 4, 4))) })
  lines.forEach(function(line) {
    assert.doesNotMatch(line, /=\s*hl\.(bind|window_rule)/)
    assert.doesNotMatch(line, /\b(local|function|return|require|load|os|io|debug)\b/)
    // The only colon is the one inside a bind's description.
    assert.doesNotMatch(line, /:(?! )/)
    assert.ok(line.split(":").length <= 2, line)
    var globals = line.match(/_G\.[A-Za-z_0-9]+/g) || []
    globals.forEach(function(name) { assert.strictEqual(name, "_G.__omajuke_rule") })
    var calls = line.match(/[A-Za-z_.]+\(/g) || []
    calls.forEach(function(call) {
      assert.ok(["hl.bind(", "hl.unbind(", "hl.window_rule(", "hl.dsp.exec_cmd("].indexOf(call) !== -1, call)
    })
  })
})

test("a bind's description has no comma, and its command names this plugin and nothing else", function() {
  ACTIONS.forEach(function(action) {
    var line = Lua.bind("MOD4 + V", action.name)
    var found = /^hl\.bind\("MOD4 \+ V", hl\.dsp\.exec_cmd\("([^"]*)"\), \{ description = "([^"]*)" \}\)$/
      .exec(line)
    assert.ok(found, line)
    assert.strictEqual(found[1], "omarchy-shell -q " + Const.PLUGIN_ID + " " + action.words)
    assert.match(found[1], /^[A-Za-z0-9 .-]+$/)
    assert.strictEqual(found[2], action.description)
    assert.strictEqual(found[2].indexOf(","), -1)
    assert.strictEqual(found[2].indexOf(Const.APP_NAME + ": "), 0)
  })
})

// ---- What the rule does on a monitor ----

test("a quarter in the bottom-right corner lands where Hyprland puts it", function() {
  var line = Lua.rule(place(25, "bottom-right", 4, 4))
  assert.deepStrictEqual(rounded(boxOf(line, { w: 1920, h: 1080 })), { x: 1436, y: 806, w: 480, h: 270 })
  // An odd-sized output, where a quarter of the width is half a pixel off.
  assert.deepStrictEqual(rounded(boxOf(line, { w: 1270, h: 697 })), { x: 949, y: 514, w: 317, h: 179 })
})

test("every rule gives a sixteen-by-nine window at its margins from its own corner", function() {
  var monitors = [{ w: 1920, h: 1080 }, { w: 1270, h: 697 }, { w: 1200, h: 1920 }, { w: 3840, h: 1080 }]
  monitors.forEach(function(monitor) {
    for (var pct = 10; pct <= 90; pct++) {
      CORNERS.forEach(function(corner) {
        var box = boxOf(Lua.rule(place(pct, corner.name, 12, 34)), monitor)
        assert.ok(near(box.w, monitor.w * pct / 100))
        assert.ok(near(box.h, box.w * 9 / 16))
        var left = corner.name.indexOf("left") !== -1
        var top = corner.name.indexOf("top") !== -1
        assert.ok(near(left ? box.x : monitor.w - box.x - box.w, 12), corner.name)
        assert.ok(near(top ? box.y : monitor.h - box.y - box.h, 34), corner.name)
      })
    }
  })
})

// ---- Nothing else passes ----

test("rule refuses every value outside its bounds", function() {
  var badPcts = [9, 91, 0, -10, 10.5, 89.999, 1e3, NaN, Infinity, -Infinity, "25", "", null, undefined, true,
    [25], { valueOf: function() { return 25 } }, new Number(25)]
  var badMargins = [-1, 2001, 0.5, 1999.5, -0.0001, 1e9, NaN, Infinity, -Infinity, "4", "", null, undefined,
    false, [4], { valueOf: function() { return 4 } }, new Number(4)]
  var badCorners = ["", "br", "tl", "BOTTOM-RIGHT", "bottom_right", "bottom-right ", " bottom-right", "left",
    "bottom", "constructor", "__proto__", "toString", "0", 0, 3, null, undefined, true, ["bottom-right"],
    { name: "bottom-right" }, new String("bottom-right")]
  badPcts.forEach(function(pct) {
    assert.strictEqual(Lua.rule(place(pct, "bottom-right", 4, 4)), "", String(pct))
  })
  badMargins.forEach(function(margin) {
    assert.strictEqual(Lua.rule(place(25, "bottom-right", margin, 4)), "", String(margin))
    assert.strictEqual(Lua.rule(place(25, "top-left", 4, margin)), "", String(margin))
  })
  badCorners.forEach(function(corner) {
    assert.strictEqual(Lua.rule(place(25, corner, 4, 4)), "", String(corner))
  })
  var notPlacements = [undefined, null, 0, 25, "", "25-br-4-4", true, [], [25, "bottom-right", 4, 4],
    function() {}, Object.create(null)]
  notPlacements.forEach(function(value) { assert.strictEqual(Lua.rule(value), "") })
  // Negative zero is zero.
  assert.strictEqual(Lua.rule(place(25, "top-left", -0, -0)), Lua.rule(place(25, "top-left", 0, 0)))
})

test("rule reads each value once, so a value cannot change after it was checked", function() {
  var reads = { pct: 0, corner: 0, marginX: 0, marginY: 0 }
  var first = { pct: 25, corner: "bottom-right", marginX: 4, marginY: 4 }
  var shifty = {}
  Object.keys(first).forEach(function(key) {
    Object.defineProperty(shifty, key, {
      get: function() { return reads[key]++ === 0 ? first[key] : "4\") os.execute(\"x" }
    })
  })
  assert.strictEqual(Lua.rule(shifty), Lua.rule(first))
  assert.deepStrictEqual(reads, { pct: 1, corner: 1, marginX: 1, marginY: 1 })
})

test("rule gives no line, and no error, for a placement that cannot be read", function() {
  var refuse = function() { throw new Error("unreadable") }
  var unreadable = ["pct", "corner", "marginX", "marginY"].map(function(field) {
    var p = place(25, "bottom-right", 4, 4)
    Object.defineProperty(p, field, { enumerable: true, get: refuse })
    return p
  })
  var revoked = Proxy.revocable(place(25, "bottom-right", 4, 4), {})
  revoked.revoke()
  unreadable.push(revoked.proxy)
  unreadable.push(new Proxy(place(25, "bottom-right", 4, 4), { get: refuse }))
  unreadable.forEach(function(p, i) {
    assert.doesNotThrow(function() { assert.strictEqual(Lua.rule(p), "") }, "placement " + i)
  })
  // A wrapper that hands everything through is read like the object itself.
  var passing = new Proxy(place(25, "bottom-right", 4, 4), {})
  assert.strictEqual(Lua.rule(passing), Lua.rule(place(25, "bottom-right", 4, 4)))
})

test("no function throws on a value of any kind, and none makes a line from one", function() {
  var refuse = function() { throw new Error("unreadable") }
  var kinds = [Symbol("s"), 10n, new Date(0), /x/, new Map(), new Set(), function() {}, Object.create(null),
    { toString: refuse, valueOf: refuse }]
  kinds.forEach(function(value, i) {
    assert.doesNotThrow(function() {
      assert.strictEqual(Lua.rule(value), "")
      assert.strictEqual(Lua.rule(place(value, "bottom-right", 4, 4)), "")
      assert.strictEqual(Lua.rule(place(25, value, 4, 4)), "")
      assert.strictEqual(Lua.rule(place(25, "bottom-right", value, 4)), "")
      assert.strictEqual(Lua.rule(place(25, "bottom-right", 4, value)), "")
      assert.strictEqual(Lua.bind(value, "panel"), "")
      assert.strictEqual(Lua.bind("MOD4 + V", value), "")
      assert.strictEqual(Lua.unbind(value), "")
      assert.strictEqual(Lua.check(value), false)
    }, "kind " + i)
  })
})

test("of all short sequences of modifier and key names only the 532 combinations are taken", function() {
  var words = ["MOD4", "CONTROL", "MOD1", "SHIFT", "SUPER", "CTRL", "ALT", "MOD5", "mod4"]
  var keys = KEYS.concat(["", "F0", "F13", "F00", "AA", "a", "f1", "1", "ESCAPE", "SPACE", "all"])
  var valid = new Set(ALIASES)
  var prefixes = [[]]
  for (var length = 1; length <= 4; length++) {
    prefixes.filter(function(p) { return p.length === length - 1 }).forEach(function(p) {
      words.forEach(function(word) { prefixes.push(p.concat([word])) })
    })
  }
  var taken = 0
  prefixes.forEach(function(prefix) {
    keys.forEach(function(key) {
      var alias = prefix.concat([key]).join(" + ")
      var expected = valid.has(alias)
      if ((Lua.unbind(alias) !== "") !== expected) assert.fail("unbind: " + alias)
      if ((Lua.bind(alias, "video") !== "") !== expected) assert.fail("bind: " + alias)
      if (Lua.check(expectedUnbind(alias)) !== expected) assert.fail("check: " + alias)
      if (Lua.check(expectedBind(alias, ACTIONS[1])) !== expected) assert.fail("check: " + alias)
      if (expected) taken++
    })
  })
  assert.strictEqual(taken, 532)
})

test("a bare key, or Shift and a key, is never bound and never unbound", function() {
  assert.strictEqual(TYPED_KEYS.length, 76)
  TYPED_KEYS.forEach(function(alias) {
    assert.strictEqual(Lua.unbind(alias), "", alias)
    assert.strictEqual(Lua.check(expectedUnbind(alias)), false, alias)
    ACTIONS.forEach(function(action) {
      assert.strictEqual(Lua.bind(alias, action.name), "", alias)
      assert.strictEqual(Lua.check(expectedBind(alias, action)), false, alias)
    })
  })
})

test("a combination with the separator, case or spacing changed is not a combination", function() {
  ["MOD4 + V", "MOD4 + CONTROL + MOD1 + SHIFT + F12"].forEach(function(alias) {
    var variants = [
      alias.toLowerCase(), alias.replace(/ \+ /g, "+"), alias.replace(/ \+ /g, " "),
      alias.replace(/ \+ /g, "  +  "), alias.replace(/ \+ /g, " - "), alias.replace(/ \+ /g, ", "),
      alias.replace(/ \+ /g, "\t+\t"), alias.replace(/ \+ /g, "\u00a0+\u00a0"), alias + " + ",
      " + " + alias, alias + " ", " " + alias, alias + alias, alias + " + " + alias, alias + "\n",
      alias + "\u0000", "\"" + alias + "\"", alias.replace("MOD4", "MOD4 + MOD4"),
      alias.replace("MOD4", "SUPER"), alias.replace("MOD4", "WIN"), alias.replace("MOD4", "MOD3")
    ]
    variants.forEach(function(variant) {
      assert.strictEqual(Lua.unbind(variant), "", JSON.stringify(variant))
      assert.strictEqual(Lua.bind(variant, "panel"), "", JSON.stringify(variant))
      assert.strictEqual(Lua.check(expectedUnbind(variant)), false, JSON.stringify(variant))
    })
  })
})

test("bind takes only the six action names, and only as plain strings", function() {
  var bad = ["", "Panel", "PANEL", "panel ", " panel", "panels", "toggle", "video toggle", "output next",
    "constructor", "__proto__", "prototype", "toString", "hasOwnProperty", "name", "description", "command",
    "length", "0", "1", 0, 1, null, undefined, true, ["panel"], { name: "panel" }, new String("panel")]
  bad.forEach(function(action) {
    assert.strictEqual(Lua.bind("MOD4 + V", action), "", String(action))
  })
  var notText = [undefined, null, 0, true, ["MOD4 + V"], { toString: function() { return "MOD4 + V" } },
    new String("MOD4 + V")]
  notText.forEach(function(alias) {
    assert.strictEqual(Lua.bind(alias, "panel"), "")
    assert.strictEqual(Lua.unbind(alias), "")
  })
})

test("check takes only plain strings", function() {
  var line = Lua.unbind("MOD4 + V")
  var notText = [undefined, null, 0, 1, true, [line], { toString: function() { return line } },
    new String(line), function() { return line }]
  notText.forEach(function(value) { assert.strictEqual(Lua.check(value), false) })
  assert.strictEqual(Lua.check(line), true)
})

test("check is quick to refuse text of any length", function() {
  var long = [" ".repeat(901), "a".repeat(1e6), "(".repeat(1e6), "hl.unbind(\"".repeat(1e5),
    Lua.rule(place(25, "bottom-right", 4, 4)).repeat(3), "\"MOD4 + ".repeat(1e5)]
  var start = process.hrtime.bigint()
  long.forEach(function(text) { assert.strictEqual(Lua.check(text), false) })
  assert.ok(Number(process.hrtime.bigint() - start) / 1e6 < 500)
})

test("no template is slowed or tripped by a value of any size or depth", function() {
  var deep = {}
  var level = deep
  for (var i = 0; i < 100000; i++) {
    level.corner = { pct: [level] }
    level = level.corner
  }
  var wide = new Array(1e6).fill("MOD4 + V")
  var long = "MOD4 + ".repeat(2e5) + "V"
  var start = process.hrtime.bigint()
  var made = [
    Lua.rule(deep), Lua.rule(wide), Lua.rule(place(deep, deep, deep, deep)),
    Lua.rule(place(wide, long, wide, long)), Lua.rule(place(25, long, 4, 4)), Lua.bind(long, "video"),
    Lua.bind("MOD4 + V", long), Lua.bind(wide, deep), Lua.unbind(long), Lua.unbind(wide), Lua.unbind(deep)
  ]
  assert.ok(Number(process.hrtime.bigint() - start) / 1e6 < 500)
  made.forEach(function(line) { assert.strictEqual(line, "") })
})

test("no edit of a rule passes: every corner, and margins of every width", function() {
  var lines = CORNERS.map(function(corner) { return Lua.rule(place(25, corner.name, 4, 30)) })
  lines.push(Lua.rule(place(10, "bottom-right", 0, 0)))
  lines.push(Lua.rule(place(90, "bottom-right", 2000, 1999)))
  lines.push(Lua.rule(place(33, "top-left", 100, 10)))
  lines.push(Lua.rule(place(50, "top-right", 11, 111)))
  lines.forEach(function(line) { assert.strictEqual(Lua.check(line), true) })
  // Each number of a rule stands in three places or more, so one edit can
  // never turn a rule into another rule.
  assert.strictEqual(sweepEdits(lines).size, 0)
})

test("an edit of a bind or a removal passes only when it is another one of them", function() {
  var aliases = ["MOD4 + V", "MOD4 + CONTROL + MOD1 + V", "MOD1 + F1", "CONTROL + SHIFT + F11",
    "MOD4 + CONTROL + MOD1 + SHIFT + F10", "MOD4 + SHIFT + A"]
  var lines = aliases.map(function(alias) { return Lua.unbind(alias) })
  aliases.forEach(function(alias, i) { lines.push(Lua.bind(alias, ACTIONS[i % 3].name)) })
  ACTIONS.forEach(function(action) { lines.push(Lua.bind("MOD1 + Z", action.name)) })
  // A key can turn into another key and one modifier into another, so
  // some neighbours are lines of ours. The sweep has to meet those too.
  assert.ok(sweepEdits(lines).size > 200)
})

test("the edits of one removal that pass are exactly its neighbouring combinations", function() {
  var neighbours = ["MOD4 + F1", "MOD1 + F", "MOD1 + F2", "MOD1 + F3", "MOD1 + F4", "MOD1 + F5", "MOD1 + F6",
    "MOD1 + F7", "MOD1 + F8", "MOD1 + F9", "MOD1 + F10", "MOD1 + F11", "MOD1 + F12"]
  var accepted = Array.from(sweepEdits([Lua.unbind("MOD1 + F1")])).sort()
  assert.deepStrictEqual(accepted, neighbours.map(expectedUnbind).sort())
})

test("no valid line with an injection spliced in at any position passes", function() {
  var lines = [
    Lua.rule(place(25, "bottom-right", 4, 4)), Lua.rule(place(17, "top-left", 0, 30)),
    Lua.bind("MOD4 + CONTROL + MOD1 + V", "video"), Lua.bind("MOD4 + J", "panel"),
    Lua.bind("MOD1 + SHIFT + F12", "output"), Lua.unbind("MOD4 + CONTROL + MOD1 + V"), Lua.unbind("MOD1 + F1")
  ]
  lines.forEach(function(line) {
    PAYLOADS.forEach(function(payload) {
      for (var i = 0; i <= line.length; i++) {
        var spliced = line.slice(0, i) + payload + line.slice(i)
        if (Lua.check(spliced)) assert.fail(JSON.stringify(spliced))
        if (isOurs(spliced)) assert.fail("the oracle takes " + JSON.stringify(spliced))
      }
    })
  })
})

test("no payload passes in place of a combination, an action or a number", function() {
  PAYLOADS.concat(["all", "ALL", "V", "*", ".*", "MOD4 + V\") hl.unbind(\"all"]).forEach(function(payload) {
    assert.strictEqual(Lua.unbind(payload), "", JSON.stringify(payload))
    assert.strictEqual(Lua.unbind("MOD4 + V" + payload), "", JSON.stringify(payload))
    assert.strictEqual(Lua.unbind(payload + "MOD4 + V"), "", JSON.stringify(payload))
    assert.strictEqual(Lua.bind("MOD4 + V" + payload, "video"), "", JSON.stringify(payload))
    assert.strictEqual(Lua.bind("MOD4 + V", "video" + payload), "", JSON.stringify(payload))
    assert.strictEqual(Lua.bind("MOD4 + V", payload), "", JSON.stringify(payload))
    assert.strictEqual(Lua.rule(place(25, "bottom-right" + payload, 4, 4)), "", JSON.stringify(payload))
    assert.strictEqual(Lua.rule(place("25" + payload, "bottom-right", 4, 4)), "", JSON.stringify(payload))
    assert.strictEqual(Lua.rule(place(25, "bottom-right", "4" + payload, 4)), "", JSON.stringify(payload))
    assert.strictEqual(Lua.check(payload), false, JSON.stringify(payload))
    assert.strictEqual(Lua.check(expectedUnbind(payload)), false, JSON.stringify(payload))
  })
})

test("a rule put together from the parts of several rules passes only if the parts agree", function() {
  // Every slot of a rule filled on its own: a line of the right shape whose
  // numbers need not belong together. Only the oracle knows which are rules.
  var random = makeRandom(11)
  var pick = function(list) { return list[random(list.length)] }
  var pcts = [10, 17, 25, 33, 50, 90, 9, 91, 99]
  var margins = [0, 4, 30, 100, 2000, 2001, 9999]
  var fractions = pcts.map(function(pct) { return (pct / 100).toFixed(2) })
  var heights = pcts.map(function(pct) { return (pct * 9 / 1600).toFixed(6) })
  var passed = 0
  var rounds = 60000
  for (var round = 0; round < rounds; round++) {
    // Mostly one consistent rule, with each slot replaced now and then.
    var pct = pick(pcts.slice(0, 6))
    var corner = pick(CORNERS)
    var marginX = pick(margins.slice(0, 5))
    var marginY = pick(margins.slice(0, 5))
    var slot = function(usual, others) { return random(6) === 0 ? pick(others) : usual }
    var signature = function() {
      var code = slot(corner, CORNERS).code
      return [slot(pct, pcts), code, slot(marginX, margins), slot(marginY, margins)].join("-")
    }
    var f = (pct / 100).toFixed(2)
    var g = (pct * 9 / 1600).toFixed(6)
    var fromRight = "\"(monitor_w-monitor_w*" + slot(f, fractions) + "-" + slot(marginX, margins) + ")\""
    var fromBottom = "\"(monitor_h-monitor_w*" + slot(g, heights) + "-" + slot(marginY, margins) + ")\""
    var left = slot(corner.code.charAt(1) === "l", [true, false])
    var top = slot(corner.code.charAt(0) === "t", [true, false])
    var line = [
      "if _G.__omajuke_rule ~= \"" + signature() + "\" then",
      "hl.window_rule({ name = \"omajuke-video\", match = { class = \"^OmaJuke$\" },",
      "float = true, pin = true, no_initial_focus = true, keep_aspect_ratio = true, no_dim = true,",
      "border_size = 0, tag = \"-default-opacity\", opacity = \"1 1\",",
      "size = { \"(monitor_w*" + slot(f, fractions) + ")\", \"(monitor_w*" + slot(g, heights) + ")\" },",
      "move = { " + (left ? String(slot(marginX, margins)) : fromRight) + ", "
        + (top ? String(slot(marginY, margins)) : fromBottom) + " } })",
      "_G.__omajuke_rule = \"" + signature() + "\"",
      "end"
    ].join(" ")
    var got = Lua.check(line)
    if (got !== isOurs(line)) assert.fail("check() is " + got + " for " + line)
    if (got) passed++
  }
  // Both answers have to be common, or the sweep says little.
  assert.ok(passed > rounds / 20 && passed < rounds / 2, String(passed))
})

test("a bind passes only when command and description belong to the same action", function() {
  var passed = 0
  ALIASES.forEach(function(alias) {
    ACTIONS.forEach(function(command) {
      ACTIONS.forEach(function(described) {
        var line = expectedBind(alias, { words: command.words, description: described.description })
        if (Lua.check(line) !== (command === described)) assert.fail(line)
        if (command === described) passed++
      })
    })
  })
  assert.strictEqual(passed, 532 * ACTIONS.length)
})

test("several edits at once pass only when the result is a line of ours", function() {
  var random = makeRandom(5)
  var lines = [
    Lua.rule(place(25, "bottom-right", 4, 4)), Lua.rule(place(10, "top-left", 0, 2000)),
    Lua.bind("MOD4 + CONTROL + MOD1 + V", "video"), Lua.bind("MOD1 + F1", "panel"),
    Lua.unbind("MOD4 + V"), Lua.unbind("CONTROL + SHIFT + F12")
  ]
  // Half of the edits fall inside the first quoted part (the combination,
  // or a rule's signature) and use the characters found there, so that a
  // text of several edits has a real chance of being another line of ours.
  var likely = "0129AFJV".split("")
  var passed = 0
  for (var round = 0; round < 60000; round++) {
    var text = lines[random(lines.length)]
    var edits = 2 + random(3)
    for (var e = 0; e < edits; e++) {
      var open = text.indexOf("\"") + 1
      var close = text.indexOf("\"", open)
      var inside = random(2) === 0 && open > 0 && close >= open
      var at = inside ? open + random(close - open + 1) : random(text.length + 1)
      var ch = inside ? likely[random(likely.length)] : ALPHABET[random(ALPHABET.length)]
      var kind = random(3)
      if (kind === 0) text = text.slice(0, at) + ch + text.slice(at)
      else if (kind === 1) text = text.slice(0, at) + text.slice(at + 1)
      else text = text.slice(0, at) + ch + text.slice(at + 1)
    }
    var got = Lua.check(text)
    if (got !== isOurs(text)) assert.fail("check() is " + got + " for " + JSON.stringify(text))
    if (got) passed++
  }
  // Rare, but it has to happen for the sweep to have met both answers.
  assert.ok(passed > 20, String(passed))
})

test("two lines are never one line", function() {
  var lines = [
    Lua.rule(place(25, "bottom-right", 4, 4)), Lua.bind("MOD4 + V", "video"), Lua.unbind("MOD4 + V")
  ]
  var joints = ["", " ", "  ", "\n", "; ", "\t", " and ", " or ", ", "]
  lines.forEach(function(first) {
    lines.forEach(function(second) {
      joints.forEach(function(joint) {
        assert.strictEqual(Lua.check(first + joint + second), false, first + joint + second)
      })
    })
  })
})

// ---- The layers of the gate, one at a time ----

// check() refuses a bad line several times over, so from outside one layer
// could go missing unnoticed. These tests reach inside for each of them.
var Inner = loadWith(Const, ["_isPlain", "_RULE_RE", "_BIND_RE", "_UNBIND_RE"])

test("first layer: text of at most 900 bytes, printable ASCII, none of the forbidden parts", function() {
  assert.strictEqual(Inner._isPlain(""), true)
  assert.strictEqual(Inner._isPlain("a".repeat(900)), true)
  assert.strictEqual(Inner._isPlain("a".repeat(901)), false)
  // Longer in bytes than in characters: refused as not ASCII, whatever its length.
  assert.strictEqual(Inner._isPlain("\u00e9".repeat(450)), false)
  var banned = "/\\\u0060"
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var plain = code >= 0x20 && code <= 0x7e && banned.indexOf(ch) === -1
    if (Inner._isPlain("a" + ch + "b") !== plain) assert.fail(code.toString(16))
    if (Inner._isPlain(ch) !== plain) assert.fail(code.toString(16))
  }
  var pairs = ["--", "[[", "]]"]
  pairs.forEach(function(pair) {
    assert.strictEqual(Inner._isPlain("a" + pair + "b"), false, pair)
    assert.strictEqual(Inner._isPlain(pair), false, pair)
    assert.strictEqual(Inner._isPlain("a" + pair.charAt(0) + "b"), true, pair)
    assert.strictEqual(Inner._isPlain("a" + pair.charAt(0) + " " + pair.charAt(1) + "b"), true, pair)
  })
  var notText = [undefined, null, 0, true, ["a"], { length: 1 }, new String("a")]
  notText.forEach(function(value) { assert.strictEqual(Inner._isPlain(value), false) })
})

test("second layer: three patterns, each anchored at both ends, no two for the same line", function() {
  var patterns = [Inner._RULE_RE, Inner._BIND_RE, Inner._UNBIND_RE]
  patterns.forEach(function(pattern) {
    assert.strictEqual(pattern.flags, "")
    assert.strictEqual(pattern.source.charAt(0), "^")
    assert.strictEqual(pattern.source.charAt(pattern.source.length - 1), "$")
    assert.match(pattern.source, /^[\x20-\x7e]+$/)
    // Nothing Qt's engine cannot compile: lookbehind, named groups, properties.
    assert.doesNotMatch(pattern.source, /\(\?<|\\[pPk]/)
  })
  var lines = [
    Lua.rule(place(25, "bottom-right", 4, 4)), Lua.rule(place(17, "top-left", 0, 2000)),
    Lua.rule(place(90, "top-right", 2000, 0)), Lua.rule(place(10, "bottom-left", 30, 30)),
    Lua.bind("MOD4 + V", "panel"), Lua.bind("MOD4 + CONTROL + MOD1 + SHIFT + F12", "output"),
    Lua.unbind("MOD4 + V"), Lua.unbind("MOD1 + SHIFT + F10")
  ]
  lines.forEach(function(line) {
    var matching = patterns.filter(function(pattern) { return pattern.test(line) })
    assert.strictEqual(matching.length, 1, line)
    var padded = [" " + line, line + " ", "x" + line, line + "x", line + "\n", "\n" + line, line + line,
      line + " " + line]
    padded.forEach(function(text) {
      patterns.forEach(function(pattern) { assert.strictEqual(pattern.test(text), false, text) })
    })
  })
})

test("second layer: the patterns alone refuse every forbidden part and every stray character", function() {
  var lines = [
    Lua.rule(place(25, "bottom-right", 4, 4)), Lua.bind("MOD4 + V", "video"), Lua.unbind("MOD4 + V")
  ]
  var parts = ["/", "\\", "\u0060", "--", "[[", "]]", "\n", "\u0000", "\u00a0", "\"", "'", ";"]
  lines.forEach(function(line) {
    parts.forEach(function(part) {
      for (var i = 0; i <= line.length; i++) {
        var text = line.slice(0, i) + part + line.slice(i)
        if (Inner._RULE_RE.test(text) || Inner._BIND_RE.test(text) || Inner._UNBIND_RE.test(text)) {
          assert.fail(JSON.stringify(text))
        }
      }
    })
  })
})

// ---- The names inside the lines ----

test("the lines follow the constants: other valid names give other lines, and those pass", function() {
  var other = loadWith(names({ APP_NAME: "Other9", DIR_NAME: "other9", PLUGIN_ID: "someone.other-plugin" }))
  var ruleLine = other.rule(place(25, "bottom-right", 4, 4))
  var bindLine = other.bind("MOD4 + V", "panel")
  assert.ok(ruleLine.indexOf("class = \"^Other9$\"") !== -1, ruleLine)
  assert.ok(ruleLine.indexOf("name = \"other9-video\"") !== -1, ruleLine)
  assert.ok(ruleLine.indexOf("if _G.__other9_rule ~= \"25-br-4-4\" then ") === 0, ruleLine)
  assert.strictEqual(bindLine, "hl.bind(\"MOD4 + V\", hl.dsp.exec_cmd(\"omarchy-shell -q someone.other-plugin"
    + " toggle\"), { description = \"Other9: open panel\" })")
  assert.strictEqual(other.check(ruleLine), true)
  assert.strictEqual(other.check(bindLine), true)
  // Each module accepts its own lines only.
  assert.strictEqual(Lua.check(ruleLine), false)
  assert.strictEqual(Lua.check(bindLine), false)
  assert.strictEqual(other.check(Lua.rule(place(25, "bottom-right", 4, 4))), false)
  assert.strictEqual(other.check(Lua.bind("MOD4 + V", "panel")), false)
})

test("a name that could leave a string, a pattern or a shell word stops every template", function() {
  var hostile = [
    { APP_NAME: "Oma\"Juke" }, { APP_NAME: "OmaJuke$\" }, x = \"" }, { APP_NAME: ".*" },
    { APP_NAME: "Oma Juke" },
    { APP_NAME: "" }, { APP_NAME: "OmaJuke\n" }, { APP_NAME: null }, { APP_NAME: undefined }, { APP_NAME: 7 },
    { APP_NAME: "A".repeat(33) }, { APP_NAME: "Oma-Juke" },
    { DIR_NAME: "oma juke" }, { DIR_NAME: "omajuke\" os.execute(\"x" }, { DIR_NAME: "x = 1 _G.y" },
    { DIR_NAME: "" }, { DIR_NAME: "OmaJuke" }, { DIR_NAME: "oma-juke" }, { DIR_NAME: null },
    { PLUGIN_ID: Const.PLUGIN_ID + "; x" }, { PLUGIN_ID: Const.PLUGIN_ID + "\"" },
    { PLUGIN_ID: "$(x).omajuke" }, { PLUGIN_ID: "a.b c" }, { PLUGIN_ID: "a.b--c" }, { PLUGIN_ID: "omajuke" },
    { PLUGIN_ID: "A.omajuke" }, { PLUGIN_ID: "a.b\n" }, { PLUGIN_ID: "" }, { PLUGIN_ID: null },
    { PLUGIN_ID: "a." + "b".repeat(63) }, { PLUGIN_ID: "a.b/c" }, { PLUGIN_ID: "-q.x" }
  ]
  hostile.forEach(function(overrides) {
    var broken = loadWith(names(overrides))
    var label = JSON.stringify(overrides)
    assert.strictEqual(broken.rule(place(25, "bottom-right", 4, 4)), "", label)
    assert.strictEqual(broken.bind("MOD4 + V", "panel"), "", label)
    assert.strictEqual(broken.unbind("MOD4 + V"), "", label)
    assert.strictEqual(broken.check(Lua.rule(place(25, "bottom-right", 4, 4))), false, label)
    assert.strictEqual(broken.check(Lua.bind("MOD4 + V", "panel")), false, label)
    assert.strictEqual(broken.check(Lua.unbind("MOD4 + V")), false, label)
  })
})

test("the names are read once, when the file loads: a later change reaches no line", function() {
  var reads = { APP_NAME: 0, DIR_NAME: 0, PLUGIN_ID: 0 }
  var shifting = {}
  Object.keys(reads).forEach(function(key) {
    Object.defineProperty(shifting, key, {
      enumerable: true,
      // Sound at the first look, a way out of the string at every later one.
      get: function() { return reads[key]++ === 0 ? Const[key] : "x\" }) os.execute(\"y\") hl.bind(\"" }
    })
  })
  var loaded = loadWith(shifting)
  var p = place(25, "top-right", 4, 30)
  var lines = [loaded.rule(p), loaded.bind("MOD4 + V", "video"), loaded.unbind("MOD4 + V")]
  assert.deepStrictEqual(lines, [Lua.rule(p), Lua.bind("MOD4 + V", "video"), Lua.unbind("MOD4 + V")])
  lines.forEach(function(line) { assert.strictEqual(loaded.check(line), true, line) })
  assert.deepStrictEqual(reads, { APP_NAME: 1, DIR_NAME: 1, PLUGIN_ID: 1 })

  // The same with constants that are simply assigned to after loading.
  var plain = names({})
  var kept = loadWith(plain)
  plain.APP_NAME = "x\" } }) os.execute(\"y\") hl.window_rule({ match = { class = \"z"
  plain.DIR_NAME = "x = 1 os.execute(\"y\") _G.z"
  plain.PLUGIN_ID = "a.b; y"
  assert.strictEqual(kept.rule(p), Lua.rule(p))
  assert.strictEqual(kept.bind("MOD4 + V", "video"), Lua.bind("MOD4 + V", "video"))
  assert.strictEqual(kept.check(kept.rule(p)), true)
})

test("a name of a kind that cannot even be joined to text stops every template", function() {
  var kinds = [Symbol("s"), 10n, {}, [], ["OmaJuke"], function() { return "OmaJuke" }, new String("OmaJuke"),
    { toString: function() { throw new Error("toString") } }, "a".repeat(1e6)]
  kinds.forEach(function(value, i) {
    ["APP_NAME", "DIR_NAME", "PLUGIN_ID"].forEach(function(key) {
      var overrides = {}
      overrides[key] = value
      var broken
      assert.doesNotThrow(function() { broken = loadWith(names(overrides)) }, key + " " + i)
      assert.strictEqual(broken.rule(place(25, "bottom-right", 4, 4)), "")
      assert.strictEqual(broken.bind("MOD4 + V", "panel"), "")
      assert.strictEqual(broken.unbind("MOD4 + V"), "")
      assert.strictEqual(broken.check(Lua.unbind("MOD4 + V")), false)
    })
  })
})

test("the real constants have the shapes the lines rely on", function() {
  assert.match(Const.PLUGIN_ID, /^[a-z0-9]+(\.[a-z0-9-]+)+$/)
  assert.match(Const.APP_NAME, /^[A-Za-z][A-Za-z0-9]*$/)
  assert.match(Const.DIR_NAME, /^[a-z][a-z0-9]*$/)
  assert.notStrictEqual(Lua.unbind("MOD4 + V"), "")
})
