.pragma library

// Input and expectation table for lib/Lua.js: the exact line each of the
// three templates returns, what they refuse to build a line from, and what
// the final gate lets through. Almost everything here is hostile: every
// "false" row of check is a line that must never reach the compositor. The
// same table runs under node and inside Qt's JavaScript engine.

// The rule for a quarter-width window in the bottom-right corner, four
// pixels from both edges, in pieces that the rows below swap out one at a
// time.
var _IF = "if _G.__omajuke_rule ~= \"25-br-4-4\" then "
var _OPEN = "hl.window_rule({ name = \"omajuke-video\", match = { class = \"^OmaJuke$\" }, "
var _FLAGS = "float = true, pin = true, no_initial_focus = true, keep_aspect_ratio = true, no_dim = true, "
  + "border_size = 0, tag = \"-default-opacity\", opacity = \"1 1\", "
var _SIZE = "size = { \"(monitor_w*0.25)\", \"(monitor_w*0.140625)\" }, "
var _MOVE = "move = { \"(monitor_w-monitor_w*0.25-4)\", \"(monitor_h-monitor_w*0.140625-4)\" } }) "
var _END = "_G.__omajuke_rule = \"25-br-4-4\" end"
var _RULE = _IF + _OPEN + _FLAGS + _SIZE + _MOVE + _END

// One rule per other corner, and the largest one there is.
var _RULE_TL = "if _G.__omajuke_rule ~= \"17-tl-0-30\" then " + _OPEN + _FLAGS
  + "size = { \"(monitor_w*0.17)\", \"(monitor_w*0.095625)\" }, move = { 0, 30 } }) "
  + "_G.__omajuke_rule = \"17-tl-0-30\" end"
var _RULE_TR = "if _G.__omajuke_rule ~= \"10-tr-0-30\" then " + _OPEN + _FLAGS
  + "size = { \"(monitor_w*0.10)\", \"(monitor_w*0.056250)\" }, "
  + "move = { \"(monitor_w-monitor_w*0.10-0)\", 30 } }) "
  + "_G.__omajuke_rule = \"10-tr-0-30\" end"
var _RULE_BL = "if _G.__omajuke_rule ~= \"33-bl-12-0\" then " + _OPEN + _FLAGS
  + "size = { \"(monitor_w*0.33)\", \"(monitor_w*0.185625)\" }, "
  + "move = { 12, \"(monitor_h-monitor_w*0.185625-0)\" } }) "
  + "_G.__omajuke_rule = \"33-bl-12-0\" end"
var _RULE_MAX = "if _G.__omajuke_rule ~= \"90-br-2000-2000\" then " + _OPEN + _FLAGS
  + "size = { \"(monitor_w*0.90)\", \"(monitor_w*0.506250)\" }, "
  + "move = { \"(monitor_w-monitor_w*0.90-2000)\", \"(monitor_h-monitor_w*0.506250-2000)\" } }) "
  + "_G.__omajuke_rule = \"90-br-2000-2000\" end"

// Nothing to keep clear of at either edge.
var _RULE_FLUSH = "if _G.__omajuke_rule ~= \"25-br-0-0\" then " + _OPEN + _FLAGS + _SIZE
  + "move = { \"(monitor_w-monitor_w*0.25-0)\", \"(monitor_h-monitor_w*0.140625-0)\" } }) "
  + "_G.__omajuke_rule = \"25-br-0-0\" end"
var _RULE_FLUSH_TL = "if _G.__omajuke_rule ~= \"25-tl-0-0\" then " + _OPEN + _FLAGS + _SIZE
  + "move = { 0, 0 } }) _G.__omajuke_rule = \"25-tl-0-0\" end"

// The three binds and one removal.
var _RUN = "hl.dsp.exec_cmd(\"omarchy-shell -q davidgudovic.omajuke "
var _PANEL = "{ description = \"OmaJuke: open panel\" })"
var _VIDEO = "{ description = \"OmaJuke: show or hide video\" })"
var _OUTPUT = "{ description = \"OmaJuke: next audio output\" })"
var _BIND_PANEL = "hl.bind(\"MOD4 + J\", " + _RUN + "toggle\"), " + _PANEL
var _BIND_VIDEO = "hl.bind(\"MOD4 + CONTROL + MOD1 + V\", " + _RUN + "video toggle\"), " + _VIDEO
var _BIND_OUTPUT = "hl.bind(\"MOD1 + SHIFT + F12\", " + _RUN + "output next\"), " + _OUTPUT
var _BIND_ALL_MODS = "hl.bind(\"MOD4 + CONTROL + MOD1 + SHIFT + F10\", " + _RUN + "toggle\"), " + _PANEL
var _UNBIND = "hl.unbind(\"MOD4 + CONTROL + MOD1 + V\")"

