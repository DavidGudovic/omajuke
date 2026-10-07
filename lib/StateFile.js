.pragma library
.import "Const.js" as Const
.import "Clean.js" as Clean
.import "Settings.js" as Settings
.import "Track.js" as Track

// The format of state.json, version 1: what OmaJuke remembers about its
// user between sessions. (The one other personal file, the saved login of
// a sign-in, is written by a helper and never read by the plugin.) This
// file owns what may be in state.json and nothing else does:
// reading builds a fresh state key by key from text that is treated like
// any other outside input, and writing builds the text from a state that is
// validated once more, so nothing unchecked is ever kept or saved.
//
// Never in the file: search text, media addresses, paths, account names,
// times or play counts. Nothing is copied into it from the lists of an
// account either. A track the user played or queued from such a list is in
// it all the same, as what it then is: a played or queued track like any
// other, which signing out does not remove. With history switched off,
// recents and queue are left out of it altogether.
//
// A state, as defaults() returns it, always has all of these keys:
//   volume        whole number 0..100
//   muted         boolean
//   proxyAck      boolean: the notice about a session proxy was answered
//   prefs         the privacy choices of Settings.MIRRORED the user made,
//                 as booleans, in a table without a prototype
//   recents       tracks, most recent first, each id once
//   queue         { items: tracks that also carry "auto", index }
//   video         monitor name -> { corner, widthPct }, a table without a
//                 prototype (a monitor may be called "constructor")
//   shortcuts     { panel, video, output, dirty }: key combinations as the
//                 user assigned them. They are inert text here and are
//                 parsed again at the moment they are used
//   outputDevice  name of the chosen audio output, "" for the default

var _VERSION = 1

var _DEFAULT_VOLUME = 70

// The file is read through the process runner, which decodes its input
// chunk by chunk and so damages any multi-byte character that straddles two
// chunks. Titles would come back garbled and be saved again. The file is
// therefore written in ASCII, and text that is not ASCII is refused unread.
var _NOT_ASCII = /[^\n\x20-\x7e]/
var _NOT_PRINTABLE_ASCII = /[^\x20-\x7e]/g

// A monitor name as Hyprland reports it ("DP-1", "HDMI-A-1", "eDP-1").
var _MONITOR = /^[A-Za-z0-9_-]{1,32}$/
var _MONITORS = 8
var _WIDTH_MIN = 10
var _WIDTH_MAX = 90
var _COMBO_CHARS = 64
var _DEVICE_CHARS = 256

// ---- Reading single values ----

function _isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// The value of a key the object holds itself, or undefined. Nothing
// inherited is read, and a member that computes its value is not run.
function _own(object, key) {
  if (!_isObject(object)) return undefined
  var own = Object.getOwnPropertyDescriptor(object, key)
  return own === undefined ? undefined : own.value
}

// True when the object holds the key itself, as a plain value.
function _has(object, key) {
  if (!_isObject(object)) return false
  var own = Object.getOwnPropertyDescriptor(object, key)
  return own !== undefined && "value" in own
}

// Sets a key on a table. The key lands on the table itself whatever it is
// called: no name is special to defineProperty.
function _put(table, key, value) {
  Object.defineProperty(table, key, { value: value, enumerable: true, writable: true, configurable: true })
}

function _isWhole(value) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value
}

function _volume(value) {
  if (typeof value !== "number" || !isFinite(value)) return _DEFAULT_VOLUME
  return Math.max(0, Math.min(100, Math.round(value)))
}

function _prefs(value) {
  var prefs = Object.create(null)
  for (var i = 0; i < Settings.MIRRORED.length; i++) {
    var chosen = _own(value, Settings.MIRRORED[i])
    if (typeof chosen === "boolean") _put(prefs, Settings.MIRRORED[i], chosen)
  }
  return prefs
}

// The first Const.LIMITS.recents valid tracks, each id once.
function _recents(value) {
  var tracks = []
  if (!Array.isArray(value)) return tracks
  var seen = new Map()
  for (var i = 0; i < value.length && tracks.length < Const.LIMITS.recents; i++) {
    var track = Track.fromStored(value[i])
    if (track === null || seen.has(track.id)) continue
    seen.set(track.id, true)
    tracks.push(track)
  }
  return tracks
}

// The first Const.LIMITS.queueItems valid items. The same video may be
// queued twice. The index names the current item, or is -1 for none.
function _queue(value) {
  var items = []
  var list = _own(value, "items")
  if (Array.isArray(list)) {
    for (var i = 0; i < list.length && items.length < Const.LIMITS.queueItems; i++) {
      var track = Track.fromStored(list[i])
      if (track === null) continue
      items.push({
        id: track.id,
        title: track.title,
        channel: track.channel,
        duration: track.duration,
        live: track.live,
        auto: _own(list[i], "auto") === true
      })
    }
  }
  var index = _own(value, "index")
  if (!_isWhole(index)) index = -1
  index = Math.max(-1, Math.min(items.length - 1, index))
  // JSON can spell a negative zero, and it must not travel on as one.
  return { items: items, index: index === 0 ? 0 : index }
}

