import QtQuick
import "../../../lib/Devices.js" as Devices
import "../../vectors/devices.js" as DevicesVectors

// Runs the vector table of Devices in Qt's JavaScript engine, the one the
// plugin really runs on. The node tests run the same table on another
// engine, and the two differ where it matters here (regular expressions,
// string methods), so the gate on device names counts as proven only when
// its table passes here as well.
//
// After the table comes what a table cannot hold: every UTF-16 unit in a
// device name, and a list that reaches the functions through a QML property.
QtObject {
  id: root

  property string kind: "component"

  // The characters a node name may hold besides letters and digits.
  readonly property string punctuation: "._:+-"

  // A list as a typed property hands it on, which need not be an array of
  // the engine any more.
  property list<var> typed: [
    { name: "auto", description: "Autoselect device" },
    { name: "pipewire/example_output.speakers", description: "Example Speakers" }
  ]

  function allowed(code) {
    if (code >= 0x30 && code <= 0x39) return true
    if (code >= 0x41 && code <= 0x5a) return true
    if (code >= 0x61 && code <= 0x7a) return true
    return code < 0x80 && root.punctuation.indexOf(String.fromCharCode(code)) !== -1
  }

  // A device name is sent to mpv as it came, so the pattern it is tested
  // against must let through exactly the characters of a node name, in this
  // engine's reading of the pattern. Each result is the number of units that
  // got a wrong answer.
  function walkUnits(h) {
    var wrong = { filter: 0, has: 0, plan: 0, next: 0 }
    for (var code = 0; code <= 0xffff; code++) {
      var name = "pipewire/a" + String.fromCharCode(code) + "b"
      var want = root.allowed(code)
      var list = [{ name: "auto" }, { name: name }]
      if ((Devices.filter(list).length === 2) !== want) wrong.filter++
      if (Devices.has(list, name) !== want) wrong.has++
      // A name that is no name is never the device to use, and never the
      // one to move on to.
      if ((Devices.plan(list, name, "auto").device === name) !== want) wrong.plan++
      if ((Devices.next(list, "auto") === name) !== want) wrong.next++
    }
    h.equal(wrong, { filter: 0, has: 0, plan: 0, next: 0 },
      "a device name holds letters, digits and five more characters, whatever unit is tried")
  }

  function checkTyped(h) {
    var seen = Array.isArray(root.typed) ? root.typed : JSON.parse(JSON.stringify(root.typed))
    h.equal(Devices.filter(seen), [
      { name: "auto", label: "System default" },
      { name: "pipewire/example_output.speakers", label: "Example Speakers" }
    ], "a list from a typed property is read once it is a plain array")
    // Whatever such a list is to the engine, a function never fails on it.
    var direct = Devices.filter(root.typed)
    h.check(Array.isArray(direct) && (direct.length === 0 || direct.length === 2),
      "handed over as it is, it is read whole or not at all")
  }

  function checkFresh(h) {
    var report = [{ name: "auto", description: "x" }, { name: "pipewire/sink", description: "A sink" }]
    var first = Devices.filter(report)
    var marked = Devices.mark(first, "pipewire/sink")
    marked[1].label = "changed"
    marked[1].current = false
    h.equal([first[1].label, report[1].description, Object.keys(first[1])],
      ["A sink", "A sink", ["name", "label"]],
      "what a function returns shares nothing with what it was given")
    h.equal(Devices.mark(first, "pipewire/sink")[1],
      { name: "pipewire/sink", label: "A sink", current: true }, "and marking twice gives the same answer")
  }

  function run(h) {
    h.vectors(Devices, DevicesVectors)
    root.walkUnits(h)
    root.checkTyped(h)
    root.checkFresh(h)
    h.finish()
  }
}
