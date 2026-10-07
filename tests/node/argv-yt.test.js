"use strict"
// Tests for every yt-dlp command line the plugin runs and for the thumbnail
// fetch in lib/Thumbs.js. The yt-dlp ones come from two files: lib/YtArgs.js
// (search, lookup, related tracks, and the lookup with the account) and
// lib/FeedUrls.js (the account's lists, the check of a new login, the
// watched report). They are tested here together, on the functions the
// plugin calls: each is compared item by item with a list written out here
// a second time, nothing varies in them but the documented slots, and no
// builder has a way to take a query, an address or a video id. A call is
// either signed out or given a throwaway copy of the saved login, never
// the saved login itself and never both.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var YtArgs = load.lib("YtArgs")
var FeedUrls = load.lib("FeedUrls")
var Thumbs = load.lib("Thumbs")
var Const = load.lib("Const")
var Paths = load.lib("Paths")
var MpvArgs = load.lib("MpvArgs")

var TOOLS = Const.TOOLS
var CACHE = "/run/user/1000/omajuke/ytcache"
var COPY = "/run/user/1000/omajuke/jar/7.txt"

var paths = Paths.resolve({
  XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
})

var BASE = [
  "--ignore-config", "--no-plugin-dirs", "--cache-dir", CACHE, "--color", "never",
  "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10"
]
var SIGNED_OUT = ["--no-cookies", "--no-warnings"]
var WITH_COPY = ["--cookies", COPY]
var SEARCH = ["/usr/bin/yt-dlp"].concat(BASE, SIGNED_OUT, ["--flat-playlist", "-J", "-a", "-"])
var MIX = ["/usr/bin/yt-dlp"].concat(BASE, SIGNED_OUT,
  ["--flat-playlist", "--playlist-items", "1:25", "-J", "-a", "-"])
var FEED = ["/usr/bin/yt-dlp"].concat(BASE, WITH_COPY,
  ["--flat-playlist", "--playlist-items", "1:50", "-J", "-a", "-"])
var VERIFY = ["/usr/bin/yt-dlp"].concat(BASE, WITH_COPY,
  ["--flat-playlist", "--playlist-items", "1:1", "-J", "-a", "-"])
var MARK = ["/usr/bin/yt-dlp"].concat(BASE, WITH_COPY, ["--mark-watched", "--simulate", "--quiet", "-a", "-"])
var FORMATS = {
  480: "bestvideo[height<=?480]+bestaudio/best",
  720: "bestvideo[height<=?720]+bestaudio/best",
  1080: "bestvideo[height<=?1080]+bestaudio/best"
}
// What a lookup asks yt-dlp to print about a video, written out a second
// time: an object of these fields, as one line of JSON.
var FIELDS = [
  "id", "title", "fulltitle", "channel", "channel_id", "uploader", "uploader_id", "duration", "is_live",
  "was_live", "live_status", "_type", "formats", "requested_formats", "format", "format_id", "ext",
  "protocol", "http_headers", "extractor", "extractor_key", "webpage_url", "webpage_url_basename",
  "webpage_url_domain", "original_url", "display_id", "chapters", "availability", "age_limit",
  "release_timestamp", "start_time", "end_time", "acodec", "vcodec", "tbr", "abr", "vbr", "asr",
  "audio_channels", "width", "height", "fps", "language", "epoch", "_version"
]
var PRINT = "%(.{" + FIELDS.join(",") + "})j"
// The flags that make yt-dlp print everything it knows about a video.
var WHOLE_RECORD = ["-J", "--dump-single-json", "-j", "--dump-json"]
// Where the copy of the login stands in a call that uses the account.
var COPY_SLOT = 1 + BASE.length + 1

function resolveList(height) {
  var own = ["--no-playlist", "-f", FORMATS[height], "--print", PRINT, "-a", "-"]
  return ["/usr/bin/yt-dlp"].concat(BASE, SIGNED_OUT, own)
}

