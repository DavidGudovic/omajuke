"use strict"
// Tests for the shell constants of lib/Sh.js and for wrap(). The text of
// every constant is checked here; what the three constants of signing in
// do when they run is tested in export.test.js. The other constants
// are run for real with /usr/bin/sh, under umask 022, inside a directory
// this file creates below the system's temporary directory and removes
// again. Nothing outside that directory is written. Children are started
// synchronously and none is ever signalled; the one asynchronous child ends
// by itself when its input is closed.
var test = require("node:test")
var assert = require("node:assert")
var childProcess = require("node:child_process")
var fs = require("node:fs")
var os = require("node:os")
var path = require("node:path")
var load = require("./load.js")

var Sh = load.lib("Sh")
var Const = load.lib("Const")

var SH = "/usr/bin/sh"
// Any executable and any readable file will do where prepare only tests
// for "is there".
var EXECUTABLE = "/usr/bin/sh"
var ABSENT = "/nonexistent/oj-tool"
var SUBDIRS = ["deno", "info", "jar", "signin", "thumbs", "ytcache"]
// Every piece of shell text the plugin has.
var CONSTANTS = ["PREPARE", "PRIVATE_WRITE", "UMASK_EXEC", "PREPARE_DATA", "SIGNIN_DIRS", "COOKIE_EXPORT"]

// The modes below are only meaningful under the umask the shell runs with.
process.umask(0o022)

var top = fs.mkdtempSync(path.join(os.tmpdir(), "oj-sh-"))
var boxes = 0

test.after(function() {
  fs.rmSync(top, { recursive: true, force: true })
})

// A fresh sandbox: a private runtime base as the session provides it, and
// the places prepare is told about. Nothing but the base exists yet.
function box(baseName) {
  var root = path.join(top, String(++boxes))
  var base = path.join(root, baseName || "run")
  fs.mkdirSync(base, { recursive: true, mode: 0o700 })
  fs.chmodSync(base, 0o700)
  var mpris = path.join(root, "mpris.so")
  fs.writeFileSync(mpris, "")
  return {
    root: root,
    base: base,
    runtimeDir: path.join(base, "omajuke"),
    stateDir: path.join(root, "home", ".local", "state", "omajuke"),
    mpris: mpris,
    mpv: EXECUTABLE,
    ytdlp: EXECUTABLE
  }
}

function prepare(b) {
  var argv = ["-c", Sh.PREPARE, "omajuke-prepare", b.runtimeDir, b.stateDir, b.mpris, b.base, b.mpv, b.ytdlp]
  var result = childProcess.spawnSync(SH, argv, { encoding: "utf8", cwd: top })
  return { status: result.status, tokens: result.stdout.split("\n").filter(Boolean), stderr: result.stderr }
}

function write(target, text) {
  var argv = ["-c", Sh.PRIVATE_WRITE, "omajuke-write", target]
  var result = childProcess.spawnSync(SH, argv, { input: text, encoding: "utf8", cwd: top })
  return { status: result.status, stdout: result.stdout }
}

function mode(file) {
  return (fs.lstatSync(file).mode & 0o7777).toString(8)
}

function exists(file) {
  try {
    fs.lstatSync(file)
    return true
  } catch (error) {
    return false
  }
}

// Every path below dir, relative and sorted, directories marked with "/".
function tree(dir) {
  var found = []
  function walk(sub) {
    fs.readdirSync(path.join(dir, sub)).forEach(function(name) {
      var rel = path.join(sub, name)
      var isDir = fs.lstatSync(path.join(dir, rel)).isDirectory()
      found.push(isDir ? rel + "/" : rel)
      if (isDir) walk(rel)
    })
  }
  walk("")
  return found.sort()
}

// ---- The text itself ----

