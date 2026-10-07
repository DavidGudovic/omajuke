"use strict"
// Tests for the file-operation command lines of lib/Sh.js: each builder
// returns exactly the documented array, starts with an absolute tool, puts
// nothing variable anywhere but in its documented slots, and has no way to
// take a video id. Paths come from lib/Paths.js as they do in the plugin.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Sh = load.lib("Sh")
var Const = load.lib("Const")
var Paths = load.lib("Paths")

var TOOLS = Const.TOOLS
var R = "/run/user/1000/omajuke"
var S = "/home/user/.local/state/omajuke"
var D = "/home/user/.local/share/omajuke"

var paths = Paths.resolve({
  XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
})

// Tool paths no real machine has, to see where each tool lands in an argv.
function markedTools() {
  var marked = {}
  Object.keys(TOOLS).forEach(function(name) { marked[name] = "/marked/" + name })
  return marked
}

// Every builder with ordinary arguments, for the checks that hold for all.
function everyArgv(tools, p) {
  return {
    prepareArgv: Sh.prepareArgv(tools, p),
    writeArgv: Sh.writeArgv(tools, p.stateFile),
    readArgv: Sh.readArgv(tools, p.stateFile, Const.LIMITS.stateBytes),
    removeArgv: Sh.removeArgv(tools, [Paths.infoFile(p, 1), Paths.thumbFile(p, 2)]),
    purgeArgv: Sh.purgeArgv(tools, p.infoDir),
    cleanupArgv: Sh.cleanupArgv(tools, p),
    cleanupWithJarArgv: Sh.cleanupWithJarArgv(tools, p),
    prepareDataArgv: Sh.prepareDataArgv(tools, p),
    signinDirsArgv: Sh.signinDirsArgv(tools, Paths.signinAttemptDir(p, 3), "firefox"),
    cookieExportArgv: Sh.cookieExportArgv(tools, "chrome", Paths.signinAttemptDir(p, 3), p.jarFile),
    removeTreeArgv: Sh.removeTreeArgv(tools, Paths.signinAttemptDir(p, 3)),
    copyArgv: Sh.copyArgv(tools, p.jarFile, Paths.jarCopyFile(p, 4))
  }
}

test("the paths used here resolve to the usual places", function() {
  assert.strictEqual(paths.ok, true)
  assert.strictEqual(paths.runtimeDir, R)
  assert.strictEqual(paths.stateDir, S)
  assert.strictEqual(paths.dataDir, D)
})

test("prepareArgv is the constant script with its six parameters", function() {
  assert.deepStrictEqual(Sh.prepareArgv(TOOLS, paths), [
    "/usr/bin/sh", "-c", Sh.PREPARE, "omajuke-prepare",
    R, S, "/usr/lib/mpv-mpris/mpris.so", "/run/user/1000", "/usr/bin/mpv", "/usr/bin/yt-dlp"
  ])
})

test("writeArgv is the constant script and the target", function() {
  assert.deepStrictEqual(Sh.writeArgv(TOOLS, S + "/state.json"),
    ["/usr/bin/sh", "-c", Sh.PRIVATE_WRITE, "omajuke-write", S + "/state.json"])
  assert.deepStrictEqual(Sh.writeArgv(TOOLS, Paths.infoFile(paths, 12)),
    ["/usr/bin/sh", "-c", Sh.PRIVATE_WRITE, "omajuke-write", R + "/info/12.json"])
})

test("readArgv asks head for one byte more than the cap", function() {
  assert.deepStrictEqual(Sh.readArgv(TOOLS, S + "/state.json", 1048576),
    ["/usr/bin/head", "-c", "1048577", "--", S + "/state.json"])
  assert.deepStrictEqual(Sh.readArgv(TOOLS, S + "/state.json", 1),
    ["/usr/bin/head", "-c", "2", "--", S + "/state.json"])
})

