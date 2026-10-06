"use strict"
// Tests for lib/Ids.js: the vector table (also run inside Qt's engine), and
// the properties a table cannot state, such as "every refused link is also
// kept away from the search" and "no input makes these functions slow".
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Ids = load.lib("Ids")
var Const = load.lib("Const")
var table = load.vectors("ids")

var ID = "Abc123Def4Q"
// Valid ids that look like something else: options, prototype members.
var ODD_IDS = ["constructor", "--no-config", "--update-to", "-AAAAAAAAAA", "___________", "0123456789a"]
var NOT_IDS = [
  "", "Abc123Def4", "Abc123Def4QQ", "Abc123Def4 ", "Abc123Def4\n", "Abc123Def4Q\n", "Abc123Def4/",
  "Abc123Def4&", "Abc123Def4?", "Abc123Def4#", "../../../etc", "__proto__",
  null, undefined, 12345678901, true, ["Abc123Def4Q"], { id: "Abc123Def4Q" }
]

// Every character the trim removes (what String.prototype.trim removes).
var SPACES = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff
]

// Not whitespace, although some of them look like it: next line, zero-width
// space, the Mongolian vowel separator, a bidi override, NUL.
var NOT_SPACES = [0x85, 0x200b, 0x180e, 0x202e, 0x00]

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

