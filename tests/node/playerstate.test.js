"use strict"
// Tests for lib/PlayerState.js. The first half replays every trace recorded
// from the real mpv (tests/fixtures/mpv-traces.json) and compares the
// signals that come out with what really happened. The second half feeds
// hand-written lines for what cannot be recorded without a network or a
// second program: a connection that breaks mid-track, a live stream, and
// the odd inputs. The last part is about mpv's playlist as a list of track
// keys: the list the player changes with each of its own commands must be
// the playlist mpv reports afterwards, in every trace.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var PlayerState = load.lib("PlayerState")
var MpvProto = load.lib("MpvProto")
var fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "mpv-traces.json"), "utf8"))

var PHASES = ["idle", "loading", "playing", "paused", "buffering"]
var RUNNING = ["playing", "paused", "buffering"]
var SIGNALS = ["loading", "started", "ended", "idle", "videoClosed"]
var STATE_KEYS = [
  "coreIdle", "duration", "entry", "idleActive", "key", "live", "mute", "pause", "phase", "posAt", "posBase",
  "posKnown", "seeking", "started", "volume"
]
var ASK_POSITION = JSON.stringify(MpvProto.getProperty("time-pos"))

// The traces the reducer and the mpv stub rest on: the recorder must have
// produced every one of them.
var REQUIRED = [
  "cold_load", "replace", "three_replaces", "playlist_next", "playlist_prev", "stop", "eof_with_next",
  "eof_last", "error_with_next", "error_last", "pause_resume", "seek", "append_play_while_idle",
  "append_play_while_playing"
]

// Every trace, and all the signals it must produce, in order. Each starts
// with "idle": a fresh mpv reports that it is idle before anything else.
// Keys count the loads of a trace from 1.
var EXPECTED = {
  cold_load: ["idle", "loading 1", "started 1"],
  replace: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
  // Keys 2, 3 and 4 are three loads in a row: only the last is reported.
  three_replaces: ["idle", "loading 1", "started 1", "loading 4", "started 4"],
  three_replaces_apart: ["idle", "loading 1", "started 1", "loading 4", "started 4"],
  playlist_next: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
  playlist_prev: ["idle", "loading 1", "started 1", "loading 2", "started 2", "loading 1", "started 1"],
  stop: ["idle", "loading 1", "started 1", "idle"],
  stop_then_load: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
  eof_with_next: ["idle", "loading 1", "started 1", "ended 1 eof", "loading 2", "started 2"],
  eof_last: ["idle", "loading 1", "started 1", "ended 1 eof", "idle"],
  error_with_next: ["idle", "loading 1", "ended 1 error loading failed", "loading 2", "started 2"],
  error_last: ["idle", "loading 1", "ended 1 error loading failed", "idle"],
  error_not_media: ["idle", "loading 1", "ended 1 error unrecognized file format", "idle"],
  // mpv reports the start of a file it then plays nothing of.
  error_no_data: ["idle", "loading 1", "started 1", "ended 1 error no audio or video data played", "idle"],
  pause_resume: ["idle", "loading 1", "started 1"],
  replace_while_paused: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
  seek: ["idle", "loading 1", "started 1"],
  // Both end normally, far from where the position was last known to be.
  seek_past_end: ["idle", "loading 1", "started 1", "ended 1 eof", "idle"],
  start_near_end: ["idle", "loading 1", "started 1", "ended 1 eof", "idle"],
  position_watch: ["idle", "loading 1", "started 1"],
  append_play_while_idle: ["idle", "loading 1", "started 1"],
  append_play_while_playing: ["idle", "loading 1", "started 1"],
  even_volume: ["idle", "loading 1", "started 1"],
  external_volume_speed: ["idle", "loading 1", "started 1"],
  external_stop: ["idle", "loading 1", "started 1", "idle"],
  // A file we did not load is never reported: mpv is stopped and goes idle.
  foreign_load: ["idle", "loading 1", "started 1", "idle"],
  // Keys 2 to 4 are held beside the track that plays; one is removed, and
  // key 2 is started by its position. Nothing ends, nothing goes idle.
  playlist_edit: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
  playlist_burst: ["idle", "loading 1", "started 1"],
  // Removing the entry that plays is a step to the next one, not an end.
  playlist_remove_current: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
  playlist_clear: ["idle", "loading 1", "started 1"],
  // A position that is not in the playlist: mpv stops playing.
  play_index_past_end: ["idle", "loading 1", "started 1", "idle"],
  // Video comes and goes beside the audio without a word about the track.
  video_show_hide: ["idle", "loading 1", "started 1"],
  video_track_change: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
  video_show_again: ["idle", "loading 1", "started 1"],
  video_closed: ["idle", "loading 1", "started 1", "videoClosed"],
  video_add_fails: ["idle", "loading 1", "started 1"],
  output_select: ["idle", "loading 1", "started 1"],
  lost_load: ["idle", "idle"]
}

// The traces in which another program changes mpv's playlist behind our
// back, and the one that uses a command the player never sends.
var NOT_OUR_PLAYLIST = ["external_stop", "foreign_load", "lost_load", "playlist_clear"]

// The traces whose last file is the long one.
var ENDS_LONG = ["playlist_burst", "playlist_clear", "video_show_hide", "video_show_again", "video_closed",
  "video_add_fails"]

// What the reducer asks the player to send, besides questions about the
// position. Everywhere else it asks for nothing.
var ANSWERS = {
  foreign_load: [["stop"]],
  lost_load: [["stop"]],
  external_volume_speed: [["set_property", "volume", 100], ["set_property", "speed", 1]]
}

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

function spell(signal) {
  return [signal.name].concat(signal.args).join(" ").trim()
}

// What must hold after every single step, whatever came in.
function checkResult(result, before, snapshot) {
  assert.deepStrictEqual(Object.keys(result).sort(), ["commands", "signals", "state"])
  assert.notStrictEqual(result.state, before, "the state is a new object")
  assert.deepStrictEqual(before, snapshot, "the state that went in is untouched")
  var state = result.state
  assert.deepStrictEqual(Object.keys(state).sort(), STATE_KEYS)
  assert.ok(PHASES.indexOf(state.phase) !== -1, state.phase)
  assert.ok(Number.isInteger(state.key) && state.key >= 0)
  assert.ok(Number.isInteger(state.entry) && state.entry >= 0)
  assert.strictEqual(state.key === 0, state.entry === 0, "a track and its entry come and go together")
  assert.strictEqual(state.key === 0, state.phase === "idle", "no track exactly while idle")
  assert.strictEqual(state.started, RUNNING.indexOf(state.phase) !== -1, "started exactly while running")
  if (state.key === 0) assert.ok(!state.seeking && !state.posKnown, "nothing is left of a track that is over")
  if (state.seeking) assert.ok(!state.posKnown, "the position is not known while a seek is on its way")
  assert.ok(Number.isInteger(state.volume) && state.volume >= 0 && state.volume <= 100)
  assert.ok(Number.isFinite(state.duration) && state.duration >= 0)
  assert.ok(Number.isFinite(state.posBase) && state.posBase >= 0)
  assert.ok(Number.isFinite(state.posAt))
  var flags = ["started", "live", "pause", "coreIdle", "idleActive", "seeking", "posKnown", "mute"]
  flags.forEach(function(flag) {
    assert.strictEqual(typeof state[flag], "boolean", flag)
  })
  result.signals.forEach(function(signal) {
    assert.deepStrictEqual(Object.keys(signal).sort(), ["args", "name"])
    assert.ok(SIGNALS.indexOf(signal.name) !== -1, signal.name)
    assert.ok(Array.isArray(signal.args))
  })
  result.commands.forEach(function(command) {
    assert.notStrictEqual(MpvProto.encode(command, 1), "", JSON.stringify(command))
  })
}