test("removeArgv is rm -f, an end of options, and the files", function() {
  var files = [R + "/info/1.json", R + "/thumbs/2.jpg"]
  assert.deepStrictEqual(Sh.removeArgv(TOOLS, files), ["/usr/bin/rm", "-f", "--"].concat(files))
  assert.deepStrictEqual(files, [R + "/info/1.json", R + "/thumbs/2.jpg"], "the given list is not changed")
  assert.deepStrictEqual(Sh.removeArgv(TOOLS, []), ["/usr/bin/rm", "-f", "--"])
  assert.ok(Sh.removeArgv(TOOLS, files).indexOf("-r") === -1, "never recursive")
  assert.ok(Sh.removeArgv(TOOLS, files).indexOf("-rf") === -1, "never recursive")
})

test("purgeArgv deletes the files directly inside one directory", function() {
  assert.deepStrictEqual(Sh.purgeArgv(TOOLS, R + "/thumbs"),
    ["/usr/bin/find", R + "/thumbs", "-mindepth", "1", "-maxdepth", "1", "-type", "f", "-delete"])
})

test("cleanupArgv removes exactly the seven runtime paths, bounded by timeout alone", function() {
  assert.deepStrictEqual(Sh.cleanupArgv(TOOLS, paths), [
    "/usr/bin/timeout", "-k", "2", "5", "/usr/bin/rm", "-rf", "--",
    R + "/mpv.sock", R + "/info", R + "/thumbs", R + "/jar", R + "/signin", R + "/ytcache", R + "/deno"
  ])
  var argv = Sh.cleanupArgv(TOOLS, paths)
  assert.strictEqual(argv[2], String(Const.TIMEOUTS.killGraceSec))
  assert.strictEqual(argv[3], String(Const.TIMEOUTS.local))
  // It must outlive the shell that started it, so nothing ties it to one.
  assert.ok(argv.indexOf("--pdeathsig") === -1 && argv.indexOf(TOOLS.setpriv) === -1)
  var removed = argv.slice(7)
  removed.forEach(function(target) {
    assert.ok(target.indexOf(R + "/") === 0 && target.length > R.length + 1, target + " is below our dir")
    assert.ok(!/\/$/.test(target), target + " has no trailing slash")
    assert.ok(target.indexOf("..") === -1 && target.indexOf("*") === -1, target)
  })
  assert.ok(removed.indexOf(R) === -1, "the runtime dir itself stays")
  assert.ok(removed.every(function(target) { return target.indexOf(S) !== 0 }), "nothing of the state dir")
})

test("cleanupWithJarArgv is the same clean-up with the saved login as its last target", function() {
  var argv = Sh.cleanupWithJarArgv(TOOLS, paths)
  assert.deepStrictEqual(argv, Sh.cleanupArgv(TOOLS, paths).concat([D + "/cookies.txt"]))
  // The file alone: the data directory and whatever else is in it stay.
  assert.ok(argv.indexOf(D) === -1)
  assert.strictEqual(argv.filter(function(part) { return part.indexOf(D) === 0 }).length, 1)
  var usual = Sh.cleanupArgv(TOOLS, paths)
  assert.ok(usual.indexOf(D + "/cookies.txt") === -1, "the usual clean-up keeps the login")
})

test("prepareDataArgv is the constant script with the data directory and the login file", function() {
  assert.deepStrictEqual(Sh.prepareDataArgv(TOOLS, paths),
    ["/usr/bin/sh", "-c", Sh.PREPARE_DATA, "omajuke-prepare-data", D, D + "/cookies.txt"])
})

test("signinDirsArgv is the constant script, the attempt directory and the family", function() {
  assert.deepStrictEqual(Sh.signinDirsArgv(TOOLS, R + "/signin/3", "firefox"),
    ["/usr/bin/sh", "-c", Sh.SIGNIN_DIRS, "omajuke-signin-dirs", R + "/signin/3", "firefox"])
  assert.deepStrictEqual(Sh.signinDirsArgv(TOOLS, R + "/signin/4", "chromium").slice(4),
    [R + "/signin/4", "chromium"])
})

