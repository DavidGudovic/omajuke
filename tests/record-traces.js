"use strict"
// Records what the real mpv says and in which order, into
// tests/fixtures/mpv-traces.json. The player's state logic and the stub mpv
// of the harness are written against these traces, so that neither rests on
// a guess about mpv. Run by hand (node tests/record-traces.js) after an mpv
// upgrade or a change to the launch flags; the gate never runs it.
//
// It is safe to run on a desktop in use. mpv is started with the plugin's
// own launch flags plus --ytdl=no --ao=null --vo=null and an environment
// that names no display and no session bus: no window, no sound, no network.
// It plays short silent files this script writes into a private temporary
// directory, which is removed at the end. mpv is tied to this process by its
// standard input and goes away with it. The only process this script ever
// ends is that child, through the handle it was started with.
//
// A trace is a list of records, each with t, the milliseconds since the
// connection came up:
//   { t, send: [...] }   a command we wrote. Request ids count the sends of
//                        a trace from 1. glued: true marks a command that
//                        left in the same write as the send before it.
//   { t, recv: {...} }   a line we received. Lines with the same t came in
//                        the same read.
//   { t, other: [...] }  a command a second client wrote, which is what a
//                        media key reaches mpv as. Its replies are not ours
//                        and are not in the trace.
// File paths are replaced by <a>, <b>, <c>, <long>, <missing> and <text>.
var childProcess = require("child_process")
var fs = require("fs")
var net = require("net")
var os = require("os")
var path = require("path")
var load = require("./node/load.js")

var Const = load.lib("Const")
var MpvArgs = load.lib("MpvArgs")
var MpvProto = load.lib("MpvProto")

var OUT = path.join(__dirname, "fixtures", "mpv-traces.json")
var DIR_PREFIX = "omajuke-traces-"
// On top of the plugin's own flags: local files only, no sound, no window.
var SILENT = ["--ytdl=no", "--ao=null", "--vo=null"]
// A unix socket address holds 108 bytes.
var SOCKET_BYTES = 100
var START_VOLUME = 70
var SECONDS = 3
var LONG_SECONDS = 12
var WAIT_MS = 8000
var QUIET_MS = 150
var DEADLINE_MS = 180000
var ATTEMPTS = 20

// The one child of this script and its working directory. Module level, so
// that the deadline below can end the one and remove the other whatever the
// recording is doing at that moment.
var child = null
var workDir = ""

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

// A silent WAV file: 8 kHz, mono, 16 bit.
function silence(seconds) {
  var rate = 8000
  var bytes = rate * 2 * seconds
  var header = Buffer.alloc(44)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + bytes, 4)
  header.write("WAVEfmt ", 8, "ascii")
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36, "ascii")
  header.writeUInt32LE(bytes, 40)
  return Buffer.concat([header, Buffer.alloc(bytes)])
}

// No display, no session bus, and a home directory that is ours.
function childEnv(dir) {
  return { PATH: "/usr/bin", LANG: "C.UTF-8", HOME: dir }
}

function mpvVersion(dir) {
  var result = childProcess.spawnSync(Const.TOOLS.mpv, ["--no-config", "--version"],
    { env: childEnv(dir), encoding: "utf8", timeout: 5000 })
  var match = /^mpv v?([0-9][0-9A-Za-z.]*)/.exec(String(result.stdout || ""))
  if (!match) throw new Error("cannot read the mpv version")
  return match[1]
}

// Replaces every path that could name this machine, in every string of a
// value, and returns the changed copy.
function scrubbed(value, names) {
  if (typeof value === "string") {
    return names.reduce(function(text, pair) { return text.split(pair[0]).join(pair[1]) }, value)
  }
  if (Array.isArray(value)) return value.map(function(item) { return scrubbed(item, names) })
  if (value !== null && typeof value === "object") {
    var copy = {}
    Object.keys(value).forEach(function(key) { copy[key] = scrubbed(value[key], names) })
    return copy
  }
  return value
}

function connect(sock) {
  return new Promise(function(resolve, reject) {
    var socket = net.connect(sock)
    socket.once("connect", function() { resolve(socket) })
    socket.once("error", reject)
  })
}

// mpv needs a moment to create its socket.
async function connectSoon(sock) {
  for (var i = 0; i < 250; i++) {
    try {
      return await connect(sock)
    } catch (error) {
      await sleep(20)
    }
  }
  throw new Error("mpv did not open its socket")
}

