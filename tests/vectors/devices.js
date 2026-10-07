.pragma library

// Input and expectation table for lib/Devices.js: which entries of mpv's
// device report become outputs, how they are labelled, which entry is
// current, which comes next when cycling, and what is chosen when the saved
// device is or is not on the list. Every device here is invented. The same
// table runs under node and inside Qt's JavaScript engine.

var _SPEAKERS = "pipewire/example_output.speakers"
var _HEADSET = "pipewire/example_output.headset-00_00_00_00_00_00"
var _MONITOR = "pipewire/example_output.monitor"

// Every character a node name may hold besides letters and digits.
var _PUNCTUATED = "pipewire/Example.Sink_1:left+right-2"

var _N50 = "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn"
var _D40 = "dddddddddddddddddddddddddddddddddddddddd"

// A report in the shape mpv sends: the automatic entry, each backend's own
// default, then every device once per backend that can reach it.
var _REPORT = [
  { name: "auto", description: "Autoselect device" },
  { name: "pipewire", description: "Default (pipewire)" },
  { name: _SPEAKERS, description: "Example Speakers Analog Stereo" },
  { name: _HEADSET, description: "Example Headset" },
  { name: "pulse/example_output.speakers", description: "Example Speakers Analog Stereo" },
  { name: "alsa/default", description: "Default ALSA Output" },
  { name: "alsa/sysdefault:CARD=Example", description: "Example Speakers, Analog" },
  { name: "jack", description: "Default (jack)" },
  { name: "openal", description: "Default (openal)" },
  { name: "sdl", description: "Default (sdl)" },
  { name: "sndio", description: "Default (sndio)" }
]

var _AUTO = { name: "auto", label: "System default" }
var _AUTO_IDLE = { name: "auto", label: "System default", current: false }
var _OUTPUTS = [
  _AUTO,
  { name: _SPEAKERS, label: "Example Speakers Analog Stereo" },
  { name: _HEADSET, label: "Example Headset" }
]
var _WITHOUT_HEADSET = [_AUTO, { name: _SPEAKERS, label: "Example Speakers Analog Stereo" }]
var _SINKS_ONLY = [
  { name: _SPEAKERS, label: "Example Speakers Analog Stereo" },
  { name: _HEADSET, label: "Example Headset" }
]

var _NOTHING = { device: "", send: false, fallback: false }

// A run of zero-width spaces, which cleaning removes, with text behind it.
function _hidden(count, text) {
  var out = ""
  for (var i = 0; i < count; i++) out += "\u200b"
  return out + text
}

// More sinks than the list holds, numbered so that the cut shows.
function _manySinks(count) {
  var list = [{ name: "auto", description: "Autoselect device" }]
  for (var i = 1; i <= count; i++) list.push({ name: "pipewire/sink-" + i, description: "Sink " + i })
  return list
}

// What is left of them: the automatic entry and the first 63 sinks.
function _keptSinks() {
  var list = [{ name: "auto", label: "System default" }]
  for (var i = 1; i <= 63; i++) list.push({ name: "pipewire/sink-" + i, label: "Sink " + i })
  return list
}

