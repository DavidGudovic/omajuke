.pragma library
.import "Const.js" as Const
.import "MpvProto.js" as MpvProto

// What mpv's events and property changes mean for playback. A pure reducer:
// every function takes the state and one input and returns a new state
// together with the signals the player has to emit and the commands it has
// to send back, and nothing here keeps anything between calls. That is what
// lets the whole mapping be replayed in a test against traces recorded from
// the real mpv. The player owns the socket, the timers and the table that
// says which playlist entry belongs to which track; this file owns the
// answer to "given this line, what happened?".

// An end of file this far before the end of the track is a broken
// connection, not the end of the track: mpv reports both the same way.
var _PREMATURE_SECONDS = 5

var _PREMATURE = "premature-eof"

function _isNumber(value) {
  return typeof value === "number" && isFinite(value)
}

function _isCount(value) {
  return _isNumber(value) && Math.floor(value) === value && value >= 1
}

// phase is what the player shows: idle, loading, playing, paused or
// buffering. key is the track mpv is on and entry is mpv's own number for
// that playlist entry (both 0 for none); started says whether the track has
// begun to play. pause, coreIdle and idleActive mirror mpv's properties of
// those names. The position is kept as a value and the time it was true at
// (posBase, posAt), so that it can be estimated without asking mpv. seeking
// is true from a seek until mpv has carried it out, and posKnown is false
// from a start or a seek until mpv has told the position again.
function initial() {
  return {
    phase: "idle", key: 0, entry: 0, started: false, live: false, pause: false, coreIdle: true,
    idleActive: true, duration: 0, posBase: 0, posAt: 0, seeking: false, posKnown: false, volume: 0,
    mute: false
  }
}

function _copy(state) {
  return {
    phase: state.phase, key: state.key, entry: state.entry, started: state.started, live: state.live,
    pause: state.pause, coreIdle: state.coreIdle, idleActive: state.idleActive, duration: state.duration,
    posBase: state.posBase, posAt: state.posAt, seeking: state.seeking, posKnown: state.posKnown,
    volume: state.volume, mute: state.mute
  }
}

// Every answer has this shape. The state inside is a copy, so the helpers
// below may change it while the caller's state stays as it was.
function _result(state) {
  return { state: _copy(state), signals: [], commands: [] }
}

function _signal(result, name, args) {
  result.signals.push({ name: name, args: args })
}

// The position in seconds at the time now. Only a playing track moves, at
// real time (the player holds mpv's speed at 1), and never past its end.
function positionNow(state, now) {
  if (state.phase !== "playing") return state.posBase
  var elapsed = _isNumber(now) ? Math.max(0, now - state.posAt) / 1000 : 0
  return Math.min(state.duration || Infinity, state.posBase + elapsed)
}

// Fixes the estimate at the time now. Called before anything that changes
// how the position moves, so the estimate is carried over, not lost.
function _capture(next, now) {
  next.posBase = positionNow(next, now)
  if (_isNumber(now)) next.posAt = now
}

// What a started track is doing, from mpv's two flags. mpv calls its core
// idle whenever nothing is being played out: while paused, and while it
// waits for data.
function _runningPhase(next) {
  if (next.pause) return "paused"
  return next.coreIdle ? "buffering" : "playing"
}

// Moves a started track to another phase. The estimate is carried over, and
// mpv is asked for the exact position, because the estimate drifts by
// however long the change took to reach us.
function _enter(result, phase, now) {
  var next = result.state
  if (next.phase === phase) return
  _capture(next, now)
  next.phase = phase
  result.commands.push(MpvProto.getProperty("time-pos"))
}

// The current file is over, for whatever reason. No track is current until
// mpv starts one. Without this a line about a file that mpv began to start
// and dropped again (several loads in a row do that) would be taken for
// news about the track that has just ended.
function _fileOver(next, now) {
  _capture(next, now)
  next.phase = "idle"
  next.key = 0
  next.entry = 0
  next.started = false
  next.seeking = false
  next.posKnown = false
}

// ---- Properties ----

function _onIdleActive(result, data, now) {
  if (typeof data !== "boolean") return
  var next = result.state
  next.idleActive = data
  if (!data) return
  // Reported every time mpv says it, the first report of a fresh mpv
  // included: whether an idle mpv is news depends on what the listener is
  // waiting for.
  _fileOver(next, now)
  _signal(result, "idle", [])
}

function _onPause(result, data, now) {
  if (typeof data !== "boolean") return
  result.state.pause = data
  if (result.state.started) _enter(result, _runningPhase(result.state), now)
}

function _onCoreIdle(result, data, now) {
  if (typeof data !== "boolean") return
  result.state.coreIdle = data
  if (result.state.started) _enter(result, _runningPhase(result.state), now)
}

