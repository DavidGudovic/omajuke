.pragma library

// Input and expectation table for lib/Geometry.js: where the video window
// is placed for a monitor list, a gap setting, the two video settings and a
// remembered placement, and what is remembered about a window the user put
// somewhere. Every monitor, window and name here is made up. Most rows are
// what another program should never print but might: each of them has to
// end in a plain refusal or in whole numbers within bounds. The same table
// runs under node and inside Qt's JavaScript engine.

// A copy of base with the fields of changes on top.
function _with(base, changes) {
  var copy = {}
  var key
  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) copy[key] = base[key]
  }
  for (key in changes) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) copy[key] = changes[key]
  }
  return copy
}

// One entry of a monitor list: full HD, unscaled, upright, focused, with a
// bar of 30 pixels at the top. The fields that are not used are there
// because a real entry has them.
function _monitor(changes) {
  return _with({
    id: 0, name: "HDMI-A-1", description: "Example Display", width: 1920, height: 1080, x: 0, y: 0,
    scale: 1, transform: 0, focused: true, reserved: [0, 30, 0, 0], disabled: false
  }, changes)
}

// One entry of a client list: the video window, a quarter of that monitor
// wide, near its bottom-right corner.
function _window(changes) {
  return _with({
    address: "0xaaaaaaaaaaaa", class: "OmaJuke", title: "OmaJuke", at: [1430, 800], size: [480, 270],
    floating: true, pinned: true, fullscreen: 0, monitor: 0
  }, changes)
}

function _times(value, count) {
  var list = []
  for (var i = 0; i < count; i++) list.push(value)
  return list
}

var _ONE = [_monitor({})]
var _GAPS = { option: "general:gaps_out", css: "10 10 10 10", set: true }
var _EDGES = { css: "1 2 3 4" }
var _SET = { videoSize: "quarter", videoCorner: "bottom-right" }
var _TOP_LEFT = { videoSize: "quarter", videoCorner: "top-left" }
var _NO = { ok: false }

// A monitor with something reserved at every edge, and a second monitor to
// the right of the usual one.
var _FRAMED = [_monitor({ reserved: [10, 20, 30, 40] })]
var _SECOND = _monitor({ id: 1, name: "DP-3", width: 1280, height: 1024, x: 1920, focused: false,
  reserved: [0, 0, 0, 50] })
var _PAIR = [_monitor({}), _SECOND]
var _PAIR_FOCUS_SECOND = [_monitor({ focused: false }), _with(_SECOND, { focused: true })]

var _KEPT = { "HDMI-A-1": { corner: "top-left", widthPct: 40 } }
var _DEFAULT = { ok: true, pct: 25, corner: "bottom-right", marginX: 10, marginY: 10 }
var _SEEN = { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 25 }