// Plays a recorded trace through the reducer the way the player will: each
// received line goes through the real parser, replies to loads fill the
// table of playlist entries (a replace makes every older entry dead), and
// the time of each record is the clock.
function replay(trace) {
  var state = PlayerState.initial()
  var entries = new Map()
  var floor = 0
  var loads = new Map()
  var questions = new Set()
  var requests = 0
  var keys = 0
  var quitting = false
  var run = {
    signals: [], phases: [state.phase], answers: [], positions: [], started: 0, state: state,
    keys: [], adopted: [], surprises: [], passedOver: 0
  }
  // The playlist as keys, kept the way the player keeps it: changed at
  // once by each command of ours, and set to what mpv reports whenever no
  // such command is unanswered.
  var edits = new Set()
  var playlistReads = new Set()

  function reported(data, index) {
    if (edits.size > 0) {
      run.passedOver++
      return
    }
    var keys = PlayerState.keysOf(MpvProto.playlistIds(data), entryKind)
    if (JSON.stringify(keys) !== JSON.stringify(run.keys)) run.surprises.push({ index: index, keys: keys })
    run.keys = keys
    run.adopted.push(keys.join())
  }

  function entryKind(id) {
    if (entries.has(id)) return { key: entries.get(id), dead: false, live: false }
    return { key: 0, dead: id < floor }
  }

  function take(result, index) {
    checkResult(result, state, copy(state))
    state = result.state
    result.signals.forEach(function(signal) {
      run.signals.push(spell(signal))
      if (signal.name !== "started") return
      run.started++
      // The player learns the exact position of a file that starts.
      assert.ok(result.commands.some(function(command) { return JSON.stringify(command) === ASK_POSITION }))
    })
    result.commands.forEach(function(command) {
      if (JSON.stringify(command) !== ASK_POSITION) run.answers.push({ index: index, command: command })
    })
    if (!quitting && run.phases[run.phases.length - 1] !== state.phase) run.phases.push(state.phase)
  }

  trace.forEach(function(record, index) {
    if (record.other !== undefined) return
    if (record.send !== undefined) {
      requests++
      var command = record.send
      if (command[0] === "loadfile") {
        loads.set(requests, { key: ++keys, mode: command[2] })
        run.keys = PlayerState.keysAfterLoad(run.keys, keys, command[2], command[3])
        edits.add(requests)
      } else if (command[0] === "playlist-remove") {
        run.keys = PlayerState.keysAfterRemove(run.keys, command[1])
        edits.add(requests)
      } else if (command[0] === "stop") {
        run.keys = []
        edits.add(requests)
      }
      if (command[0] === "get_property" && command[1] === "playlist") playlistReads.add(requests)
      if (command[0] === "get_property" && command[1] === "time-pos") questions.add(requests)
      if (command[0] === "quit") quitting = true
      // The player moves the position itself before it sends a seek.
      if (command[0] === "seek") take(PlayerState.onLocalSeek(state, command[1], record.t), index)
      return
    }
    var message = MpvProto.parse(JSON.stringify(record.recv))
    assert.ok(message !== null, JSON.stringify(record.recv))
    if (message.kind === "event") {
      if (message.event === "property-change" && message.name === "time-pos") {
        run.positions.push({ estimate: PlayerState.positionNow(state, record.t), actual: message.data })
      }
      take(PlayerState.onEvent(state, message, entryKind, record.t), index)
      if (message.event === "property-change" && message.name === "playlist") reported(message.data, index)
      return
    }
    var loaded = loads.get(message.request_id)
    if (loaded !== undefined && message.error === "") {
      var id = MpvProto.entryId(message.data)
      assert.ok(id > 0)
      if (loaded.mode === "replace") {
        floor = id
        entries.forEach(function(key, entry) { if (entry < id) entries.delete(entry) })
      }
      entries.set(id, loaded.key)
    }
    edits.delete(message.request_id)
    if (playlistReads.has(message.request_id) && message.error === "") reported(message.data, index)
    if (questions.has(message.request_id) && message.error === "") {
      run.positions.push({ estimate: PlayerState.positionNow(state, record.t), actual: message.data })
      take(PlayerState.onProperty(state, "time-pos", message.data, record.t), index)
    }
  })
  run.state = state
  return run
}

function startFiles(trace) {
  return trace.filter(function(record) { return record.recv && record.recv.event === "start-file" })
    .map(function(record) { return record.recv.playlist_entry_id })
}

// A reducer driven by hand-written lines. entries maps mpv's entry ids to
// what the player would answer for them.
function machine(entries) {
  var m = { state: PlayerState.initial(), signals: [], commands: [], now: 1000 }
  function entryKind(id) {
    return Object.prototype.hasOwnProperty.call(entries, id) ? entries[id] : { key: 0, dead: false }
  }
  function take(result) {
    checkResult(result, m.state, copy(m.state))
    m.state = result.state
    m.last = result
    result.signals.forEach(function(signal) { m.signals.push(spell(signal)) })
    result.commands.forEach(function(command) { m.commands.push(JSON.stringify(command)) })
    return result
  }
  m.wait = function(ms) { m.now += ms }
  m.event = function(object) {
    return take(PlayerState.onEvent(m.state, MpvProto.parse(JSON.stringify(object)), entryKind, m.now))
  }
  m.set = function(name, data) {
    return m.event(data === undefined ? { event: "property-change", name: name }
      : { event: "property-change", name: name, data: data })
  }
  m.answer = function(name, data) { return take(PlayerState.onProperty(m.state, name, data, m.now)) }
  m.seekTo = function(seconds) { return take(PlayerState.onLocalSeek(m.state, seconds, m.now)) }
  m.stopNow = function() { return take(PlayerState.onLocalStop(m.state, m.now)) }
  m.position = function() { return PlayerState.positionNow(m.state, m.now) }
  // A file of ours from start to playing, as the traces show it.
  m.play = function(entry, duration) {
    m.event({ event: "start-file", playlist_entry_id: entry })
    m.set("idle-active", false)
    m.event({ event: "file-loaded" })
    if (duration !== undefined) m.set("duration", duration)
    m.event({ event: "playback-restart" })
    m.set("core-idle", false)
  }
  return m
}

function ours(count) {
  var entries = {}
  for (var id = 1; id <= count; id++) entries[id] = { key: id, dead: false, live: false }
  return entries
}

// ---- The recorded traces ----

test("exports exactly the documented functions", function() {
  assert.deepStrictEqual(Object.keys(PlayerState).sort(),
    ["initial", "keysAfterLoad", "keysAfterRemove", "keysOf", "onEvent", "onLocalSeek", "onLocalStop",
      "onProperty", "positionNow"])
})

test("the fixture holds every required trace, and each trace has its expectation", function() {
  var recorded = Object.keys(fixture.traces)
  REQUIRED.forEach(function(name) {
    assert.ok(recorded.indexOf(name) !== -1, name)
  })
  assert.deepStrictEqual(recorded.slice().sort(), Object.keys(EXPECTED).sort())
  recorded.forEach(function(name) {
    assert.ok(/^[a-z_]+$/.test(name), name)
    var trace = fixture.traces[name]
    assert.ok(Array.isArray(trace) && trace.length > 20, name)
    var last = -1
    trace.forEach(function(record) {
      var kinds = ["send", "recv", "other"].filter(function(kind) { return record[kind] !== undefined })
      assert.strictEqual(kinds.length, 1, name)
      assert.ok(Number.isInteger(record.t) && record.t >= last, name)
      last = record.t
    })
  })
})

Object.keys(EXPECTED).forEach(function(name) {
  test("trace " + name + ": " + EXPECTED[name].slice(1).join(", "), function() {
    assert.deepStrictEqual(replay(fixture.traces[name]).signals, EXPECTED[name])
  })
})

test("each trace ends with the signals expected of it", function() {
  var rows = {
    replace: ["loading 1", "started 1", "loading 2", "started 2"],
    three_replaces: ["loading 1", "started 1", "loading 4", "started 4"],
    playlist_next: ["loading 2", "started 2"],
    playlist_prev: ["loading 1", "started 1"],
    stop: ["idle"],
    eof_with_next: ["ended 1 eof", "loading 2", "started 2"],
    eof_last: ["ended 1 eof", "idle"],
    error_with_next: ["ended 1 error loading failed", "loading 2", "started 2"]
  }
  Object.keys(rows).forEach(function(name) {
    var signals = replay(fixture.traces[name]).signals
    assert.deepStrictEqual(signals.slice(-rows[name].length), rows[name], name)
  })
  // A replace and a step to a neighbour never look like an end or a stop.
  var steady = ["replace", "three_replaces", "three_replaces_apart", "playlist_next", "playlist_prev",
    "replace_while_paused", "stop_then_load"]
  steady.forEach(function(name) {
    var after = replay(fixture.traces[name]).signals.slice(1)
    assert.ok(after.every(function(signal) { return /^(loading|started) /.test(signal) }), name)
  })
})

