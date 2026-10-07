.pragma library

// Where the video window goes and how large it is. placement() turns what
// Hyprland reports about the focused monitor and the screen gaps, the two
// video settings and what was remembered for that monitor into a width (a
// whole percentage of the monitor's width), a corner and the distances from
// that corner's two edges. fromWindow() goes the other way for a window the
// user has moved or resized: the monitor it is on, the corner it is nearest
// to and how wide it is. Everything read here was printed by another
// program or loaded from disk. So every field is checked before it is used,
// every number that leaves is a whole number within fixed bounds, and
// neither function throws.

// ---- Bounds ----

// The window's width in percent of the monitor's width.
var _PCT_MIN = 10
var _PCT_MAX = 90

// Pixels between the window and an edge of its monitor.
var _MARGIN_MAX = 2000

// What a monitor list may hold before it stops looking like one. The sizes
// are far beyond any real desk and only keep the arithmetic in range.
var _MONITORS_MAX = 32
var _PIXELS_MAX = 65536
var _OFFSET_MAX = 1000000
var _SCALE_MIN = 0.25
var _SCALE_MAX = 8
var _GAP_MAX = 99999

// A monitor name is used as a key when a placement is stored. One that does
// not fit this shape is still a monitor to place the window on, but nothing
// is remembered for it.
var _NAME = /^[A-Za-z0-9_-]{1,32}$/

// One to four whole numbers of at most five digits, single spaces between
// them. Anchored at both ends, so it limits the length as well.
var _GAPS = /^-?[0-9]{1,5}(?: -?[0-9]{1,5}){0,3}$/

// ---- The two settings ----

var _SIZES = [
  { name: "sixth", pct: 17 },
  { name: "quarter", pct: 25 },
  { name: "third", pct: 33 },
  { name: "half", pct: 50 }
]

var _CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"]

// ---- Small checks ----

function _isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function _isInt(value, min, max) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value
    && value >= min && value <= max
}

function _isCorner(value) {
  return typeof value === "string" && _CORNERS.indexOf(value) !== -1
}

// Whatever is not above min becomes min itself. That includes a negative
// zero, which rounding a small negative number up produces and which JSON
// can spell: it must not travel on as one.
function _clamp(value, min, max) {
  return value > min ? (value > max ? max : value) : min
}

// How many entries a monitor list has, or -1 when the value is not a list
// or is longer than any monitor list. The length is asked for once: a loop
// that asks again each round never ends on a list that keeps answering
// with a larger number.
function _listed(monitors) {
  if (!Array.isArray(monitors)) return -1
  var count = monitors.length
  return _isInt(count, 0, _MONITORS_MAX) ? count : -1
}

// ---- Reading what Hyprland printed ----

// The space bars and docks take at each edge: [left, top, right, bottom].
function _reserved(value) {
  if (!Array.isArray(value) || value.length !== 4) return null
  var edges = []
  for (var i = 0; i < 4; i++) {
    var edge = value[i]
    if (typeof edge !== "number" || !isFinite(edge)) return null
    edges.push(edge)
  }
  return edges
}

// One entry of the monitor list, reduced to what is used here, or null when
// any part of it is not what a monitor entry holds: an entry that is wrong
// in one field is not trusted for the others.
function _monitor(entry) {
  if (!_isObject(entry)) return null
  var x = entry.x
  var y = entry.y
  var width = entry.width
  var height = entry.height
  var scale = entry.scale
  var transform = entry.transform
  var name = entry.name
  var reserved = _reserved(entry.reserved)
  if (reserved === null || !_isInt(transform, 0, 7)) return null
  if (!_isInt(x, -_OFFSET_MAX, _OFFSET_MAX) || !_isInt(y, -_OFFSET_MAX, _OFFSET_MAX)) return null
  if (!_isInt(width, 1, _PIXELS_MAX) || !_isInt(height, 1, _PIXELS_MAX)) return null
  if (typeof scale !== "number" || !(scale >= _SCALE_MIN && scale <= _SCALE_MAX)) return null

  // The list gives the panel's own pixels. Positions and window sizes are
  // in the units the desktop is laid out in: the two sides change places on
  // a monitor turned a quarter (the odd transforms), then shrink by the
  // scale.
  var turned = transform % 2 === 1
  var logicalWidth = Math.round((turned ? height : width) / scale)
  var logicalHeight = Math.round((turned ? width : height) / scale)
  if (logicalWidth < 1 || logicalHeight < 1) return null
  return {
    name: typeof name === "string" && _NAME.test(name) ? name : "",
    x: x,
    y: y,
    width: logicalWidth,
    height: logicalHeight,
    reserved: reserved
  }
}