test("every constant is accepted by sh -n", function() {
  CONSTANTS.forEach(function(name) {
    var result = childProcess.spawnSync(SH, ["-n"], { input: Sh[name] + "\n", encoding: "utf8" })
    assert.strictEqual(result.status, 0, name)
    assert.strictEqual(result.stderr, "", name)
  })
})

test("the constants are plain text that names its tools by absolute path", function() {
  CONSTANTS.forEach(function(name) {
    var text = Sh[name]
    assert.strictEqual(typeof text, "string", name)
    assert.match(text, /^[\x20-\x7e\n]+$/, name + " is printable ASCII")
    assert.ok(!/[ \t]\n/.test(text) && !/\n$/.test(text), name + " has no trailing blanks")
    // A tool named without its directory would be looked up through PATH.
    var bare = /(^|[^\/A-Za-z-])(stat|mkdir|chmod|rm|find|mktemp|cat|mv|cp|ln|touch|head|sh|env)[ \n]/
    assert.ok(!bare.test(text), name + " calls no tool by bare name")
    // No way to run text that arrives as data.
    assert.ok(!/\beval\b|`|\bsource\b|(^|[\s;])\. /.test(text), name + " evaluates nothing")
  })
  assert.strictEqual(Sh.UMASK_EXEC, "umask 077 && exec \"$@\"")
  assert.ok(Sh.PREPARE.indexOf("umask 077\n") === 0, "PREPARE sets the umask first")
  assert.ok(Sh.PRIVATE_WRITE.indexOf("umask 077\n") === 0, "PRIVATE_WRITE sets the umask first")
  var signIn = ["PREPARE_DATA", "SIGNIN_DIRS", "COOKIE_EXPORT"]
  signIn.forEach(function(name) {
    assert.ok(Sh[name].indexOf("umask 077\n") === 0, name + " sets the umask first")
  })
})

test("the constants are the only strings in the module, and no builder adds shell text", function() {
  var texts = Object.keys(Sh).filter(function(name) { return typeof Sh[name] === "string" })
  assert.deepStrictEqual(texts.sort(), CONSTANTS.slice().sort())
  // A constant never changes with what it is run on: it holds no path of a
  // session and no name but its own tools and words.
  CONSTANTS.forEach(function(name) {
    assert.ok(!/\/home\/|\/run\/user\/|\/tmp\//.test(Sh[name]), name)
  })
})

test("the export reads no parameter but its five, and each of the others only its own", function() {
  var used = function(name) {
    var found = {}
    var pattern = /\$\{?([0-9@*#])/g
    var match
    while ((match = pattern.exec(Sh[name])) !== null) found[match[1]] = true
    return Object.keys(found).sort()
  }
  assert.deepStrictEqual(used("PREPARE"), ["1", "2", "3", "4", "5", "6"])
  assert.deepStrictEqual(used("PRIVATE_WRITE"), ["1"])
  assert.deepStrictEqual(used("UMASK_EXEC"), ["@"])
  assert.deepStrictEqual(used("PREPARE_DATA"), ["1", "2"])
  assert.deepStrictEqual(used("SIGNIN_DIRS"), ["1", "2"])
  assert.deepStrictEqual(used("COOKIE_EXPORT"), ["1", "2", "3", "4", "5"])
})

test("every parameter of the constants is used inside double quotes", function() {
  CONSTANTS.forEach(function(name) {
    Sh[name].split("\n").forEach(function(line) {
      // A plain assignment from a parameter does not split words; everywhere
      // else an expansion has to sit between double quotes. A command
      // substitution starts a quoting context of its own.
      if (/^[a-z]=\$\{[^}]*\}$/.test(line)) return
      var quoted = false
      var outer = []
      for (var i = 0; i < line.length; i++) {
        var c = line.charAt(i)
        if (c === "'" && !quoted) {
          var close = line.indexOf("'", i + 1)
          if (close !== -1) i = close
        } else if (c === "\"") {
          quoted = !quoted
        } else if (c === "$" && line.charAt(i + 1) === "(") {
          outer.push(quoted)
          quoted = false
          i += 1
        } else if (c === ")" && outer.length > 0) {
          quoted = outer.pop()
        } else if (c === "$") {
          assert.ok(quoted, name + ": unquoted expansion in: " + line)
        }
      }
      assert.ok(!quoted && outer.length === 0, name + ": unbalanced quoting in: " + line)
    })
  })
})

// ---- PREPARE ----

test("prepare creates the private directories with mode 700 under umask 022", function() {
  var b = box()
  var result = prepare(b)
  assert.strictEqual(result.status, 0)
  assert.deepStrictEqual(result.tokens, ["mpris", "mpv", "ytdlp", "ok"])
  assert.strictEqual(result.stderr, "")
  assert.deepStrictEqual(tree(b.runtimeDir), SUBDIRS.map(function(name) { return name + "/" }))
  assert.strictEqual(mode(b.runtimeDir), "700")
  SUBDIRS.forEach(function(name) { assert.strictEqual(mode(path.join(b.runtimeDir, name)), "700", name) })
  assert.strictEqual(mode(b.stateDir), "700")
  assert.deepStrictEqual(tree(b.stateDir), [])
})

test("prepare tightens directories that already exist with a wider mode", function() {
  var b = box()
  fs.mkdirSync(b.runtimeDir, { mode: 0o755 })
  fs.mkdirSync(b.stateDir, { recursive: true, mode: 0o755 })
  fs.chmodSync(b.runtimeDir, 0o777)
  fs.chmodSync(b.stateDir, 0o755)
  assert.strictEqual(prepare(b).status, 0)
  assert.strictEqual(mode(b.runtimeDir), "700")
  assert.strictEqual(mode(b.stateDir), "700")
})

test("prepare reports what is installed, by token", function() {
  var b = box()
  b.mpv = ABSENT
  assert.deepStrictEqual(prepare(b).tokens, ["mpris", "ytdlp", "ok"])
  b.mpv = EXECUTABLE
  b.ytdlp = ABSENT
  assert.deepStrictEqual(prepare(b).tokens, ["mpris", "mpv", "ok"])
  b.ytdlp = b.mpris
  assert.deepStrictEqual(prepare(b).tokens, ["mpris", "mpv", "ok"], "a file without the x bit is no tool")
  b.ytdlp = EXECUTABLE
  b.mpris = ABSENT
  assert.deepStrictEqual(prepare(b).tokens, ["mpv", "ytdlp", "ok"])
})

test("prepare refuses a runtime base that is not a private directory of ours", function() {
  var cases = [
    ["mode 1777, like a shared temporary directory", function(b) { fs.chmodSync(b.base, 0o1777) }],
    ["mode 755", function(b) { fs.chmodSync(b.base, 0o755) }],
    ["mode 750", function(b) { fs.chmodSync(b.base, 0o750) }],
    ["missing", function(b) { fs.rmdirSync(b.base) }],
    ["a regular file", function(b) { fs.rmdirSync(b.base); fs.writeFileSync(b.base, "") }],
    ["a link to a private directory", function(b) {
      var real = path.join(b.root, "real")
      fs.renameSync(b.base, real)
      fs.symlinkSync(real, b.base)
    }]
  ]
  cases.forEach(function(c) {
    var b = box()
    c[1](b)
    var before = tree(b.root)
    var result = prepare(b)
    assert.strictEqual(result.status, 3, c[0])
    assert.deepStrictEqual(result.tokens, ["bad-dir"], c[0])
    assert.deepStrictEqual(tree(b.root), before, c[0] + ": nothing was created")
  })
})

test("prepare refuses a runtime base that belongs to someone else", function(t) {
  // Needs a directory of mode 700 that another user owns and whose
  // attributes we may read; systemd keeps one. Nothing is created there:
  // the check comes before the first mkdir.
  var foreign = "/var/lib/private"
  var stat = null
  try {
    stat = fs.statSync(foreign)
  } catch (error) {
    stat = null
  }
  if (stat === null || stat.uid === process.getuid() || (stat.mode & 0o7777) !== 0o700) {
    t.skip("no directory of another user with mode 700 on this machine")
    return
  }
  var b = box()
  b.base = foreign
  var result = prepare(b)
  assert.strictEqual(result.status, 3)
  assert.deepStrictEqual(result.tokens, ["bad-dir"])
  assert.ok(!exists(b.runtimeDir))
})

test("prepare refuses a private directory that is a link or not a directory", function() {
  var linkedRuntime = box()
  var outside = path.join(linkedRuntime.root, "outside")
  fs.mkdirSync(outside)
  fs.symlinkSync(outside, linkedRuntime.runtimeDir)
  var result = prepare(linkedRuntime)
  assert.deepStrictEqual([result.status, result.tokens], [3, ["bad-dir"]])
  assert.deepStrictEqual(tree(outside), [], "nothing was created behind the runtime link")
  assert.ok(!exists(linkedRuntime.stateDir), "the state dir was not reached")

  var linkedState = box()
  outside = path.join(linkedState.root, "outside")
  fs.mkdirSync(outside)
  fs.mkdirSync(path.dirname(linkedState.stateDir), { recursive: true })
  fs.symlinkSync(outside, linkedState.stateDir)
  result = prepare(linkedState)
  assert.deepStrictEqual([result.status, result.tokens], [3, ["bad-dir"]])
  assert.deepStrictEqual(tree(outside), [], "nothing was created behind the state link")
  assert.strictEqual(mode(outside), "755", "and its mode was not changed")

  var dangling = box()
  fs.symlinkSync(path.join(dangling.root, "nowhere"), dangling.runtimeDir)
  assert.deepStrictEqual(prepare(dangling).tokens, ["bad-dir"])
  assert.ok(!exists(path.join(dangling.root, "nowhere")), "a dangling link is not followed into existence")

  var file = box()
  fs.writeFileSync(file.runtimeDir, "")
  result = prepare(file)
  assert.deepStrictEqual([result.status, result.tokens], [3, ["bad-dir"]])
})

test("prepare wipes what an earlier shell left in the runtime directory", function() {
  var b = box()
  assert.strictEqual(prepare(b).status, 0)
  var outside = path.join(b.root, "outside")
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, "precious"), "x")
  fs.writeFileSync(path.join(b.runtimeDir, "info", "1.json"), "{}")
  fs.writeFileSync(path.join(b.runtimeDir, "jar", "1.txt"), "x")
  fs.mkdirSync(path.join(b.runtimeDir, "signin", "1", "profile"), { recursive: true })
  fs.writeFileSync(path.join(b.runtimeDir, "signin", "1", "profile", "Cookies"), "x")
  fs.writeFileSync(path.join(b.runtimeDir, "mpv.sock"), "")
  fs.writeFileSync(path.join(b.runtimeDir, "ytcache", "kept"), "x")
  fs.writeFileSync(path.join(b.runtimeDir, "deno", "kept"), "x")
  // A link where a wiped directory belongs: the link goes, its target stays.
  fs.rmdirSync(path.join(b.runtimeDir, "thumbs"))
  fs.symlinkSync(outside, path.join(b.runtimeDir, "thumbs"))

  assert.strictEqual(prepare(b).status, 0)
  assert.deepStrictEqual(tree(b.runtimeDir),
    ["deno/", "deno/kept", "info/", "jar/", "signin/", "thumbs/", "ytcache/", "ytcache/kept"])
  assert.deepStrictEqual(tree(outside), ["precious"])
  assert.strictEqual(mode(path.join(b.runtimeDir, "thumbs")), "700")
})

test("prepare deletes only its own unfinished writes from the state directory", function() {
  var b = box()
  fs.mkdirSync(b.stateDir, { recursive: true })
  var kept = [
    "state.json.backup", "state.json.AbC123", ".state.json.AbC12", ".state.json.AbC1234",
    ".state.jsonXAbC123", "notes.txt", ".hidden"
  ]
  kept.forEach(function(name) { fs.writeFileSync(path.join(b.stateDir, name), "x") })
  fs.writeFileSync(path.join(b.stateDir, ".state.json.AbC123"), "left by a write that never finished")
  fs.writeFileSync(path.join(b.stateDir, ".state.json.zzzzzz"), "another")
  // The same name as a directory, and one level down, is not ours to delete.
  fs.mkdirSync(path.join(b.stateDir, ".state.json.DIRDIR"))
  fs.mkdirSync(path.join(b.stateDir, "sub"))
  fs.writeFileSync(path.join(b.stateDir, "sub", ".state.json.AbC123"), "x")

  var result = prepare(b)
  assert.strictEqual(result.status, 0)
  assert.ok(result.tokens.indexOf("state") === -1, "there is no state file")
  var want = kept.concat([".state.json.DIRDIR/", "sub/", "sub/.state.json.AbC123"]).sort()
  assert.deepStrictEqual(tree(b.stateDir), want)
})

test("prepare reports a state file only if it is a regular file of ours, and makes it private", function() {
  var b = box()
  fs.mkdirSync(b.stateDir, { recursive: true })
  var stateFile = path.join(b.stateDir, "state.json")
  fs.writeFileSync(stateFile, "{}\n", { mode: 0o644 })
  fs.chmodSync(stateFile, 0o644)
  var result = prepare(b)
  assert.deepStrictEqual(result.tokens, ["state", "mpris", "mpv", "ytdlp", "ok"])
  assert.strictEqual(mode(stateFile), "600")
  assert.strictEqual(fs.readFileSync(stateFile, "utf8"), "{}\n")

  // A link at that name is not read, and what it points to is left alone.
  var outside = path.join(b.root, "someone-elses.json")
  fs.writeFileSync(outside, "{}\n")
  fs.chmodSync(outside, 0o644)
  fs.rmSync(stateFile)
  fs.symlinkSync(outside, stateFile)
  result = prepare(b)
  assert.ok(result.tokens.indexOf("state") === -1, "a link is not a state file")
  assert.strictEqual(result.status, 0)
  assert.strictEqual(mode(outside), "644")

  fs.rmSync(stateFile)
  fs.mkdirSync(stateFile)
  assert.ok(prepare(b).tokens.indexOf("state") === -1, "a directory is not a state file")
})

test("prepare treats hostile directory names as names", function() {
  var names = [
    "with space", "quote'single", "quote\"double", "$(touch INJECTED)", "`touch INJECTED`",
    "semi;touch INJECTED", "new\nline", "star*", "back\\slash", "$HOME", "-rf", "a&b|c>d<e", "tab\there",
    "{x,y}", "~", "#hash"
  ]
  names.forEach(function(name) {
    var b = box(name)
    b.stateDir = path.join(b.root, "home " + name, "state", "omajuke")
    var mprisDir = path.join(b.root, "lib " + name)
    fs.mkdirSync(mprisDir)
    b.mpris = path.join(mprisDir, "mpris.so")
    fs.writeFileSync(b.mpris, "")
    fs.mkdirSync(path.dirname(b.stateDir), { recursive: true })
    fs.mkdirSync(b.stateDir)
    fs.writeFileSync(path.join(b.stateDir, "state.json"), "{}")
    fs.writeFileSync(path.join(b.stateDir, ".state.json.AbC123"), "x")

    var result = prepare(b)
    var label = JSON.stringify(name)
    assert.strictEqual(result.status, 0, label)
    assert.deepStrictEqual(result.tokens, ["state", "mpris", "mpv", "ytdlp", "ok"], label)
    assert.strictEqual(mode(b.runtimeDir), "700", label)
    assert.deepStrictEqual(tree(b.runtimeDir), SUBDIRS.map(function(sub) { return sub + "/" }), label)
    assert.deepStrictEqual(tree(b.stateDir), ["state.json"], label)
    var made = ["home " + name, "lib " + name, "mpris.so", name]
    assert.deepStrictEqual(fs.readdirSync(b.root).sort(), made.sort(), label)
  })
  // The scripts ran with the top directory as their working directory.
  assert.ok(!exists(path.join(top, "INJECTED")), "no name was executed")
  assert.deepStrictEqual(fs.readdirSync(top).filter(function(name) { return !/^[0-9]+$/.test(name) }), [])
})

// ---- PRIVATE_WRITE ----

test("write creates a private file with exactly the text, and leaves nothing else", function() {
  var b = box()
  var dir = path.join(b.root, "state")
  fs.mkdirSync(dir, { mode: 0o755 })
  var target = path.join(dir, "state.json")
  var result = write(target, "{\"a\":1}\n")
  assert.deepStrictEqual(result, { status: 0, stdout: "" })
  assert.strictEqual(fs.readFileSync(target, "utf8"), "{\"a\":1}\n")
  assert.strictEqual(mode(target), "600", "private even in a directory that is not")
  assert.deepStrictEqual(tree(dir), ["state.json"])

  assert.strictEqual(write(target, "").status, 0)
  assert.strictEqual(fs.readFileSync(target, "utf8"), "", "an empty text is written too")

  var big = "0123456789abcdef".repeat(65536)
  assert.strictEqual(write(target, big).status, 0)
  assert.ok(fs.readFileSync(target, "utf8") === big, "one mebibyte arrives whole")
  assert.deepStrictEqual(tree(dir), ["state.json"])
})

test("write replaces an existing file in one step and makes it private", function() {
  var b = box()
  var target = path.join(b.root, "state.json")
  fs.writeFileSync(target, "old and long ".repeat(1000))
  fs.chmodSync(target, 0o644)
  var before = fs.statSync(target).ino
  assert.strictEqual(write(target, "new\n").status, 0)
  assert.strictEqual(fs.readFileSync(target, "utf8"), "new\n")
  assert.strictEqual(mode(target), "600")
  assert.notStrictEqual(fs.statSync(target).ino, before, "a new file took its place")
})

test("the file is private from its first byte, not made private afterwards", async function() {
  var b = box()
  var dir = path.join(b.root, "state")
  fs.mkdirSync(dir, { mode: 0o755 })
  var target = path.join(dir, "state.json")
  var child = childProcess.spawn(SH, ["-c", Sh.PRIVATE_WRITE, "omajuke-write", target], {
    stdio: ["pipe", "ignore", "ignore"]
  })
  var closed = new Promise(function(resolve) { child.on("close", resolve) })
  child.stdin.write("first half, ")
  // The script now waits for the rest of its input with the temporary file
  // already there.
  var temp = []
  for (var i = 0; i < 200 && temp.length === 0; i++) {
    await new Promise(function(resolve) { setTimeout(resolve, 10) })
    temp = fs.readdirSync(dir)
  }
  try {
    assert.strictEqual(temp.length, 1)
    assert.match(temp[0], /^\.state\.json\.[A-Za-z0-9]{6}$/, "a dotted temporary name")
    assert.strictEqual(mode(path.join(dir, temp[0])), "600", "mode while the data is still arriving")
    assert.ok(!exists(target), "the visible file does not exist before the write is complete")
  } finally {
    child.stdin.end("second half\n")
  }
  assert.strictEqual(await closed, 0)
  assert.strictEqual(fs.readFileSync(target, "utf8"), "first half, second half\n")
  assert.deepStrictEqual(tree(dir), ["state.json"])
})

test("write replaces a link planted at the target and never writes through it", function() {
  var b = box()
  var dir = path.join(b.root, "state")
  fs.mkdirSync(dir)
  var target = path.join(dir, "state.json")

  var victim = path.join(b.root, "victim.txt")
  fs.writeFileSync(victim, "untouched")
  fs.symlinkSync(victim, target)
  assert.strictEqual(write(target, "history\n").status, 0)
  assert.ok(fs.lstatSync(target).isFile(), "a link to a file is replaced by a file")
  assert.strictEqual(fs.readFileSync(victim, "utf8"), "untouched")

  fs.rmSync(target)
  fs.symlinkSync(path.join(b.root, "nowhere"), target)
  assert.strictEqual(write(target, "history\n").status, 0)
  assert.ok(fs.lstatSync(target).isFile(), "a dangling link is replaced by a file")
  assert.ok(!exists(path.join(b.root, "nowhere")))

  // A link to a directory is the case a plain mv gets wrong: it would move
  // the file into that directory.
  var elsewhere = path.join(b.root, "elsewhere")
  fs.mkdirSync(elsewhere)
  fs.rmSync(target)
  fs.symlinkSync(elsewhere, target)
  assert.strictEqual(write(target, "history\n").status, 0)
  assert.ok(fs.lstatSync(target).isFile(), "a link to a directory is replaced by a file")
  assert.strictEqual(fs.readFileSync(target, "utf8"), "history\n")
  assert.deepStrictEqual(tree(elsewhere), [], "nothing was written into the directory it pointed to")
  assert.deepStrictEqual(tree(dir), ["state.json"])
})

test("write fails cleanly when the target cannot be replaced", function() {
  var b = box()
  var dir = path.join(b.root, "state")
  fs.mkdirSync(dir)
  var target = path.join(dir, "state.json")

  // A directory at the target: no copy of the text may stay behind in it.
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(target, "inside"), "x")
  var result = write(target, "history\n")
  assert.strictEqual(result.status, 5)
  assert.deepStrictEqual(tree(dir), ["state.json/", "state.json/inside"], "the temporary file is gone again")

  var missing = path.join(b.root, "no-such-dir", "state.json")
  assert.strictEqual(write(missing, "x").status, 4)
  assert.ok(!exists(path.dirname(missing)), "a missing directory is not created")

  var closedDir = path.join(b.root, "closed")
  fs.mkdirSync(closedDir)
  fs.chmodSync(closedDir, 0o500)
  try {
    assert.strictEqual(write(path.join(closedDir, "state.json"), "x").status, 4)
    assert.deepStrictEqual(tree(closedDir), [])
  } finally {
    fs.chmodSync(closedDir, 0o700)
  }
})

test("write treats hostile path names as names", function() {
  var names = [
    "with space", "quote'single", "quote\"double", "$(touch INJECTED)", "`touch INJECTED`",
    "semi;touch INJECTED", "new\nline", "star*", "back\\slash", "$HOME", "-rf", "a&b|c>d<e", "%s%n", "XXXXXX"
  ]
  names.forEach(function(name) {
    var b = box()
    var dir = path.join(b.root, name)
    fs.mkdirSync(dir)
    var target = path.join(dir, name + ".json")
    var label = JSON.stringify(name)
    assert.strictEqual(write(target, "text for " + name).status, 0, label)
    assert.strictEqual(fs.readFileSync(target, "utf8"), "text for " + name, label)
    assert.strictEqual(mode(target), "600", label)
    assert.deepStrictEqual(fs.readdirSync(dir), [name + ".json"], label)
    assert.deepStrictEqual(fs.readdirSync(b.root).sort(), ["mpris.so", name, "run"].sort(), label)
  })
  assert.ok(!exists(path.join(top, "INJECTED")), "no name was executed")
})

// ---- UMASK_EXEC ----

function underUmask(argv) {
  var wrapped = ["-c", Sh.UMASK_EXEC, "omajuke"].concat(argv)
  var result = childProcess.spawnSync(SH, wrapped, { encoding: "utf8", cwd: top })
  return { status: result.status, stdout: result.stdout }
}

test("the umask wrapper runs the tool itself, with private files and untouched arguments", function() {
  assert.deepStrictEqual(underUmask([SH, "-c", "umask"]), { status: 0, stdout: "0077\n" })
  var args = ["a b", "c'd", "$(touch INJECTED)", "", "*", "new\nline", "-x"]
  var echoed = underUmask(["/usr/bin/printf", "[%s]"].concat(args))
  assert.strictEqual(echoed.stdout, args.map(function(a) { return "[" + a + "]" }).join(""))
  assert.ok(!exists(path.join(top, "INJECTED")))

  var b = box()
  var created = path.join(b.root, "created")
  assert.strictEqual(underUmask(["/usr/bin/touch", created]).status, 0)
  assert.strictEqual(mode(created), "600")

  assert.strictEqual(underUmask(["/usr/bin/false"]).status, 1, "the tool's exit code is the job's")
  assert.strictEqual(underUmask([ABSENT]).status, 127, "a missing tool is reported the usual way")
})

// ---- wrap ----

test("wrap puts setpriv and timeout in front of the tool's own command", function() {
  var tools = { setpriv: "/x/setpriv", timeout: "/x/timeout", sh: "/x/sh" }
  var argv = ["/x/tool", "--flag", "two words", "", "-"]
  var plain = Sh.wrap(tools, { timeoutSec: 15, argv: argv })
  assert.deepStrictEqual(plain,
    ["/x/setpriv", "--pdeathsig", "TERM", "/x/timeout", "-k", "2", "15"].concat(argv))
  assert.deepStrictEqual(Sh.wrap(tools, { timeoutSec: 15, umask077: false, argv: argv }), plain)

  var masked = Sh.wrap(tools, { timeoutSec: 600, umask077: true, argv: argv })
  var front = ["/x/setpriv", "--pdeathsig", "TERM", "/x/timeout", "-k", "2", "600"]
  assert.deepStrictEqual(masked, front.concat(["/x/sh", "-c", Sh.UMASK_EXEC, "omajuke"], argv))

  assert.ok(plain.every(function(part) { return typeof part === "string" }), "every element is a string")
  assert.strictEqual(plain[5], String(Const.TIMEOUTS.killGraceSec), "the grace delay is the constant")
  assert.deepStrictEqual(argv, ["/x/tool", "--flag", "two words", "", "-"], "the given argv is not changed")
  assert.notStrictEqual(plain, argv)
})

test("wrap takes nothing from a job but its deadline, its umask flag and its argv", function() {
  var tools = { setpriv: "/x/setpriv", timeout: "/x/timeout", sh: "/x/sh" }
  var spec = {
    tag: "TAG-MARK", argv: ["/x/tool"], stdin: "STDIN-MARK", timeoutSec: 7, maxBytes: 4242,
    env: { MARK: "ENV-MARK" }, done: function() {}
  }
  var text = JSON.stringify(Sh.wrap(tools, spec))
  var want = ["/x/setpriv", "--pdeathsig", "TERM", "/x/timeout", "-k", "2", "7", "/x/tool"]
  assert.strictEqual(text, JSON.stringify(want))
})

test("the module exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(Sh).sort(), [
    "COOKIE_BROWSERS", "COOKIE_EXPORT", "PREPARE", "PREPARE_DATA", "PRIVATE_WRITE", "SIGNIN_DIRS",
    "UMASK_EXEC", "cleanupArgv", "cleanupWithJarArgv", "cookieExportArgv", "copyArgv", "prepareArgv",
    "prepareDataArgv", "purgeArgv", "readArgv", "removeArgv", "removeTreeArgv", "signinDirsArgv", "wrap",
    "writeArgv"
  ])
})