function accountResolveList(height) {
  var own = ["--no-playlist", "-f", FORMATS[height], "--print", PRINT, "-a", "-"]
  return ["/usr/bin/yt-dlp"].concat(BASE, WITH_COPY, own)
}

// True for the names under which everySignedOut and everyAccount keep the
// lookup of one video.
function isLookup(name) {
  return name.indexOf("resolve") === 0 || name.indexOf("account") === 0
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

// Every yt-dlp command line that is not signed in.
function everySignedOut(tools, p) {
  return {
    search: YtArgs.search(tools, p),
    resolve480: YtArgs.resolve(tools, p, 480),
    resolve720: YtArgs.resolve(tools, p, 720),
    resolve1080: YtArgs.resolve(tools, p, 1080),
    mix: YtArgs.mix(tools, p)
  }
}

// Every yt-dlp command line that uses the account.
function everyAccount(tools, p, copy) {
  return {
    feed: FeedUrls.feedArgv(tools, p, copy),
    verify: FeedUrls.verifyArgv(tools, p, copy),
    mark: FeedUrls.markArgv(tools, p, copy),
    account480: YtArgs.resolveWithAccount(tools, p, 480, copy),
    account720: YtArgs.resolveWithAccount(tools, p, 720, copy),
    account1080: YtArgs.resolveWithAccount(tools, p, 1080, copy)
  }
}

function everyYtArgv(tools, p, copy) {
  return Object.assign(everySignedOut(tools, p), everyAccount(tools, p, copy))
}

function each(all, check) {
  Object.keys(all).forEach(function(name) { check(all[name], name) })
}

function count(argv, flag) {
  return argv.filter(function(part) { return part === flag }).length
}

// ---- yt-dlp ----

test("the modules export exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(YtArgs).sort(), [
    "SIGNED_OUT", "base", "format", "mix", "resolve", "resolveWithAccount", "search"
  ])
  // The three calls made for the account itself have one builder each, in
  // lib/FeedUrls.js. A second copy here would be the one a reader hardens
  // while the other one runs.
  var elsewhere = ["feed", "verify", "mark", "feedArgv", "verifyArgv", "markArgv"]
  elsewhere.forEach(function(name) { assert.strictEqual(YtArgs[name], undefined, name) })
  var signedIn = ["feedArgv", "markArgv", "verifyArgv"]
  signedIn.forEach(function(name) { assert.strictEqual(typeof FeedUrls[name], "function", name) })
  assert.deepStrictEqual(Object.keys(Thumbs).sort(), ["argv", "config", "evictCount", "parse"])
})

test("the paths used here resolve to the usual places", function() {
  assert.strictEqual(paths.ok, true)
  assert.strictEqual(paths.ytCacheDir, CACHE)
  assert.strictEqual(Paths.jarCopyFile(paths, 7), COPY)
  assert.strictEqual(paths.jarFile, "/home/user/.local/share/omajuke/cookies.txt")
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
    each(everyYtArgv(TOOLS, paths, COPY), function(argv, name) {
      assert.strictEqual(count(argv, flag), 1, name + ": " + flag)
    })
  })
})

test("a signed-out call has no cookies and no warnings", function() {
  assert.deepStrictEqual(Array.prototype.slice.call(YtArgs.SIGNED_OUT), SIGNED_OUT)
  each(everySignedOut(TOOLS, paths), function(argv, name) {
    assert.strictEqual(count(argv, "--no-cookies"), 1, name)
    assert.strictEqual(count(argv, "--no-warnings"), 1, name)
    assert.strictEqual(argv.indexOf("--cookies"), -1, name)
  })
})

