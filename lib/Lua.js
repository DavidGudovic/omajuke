.pragma library
.import "Const.js" as Const

// The only Lua OmaJuke ever hands to Hyprland: three one-line templates (the
// rule that places the video window, a key bind, the removal of a key bind)
// and check(), the gate every line passes immediately before it is sent.
// Lua sent this way runs inside the compositor, where a mistake can take
// the whole desktop down. So nothing here is assembled from free text: the
// only parts that vary are a key combination from a closed grammar, one of
// six actions and four bounded whole numbers. This file owns the
// templates, the bounds of what may fill them, and the list of Hyprland
// releases they are known to work on.

// Hyprland releases these lines are known to work on, as prefixes of the
// version text. The Lua interface changes between releases and a call it
// does not expect can end the session, so nothing is sent to a release
// that is not listed. Freezing the list keeps a slip from widening it and
// is no more than that: Qt's engine still writes to a frozen list, and
// lets a file that imports this one assign to any name in it.
var TESTED = Object.freeze(["0.56."])

// ---- Limits of a line ----

// The compositor reads a request in blocks of 1023 bytes, and a request
// that ends exactly on a block stalls the desktop for seconds. No template
// comes near this cap, so nothing longer is ours.
var _MAX_BYTES = 900

// After this test a character is a byte, which is what the cap counts.
var _PRINTABLE = /^[\x20-\x7e]*$/

// None of these occurs in a template. The hyprctl client routes a request
// elsewhere when it finds certain words after a slash, a backslash changes
// what a quote means, the shell that runs a bind's command executes what
// stands between backticks, two hyphens start a Lua comment and doubled
// brackets a long string.
var _FORBIDDEN = ["/", "\\", "\u0060", "--", "[[", "]]"]

// ---- What may fill a slot ----

// A key combination in Hyprland's alias spelling: the modifiers in this
// order, each at most once, then one letter or function key. Text of this
// shape holds only capitals, digits, spaces and plus signs, so it cannot
// close a string, start a comment or be the word that unbinds everything.
var _ALIAS = "(?:MOD4 \\+ )?(?:CONTROL \\+ )?(?:MOD1 \\+ )?(?:SHIFT \\+ )?(?:[A-Z]|F(?:[1-9]|1[0-2]))"
var _ALIAS_RE = new RegExp("^" + _ALIAS + "$")

// The grammar above also admits a key with no modifier, or with Shift
// alone. That is what typing produces: once bound, the key could no longer
// be typed anywhere on the desktop. A combination therefore has to start
// with one of the other three.
var _HELD_RE = /^(?:MOD4|CONTROL|MOD1) \+ /

// The window is this many percent of the monitor's width, and sits this far
// from the two edges of its corner.
var _PCT_MIN = 10
var _PCT_MAX = 90
var _MARGIN_MAX = 2000

// How the numbers of a rule are written: a margin without leading zeros,
// the width as hundredths and the height as millionths of the monitor's
// width.
var _INT = "(?:0|[1-9][0-9]{0,3})"
var _HUNDREDTHS = "0\\.[0-9]{2}"
var _MILLIONTHS = "0\\.[0-9]{6}"

// The four corners: the name the rest of the plugin uses, the two letters
// that stand for it in the rule's signature, and the edges it touches.
var _CORNERS = [
  { name: "top-left", code: "tl", left: true, top: true },
  { name: "top-right", code: "tr", left: false, top: true },
  { name: "bottom-left", code: "bl", left: true, top: false },
  { name: "bottom-right", code: "br", left: false, top: false }
]

// ---- Names inside the Lua ----

// The value when it is text of the given shape and at most 64 characters,
// else the empty string.
function _named(value, pattern) {
  return typeof value === "string" && value.length <= 64 && pattern.test(value) ? value : ""
}

