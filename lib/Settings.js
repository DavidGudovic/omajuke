.pragma library
.import "Const.js" as Const

// The plugin's settings: which ones exist, their defaults, the values each
// accepts, and the pure half of reading and writing the entry Omarchy keeps
// for the plugin in shell.json. core/SettingsStore.qml holds the snapshot
// and talks to the host; everything that decides a value is here.
//
// The entry is outside text: the user edits it, `omarchy bar set` stores
// plain strings in it, and other tools may add keys. So it is copied key by
// key into a table without a prototype, every setting is read through its
// own reader, and a value no reader accepts counts as not set. A setting
// only ever selects from a fixed list; none is put into a command line.

// ---- The table ----

// The three choices that decide what is kept or sent without being asked
// for. Their defaults are the less private value, and the host deletes the
// whole entry when the plugin is disabled, so the state file keeps a copy
// of what the user chose: a re-enabled plugin must not undo an opt-out.
var MIRRORED = Object.freeze(["rememberHistory", "preload", "autoplay"])

// The corners of the screen the video window can sit in.
var CORNERS = Object.freeze(["top-left", "top-right", "bottom-left", "bottom-right"])

var _SIZES = ["sixth", "quarter", "third", "half"]
var _HEIGHTS = [480, 720, 1080]
var _HEIGHT_TEXTS = ["480", "720", "1080"]

var DEFAULTS = Object.freeze({
  autoplay: true,
  maxHeight: 720,
  videoSize: "quarter",
  videoCorner: "bottom-right",
  keepAwake: true,
  sponsorSkip: "ask",
  markWatched: false,
  evenVolume: false,
  rememberHistory: true,
  preload: true
})

// What holds until the real settings are known: nothing is remembered,
// looked up ahead of time, played on its own or reported to an account
// because of a default. The rest cannot give anything away.
var CONSERVATIVE = Object.freeze({
  autoplay: false,
  maxHeight: 720,
  videoSize: "quarter",
  videoCorner: "bottom-right",
  keepAwake: true,
  sponsorSkip: "ask",
  markWatched: false,
  evenVolume: false,
  rememberHistory: false,
  preload: false
})

// Keys the host reads itself. A layout entry that carries type, exec or
// source is taken for a custom module and the widget stops loading, so
// they are never written back.
var _RESERVED = ["id", "type", "exec", "source"]

// What is taken over from an entry: short plain names with short plain
// values. Nothing nested, and no name that could mean something to an
// object (the pattern has no underscore, so no "__proto__").
var _KEY = /^[A-Za-z][A-Za-z0-9]{0,31}$/
var _VALUE_CHARS = 64

var _SECTIONS = ["left", "center", "right"]

// ---- Readers ----

// Each reader turns a stored value into the typed one, or into undefined
// when it is not a value that setting accepts.

// `omarchy bar set` stores what it is given as text, so the two words count
// as well as the two booleans.
function _bool(value) {
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  return undefined
}

function _height(value) {
  if (_HEIGHTS.indexOf(value) !== -1) return value
  return _HEIGHT_TEXTS.indexOf(value) !== -1 ? Number(value) : undefined
}

function _size(value) {
  return _SIZES.indexOf(value) !== -1 ? value : undefined
}

function _corner(value) {
  return CORNERS.indexOf(value) !== -1 ? value : undefined
}

// Stored as a boolean, read as one of three words: until the user has
// answered, the setting is absent and reads "ask".
function _skip(value) {
  var on = _bool(value)
  if (on === undefined) return undefined
  return on ? "on" : "off"
}

function _readers() {
  var table = new Map()
  table.set("autoplay", _bool)
  table.set("maxHeight", _height)
  table.set("videoSize", _size)
  table.set("videoCorner", _corner)
  table.set("keepAwake", _bool)
  table.set("sponsorSkip", _skip)
  table.set("markWatched", _bool)
  table.set("evenVolume", _bool)
  table.set("rememberHistory", _bool)
  table.set("preload", _bool)
  return table
}

var _READERS = _readers()

// The typed value a stored value stands for, or undefined when key is not a
// setting or the value is not one it accepts.
function _typed(key, value) {
  var read = _READERS.get(key)
  return read === undefined ? undefined : read(value)
}

// The form a typed value is stored in: itself, except for sponsorSkip.
function _stored(key, typed) {
  return key === "sponsorSkip" ? typed === "on" : typed
}

// ---- Tables without a prototype ----

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

// Sets a key on a table. The key lands on the table itself whatever it is
// called: no name is special to defineProperty.
function _put(table, key, value) {
  Object.defineProperty(table, key, { value: value, enumerable: true, writable: true, configurable: true })
}

