"use strict"
// Builds tests/fixtures/binds.txt: a made-up answer of `hyprctl binds`, in
// the plain-text shape the compositor prints, for the tests of
// lib/KeyCombo.js. Run `node tests/gen-binds.js` to write the file again.
// The test compares the file with what build() returns, so the two cannot
// drift apart.
//
// Everything in it is invented. No line comes from anybody's desktop: the
// keys were picked to give every kind of record a place, and every
// description is "Placeholder N", empty, or one of OmaJuke's own constants.
//
// Two kinds of record are in it, as on a real desktop. A bind from the
// scripted configuration has the dispatcher "__lua" and a running number as
// its argument; when its key is given by number, the listing shows the
// whole key text as it was written. A bind from the older configuration
// style has a named dispatcher with its argument, and an empty key when it
// is a catch-all or was written for several keys at once.
//
// What the listing holds, by modifier mask (SHIFT 1, CAPS 2, CTRL 4, ALT 8,
// MOD2 16, SUPER 64). The tests rely on this map:
//
//    0  hardware keys with the locked, repeat, release and other flags,
//       a press and release pair, a bare key number, two switches
//   64  named keys in every spelling, the digit row by key number, a bind
//       that names two keys by number, mouse binds, the way into a submap
//   65  the digit row by number, and a key text written without spaces
//   68  named keys only
//   69  a catch-all, so no key here that nobody names can be confirmed
//   72  the digit row and the V key by number, a combination OmaJuke shares,
//       and one bind of each of the three actions added later
//   73  the digit row by number
//   76  one bind of OmaJuke's, one doubled bind of OmaJuke's, a bind inside
//       a submap, and (as 78 and 92) the same modifiers plus Caps Lock, MOD2
//   77  the six binds a user pasted from "Copy line", and one of OmaJuke's
//   12  a function key by number, one in lower case
//    8  two different binds on one key
//    9  a key given as a numbered symbol
//    4  the second name of F11
//    5  a bind whose key text ends in a plus sign
//   13  a bind without any key
// and two submaps: "demo" in the older configuration style and "pick" in
// the scripted one, each with a catch-all.
var fs = require("fs")
var path = require("path")
var load = require("./node/load.js")

var KeyCombo = load.lib("KeyCombo")
var TARGET = path.join(__dirname, "fixtures", "binds.txt")

var SHIFT = 1
var CAPS = 2
var CTRL = 4
var ALT = 8
var MOD2 = 16
var SUPER = 64

// The header letters, in the order the compositor prints them, and the
// names later versions print on a "flags" line instead. "d" (the bind has a
// description) has no name there.
var FLAG_NAMES = {
  l: "locked", m: "mouse", r: "release", e: "repeat", n: "non_consuming", a: "auto_consuming",
  x: "allow_input_capture"
}

var DIGIT_ROW = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]

// A key text as it is written for a key given by number, for example
// "SUPER + SHIFT + code:10".
function byNumber(modmask, code) {
  var names = []
  if (modmask & SUPER) names.push("SUPER")
  if (modmask & SHIFT) names.push("SHIFT")
  if (modmask & CTRL) names.push("CTRL")
  if (modmask & ALT) names.push("ALT")
  return names.concat(["code:" + code]).join(" + ")
}

