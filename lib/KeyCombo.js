.pragma library
.import "Const.js" as Const
.import "Clean.js" as Clean

// Keyboard shortcuts as data. This file owns the three actions a shortcut can
// trigger and their constant texts, the grammar of a key combination (the
// only source of a key name that is ever handed to the compositor), the
// reader for the compositor's plain-text list of binds, and the rule that
// says whether a combination is free, ours or somebody else's.
//
// The list of binds is other people's text in a format without any quoting,
// so the reader is strict: one line it cannot account for makes the whole
// list unusable, and an unusable list never lets a combination count as
// free. Being wrong in the other direction only costs a refused shortcut.

// ---- Actions ----

// One row per action:
//   label        what the settings page calls it
//   description  what the compositor's list and the desktop's key overview
//                show for a bind made at runtime. Such a bind is recognised
//                as ours by this text, and the overview splits its rows at
//                commas, so none may contain one.
//   pasted       what a bind carries that the user pasted into their own
//                configuration. The text differs from the one above on
//                purpose: that bind is the user's, so it must never pass
//                for ours and never be removed by us.
//   call         what the action asks the shell to do
//   proposals    combinations offered while the action has none, best first
var _ROWS = [
  {
    name: "panel",
    label: "Open panel",
    description: "OmaJuke: open panel",
    pasted: "OmaJuke panel (bindings.lua)",
    call: "toggle",
    proposals: ["SUPER + CTRL + ALT + J", "SUPER + ALT + J", "SUPER + CTRL + ALT + P"]
  },
  {
    name: "video",
    label: "Show or hide video",
    description: "OmaJuke: show or hide video",
    pasted: "OmaJuke video (bindings.lua)",
    call: "video toggle",
    proposals: ["SUPER + CTRL + ALT + V", "SUPER + ALT + V"]
  },
  {
    name: "output",
    label: "Next audio output",
    description: "OmaJuke: next audio output",
    pasted: "OmaJuke output (bindings.lua)",
    call: "output next",
    proposals: ["SUPER + CTRL + ALT + O", "SUPER + ALT + O"]
  }
]

var ACTIONS = Object.freeze(_ROWS.map(function(row) {
  return row.name
}))

// The shape the plugin id promises to keep. It becomes part of a command
// line, so the promise is checked again where the command is built.
var _PLUGIN_ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/

// The row of an action, or null when there is no such action.
function _row(name) {
  var which = typeof name === "string" ? ACTIONS.indexOf(name) : -1
  return which === -1 ? null : _ROWS[which]
}

// The constant texts of an action, or null when there is no such action.
function action(name) {
  var row = _row(name)
  if (row === null) return null
  return {
    action: row.name,
    label: row.label,
    description: row.description,
    configDescription: row.pasted,
    proposals: row.proposals.slice()
  }
}

// The command a bind for the action runs, or "". The compositor hands it to
// a shell, so it is made of constants only. "-q" keeps a bind that outlives
// the plugin silent.
function command(name) {
  var row = _row(name)
  if (row === null || typeof Const.PLUGIN_ID !== "string" || !_PLUGIN_ID.test(Const.PLUGIN_ID)) return ""
  return "omarchy-shell -q " + Const.PLUGIN_ID + " " + row.call
}

// ---- Key grammar ----

// The modifiers in the one order a combination is written in, the second
// name the compositor accepts for each, and its bit in the compositor's
// modifier mask. Binds made at runtime are written with the second names:
// the compositor removes binds by their spelling, so a spelling nobody
// types keeps a removal from ever reaching a bind the user wrote.
var _MODS = ["SUPER", "CTRL", "ALT", "SHIFT"]
var _ALIASES = ["MOD4", "CONTROL", "MOD1", "SHIFT"]
var _BITS = [64, 4, 8, 1]

var _KEYS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"
]