// Three constants end up inside the Lua: the application name (the window
// class the rule matches, and the start of every bind description), the
// directory name (in the rule's name and in the name of the one global),
// and the plugin id (in the command of a bind, which the compositor hands
// to a shell). Each has to keep to characters that mean nothing in a Lua
// string, in a pattern or to a shell. Should one of them ever not, no
// template yields a line and check() accepts nothing.
//
// Each is read once, here, and only these copies are used from then on.
// The constants can change after loading (Qt's engine lets any file that
// imports them assign to them), and a name that is checked now and looked
// up again when a line is built would then be two different names.
var _APP = _named(Const.APP_NAME, /^[A-Za-z][A-Za-z0-9]{0,31}$/)
var _DIR = _named(Const.DIR_NAME, /^[a-z][a-z0-9]{0,31}$/)
var _ID = _named(Const.PLUGIN_ID, /^[a-z0-9]+(?:\.[a-z0-9-]+)+$/)
var _NAMES_SAFE = _APP !== "" && _DIR !== "" && _ID !== "" && _ID.indexOf("--") === -1

var _CLASS = "^" + _APP + "$"
var _RULE_NAME = _DIR + "-video"

// The one thing OmaJuke keeps in the Lua state: the signature of the rule
// that is registered. Hyprland wipes it together with the rule whenever it
// reloads its configuration.
var _GUARD = "_G.__" + _DIR + "_rule"

// With -q a bind that outlives the plugin does nothing, silently.
var _SHELL_CALL = "omarchy-shell -q " + _ID

// What a bind can do. The description is what Omarchy's keybindings menu
// shows and what later tells our bind from somebody else's. The menu splits
// its rows at commas, so no description contains one.
var _ACTIONS = [
  { name: "panel", description: _APP + ": open panel",
    command: _SHELL_CALL + " toggle" },
  { name: "video", description: _APP + ": show or hide video",
    command: _SHELL_CALL + " video toggle" },
  { name: "output", description: _APP + ": next audio output",
    command: _SHELL_CALL + " output next" },
  { name: "playPause", description: _APP + ": play or pause",
    command: _SHELL_CALL + " playPause" },
  { name: "next", description: _APP + ": next track",
    command: _SHELL_CALL + " next" },
  { name: "previous", description: _APP + ": previous track",
    command: _SHELL_CALL + " previous" }
]

// ---- The templates ----

// Each function below is one template: constant text around the slots its
// parameters name. The patterns of check() are built from these same
// functions, so a template and its pattern cannot drift apart. No template
// keeps what hl.bind or hl.window_rule returns: using such a handle after
// the bind or rule is gone ends the compositor.

function _width(f) {
  return "monitor_w*" + f
}

// Sixteen by nine: the height is a fraction of the monitor's width too.
function _height(g) {
  return "monitor_w*" + g
}

// The position of a window that sits at the right or the bottom edge. It
// repeats the size expression instead of asking for the window's size: at
// that moment the compositor still holds the size the application asked
// for, not the one this rule gives it.
function _fromRight(f, margin) {
  return "\"(monitor_w-" + _width(f) + "-" + margin + ")\""
}

function _fromBottom(g, margin) {
  return "\"(monitor_h-" + _height(g) + "-" + margin + ")\""
}

// The window rule. Sending a named rule again adds its effects to the ones
// already there, and rules cannot be listed, so the line registers the rule
// only when the global does not already hold this signature. The tag and
// the opacity undo the slight transparency Omarchy gives every window. Both
// fractions are decimals, which keeps the line free of slashes.
function _ruleLine(signature, f, g, x, y) {
  return "if " + _GUARD + " ~= \"" + signature + "\" then"
    + " hl.window_rule({ name = \"" + _RULE_NAME + "\", match = { class = \"" + _CLASS + "\" },"
    + " float = true, pin = true, no_initial_focus = true, keep_aspect_ratio = true, no_dim = true,"
    + " border_size = 0, tag = \"-default-opacity\", opacity = \"1 1\","
    + " size = { \"(" + _width(f) + ")\", \"(" + _height(g) + ")\" },"
    + " move = { " + x + ", " + y + " } })"
    + " " + _GUARD + " = \"" + signature + "\" end"
}