test("cookieExportArgv names the attempt's own profile, the login file and the one yt-dlp", function() {
  assert.deepStrictEqual(Sh.cookieExportArgv(TOOLS, "chrome", R + "/signin/3", D + "/cookies.txt"), [
    "/usr/bin/sh", "-c", Sh.COOKIE_EXPORT, "omajuke-export",
    "chrome", R + "/signin/3/profile", R + "/signin/3", D + "/cookies.txt", "/usr/bin/yt-dlp"
  ])
  // The profile cannot be chosen: it is always inside the attempt directory.
  assert.strictEqual(Sh.cookieExportArgv.length, 4)
  var other = Sh.cookieExportArgv(TOOLS, "firefox", R + "/signin/77", D + "/cookies.txt")
  assert.strictEqual(other[5], other[6] + "/profile")
  // No argument can carry a cookie or an address: only names and paths.
  assert.ok(other.slice(4).every(function(part) { return !/^https?:|[=;]/.test(part) }))
})

test("removeTreeArgv is rm -rf, an end of options, and one directory", function() {
  assert.deepStrictEqual(Sh.removeTreeArgv(TOOLS, R + "/signin/3"),
    ["/usr/bin/rm", "-rf", "--", R + "/signin/3"])
  assert.strictEqual(Sh.removeTreeArgv(TOOLS, R + "/signin/3").length, 4)
})

test("copyArgv is cp, an end of options, the source and the target", function() {
  assert.deepStrictEqual(Sh.copyArgv(TOOLS, D + "/cookies.txt", R + "/jar/4.txt"),
    ["/usr/bin/cp", "--", D + "/cookies.txt", R + "/jar/4.txt"])
  var argv = Sh.copyArgv(TOOLS, paths.jarFile, Paths.jarCopyFile(paths, 4))
  assert.ok(argv.every(function(part) { return part.charAt(0) !== "-" || part === "--" }), "no option but --")
})

test("every builder returns an array of strings whose first element is an absolute tool", function() {
  var all = everyArgv(TOOLS, paths)
  Object.keys(all).forEach(function(name) {
    var argv = all[name]
    assert.ok(Array.isArray(argv), name)
    argv.forEach(function(part, i) { assert.strictEqual(typeof part, "string", name + "[" + i + "]") })
    assert.match(argv[0], /^\/usr\/bin\/[a-z]+$/, name)
  })
})

test("tools come from the table that was passed in, each in its place", function() {
  var all = everyArgv(markedTools(), paths)
  var toolsOf = function(argv) {
    return argv.filter(function(part) { return part.indexOf("/marked/") === 0 })
  }
  assert.deepStrictEqual(toolsOf(all.prepareArgv), ["/marked/sh", "/marked/mpv", "/marked/ytdlp"])
  assert.deepStrictEqual(toolsOf(all.writeArgv), ["/marked/sh"])
  assert.deepStrictEqual(toolsOf(all.readArgv), ["/marked/head"])
  assert.deepStrictEqual(toolsOf(all.removeArgv), ["/marked/rm"])
  assert.deepStrictEqual(toolsOf(all.purgeArgv), ["/marked/find"])
  assert.deepStrictEqual(toolsOf(all.cleanupArgv), ["/marked/timeout", "/marked/rm"])
  assert.deepStrictEqual(toolsOf(all.cleanupWithJarArgv), ["/marked/timeout", "/marked/rm"])
  assert.deepStrictEqual(toolsOf(all.prepareDataArgv), ["/marked/sh"])
  assert.deepStrictEqual(toolsOf(all.signinDirsArgv), ["/marked/sh"])
  assert.deepStrictEqual(toolsOf(all.cookieExportArgv), ["/marked/sh", "/marked/ytdlp"])
  assert.deepStrictEqual(toolsOf(all.removeTreeArgv), ["/marked/rm"])
  assert.deepStrictEqual(toolsOf(all.copyArgv), ["/marked/cp"])
  Object.keys(all).forEach(function(name) {
    assert.ok(!/\/usr\/bin\/(sh|head|rm|find|timeout|mpv|yt-dlp|cp)"/.test(JSON.stringify(all[name])),
      name + " takes no tool from anywhere else")
  })
})

