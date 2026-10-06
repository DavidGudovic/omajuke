"use strict"
// Tests for lib/MpvProto.js: the vector table (also run inside Qt's
// engine), and the properties a table cannot state: that nothing outside
// the vocabulary can be encoded however a command is bent, that a title
// stays data whatever it holds, that the line assembler never holds more
// than its cap, and that the real mpv accepted every command of the
// vocabulary when the traces were recorded.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var MpvProto = load.lib("MpvProto")
var Const = load.lib("Const")
var Paths = load.lib("Paths")
var table = load.vectors("mpvproto")
var fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "mpv-traces.json"), "utf8"))

var CAP = Const.LIMITS.mpvLineChars
var ID = "AAAAAAAAAAA"
var PATHS = Paths.resolve({ XDG_RUNTIME_DIR: "/run/user/1000", HOME: "/data/user" })
var INFO = Paths.infoFile(PATHS, 7)

var EVENT_KEYS = ["args", "data", "event", "file_error", "id", "kind", "name", "playlist_entry_id", "reason"]
var REPLY_KEYS = ["data", "error", "kind", "request_id"]

function loadCommand(changes) {
  return MpvProto.loadfile(PATHS, Object.assign({ id: ID, title: "A title", infoFile: INFO, mode: "replace" },
    changes || {}))
}

// One example, at least, of everything a builder can return.
function samples() {
  var list = [
    MpvProto.closeWindowBind(), MpvProto.stop(), MpvProto.quit(), MpvProto.resetSpeed(),
    MpvProto.setPause(true), MpvProto.setPause(false), MpvProto.setMute(true), MpvProto.setMute(false),
    MpvProto.setVolume(0), MpvProto.setVolume(70), MpvProto.setVolume(100), MpvProto.setVolume(250),
    MpvProto.seek(0, 213), MpvProto.seek(78.9444, 213), MpvProto.seek(500, 213), MpvProto.seek(5, 1e9),
    MpvProto.setEvenVolume(true), MpvProto.setEvenVolume(false),
    MpvProto.getProperty("time-pos"), MpvProto.getProperty("playlist"), MpvProto.getProperty("track-list"),
    MpvProto.getProperty("audio-device-list"),
    loadCommand(), loadCommand({ mode: "append-play" }), loadCommand({ mode: "insert-at", index: 3 }),
    loadCommand({ startAt: 75 }), loadCommand({ startAt: 172800 }), loadCommand({ title: "" }),
    loadCommand({ id: "--no-config", title: "A,vid=1 \"q\" %5%${path}" })
  ]
  MpvProto.OBSERVE.forEach(function(entry) {
    list.push(MpvProto.observe(entry.name))
    list.push(MpvProto.unobserve(entry.name))
  })
  return list.concat(MpvProto.handshake())
}

// A small deterministic generator: the same "random" cuts on every run.
function sequence(seed) {
  var state = seed
  return function(limit) {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % limit
  }
}

// Feeds a stream in pieces and collects what comes out. Also checks, after
// every piece, the bound the assembler promises.
function feedAll(pieces, cap) {
  var pending = null
  var lines = []
  var dropped = 0
  pieces.forEach(function(piece) {
    var result = MpvProto.feed(pending, piece, cap)
    assert.ok(result.pending.text.length <= cap, "held " + result.pending.text.length + " of " + cap)
    assert.ok(!(result.pending.skipping && result.pending.text !== ""), "nothing is held while skipping")
    result.lines.forEach(function(line) {
      assert.ok(line.length <= cap && line.length > 0 && line.indexOf("\n") === -1)
      lines.push(line)
    })
    dropped += result.dropped
    pending = result.pending
  })
  return { lines: lines, dropped: dropped, pending: pending }
}

function pieces(text, size) {
  var list = []
  for (var i = 0; i < text.length; i += size) list.push(text.slice(i, i + size))
  return list
}

