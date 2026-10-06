"use strict"
// Runs every table in tests/vectors against the module it names. A table
// is picked up by being in that directory. The same tables run a second
// time inside Qt's JavaScript engine (the vectors_* harness cases), because
// the plugin runs there and the two engines differ; this file is the node
// half, and it also checks that each table has the shape both runners
// expect.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var REPO = path.join(__dirname, "..", "..")
var DIR = path.join(REPO, "tests", "vectors")
var names = fs.readdirSync(DIR).filter(function(file) { return /\.js$/.test(file) }).map(function(file) {
  return file.slice(0, -3)
}).sort()

// How many mismatches of one table are spelled out before the rest is
// only counted.
var SHOWN = 10

function short(value) {
  var text = String(value)
  return text.length > 300 ? text.slice(0, 300) + "..." : text
}

// The table and the module it names, or the reason one of them cannot be
// loaded. A broken table must fail its own test, not this whole file.
function open(name) {
  try {
    var table = load.vectors(name)
    var side = table.SIDE === undefined ? "lib" : table.SIDE
    if (side !== "lib" && side !== "ui") return { error: "SIDE must be \"lib\" or \"ui\"" }
    if (typeof table.MODULE !== "string" || !/^[A-Z][A-Za-z0-9]*$/.test(table.MODULE)) {
      return { error: "MODULE must name a file in " + side + "/" }
    }
    if (!fs.existsSync(path.join(REPO, side, table.MODULE + ".js"))) {
      return { error: side + "/" + table.MODULE + ".js does not exist" }
    }
    return { table: table, module: (side === "ui" ? load.ui : load.lib)(table.MODULE) }
  } catch (error) {
    return { error: String(error && error.message ? error.message : error) }
  }
}

test("there are tables to run", function() {
  assert.ok(names.length > 0)
  names.forEach(function(name) {
    // The name is part of an import line in a harness case.
    assert.ok(/^[a-z][a-z0-9]*$/.test(name), name)
  })
})

names.forEach(function(name) {
  var opened = open(name)

  test(name + ": the table loads and names an existing module", function() {
    assert.strictEqual(opened.error, undefined)
  })
  if (opened.error !== undefined) return
  var table = opened.table
  var module = opened.module

  test(name + ": the file imports nothing and exports MODULE and CASES", function() {
    var source = fs.readFileSync(path.join(DIR, name + ".js"), "utf8")
    assert.strictEqual(source.split("\n")[0], ".pragma library")
    assert.ok(!/^\.import\b/m.test(source), "a vector file is data and stands alone")
    var exported = Object.keys(table).sort()
    var expected = table.SIDE === undefined ? ["CASES", "MODULE"] : ["CASES", "MODULE", "SIDE"]
    assert.deepStrictEqual(exported, expected)
  })

  test(name + ": every case has the shape both runners expect", function() {
    assert.ok(Array.isArray(table.CASES) && table.CASES.length > 0)
    table.CASES.forEach(function(c, i) {
      var label = name + " #" + i
      assert.ok(c !== null && typeof c === "object", label)
      // A misspelt key (expects, arg) would otherwise compare against nothing.
      assert.deepStrictEqual(Object.keys(c).sort(), ["args", "expect", "fn"], label)
      assert.strictEqual(typeof c.fn, "string", label)
      assert.strictEqual(typeof module[c.fn], "function", label + ": the module has no function " + c.fn)
      assert.ok(Array.isArray(c.args), label)
      // What JSON cannot carry is undefined after the comparison's
      // stringify, and so is a function: such an expectation tests nothing.
      assert.notStrictEqual(typeof c.expect, "function", label)
      if (c.expect !== undefined) assert.strictEqual(typeof JSON.stringify(c.expect), "string", label)
    })
  })

  test(name + ": " + table.CASES.length + " cases against " + table.MODULE, function() {
    var wrong = []
    table.CASES.forEach(function(c, i) {
      var result = load.runCase(module, c)
      if (result.got === result.want) return
      wrong.push("#" + i + " " + c.fn + "(" + short(JSON.stringify(c.args)) + ")\n      got  "
        + short(result.got) + "\n      want " + short(result.want))
    })
    var summary = wrong.length + " of " + table.CASES.length + " cases fail:\n    "
    assert.strictEqual(wrong.length, 0, summary + wrong.slice(0, SHOWN).join("\n    "))
  })
})