test("nothing varies but the documented slots", function() {
  var other = Paths.resolve({
    XDG_RUNTIME_DIR: "/run/elsewhere", XDG_STATE_HOME: "/data/state", XDG_DATA_HOME: null, HOME: "/srv/other"
  })
  assert.strictEqual(other.ok, true)
  var a = everyArgv(TOOLS, paths)
  var b = everyArgv(TOOLS, other)
  var differing = function(name) {
    assert.strictEqual(a[name].length, b[name].length, name)
    var slots = []
    for (var i = 0; i < a[name].length; i++) {
      if (a[name][i] !== b[name][i]) slots.push(i)
    }
    return slots
  }
  assert.deepStrictEqual(differing("prepareArgv"), [4, 5, 7], "runtime dir, state dir, runtime base")
  assert.deepStrictEqual(differing("writeArgv"), [4], "the target")
  assert.deepStrictEqual(differing("readArgv"), [4], "the file")
  assert.deepStrictEqual(differing("removeArgv"), [3, 4], "the files")
  assert.deepStrictEqual(differing("purgeArgv"), [1], "the directory")
  assert.deepStrictEqual(differing("cleanupArgv"), [7, 8, 9, 10, 11, 12, 13], "the seven paths")
  assert.deepStrictEqual(differing("cleanupWithJarArgv"), [7, 8, 9, 10, 11, 12, 13, 14], "and the login file")
  assert.deepStrictEqual(differing("prepareDataArgv"), [4, 5], "the data dir and the login file")
  assert.deepStrictEqual(differing("signinDirsArgv"), [4], "the attempt dir")
  assert.deepStrictEqual(differing("cookieExportArgv"), [5, 6, 7], "profile, attempt dir, login file")
  assert.deepStrictEqual(differing("removeTreeArgv"), [3], "the directory")
  assert.deepStrictEqual(differing("copyArgv"), [2, 3], "the source and the target")
  assert.deepStrictEqual(
    Sh.readArgv(TOOLS, paths.stateFile, 10).map(function(part, i) {
      return part === Sh.readArgv(TOOLS, paths.stateFile, 99)[i] ? "" : part
    }),
    ["", "", "11", "", ""], "and the byte count")
})

test("every element is a constant, a tool, or a path from Paths", function() {
  var all = everyArgv(TOOLS, paths)
  var allowed = [
    "-c", "--", "-f", "-rf", "-k", "-mindepth", "-maxdepth", "-type", "f", "-delete", "1", "2", "5",
    "omajuke-prepare", "omajuke-write", Sh.PREPARE, Sh.PRIVATE_WRITE, Const.MPRIS_SO,
    String(Const.LIMITS.stateBytes + 1),
    "omajuke-prepare-data", "omajuke-signin-dirs", "omajuke-export", Sh.PREPARE_DATA, Sh.SIGNIN_DIRS,
    Sh.COOKIE_EXPORT, "firefox", "chrome"
  ]
  Object.keys(TOOLS).forEach(function(name) { allowed.push(TOOLS[name]) })
  Object.keys(paths).forEach(function(name) { allowed.push(paths[name]) })
  allowed.push(Paths.infoFile(paths, 1), Paths.thumbFile(paths, 2), Paths.jarCopyFile(paths, 4))
  allowed.push(Paths.signinAttemptDir(paths, 3), Paths.signinAttemptDir(paths, 3) + "/profile")
  Object.keys(all).forEach(function(name) {
    all[name].forEach(function(part) {
      assert.ok(allowed.indexOf(part) !== -1, name + " holds something else: " + part.slice(0, 60))
    })
  })
})

