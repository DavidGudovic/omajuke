.pragma library

// Input and expectation table for lib/Settings.js: how the plugin's entry
// is found in a bar configuration and copied, what each setting accepts,
// which source wins for the three mirrored privacy choices, and what is
// written back to the host. Many rows are hostile on purpose: odd shapes,
// keys that name members of Object.prototype, values of the wrong type.
// The same table runs under node and inside Qt's JavaScript engine.

var MODULE = "Settings"

// A plugin id for the bar configurations below, and the real one: an entry
// that is written back always carries the id from lib/Const.js, whatever
// the entry it was built from says.
var _ME = "example.plugin"
var _ID = "davidgudovic.omajuke"

var _DEFAULTS = {
  autoplay: true, maxHeight: 720, videoSize: "quarter", videoCorner: "bottom-right", keepAwake: true,
  sponsorSkip: "ask", markWatched: false, evenVolume: false, rememberHistory: true, preload: true
}
var _CONSERVATIVE = {
  autoplay: false, maxHeight: 720, videoSize: "quarter", videoCorner: "bottom-right", keepAwake: true,
  sponsorSkip: "ask", markWatched: false, evenVolume: false, rememberHistory: false, preload: false
}

// A copy of base with the members of changes laid over it, in base's order.
// Only ever used on the literals of this file.
function _with(base, changes) {
  var copy = {}
  var key
  for (key in base) copy[key] = base[key]
  for (key in changes) copy[key] = changes[key]
  return copy
}

// The text unit repeated count times.
function _repeat(unit, count) {
  return new Array(count + 1).join(unit)
}

// What JSON.parse makes of a text: used for objects that carry a key such
// as "__proto__" as plain data, which an object literal cannot spell.
function _parsed(text) {
  return JSON.parse(text)
}

// An object that only inherits the members of base, and holds the members
// of own (if given) itself.
function _inheriting(base, own) {
  var object = Object.create(base)
  for (var key in own) object[key] = own[key]
  return object
}

// A bar configuration with these entries on the right.
function _bar(entries) {
  return { position: "top", layout: { left: [], center: [], right: entries } }
}

// A bar configuration that holds only this one entry of ours.
function _mine(settings) {
  return _bar([_with({ id: _ME }, settings)])
}

// An entry of ours with count other keys ("k00", "k01", ...) in front of
// the keys of last.
function _crowded(count, last) {
  var entry = { id: _ME }
  for (var i = 0; i < count; i++) entry["k" + String(100 + i).slice(1)] = i
  return _with(entry, last)
}

// The complete settings for an entry with these keys, when nothing is
// pending and the state file remembers nothing.
function _typed(changes) {
  return _with(_DEFAULTS, changes)
}

// The entry that is written back: our id first.
function _entry(settings) {
  return _with({ id: _ID }, settings)
}

