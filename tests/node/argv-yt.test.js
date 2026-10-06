"use strict"
// Tests for the command lines of lib/YtArgs.js and of the thumbnail fetch in
// lib/Thumbs.js: each is compared item by item with a list written out here
// a second time, nothing varies in them but the documented slots, and no
// builder has a way to take a query, an address or a video id.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var YtArgs = load.lib("YtArgs")
var Thumbs = load.lib("Thumbs")
var Const = load.lib("Const")
var Paths = load.lib("Paths")
var MpvArgs = load.lib("MpvArgs")

var TOOLS = Const.TOOLS
var CACHE = "/run/user/1000/omajuke/ytcache"

var paths = Paths.resolve({
  XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
})

var BASE = [
  "--ignore-config", "--no-plugin-dirs", "--cache-dir", CACHE, "--color", "never",
  "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10"
]
var SIGNED_OUT = ["--no-cookies", "--no-warnings"]
var SEARCH = ["/usr/bin/yt-dlp"].concat(BASE, SIGNED_OUT, ["--flat-playlist", "-J", "-a", "-"])
var FORMATS = {
  480: "bestvideo[height<=?480]+bestaudio/best",
  720: "bestvideo[height<=?720]+bestaudio/best",
  1080: "bestvideo[height<=?1080]+bestaudio/best"
}

function resolveList(height) {
  var own = ["--no-playlist", "-f", FORMATS[height], "-J", "-a", "-"]
  return ["/usr/bin/yt-dlp"].concat(BASE, SIGNED_OUT, own)
}

var CURL = [
  "/usr/bin/curl", "-q", "--no-progress-meter", "--fail", "--proto", "=https", "--proto-redir", "=https",
  "--max-redirs", "0", "--tlsv1.2", "--connect-timeout", "4", "--max-time", "8", "--max-filesize", "262144",
  "--remove-on-error", "--parallel", "--parallel-max", "4", "--user-agent", "",
  "--write-out", "%{urlnum} %{response_code} %{exitcode} %{size_download} %{content_type}\\n",
  "--config", "-"
]

// Tool paths no real machine has, to see where a tool lands in an argv.
function markedTools() {
  var marked = {}
  Object.keys(TOOLS).forEach(function(name) { marked[name] = "/marked/" + name })
  return marked
}

// Every yt-dlp command line this version can build.
function everyYtArgv(tools, p) {
  return {
    search: YtArgs.search(tools, p),
    resolve480: YtArgs.resolve(tools, p, 480),
    resolve720: YtArgs.resolve(tools, p, 720),
    resolve1080: YtArgs.resolve(tools, p, 1080)
  }
}

function each(all, check) {
  Object.keys(all).forEach(function(name) { check(all[name], name) })
}

// ---- yt-dlp ----

test("the modules export exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(YtArgs).sort(), ["SIGNED_OUT", "base", "format", "resolve", "search"])
  assert.deepStrictEqual(Object.keys(Thumbs).sort(), ["argv", "config", "evictCount", "parse"])
})

test("the paths used here resolve to the usual places", function() {
  assert.strictEqual(paths.ok, true)
  assert.strictEqual(paths.ytCacheDir, CACHE)
})

test("base is the list every call starts with, and holds no --no-warnings", function() {
  assert.deepStrictEqual(YtArgs.base(paths), BASE)
  assert.strictEqual(YtArgs.base(paths).indexOf("--no-warnings"), -1)
  assert.strictEqual(YtArgs.base(paths).indexOf("--no-cookies"), -1)
  assert.strictEqual(YtArgs.base(paths).indexOf("--cookies"), -1)
})

test("every call ignores the user's configuration, plugins, browsers and remote code", function() {
  var always = [
    "--ignore-config", "--no-plugin-dirs", "--no-mark-watched", "--no-cookies-from-browser",
    "--no-remote-components"
  ]
  always.forEach(function(flag) {
    assert.ok(YtArgs.base(paths).indexOf(flag) !== -1, "base: " + flag)
    each(everyYtArgv(TOOLS, paths), function(argv, name) {
      assert.strictEqual(argv.filter(function(part) { return part === flag }).length, 1, name + ": " + flag)
    })
  })
})

