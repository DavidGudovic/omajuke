import QtQuick

// core/Shortcuts.qml when the service ends and when it starts again.
//
// At the end nothing can be read or waited for, so the binds are taken back
// with commands that outlive the component: one removal for each shortcut
// the last pass saw bound by us and by nobody else, under the registered
// spelling, and none at all when the last look at the gate found it shut,
// when the last list could not be read, or when a line of a running pass
// has just changed what the list said. The saved wishes stay, and the next
// start binds them again.
//
// A start also has to cope with what an earlier end left: binds that were
// not removed are taken over without a line, a removal that arrives late is
// made good, and a bind nobody asks for any more is removed.
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
  readonly property var session: ["HOME", "HYPRLAND_INSTANCE_SIGNATURE", "LANG", "PATH", "XDG_RUNTIME_DIR"]

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/ShortcutParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.steps = [
      root.assigned, root.released, root.boundAgain, root.lateRemoval, root.gateShut, root.takenOver,
      root.listUnread, root.midPass, root.leftBehind, root.newestList, root.onlyAssigned, root.everyRemoval
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

  function rows() {
    return [root.parts.shown("panel"), root.parts.shown("video"), root.parts.shown("output")]
  }

  // Ends the shortcuts the way the end of the service does, then waits
  // until count more lines have reached the stub, and a moment longer for
  // one that should not come.
  function end(count, then) {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    parts.keys.destroy()
    h.waitFor(function() { return parts.lines().length >= sent + count }, 8000, function() {
      h.after(900, function() { then(parts.lines().slice(sent)) })
    })
  }

  function assigned() {
    var h = root.h
    var parts = root.parts
    parts.desktop([])
    parts.keys.assign("video", root.v1)
    parts.keys.assign("panel", root.j1)
    parts.settled(function() {
      h.equal(root.rows(), [["assigned", root.j1, ""], ["assigned", root.v1, ""], ["unassigned", "", ""]],
        "assigned: two shortcuts")
      h.equal(parts.table(), [parts.listed("panel", root.j1), parts.listed("video", root.v1)].sort(),
        "assigned: two binds")
      root.next()
    })
  }

  function released() {
    var h = root.h
    var parts = root.parts
    var starts = h.log("hyprctl").length
    var jobs = h.jobs().length
    root.end(2, function(lines) {
      h.equal(lines.slice().sort(), [parts.unbindLine(root.j1), parts.unbindLine(root.v1)].sort(),
        "released: one removal per shortcut, under the registered spelling, and nothing else")
      h.equal(parts.table(), [], "released: the binds are gone")
      var entries = h.log("hyprctl").slice(starts)
      var kinds = entries.map(function(entry) { return entry.argv.slice(0, 2) })
      h.equal(kinds, [["eval", "--"], ["eval", "--"]], "released: nothing is read or asked on the way out")
      h.equal(entries.filter(function(entry) {
        return JSON.stringify(entry.env) !== JSON.stringify(root.session)
      }).length, 0, "released: the commands get the instance signature and nothing else of the session")
      h.equal(h.jobs().length, jobs,
        "released: they do not go through the runner, which ends with the service")
      h.equal(parts.saved(), root.wishes(root.j1, root.v1, "", false), "released: the wishes stay saved")
      root.next()
    })
  }

  function boundAgain() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    if (!parts.rebuild()) { h.finish(); return }
    h.equal(root.rows(), [["blocked", root.j1, ""], ["blocked", root.v1, ""], ["unassigned", "", ""]],
      "again: before the first look the saved wishes are shown, unconfirmed")
    h.equal(parts.keys.start(), true, "again: saved wishes make the start look")
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.bindLine("panel", root.j1), parts.bindLine("video", root.v1)],
        "again: each wish is bound again")
      h.equal(root.rows(), [["assigned", root.j1, ""], ["assigned", root.v1, ""], ["unassigned", "", ""]],
        "again: assigned")
      root.next()
    })
  }

  // The removal of the instance before can arrive after the first pass of
  // this one has read the list. A later pass makes that good.
  function lateRemoval() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    var ended = parts.ended
    parts.desktop([])
    h.after(1500, function() {
      h.equal(parts.ended, ended, "late removal: nothing looks at once")
      parts.afterPass(ended, function() {
        var again = [parts.bindLine("panel", root.j1), parts.bindLine("video", root.v1)]
        h.equal(parts.lines().slice(sent), again,
          "late removal: a pass a few seconds after the start binds what was taken")
        h.equal(root.rows(), [["assigned", root.j1, ""], ["assigned", root.v1, ""], ["unassigned", "", ""]],
          "late removal: assigned")
        h.after(700, function() {
          h.equal(parts.ended, ended + 1, "late removal: one such pass, not a series")
          root.next()
        })
      })
    })
  }

  // The last look found the user's configuration broken: nothing is sent
  // blind, because a line would wipe the list of errors.
  function gateShut() {
    var h = root.h
    var parts = root.parts
    parts.patchStub({ configErrors: "Config error at line 3: synthetic" })
    parts.keys.refresh()
    parts.settled(function() {
      h.equal([parts.keys.gate, parts.shown("video")], ["config-errors", ["assigned", root.v1, ""]],
        "gate shut: the binds are seen, the gate is shut")
      root.end(0, function(lines) {
        h.equal(lines, [], "gate shut: nothing is removed on the way out")
        h.equal(parts.table().length, 2, "gate shut: the binds stay")
        h.equal(h.stubState("hyprctl").configErrors, "Config error at line 3: synthetic",
          "gate shut: and the list of errors is still the user's to read")
        parts.patchStub({ configErrors: "" })
        root.next()
      })
    })
  }

  // Binds that an earlier end did not remove are found and taken over.
  function takenOver() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    if (!parts.rebuild()) { h.finish(); return }
    parts.keys.start()
    parts.settled(function() {
      h.equal(parts.lines().length, sent, "taken over: no line is needed")
      h.equal(root.rows(), [["assigned", root.j1, ""], ["assigned", root.v1, ""], ["unassigned", "", ""]],
        "taken over: the binds that were left are the shortcuts again")
      root.next()
    })
  }

  // The last pass could not read the list: what an earlier one saw no
  // longer counts.
  function listUnread() {
    var h = root.h
    var parts = root.parts
    h.scenario({ hyprctl: "garbage:binds" })
    parts.keys.refresh()
    parts.settled(function() {
      h.equal([parts.keys.gate, parts.shown("video")[0]], ["ok", "blocked"],
        "unread: the gate is open, the list is not")
      h.scenario({ hyprctl: "ok" })
      root.end(0, function(lines) {
        h.equal(lines, [], "unread: nothing is removed on the way out")
        root.next()
      })
    })
  }

  // The end comes while a pass is at work and has just sent a line.
  function midPass() {
    var h = root.h
    var parts = root.parts
    if (!parts.rebuild()) { h.finish(); return }
    parts.keys.start()
    parts.settled(function() {
      var sent = parts.lines().length
      h.scenario({ hyprctl: "slow:300" })
      parts.keys.assign("output", root.o1)
      h.waitFor(function() { return parts.lines().length > sent }, 15000, function(met) {
        h.check(met, "mid pass: the bind was sent")
        root.end(0, function(lines) {
          h.equal(parts.lines().slice(sent), [parts.bindLine("output", root.o1)],
            "mid pass: what an earlier list showed is out of date after a line, so nothing is removed")
          h.scenario({ hyprctl: "ok" })
          root.next()
        })
      })
    })
  }

  // A session ended before it could confirm its changes, and binds are
  // there that nobody asks for any more.
  function leftBehind() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("panel", root.j1), parts.ours("video", root.v1), parts.ours("output", root.o1)])
    parts.save(root.wishes("", root.v1, "", true))
    var sent = parts.lines().length
    if (!parts.rebuild()) { h.finish(); return }
    h.equal(parts.keys.start(), true, "left behind: an unconfirmed change makes the start look")
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.unbindLine(root.j1), parts.unbindLine(root.o1)],
        "left behind: the binds without a wish are removed")
      h.equal(parts.table(), [parts.listed("video", root.v1)], "left behind: the wished one stays")
      h.equal(root.rows(), [["unassigned", "", ""], ["assigned", root.v1, ""], ["unassigned", "", ""]],
        "left behind: the rows say what is there")
      h.equal(parts.saved(), root.wishes("", root.v1, "", false), "left behind: confirmed")
      root.next()
    })
  }

  // What is taken back is what the newest list of the pass shows, not what
  // an earlier one showed: somebody binds a shortcut's combination while
  // the same pass is busy with another action.
  function newestList() {
    var h = root.h
    var parts = root.parts
    parts.patchStub({ appear: [{ at: 3, bind: parts.theirs(root.v1, "Placeholder 16") }], listings: 0 })
    parts.keys.assign("output", root.o1)
    parts.settled(function() {
      h.equal(root.rows(), [["unassigned", "", ""], ["assigned", root.v1, ""], ["assigned", root.o1, ""]],
        "newest list: both were seen assigned during the pass")
      h.equal(parts.table().length, 3, "newest list: and one of them is no longer ours alone")
      root.end(1, function(lines) {
        h.equal(lines, [parts.unbindLine(root.o1)],
          "newest list: only the other one is removed on the way out")
        root.next()
      })
    })
  }

  // Only what is assigned is taken back: not a wish that waits, and not a
  // combination somebody else has.
  function onlyAssigned() {
    var h = root.h
    var parts = root.parts
    parts.save(root.wishes("", root.v1, "", false))
    if (!parts.rebuild()) { h.finish(); return }
    parts.desktop([parts.ours("video", root.v1), parts.theirs(root.o1, "Placeholder 14"),
      { modmask: 76, key: "", catchall: true, description: "", dispatcher: "submap", submap: "resize" }])
    parts.keys.assign("output", root.o1)
    parts.settled(function() {
      h.equal(root.rows(), [
        ["unassigned", "", ""], ["blocked", root.v1, "Cannot confirm that this key is free"],
        ["unassigned", "", "Now used by: Placeholder 14"]
      ], "only assigned: nothing is confirmed ours")
      root.end(0, function(lines) {
        h.equal(lines, [], "only assigned: so nothing is removed on the way out")
        h.equal(parts.table().length, 3, "only assigned: the table is as it was")
        root.next()
      })
    })
  }

  function everyRemoval() {
    var h = root.h
    var parts = root.parts
    var removals = parts.lines().filter(function(line) { return line.indexOf("hl.bind(") !== 0 })
    var later = [parts.unbindLine(root.j1), parts.unbindLine(root.o1), parts.unbindLine(root.o1)]
    h.equal([removals.length, removals.slice(2)], [5, later],
      "every removal: those of the steps above, and no other in the whole case")
    h.equal(removals.filter(function(line) {
      return !/^hl\.unbind\("MOD4 \+ CONTROL \+ MOD1 \+ [JVO]"\)$/.test(line)
    }).length, 0, "every removal: of one full combination, under the registered spelling")
    root.next()
  }
}