// A live stream has no length: mpv reports a growing estimate several times
// a second, which is kept out. So is a length reported while no track of
// ours is current.
function _onDuration(result, data) {
  var next = result.state
  var known = next.key !== 0 && !next.live && _isNumber(data) && data > 0
  next.duration = known ? Math.min(data, Const.LIMITS.durationSeconds) : 0
}

// While a seek is on its way the position is where the seek goes, and a
// report from before it landed must not pull it back.
function _onTimePos(result, data, now) {
  var next = result.state
  if (!_isNumber(data) || data < 0 || next.key === 0 || next.seeking) return
  next.posBase = data
  if (_isNumber(now)) next.posAt = now
  next.posKnown = true
}

// Another program on the session bus can set any volume, also beyond mpv's
// own maximum. The state holds the clamped value and mpv is told the same.
function _onVolume(result, data) {
  if (!_isNumber(data)) return
  var volume = Math.min(100, Math.max(0, Math.round(data)))
  result.state.volume = volume
  if (data > 100 || data < 0) result.commands.push(MpvProto.setVolume(volume))
}

function _onMute(result, data) {
  if (typeof data === "boolean") result.state.mute = data
}

// The position estimate assumes real time, so any other speed is undone.
function _onSpeed(result, data) {
  if (_isNumber(data) && data !== 1) result.commands.push(MpvProto.resetSpeed())
}

// One property change, or the reply to a question about a property.
// Returns { state, signals, commands }.
function onProperty(state, name, data, now) {
  var result = _result(state)
  if (name === "idle-active") _onIdleActive(result, data, now)
  else if (name === "pause") _onPause(result, data, now)
  else if (name === "core-idle") _onCoreIdle(result, data, now)
  else if (name === "duration") _onDuration(result, data)
  else if (name === "time-pos") _onTimePos(result, data, now)
  else if (name === "volume") _onVolume(result, data)
  else if (name === "mute") _onMute(result, data)
  else if (name === "speed") _onSpeed(result, data)
  return result
}

// ---- Events ----

// What the player knows about a playlist entry: { key, dead, live }. An
// entry with a key is one of ours. A dead entry is one we replaced or
// stopped before mpv got to it. Anything else is foreign: some other
// program made mpv open it. An answer that cannot be read counts as
// foreign, so that nothing plays that cannot be traced to a track of ours.
function _kindOf(entryKind, entryId) {
  var foreign = { key: 0, dead: false, live: false }
  if (typeof entryKind !== "function" || !_isCount(entryId)) return foreign
  var answer = entryKind(entryId)
  if (answer === null || typeof answer !== "object") return foreign
  if (_isCount(answer.key)) return { key: answer.key, dead: false, live: answer.live === true }
  return { key: 0, dead: answer.dead === true, live: false }
}

function _onStartFile(result, event, entryKind, now) {
  var kind = _kindOf(entryKind, event.playlist_entry_id)
  if (kind.dead) return
  if (kind.key === 0) {
    // Not adopted and not reported. mpv goes idle and says so.
    result.commands.push(MpvProto.stop())
    return
  }
  var next = result.state
  next.key = kind.key
  next.entry = event.playlist_entry_id
  next.phase = "loading"
  next.started = false
  next.live = kind.live
  next.duration = 0
  next.posBase = 0
  if (_isNumber(now)) next.posAt = now
  next.seeking = false
  next.posKnown = false
  _signal(result, "loading", [kind.key])
}

// mpv sends this when a file begins to play and again after every seek.
function _onPlaybackRestart(result, now) {
  var next = result.state
  if (next.key === 0) return
  _capture(next, now)
  next.seeking = false
  if (!next.started) {
    next.started = true
    next.phase = _runningPhase(next)
    _signal(result, "started", [next.key])
  }
  result.commands.push(MpvProto.getProperty("time-pos"))
}

function _onSeek(result) {
  var next = result.state
  if (next.key === 0) return
  next.seeking = true
  next.posKnown = false
}

// A connection that dies in the middle of a track ends the file as "eof"
// too. It is told apart by the position, which is only trusted when mpv has
// reported it since the last jump (so never while a seek is on its way): a
// file that ends right behind a seek to its end, or right after starting
// close to its end, ended normally. A live stream has no length here, so
// its end is never early.
function _isPremature(next, now) {
  if (next.duration <= 0 || !next.posKnown) return false
  return positionNow(next, now) < next.duration - _PREMATURE_SECONDS
}