// The whole grammar. Nothing is trimmed, reordered or changed in case
// before the test: a text is a combination only when it is written exactly
// this way.
var _COMBO = /^(SUPER \+ )?(CTRL \+ )?(ALT \+ )?(SHIFT \+ )?([A-Z]|F(?:[1-9]|1[0-2]))$/
var _COMBO_CHARS = 64

// Reads a combination. Returns null, or { canonical, mask, key, alias }
// where alias is the spelling for the compositor. Every text in the result
// is put together from the tables above, never cut out of the input.
function parse(text) {
  if (typeof text !== "string" || text.length > _COMBO_CHARS) return null
  var match = _COMBO.exec(text)
  if (!match) return null
  // SUPER, CTRL or ALT has to be part of it: a key alone, or with SHIFT, is
  // what people type.
  if (!match[1] && !match[2] && !match[3]) return null
  var at = _KEYS.indexOf(match[5])
  if (at === -1) return null
  var mask = 0
  var canonical = ""
  var alias = ""
  for (var i = 0; i < _MODS.length; i++) {
    if (!match[i + 1]) continue
    mask += _BITS[i]
    canonical += _MODS[i] + " + "
    alias += _ALIASES[i] + " + "
  }
  canonical += _KEYS[at]
  if (canonical !== text) return null
  return { canonical: canonical, mask: mask, key: _KEYS[at], alias: alias + _KEYS[at] }
}

// Qt's numbers for keys (Qt::Key) and for held modifiers
// (Qt::KeyboardModifier). The modifiers are in the order of _MODS. The
// letter keys carry the character code of their capital letter.
var _QT_A = 0x41
var _QT_Z = 0x5a
var _QT_F1 = 0x01000030
var _QT_F12 = 0x0100003b
var _QT_MODS = [0x10000000, 0x04000000, 0x08000000, 0x02000000]

function _isCount(value) {
  return typeof value === "number" && isFinite(value) && value >= 0 && Math.floor(value) === value
}

// True when a number has the given power of two in it. Division instead of
// a bit operator, which would quietly cut a large number down to 32 bits.
function _hasBit(number, bit) {
  return Math.floor(number / bit) % 2 === 1
}

// Turns a captured key press into a combination, or "" when it is not one
// the grammar has. A press with any other modifier (the keypad, a second
// keyboard group, anything unknown) is refused rather than read without it.
function fromQt(key, modifiers) {
  if (!_isCount(key) || !_isCount(modifiers)) return ""
  var name = ""
  if (key >= _QT_A && key <= _QT_Z) name = String.fromCharCode(key)
  else if (key >= _QT_F1 && key <= _QT_F12) name = "F" + (key - _QT_F1 + 1)
  if (name === "") return ""
  var text = ""
  var rest = modifiers
  for (var i = 0; i < _MODS.length; i++) {
    if (!_hasBit(rest, _QT_MODS[i])) continue
    text += _MODS[i] + " + "
    rest -= _QT_MODS[i]
  }
  if (rest !== 0) return ""
  // The grammar has the last word on what was put together here.
  var parsed = parse(text + name)
  return parsed ? parsed.canonical : ""
}

// The line a user can paste into their own key configuration instead of
// letting a bind be made at runtime, or "".
function copyLine(name, combo) {
  var row = _row(name)
  var parsed = parse(combo)
  var run = command(name)
  if (row === null || parsed === null || run === "") return ""
  return "o.bind(\"" + parsed.canonical + "\", \"" + row.pasted + "\", \"" + run + "\")"
}

// ---- Reading the list of binds ----

// The compositor prints one record per bind:
//
//   bindd                  "bind" and one letter per flag
//   <tab>modmask: 76       tab-indented "name: value" lines: modmask,
//   <tab>submap:           submap, key, keycode, catchall, description,
//   <tab>key: V            dispatcher and arg
//                          and an empty line that ends the record
//
// Nothing in a value is quoted or escaped, and a description is whatever
// its author wrote, a line break included. So the reader takes no line on
// trust: every line has to be a header, a field of the open record or
// empty, no field may come twice, and every record has to be complete and
// closed. A reply that was cut short, an error message and an empty reply
// all end the same way: not usable.
//
// A desktop without a single bind is a different matter. The compositor has
// no way to print an empty list: it answers a request whose result is empty
// with one fixed line. That line alone, from a release that knows the
// request, is a list that was read and holds nothing.

