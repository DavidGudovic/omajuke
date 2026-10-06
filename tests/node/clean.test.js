"use strict"
// Tests for lib/Clean.js: the vector table (also run inside Qt's engine),
// a sweep over every UTF-16 unit, and the guarantees every output must
// keep whatever went in.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Clean = load.lib("Clean")
var Const = load.lib("Const")
var table = load.vectors("clean")

// The characters the cleaner must never let through, as ranges of code
// units: C0, DEL and C1 controls, soft hyphen, Arabic letter mark,
// zero-width and bidi marks, line and paragraph separators, embeddings and
// overrides, invisible operators and isolates, the byte order mark, the
// interlinear annotation marks.
var BANNED = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x200b, 0x200f], [0x2028, 0x202e],
  [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]
]

// The characters that separate words: each becomes a space.
var GAPS = [
  [0x09, 0x0d], [0x20, 0x20], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029],
  [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]
]

// What Python's str.isspace() accepts, which is what yt-dlp's batch reader
// means by whitespace in front of a "#".
var PYTHON_SPACE = /[\t-\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/

function inRanges(ranges, code) {
  return ranges.some(function(range) { return code >= range[0] && code <= range[1] })
}

function isSurrogate(code) {
  return code >= 0xd800 && code <= 0xdfff
}

function hasLoneSurrogate(string) {
  return /[\ud800-\udfff]/.test(string.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""))
}

function hasBanned(string) {
  for (var i = 0; i < string.length; i++) {
    if (inRanges(BANNED, string.charCodeAt(i))) return true
  }
  return false
}

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

// Strings made of the units that matter: words, every kind of space, marks
// the cleaner deletes, both halves of a pair in any order, and the
// characters query() and tooltip() care about.
var ALPHABET = [
  "a", "b", "Z", "9", "\u00e9", "\u65e5", " ", " ", "\t", "\n", "\r", "\u00a0", "\u3000", "\u2028", "\u0000",
  "\u001b", "\u007f", "\u0085", "\u00ad", "\u200b", "\u200d", "\u202e", "\u2066", "\ufeff", "\ufffa",
  "\ud83d", "\ude00", "\ud83d\ude00", "#", "#", "<", ">", "&", "/", "\\", "\"", "'", "-", "."
]

function randomStrings(count, seed) {
  var random = makeRandom(seed)
  var strings = []
  for (var i = 0; i < count; i++) {
    var length = random(48)
    var string = ""
    for (var j = 0; j < length; j++) string += ALPHABET[random(ALPHABET.length)]
    strings.push(string)
  }
  return strings
}