var MODULE = "Devices"
var CASES = [
  // ---- filter: the automatic entry and the PipeWire sinks, nothing else ----
  { fn: "filter", args: [_REPORT], expect: _OUTPUTS },
  { fn: "filter", args: [[{ name: "auto", description: "Autoselect device" }]], expect: [_AUTO] },
  { fn: "filter", args: [[]], expect: [] },
  // The automatic entry comes first wherever mpv lists it, and is not made up.
  { fn: "filter", args: [[
    { name: _SPEAKERS, description: "Example Speakers Analog Stereo" },
    { name: _HEADSET, description: "Example Headset" },
    { name: "auto", description: "Autoselect device" }
  ]], expect: _OUTPUTS },
  { fn: "filter", args: [[
    { name: _SPEAKERS, description: "Example Speakers Analog Stereo" },
    { name: _HEADSET, description: "Example Headset" }
  ]], expect: _SINKS_ONLY },
  // Its label is ours, whatever the report calls it.
  { fn: "filter", args: [[{ name: "auto", description: "<b>Anything</b>" }]], expect: [_AUTO] },
  { fn: "filter", args: [[{ name: "auto" }]], expect: [_AUTO] },

  // ---- filter: a name is kept exactly as it came, or not at all ----
  { fn: "filter", args: [[{ name: _PUNCTUATED, description: "Punctuated" }]],
    expect: [{ name: _PUNCTUATED, label: "Punctuated" }] },
  { fn: "filter", args: [[{ name: "pipewire/--audio-device", description: "Dashes" }]],
    expect: [{ name: "pipewire/--audio-device", label: "Dashes" }] },
  { fn: "filter", args: [[{ name: "pipewire/constructor", description: "Constructor" }]],
    expect: [{ name: "pipewire/constructor", label: "Constructor" }] },
  { fn: "filter", args: [[{ name: "pipewire/" + _N50 + _N50 + _N50 + _N50, description: "Long name" }]],
    expect: [{ name: "pipewire/" + _N50 + _N50 + _N50 + _N50, label: "Long name" }] },
  { fn: "filter", args: [[{ name: "pipewire/" + _N50 + _N50 + _N50 + _N50 + "n", description: "Too long" }]],
    expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/", description: "No node" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire", description: "Default (pipewire)" }]], expect: [] },
  { fn: "filter", args: [[{ name: "PIPEWIRE/sink", description: "Upper case" }]], expect: [] },
  { fn: "filter", args: [[{ name: "Auto", description: "Upper case" }]], expect: [] },
  { fn: "filter", args: [[{ name: " auto", description: "Space in front" }]], expect: [] },
  { fn: "filter", args: [[{ name: "auto\n", description: "Line break behind" }]], expect: [] },
  { fn: "filter", args: [[{ name: " pipewire/sink", description: "Space in front" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/sink ", description: "Space behind" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/sink\n", description: "Line break behind" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/si nk", description: "Space inside" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/si\u0000nk", description: "NUL inside" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/a/b", description: "Second slash" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/../auto", description: "Dots and slash" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/a,b", description: "Comma" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/a;b", description: "Semicolon" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/a\"b", description: "Quote" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/a\\b", description: "Backslash" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/$(id)", description: "Dollar" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/caf\u00e9", description: "Not ASCII" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pipewire/sink\u202e", description: "Bidi override" }]], expect: [] },
  { fn: "filter", args: [[{ name: "pulse/pipewire/sink", description: "Other backend" }]], expect: [] },
  { fn: "filter", args: [[{ name: "", description: "Empty" }]], expect: [] },
  { fn: "filter", args: [[{ name: "constructor", description: "Prototype member" }]], expect: [] },
  { fn: "filter", args: [[{ name: "__proto__", description: "Prototype member" }]], expect: [] },

  // ---- filter: a name of the wrong type, an entry of the wrong type ----
  { fn: "filter", args: [[{ name: 42, description: "Number" }]], expect: [] },
  { fn: "filter", args: [[{ name: null, description: "Null" }]], expect: [] },
  { fn: "filter", args: [[{ name: true, description: "Boolean" }]], expect: [] },
  { fn: "filter", args: [[{ name: ["auto"], description: "List" }]], expect: [] },
  { fn: "filter", args: [[{ name: ["pipewire/sink"], description: "List" }]], expect: [] },
  { fn: "filter", args: [[{ name: { name: "auto" }, description: "Object" }]], expect: [] },
  { fn: "filter", args: [[{ description: "No name" }]], expect: [] },
  { fn: "filter", args: [[null, 42, "auto", "pipewire/sink", true, [], ["auto"], [{ name: "auto" }]]],
    expect: [] },
  { fn: "filter", args: [[null, { name: _SPEAKERS, description: "Example Speakers Analog Stereo" }, 42,
    { name: _HEADSET, description: "Example Headset" }]], expect: _SINKS_ONLY },

  // ---- filter: anything that is not a list yields an empty one ----
  { fn: "filter", args: [null], expect: [] },
  { fn: "filter", args: ["auto"], expect: [] },
  { fn: "filter", args: [42], expect: [] },
  { fn: "filter", args: [true], expect: [] },
  { fn: "filter", args: [{ name: "auto", description: "Autoselect device" }], expect: [] },
  { fn: "filter", args: [{ 0: { name: "auto" }, length: 1 }], expect: [] },

  // ---- filter: the description is cleaned and cut into a label ----
  { fn: "filter", args: [[{ name: _HEADSET, description: "  Example \t Headset\n" }]],
    expect: [{ name: _HEADSET, label: "Example Headset" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "Example\u0000 Head\u001bset\u007f" }]],
    expect: [{ name: _HEADSET, label: "Example Headset" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "Example \u202etesdaeH\u202c" }]],
    expect: [{ name: _HEADSET, label: "Example tesdaeH" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "Exam\u200bple\u2066 Headset\ufeff" }]],
    expect: [{ name: _HEADSET, label: "Example Headset" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "Line one\nLine two\u2028Line three" }]],
    expect: [{ name: _HEADSET, label: "Line one Line two Line three" }] },
  // Markup is text like any other. It is shown as it is, never interpreted.
  { fn: "filter", args: [[{ name: _HEADSET, description: "<img src=x> &amp; <b>Headset</b>" }]],
    expect: [{ name: _HEADSET, label: "<img src=x> &amp; <b>Headset</b>" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "\u30d8\u30c3\u30c9\u30db\u30f3 caf\u00e9" }]],
    expect: [{ name: _HEADSET, label: "\u30d8\u30c3\u30c9\u30db\u30f3 caf\u00e9" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: _D40 + _D40 + _D40 }]],
    expect: [{ name: _HEADSET, label: _D40 + _D40 }] },
  // The cut does not split a character in two.
  { fn: "filter", args: [[{ name: _HEADSET, description: _D40 + _D40.slice(1) + "\ud83d\ude00" + _D40 }]],
    expect: [{ name: _HEADSET, label: _D40 + _D40.slice(1) }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "a\ud83db" }]],
    expect: [{ name: _HEADSET, label: "ab" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "constructor" }]],
    expect: [{ name: _HEADSET, label: "constructor" }] },

  // Only the first 1024 characters of a description are read. Whatever
  // follows them might as well not be there.
  { fn: "filter", args: [[{ name: _HEADSET, description: _hidden(1020, "Example Headset") }]],
    expect: [{ name: _HEADSET, label: "Exam" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: _hidden(1024, "Example Headset") }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },

  // ---- filter: without a usable description the node name is the label ----
  { fn: "filter", args: [[{ name: _HEADSET }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: "" }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: " \u200b\u202e\n" }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: null }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: 42 }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: ["Example Headset"] }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },
  { fn: "filter", args: [[{ name: _HEADSET, description: { text: "Example Headset" } }]],
    expect: [{ name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00" }] },
  { fn: "filter", args: [[{ name: "pipewire/" + _N50 + _N50 + _N50 + _N50 }]],
    expect: [{ name: "pipewire/" + _N50 + _N50 + _N50 + _N50, label: _N50 + _N50.slice(0, 30) }] },

  // ---- filter: each name once, and no more entries than the list holds ----
  { fn: "filter", args: [[
    { name: "auto", description: "Autoselect device" },
    { name: _SPEAKERS, description: "Example Speakers Analog Stereo" },
    { name: _HEADSET, description: "Example Headset" },
    { name: _SPEAKERS, description: "The same name again" },
    { name: "auto", description: "The same name again" }
  ]], expect: _OUTPUTS },
  { fn: "filter", args: [_manySinks(63)], expect: _keptSinks() },
  { fn: "filter", args: [_manySinks(64)], expect: _keptSinks() },
  { fn: "filter", args: [_manySinks(200)], expect: _keptSinks() },

  // ---- mark: the entry mpv is using is flagged ----
  { fn: "mark", args: [_OUTPUTS, _HEADSET], expect: [
    { name: "auto", label: "System default", current: false },
    { name: _SPEAKERS, label: "Example Speakers Analog Stereo", current: false },
    { name: _HEADSET, label: "Example Headset", current: true }
  ] },
  { fn: "mark", args: [_WITHOUT_HEADSET, "auto"], expect: [
    { name: "auto", label: "System default", current: true },
    { name: _SPEAKERS, label: "Example Speakers Analog Stereo", current: false }
  ] },
  // A device that is not on the list flags nothing, and neither does a
  // value that is no name.
  { fn: "mark", args: [_WITHOUT_HEADSET, _HEADSET], expect: [
    { name: "auto", label: "System default", current: false },
    { name: _SPEAKERS, label: "Example Speakers Analog Stereo", current: false }
  ] },
  { fn: "mark", args: [[_AUTO], "pipewire"], expect: [_AUTO_IDLE] },
  { fn: "mark", args: [[_AUTO], null], expect: [_AUTO_IDLE] },
  { fn: "mark", args: [[_AUTO], ["auto"]], expect: [_AUTO_IDLE] },
  { fn: "mark", args: [[], "auto"], expect: [] },
  { fn: "mark", args: [null, "auto"], expect: [] },
  { fn: "mark", args: ["auto", "auto"], expect: [] },
  // Whatever is not an output is dropped, and extra keys do not travel on.
  { fn: "mark", args: [[null, { name: "pulse/sink", label: "Other backend" }, { name: 42, label: "Number" },
    { name: "auto", label: 42 }, { name: _MONITOR, label: "Example Monitor", current: true, volume: 100 }],
    _MONITOR], expect: [
    { name: "auto", label: "System default", current: false },
    { name: _MONITOR, label: "Example Monitor", current: true }
  ] },

  // ---- mark: a list is read again, whoever made it ----
  // A name counts once, with the label it had first, so one entry at most
  // is flagged.
  { fn: "mark", args: [
    [_AUTO, { name: _SPEAKERS, label: "First" }, _AUTO, { name: _SPEAKERS, label: "Second" }], _SPEAKERS
  ], expect: [_AUTO_IDLE, { name: _SPEAKERS, label: "First", current: true }] },
  { fn: "mark", args: [[_AUTO, _AUTO, _AUTO], "auto"],
    expect: [{ name: "auto", label: "System default", current: true }] },
  // A label is cleaned and cut here as it is in filter, and is never empty.
  { fn: "mark", args: [[{ name: _HEADSET, label: "  Example\u0000 \u202etesdaeH\u202c\n" }], ""],
    expect: [{ name: _HEADSET, label: "Example tesdaeH", current: false }] },
  { fn: "mark", args: [[{ name: _HEADSET, label: _D40 + _D40 + _D40 }], ""],
    expect: [{ name: _HEADSET, label: _D40 + _D40, current: false }] },
  { fn: "mark", args: [[{ name: _HEADSET, label: "a\ud83db" }], ""],
    expect: [{ name: _HEADSET, label: "ab", current: false }] },
  { fn: "mark", args: [[{ name: _HEADSET, label: _hidden(1020, "Example Headset") }], ""],
    expect: [{ name: _HEADSET, label: "Exam", current: false }] },
  { fn: "mark",
    args: [[{ name: _HEADSET, label: "" }, { name: _SPEAKERS, label: 42 }, { name: _MONITOR }], ""],
    expect: [
      { name: _HEADSET, label: "example_output.headset-00_00_00_00_00_00", current: false },
      { name: _SPEAKERS, label: "example_output.speakers", current: false },
      { name: _MONITOR, label: "example_output.monitor", current: false }
    ] },
  // The system default is called what this module calls it.
  { fn: "mark", args: [[{ name: "auto", label: "<b>Anything</b>" }], ""], expect: [_AUTO_IDLE] },

  // ---- has: only a name on the list ----
  { fn: "has", args: [_OUTPUTS, "auto"], expect: true },
  { fn: "has", args: [_OUTPUTS, _SPEAKERS], expect: true },
  { fn: "has", args: [_OUTPUTS, _HEADSET], expect: true },
  { fn: "has", args: [_OUTPUTS, _MONITOR], expect: false },
  { fn: "has", args: [_WITHOUT_HEADSET, _HEADSET], expect: false },
  { fn: "has", args: [_SINKS_ONLY, "auto"], expect: false },
  { fn: "has", args: [_OUTPUTS, "pipewire"], expect: false },
  { fn: "has", args: [_OUTPUTS, "next"], expect: false },
  { fn: "has", args: [_OUTPUTS, ""], expect: false },
  { fn: "has", args: [_OUTPUTS, _HEADSET + " "], expect: false },
  { fn: "has", args: [_OUTPUTS, "AUTO"], expect: false },
  { fn: "has", args: [_OUTPUTS, "constructor"], expect: false },
  { fn: "has", args: [_OUTPUTS, "__proto__"], expect: false },
  { fn: "has", args: [_OUTPUTS, "length"], expect: false },
  { fn: "has", args: [_OUTPUTS, "0"], expect: false },
  { fn: "has", args: [_OUTPUTS, 0], expect: false },
  { fn: "has", args: [_OUTPUTS, null], expect: false },
  { fn: "has", args: [_OUTPUTS, ["auto"]], expect: false },
  { fn: "has", args: [_OUTPUTS, { name: "auto" }], expect: false },
  { fn: "has", args: [[], "auto"], expect: false },
  { fn: "has", args: [null, "auto"], expect: false },
  { fn: "has", args: ["auto", "auto"], expect: false },
  // A name that is no device name is not on the list, even when a list says so.
  { fn: "has", args: [[{ name: "pulse/sink", label: "Other backend" }], "pulse/sink"], expect: false },
  { fn: "has", args: [[_AUTO, _AUTO, { name: _SPEAKERS, label: "Once" }, { name: _SPEAKERS, label: "Twice" }],
    _SPEAKERS], expect: true },

  // ---- next: the entry after the current one, wrapping ----
  { fn: "next", args: [_OUTPUTS, "auto"], expect: _SPEAKERS },
  { fn: "next", args: [_OUTPUTS, _SPEAKERS], expect: _HEADSET },
  { fn: "next", args: [_OUTPUTS, _HEADSET], expect: "auto" },
  { fn: "next", args: [_SINKS_ONLY, _HEADSET], expect: _SPEAKERS },
  // From a device that is not on the list, cycling starts at the top.
  { fn: "next", args: [_WITHOUT_HEADSET, _HEADSET], expect: "auto" },
  { fn: "next", args: [_OUTPUTS, "pipewire"], expect: "auto" },
  { fn: "next", args: [_OUTPUTS, ""], expect: "auto" },
  { fn: "next", args: [_OUTPUTS, null], expect: "auto" },
  { fn: "next", args: [_OUTPUTS, 1], expect: "auto" },
  { fn: "next", args: [_SINKS_ONLY, "auto"], expect: _SPEAKERS },
  // Nothing to move to.
  { fn: "next", args: [[_AUTO], "auto"], expect: "" },
  { fn: "next", args: [[], "auto"], expect: "" },
  { fn: "next", args: [null, "auto"], expect: "" },
  { fn: "next", args: [[{ name: "pulse/sink", label: "Other backend" }], "auto"], expect: "" },
  { fn: "next", args: [[_AUTO], _HEADSET], expect: "auto" },
  // A name that a list repeats is one entry: cycling moves on from it, and
  // a list that holds nothing else has nowhere to move to.
  { fn: "next", args: [[_AUTO, _AUTO, { name: _SPEAKERS, label: "Example Speakers" }], "auto"],
    expect: _SPEAKERS },
  { fn: "next", args: [[_AUTO, { name: _SPEAKERS, label: "Once" }, { name: _SPEAKERS, label: "Twice" },
    { name: _HEADSET, label: "Example Headset" }], _SPEAKERS], expect: _HEADSET },
  { fn: "next", args: [[{ name: _SPEAKERS, label: "Once" }, { name: _SPEAKERS, label: "Twice" }], _SPEAKERS],
    expect: "" },
  { fn: "next", args: [[_AUTO, _AUTO, _AUTO], "auto"], expect: "" },
  { fn: "next", args: [[{ name: _HEADSET, label: "Example Headset" }, _AUTO, _AUTO], "auto"],
    expect: _HEADSET },

  // ---- plan: the saved device when it is there ----
  { fn: "plan", args: [_OUTPUTS, "", "auto"], expect: { device: "auto", send: false, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, _HEADSET, "auto"],
    expect: { device: _HEADSET, send: true, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, _HEADSET, _HEADSET],
    expect: { device: _HEADSET, send: false, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, _HEADSET, _SPEAKERS],
    expect: { device: _HEADSET, send: true, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, "", _SPEAKERS], expect: { device: "auto", send: true, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, "auto", _SPEAKERS],
    expect: { device: "auto", send: true, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, "auto", "auto"], expect: { device: "auto", send: false, fallback: false } },

  // ---- plan: the system default while the saved device is gone ----
  { fn: "plan", args: [_WITHOUT_HEADSET, _HEADSET, _HEADSET],
    expect: { device: "auto", send: true, fallback: true } },
  { fn: "plan", args: [_WITHOUT_HEADSET, _HEADSET, "auto"],
    expect: { device: "auto", send: false, fallback: true } },
  { fn: "plan", args: [_WITHOUT_HEADSET, _HEADSET, _SPEAKERS],
    expect: { device: "auto", send: true, fallback: true } },
  // A saved value that never was a device is a device that is gone.
  { fn: "plan", args: [_OUTPUTS, "pipewire", "auto"],
    expect: { device: "auto", send: false, fallback: true } },
  { fn: "plan", args: [_OUTPUTS, "pulse/sink", "auto"],
    expect: { device: "auto", send: false, fallback: true } },
  { fn: "plan", args: [_OUTPUTS, "constructor", "auto"],
    expect: { device: "auto", send: false, fallback: true } },
  { fn: "plan", args: [_OUTPUTS, "__proto__", _HEADSET],
    expect: { device: "auto", send: true, fallback: true } },
  { fn: "plan", args: [_OUTPUTS, _HEADSET + "\n", "auto"],
    expect: { device: "auto", send: false, fallback: true } },

  // ---- plan: a saved value that is no string means no choice was made ----
  { fn: "plan", args: [_OUTPUTS, null, "auto"], expect: { device: "auto", send: false, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, 42, _HEADSET], expect: { device: "auto", send: true, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, [_HEADSET], "auto"],
    expect: { device: "auto", send: false, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, { name: _HEADSET }, "auto"],
    expect: { device: "auto", send: false, fallback: false } },

  // ---- plan: the system default needs no entry, and mpv may report anything ----
  { fn: "plan", args: [_SINKS_ONLY, "", _SPEAKERS], expect: { device: "auto", send: true, fallback: false } },
  { fn: "plan", args: [_SINKS_ONLY, _MONITOR, "auto"],
    expect: { device: "auto", send: false, fallback: true } },
  { fn: "plan", args: [_OUTPUTS, _HEADSET, null], expect: { device: _HEADSET, send: true, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, "", null], expect: { device: "auto", send: true, fallback: false } },
  { fn: "plan", args: [_OUTPUTS, "", ["auto"]], expect: { device: "auto", send: true, fallback: false } },

  // ---- plan: without a list nothing is decided ----
  { fn: "plan", args: [[], _HEADSET, "auto"], expect: _NOTHING },
  { fn: "plan", args: [[], "", _HEADSET], expect: _NOTHING },
  { fn: "plan", args: [null, _HEADSET, _HEADSET], expect: _NOTHING },
  { fn: "plan", args: ["auto", "", "auto"], expect: _NOTHING },
  { fn: "plan", args: [[{ name: "pulse/sink", label: "Other backend" }], _HEADSET, _HEADSET],
    expect: _NOTHING },
  // A repeated name changes nothing.
  { fn: "plan", args: [[_AUTO, _AUTO, { name: _HEADSET, label: "Once" }, { name: _HEADSET, label: "Twice" }],
    _HEADSET, "auto"], expect: { device: _HEADSET, send: true, fallback: false } }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