function _isPlain(value) {
  if (typeof value === "boolean") return true
  if (typeof value === "number") return isFinite(value)
  return typeof value === "string" && value.length <= _VALUE_CHARS
}

// Copies the plain keys source holds itself onto table, in their order. At
// most Const.LIMITS.settingsKeys are taken, and a setting of ours always is
// among them: an entry crowded with other keys cannot push an opt-out out.
function _take(table, source) {
  if (!_isObject(source)) return
  var keys = Object.keys(source)
  var room = Const.LIMITS.settingsKeys
  for (var k = 0; k < keys.length; k++) {
    if (_READERS.has(keys[k])) room--
  }
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    var value = _own(source, key)
    if (!_KEY.test(key) || !_isPlain(value)) continue
    if (!_READERS.has(key)) {
      if (room <= 0) continue
      room--
    }
    _put(table, key, value)
  }
}

// ---- Reading the entry ----

// Finds the plugin's entry in a bar configuration: the first element of
// layout.left, .center or .right that is an object with the id as its own
// "id". Returns a copy of it as a table without a prototype, or null when
// there is none.
function extract(barConfig, id) {
  if (typeof id !== "string" || id === "") return null
  var layout = _own(barConfig, "layout")
  for (var s = 0; s < _SECTIONS.length; s++) {
    var list = _own(layout, _SECTIONS[s])
    if (!Array.isArray(list)) continue
    for (var i = 0; i < list.length; i++) {
      if (_own(list[i], "id") !== id) continue
      var found = Object.create(null)
      _take(found, list[i])
      return found
    }
  }
  return null
}

// One setting: a change that is on its way to the host, else what the entry
// says, else (for the mirrored three) what the state file remembers, else
// the default. A value its reader does not accept counts as absent at every
// step, so a damaged entry falls back to the remembered choice and not to
// the less private default.
function _value(key, raw, mirror, pending) {
  var typed = _typed(key, _own(pending, key))
  if (typed === undefined) typed = _typed(key, _own(raw, key))
  if (typed === undefined && MIRRORED.indexOf(key) !== -1) {
    var remembered = _own(mirror, key)
    if (typeof remembered === "boolean") typed = remembered
  }
  return typed === undefined ? _own(DEFAULTS, key) : typed
}

// The complete typed settings. raw is the entry as extract() returned it,
// mirror the remembered choices of the state file, pending the changes sent
// to the host that the entry does not show yet. Until both the entry and
// the state file have been seen (known), the answer is CONSERVATIVE.
function coerce(raw, mirror, pending, known) {
  if (known !== true) return CONSERVATIVE
  return {
    autoplay: _value("autoplay", raw, mirror, pending),
    maxHeight: _value("maxHeight", raw, mirror, pending),
    videoSize: _value("videoSize", raw, mirror, pending),
    videoCorner: _value("videoCorner", raw, mirror, pending),
    keepAwake: _value("keepAwake", raw, mirror, pending),
    sponsorSkip: _value("sponsorSkip", raw, mirror, pending),
    markWatched: _value("markWatched", raw, mirror, pending),
    evenVolume: _value("evenVolume", raw, mirror, pending),
    rememberHistory: _value("rememberHistory", raw, mirror, pending),
    preload: _value("preload", raw, mirror, pending)
  }
}

// The privacy choices an entry makes itself: each of MIRRORED that it sets
// to an accepted value, typed. What it leaves out is left out here.
function choices(raw) {
  var made = Object.create(null)
  for (var i = 0; i < MIRRORED.length; i++) {
    var chosen = _bool(_own(raw, MIRRORED[i]))
    if (chosen !== undefined) _put(made, MIRRORED[i], chosen)
  }
  return made
}

// ---- Writing the entry ----

// The entry to hand to the host for one change, or null when key is not a
// setting or value is not one it accepts. The host replaces the entry with
// what it is given, so this is the whole of it: the id, every key the entry
// had except the reserved ones, and the change in its stored form.
function withChange(raw, key, value) {
  var typed = _typed(key, value)
  if (typed === undefined) return null
  var kept = Object.create(null)
  _take(kept, raw)
  var entry = Object.create(null)
  entry.id = Const.PLUGIN_ID
  var names = Object.keys(kept)
  for (var i = 0; i < names.length; i++) {
    if (_RESERVED.indexOf(names[i]) === -1) _put(entry, names[i], _own(kept, names[i]))
  }
  _put(entry, key, _stored(key, typed))
  return entry
}