test("exports exactly the documented functions", function() {
  assert.deepStrictEqual(Object.keys(Clean).sort(), ["hasControl", "query", "text", "tooltip"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Clean, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Clean).forEach(function(name) {
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("text: every UTF-16 unit is deleted, turned into a space, or kept", function() {
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var expected = "a" + ch + "b"
    if (inRanges(GAPS, code)) expected = "a b"
    else if (inRanges(BANNED, code) || isSurrogate(code)) expected = "ab"
    assert.strictEqual(Clean.text("a" + ch + "b", 10), expected, code.toString(16))
  }
})

test("text: a banned character survives in no position", function() {
  BANNED.forEach(function(range) {
    for (var code = range[0]; code <= range[1]; code++) {
      var ch = String.fromCharCode(code)
      var inputs = [ch, ch + ch, ch + "a", "a" + ch, "a" + ch + ch + "b", " " + ch + " ", "a " + ch + " b"]
      inputs.forEach(function(input) {
        assert.strictEqual(hasBanned(Clean.text(input, 10)), false, code.toString(16))
      })
    }
  })
})

test("text: half a surrogate pair never survives, a whole pair always does", function() {
  for (var code = 0xd800; code <= 0xdfff; code++) {
    var half = String.fromCharCode(code)
    assert.strictEqual(Clean.text(half, 10), "", code.toString(16))
    assert.strictEqual(Clean.text("a" + half + "b", 10), "ab", code.toString(16))
    assert.strictEqual(Clean.text(half + "\ud83d\ude00" + half, 10), "\ud83d\ude00", code.toString(16))
  }
  var pairs = ["\ud800\udc00", "\ud83d\ude00", "\udbff\udfff"]
  pairs.forEach(function(pair) {
    assert.strictEqual(Clean.text(pair, 10), pair)
    assert.strictEqual(Clean.text("a" + pair + pair + "b", 10), "a" + pair + pair + "b")
  })
})

test("text: the cut never exceeds the cap and never splits a pair", function() {
  var emoji = "\ud83d\ude00"
  var inputs = [emoji.repeat(6), "a" + emoji.repeat(6), "ab" + emoji + "c" + emoji + emoji, "a b c d e f g"]
  inputs.forEach(function(input) {
    for (var max = 0; max <= input.length + 2; max++) {
      var out = Clean.text(input, max)
      assert.ok(out.length <= max, input + " at " + max)
      assert.strictEqual(hasLoneSurrogate(out), false, input + " at " + max)
      assert.strictEqual(input.indexOf(out), 0, input + " at " + max)
      assert.strictEqual(out, out.trim())
    }
    assert.strictEqual(Clean.text(input, input.length), input)
  })
})

test("text: a missing or senseless cap yields the empty text", function() {
  var caps = [undefined, null, NaN, Infinity, -Infinity, -1, 0, 0.9, "", "abc", "4", {}, [], [4], true]
  caps.forEach(function(max) {
    assert.strictEqual(Clean.text("some text", max), "", String(max))
  })
  assert.strictEqual(Clean.text("some text"), "")
  assert.strictEqual(Clean.text("some text", 4.99), "some")
})

test("text: no value makes it throw, and only primitives have a text form", function() {
  var bare = Object.create(null)
  var hostile = { toString: function() { throw new Error("no") } }
  var silent = [undefined, null, bare, hostile, {}, [], ["a"], function() {}, Symbol("s"), new String("b")]
  silent.forEach(function(value) {
    assert.strictEqual(Clean.text(value, 20), "")
    assert.strictEqual(Clean.query(value), "")
    assert.strictEqual(Clean.tooltip(value), "")
  })
  assert.strictEqual(Clean.text(0, 20), "0")
  assert.strictEqual(Clean.text(false, 20), "false")
  assert.strictEqual(Clean.text(NaN, 20), "NaN")
})

test("text: what comes out is clean, bounded and stable for any input", function() {
  randomStrings(4000, 1).forEach(function(input) {
    var caps = [0, 1, 2, 5, 13, 300]
    caps.forEach(function(max) {
      var out = Clean.text(input, max)
      var label = JSON.stringify(input) + " at " + max
      assert.ok(out.length <= max, label)
      assert.strictEqual(hasBanned(out), false, label)
      assert.strictEqual(hasLoneSurrogate(out), false, label)
      assert.strictEqual(/ {2}/.test(out), false, label)
      assert.strictEqual(/^ | $/.test(out), false, label)
      assert.strictEqual(/[\t\n\r\u00a0\u3000]/.test(out), false, label)
      assert.strictEqual(Clean.hasControl(out), false, label)
      assert.strictEqual(Clean.text(out, max), out, label)
    })
  })
})

test("query: yt-dlp's batch reader gets one line with nothing it reads as a comment", function() {
  randomStrings(4000, 2).forEach(function(input) {
    var out = Clean.query(input)
    var label = JSON.stringify(input)
    assert.ok(out.length <= Const.LIMITS.queryChars, label)
    assert.strictEqual(hasBanned(out), false, label)
    assert.strictEqual(hasLoneSurrogate(out), false, label)
    // The only whitespace left is the plain space, and none of them is followed by "#".
    assert.strictEqual(PYTHON_SPACE.test(out.replace(/ /g, "")), false, label)
    assert.strictEqual(out.indexOf(" #"), -1, label)
    assert.strictEqual(/ {2}/.test(out), false, label)
    assert.strictEqual(/^ | $/.test(out), false, label)
    assert.strictEqual(Clean.query(out), out, label)
    // Nothing but "#" and spaces is ever taken out of the cleaned text.
    var cleaned = Clean.text(input, Const.LIMITS.queryChars)
    assert.strictEqual(out.replace(/[ #]/g, ""), cleaned.replace(/[ #]/g, ""), label)
  })
})

test("query: cuts at the query length", function() {
  var limit = Const.LIMITS.queryChars
  assert.strictEqual(Clean.query("a".repeat(limit)).length, limit)
  assert.strictEqual(Clean.query("a".repeat(limit + 50)).length, limit)
  // The cut falls behind a space here, and the space goes too.
  assert.strictEqual(Clean.query("a ".repeat(limit)).length, limit - 1)
})

test("tooltip: one short line that cannot open a tag", function() {
  randomStrings(4000, 3).forEach(function(input) {
    var out = Clean.tooltip(input)
    var label = JSON.stringify(input)
    assert.ok(out.length <= 80, label)
    assert.strictEqual(/[<>]/.test(out), false, label)
    assert.strictEqual(hasBanned(out), false, label)
    assert.strictEqual(hasLoneSurrogate(out), false, label)
    assert.strictEqual(out.replace(/\u2039/g, "<").replace(/\u203a/g, ">"), Clean.text(input, 80), label)
  })
  assert.strictEqual(Clean.tooltip("<".repeat(200)), "\u2039".repeat(80))
})

test("hasControl: true for C0 controls, DEL and anything that is not a string", function() {
  for (var code = 0; code <= 0xffff; code++) {
    var expected = code < 0x20 || code === 0x7f
    assert.strictEqual(Clean.hasControl("a" + String.fromCharCode(code) + "b"), expected, code.toString(16))
  }
  var others = [undefined, null, 0, 1, NaN, true, {}, [], ["a"], function() {}, new String("boxed")]
  others.forEach(function(value) {
    assert.strictEqual(Clean.hasControl(value), true)
  })
})

test("no input makes the functions slow", function() {
  var size = 1 << 20
  var hostile = [
    " ".repeat(size), " ".repeat(size) + "x", "x" + " ".repeat(size) + "x", "\u200b".repeat(size),
    "\ud83d".repeat(size), "\ud83d\ude00".repeat(size / 2), " #".repeat(size / 2), "#".repeat(size),
    "a ".repeat(size / 2), "<>".repeat(size / 2), "\n".repeat(size), "\u0000".repeat(size) + "a"
  ]
  hostile.forEach(function(input, i) {
    var start = process.hrtime.bigint()
    Clean.text(input, 300)
    Clean.query(input)
    Clean.tooltip(input)
    Clean.hasControl(input)
    var ms = Number(process.hrtime.bigint() - start) / 1e6
    assert.ok(ms < 2000, "input " + i + " took " + Math.round(ms) + " ms")
  })
})