var _MAX_RECORDS = 2000

// Longer than any name of a key, button or switch.
var _KEY_CHARS = 256

// How much of a submap name, description or dispatcher is kept. More than
// any of our own descriptions, so a cut text can never equal one of them.
var _TEXT_CHARS = 256

var _HEADER = /^bind[a-z]*$/

// What the compositor prints instead of an empty result.
var _NO_RESULT = "unknown request"
var _FIELD = /^\t([a-z_]+): ?/
var _NUMBER = /^[0-9]{1,10}$/

// The fields that are read. A record's values are kept in this order.
var _FIELDS = ["modmask", "submap", "key", "keycode", "catchall", "description", "dispatcher", "flags"]

function _isBlank(code) {
  return code === 0x20 || code === 0x09
}

// Spaces and tabs only: the same on both engines this file runs on.
function _trim(string) {
  var start = 0
  var end = string.length
  while (start < end && _isBlank(string.charCodeAt(start))) start++
  while (end > start && _isBlank(string.charCodeAt(end - 1))) end--
  return string.slice(start, end)
}

function _listed(list, word) {
  var parts = list.split(",")
  for (var i = 0; i < parts.length; i++) {
    if (_trim(parts[i]) === word) return true
  }
  return false
}

function _noValues() {
  var values = []
  for (var i = 0; i < _FIELDS.length; i++) values.push(null)
  return values
}

// Stores one field line in the open record. False when the line is not a
// field line or names a field the record already has: the second "key"
// line of a record is a description with a line break in it posing as one.
function _take(values, line) {
  var match = _FIELD.exec(line)
  if (!match) return false
  var slot = _FIELDS.indexOf(match[1])
  // Not a field that is read here: the bind's argument, or one that a later
  // version of the compositor adds.
  if (slot === -1) return true
  if (values[slot] !== null) return false
  values[slot] = line.slice(match[0].length)
  return true
}

// Builds a record from the values of a closed one, or null. The five
// fields a verdict depends on must all be there and well-formed: a missing
// "catchall" line is not a "false". Description and dispatcher may be
// missing, which only ever makes a bind somebody else's.
function _record(values) {
  var modmask = values[0]
  var submap = values[1]
  var key = values[2]
  var keycode = values[3]
  var catchall = values[4]
  if (modmask === null || submap === null || key === null || keycode === null) return null
  if (!_NUMBER.test(modmask) || !_NUMBER.test(keycode)) return null
  if (catchall !== "true" && catchall !== "false") return null
  if (key.length > _KEY_CHARS) return null
  return {
    modmask: parseInt(modmask, 10),
    submap: submap.slice(0, _TEXT_CHARS),
    key: key,
    keycode: parseInt(keycode, 10),
    catchall: catchall === "true",
    description: values[5] === null ? "" : values[5].slice(0, _TEXT_CHARS),
    dispatcher: values[6] === null ? "" : values[6].slice(0, _TEXT_CHARS),
    // Only later versions of the compositor print a "flags" line. A bind
    // with this flag fires whatever modifiers are held.
    ignoreMods: values[7] !== null && _listed(values[7], "ignore_mods")
  }
}