test("a call that uses the account names one cookie file and keeps its warnings", function() {
  each(everyAccount(TOOLS, paths, COPY), function(argv, name) {
    assert.strictEqual(count(argv, "--cookies"), 1, name)
    assert.strictEqual(argv[argv.indexOf("--cookies") + 1], COPY, name)
    assert.strictEqual(argv.indexOf("--cookies"), COPY_SLOT - 1, name)
    assert.strictEqual(argv.indexOf("--no-cookies"), -1, name)
    assert.strictEqual(argv.indexOf("--no-warnings"), -1, name)
    assert.strictEqual(argv.indexOf("--quiet") !== -1, name === "mark", name)
  })
})

test("--no-warnings goes with --no-cookies, and never with --cookies", function() {
  each(everyYtArgv(TOOLS, paths, COPY), function(argv, name) {
    if (argv.indexOf("--no-cookies") !== -1) assert.ok(argv.indexOf("--no-warnings") !== -1, name)
    if (argv.indexOf("--cookies") !== -1) assert.strictEqual(argv.indexOf("--no-warnings"), -1, name)
    // One or the other, and never neither.
    assert.strictEqual(count(argv, "--no-cookies") + count(argv, "--cookies"), 1, name)
  })
})

test("what is looked up ahead of a play is looked up signed out", function() {
  // A video is looked up for a play, for the next track and for a rested
  // highlight with one and the same list, and that list has no cookie file
  // and leaves nothing marked as watched.
  [480, 720, 1080].forEach(function(height) {
    var argv = YtArgs.resolve(TOOLS, paths, height)
    assert.deepStrictEqual(argv.slice(1 + BASE.length, 3 + BASE.length), SIGNED_OUT)
    assert.strictEqual(argv.indexOf("--cookies"), -1)
    assert.strictEqual(argv.indexOf("--mark-watched"), -1)
    assert.strictEqual(count(argv, "--no-mark-watched"), 1)
  })
  // No further argument turns it into a call with the account.
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 720, COPY), resolveList(720))
  assert.deepStrictEqual(YtArgs.mix(TOOLS, paths, COPY), MIX)
  assert.deepStrictEqual(YtArgs.search(TOOLS, paths, COPY), SEARCH)
})

test("the account is used with a throwaway copy of the login and with nothing else", function() {
  var info = Paths.infoFile(paths, 7)
  var refused = [
    paths.jarFile, paths.dataDir, paths.jarDir, paths.jarDir + "/", paths.jarDir + "/cookies.txt",
    paths.jarDir + "/7", paths.jarDir + "/7.txt/", paths.jarDir + "/7.txt.bak", paths.jarDir + "/-7.txt",
    paths.jarDir + "/../jar/7.txt", paths.jarDir + "//7.txt", paths.jarDir + "/7.txt\n", " " + COPY,
    paths.jarDir + "/12345678901.txt", "jar/7.txt", "7.txt", "/etc/passwd", "/tmp/7.txt", info,
    paths.stateFile, paths.sock, "", "-", "--no-config", "constructor", null, undefined, 7, true, {}, [COPY],
    { toString: function() { return COPY } }
  ]
  refused.forEach(function(copy) {
    each(everyAccount(TOOLS, paths, copy), function(argv, name) {
      assert.strictEqual(argv, null, name + ": " + String(copy).slice(0, 60))
    })
  })
  // The copy must lie in the directory of the paths that were passed in.
  var other = Paths.resolve({ XDG_RUNTIME_DIR: "/run/elsewhere", XDG_STATE_HOME: null, XDG_DATA_HOME: null,
    HOME: "/home/user" })
  each(everyAccount(TOOLS, other, COPY), function(argv, name) { assert.strictEqual(argv, null, name) })
  // Every counter the file layer hands out is taken.
  var counters = [1, 2, 10, 9999999999]
  counters.forEach(function(n) {
    assert.deepStrictEqual(FeedUrls.feedArgv(TOOLS, paths, Paths.jarCopyFile(paths, n)).slice(COPY_SLOT - 1,
      COPY_SLOT + 1), ["--cookies", "/run/user/1000/omajuke/jar/" + n + ".txt"])
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
  var plain = source.split("\n").filter(function(line) { return line.charAt(0) !== "." }).join("\n")
  var body = plain.replace("Object.freeze(_signedOut())", "_signedOut()")
  assert.notStrictEqual(body, plain)
  var mod = { exports: {} }
  new Function("Const", "Paths", "module", body)(Const, Paths, mod)
  mod.exports.SIGNED_OUT[0] = "--cookies"
  mod.exports.SIGNED_OUT.push("--exec")
  assert.deepStrictEqual(mod.exports.search(TOOLS, paths), SEARCH)
  assert.deepStrictEqual(mod.exports.resolve(TOOLS, paths, 480), resolveList(480))
  assert.deepStrictEqual(mod.exports.mix(TOOLS, paths), MIX)
  assert.deepStrictEqual(mod.exports.resolveWithAccount(TOOLS, paths, 720, COPY), accountResolveList(720))
})

test("search is base, signed out, and a flat JSON listing read from standard input", function() {
  assert.deepStrictEqual(YtArgs.search(TOOLS, paths), SEARCH)
})

test("resolve is base, signed out, one video in one of three formats, read from standard input", function() {
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 480), resolveList(480))
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 720), resolveList(720))
  assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 1080), resolveList(1080))
})