// The file that ends is recognised by mpv's entry number, not through the
// player's table: when we replace a track, its entry has left that table by
// the time mpv reports the end of the file.
function _onEndFile(result, event, now) {
  var next = result.state
  if (next.entry === 0 || event.playlist_entry_id !== next.entry) return
  var reason = event.reason
  if (reason === "eof") {
    if (_isPremature(next, now)) _signal(result, "ended", [next.key, "error", _PREMATURE])
    else _signal(result, "ended", [next.key, "eof", ""])
  } else if (reason === "error") {
    var fileError = typeof event.file_error === "string" ? event.file_error : ""
    _signal(result, "ended", [next.key, "error", fileError])
  } else if (reason !== "stop") {
    // quit, redirect and whatever a later mpv may add say nothing we use.
    return
  }
  // "stop" gets no signal: a replace, a step to another playlist entry and
  // a real stop all end the file with it. What mpv does next tells them
  // apart, and that is reported when it happens.
  _fileOver(next, now)
}

function _onClientMessage(result, event) {
  var args = event.args
  if (Array.isArray(args) && args.length === 1 && args[0] === MpvProto.VIDEO_CLOSED) {
    _signal(result, "videoClosed", [])
  }
}

// One event from mpv, as MpvProto.parse returns it. entryKind is the
// player's lookup for playlist entries (see _kindOf). Returns
// { state, signals, commands }: signals are { name, args } with name one
// of loading, started, ended, idle and videoClosed, in the order they
// happened. Anything not known here changes nothing.
function onEvent(state, event, entryKind, now) {
  if (event === null || typeof event !== "object") return _result(state)
  var name = event.event
  if (name === "property-change") return onProperty(state, event.name, event.data, now)
  var result = _result(state)
  if (name === "start-file") _onStartFile(result, event, entryKind, now)
  else if (name === "playback-restart") _onPlaybackRestart(result, now)
  else if (name === "seek") _onSeek(result)
  else if (name === "end-file") _onEndFile(result, event, now)
  else if (name === "client-message") _onClientMessage(result, event)
  return result
}

// Our own seek: the position is the target from this moment, before mpv
// has done anything, so that a slider does not jump back while mpv seeks.
function onLocalSeek(state, seconds, now) {
  var result = _result(state)
  var next = result.state
  if (next.key === 0 || !_isNumber(seconds) || seconds < 0) return result
  next.posBase = seconds
  if (_isNumber(now)) next.posAt = now
  next.seeking = true
  next.posKnown = false
  return result
}

// Our own stop or shutdown: from this moment no track is current, before
// mpv has said anything. Nothing is signalled, because whoever asked for
// the stop knows about it, and the length goes with the track: mpv's own
// word on that may never be read once the player has been told to quit.
function onLocalStop(state, now) {
  var result = _result(state)
  _fileOver(result.state, now)
  result.state.duration = 0
  return result
}

// ---- mpv's playlist, as track keys ----
// The player keeps a list with one slot for each entry of mpv's playlist,
// in order: the key of the track that entry is, or 0 for an entry that is
// not ours. mpv reports its playlist only after it has changed, and a
// position worked out from a list that is one change behind names another
// entry. So the list is also changed here, by what each command of ours
// will do to mpv's playlist, at the moment the command is accepted.

function _keys(keys) {
  return Array.isArray(keys) ? keys.slice(0, Const.LIMITS.queueItems) : []
}

// The list after a load of the track key. A replacing load leaves that
// track alone in the playlist, "append-play" puts it at the end, and
// "insert-at" in front of the entry at index (at the end when there is no
// such entry). Anything else changes nothing.
function keysAfterLoad(keys, key, mode, index) {
  var list = _keys(keys)
  if (!_isCount(key)) return list
  if (mode === "replace") return [key]
  if (mode === "append-play") {
    list.push(key)
  } else if (mode === "insert-at") {
    var at = _isNumber(index) && Math.floor(index) === index && index >= 0 ? index : list.length
    list.splice(Math.min(at, list.length), 0, key)
  }
  return list.slice(0, Const.LIMITS.queueItems)
}

// The list after the entry at index was removed.
function keysAfterRemove(keys, index) {
  var list = _keys(keys)
  if (_isNumber(index) && Math.floor(index) === index && index >= 0 && index < list.length) {
    list.splice(index, 1)
  }
  return list
}

// The list for a playlist mpv reported: ids are the entry ids in order
// (MpvProto.playlistIds), and entryKind is the player's lookup, as for
// onEvent. An entry that is dead or foreign keeps its slot, as 0, so that
// every position stays a position in mpv's playlist.
function keysOf(ids, entryKind) {
  var list = []
  if (!Array.isArray(ids)) return list
  var count = Math.min(ids.length, Const.LIMITS.queueItems)
  for (var i = 0; i < count; i++) list.push(_kindOf(entryKind, ids[i]).key)
  return list
}

if (typeof module !== "undefined") {
  module.exports = {
    initial: initial,
    onProperty: onProperty,
    onEvent: onEvent,
    onLocalSeek: onLocalSeek,
    onLocalStop: onLocalStop,
    positionNow: positionNow,
    keysAfterLoad: keysAfterLoad,
    keysAfterRemove: keysAfterRemove,
    keysOf: keysOf
  }
}