// raw with the keys of pending laid over it, as a fresh table. The next
// change is built on this, so that one which is still on its way to the
// host is not undone by the entry being replaced a second time.
function overlay(raw, pending) {
  var merged = Object.create(null)
  _take(merged, raw)
  _take(merged, pending)
  return merged
}

// How many earlier changes of one setting are remembered while they are
// on their way. Stepping through a choice with the arrow keys sends one
// change per press, and the host shows them one after the other.
var SENT_MAX = 16

// True when value means the same as one of the earlier changes of key in
// sent (a table of key -> list of stored values, as earlierSent builds it).
function _sentBefore(sent, key, value) {
  var list = _own(sent, key)
  if (!Array.isArray(list)) return false
  var count = Math.min(list.length, SENT_MAX)
  for (var i = 0; i < count; i++) {
    if (_typed(key, list[i]) === value) return true
  }
  return false
}

// The changes that are still on their way: pending without every key the
// entry has caught up with or moved on from. raw is the entry as it reads
// now, before as it read until now, and sent (optional) the earlier
// changes of each key that were handed to the host before the one pending
// now. A key is settled when raw means the same as the change (compared as
// typed values: the host may hand back "true" where true was sent), unless
// an earlier change of ours meant the same and the host may be showing that
// one: stepping A, B and back to A shows A, B, A. It stays when raw shows
// one of our own earlier changes: the host is still catching up, and the
// newest change is behind it. It is given up when raw has changed it to
// anything else: someone changed the same setting after us, and the entry
// is what counts.
function unsettled(pending, raw, before, sent) {
  var left = Object.create(null)
  if (!_isObject(pending)) return left
  var keys = Object.keys(pending)
  for (var i = 0; i < keys.length; i++) {
    var wanted = _typed(keys[i], _own(pending, keys[i]))
    var shown = _typed(keys[i], _own(raw, keys[i]))
    if (wanted === undefined) continue
    if (shown === wanted && !_sentBefore(sent, keys[i], shown)) continue
    if (shown === wanted || shown === _typed(keys[i], _own(before, keys[i])) ||
      _sentBefore(sent, keys[i], shown)) {
      _put(left, keys[i], _own(pending, keys[i]))
    }
  }
  return left
}

// The earlier changes to remember after one more change of key: sent with
// the change that was pending for key until now added to that key's list,
// and every key that is no longer pending left out. A fresh table; the
// oldest entries of a list make room beyond SENT_MAX.
function earlierSent(sent, pending, key) {
  var next = Object.create(null)
  if (!_isObject(pending)) return next
  var keys = Object.keys(pending)
  for (var i = 0; i < keys.length; i++) {
    if (!_READERS.has(keys[i])) continue
    var list = _own(sent, keys[i])
    var kept = Array.isArray(list) ? list.slice(Math.max(0, list.length - SENT_MAX)) : []
    var copy = []
    for (var j = 0; j < kept.length; j++) {
      if (_isPlain(kept[j])) copy.push(kept[j])
    }
    if (keys[i] === key) {
      copy.push(_own(pending, keys[i]))
      if (copy.length > SENT_MAX) copy = copy.slice(copy.length - SENT_MAX)
    }
    if (copy.length > 0) _put(next, keys[i], copy)
  }
  return next
}

// The earlier changes still to come after the host has shown raw: for each
// key, its list without the first change that means what raw shows and
// every change before that one. The host shows our changes in the order
// they were sent, so those are behind it. A fresh table.
function echoed(sent, raw) {
  var next = Object.create(null)
  if (!_isObject(sent)) return next
  var keys = Object.keys(sent)
  for (var i = 0; i < keys.length; i++) {
    var list = _own(sent, keys[i])
    if (!_READERS.has(keys[i]) || !Array.isArray(list)) continue
    var shown = _typed(keys[i], _own(raw, keys[i]))
    var from = 0
    for (var j = 0; j < list.length; j++) {
      if (shown !== undefined && _typed(keys[i], list[j]) === shown) {
        from = j + 1
        break
      }
    }
    var copy = []
    for (j = from; j < list.length; j++) {
      if (_isPlain(list[j])) copy.push(list[j])
    }
    if (copy.length > 0) _put(next, keys[i], copy)
  }
  return next
}

if (typeof module !== "undefined") {
  module.exports = {
    MIRRORED: MIRRORED,
    CORNERS: CORNERS,
    DEFAULTS: DEFAULTS,
    CONSERVATIVE: CONSERVATIVE,
    extract: extract,
    coerce: coerce,
    choices: choices,
    withChange: withChange,
    overlay: overlay,
    unsettled: unsettled,
    earlierSent: earlierSent,
    echoed: echoed,
    SENT_MAX: SENT_MAX
  }
}