test("mix is base, signed out, and the head of a flat listing", function() {
  assert.deepStrictEqual(YtArgs.mix(TOOLS, paths), MIX)
  // As many entries are asked for as are read from the answer.
  assert.strictEqual(MIX[MIX.indexOf("--playlist-items") + 1], "1:" + Const.LIMITS.mixFetch)
})

test("feed and verify are base, the copy, and the head of a flat listing", function() {
  assert.deepStrictEqual(FeedUrls.feedArgv(TOOLS, paths, COPY), FEED)
  assert.deepStrictEqual(FeedUrls.verifyArgv(TOOLS, paths, COPY), VERIFY)
  assert.strictEqual(FEED[FEED.indexOf("--playlist-items") + 1], "1:" + Const.LIMITS.feedCount)
})

test("a video is looked up with the account by the same list, the copy in place of the pair", function() {
  var heights = [480, 720, 1080]
  heights.forEach(function(height) {
    var argv = YtArgs.resolveWithAccount(TOOLS, paths, height, COPY)
    assert.deepStrictEqual(argv, accountResolveList(height))
    var plain = YtArgs.resolve(TOOLS, paths, height)
    assert.deepStrictEqual(argv.slice(COPY_SLOT + 1), plain.slice(COPY_SLOT + 1))
  })
})

test("mark reports a video as watched and downloads nothing", function() {
  var argv = FeedUrls.markArgv(TOOLS, paths, COPY)
  assert.deepStrictEqual(argv, MARK)
  // The flag that allows marking stands behind the one that forbids it,
  // and the last one decides.
  assert.ok(argv.indexOf("--mark-watched") > argv.lastIndexOf("--no-mark-watched"))
  assert.ok(argv.indexOf("--simulate") !== -1)
  assert.strictEqual(argv.indexOf("-J"), -1)
  // No other call can leave anything marked.
  each(everyYtArgv(TOOLS, paths, COPY), function(other, name) {
    assert.strictEqual(other.indexOf("--mark-watched") !== -1, name === "mark", name)
  })
})