test("a signed-out call has no cookies and no warnings", function() {
  assert.deepStrictEqual(Array.prototype.slice.call(YtArgs.SIGNED_OUT), SIGNED_OUT)
  each(everyYtArgv(TOOLS, paths), function(argv, name) {
    assert.ok(argv.indexOf("--no-cookies") !== -1, name)
    assert.ok(argv.indexOf("--no-warnings") !== -1, name)
  })
})

test("--no-warnings goes with --no-cookies, and never with --cookies", function() {
  each(everyYtArgv(TOOLS, paths), function(argv, name) {
    if (argv.indexOf("--no-cookies") !== -1) assert.ok(argv.indexOf("--no-warnings") !== -1, name)
    if (argv.indexOf("--cookies") !== -1) assert.strictEqual(argv.indexOf("--no-warnings"), -1, name)
    // This version has no signed-in call at all.
    assert.strictEqual(argv.indexOf("--cookies"), -1, name)
  })
})

test("no command line depends on a list another importer can reach", function() {
  assert.ok(Object.isFrozen(YtArgs.SIGNED_OUT))
  assert.throws(function() { YtArgs.SIGNED_OUT.push("--cookies") })
  assert.throws(function() { YtArgs.SIGNED_OUT[0] = "--cookies" })
  assert.deepStrictEqual(Array.prototype.slice.call(YtArgs.SIGNED_OUT), SIGNED_OUT)
  // Qt's engine does not enforce a frozen list (the harness case checks
  // that there), so the builders must not read the exported one back. A
  // stand-in module with a writable export shows that they do not.
  var source = fs.readFileSync(path.join(__dirname, "..", "..", "lib", "YtArgs.js"), "utf8")
  var body = source.replace(/^\.pragma library$/m, "").replace("Object.freeze(_signedOut())", "_signedOut()")
  assert.notStrictEqual(body, source.replace(/^\.pragma library$/m, ""))
  var mod = { exports: {} }
  new Function("module", body)(mod)
  mod.exports.SIGNED_OUT[0] = "--cookies"
  mod.exports.SIGNED_OUT.push("--exec")
  assert.deepStrictEqual(mod.exports.search(TOOLS, paths), SEARCH)
  assert.deepStrictEqual(mod.exports.resolve(TOOLS, paths, 480), resolveList(480))
})

test("search is base, signed out, and a flat JSON listing read from standard input", function() {
  assert.deepStrictEqual(YtArgs.search(TOOLS, paths), SEARCH)
})

test("resolve is base, signed out, one video in one of three formats, read from standard input", function() {
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 480), resolveList(480))
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 720), resolveList(720))
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 1080), resolveList(1080))
})

test("every signed-out call is the tool, base, SIGNED_OUT and its own flags, in that order", function() {
  each(everyYtArgv(TOOLS, paths), function(argv, name) {
    assert.strictEqual(argv[0], "/usr/bin/yt-dlp", name)
    assert.deepStrictEqual(argv.slice(1, 1 + BASE.length), BASE, name)
    assert.deepStrictEqual(argv.slice(1 + BASE.length, 3 + BASE.length), SIGNED_OUT, name)
    assert.deepStrictEqual(argv.slice(-3), ["-J", "-a", "-"], name + " reads its input from stdin")
  })
})

test("format is a choice among three constant texts", function() {
  assert.strictEqual(YtArgs.format(480), FORMATS[480])
  assert.strictEqual(YtArgs.format(720), FORMATS[720])
  assert.strictEqual(YtArgs.format(1080), FORMATS[1080])
})

test("format never carries its argument into the text", function() {
  var odd = [
    undefined, null, 0, -1, 360, 481, 2160, 4320, 720.5, NaN, Infinity, "480", "720", "1080", "best", "",
    "worst[height<=?1]", "480]+bestaudio/best --exec x", true, {}, [], [480],
    { valueOf: function() { return 480 } }
  ]
  odd.forEach(function(value) {
    assert.strictEqual(YtArgs.format(value), FORMATS[720], String(value))
  })
  // A value that cannot even be turned into text does not make it throw.
  assert.strictEqual(YtArgs.format(Object.create(null)), FORMATS[720])
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, "1080 --exec x"), resolveList(720))
})

