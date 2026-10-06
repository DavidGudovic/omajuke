.pragma library
.import "Const.js" as Const
.import "Ids.js" as Ids
.import "Clean.js" as Clean
.import "Paths.js" as Paths

// Everything that crosses mpv's control socket, in both directions. Going
// out: a closed vocabulary. Each command mpv may be sent has one builder
// here, and encode() turns nothing but those commands into a line, so that
// a track title can only ever be a value inside a load command and mpv's
// own "run a program" commands cannot be spelled at all. Coming in: feed()
// cuts the byte stream into lines while it is being read, with a cap on
// what is held, and parse() turns a line into a fresh object with known
// keys and checked types. The table of observed properties lives here too.

// ---- Observed properties ----

// The ids are ours: mpv repeats them in every change it reports. Entries
// marked handshake are observed as soon as the socket is up. time-pos
// reports about eleven times a second, so it is observed only while
// somebody looks at the position. Nothing under user-data is ever in this
// table: mpv's yt-dlp hook publishes resolved media addresses there.
var OBSERVE = [
  { id: 1, name: "idle-active", handshake: true },
  { id: 2, name: "pause", handshake: true },
  { id: 3, name: "core-idle", handshake: true },
  { id: 4, name: "duration", handshake: true },
  { id: 5, name: "volume", handshake: true },
  { id: 6, name: "mute", handshake: true },
  { id: 7, name: "time-pos", handshake: false },
  { id: 8, name: "speed", handshake: true }
]

// ---- Vocabulary ----

// The message mpv sends back when the user closes the video window.
var VIDEO_CLOSED = "omajuke-video-closed"

// Closing mpv's window quits mpv even with every key binding off. Bound to
// this instead, it only hides the video and tells us that the user did it.
var _CLOSE_WIN = ["keybind", "CLOSE_WIN", "set vid no; script-message " + VIDEO_CLOSED]

// Volume levelling. The label makes adding it twice a replacement and lets
// it be removed by name.
var _NORM_ON = ["af", "add", "@omajuke-norm:dynaudnorm=f=250:g=31:p=0.9"]
var _NORM_OFF = ["af", "remove", "@omajuke-norm"]

// Plain "append" is missing on purpose: an appended entry that does not
// start by itself when mpv is idle would be a track that silently waits.
var _LOAD_MODES = ["replace", "append-play", "insert-at"]

var _READS = ["time-pos", "playlist", "track-list", "audio-device-list"]

// The per-file option that hands mpv's yt-dlp hook the info file we
// resolved, so that the hook reads it instead of asking YouTube again.
var _INFO_OPTION = "load-info-json="

// An info file as it may appear inside an option value: plain path
// characters and a counter for a name. No comma, quote, equals sign or line
// break can be part of it.
var _INFO_FILE = /^\/[A-Za-z0-9._\/-]{1,150}\/[0-9]{1,10}\.json$/
var _INFO_NAME = /^[0-9]{1,10}\.json$/
var _START = /^[1-9][0-9]{0,5}$/

// What a reply or an event may carry as a name or a reason: short, printable
// ASCII. mpv's own strings all are.
var _PRINTABLE = /^[\x20-\x7e]*$/
var _NAME_CHARS = 64
var _ERROR_CHARS = 128
var _ARGS = 8

// ---- Small checks ----

function _own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function _isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function _isNumber(value) {
  return typeof value === "number" && isFinite(value)
}

// A whole number from 1: request ids, entry ids, observation ids.
function _isCount(value) {
  return _isNumber(value) && Math.floor(value) === value && value >= 1 && value <= 9007199254740991
}

function _isWhole(value, min, max) {
  return _isNumber(value) && Math.floor(value) === value && value >= min && value <= max
}