function rows() {
  var list = []
  var placeholders = 0
  var reference = 2

  // One bind. Unless told otherwise it is a described bind made from the
  // scripted configuration.
  function add(modmask, key, options) {
    var o = options || {}
    var flags = o.flags === undefined ? "d" : o.flags
    var description = ""
    if (o.description !== undefined) description = o.description
    else if (flags.indexOf("d") !== -1) description = "Placeholder " + (++placeholders)
    var dispatcher = o.dispatcher || "__lua"
    list.push({
      flags: flags,
      modmask: modmask,
      submap: o.submap || "",
      key: key,
      catchall: o.catchall === true,
      description: description,
      dispatcher: dispatcher,
      arg: dispatcher === "__lua" ? String(++reference) : o.arg || ""
    })
  }

  function each(modmask, keys, options) {
    keys.forEach(function(key) { add(modmask, key, options) })
  }

  function digitRow(modmask) {
    DIGIT_ROW.forEach(function(code) { add(modmask, byNumber(modmask, code)) })
  }

  // ---- No modifier: hardware keys ----
  each(0, [
    "XF86AudioRaiseVolume", "XF86AudioLowerVolume", "XF86MonBrightnessUp", "XF86MonBrightnessDown",
    "XF86KbdBrightnessUp", "XF86KbdBrightnessDown"
  ], { flags: "led" })
  each(0, [
    "XF86AudioMute", "XF86AudioMicMute", "XF86AudioPlay", "XF86AudioPause", "XF86AudioNext", "XF86AudioPrev",
    "XF86AudioStop", "XF86AudioForward", "XF86AudioRewind"
  ], { flags: "ld" })
  each(0, [
    "XF86Calculator", "XF86Mail", "XF86Search", "XF86Tools", "XF86Display", "XF86WLAN", "XF86Bluetooth",
    "XF86TouchpadToggle", "Print", "F10"
  ])
  // One key bound twice: on press and on release.
  add(0, "Pause")
  add(0, "Pause", { flags: "rd" })
  add(0, "XF86PowerOff", { flags: "lrd" })
  add(0, "XF86Sleep", { flags: "nd" })
  add(0, "XF86ScreenSaver", { flags: "ad" })
  add(0, "XF86Launch1", { flags: "dx" })
  add(0, byNumber(0, 148))
  each(0, ["switch:on:Example Switch", "switch:off:Example Switch"], { flags: "ld" })
  add(SHIFT, "Print")
  each(SHIFT, ["XF86AudioRaiseVolume", "XF86AudioLowerVolume"], { flags: "led" })

  // ---- SUPER ----
  each(SUPER, ["B", "D", "E", "H", "I", "M", "N", "Q", "U", "Y", "t"])
  each(SUPER, [
    "Return", "space", "Tab", "Escape", "BackSpace", "Left", "Right", "Up", "Down", "comma", "period",
    "slash", "Home", "End", "Prior", "Next", "minus", "equal", "bracketleft", "bracketright", "semicolon",
    "apostrophe"
  ])
  digitRow(SUPER)
  add(SUPER, "G")
  add(SUPER, "G", { flags: "rd" })
  // Two keys in one bind: the A and S keys of a US keyboard.
  add(SUPER, "SUPER + code:38 + code:39")
  each(SUPER, ["mouse:272", "mouse:273", "mouse_down", "mouse_up"])
  // The older style: a mouse bind, and the way into a submap.
  add(SUPER, "mouse:272", { flags: "m", dispatcher: "mouse", arg: "movewindow" })
  add(SUPER, "mouse:273", { flags: "m", dispatcher: "mouse", arg: "resizewindow" })
  add(SUPER, "R", { flags: "", dispatcher: "submap", arg: "demo" })

  // ---- SUPER + SHIFT ----
  each(SUPER + SHIFT, ["H", "K", "L", "Q", "R", "T", "U"])
  each(SUPER + SHIFT, ["Return", "Left", "Right", "Up", "Down", "Tab", "Print", "space"])
  digitRow(SUPER + SHIFT)
  // Written without spaces, which the compositor accepts: the B key.
  add(SUPER + SHIFT, "SUPER+SHIFT+code:56")
  // A key that is neither a letter nor a function key on a US keyboard.
  add(SUPER + SHIFT, byNumber(SUPER + SHIFT, 250))

  // ---- SUPER + CTRL, with and without SHIFT ----
  each(SUPER + CTRL, ["B", "E", "G", "I", "M", "U", "X", "Y"])
  each(SUPER + CTRL, ["Left", "Right", "Up", "Down", "Delete", "Home", "End", "space"])
  each(SUPER + CTRL + SHIFT, ["E", "Q", "Left", "Right"])

  // ---- SUPER + ALT, with and without SHIFT ----
  each(SUPER + ALT, ["B", "D", "H", "N", "T", "W", "O"])
  each(SUPER + ALT, ["Left", "Right", "Up", "Down", "Tab", "Return"])
  digitRow(SUPER + ALT)
  // The V key of a US keyboard.
  add(SUPER + ALT, byNumber(SUPER + ALT, 55))
  each(SUPER + ALT + SHIFT, ["C", "H", "U"])
  each(SUPER + ALT + SHIFT, ["Left", "Right", "Up", "Down", "Tab", "Return", "space", "comma", "period"])
  digitRow(SUPER + ALT + SHIFT)

  // ---- SUPER + CTRL + ALT ----
  each(SUPER + CTRL + ALT, ["J", "Insert", "E", "N", "X"])
  add(SUPER + CTRL + ALT + CAPS, "Q")
  add(SUPER + CTRL + ALT + MOD2, "C")
  // What "Copy line" leaves in a user's own configuration.
  KeyCombo.ACTIONS.forEach(function(name, i) {
    var pasted = KeyCombo.action(name).configDescription
    add(SUPER + CTRL + ALT + SHIFT, ["J", "V", "O", "K", "N", "B"][i], { description: pasted })
  })

  // ---- The smaller groups ----
  each(CTRL + ALT, ["Escape", "BackSpace", "F1", "f4"])
  // The F2 key, which has this number on every layout.
  add(CTRL + ALT, byNumber(CTRL + ALT, 68))
  each(ALT, ["grave", "grave", "F4", "space", "Print"])
  add(ALT + SHIFT, "grave")
  // The letter V as a numbered symbol.
  add(ALT + SHIFT, "U0056")
  // L1 is a second name of F11.
  each(CTRL, ["L1", "Insert", "grave", "Print"])
  add(CTRL + SHIFT, "Escape")
  // A broken key text: modifiers and no key. The compositor accepts it and
  // lists the text as it was written.
  add(CTRL + SHIFT, "CTRL + SHIFT +", { flags: "" })
  add(CTRL + ALT + SHIFT, "Insert")
  // The older style, written for several keys at once: listed without any.
  add(CTRL + ALT + SHIFT, "", { flags: "", dispatcher: "exec", arg: "placeholder-command" })

  // ---- A submap in the older configuration style ----
  var demo = { flags: "e", submap: "demo", dispatcher: "resizeactive" }
  add(0, "H", Object.assign({ arg: "-40 0" }, demo))
  add(0, "J", Object.assign({ arg: "0 40" }, demo))
  add(0, "K", Object.assign({ arg: "0 -40" }, demo))
  add(0, "L", Object.assign({ arg: "40 0" }, demo))
  each(0, ["Escape", "Return"], { flags: "", submap: "demo", dispatcher: "submap", arg: "reset" })
  // Its catch-alls have no key text, with or without modifiers.
  add(0, "", { flags: "", submap: "demo", catchall: true, dispatcher: "submap", arg: "reset" })
  add(SUPER + CTRL + SHIFT, "", {
    flags: "", submap: "demo", catchall: true, dispatcher: "submap", arg: "reset"
  })
  add(SUPER + CTRL + ALT, "K", { flags: "", submap: "demo", dispatcher: "exec", arg: "placeholder-command" })

  // ---- A submap in the scripted style ----
  each(0, ["J", "K"], { submap: "pick" })
  add(0, "Escape", { flags: "", submap: "pick" })
  // Its catch-all is listed under the word it was written with.
  add(0, "catchall", { flags: "", submap: "pick", catchall: true })

  // ---- OmaJuke's own binds, made at runtime and therefore last ----
  var panel = KeyCombo.action("panel").description
  var video = KeyCombo.action("video").description
  var output = KeyCombo.action("output").description
  add(SUPER + CTRL + ALT + SHIFT, "P", { description: panel })
  add(SUPER + CTRL + ALT, "V", { description: video })
  // The same bind twice.
  add(SUPER + CTRL + ALT, "O", { description: output })
  add(SUPER + CTRL + ALT, "O", { description: output })
  // On a combination that somebody else has as well.
  add(SUPER + ALT, "O", { description: output })
  // The actions added later, each once.
  add(SUPER + ALT, "K", { description: KeyCombo.action("playPause").description })
  add(SUPER + ALT, "N", { description: KeyCombo.action("next").description })
  add(SUPER + ALT, "B", { description: KeyCombo.action("previous").description })

  return list
}