// The monitor Hyprland marks as focused, which is where a new window opens.
// Null when the value is not a monitor list, when it marks none or more
// than one, or when the marked entry cannot be read.
function _focused(monitors) {
  var count = _listed(monitors)
  var found = null
  for (var i = 0; i < count; i++) {
    // Read once: the entry that says it is focused is the entry used.
    var entry = monitors[i]
    if (!_isObject(entry) || entry.focused !== true) continue
    if (found !== null) return null
    found = entry
  }
  return _monitor(found)
}

// Hyprland's answer for the gaps between windows and the screen edge:
// { css: "top right bottom left" }, where fewer than four numbers are the
// usual CSS shorthand, or { int: n } for all four edges. Returns the gaps
// in the order of a reserved area, [left, top, right, bottom], or null.
function _gaps(option) {
  if (!_isObject(option)) return null
  var css = option.css
  var all = option.int
  if (typeof css === "string") {
    if (!_GAPS.test(css)) return null
    var parts = css.split(" ")
    var top = Number(parts[0])
    var right = parts.length > 1 ? Number(parts[1]) : top
    var bottom = parts.length > 2 ? Number(parts[2]) : top
    var left = parts.length > 3 ? Number(parts[3]) : right
    return [left, top, right, bottom]
  }
  return _isInt(all, -_GAP_MAX, _GAP_MAX) ? [all, all, all, all] : null
}

// What is stored for a monitor, or null. The table is indexed by a name
// Hyprland printed, and "constructor" is a possible monitor name: only an
// entry the table itself holds counts.
function _stored(table, name) {
  if (name === "" || !_isObject(table)) return null
  if (!Object.prototype.hasOwnProperty.call(table, name)) return null
  var entry = table[name]
  return _isObject(entry) ? entry : null
}

// The distance to keep from one edge: what is reserved there plus the gap.
// A fraction is rounded up, so the window stays clear of a bar.
function _margin(reserved, gap) {
  return _clamp(Math.ceil(reserved + gap), 0, _MARGIN_MAX)
}

function _sizeNamed(name) {
  for (var i = 0; i < _SIZES.length; i++) {
    if (_SIZES[i].name === name) return _SIZES[i]
  }
  return null
}

// ---- Reading a window ----

function _pair(value, min, max) {
  if (!Array.isArray(value) || value.length !== 2) return null
  var first = value[0]
  var second = value[1]
  return _isInt(first, min, max) && _isInt(second, min, max) ? [first, second] : null
}

// Position and size of a window from Hyprland's client list, or null. A
// tiled or fullscreen window has the size the layout gave it, which says
// nothing about where the user wants the video.
function _box(win) {
  if (!_isObject(win)) return null
  var at = _pair(win.at, -_OFFSET_MAX, _OFFSET_MAX)
  var size = _pair(win.size, 1, _PIXELS_MAX)
  var floating = win.floating
  var fullscreen = win.fullscreen
  if (at === null || size === null) return null
  if (floating === false || fullscreen === true) return null
  if (typeof fullscreen === "number" && fullscreen !== 0) return null
  return { x: at[0], y: at[1], width: size[0], height: size[1] }
}

// Whether the centre of the box lies on the monitor. Everything is doubled
// so that the centre of an odd-sized window is still a whole number.
function _holdsCentre(monitor, box) {
  var cx = 2 * box.x + box.width
  var cy = 2 * box.y + box.height
  return cx >= 2 * monitor.x && cx < 2 * (monitor.x + monitor.width)
    && cy >= 2 * monitor.y && cy < 2 * (monitor.y + monitor.height)
}