test("the traces hold both outcomes of several loads in a row, and a load that was lost", function() {
  // Only the last of the three started ...
  assert.deepStrictEqual(startFiles(fixture.traces.three_replaces), [1, 4])
  // ... or mpv began to start an earlier one and dropped it again.
  var apart = startFiles(fixture.traces.three_replaces_apart)
  assert.strictEqual(apart[0], 1)
  assert.strictEqual(apart[apart.length - 1], 4)
  assert.ok(apart.length > 2 && apart.slice(1, -1).every(function(id) { return id === 2 || id === 3 }))
  // Our load got its reply (entry 1) and never a start-file.
  var lost = fixture.traces.lost_load
  assert.ok(lost.some(function(record) { return record.recv && MpvProto.entryId(record.recv.data) === 1 }))
  assert.deepStrictEqual(startFiles(lost), [2])
  // mpv answers every load before it reports anything about any of them.
  Object.keys(fixture.traces).forEach(function(name) {
    var trace = fixture.traces[name]
    var entry = 0
    trace.forEach(function(record) {
      if (record.recv === undefined) return
      entry = Math.max(entry, MpvProto.entryId(record.recv.data))
      var id = record.recv.playlist_entry_id
      if (id === undefined || name === "foreign_load" || name === "lost_load") return
      assert.ok(id <= entry, name + ": entry " + id + " before its reply")
    })
  })
})

test("what the reducer asks for is what the recording sent next", function() {
  Object.keys(EXPECTED).forEach(function(name) {
    var trace = fixture.traces[name]
    var run = replay(trace)
    var expected = ANSWERS[name] || []
    assert.deepStrictEqual(run.answers.map(function(answer) { return answer.command }), expected, name)
    run.answers.forEach(function(answer) {
      var sends = trace.slice(answer.index + 1).filter(function(record) { return record.send !== undefined })
      assert.deepStrictEqual(sends[0].send, answer.command, name)
    })
    var starts = EXPECTED[name].filter(function(signal) { return /^started /.test(signal) }).length
    assert.strictEqual(run.started, starts, name)
  })
})

test("a foreign file is answered with a stop at its start-file", function() {
  var names = ["foreign_load", "lost_load"]
  names.forEach(function(name) {
    var trace = fixture.traces[name]
    var answer = replay(trace).answers[0]
    assert.strictEqual(trace[answer.index].recv.event, "start-file", name)
    assert.strictEqual(trace[answer.index].recv.playlist_entry_id, 2, name)
    // The file was another client's: its load is in the trace as "other".
    assert.ok(trace.slice(0, answer.index).some(function(record) {
      return record.other !== undefined && record.other[0] === "loadfile"
    }), name)
  })
})

test("the phases a cold start, a pause, a seek and a stop go through", function() {
  // mpv calls its core idle for a moment at every start, resume, seek and
  // end, so a track passes through buffering there. Where exactly that
  // report falls between the other lines differs from run to run; with
  // those moments left out, the phases are always these.
  var calm = function(name) {
    var phases = replay(fixture.traces[name]).phases.filter(function(phase) { return phase !== "buffering" })
    return phases.filter(function(phase, i) { return i === 0 || phases[i - 1] !== phase })
  }
  assert.deepStrictEqual(calm("cold_load"), ["idle", "loading", "playing"])
  assert.deepStrictEqual(calm("pause_resume"), ["idle", "loading", "playing", "paused", "playing"])
  assert.deepStrictEqual(calm("seek"), ["idle", "loading", "playing"])
  assert.deepStrictEqual(calm("stop"), ["idle", "loading", "playing", "idle"])
  assert.deepStrictEqual(calm("replace"), ["idle", "loading", "playing", "idle", "loading", "playing"])
  // With the pause reset on every new file, a load made while paused plays.
  assert.deepStrictEqual(calm("replace_while_paused"),
    ["idle", "loading", "playing", "paused", "idle", "loading", "playing"])
  // A file starts while mpv's core still counts as idle.
  var cold = replay(fixture.traces.cold_load).phases
  assert.deepStrictEqual(cold.slice(0, 2), ["idle", "loading"])
  assert.strictEqual(cold[cold.length - 1], "playing")
})

test("the estimated position stays with what mpv reports", function() {
  var names = ["pause_resume", "seek", "position_watch"]
  var samples = 0
  names.forEach(function(name) {
    replay(fixture.traces[name]).positions.forEach(function(position) {
      samples++
      assert.ok(Math.abs(position.estimate - position.actual) < 0.1,
        name + ": estimated " + position.estimate + ", mpv says " + position.actual)
    })
  })
  assert.ok(samples >= 5)
  // A file started close to its end: the first answer puts the position
  // there, and the end that follows is not taken for a broken connection.
  var near = replay(fixture.traces.start_near_end).positions
  assert.strictEqual(near.length, 1)
  assert.ok(near[0].estimate < 0.1)
  assert.ok(near[0].actual > 10.9 && near[0].actual < 11.1)
})

test("after the last line of each trace the state is what mpv was left in", function() {
  var idle = ["stop", "eof_last", "error_last", "error_not_media", "error_no_data", "seek_past_end",
    "start_near_end", "external_stop", "foreign_load", "lost_load", "play_index_past_end"]
  Object.keys(EXPECTED).forEach(function(name) {
    var state = replay(fixture.traces[name]).state
    if (idle.indexOf(name) !== -1) {
      assert.strictEqual(state.phase, "idle", name)
      assert.strictEqual(state.idleActive, true, name)
      assert.strictEqual(state.duration, 0, name)
    } else {
      // The quit ends the file with a reason that is not reported and that
      // leaves the track current: nothing comes after it.
      assert.ok(state.key > 0, name)
      assert.strictEqual(state.idleActive, false, name)
      assert.strictEqual(state.duration, ENDS_LONG.indexOf(name) !== -1 ? 12 : 3, name)
    }
    assert.strictEqual(state.volume, name === "external_volume_speed" ? 100 : 70, name)
    assert.strictEqual(state.mute, false, name)
  })
})

// ---- The state itself ----

test("the initial state", function() {
  assert.deepStrictEqual(PlayerState.initial(), {
    phase: "idle", key: 0, entry: 0, started: false, live: false, pause: false, coreIdle: true,
    idleActive: true, duration: 0, posBase: 0, posAt: 0, seeking: false, posKnown: false, volume: 0,
    mute: false
  })
  assert.notStrictEqual(PlayerState.initial(), PlayerState.initial())
})

test("no function changes the state it is given", function() {
  var m = machine(ours(2))
  m.play(1, 213)
  var frozen = Object.freeze(copy(m.state))
  var before = copy(frozen)
  PlayerState.onProperty(frozen, "pause", true, 5000)
  PlayerState.onProperty(frozen, "idle-active", true, 5000)
  PlayerState.onProperty(frozen, "time-pos", 12, 5000)
  PlayerState.onProperty(frozen, "volume", 150, 5000)
  PlayerState.onEvent(frozen, MpvProto.parse("{\"event\":\"start-file\",\"playlist_entry_id\":2}"),
    function() { return { key: 2, dead: false } }, 5000)
  var end = MpvProto.parse(JSON.stringify({ event: "end-file", reason: "eof", playlist_entry_id: 1 }))
  assert.deepStrictEqual(PlayerState.onEvent(frozen, end, null, 5000).signals.length, 1)
  PlayerState.onLocalSeek(frozen, 50, 5000)
  PlayerState.onLocalStop(frozen, 5000)
  PlayerState.positionNow(frozen, 5000)
  assert.deepStrictEqual(frozen, before)
})

