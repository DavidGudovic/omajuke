#!/usr/bin/node
"use strict"
// Stands in for mpv in the harness: a process that listens on the control
// socket named in its arguments and answers the way mpv 0.41 does. Every
// player and service case rests on it, so the lines it sends and their
// order are taken from tests/fixtures/mpv-traces.json, which was recorded
// from the real mpv. It plays nothing and opens nothing.
//
// What it records: one line per start in oj-stub/mpv-start.jsonl (its
// arguments and the names of its environment variables), and every line it
// receives on the socket, parsed, in oj-stub/mpv.jsonl.
//
// Like mpv it ends when its standard input closes, if it was told to treat
// that as a control connection (--input-ipc-client=fd://0); it replaces
// whatever sits at the socket path before it listens, and it leaves the
// socket file behind when it exits.
//
// The scenario the case wrote for "mpv" is read again whenever it matters,
// so a case can change it between two steps:
//
//   ok                  everything works; a file plays until it is replaced
//   eof:<ms>            a file ends by itself after that long
//   premature:<ms>      a file of 600 s ends after that long
//   load-error:<n>      the first n files that start fail (default 1)
//   stall               a file starts and then never gets anywhere
//   lose-load           the next replacing load is answered and then lost
//                       behind a load from somebody else
//   apart               of several replacing loads in a row, the one before
//                       the last is started and dropped again before the
//                       last one starts (mpv does that now and then)
//   eager               acts on every command at once, before it has read
//                       the next one
//   slow-reply:<ms>     every answer is held back that long
//   slow-position:<ms>  the same, for answers about the position only
//   ordered:<ms>        commands are taken one at a time, each when the
//                       answer to the one before has left, that long after
//                       it was read; a client whose answer cannot be
//                       delivered is given up, and what it sent behind is
//                       never acted on (the real mpv does exactly that)
//   no-socket           never listens
//   slow-socket:<ms>    listens only after that long
//   die:<ms>            exits with code 1 after that long
//   hang-up:<ms>        closes every connection after that long and lives on
//   stubborn            ignores quit and does not end on SIGTERM
//   deaf-term           does not end on SIGTERM
//   deaf-stdin          does not end when standard input closes
//
// Commands the case queued with h.inject("mpv", [...]) are carried out as
// if another program had sent them: nobody gets an answer, and a file
// loaded that way is one the service never heard of.
var fs = require("fs")
var net = require("net")
var path = require("path")
var lib = require("./lib.js")

// Times in milliseconds: how long a file takes from its start to playing,
// how long a failing one takes to fail, how long mpv waits after the last
// file before it reports itself idle, and for how long commands are
// collected before the stub turns to its playlist (mpv answers a run of
// commands first and acts on them afterwards). Then how often a watched
// position is reported and how often injected commands are looked for.
var LOAD_MS = 5
var ERROR_MS = 50
var IDLE_MS = 400
var SETTLE_MS = 3
var POSITION_MS = 80
var INJECT_MS = 20

// The length of a file in seconds, and of one that breaks off early.
var DEFAULT_DURATION = 200
var PREMATURE_DURATION = 600

var stub = lib.start("mpv")
var args = process.argv.slice(2)

function option(name) {
  var prefix = name + "="
  for (var i = 0; i < args.length; i++) {
    if (args[i].slice(0, prefix.length) === prefix) return args[i].slice(prefix.length)
  }
  return null
}

fs.appendFileSync(path.join(stub.dir, "mpv-start.jsonl"), JSON.stringify({
  argv: args, env: Object.keys(process.env).sort(), pid: process.pid
}) + "\n")

var atStart = stub.scenario()
var socketPath = option("--input-ipc-server")
var resetsPause = args.indexOf("--reset-on-next-file=pause") !== -1
var tethered = args.indexOf("--input-ipc-client=fd://0") !== -1

// ---- State ----

var clients = []
var playlist = []
var nextEntryId = 1
// The entry mpv is on (between its start-file and its end-file), and the
// entry the playlist says it should be on.
var current = null
var wanted = null
var playing = false
var props = {
  "idle-active": true, pause: false, "core-idle": true, duration: undefined,
  volume: Number(option("--volume")) || 0, mute: false, speed: 1
}
var position = { base: 0, at: 0 }
var filters = []
var failed = 0
var lost = 0
var quitting = false
// The replacing load that came last, and the one it took the place of
// before mpv had turned to its playlist.
var replacing = null
var superseded = null
var timers = { load: null, end: null, idle: null, settle: null }
var firstValues = []

// ---- Writing ----

function queue(client, object) {
  client.out.push(JSON.stringify(object) + "\n")
}

// Everything one step produced leaves in one write per client.
function flush() {
  clients.forEach(function(client) {
    if (client.out.length === 0) return
    var text = client.out.join("")
    client.out = []
    if (!client.socket.destroyed) client.socket.write(text)
  })
}

