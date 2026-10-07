import QtQuick

// core/Shortcuts.qml when the user records another combination for an
// action that already has a working shortcut, and the new one cannot be
// had: somebody else has it, nothing confirms that it is free, or the
// compositor refuses the line.
//
// Changing a shortcut must not cost the old one. The bind that worked
// stays in the compositor, the saved wish goes back to it, and the row
// shows it with the reason why the other combination was not taken. No
// removal is sent in any of these.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var parts: null
  property var steps: []
  property int at: 0

  readonly property string v1: "SUPER + CTRL + ALT + V"
  readonly property string v2: "SUPER + ALT + V"
  readonly property string o2: "SUPER + ALT + O"
  readonly property string notAssigned: " was not assigned. "
  readonly property string unconfirmed: "Cannot confirm that this key is free"
  readonly property string shared: "Also bound elsewhere. Reload Hyprland to clear OmaJuke's copy"
  readonly property string refused: "Hyprland refused the request"

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/ShortcutParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.steps = [
      root.working, root.taken, root.unconfirmedKey, root.refusedLine, root.racedAfter, root.stillChanges,
      root.everyLine
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function wishes(panel, video, output, dirty) {
    return {
      panel: panel, video: video, output: output, playPause: "", next: "", previous: "", dirty: dirty,
      asked: false
    }
  }

  function removals() {
    return root.parts.lines().filter(function(line) { return /^hl\.unbind\(/.test(line) })
  }

  function options(layout) {
    return {
      "general:gaps_out": { css: "5 5 5 5" }, "input:kb_layout": { str: layout },
      "input:kb_variant": { str: "[[EMPTY]]" }, "input:resolve_binds_by_sym": { bool: false, set: false },
      "input:kb_file": { str: "[[EMPTY]]" }
    }
  }

  // What every step starts from: the video shortcut works on its first
  // combination, the output shortcut on its second.
  function working() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2)])
    parts.save(root.wishes("", root.v1, root.o2, false))
    parts.keys.refresh()
    parts.settled(function() {
      h.equal([parts.shown("video"), parts.shown("output")],
        [["assigned", root.v1, ""], ["assigned", root.o2, ""]], "working: two shortcuts")
      h.equal(parts.lines(), [], "working: found as they are")
      root.next()
    })
  }

  // The new combination is somebody else's.
  function taken() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2),
      parts.theirs(root.v2, "Placeholder 20")])
    h.equal(parts.keys.assign("video", root.v2), true, "taken: the wish is taken")
    parts.settled(function() {
      h.equal(parts.lines(), [], "taken: no line is sent, least of all a removal")
      h.equal(parts.table().indexOf(parts.listed("video", root.v1)) !== -1, true,
        "taken: the old bind is still in the compositor")
      h.equal(parts.shown("video"),
        ["assigned", root.v1, root.v2 + root.notAssigned + "Now used by: Placeholder 20"],
        "taken: the row shows the shortcut that still works, and why the other was not taken")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false),
        "taken: the saved wish is the old combination again, and nothing is under way")
      parts.keys.refresh()
      parts.settled(function() {
        h.equal([parts.shown("video"), parts.lines()], [["assigned", root.v1, ""], []],
          "taken: a later pass finds the old shortcut and leaves it alone")
        root.next()
      })
    })
  }

  // Nothing can say whether the new combination is free: on this keyboard
  // a bind given by key number may be the same key.
  function unconfirmedKey() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2),
      { modmask: 72, key: "code:55", description: "Placeholder 21" }])
    parts.patchStub({ options: root.options("de") })
    parts.keys.assign("video", root.v2)
    parts.settled(function() {
      h.equal(parts.lines(), [], "unconfirmed: no line is sent")
      h.equal(parts.shown("video"), ["assigned", root.v1, root.v2 + root.notAssigned + root.unconfirmed],
        "unconfirmed: the old shortcut is kept, with the reason")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "unconfirmed: and is the wish again")
      parts.patchStub({ options: root.options("us") })
      root.next()
    })
  }

  // The combination is free, and the compositor refuses the line.
  function refusedLine() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2)])
    h.scenario({ hyprctl: "refuse" })
    parts.keys.assign("video", root.v2)
    parts.settled(function() {
      h.equal(parts.lines(), [parts.bindLine("video", root.v2)], "refused: the bind was sent, once")
      h.equal(root.removals(), [], "refused: and the old bind was not removed after it")
      h.equal(parts.table(), [parts.listed("output", root.o2), parts.listed("video", root.v1)].sort(),
        "refused: the compositor holds what it held")
      h.equal(parts.shown("video"), ["assigned", root.v1, root.v2 + root.notAssigned + root.refused],
        "refused: the old shortcut is kept, with the reason")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, true),
        "refused: the wish is the old one, and the change stays unconfirmed")
      h.scenario({ hyprctl: "ok" })
      parts.keys.refresh()
      parts.settled(function() {
        h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "refused: a later pass confirms")
        h.equal(root.removals(), [], "refused: and removes nothing")
        root.next()
      })
    })
  }

  // Somebody binds the new combination right after ours. That bind of ours
  // stays, as every bind of ours beside somebody else's does, and the old
  // shortcut is the one that is kept.
  function racedAfter() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2)])
    parts.patchStub({ appear: [{ at: 3, bind: parts.theirs(root.v2, "Placeholder 22") }], listings: 0 })
    parts.keys.assign("video", root.v2)
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.bindLine("video", root.v2)],
        "raced after: the bind was sent, and nothing after it")
      h.equal(parts.shown("video"), ["assigned", root.v1, root.v2 + root.notAssigned + root.shared],
        "raced after: the old shortcut is kept, and the row says how to clear the other bind")
      h.equal(parts.saved().video, root.v1, "raced after: the wish is the old combination")
      root.next()
    })
  }

  // And a change that can be had still is one: the new bind is made, then
  // the old one is removed.
  function stillChanges() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2)])
    parts.keys.assign("video", root.v2)
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.bindLine("video", root.v2), parts.unbindLine(root.v1)],
        "still changes: the new combination is bound, then the old one is removed")
      h.equal(parts.shown("video"), ["assigned", root.v2, ""], "still changes: the row shows the new one")
      h.equal(parts.saved(), root.wishes("", root.v2, root.o2, false), "still changes: saved and confirmed")
      root.next()
    })
  }

  function everyLine() {
    root.h.equal(root.parts.strays(), 0,
      "every line was a bind or a removal under the registered spelling, between two readings of the list")
    root.h.finish()
  }
}