function _same(a, b) {
  if (a.length !== b.length) return false
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function _observed(name) {
  for (var i = 0; i < OBSERVE.length; i++) {
    if (OBSERVE[i].name === name) return OBSERVE[i]
  }
  return null
}

function _observedById(id) {
  for (var i = 0; i < OBSERVE.length; i++) {
    if (OBSERVE[i].id === id) return OBSERVE[i]
  }
  return null
}

// True for a file of ours (Paths.owns is the gate for those) that sits
// directly in the info directory under a counter, and whose whole path
// could stand inside an option value.
function _isInfoFile(paths, file) {
  if (typeof file !== "string" || !_INFO_FILE.test(file) || !Paths.owns(paths, file)) return false
  var dir = paths.infoDir
  if (typeof dir !== "string") return false
  return file.slice(0, dir.length + 1) === dir + "/" && _INFO_NAME.test(file.slice(dir.length + 1))
}

// ---- Builders ----
// One per command. Each returns a fresh array, or null when an argument is
// not what it must be; the caller then sends nothing.

function closeWindowBind() {
  return _CLOSE_WIN.slice()
}

function observe(name) {
  var entry = _observed(name)
  return entry === null ? null : ["observe_property", entry.id, entry.name]
}

function unobserve(name) {
  var entry = _observed(name)
  return entry === null ? null : ["unobserve_property", entry.id]
}

// What is sent first on a fresh connection, in this order: the window
// binding before anything can open a window, then the observations.
function handshake() {
  var commands = [closeWindowBind()]
  for (var i = 0; i < OBSERVE.length; i++) {
    if (OBSERVE[i].handshake) commands.push(observe(OBSERVE[i].name))
  }
  return commands
}

// p: { id, title, infoFile, mode, index, startAt, live }. The address is
// rebuilt from the id, the title travels only as a value of the options
// object (in mpv's "key=value,key=value" text form a comma in a title
// would set further options), and the info file must be one of ours.
function loadfile(paths, p) {
  if (!_isObject(p) || !Ids.isId(p.id)) return null
  if (_LOAD_MODES.indexOf(p.mode) === -1) return null
  if (!_isInfoFile(paths, p.infoFile)) return null

  var index = -1
  if (p.mode === "insert-at") {
    if (!_isWhole(p.index, 0, Const.LIMITS.queueItems)) return null
    index = p.index
  }

  var startAt = 0
  if (p.startAt !== undefined && p.startAt !== null) {
    if (!_isNumber(p.startAt) || p.startAt < 0 || p.startAt > Const.LIMITS.durationSeconds) return null
    startAt = Math.floor(p.startAt)
  }

  var title = Clean.text(p.title, Const.LIMITS.titleChars)
  var options = {
    "force-media-title": title === "" ? Const.APP_NAME : title,
    "ytdl-raw-options-append": _INFO_OPTION + p.infoFile
  }
  // A live stream has no position to return to: it starts at the live edge.
  if (startAt > 0 && p.live !== true) options["start"] = String(startAt)
  return ["loadfile", Ids.watchUrl(p.id), p.mode, index, options]
}

function setPause(paused) {
  return typeof paused === "boolean" ? ["set_property", "pause", paused] : null
}

// The target is clamped to the track: mpv ends a file that is sought past
// its end, and the last second is left as room for that.
function seek(seconds, duration) {
  if (!_isNumber(seconds) || !_isNumber(duration)) return null
  var last = Math.min(Math.max(0, duration - 1), Const.LIMITS.durationSeconds)
  var target = Math.min(Math.max(0, seconds), last)
  return ["seek", Math.round(target * 1000) / 1000, "absolute"]
}

function stop() {
  return ["stop"]
}

// Anything but real time would make the position estimate wrong, so the
// only speed that can be set is 1.
function resetSpeed() {
  return ["set_property", "speed", 1]
}

// mpv accepts any number here, whatever its own maximum says, so the value
// is rounded and clamped before it leaves.
function setVolume(volume) {
  if (!_isNumber(volume)) return null
  return ["set_property", "volume", Math.min(100, Math.max(0, Math.round(volume)))]
}

function setMute(muted) {
  return typeof muted === "boolean" ? ["set_property", "mute", muted] : null
}

function getProperty(name) {
  return _READS.indexOf(name) === -1 ? null : ["get_property", name]
}

function setEvenVolume(on) {
  if (typeof on !== "boolean") return null
  return on ? _NORM_ON.slice() : _NORM_OFF.slice()
}

function quit() {
  return ["quit"]
}

// ---- Encoding ----

// The options of a load command: the title and the info file, both as the
// object's own string values, an optional start in whole seconds, and no
// other key. An option we did not choose is an option mpv would apply.
function _isLoadOptions(options) {
  if (!_isObject(options)) return false
  var keys = Object.keys(options)
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] !== "force-media-title" && keys[i] !== "ytdl-raw-options-append" && keys[i] !== "start") {
      return false
    }
  }
  if (!_own(options, "force-media-title") || !_own(options, "ytdl-raw-options-append")) return false
  var title = options["force-media-title"]
  if (typeof title !== "string" || title === "" || Clean.text(title, Const.LIMITS.titleChars) !== title) {
    return false
  }
  var info = options["ytdl-raw-options-append"]
  if (typeof info !== "string" || info.slice(0, _INFO_OPTION.length) !== _INFO_OPTION) return false
  if (!_INFO_FILE.test(info.slice(_INFO_OPTION.length))) return false
  if (!_own(options, "start")) return true
  var start = options["start"]
  return typeof start === "string" && _START.test(start) && Number(start) <= Const.LIMITS.durationSeconds
}