// The number of the last key a bind names by number, or 0.
function lastKeyNumber(key) {
  var match = /code:([0-9]+)$/.exec(key)
  return match ? Number(match[1]) : 0
}

function field(name, value) {
  return "\t" + name + ": " + value + "\n"
}

// One record. "letters" is the current format: the flags are letters on the
// header line and the key number is never filled in. "flags" is the format
// of later versions: a bare header, a line of flag names, and the number of
// a key that was given by number.
function record(row, style) {
  var text = "bind"
  if (style === "flags") {
    var names = row.flags.split("").filter(function(letter) { return letter !== "d" })
      .map(function(letter) { return FLAG_NAMES[letter] })
    if (row.catchall) names.push("catch_all")
    text += "\n" + field("flags", names.join(", "))
  } else {
    text += row.flags + "\n"
  }
  return text
    + field("modmask", row.modmask)
    + field("submap", row.submap)
    + field("key", row.key)
    + field("keycode", style === "flags" ? lastKeyNumber(row.key) : 0)
    + field("catchall", row.catchall)
    + field("description", row.description)
    + field("dispatcher", row.dispatcher)
    + field("arg", row.arg)
    + "\n"
}

// The whole listing as the tool prints it: every record ends with an empty
// line, and the tool adds one more line break after the reply.
function build(style) {
  return rows().map(function(row) { return record(row, style || "letters") }).join("") + "\n"
}

if (require.main === module) {
  fs.writeFileSync(TARGET, build())
}

module.exports = { build: build }
