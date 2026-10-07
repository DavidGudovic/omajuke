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
// keys and checked types. The table of observed properties lives here too,
// and the readers for the values of those properties whose shape is more
// than a number or a flag.

// ---- Observed properties ----

// The ids are ours: mpv repeats them in every change it reports. Entries
// marked handshake are observed as soon as the socket is up. time-pos
// reports about eleven times a second, so it is observed only while
// somebody looks at the position, and the three properties about video are
// observed only while video is wanted. The two about audio outputs are
// observed only while outputs are in use: to list them mpv asks the sound
// server, and an mpv that cannot reach one has been seen to wait for it
// forever, with every command behind the question unanswered. Nothing under
// user-data is ever in this table: mpv's yt-dlp hook publishes resolved
// media addresses there.
var OBSERVE = [
  { id: 1, name: "idle-active", handshake: true },
  { id: 2, name: "pause", handshake: true },
  { id: 3, name: "core-idle", handshake: true },
  { id: 4, name: "duration", handshake: true },
  { id: 5, name: "volume", handshake: true },
  { id: 6, name: "mute", handshake: true },
  { id: 7, name: "time-pos", handshake: false },
  { id: 8, name: "speed", handshake: true },
  { id: 9, name: "vid", handshake: false },
  { id: 10, name: "track-list", handshake: false },
  { id: 11, name: "video-params", handshake: false },
  { id: 12, name: "audio-device-list", handshake: false },
  { id: 13, name: "audio-device", handshake: false },
  { id: 14, name: "playlist", handshake: true }
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

// YouTube serves an open-ended request for a video stream at about the
// speed it plays. Asked for in ranges of this size it arrives several times
// faster, so a picture is there sooner. It is a file-local option that
// mpv's yt-dlp hook resets on every load, which is why it is set over the
// socket before each video is added and cannot be a launch flag.
var _REQUEST_SIZE = "10485760"

// The only way a video is ever added: as a track beside the audio that
// already plays, not selected by mpv itself.
var _VIDEO_ADD_FLAG = "auto"

// An audio output as mpv names it and as it may be selected: the system
// default, or a PipeWire sink. The name is a token mpv has to recognise
// again, so it is never cleaned, only tested.
var _DEVICE_AUTO = "auto"
var _DEVICE = /^pipewire\/[A-Za-z0-9._:+-]{1,200}$/

// How much of a list from mpv is looked at, and how much of it is kept.
var _TRACKS_SCAN = 64
var _TRACKS = 8
var _TRACK_MAX = 9999
var _DEVICES_SCAN = 256
var _DEVICE_TEXT_CHARS = 1024

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

function _isDeviceName(name) {
  return typeof name === "string" && (name === _DEVICE_AUTO || _DEVICE.test(name))
}

// A position in mpv's playlist. The playlist the service builds is a few
// entries long; the bound is the longest queue there can be.
function _isPlaylistIndex(index) {
  return _isWhole(index, 0, Const.LIMITS.queueItems - 1)
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

// ---- Builders: the playlist ----

// index is a position in mpv's playlist and count the length of that
// playlist as mpv last reported it. An index outside it is refused here.
// Removing is the only step taken inside mpv's playlist: no command makes
// mpv jump to an entry or empties the list around the one that plays.
function playlistRemove(index, count) {
  if (!_isPlaylistIndex(index) || !_isWhole(count, 1, Const.LIMITS.queueItems) || index >= count) return null
  return ["playlist-remove", index]
}

// ---- Builders: video ----

function streamRequestSize() {
  return ["set_property", "stream-lavf-o", { "request_size": _REQUEST_SIZE }]
}

// The address must be a media address of the one host family that serves
// YouTube's streams; anything else, a local path included, is refused.
// encode() marks this command as not blocking whatever its caller says: a
// host that accepts the connection and never answers would otherwise block
// every other command for as long as it likes.
function videoAdd(videoUrl) {
  if (typeof videoUrl !== "string" || !Const.VIDEO_URL_RE.test(videoUrl)) return null
  return ["video-add", videoUrl, _VIDEO_ADD_FLAG]
}

// id is 0 (or "no") for no video, or the id of a track that tracks holds:
// the list videoTracks() made of mpv's last track list. mpv answers
// "success" to selecting a track that does not exist, so that is refused
// here.
function setVid(id, tracks) {
  if (id === 0 || id === "no") return ["set_property", "vid", "no"]
  if (!_isWhole(id, 1, _TRACK_MAX) || !Array.isArray(tracks) || tracks.indexOf(id) === -1) return null
  return ["set_property", "vid", id]
}

// With the window forced, it stays while one track follows another although
// the next file has no picture yet.
function setForceWindow(on) {
  return typeof on === "boolean" ? ["set_property", "force-window", on ? "yes" : "no"] : null
}

function setStopScreensaver(on) {
  return typeof on === "boolean" ? ["set_property", "stop-screensaver", on ? "yes" : "no"] : null
}

// ---- Builders: the audio output ----

// name must be one of the outputs in devices, the list devices() made of
// what mpv last reported. mpv would take any text and then play nowhere.
function setAudioDevice(name, devices) {
  if (!_isDeviceName(name) || !Array.isArray(devices)) return null
  var count = Math.min(devices.length, _DEVICES_SCAN)
  for (var i = 0; i < count; i++) {
    var device = devices[i]
    if (_isObject(device) && _own(device, "name") && device.name === name) {
      return ["set_property", "audio-device", name]
    }
  }
  return null
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

// The one value the request size is ever set to, as the only key.
function _isRequestSize(value) {
  if (!_isObject(value)) return false
  var keys = Object.keys(value)
  return keys.length === 1 && keys[0] === "request_size" && value["request_size"] === _REQUEST_SIZE
}

function _isSetting(name, value) {
  if (name === "pause" || name === "mute") return typeof value === "boolean"
  if (name === "volume") return _isWhole(value, 0, 100)
  if (name === "speed") return value === 1
  if (name === "vid") return value === "no" || _isWhole(value, 1, _TRACK_MAX)
  if (name === "force-window" || name === "stop-screensaver") return value === "yes" || value === "no"
  if (name === "audio-device") return _isDeviceName(value)
  if (name === "stream-lavf-o") return _isRequestSize(value)
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
  if (name === "playlist-remove") return command.length === 2 && _isPlaylistIndex(command[1])
  if (name === "video-add") {
    return command.length === 3 && typeof command[1] === "string" && Const.VIDEO_URL_RE.test(command[1])
      && command[2] === _VIDEO_ADD_FLAG
  }
  return false
}

// The line for one command, or "" when the command is not in the vocabulary
// or the request id is not a whole number from 1. JSON.stringify is the only
// thing that ever puts a value into a line, so the result is always one
// line that starts with "{": mpv would run anything else as a text command.
// nonBlocking asks mpv to answer whenever the command is done and to go on
// reading meanwhile; adding a video is always sent that way.
function encode(command, requestId, nonBlocking) {
  if (!_inVocabulary(command) || !_isCount(requestId)) return ""
  var message = { command: command, request_id: requestId }
  if (nonBlocking === true || command[0] === "video-add") message["async"] = true
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

// ---- Reading the values of properties ----
// Each takes what mpv put under "data", of whatever shape, and returns a
// fresh value of one known shape. Only own keys are read, lists are cut to
// a length, and nothing but what is named here travels on: a track list
// also holds the address of every track, which nobody needs.

// mpv's playlist as the ids of its entries, in order: one slot for each
// entry, 0 where an entry has no usable id, so that a position in the
// result is a position in mpv's playlist.
function playlistIds(data) {
  var ids = []
  if (!Array.isArray(data)) return ids
  var count = Math.min(data.length, Const.LIMITS.queueItems)
  for (var i = 0; i < count; i++) {
    var entry = data[i]
    ids.push(_isObject(entry) && _own(entry, "id") ? _countOrZero(entry.id) : 0)
  }
  return ids
}

// The ids of the video tracks that were added to the current file from
// outside, oldest first. A video track that came with the file itself is
// never one of ours and is left out.
function videoTracks(data) {
  var ids = []
  if (!Array.isArray(data)) return ids
  var count = Math.min(data.length, _TRACKS_SCAN)
  for (var i = 0; i < count && ids.length < _TRACKS; i++) {
    var track = data[i]
    if (!_isObject(track) || !_own(track, "type") || track.type !== "video") continue
    if (!_own(track, "external") || track.external !== true) continue
    if (!_own(track, "id") || !_isWhole(track.id, 1, _TRACK_MAX) || ids.indexOf(track.id) !== -1) continue
    ids.push(track.id)
  }
  return ids
}

// The selected video track: its id, or 0 for none. mpv reports "no video"
// as false.
function trackId(data) {
  return _isWhole(data, 1, _TRACK_MAX) ? data : 0
}

// Whether mpv has a picture: it describes one only while it shows one.
function hasPicture(data) {
  if (!_isObject(data) || !_own(data, "w") || !_own(data, "h")) return false
  return _isNumber(data.w) && data.w > 0 && _isNumber(data.h) && data.h > 0
}

// The outputs that may be selected, as { name, description }, in mpv's
// order. The description is whatever the device calls itself (a Bluetooth
// device chooses its own name), cut but not cleaned: whoever shows it
// cleans it.
function devices(data) {
  var list = []
  if (!Array.isArray(data)) return list
  var count = Math.min(data.length, _DEVICES_SCAN)
  for (var i = 0; i < count; i++) {
    var device = data[i]
    if (!_isObject(device) || !_own(device, "name") || !_isDeviceName(device.name)) continue
    var text = _own(device, "description") && typeof device.description === "string"
      ? device.description.slice(0, _DEVICE_TEXT_CHARS) : ""
    list.push({ name: device.name, description: text })
  }
  return list
}

// The output mpv plays on, or "" for anything that could not be selected.
function deviceName(data) {
  return _isDeviceName(data) ? data : ""
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
    playlistRemove: playlistRemove,
    streamRequestSize: streamRequestSize,
    videoAdd: videoAdd,
    setVid: setVid,
    setForceWindow: setForceWindow,
    setStopScreensaver: setStopScreensaver,
    setAudioDevice: setAudioDevice,
    quit: quit,
    encode: encode,
    feed: feed,
    parse: parse,
    entryId: entryId,
    playlistIds: playlistIds,
    videoTracks: videoTracks,
    trackId: trackId,
    hasPicture: hasPicture,
    devices: devices,
    deviceName: deviceName
  }
}