var MODULE = "Geometry"
var CASES = [
  // ---- placement: the size setting, the corner setting ----
  { fn: "placement", args: [_ONE, _GAPS, _SET, null], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "sixth", videoCorner: "bottom-right" }, null],
    expect: { ok: true, pct: 17, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "third", videoCorner: "bottom-right" }, null],
    expect: { ok: true, pct: 33, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "half", videoCorner: "bottom-right" }, null],
    expect: { ok: true, pct: 50, corner: "bottom-right", marginX: 10, marginY: 10 } },
  // At the top the window also stays clear of the bar.
  { fn: "placement", args: [_ONE, _GAPS, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: "top-right" }, null],
    expect: { ok: true, pct: 25, corner: "top-right", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: "bottom-left" }, null],
    expect: { ok: true, pct: 25, corner: "bottom-left", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: "bottom-right", more: 1 },
    null], expect: _DEFAULT },

  // ---- placement: each edge gets its own reserved space and its own gap ----
  // Gaps come as top, right, bottom, left; reserved space as left, top,
  // right, bottom.
  { fn: "placement", args: [_FRAMED, _EDGES, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 14, marginY: 21 } },
  { fn: "placement", args: [_FRAMED, _EDGES, { videoSize: "quarter", videoCorner: "top-right" }, null],
    expect: { ok: true, pct: 25, corner: "top-right", marginX: 32, marginY: 21 } },
  { fn: "placement", args: [_FRAMED, _EDGES, { videoSize: "quarter", videoCorner: "bottom-left" }, null],
    expect: { ok: true, pct: 25, corner: "bottom-left", marginX: 14, marginY: 43 } },
  { fn: "placement", args: [_FRAMED, _EDGES, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 32, marginY: 43 } },

  // ---- placement: fewer than four gaps are shorthand, one number may come alone ----
  { fn: "placement", args: [_ONE, { css: "5" }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 5, marginY: 5 } },
  { fn: "placement", args: [_ONE, { css: "5 7" }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 7, marginY: 5 } },
  { fn: "placement", args: [_ONE, { css: "5 7" }, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 7, marginY: 35 } },
  { fn: "placement", args: [_ONE, { css: "5 7 9" }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 7, marginY: 9 } },
  { fn: "placement", args: [_ONE, { css: "5 7 9" }, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 7, marginY: 35 } },
  { fn: "placement", args: [_ONE, { css: "0 0 0 0" }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 0, marginY: 0 } },
  { fn: "placement", args: [_ONE, { option: "general:gaps_out", int: 12, set: true }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 12, marginY: 12 } },
  { fn: "placement", args: [_ONE, { int: 0 }, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 0, marginY: 30 } },
  { fn: "placement", args: [_ONE, { css: null, int: 4 }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 4, marginY: 4 } },

  // ---- placement: a margin is a whole number from 0 to 2000 ----
  { fn: "placement", args: [_ONE, { css: "-5 -5 -5 -5" }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 0, marginY: 0 } },
  { fn: "placement", args: [_ONE, { css: "-5 -5 -5 -5" }, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 0, marginY: 25 } },
  { fn: "placement", args: [_ONE, { int: -99999 }, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 0, marginY: 0 } },
  { fn: "placement", args: [_ONE, { css: "99999" }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 2000, marginY: 2000 } },
  { fn: "placement", args: [_ONE, { css: "1990 2001 2000 0" }, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 2000, marginY: 2000 } },
  { fn: "placement", args: [_ONE, { css: "1990 0 0 0" }, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 0, marginY: 2000 } },
  { fn: "placement", args: [[_monitor({ reserved: [0, 30, 5000, 0] })], _GAPS, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 2000, marginY: 10 } },
  { fn: "placement", args: [[_monitor({ reserved: [0, 30, 0, 1e300] })], _GAPS, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 10, marginY: 2000 } },
  { fn: "placement", args: [[_monitor({ reserved: [-50, -1e300, 0, 0] })], _GAPS, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 0, marginY: 0 } },
  // Part of a pixel reserved counts as a whole one.
  { fn: "placement", args: [[_monitor({ reserved: [0.2, 30.5, 0, 0] })], { css: "4" }, _TOP_LEFT, null],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 5, marginY: 35 } },

  // ---- placement: what was remembered for the monitor wins, field by field ----
  { fn: "placement", args: [_ONE, _GAPS, _SET, _KEPT],
    expect: { ok: true, pct: 40, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "top-left" } }],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { widthPct: 90 } }],
    expect: { ok: true, pct: 90, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { widthPct: 10, corner: "bottom-right" } }],
    expect: { ok: true, pct: 10, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "DP-3": { corner: "top-left", widthPct: 40 } }],
    expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "hdmi-a-1": { corner: "top-left", widthPct: 40 } }],
    expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, {}], expect: _DEFAULT },
  // A stored value that is out of range or of the wrong kind is not there.
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "top-left", widthPct: 9 } }],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "top-left", widthPct: 91 } }],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "top-left", widthPct: 40.5 } }],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "top-left", widthPct: "40" } }],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "top-left", widthPct: 1e999 } }],
    expect: { ok: true, pct: 25, corner: "top-left", marginX: 10, marginY: 40 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "middle", widthPct: 40 } }],
    expect: { ok: true, pct: 40, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: "tl", widthPct: 40 } }],
    expect: { ok: true, pct: 40, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: 0, widthPct: 40 } }],
    expect: { ok: true, pct: 40, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": { corner: ["top-left"], widthPct: 40 } }],
    expect: { ok: true, pct: 40, corner: "bottom-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": "top-left" }], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": 40 }], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": null }], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, { "HDMI-A-1": ["top-left", 40] }], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, [{ corner: "top-left", widthPct: 40 }]], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, "HDMI-A-1"], expect: _DEFAULT },
  { fn: "placement", args: [_ONE, _GAPS, _SET, 40], expect: _DEFAULT },

  // ---- placement: a monitor may be called like something every object has ----
  { fn: "placement", args: [[_monitor({ name: "constructor" })], _GAPS, _SET, {}], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "toString" })], _GAPS, _SET, {}], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "hasOwnProperty" })], _GAPS, _SET, {}], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "__proto__" })], _GAPS, _SET, {}], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "__proto__" })], _GAPS, _SET, _KEPT], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "constructor" })], _GAPS, _SET,
    { constructor: { corner: "top-left", widthPct: 40 } }],
    expect: { ok: true, pct: 40, corner: "top-left", marginX: 10, marginY: 40 } },

  // ---- placement: a name that cannot be a key still names a monitor ----
  { fn: "placement", args: [[_monitor({ name: "Odd Name" })], _GAPS, _SET,
    { "Odd Name": { corner: "top-left", widthPct: 40 } }], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "" })], _GAPS, _SET,
    { "": { corner: "top-left", widthPct: 40 } }], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "HDMI-A-1\n" })], _GAPS, _SET, _KEPT], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })], _GAPS, _SET, null],
    expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: 7 })], _GAPS, _SET,
    { "7": { corner: "top-left", widthPct: 40 } }], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ name: null })], _GAPS, _SET, null], expect: _DEFAULT },

  // ---- placement: the focused monitor counts, whatever its size, scale and turn ----
  { fn: "placement", args: [_PAIR, _GAPS, _SET, null], expect: _DEFAULT },
  { fn: "placement", args: [_PAIR_FOCUS_SECOND, _GAPS, _SET, null],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 10, marginY: 60 } },
  { fn: "placement", args: [_PAIR_FOCUS_SECOND, _GAPS, _SET, _KEPT],
    expect: { ok: true, pct: 25, corner: "bottom-right", marginX: 10, marginY: 60 } },
  { fn: "placement", args: [_PAIR_FOCUS_SECOND, _GAPS, _SET,
    { "DP-3": { corner: "top-right", widthPct: 60 } }],
    expect: { ok: true, pct: 60, corner: "top-right", marginX: 10, marginY: 10 } },
  { fn: "placement", args: [[_monitor({ width: 3840, height: 2160, scale: 1.5 })], _GAPS, _SET, null],
    expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ width: 2880, height: 1800, scale: 2 })], _GAPS, _SET, null],
    expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ scale: 0.25 })], _GAPS, _SET, null], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ scale: 8 })], _GAPS, _SET, null], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ transform: 1 })], _GAPS, _SET, null], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ transform: 7 })], _GAPS, _SET, null], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ x: -1920, y: -200 })], _GAPS, _SET, null], expect: _DEFAULT },
  { fn: "placement", args: [[_monitor({ width: 1, height: 1 })], _GAPS, _SET, null], expect: _DEFAULT },

  // ---- placement: not a monitor list, or no single focused monitor ----
  { fn: "placement", args: [null, _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [{}, _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [_monitor({}), _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: ["[]", _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [7, _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[null], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[7, "x", true], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[[_monitor({})]], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ focused: false })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ focused: "true" })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ focused: 1 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ focused: null })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({}), _monitor({ name: "DP-3", x: 1920 })], _GAPS, _SET, null],
    expect: _NO },
  { fn: "placement", args: [_times(_monitor({ focused: false }), 32).concat(_ONE), _GAPS, _SET, null],
    expect: _NO },
  { fn: "placement", args: [_times(_monitor({ focused: false }), 31).concat(_ONE), _GAPS, _SET, null],
    expect: _DEFAULT },
  { fn: "placement", args: [_times(null, 10000), _GAPS, _SET, null], expect: _NO },

  // ---- placement: a focused entry with a field that is not what a monitor has ----
  { fn: "placement", args: [[_monitor({ width: 0 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ width: -1920 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ width: 1920.5 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ width: "1920" })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ width: null })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ width: 1e999 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ width: 65537 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ height: 0 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ height: [1080] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ height: 1e999 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ scale: 0 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ scale: -1 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ scale: 0.2 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ scale: 8.5 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ scale: 1e999 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ scale: "1" })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ scale: null })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ transform: -1 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ transform: 8 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ transform: 1.5 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ transform: "0" })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ transform: null })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ x: null })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ x: 0.5 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ y: "0" })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ y: 1e999 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ y: -1000001 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: null })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: [] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: [0, 30, 0] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: [0, 30, 0, 0, 0] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: [0, "30", 0, 0] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: [0, null, 0, 0] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: [0, 1e999, 0, 0] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: [0, [30], 0, 0] })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: "0 30 0 0" })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: { left: 0, top: 30, right: 0, bottom: 0 } })], _GAPS, _SET,
    null], expect: _NO },
  { fn: "placement", args: [[_monitor({ reserved: 30 })], _GAPS, _SET, null], expect: _NO },
  // So small and so scaled that nothing is left of it.
  { fn: "placement", args: [[_monitor({ width: 1, scale: 8 })], _GAPS, _SET, null], expect: _NO },
  { fn: "placement", args: [[{ focused: true }], _GAPS, _SET, null], expect: _NO },

  // ---- placement: a gap answer that is not one ----
  { fn: "placement", args: [_ONE, null, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, "10 10 10 10", _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, 10, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, [10, 10, 10, 10], _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, {}, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { option: "general:gaps_out", set: false }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: " " }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10 10 10 10 10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10,10,10,10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10  10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: " 10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10 " }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10\t10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10\n" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10px" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10.5" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "1e3" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "0x10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "+10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "--10" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "999999" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "ten" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "Infinity" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: "10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10" }, _SET, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, { css: "1000000 10 10 10" }, _SET, null], expect: _NO },
  // Text in css decides, even when a usable int stands next to it.
  { fn: "placement", args: [_ONE, { css: "ten", int: 10 }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: ["10"] }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { css: 10 }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { int: 4.5 }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { int: "4" }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { int: null }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { int: true }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { int: 1e999 }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { int: 100000 }, _SET, null], expect: _NO },
  { fn: "placement", args: [_ONE, { int: -100000 }, _SET, null], expect: _NO },

  // ---- placement: settings outside their lists, whatever is remembered ----
  { fn: "placement", args: [_ONE, _GAPS, null, _KEPT], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, {}, _KEPT], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, "quarter", _KEPT], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, ["quarter", "bottom-right"], _KEPT], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "huge", videoCorner: "bottom-right" }, _KEPT],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "Quarter", videoCorner: "bottom-right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter ", videoCorner: "bottom-right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: 25, videoCorner: "bottom-right" }, null], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: null, videoCorner: "bottom-right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: ["quarter"], videoCorner: "bottom-right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "constructor", videoCorner: "bottom-right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "__proto__", videoCorner: "bottom-right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "name", videoCorner: "bottom-right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoCorner: "bottom-right" }, null], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter" }, null], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: "center" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: "br" }, null], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: "Bottom-Right" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: 3 }, null], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: null }, null], expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: ["bottom-right"] }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS, { videoSize: "quarter", videoCorner: "length" }, null],
    expect: _NO },
  { fn: "placement", args: [_ONE, _GAPS], expect: _NO },
  { fn: "placement", args: [_ONE], expect: _NO },
  { fn: "placement", args: [], expect: _NO },

  // ---- fromWindow: the quarter of the monitor the window's centre is in ----
  { fn: "fromWindow", args: [_window({}), _ONE], expect: _SEEN },
  { fn: "fromWindow", args: [_window({ at: [10, 40] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-left", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [1430, 40] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-right", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [10, 800] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-left", widthPct: 25 } },
  // Dead centre counts as bottom-right; one pixel off decides.
  { fn: "fromWindow", args: [_window({ at: [720, 405] }), _ONE], expect: _SEEN },
  { fn: "fromWindow", args: [_window({ at: [719, 405] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-left", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [720, 404] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-right", widthPct: 25 } },
  // An odd size puts the centre between two pixels.
  { fn: "fromWindow", args: [_window({ at: [719, 404], size: [481, 271] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-left", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [720, 405], size: [481, 271] }), _ONE], expect: _SEEN },

  // ---- fromWindow: the width in whole percent, from 10 to 90 ----
  { fn: "fromWindow", args: [_window({ at: [900, 500], size: [960, 540] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 50 } },
  { fn: "fromWindow", args: [_window({ size: [326, 183] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 17 } },
  { fn: "fromWindow", args: [_window({ size: [355, 200] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 18 } },
  // Exactly between two percentages: up.
  { fn: "fromWindow", args: [_window({ size: [240, 135] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 13 } },
  { fn: "fromWindow", args: [_window({ size: [432, 243] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 23 } },
  { fn: "fromWindow", args: [_window({ size: [192, 108] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 10 } },
  { fn: "fromWindow", args: [_window({ size: [100, 56] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 10 } },
  { fn: "fromWindow", args: [_window({ size: [1, 1] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 10 } },
  { fn: "fromWindow", args: [_window({ at: [10, 40], size: [1728, 972] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-left", widthPct: 90 } },
  { fn: "fromWindow", args: [_window({ at: [0, 30], size: [1900, 1000] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-left", widthPct: 90 } },
  { fn: "fromWindow", args: [_window({ at: [-1000, 30], size: [3840, 1000] }), _ONE],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-left", widthPct: 90 } },

  // ---- fromWindow: the monitor is the one under the centre ----
  { fn: "fromWindow", args: [_window({ at: [2000, 100], size: [320, 180] }), _PAIR],
    expect: { ok: true, name: "DP-3", corner: "top-left", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [2000, 100], size: [320, 180], monitor: 0 }), _PAIR],
    expect: { ok: true, name: "DP-3", corner: "top-left", widthPct: 25 } },
  // A centre on the seam belongs to the monitor that starts there.
  { fn: "fromWindow", args: [_window({ at: [1760, 100], size: [320, 180] }), _PAIR],
    expect: { ok: true, name: "DP-3", corner: "top-left", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [1759, 100], size: [320, 180] }), _PAIR],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-right", widthPct: 17 } },
  { fn: "fromWindow", args: [_window({ at: [2880, 800], size: [320, 180] }), _PAIR],
    expect: { ok: true, name: "DP-3", corner: "bottom-right", widthPct: 25 } },
  // Below the lower monitor's last row, although the taller one goes on.
  { fn: "fromWindow", args: [_window({ at: [2000, 1000], size: [320, 180] }), _PAIR], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1000, 1000], size: [320, 180] }), _PAIR], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [-500, 500] }), [_monitor({ x: -1920 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [-1900, -150] }), [_monitor({ x: -1920, y: -200 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-left", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({ at: [5000, 5000] }), _PAIR], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [-300, 100] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1700, 100] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [100, -200] }), _ONE], expect: _NO },
  // Of two monitors on the same spot the first one listed is taken.
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "A-1" }), _monitor({ name: "B-1" })]],
    expect: { ok: true, name: "A-1", corner: "bottom-right", widthPct: 25 } },
  // Entries that cannot be read are passed over.
  { fn: "fromWindow", args: [_window({}), [null, "x", 7, [], _monitor({ name: "BAD-1", scale: 0 }),
    _monitor({ name: "BAD-2", reserved: null }), _monitor({})]], expect: _SEEN },
  { fn: "fromWindow", args: [_window({}), [_monitor({ focused: false })]], expect: _SEEN },

  // ---- fromWindow: sizes are in the monitor's own units ----
  { fn: "fromWindow", args: [_window({ at: [1900, 1060], size: [640, 360] }),
    [_monitor({ width: 3840, height: 2160, scale: 1.5 })]], expect: _SEEN },
  { fn: "fromWindow", args: [_window({ at: [1000, 600], size: [360, 203] }),
    [_monitor({ width: 2880, height: 1800, scale: 2 })]], expect: _SEEN },
  { fn: "fromWindow", args: [_window({ at: [1100, 600], size: [384, 216] }), [_monitor({ scale: 1.25 })]],
    expect: _SEEN },
  // Beyond the scaled monitor, though inside its pixel size.
  { fn: "fromWindow", args: [_window({ at: [1500, 800] }),
    [_monitor({ width: 2880, height: 1800, scale: 2 })]], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1900, 1070], size: [1920, 1080] }), [_monitor({ scale: 0.5 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 50 } },

  // ---- fromWindow: a monitor turned a quarter is as wide as it was high ----
  { fn: "fromWindow", args: [_window({ at: [500, 1500], size: [540, 304] }), [_monitor({ transform: 1 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 50 } },
  { fn: "fromWindow", args: [_window({ at: [500, 1500], size: [540, 304] }), [_monitor({ transform: 3 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 50 } },
  { fn: "fromWindow", args: [_window({ at: [500, 1500], size: [540, 304] }), [_monitor({ transform: 5 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 50 } },
  { fn: "fromWindow", args: [_window({ at: [500, 1500], size: [540, 304] }), [_monitor({ transform: 7 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "bottom-right", widthPct: 50 } },
  { fn: "fromWindow", args: [_window({ at: [500, 1500], size: [540, 304] }), [_monitor({ transform: 0 })]],
    expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [500, 1500], size: [540, 304] }), [_monitor({ transform: 2 })]],
    expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ transform: 2 })]], expect: _SEEN },
  { fn: "fromWindow", args: [_window({}), [_monitor({ transform: 4 })]], expect: _SEEN },
  { fn: "fromWindow", args: [_window({}), [_monitor({ transform: 6 })]], expect: _SEEN },
  { fn: "fromWindow", args: [_window({}), [_monitor({ transform: 1 })]], expect: _NO },
  // Turned and scaled at once.
  { fn: "fromWindow", args: [_window({ at: [100, 100], size: [270, 152] }),
    [_monitor({ width: 3840, height: 2160, scale: 2, transform: 1 })]],
    expect: { ok: true, name: "HDMI-A-1", corner: "top-left", widthPct: 25 } },

  // ---- fromWindow: only a monitor whose name can be a key is remembered ----
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "constructor" })]],
    expect: { ok: true, name: "constructor", corner: "bottom-right", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "__proto__" })]],
    expect: { ok: true, name: "__proto__", corner: "bottom-right", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "eDP-1" })]],
    expect: { ok: true, name: "eDP-1", corner: "bottom-right", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })]],
    expect: { ok: true, name: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", corner: "bottom-right", widthPct: 25 } },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })]],
    expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "Odd Name" })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "DP-3\n" })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "../state" })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "DP.3" })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "\u0414\u0420-3" })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "" })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: null })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: 3 })]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: ["DP-3"] })]], expect: _NO },
  // The first monitor under the centre decides, even when a later one has a usable name.
  { fn: "fromWindow", args: [_window({}), [_monitor({ name: "" }), _monitor({})]], expect: _NO },

  // ---- fromWindow: a tiled or fullscreen window was not placed by the user ----
  { fn: "fromWindow", args: [_window({ floating: false }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ fullscreen: 1 }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ fullscreen: 2 }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ fullscreen: true }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ fullscreen: false }), _ONE], expect: _SEEN },
  { fn: "fromWindow", args: [{ at: [1430, 800], size: [480, 270] }, _ONE], expect: _SEEN },

  // ---- fromWindow: not a window ----
  { fn: "fromWindow", args: [null, _ONE], expect: _NO },
  { fn: "fromWindow", args: [[], _ONE], expect: _NO },
  { fn: "fromWindow", args: [[_window({})], _ONE], expect: _NO },
  { fn: "fromWindow", args: ["OmaJuke", _ONE], expect: _NO },
  { fn: "fromWindow", args: [7, _ONE], expect: _NO },
  { fn: "fromWindow", args: [{}, _ONE], expect: _NO },
  { fn: "fromWindow", args: [{ at: [1430, 800] }, _ONE], expect: _NO },
  { fn: "fromWindow", args: [{ size: [480, 270] }, _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: null }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1430] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1430, 800, 0] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: ["1430", 800] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1430.5, 800] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1430, null] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1e999, 800] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1430, -1e999] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: [1000001, 800] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: "1430,800" }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ at: { x: 1430, y: 800 } }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: [0, 270] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: [480, 0] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: [-480, 270] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: [480.5, 270] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: ["480", 270] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: [1e999, 270] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: [65537, 270] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: [480] }), _ONE], expect: _NO },
  { fn: "fromWindow", args: [_window({ size: null }), _ONE], expect: _NO },

  // ---- fromWindow: not a monitor list ----
  { fn: "fromWindow", args: [_window({}), null], expect: _NO },
  { fn: "fromWindow", args: [_window({}), {}], expect: _NO },
  { fn: "fromWindow", args: [_window({}), _monitor({})], expect: _NO },
  { fn: "fromWindow", args: [_window({}), "HDMI-A-1"], expect: _NO },
  { fn: "fromWindow", args: [_window({}), []], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [null]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), [[_monitor({})]]], expect: _NO },
  { fn: "fromWindow", args: [_window({}), _times(_monitor({}), 33)], expect: _NO },
  { fn: "fromWindow", args: [_window({}), _times(_monitor({}), 32)], expect: _SEEN },
  { fn: "fromWindow", args: [_window({}), _times(null, 10000)], expect: _NO },
  { fn: "fromWindow", args: [_window({})], expect: _NO },
  { fn: "fromWindow", args: [], expect: _NO }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
