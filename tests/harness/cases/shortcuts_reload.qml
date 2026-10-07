import QtQuick

// core/Shortcuts.qml when the compositor loads its configuration again, and
// when a line cannot be sent at all.
//
// A reload usually takes every bind that was made at runtime, but a
// configuration that fails to load leaves them where they were. So after a
// reload nothing is registered again on trust: the list is read, and only
// what is missing is bound. Binds that were kept get no line. A combination
// the user has meanwhile bound themselves is theirs. A reload never removes
// anything.
//
// The same list is still read while the gate is shut (a release the lines
// were not tried on, a configuration with errors), so that the rows say
// what is there. Then no line is sent and nothing that is saved changes.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var parts: null
  property var steps: []
  property int at: 0

  readonly property string v2: "SUPER + ALT + V"
  readonly property string j1: "SUPER + CTRL + ALT + J"
  readonly property string j2: "SUPER + ALT + J"
  readonly property string o1: "SUPER + CTRL + ALT + O"

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/ShortcutParts.qml", { h: h })
    if (root.parts === null) { h.finish(); return }
    root.steps = [
      root.untested, root.noCompositor, root.compositorBack, root.keptBroken, root.keptSound, root.wiped,
      root.burst, root.userBind, root.userPasted, root.duringPass, root.everyLine
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

  // The compositor reports a reload, the way the service passes it on.
  function reload() {
    root.parts.hypr.noteReload()
    root.parts.keys.compositorReloaded()
  }

  // A Hyprland release the lines were not tried on: the list is read, no
  // line is sent, and the line the user pasted instead is recognised.
  function untested() {
    var h = root.h
    var parts = root.parts
    parts.patchStub({ version: "0.57.1" })
    parts.desktop([parts.pasted("video", root.v2)])
    parts.save(root.wishes(root.j1, "", root.o1, false))
    if (!parts.build()) { h.finish(); return }
    h.equal(parts.keys.start(), true, "untested: saved wishes make the start look")
    parts.settled(function() {
      h.equal(parts.keys.gate, "version", "untested: the gate says why nothing can be bound")
      h.equal(parts.requests(), ["version", "getoption", "getoption", "getoption", "getoption", "binds"],
        "untested: the list is read all the same")
      h.equal(root.rows(), [["blocked", root.j1, ""], ["config", root.v2, ""], ["blocked", root.o1, ""]],
        "untested: the wishes wait, and the pasted line shows as set in the user's configuration")
      h.equal(parts.row("panel").proposal, root.j1,
        "untested: a free combination is still proposed, for the line")
      h.equal(parts.store.patches.length, 0, "untested: nothing that is saved changes while the gate is shut")
      h.equal(parts.keys.assign("panel", root.j2), true, "untested: a wish is still taken")
      parts.settled(function() {
        h.equal(parts.shown("panel"), ["blocked", root.j2, ""], "untested: and waits like the others")
        h.equal(parts.saved(), root.wishes(root.j2, "", root.o1, true),
          "untested: saved, and nothing else changed")
        h.equal(parts.lines(), [], "untested: no line was sent")
        parts.keys.destroy()
        h.after(700, function() {
          h.equal(parts.lines(), [], "untested: nor when the shortcuts end")
          root.next()
        })
      })
    })
  }

  // No answer from the compositor: nothing can even be read.
  function noCompositor() {
    var h = root.h
    var parts = root.parts
    h.scenario({ hyprctl: "fail:version" })
    if (!parts.build()) { h.finish(); return }
    var before = parts.requests().length
    h.equal(parts.keys.refresh(), true, "no compositor: a pass starts")
    parts.settled(function() {
      h.equal(parts.keys.gate, "no-hyprland", "no compositor: the gate says so")
      h.equal(parts.requests().slice(before), ["version"], "no compositor: nothing else is asked")
      h.equal(root.rows(), [["blocked", root.j2, ""], ["unassigned", "", ""], ["blocked", root.o1, ""]],
        "no compositor: the rows show what is saved, unconfirmed")
      h.equal(parts.saved(), root.wishes(root.j2, "", root.o1, true), "no compositor: the wishes are kept")
      root.next()
    })
  }

  function compositorBack() {
    var h = root.h
    var parts = root.parts
    h.scenario({ hyprctl: "ok" })
    parts.patchStub({ version: "0.56.2" })
    parts.keys.refresh()
    parts.settled(function() {
      h.equal(parts.keys.gate, "ok", "back: the gate is open")
      h.equal(parts.lines(), [parts.bindLine("panel", root.j2), parts.bindLine("output", root.o1)],
        "back: the wishes that waited are granted, one bind each")
      h.equal(root.rows(), [["assigned", root.j2, ""], ["config", root.v2, ""], ["assigned", root.o1, ""]],
        "back: assigned, beside the user's own")
      h.equal(parts.saved(), root.wishes(root.j2, "", root.o1, false), "back: and confirmed")
      root.next()
    })
  }

  // A reload of a configuration with a mistake in it: the old binds stay.
  function keptBroken() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    var ended = parts.ended
    parts.patchStub({ configErrors: "Config error at line 12: synthetic" })
    root.reload()
    parts.afterPass(ended, function() {
      h.equal(parts.keys.gate, "config-errors", "kept, broken: the gate says the configuration has errors")
      h.equal(parts.lines().length, sent, "kept, broken: no line is sent")
      h.equal(root.rows(), [["assigned", root.j2, ""], ["config", root.v2, ""], ["assigned", root.o1, ""]],
        "kept, broken: the binds are still there, and the rows say so")
      h.equal(parts.saved(), root.wishes(root.j2, "", root.o1, false), "kept, broken: nothing saved changes")
      h.equal(h.stubState("hyprctl").configErrors, "Config error at line 12: synthetic",
        "kept, broken: and the user's list of errors was not wiped")
      root.next()
    })
  }

  // A reload that kept the binds: nothing is registered a second time.
  function keptSound() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    var ended = parts.ended
    parts.patchStub({ configErrors: "" })
    root.reload()
    parts.afterPass(ended, function() {
      h.equal(parts.keys.gate, "ok", "kept: the gate is open again")
      h.equal(parts.lines().length, sent, "kept: binds that are still there get no second one")
      h.equal(parts.table().length, 3, "kept: the table is as it was")
      root.next()
    })
  }

  // The usual reload: every bind made at runtime is gone.
  function wiped() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    var ended = parts.ended
    parts.desktop([parts.pasted("video", root.v2)])
    root.reload()
    parts.afterPass(ended, function() {
      var again = [parts.bindLine("panel", root.j2), parts.bindLine("output", root.o1)]
      h.equal(parts.lines().slice(sent), again, "wiped: each wish is bound again, once")
      h.equal(root.rows(), [["assigned", root.j2, ""], ["config", root.v2, ""], ["assigned", root.o1, ""]],
        "wiped: assigned again")
      h.equal(parts.saved(), root.wishes(root.j2, "", root.o1, false), "wiped: confirmed")
      root.next()
    })
  }

  // Reloads come in bursts: one pass after the last of them.
  function burst() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    var ended = parts.ended
    parts.desktop([parts.pasted("video", root.v2)])
    root.reload()
    h.after(100, function() {
      root.reload()
      h.after(100, function() {
        root.reload()
        h.after(100, function() {
          root.reload()
          h.equal([parts.ended - ended, parts.keys.busy], [0, false], "burst: nothing runs while they come")
          parts.afterPass(ended, function() {
            h.after(700, function() {
              h.equal(parts.ended - ended, 1, "burst: four reloads are one pass")
              h.equal(parts.lines().length - sent, 2, "burst: and one bind per wish")
              root.next()
            })
          })
        })
      })
    })
  }

  // After the reload the user's own configuration binds the combination.
  function userBind() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    var ended = parts.ended
    parts.desktop([parts.pasted("video", root.v2), parts.theirs(root.j2, "Placeholder 13")])
    root.reload()
    parts.afterPass(ended, function() {
      h.equal(parts.shown("panel"), ["unassigned", "", "Now used by: Placeholder 13"],
        "user bind: theirs wins, and the row says whose it is")
      h.equal(parts.lines().slice(sent), [parts.bindLine("output", root.o1)],
        "user bind: no line for that combination, one bind for the other wish")
      h.equal(parts.saved(), root.wishes("", "", root.o1, false), "user bind: the wish is dropped")
      root.next()
    })
  }

  // After the reload the pasted line binds what a shortcut was on.
  function userPasted() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    var ended = parts.ended
    parts.desktop([parts.pasted("video", root.v2), parts.pasted("output", root.o1)])
    root.reload()
    parts.afterPass(ended, function() {
      h.equal(root.rows(), [["unassigned", "", ""], ["config", root.v2, ""], ["config", root.o1, ""]],
        "pasted: the row shows the bind of the user's configuration")
      h.equal(parts.lines().length, sent, "pasted: no line is sent")
      h.equal(parts.saved(), root.wishes("", "", "", false), "pasted: the wish is dropped")
      root.next()
    })
  }

  // A reload that arrives while a pass runs makes one more pass follow.
  function duringPass() {
    var h = root.h
    var parts = root.parts
    var ended = parts.ended
    h.scenario({ hyprctl: "slow:150" })
    parts.keys.refresh()
    root.reload()
    h.waitFor(function() { return parts.ended - ended >= 2 && !parts.keys.busy }, 15000, function(met) {
      h.check(met, "during a pass: a second pass followed the first")
      h.scenario({ hyprctl: "ok" })
      h.after(700, function() {
        h.equal(parts.ended - ended, 2, "during a pass: and no third")
        root.next()
      })
    })
  }

  function everyLine() {
    var h = root.h
    var parts = root.parts
    h.equal(parts.strays(), 0,
      "every line: a bind under the registered spelling, between two readings of the list")
    h.equal(parts.lines().filter(function(line) { return line.indexOf("hl.bind(") !== 0 }).length, 0,
      "every line: a reload removes nothing")
    h.equal(parts.table(), ["72 V OmaJuke video (bindings.lua)", "76 O OmaJuke output (bindings.lua)"],
      "every line: the user's binds are all still there")
    root.next()
  }
}