function _bindLine(alias, command, description) {
  return "hl.bind(\"" + alias + "\", hl.dsp.exec_cmd(\"" + command + "\"),"
    + " { description = \"" + description + "\" })"
}

function _unbindLine(alias) {
  return "hl.unbind(\"" + alias + "\")"
}

// ---- The patterns ----

var _SPECIAL = /[\\^$.*+?()[\]{}|]/g

function _escaped(character) {
  return "\\" + character
}

function _literal(text) {
  return text.replace(_SPECIAL, _escaped)
}

// The source of the pattern for one template. The template is filled with a
// stand-in per slot (the first control characters, which no template text
// contains), its own text is made literal, and each stand-in is then
// replaced by the pattern of what may fill that slot.
function _source(template, slots) {
  var marks = []
  for (var i = 0; i < slots.length; i++) marks.push(String.fromCharCode(i + 1))
  var source = _literal(template.apply(null, marks))
  for (var j = 0; j < slots.length; j++) source = source.split(marks[j]).join(slots[j])
  return source
}

function _oneOf(texts) {
  return "(?:" + texts.map(_literal).join("|") + ")"
}

function _codeOf(corner) {
  return corner.code
}

function _commandOf(action) {
  return action.command
}

function _descriptionOf(action) {
  return action.description
}

// Percentage, corner and the two margins. The rule holds it twice, so the
// pattern captures these four values twice; the first set is read.
var _SIGNATURE = "([1-9][0-9])-(" + _CORNERS.map(_codeOf).join("|") + ")-(" + _INT + ")-(" + _INT + ")"

var _RULE_RE = new RegExp("^" + _source(_ruleLine, [
  _SIGNATURE,
  _HUNDREDTHS,
  _MILLIONTHS,
  "(?:" + _INT + "|" + _source(_fromRight, [_HUNDREDTHS, _INT]) + ")",
  "(?:" + _INT + "|" + _source(_fromBottom, [_MILLIONTHS, _INT]) + ")"
]) + "$")

var _BIND_RE = new RegExp("^" + _source(_bindLine, [
  "(" + _ALIAS + ")",
  _oneOf(_ACTIONS.map(_commandOf)),
  _oneOf(_ACTIONS.map(_descriptionOf))
]) + "$")

var _UNBIND_RE = new RegExp("^" + _source(_unbindLine, ["(" + _ALIAS + ")"]) + "$")

// ---- Validation ----

function _isInt(value, min, max) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value
    && value >= min && value <= max
}

function _isAlias(alias) {
  return typeof alias === "string" && _ALIAS_RE.test(alias) && _HELD_RE.test(alias)
}

function _cornerNamed(name) {
  for (var i = 0; i < _CORNERS.length; i++) {
    if (_CORNERS[i].name === name) return _CORNERS[i]
  }
  return null
}

function _cornerCoded(code) {
  for (var i = 0; i < _CORNERS.length; i++) {
    if (_CORNERS[i].code === code) return _CORNERS[i]
  }
  return null
}

function _actionNamed(name) {
  for (var i = 0; i < _ACTIONS.length; i++) {
    if (_ACTIONS[i].name === name) return _ACTIONS[i]
  }
  return null
}

// The four values of a placement, or null. Each is read once, so that
// what is checked is what is written. An object can refuse to be read (a
// wrapper around something that is gone, say); that is not a placement
// either, and no reason to fail.
function _placed(p) {
  if (p === null || typeof p !== "object") return null
  try {
    return { pct: p.pct, corner: p.corner, marginX: p.marginX, marginY: p.marginY }
  } catch (error) {
    return null
  }
}

// What holds for a line whatever it says: it is text, short, printable
// ASCII and free of the forbidden parts.
function _isPlain(code) {
  if (typeof code !== "string" || code.length > _MAX_BYTES || !_PRINTABLE.test(code)) return false
  for (var i = 0; i < _FORBIDDEN.length; i++) {
    if (code.indexOf(_FORBIDDEN[i]) !== -1) return false
  }
  return true
}