test("no builder can be given a video id", function() {
  // The builders take a tool table and paths (or a byte count), and the
  // only variable part of a path is a counter.
  assert.deepStrictEqual(
    [Sh.prepareArgv.length, Sh.writeArgv.length, Sh.readArgv.length, Sh.removeArgv.length,
      Sh.purgeArgv.length, Sh.cleanupArgv.length, Sh.cleanupWithJarArgv.length, Sh.prepareDataArgv.length,
      Sh.signinDirsArgv.length, Sh.removeTreeArgv.length, Sh.copyArgv.length],
    [2, 2, 3, 2, 2, 2, 2, 2, 3, 2, 3])
  var id = "Abc123Def4Q"
  var hostile = [id, "../" + id, id + ".json", "x/" + id, -1, 0, 1.5, "1", null, undefined, NaN, Infinity]
  hostile.forEach(function(n) {
    assert.strictEqual(Paths.infoFile(paths, n), "", "infoFile(" + String(n) + ")")
    assert.strictEqual(Paths.thumbFile(paths, n), "", "thumbFile(" + String(n) + ")")
    assert.strictEqual(Paths.jarCopyFile(paths, n), "", "jarCopyFile(" + String(n) + ")")
    assert.strictEqual(Paths.signinAttemptDir(paths, n), "", "signinAttemptDir(" + String(n) + ")")
  })
  var text = JSON.stringify(everyArgv(TOOLS, paths))
  assert.ok(text.indexOf(id) === -1)
  var names = [Paths.infoFile(paths, 1), Paths.infoFile(paths, 9999999999), Paths.thumbFile(paths, 77)]
  names.forEach(function(name) {
    assert.match(name.slice(name.lastIndexOf("/") + 1), /^[0-9]{1,10}\.(json|jpg)$/, name)
    assert.strictEqual(Paths.owns(paths, name), true, name)
  })
})

test("what the builders name is what Paths.owns guards", function() {
  assert.strictEqual(Paths.owns(paths, Sh.writeArgv(TOOLS, paths.stateFile)[4]), true)
  assert.strictEqual(Paths.owns(paths, Sh.readArgv(TOOLS, paths.stateFile, 5)[4]), true)
  // The clean-up names directories and the socket, which no job of the
  // running service may touch: none of them passes the gate.
  Sh.cleanupArgv(TOOLS, paths).slice(7).forEach(function(target) {
    assert.strictEqual(Paths.owns(paths, target), false, target)
  })
  // Each file operation of signing in names one path of one kind.
  var all = everyArgv(TOOLS, paths)
  assert.strictEqual(Paths.kind(paths, all.removeTreeArgv[3]), "signinAttempt")
  assert.strictEqual(Paths.kind(paths, all.signinDirsArgv[4]), "signinAttempt")
  assert.strictEqual(Paths.kind(paths, all.cookieExportArgv[6]), "signinAttempt")
  assert.strictEqual(Paths.kind(paths, all.cookieExportArgv[7]), "jar")
  assert.strictEqual(Paths.kind(paths, all.copyArgv[2]), "jar")
  assert.strictEqual(Paths.kind(paths, all.copyArgv[3]), "jarCopy")
  assert.strictEqual(Paths.kind(paths, all.prepareDataArgv[5]), "jar")
  assert.strictEqual(Paths.kind(paths, all.cleanupWithJarArgv[14]), "jar")
})

test("the builders do not look at their paths: deciding is not their job", function() {
  // PrivateFs asks Paths.owns() before it builds a command; a builder only
  // places what it is given, as one element, whatever it contains.
  var odd = "/tmp/a b; $(id) 'q' \"d\"\n-rf"
  assert.strictEqual(Sh.writeArgv(TOOLS, odd)[4], odd)
  assert.strictEqual(Sh.readArgv(TOOLS, odd, 5)[4], odd)
  assert.deepStrictEqual(Sh.removeArgv(TOOLS, [odd, odd]).slice(3), [odd, odd])
  assert.strictEqual(Sh.purgeArgv(TOOLS, odd)[1], odd)
  assert.strictEqual(Sh.writeArgv(TOOLS, odd).length, 5)
  assert.strictEqual(Sh.removeTreeArgv(TOOLS, odd)[3], odd)
  assert.deepStrictEqual(Sh.copyArgv(TOOLS, odd, odd).slice(2), [odd, odd])
  assert.deepStrictEqual(Sh.signinDirsArgv(TOOLS, odd, odd).slice(4), [odd, odd])
  assert.deepStrictEqual(Sh.cookieExportArgv(TOOLS, odd, odd, odd).slice(4, 8),
    [odd, odd + "/profile", odd, odd])
})