// Starts a fresh mpv and connects to it. Every trace gets its own, so that
// entry ids start at 1 and nothing carries over from the trace before.
async function open(dir, names) {
  var sock = path.join(dir, "s")
  if (Buffer.byteLength(sock) > SOCKET_BYTES) {
    throw new Error("the temporary directory is too long for a socket path: set TMPDIR to a shorter one")
  }
  var argv = MpvArgs.launch({ sock: sock, volume: START_VOLUME, mpris: false, ytdlp: Const.TOOLS.ytdlp })
  if (argv === null) throw new Error("the launch flags refuse this temporary directory")
  argv = argv.concat(SILENT)
  fs.rmSync(sock, { force: true })
  // The pipe on standard input is the tether: mpv quits when it closes.
  child = childProcess.spawn(Const.TOOLS.mpv, argv,
    { cwd: dir, env: childEnv(dir), stdio: ["pipe", "ignore", "ignore"] })
  var gone = new Promise(function(resolve) { child.once("exit", resolve) })
  child.once("error", function() {})

  var socket = await connectSoon(sock)
  var started = Date.now()
  var session = {
    argv: scrubbed(argv, names),
    records: [],
    received: [],
    cursor: 0,
    requests: 0,
    waiter: null,
    lastLine: 0,
    socket: socket,
    second: null,
    gone: gone,
    ended: new Promise(function(resolve) { socket.once("close", resolve) })
  }
  var held = ""

  session.stamp = function() { return Date.now() - started }

  // Hands lines to whoever waits, in order, from where the last wait ended.
  session.drain = function() {
    while (session.waiter !== null && session.cursor < session.received.length) {
      var line = session.received[session.cursor++]
      if (session.waiter.test(line)) {
        var waiter = session.waiter
        session.waiter = null
        waiter.resolve(line)
      }
    }
  }

  socket.setEncoding("utf8")
  socket.on("error", function() {})
  socket.on("data", function(chunk) {
    var t = session.stamp()
    var lines = (held + chunk).split("\n")
    held = lines.pop()
    lines.forEach(function(text) {
      if (text === "") return
      var line = scrubbed(JSON.parse(text), names)
      session.records.push({ t: t, recv: line })
      session.received.push(line)
    })
    session.lastLine = Date.now()
    session.drain()
  })

  function write(commands) {
    var t = session.stamp()
    var text = ""
    var ids = []
    commands.forEach(function(command, i) {
      if (!Array.isArray(command)) throw new Error("not a command")
      session.requests++
      ids.push(session.requests)
      text += JSON.stringify({ command: command, request_id: session.requests }) + "\n"
      var record = { t: t, send: scrubbed(command, names) }
      if (i > 0) record.glued = true
      session.records.push(record)
    })
    socket.write(text)
    return ids
  }

  // One command in a write of its own. Returns its request id.
  session.send = function(command) { return write([command])[0] }

  // Several commands in one write, so that mpv reads them together.
  session.burst = function(commands) { return write(commands) }

  // A command from a second client. Whatever mpv answers it is not ours.
  session.other = function(command) {
    if (session.second === null) throw new Error("no second client")
    session.records.push({ t: session.stamp(), other: scrubbed(command, names) })
    session.second.write(JSON.stringify({ command: command }) + "\n")
  }

  session.openSecond = async function() {
    session.second = await connect(sock)
    session.second.on("error", function() {})
    session.second.resume()
  }

  // Resolves with the next received line that passes the test.
  session.until = function(test, what) {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        session.waiter = null
        reject(new Error("timed out waiting for " + what))
      }, WAIT_MS)
      session.waiter = { test: test, resolve: function(line) { clearTimeout(timer); resolve(line) } }
      session.drain()
    })
  }

  // Resolves once mpv has said nothing for a while. Everything received by
  // then counts as seen: a later wait starts behind it.
  session.quiet = async function() {
    session.lastLine = Date.now()
    while (Date.now() - session.lastLine < QUIET_MS) await sleep(20)
    session.cursor = session.received.length
  }

  return session
}

// Ends the mpv of a session: by asking, and if it does not listen, through
// the handle of the child. The quit and what mpv says on its way out are
// the last records of every trace.
async function close(session) {
  var done = false
  Promise.all([session.gone, session.ended]).then(function() { done = true })
  session.send(MpvProto.quit())
  for (var i = 0; i < 150 && !done; i++) await sleep(20)
  if (!done) {
    child.kill("SIGKILL")
    await session.gone
  }
  session.socket.destroy()
  if (session.second !== null) session.second.destroy()
  child = null
}

