"use strict"
// Tests for lib/MpvArgs.js: the command line mpv is started with, compared
// item by item with a list written out here a second time, and the few
// places where something variable may appear in it.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var MpvArgs = load.lib("MpvArgs")
var Const = load.lib("Const")
var Paths = load.lib("Paths")

var SOCK = "/run/user/1000/omajuke/mpv.sock"
var YTDLP = "/usr/bin/yt-dlp"

// The complete list, in order. Written out a second time on purpose: a flag
// that is added, dropped or moved has to be changed here as well.
var EXPECTED = [
  "--no-config",
  "--idle=yes",
  "--no-terminal",
  "--input-ipc-server=/run/user/1000/omajuke/mpv.sock",
  "--input-ipc-client=fd://0",
  "--input-default-bindings=no",
  "--input-builtin-bindings=no",
  "--audio-client-name=OmaJuke",
  "--wayland-app-id=OmaJuke",
  "--title=OmaJuke",
  "--force-window=no",
  "--vid=no",
  "--sid=no",
  "--reset-on-next-file=pause",
  "--ytdl=yes",
  "--ytdl-format=bestaudio/best",
  "--ytdl-raw-options=ignore-config=,no-plugin-dirs=,no-cache-dir=,no-mark-watched=,no-remote-components=,"
    + "no-cookies-from-browser=,sub-langs=-all,socket-timeout=10",
  "--script-opts=ytdl_hook-ytdl_path=/usr/bin/yt-dlp",
  "--tls-verify=yes",
  "--network-timeout=10",
  "--gpu-api=opengl",
  "--osc=no",
  "--load-stats-overlay=no",
  "--load-console=no",
  "--load-commands=no",
  "--load-select=no",
  "--load-positioning=no",
  "--load-context-menu=no",
  "--load-auto-profiles=no",
  "--sub-auto=no",
  "--audio-file-auto=no",
  "--cover-art-auto=no",
  "--autoload-files=no",
  "--drag-and-drop=no",
  "--cookies=no",
  "--load-unsafe-playlists=no",
  "--resume-playback=no",
  "--save-position-on-quit=no",
  "--save-watch-history=no",
  "--cache-on-disk=no",
  "--gpu-shader-cache=no",
  "--icc-cache=no",
  "--stop-screensaver=no",
  "--volume-max=100",
  "--volume=70"
]
var MPRIS = "--script=/usr/lib/mpv-mpris/mpris.so"

// The three places where the list may differ from one call to the next.
var SLOTS = ["--input-ipc-server=", "--script-opts=ytdl_hook-ytdl_path=", "--volume="]

function launch(changes) {
  return MpvArgs.launch(Object.assign({ sock: SOCK, volume: 70, mpris: false, ytdlp: YTDLP }, changes || {}))
}

function flagName(item) {
  var cut = item.indexOf("=")
  return cut === -1 ? item : item.slice(0, cut)
}

function valueOf(argv, prefix) {
  var found = argv.filter(function(item) { return item.indexOf(prefix) === 0 })
  assert.strictEqual(found.length, 1, prefix)
  return found[0].slice(prefix.length)
}

test("exports exactly the documented function", function() {
  assert.deepStrictEqual(Object.keys(MpvArgs), ["launch"])
})

test("the list is exactly the expected one, in its order", function() {
  assert.deepStrictEqual(launch(), EXPECTED)
})

test("the MPRIS script is the last item, and only when it is known to be there", function() {
  assert.deepStrictEqual(launch({ mpris: true }), EXPECTED.concat([MPRIS]))
  assert.strictEqual(MPRIS, "--script=" + Const.MPRIS_SO)
  // Only the boolean true: nothing merely truthy adds a script.
  var others = [false, undefined, null, 1, "true", "yes", {}, [], Const.MPRIS_SO, "/tmp/evil.so"]
  others.forEach(function(value) {
    assert.deepStrictEqual(launch({ mpris: value }), EXPECTED, String(value))
  })
})

