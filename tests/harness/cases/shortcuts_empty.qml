import QtQuick

// core/Shortcuts.qml on a desktop without a single bind, which is what a
// compositor with a bare configuration is.
//
// Such a compositor cannot print an empty list: it answers the request with
// the one line it has for every empty result. That answer is a list that
// was read. A saved shortcut is bound on it as on any other desktop, at the
// start and after every reload, and a removal that leaves the list empty is
// confirmed by it.
//
// An answer that is really empty is something else, the sign of a
// compositor that went down, and still proves nothing: no line follows it.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var parts: null
  property var steps: []
  property int at: 0

  readonly property string v1: "SUPER + CTRL + ALT + V"
  readonly property string j1: "SUPER + CTRL + ALT + J"
  readonly property string o1: "SUPER + CTRL + ALT + O"
  readonly property string unconfirmed: "Cannot confirm that this key is free"
  readonly property var pass: ["configerrors", "getoption", "getoption", "getoption", "getoption", "binds"]
  readonly property var change: ["binds", "configerrors", "eval", "binds"]

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/ShortcutParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.steps = [root.atStart, root.afterReload, root.givenUp, root.emptyReply, root.everyLine]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function wishes(panel, video, output, dirty) {
    return { panel: panel, video: video, output: output, dirty: dirty }
  }

  // Every bind the stub's table holds, as "<modmask> <key> <description>".
  function table() {
    var state = root.h.stubState("hyprctl")
    var binds = state && Array.isArray(state.binds) ? state.binds : []
    return binds.map(function(bind) { return bind.modmask + " " + bind.key + " " + bind.description })
  }

  // The table without anything in it, as a reload of a bare configuration
  // leaves it.
  function bare() {
    root.parts.patchStub({ binds: [], appear: [], listings: 0 })
  }

  // A shortcut that was saved in an earlier session and confirmed there:
  // nothing is noted as under way, and the start still has to bind it.
  function atStart() {
    var h = root.h
    var parts = root.parts
    root.bare()
    parts.save(root.wishes("", root.v1, "", false))
    h.equal(parts.keys.start(), true, "start: a saved shortcut starts a pass")
    parts.settled(function() {
      h.equal(parts.requests(), ["version"].concat(root.pass).concat(root.change),
        "start: the empty list is read, read again right before the line, and once more after it")
      h.equal(parts.lines(), [parts.bindLine("video", root.v1)], "start: one bind is sent")
      h.equal(root.table(), [parts.listed("video", root.v1)], "start: and the compositor holds it")
      h.equal(parts.shown("video"), ["assigned", root.v1, ""], "start: the row says assigned")
      h.equal([parts.row("panel").proposal, parts.row("output").proposal], [root.j1, root.o1],
        "start: the other actions are offered their first choice, which nobody has")
      h.equal(parts.saved(), root.wishes("", root.v1, "", false), "start: confirmed, nothing is under way")
      root.next()
    })
  }

  // A reload takes the bind. The list is empty again and says so.
  function afterReload() {
    var h = root.h
    var parts = root.parts
    root.bare()
    parts.hypr.noteReload()
    parts.keys.compositorReloaded()
    h.waitFor(function() { return root.table().length === 1 && !parts.keys.busy }, 20000, function(met) {
      h.check(met, "reload: the bind is back")
      h.equal(parts.lines(), [parts.bindLine("video", root.v1), parts.bindLine("video", root.v1)],
        "reload: by one more line")
      h.equal(parts.shown("video"), ["assigned", root.v1, ""], "reload: the row says assigned")
      root.next()
    })
  }

  // Giving the only bind up leaves an empty list, and that list is what
  // confirms the removal.
  function givenUp() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    h.equal(parts.keys.unassign("video"), true, "given up: taken")
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.unbindLine(root.v1)], "given up: one removal")
      h.equal(root.table(), [], "given up: the compositor holds no bind")
      h.equal(parts.shown("video"), ["unassigned", "", ""], "given up: the row has no shortcut")
      h.equal(parts.row("video").proposal, root.v1, "given up: and offers the combination again")
      h.equal(parts.saved(), root.wishes("", "", "", false),
        "given up: the empty list confirmed it, so nothing is under way")
      root.next()
    })
  }

  // The tool prints nothing but its line break and ends well: a compositor
  // that went down while it was asked. That is no desktop without binds.
  function emptyReply() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    h.scenario({ hyprctl: "empty:binds" })
    h.equal(parts.keys.assign("video", root.v1), true, "empty reply: the wish is taken")
    parts.settled(function() {
      h.equal(parts.shown("video"), ["blocked", root.v1, root.unconfirmed],
        "empty reply: nothing confirms that the combination is free")
      h.equal(parts.lines().length, sent, "empty reply: no line was sent")
      h.equal(root.table(), [], "empty reply: and nothing was bound")
      h.equal(parts.saved().video, root.v1, "empty reply: the wish is kept for a later pass")
      h.scenario({ hyprctl: "ok" })
      root.next()
    })
  }

  function everyLine() {
    root.h.equal(root.parts.strays(), 0,
      "every line was a bind or a removal under the registered spelling, between two readings of the list")
    root.h.finish()
  }
}