test("what the reducer does not know changes nothing", function() {
  var m = machine(ours(1))
  m.play(1, 213)
  var before = copy(m.state)
  var events = [
    { event: "file-loaded" }, { event: "audio-reconfig" }, { event: "video-reconfig" }, { event: "idle" },
    { event: "tracks-changed" }, { event: "log-message", text: "x" }, { event: "shutdown" },
    { event: "constructor" }, { event: "__proto__" }, { event: "property-change", name: "path", data: "/x" },
    { event: "property-change", name: "media-title", data: "A title" },
    { event: "property-change", name: "constructor", data: true },
    { event: "property-change", name: "playlist-pos", data: 0 }, { event: "property-change" },
    { event: "client-message", args: ["something-else"] }, { event: "client-message" },
    { event: "end-file", reason: "quit", playlist_entry_id: 1 },
    { event: "end-file", reason: "redirect", playlist_entry_id: 1 },
    { event: "end-file", reason: "unknown", playlist_entry_id: 1 },
    { event: "end-file", playlist_entry_id: 1 },
    { event: "end-file", reason: "eof" }, { event: "end-file", reason: "eof", playlist_entry_id: 9 }
  ]
  events.forEach(function(event) {
    var result = m.event(event)
    assert.deepStrictEqual(result.signals, [], JSON.stringify(event))
    assert.deepStrictEqual(result.commands, [], JSON.stringify(event))
    assert.deepStrictEqual(m.state, before, JSON.stringify(event))
  })
  // An end-file without an entry number ends nothing, not even nothing.
  var idle = PlayerState.initial()
  var nameless = [
    { event: "end-file", reason: "eof" }, { event: "end-file", reason: "error" },
    { event: "end-file", reason: "eof", playlist_entry_id: 0 }, { event: "playback-restart" },
    { event: "seek" }
  ]
  nameless.forEach(function(event) {
    var result = PlayerState.onEvent(idle, event, function() { return { key: 1 } }, 1000)
    assert.deepStrictEqual(result, { state: idle, signals: [], commands: [] }, JSON.stringify(event))
  })
  // Something that is not an event at all.
  var odd = [null, undefined, 5, "start-file", [], {}, { event: 5 }, { name: "pause", data: true }]
  odd.forEach(function(value) {
    var result = PlayerState.onEvent(m.state, value, function() { return { key: 1 } }, m.now)
    assert.deepStrictEqual(result, { state: before, signals: [], commands: [] })
  })
})

test("a property of the wrong type is ignored", function() {
  var wrong = {
    "idle-active": ["yes", 1, 0, null, undefined, {}],
    "pause": ["yes", 1, 0, null, undefined, []],
    "core-idle": ["no", 1, null, undefined],
    "time-pos": ["12", -1, NaN, Infinity, null, undefined, true, [12]],
    "volume": ["70", NaN, Infinity, null, undefined, true, {}],
    "mute": ["yes", 1, null, undefined],
    "speed": ["2", NaN, Infinity, null, undefined, true]
  }
  Object.keys(wrong).forEach(function(name) {
    wrong[name].forEach(function(data) {
      var m = machine(ours(1))
      m.play(1, 213)
      m.answer("time-pos", 10)
      m.set("volume", 70)
      var before = copy(m.state)
      var result = m.answer(name, data)
      assert.deepStrictEqual(m.state, before, name + " " + String(data))
      assert.deepStrictEqual(result.signals, [])
      assert.deepStrictEqual(result.commands, [])
    })
  })
})

// ---- Tracks: start, end, and whose file it is ----

test("a file of ours: loading at its start-file, started at its first playback-restart", function() {
  var m = machine(ours(1))
  m.set("idle-active", true)
  assert.deepStrictEqual(m.signals, ["idle"])
  m.event({ event: "start-file", playlist_entry_id: 1 })
  assert.deepStrictEqual(m.signals, ["idle", "loading 1"])
  assert.strictEqual(m.state.phase, "loading")
  assert.strictEqual(m.state.key, 1)
  m.set("idle-active", false)
  m.event({ event: "file-loaded" })
  m.set("duration", 213.5)
  assert.strictEqual(m.state.phase, "loading")
  assert.strictEqual(m.state.duration, 213.5)
  m.event({ event: "playback-restart" })
  assert.deepStrictEqual(m.signals, ["idle", "loading 1", "started 1"])
  assert.deepStrictEqual(m.last.commands, [["get_property", "time-pos"]])
  // Only the first one starts the track. Later ones follow seeks.
  m.set("core-idle", false)
  m.event({ event: "playback-restart" })
  m.event({ event: "playback-restart" })
  assert.deepStrictEqual(m.signals, ["idle", "loading 1", "started 1"])
  assert.strictEqual(m.state.phase, "playing")
})

test("a start-file resets what belonged to the file before", function() {
  var m = machine({ 1: { key: 1, dead: false, live: false }, 2: { key: 2, dead: false, live: true } })
  m.play(1, 213)
  m.answer("time-pos", 100)
  assert.strictEqual(m.state.posKnown, true)
  // Even without an end-file for the track before.
  m.event({ event: "start-file", playlist_entry_id: 2 })
  assert.strictEqual(m.state.key, 2)
  assert.strictEqual(m.state.entry, 2)
  assert.strictEqual(m.state.phase, "loading")
  assert.strictEqual(m.state.started, false)
  assert.strictEqual(m.state.live, true)
  assert.strictEqual(m.state.duration, 0)
  assert.strictEqual(m.state.posBase, 0)
  assert.strictEqual(m.state.seeking, false)
  assert.strictEqual(m.state.posKnown, false)
  assert.strictEqual(m.position(), 0)
  // A seek that was on its way belongs to the old file too.
  var s = machine(ours(2))
  s.play(1, 213)
  s.seekTo(150)
  s.event({ event: "start-file", playlist_entry_id: 2 })
  assert.strictEqual(s.state.seeking, false)
  assert.strictEqual(s.position(), 0)
})

test("the time a file took to load is not counted as played", function() {
  var m = machine(ours(1))
  m.event({ event: "start-file", playlist_entry_id: 1 })
  m.set("core-idle", false)
  m.wait(2000)
  m.event({ event: "playback-restart" })
  assert.strictEqual(m.state.phase, "playing")
  assert.strictEqual(m.position(), 0)
  m.wait(1000)
  assert.strictEqual(m.position(), 1)
})

test("an unknown entry is never adopted: the answer is a stop and no signal", function() {
  var kinds = [
    function() { return { key: 0, dead: false } },
    function() { return {} },
    function() { return null },
    function() { return undefined },
    function() { return "1" },
    function() { return { key: "1" } },
    function() { return { key: -1 } },
    function() { return { key: 1.5 } },
    function() { return { key: NaN, dead: "yes" } },
    null, undefined, 5, { key: 1 }
  ]
  var start = MpvProto.parse("{\"event\":\"start-file\",\"playlist_entry_id\":7}")
  kinds.forEach(function(kind, i) {
    var state = PlayerState.initial()
    var result = PlayerState.onEvent(state, start, kind, 1000)
    assert.deepStrictEqual(result.commands, [["stop"]], "kind " + i)
    assert.deepStrictEqual(result.signals, [], "kind " + i)
    assert.deepStrictEqual(result.state, state, "kind " + i)
  })
  // A start-file without a usable entry id is nobody's.
  var nameless = [{ event: "start-file" }, { event: "start-file", playlist_entry_id: 0 },
    { event: "start-file", playlist_entry_id: "1" }, { event: "start-file", playlist_entry_id: 1.5 }]
  nameless.forEach(function(event) {
    var called = 0
    var kind = function() {
      called++
      return { key: 1 }
    }
    var result = PlayerState.onEvent(PlayerState.initial(), event, kind, 0)
    assert.deepStrictEqual(result.commands, [["stop"]], JSON.stringify(event))
    assert.deepStrictEqual(result.signals, [])
    assert.strictEqual(called, 0)
  })
})