// ---- What the scenarios are made of ----

function isEvent(name) {
  return function(line) { return line.event === name }
}

function isReply(id) {
  return function(line) { return line.request_id === id }
}

function isChange(name, data) {
  return function(line) {
    if (line.event !== "property-change" || line.name !== name) return false
    return data === undefined || line.data === data
  }
}

function isEnd(reason) {
  return function(line) { return line.event === "end-file" && line.reason === reason }
}

// A load command in the shape the plugin sends, for a local file: the
// insertion index, then per-file options as an object. The title is the
// constant the plugin uses for a track without one.
function loadCommand(file, mode, start) {
  var options = { "force-media-title": Const.APP_NAME }
  if (start !== undefined) options["start"] = String(start)
  return ["loadfile", file, mode, -1, options]
}

// What the player sends on a fresh connection, each in a write of its own.
function handshake(s) {
  MpvProto.handshake().concat([MpvProto.setMute(false)]).forEach(function(command) { s.send(command) })
}

async function ready(s) {
  handshake(s)
  await s.quiet()
}

async function play(s, file) {
  s.send(loadCommand(file, "replace"))
  await s.until(isEvent("playback-restart"), "playback-restart")
  await s.quiet()
}

async function untilIdle(s) {
  await s.until(isChange("idle-active", true), "idle-active")
  await s.quiet()
}

// Waits until the load with this request id plays, and returns how many
// files mpv began to start on the way there.
async function startsUntilLast(s, id) {
  var last = (await s.until(isReply(id), "the last reply")).data.playlist_entry_id
  var starts = 0
  await s.until(function(line) {
    if (line.event === "start-file") starts++
    return line.event === "start-file" && line.playlist_entry_id === last
  }, "the last start-file")
  await s.until(isEvent("playback-restart"), "playback-restart")
  await s.quiet()
  return starts
}

// ---- The scenarios ----
// Each gets a session s on a fresh mpv and the media files m. Returning
// false asks for another attempt, where the outcome depends on a race.