test("every list is an array of strings whose first element is an absolute tool", function() {
  var all = everyYtArgv(TOOLS, paths)
  all.curl = Thumbs.argv(TOOLS)
  each(all, function(argv, name) {
    assert.ok(Array.isArray(argv), name)
    argv.forEach(function(part, i) { assert.strictEqual(typeof part, "string", name + "[" + i + "]") })
    assert.match(argv[0], /^\/usr\/bin\/[a-z-]+$/, name)
  })
})

test("each call returns a new list", function() {
  var first = YtArgs.search(TOOLS, paths)
  first.push("--exec")
  first[1] = "changed"
  assert.deepStrictEqual(YtArgs.search(TOOLS, paths), SEARCH)
  var base = YtArgs.base(paths)
  base.length = 0
  assert.deepStrictEqual(YtArgs.base(paths), BASE)
  var curl = Thumbs.argv(TOOLS)
  curl.length = 0
  assert.deepStrictEqual(Thumbs.argv(TOOLS), CURL)
})

test("the tool comes from the table that was passed in, and only that tool", function() {
  var marked = markedTools()
  each(everyYtArgv(marked, paths), function(argv, name) {
    assert.deepStrictEqual(argv.filter(function(part) { return part.indexOf("/marked/") === 0 }),
      ["/marked/ytdlp"], name)
    assert.ok(JSON.stringify(argv).indexOf("/usr/bin/") === -1, name)
  })
  assert.deepStrictEqual(Thumbs.argv(marked).filter(function(part) { return part.indexOf("/marked/") === 0 }),
    ["/marked/curl"])
  assert.ok(JSON.stringify(Thumbs.argv(marked)).indexOf("/usr/bin/") === -1)
})

test("nothing varies but the tool, the cache folder and the format", function() {
  var other = Paths.resolve({
    XDG_RUNTIME_DIR: "/run/elsewhere", XDG_STATE_HOME: "/data/state", XDG_DATA_HOME: null, HOME: "/srv/other"
  })
  assert.strictEqual(other.ok, true)
  var a = everyYtArgv(TOOLS, paths)
  var b = everyYtArgv(markedTools(), other)
  each(a, function(argv, name) {
    assert.strictEqual(argv.length, b[name].length, name)
    var slots = []
    for (var i = 0; i < argv.length; i++) {
      if (argv[i] !== b[name][i]) slots.push(i)
    }
    assert.deepStrictEqual(slots, [0, 4], name + ": the tool and the cache folder")
    assert.strictEqual(b[name][4], "/run/elsewhere/omajuke/ytcache", name)
  })
  // Between two heights only the value behind -f differs.
  var formatSlot = a.resolve480.indexOf("-f") + 1
  assert.strictEqual(a.resolve480[formatSlot], FORMATS[480])
  assert.strictEqual(a.resolve480.length, a.resolve1080.length)
  for (var i = 0; i < a.resolve480.length; i++) {
    assert.strictEqual(a.resolve480[i] === a.resolve1080[i], i !== formatSlot, "slot " + i)
  }
})

test("every element is a constant, the tool or the cache folder", function() {
  var allowed = SEARCH.concat(["--no-playlist", "-f", FORMATS[480], FORMATS[720], FORMATS[1080]])
  each(everyYtArgv(TOOLS, paths), function(argv, name) {
    argv.forEach(function(part) {
      assert.ok(allowed.indexOf(part) !== -1, name + " holds something else: " + part.slice(0, 60))
    })
  })
})