test("what a foreign file does before the stop lands is not reported", function() {
  var m = machine(ours(1))
  m.play(1, 213)
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 1 })
  m.event({ event: "start-file", playlist_entry_id: 2 })
  assert.deepStrictEqual(m.last.commands, [["stop"]])
  var signals = m.signals.slice()
  // mpv got as far as playing it.
  m.event({ event: "file-loaded" })
  m.set("duration", 4000)
  m.event({ event: "playback-restart" })
  m.set("core-idle", false)
  m.set("pause", true)
  m.event({ event: "seek" })
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 2 })
  m.event({ event: "end-file", reason: "error", playlist_entry_id: 2, file_error: "loading failed" })
  assert.deepStrictEqual(m.signals, signals)
  assert.strictEqual(m.state.phase, "idle")
  assert.strictEqual(m.state.key, 0)
  assert.strictEqual(m.state.duration, 0)
  assert.strictEqual(m.state.started, false)
  m.set("idle-active", true)
  assert.deepStrictEqual(m.signals, signals.concat(["idle"]))
})

test("a dead entry is ignored, and its lines are not taken for news about another track", function() {
  var entries = { 1: { key: 1, dead: false } }
  var m = machine(entries)
  m.event({ event: "start-file", playlist_entry_id: 1 })
  m.set("idle-active", false)
  assert.deepStrictEqual(m.signals, ["loading 1"])
  // Two more loads were answered before mpv reports anything: entry 3 is
  // the track now, and the player's table calls both older entries dead,
  // the one that is still loading included.
  entries[1] = { key: 0, dead: true }
  entries[2] = { key: 0, dead: true }
  entries[3] = { key: 3, dead: false }
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 1 })
  assert.strictEqual(m.state.key, 0, "the replaced track is over at its end-file")
  assert.strictEqual(m.state.phase, "idle")
  // mpv begins to start entry 2 and drops it.
  var dead = m.event({ event: "start-file", playlist_entry_id: 2 })
  assert.deepStrictEqual(dead.commands, [])
  m.event({ event: "file-loaded" })
  m.set("duration", 99)
  m.event({ event: "playback-restart" })
  m.set("core-idle", false)
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 2 })
  assert.deepStrictEqual(m.signals, ["loading 1"], "no started for the track that was replaced")
  assert.deepStrictEqual(m.commands, [])
  assert.strictEqual(m.state.duration, 0)
  m.event({ event: "start-file", playlist_entry_id: 3 })
  m.event({ event: "playback-restart" })
  assert.deepStrictEqual(m.signals, ["loading 1", "loading 3", "started 3"])
})

test("an entry mpv ends with stop is not reported, and can start again", function() {
  var m = machine(ours(2))
  m.play(1, 213)
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 1 })
  assert.deepStrictEqual(m.signals, ["loading 1", "started 1"])
  assert.strictEqual(m.state.key, 0)
  assert.strictEqual(m.state.phase, "idle")
  m.play(2, 100)
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 2 })
  // Previous on a media key: mpv starts the finished entry once more.
  m.play(1, 213)
  assert.deepStrictEqual(m.signals,
    ["loading 1", "started 1", "loading 2", "started 2", "loading 1", "started 1"])
})

test("an end is reported only for the current track", function() {
  var m = machine(ours(2))
  m.play(1, 213)
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 1 })
  m.play(2, 100)
  var signals = m.signals.slice()
  // The old track of a replace may still end by itself.
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  m.event({ event: "end-file", reason: "error", playlist_entry_id: 1, file_error: "loading failed" })
  assert.deepStrictEqual(m.signals, signals)
  assert.strictEqual(m.state.key, 2)
  assert.strictEqual(m.state.phase, "playing")
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 2 })
  assert.deepStrictEqual(m.signals, signals.concat(["ended 2 eof"]))
  // And only once.
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 2 })
  assert.deepStrictEqual(m.signals, signals.concat(["ended 2 eof"]))
})

test("an error end carries mpv's reason, or none", function() {
  var reasons = [
    ["no audio or video data played", "no audio or video data played"], ["loading failed", "loading failed"],
    ["unrecognized file format", "unrecognized file format"], [undefined, ""], [5, ""], ["a\nb", ""],
    ["x".repeat(129), ""]
  ]
  reasons.forEach(function(pair) {
    var m = machine(ours(1))
    m.event({ event: "start-file", playlist_entry_id: 1 })
    m.event({ event: "end-file", reason: "error", playlist_entry_id: 1, file_error: pair[0] })
    assert.deepStrictEqual(m.last.signals, [{ name: "ended", args: [1, "error", pair[1]] }])
    assert.strictEqual(m.state.phase, "idle")
  })
})

test("the position of a track that ends stays where it ended", function() {
  var m = machine(ours(1))
  m.play(1, 213)
  m.answer("time-pos", 10)
  m.wait(2000)
  m.event({ event: "end-file", reason: "error", playlist_entry_id: 1, file_error: "loading failed" })
  assert.strictEqual(m.position(), 12)
  m.wait(5000)
  assert.strictEqual(m.position(), 12)
  m.set("idle-active", true)
  assert.strictEqual(m.position(), 12)
})

test("mpv going idle is reported every time it says so", function() {
  var m = machine(ours(1))
  m.set("idle-active", true)
  m.set("idle-active", true)
  assert.deepStrictEqual(m.signals, ["idle", "idle"])
  m.set("idle-active", false)
  assert.deepStrictEqual(m.signals, ["idle", "idle"])
  assert.strictEqual(m.state.idleActive, false)
  m.play(1, 213)
  m.set("idle-active", true)
  assert.deepStrictEqual(m.signals, ["idle", "idle", "loading 1", "started 1", "idle"])
  assert.strictEqual(m.state.phase, "idle")
  assert.strictEqual(m.state.key, 0)
  assert.strictEqual(m.state.started, false)
})

test("the message of the closed video window, and only that one", function() {
  var m = machine(ours(1))
  m.event({ event: "client-message", args: ["omajuke-video-closed"] })
  assert.deepStrictEqual(m.signals, ["videoClosed"])
  var others = [
    [], ["omajuke-video-closed", "x"], ["x", "omajuke-video-closed"], ["omajuke-video-closed "],
    ["OMAJUKE-VIDEO-CLOSED"], ["omajuke"], [["omajuke-video-closed"]], "omajuke-video-closed"
  ]
  others.forEach(function(args) {
    m.event({ event: "client-message", args: args })
  })
  assert.deepStrictEqual(m.signals, ["videoClosed"])
  assert.strictEqual(MpvProto.VIDEO_CLOSED, "omajuke-video-closed")
})

// ---- Phases ----

test("pause and core-idle decide the phase of a started track only", function() {
  var m = machine(ours(1))
  m.event({ event: "start-file", playlist_entry_id: 1 })
  m.set("pause", true)
  m.set("core-idle", false)
  m.set("core-idle", true)
  assert.strictEqual(m.state.phase, "loading")
  assert.deepStrictEqual(m.commands, [])
  m.set("pause", false)
  m.event({ event: "playback-restart" })
  assert.strictEqual(m.state.phase, "buffering")
  m.set("core-idle", false)
  assert.strictEqual(m.state.phase, "playing")
  m.set("pause", true)
  assert.strictEqual(m.state.phase, "paused")
  m.set("core-idle", true)
  assert.strictEqual(m.state.phase, "paused")
  m.set("pause", false)
  assert.strictEqual(m.state.phase, "buffering")
  m.set("core-idle", false)
  assert.strictEqual(m.state.phase, "playing")
  // A file that starts paused.
  var p = machine(ours(1))
  p.set("pause", true)
  p.event({ event: "start-file", playlist_entry_id: 1 })
  p.event({ event: "playback-restart" })
  assert.strictEqual(p.state.phase, "paused")
  assert.deepStrictEqual(p.signals, ["loading 1", "started 1"])
})