test("every call is the tool, base, how it is signed in, and its own flags, in that order", function() {
  each(everySignedOut(TOOLS, paths), function(argv, name) {
    assert.strictEqual(argv[0], "/usr/bin/yt-dlp", name)
    assert.deepStrictEqual(argv.slice(1, 1 + BASE.length), BASE, name)
    assert.deepStrictEqual(argv.slice(1 + BASE.length, 3 + BASE.length), SIGNED_OUT, name)
    assert.deepStrictEqual(argv.slice(-2), ["-a", "-"], name + " reads its input from stdin")
    var printing = isLookup(name) ? ["--print", PRINT] : ["-J"]
    assert.deepStrictEqual(argv.slice(-2 - printing.length, -2), printing, name + " prints one JSON answer")
  })
  each(everyAccount(TOOLS, paths, COPY), function(argv, name) {
    assert.strictEqual(argv[0], "/usr/bin/yt-dlp", name)
    assert.deepStrictEqual(argv.slice(1, 1 + BASE.length), BASE, name)
    assert.deepStrictEqual(argv.slice(1 + BASE.length, 3 + BASE.length), WITH_COPY, name)
    assert.deepStrictEqual(argv.slice(-2), ["-a", "-"], name + " reads its input from stdin")
  })
})

// The whole record of a video with automatic captions is more than ten
// megabytes, nearly all of it the list of captions, and an answer is read
// up to Const.LIMITS.resolveBytes: asked for, it made such a video
// unplayable. A lookup therefore names the fields it wants.
test("a lookup asks for named fields and never for the whole record of a video", function() {
  var lookups = 0
  each(everyYtArgv(TOOLS, paths, COPY), function(argv, name) {
    if (!isLookup(name)) {
      // Everything else lists entries without looking them up, or prints
      // nothing at all.
      assert.strictEqual(argv.indexOf("--print"), -1, name)
      assert.strictEqual(argv.indexOf("-J") !== -1, argv.indexOf("--flat-playlist") !== -1, name)
      return
    }
    lookups += 1
    WHOLE_RECORD.forEach(function(flag) { assert.strictEqual(argv.indexOf(flag), -1, name + ": " + flag) })
    assert.strictEqual(argv.indexOf("--flat-playlist"), -1, name)
    assert.strictEqual(count(argv, "--print"), 1, name)
    assert.strictEqual(argv[argv.indexOf("--print") + 1], PRINT, name)
  })
  assert.strictEqual(lookups, 6)
})

test("the fields of a lookup are plain names in one constant text", function() {
  assert.ok(/^%\(\.\{[a-z_]+(,[a-z_]+)*\}\)j$/.test(PRINT))
  assert.strictEqual(new Set(FIELDS).size, FIELDS.length)
  // The parts of the record that grow with the video and are never read:
  // captions above all, then pictures, texts and what viewers wrote.
  var unread = [
    "automatic_captions", "subtitles", "requested_subtitles", "thumbnails", "thumbnail", "description",
    "comments", "heatmap", "tags", "categories"
  ]
  unread.forEach(function(name) { assert.strictEqual(FIELDS.indexOf(name), -1, name) })
  // The same text whatever is passed in: no argument reaches it.
  var odd = [undefined, null, 480, "1080", "x})j --exec x", {}, ["id"]]
  odd.forEach(function(value) {
    var argv = YtArgs.resolve(TOOLS, paths, value, value)
    assert.strictEqual(argv[argv.indexOf("--print") + 1], PRINT, String(value))
  })
})