// The corner of the monitor the box is nearest to: the quarter its centre
// lies in. A window exactly in the middle counts as bottom-right.
function _nearestCorner(monitor, box) {
  var left = 2 * box.x + box.width < 2 * monitor.x + monitor.width
  var top = 2 * box.y + box.height < 2 * monitor.y + monitor.height
  return (top ? "top" : "bottom") + "-" + (left ? "left" : "right")
}

// ---- The two answers ----

// placement() without its guard.
function _placement(monitors, gapsOption, settings, remembered) {
  var monitor = _focused(monitors)
  var gaps = _gaps(gapsOption)
  if (monitor === null || gaps === null || !_isObject(settings)) return { ok: false }
  var size = _sizeNamed(settings.videoSize)
  var corner = settings.videoCorner
  if (size === null || !_isCorner(corner)) return { ok: false }
  var pct = size.pct

  var stored = _stored(remembered, monitor.name)
  if (stored !== null) {
    var storedPct = stored.widthPct
    var storedCorner = stored.corner
    if (_isInt(storedPct, _PCT_MIN, _PCT_MAX)) pct = storedPct
    if (_isCorner(storedCorner)) corner = storedCorner
  }

  var atLeft = corner === "top-left" || corner === "bottom-left"
  var atTop = corner === "top-left" || corner === "top-right"
  return {
    ok: true,
    pct: pct,
    corner: corner,
    marginX: atLeft ? _margin(monitor.reserved[0], gaps[0]) : _margin(monitor.reserved[2], gaps[2]),
    marginY: atTop ? _margin(monitor.reserved[1], gaps[1]) : _margin(monitor.reserved[3], gaps[3])
  }
}

// fromWindow() without its guard.
function _fromWindow(win, monitors) {
  var box = _box(win)
  var count = _listed(monitors)
  if (box === null) return { ok: false }
  for (var i = 0; i < count; i++) {
    var monitor = _monitor(monitors[i])
    if (monitor === null || !_holdsCentre(monitor, box)) continue
    if (monitor.name === "") return { ok: false }
    return {
      ok: true,
      name: monitor.name,
      corner: _nearestCorner(monitor, box),
      widthPct: _clamp(Math.round(100 * box.width / monitor.width), _PCT_MIN, _PCT_MAX)
    }
  }
  return { ok: false }
}

// ---- Public functions ----

// Both read values that came from outside, and such a value can refuse to
// be read at all (a wrapper around an object that is gone, say). Then the
// whole call is refused, the part that could not be read and whatever came
// with it: the answer is the plain refusal, never an error for the caller
// to trip over.

// Size and corner for the video window on the focused monitor.
//   monitors:   the parsed output of hyprctl -j monitors
//   gapsOption: the parsed output of hyprctl -j getoption general:gaps_out
//   settings:   { videoSize, videoCorner }
//   remembered: the stored table of monitor name -> { corner, widthPct },
//               or null
// Returns { ok: false }, or { ok: true, pct, corner, marginX, marginY }:
// pct is a whole number from 10 to 90, corner one of the four corner names,
// and the margins are whole numbers from 0 to 2000, measured from the
// vertical and the horizontal edge of that corner. A value remembered for
// the monitor wins over the setting it replaces. The margins are what is
// reserved at an edge plus the gap there, which is how the window stays
// clear of the bar. Nothing depends on the monitor's size: Hyprland works
// that in when the window opens.
function placement(monitors, gapsOption, settings, remembered) {
  try {
    return _placement(monitors, gapsOption, settings, remembered)
  } catch (error) {
    return { ok: false }
  }
}

// What to remember about a window the user placed.
//   win:      one entry of the parsed output of hyprctl -j clients
//   monitors: the parsed output of hyprctl -j monitors
// Returns { ok: false }, or { ok: true, name, corner, widthPct }: the
// monitor that holds the window's centre (a client's own monitor field can
// be out of date after a drag; of overlapping monitors the first listed
// wins), the corner the window is nearest to, and its width as a whole
// percentage of that monitor's width, from 10 to 90. Not ok when the centre
// is on no monitor or the monitor's name cannot serve as a key.
function fromWindow(win, monitors) {
  try {
    return _fromWindow(win, monitors)
  } catch (error) {
    return { ok: false }
  }
}

if (typeof module !== "undefined") {
  module.exports = { placement: placement, fromWindow: fromWindow }
}