test("every change of phase asks mpv where it is, and nothing else does", function() {
  var m = machine(ours(1))
  m.play(1, 213)
  var asked = m.commands.length
  assert.strictEqual(asked, 2, "at the start, and when the core stopped being idle")
  m.set("pause", true)
  assert.strictEqual(m.commands.length, asked + 1)
  m.set("pause", true)
  m.set("core-idle", true)
  m.set("mute", true)
  m.set("duration", 213)
  m.set("volume", 50)
  assert.strictEqual(m.commands.length, asked + 1)
  m.set("pause", false)
  m.set("core-idle", false)
  assert.strictEqual(m.commands.length, asked + 3)
  m.commands.forEach(function(command) {
    assert.strictEqual(command, ASK_POSITION)
  })
})

// ---- Position ----

test("the position moves only while playing, at real time, and stops at the end", function() {
  var m = machine(ours(1))
  m.play(1, 20)
  m.answer("time-pos", 10)
  assert.strictEqual(m.position(), 10)
  m.wait(2500)
  assert.strictEqual(m.position(), 12.5)
  m.wait(60000)
  assert.strictEqual(m.position(), 20)
  // A clock that jumps back does not move the position back.
  assert.strictEqual(PlayerState.positionNow(m.state, m.state.posAt - 5000), 10)
  assert.strictEqual(PlayerState.positionNow(m.state, NaN), 10)
  assert.strictEqual(PlayerState.positionNow(m.state, undefined), 10)
  // Without a known length there is no end to stop at.
  var open = machine(ours(1))
  open.play(1)
  open.wait(3600000)
  assert.strictEqual(open.position(), 3600)
})

test("the position is carried through a pause and through buffering", function() {
  var m = machine(ours(1))
  m.play(1, 213)
  m.answer("time-pos", 10)
  m.wait(2000)
  m.set("pause", true)
  assert.strictEqual(m.position(), 12)
  m.wait(60000)
  assert.strictEqual(m.position(), 12)
  m.set("pause", false)
  m.set("core-idle", true)
  m.wait(5000)
  assert.strictEqual(m.position(), 12, "nothing moves while mpv waits for data")
  m.set("core-idle", false)
  m.wait(1000)
  assert.strictEqual(m.position(), 13)
  m.answer("time-pos", 13.25)
  assert.strictEqual(m.position(), 13.25)
})

test("our own seek moves the position at once, and an older report does not pull it back", function() {
  var m = machine(ours(1))
  m.play(1, 213)
  m.answer("time-pos", 10)
  m.seekTo(150)
  assert.strictEqual(m.position(), 150)
  assert.strictEqual(m.state.seeking, true)
  // Reports from before the seek landed.
  m.set("time-pos", 10.1)
  m.answer("time-pos", 10.2)
  assert.strictEqual(m.position(), 150)
  m.event({ event: "seek" })
  m.set("core-idle", true)
  m.event({ event: "playback-restart" })
  assert.strictEqual(m.state.seeking, false)
  assert.deepStrictEqual(m.last.commands, [["get_property", "time-pos"]])
  m.set("core-idle", false)
  m.answer("time-pos", 150.02)
  assert.strictEqual(m.position(), 150.02)
  assert.deepStrictEqual(m.signals, ["loading 1", "started 1"], "a seek starts nothing")
})

test("a seek somebody else made: the position is unknown until mpv has carried it out", function() {
  var m = machine(ours(1))
  m.play(1, 213)
  m.answer("time-pos", 10)
  m.event({ event: "seek" })
  assert.strictEqual(m.state.seeking, true)
  assert.strictEqual(m.state.posKnown, false)
  // A report from before the seek landed.
  m.set("time-pos", 10.1)
  assert.strictEqual(m.state.posBase, 10)
  assert.strictEqual(m.state.posKnown, false)
  m.event({ event: "playback-restart" })
  assert.strictEqual(m.state.seeking, false)
  assert.strictEqual(m.state.posKnown, false)
  m.answer("time-pos", 180)
  assert.strictEqual(m.position(), 180)
  assert.strictEqual(m.state.posKnown, true)
  // A seek event without a track is nothing.
  var idle = machine(ours(1))
  idle.event({ event: "seek" })
  assert.strictEqual(idle.state.seeking, false)
})

test("a seek is refused where there is nothing to seek in", function() {
  var idle = PlayerState.initial()
  assert.deepStrictEqual(PlayerState.onLocalSeek(idle, 50, 1000), { state: idle, signals: [], commands: [] })
  var m = machine(ours(1))
  m.play(1, 213)
  m.answer("time-pos", 10)
  var before = copy(m.state)
  var targets = [-1, NaN, Infinity, "50", null, undefined]
  targets.forEach(function(target) {
    m.seekTo(target)
    assert.deepStrictEqual(m.state, before, String(target))
  })
  m.seekTo(0)
  assert.strictEqual(m.position(), 0)
})

test("our own stop: no track from that moment, nothing signalled, nothing asked", function() {
  var m = machine(ours(2))
  m.play(1, 213)
  m.answer("time-pos", 10)
  m.wait(2000)
  var result = m.stopNow()
  assert.deepStrictEqual(result.signals, [])
  assert.deepStrictEqual(result.commands, [])
  assert.deepStrictEqual(
    [m.state.phase, m.state.key, m.state.entry, m.state.started, m.state.seeking, m.state.posKnown],
    ["idle", 0, 0, false, false, false])
  // The length goes with the track; where it stopped stays readable.
  assert.strictEqual(m.state.duration, 0)
  assert.strictEqual(m.position(), 12)
  m.wait(5000)
  assert.strictEqual(m.position(), 12)
  // What mpv holds itself is still what mpv last said.
  assert.deepStrictEqual([m.state.pause, m.state.coreIdle, m.state.idleActive], [false, false, false])
})

test("after our own stop the stopped file's last lines are not reported", function() {
  var m = machine(ours(2))
  m.play(1, 213)
  m.signals.length = 0
  m.stopNow()
  // What mpv sends for a stop it carries out afterwards.
  m.set("core-idle", true)
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 1 })
  m.event({ event: "playback-restart" })
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  m.event({ event: "end-file", reason: "error", playlist_entry_id: 1, file_error: "loading failed" })
  assert.deepStrictEqual(m.signals, [])
  assert.strictEqual(m.state.phase, "idle")
  m.set("idle-active", true)
  assert.deepStrictEqual(m.signals, ["idle"])
  // A track that is started afterwards is reported as any other.
  m.play(2, 100)
  assert.deepStrictEqual(m.signals, ["idle", "loading 2", "started 2"])
})

test("our own stop with nothing playing changes nothing but the position's clock", function() {
  var idle = PlayerState.initial()
  var result = PlayerState.onLocalStop(idle, 1000)
  assert.deepStrictEqual(result.signals, [])
  assert.deepStrictEqual(result.commands, [])
  var expected = copy(idle)
  expected.posAt = 1000
  assert.deepStrictEqual(result.state, expected)
  // A clock that cannot be read leaves that alone as well.
  assert.deepStrictEqual(PlayerState.onLocalStop(idle, NaN).state, idle)
})

test("the position of a track that is not there is not taken", function() {
  var m = machine(ours(1))
  m.answer("time-pos", 55)
  assert.strictEqual(m.state.posBase, 0)
  m.play(1, 213)
  m.event({ event: "end-file", reason: "stop", playlist_entry_id: 1 })
  // The answer to a question asked while the old track still played.
  m.answer("time-pos", 55)
  assert.strictEqual(m.state.posBase, 0.0)
  assert.strictEqual(m.state.posKnown, false)
})

// ---- The end of a file: normal, or a broken connection ----

test("a file that ends long before its end broke off", function() {
  var m = machine(ours(1))
  m.play(1, 600)
  m.answer("time-pos", 10)
  m.wait(3500)
  // What a dead connection looks like: the core waits, then the file ends.
  m.set("core-idle", true)
  m.wait(40000)
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(m.last.signals, [{ name: "ended", args: [1, "error", "premature-eof"] }])
  assert.strictEqual(m.state.phase, "idle")
  // The position stays where the track broke off: a retry resumes there.
  assert.strictEqual(m.position(), 13.5)
})

