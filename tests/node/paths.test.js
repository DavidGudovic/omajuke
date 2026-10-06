"use strict"
// Tests for lib/Paths.js: the vector table (also run inside Qt's engine),
// the bounds of what resolve() accepts, and owns() checked against an
// independent description of the shapes it may accept.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Paths = load.lib("Paths")
var Const = load.lib("Const")
var table = load.vectors("paths")

var KEYS = [
  "ok", "runtimeBase", "runtimeDir", "sock", "infoDir", "thumbsDir", "ytCacheDir", "denoDir", "jarDir",
  "signinDir", "stateDir", "stateFile", "dataDir", "jarFile"
]
var NO = { ok: false }

// The usual session, with single variables replaced.
function env(overrides) {
  var usual = {
    XDG_RUNTIME_DIR: "/run/user/1000",
    XDG_STATE_HOME: null,
    XDG_DATA_HOME: null,
    HOME: "/home/user"
  }
  return Object.assign(usual, overrides || {})
}

function escapeForPattern(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")
}

// The shapes owns() may accept, written a second time and a different way.
function oracle(paths) {
  var info = new RegExp("^" + escapeForPattern(paths.infoDir) + "/[0-9]{1,10}\\.json$")
  var thumb = new RegExp("^" + escapeForPattern(paths.thumbsDir) + "/[0-9]{1,10}\\.jpg$")
  return function(path) {
    return path === paths.stateFile || info.test(path) || thumb.test(path)
  }
}