var CASES = [
  // ---- extract: finding the entry ----
  { fn: "extract", args: [_mine({}), _ME], expect: { id: _ME } },
  { fn: "extract", args: [{ layout: { left: [{ id: _ME, a: 1 }], center: [], right: [] } }, _ME],
    expect: { id: _ME, a: 1 } },
  { fn: "extract", args: [{ layout: { center: [{ id: _ME, a: 2 }] } }, _ME], expect: { id: _ME, a: 2 } },
  // The first one wins: left before center before right, and the earlier
  // element of a list.
  { fn: "extract",
    args: [{ layout: { left: [{ id: _ME, a: 1 }], center: [{ id: _ME, a: 2 }], right: [{ id: _ME, a: 3 }] } },
      _ME],
    expect: { id: _ME, a: 1 } },
  { fn: "extract", args: [_bar([{ id: _ME, a: 1 }, { id: _ME, a: 2 }]), _ME], expect: { id: _ME, a: 1 } },
  // Other plugins' entries are not ours, whatever they carry.
  { fn: "extract",
    args: [_bar([{ id: "other.plugin", rememberHistory: false }, { id: _ME, autoplay: true }]), _ME],
    expect: { id: _ME, autoplay: true } },
  { fn: "extract", args: [_bar([{ id: "other.plugin", rememberHistory: false }]), _ME], expect: null },
  { fn: "extract", args: [_bar([{ id: _ME + "x" }, { id: "x" + _ME }, { id: " " + _ME }]), _ME],
    expect: null },
  { fn: "extract", args: [_bar([{ id: [_ME] }, { id: { toString: _ME } }, { id: 5 }, { id: null }]), _ME],
    expect: null },
  // Elements that are not objects are stepped over.
  { fn: "extract", args: [_bar([null, 5, "x", [], [{ id: _ME }], true, { id: _ME, a: 1 }]), _ME],
    expect: { id: _ME, a: 1 } },
  // An id that is only inherited is not the entry's id.
  { fn: "extract", args: [_bar([_inheriting({ id: _ME, a: 1 })]), _ME], expect: null },
  { fn: "extract", args: [_bar([_parsed("{\"__proto__\":{\"id\":\"example.plugin\"}}")]), _ME],
    expect: null },

  // ---- extract: bar configurations of odd shapes ----
  { fn: "extract", args: [null, _ME], expect: null },
  { fn: "extract", args: [undefined, _ME], expect: null },
  { fn: "extract", args: [], expect: null },
  { fn: "extract", args: ["layout", _ME], expect: null },
  { fn: "extract", args: [5, _ME], expect: null },
  { fn: "extract", args: [[], _ME], expect: null },
  { fn: "extract", args: [[{ layout: { right: [{ id: _ME }] } }], _ME], expect: null },
  { fn: "extract", args: [{}, _ME], expect: null },
  { fn: "extract", args: [{ layout: null }, _ME], expect: null },
  { fn: "extract", args: [{ layout: [] }, _ME], expect: null },
  { fn: "extract", args: [{ layout: [{ id: _ME }] }, _ME], expect: null },
  { fn: "extract", args: [{ layout: "right" }, _ME], expect: null },
  { fn: "extract", args: [{ layout: { right: "x" } }, _ME], expect: null },
  { fn: "extract", args: [{ layout: { right: { id: _ME } } }, _ME], expect: null },
  { fn: "extract", args: [{ layout: { right: { 0: { id: _ME }, length: 1 } } }, _ME], expect: null },
  { fn: "extract", args: [{ layout: { top: [{ id: _ME }] } }, _ME], expect: null },
  { fn: "extract", args: [{ right: [{ id: _ME }] }, _ME], expect: null },
  // A layout that is only inherited is not the configuration's layout.
  { fn: "extract", args: [_inheriting(_mine({})), _ME], expect: null },
  { fn: "extract", args: [{ layout: _inheriting({ right: [{ id: _ME }] }) }, _ME], expect: null },
  { fn: "extract",
    args: [_parsed("{\"__proto__\":{\"layout\":{\"right\":[{\"id\":\"example.plugin\"}]}}}"), _ME],
    expect: null },
  // The id that is looked for.
  { fn: "extract", args: [_mine({}), ""], expect: null },
  { fn: "extract", args: [_bar([{ id: "" }]), ""], expect: null },
  { fn: "extract", args: [_mine({}), null], expect: null },
  { fn: "extract", args: [_mine({})], expect: null },
  { fn: "extract", args: [_bar([{ id: 5 }]), 5], expect: null },
  { fn: "extract", args: [_bar([{ id: "constructor", a: 1 }]), "constructor"],
    expect: { id: "constructor", a: 1 } },

  // ---- extract: what is copied ----
  { fn: "extract",
    args: [_mine({ on: true, off: false, n: 1080, f: 0.5, neg: -1, text: "x", empty: "" }), _ME],
    expect: { id: _ME, on: true, off: false, n: 1080, f: 0.5, neg: -1, text: "x", empty: "" } },
  // Nothing nested, nothing that is not a plain value.
  { fn: "extract",
    args: [_mine({ a: { b: 1 }, c: [1], d: null, e: undefined, g: NaN, h: Infinity, i: -Infinity, kept: 1 }),
      _ME],
    expect: { id: _ME, kept: 1 } },
  { fn: "extract", args: [_mine({ ok: _repeat("x", 64), long: _repeat("x", 65) }), _ME],
    expect: { id: _ME, ok: _repeat("x", 64) } },
  // Names: a letter, then letters and digits, 32 at most.
  { fn: "extract",
    args: [_bar([_parsed("{\"id\":\"example.plugin\",\"a_b\":1,\"a-b\":1,\"a.b\":1,\"a b\":1,\"1a\":1,"
      + "\"\":1,\"_a\":1,\"$a\":1,\"a\\n\":1,\"\\u00e9\":1,\"a1\":1,\"Z\":1}")]), _ME],
    expect: { id: _ME, a1: 1, Z: 1 } },
  { fn: "extract",
    args: [_bar([_parsed("{\"id\":\"example.plugin\",\"" + _repeat("k", 32) + "\":1,\""
      + _repeat("k", 33) + "\":2}")]), _ME],
    expect: _parsed("{\"id\":\"example.plugin\",\"" + _repeat("k", 32) + "\":1}") },
  // A key called __proto__ is data in parsed JSON. It is not copied, and it
  // changes nothing about the copy.
  { fn: "extract",
    args: [_bar([_parsed("{\"id\":\"example.plugin\",\"__proto__\":{\"rememberHistory\":false},\"a\":1}")]),
      _ME],
    expect: { id: _ME, a: 1 } },
  { fn: "extract",
    args: [_bar([_parsed("{\"id\":\"example.plugin\",\"__proto__\":\"x\",\"a\":1}")]), _ME],
    expect: { id: _ME, a: 1 } },
  // Names of Object.prototype members are just names.
  { fn: "extract",
    args: [_bar([_parsed("{\"id\":\"example.plugin\",\"constructor\":\"c\",\"toString\":\"t\","
      + "\"hasOwnProperty\":false,\"valueOf\":1}")]), _ME],
    expect: _parsed("{\"id\":\"example.plugin\",\"constructor\":\"c\",\"toString\":\"t\","
      + "\"hasOwnProperty\":false,\"valueOf\":1}") },
  // Inherited settings are not the entry's settings.
  { fn: "extract", args: [_bar([_inheriting({ rememberHistory: false, a: 1 }, { id: _ME })]), _ME],
    expect: { id: _ME } },
  // The reserved keys are copied like any other; they are dropped when the
  // entry is written back.
  { fn: "extract", args: [_mine({ type: "custom", exec: "x", source: "y" }), _ME],
    expect: { id: _ME, type: "custom", exec: "x", source: "y" } },
  // At most 32 keys, and a setting of ours is always among them.
  { fn: "extract", args: [_bar([_crowded(31, {})]), _ME], expect: _crowded(31, {}) },
  { fn: "extract", args: [_bar([_crowded(40, {})]), _ME], expect: _crowded(31, {}) },
  { fn: "extract", args: [_bar([_crowded(40, { rememberHistory: false })]), _ME],
    expect: _crowded(30, { rememberHistory: false }) },
  { fn: "extract",
    args: [_bar([_crowded(40, { rememberHistory: "false", preload: false, autoplay: false, late: 1 })]), _ME],
    expect: _crowded(28, { rememberHistory: "false", preload: false, autoplay: false }) },

  // ---- coerce: before the settings are known ----
  { fn: "coerce", args: [{}, {}, {}, false], expect: _CONSERVATIVE },
  { fn: "coerce",
    args: [{ rememberHistory: true, preload: true, autoplay: true, markWatched: true, sponsorSkip: true },
      { rememberHistory: true, preload: true, autoplay: true }, { rememberHistory: true }, false],
    expect: _CONSERVATIVE },
  { fn: "coerce", args: [{ rememberHistory: true }, {}, {}], expect: _CONSERVATIVE },
  { fn: "coerce", args: [{ rememberHistory: true }, {}, {}, "true"], expect: _CONSERVATIVE },
  { fn: "coerce", args: [{ rememberHistory: true }, {}, {}, 1], expect: _CONSERVATIVE },
  { fn: "coerce", args: [{ rememberHistory: true }, {}, {}, null], expect: _CONSERVATIVE },
  { fn: "coerce", args: [], expect: _CONSERVATIVE },

  // ---- coerce: defaults ----
  { fn: "coerce", args: [{}, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [null, null, null, true], expect: _DEFAULTS },
  { fn: "coerce", args: [undefined, undefined, undefined, true], expect: _DEFAULTS },
  { fn: "coerce", args: ["raw", 5, true, true], expect: _DEFAULTS },
  { fn: "coerce", args: [[], [], [], true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ id: _ME, unknown: 1, volume: 5 }, {}, {}, true], expect: _DEFAULTS },

  // ---- coerce: switches ----
  { fn: "coerce",
    args: [{ autoplay: false, keepAwake: false, markWatched: true, evenVolume: true }, {}, {}, true],
    expect: _typed({ autoplay: false, keepAwake: false, markWatched: true, evenVolume: true }) },
  // `omarchy bar set` stores text.
  { fn: "coerce",
    args: [{ autoplay: "false", keepAwake: "false", markWatched: "true", evenVolume: "true",
      rememberHistory: "false", preload: "false" }, {}, {}, true],
    expect: _typed({ autoplay: false, keepAwake: false, markWatched: true, evenVolume: true,
      rememberHistory: false, preload: false }) },
  { fn: "coerce", args: [{ autoplay: "true", rememberHistory: "true" }, {}, {}, true], expect: _DEFAULTS },
  // Anything else is not a value of a switch and leaves the default.
  { fn: "coerce",
    args: [{ autoplay: "False", keepAwake: 0, markWatched: 1, evenVolume: "yes", rememberHistory: "0",
      preload: null }, {}, {}, true],
    expect: _DEFAULTS },
  { fn: "coerce",
    args: [{ autoplay: "", keepAwake: "off", markWatched: "TRUE", evenVolume: " true", rememberHistory: [],
      preload: {} }, {}, {}, true],
    expect: _DEFAULTS },

  // ---- coerce: the choices ----
  { fn: "coerce", args: [{ maxHeight: 480 }, {}, {}, true], expect: _typed({ maxHeight: 480 }) },
  { fn: "coerce", args: [{ maxHeight: 1080 }, {}, {}, true], expect: _typed({ maxHeight: 1080 }) },
  { fn: "coerce", args: [{ maxHeight: "480" }, {}, {}, true], expect: _typed({ maxHeight: 480 }) },
  { fn: "coerce", args: [{ maxHeight: "720" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: "1080" }, {}, {}, true], expect: _typed({ maxHeight: 1080 }) },
  { fn: "coerce", args: [{ maxHeight: 2160 }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: 721 }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: 479.5 }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: "1080p" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: "01080" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: " 480" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: "4.8e2" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: true }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: [480] }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ maxHeight: NaN }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoSize: "sixth" }, {}, {}, true], expect: _typed({ videoSize: "sixth" }) },
  { fn: "coerce", args: [{ videoSize: "third" }, {}, {}, true], expect: _typed({ videoSize: "third" }) },
  { fn: "coerce", args: [{ videoSize: "half" }, {}, {}, true], expect: _typed({ videoSize: "half" }) },
  { fn: "coerce", args: [{ videoSize: "Half" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoSize: "full" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoSize: 50 }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoSize: ["half"] }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoSize: "constructor" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoCorner: "top-left" }, {}, {}, true],
    expect: _typed({ videoCorner: "top-left" }) },
  { fn: "coerce", args: [{ videoCorner: "top-right" }, {}, {}, true],
    expect: _typed({ videoCorner: "top-right" }) },
  { fn: "coerce", args: [{ videoCorner: "bottom-left" }, {}, {}, true],
    expect: _typed({ videoCorner: "bottom-left" }) },
  { fn: "coerce", args: [{ videoCorner: "center" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoCorner: "top_left" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoCorner: "length" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ videoCorner: 0 }, {}, {}, true], expect: _DEFAULTS },

  // ---- coerce: sponsorSkip, a switch with a third state ----
  { fn: "coerce", args: [{ sponsorSkip: true }, {}, {}, true], expect: _typed({ sponsorSkip: "on" }) },
  { fn: "coerce", args: [{ sponsorSkip: "true" }, {}, {}, true], expect: _typed({ sponsorSkip: "on" }) },
  { fn: "coerce", args: [{ sponsorSkip: false }, {}, {}, true], expect: _typed({ sponsorSkip: "off" }) },
  { fn: "coerce", args: [{ sponsorSkip: "false" }, {}, {}, true], expect: _typed({ sponsorSkip: "off" }) },
  // Only an answer switches the lookups on. Everything else asks.
  { fn: "coerce", args: [{ sponsorSkip: "on" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ sponsorSkip: "off" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ sponsorSkip: "ask" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ sponsorSkip: 1 }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ sponsorSkip: "yes" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ sponsorSkip: null }, {}, {}, true], expect: _DEFAULTS },
  // It is not mirrored: what the state file says about it is not read.
  { fn: "coerce", args: [{}, { sponsorSkip: true, markWatched: true, evenVolume: true }, {}, true],
    expect: _DEFAULTS },

  // ---- coerce: the mirrored three: pending, then entry, then mirror, then default ----
  { fn: "coerce", args: [{}, { rememberHistory: false, preload: false, autoplay: false }, {}, true],
    expect: _typed({ rememberHistory: false, preload: false, autoplay: false }) },
  { fn: "coerce", args: [{}, { rememberHistory: false }, {}, true],
    expect: _typed({ rememberHistory: false }) },
  { fn: "coerce", args: [{ id: _ME }, { rememberHistory: false }, null, true],
    expect: _typed({ rememberHistory: false }) },
  // The entry says so itself: it wins over the mirror, either way round.
  { fn: "coerce", args: [{ rememberHistory: true }, { rememberHistory: false }, {}, true],
    expect: _DEFAULTS },
  { fn: "coerce", args: [{ rememberHistory: false }, { rememberHistory: true }, {}, true],
    expect: _typed({ rememberHistory: false }) },
  { fn: "coerce", args: [{ rememberHistory: "false" }, { rememberHistory: true }, {}, true],
    expect: _typed({ rememberHistory: false }) },
  // A change on its way wins over both.
  { fn: "coerce",
    args: [{ rememberHistory: true }, { rememberHistory: true }, { rememberHistory: false }, true],
    expect: _typed({ rememberHistory: false }) },
  { fn: "coerce", args: [{ preload: false }, { preload: false }, { preload: true }, true],
    expect: _DEFAULTS },
  { fn: "coerce",
    args: [{}, {}, { autoplay: false, evenVolume: true, sponsorSkip: true, maxHeight: 480 }, true],
    expect: _typed({ autoplay: false, evenVolume: true, sponsorSkip: "on", maxHeight: 480 }) },
  { fn: "coerce", args: [{ evenVolume: true }, {}, { evenVolume: false }, true], expect: _DEFAULTS },
  // An entry value that is no value falls through to the remembered
  // choice, not to the less private default.
  { fn: "coerce", args: [{ rememberHistory: "banana" }, { rememberHistory: false }, {}, true],
    expect: _typed({ rememberHistory: false }) },
  { fn: "coerce", args: [{ rememberHistory: null, preload: 0 }, { rememberHistory: false, preload: false },
    {}, true],
    expect: _typed({ rememberHistory: false, preload: false }) },
  { fn: "coerce", args: [{ rememberHistory: "banana" }, {}, {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{}, {}, { rememberHistory: "banana" }, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{ rememberHistory: false }, {}, { rememberHistory: "banana" }, true],
    expect: _typed({ rememberHistory: false }) },
  // The mirror holds booleans. Anything else in it is not a choice.
  { fn: "coerce", args: [{}, { rememberHistory: "false", preload: 0, autoplay: null }, {}, true],
    expect: _DEFAULTS },
  { fn: "coerce", args: [{}, [false, false, false], {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{}, "rememberHistory", {}, true], expect: _DEFAULTS },

  // ---- coerce: nothing inherited is read ----
  { fn: "coerce",
    args: [_inheriting({ rememberHistory: false, autoplay: false, maxHeight: 480 }), {}, {}, true],
    expect: _DEFAULTS },
  { fn: "coerce", args: [{}, _inheriting({ rememberHistory: false }), {}, true], expect: _DEFAULTS },
  { fn: "coerce", args: [{}, {}, _inheriting({ rememberHistory: false }), true], expect: _DEFAULTS },
  { fn: "coerce",
    args: [_parsed("{\"__proto__\":{\"rememberHistory\":false,\"autoplay\":false}}"), {}, {}, true],
    expect: _DEFAULTS },
  { fn: "coerce", args: [{}, _parsed("{\"__proto__\":{\"rememberHistory\":false}}"), {}, true],
    expect: _DEFAULTS },
  { fn: "coerce",
    args: [_parsed("{\"constructor\":false,\"toString\":false,\"valueOf\":false}"), {}, {}, true],
    expect: _DEFAULTS },

  // ---- choices: the privacy choices an entry makes itself ----
  { fn: "choices", args: [{}], expect: {} },
  { fn: "choices", args: [{ id: _ME, evenVolume: true, markWatched: true, sponsorSkip: true }], expect: {} },
  { fn: "choices", args: [{ autoplay: false, preload: "true", rememberHistory: "false" }],
    expect: { rememberHistory: false, preload: true, autoplay: false } },
  { fn: "choices", args: [{ rememberHistory: true }], expect: { rememberHistory: true } },
  { fn: "choices", args: [{ rememberHistory: "banana", preload: 0, autoplay: null }], expect: {} },
  { fn: "choices", args: [_inheriting({ rememberHistory: false })], expect: {} },
  { fn: "choices", args: [_parsed("{\"__proto__\":{\"rememberHistory\":false}}")], expect: {} },
  { fn: "choices", args: [null], expect: {} },
  { fn: "choices", args: [], expect: {} },
  { fn: "choices", args: [[false]], expect: {} },
  { fn: "choices", args: ["rememberHistory"], expect: {} },

  // ---- withChange: what is refused ----
  { fn: "withChange", args: [{}, "volume", 5], expect: null },
  { fn: "withChange", args: [{}, "", true], expect: null },
  { fn: "withChange", args: [{}, "id", "x"], expect: null },
  { fn: "withChange", args: [{}, "type", "custom"], expect: null },
  { fn: "withChange", args: [{}, "exec", "x"], expect: null },
  { fn: "withChange", args: [{}, "source", "x"], expect: null },
  { fn: "withChange", args: [{}, "__proto__", true], expect: null },
  { fn: "withChange", args: [{}, "constructor", true], expect: null },
  { fn: "withChange", args: [{}, "toString", true], expect: null },
  { fn: "withChange", args: [{}, "hasOwnProperty", true], expect: null },
  { fn: "withChange", args: [{}, "Autoplay", true], expect: null },
  { fn: "withChange", args: [{}, "autoplay ", true], expect: null },
  { fn: "withChange", args: [{}, 5, true], expect: null },
  { fn: "withChange", args: [{}, null, true], expect: null },
  { fn: "withChange", args: [{}, ["autoplay"], true], expect: null },
  { fn: "withChange", args: [{}], expect: null },
  { fn: "withChange", args: [], expect: null },
  // A key the entry happens to hold is still not a setting.
  { fn: "withChange", args: [{ custom: 1 }, "custom", 2], expect: null },
  // Values outside the table.
  { fn: "withChange", args: [{}, "autoplay", "yes"], expect: null },
  { fn: "withChange", args: [{}, "autoplay", 1], expect: null },
  { fn: "withChange", args: [{}, "autoplay", null], expect: null },
  { fn: "withChange", args: [{}, "autoplay"], expect: null },
  { fn: "withChange", args: [{}, "rememberHistory", "off"], expect: null },
  { fn: "withChange", args: [{}, "rememberHistory", {}], expect: null },
  { fn: "withChange", args: [{}, "maxHeight", 721], expect: null },
  { fn: "withChange", args: [{}, "maxHeight", "720p"], expect: null },
  { fn: "withChange", args: [{}, "maxHeight", true], expect: null },
  { fn: "withChange", args: [{}, "videoSize", "full"], expect: null },
  { fn: "withChange", args: [{}, "videoSize", 25], expect: null },
  { fn: "withChange", args: [{}, "videoCorner", "middle"], expect: null },
  { fn: "withChange", args: [{}, "videoCorner", "constructor"], expect: null },
  { fn: "withChange", args: [{}, "sponsorSkip", "on"], expect: null },
  { fn: "withChange", args: [{}, "sponsorSkip", "ask"], expect: null },
  { fn: "withChange", args: [{}, "sponsorSkip", null], expect: null },

  // ---- withChange: the entry that goes to the host ----
  { fn: "withChange", args: [{}, "evenVolume", true], expect: _entry({ evenVolume: true }) },
  { fn: "withChange", args: [null, "evenVolume", true], expect: _entry({ evenVolume: true }) },
  { fn: "withChange", args: [undefined, "evenVolume", false], expect: _entry({ evenVolume: false }) },
  { fn: "withChange", args: [[], "evenVolume", true], expect: _entry({ evenVolume: true }) },
  { fn: "withChange", args: ["raw", "evenVolume", true], expect: _entry({ evenVolume: true }) },
  // Switches and numbers are stored as JSON values, whatever form came in.
  { fn: "withChange", args: [{}, "autoplay", "false"], expect: _entry({ autoplay: false }) },
  { fn: "withChange", args: [{}, "rememberHistory", "true"], expect: _entry({ rememberHistory: true }) },
  { fn: "withChange", args: [{}, "maxHeight", 1080], expect: _entry({ maxHeight: 1080 }) },
  { fn: "withChange", args: [{}, "maxHeight", "480"], expect: _entry({ maxHeight: 480 }) },
  { fn: "withChange", args: [{}, "videoSize", "half"], expect: _entry({ videoSize: "half" }) },
  { fn: "withChange", args: [{}, "videoCorner", "top-left"], expect: _entry({ videoCorner: "top-left" }) },
  // sponsorSkip is stored as the answer, true or false.
  { fn: "withChange", args: [{}, "sponsorSkip", true], expect: _entry({ sponsorSkip: true }) },
  { fn: "withChange", args: [{}, "sponsorSkip", "false"], expect: _entry({ sponsorSkip: false }) },
  // The other keys are kept, in their order; a key that changes keeps its
  // place and a new one goes last.
  { fn: "withChange",
    args: [{ id: _ME, autoplay: "false", custom: "x", maxHeight: "1080" }, "autoplay", true],
    expect: _entry({ autoplay: true, custom: "x", maxHeight: "1080" }) },
  { fn: "withChange",
    args: [{ id: _ME, autoplay: "false", custom: "x", maxHeight: "1080" }, "preload", false],
    expect: _entry({ autoplay: "false", custom: "x", maxHeight: "1080", preload: false }) },
  // The id is ours, whatever the entry said.
  { fn: "withChange", args: [{ id: "other.plugin", a: 1 }, "evenVolume", true],
    expect: _entry({ a: 1, evenVolume: true }) },
  { fn: "withChange", args: [{ id: 5 }, "evenVolume", true], expect: _entry({ evenVolume: true }) },
  // The reserved keys never go back: with one of them the host would stop
  // loading the widget.
  { fn: "withChange",
    args: [{ id: _ME, type: "custom", exec: "x", source: "y", kept: true }, "evenVolume", true],
    expect: _entry({ kept: true, evenVolume: true }) },
  // Only plain keys with plain values travel.
  { fn: "withChange",
    args: [{ a: { b: 1 }, c: [1], d: null, e: NaN, long: _repeat("x", 65), kept: 1 }, "evenVolume", true],
    expect: _entry({ kept: 1, evenVolume: true }) },
  { fn: "withChange",
    args: [_parsed("{\"__proto__\":{\"type\":\"custom\"},\"a_b\":1,\"kept\":1}"), "evenVolume", true],
    expect: _entry({ kept: 1, evenVolume: true }) },
  { fn: "withChange", args: [_inheriting({ type: "custom", inherited: 1 }), "evenVolume", true],
    expect: _entry({ evenVolume: true }) },
  { fn: "withChange", args: [_parsed("{\"constructor\":\"c\",\"toString\":\"t\"}"), "evenVolume", true],
    expect: _parsed("{\"id\":\"davidgudovic.omajuke\",\"constructor\":\"c\",\"toString\":\"t\","
      + "\"evenVolume\":true}") },

  // ---- overlay: an entry with the pending changes laid over it ----
  { fn: "overlay", args: [{}, {}], expect: {} },
  { fn: "overlay", args: [null, null], expect: {} },
  { fn: "overlay", args: [], expect: {} },
  { fn: "overlay", args: [{ id: _ME, a: 1, autoplay: "false" }, null],
    expect: { id: _ME, a: 1, autoplay: "false" } },
  { fn: "overlay", args: [null, { evenVolume: true }], expect: { evenVolume: true } },
  { fn: "overlay", args: [{ id: _ME, autoplay: "false", a: 1 }, { autoplay: true, preload: false }],
    expect: { id: _ME, autoplay: true, a: 1, preload: false } },
  { fn: "overlay", args: [{ a: { b: 1 }, kept: 1 }, { c: [1], d: null, also: 2 }],
    expect: { kept: 1, also: 2 } },
  { fn: "overlay", args: [[1], "pending"], expect: {} },
  { fn: "overlay", args: [_inheriting({ a: 1 }), _inheriting({ b: 2 })], expect: {} },
  { fn: "overlay",
    args: [_parsed("{\"__proto__\":{\"a\":1},\"kept\":1}"), _parsed("{\"__proto__\":{\"b\":2},\"also\":2}")],
    expect: { kept: 1, also: 2 } },

  // ---- unsettled: which changes are still on their way ----
  { fn: "unsettled", args: [{}, {}, {}], expect: {} },
  { fn: "unsettled", args: [null, {}, {}], expect: {} },
  { fn: "unsettled", args: [], expect: {} },
  // The entry has not moved yet: the change stays.
  { fn: "unsettled", args: [{ evenVolume: true }, {}, {}], expect: { evenVolume: true } },
  { fn: "unsettled", args: [{ evenVolume: true }, { evenVolume: false }, { evenVolume: false }],
    expect: { evenVolume: true } },
  { fn: "unsettled", args: [{ evenVolume: true }, { evenVolume: "false", other: 2 }, { evenVolume: false }],
    expect: { evenVolume: true } },
  { fn: "unsettled", args: [{ evenVolume: true, autoplay: false }, null, null],
    expect: { evenVolume: true, autoplay: false } },
  // The entry shows it: settled. Compared as typed values.
  { fn: "unsettled", args: [{ evenVolume: true }, { evenVolume: true }, {}], expect: {} },
  { fn: "unsettled",
    args: [{ evenVolume: true }, { evenVolume: "true" }, { evenVolume: false }], expect: {} },
  { fn: "unsettled", args: [{ maxHeight: 1080 }, { maxHeight: "1080" }, {}], expect: {} },
  { fn: "unsettled", args: [{ sponsorSkip: true }, { sponsorSkip: "true" }, {}], expect: {} },
  { fn: "unsettled", args: [{ evenVolume: true }, { evenVolume: true }, { evenVolume: true }], expect: {} },
  // The entry had it all along, spelled as text: nothing to wait for.
  { fn: "unsettled", args: [{ evenVolume: true }, { evenVolume: "true" }, { evenVolume: "true" }],
    expect: {} },
  { fn: "unsettled", args: [{ maxHeight: 1080 }, { maxHeight: "1080" }, { maxHeight: 1080 }], expect: {} },
  { fn: "unsettled", args: [{ sponsorSkip: false }, { sponsorSkip: "false" }, { sponsorSkip: "false" }],
    expect: {} },
  // One of two has arrived.
  { fn: "unsettled",
    args: [{ evenVolume: true, autoplay: false }, { evenVolume: true }, {}],
    expect: { autoplay: false } },
  // The entry changed the key to something else: the entry counts.
  { fn: "unsettled", args: [{ maxHeight: 1080 }, { maxHeight: 480 }, { maxHeight: 720 }], expect: {} },
  { fn: "unsettled", args: [{ maxHeight: 1080 }, { maxHeight: 480 }, {}], expect: {} },
  { fn: "unsettled", args: [{ videoSize: "half" }, {}, { videoSize: "third" }], expect: {} },
  // A change of spelling alone is no change.
  { fn: "unsettled", args: [{ maxHeight: 1080 }, { maxHeight: "480" }, { maxHeight: 480 }],
    expect: { maxHeight: 1080 } },
  { fn: "unsettled", args: [{ maxHeight: 1080 }, { maxHeight: "junk" }, {}], expect: { maxHeight: 1080 } },
  // What is not a change of a setting is not waited for.
  { fn: "unsettled", args: [{ volume: 5, evenVolume: "maybe", id: _ME }, {}, {}], expect: {} },
  { fn: "unsettled", args: [_inheriting({ evenVolume: true }), {}, {}], expect: {} },
  { fn: "unsettled", args: [[true], {}, {}], expect: {} }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