test("the last five seconds count as the end", function() {
  var cases = [[594.9, "ended 1 error premature-eof"], [595, "ended 1 eof"], [599, "ended 1 eof"],
    [600, "ended 1 eof"], [0, "ended 1 error premature-eof"]]
  cases.forEach(function(pair) {
    var m = machine(ours(1))
    m.play(1, 600)
    m.answer("time-pos", pair[0])
    m.set("pause", true)
    m.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
    assert.deepStrictEqual(m.signals.slice(-1), [pair[1]], String(pair[0]))
  })
  // A track of five seconds or less cannot break off by this rule.
  var short = machine(ours(1))
  short.play(1, 5)
  short.answer("time-pos", 0)
  short.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(short.signals.slice(-1), ["ended 1 eof"])
})

test("an end behind a seek, or before mpv told the position, is a normal end", function() {
  // Our own seek is still on its way.
  var seeking = machine(ours(1))
  seeking.play(1, 600)
  seeking.answer("time-pos", 10)
  seeking.seekTo(300)
  seeking.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(seeking.signals.slice(-1), ["ended 1 eof"])
  // Somebody else sought to the end: seek, restart and end arrive together.
  var foreign = machine(ours(1))
  foreign.play(1, 600)
  foreign.answer("time-pos", 10)
  foreign.event({ event: "seek" })
  foreign.event({ event: "playback-restart" })
  foreign.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(foreign.signals.slice(-1), ["ended 1 eof"])
  // A file that was started near its end and ends before the first answer.
  var resumed = machine(ours(1))
  resumed.play(1, 600)
  resumed.wait(400)
  resumed.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(resumed.signals.slice(-1), ["ended 1 eof"])
  // Once the position is known again the rule is back.
  var known = machine(ours(1))
  known.play(1, 600)
  known.event({ event: "seek" })
  known.event({ event: "playback-restart" })
  known.answer("time-pos", 300)
  known.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(known.signals.slice(-1), ["ended 1 error premature-eof"])
})

test("the recorded seek past the end would be a broken connection by position alone", function() {
  // This is the trace the rule above exists for: when the file ends, the
  // position last known is a fraction of a second into twelve seconds, and
  // the end follows the seek faster than any question could be answered.
  var trace = fixture.traces.seek_past_end
  var at = function(test) {
    return trace.filter(function(record) { return record.recv !== undefined && test(record.recv) })
  }
  var end = at(function(line) { return line.event === "end-file" && line.reason === "eof" })[0]
  var seek = at(function(line) { return line.event === "seek" })[0]
  var start = at(function(line) { return line.event === "playback-restart" })[0]
  assert.ok(at(function(line) { return line.name === "duration" && line.data === 12 }).length === 1)
  assert.ok(seek.t > start.t && end.t >= seek.t && end.t - seek.t < 100)
  assert.ok((end.t - start.t) / 1000 < 12 - 5)
  // With the position taken on trust, the same lines read as an error.
  var m = machine(ours(1))
  m.play(1, 12)
  m.answer("time-pos", 0.16)
  m.event({ event: "seek" })
  m.event({ event: "playback-restart" })
  m.state.posKnown = true
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(m.signals.slice(-1), ["ended 1 error premature-eof"])
})

// ---- Length, live streams, volume, speed ----

test("the length is what mpv says, within bounds, and nothing without a track", function() {
  var m = machine(ours(1))
  m.set("duration", 213)
  assert.strictEqual(m.state.duration, 0, "no track yet")
  m.play(1)
  var cases = [
    [213.5, 213.5], [0, 0], [-5, 0], [NaN, 0], [Infinity, 0], ["213", 0], [null, 0], [undefined, 0],
    [172800, 172800], [1e9, 172800], [0.001, 0.001]
  ]
  cases.forEach(function(pair) {
    m.set("duration", 77)
    m.set("duration", pair[0])
    assert.strictEqual(m.state.duration, pair[1], String(pair[0]))
  })
})

test("a live stream has no length, however often mpv reports one", function() {
  var m = machine({ 1: { key: 1, dead: false, live: true } })
  m.play(1)
  assert.strictEqual(m.state.live, true)
  var estimates = [7.37, 7.83, 8.3, 8.76, 9.23, 9.92, 4000]
  estimates.forEach(function(estimate) {
    m.set("duration", estimate)
    assert.strictEqual(m.state.duration, 0)
  })
  // No length means no end to cap the position at, and no "too early".
  m.answer("time-pos", 13.5)
  m.wait(600000)
  assert.strictEqual(m.position(), 613.5)
  m.event({ event: "end-file", reason: "eof", playlist_entry_id: 1 })
  assert.deepStrictEqual(m.signals, ["loading 1", "started 1", "ended 1 eof"])
  assert.deepStrictEqual(m.commands.filter(function(command) { return command !== ASK_POSITION }), [])
})

test("a volume from outside is clamped in the state and sent back clamped", function() {
  var cases = [
    [150, 100, [["set_property", "volume", 100]]], [100.5, 100, [["set_property", "volume", 100]]],
    [1e9, 100, [["set_property", "volume", 100]]], [-5, 0, [["set_property", "volume", 0]]],
    [-0.2, 0, [["set_property", "volume", 0]]], [100, 100, []], [0, 0, []], [70, 70, []], [69.5, 70, []],
    [33.3, 33, []]
  ]
  cases.forEach(function(triple) {
    var m = machine(ours(1))
    var result = m.set("volume", triple[0])
    assert.strictEqual(m.state.volume, triple[1], String(triple[0]))
    assert.deepStrictEqual(result.commands, triple[2], String(triple[0]))
    assert.deepStrictEqual(result.signals, [])
    // The value sent back is one mpv accepts without another correction.
    if (triple[2].length === 1) assert.deepStrictEqual(m.set("volume", triple[2][0][2]).commands, [])
  })
  var m = machine(ours(1))
  m.set("mute", true)
  assert.strictEqual(m.state.mute, true)
  m.set("mute", false)
  assert.strictEqual(m.state.mute, false)
})

test("any speed but 1 is set back", function() {
  var speeds = [2, 0.5, 1.0001, 100, 0, -1]
  speeds.forEach(function(speed) {
    var m = machine(ours(1))
    m.play(1, 213)
    var before = copy(m.state)
    var result = m.set("speed", speed)
    assert.deepStrictEqual(result.commands, [["set_property", "speed", 1]], String(speed))
    assert.deepStrictEqual(result.signals, [])
    assert.deepStrictEqual(m.state, before)
  })
  var m = machine(ours(1))
  assert.deepStrictEqual(m.set("speed", 1).commands, [])
})

// ---- mpv's playlist as track keys ----

test("a load changes the list of keys the way mpv will change its playlist", function() {
  assert.deepStrictEqual(PlayerState.keysAfterLoad([], 1, "replace", -1), [1])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2, 3], 4, "replace", -1), [4])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1], 2, "append-play", -1), [1, 2])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([], 2, "append-play"), [2])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], 3, "insert-at", 0), [3, 1, 2])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], 3, "insert-at", 1), [1, 3, 2])
  // Behind the end there is no entry to go in front of: mpv appends.
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], 3, "insert-at", 2), [1, 2, 3])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], 3, "insert-at", 9), [1, 2, 3])
  // An entry that is not ours keeps its slot.
  assert.deepStrictEqual(PlayerState.keysAfterLoad([0, 1], 3, "append-play", -1), [0, 1, 3])
  // What is not a load the player can make changes nothing.
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], 3, "append", -1), [1, 2])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], 0, "replace", -1), [1, 2])
  assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], "3", "append-play", -1), [1, 2])
  assert.deepStrictEqual(PlayerState.keysAfterLoad(null, 3, "append-play", -1), [3])
  var bad = [undefined, null, "1", -1, 1.5, NaN]
  bad.forEach(function(index) {
    assert.deepStrictEqual(PlayerState.keysAfterLoad([1, 2], 3, "insert-at", index), [1, 2, 3], String(index))
  })
})

