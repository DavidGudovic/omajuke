.pragma library

// Input and expectation table for lib/KeyCombo.js: which texts are key
// combinations, what a captured key press becomes, which listings of binds
// are readable and what is read from them, and how a combination stands in
// a list of binds. The same table runs under node and inside Qt's
// JavaScript engine, so both must agree on every row.
//
// Two results are left to the node test, because they contain the plugin
// id, which this file does not repeat: the command an action runs and the
// line a user can paste. Their refusals are here.

// ---- Building blocks ----

var _PANEL = "OmaJuke: open panel"
var _VIDEO = "OmaJuke: show or hide video"
var _OUTPUT = "OmaJuke: next audio output"
var _PANEL_PASTED = "OmaJuke panel (bindings.lua)"
var _VIDEO_PASTED = "OmaJuke video (bindings.lua)"
var _OUTPUT_PASTED = "OmaJuke output (bindings.lua)"

// Somebody else's description.
var _X = "Placeholder 1"

// Qt's numbers for the keys and modifiers used below.
var _KEY_A = 0x41
var _KEY_V = 0x56
var _KEY_Z = 0x5a
var _KEY_F1 = 0x01000030
var _KEY_F12 = 0x0100003b
var _SHIFT = 0x02000000
var _CTRL = 0x04000000
var _ALT = 0x08000000
var _META = 0x10000000
var _KEYPAD = 0x20000000
var _GROUP = 0x40000000

// Combinations, as parse() returns them.
var _V76 = { canonical: "SUPER + CTRL + ALT + V", mask: 76, key: "V", alias: "MOD4 + CONTROL + MOD1 + V" }
var _F2 = { canonical: "CTRL + ALT + F2", mask: 12, key: "F2", alias: "CONTROL + MOD1 + F2" }
var _F11 = { canonical: "CTRL + F11", mask: 4, key: "F11", alias: "CONTROL + F11" }
var _F12 = { canonical: "CTRL + F12", mask: 4, key: "F12", alias: "CONTROL + F12" }

function _on72(key) {
  return { canonical: "SUPER + ALT + " + key, mask: 72, key: key, alias: "MOD4 + MOD1 + " + key }
}

var _Q72 = _on72("Q")
var _P72 = _on72("P")
var _A72 = _on72("A")
var _L72 = _on72("L")
var _Z72 = _on72("Z")
var _M72 = _on72("M")
var _F1_72 = _on72("F1")
var _F10_72 = _on72("F10")

var _US = { plainUs: true }
var _OTHER = { plainUs: false }

// Replies to the four option reads that decide the layout, as the tool
// prints them on a desktop where only the layout was ever set.
var _LAYOUT = "{\"option\": \"input:kb_layout\", \"str\": \"us\", \"set\": true }"
var _VARIANT = "{\"option\": \"input:kb_variant\", \"str\": \"[[EMPTY]]\", \"set\": false }"
var _BY_SYM = "{\"option\": \"input:resolve_binds_by_sym\", \"bool\": false, \"set\": false }"
var _FILE = "{\"option\": \"input:kb_file\", \"str\": \"[[EMPTY]]\", \"set\": false }"

// The same replies after parsing, cut down to the member that is read: a
// text option set to "us", set to nothing, never set, and a switch off.
// The reply for a plain US layout with a member nobody reads, count
// characters long, added to it.
function _padded(count) {
  return "{\"str\": \"us\", \"pad\": \"" + _times("p", count) + "\"}"
}

var _US_ONLY = { str: "us" }
var _NONE = { str: "" }
var _UNSET = { str: "[[EMPTY]]" }
var _OFF = { bool: false }

// A list that was not read has no records at all. A list that was read and
// is empty, the one of a desktop without binds, has an empty list of them.
var _BAD = { ok: false, records: null }
var _NO_BINDS = { ok: true, records: [] }

function _times(unit, count) {
  var text = ""
  for (var i = 0; i < count; i++) text += unit
  return text
}

// A record as parseBinds() returns it.
function _full(modmask, submap, key, keycode, catchall, description, dispatcher, ignoreMods) {
  return {
    modmask: modmask, submap: submap, key: key, keycode: keycode, catchall: catchall,
    description: description, dispatcher: dispatcher, ignoreMods: ignoreMods
  }
}

// The usual one: a described bind from a scripted configuration.
function _r(modmask, key, description) {
  return _full(modmask, "", key, 0, false, description, "__lua", false)
}

function _good(records) {
  return { ok: true, records: records }
}

// A list of the same harmless record, count times.
function _many(count) {
  var list = []
  for (var i = 0; i < count; i++) list.push(_r(64, "W", "Placeholder 1"))
  return list
}

// An array inside an array inside an array, depth times.
function _nest(depth) {
  var value = []
  for (var i = 0; i < depth; i++) value = [value]
  return value
}

// One record of a listing, as the compositor prints it.
function _lines(header, modmask, submap, key, keycode, catchall, description, dispatcher) {
  return header + "\n\tmodmask: " + modmask + "\n\tsubmap: " + submap + "\n\tkey: " + key
    + "\n\tkeycode: " + keycode + "\n\tcatchall: " + catchall + "\n\tdescription: " + description
    + "\n\tdispatcher: " + dispatcher + "\n\targ: 5\n\n"
}

function _t(modmask, key, description) {
  return _lines("bindd", modmask, "", key, 0, false, description, "__lua")
}

// A record whose lines are given one by one, for the shapes _lines() cannot
// print.
function _raw(lines) {
  return lines.join("\n") + "\n\n"
}

var _OURS = _r(76, "V", _VIDEO)
var _THEIRS = _r(76, "V", _X)
var _CATCHALL = _full(76, "", "catchall", 0, true, "", "__lua", false)

// A list in which nothing touches the proposed combinations.
var _QUIET = [_r(64, "Return", _X), _r(0, "XF86AudioPlay", _X)]

// The same with the digit row bound by key number on SUPER + ALT, which
// cannot be told from a letter on a keyboard that is not plain US.
var _NUMBERED = [_r(64, "Return", _X), _r(72, "SUPER + ALT + code:10", _X)]