test("exports exactly the documented functions", function() {
  assert.deepStrictEqual(Object.keys(Ids).sort(),
    ["isId", "looksLikeUrl", "mixUrl", "parseVideoRef", "thumbUrl", "watchUrl"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Ids, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Ids).forEach(function(name) {
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("a URL built from an id parses back to that id", function() {
  [ID].concat(ODD_IDS).forEach(function(id) {
    assert.strictEqual(Ids.isId(id), true, id)
    assert.strictEqual(Ids.watchUrl(id), "https://www.youtube.com/watch?v=" + id)
    assert.strictEqual(Ids.thumbUrl(id), "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg")
    assert.strictEqual(Ids.mixUrl(id), "https://www.youtube.com/watch?v=" + id + "&list=RD" + id)
    assert.strictEqual(Ids.parseVideoRef(Ids.watchUrl(id), false), id)
    assert.strictEqual(Ids.parseVideoRef(Ids.mixUrl(id), false), id)
    assert.strictEqual(Ids.parseVideoRef(id, true), id)
    assert.strictEqual(Ids.parseVideoRef(id, false), "")
  })
})

test("the URL builders throw on anything that is not an id, with a constant message", function() {
  var builders = [Ids.watchUrl, Ids.thumbUrl, Ids.mixUrl]
  NOT_IDS.forEach(function(bad) {
    assert.strictEqual(Ids.isId(bad), false)
    builders.forEach(function(build) {
      // The message ends up in the shell's log, so it must not carry the input.
      assert.throws(function() { build(bad) }, function(error) { return error.message === "bad id" })
    })
  })
})

test("a bare id is taken only when the caller passes exactly true", function() {
  [false, undefined, null, 0, 1, "true", "yes", {}, []].forEach(function(flag) {
    assert.strictEqual(Ids.parseVideoRef(ID, flag), "")
  })
  assert.strictEqual(Ids.parseVideoRef(ID, true), ID)
})

test("whitespace around a link is ignored, anything else in front of it is not", function() {
  SPACES.forEach(function(code) {
    var space = String.fromCharCode(code)
    var hex = code.toString(16)
    assert.strictEqual(Ids.parseVideoRef(space + "https://youtu.be/" + ID + space, false), ID, hex)
    assert.strictEqual(Ids.parseVideoRef("https://youtu.be/" + space + ID, false), "", hex)
  })
  NOT_SPACES.forEach(function(code) {
    var other = String.fromCharCode(code)
    assert.strictEqual(Ids.parseVideoRef(other + "https://youtu.be/" + ID, false), "", code.toString(16))
    assert.strictEqual(Ids.parseVideoRef("https://youtu.be/" + ID + other, false), "", code.toString(16))
  })
})

test("the trim agrees with String.prototype.trim on every UTF-16 unit under node", function() {
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var trimmed = (ch + "x" + ch).trim() === "x"
    assert.strictEqual(Ids.parseVideoRef(ch + ID + ch, true) === ID, trimmed, code.toString(16))
  }
})

test("a link is refused beyond the reference length, counted after trimming", function() {
  var head = "https://youtu.be/" + ID + "?"
  var longest = head + "a".repeat(Const.LIMITS.refChars - head.length)
  assert.strictEqual(longest.length, Const.LIMITS.refChars)
  assert.strictEqual(Ids.parseVideoRef(longest, false), ID)
  assert.strictEqual(Ids.parseVideoRef("   " + longest + "\n\n", false), ID)
  assert.strictEqual(Ids.parseVideoRef(longest + "a", false), "")
})

test("a link the parser refuses is never left to be searched for", function() {
  var checked = 0
  table.CASES.forEach(function(c) {
    var input = c.args[0]
    if (c.fn !== "parseVideoRef" || typeof input !== "string" || c.expect !== "") return
    if (input.indexOf("/") === -1 && input.indexOf(":") === -1) return
    assert.strictEqual(Ids.looksLikeUrl(input), true, JSON.stringify(input))
    checked++
  })
  assert.ok(checked >= 30)
})

test("looksLikeUrl gives the same answer with whitespace around the text", function() {
  table.CASES.forEach(function(c) {
    if (c.fn !== "looksLikeUrl" || typeof c.args[0] !== "string") return
    assert.strictEqual(Ids.looksLikeUrl(" \t" + c.args[0] + "\n "), c.expect, JSON.stringify(c.args[0]))
  })
})

test("an invisible character cannot hide an address from looksLikeUrl", function() {
  var hidden = ["\u200b", "\u200e", "\u202e", "\u2060", "\u00ad", "\u0000", "\u007f", "\u0085", "\ud83d"]
  var addresses = [
    "intranet.example", "10.0.0.5:8080", "localhost:3000", "mailto:a@b.example", "nas/private.mp4",
    "192.168.1.10", "re:zero", "will.i.am"
  ]
  hidden.forEach(function(mark) {
    addresses.forEach(function(address) {
      assert.strictEqual(Ids.looksLikeUrl(mark + address), true, JSON.stringify(mark + address))
      assert.strictEqual(Ids.looksLikeUrl(address + mark), true, JSON.stringify(address + mark))
    })
    assert.strictEqual(Ids.looksLikeUrl(mark + "documentary"), false)
  })
})

test("one unbroken run longer than a reference is never a query", function() {
  var limit = Const.LIMITS.refChars
  assert.strictEqual(Ids.looksLikeUrl("a".repeat(limit)), false)
  assert.strictEqual(Ids.looksLikeUrl("a".repeat(limit + 1)), true)
  assert.strictEqual(Ids.looksLikeUrl("a".repeat(limit) + " b"), false)
})

test("no input makes the functions slow", function() {
  var size = 1 << 20
  var limit = Const.LIMITS.refChars
  var hostile = [
    "?".repeat(size), "/".repeat(size), "a/".repeat(size / 2), "a.".repeat(size / 2), "@".repeat(size),
    "a@".repeat(size / 2), "?=".repeat(size / 2) + " x", " ".repeat(size) + "x", "x" + " ".repeat(size) + "x",
    "#".repeat(size), " #".repeat(size / 2), "https://".repeat(size / 8), "[" + ":".repeat(size),
    "https://www.youtube.com/watch?" + "&".repeat(size), "1.".repeat(size / 2), "\u200b".repeat(size) + "a.bc"
  ]
  hostile.forEach(function(input, i) {
    var ms = elapsedMs(function() {
      Ids.looksLikeUrl(input)
      Ids.parseVideoRef(input, true)
      Ids.isId(input)
    })
    assert.ok(ms < 2000, "input " + i + " took " + Math.round(ms) + " ms")
  })
})
