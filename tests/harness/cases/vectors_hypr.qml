import QtQuick
import "../../../lib/Geometry.js" as Geometry
import "../../../lib/Lua.js" as Lua
import "../../vectors/geometry.js" as GeometryVectors
import "../../vectors/lua.js" as LuaVectors

// Runs the vector tables of Lua and Geometry in Qt's JavaScript engine, the
// one the plugin really runs on, and then checks there what a table cannot
// hold: that every line the three templates can return passes the gate,
// over the whole of what may fill them; that a line stops passing with any
// single character changed; and that what Geometry answers is always
// something the rule template takes.
QtObject {
  id: root

  property string kind: "component"

  readonly property var modifiers: ["MOD4", "CONTROL", "MOD1", "SHIFT"]
  readonly property var actions: ["panel", "video", "output", "playPause", "next", "previous"]
  readonly property var corners: ["top-left", "top-right", "bottom-left", "bottom-right"]
  readonly property var margins: [0, 1, 5, 9, 10, 30, 99, 100, 999, 1000, 1999, 2000]

  function keys() {
    var list = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
    for (var f = 1; f <= 12; f++) list.push("F" + f)
    return list
  }

  // Every combination the grammar can spell. One is usable when it holds
  // more than the key itself, or the key and Shift: such a key could no
  // longer be typed.
  function sweepCombinations(h) {
    var keys = root.keys()
    var wrong = { bind: 0, unbind: 0, typed: 0 }
    var usable = 0
    for (var mask = 0; mask < 16; mask++) {
      var held = root.modifiers.filter(function(name, bit) { return (mask & (1 << bit)) !== 0 })
      var ok = (mask & 7) !== 0
      for (var k = 0; k < keys.length; k++) {
        var alias = held.concat([keys[k]]).join(" + ")
        var removal = Lua.unbind(alias)
        if (ok) usable++
        if (ok !== (removal !== "" && Lua.check(removal))) wrong.unbind++
        if (!ok && Lua.check("hl.unbind(\"" + alias + "\")")) wrong.typed++
        for (var a = 0; a < root.actions.length; a++) {
          var line = Lua.bind(alias, root.actions[a])
          if (ok !== (line !== "" && Lua.check(line))) wrong.bind++
        }
      }
    }
    h.equal(usable, 532, "the grammar spells 532 usable combinations")
    h.equal(wrong.bind, 0, "every bind line of a usable combination passes, and no other is made")
    h.equal(wrong.unbind, 0, "the same for every removal")
    h.equal(wrong.typed, 0, "a removal written by hand for a key that can be typed does not pass")
  }

  // Every width, corner and a spread of margins: the line is made, passes,
  // and stays short.
  function sweepRules(h) {
    var wrong = 0
    var longest = 0
    var made = 0
    for (var pct = 10; pct <= 90; pct++) {
      for (var c = 0; c < root.corners.length; c++) {
        for (var x = 0; x < root.margins.length; x++) {
          for (var y = 0; y < root.margins.length; y++) {
            var line = Lua.rule({ pct: pct, corner: root.corners[c], marginX: root.margins[x],
              marginY: root.margins[y] })
            made++
            if (line === "" || !Lua.check(line)) wrong++
            if (line.length > longest) longest = line.length
          }
        }
      }
    }
    h.equal(made, 46656, "rules: every width in every corner, twelve margins each way")
    h.equal(wrong, 0, "rules: each of them is made and passes")
    h.check(longest > 400 && longest <= 456, "rules: the longest line stays far below the cap")
    h.equal(Lua.rule({ pct: 9, corner: "top-left", marginX: 0, marginY: 0 }), "", "rules: too narrow")
    h.equal(Lua.rule({ pct: 25, corner: "middle", marginX: 0, marginY: 0 }), "", "rules: no such corner")
    h.equal(Lua.rule({ pct: 25, corner: "top-left", marginX: 2001, marginY: 0 }), "", "rules: too far out")
  }

  // One line of each kind with each of its characters replaced, removed or
  // doubled: nothing so close to a real line passes unless it is one.
  function sweepEdits(h) {
    var lines = [
      Lua.rule({ pct: 25, corner: "bottom-right", marginX: 5, marginY: 5 }),
      Lua.bind("MOD4 + CONTROL + V", "video"),
      Lua.unbind("MOD4 + SHIFT + F5")
    ]
    // The last one is a letter outside ASCII.
    var swaps = ["\"", ")", " ", "0", "a", ";", "-", "\n", String.fromCharCode(233)]
    var passed = 0
    var tried = 0
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l]
      var known = {}
      for (var i = 0; i < line.length; i++) {
        var edits = [line.slice(0, i) + line.slice(i + 1), line.slice(0, i) + line.charAt(i) + line.slice(i)]
        for (var s = 0; s < swaps.length; s++) edits.push(line.slice(0, i) + swaps[s] + line.slice(i + 1))
        for (var e = 0; e < edits.length; e++) {
          var edited = edits[e]
          if (edited === line || known[edited] === true) continue
          known[edited] = true
          tried++
          if (Lua.check(edited) && !root.isTemplate(edited)) passed++
        }
      }
    }
    h.check(tried > 5000, "edits: several thousand near misses were tried")
    h.equal(passed, 0, "edits: none of them passes unless it is itself a line of a template")
  }

  // True when some input makes a template return exactly this text. An
  // edit can land on another valid line (one digit of a margin, say); that
  // is no hole.
  function isTemplate(text) {
    var said = "(open panel|show or hide video|next audio output)"
    var bind = new RegExp("^hl\\.bind\\(\"([A-Z0-9 +]+)\", .*\"OmaJuke: " + said + "\" \\}\\)$").exec(text)
    var names = { "open panel": "panel", "show or hide video": "video", "next audio output": "output" }
    if (bind !== null) return Lua.bind(bind[1], names[bind[2]]) === text
    var unbind = /^hl\.unbind\("([A-Z0-9 +]+)"\)$/.exec(text)
    if (unbind !== null) return Lua.unbind(unbind[1]) === text
    var rule = /^if \S+ ~= "([0-9]+)-(tl|tr|bl|br)-([0-9]+)-([0-9]+)" then /.exec(text)
    if (rule === null) return false
    var corner = root.corners[["tl", "tr", "bl", "br"].indexOf(rule[2])]
    var again = Lua.rule({ pct: Number(rule[1]), corner: corner, marginX: Number(rule[3]),
      marginY: Number(rule[4]) })
    return again === text
  }

  // What Geometry works out for a monitor is what the rule template takes,
  // and a window placed by that rule reads back as the same corner and
  // width.
  function roundTrips(h) {
    var sizes = [{ name: "sixth", pct: 17 }, { name: "quarter", pct: 25 }, { name: "third", pct: 33 },
      { name: "half", pct: 50 }]
    var monitors = [{ name: "DP-1", x: 0, y: 0, width: 1920, height: 1080, scale: 1, transform: 0,
      focused: true, reserved: [0, 30, 0, 0] }]
    var wrong = 0
    for (var s = 0; s < sizes.length; s++) {
      for (var c = 0; c < root.corners.length; c++) {
        var placed = Geometry.placement(monitors, { css: "5 5 5 5" },
          { videoSize: sizes[s].name, videoCorner: root.corners[c] }, null)
        var line = placed.ok ? Lua.rule(placed) : ""
        if (line === "" || !Lua.check(line) || placed.pct !== sizes[s].pct) { wrong++; continue }
        var width = Math.round(1920 * placed.pct / 100)
        var height = Math.round(width * 9 / 16)
        var left = root.corners[c].indexOf("left") !== -1
        var top = root.corners[c].indexOf("top") !== -1
        var win = { at: [left ? placed.marginX : 1920 - width - placed.marginX,
          top ? placed.marginY : 1080 - height - placed.marginY], size: [width, height], floating: true }
        var read = Geometry.fromWindow(win, monitors)
        var same = read.ok && read.name === "DP-1" && read.corner === root.corners[c]
          && read.widthPct === placed.pct
        if (!same) wrong++
      }
    }
    h.equal(wrong, 0, "each size in each corner makes a rule, and reads back from the window it places")
    var remembered = { "DP-1": { corner: "top-left", widthPct: 40 } }
    var kept = Geometry.placement(monitors, { css: "5 5 5 5" },
      { videoSize: "quarter", videoCorner: "bottom-right" }, remembered)
    h.equal(kept, { ok: true, pct: 40, corner: "top-left", marginX: 5, marginY: 35 },
      "what was remembered for the monitor wins, and the bar's height is in the margin")
    h.equal(Geometry.placement([], { css: "5" }, { videoSize: "quarter", videoCorner: "top-left" }, null),
      { ok: false }, "no monitor, no placement")
  }

  function run(h) {
    h.vectors(Lua, LuaVectors)
    h.vectors(Geometry, GeometryVectors)
    root.sweepCombinations(h)
    root.sweepRules(h)
    root.sweepEdits(h)
    root.roundTrips(h)
    h.finish()
  }
}