function event(object) {
  clients.forEach(function(client) { queue(client, object) })
}

// about says what the answer is about, where a scenario cares.
function answer(client, requestId, error, data, about) {
  if (client === null) return
  var object = {}
  if (data !== undefined) object.data = data
  object.request_id = requestId
  object.error = error
  var scenario = stub.scenario()
  var held = scenario.name === "slow-reply" || (scenario.name === "slow-position" && about === "position")
  if (!held) {
    queue(client, object)
    return
  }
  setTimeout(function() {
    queue(client, object)
    flush()
  }, Number(scenario.arg) || 0)
}

function change(client, id, name, value) {
  var object = { event: "property-change", id: id, name: name }
  if (value !== undefined) object.data = value
  queue(client, object)
}

function notify(name) {
  clients.forEach(function(client) {
    client.observed.forEach(function(observedName, id) {
      if (observedName === name) change(client, id, name, valueOf(name))
    })
  })
}

// mpv reports a property only when its value changes.
function setProp(name, value) {
  if (props[name] === value) return
  props[name] = value
  notify(name)
}

// ---- The player ----

function positionNow() {
  if (!playing || props.pause) return position.base
  return position.base + (Date.now() - position.at) / 1000
}

function valueOf(name) {
  if (name === "time-pos") return current !== null && playing ? positionNow() : undefined
  return props[name]
}

function clear(name) {
  if (timers[name] !== null) clearTimeout(timers[name])
  timers[name] = null
}

function later(name, ms, action) {
  clear(name)
  timers[name] = setTimeout(function() {
    timers[name] = null
    action()
    flush()
  }, ms)
}

function successor(entry) {
  var index = playlist.indexOf(entry)
  return index !== -1 && index + 1 < playlist.length ? playlist[index + 1] : null
}

function endCurrent(reason, fileError) {
  clear("load")
  clear("end")
  if (playing) position.base = positionNow()
  playing = false
  setProp("core-idle", true)
  var object = { event: "end-file", reason: reason, playlist_entry_id: current.id }
  if (fileError !== undefined) object.file_error = fileError
  event(object)
  current = null
}

function goIdle() {
  clear("idle")
  event({ event: "idle" })
  setProp("idle-active", true)
  setProp("duration", undefined)
}

// What mpv does when a file is over by itself: straight on to the next
// entry if there is one.
function advance(from, idleAfter) {
  wanted = successor(from)
  if (wanted !== null) startFile(wanted)
  else if (idleAfter > 0) later("idle", idleAfter, goIdle)
  else goIdle()
}

function startFile(entry) {
  clear("idle")
  current = entry
  playing = false
  event({ event: "start-file", playlist_entry_id: entry.id })
  setProp("idle-active", false)
  if (resetsPause) setProp("pause", false)
  setProp("duration", undefined)
  var scenario = stub.scenario()
  if (scenario.name === "stall") return
  if (scenario.name === "load-error" && failed < (Number(scenario.arg) || 1)) {
    failed++
    later("load", ERROR_MS, function() {
      endCurrent("error", "no audio or video data played")
      advance(entry, 0)
    })
    return
  }
  later("load", LOAD_MS, function() { fileLoaded(entry, scenario) })
}

function fileLoaded(entry, scenario) {
  var ends = scenario.name === "eof" || scenario.name === "premature"
  var after = Number(scenario.arg) || 0
  var duration = DEFAULT_DURATION
  if (scenario.name === "premature") duration = PREMATURE_DURATION
  else if (scenario.name === "eof") duration = after / 1000
  event({ event: "audio-reconfig" })
  event({ event: "file-loaded" })
  if (entry.start > 0) event({ event: "seek" })
  setProp("duration", duration)
  position.base = entry.start
  position.at = Date.now()
  playing = true
  event({ event: "playback-restart" })
  if (!props.pause) setProp("core-idle", false)
  if (ends) {
    later("end", after, function() {
      endCurrent("eof")
      advance(entry, IDLE_MS)
    })
  }
}

// Acts on what the commands of the last moments left behind: mpv answers
// every command first and only then turns to its playlist.
function settle() {
  firstValues.forEach(function(first) {
    if (first.client.observed.get(first.id) === first.name) {
      change(first.client, first.id, first.name, valueOf(first.name))
    }
  })
  firstValues = []
  var dropped = superseded
  replacing = null
  superseded = null
  if (quitting || current === wanted) return
  if (current !== null) endCurrent("stop")
  if (dropped !== null && wanted !== null && stub.scenario().name === "apart") {
    event({ event: "start-file", playlist_entry_id: dropped.id })
    setProp("duration", undefined)
    event({ event: "end-file", reason: "stop", playlist_entry_id: dropped.id })
  }
  if (wanted !== null) startFile(wanted)
  else goIdle()
}