test("what is never passed to yt-dlp", function() {
  var never = [
    "-v", "--verbose", "--print-traffic", "--write-pages", "--dump-pages", "-o", "--output", "--exec",
    "--netrc", "--netrc-cmd", "--enable-file-urls", "--no-check-certificates", "--cookies-from-browser",
    "--config-locations", "--config-location", "--load-info-json", "--write-info-json", "--remote-components",
    "--mark-watched", "--proxy", "--plugin-dirs", "--update", "-U", "--update-to", "--js-runtimes",
    "--extractor-args", "--user-agent", "--add-headers", "--", "--batch-file"
  ]
  each(everyYtArgv(TOOLS, paths), function(argv, name) {
    never.forEach(function(flag) { assert.strictEqual(argv.indexOf(flag), -1, name + ": " + flag) })
    argv.forEach(function(part) {
      assert.ok(!/^https?:/.test(part) && part.indexOf("ytsearch") === -1, name + " names what is looked up")
      assert.ok(!/[\s\u0000-\u001f]/.test(part), name + ": an element with a blank or a control")
    })
  })
})

test("no builder can be given a query, an address or a video id", function() {
  // Tools and paths, and for a resolve the height; nothing else is read.
  var arity = [YtArgs.base, YtArgs.search, YtArgs.resolve, YtArgs.format, Thumbs.argv].map(function(builder) {
    return builder.length
  })
  assert.deepStrictEqual(arity, [1, 2, 3, 1, 1])
  var id = "Abc123Def4Q"
  var hostile = [id, "--no-config", "constructor", "https://www.youtube.com/watch?v=" + id, "ytsearch1:x"]
  hostile.forEach(function(value) {
    var argv = YtArgs.resolve(TOOLS, paths, value)
    assert.deepStrictEqual(argv, resolveList(720), value)
    // Extra arguments are not looked at.
    assert.deepStrictEqual(YtArgs.search(TOOLS, paths, value), SEARCH, value)
    assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 720, value), resolveList(720), value)
    assert.deepStrictEqual(Thumbs.argv(TOOLS, value), CURL, value)
  })
})

test("without resolved paths or without the tool there is no command line", function() {
  var noPaths = [
    null, undefined, {}, { ok: false }, { ok: false, ytCacheDir: CACHE }, { ok: true },
    { ok: true, ytCacheDir: 5 }, { ok: true, ytCacheDir: "" }, { ok: true, ytCacheDir: "relative/ytcache" },
    { ok: "true", ytCacheDir: CACHE }, "paths", 7
  ]
  noPaths.forEach(function(p) {
    assert.strictEqual(YtArgs.base(p), null)
    assert.strictEqual(YtArgs.search(TOOLS, p), null)
    assert.strictEqual(YtArgs.resolve(TOOLS, p, 720), null)
  })
  var noTools = [
    null, undefined, {}, { ytdlp: "" }, { ytdlp: "yt-dlp" }, { ytdlp: 5 }, { ytdlp: null }, "tools"
  ]
  noTools.forEach(function(tools) {
    assert.strictEqual(YtArgs.search(tools, paths), null)
    assert.strictEqual(YtArgs.resolve(tools, paths, 720), null)
  })
  var noCurl = [null, undefined, {}, { curl: "" }, { curl: "curl" }, { curl: 5 }, { curl: null }, "tools"]
  noCurl.forEach(function(tools) { assert.strictEqual(Thumbs.argv(tools), null) })
})

test("the builders change neither the tool table nor the paths", function() {
  var tools = JSON.stringify(TOOLS)
  var before = JSON.stringify(paths)
  everyYtArgv(TOOLS, paths)
  Thumbs.argv(TOOLS)
  assert.strictEqual(JSON.stringify(TOOLS), tools)
  assert.strictEqual(JSON.stringify(paths), before)
})

