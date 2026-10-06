"use strict"
// Loads the plugin's QML-style JavaScript under node. The files in lib/, ui/
// and tests/vectors/ are written for Qt's engine (".pragma library" and
// ".import" lines), which node cannot parse, so every node test reaches
// them through here. Also owns the one definition of what it means for a
// vector case to pass under node.
var fs = require("fs")
var path = require("path")
var cache = Object.create(null)

// Evaluates a QML ".pragma library" file under node: directive lines are
// blanked (line numbers stay right) and each `.import "X.js" as Name`
// becomes a function parameter bound to that module's exports.
function load(file) {
  var abs = path.resolve(file)
  if (cache[abs]) return cache[abs]
  var names = []
  var deps = []
  var body = fs.readFileSync(abs, "utf8").split("\n").map(function(line) {
    if (/^\.pragma library\s*$/.test(line)) return ""
    var m = /^\.import "([A-Za-z0-9]+\.js)" as ([A-Z][A-Za-z0-9]*)\s*$/.exec(line)
    if (m) { names.push(m[2]); deps.push(load(path.join(path.dirname(abs), m[1]))); return "" }
    if (/^\./.test(line)) throw new Error("unsupported directive: " + abs)
    return line
  }).join("\n")
  var mod = { exports: {} }
  new Function(names.concat(["module"]).join(","), body).apply(null, deps.concat([mod]))
  cache[abs] = mod.exports
  return mod.exports
}

function from(dir) {
  return function(name) { return load(path.join(__dirname, "..", "..", dir, name + ".js")) }
}

// A vector argument that source text cannot carry safely is described
// instead of written out: { gen: "repeat", unit, count } for a very long
// string, { gen: "codes", codes } for raw UTF-16 units such as half of a
// surrogate pair. Any other argument is passed as it is.
function expand(arg) {
  if (arg === null || typeof arg !== "object" || Array.isArray(arg) || typeof arg.gen !== "string") return arg
  if (arg.gen === "repeat") return String(arg.unit).repeat(arg.count)
  if (arg.gen === "codes") return String.fromCharCode.apply(null, arg.codes)
  throw new Error("unknown generator: " + arg.gen)
}

// Runs one case of a vector table against the module it names and returns
// { got, want } as JSON text; the case passes when the two are equal. A
// case that expects { throws: true } passes when the call throws.
function runCase(mod, c) {
  // A misspelt function name must fail the table, not count as "throws".
  if (typeof mod[c.fn] !== "function") throw new Error("no such function: " + c.fn)
  var args = c.args.map(expand)
  var want = c.expect && c.expect.throws === true ? "throws" : JSON.stringify(c.expect)
  var got
  try {
    got = JSON.stringify(mod[c.fn].apply(null, args))
  } catch (error) {
    got = "throws"
  }
  return { got: got, want: want }
}

module.exports = { lib: from("lib"), ui: from("ui"), vectors: from("tests/vectors"), runCase: runCase }
