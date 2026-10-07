import QtQuick
import "../../../lib/KeyCombo.js" as KeyCombo
import "../../../lib/Lua.js" as Lua
import "../../vectors/keycombo.js" as KeyComboVectors

// Runs the vector table of KeyCombo in Qt's JavaScript engine, the one the
// plugin really runs on. The node tests run the same table on another
// engine, and the two differ where it matters here (regular expressions,
// string methods), so the reader of the compositor's list of binds and the
// rule that says whose a combination is count as proven only when the
// table passes here as well.
//
// After the table comes what a table cannot hold: the whole grammar against
// the templates of the lines that are sent, a bind made from such a line
// read back from a list, and the made-up list of a whole desktop.
QtObject {
  id: root

  property string kind: "component"

  readonly property var modifiers: ["SUPER", "CTRL", "ALT", "SHIFT"]
  readonly property var bits: [64, 4, 8, 1]
  readonly property var us: ({ plainUs: true })

  function keys() {
    var list = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
    for (var f = 1; f <= 12; f++) list.push("F" + f)
    return list
  }

  // One record of a list, the way the compositor prints a bind that a line
  // of ours made.
  function printed(mask, key, description) {
    return "bindd\n\tmodmask: " + mask + "\n\tsubmap: \n\tkey: " + key + "\n\tkeycode: 0\n\tcatchall: false\n"
      + "\tdescription: " + description + "\n\tdispatcher: __lua\n\targ: 7\n\n"
  }

  // Every combination that can be written: read by the grammar exactly when
  // a held key other than Shift is part of it, and then its spelling for
  // the compositor is one both line templates take. A bind made from that
  // line and printed in a list is ours, on that combination and for that
  // action only.
  function sweep(h) {
    var keys = root.keys()
    var wrong = { parse: 0, lines: 0, ours: 0, found: 0, other: 0, pasted: 0 }
    var usable = 0
    for (var mask = 0; mask < 16; mask++) {
      var held = root.modifiers.filter(function(name, bit) { return (mask & (1 << bit)) !== 0 })
      var sum = 0
      for (var b = 0; b < 4; b++) sum += (mask & (1 << b)) !== 0 ? root.bits[b] : 0
      var ok = (mask & 7) !== 0
      for (var k = 0; k < keys.length; k++) {
        var text = held.concat([keys[k]]).join(" + ")
        var parsed = KeyCombo.parse(text)
        if (ok !== (parsed !== null)) wrong.parse++
        if (parsed === null) continue
        usable++
        if (parsed.canonical !== text || parsed.mask !== sum || parsed.key !== keys[k]) wrong.parse++
        var removal = Lua.unbind(parsed.alias)
        if (removal === "" || !Lua.check(removal)) wrong.lines++
        for (var a = 0; a < KeyCombo.ACTIONS.length; a++) {
          var action = KeyCombo.ACTIONS[a]
          var texts = KeyCombo.action(action)
          var line = Lua.bind(parsed.alias, action)
          var built = "hl.bind(\"" + parsed.alias + "\", hl.dsp.exec_cmd(\"" + KeyCombo.command(action)
            + "\"), { description = \"" + texts.description + "\" })"
          if (line !== built || !Lua.check(line)) wrong.lines++
          var list = KeyCombo.parseBinds(root.printed(sum, keys[k], texts.description) + "\n")
          if (!list.ok || KeyCombo.classify(list.records, root.us, action, parsed) !== "ours") wrong.ours++
          var found = KeyCombo.findRuntime(list.records, action)
          if (found.length !== 1 || found[0] !== text) wrong.found++
          var next = KeyCombo.ACTIONS[(a + 1) % KeyCombo.ACTIONS.length]
          if (KeyCombo.classify(list.records, root.us, next, parsed) !== "foreign") wrong.other++
          if (KeyCombo.findRuntime(list.records, next).length !== 0) wrong.other++
          var mine = KeyCombo.parseBinds(root.printed(sum, keys[k], texts.configDescription) + "\n")
          if (KeyCombo.classify(mine.records, root.us, action, parsed) !== "foreign") wrong.pasted++
          if (KeyCombo.findConfigured(mine.records, action) !== text) wrong.pasted++
        }
      }
    }
    h.equal(usable, 532, "the grammar reads 532 combinations")
    h.equal(wrong.parse, 0, "and reads each as what was written, and nothing else")
    h.equal(wrong.lines, 0, "every one of them makes a bind line and a removal the gate lets through")
    h.equal(wrong.ours, 0, "a bind made from that line is recognised as ours in a list")
    h.equal(wrong.found, 0, "and is found there without knowing where to look")
    h.equal(wrong.other, 0, "for the action it was made for, and for no other")
    h.equal(wrong.pasted, 0, "a bind from the pasted line is the user's, and is found as that")
  }

  // The made-up list of a whole desktop, read from its file in this engine.
  function fixture(h) {
    var text = h.readFile(h.repo + "/tests/fixtures/binds.txt")
    var list = KeyCombo.parseBinds(text)
    h.check(list.ok, "the list of a whole desktop is readable")
    h.equal(list.records.length, 237, "with all of its binds")
    h.equal(KeyCombo.parseBinds(text.slice(0, text.length - 2)), { ok: false, records: null },
      "and is not, once its end is cut off")
    var video = KeyCombo.parse("SUPER + CTRL + ALT + V")
    h.equal(KeyCombo.classify(list.records, root.us, "video", video), "ours", "our bind in it is ours")
    h.equal(KeyCombo.findRuntime(list.records, "output"), ["SUPER + CTRL + ALT + O", "SUPER + ALT + O"],
      "the binds an action has in it are found")
    h.equal(KeyCombo.findConfigured(list.records, "video"), "SUPER + CTRL + ALT + SHIFT + V",
      "and so is the bind of a pasted line")
    h.equal(KeyCombo.parseBinds("unknown request\n"), { ok: true, records: [] },
      "the compositor's line for an empty result is a desktop without binds")
    h.equal(KeyCombo.classify([], root.us, "video", video), "free", "on which the combination is free")
    h.equal(KeyCombo.parseBinds("\n"), { ok: false, records: null }, "an empty reply is no list")
    h.equal(KeyCombo.classify(KeyCombo.parseBinds("\n").records, root.us, "video", video), "unknown",
      "and proves nothing")
  }

  function texts(h) {
    var line = KeyCombo.copyLine("video", "SUPER + CTRL + ALT + V")
    h.equal(line, "o.bind(\"SUPER + CTRL + ALT + V\", \"OmaJuke video (bindings.lua)\", \"omarchy-shell -q "
      + h.manifest.id + " video toggle\")", "the line to paste names the plugin by the id of its manifest")
    h.equal(KeyCombo.command("panel"), "omarchy-shell -q " + h.manifest.id + " toggle",
      "and so does the command of a bind")
    h.equal(KeyCombo.fromQt(0x56, 0x10000000 + 0x08000000), "SUPER + ALT + V",
      "a key press becomes a combination")
    h.equal(KeyCombo.fromQt(0x56, 0x02000000), "", "a key with Shift alone becomes none")
  }

  function run(h) {
    h.vectors(KeyCombo, KeyComboVectors)
    root.sweep(h)
    root.fixture(h)
    root.texts(h)
    h.finish()
  }
}