test("every item is one option of its own", function() {
  var argv = launch({ mpris: true })
  argv.forEach(function(item) {
    assert.strictEqual(typeof item, "string")
    assert.ok(/^--[a-z][a-z-]*(=.+)?$/.test(item), item)
    assert.ok(!/[\s"'`$\\]/.test(item), item)
  })
  var names = argv.map(flagName)
  assert.strictEqual(new Set(names).size, names.length, "no option is given twice")
})

test("each call returns a new list", function() {
  var first = launch()
  first.push("--log-file=/srv/x")
  first[0] = "--config-dir=/srv"
  assert.deepStrictEqual(launch(), EXPECTED)
})

test("nothing varies but the socket, the yt-dlp path and the volume", function() {
  var other = launch({ sock: "/srv/oj-test.AbC123/omajuke/mpv.sock", volume: 5, ytdlp: "/srv/yt-dlp.js" })
  assert.strictEqual(other.length, EXPECTED.length)
  other.forEach(function(item, i) {
    var slot = SLOTS.filter(function(prefix) { return EXPECTED[i].indexOf(prefix) === 0 })
    if (slot.length === 0) assert.strictEqual(item, EXPECTED[i])
    else assert.ok(item.indexOf(slot[0]) === 0 && item !== EXPECTED[i], item)
  })
  assert.strictEqual(valueOf(other, "--input-ipc-server="), "/srv/oj-test.AbC123/omajuke/mpv.sock")
  assert.strictEqual(valueOf(other, "--script-opts="), "ytdl_hook-ytdl_path=/srv/yt-dlp.js")
  assert.strictEqual(valueOf(other, "--volume="), "5")
})

test("the function reads nothing but its four documented fields", function() {
  var extras = {
    id: "AAAAAAAAAAA", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", title: "A title",
    cookies: "/data/omajuke/cookies.txt", logFile: "/srv/log", proxy: "http://127.0.0.1:9",
    extra: ["--log-file=x"], args: ["--msg-level=all=v"]
  }
  assert.deepStrictEqual(launch(extras), EXPECTED)
  var text = launch(extras).join("\n")
  assert.ok(text.indexOf("AAAAAAAAAAA") === -1)
  assert.ok(text.indexOf("cookies.txt") === -1)
})

test("the socket path of a resolved session is accepted", function() {
  var paths = Paths.resolve({ XDG_RUNTIME_DIR: "/run/user/1000", HOME: "/data/user" })
  assert.strictEqual(valueOf(launch({ sock: paths.sock }), "--input-ipc-server="), paths.sock)
  assert.strictEqual(valueOf(launch({ ytdlp: Const.TOOLS.ytdlp }), "--script-opts="),
    "ytdl_hook-ytdl_path=" + Const.TOOLS.ytdlp)
})

test("the volume is a whole number from 0 to 100", function() {
  var cases = [
    [0, "0"], [100, "100"], [70, "70"], [69.5, "70"], [69.4, "69"], [150, "100"], [1e9, "100"], [-1, "0"],
    [-0.4, "0"], [0.2, "0"]
  ]
  cases.forEach(function(pair) {
    assert.strictEqual(valueOf(launch({ volume: pair[0] }), "--volume="), pair[1], String(pair[0]))
  })
  var refused = [
    NaN, Infinity, -Infinity, "70", "70,--log-file=x", null, undefined, true, [70], { valueOf: 70 }
  ]
  refused.forEach(function(value) {
    assert.strictEqual(launch({ volume: value }), null, String(value))
  })
})

test("a path that could break out of its option is refused", function() {
  var hostile = [
    "", "mpv.sock", "run/user/1000/mpv.sock", "/run/user/1000/a,b/mpv.sock", "/run/user/1000/a b/mpv.sock",
    "/run/user/1000/a\"b/mpv.sock", "/run/user/1000/a'b/mpv.sock", "/run/user/1000/a%5%b/mpv.sock",
    "/run/user/1000/a=b/mpv.sock", "/run/user/1000/a\nb/mpv.sock", "/run/user/1000/a\u0000b/mpv.sock",
    "/run/user/1000/a\\b/mpv.sock", "/run/user/1000/a:b/mpv.sock", "/run/user/1000/a;b/mpv.sock",
    "/run/user/1000/a$b/mpv.sock", "/run/user/1000/a`b/mpv.sock", "/run/user/1000/a[b]/mpv.sock",
    "/run/user/1000/\u00e4/mpv.sock", "/run/user/1000/mpv.sock\n", "/" + "a".repeat(201),
    null, undefined, 5, true, ["/run/user/1000/mpv.sock"], { toString: function() { return SOCK } }
  ]
  hostile.forEach(function(value) {
    assert.strictEqual(launch({ sock: value }), null, "sock " + JSON.stringify(value))
    assert.strictEqual(launch({ ytdlp: value }), null, "ytdlp " + JSON.stringify(value))
  })
  // The script options are a comma-separated list: this is the injection.
  assert.strictEqual(launch({ ytdlp: "/usr/bin/yt-dlp,ytdl_hook-try_ytdl_first=yes" }), null)
})

test("something that is not a description yields nothing", function() {
  var odd = [null, undefined, "", SOCK, 70, true, [], [SOCK, 70, false, YTDLP]]
  odd.forEach(function(value) {
    assert.strictEqual(MpvArgs.launch(value), null, JSON.stringify(value))
  })
  assert.strictEqual(MpvArgs.launch(), null)
  assert.strictEqual(MpvArgs.launch({}), null)
})

// ---- What the list guarantees ----

test("certificates are verified", function() {
  assert.ok(launch().indexOf("--tls-verify=yes") !== -1)
})

test("no flag that logs, records, reconfigures or redirects is ever passed", function() {
  var never = [
    "--log-file", "--msg-level", "--prefetch-playlist", "--focus-on", "--ontop", "--http-proxy",
    "--cookies-file",
    "--ytdl-raw-options-append", "--config-dir", "--include", "--dump-stats", "--input-conf", "--input-file",
    "--script-opts-append", "--stream-record", "--record-file", "--screenshot-directory", "--watch-later-dir",
    "--user-agent", "--http-header-fields"
  ]
  var names = launch({ mpris: true }).map(flagName)
  never.forEach(function(flag) {
    assert.ok(names.indexOf(flag) === -1, flag)
  })
  var text = launch({ mpris: true }).join("\n")
  assert.ok(!/https?:/.test(text), "no address of any kind")
  assert.ok(!/proxy/i.test(text))
  assert.ok(!/cookies-from-browser=[^,]/.test(text), "no browser is named")
  assert.ok(names.indexOf("--script") === names.length - 1, "one script, the MPRIS one")
})

test("mpv's yt-dlp hook gets the same restrictions as our own yt-dlp calls", function() {
  var options = valueOf(launch(), "--ytdl-raw-options=").split(",")
  assert.deepStrictEqual(options, [
    "ignore-config=", "no-plugin-dirs=", "no-cache-dir=", "no-mark-watched=", "no-remote-components=",
    "no-cookies-from-browser=", "sub-langs=-all", "socket-timeout=10"
  ])
  // What must never be handed to the hook from here.
  var forbidden = /^(cookies|cookies-from-browser|mark-watched|exec|proxy|load-info-json|config-locations)=/
  options.forEach(function(option) {
    assert.ok(!forbidden.test(option), option)
  })
  assert.strictEqual(valueOf(launch(), "--ytdl-format="), "bestaudio/best")
  assert.ok(launch().indexOf("--cookies=no") !== -1)
})

test("constant names, no key bindings, nothing dropped on the window is opened", function() {
  var argv = launch()
  assert.strictEqual(valueOf(argv, "--title="), Const.APP_NAME)
  assert.strictEqual(valueOf(argv, "--wayland-app-id="), Const.APP_NAME)
  assert.strictEqual(valueOf(argv, "--audio-client-name="), Const.APP_NAME)
  assert.ok(argv.indexOf("--input-default-bindings=no") !== -1)
  assert.ok(argv.indexOf("--input-builtin-bindings=no") !== -1)
  assert.ok(argv.indexOf("--drag-and-drop=no") !== -1)
  assert.ok(argv.indexOf("--load-unsafe-playlists=no") !== -1)
})

test("the lifetime tether and the audio-only defaults are there", function() {
  var argv = launch()
  assert.ok(argv.indexOf("--input-ipc-client=fd://0") !== -1)
  assert.ok(argv.indexOf("--idle=yes") !== -1)
  assert.ok(argv.indexOf("--vid=no") !== -1)
  assert.ok(argv.indexOf("--force-window=no") !== -1)
  assert.ok(argv.indexOf("--reset-on-next-file=pause") !== -1)
})

test("nothing is written to disk by any option", function() {
  var argv = launch()
  var off = [
    "--resume-playback", "--save-position-on-quit", "--save-watch-history", "--cache-on-disk",
    "--gpu-shader-cache", "--icc-cache"
  ]
  off.forEach(function(flag) {
    assert.ok(argv.indexOf(flag + "=no") !== -1, flag)
  })
})

// ---- The real mpv ----

test("the recorded traces were made by an mpv that accepted exactly these options", function() {
  // tests/record-traces.js starts the real mpv with this list (plus three
  // options that keep it silent and offline) and stores what it used. An
  // option mpv does not know makes it exit at once, so no trace could have
  // been recorded with one. If this fails, the list has changed since:
  // run node tests/record-traces.js again.
  var file = path.join(__dirname, "..", "fixtures", "mpv-traces.json")
  var fixture = JSON.parse(fs.readFileSync(file, "utf8"))
  var silent = ["--ytdl=no", "--ao=null", "--vo=null"]
  var recorded = fixture.argv.map(function(item) {
    return item.indexOf("--input-ipc-server=") === 0 ? "--input-ipc-server=" + SOCK : item
  })
  assert.deepStrictEqual(recorded, EXPECTED.concat(silent))
  assert.ok(/^[0-9]+\.[0-9]+(\.[0-9A-Za-z]+)*$/.test(fixture.mpv), fixture.mpv)
})