test("every field a track is read from is among the fields of a lookup", function() {
  // The video fixture holds what yt-dlp knows; cut down to the fields a
  // lookup asks for, it must give the same track and the same video
  // address. A field read in lib/Track.js and missing from the list would
  // show here as a different answer.
  var Track = load.lib("Track")
  var text = fs.readFileSync(path.join(__dirname, "..", "fixtures", "video.json"), "utf8")
  var whole = JSON.parse(text)
  var kept = {}
  FIELDS.forEach(function(name) {
    if (Object.prototype.hasOwnProperty.call(whole, name) && whole[name] !== null) kept[name] = whole[name]
  })
  var line = JSON.stringify(kept).replace(/[\u007f-\uffff]/g, function(unit) {
    return "\\u" + unit.charCodeAt(0).toString(16).padStart(4, "0")
  }) + "\n"
  var id = whole.id
  var full = Track.fromInfoJson(text, id)
  assert.strictEqual(full.ok, true)
  assert.notStrictEqual(full.videoUrl, "")
  assert.deepStrictEqual(Track.fromInfoJson(line, id), full)
  assert.ok(Object.keys(kept).length < Object.keys(whole).length)
  assert.ok(Object.prototype.hasOwnProperty.call(whole, "automatic_captions"))
  assert.strictEqual(line.indexOf("automatic_captions"), -1)
  // Each name the reader asks the answer for, as written in its source.
  var source = fs.readFileSync(path.join(__dirname, "..", "..", "lib", "Track.js"), "utf8")
  var reader = source.slice(source.indexOf("function fromInfoJson"), source.indexOf("// A track read back"))
  var calls = reader.match(/_own\(info, "[^"]+"\)/g) || []
  var read = calls.map(function(call) { return call.split("\"")[1] })
  assert.ok(read.length >= 8, "the reader was found")
  read.concat(["channel", "uploader"]).forEach(function(name) {
    assert.ok(FIELDS.indexOf(name) !== -1, name)
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
  assert.deepStrictEqual(YtArgs.resolveWithAccount(TOOLS, paths, "1080 --exec x", COPY),
    accountResolveList(720))
})

test("every list is an array of strings whose first element is an absolute tool", function() {
  var all = everyYtArgv(TOOLS, paths, COPY)
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
  var feed = FeedUrls.feedArgv(TOOLS, paths, COPY)
  feed[COPY_SLOT] = paths.jarFile
  feed.push("--exec")
  assert.deepStrictEqual(FeedUrls.feedArgv(TOOLS, paths, COPY), FEED)
  assert.deepStrictEqual(FeedUrls.markArgv(TOOLS, paths, COPY), MARK)
  var base = YtArgs.base(paths)
  base.length = 0
  assert.deepStrictEqual(YtArgs.base(paths), BASE)
  var curl = Thumbs.argv(TOOLS)
  curl.length = 0
  assert.deepStrictEqual(Thumbs.argv(TOOLS), CURL)
})

test("the tool comes from the table that was passed in, and only that tool", function() {
  var marked = markedTools()
  each(everyYtArgv(marked, paths, COPY), function(argv, name) {
    assert.deepStrictEqual(argv.filter(function(part) { return part.indexOf("/marked/") === 0 }),
      ["/marked/ytdlp"], name)
    assert.ok(JSON.stringify(argv).indexOf("/usr/bin/") === -1, name)
  })
  assert.deepStrictEqual(Thumbs.argv(marked).filter(function(part) { return part.indexOf("/marked/") === 0 }),
    ["/marked/curl"])
  assert.ok(JSON.stringify(Thumbs.argv(marked)).indexOf("/usr/bin/") === -1)
})

test("nothing varies but the tool, the cache folder, the copy and the format", function() {
  var other = Paths.resolve({
    XDG_RUNTIME_DIR: "/run/elsewhere", XDG_STATE_HOME: "/data/state", XDG_DATA_HOME: null, HOME: "/srv/other"
  })
  assert.strictEqual(other.ok, true)
  var otherCopy = Paths.jarCopyFile(other, 3)
  var a = everyYtArgv(TOOLS, paths, COPY)
  var b = everyYtArgv(markedTools(), other, otherCopy)
  each(a, function(argv, name) {
    assert.strictEqual(argv.length, b[name].length, name)
    var slots = []
    for (var i = 0; i < argv.length; i++) {
      if (argv[i] !== b[name][i]) slots.push(i)
    }
    var account = argv.indexOf("--cookies") !== -1
    assert.deepStrictEqual(slots, account ? [0, 4, COPY_SLOT] : [0, 4], name + ": the slots that vary")
    assert.strictEqual(b[name][4], "/run/elsewhere/omajuke/ytcache", name)
    if (account) assert.strictEqual(b[name][COPY_SLOT], "/run/elsewhere/omajuke/jar/3.txt", name)
  })
  // Between two heights only the value behind -f differs.
  var pairs = [[a.resolve480, a.resolve1080], [a.account480, a.account1080]]
  pairs.forEach(function(pair) {
    var formatSlot = pair[0].indexOf("-f") + 1
    assert.strictEqual(pair[0][formatSlot], FORMATS[480])
    assert.strictEqual(pair[0].length, pair[1].length)
    for (var i = 0; i < pair[0].length; i++) {
      assert.strictEqual(pair[0][i] === pair[1][i], i !== formatSlot, "slot " + i)
    }
  })
})

test("every element is a constant, the tool, the cache folder or the copy", function() {
  var allowed = SEARCH.concat(["--no-playlist", "-f", FORMATS[480], FORMATS[720], FORMATS[1080],
    "--playlist-items", "1:25", "--print", PRINT])
  each(everySignedOut(TOOLS, paths), function(argv, name) {
    argv.forEach(function(part) {
      assert.ok(allowed.indexOf(part) !== -1, name + " holds something else: " + part.slice(0, 60))
    })
  })
  var withAccount = allowed.concat(["--cookies", COPY, "1:50", "1:1", "--mark-watched", "--simulate",
    "--quiet"])
  each(everyAccount(TOOLS, paths, COPY), function(argv, name) {
    argv.forEach(function(part) {
      assert.ok(withAccount.indexOf(part) !== -1, name + " holds something else: " + part.slice(0, 60))
    })
  })
})

test("what is never passed to yt-dlp", function() {
  var never = [
    "-v", "--verbose", "--print-traffic", "--write-pages", "--dump-pages", "-o", "--output", "--exec",
    "--netrc", "--netrc-cmd", "--enable-file-urls", "--no-check-certificates", "--cookies-from-browser",
    "--config-locations", "--config-location", "--load-info-json", "--write-info-json", "--remote-components",
    "--proxy", "--plugin-dirs", "--update", "-U", "--update-to", "--js-runtimes",
    "--extractor-args", "--user-agent", "--add-headers", "--", "--batch-file", "--username", "--password",
    "-u", "-p", "--twofactor", "--print-to-file", "--dump-json", "-j", "--dump-single-json",
    "--write-comments", "--write-subs", "--write-auto-subs", "--no-simulate"
  ]
  each(everyYtArgv(TOOLS, paths, COPY), function(argv, name) {
    never.forEach(function(flag) { assert.strictEqual(argv.indexOf(flag), -1, name + ": " + flag) })
    argv.forEach(function(part) {
      assert.ok(!/^https?:/.test(part) && part.indexOf("ytsearch") === -1, name + " names what is looked up")
      assert.ok(part.indexOf("youtube") === -1 && part.indexOf("list=") === -1, name + " names an address")
      assert.ok(!/[\s\u0000-\u001f]/.test(part), name + ": an element with a blank or a control")
    })
    // The saved login is in no command line, whole or as part of a path.
    assert.strictEqual(JSON.stringify(argv).indexOf("cookies.txt"), -1, name)
    assert.strictEqual(JSON.stringify(argv).indexOf(paths.dataDir), -1, name)
  })
})

test("no builder can be given a query, an address or a video id", function() {
  // Tools and paths; for a resolve the height; for a call with the account
  // the copy. Nothing else is read.
  var builders = [
    YtArgs.base, YtArgs.search, YtArgs.resolve, YtArgs.format, YtArgs.mix, FeedUrls.feedArgv,
    FeedUrls.verifyArgv, FeedUrls.markArgv, YtArgs.resolveWithAccount, Thumbs.argv
  ]
  assert.deepStrictEqual(builders.map(function(builder) { return builder.length }),
    [1, 2, 3, 1, 2, 3, 3, 3, 4, 1])
  var id = "Abc123Def4Q"
  var hostile = [
    id, "--no-config", "constructor", "https://www.youtube.com/watch?v=" + id, "ytsearch1:x",
    "https://www.youtube.com/playlist?list=WL"
  ]
  hostile.forEach(function(value) {
    var argv = YtArgs.resolve(TOOLS, paths, value)
    assert.deepStrictEqual(argv, resolveList(720), value)
    // Extra arguments are not looked at.
    assert.deepStrictEqual(YtArgs.search(TOOLS, paths, value), SEARCH, value)
    assert.deepStrictEqual(YtArgs.resolve(TOOLS, paths, 720, value), resolveList(720), value)
    assert.deepStrictEqual(YtArgs.mix(TOOLS, paths, value), MIX, value)
    assert.deepStrictEqual(FeedUrls.feedArgv(TOOLS, paths, COPY, value), FEED, value)
    assert.deepStrictEqual(FeedUrls.verifyArgv(TOOLS, paths, COPY, value), VERIFY, value)
    assert.deepStrictEqual(FeedUrls.markArgv(TOOLS, paths, COPY, value), MARK, value)
    var account = accountResolveList(720)
    assert.deepStrictEqual(YtArgs.resolveWithAccount(TOOLS, paths, value, COPY), account, value)
    assert.deepStrictEqual(YtArgs.resolveWithAccount(TOOLS, paths, 720, COPY, value), account, value)
    assert.deepStrictEqual(Thumbs.argv(TOOLS, value), CURL, value)
    // In the place of the copy it is simply not a copy.
    each(everyAccount(TOOLS, paths, value), function(refused, name) {
      assert.strictEqual(refused, null, name + ": " + value)
    })
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
    each(everyYtArgv(TOOLS, p, COPY), function(argv, name) { assert.strictEqual(argv, null, name) })
  })
  // A table that knows the cache folder but not where the copies live.
  each(everyAccount(TOOLS, { ok: true, ytCacheDir: CACHE }, COPY), function(argv, name) {
    assert.strictEqual(argv, null, name)
  })
  var noTools = [
    null, undefined, {}, { ytdlp: "" }, { ytdlp: "yt-dlp" }, { ytdlp: 5 }, { ytdlp: null }, "tools"
  ]
  noTools.forEach(function(tools) {
    each(everyYtArgv(tools, paths, COPY), function(argv, name) { assert.strictEqual(argv, null, name) })
  })
  var noCurl = [null, undefined, {}, { curl: "" }, { curl: "curl" }, { curl: 5 }, { curl: null }, "tools"]
  noCurl.forEach(function(tools) { assert.strictEqual(Thumbs.argv(tools), null) })
})

test("the tool is read from the table once: what was checked is what is run", function() {
  var changing = { n: 0 }
  Object.defineProperty(changing, "ytdlp", {
    get: function() { return changing.n++ === 0 ? "/usr/bin/yt-dlp" : "/usr/bin/other" }
  })
  var builders = [
    function() { return YtArgs.search(changing, paths) },
    function() { return YtArgs.resolve(changing, paths, 720) },
    function() { return YtArgs.mix(changing, paths) },
    function() { return YtArgs.resolveWithAccount(changing, paths, 720, COPY) },
    function() { return FeedUrls.feedArgv(changing, paths, COPY) },
    function() { return FeedUrls.verifyArgv(changing, paths, COPY) },
    function() { return FeedUrls.markArgv(changing, paths, COPY) }
  ]
  builders.forEach(function(build, i) {
    changing.n = 0
    var argv = build()
    assert.strictEqual(argv[0], "/usr/bin/yt-dlp", "builder " + i)
    assert.strictEqual(changing.n, 1, "builder " + i)
  })
})

test("the builders change neither the tool table nor the paths", function() {
  var tools = JSON.stringify(TOOLS)
  var before = JSON.stringify(paths)
  everyYtArgv(TOOLS, paths, COPY)
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