var SCENARIOS = {
  // A cold start as the player does it: the handshake and the load leave
  // back to back, before mpv has answered anything.
  cold_load: async function(s, m) {
    handshake(s)
    s.send(loadCommand(m.a, "replace"))
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
  },

  replace: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    await play(s, m.b)
  },

  // Three loads in one write. mpv answers all three before it acts, and
  // which of the first two it begins to start before the last displaces it
  // is a race. This trace is kept when only the last one started.
  three_replaces: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    var ids = s.burst([loadCommand(m.b, "replace"), loadCommand(m.c, "replace"), loadCommand(m.a, "replace")])
    return (await startsUntilLast(s, ids[2])) === 1
  },

  // The same three loads in three writes, kept when one of the first two
  // got as far as a start-file before it was displaced.
  three_replaces_apart: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(loadCommand(m.b, "replace"))
    s.send(loadCommand(m.c, "replace"))
    var id = s.send(loadCommand(m.a, "replace"))
    return (await startsUntilLast(s, id)) > 1
  },

  playlist_next: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(loadCommand(m.b, "append-play"))
    await s.quiet()
    s.send(["playlist-next", "weak"])
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
  },

  playlist_prev: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(loadCommand(m.b, "append-play"))
    await s.quiet()
    s.send(["playlist-next", "weak"])
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
    s.send(["playlist-prev", "weak"])
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
  },

  stop: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(MpvProto.stop())
    await untilIdle(s)
  },

  // What the player's "forget everything, then load" looks like on the wire.
  stop_then_load: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(MpvProto.stop())
    s.send(loadCommand(m.b, "replace"))
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
  },

  eof_with_next: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(loadCommand(m.b, "append-play"))
    await s.until(isEnd("eof"), "end-file eof")
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
  },

  eof_last: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    await s.until(isEnd("eof"), "end-file eof")
    await untilIdle(s)
  },

  // A file that cannot be opened, with a good one queued right behind it.
  error_with_next: async function(s, m) {
    await ready(s)
    s.burst([loadCommand(m.missing, "replace"), loadCommand(m.b, "append-play")])
    await s.until(isEnd("error"), "end-file error")
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
  },

  error_last: async function(s, m) {
    await ready(s)
    s.send(loadCommand(m.missing, "replace"))
    await s.until(isEnd("error"), "end-file error")
    await untilIdle(s)
  },

  // A file that opens but is not media.
  error_not_media: async function(s, m) {
    await ready(s)
    s.send(loadCommand(m.text, "replace"))
    await s.until(isEvent("end-file"), "end-file")
    await untilIdle(s)
  },

  // A start position behind the end of the file: mpv opens the file and
  // plays nothing, which is also what an expired media address looks like.
  error_no_data: async function(s, m) {
    await ready(s)
    s.send(loadCommand(m.a, "replace", SECONDS + 7))
    await s.until(isEvent("end-file"), "end-file")
    await untilIdle(s)
  },

  pause_resume: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(MpvProto.setPause(true))
    await s.quiet()
    s.send(MpvProto.getProperty("time-pos"))
    await s.quiet()
    s.send(MpvProto.setPause(false))
    await s.quiet()
    s.send(MpvProto.getProperty("time-pos"))
    await s.quiet()
  },

  // A pause survives a load unless mpv is told otherwise, and the launch
  // flags tell it otherwise. This shows where the change is reported.
  replace_while_paused: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(MpvProto.setPause(true))
    await s.quiet()
    await play(s, m.b)
  },

  seek: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(MpvProto.seek(1.5, SECONDS))
    await s.until(isEvent("playback-restart"), "playback-restart")
    s.send(MpvProto.getProperty("time-pos"))
    await s.quiet()
  },

  // Another client seeks far past the end of a longer file. The file ends
  // normally right behind the seek, before mpv was asked where it is.
  seek_past_end: async function(s, m) {
    await ready(s)
    await s.openSecond()
    await play(s, m.long)
    s.other(["seek", 500, "absolute"])
    await s.until(isEvent("end-file"), "end-file")
    await untilIdle(s)
  },

  // A resume one second before the end: the file starts there and ends
  // normally a moment later.
  start_near_end: async function(s, m) {
    await ready(s)
    s.send(loadCommand(m.long, "replace", LONG_SECONDS - 1))
    await s.until(isEvent("playback-restart"), "playback-restart")
    s.send(MpvProto.getProperty("time-pos"))
    await s.until(isEvent("end-file"), "end-file")
    await untilIdle(s)
  },

  // The position reports that arrive while somebody watches the position.
  position_watch: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(MpvProto.observe("time-pos"))
    await sleep(600)
    s.send(MpvProto.unobserve("time-pos"))
    await s.quiet()
  },

  append_play_while_idle: async function(s, m) {
    await ready(s)
    s.send(loadCommand(m.a, "append-play"))
    await s.until(isEvent("playback-restart"), "playback-restart")
    await s.quiet()
  },

  append_play_while_playing: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(loadCommand(m.b, "append-play"))
    await s.quiet()
  },

  even_volume: async function(s, m) {
    await ready(s)
    await play(s, m.a)
    s.send(MpvProto.setEvenVolume(true))
    await s.quiet()
    s.send(MpvProto.setEvenVolume(false))
    await s.quiet()
  },

  // What a media-key client can do to volume and speed, and the answers the
  // player gives.
  external_volume_speed: async function(s, m) {
    await ready(s)
    await s.openSecond()
    await play(s, m.a)
    s.other(["set_property", "volume", 150])
    await s.until(isChange("volume", 150), "volume 150")
    s.send(MpvProto.setVolume(150))
    await s.until(isChange("volume", 100), "volume 100")
    s.other(["set_property", "speed", 2])
    await s.until(isChange("speed", 2), "speed 2")
    s.send(MpvProto.resetSpeed())
    await s.until(isChange("speed", 1), "speed 1")
    await s.quiet()
  },

  external_stop: async function(s, m) {
    await ready(s)
    await s.openSecond()
    await play(s, m.a)
    s.other(["stop"])
    await untilIdle(s)
  },

  // Another client makes mpv open a file while ours plays.
  foreign_load: async function(s, m) {
    await ready(s)
    await s.openSecond()
    await play(s, m.a)
    s.other(loadCommand(m.b, "replace"))
    await s.until(isEvent("start-file"), "the foreign start-file")
    // The player's answer to a file it did not load.
    s.send(MpvProto.stop())
    await untilIdle(s)
  },

  // Another client's load arrives right behind ours. Ours gets its reply
  // and nothing else: mpv starts only the last of the two.
  lost_load: async function(s, m) {
    await ready(s)
    await s.openSecond()
    var id = s.send(loadCommand(m.a, "replace"))
    s.other(loadCommand(m.b, "replace"))
    var mine = (await s.until(isReply(id), "our reply")).data.playlist_entry_id
    var first = await s.until(isEvent("start-file"), "start-file")
    // The race went the other way and our own file started: try again.
    if (first.playlist_entry_id <= mine) return false
    s.send(MpvProto.stop())
    await untilIdle(s)
    return true
  }
}