function restartPlayback() {
  event({ event: "seek" })
  setProp("core-idle", true)
  event({ event: "playback-restart" })
  if (!props.pause) setProp("core-idle", false)
}

// ---- Commands ----

function addEntry(url, options) {
  var start = options !== null && typeof options === "object" ? Number(options.start) || 0 : 0
  return { id: nextEntryId++, url: String(url), start: start }
}

function load(client, requestId, command) {
  var mode = command[2]
  var entry = addEntry(command[1], command[4])
  if (mode === "replace") {
    superseded = replacing
    replacing = entry
    playlist = [entry]
    wanted = entry
    answer(client, requestId, "success", { playlist_entry_id: entry.id })
    if (client !== null && stub.scenario().name === "lose-load" && lost === 0) {
      // Somebody else's load lands right behind ours and takes its place.
      lost++
      var foreign = addEntry("foreign", null)
      playlist = [foreign]
      wanted = foreign
    }
    return
  }
  if (mode === "append-play") {
    playlist.push(entry)
    if (current === null && wanted === null) wanted = entry
  } else if (mode === "insert-at") {
    playlist.splice(Math.max(0, Math.min(playlist.length, Number(command[3]) || 0)), 0, entry)
  } else {
    answer(client, requestId, "invalid parameter")
    return
  }
  answer(client, requestId, "success", { playlist_entry_id: entry.id })
}

function step(client, requestId, by) {
  var index = playlist.indexOf(wanted !== null ? wanted : current)
  var target = index === -1 ? null : playlist[index + by]
  if (target === undefined || target === null) {
    answer(client, requestId, "error running command")
    return
  }
  wanted = target
  answer(client, requestId, "success", null)
}

function setProperty(client, requestId, name, value) {
  if (name === "pause" && typeof value === "boolean") {
    answer(client, requestId, "success")
    if (value === props.pause) return
    if (value) position.base = positionNow()
    else position.at = Date.now()
    setProp("pause", value)
    if (playing) setProp("core-idle", value)
    return
  }
  var known = (name === "mute" && typeof value === "boolean")
    || ((name === "volume" || name === "speed") && typeof value === "number")
  if (!known) {
    answer(client, requestId, "property not found")
    return
  }
  // No clamping, as in mpv: a volume above the maximum is accepted.
  answer(client, requestId, "success")
  setProp(name, value)
}

function getProperty(client, requestId, name) {
  if (name === "time-pos") {
    if (current !== null && playing) answer(client, requestId, "success", positionNow(), "position")
    else answer(client, requestId, "property unavailable", undefined, "position")
  } else if (name === "playlist") {
    answer(client, requestId, "success", playlist.map(function(entry) {
      var item = { filename: entry.url, id: entry.id }
      if (entry === current) item.current = true
      return item
    }))
  } else if (name === "track-list") {
    answer(client, requestId, "success", [])
  } else if (name === "audio-device-list") {
    answer(client, requestId, "success", [{ name: "auto", description: "Autoselect device" }])
  } else {
    answer(client, requestId, "property not found")
  }
}

function seek(client, requestId, target) {
  if (current === null || !playing || typeof target !== "number") {
    answer(client, requestId, "error running command")
    return
  }
  answer(client, requestId, "success", null)
  position.base = target
  position.at = Date.now()
  if (target < props.duration) {
    restartPlayback()
    return
  }
  // Past the end: the file is over at once.
  event({ event: "seek" })
  setProp("core-idle", true)
  event({ event: "playback-restart" })
  var entry = current
  endCurrent("eof")
  advance(entry, 0)
}

function filter(client, requestId, action, text) {
  var label = String(text).split(":")[0]
  var index = filters.indexOf(label)
  answer(client, requestId, "success", null)
  if (action === "add") {
    if (index === -1) filters.push(label)
  } else if (index !== -1) {
    filters.splice(index, 1)
    if (current !== null && playing) restartPlayback()
  }
}

// mpv ends the file it is on and goes, without turning to its playlist
// again.
function quit(client, requestId) {
  answer(client, requestId, "success", null)
  if (stub.scenario().name === "stubborn") return
  quitting = true
  clear("idle")
  if (current !== null) endCurrent("quit")
  flush()
  setTimeout(function() { process.exit(0) }, 10)
}