// Where the video window was last left on a monitor. An entry is kept only
// when every part of it is valid.
function _video(value) {
  var table = Object.create(null)
  if (!_isObject(value)) return table
  var names = Object.keys(value)
  var kept = 0
  for (var i = 0; i < names.length && kept < _MONITORS; i++) {
    var place = _own(value, names[i])
    var corner = _own(place, "corner")
    var widthPct = _own(place, "widthPct")
    if (!_MONITOR.test(names[i]) || Settings.CORNERS.indexOf(corner) === -1) continue
    if (!_isWhole(widthPct) || widthPct < _WIDTH_MIN || widthPct > _WIDTH_MAX) continue
    _put(table, names[i], { corner: corner, widthPct: widthPct })
    kept++
  }
  return table
}

function _combo(value) {
  return typeof value === "string" && value.length <= _COMBO_CHARS ? value : ""
}

function _shortcuts(value) {
  return {
    panel: _combo(_own(value, "panel")),
    video: _combo(_own(value, "video")),
    output: _combo(_own(value, "output")),
    dirty: _own(value, "dirty") === true
  }
}

function _outputDevice(value) {
  if (typeof value !== "string" || value.length > _DEVICE_CHARS || Clean.hasControl(value)) return ""
  return value
}

// A complete state made of whatever valid parts data holds; every part
// that is missing or wrong is its default.
function _read(data) {
  return {
    volume: _volume(_own(data, "volume")),
    muted: _own(data, "muted") === true,
    proxyAck: _own(data, "proxyAck") === true,
    prefs: _prefs(_own(data, "prefs")),
    recents: _recents(_own(data, "recents")),
    queue: _queue(_own(data, "queue")),
    video: _video(_own(data, "video")),
    shortcuts: _shortcuts(_own(data, "shortcuts")),
    outputDevice: _outputDevice(_own(data, "outputDevice"))
  }
}

// ---- The state ----

// The state of a first start.
function defaults() {
  return _read(null)
}

// Reads the text of a state file. Returns { ok: false } when it is too
// long, not ASCII, not JSON, not an object or not version 1, and else
// { ok: true, state }. Keys this version does not know are dropped.
function parse(text) {
  if (typeof text !== "string" || text.length > Const.LIMITS.stateBytes || _NOT_ASCII.test(text)) {
    return { ok: false }
  }
  var data
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { ok: false }
  }
  if (!_isObject(data) || _own(data, "version") !== _VERSION) return { ok: false }
  return { ok: true, state: _read(data) }
}

// A new state with every key of the state that changes names replaced by
// its validated value. The other keys are carried over as the same objects,
// so whoever watches one of them sees no change. Returns null when changes
// names no key of the state.
function withChanges(state, changes) {
  var named = 0
  var take = function(key, read) {
    if (_has(changes, key)) {
      named++
      return read(_own(changes, key))
    }
    var kept = _own(state, key)
    return kept === undefined ? read(undefined) : kept
  }
  var bool = function(value) { return value === true }
  var next = {
    volume: take("volume", _volume),
    muted: take("muted", bool),
    proxyAck: take("proxyAck", bool),
    prefs: take("prefs", _prefs),
    recents: take("recents", _recents),
    queue: take("queue", _queue),
    video: take("video", _video),
    shortcuts: take("shortcuts", _shortcuts),
    outputDevice: take("outputDevice", _outputDevice)
  }
  return named > 0 ? next : null
}

function _escape(unit) {
  return "\\u" + ("0000" + unit.charCodeAt(0).toString(16)).slice(-4)
}

// What is written for a state. The keys of features that were never used
// are left out, so the file holds no more than it has to; parse() reads
// their absence as the default.
function _document(state, persistHistory) {
  var doc = {
    version: _VERSION,
    volume: state.volume,
    muted: state.muted,
    proxyAck: state.proxyAck,
    prefs: state.prefs
  }
  if (persistHistory) {
    doc.recents = state.recents
    doc.queue = state.queue
  }
  if (Object.keys(state.video).length > 0) doc.video = state.video
  var keys = state.shortcuts
  if (keys.panel !== "" || keys.video !== "" || keys.output !== "" || keys.dirty) doc.shortcuts = keys
  if (state.outputDevice !== "") doc.outputDevice = state.outputDevice
  return doc
}

// The text of the state file for a state, without the final newline. It is
// one line of printable ASCII: every other UTF-16 unit is written as a
// \uXXXX escape. With persistHistory false, recents and queue are not in
// it at all.
//
// The file must stay readable through a read capped at stateBytes. The caps
// on the lists keep it far below that; should it ever not fit, the oldest
// recents go first, then queue items from the end.
function serialize(state, persistHistory) {
  var clean = _read(state)
  var history = persistHistory === true
  var limit = Const.LIMITS.stateBytes - 1
  var text = JSON.stringify(_document(clean, history)).replace(_NOT_PRINTABLE_ASCII, _escape)
  while (history && text.length > limit && clean.recents.length + clean.queue.items.length > 0) {
    if (clean.recents.length > 0) clean.recents.pop()
    else clean.queue.items.pop()
    clean.queue.index = Math.min(clean.queue.index, clean.queue.items.length - 1)
    text = JSON.stringify(_document(clean, history)).replace(_NOT_PRINTABLE_ASCII, _escape)
  }
  return text
}

if (typeof module !== "undefined") {
  module.exports = { defaults: defaults, parse: parse, withChanges: withChanges, serialize: serialize }
}