var MODULE = "KeyCombo"
var CASES = [
  // ---- parse: combinations ----
  { fn: "parse", args: ["SUPER + CTRL + ALT + V"], expect: _V76 },
  { fn: "parse", args: ["SUPER + V"],
    expect: { canonical: "SUPER + V", mask: 64, key: "V", alias: "MOD4 + V" } },
  { fn: "parse", args: ["CTRL + V"],
    expect: { canonical: "CTRL + V", mask: 4, key: "V", alias: "CONTROL + V" } },
  { fn: "parse", args: ["ALT + V"], expect: { canonical: "ALT + V", mask: 8, key: "V", alias: "MOD1 + V" } },
  { fn: "parse", args: ["SUPER + SHIFT + A"],
    expect: { canonical: "SUPER + SHIFT + A", mask: 65, key: "A", alias: "MOD4 + SHIFT + A" } },
  { fn: "parse", args: ["CTRL + ALT + F2"], expect: _F2 },
  { fn: "parse", args: ["ALT + SHIFT + F1"],
    expect: { canonical: "ALT + SHIFT + F1", mask: 9, key: "F1", alias: "MOD1 + SHIFT + F1" } },
  { fn: "parse", args: ["SUPER + ALT + Z"],
    expect: { canonical: "SUPER + ALT + Z", mask: 72, key: "Z", alias: "MOD4 + MOD1 + Z" } },
  { fn: "parse", args: ["SUPER + CTRL + ALT + SHIFT + F12"],
    expect: { canonical: "SUPER + CTRL + ALT + SHIFT + F12", mask: 77, key: "F12",
      alias: "MOD4 + CONTROL + MOD1 + SHIFT + F12" } },
  { fn: "parse", args: ["SUPER + F10"],
    expect: { canonical: "SUPER + F10", mask: 64, key: "F10", alias: "MOD4 + F10" } },

  // ---- parse: a key alone or with SHIFT is typing, not a shortcut ----
  { fn: "parse", args: ["V"], expect: null },
  { fn: "parse", args: ["F5"], expect: null },
  { fn: "parse", args: ["SHIFT + V"], expect: null },
  { fn: "parse", args: ["SHIFT + F5"], expect: null },

  // ---- parse: only the exact spelling ----
  { fn: "parse", args: [""], expect: null },
  { fn: "parse", args: [" "], expect: null },
  { fn: "parse", args: ["SUPER"], expect: null },
  { fn: "parse", args: ["SUPER + "], expect: null },
  { fn: "parse", args: ["SUPER +"], expect: null },
  { fn: "parse", args: [" + V"], expect: null },
  { fn: "parse", args: ["+ V"], expect: null },
  { fn: "parse", args: ["super + v"], expect: null },
  { fn: "parse", args: ["Super + V"], expect: null },
  { fn: "parse", args: ["SUPER + v"], expect: null },
  { fn: "parse", args: ["SUPER + f5"], expect: null },
  { fn: "parse", args: ["SUPER+V"], expect: null },
  { fn: "parse", args: ["SUPER +V"], expect: null },
  { fn: "parse", args: ["SUPER+ V"], expect: null },
  { fn: "parse", args: ["SUPER  +  V"], expect: null },
  { fn: "parse", args: [" SUPER + V"], expect: null },
  { fn: "parse", args: ["SUPER + V "], expect: null },
  { fn: "parse", args: ["SUPER + V\n"], expect: null },
  { fn: "parse", args: ["\nSUPER + V"], expect: null },
  { fn: "parse", args: ["SUPER + V\r"], expect: null },
  { fn: "parse", args: ["SUPER\t+ V"], expect: null },
  { fn: "parse", args: ["SUPER + V\nSUPER + W"], expect: null },
  { fn: "parse", args: ["SUPER + V\u0000"], expect: null },
  { fn: "parse", args: ["\u0000SUPER + V"], expect: null },
  { fn: "parse", args: ["CTRL + SUPER + V"], expect: null },
  { fn: "parse", args: ["SHIFT + SUPER + V"], expect: null },
  { fn: "parse", args: ["ALT + CTRL + V"], expect: null },
  { fn: "parse", args: ["SUPER + SUPER + V"], expect: null },
  { fn: "parse", args: ["CTRL + CTRL + V"], expect: null },
  { fn: "parse", args: ["SUPER + V + V"], expect: null },
  { fn: "parse", args: ["SUPER + A + B"], expect: null },
  { fn: "parse", args: ["SUPER + AB"], expect: null },

  // ---- parse: the spelling meant for the compositor is not accepted back ----
  { fn: "parse", args: ["MOD4 + V"], expect: null },
  { fn: "parse", args: ["CONTROL + V"], expect: null },
  { fn: "parse", args: ["MOD1 + V"], expect: null },
  { fn: "parse", args: ["MOD4 + CONTROL + MOD1 + V"], expect: null },
  { fn: "parse", args: ["WIN + V"], expect: null },
  { fn: "parse", args: ["META + V"], expect: null },
  { fn: "parse", args: ["LOGO + V"], expect: null },
  { fn: "parse", args: ["CAPS + V"], expect: null },
  { fn: "parse", args: ["MOD2 + V"], expect: null },
  { fn: "parse", args: ["MOD5 + V"], expect: null },

  // ---- parse: keys outside the grammar ----
  { fn: "parse", args: ["SUPER + 1"], expect: null },
  { fn: "parse", args: ["SUPER + F0"], expect: null },
  { fn: "parse", args: ["SUPER + F13"], expect: null },
  { fn: "parse", args: ["SUPER + F01"], expect: null },
  { fn: "parse", args: ["SUPER + F100"], expect: null },
  { fn: "parse", args: ["SUPER + F"],
    expect: { canonical: "SUPER + F", mask: 64, key: "F", alias: "MOD4 + F" } },
  { fn: "parse", args: ["SUPER + SPACE"], expect: null },
  { fn: "parse", args: ["SUPER + RETURN"], expect: null },
  { fn: "parse", args: ["SUPER + ESCAPE"], expect: null },
  { fn: "parse", args: ["SUPER + code:55"], expect: null },
  { fn: "parse", args: ["SUPER + mouse:272"], expect: null },
  { fn: "parse", args: ["SUPER + XF86AudioPlay"], expect: null },
  { fn: "parse", args: ["SUPER + 0x76"], expect: null },
  { fn: "parse", args: ["SUPER + \u0412"], expect: null },
  { fn: "parse", args: ["SUPER + \uff36"], expect: null },
  { fn: "parse", args: ["SUPER + \u212a"], expect: null },
  { fn: "parse", args: ["SUPER\u00a0+ V"], expect: null },
  { fn: "parse", args: ["SUPER + V\u200b"], expect: null },
  { fn: "parse", args: ["\ufeffSUPER + V"], expect: null },

  // ---- parse: words the compositor gives a meaning of their own ----
  { fn: "parse", args: ["all"], expect: null },
  { fn: "parse", args: ["catchall"], expect: null },
  { fn: "parse", args: ["SUPER + all"], expect: null },
  { fn: "parse", args: ["SUPER + catchall"], expect: null },

  // ---- parse: text that tries to leave a quoted string or a line ----
  { fn: "parse", args: ["F1\") os.execute(\"x"], expect: null },
  { fn: "parse", args: ["SUPER + F1\") os.execute(\"x"], expect: null },
  { fn: "parse", args: ["SUPER + V\") hl.unbind(\"all"], expect: null },
  { fn: "parse", args: ["SUPER + V]]"], expect: null },
  { fn: "parse", args: ["]]"], expect: null },
  { fn: "parse", args: ["[[SUPER + V]]"], expect: null },
  { fn: "parse", args: ["SUPER + V -- x"], expect: null },
  { fn: "parse", args: ["SUPER + V; x"], expect: null },
  { fn: "parse", args: ["SUPER + $(id)"], expect: null },
  { fn: "parse", args: ["SUPER + \x60id\x60"], expect: null },
  { fn: "parse", args: ["SUPER + V'"], expect: null },
  { fn: "parse", args: ["SUPER + V\""], expect: null },
  { fn: "parse", args: ["SUPER + V\\"], expect: null },
  { fn: "parse", args: ["SUPER + V/"], expect: null },
  { fn: "parse", args: ["SUPER + V\\n"], expect: null },

  // ---- parse: length and type ----
  { fn: "parse", args: [{ gen: "repeat", unit: "A", count: 65 }], expect: null },
  { fn: "parse", args: [{ gen: "repeat", unit: "SUPER + ", count: 9 }], expect: null },
  { fn: "parse", args: [{ gen: "repeat", unit: "SUPER + V", count: 300000 }], expect: null },
  { fn: "parse", args: [{ gen: "codes", codes: [83, 55357] }], expect: null },
  { fn: "parse", args: [null], expect: null },
  { fn: "parse", args: [undefined], expect: null },
  { fn: "parse", args: [], expect: null },
  { fn: "parse", args: [0], expect: null },
  { fn: "parse", args: [76], expect: null },
  { fn: "parse", args: [true], expect: null },
  { fn: "parse", args: [[]], expect: null },
  { fn: "parse", args: [["SUPER + V"]], expect: null },
  { fn: "parse", args: [{}], expect: null },
  { fn: "parse", args: [_V76], expect: null },

  // ---- fromQt: letters and function keys with SUPER, CTRL or ALT held ----
  { fn: "fromQt", args: [_KEY_V, _META + _CTRL + _ALT], expect: "SUPER + CTRL + ALT + V" },
  { fn: "fromQt", args: [_KEY_A, _META], expect: "SUPER + A" },
  { fn: "fromQt", args: [_KEY_Z, _ALT], expect: "ALT + Z" },
  { fn: "fromQt", args: [_KEY_V, _CTRL], expect: "CTRL + V" },
  { fn: "fromQt", args: [_KEY_V, _META + _SHIFT], expect: "SUPER + SHIFT + V" },
  { fn: "fromQt", args: [_KEY_F1, _CTRL + _ALT], expect: "CTRL + ALT + F1" },
  { fn: "fromQt", args: [_KEY_F12, _META + _CTRL + _ALT + _SHIFT],
    expect: "SUPER + CTRL + ALT + SHIFT + F12" },
  { fn: "fromQt", args: [_KEY_F1 + 9, _ALT], expect: "ALT + F10" },

  // ---- fromQt: not a shortcut ----
  { fn: "fromQt", args: [_KEY_V, 0], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _SHIFT], expect: "" },
  { fn: "fromQt", args: [_KEY_F1, 0], expect: "" },
  { fn: "fromQt", args: [_KEY_F1, _SHIFT], expect: "" },

  // ---- fromQt: any other modifier refuses the press ----
  { fn: "fromQt", args: [_KEY_V, _META + _KEYPAD], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _META + _GROUP], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _META + _CTRL + _ALT + _SHIFT + _KEYPAD + _GROUP], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _META + 0x80000000], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _META + 1], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _META + 0x01000000], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _META * 16], expect: "" },
  { fn: "fromQt", args: [_KEY_V, 0xffffffff], expect: "" },
  { fn: "fromQt", args: [_KEY_V, 1e300], expect: "" },

  // ---- fromQt: any other key ----
  { fn: "fromQt", args: [_KEY_A - 1, _META], expect: "" },
  { fn: "fromQt", args: [_KEY_Z + 1, _META], expect: "" },
  { fn: "fromQt", args: [0x61, _META], expect: "" },
  { fn: "fromQt", args: [0x31, _META], expect: "" },
  { fn: "fromQt", args: [0x20, _META], expect: "" },
  { fn: "fromQt", args: [0x3f, _META], expect: "" },
  { fn: "fromQt", args: [_KEY_F1 - 1, _META], expect: "" },
  { fn: "fromQt", args: [_KEY_F12 + 1, _META], expect: "" },
  { fn: "fromQt", args: [0x01000000, _META], expect: "" },
  { fn: "fromQt", args: [0x01000004, _META], expect: "" },
  { fn: "fromQt", args: [0x01000022, _META], expect: "" },
  { fn: "fromQt", args: [0, _META], expect: "" },

  // ---- fromQt: wrong types ----
  { fn: "fromQt", args: ["V", _META], expect: "" },
  { fn: "fromQt", args: ["86", _META], expect: "" },
  { fn: "fromQt", args: [_KEY_V, "268435456"], expect: "" },
  { fn: "fromQt", args: [_KEY_V + 0.5, _META], expect: "" },
  { fn: "fromQt", args: [_KEY_V, _META + 0.5], expect: "" },
  { fn: "fromQt", args: [-_KEY_V, _META], expect: "" },
  { fn: "fromQt", args: [_KEY_V, -_META], expect: "" },
  { fn: "fromQt", args: [NaN, _META], expect: "" },
  { fn: "fromQt", args: [_KEY_V, NaN], expect: "" },
  { fn: "fromQt", args: [Infinity, _META], expect: "" },
  { fn: "fromQt", args: [_KEY_V, Infinity], expect: "" },
  { fn: "fromQt", args: [null, null], expect: "" },
  { fn: "fromQt", args: [_KEY_V], expect: "" },
  { fn: "fromQt", args: [], expect: "" },
  { fn: "fromQt", args: [[_KEY_V], [_META]], expect: "" },
  { fn: "fromQt", args: [{}, {}], expect: "" },

  // ---- action ----
  { fn: "action", args: ["panel"],
    expect: { action: "panel", label: "Open panel", description: _PANEL, configDescription: _PANEL_PASTED,
      proposals: ["SUPER + CTRL + ALT + J", "SUPER + ALT + J", "SUPER + CTRL + ALT + P"] } },
  { fn: "action", args: ["video"],
    expect: { action: "video", label: "Show or hide video", description: _VIDEO,
      configDescription: _VIDEO_PASTED, proposals: ["SUPER + CTRL + ALT + V", "SUPER + ALT + V"] } },
  { fn: "action", args: ["output"],
    expect: { action: "output", label: "Next audio output", description: _OUTPUT,
      configDescription: _OUTPUT_PASTED, proposals: ["SUPER + CTRL + ALT + O", "SUPER + ALT + O"] } },
  { fn: "action", args: [""], expect: null },
  { fn: "action", args: ["Panel"], expect: null },
  { fn: "action", args: ["panel "], expect: null },
  { fn: "action", args: ["constructor"], expect: null },
  { fn: "action", args: ["__proto__"], expect: null },
  { fn: "action", args: ["toString"], expect: null },
  { fn: "action", args: ["length"], expect: null },
  { fn: "action", args: ["0"], expect: null },
  { fn: "action", args: [0], expect: null },
  { fn: "action", args: [null], expect: null },
  { fn: "action", args: [undefined], expect: null },
  { fn: "action", args: [["panel"]], expect: null },
  { fn: "action", args: [{}], expect: null },

  // ---- command: no such action ----
  { fn: "command", args: [""], expect: "" },
  { fn: "command", args: ["Video"], expect: "" },
  { fn: "command", args: ["constructor"], expect: "" },
  { fn: "command", args: ["__proto__"], expect: "" },
  { fn: "command", args: ["video toggle"], expect: "" },
  { fn: "command", args: ["video; x"], expect: "" },
  { fn: "command", args: [1], expect: "" },
  { fn: "command", args: [null], expect: "" },
  { fn: "command", args: [["video"]], expect: "" },

  // ---- copyLine: nothing is produced from a bad action or combination ----
  { fn: "copyLine", args: ["constructor", "SUPER + V"], expect: "" },
  { fn: "copyLine", args: ["", "SUPER + V"], expect: "" },
  { fn: "copyLine", args: [null, "SUPER + V"], expect: "" },
  { fn: "copyLine", args: [["video"], "SUPER + V"], expect: "" },
  { fn: "copyLine", args: ["video", ""], expect: "" },
  { fn: "copyLine", args: ["video", "V"], expect: "" },
  { fn: "copyLine", args: ["video", "SHIFT + V"], expect: "" },
  { fn: "copyLine", args: ["video", "super + v"], expect: "" },
  { fn: "copyLine", args: ["video", "MOD4 + V"], expect: "" },
  { fn: "copyLine", args: ["video", "SUPER + V\")\nos.execute(\"x"], expect: "" },
  { fn: "copyLine", args: ["video", "SUPER + V\", \"x\", \"y\") --"], expect: "" },
  { fn: "copyLine", args: ["video", null], expect: "" },
  { fn: "copyLine", args: ["video", _V76], expect: "" },
  { fn: "copyLine", args: ["video"], expect: "" },

  // ---- parseBinds: records as the compositor prints them ----
  { fn: "parseBinds", args: [_t(76, "V", _VIDEO)], expect: _good([_OURS]) },
  { fn: "parseBinds", args: [_t(64, "SUPER + code:10", _X)], expect: _good([_r(64, "SUPER + code:10", _X)]) },
  { fn: "parseBinds", args: [_t(76, "V", _VIDEO) + _t(0, "XF86AudioPlay", _X) + "\n"],
    expect: _good([_OURS, _r(0, "XF86AudioPlay", _X)]) },
  { fn: "parseBinds", args: ["\n\n" + _t(76, "V", _X) + "\n\n\n" + _t(76, "W", _X) + "\n\n"],
    expect: _good([_r(76, "V", _X), _r(76, "W", _X)]) },
  { fn: "parseBinds",
    args: [_lines("bind", 0, "", "mouse:272", 0, false, "", "mouse")
      + _lines("bindled", 0, "", "XF86AudioRaiseVolume", 0, false, _X, "__lua")
      + _lines("bindlmrenadx", 1, "", "Print", 0, false, _X, "exec")],
    expect: _good([
      _full(0, "", "mouse:272", 0, false, "", "mouse", false),
      _r(0, "XF86AudioRaiseVolume", _X),
      _full(1, "", "Print", 0, false, _X, "exec", false)
    ]) },
  { fn: "parseBinds",
    args: [_lines("bind", 0, "demo", "catchall", 0, true, "", "submap")
      + _lines("binde", 4294967295, "a b: c", "switch:on:Example Switch", 4294967295, false, _X, "")],
    expect: _good([
      _full(0, "demo", "catchall", 0, true, "", "submap", false),
      _full(4294967295, "a b: c", "switch:on:Example Switch", 4294967295, false, _X, "", false)
    ]) },

  // ---- parseBinds: an empty value with and without the space after the colon ----
  { fn: "parseBinds",
    args: [_raw(["bind", "\tmodmask: 13", "\tsubmap:", "\tkey:", "\tkeycode: 0", "\tcatchall: false",
      "\tdescription:", "\tdispatcher:", "\targ:"])],
    expect: _good([_full(13, "", "", 0, false, "", "", false)]) },
  { fn: "parseBinds",
    args: [_raw(["bind", "\tmodmask:13", "\tsubmap: ", "\tkey: ", "\tkeycode:0", "\tcatchall:false",
      "\tdescription: ", "\tdispatcher: ", "\targ: "])],
    expect: _good([_full(13, "", "", 0, false, "", "", false)]) },
  // Only one space belongs to the separator. The rest is the value.
  { fn: "parseBinds", args: [_lines("bindd", 76, " ", " V ", 0, false, "  two  spaces ", "__lua")],
    expect: _good([_full(76, " ", " V ", 0, false, "  two  spaces ", "__lua", false)]) },

  // ---- parseBinds: a description is whatever its author wrote ----
  { fn: "parseBinds", args: [_t(76, "V", "key: W, modmask: 0, catchall: true")],
    expect: _good([_r(76, "V", "key: W, modmask: 0, catchall: true")]) },
  { fn: "parseBinds", args: [_t(76, "V", "bindd")], expect: _good([_r(76, "V", "bindd")]) },
  { fn: "parseBinds", args: [_t(76, "V", "\tkey: W")], expect: _good([_r(76, "V", "\tkey: W")]) },
  { fn: "parseBinds", args: [_t(76, "V", "a\rb \u0000 \u202e c + d \" ' \\ </b> $(x) \x60y\x60")],
    expect: _good([_r(76, "V", "a\rb \u0000 \u202e c + d \" ' \\ </b> $(x) \x60y\x60")]) },
  { fn: "parseBinds", args: [_t(76, "V", "\u041f\u0440\u0438\u043c\u0435\u0440 \u4f8b \ud83c\udfb5")],
    expect: _good([_r(76, "V", "\u041f\u0440\u0438\u043c\u0435\u0440 \u4f8b \ud83c\udfb5")]) },
  { fn: "parseBinds", args: [_t(76, "V", _VIDEO + " ")], expect: _good([_r(76, "V", _VIDEO + " ")]) },
  // Kept up to a length no description of ours reaches.
  { fn: "parseBinds", args: [_t(76, "V", _times("d", 300))], expect: _good([_r(76, "V", _times("d", 256))]) },
  { fn: "parseBinds", args: [_lines("bindd", 76, _times("s", 300), "V", 0, false, _X, _times("p", 300))],
    expect: _good([_full(76, _times("s", 256), "V", 0, false, _X, _times("p", 256), false)]) },
  { fn: "parseBinds", args: [_t(76, _times("k", 256), _X)], expect: _good([_r(76, _times("k", 256), _X)]) },

  // ---- parseBinds: fields in any order, unknown fields, missing texts ----
  { fn: "parseBinds",
    args: [_raw(["bindd", "\targ: 7", "\tdispatcher: __lua", "\tdescription: " + _X, "\tcatchall: false",
      "\tkeycode: 0", "\tkey: V", "\tsubmap: ", "\tmodmask: 76"])],
    expect: _good([_THEIRS]) },
  { fn: "parseBinds",
    args: [_raw(["bindd", "\tmodmask: 76", "\tsubmap: ", "\tkey: V", "\tkeycode: 0", "\tcatchall: false"])],
    expect: _good([_full(76, "", "V", 0, false, "", "", false)]) },
  { fn: "parseBinds",
    args: [_raw(["bindd", "\tmodmask: 76", "\tsubmap: ", "\tkey: V", "\tkeycode: 0", "\tcatchall: false",
      "\tdescription: " + _X, "\tdispatcher: __lua", "\targ: 5", "\targ: 6", "\tlong_press: false",
      "\tdevice_list: a, b"])],
    expect: _good([_THEIRS]) },

  // ---- parseBinds: the format of later compositor versions ----
  { fn: "parseBinds",
    args: [_raw(["bind", "\tflags: locked, repeat", "\tmodmask: 64", "\tsubmap: ", "\tkey: SUPER + code:10",
      "\tkeycode: 10", "\tcatchall: false", "\tdescription: " + _X, "\tdispatcher: __lua", "\targ: 5"])],
    expect: _good([_full(64, "", "SUPER + code:10", 10, false, _X, "__lua", false)]) },
  { fn: "parseBinds",
    args: [_raw(["bind", "\tflags: ", "\tmodmask: 76", "\tsubmap: ", "\tkey: V", "\tkeycode: 0",
      "\tcatchall: false", "\tdescription: " + _X, "\tdispatcher: __lua", "\targ: 5"])],
    expect: _good([_THEIRS]) },
  { fn: "parseBinds",
    args: [_raw(["bind", "\tflags: release, ignore_mods, dont_inhibit", "\tmodmask: 0", "\tsubmap: ",
      "\tkey: V", "\tkeycode: 0", "\tcatchall: false", "\tdescription: " + _X, "\tdispatcher: __lua",
      "\targ: 5"])],
    expect: _good([_full(0, "", "V", 0, false, _X, "__lua", true)]) },
  { fn: "parseBinds",
    args: [_raw(["bind", "\tflags: ignore_mods", "\tmodmask: 0", "\tsubmap: ", "\tkey: V", "\tkeycode: 0",
      "\tcatchall: false"])],
    expect: _good([_full(0, "", "V", 0, false, "", "", true)]) },
  // Only the flag itself counts, not a word that contains it.
  { fn: "parseBinds",
    args: [_raw(["bind", "\tflags: not_ignore_mods, ignore_mods_too", "\tmodmask: 0", "\tsubmap: ",
      "\tkey: V", "\tkeycode: 0", "\tcatchall: false"])],
    expect: _good([_full(0, "", "V", 0, false, "", "", false)]) },

  // ---- parseBinds: line ends ----
  { fn: "parseBinds",
    args: ["bindd\r\n\tmodmask: 76\r\n\tsubmap: \r\n\tkey: V\r\n\tkeycode: 0\r\n\tcatchall: false\r\n"
      + "\tdescription: " + _X + "\r\n\tdispatcher: __lua\r\n\targ: 5\r\n\r\n"],
    expect: _good([_THEIRS]) },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "\r"], expect: _good([_THEIRS]) },

  // ---- parseBinds: not a listing at all ----
  { fn: "parseBinds", args: [""], expect: _BAD },
  { fn: "parseBinds", args: ["\n"], expect: _BAD },
  { fn: "parseBinds", args: ["\n\n\n\n"], expect: _BAD },
  { fn: "parseBinds", args: ["\r\n\r\n"], expect: _BAD },
  { fn: "parseBinds", args: ["ok\n"], expect: _BAD },
  { fn: "parseBinds", args: ["ok\n\n"], expect: _BAD },
  { fn: "parseBinds", args: ["error: something went wrong\n\n"], expect: _BAD },
  { fn: "parseBinds", args: ["unknown request"], expect: _BAD },
  { fn: "parseBinds", args: [" unknown request\n"], expect: _BAD },
  { fn: "parseBinds", args: ["unknown request \n"], expect: _BAD },
  { fn: "parseBinds", args: ["Unknown request\n"], expect: _BAD },
  { fn: "parseBinds", args: ["\nunknown request\n"], expect: _BAD },
  { fn: "parseBinds", args: ["unknown request\nunknown request\n"], expect: _BAD },
  { fn: "parseBinds", args: ["unknown request\n" + _t(76, "V", _X)], expect: _BAD },
  { fn: "parseBinds", args: ["unknown request\n\tmodmask: 76\n\n"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "unknown request\n"], expect: _BAD },

  // ---- parseBinds: a desktop without binds ----
  // The compositor has one line for every result that is empty. It is a
  // list that was read, and it holds nothing.
  { fn: "parseBinds", args: ["unknown request\n"], expect: _NO_BINDS },
  { fn: "parseBinds", args: ["unknown request\n\n"], expect: _NO_BINDS },
  { fn: "parseBinds", args: ["unknown request\r\n"], expect: _NO_BINDS },
  { fn: "parseBinds", args: ["Couldn't connect to /run/user/1000/hypr/example/.socket.sock. (4)\n\n"],
    expect: _BAD },
  { fn: "parseBinds", args: ["[]\n\n"], expect: _BAD },
  { fn: "parseBinds", args: ["[{\n    \"modmask\": 76,\n    \"key\": \"V\"\n}]\n\n"], expect: _BAD },
  { fn: "parseBinds", args: ["bind\n\n"], expect: _BAD },
  { fn: "parseBinds", args: ["bindd\n"], expect: _BAD },
  { fn: "parseBinds", args: ["bindd"], expect: _BAD },
  { fn: "parseBinds", args: [null], expect: _BAD },
  { fn: "parseBinds", args: [undefined], expect: _BAD },
  { fn: "parseBinds", args: [], expect: _BAD },
  { fn: "parseBinds", args: [0], expect: _BAD },
  { fn: "parseBinds", args: [true], expect: _BAD },
  { fn: "parseBinds", args: [[]], expect: _BAD },
  { fn: "parseBinds", args: [[_t(76, "V", _X)]], expect: _BAD },
  { fn: "parseBinds", args: [{}], expect: _BAD },
  { fn: "parseBinds", args: [_good([_THEIRS])], expect: _BAD },

  // ---- parseBinds: a reply that was cut short ----
  // The same record with its end removed bit by bit. Only a record that is
  // closed by an empty line counts.
  { fn: "parseBinds", args: [_t(76, "V", _X).slice(0, -1)], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).slice(0, -2)], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).slice(0, -3)], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "bindd\n\tmodmask: 76\n\tsubmap: \n\tkey: W\n\tkeycode: 0\n"
      + "\tcatchall: false\n\tdescription: Placeh"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "bindd\n\tmodmask: 76\n\tsubmap: \n\tkey: W\n\tkeycode: 0\n"
      + "\tcatchall: false\n"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "bindd\n\tmodmask: 76\n\tsubmap: \n\tkey: F1"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "bindd\n\tmodmask: 7"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "bindd\n"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "bin"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "\t"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + " "], expect: _BAD },

  // ---- parseBinds: records that lack what a verdict depends on ----
  { fn: "parseBinds",
    args: [_raw(["bindd", "\tsubmap: ", "\tkey: V", "\tkeycode: 0", "\tcatchall: false"])], expect: _BAD },
  { fn: "parseBinds",
    args: [_raw(["bindd", "\tmodmask: 76", "\tkey: V", "\tkeycode: 0", "\tcatchall: false"])], expect: _BAD },
  { fn: "parseBinds",
    args: [_raw(["bindd", "\tmodmask: 76", "\tsubmap: ", "\tkeycode: 0", "\tcatchall: false"])],
    expect: _BAD },
  { fn: "parseBinds",
    args: [_raw(["bindd", "\tmodmask: 76", "\tsubmap: ", "\tkey: V", "\tcatchall: false"])], expect: _BAD },
  { fn: "parseBinds",
    args: [_raw(["bindd", "\tmodmask: 76", "\tsubmap: ", "\tkey: V", "\tkeycode: 0"])], expect: _BAD },
  // One broken record spoils the list, wherever it stands.
  { fn: "parseBinds", args: [_t(76, "V", _X) + _raw(["bindd", "\tmodmask: 76"]) + _t(76, "W", _X)],
    expect: _BAD },
  { fn: "parseBinds", args: [_raw(["bindd", "\tmodmask: 76"]) + _t(76, "W", _X)], expect: _BAD },

  // ---- parseBinds: values of the wrong kind ----
  { fn: "parseBinds", args: [_lines("bindd", "", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "76x", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "x76", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "-1", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "+76", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "0x4c", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "7.6e1", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "76 ", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", " 76", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "7 6", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "12345678901", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "\u0667\u0666", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", "NaN", "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", "", false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", "abc", false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", "-1", false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", "Infinity", false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", 0, "", _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", 0, "maybe", _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", 0, "TRUE", _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", 0, "False", _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", 0, "0", _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "", "V", 0, "false ", _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, _times("k", 257), _X)], expect: _BAD },

  // ---- parseBinds: a line break inside a value ----
  // Whatever follows the break is a line of its own, and each of these ends
  // in a line or a record the format does not have.
  { fn: "parseBinds", args: [_t(76, "V", "first line\nsecond line")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "first line\n\nsecond line")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "x\n\tkey: W")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "x\n\tmodmask: 0")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "x\n\tcatchall: false")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "x\n\tdescription: " + _VIDEO)], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "x\n\tdispatcher: exec")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "x\nbindd")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", "x\n\nbindd")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd", 76, "x\n\tkey: mouse:272", "V", 0, false, _X, "__lua")],
    expect: _BAD },
  { fn: "parseBinds",
    args: [_lines("bindd", 76, "x\n\nbind\n\tmodmask: 0\n\tsubmap: ", "V", 0, false, _X, "__lua")],
    expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V\n\tkeycode: 0\n\tcatchall: false\n\n\tkey: W", _X)], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "SUPER + \n", _X)], expect: _BAD },
  // A second line of flags could switch a flag off again, so it is refused too.
  { fn: "parseBinds",
    args: [_raw(["bind", "\tflags: ignore_mods", "\tflags: ", "\tmodmask: 0", "\tsubmap: ", "\tkey: V",
      "\tkeycode: 0", "\tcatchall: false"])],
    expect: _BAD },

  // ---- parseBinds: lines the format does not have ----
  { fn: "parseBinds", args: ["\tmodmask: 76\n\tsubmap: \n\tkey: V\n\tkeycode: 0\n\tcatchall: false\n\n"],
    expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "\tkey: W\n\n"], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).slice(0, -1) + _t(76, "W", _X)], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace(/\t/g, "    ")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace(/\t/g, " \t")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "\tKey: V")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "\tkey V")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "\tkey = V")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "\t key: V")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "\tkey2: V")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "\t: V")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "\t")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", " ")], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X).replace("\tkey: V", "junk")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("Bindd", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines(" bindd", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd ", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bind d", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bind1", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindD", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bind:", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("unbind", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bindd\u0000", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("\ufeffbindd", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: [_lines("bind\u0434", 76, "", "V", 0, false, _X, "__lua")], expect: _BAD },
  { fn: "parseBinds", args: ["# binds\n" + _t(76, "V", _X)], expect: _BAD },
  { fn: "parseBinds", args: [_t(76, "V", _X) + "ok\n"], expect: _BAD },

  // ---- parseBinds: size ----
  { fn: "parseBinds", args: [{ gen: "repeat", unit: _t(76, "V", _X), count: 2001 }], expect: _BAD },
  { fn: "parseBinds", args: [{ gen: "repeat", unit: _t(76, "V", _X), count: 6000 }], expect: _BAD },
  { fn: "parseBinds", args: [{ gen: "repeat", unit: "\n", count: 524289 }], expect: _BAD },
  { fn: "parseBinds", args: [{ gen: "repeat", unit: "bind\n", count: 100000 }], expect: _BAD },
  { fn: "parseBinds", args: [{ gen: "repeat", unit: "\tkey: V\n", count: 60000 }], expect: _BAD },
  { fn: "parseBinds", args: [{ gen: "repeat", unit: "a", count: 300000 }], expect: _BAD },
  { fn: "parseBinds", args: [{ gen: "repeat", unit: "\t", count: 300000 }], expect: _BAD },
  { fn: "parseBinds", args: [{ gen: "codes", codes: [98, 105, 110, 100, 55357, 10, 10] }], expect: _BAD },

  // ---- classify: free ----
  { fn: "classify", args: [[_r(64, "V", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "W", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(77, "V", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(72, "V", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(0, "V", _X)], _US, "video", _V76], expect: "free" },
  // A modifier the grammar does not have makes it another combination.
  { fn: "classify", args: [[_r(92, "V", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(204, "V", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(4294967372, "V", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "VV", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "F1", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "Delete", _X)], _OTHER, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "KP_F2", _X)], _US, "video", _F2], expect: "free" },
  { fn: "classify", args: [[_r(12, "F1", _X), _r(12, "F3", _X), _r(12, "F12", _X), _r(12, "F20", _X)], _US,
      "video", _F2], expect: "free" },
  { fn: "classify", args: [[_r(4, "L1", _X)], _US, "video", _F12], expect: "free" },
  { fn: "classify", args: [[_r(4, "L3", _X), _r(4, "R1", _X)], _US, "video", _F11], expect: "free" },

  // ---- classify: mouse buttons, the wheel and switches are not keys ----
  { fn: "classify", args: [[_r(76, "mouse:272", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "mouse_down", _X)], _OTHER, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + mouse:273", _X)], _OTHER, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_r(76, "switch:on:Example Switch", _X)], _OTHER, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "mouse_left", _X), _r(76, "mouse_right", _X), _r(76, "mouse_up", _X)],
      _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(76, "switch:off:V", _X), _r(76, "mouse:V", _X)], _US, "video", _V76],
    expect: "free" },
  // A button or a switch explains its own part of a key text and no other:
  // a key named next to it, before or after, still counts.
  { fn: "classify", args: [[_r(76, "switch:on:Example + V", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "mouse:272 + V", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V + mouse:272", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V + switch:on:Example Switch", _X)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "SUPER + code:55 + mouse_down", _X)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "0x76 + mouse:272", _X)], _US, "video", _V76], expect: "unknown" },
  // Nor does it explain a key number the record carries.
  { fn: "classify", args: [[_full(76, "", "mouse:272", 55, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "switch:on:Example Switch", 55, false, _X, "__lua", false)],
      _OTHER, "video", _V76], expect: "unknown" },
  // Only these two words, written this way, start a part that is not a key.
  { fn: "classify", args: [[_r(76, "Mouse:272", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "mouse 272", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "switch on", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "SWITCH:on:Example", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify",
    args: [[_full(76, "demo", "mouse:272", 0, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "free" },

  // ---- classify: a key given by number that is known to be another key ----
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:54", _X)], _US, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:56", _X)], _US, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:10", _X)], _US, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:201", _X)], _US, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:999999", _X)], _US, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_r(76, "code:0", _X)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_full(76, "", "", 54, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "free" },
  // A function key has its number on every layout.
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:67", _X)], _OTHER, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_r(12, "CTRL + ALT + code:67", _X), _r(12, "CTRL + ALT + code:69", _X)], _OTHER,
      "video", _F2], expect: "free" },
  { fn: "classify", args: [[_r(12, "CTRL + ALT + code:55", _X)], _US, "video", _F2], expect: "free" },

  // ---- classify: a bind inside a submap on another key ----
  { fn: "classify", args: [[_full(76, "demo", "W", 0, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_full(76, "demo", "CTRL + code:54", 0, false, _X, "__lua", false)], _US, "video",
      _V76], expect: "free" },
  { fn: "classify", args: [[_full(64, "demo", "V", 0, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "free" },
  { fn: "classify", args: [[_full(0, "demo", "catchall", 0, true, _X, "__lua", false)], _US, "video", _V76],
    expect: "free" },

  // ---- classify: ours ----
  { fn: "classify", args: [[_OURS], _US, "video", _V76], expect: "ours" },
  { fn: "classify", args: [[_OURS], _OTHER, "video", _V76], expect: "ours" },
  { fn: "classify", args: [[_OURS], null, "video", _V76], expect: "ours" },
  { fn: "classify", args: [[_r(64, "V", _X), _OURS, _r(76, "W", _X), _r(76, "mouse:272", _X)], _US, "video",
      _V76], expect: "ours" },
  { fn: "classify", args: [[_r(76, "V", _PANEL)], _US, "panel", _V76], expect: "ours" },
  { fn: "classify", args: [[_r(76, "V", _OUTPUT)], _US, "output", _V76], expect: "ours" },
  { fn: "classify", args: [[_r(12, "F2", _VIDEO)], _US, "video", _F2], expect: "ours" },

  // ---- classify: duplicate ----
  { fn: "classify", args: [[_OURS, _OURS], _US, "video", _V76], expect: "duplicate" },
  { fn: "classify", args: [[_OURS, _r(64, "V", _X), _OURS, _OURS], _OTHER, "video", _V76],
    expect: "duplicate" },

  // ---- classify: foreign ----
  { fn: "classify", args: [[_THEIRS], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_THEIRS], _OTHER, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_THEIRS, _THEIRS], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "v", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, " V ", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(78, "V", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", "")], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(12, "f2", _X)], _US, "video", _F2], expect: "foreign" },
  { fn: "classify", args: [[_r(4, "L1", _X)], _US, "video", _F11], expect: "foreign" },
  { fn: "classify", args: [[_r(4, "l2", _X)], _OTHER, "video", _F12], expect: "foreign" },
  // A press and its release are two binds on one key.
  { fn: "classify", args: [[_r(76, "V", "Placeholder 2"), _r(76, "V", "Placeholder 3")], _US, "video", _V76],
    expect: "foreign" },

  // ---- classify: a description of ours on a bind that is not ours ----
  // A bind made here is on exactly the modifiers of the combination and on
  // the key by its plain name. Any other bind on the key that carries our
  // description was made by somebody else and cannot be removed from here.
  { fn: "classify", args: [[_r(78, "V", _VIDEO)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "v", _VIDEO)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, " V", _VIDEO)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V ", _VIDEO)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "MOD4 + CONTROL + MOD1 + V", _VIDEO)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "MOD4 + CONTROL + MOD1 + code:55", _VIDEO)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "", 55, false, _VIDEO, "__lua", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "V", 55, false, _VIDEO, "__lua", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(4, "L1", _VIDEO)], _US, "video", _F11], expect: "foreign" },
  { fn: "classify", args: [[_r(4, "f11", _VIDEO)], _US, "video", _F11], expect: "foreign" },
  { fn: "classify", args: [[_r(4, "CTRL + code:95", _VIDEO)], _OTHER, "video", _F11], expect: "foreign" },
  // Next to a bind that is ours, such a bind makes the combination shared:
  // removing ours would leave it behind.
  { fn: "classify", args: [[_OURS, _r(78, "V", _VIDEO)], _US, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_OURS, _r(76, "v", _VIDEO)], _US, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_r(78, "V", _VIDEO), _r(78, "V", _VIDEO)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "V", 0, false, _VIDEO, "exec", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "V", 0, false, _VIDEO, "", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "V", 0, false, _VIDEO, "__LUA", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", _PANEL)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", _VIDEO)], _US, "panel", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", _VIDEO_PASTED)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", _VIDEO + " ")], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", " " + _VIDEO)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", "omajuke: show or hide video")], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", _VIDEO + "\u200b")], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", "OmaJuke:\u00a0show or hide video")], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", "OmaJuke: show or hide video\r")], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "V", "OmaJuke: show or hide vide\ufffd")], _US, "video", _V76],
    expect: "foreign" },

  // ---- classify: taken by a key given by number ----
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:55", _X)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "SUPER+CTRL+ALT+code:55", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "code:55", _X)], _US, "video", _V76], expect: "foreign" },
  { fn: "classify", args: [[_r(76, "ALT + SUPER + CONTROL + code:055", _X)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + CODE:55", _X)], _US, "video", _V76],
    expect: "foreign" },
  // A bind that names two keys counts for both.
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:55 + code:10", _X)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:10 + code:55", _X)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + V + code:10", _X)], _OTHER, "video", _V76],
    expect: "foreign" },
  // The number in its own field, as later compositor versions print it.
  { fn: "classify", args: [[_full(76, "", "", 55, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify",
    args: [[_full(76, "", "SUPER + CTRL + ALT + code:55", 55, false, _X, "__lua", false)], _US, "video",
      _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "W", 55, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "V", 54, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "foreign" },
  // A function key by number, whatever the layout.
  { fn: "classify", args: [[_r(12, "CTRL + ALT + code:68", _X)], _OTHER, "video", _F2], expect: "foreign" },
  { fn: "classify", args: [[_r(12, "CTRL + ALT + code:68", _X)], _US, "video", _F2], expect: "foreign" },
  { fn: "classify", args: [[_full(12, "", "", 68, false, _X, "__lua", false)], _OTHER, "video", _F2],
    expect: "foreign" },
  { fn: "classify", args: [[_r(4, "CTRL + code:95", _X)], _OTHER, "video", _F11], expect: "foreign" },
  { fn: "classify", args: [[_r(4, "CTRL + code:96", _X)], _OTHER, "video", _F12], expect: "foreign" },

  // The ends of each row of letters and of the function keys, and the key
  // numbers next to them.
  { fn: "classify", args: [[_r(72, "code:24", _X)], _US, "video", _Q72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:23", _X), _r(72, "code:25", _X)], _US, "video", _Q72],
    expect: "free" },
  { fn: "classify", args: [[_r(72, "code:33", _X)], _US, "video", _P72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:32", _X), _r(72, "code:34", _X)], _US, "video", _P72],
    expect: "free" },
  { fn: "classify", args: [[_r(72, "code:38", _X)], _US, "video", _A72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:37", _X), _r(72, "code:39", _X)], _US, "video", _A72],
    expect: "free" },
  { fn: "classify", args: [[_r(72, "code:46", _X)], _US, "video", _L72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:45", _X), _r(72, "code:47", _X)], _US, "video", _L72],
    expect: "free" },
  { fn: "classify", args: [[_r(72, "code:52", _X)], _US, "video", _Z72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:51", _X), _r(72, "code:53", _X)], _US, "video", _Z72],
    expect: "free" },
  { fn: "classify", args: [[_r(72, "code:58", _X)], _US, "video", _M72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:57", _X), _r(72, "code:59", _X)], _US, "video", _M72],
    expect: "free" },
  { fn: "classify", args: [[_r(72, "code:67", _X)], _OTHER, "video", _F1_72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:66", _X)], _US, "video", _F1_72], expect: "free" },
  { fn: "classify", args: [[_r(72, "code:76", _X)], _OTHER, "video", _F10_72], expect: "foreign" },
  { fn: "classify", args: [[_r(72, "code:75", _X), _r(72, "code:77", _X)], _US, "video", _F10_72],
    expect: "free" },
  { fn: "classify", args: [[_r(4, "code:94", _X), _r(4, "code:96", _X)], _US, "video", _F11],
    expect: "free" },
  { fn: "classify", args: [[_r(4, "code:95", _X), _r(4, "code:97", _X)], _US, "video", _F12],
    expect: "free" },

  // ---- classify: a bind that ignores modifiers counts on every combination ----
  { fn: "classify", args: [[_full(0, "", "V", 0, false, _X, "__lua", true)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(64, "", "V", 0, false, _VIDEO, "__lua", true)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(76, "", "V", 0, false, _VIDEO, "__lua", true)], _US, "video", _V76],
    expect: "foreign" },
  { fn: "classify", args: [[_full(0, "", "W", 0, false, _X, "__lua", true)], _US, "video", _V76],
    expect: "free" },

  // ---- classify: shared ----
  { fn: "classify", args: [[_OURS, _THEIRS], _US, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_THEIRS, _OURS], _OTHER, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_OURS, _OURS, _THEIRS], _US, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_OURS, _r(76, "SUPER + CTRL + ALT + code:55", _X)], _US, "video", _V76],
    expect: "shared" },
  { fn: "classify", args: [[_OURS, _r(76, "V", _PANEL)], _US, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_OURS, _r(76, "V", _VIDEO_PASTED)], _US, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_OURS, _CATCHALL, _THEIRS], _US, "video", _V76], expect: "shared" },
  { fn: "classify", args: [[_CATCHALL, _THEIRS], _US, "video", _V76], expect: "foreign" },

  // ---- classify: unknown, a catch-all ----
  { fn: "classify", args: [[_CATCHALL], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_full(78, "demo", "", 0, true, _X, "submap", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(76, "", "mouse:272", 0, true, _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },

  // ---- classify: unknown, a bind inside a submap that may be on the key ----
  { fn: "classify", args: [[_full(76, "demo", "V", 0, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(76, "demo", "V", 0, false, _VIDEO, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(76, " ", "v", 0, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(76, "demo", "CTRL + code:55", 0, false, _X, "__lua", false)], _US, "video",
      _V76], expect: "unknown" },
  { fn: "classify",
    args: [[_full(76, "demo", "CTRL + code:54", 0, false, _X, "__lua", false)], _OTHER, "video", _V76],
    expect: "unknown" },

  // ---- classify: unknown, a key by number on a keyboard that is not plain US ----
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:55", _X)], _OTHER, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:10", _X)], _OTHER, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_r(76, "SUPER + CTRL + ALT + code:201", _X)], _OTHER, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_r(12, "CTRL + ALT + code:24", _X)], _OTHER, "video", _F2], expect: "unknown" },
  { fn: "classify", args: [[_full(76, "", "", 54, false, _X, "__lua", false)], _OTHER, "video", _V76],
    expect: "unknown" },
  // Only an exact "plain US" counts as one.
  { fn: "classify", args: [[_r(76, "code:54", _X)], null, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:54", _X)], undefined, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:54", _X)], {}, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:54", _X)], "us", "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:54", _X)], true, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:54", _X)], { plainUs: "true" }, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:54", _X)], { plainUs: 1 }, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:54", _X)], [true], "video", _V76], expect: "unknown" },

  // ---- classify: unknown, a key that cannot be named ----
  { fn: "classify", args: [[_r(76, "", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, " ", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "SUPER +", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "SUPER + ", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "+", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "SUPER +  + W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:abc", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:5x", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:-5", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code: 55", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:1234567890", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "code:5:5", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "0x76", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "0X56", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "U0076", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "u56", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(12, "0xffbf", _X)], _US, "video", _F2], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "V W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "V\u0000", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "\u0412", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "\uff36", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "V\n", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "V-", _X)], _US, "video", _V76], expect: "unknown" },
  // What a reply damaged on its way leaves where a character was.
  { fn: "classify", args: [[_r(76, "V\ufffd", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "\ufffd", _X)], _US, "video", _V76], expect: "unknown" },
  // A colon belongs to a key number, a button or a switch. In anything else
  // it is a way of writing keys that this file does not know.
  { fn: "classify", args: [[_r(76, "V:1", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "key:V", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, "SUPER + sym:v", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(76, ":", _X)], _US, "video", _V76], expect: "unknown" },

  // ---- classify: unknown, ours next to something unexplained ----
  // "ours" and "duplicate" allow a removal, so both need a list that
  // leaves nothing open on these modifiers.
  { fn: "classify", args: [[_OURS, _CATCHALL], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_OURS, _OURS, _CATCHALL], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_OURS, _full(76, "demo", "V", 0, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_OURS, _r(76, "SUPER + CTRL + ALT + code:10", _X)], _OTHER, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_OURS, _r(76, "SUPER + CTRL + ALT + code:10", _X)], _US, "video", _V76],
    expect: "ours" },
  { fn: "classify", args: [[_OURS, _r(76, "", _X)], _US, "video", _V76], expect: "unknown" },

  // ---- classify: a desktop without binds has every combination free ----
  { fn: "classify", args: [[], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[], _OTHER, "video", _V76], expect: "free" },
  { fn: "classify", args: [[], _US, "nothing", _V76], expect: "unknown" },
  { fn: "classify", args: [[], _US, "video", null], expect: "unknown" },

  // ---- classify: unknown, a list that was not read ----
  { fn: "classify", args: [_BAD.records, _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [null, _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [undefined, _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: ["", _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [_t(64, "W", _X), _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [0, _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [{}, _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [_BAD, _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [_good([_r(64, "W", _X)]), _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [{ length: 1, 0: _r(64, "W", _X) }, _US, "video", _V76], expect: "unknown" },

  // ---- classify: unknown, a list longer than a listing can be ----
  { fn: "classify", args: [_many(2000), _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [_many(2001), _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [_many(10000), _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [_many(10000).concat([_THEIRS]), _US, "video", _V76], expect: "unknown" },

  // ---- classify: unknown, a list with something in it that is not a record ----
  { fn: "classify", args: [_nest(500), _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_nest(500)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, _nest(500), _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(_nest(3), "W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[null], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[undefined], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[{}], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[[]], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [["bindd"], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[76], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X), null], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X), {}, _r(64, "Y", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_THEIRS, null], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_OURS, {}], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r("64", "W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64.5, "W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(-64, "W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(NaN, "W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(Infinity, "W", _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, null, _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, ["W"], _X)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, _times("k", 257), _X)], _US, "video", _V76], expect: "unknown" },
  // Texts longer than the reader keeps are not from the reader.
  { fn: "classify", args: [[_r(64, "W", _times("d", 257))], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_full(64, _times("s", 257), "W", 0, false, _X, "__lua", false)], _US, "video",
      _V76], expect: "unknown" },
  { fn: "classify", args: [[_full(64, "", "W", 0, false, _X, _times("p", 257), false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(64, _times("s", 256), _times("k", 256), 0, false, _times("d", 256),
      _times("p", 256), false)], _US, "video", _V76], expect: "free" },
  { fn: "classify", args: [[_r(64, "W", null)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", 7)], _US, "video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_full(64, null, "W", 0, false, _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(64, "", "W", "0", false, _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(64, "", "W", 0, "false", _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(64, "", "W", 0, 0, _X, "__lua", false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(64, "", "W", 0, false, _X, null, false)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(64, "", "W", 0, false, _X, "__lua", undefined)], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[_full(64, "", "W", 0, false, _X, "__lua", "false")], _US, "video", _V76],
    expect: "unknown" },
  { fn: "classify", args: [[{ modmask: 64, key: "W" }], _US, "video", _V76], expect: "unknown" },

  // ---- classify: unknown, no such action ----
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "Video", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "constructor", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "__proto__", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "length", _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, null, _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, 1, _V76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, ["video"], _V76], expect: "unknown" },
  { fn: "classify", args: [[_OURS], _US, "constructor", _V76], expect: "unknown" },

  // ---- classify: unknown, a combination that is not what parse() returns ----
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", null], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", undefined], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video"], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", "SUPER + CTRL + ALT + V"], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", {}], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", []], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", 76], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", { canonical: "SUPER + CTRL + ALT + V" }],
    expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video", { mask: 76, key: "V" }], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video",
      { canonical: "SUPER + CTRL + ALT + V", mask: 72, key: "V", alias: "MOD4 + CONTROL + MOD1 + V" }],
    expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video",
      { canonical: "SUPER + CTRL + ALT + V", mask: 76, key: "Y", alias: "MOD4 + CONTROL + MOD1 + V" }],
    expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video",
      { canonical: "SUPER + CTRL + ALT + V", mask: 76, key: "V", alias: "all" }], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video",
      { canonical: "super + ctrl + alt + v", mask: 76, key: "V", alias: "MOD4 + CONTROL + MOD1 + V" }],
    expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video",
      { canonical: ["SUPER + CTRL + ALT + V"], mask: 76, key: "V", alias: "MOD4 + CONTROL + MOD1 + V" }],
    expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video",
      { canonical: "V", mask: 0, key: "V", alias: "V" }], expect: "unknown" },
  { fn: "classify", args: [[_r(64, "W", _X)], _US, "video",
      { canonical: "SHIFT + V", mask: 1, key: "V", alias: "SHIFT + V" }], expect: "unknown" },

  // ---- takenBy: whose it is, for showing ----
  { fn: "takenBy", args: [[_THEIRS], _US, "video", _V76], expect: "Placeholder 1" },
  { fn: "takenBy", args: [[_r(76, "V", "Placeholder 2"), _r(76, "V", "Placeholder 3")], _US, "video", _V76],
    expect: "Placeholder 2" },
  { fn: "takenBy", args: [[_OURS, _r(76, "V", "Placeholder 4")], _US, "video", _V76],
    expect: "Placeholder 4" },
  { fn: "takenBy", args: [[_r(76, "V", _VIDEO_PASTED)], _US, "video", _V76], expect: _VIDEO_PASTED },
  { fn: "takenBy", args: [[_r(76, "V", _PANEL)], _US, "video", _V76], expect: _PANEL },
  { fn: "takenBy", args: [[_r(78, "V", _VIDEO)], _US, "video", _V76], expect: _VIDEO },
  { fn: "takenBy", args: [[_OURS, _r(76, "v", _VIDEO)], _US, "video", _V76], expect: _VIDEO },
  { fn: "takenBy", args: [[_r(76, "SUPER + CTRL + ALT + code:55", "Placeholder 5")], _US, "video", _V76],
    expect: "Placeholder 5" },
  // Other people's text is cleaned and cut before it is shown.
  { fn: "takenBy", args: [[_r(76, "V", "  Place\u0007holder \u202e  6\t\u200b ")], _US, "video", _V76],
    expect: "Placeholder 6" },
  { fn: "takenBy", args: [[_r(76, "V", _times("d", 256))], _US, "video", _V76], expect: _times("d", 60) },
  { fn: "takenBy", args: [[_r(76, "V", "<b>Placeholder</b> 7")], _US, "video", _V76],
    expect: "<b>Placeholder</b> 7" },
  { fn: "takenBy", args: [[_r(76, "V", "")], _US, "video", _V76], expect: "" },
  // Nobody else has it, or it cannot be said.
  { fn: "takenBy", args: [[_OURS], _US, "video", _V76], expect: "" },
  { fn: "takenBy", args: [[_OURS, _OURS], _US, "video", _V76], expect: "" },
  { fn: "takenBy", args: [[_r(64, "V", _X)], _US, "video", _V76], expect: "" },
  { fn: "takenBy", args: [[_CATCHALL], _US, "video", _V76], expect: "" },
  { fn: "takenBy", args: [[_r(76, "SUPER + CTRL + ALT + code:55", _X)], _OTHER, "video", _V76], expect: "" },
  { fn: "takenBy", args: [[_THEIRS, null], _US, "video", _V76], expect: "" },
  { fn: "takenBy", args: [[], _US, "video", _V76], expect: "" },
  { fn: "takenBy", args: [null, _US, "video", _V76], expect: "" },
  { fn: "takenBy", args: [[_THEIRS], _US, "constructor", _V76], expect: "" },
  { fn: "takenBy", args: [[_THEIRS], _US, "video", null], expect: "" },
  { fn: "takenBy", args: [[_THEIRS], _US, "video", "SUPER + CTRL + ALT + V"], expect: "" },

  // ---- findRuntime: where binds made at runtime for an action are ----
  { fn: "findRuntime", args: [[_r(64, "Return", _X), _OURS], "video"], expect: ["SUPER + CTRL + ALT + V"] },
  { fn: "findRuntime", args: [[_OURS, _r(72, "V", _VIDEO), _OURS, _r(12, "F2", _VIDEO)], "video"],
    expect: ["SUPER + CTRL + ALT + V", "SUPER + ALT + V", "CTRL + ALT + F2"] },
  { fn: "findRuntime", args: [[_r(72, "J", _PANEL), _OURS, _r(72, "O", _OUTPUT)], "panel"],
    expect: ["SUPER + ALT + J"] },
  { fn: "findRuntime", args: [[_r(72, "J", _PANEL), _OURS, _r(72, "O", _OUTPUT)], "output"],
    expect: ["SUPER + ALT + O"] },
  // At most eight are named.
  { fn: "findRuntime",
    args: [[_r(72, "A", _VIDEO), _r(72, "B", _VIDEO), _r(72, "C", _VIDEO), _r(72, "D", _VIDEO),
      _r(72, "E", _VIDEO), _r(72, "F", _VIDEO), _r(72, "G", _VIDEO), _r(72, "H", _VIDEO),
      _r(72, "I", _VIDEO)], "video"],
    expect: ["SUPER + ALT + A", "SUPER + ALT + B", "SUPER + ALT + C", "SUPER + ALT + D", "SUPER + ALT + E",
      "SUPER + ALT + F", "SUPER + ALT + G", "SUPER + ALT + H"] },

  // ---- findRuntime: binds that were not made here are not named ----
  // Somebody else's text, the pasted line, another action's bind.
  { fn: "findRuntime", args: [[_THEIRS, _r(72, "V", _VIDEO_PASTED), _r(72, "J", _PANEL)], "video"],
    expect: [] },
  // Not made at runtime.
  { fn: "findRuntime", args: [[_full(76, "", "V", 0, false, _VIDEO, "exec", false)], "video"], expect: [] },
  // With Caps Lock, by key number, in small letters, in a submap, for every
  // modifier: none of these is the form a bind made here has.
  { fn: "findRuntime", args: [[_r(78, "V", _VIDEO)], "video"], expect: [] },
  { fn: "findRuntime", args: [[_full(76, "", "", 55, false, _VIDEO, "__lua", false)], "video"], expect: [] },
  { fn: "findRuntime", args: [[_r(76, "v", _VIDEO)], "video"], expect: [] },
  { fn: "findRuntime", args: [[_r(76, " V", _VIDEO)], "video"], expect: [] },
  { fn: "findRuntime", args: [[_full(76, "resize", "V", 0, false, _VIDEO, "__lua", false)], "video"],
    expect: [] },
  { fn: "findRuntime", args: [[_full(76, "", "V", 0, false, _VIDEO, "__lua", true)], "video"], expect: [] },
  { fn: "findRuntime", args: [[_full(76, "", "V", 0, true, _VIDEO, "__lua", false)], "video"], expect: [] },
  // On a key or on modifiers the grammar does not have.
  { fn: "findRuntime", args: [[_r(76, "space", _VIDEO), _r(1, "V", _VIDEO), _r(0, "V", _VIDEO),
    _r(92, "V", _VIDEO)], "video"], expect: [] },
  // A list that is not one, and an action that is none.
  { fn: "findRuntime", args: [[], "video"], expect: [] },
  { fn: "findRuntime", args: [null, "video"], expect: [] },
  { fn: "findRuntime", args: [[_OURS, { modmask: 76 }], "video"], expect: [] },
  { fn: "findRuntime", args: [[_OURS], "constructor"], expect: [] },
  { fn: "findRuntime", args: [[_OURS], null], expect: [] },
  { fn: "findRuntime", args: [_many(2001), "video"], expect: [] },

  // ---- findConfigured: a bind the user pasted ----
  { fn: "findConfigured", args: [[_r(77, "J", _PANEL_PASTED)], "panel"],
    expect: "SUPER + CTRL + ALT + SHIFT + J" },
  { fn: "findConfigured", args: [[_r(64, "Return", _X), _r(72, "V", _VIDEO_PASTED), _OURS], "video"],
    expect: "SUPER + ALT + V" },
  { fn: "findConfigured", args: [[_r(4, "f5", _OUTPUT_PASTED)], "output"], expect: "CTRL + F5" },
  { fn: "findConfigured", args: [[_r(70, " o ", _OUTPUT_PASTED)], "output"], expect: "SUPER + CTRL + O" },
  { fn: "findConfigured", args: [[_full(8, "", "V", 0, false, _VIDEO_PASTED, "exec", false)], "video"],
    expect: "ALT + V" },
  // The first one that is a combination of the grammar.
  { fn: "findConfigured",
    args: [[_r(64, "space", _VIDEO_PASTED), _r(1, "V", _VIDEO_PASTED), _r(9, "V", _VIDEO_PASTED),
      _r(72, "V", _VIDEO_PASTED)], "video"],
    expect: "ALT + SHIFT + V" },

  // ---- findConfigured: nothing that can be written as a combination ----
  { fn: "findConfigured", args: [[_r(64, "space", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(0, "V", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(1, "V", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(80, "V", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(192, "V", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "SUPER + code:55", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "mouse:272", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "\u0412", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "\u0131", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_full(64, "demo", "V", 0, false, _VIDEO_PASTED, "__lua", false)], "video"],
    expect: "" },
  { fn: "findConfigured", args: [[_full(64, "", "V", 0, true, _VIDEO_PASTED, "__lua", false)], "video"],
    expect: "" },
  { fn: "findConfigured", args: [[_full(64, "", "V", 55, false, _VIDEO_PASTED, "__lua", false)], "video"],
    expect: "" },
  { fn: "findConfigured", args: [[_full(64, "", "V", 0, false, _VIDEO_PASTED, "__lua", true)], "video"],
    expect: "" },

  // ---- findConfigured: other descriptions ----
  { fn: "findConfigured", args: [[_OURS], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _PANEL_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _VIDEO_PASTED + " ")], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", "omajuke video (bindings.lua)")], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _X)], "video"], expect: "" },

  // ---- findConfigured: bad arguments ----
  { fn: "findConfigured", args: [[], "video"], expect: "" },
  { fn: "findConfigured", args: [null, "video"], expect: "" },
  { fn: "findConfigured", args: [_BAD, "video"], expect: "" },
  { fn: "findConfigured", args: [[null], "video"], expect: "" },
  { fn: "findConfigured", args: [[{}, _r(64, "V", _VIDEO_PASTED)], "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _VIDEO_PASTED), _r(64, "W", _times("d", 257))], "video"],
    expect: "" },
  { fn: "findConfigured", args: [_many(2001).concat([_r(64, "V", _VIDEO_PASTED)]), "video"], expect: "" },
  { fn: "findConfigured", args: [_nest(500), "video"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _VIDEO_PASTED)], "constructor"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _VIDEO_PASTED)], "__proto__"], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _VIDEO_PASTED)], null], expect: "" },
  { fn: "findConfigured", args: [[_r(64, "V", _VIDEO_PASTED)]], expect: "" },

  // ---- propose: the first proposal that is free ----
  { fn: "propose", args: [_QUIET, _US, "panel"], expect: "SUPER + CTRL + ALT + J" },
  { fn: "propose", args: [_QUIET, _OTHER, "video"], expect: "SUPER + CTRL + ALT + V" },
  { fn: "propose", args: [_QUIET, _US, "output"], expect: "SUPER + CTRL + ALT + O" },
  { fn: "propose", args: [[_r(76, "J", _X)], _US, "panel"], expect: "SUPER + ALT + J" },
  { fn: "propose", args: [[_r(76, "J", _X), _r(72, "j", _X)], _US, "panel"],
    expect: "SUPER + CTRL + ALT + P" },
  { fn: "propose", args: [[_r(76, "J", _X), _r(72, "J", _X), _r(76, "P", _X)], _US, "panel"], expect: "" },
  { fn: "propose", args: [[_r(76, "V", _X)], _US, "video"], expect: "SUPER + ALT + V" },
  { fn: "propose", args: [[_r(76, "V", _X), _r(72, "SUPER + ALT + code:55", _X)], _US, "video"], expect: "" },
  // A combination we hold already is not offered a second time.
  { fn: "propose", args: [[_OURS], _US, "video"], expect: "SUPER + ALT + V" },
  { fn: "propose", args: [[_r(76, "V", _VIDEO_PASTED)], _US, "video"], expect: "SUPER + ALT + V" },
  // One taken by another action of ours is somebody else's for this one.
  { fn: "propose", args: [[_r(76, "O", _VIDEO)], _US, "output"], expect: "SUPER + ALT + O" },
  // What cannot be confirmed is not offered.
  { fn: "propose", args: [_NUMBERED, _US, "panel"], expect: "SUPER + CTRL + ALT + J" },
  { fn: "propose", args: [_NUMBERED.concat([_r(76, "J", _X)]), _US, "panel"], expect: "SUPER + ALT + J" },
  { fn: "propose", args: [_NUMBERED.concat([_r(76, "J", _X)]), _OTHER, "panel"],
    expect: "SUPER + CTRL + ALT + P" },
  { fn: "propose", args: [_NUMBERED.concat([_r(76, "V", _X)]), _OTHER, "video"], expect: "" },
  { fn: "propose", args: [[_CATCHALL], _US, "video"], expect: "SUPER + ALT + V" },
  { fn: "propose", args: [[_CATCHALL, _full(72, "", "", 0, true, "", "", false)], _US, "video"], expect: "" },

  // ---- propose: the first choice on a desktop without binds ----
  { fn: "propose", args: [[], _US, "video"], expect: "SUPER + CTRL + ALT + V" },
  { fn: "propose", args: [[], _OTHER, "panel"], expect: "SUPER + CTRL + ALT + J" },

  // ---- propose: nothing without a list or an action ----
  { fn: "propose", args: [_BAD.records, _US, "video"], expect: "" },
  { fn: "propose", args: [null, _US, "video"], expect: "" },
  { fn: "propose", args: [_BAD, _US, "video"], expect: "" },
  { fn: "propose", args: [[null], _US, "video"], expect: "" },
  { fn: "propose", args: [_many(10000), _US, "video"], expect: "" },
  { fn: "propose", args: [_nest(500), _US, "video"], expect: "" },
  { fn: "propose", args: [_QUIET, _US, "constructor"], expect: "" },
  { fn: "propose", args: [_QUIET, _US, ""], expect: "" },
  { fn: "propose", args: [_QUIET, _US, null], expect: "" },
  { fn: "propose", args: [_QUIET, _US], expect: "" },
  { fn: "propose", args: [], expect: "" },

  // ---- layoutFacts: a plain US keyboard ----
  // A desktop on which nobody has set anything but the layout: the other
  // text options are printed as a marker, not as empty text.
  { fn: "layoutFacts", args: [_LAYOUT, _VARIANT, _BY_SYM, _FILE], expect: { plainUs: true } },
  { fn: "layoutFacts",
    args: ["{\"option\": \"input:kb_layout\", \"str\": \"us\", \"set\": true }",
      "{\"option\": \"input:kb_variant\", \"str\": \"\", \"set\": true }",
      "{\"option\": \"input:resolve_binds_by_sym\", \"int\": 0, \"set\": false }",
      "{\"option\": \"input:kb_file\", \"str\": \"\", \"set\": true }"],
    expect: { plainUs: true } },
  // Only the first layout decides which key a bind means.
  { fn: "layoutFacts",
    args: ["{\"str\": \"us,de,fr\"}", "{\"str\": \",nodeadkeys,\"}", "{\"bool\": false}", _FILE],
    expect: { plainUs: true } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { int: 0 }, _NONE], expect: { plainUs: true } },
  { fn: "layoutFacts", args: [_US_ONLY, _UNSET, { bool: false, int: 0 }, _UNSET],
    expect: { plainUs: true } },
  { fn: "layoutFacts", args: ["{\"str\":\"us\"}\n", " {\"str\":\"\"} ", "{\"int\":0}\n\n", "{\"str\":\"\"}"],
    expect: { plainUs: true } },

  // ---- layoutFacts: another layout or variant ----
  { fn: "layoutFacts", args: [{ str: "de" }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: "de,us" }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: "" }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  // The marker for "not set" is no layout: which one applies then is not
  // for this file to guess.
  { fn: "layoutFacts", args: [_UNSET, _UNSET, _OFF, _UNSET], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: "US" }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: " us" }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: "us " }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: "us(intl)" }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, { str: "intl" }, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: "us,de" }, { str: "dvorak," }, _OFF, _NONE],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, { str: " " }, _OFF, _NONE], expect: { plainUs: false } },
  // The marker counts only as the whole value.
  { fn: "layoutFacts", args: [_US_ONLY, { str: "[[EMPTY]],dvorak" }, _OFF, _NONE],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, { str: "[[empty]]" }, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, { str: " [[EMPTY]]" }, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: ["us"] }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, { str: null }, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ custom: "us" }, _NONE, _OFF, _NONE], expect: { plainUs: false } },

  // ---- layoutFacts: binds that follow the layout in use ----
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { int: 1 }, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { bool: true }, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { bool: false, int: 1 }, _NONE],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { bool: true, int: 0 }, _NONE],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { int: "0" }, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { bool: "false" }, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { bool: null }, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { str: "0" }, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, {}, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, { set: false }, _NONE], expect: { plainUs: false } },

  // ---- layoutFacts: a keymap file replaces the layout ----
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, { str: "keymap.xkb" }], expect: { plainUs: false } },
  { fn: "layoutFacts",
    args: [_LAYOUT, _VARIANT, _BY_SYM,
      "{\"option\": \"input:kb_file\", \"str\": \"/home/user/example.xkb\", \"set\": true }"],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, { str: " " }], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, { str: "[[EMPTY]] " }], expect: { plainUs: false } },
  // Whether there is a file must be known: a reply that is missing or of
  // another kind is not a "no".
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_LAYOUT, _VARIANT, _BY_SYM], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, null], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, {}], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, { str: 0 }], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, { int: 0 }], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, "no such option"], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE, _OFF, ""], expect: { plainUs: false } },

  // ---- layoutFacts: replies that are not an option at all ----
  { fn: "layoutFacts", args: [{}, {}, {}, {}], expect: { plainUs: false } },
  { fn: "layoutFacts", args: ["no such option", _VARIANT, _BY_SYM, _FILE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_LAYOUT, "no such option", _BY_SYM, _FILE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_LAYOUT, _VARIANT, "no such option", _FILE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_LAYOUT, _VARIANT, "", _FILE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: ["us", "", "0", ""], expect: { plainUs: false } },
  { fn: "layoutFacts", args: ["\"us\"", "\"\"", "0", "\"\""], expect: { plainUs: false } },
  { fn: "layoutFacts",
    args: ["str: us\nset: true", "str: [[EMPTY]]\nset: false", "bool: false\nset: false",
      "str: [[EMPTY]]\nset: false"],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: ["{\"str\": \"us\"", _VARIANT, _BY_SYM, _FILE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: ["{\"str\": \"us\"} x", _VARIANT, _BY_SYM, _FILE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: ["{str: \"us\"}", _VARIANT, _BY_SYM, _FILE], expect: { plainUs: false } },
  // A value with a quote in it is printed unescaped, and is not JSON then.
  { fn: "layoutFacts",
    args: ["{\"option\": \"input:kb_layout\", \"str\": \"us\"x\", \"set\": true }", _VARIANT, _BY_SYM, _FILE],
    expect: { plainUs: false } },
  { fn: "layoutFacts",
    args: ["[{\"str\": \"us\"}]", "[{\"str\": \"\"}]", "[{\"int\": 0}]", "[{\"str\": \"\"}]"],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: ["null", "null", "null", "null"], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [[_US_ONLY], [_NONE], [_OFF], [_NONE]], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [null, null, null, null], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [undefined, undefined, undefined, undefined], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_US_ONLY, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [5, 5, 0, 5], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_nest(500), _nest(500), _nest(500), _nest(500)], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ str: _nest(500) }, _NONE, _OFF, _NONE], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [true, true, false, true], expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ gen: "repeat", unit: " ", count: 300000 }, _VARIANT, _BY_SYM, _FILE],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: [{ gen: "repeat", unit: "[", count: 4000 }, _VARIANT, _BY_SYM, _FILE],
    expect: { plainUs: false } },
  { fn: "layoutFacts", args: [_LAYOUT, _VARIANT, _BY_SYM, { gen: "repeat", unit: " ", count: 4097 }],
    expect: { plainUs: false } },
  // A reply is a line of text. One that is far longer is not read at all,
  // well-formed or not.
  { fn: "layoutFacts", args: [_padded(4000), _VARIANT, _BY_SYM, _FILE], expect: { plainUs: true } },
  { fn: "layoutFacts", args: [_padded(4100), _VARIANT, _BY_SYM, _FILE], expect: { plainUs: false } }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