var _PLACE = { pct: 25, corner: "bottom-right", marginX: 4, marginY: 4 }

var MODULE = "Lua"
var CASES = [
  // ---- rule: the exact line, for every corner ----
  { fn: "rule", args: [_PLACE], expect: _RULE },
  { fn: "rule", args: [{ ok: true, pct: 25, corner: "bottom-right", marginX: 4, marginY: 4, extra: "x" }],
    expect: _RULE },
  { fn: "rule", args: [{ pct: 17, corner: "top-left", marginX: 0, marginY: 30 }], expect: _RULE_TL },
  { fn: "rule", args: [{ pct: 10, corner: "top-right", marginX: 0, marginY: 30 }], expect: _RULE_TR },
  { fn: "rule", args: [{ pct: 33, corner: "bottom-left", marginX: 12, marginY: 0 }], expect: _RULE_BL },
  { fn: "rule", args: [{ pct: 90, corner: "bottom-right", marginX: 2000, marginY: 2000 }],
    expect: _RULE_MAX },

  // ---- rule: a zero that carries a minus sign is written as a plain zero ----
  // Arithmetic and JSON both produce one. Written with its sign it would put
  // two hyphens in a row, which starts a comment in Lua.
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: -0, marginY: -0 }], expect: _RULE_FLUSH },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 0, marginY: 0 }], expect: _RULE_FLUSH },
  { fn: "rule", args: [{ pct: 25, corner: "top-left", marginX: -0, marginY: -0 }], expect: _RULE_FLUSH_TL },

  // ---- rule: a percentage outside 10..90, or not a whole number ----
  { fn: "rule", args: [{ pct: 9, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 91, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 0, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: -25, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 100, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25.5, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 1e999, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: "25", corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: [25], corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: true, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: null, corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ corner: "bottom-right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: "25\" then os.execute(\"x\") if \"", corner: "bottom-right", marginX: 4,
    marginY: 4 }], expect: "" },

  // ---- rule: a corner that is not one of the four names ----
  { fn: "rule", args: [{ pct: 25, corner: "br", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "Bottom-Right", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right ", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right\n", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "center", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "constructor", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "__proto__", marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: 3, marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: ["bottom-right"], marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: null, marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, marginX: 4, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "br\" then os.execute(\"x\") --", marginX: 4, marginY: 4 }],
    expect: "" },

  // ---- rule: a margin outside 0..2000, or not a whole number ----
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: -1, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 4, marginY: -1 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 2001, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 4, marginY: 2001 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 4.5, marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 4, marginY: 1e999 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: "4", marginY: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 4, marginY: null }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "bottom-right", marginX: 4 }], expect: "" },
  { fn: "rule", args: [{ pct: 25, corner: "top-left", marginX: "0, 0 } }) os.execute(\"x\") --",
    marginY: 4 }], expect: "" },

  // ---- rule: not a placement at all ----
  { fn: "rule", args: [null], expect: "" },
  { fn: "rule", args: [], expect: "" },
  { fn: "rule", args: [{}], expect: "" },
  { fn: "rule", args: [[]], expect: "" },
  { fn: "rule", args: [[25, "bottom-right", 4, 4]], expect: "" },
  { fn: "rule", args: ["25-br-4-4"], expect: "" },
  { fn: "rule", args: [25], expect: "" },
  { fn: "rule", args: [true], expect: "" },
  { fn: "rule", args: [{ ok: false }], expect: "" },

  // ---- bind: the exact line, for every action ----
  { fn: "bind", args: ["MOD4 + J", "panel"], expect: _BIND_PANEL },
  { fn: "bind", args: ["MOD4 + CONTROL + MOD1 + V", "video"], expect: _BIND_VIDEO },
  { fn: "bind", args: ["MOD1 + SHIFT + F12", "output"], expect: _BIND_OUTPUT },
  { fn: "bind", args: ["MOD4 + CONTROL + MOD1 + SHIFT + F10", "panel"], expect: _BIND_ALL_MODS },

  // ---- bind: only the alias spelling of a full combination ----
  { fn: "bind", args: ["SUPER + CTRL + ALT + V", "video"], expect: "" },
  { fn: "bind", args: ["SUPER + V", "video"], expect: "" },
  { fn: "bind", args: ["mod4 + v", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + v", "video"], expect: "" },
  { fn: "bind", args: ["Mod4 + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4+V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 +V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4  + V", "video"], expect: "" },
  { fn: "bind", args: [" MOD4 + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V ", "video"], expect: "" },
  { fn: "bind", args: ["CONTROL + MOD4 + V", "video"], expect: "" },
  { fn: "bind", args: ["SHIFT + MOD4 + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + MOD4 + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V + MOD1", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + ", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 +", "video"], expect: "" },
  { fn: "bind", args: ["MOD4", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + MOD1", "video"], expect: "" },
  { fn: "bind", args: ["", "video"], expect: "" },

  // ---- bind: never a key that typing alone produces ----
  { fn: "bind", args: ["V", "video"], expect: "" },
  { fn: "bind", args: ["F12", "video"], expect: "" },
  { fn: "bind", args: ["SHIFT + V", "video"], expect: "" },
  { fn: "bind", args: ["SHIFT + F1", "video"], expect: "" },

  // ---- bind: only letters and the twelve function keys ----
  { fn: "bind", args: ["MOD4 + F0", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + F13", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + F01", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + F123", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + AB", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + 1", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + ESCAPE", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + RETURN", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + code:10", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + mouse:272", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + catchall", "video"], expect: "" },
  { fn: "bind", args: ["MOD5 + V", "video"], expect: "" },
  { fn: "bind", args: ["all", "video"], expect: "" },
  { fn: "bind", args: ["ALL", "video"], expect: "" },

  // ---- bind: text that tries to leave the string ----
  { fn: "bind", args: ["F1\") os.execute(\"x", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\") hl.unbind(\"all", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\", hl.dsp.exec_cmd(\"x\")) --", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V]]", "video"], expect: "" },
  { fn: "bind", args: ["[[MOD4 + V]]", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V--", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\\", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V'", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\n", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\nMOD4 + J", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\r", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 +\tV", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\u0000", "video"], expect: "" },
  { fn: "bind", args: ["\u0000MOD4 + V", "video"], expect: "" },

  // ---- bind: characters that only look right ----
  { fn: "bind", args: ["MOD4 + \u0412", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + \uff36", "video"], expect: "" },
  { fn: "bind", args: ["M\u039fD4 + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD\uff14 + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4\u00a0+\u00a0V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 \uff0b V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\u200b", "video"], expect: "" },
  { fn: "bind", args: ["\u202eMOD4 + V", "video"], expect: "" },
  { fn: "bind", args: ["\ufeffMOD4 + V", "video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V\u2028", "video"], expect: "" },
  { fn: "bind", args: [{ gen: "codes", codes: [77, 79, 68, 52, 32, 43, 32, 86, 55357] }, "video"],
    expect: "" },

  // ---- bind: too long, or not text ----
  { fn: "bind", args: [{ gen: "repeat", unit: "A", count: 65 }, "video"], expect: "" },
  { fn: "bind", args: [{ gen: "repeat", unit: "MOD4 + ", count: 9 }, "video"], expect: "" },
  { fn: "bind", args: [{ gen: "repeat", unit: "MOD4 + V", count: 40000 }, "video"], expect: "" },
  { fn: "bind", args: [null, "video"], expect: "" },
  { fn: "bind", args: [86, "video"], expect: "" },
  { fn: "bind", args: [true, "video"], expect: "" },
  { fn: "bind", args: [["MOD4 + V"], "video"], expect: "" },
  { fn: "bind", args: [{ alias: "MOD4 + V" }, "video"], expect: "" },

  // ---- bind: an action that is not one of the six ----
  { fn: "bind", args: ["MOD4 + V", "Video"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "videos"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "video "], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "toggle"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "video toggle"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", ""], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "constructor"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "__proto__"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "toString"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "name"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "length"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "0"], expect: "" },
  { fn: "bind", args: ["MOD4 + V", 0], expect: "" },
  { fn: "bind", args: ["MOD4 + V", null], expect: "" },
  { fn: "bind", args: ["MOD4 + V", ["video"]], expect: "" },
  { fn: "bind", args: ["MOD4 + V", "video\"), { description = \"x"], expect: "" },
  { fn: "bind", args: ["MOD4 + V"], expect: "" },
  { fn: "bind", args: [], expect: "" },

  // ---- unbind: the exact line, and the same refusals ----
  { fn: "unbind", args: ["MOD4 + CONTROL + MOD1 + V"], expect: _UNBIND },
  { fn: "unbind", args: ["MOD4 + J"], expect: "hl.unbind(\"MOD4 + J\")" },
  { fn: "unbind", args: ["CONTROL + SHIFT + F1"], expect: "hl.unbind(\"CONTROL + SHIFT + F1\")" },
  { fn: "unbind", args: ["MOD1 + F12"], expect: "hl.unbind(\"MOD1 + F12\")" },
  { fn: "unbind", args: ["all"], expect: "" },
  { fn: "unbind", args: ["ALL"], expect: "" },
  { fn: "unbind", args: ["catchall"], expect: "" },
  { fn: "unbind", args: ["V"], expect: "" },
  { fn: "unbind", args: ["F5"], expect: "" },
  { fn: "unbind", args: ["SHIFT + V"], expect: "" },
  { fn: "unbind", args: ["SUPER + CTRL + ALT + V"], expect: "" },
  { fn: "unbind", args: ["MOD4 + CONTROL + MOD1 + V", "video"], expect: _UNBIND },
  { fn: "unbind", args: ["mod4 + v"], expect: "" },
  { fn: "unbind", args: ["MOD4+V"], expect: "" },
  { fn: "unbind", args: ["MOD4 + F13"], expect: "" },
  { fn: "unbind", args: ["MOD4 + V\") hl.unbind(\"all"], expect: "" },
  { fn: "unbind", args: ["MOD4 + V\") os.execute(\"x"], expect: "" },
  { fn: "unbind", args: ["MOD4 + V\n"], expect: "" },
  { fn: "unbind", args: ["MOD4 + V]]"], expect: "" },
  { fn: "unbind", args: ["MOD4 + \u0412"], expect: "" },
  { fn: "unbind", args: [{ gen: "repeat", unit: "A", count: 65 }], expect: "" },
  { fn: "unbind", args: [""], expect: "" },
  { fn: "unbind", args: [null], expect: "" },
  { fn: "unbind", args: [4], expect: "" },
  { fn: "unbind", args: [["MOD4 + V"]], expect: "" },
  { fn: "unbind", args: [], expect: "" },

  // ---- check: what the templates return ----
  { fn: "check", args: [_RULE], expect: true },
  { fn: "check", args: [_RULE_FLUSH], expect: true },
  { fn: "check", args: [_RULE_TL], expect: true },
  { fn: "check", args: [_RULE_TR], expect: true },
  { fn: "check", args: [_RULE_BL], expect: true },
  { fn: "check", args: [_RULE_MAX], expect: true },
  { fn: "check", args: [_BIND_PANEL], expect: true },
  { fn: "check", args: [_BIND_VIDEO], expect: true },
  { fn: "check", args: [_BIND_OUTPUT], expect: true },
  { fn: "check", args: [_BIND_ALL_MODS], expect: true },
  { fn: "check", args: [_UNBIND], expect: true },
  { fn: "check", args: ["hl.unbind(\"MOD1 + F12\")"], expect: true },

  // ---- check: nothing, and things that are not text ----
  { fn: "check", args: [""], expect: false },
  { fn: "check", args: [" "], expect: false },
  { fn: "check", args: [], expect: false },
  { fn: "check", args: [null], expect: false },
  { fn: "check", args: [0], expect: false },
  { fn: "check", args: [true], expect: false },
  { fn: "check", args: [[_UNBIND]], expect: false },
  { fn: "check", args: [{ code: _UNBIND }], expect: false },

  // ---- check: a removal of anything but one full combination ----
  { fn: "check", args: ["hl.unbind(\"all\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"ALL\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"V\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"F12\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"SHIFT + V\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"\")"], expect: false },
  { fn: "check", args: ["hl.unbind()"], expect: false },
  { fn: "check", args: ["hl.unbind(\"SUPER + CTRL + ALT + V\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"mod4 + v\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4+V\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + F13\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + code:10\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"CONTROL + MOD4 + V\")"], expect: false },
  { fn: "check", args: ["hl.unbind('MOD4 + V')"], expect: false },
  { fn: "check", args: ["hl.unbind(MOD4 + V)"], expect: false },
  { fn: "check", args: ["hl.unbind([[MOD4 + V]])"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + V\", \"MOD4 + J\")"], expect: false },
  { fn: "check", args: ["hl.unbind (\"MOD4 + V\")"], expect: false },
  { fn: "check", args: ["hl.unbind( \"MOD4 + V\" )"], expect: false },
  { fn: "check", args: ["HL.unbind(\"MOD4 + V\")"], expect: false },
  { fn: "check", args: ["o.unbind(\"MOD4 + V\")"], expect: false },
  { fn: "check", args: ["hl.unbind\"MOD4 + V\""], expect: false },

  // ---- check: one of our lines with something added ----
  { fn: "check", args: [_UNBIND + " "], expect: false },
  { fn: "check", args: [" " + _UNBIND], expect: false },
  { fn: "check", args: [_UNBIND + "\n"], expect: false },
  { fn: "check", args: ["\n" + _UNBIND], expect: false },
  { fn: "check", args: [_UNBIND + "\r\n"], expect: false },
  { fn: "check", args: [_UNBIND + "\u0000"], expect: false },
  { fn: "check", args: [_UNBIND + ";"], expect: false },
  { fn: "check", args: [_UNBIND + " " + _UNBIND], expect: false },
  { fn: "check", args: [_UNBIND + "\n" + _UNBIND], expect: false },
  { fn: "check", args: [_UNBIND + " hl.unbind(\"all\")"], expect: false },
  { fn: "check", args: [_UNBIND + " os.execute(\"x\")"], expect: false },
  { fn: "check", args: [_UNBIND + "; os.execute(\"x\")"], expect: false },
  { fn: "check", args: [_UNBIND + " -- x"], expect: false },
  { fn: "check", args: [_UNBIND + " --[[ x ]]"], expect: false },
  { fn: "check", args: [_UNBIND + ":x()"], expect: false },
  { fn: "check", args: ["return " + _UNBIND], expect: false },
  { fn: "check", args: ["local h = " + _BIND_VIDEO], expect: false },
  { fn: "check", args: ["_G.h = " + _BIND_VIDEO], expect: false },
  { fn: "check", args: [_BIND_VIDEO + ":unbind()"], expect: false },
  { fn: "check", args: [_BIND_VIDEO + " " + _UNBIND], expect: false },
  { fn: "check", args: [_RULE + " " + _UNBIND], expect: false },
  { fn: "check", args: [_RULE + " os.execute(\"x\")"], expect: false },
  { fn: "check", args: [_UNBIND + " " + _RULE], expect: false },
  { fn: "check", args: [_RULE + " " + _RULE], expect: false },

  // ---- check: the characters no line of ours contains ----
  { fn: "check", args: ["hl.unbind(\"MOD4 + V\\\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + V\u0060\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + V\") /instances"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 +\tV\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + V\u007f\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4\u00a0+ V\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + \u0412\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + \uff36\")"], expect: false },
  { fn: "check", args: ["hl.unbind(\u201cMOD4 + V\u201d)"], expect: false },
  { fn: "check", args: ["hl.unbind(\uff02MOD4 + V\uff02)"], expect: false },
  { fn: "check", args: ["hl.unbind\uff08\"MOD4 + V\"\uff09"], expect: false },
  { fn: "check", args: ["hl.unbind(\"MOD4 + V\u200b\")"], expect: false },
  { fn: "check", args: ["\u202e" + _UNBIND], expect: false },
  { fn: "check", args: ["\ufeff" + _UNBIND], expect: false },
  { fn: "check", args: [_UNBIND + "\u2028"], expect: false },
  { fn: "check", args: [{ gen: "codes", codes: [55357] }], expect: false },
  { fn: "check", args: [{ gen: "codes", codes: [104, 108, 46, 117, 110, 98, 105, 110, 100, 40, 56832] }],
    expect: false },

  // ---- check: a bind that is not exactly one of the six ----
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", hl.dsp.exec_cmd(\"x\"), " + _VIDEO], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle; x\"), " + _VIDEO], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle $(x)\"), " + _VIDEO],
    expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle\", \"x\"), " + _VIDEO],
    expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video  toggle\"), " + _VIDEO], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "play AAAAAAAAAAA\"), " + _VIDEO],
    expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", hl.dsp.exec_cmd(\"omarchy-shell -q other.plugin toggle\"), "
    + _PANEL], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", "
    + "hl.dsp.exec_cmd(\"omarchy-shell davidgudovic.omajuke toggle\"), " + _PANEL], expect: false },
  // The command of one action under the description of another.
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle\"), " + _PANEL], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "toggle\"), " + _OUTPUT], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle\"), "
    + "{ description = \"OmaJuke: show, or hide video\" })"], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle\"), "
    + "{ description = \"Somebody else\" })"], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle\"), "
    + "{ description = \"OmaJuke: show or hide video\", locked = true })"], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", " + _RUN + "video toggle\"))"], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", hl.dsp.exit(), " + _VIDEO], expect: false },
  { fn: "check", args: ["hl.bind(\"MOD4 + V\", function() os.execute(\"x\") end, " + _VIDEO],
    expect: false },
  { fn: "check", args: ["hl.bind(\"V\", " + _RUN + "video toggle\"), " + _VIDEO], expect: false },
  { fn: "check", args: ["hl.bind(\"SHIFT + V\", " + _RUN + "video toggle\"), " + _VIDEO], expect: false },
  { fn: "check", args: ["hl.bind(\"\", " + _RUN + "video toggle\"), " + _VIDEO], expect: false },
  { fn: "check", args: ["hl.bind(\"SUPER + V\", " + _RUN + "video toggle\"), " + _VIDEO], expect: false },
  { fn: "check", args: ["o.bind(\"MOD4 + V\", \"OmaJuke: show or hide video\", \"x\")"], expect: false },

  // ---- check: a rule with one piece changed ----
  { fn: "check", args: [_OPEN + _FLAGS + _SIZE + _MOVE], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE + _MOVE + "end"], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE + _MOVE + "_G.__omajuke_rule = \"25-br-4-5\" end"],
    expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"25-br-5-4\" then " + _OPEN + _FLAGS + _SIZE + _MOVE
    + _END], expect: false },
  { fn: "check", args: ["if true then " + _OPEN + _FLAGS + _SIZE + _MOVE + _END], expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule == \"25-br-4-4\" then " + _OPEN + _FLAGS + _SIZE + _MOVE
    + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE + _MOVE + "_G.x = 1 " + _END], expect: false },
  { fn: "check", args: [_IF + "os.execute(\"x\") " + _OPEN + _FLAGS + _SIZE + _MOVE + _END],
    expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE + _MOVE + "hl.unbind(\"all\") " + _END],
    expect: false },
  { fn: "check", args: [_IF + "local r = " + _OPEN + _FLAGS + _SIZE + _MOVE + _END], expect: false },
  // Another window, another name, other effects.
  { fn: "check", args: [_IF + "hl.window_rule({ name = \"omajuke-video\", match = { class = \".*\" }, "
    + _FLAGS + _SIZE + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + "hl.window_rule({ name = \"omajuke-video\", match = { class = \"OmaJuke\" }, "
    + _FLAGS + _SIZE + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + "hl.window_rule({ name = \"other\", match = { class = \"^OmaJuke$\" }, "
    + _FLAGS + _SIZE + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + "hl.window_rule({ match = { class = \"^OmaJuke$\" }, " + _FLAGS + _SIZE
    + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + "fullscreen = true, " + _FLAGS + _SIZE + _MOVE + _END],
    expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + "no_focus = true, " + _SIZE + _MOVE + _END],
    expect: false },
  { fn: "check", args: [_IF + _OPEN + _SIZE + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _MOVE + _END], expect: false },
  // The right shape with numbers that do not belong together.
  { fn: "check", args: [_IF + _OPEN + _FLAGS + "size = { \"(monitor_w*0.26)\", \"(monitor_w*0.140625)\" }, "
    + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + "size = { \"(monitor_w*0.25)\", \"(monitor_w*0.250000)\" }, "
    + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + "size = { \"(monitor_w*0.99)\", \"(monitor_w*0.999999)\" }, "
    + _MOVE + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE
    + "move = { \"(monitor_w-monitor_w*0.25-5)\", \"(monitor_h-monitor_w*0.140625-4)\" } }) " + _END],
    expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE
    + "move = { \"(monitor_w-monitor_w*0.25-4)\", \"(monitor_h-monitor_w*0.140625-9999)\" } }) " + _END],
    expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE
    + "move = { \"(monitor_w-monitor_w*0.50-4)\", \"(monitor_h-monitor_w*0.140625-4)\" } }) " + _END],
    expect: false },
  // A bottom-right signature over a top-left position.
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE + "move = { 4, 4 } }) " + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE + "move = { -4, -4 } }) " + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE
    + "move = { \"(monitor_w-window_w-4)\", \"(monitor_h-window_h-4)\" } }) " + _END], expect: false },
  { fn: "check", args: [_IF + _OPEN + _FLAGS + _SIZE
    + "move = { \"(cursor_x)\", \"(cursor_y)\" } }) " + _END], expect: false },
  // Fractions written with a slash.
  { fn: "check", args: [_IF + _OPEN + _FLAGS + "size = { \"(monitor_w/4)\", \"(monitor_w*9/64)\" }, "
    + "move = { \"(monitor_w-monitor_w/4-4)\", \"(monitor_h-monitor_w*9/64-4)\" } }) " + _END],
    expect: false },
  // Signatures the template cannot produce.
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"9-br-4-4\" then " + _OPEN + _FLAGS
    + "size = { \"(monitor_w*0.09)\", \"(monitor_w*0.050625)\" }, "
    + "move = { \"(monitor_w-monitor_w*0.09-4)\", \"(monitor_h-monitor_w*0.050625-4)\" } }) "
    + "_G.__omajuke_rule = \"9-br-4-4\" end"], expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"91-br-4-4\" then " + _OPEN + _FLAGS
    + "size = { \"(monitor_w*0.91)\", \"(monitor_w*0.511875)\" }, "
    + "move = { \"(monitor_w-monitor_w*0.91-4)\", \"(monitor_h-monitor_w*0.511875-4)\" } }) "
    + "_G.__omajuke_rule = \"91-br-4-4\" end"], expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"25-br-2001-4\" then " + _OPEN + _FLAGS + _SIZE
    + "move = { \"(monitor_w-monitor_w*0.25-2001)\", \"(monitor_h-monitor_w*0.140625-4)\" } }) "
    + "_G.__omajuke_rule = \"25-br-2001-4\" end"], expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"25-br-04-4\" then " + _OPEN + _FLAGS + _SIZE
    + "move = { \"(monitor_w-monitor_w*0.25-04)\", \"(monitor_h-monitor_w*0.140625-4)\" } }) "
    + "_G.__omajuke_rule = \"25-br-04-4\" end"], expect: false },
  // What a zero written with its sign would have made of the rule.
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"25-br--0--0\" then " + _OPEN + _FLAGS + _SIZE
    + "move = { \"(monitor_w-monitor_w*0.25--0)\", \"(monitor_h-monitor_w*0.140625--0)\" } }) "
    + "_G.__omajuke_rule = \"25-br--0--0\" end"], expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"25-tl-0-0\" then " + _OPEN + _FLAGS + _SIZE
    + "move = { -0, -0 } }) _G.__omajuke_rule = \"25-tl-0-0\" end"], expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"25-xx-4-4\" then " + _OPEN + _FLAGS + _SIZE + _MOVE
    + "_G.__omajuke_rule = \"25-xx-4-4\" end"], expect: false },
  { fn: "check", args: ["if _G.__omajuke_rule ~= \"\" then " + _OPEN + _FLAGS + _SIZE + _MOVE
    + "_G.__omajuke_rule = \"\" end"], expect: false },
  // The same rule over several lines, or with wider spacing.
  { fn: "check", args: [_IF + "\n" + _OPEN + _FLAGS + _SIZE + _MOVE + "\n" + _END], expect: false },
  { fn: "check", args: [_IF + " " + _OPEN + _FLAGS + _SIZE + _MOVE + _END], expect: false },

  // ---- check: longer than any line of ours ----
  { fn: "check", args: [{ gen: "repeat", unit: " ", count: 901 }], expect: false },
  { fn: "check", args: [{ gen: "repeat", unit: "hl.unbind(\"MOD4 + V\") ", count: 41 }], expect: false },
  { fn: "check", args: [{ gen: "repeat", unit: "a", count: 300000 }], expect: false },
  { fn: "check", args: [{ gen: "repeat", unit: "(?:", count: 100000 }], expect: false }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