test("mpv's yt-dlp hook is given the same restrictions as these calls", function() {
  var launched = MpvArgs.launch({ sock: paths.sock, volume: 70, mpris: false, ytdlp: TOOLS.ytdlp })
  var raw = launched.filter(function(part) { return part.indexOf("--ytdl-raw-options=") === 0 })
  assert.strictEqual(raw.length, 1)
  var options = raw[0].slice("--ytdl-raw-options=".length).split(",")
  // The hook takes "name=value" pairs: a flag of ours is the name with an
  // empty value. The cache folder and the colour are the two flags of base
  // that the hook does not need: it runs with no cache at all and its
  // output is read by mpv.
  var flags = BASE.filter(function(part) { return part.indexOf("--") === 0 })
  flags.forEach(function(flag) {
    var name = flag.slice(2)
    if (name === "cache-dir") { assert.ok(options.indexOf("no-cache-dir=") !== -1); return }
    if (name === "color") return
    if (name === "socket-timeout") { assert.ok(options.indexOf("socket-timeout=10") !== -1); return }
    assert.ok(options.indexOf(name + "=") !== -1, "the hook lacks " + name)
  })
  assert.strictEqual(options.indexOf("no-warnings="), -1)
})

// ---- curl ----

test("the thumbnail fetch is exactly this list", function() {
  assert.deepStrictEqual(Thumbs.argv(TOOLS), CURL)
})

test("the user's curl configuration is not read, and that flag comes first", function() {
  assert.strictEqual(Thumbs.argv(TOOLS)[1], "-q")
})

test("https only, no redirect, a time limit and a size limit for every transfer", function() {
  var argv = Thumbs.argv(TOOLS)
  var valueOf = function(flag) {
    var at = argv.indexOf(flag)
    assert.ok(at !== -1 && argv.lastIndexOf(flag) === at, flag + " is there once")
    return argv[at + 1]
  }
  assert.strictEqual(valueOf("--proto"), "=https")
  assert.strictEqual(valueOf("--proto-redir"), "=https")
  assert.strictEqual(valueOf("--max-redirs"), "0")
  assert.strictEqual(valueOf("--max-filesize"), String(Const.LIMITS.thumbBytes))
  assert.strictEqual(valueOf("--parallel-max"), "4")
  assert.strictEqual(valueOf("--user-agent"), "")
  assert.strictEqual(valueOf("--config"), "-")
  var connect = Number(valueOf("--connect-timeout"))
  var transfer = Number(valueOf("--max-time"))
  assert.ok(connect >= 1 && connect <= transfer)
  // One transfer has ended, one way or the other, before the job's own
  // deadline ends them all.
  assert.ok(transfer < Const.TIMEOUTS.thumbs)
  var present = ["--fail", "--remove-on-error", "--tlsv1.2", "--parallel", "--no-progress-meter"]
  present.forEach(function(flag) { assert.ok(argv.indexOf(flag) !== -1, flag) })
})

test("what is never passed to curl", function() {
  var argv = Thumbs.argv(TOOLS)
  var never = [
    "-L", "--location", "--location-trusted", "-k", "--insecure", "-b", "--cookie", "-c", "--cookie-jar",
    "-x", "--proxy", "--socks5", "-K", "-o", "--output", "-O", "--remote-name", "--remote-name-all", "-J",
    "--remote-header-name", "--create-dirs", "--output-dir", "-u", "--user", "-H", "--header", "-e",
    "--referer", "-v", "--verbose", "--trace", "--trace-ascii", "--netrc", "--next", "--url", "-d", "--data",
    "-T", "--upload-file", "--doh-url", "--etag-save", "--hsts", "--alt-svc", "--libcurl", "-D",
    "--dump-header", "--stderr"
  ]
  never.forEach(function(flag) { assert.strictEqual(argv.indexOf(flag), -1, flag) })
  argv.forEach(function(part) {
    assert.ok(part.indexOf("://") === -1, "an address in the command line")
    assert.ok(part.indexOf(".jpg") === -1 && part.indexOf("ytimg") === -1, "a transfer in the command line")
  })
})

test("the report format is one line of five fields for each transfer", function() {
  var argv = Thumbs.argv(TOOLS)
  var format = argv[argv.indexOf("--write-out") + 1]
  // The last two characters are a backslash and an n, which curl itself
  // turns into the line break: no control character is in the argument.
  assert.strictEqual(format.slice(-2), "\\n")
  assert.ok(!/[\u0000-\u001f]/.test(format))
  assert.deepStrictEqual(format.slice(0, -2).split(" "),
    ["%{urlnum}", "%{response_code}", "%{exitcode}", "%{size_download}", "%{content_type}"])
})