function _read(text) {
  if (typeof text !== "string" || text.length > Const.LIMITS.hyprBytes) return null
  var records = []
  var open = null
  // The line that stands for an empty result was read, as the first line.
  var nothing = false
  var start = 0
  var end = text.indexOf("\n")
  while (end !== -1) {
    var line = text.slice(start, end)
    if (line.charAt(line.length - 1) === "\r") line = line.slice(0, line.length - 1)
    if (line === "") {
      if (open !== null) {
        var record = _record(open)
        if (record === null) return null
        records.push(record)
        open = null
      }
    } else if (nothing) {
      // Nothing may follow that line: with a record after it, it is not
      // what the compositor printed.
      return null
    } else if (line.charAt(0) === "\t") {
      if (open === null || !_take(open, line)) return null
    } else if (start === 0 && line === _NO_RESULT) {
      nothing = true
    } else {
      if (open !== null || records.length === _MAX_RECORDS || !_HEADER.test(line)) return null
      open = _noValues()
    }
    start = end + 1
    end = text.indexOf("\n", start)
  }
  // Anything after the last line break is a line that was cut, and a record
  // still open at the end was cut as well.
  var rest = text.slice(start)
  if ((rest !== "" && rest !== "\r") || open !== null) return null
  // An empty reply is what a compositor in trouble sends. It is not taken
  // for a desktop without binds: only the compositor's own line is.
  if (records.length === 0 && !nothing) return null
  return records
}

// Reads the plain-text list of binds exactly as the tool printed it (not
// trimmed: the empty line after the last record is part of the format).
// Returns { ok, records }. A list that was read can be empty: a desktop
// without binds. When ok is false records is null, never an empty list, and
// classify() answers "unknown" for it.
function parseBinds(text) {
  var records = _read(text)
  return records === null ? { ok: false, records: null } : { ok: true, records: records }
}

// ---- Keyboard layout ----

// The options that decide which letter a key given by number types, in the
// order layoutFacts() takes their replies: the layouts, their variants,
// whether binds follow the layout in use, and a keymap file, which would
// replace the layouts altogether.
var LAYOUT_OPTIONS = Object.freeze([
  "input:kb_layout", "input:kb_variant", "input:resolve_binds_by_sym", "input:kb_file"
])

var _REPLY_CHARS = 4096

// What the compositor prints as the value of a text option nobody has set.
var _UNSET = "[[EMPTY]]"