// A pattern proves the shape of a line. These three prove the rest: the
// line is, character for character, what the template returns for the
// values the line itself names. A rule whose two signatures differ, whose
// fractions do not belong to its percentage or whose margin is out of
// range has the right shape and is still refused, and so is a bind whose
// description belongs to another action than its command.
function _isRule(code) {
  var found = _RULE_RE.exec(code)
  if (found === null) return false
  var corner = _cornerCoded(found[2])
  if (corner === null) return false
  return code === rule({
    pct: Number(found[1]), corner: corner.name, marginX: Number(found[3]), marginY: Number(found[4])
  })
}

function _isBind(code) {
  var found = _BIND_RE.exec(code)
  if (found === null) return false
  for (var i = 0; i < _ACTIONS.length; i++) {
    if (code === bind(found[1], _ACTIONS[i].name)) return true
  }
  return false
}

function _isUnbind(code) {
  var found = _UNBIND_RE.exec(code)
  return found !== null && code === unbind(found[1])
}

// ---- Public functions ----

// The line that registers the video window rule: floating, pinned, never
// taking focus, pct percent of the monitor's width at sixteen by nine, in
// the given corner, marginX and marginY away from that corner's two edges.
// p: { pct, corner, marginX, marginY }, as Geometry.placement returns it.
// Returns "" unless pct is a whole number from 10 to 90, corner one of the
// four names and both margins whole numbers from 0 to 2000.
function rule(p) {
  if (!_NAMES_SAFE) return ""
  var values = _placed(p)
  if (values === null) return ""
  var pct = values.pct
  var corner = _cornerNamed(values.corner)
  var marginX = values.marginX
  var marginY = values.marginY
  if (corner === null || !_isInt(pct, _PCT_MIN, _PCT_MAX)) return ""
  if (!_isInt(marginX, 0, _MARGIN_MAX) || !_isInt(marginY, 0, _MARGIN_MAX)) return ""

  // Both fractions are spelled from whole numbers, so the two JavaScript
  // engines this file runs on cannot print different digits. The height is
  // 9/16 of pct/100 of the width, which is pct * 5625 millionths of it.
  var f = "0." + pct
  var millionths = String(pct * 5625)
  var g = "0." + (millionths.length < 6 ? "0" : "") + millionths
  var signature = pct + "-" + corner.code + "-" + marginX + "-" + marginY
  var x = corner.left ? String(marginX) : _fromRight(f, marginX)
  var y = corner.top ? String(marginY) : _fromBottom(g, marginY)
  return _ruleLine(signature, f, g, x, y)
}

// The line that binds a key combination to one of the six actions
// ("panel", "video", "output", "playPause", "next", "previous"). Returns "" for anything else, and for an
// alias that is not exactly a combination in the alias spelling.
function bind(alias, action) {
  var entry = _actionNamed(action)
  if (!_NAMES_SAFE || entry === null || !_isAlias(alias)) return ""
  return _bindLine(alias, entry.command, entry.description)
}

// The line that removes every bind registered under this exact spelling of
// a combination. Whether that is safe to send is for the caller to decide.
// What is guaranteed here is that the argument is a full combination, never
// a bare key and never the word that removes all binds.
function unbind(alias) {
  if (!_NAMES_SAFE || !_isAlias(alias)) return ""
  return _unbindLine(alias)
}

// True only for a line one of the three functions above can return. This
// is the last test before text runs inside the compositor, so it is put to
// every line, whoever built it. Its layers overlap on purpose: a line with
// a comment in it, say, is refused by each of them alone.
function check(code) {
  if (!_NAMES_SAFE || !_isPlain(code)) return false
  var kinds = 0
  if (_isRule(code)) kinds++
  if (_isBind(code)) kinds++
  if (_isUnbind(code)) kinds++
  return kinds === 1
}

if (typeof module !== "undefined") {
  module.exports = { TESTED: TESTED, rule: rule, bind: bind, unbind: unbind, check: check }
}