test("exports exactly the documented functions", function() {
  assert.deepStrictEqual(Object.keys(Paths).sort(), ["infoFile", "owns", "resolve", "thumbFile"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Paths, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Paths).forEach(function(name) {
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("resolve: the table has exactly the documented keys, in order", function() {
  var paths = Paths.resolve(env())
  assert.deepStrictEqual(Object.keys(paths), KEYS)
  KEYS.slice(1).forEach(function(key) {
    assert.strictEqual(typeof paths[key], "string", key)
    assert.strictEqual(paths[key].charAt(0), "/", key)
    assert.strictEqual(paths[key].indexOf("//"), -1, key)
    assert.notStrictEqual(paths[key].charAt(paths[key].length - 1), "/", key)
  })
})

test("resolve: every path is a validated base, the directory name and a constant", function() {
  var paths = Paths.resolve(env({ XDG_STATE_HOME: "/s", XDG_DATA_HOME: "/d" }))
  var runtime = "/run/user/1000/" + Const.DIR_NAME
  assert.strictEqual(paths.runtimeBase, "/run/user/1000")
  assert.strictEqual(paths.runtimeDir, runtime)
  assert.strictEqual(paths.sock, runtime + "/mpv.sock")
  assert.strictEqual(paths.infoDir, runtime + "/info")
  assert.strictEqual(paths.thumbsDir, runtime + "/thumbs")
  assert.strictEqual(paths.ytCacheDir, runtime + "/ytcache")
  assert.strictEqual(paths.denoDir, runtime + "/deno")
  assert.strictEqual(paths.jarDir, runtime + "/jar")
  assert.strictEqual(paths.signinDir, runtime + "/signin")
  assert.strictEqual(paths.stateDir, "/s/" + Const.DIR_NAME)
  assert.strictEqual(paths.stateFile, "/s/" + Const.DIR_NAME + "/state.json")
  assert.strictEqual(paths.dataDir, "/d/" + Const.DIR_NAME)
  assert.strictEqual(paths.jarFile, "/d/" + Const.DIR_NAME + "/cookies.txt")
})

test("resolve: a refusal carries nothing but ok: false, and never a fallback path", function() {
  var refused = [
    env({ XDG_RUNTIME_DIR: null }), env({ XDG_RUNTIME_DIR: undefined }), env({ XDG_RUNTIME_DIR: "" }),
    env({ XDG_RUNTIME_DIR: "relative/run" }), env({ XDG_RUNTIME_DIR: "/run/user/1000/" }),
    env({ XDG_RUNTIME_DIR: "/run/user/my dir" }), env({ XDG_RUNTIME_DIR: "/run/user/" + "a".repeat(60) }),
    env({ HOME: null }), env({ HOME: "relative" }), env({ XDG_DATA_HOME: "/a::b" }),
    {}, null, undefined, "/run", 7
  ]
  refused.forEach(function(value, i) {
    assert.deepStrictEqual(Paths.resolve(value), NO, "case " + i)
  })
})

test("resolve: the runtime base may be 65 characters, and the socket path then still fits", function() {
  var longest = "/" + "a".repeat(64)
  var paths = Paths.resolve(env({ XDG_RUNTIME_DIR: longest }))
  assert.strictEqual(paths.ok, true)
  assert.ok(paths.sock.length <= 100)
  assert.ok(Buffer.byteLength(paths.sock) <= 100)
  assert.deepStrictEqual(Paths.resolve(env({ XDG_RUNTIME_DIR: longest + "a" })), NO)
})

test("resolve: every character outside the plain set is refused in the runtime base", function() {
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var plain = /^[A-Za-z0-9._-]$/.test(ch)
    var result = Paths.resolve(env({ XDG_RUNTIME_DIR: "/run/x" + ch + "y" }))
    // A slash only starts the next segment, which is fine.
    assert.strictEqual(result.ok, plain || ch === "/", code.toString(16))
  }
})

test("resolve: XDG variables win over HOME, each on its own", function() {
  var both = Paths.resolve(env({ XDG_STATE_HOME: "/x/state", XDG_DATA_HOME: "/x/data" }))
  assert.strictEqual(both.stateDir, "/x/state/omajuke")
  assert.strictEqual(both.dataDir, "/x/data/omajuke")
  var stateOnly = Paths.resolve(env({ XDG_STATE_HOME: "/x/state" }))
  assert.strictEqual(stateOnly.stateDir, "/x/state/omajuke")
  assert.strictEqual(stateOnly.dataDir, "/home/user/.local/share/omajuke")
  var noHome = Paths.resolve(env({ XDG_STATE_HOME: "/x/state", XDG_DATA_HOME: "/x/data", HOME: null }))
  assert.strictEqual(noHome.ok, true)
})

test("resolve: a home directory with spaces, quotes or shell characters is taken literally", function() {
  var homes = [
    "/home/user/o'brien", "/home/user/first last", "/home/user/$(id)", "/home/user/a\"b",
    "/home/user/caf\u00e9"
  ]
  homes.forEach(function(home) {
    var paths = Paths.resolve(env({ HOME: home }))
    assert.strictEqual(paths.ok, true, home)
    assert.strictEqual(paths.stateFile, home + "/.local/state/omajuke/state.json")
    assert.strictEqual(paths.jarFile, home + "/.local/share/omajuke/cookies.txt")
  })
  // Only the data base refuses a comma or a double colon.
  var state = Paths.resolve(env({ XDG_STATE_HOME: "/a,b::c" }))
  assert.strictEqual(state.stateDir, "/a,b::c/omajuke")
})

test("resolve: slashes in the state and data bases are normalised", function() {
  var paths = Paths.resolve(env({ XDG_STATE_HOME: "/x//state///", XDG_DATA_HOME: "/", HOME: "/home/user/" }))
  assert.strictEqual(paths.stateDir, "/x/state/omajuke")
  assert.strictEqual(paths.dataDir, "/omajuke")
  var home = Paths.resolve(env({ HOME: "/home/user/" }))
  assert.strictEqual(home.stateDir, "/home/user/.local/state/omajuke")
})

test("resolve: does not change its argument and returns a fresh table each time", function() {
  var input = env()
  var copy = JSON.stringify(input)
  var first = Paths.resolve(input)
  var second = Paths.resolve(input)
  assert.strictEqual(JSON.stringify(input), copy)
  assert.notStrictEqual(first, second)
  assert.deepStrictEqual(first, second)
})

test("owns: of the table's own paths only the state file is owned", function() {
  var paths = Paths.resolve(env())
  KEYS.slice(1).forEach(function(key) {
    assert.strictEqual(Paths.owns(paths, paths[key]), key === "stateFile", key)
    assert.strictEqual(Paths.owns(paths, paths[key] + "/"), false, key)
  })
})

test("owns: every file name the counters can produce is owned", function() {
  var paths = Paths.resolve(env())
  var counters = [1, 2, 9, 10, 99, 100, 12345, 4294967295, 4294967296, 9999999999]
  counters.forEach(function(n) {
    assert.strictEqual(Paths.infoFile(paths, n), paths.infoDir + "/" + String(n) + ".json")
    assert.strictEqual(Paths.thumbFile(paths, n), paths.thumbsDir + "/" + String(n) + ".jpg")
    assert.strictEqual(Paths.owns(paths, Paths.infoFile(paths, n)), true)
    assert.strictEqual(Paths.owns(paths, Paths.thumbFile(paths, n)), true)
    assert.match(Paths.infoFile(paths, n).slice(paths.infoDir.length + 1), /^[0-9]{1,10}\.json$/)
    assert.match(Paths.thumbFile(paths, n).slice(paths.thumbsDir.length + 1), /^[0-9]{1,10}\.jpg$/)
  })
})

test("owns: agrees with an independent description on every one-character change", function() {
  var paths = Paths.resolve(env())
  var expected = oracle(paths)
  var owned = [
    paths.stateFile, Paths.infoFile(paths, 7), Paths.infoFile(paths, 1234567890), Paths.thumbFile(paths, 42)
  ]
  var marks = ["/", ".", "0", "9", "a", " ", "\n", "\u0000", "-", "..", "/.", "/../", "\u0661", "*"]
  var checked = 0
  owned.forEach(function(path) {
    assert.strictEqual(Paths.owns(paths, path), true)
    for (var i = 0; i <= path.length; i++) {
      var mutants = [path.slice(0, i) + path.slice(i + 1), path.slice(0, i)]
      marks.forEach(function(mark) {
        mutants.push(path.slice(0, i) + mark + path.slice(i))
        mutants.push(path.slice(0, i) + mark + path.slice(i + 1))
      })
      mutants.forEach(function(mutant) {
        assert.strictEqual(Paths.owns(paths, mutant), expected(mutant), JSON.stringify(mutant))
        checked++
      })
    }
  })
  assert.ok(checked > 4000, String(checked))
})

test("owns: nothing outside the runtime and state directories, whatever the name", function() {
  var paths = Paths.resolve(env())
  var names = ["state.json", "1.json", "1.jpg", "info/1.json", "thumbs/1.jpg"]
  var roots = [
    "", "/", "/tmp", "/tmp/omajuke", "/home/user", "/home/user/.config/hypr",
    "/home/user/.config/omarchy/plugins", "/usr/share/omarchy", "/usr/share/omarchy/shell", "/run/user/1000",
    "/run/user/other/omajuke", "/home/user/.local/state", "/home/user/.local/share/omajuke",
    "/srv/other/.local/state/omajuke"
  ]
  roots.forEach(function(root) {
    names.forEach(function(name) {
      assert.strictEqual(Paths.owns(paths, root + "/" + name), false, root + "/" + name)
    })
  })
})

test("owns: an unresolved or forged table owns nothing", function() {
  var good = Paths.resolve(env())
  var tables = [
    NO, null, undefined, "", "/run", 1, [], {}, { ok: true }, { ok: "true", infoDir: "/i" },
    { ok: true, infoDir: "", thumbsDir: "", stateFile: "" }, { ok: true, infoDir: "i", thumbsDir: "t" }
  ]
  var probes = [
    good.stateFile, Paths.infoFile(good, 1), "/1.json", "/1.jpg", "", "undefined/1.json", "i/1.json",
    "/i/1.json"
  ]
  tables.forEach(function(value, i) {
    probes.forEach(function(path) {
      assert.strictEqual(Paths.owns(value, path), false, "table " + i + " " + path)
    })
  })
})

test("infoFile, thumbFile: a whole number from 1 to ten digits, and nothing else", function() {
  var paths = Paths.resolve(env())
  var refused = [
    0, -0, -1, 0.5, 1.5, 1.0000001, 10000000000, 1e21, NaN, Infinity, -Infinity, "1", "01", "", "Abc123Def4Q",
    "--no-config", "../x", null, undefined, true, false, [1], { n: 1 }, new Number(1), BigInt(1)
  ]
  refused.forEach(function(n) {
    assert.strictEqual(Paths.infoFile(paths, n), "", String(n))
    assert.strictEqual(Paths.thumbFile(paths, n), "", String(n))
  })
  // What a refusal returns is not a path the gate would ever let through.
  assert.strictEqual(Paths.owns(paths, ""), false)
  assert.strictEqual(Paths.infoFile(NO, 1), "")
  assert.strictEqual(Paths.thumbFile(null, 1), "")
})