// client is null for a command nobody waits for an answer to.
function execute(client, requestId, command) {
  var name = Array.isArray(command) ? command[0] : null
  if (name === "loadfile") load(client, requestId, command)
  else if (name === "stop") {
    playlist = []
    wanted = null
    answer(client, requestId, "success", null)
  } else if (name === "playlist-next") step(client, requestId, 1)
  else if (name === "playlist-prev") step(client, requestId, -1)
  else if (name === "set_property") setProperty(client, requestId, command[1], command[2])
  else if (name === "get_property") getProperty(client, requestId, command[1])
  else if (name === "observe_property" && client !== null) {
    client.observed.set(command[1], command[2])
    firstValues.push({ client: client, id: command[1], name: command[2] })
    answer(client, requestId, "success")
  } else if (name === "unobserve_property" && client !== null) {
    client.observed.delete(command[1])
    answer(client, requestId, "success")
  } else if (name === "seek") seek(client, requestId, command[1])
  else if (name === "af") filter(client, requestId, command[1], command[2])
  else if (name === "keybind") answer(client, requestId, "success", null)
  else if (name === "quit") quit(client, requestId)
  else answer(client, requestId, "invalid parameter")
}

function acted() {
  flush()
  clear("settle")
  timers.settle = setTimeout(function() {
    timers.settle = null
    settle()
    flush()
  }, SETTLE_MS)
}

function receive(client, line) {
  var parsed = null
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    parsed = null
  }
  if (parsed === null || typeof parsed !== "object") {
    stub.record({ raw: line })
    return
  }
  stub.record(parsed)
  execute(client, typeof parsed.request_id === "number" ? parsed.request_id : 0, parsed.command)
}

// The scenario "ordered": the next command a client sent is taken only
// when the answer to the one before it has left, and never if that answer
// could not be delivered. mpv reads a client that way, so a client that
// hangs up right behind a command loses that command whenever an earlier
// one is still unanswered. Only the first command is taken at once.
function takeInOrder(client) {
  if (client.busy || client.waiting.length === 0) return
  if (client.socket.destroyed) {
    client.waiting = []
    return
  }
  client.busy = true
  receive(client, client.waiting.shift())
  // The answer is taken out of the common queue, so that nothing else
  // sends it early. A quit has sent its own already.
  var reply = client.out.join("")
  client.out = []
  acted()
  setTimeout(function() {
    var gone = function() {
      client.busy = false
      client.waiting = []
    }
    if (client.socket.destroyed) {
      gone()
      return
    }
    client.socket.write(reply, function(error) {
      if (error) {
        gone()
        return
      }
      client.busy = false
      takeInOrder(client)
    })
  }, Number(stub.scenario().arg) || 0)
}

// ---- The socket ----

function accept(socket) {
  var client = { socket: socket, out: [], observed: new Map(), text: "", waiting: [], busy: false }
  clients.push(client)
  socket.setEncoding("utf8")
  socket.on("data", function(chunk) {
    client.text += chunk
    var lines = client.text.split("\n")
    client.text = lines.pop()
    var ordered = stub.scenario().name === "ordered" || client.busy
    lines.forEach(function(line) {
      if (line === "") return
      if (ordered) {
        client.waiting.push(line)
        return
      }
      receive(client, line)
      if (stub.scenario().name === "eager") settle()
    })
    if (ordered) takeInOrder(client)
    else acted()
  })
  socket.on("error", function() {})
  socket.on("close", function() {
    var index = clients.indexOf(client)
    if (index !== -1) clients.splice(index, 1)
  })
}

function listen() {
  if (socketPath === null) return
  try {
    fs.unlinkSync(socketPath)
  } catch (error) {
    // Nothing was there.
  }
  var server = net.createServer(accept)
  server.on("error", function() { process.exit(1) })
  server.listen(socketPath, function() { fs.chmodSync(socketPath, 0o600) })
}

// ---- Life ----

if (atStart.name === "deaf-term" || atStart.name === "stubborn") process.on("SIGTERM", function() {})
if (tethered && atStart.name !== "deaf-stdin") {
  process.stdin.on("end", function() { process.exit(0) })
  process.stdin.on("error", function() { process.exit(0) })
}
process.stdin.resume()

if (atStart.name === "die") setTimeout(function() { process.exit(1) }, Number(atStart.arg) || 0)
if (atStart.name === "hang-up") {
  setTimeout(function() {
    clients.slice().forEach(function(client) { client.socket.destroy() })
  }, Number(atStart.arg) || 0)
}
if (atStart.name === "slow-socket") setTimeout(listen, Number(atStart.arg) || 0)
else if (atStart.name !== "no-socket") listen()

// What was queued for an earlier mpv is not for this one.
stub.takeInjected()
setInterval(function() {
  var commands = stub.takeInjected()
  if (commands.length === 0) return
  commands.forEach(function(command) { execute(null, 0, command) })
  acted()
}, INJECT_MS)

// A watched position is reported while it moves.
setInterval(function() {
  if (current === null || !playing || props.pause) return
  notify("time-pos")
  flush()
}, POSITION_MS)