test("a removal takes exactly one slot, and only one that is there", function() {
  assert.deepStrictEqual(PlayerState.keysAfterRemove([1, 2, 3], 0), [2, 3])
  assert.deepStrictEqual(PlayerState.keysAfterRemove([1, 2, 3], 1), [1, 3])
  assert.deepStrictEqual(PlayerState.keysAfterRemove([1, 2, 3], 2), [1, 2])
  assert.deepStrictEqual(PlayerState.keysAfterRemove([0, 0, 5], 1), [0, 5])
  var bad = [3, -1, 1.5, "1", NaN, null, undefined]
  bad.forEach(function(index) {
    assert.deepStrictEqual(PlayerState.keysAfterRemove([1, 2, 3], index), [1, 2, 3], String(index))
  })
  assert.deepStrictEqual(PlayerState.keysAfterRemove("123", 0), [])
  assert.deepStrictEqual(PlayerState.keysAfterRemove(undefined, 0), [])
})

test("the list functions return a new list and leave theirs alone", function() {
  var keys = [1, 2, 3]
  var results = [
    PlayerState.keysAfterLoad(keys, 4, "append-play", -1), PlayerState.keysAfterLoad(keys, 4, "insert-at", 0),
    PlayerState.keysAfterLoad(keys, 4, "replace", -1), PlayerState.keysAfterLoad(keys, 4, "append", -1),
    PlayerState.keysAfterRemove(keys, 1), PlayerState.keysAfterRemove(keys, 9)
  ]
  results.forEach(function(result) {
    assert.ok(Array.isArray(result))
    assert.notStrictEqual(result, keys)
  })
  assert.deepStrictEqual(keys, [1, 2, 3])
})

test("a reported playlist becomes one slot for each entry: its key, or 0 when it is not ours", function() {
  var kinds = { 4: { key: 9, dead: false, live: false }, 5: { key: 2, dead: false, live: true } }
  var entryKind = function(id) {
    return Object.prototype.hasOwnProperty.call(kinds, id) ? kinds[id] : { key: 0, dead: id < 4 }
  }
  assert.deepStrictEqual(PlayerState.keysOf([], entryKind), [])
  assert.deepStrictEqual(PlayerState.keysOf([4, 5], entryKind), [9, 2])
  // A dead entry (3), a foreign one (6) and one without a usable id (0)
  // keep their places, so that every position stays mpv's.
  assert.deepStrictEqual(PlayerState.keysOf([3, 4, 6, 0, 5], entryKind), [0, 9, 0, 0, 2])
  // A lookup that cannot be used adopts nothing.
  assert.deepStrictEqual(PlayerState.keysOf([4, 5], null), [0, 0])
  assert.deepStrictEqual(PlayerState.keysOf([4], function() { return { key: "9" } }), [0])
  assert.deepStrictEqual(PlayerState.keysOf([4], function() { return null }), [0])
  assert.deepStrictEqual(PlayerState.keysOf("45", entryKind), [])
  assert.deepStrictEqual(PlayerState.keysOf(null, entryKind), [])
  // No list grows beyond the longest queue.
  var many = []
  for (var i = 0; i < 500; i++) many.push(4)
  assert.strictEqual(PlayerState.keysOf(many, entryKind).length, 200)
  var full = PlayerState.keysOf(many, entryKind)
  assert.strictEqual(PlayerState.keysAfterLoad(full, 7, "append-play").length, 200)
})

test("in every trace the list kept by our own commands is the playlist mpv reports next", function() {
  Object.keys(EXPECTED).forEach(function(name) {
    var run = replay(fixture.traces[name])
    assert.ok(run.adopted.length >= 1, name + ": mpv reported its playlist")
    if (NOT_OUR_PLAYLIST.indexOf(name) !== -1) return
    assert.deepStrictEqual(run.surprises, [], name)
  })
  var finals = {
    cold_load: [1], replace: [2], three_replaces: [4], stop: [], stop_then_load: [2],
    // mpv keeps an entry that has ended, and one that failed.
    eof_with_next: [1, 2], eof_last: [1], error_with_next: [1, 2], error_last: [1],
    append_play_while_playing: [1, 2], playlist_next: [1, 2], playlist_prev: [1, 2],
    // Appended twice, inserted in front, then two removals.
    playlist_edit: [1, 2],
    // Two removals and a load in one write: the back one first, so that
    // both positions are those of the same playlist.
    playlist_burst: [1, 4],
    playlist_remove_current: [2], play_index_past_end: [1], video_track_change: [2]
  }
  Object.keys(finals).forEach(function(name) {
    assert.deepStrictEqual(replay(fixture.traces[name]).keys, finals[name], name)
  })
  assert.deepStrictEqual(replay(fixture.traces.playlist_edit).adopted.filter(function(keys, i, list) {
    return i === 0 || list[i - 1] !== keys
  }), ["", "1", "1,2,3", "4,1,2,3", "4,1,2", "1,2"])
})

test("mpv answers a command before it reports what the command did to the playlist", function() {
  // So a report that arrives while a command of ours is unanswered is older
  // than that command, and the player does not take it. On a cold start the
  // empty playlist of a fresh mpv arrives that way, behind the load that
  // was sent with the handshake.
  var cold = replay(fixture.traces.cold_load)
  assert.strictEqual(cold.passedOver, 1)
  assert.deepStrictEqual(cold.adopted, ["1"])
  var checked = 0
  Object.keys(EXPECTED).forEach(function(name) {
    var trace = fixture.traces[name]
    // The entry each load was answered with, by request.
    var made = new Map()
    trace.forEach(function(record) {
      var id = record.recv ? MpvProto.entryId(record.recv.data) : 0
      if (id > 0) made.set(record.recv.request_id, id)
    })
    var edits = new Map()
    var last = []
    var id = 0
    trace.forEach(function(record) {
      if (record.send !== undefined) {
        id++
        var changing = ["loadfile", "playlist-remove", "playlist-clear", "stop"]
        if (changing.indexOf(record.send[0]) !== -1) edits.set(id, record.send[0])
        return
      }
      var line = record.recv
      if (line === undefined) return
      if (line.request_id !== undefined) {
        edits.delete(line.request_id)
        return
      }
      if (line.event !== "property-change" || line.name !== "playlist") return
      var ids = MpvProto.playlistIds(line.data)
      // A report that comes while a command is unanswered shows the
      // playlist as it was before that command: none of the entries an
      // unanswered load made, and not the emptiness an unanswered stop
      // leaves behind.
      edits.forEach(function(command, request) {
        checked++
        if (command === "loadfile") assert.ok(ids.indexOf(made.get(request)) === -1, name)
        if (command === "stop") assert.ok(ids.length > 0 || last.length === 0, name)
      })
      last = ids
    })
  })
  assert.ok(checked >= 1)
})

test("an entry another program put into the playlist shows as a slot that is not ours", function() {
  var foreign = replay(fixture.traces.foreign_load)
  // Our track, the foreign file in its place, and nothing after our stop.
  var calm = foreign.adopted.filter(function(keys, i, list) { return i === 0 || list[i - 1] !== keys })
  assert.deepStrictEqual(calm, ["", "1", "0", ""])
  assert.deepStrictEqual(replay(fixture.traces.external_stop).keys, [])
  assert.deepStrictEqual(replay(fixture.traces.lost_load).keys, [])
})

test("video beside the audio leaves the position estimate where it was", function() {
  var names = ["video_closed", "video_add_fails"]
  names.forEach(function(name) {
    var positions = replay(fixture.traces[name]).positions
    assert.ok(positions.length >= 1, name)
    positions.forEach(function(position) {
      assert.ok(position.actual > 0.1, name + ": the track plays on")
      assert.ok(Math.abs(position.estimate - position.actual) < 0.1,
        name + ": estimated " + position.estimate + ", mpv says " + position.actual)
    })
  })
})

test("the window's close request reaches the reducer as one signal, and the track plays on", function() {
  var trace = fixture.traces.video_closed
  var run = replay(trace)
  assert.strictEqual(run.signals.filter(function(signal) { return signal === "videoClosed" }).length, 1)
  assert.strictEqual(run.signals[run.signals.length - 1], "videoClosed")
  assert.ok(run.state.key === 1 && run.state.started, "the track is still the current one")
  // No other trace holds the message.
  Object.keys(EXPECTED).forEach(function(name) {
    if (name === "video_closed") return
    assert.ok(replay(fixture.traces[name]).signals.indexOf("videoClosed") === -1, name)
  })
})