function received(trace) {
  return trace.filter(function(record) { return record.recv !== undefined }).map(function(record) {
    return record.recv
  })
}

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(MpvProto).sort(), [
    "OBSERVE", "VIDEO_CLOSED", "closeWindowBind", "encode", "entryId", "feed", "getProperty", "handshake",
    "loadfile", "observe", "parse", "quit", "resetSpeed", "seek", "setEvenVolume", "setMute", "setPause",
    "setVolume", "stop", "unobserve"
  ])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(MpvProto, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(MpvProto).forEach(function(name) {
    if (typeof MpvProto[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

// ---- The observed properties ----

test("the observation table holds exactly the properties this version watches", function() {
  assert.deepStrictEqual(MpvProto.OBSERVE, [
    { id: 1, name: "idle-active", handshake: true },
    { id: 2, name: "pause", handshake: true },
    { id: 3, name: "core-idle", handshake: true },
    { id: 4, name: "duration", handshake: true },
    { id: 5, name: "volume", handshake: true },
    { id: 6, name: "mute", handshake: true },
    { id: 7, name: "time-pos", handshake: false },
    { id: 8, name: "speed", handshake: true }
  ])
})

test("nothing that carries resolved addresses or log lines can be observed or read", function() {
  MpvProto.OBSERVE.forEach(function(entry) {
    assert.ok(/^[a-z][a-z-]*$/.test(entry.name), entry.name)
  })
  var text = JSON.stringify(samples())
  assert.ok(text.indexOf("user-data") === -1)
  assert.ok(text.indexOf("request_log_messages") === -1)
  assert.ok(text.indexOf("log") === -1)
  var names = [
    "user-data", "user-data/mpv/ytdl", "user-data/mpv/ytdl/json-subprocess-result", "path", "filename",
    "stream-open-filename", "media-title", "metadata", "playlist-path"
  ]
  names.forEach(function(name) {
    assert.strictEqual(MpvProto.observe(name), null, name)
    assert.strictEqual(MpvProto.getProperty(name), null, name)
    assert.strictEqual(MpvProto.encode(["observe_property", 9, name], 1), "", name)
    assert.strictEqual(MpvProto.encode(["get_property", name], 1), "", name)
  })
  var levels = ["no", "fatal", "error", "warn", "info", "status", "v", "debug", "trace"]
  levels.forEach(function(level) {
    assert.strictEqual(MpvProto.encode(["request_log_messages", level], 1), "", level)
  })
})

test("the handshake rebinds the window close first, then observes", function() {
  var commands = MpvProto.handshake()
  var bound = "set vid no; script-message omajuke-video-closed"
  assert.deepStrictEqual(commands[0], ["keybind", "CLOSE_WIN", bound])
  assert.strictEqual(bound.slice(-MpvProto.VIDEO_CLOSED.length), MpvProto.VIDEO_CLOSED)
  var observed = commands.slice(1)
  assert.deepStrictEqual(observed, MpvProto.OBSERVE.filter(function(entry) { return entry.handshake })
    .map(function(entry) { return ["observe_property", entry.id, entry.name] }))
  // The position reports eleven times a second: not unless somebody looks.
  assert.ok(JSON.stringify(observed).indexOf("time-pos") === -1)
})

// ---- The vocabulary ----

test("every builder result is a fresh array that encode accepts", function() {
  samples().forEach(function(command) {
    assert.ok(Array.isArray(command), JSON.stringify(command))
    var line = MpvProto.encode(command, 7)
    assert.notStrictEqual(line, "", JSON.stringify(command))
    assert.deepStrictEqual(JSON.parse(line), { command: command, request_id: 7 })
  })
  // Changing a returned command changes nothing for the next caller.
  var first = MpvProto.closeWindowBind()
  first[2] = "quit"
  MpvProto.setEvenVolume(true)[2] = "lavfi=[x]"
  MpvProto.handshake()[0][2] = "quit"
  assert.strictEqual(MpvProto.closeWindowBind()[2], "set vid no; script-message omajuke-video-closed")
  assert.strictEqual(MpvProto.setEvenVolume(true)[2], "@omajuke-norm:dynaudnorm=f=250:g=31:p=0.9")
  assert.strictEqual(MpvProto.handshake()[0][2], "set vid no; script-message omajuke-video-closed")
})

test("an encoded line is one line of JSON that starts with a brace", function() {
  samples().forEach(function(command) {
    [false, true].forEach(function(nonBlocking) {
      var line = MpvProto.encode(command, 12, nonBlocking)
      assert.strictEqual(line.indexOf("{\"command\":[\""), 0)
      assert.strictEqual(line.indexOf("\n"), line.length - 1)
      assert.ok(!/[\u0000-\u0009\u000b-\u001f\u007f]/.test(line))
      var message = JSON.parse(line)
      assert.deepStrictEqual(Object.keys(message), nonBlocking ? ["command", "request_id", "async"]
        : ["command", "request_id"])
      assert.strictEqual(message.request_id, 12)
    })
  })
})

test("a command that was bent after it was built is not encoded", function() {
  var valid = new Set(samples().map(function(command) { return JSON.stringify(command) }))
  var replacements = [
    undefined, null, true, false, 0, 1, -1, 2, 7, 9, 101, 1.5, NaN, Infinity, "", "x", "run", "quit", "stop",
    "replace", "append", "pause", "volume", "path", "absolute", "relative", "1", "70", ID,
    "https://example.com/a", "/etc/passwd", [], ["stop"], {}, { "force-media-title": "t" }
  ]
  var tried = 0
  samples().forEach(function(command) {
    for (var i = 0; i < command.length; i++) {
      replacements.forEach(function(value) {
        var bent = command.slice()
        bent[i] = value
        var text = JSON.stringify(bent)
        tried++
        if (MpvProto.encode(bent, 1) === "") return
        // Whatever still encodes must be something a builder could have
        // made itself: another volume, another position, another mode.
        var again = JSON.parse(MpvProto.encode(bent, 1)).command
        assert.ok(valid.has(text) || isReachable(again), text)
      })
    }
    // Longer and shorter than built.
    assert.strictEqual(MpvProto.encode(command.concat(["x"]), 1), "", JSON.stringify(command))
    assert.strictEqual(MpvProto.encode(command.concat([null]), 1), "", JSON.stringify(command))
    if (command.length === 1) return
    assert.strictEqual(MpvProto.encode(command.slice(0, -1), 1), "", JSON.stringify(command))
  })
  assert.ok(tried > 2000)
})

// True when a builder returns exactly this command for some arguments.
function isReachable(command) {
  var name = command[0]
  var built = null
  if (name === "set_property" && command[1] === "volume") built = MpvProto.setVolume(command[2])
  else if (name === "set_property" && command[1] === "pause") built = MpvProto.setPause(command[2])
  else if (name === "set_property" && command[1] === "mute") built = MpvProto.setMute(command[2])
  else if (name === "seek") built = MpvProto.seek(command[1], Const.LIMITS.durationSeconds + 1)
  else if (name === "observe_property") built = MpvProto.observe(command[2])
  else if (name === "unobserve_property") {
    built = MpvProto.OBSERVE.map(function(entry) { return MpvProto.unobserve(entry.name) })
      .filter(function(candidate) { return candidate[1] === command[1] })[0]
  } else if (name === "get_property") built = MpvProto.getProperty(command[1])
  else if (name === "loadfile") {
    var options = command[4]
    built = MpvProto.loadfile(PATHS, {
      id: String(command[1]).slice(-11), title: options["force-media-title"],
      infoFile: String(options["ytdl-raw-options-append"]).slice("load-info-json=".length),
      mode: command[2], index: command[3],
      startAt: options["start"] === undefined ? 0 : Number(options["start"])
    })
  }
  return JSON.stringify(built) === JSON.stringify(command)
}

test("commands that run a program, write a file or open another address cannot be encoded", function() {
  var never = [
    ["run", "/usr/bin/id"], ["subprocess", { name: "subprocess", args: ["id"] }],
    ["load-script", "/srv/x.lua"],
    ["loadlist", "/srv/list.m3u"], ["screenshot-to-file", "/srv/x.png"], ["write-watch-later-config"],
    ["dump-cache", 0, "no", "/srv/x"], ["ab-loop-dump-cache", "/srv/x"],
    ["video-add", "https://example.com/v"],
    ["audio-add", "/srv/a"], ["sub-add", "/srv/s"], ["script-message", "x"], ["script-binding", "x"],
    ["keypress", "q"], ["playlist-next"], ["playlist-prev"], ["playlist-clear"], ["playlist-remove", 0],
    ["playlist-play-index", 0], ["set", "pause", "yes"], ["cycle", "pause"], ["add", "volume", 5],
    ["apply-profile", "x"], ["change-list", "script-opts", "append", "a=b"], ["hook-add", "on_load", 1, 0],
    ["enable-section", "x"], ["define-section", "x", "q quit"], ["input-bind", "q", "quit"],
    ["set_property", "ytdl", false], ["set_property", "vid", 1], ["set_property", "audio-device", "auto"],
    ["set_property", "force-window", "yes"], ["set_property", "stop-screensaver", "yes"],
    ["set_property", "user-data/x", 1], ["set_property_string", "pause", "yes"],
    ["get_property_string", "path"],
    ["observe_property_string", 1, "pause"], ["client_name"], ["get_version"], ["get_time_us"]
  ]
  never.forEach(function(command) {
    assert.strictEqual(MpvProto.encode(command, 1), "", JSON.stringify(command))
    assert.strictEqual(MpvProto.encode(command, 1, true), "", JSON.stringify(command))
  })
})

test("the options of a load are read as its own keys only", function() {
  var good = { "force-media-title": "t", "ytdl-raw-options-append": "load-info-json=" + INFO }
  var url = "https://www.youtube.com/watch?v=" + ID
  assert.notStrictEqual(MpvProto.encode(["loadfile", url, "replace", -1, good], 1), "")
  // Everything inherited: JSON.stringify would write an empty object.
  assert.strictEqual(MpvProto.encode(["loadfile", url, "replace", -1, Object.create(good)], 1), "")
  var half = Object.create({ "ytdl-raw-options-append": good["ytdl-raw-options-append"] })
  half["force-media-title"] = "t"
  assert.strictEqual(MpvProto.encode(["loadfile", url, "replace", -1, half], 1), "")
  var started = Object.create({ "start": "50%" })
  started["force-media-title"] = "t"
  started["ytdl-raw-options-append"] = good["ytdl-raw-options-append"]
  // An inherited start is not there for JSON.stringify, so there is nothing
  // to refuse: the line goes out without one.
  var line = MpvProto.encode(["loadfile", url, "replace", -1, started], 1)
  assert.deepStrictEqual(JSON.parse(line).command[4], good)
})

test("encode refuses whatever is not an array of its own making", function() {
  var odd = [undefined, null, "", "stop", "{\"command\":[\"stop\"]}", 5, true, {}, { command: ["stop"] },
    { 0: "stop", length: 1 }, new Set(["stop"]), function() { return ["stop"] }]
  odd.forEach(function(value) {
    assert.strictEqual(MpvProto.encode(value, 1), "", String(value))
  })
  // A text command (what mpv runs when a line does not start with a brace).
  assert.strictEqual(MpvProto.encode(["stop\nrun id"], 1), "")
  assert.strictEqual(MpvProto.encode(["stop "], 1), "")
  assert.strictEqual(MpvProto.encode(["STOP"], 1), "")
})

// ---- Titles and other data inside a load ----

test("a title is one value of the options whatever it holds", function() {
  var titles = [
    "A,vid=1,title=x \"q\" %5%${path}", "x\",\"y\":\"z", "a]b}c{d[e", "--log-file=/srv/x", "${filename}",
    "%20",
    "start=10", "a=b,c=d", "'; quit; '", "<img src=x>", "\\\\\\", "\"", "a\\\"b", "{\"command\":[\"quit\"]}",
    "caf\u00e9 \u65e5\u672c\u8a9e \ud83c\udfb5", "tab\tand\nline\r\nbreaks", "nul\u0000byte",
    "\u202eright to left",
    "\ud83c lone high", "lone low \udfb5", " \u00a0 padded \u3000 ", "x".repeat(5000)
  ]
  titles.forEach(function(title) {
    var command = loadCommand({ title: title })
    assert.ok(command !== null, JSON.stringify(title))
    assert.strictEqual(command.length, 5)
    assert.strictEqual(command[1], "https://www.youtube.com/watch?v=" + ID)
    assert.strictEqual(command[2], "replace")
    assert.strictEqual(command[3], -1)
    assert.deepStrictEqual(Object.keys(command[4]), ["force-media-title", "ytdl-raw-options-append"])
    var sent = command[4]["force-media-title"]
    assert.ok(sent.length >= 1 && sent.length <= Const.LIMITS.titleChars)
    assert.ok(!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(sent), JSON.stringify(sent))
    assert.strictEqual(command[4]["ytdl-raw-options-append"], "load-info-json=" + INFO)
    // And it survives the wire as that one value.
    var line = MpvProto.encode(command, 3)
    assert.strictEqual(line.indexOf("\n"), line.length - 1)
    assert.deepStrictEqual(JSON.parse(line).command, command)
  })
  assert.strictEqual(loadCommand({ title: "A,vid=1,title=x \"q\" %5%${path}" })[4]["force-media-title"],
    "A,vid=1,title=x \"q\" %5%${path}")
})

test("a load names a video by an address rebuilt from its id, and nothing else", function() {
  var ids = [ID, "Abc123Def4Q", "--no-config", "constructor", "-AAAAAAAAAA", "___________"]
  ids.forEach(function(id) {
    assert.strictEqual(loadCommand({ id: id })[1], "https://www.youtube.com/watch?v=" + id)
  })
  var notIds = [
    "", "AAAAAAAAAA", "AAAAAAAAAAAA", "https://www.youtube.com/watch?v=" + ID, "https://youtu.be/" + ID,
    "/etc/passwd", "file:///etc/passwd", "ytsearch:x", "AAAAAAAAAA&", "AAAAAAAAAA\n", "__proto__", null,
    undefined, 12345678901, [ID], { id: ID }
  ]
  notIds.forEach(function(id) {
    assert.strictEqual(loadCommand({ id: id }), null, JSON.stringify(id))
  })
})

test("the info file of a load is a counter-named file in our info directory", function() {
  for (var n = 1; n <= 9999999999; n = n * 10 + 7) {
    var option = loadCommand({ infoFile: Paths.infoFile(PATHS, n) })[4]["ytdl-raw-options-append"]
    assert.strictEqual(option, "load-info-json=" + PATHS.infoDir + "/" + n + ".json")
  }
  var refused = [
    PATHS.stateFile, Paths.thumbFile(PATHS, 7), PATHS.sock, PATHS.infoDir, PATHS.infoDir + "/", PATHS.jarFile,
    PATHS.infoDir + "/7.json ", " " + INFO, INFO + ",x=y", PATHS.infoDir + "/7.JSON",
    PATHS.infoDir + "//7.json",
    PATHS.infoDir + "/./7.json", PATHS.runtimeDir + "/7.json", "info/7.json", "7.json", "~/7.json"
  ]
  refused.forEach(function(file) {
    assert.strictEqual(loadCommand({ infoFile: file }), null, file)
  })
  // Without a resolved table of paths there is no info directory at all.
  var tables = [null, undefined, {}, { ok: false }, { ok: true }, { ok: "true", infoDir: PATHS.infoDir }, "x"]
  var wanted = { id: ID, title: "t", infoFile: INFO, mode: "replace" }
  tables.forEach(function(paths) {
    assert.strictEqual(MpvProto.loadfile(paths, wanted), null)
  })
  assert.notStrictEqual(MpvProto.loadfile(PATHS, wanted), null)
})

test("volume, position and start are clamped or refused before they leave", function() {
  for (var v = -300; v <= 300; v += 0.5) {
    var volume = MpvProto.setVolume(v)[2]
    assert.ok(Number.isInteger(volume) && volume >= 0 && volume <= 100, String(v))
    assert.notStrictEqual(MpvProto.encode(MpvProto.setVolume(v), 1), "")
  }
  var durations = [0, 0.5, 1, 3, 213, 172800, 1e9]
  var targets = [-1e9, -1, 0, 0.0004, 1, 2.9996, 212, 212.9, 213, 1e9]
  durations.forEach(function(duration) {
    targets.forEach(function(target) {
      var command = MpvProto.seek(target, duration)
      var last = Math.max(0, Math.min(duration - 1, Const.LIMITS.durationSeconds))
      assert.ok(command[1] >= 0 && command[1] <= last, target + " of " + duration)
      assert.notStrictEqual(MpvProto.encode(command, 1), "")
    })
  })
  assert.strictEqual(MpvProto.resetSpeed()[2], 1)
  for (var s = 1; s <= 172800; s = s * 3 + 1) {
    assert.strictEqual(loadCommand({ startAt: s })[4]["start"], String(s))
  }
})

// ---- The line assembler ----

test("lines come out the same however the stream is cut", function() {
  var lines = [
    "{\"event\":\"start-file\",\"playlist_entry_id\":1}", "{\"request_id\":4,\"error\":\"success\"}", "x",
    "{\"event\":\"property-change\",\"id\":7,\"name\":\"time-pos\",\"data\":0.160715}", "last"
  ]
  var stream = lines.join("\n") + "\n"
  for (var cut = 0; cut <= stream.length; cut++) {
    var two = feedAll([stream.slice(0, cut), stream.slice(cut)], CAP)
    assert.deepStrictEqual(two.lines, lines, "cut at " + cut)
    assert.strictEqual(two.dropped, 0)
    assert.deepStrictEqual(two.pending, { text: "", skipping: false })
  }
  for (var size = 1; size <= 40; size++) {
    assert.deepStrictEqual(feedAll(pieces(stream, size), CAP).lines, lines, "pieces of " + size)
  }
  var next = sequence(7)
  for (var round = 0; round < 200; round++) {
    var cuts = []
    var at = 0
    while (at < stream.length) {
      var take = 1 + next(30)
      cuts.push(stream.slice(at, at + take))
      at += take
    }
    assert.deepStrictEqual(feedAll(cuts, CAP).lines, lines)
  }
})

test("an unfinished line is held until its line break, and only then handed out", function() {
  var first = MpvProto.feed(null, "{\"event\":", CAP)
  assert.deepStrictEqual(first.lines, [])
  assert.deepStrictEqual(first.pending, { text: "{\"event\":", skipping: false })
  var second = MpvProto.feed(first.pending, "\"idle\"}", CAP)
  assert.deepStrictEqual(second.lines, [])
  var third = MpvProto.feed(second.pending, "\n", CAP)
  assert.deepStrictEqual(third.lines, ["{\"event\":\"idle\"}"])
  // The caller's value is not changed behind its back.
  assert.deepStrictEqual(first.pending, { text: "{\"event\":", skipping: false })
})

test("a 300 000-character line is dropped once and the next line survives", function() {
  var long = "a".repeat(300000)
  var stream = "before\n" + long + "\nafter\n"
  var sizes = [1000000, 65536, 65537, 4096, 4095, 333, 7]
  sizes.forEach(function(size) {
    var result = feedAll(pieces(stream, size), CAP)
    assert.deepStrictEqual(result.lines, ["before", "after"], "pieces of " + size)
    assert.strictEqual(result.dropped, 1, "pieces of " + size)
    assert.deepStrictEqual(result.pending, { text: "", skipping: false })
  })
})

test("a line of exactly the cap is kept and one more character is not", function() {
  var exact = "b".repeat(CAP)
  var sizes = [CAP + 1, CAP, CAP - 1, 4096, 1000]
  sizes.forEach(function(size) {
    assert.deepStrictEqual(feedAll(pieces(exact + "\n", size), CAP).lines, [exact], "pieces of " + size)
    var over = feedAll(pieces(exact + "b\nok\n", size), CAP)
    assert.deepStrictEqual(over.lines, ["ok"], "over, pieces of " + size)
    assert.strictEqual(over.dropped, 1)
  })
})

test("an endless fragment never grows what is held", function() {
  var chunk = "c".repeat(65536)
  var pending = null
  var dropped = 0
  for (var i = 0; i < 400; i++) {
    var result = MpvProto.feed(pending, chunk, CAP)
    assert.ok(result.pending.text.length <= CAP)
    assert.deepStrictEqual(result.lines, [])
    dropped += result.dropped
    pending = result.pending
    if (i >= 1) assert.deepStrictEqual(pending, { text: "", skipping: true })
  }
  // About 26 MB went by: counted as one line, and nothing of it is kept.
  assert.strictEqual(dropped, 1)
  var after = MpvProto.feed(pending, "tail\n{\"event\":\"idle\"}\n", CAP)
  assert.deepStrictEqual(after.lines, ["{\"event\":\"idle\"}"])
  assert.strictEqual(after.dropped, 0)
})

test("the drop counter counts every line that was too long", function() {
  var small = 16
  var stream = ""
  var expected = []
  var tooLong = 0
  var next = sequence(11)
  for (var i = 0; i < 500; i++) {
    var length = next(40)
    var line = String.fromCharCode(97 + (i % 26)).repeat(length)
    stream += line + "\n"
    if (length > small) tooLong++
    else if (length > 0) expected.push(line)
  }
  var sizes = [1, 2, 3, 5, 16, 17, 64, 100000]
  sizes.forEach(function(size) {
    var result = feedAll(pieces(stream, size), small)
    assert.deepStrictEqual(result.lines, expected, "pieces of " + size)
    assert.strictEqual(result.dropped, tooLong, "pieces of " + size)
  })
})

test("the default cap is the constant, and a broken cap does not lift it", function() {
  var caps = [undefined, null, 0, -5, NaN, Infinity, "65536", {}, [CAP]]
  caps.forEach(function(cap) {
    assert.strictEqual(MpvProto.feed(null, "d".repeat(CAP), cap).pending.text.length, CAP, String(cap))
    var over = MpvProto.feed(null, "d".repeat(CAP + 1), cap)
    assert.deepStrictEqual(over.pending, { text: "", skipping: true })
  })
  assert.strictEqual(CAP, 65536)
})

test("feeding is linear: no input makes it slow", function() {
  var started = process.hrtime.bigint()
  // A megabyte of one-character lines in one chunk.
  var many = MpvProto.feed(null, "e\n".repeat(524288), CAP)
  assert.strictEqual(many.lines.length, 524288)
  // One long line in very small chunks: the held text is rebuilt per chunk.
  feedAll(pieces("f".repeat(CAP) + "\n", 16), CAP)
  // An endless line in very small chunks is not even copied.
  feedAll(pieces("g".repeat(2000000), 64), CAP)
  var ms = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(ms < 3000, ms + " ms")
})

// ---- The line parser ----

test("a parsed message has exactly the documented keys and types", function() {
  var line = JSON.stringify({ event: "end-file", reason: "eof", playlist_entry_id: 3, extra: 1 })
  var event = MpvProto.parse(line)
  assert.deepStrictEqual(Object.keys(event).sort(), EVENT_KEYS)
  assert.strictEqual(Object.getPrototypeOf(event), Object.prototype)
  var answer = { request_id: 3, error: "success", data: { playlist_entry_id: 2 }, x: 1 }
  var reply = MpvProto.parse(JSON.stringify(answer))
  assert.deepStrictEqual(Object.keys(reply).sort(), REPLY_KEYS)
  assert.strictEqual(MpvProto.entryId(reply.data), 2)
  // An entry id is read as the data's own key, like everything else.
  assert.strictEqual(MpvProto.entryId(Object.create({ playlist_entry_id: 3 })), 0)
  // Two parses of the same line share nothing.
  var again = MpvProto.parse(line)
  assert.notStrictEqual(again, event)
  assert.notStrictEqual(again.args, event.args)
})

test("nothing inherited and nothing unexpected travels on", function() {
  var lines = [
    "{\"event\":\"x\",\"__proto__\":{\"polluted\":true,\"reason\":\"eof\"}}",
    "{\"event\":\"x\",\"constructor\":{\"prototype\":{\"polluted\":true}}}",
    "{\"__proto__\":{\"event\":\"x\",\"request_id\":1,\"polluted\":true}}",
    "{\"request_id\":1,\"error\":\"success\",\"__proto__\":{\"polluted\":true}}"
  ]
  lines.forEach(function(line) {
    var message = MpvProto.parse(line)
    assert.strictEqual({}.polluted, undefined)
    if (message === null) return
    assert.strictEqual(message.polluted, undefined)
    assert.strictEqual(Object.getPrototypeOf(message), Object.prototype)
    if (message.kind === "event") assert.strictEqual(message.reason, "")
  })
  assert.strictEqual(MpvProto.parse(lines[2]), null)
})

test("hostile lines never throw and never yield anything but null, a reply or an event", function() {
  var hostile = [
    "", " ", "\n", "\u0000", "{", "}", "[", "]", "{\"event\"", "{\"event\":}", "{\"event\":\"x\",}", "NaN",
    "Infinity", "undefined", "-0", "1e999", "{\"request_id\":1e999}",
    "{\"event\":\"x\",\"playlist_entry_id\":1e999}",
    "{\"event\":\"" + "x".repeat(65) + "\"}", "{\"event\":\"x\",\"reason\":\"" + "r".repeat(65) + "\"}",
    "{\"event\":\"x\",\"file_error\":\"" + "e".repeat(129) + "\"}",
    "{\"event\":\"x\",\"args\":[\"" + "a".repeat(65) + "\"]}",
    "{\"event\":\"x\",\"args\":[[[[[[[[[[[[]]]]]]]]]]]]}",
    "{\"event\":\"x\",\"data\":" + "[".repeat(500) + "]".repeat(500) + "}",
    "[".repeat(60000), "{\"a\":".repeat(10000), "\"" + "\\u0000".repeat(5000) + "\"",
    "{\"event\":\"\ud83d\"}", "{\"event\":\"x\",\"name\":\"\udfb5\"}", "\ufeff{\"event\":\"x\"}",
    "{\"event\":\"x\"}\u0000", "{\"event\":\"x\"}//", "{\"event\":\"x\",\"event\":\"y\"}"
  ]
  hostile.forEach(function(line) {
    var message = MpvProto.parse(line)
    if (message === null) return
    assert.ok(message.kind === "reply" || message.kind === "event", line.slice(0, 60))
    var keys = message.kind === "reply" ? REPLY_KEYS : EVENT_KEYS
    Object.keys(message).forEach(function(key) {
      assert.ok(keys.indexOf(key) !== -1, key)
    })
  })
  // The limits of the short strings, on both sides.
  assert.strictEqual(MpvProto.parse("{\"event\":\"" + "x".repeat(64) + "\"}").event.length, 64)
  assert.strictEqual(MpvProto.parse("{\"event\":\"" + "x".repeat(65) + "\"}"), null)
  var failed = function(length) {
    return MpvProto.parse(JSON.stringify({ event: "x", file_error: "e".repeat(length) })).file_error
  }
  assert.strictEqual(failed(128).length, 128)
  assert.strictEqual(failed(129), "")
  assert.strictEqual(MpvProto.parse("{\"event\":\"x\",\"event\":\"y\"}").event, "y")
  // A line of exactly the cap is read, one more character is not.
  var padded = "{\"event\":\"x\"}"
  assert.ok(MpvProto.parse(padded + " ".repeat(CAP - padded.length)) !== null)
  assert.strictEqual(MpvProto.parse(padded + " ".repeat(CAP - padded.length + 1)), null)
})

test("a reply is a success only when mpv says exactly that", function() {
  var failures = ["", "Success", "success ", " success", "SUCCESS", "ok", "property unavailable",
    "invalid parameter", "error running command", "x".repeat(200)]
  failures.forEach(function(error) {
    var message = MpvProto.parse(JSON.stringify({ request_id: 9, error: error, data: 5 }))
    assert.notStrictEqual(message.error, "", JSON.stringify(error))
    assert.strictEqual(message.data, undefined)
    assert.ok(message.error.length <= 128)
  })
  var ok = MpvProto.parse(JSON.stringify({ request_id: 9, error: "success", data: 5 }))
  assert.deepStrictEqual(ok, { kind: "reply", request_id: 9, error: "", data: 5 })
})

// ---- Against the real mpv ----

test("every line the real mpv sent is cut and read: nothing in the traces is dropped", function() {
  Object.keys(fixture.traces).forEach(function(name) {
    var lines = received(fixture.traces[name])
    var stream = lines.map(function(line) { return JSON.stringify(line) + "\n" }).join("")
    var sizes = [100000, 512, 61, 7]
    sizes.forEach(function(size) {
      var result = feedAll(pieces(stream, size), CAP)
      assert.strictEqual(result.dropped, 0)
      assert.strictEqual(result.lines.length, lines.length, name)
      result.lines.forEach(function(text, i) {
        var message = MpvProto.parse(text)
        assert.ok(message !== null, name + ": " + text)
        var raw = lines[i]
        if (raw.request_id !== undefined) {
          assert.strictEqual(message.kind, "reply")
          assert.strictEqual(message.request_id, raw.request_id)
          assert.strictEqual(message.error, raw.error === "success" ? "" : raw.error)
          assert.deepStrictEqual(message.data, raw.data)
        } else {
          assert.strictEqual(message.kind, "event")
          assert.strictEqual(message.event, raw.event)
          assert.strictEqual(message.playlist_entry_id, raw.playlist_entry_id || 0)
          assert.strictEqual(message.reason, raw.reason || "")
          assert.strictEqual(message.file_error, raw.file_error || "")
          assert.strictEqual(message.id, raw.id || 0)
          assert.strictEqual(message.name, raw.name || "")
          assert.deepStrictEqual(message.data, raw.data)
        }
      })
    })
  })
})

test("the real mpv accepted every command of the vocabulary that the traces sent", function() {
  var accepted = new Set()
  Object.keys(fixture.traces).forEach(function(name) {
    var trace = fixture.traces[name]
    var id = 0
    trace.forEach(function(record) {
      if (record.send === undefined) return
      id++
      if (MpvProto.encode(record.send, id) === "") return
      var reply = trace.filter(function(other) { return other.recv && other.recv.request_id === id })
      assert.strictEqual(reply.length, 1, name + ": one reply to " + JSON.stringify(record.send))
      assert.strictEqual(reply[0].recv.error, "success", name + ": " + JSON.stringify(record.send))
      accepted.add(record.send.slice(0, record.send[0] === "seek" ? 1 : 2).join(" "))
    })
  })
  var expected = [
    "keybind CLOSE_WIN", "observe_property 1", "observe_property 2", "observe_property 3",
    "observe_property 4", "observe_property 5", "observe_property 6", "observe_property 7",
    "observe_property 8", "unobserve_property 7",
    "set_property pause", "set_property mute", "set_property volume", "set_property speed", "seek", "stop",
    "get_property time-pos", "af add", "af remove", "quit"
  ]
  expected.forEach(function(command) {
    assert.ok(accepted.has(command), command)
  })
  // The shape of a load (an index of -1, then options as an object) was
  // accepted too. The address differs: the traces play local files.
  var loads = []
  Object.keys(fixture.traces).forEach(function(name) {
    fixture.traces[name].forEach(function(record) {
      if (record.send && record.send[0] === "loadfile") loads.push(record.send)
    })
  })
  assert.ok(loads.length >= 30)
  loads.forEach(function(command) {
    assert.strictEqual(command.length, 5)
    assert.strictEqual(command[3], -1)
    assert.strictEqual(typeof command[4]["force-media-title"], "string")
    assert.ok(["replace", "append-play"].indexOf(command[2]) !== -1)
  })
  assert.ok(loads.some(function(command) { return command[4]["start"] === "11" }))
})

test("no trace asks mpv for its log, and none carries a path or an address", function() {
  var text = JSON.stringify(fixture.traces)
  assert.ok(text.indexOf("request_log_messages") === -1)
  assert.ok(text.indexOf("log-message") === -1)
  assert.ok(text.indexOf("user-data") === -1)
  assert.ok(!/["=]\/[A-Za-z]/.test(text), "no absolute path")
  assert.ok(!/[a-z]+:\/\//.test(text), "no address")
  var names = text.match(/<[a-z]+>/g) || []
  names.forEach(function(name) {
    assert.ok(["<a>", "<b>", "<c>", "<long>", "<missing>", "<text>"].indexOf(name) !== -1, name)
  })
})
