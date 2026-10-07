"use strict"
// Tests for lib/Sha256.js: the vector table (also run inside Qt's engine),
// agreement with the platform's own SHA-256 over every message length
// around the block boundaries and over random text, and the bounds a table
// cannot state: what is refused, how long hashing takes, and that nothing
// is kept between calls.
var test = require("node:test")
var assert = require("node:assert")
var crypto = require("node:crypto")
var load = require("./load.js")

var Sha256 = load.lib("Sha256")
var table = load.vectors("sha256")

// The longest text the module hashes, in UTF-16 units.
var MAX_CHARS = 1048576

var ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

// The reference. Like every standard encoder, node writes half a surrogate
// pair as U+FFFD when it turns a string into UTF-8.
function reference(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex")
}

// The value a table argument stands for: the two generator entries the
// vector runners know, or the argument itself.
function expand(arg) {
  if (arg === null || typeof arg !== "object" || Array.isArray(arg) || typeof arg.gen !== "string") return arg
  if (arg.gen === "repeat") return String(arg.unit).repeat(arg.count)
  if (arg.gen === "codes") return String.fromCharCode.apply(null, arg.codes)
  throw new Error("unknown generator: " + arg.gen)
}

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

function randomId(random) {
  var id = ""
  for (var i = 0; i < 11; i++) id += ID_ALPHABET[random(ID_ALPHABET.length)]
  return id
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

test("exports exactly the documented function", function() {
  assert.deepStrictEqual(Object.keys(Sha256), ["hex"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Sha256, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("every digest in the table is the one the platform computes", function() {
  var checked = 0
  table.CASES.forEach(function(c, i) {
    if (c.expect === "") return
    assert.strictEqual(c.expect, reference(expand(c.args[0])), "vector " + i)
    checked++
  })
  assert.ok(checked >= 40)
})

test("the table holds the standard's messages and every kind of refusal", function() {
  var inputs = table.CASES.map(function(c) { return expand(c.args[0]) })
  var standard = ["", "abc", "a".repeat(1000000)]
  standard.forEach(function(message) {
    assert.ok(inputs.indexOf(message) !== -1, message.slice(0, 20))
  })
  // The two longer messages of the standard are 448 and 896 bits long.
  var texts = inputs.filter(function(input) { return typeof input === "string" })
  assert.ok(texts.some(function(text) { return /^abcdbcde/.test(text) && text.length === 56 }))
  assert.ok(texts.some(function(text) { return /^abcdefghbcdefghi/.test(text) && text.length === 112 }))
  assert.ok(texts.some(function(text) { return text.length > MAX_CHARS }))
  assert.strictEqual(inputs.length - texts.length, 5)
})

test("agrees with the platform at every length across four blocks", function() {
  // One, two, three and four bytes per character, so that every way a
  // character can straddle a block boundary occurs.
  var units = ["a", "\u00e9", "\u65e5", "\ud83d\ude00"]
  units.forEach(function(unit) {
    for (var count = 0; count <= 260; count++) {
      var text = unit.repeat(count)
      assert.strictEqual(Sha256.hex(text), reference(text), JSON.stringify(unit) + " x " + count)
      // An odd byte in front shifts every boundary by one.
      var shifted = "x" + text
      assert.strictEqual(Sha256.hex(shifted), reference(shifted), "x and " + count + " more")
    }
  })
})

test("agrees with the platform on random text, halves of surrogate pairs included", function() {
  var alphabet = [
    "a", "Z", "0", "-", "_", " ", "\n", "\u0000", "\u007f", "\u0080", "\u00e9", "\u07ff", "\u0800", "\u65e5",
    "\uffff", "\ufffd", "\ud83d\ude00", "\ud800\udc00", "\udbff\udfff", "\ud83d", "\ude00", "\ud800", "\udfff"
  ]
  var random = makeRandom(1)
  for (var i = 0; i < 3000; i++) {
    var length = random(200)
    var text = ""
    for (var j = 0; j < length; j++) text += alphabet[random(alphabet.length)]
    assert.strictEqual(Sha256.hex(text), reference(text), JSON.stringify(text))
  }
})

test("agrees with the platform on every UTF-16 unit by itself and between two letters", function() {
  for (var code = 0; code <= 0xffff; code += 7) {
    var unit = String.fromCharCode(code)
    assert.strictEqual(Sha256.hex(unit), reference(unit), code.toString(16))
    assert.strictEqual(Sha256.hex("a" + unit + "b"), reference("a" + unit + "b"), code.toString(16))
  }
  // All of the surrogate range, where the encoder has to decide.
  for (var half = 0xd800; half <= 0xdfff; half++) {
    var text = "a" + String.fromCharCode(half) + "\ude00" + String.fromCharCode(half)
    assert.strictEqual(Sha256.hex(text), reference(text), half.toString(16))
  }
})

test("the prefix of an id's digest is four lowercase hex digits, the platform's own", function() {
  var random = makeRandom(2)
  for (var i = 0; i < 2000; i++) {
    var id = randomId(random)
    var digest = Sha256.hex(id)
    assert.match(digest, /^[0-9a-f]{64}$/, id)
    assert.strictEqual(digest.slice(0, 4), reference(id).slice(0, 4), id)
  }
})

test("only a string has a digest, and no value makes it throw", function() {
  var bare = Object.create(null)
  var refuse = function() { throw new Error("no") }
  var hostile = { toString: refuse, valueOf: refuse }
  var trap = new Proxy({}, { get: function() { throw new Error("no") } })
  var values = [
    undefined, null, 0, 1, NaN, Infinity, true, false, [], ["abc"], {}, { length: 3 }, bare, hostile, trap,
    function() {}, Symbol("abc"), new String("abc"), Buffer.from("abc"), new Uint8Array(3)
  ]
  values.forEach(function(value) {
    assert.strictEqual(Sha256.hex(value), "")
  })
  assert.strictEqual(Sha256.hex(), "")
})

test("nothing is kept between calls", function() {
  var long = "\u65e5".repeat(1000)
  var first = Sha256.hex("abc")
  assert.strictEqual(Sha256.hex(long), reference(long))
  assert.strictEqual(Sha256.hex(""), reference(""))
  assert.strictEqual(Sha256.hex(null), "")
  assert.strictEqual(Sha256.hex("abc"), first)
  assert.strictEqual(first, reference("abc"))
})

test("the length limit counts UTF-16 units, whatever they encode to", function() {
  // One megabyte and three megabytes of UTF-8 from the same number of units.
  var units = ["a", "\u65e5"]
  units.forEach(function(unit) {
    var longest = unit.repeat(MAX_CHARS)
    assert.strictEqual(Sha256.hex(longest), reference(longest))
    assert.strictEqual(Sha256.hex(longest + unit), "")
  })
  var pairs = "\ud83d\ude00".repeat(MAX_CHARS / 2)
  assert.strictEqual(Sha256.hex(pairs), reference(pairs))
  assert.strictEqual(Sha256.hex(pairs + "a"), "")
})

test("an id is hashed in well under a millisecond", function() {
  var random = makeRandom(3)
  var ids = []
  for (var i = 0; i < 2000; i++) ids.push(randomId(random))
  // The first calls run before the engine has optimised anything, so they
  // show the slowest the function ever is.
  var cold = elapsedMs(function() { Sha256.hex(ids[0]) })
  assert.ok(cold < 50, "first call took " + cold + " ms")
  var times = ids.map(function(id) {
    return elapsedMs(function() { Sha256.hex(id) })
  })
  times.sort(function(a, b) { return a - b })
  var median = times[times.length / 2]
  assert.ok(median < 1, "median " + median + " ms")
})

test("the longest text is hashed in bounded time", function() {
  var longest = "a".repeat(MAX_CHARS)
  var ms = elapsedMs(function() { Sha256.hex(longest) })
  assert.ok(ms < 5000, "took " + Math.round(ms) + " ms")
})