// ---- Output ----

// Nothing that names this machine may reach the repository. The paths were
// replaced while recording; this looks at the finished text once more and
// refuses to write it if anything is left.
function assertAnonymous(text, dir) {
  var user = os.userInfo().username
  var forbidden = [dir, os.homedir(), os.hostname(), "/home/", "/tmp/", "/run/", "http"]
  if (user.length > 2) forbidden.push(user)
  forbidden.forEach(function(word) {
    if (word !== "" && text.indexOf(word) !== -1) throw new Error("the traces would name this machine")
  })
  if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(text)) throw new Error("the traces would hold a network address")
}

// One record on each line: the fixture is read by people as well.
function serialized(version, argv, traces) {
  var names = Object.keys(traces)
  var text = "{\n\"mpv\": " + JSON.stringify(version) + ",\n\"argv\": " + JSON.stringify(argv)
    + ",\n\"traces\": {\n"
  names.forEach(function(name, i) {
    text += JSON.stringify(name) + ": [\n"
    text += traces[name].map(function(record) { return JSON.stringify(record) }).join(",\n")
    text += "\n]" + (i < names.length - 1 ? "," : "") + "\n"
  })
  return text + "}\n}\n"
}

async function record(dir, names, media, name) {
  for (var attempt = 0; attempt < ATTEMPTS; attempt++) {
    var session = await open(dir, names)
    var keep
    try {
      keep = await SCENARIOS[name](session, media)
    } finally {
      await close(session)
    }
    if (keep !== false) return session
  }
  throw new Error("no usable recording of " + name)
}

async function main() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), DIR_PREFIX))
  workDir = dir
  try {
    var media = {
      a: path.join(dir, "a.wav"),
      b: path.join(dir, "b.wav"),
      c: path.join(dir, "c.wav"),
      long: path.join(dir, "long.wav"),
      missing: path.join(dir, "missing.wav"),
      text: path.join(dir, "text.wav")
    }
    fs.writeFileSync(media.a, silence(SECONDS))
    fs.writeFileSync(media.b, silence(SECONDS))
    fs.writeFileSync(media.c, silence(SECONDS))
    fs.writeFileSync(media.long, silence(LONG_SECONDS))
    fs.writeFileSync(media.text, "This is not media.\n".repeat(64))
    // Longest first: the directory is a prefix of every file in it.
    var names = Object.keys(media).map(function(key) { return [media[key], "<" + key + ">"] })
    names.push([dir, "<dir>"])

    var version = mpvVersion(dir)
    var argv = null
    var traces = {}
    var order = Object.keys(SCENARIOS)
    for (var i = 0; i < order.length; i++) {
      var session = await record(dir, names, media, order[i])
      argv = session.argv
      traces[order[i]] = session.records
      process.stdout.write(order[i] + ": " + session.records.length + " records\n")
    }
    var text = serialized(version, argv, traces)
    assertAnonymous(text, dir)
    fs.writeFileSync(OUT, text)
    process.stdout.write("wrote " + path.relative(process.cwd(), OUT) + " (mpv " + version + ")\n")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    workDir = ""
  }
}

// The recording takes about half a minute. If something hangs, the child is
// ended through its handle and nothing is written.
var deadline = setTimeout(function() {
  process.stderr.write("record-traces: gave up\n")
  if (child !== null) child.kill("SIGKILL")
  if (workDir !== "") fs.rmSync(workDir, { recursive: true, force: true })
  process.exit(1)
}, DEADLINE_MS)

main().then(function() {
  clearTimeout(deadline)
}, function(error) {
  clearTimeout(deadline)
  process.stderr.write("record-traces: " + error.message + "\n")
  if (child !== null) child.kill("SIGKILL")
  process.exitCode = 1
})
