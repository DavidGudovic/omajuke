.pragma library
.import "Clean.js" as Clean

// Audio outputs. mpv reports every device of every audio backend it was
// built with. This file reduces that report to the list the user chooses
// from (the system default and the PipeWire sinks), labels the entries, and
// owns every decision about them: which entry is current, which comes next
// when cycling, and what to fall back to when the chosen device is gone.
//
// A device name is an opaque token. It is tested against a pattern and
// then handed back exactly as it came, never trimmed, cleaned or rebuilt,
// because mpv has to recognise it again. A description is free text that a
// device can choose for itself (a Bluetooth headset names itself), so it is
// cleaned and cut before it becomes a label.

// mpv's name for "whatever the system default is", and the label it gets.
var AUTO = "auto"
var _AUTO_LABEL = "System default"

// A PipeWire sink as mpv names it: the backend, a slash, the node name.
// Other backends reach the same hardware by other routes and would only
// show every device several times.
var _SINK = /^pipewire\/[A-Za-z0-9._:+-]{1,200}$/
var _SINK_PREFIX = "pipewire/"

// Entries of mpv's report that are looked at, entries that are kept, and
// the length of a label in UTF-16 units.
var _SCAN = 256
var _MAX = 64
var _LABEL_CHARS = 80

// How much of a description is read. Real ones are far shorter, and the
// work of cleaning has to be bounded whatever arrives.
var _TEXT_CHARS = 1024

function _isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// Reads a key only when the object itself carries it, so that nothing
// inherited is ever taken for data.
function _own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined
}

function _isName(name) {
  return typeof name === "string" && (name === AUTO || _SINK.test(name))
}

// The label of an output. The system default has ours. A sink has its
// cleaned description, or its node name when the description is missing or
// cleans away to nothing: a row without any text could not be told from its
// neighbours. Cleaning a label a second time changes nothing.
function _label(name, description) {
  if (name === AUTO) return _AUTO_LABEL
  var text = typeof description === "string" ? description.slice(0, _TEXT_CHARS) : ""
  var label = Clean.text(text, _LABEL_CHARS)
  return label !== "" ? label : Clean.text(name.slice(_SINK_PREFIX.length), _LABEL_CHARS)
}

// Reads a list of outputs and returns what it offers as fresh { name, text }
// objects, text being whatever the entry gives for a label. An entry that
// is no output is dropped, and so is one whose name was already there: a
// name stands for one device, and an entry that repeats it would be flagged
// along with the first and would bring cycling to a halt. Every function
// below reads its list through here, so none of them depends on the caller
// having passed what filter() made.
function _outputs(list) {
  var outputs = []
  if (!Array.isArray(list)) return outputs
  var seen = Object.create(null)
  var count = Math.min(list.length, _MAX)
  for (var i = 0; i < count; i++) {
    var entry = list[i]
    if (!_isObject(entry)) continue
    var name = _own(entry, "name")
    if (!_isName(name) || seen[name] === true) continue
    seen[name] = true
    outputs.push({ name: name, text: _own(entry, "label") })
  }
  return outputs
}

function _indexOf(outputs, name) {
  for (var i = 0; i < outputs.length; i++) {
    if (outputs[i].name === name) return i
  }
  return -1
}

// Turns mpv's "audio-device-list" value into the list of outputs on offer:
// fresh { name, label } objects, the system default first when mpv lists
// it, then the PipeWire sinks in mpv's order, each name once. Anything
// that is not a list yields an empty one.
function filter(list) {
  var sinks = []
  if (!Array.isArray(list)) return sinks
  var seen = Object.create(null)
  var auto = false
  var count = Math.min(list.length, _SCAN)
  for (var i = 0; i < count; i++) {
    var entry = list[i]
    if (!_isObject(entry)) continue
    var name = _own(entry, "name")
    if (name === AUTO) {
      auto = true
      continue
    }
    if (typeof name !== "string" || !_SINK.test(name) || seen[name] === true) continue
    // One place is kept for the system default, wherever mpv lists it.
    if (sinks.length >= _MAX - 1) continue
    seen[name] = true
    sinks.push({ name: name, label: _label(name, _own(entry, "description")) })
  }
  return auto ? [{ name: AUTO, label: _AUTO_LABEL }].concat(sinks) : sinks
}

// The same list as fresh { name, label, current } objects, current being
// true for the entry mpv is using. No entry is flagged while mpv uses a
// device that is not listed. The labels are made again from what the list
// says, so they are clean and bounded whoever made the list.
function mark(outputs, current) {
  return _outputs(outputs).map(function(output) {
    return { name: output.name, label: _label(output.name, output.text), current: output.name === current }
  })
}

// True when the name is on the list. Only a listed name is ever sent to
// mpv, which takes any text for a device name without complaint.
function has(outputs, name) {
  return typeof name === "string" && _indexOf(_outputs(outputs), name) !== -1
}

// The name of the entry after the current one, wrapping at the end, or the
// first entry when the current device is not on the list. "" when there is
// nothing to move to: an empty list, or one whose only entry is in use.
function next(outputs, current) {
  var list = _outputs(outputs)
  if (list.length === 0) return ""
  var index = _indexOf(list, current)
  if (index === -1) return list[0].name
  if (list.length === 1) return ""
  return list[(index + 1) % list.length].name
}

// Decides which device mpv should use, given the list on offer, the saved
// choice ("" for the system default) and the device mpv uses now. mpv does
// not let go of a device that has gone away: it keeps the name, whatever
// becomes of the sound. So when the saved device is not on the list the
// system default stands in ("fallback" is true), and the saved choice is
// taken up again the next time the list has it.
//
// Returns { device, send, fallback }: the device that should be in use,
// whether mpv has to be told, and whether the default is standing in. An
// empty list (mpv has not reported yet) decides nothing.
function plan(outputs, saved, active) {
  var list = _outputs(outputs)
  if (list.length === 0) return { device: "", send: false, fallback: false }
  var wanted = typeof saved === "string" && saved !== "" ? saved : AUTO
  var present = wanted === AUTO || _indexOf(list, wanted) !== -1
  var device = present ? wanted : AUTO
  return { device: device, send: active !== device, fallback: !present }
}

if (typeof module !== "undefined") {
  module.exports = { AUTO: AUTO, filter: filter, mark: mark, has: has, next: next, plan: plan }
}