// One reply to an option read, given as its JSON text or as the object
// parsed from it: a new object with the members that are looked at, each
// read once, or null.
function _reply(value) {
  var parsed = value
  if (typeof value === "string") {
    if (value.length > _REPLY_CHARS) return null
    try {
      parsed = JSON.parse(value)
    } catch (error) {
      return null
    }
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null
  return { text: parsed.str, flag: parsed.bool, number: parsed.int }
}

// The value of a text option, "" when nobody has set it, or null.
function _textOf(reply) {
  var option = _reply(reply)
  if (option === null || typeof option.text !== "string") return null
  return option.text === _UNSET ? "" : option.text
}

// The first comma-separated element of a text option, or null.
function _firstOf(reply) {
  var text = _textOf(reply)
  return text === null ? null : text.split(",")[0]
}

// True for a switch that is positively off, whichever way it is reported.
function _isOff(reply) {
  var option = _reply(reply)
  if (option === null) return false
  if (option.flag === undefined && option.number === undefined) return false
  return (option.flag === undefined || option.flag === false)
    && (option.number === undefined || option.number === 0)
}

// Returns { plainUs }: true only when the first keyboard layout is plain
// US, no keymap file stands in for it and binds follow that layout. Then,
// and only then, a key given by number is known to be a certain letter. Any
// doubt, a missing reply included, answers false.
function layoutFacts(layoutReply, variantReply, bySymReply, fileReply) {
  var plain = false
  try {
    plain = _firstOf(layoutReply) === "us" && _firstOf(variantReply) === "" && _isOff(bySymReply)
      && _textOf(fileReply) === ""
  } catch (error) {
    // A reply that cannot even be looked at settles nothing.
    plain = false
  }
  return { plainUs: plain }
}

// ---- Whose is a combination ----

// What one bind means for one key, mildest first, so that the strongest of
// several findings is their maximum.
var _NONE = 0
var _UNKNOWN = 1
var _TAKEN = 2

// The Caps Lock bit of a modifier mask. A bind is found with or without it.
var _CAPS = 2

// How much of somebody else's description is shown.
var _SHOWN_CHARS = 60

// What a key may be called: letters, digits and underscores.
var _NAME = /^[A-Za-z0-9_]+$/
var _CODE = /^code:([0-9]{1,9})$/i
var _CODE_LIKE = /^code:/i

// A key symbol given as a number ("0x76", "U0076") instead of by name.
var _SYMBOL_NUMBER = /^(?:0x[0-9a-f]+|u[0-9a-f]+)$/i

// Key numbers of the three letter rows on a plain US keyboard.
var _US_ROWS = [[24, "QWERTYUIOP"], [38, "ASDFGHJKL"], [52, "ZXCVBNM"]]

function _withoutCaps(modmask) {
  return _hasBit(modmask, _CAPS) ? modmask - _CAPS : modmask
}

// Upper case for a to z and nothing else, so that no other letter can turn
// into one of ours.
function _upper(string) {
  return string.replace(/[a-z]/g, function(letter) {
    return String.fromCharCode(letter.charCodeAt(0) - 32)
  })
}

// The function keys have the same number on every layout.
function _functionKey(code) {
  if (code >= 67 && code <= 76) return "F" + (code - 66)
  if (code === 95) return "F11"
  if (code === 96) return "F12"
  return ""
}

function _usLetter(code) {
  for (var i = 0; i < _US_ROWS.length; i++) {
    var offset = code - _US_ROWS[i][0]
    if (offset >= 0 && offset < _US_ROWS[i][1].length) return _US_ROWS[i][1].charAt(offset)
  }
  return ""
}

function _weighCode(code, key, plainUs) {
  var fixed = _functionKey(code)
  if (fixed !== "") return fixed === key ? _TAKEN : _NONE
  // Which letter this key types depends on a layout we do not know.
  if (!plainUs) return _UNKNOWN
  return _usLetter(code) === key ? _TAKEN : _NONE
}

// What one part of a key text means for a key.
function _weighPart(part, key, plainUs) {
  // A mouse button and a lid switch are not keys. The name of a switch is
  // free text, so nothing after the colon is looked at.
  if (part.indexOf("mouse:") === 0 || part.indexOf("switch:") === 0) return _NONE
  if (_CODE_LIKE.test(part)) {
    var match = _CODE.exec(part)
    return match ? _weighCode(parseInt(match[1], 10), key, plainUs) : _UNKNOWN
  }
  // An empty part is what a broken key text leaves behind, and a part with
  // anything else in it is no name the compositor could have looked up.
  if (!_NAME.test(part)) return _UNKNOWN
  var name = _upper(part)
  if (name === key) return _TAKEN
  // The two function keys that have a second name.
  if ((name === "L1" && key === "F11") || (name === "L2" && key === "F12")) return _TAKEN
  // A numbered symbol may well be our key. It is not worked out here.
  if (_SYMBOL_NUMBER.test(part)) return _UNKNOWN
  return _NONE
}

// What a bind on the right modifiers means for a key.
function _weigh(record, key, plainUs) {
  if (record.catchall) return _UNKNOWN
  var verdict = _NONE
  if (record.keycode !== 0) verdict = _weighCode(record.keycode, key, plainUs)
  // A bind on a key given by number is listed with its whole key text
  // ("SUPER + code:55"), and the compositor splits that text at every plus
  // sign, with or without spaces around it. Every part is weighed: a bind
  // may name more than one key, and a modifier's name is never one of ours.
  // Only a record that has its key number may come without any text.
  var text = _trim(record.key)
  if (record.keycode === 0 || text !== "") {
    var parts = text.split("+")
    for (var i = 0; i < parts.length; i++) {
      verdict = Math.max(verdict, _weighPart(_trim(parts[i]), key, plainUs))
    }
  }
  // A bind inside a submap acts only while that submap is entered. Whether
  // it gets in our way cannot be said from here.
  if (record.submap !== "" && verdict !== _NONE) return _UNKNOWN
  return verdict
}

function _isText(value) {
  return typeof value === "string" && value.length <= _TEXT_CHARS
}

// A record as parseBinds() makes it, read once into a new object, or null.
// What is judged afterwards is the copy, so no value can differ between the
// check and its use.
function _copy(record) {
  if (record === null || typeof record !== "object") return null
  var copy = {
    modmask: record.modmask,
    submap: record.submap,
    key: record.key,
    keycode: record.keycode,
    catchall: record.catchall,
    description: record.description,
    dispatcher: record.dispatcher,
    ignoreMods: record.ignoreMods
  }
  if (!_isCount(copy.modmask) || !_isCount(copy.keycode)) return null
  if (typeof copy.key !== "string" || copy.key.length > _KEY_CHARS) return null
  if (!_isText(copy.submap) || !_isText(copy.description) || !_isText(copy.dispatcher)) return null
  if (typeof copy.catchall !== "boolean" || typeof copy.ignoreMods !== "boolean") return null
  return copy
}

// A list of records as parseBinds() returns it, copied, or null. An empty
// list is a desktop without binds. A read that failed is no list at all:
// parseBinds() hands out null for it.
function _copyList(records) {
  if (!Array.isArray(records)) return null
  var count = records.length
  if (!_isCount(count) || count > _MAX_RECORDS) return null
  var list = []
  for (var n = 0; n < count; n++) {
    var copy = _copy(records[n])
    if (copy === null) return null
    list.push(copy)
  }
  return list
}

// The combination exactly as parse() returns it, read again from its text,
// so that a changed mask or key cannot be judged under another one's name.
function _checked(parsed) {
  if (parsed === null || typeof parsed !== "object") return null
  var given = { canonical: parsed.canonical, mask: parsed.mask, key: parsed.key, alias: parsed.alias }
  var fresh = parse(given.canonical)
  if (fresh === null) return null
  if (given.mask !== fresh.mask || given.key !== fresh.key || given.alias !== fresh.alias) return null
  return fresh
}

// True for a bind this plugin can have made for the action: made at
// runtime, under the action's description, on exactly these modifiers and
// on the key by its plain name. A bind made at runtime has no handle we
// could keep, and a removal reaches a bind through that one spelling only.
// A bind with our description on the same key in any other form (with Caps
// Lock, by key number, under a second name) was not made here, cannot be
// removed from here, and counts as somebody else's.
function _isOurs(record, combo, row) {
  return record.dispatcher === "__lua" && record.description === row.description
    && !record.ignoreMods && record.modmask === combo.mask && record.keycode === 0
    && record.key === combo.key
}

function _verdict(cls, by) {
  return { cls: cls, by: by }
}

function _survey(records, layout, name, parsed) {
  var row = _row(name)
  var combo = _checked(parsed)
  var list = _copyList(records)
  if (row === null || combo === null || list === null) return _verdict("unknown", "")
  var plainUs = layout !== null && typeof layout === "object" && layout.plainUs === true
  var ours = 0
  var theirs = 0
  var unsure = false
  var by = ""
  for (var n = 0; n < list.length; n++) {
    var record = list[n]
    if (!record.ignoreMods && _withoutCaps(record.modmask) !== combo.mask) continue
    var weight = _weigh(record, combo.key, plainUs)
    if (weight === _UNKNOWN) unsure = true
    if (weight !== _TAKEN) continue
    if (_isOurs(record, combo, row)) {
      ours++
      continue
    }
    if (theirs === 0) by = Clean.text(record.description, _SHOWN_CHARS)
    theirs++
  }
  if (theirs > 0) return _verdict(ours > 0 ? "shared" : "foreign", by)
  // "ours" and "duplicate" allow a removal, so they are said only when
  // nothing on these modifiers is left unexplained.
  if (unsure) return _verdict("unknown", "")
  if (ours === 0) return _verdict("free", "")
  return _verdict(ours === 1 ? "ours" : "duplicate", "")
}

// The same, for arguments that cannot even be read (an object that fails
// when one of its members is asked for): nothing is known then.
function _surveyAny(records, layout, name, parsed) {
  try {
    return _survey(records, layout, name, parsed)
  } catch (error) {
    return _verdict("unknown", "")
  }
}

// Says how a combination stands in a list of binds, for one action:
//   "free"       nobody has it, and nothing is unexplained
//   "ours"       exactly one bind, made at runtime for this action
//   "duplicate"  several binds, all of them ours
//   "foreign"    one or more binds, none ours
//   "shared"     ours and somebody else's
//   "unknown"    cannot be confirmed either way
// Only "free" allows a bind, only "ours" and "duplicate" a removal. A list
// that could not be read, a bind on a key we cannot name and every argument
// of the wrong kind answer "unknown".
function classify(records, layout, name, parsed) {
  return _surveyAny(records, layout, name, parsed).cls
}

// The description of the first bind on the combination that is not ours,
// cleaned for display, or "".
function takenBy(records, layout, name, parsed) {
  return _surveyAny(records, layout, name, parsed).by
}

// The combination of a record that is a plain bind on a key the grammar
// has, or "".
function _comboOf(record) {
  if (record.catchall || record.ignoreMods || record.submap !== "" || record.keycode !== 0) return ""
  var rest = _withoutCaps(record.modmask)
  var text = ""
  for (var i = 0; i < _MODS.length; i++) {
    if (!_hasBit(rest, _BITS[i])) continue
    text += _MODS[i] + " + "
    rest -= _BITS[i]
  }
  if (rest !== 0) return ""
  var parsed = parse(text + _upper(_trim(record.key)))
  return parsed ? parsed.canonical : ""
}

function _configured(records, name) {
  var row = _row(name)
  var list = _copyList(records)
  if (row === null || list === null) return ""
  for (var n = 0; n < list.length; n++) {
    if (list[n].description !== row.pasted) continue
    var combo = _comboOf(list[n])
    if (combo !== "") return combo
  }
  return ""
}

// Where the user bound an action in their own configuration with the line
// from copyLine(): that bind's combination, or "".
function findConfigured(records, name) {
  try {
    return _configured(records, name)
  } catch (error) {
    return ""
  }
}

// How many combinations findRuntime() names at most.
var _MAX_FOUND = 8

function _runtime(records, name) {
  var row = _row(name)
  var list = _copyList(records)
  var found = []
  if (row === null || list === null) return found
  for (var n = 0; n < list.length && found.length < _MAX_FOUND; n++) {
    var combo = parse(_comboOf(list[n]))
    if (combo === null || !_isOurs(list[n], combo, row)) continue
    if (found.indexOf(combo.canonical) === -1) found.push(combo.canonical)
  }
  return found
}

// Where the list shows binds made at runtime for an action: their
// combinations, each once, the first few. A bind can be left behind on a
// combination nobody remembers (the shell ended between the bind and the
// note of it), and the list is the only place that still knows. These are
// places to look at, not verdicts: whether a bind there may be removed is
// for classify() to say.
function findRuntime(records, name) {
  try {
    return _runtime(records, name)
  } catch (error) {
    return []
  }
}

// The first combination proposed for an action that is free, or "".
function propose(records, layout, name) {
  var row = _row(name)
  if (row === null) return ""
  for (var n = 0; n < row.proposals.length; n++) {
    var parsed = parse(row.proposals[n])
    if (parsed !== null && classify(records, layout, name, parsed) === "free") return parsed.canonical
  }
  return ""
}

if (typeof module !== "undefined") {
  module.exports = {
    ACTIONS: ACTIONS,
    LAYOUT_OPTIONS: LAYOUT_OPTIONS,
    action: action,
    command: command,
    parse: parse,
    fromQt: fromQt,
    copyLine: copyLine,
    parseBinds: parseBinds,
    layoutFacts: layoutFacts,
    classify: classify,
    takenBy: takenBy,
    findConfigured: findConfigured,
    findRuntime: findRuntime,
    propose: propose
  }
}