function _isLoad(command) {
  if (command.length !== 5) return false
  var id = Ids.parseVideoRef(command[1], false)
  if (id === "" || command[1] !== Ids.watchUrl(id)) return false
  if (_LOAD_MODES.indexOf(command[2]) === -1) return false
  if (command[2] === "insert-at") {
    if (!_isWhole(command[3], 0, Const.LIMITS.queueItems)) return false
  } else if (command[3] !== -1) {
    return false
  }
  return _isLoadOptions(command[4])
}

function _isSetting(name, value) {
  if (name === "pause" || name === "mute") return typeof value === "boolean"
  if (name === "volume") return _isWhole(value, 0, 100)
  if (name === "speed") return value === 1
  return false
}

// The vocabulary as a test: true only for a command one of the builders
// above can have produced. It is a second lock behind the builders. A
// command that was put together by hand, or changed after it was built, is
// not written.
function _inVocabulary(command) {
  if (!Array.isArray(command) || command.length < 1) return false
  var name = command[0]
  if (name === "stop" || name === "quit") return command.length === 1
  if (name === "keybind") return _same(command, _CLOSE_WIN)
  if (name === "af") return _same(command, _NORM_ON) || _same(command, _NORM_OFF)
  if (name === "observe_property") {
    var entry = _observed(command[2])
    return command.length === 3 && entry !== null && entry.id === command[1]
  }
  if (name === "unobserve_property") return command.length === 2 && _observedById(command[1]) !== null
  if (name === "get_property") return command.length === 2 && _READS.indexOf(command[1]) !== -1
  if (name === "set_property") return command.length === 3 && _isSetting(command[1], command[2])
  if (name === "seek") {
    return command.length === 3 && _isNumber(command[1]) && command[1] >= 0
      && command[1] <= Const.LIMITS.durationSeconds && command[2] === "absolute"
  }
  if (name === "loadfile") return _isLoad(command)
  return false
}

// The line for one command, or "" when the command is not in the vocabulary
// or the request id is not a whole number from 1. JSON.stringify is the only
// thing that ever puts a value into a line, so the result is always one
// line that starts with "{": mpv would run anything else as a text command.
function encode(command, requestId, nonBlocking) {
  if (!_inVocabulary(command) || !_isCount(requestId)) return ""
  var message = { command: command, request_id: requestId }
  if (nonBlocking === true) message["async"] = true
  return JSON.stringify(message) + "\n"
}

// ---- Reading ----

// Cuts what mpv sends into lines while it arrives. pending is what the last
// call returned as pending (null before the first chunk of a connection).
// Returns { lines, pending, dropped }. A line longer than cap is dropped and
// counted, and the count is taken as soon as the unfinished part passes the
// cap: from then on input is discarded up to the next line break. So no more
// than cap characters are ever held besides the chunk itself, however long a
// line the other side sends.
function feed(pending, chunk, cap) {
  var limit = _isNumber(cap) && cap >= 1 ? Math.floor(cap) : Const.LIMITS.mpvLineChars
  var held = _isObject(pending) && typeof pending.text === "string" ? pending.text : ""
  var skipping = _isObject(pending) && pending.skipping === true
  var data = typeof chunk === "string" ? chunk : ""
  var lines = []
  var dropped = 0
  var start = 0
  var end = data.indexOf("\n", start)
  while (end !== -1) {
    if (skipping) {
      // The rest of a line that was counted when it grew too long.
      skipping = false
    } else if (held.length + (end - start) > limit) {
      dropped++
    } else if (held.length + (end - start) > 0) {
      lines.push(held + data.slice(start, end))
    }
    held = ""
    start = end + 1
    end = data.indexOf("\n", start)
  }
  if (!skipping) {
    if (held.length + (data.length - start) > limit) {
      dropped++
      skipping = true
      held = ""
    } else {
      held += data.slice(start)
    }
  }
  return { lines: lines, pending: { text: held, skipping: skipping }, dropped: dropped }
}

// What mpv may have put under a key, each as the value itself or as the
// harmless default: a short printable string, a whole number from 1, a
// short list of short printable strings. The callers read every key by its
// literal name and only when the object itself carries it.
function _shortText(value, max) {
  return typeof value === "string" && value.length <= max && _PRINTABLE.test(value) ? value : ""
}

function _countOrZero(value) {
  return _isCount(value) ? value : 0
}

function _shortTexts(value) {
  if (!Array.isArray(value) || value.length > _ARGS) return []
  var list = []
  for (var i = 0; i < value.length; i++) {
    if (_shortText(value[i], _NAME_CHARS) !== value[i]) return []
    list.push(value[i])
  }
  return list
}

// An answer to one of our requests. error is "" for success, and never ""
// otherwise, whatever mpv wrote: a failure must not read as a success.
function _reply(raw) {
  if (!_isCount(raw.request_id)) return null
  var ok = _own(raw, "error") && raw.error === "success"
  var error = ""
  if (!ok) {
    error = _own(raw, "error") ? _shortText(raw.error, _ERROR_CHARS) : ""
    if (error === "" || error === "success") error = "failed"
  }
  return {
    kind: "reply",
    request_id: raw.request_id,
    error: error,
    data: ok && _own(raw, "data") ? raw.data : undefined
  }
}

// An event. Every key is always there, with 0, "" or an empty list where
// mpv sent nothing usable, so that the reader never tests for presence.
// data is the one value passed on as it came: its type depends on the
// property, and whoever uses it checks it against that.
function _event(raw) {
  var name = _shortText(raw.event, _NAME_CHARS)
  if (name === "") return null
  return {
    kind: "event",
    event: name,
    id: _own(raw, "id") ? _countOrZero(raw.id) : 0,
    name: _own(raw, "name") ? _shortText(raw.name, _NAME_CHARS) : "",
    data: _own(raw, "data") ? raw.data : undefined,
    playlist_entry_id: _own(raw, "playlist_entry_id") ? _countOrZero(raw.playlist_entry_id) : 0,
    reason: _own(raw, "reason") ? _shortText(raw.reason, _NAME_CHARS) : "",
    file_error: _own(raw, "file_error") ? _shortText(raw.file_error, _ERROR_CHARS) : "",
    args: _own(raw, "args") ? _shortTexts(raw.args) : []
  }
}

// One line from mpv as a fresh object: a reply, an event, or null for
// anything else (not JSON, not an object, neither kind). Fields are read
// only as the object's own properties and copied one by one under literal
// keys, so nothing inherited and no unexpected key travels on.
function parse(line) {
  if (typeof line !== "string" || line.length > Const.LIMITS.mpvLineChars) return null
  var raw
  try {
    raw = JSON.parse(line)
  } catch (error) {
    return null
  }
  if (!_isObject(raw)) return null
  if (_own(raw, "request_id")) return _reply(raw)
  if (_own(raw, "event")) return _event(raw)
  return null
}

// The entry id in the reply to a load command, or 0. mpv numbers playlist
// entries from 1 and names the same number in the events about that entry.
function entryId(data) {
  if (!_isObject(data) || !_own(data, "playlist_entry_id")) return 0
  return _countOrZero(data.playlist_entry_id)
}

if (typeof module !== "undefined") {
  module.exports = {
    OBSERVE: OBSERVE,
    VIDEO_CLOSED: VIDEO_CLOSED,
    closeWindowBind: closeWindowBind,
    observe: observe,
    unobserve: unobserve,
    handshake: handshake,
    loadfile: loadfile,
    setPause: setPause,
    seek: seek,
    stop: stop,
    resetSpeed: resetSpeed,
    setVolume: setVolume,
    setMute: setMute,
    getProperty: getProperty,
    setEvenVolume: setEvenVolume,
    quit: quit,
    encode: encode,
    feed: feed,
    parse: parse,
    entryId: entryId
  }
}
