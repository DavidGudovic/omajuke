import QtQuick
import "../../../lib/KeyCombo.js" as KeyCombo

// core/Shortcuts.qml against the hyprctl stub and its table of binds: what
// a pass reads, when it sends a line and, above all, when it does not.
//
// A bind is made only on a combination that the list, read immediately
// before, shows free. A bind is removed only where the list, read
// immediately before, shows binds of ours and of nobody else. A combination
// that somebody else has, that is bound by us and by somebody else, or that
// cannot be judged gets no line at all. Whether a line worked is said by
// the next list. The stub writes down every start, so each of these is
// checked against what really reached it.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var parts: null
  property var steps: []
  property int at: 0

  readonly property string v1: "SUPER + CTRL + ALT + V"
  readonly property string v2: "SUPER + ALT + V"
  readonly property string j1: "SUPER + CTRL + ALT + J"
  readonly property string j2: "SUPER + ALT + J"
  readonly property string o1: "SUPER + CTRL + ALT + O"
  readonly property string o2: "SUPER + ALT + O"
  readonly property string unconfirmed: "Cannot confirm that this key is free"
  readonly property string shared: "Also bound elsewhere. Reload Hyprland to clear OmaJuke's copy"
  readonly property string refused: "Hyprland refused the request"
  readonly property var pass: ["configerrors", "getoption", "getoption", "getoption", "getoption", "binds"]
  readonly property var change: ["binds", "configerrors", "eval", "binds"]

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/ShortcutParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.steps = [
      root.quiet, root.opened, root.refusals, root.assignFree, root.takenByName, root.takenByNumber,
      root.otherLayout, root.grantedLater, root.unreadable, root.besideUnknown, root.racedBefore,
      root.racedAfter, root.sharedCombo, root.doubled, root.changed, root.unassigned, root.racedRemoval,
      root.refusedLine,
      root.noisyLine, root.pastedLine, root.lookalike, root.singleFlight, root.texts, root.everyLine
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function options(layout) {
    return {
      "general:gaps_out": { css: "5 5 5 5" }, "input:kb_layout": { str: layout },
      "input:kb_variant": { str: "[[EMPTY]]" }, "input:resolve_binds_by_sym": { "int": 0 },
      "input:kb_file": { str: "[[EMPTY]]" }
    }
  }

  function wishes(panel, video, output, dirty) {
    return {
      panel: panel, video: video, output: output, playPause: "", next: "", previous: "", dirty: dirty,
      asked: false
    }
  }

  // Somebody who never asked for a shortcut costs the compositor nothing.
  function quiet() {
    var h = root.h
    var parts = root.parts
    parts.desktop([])
    h.equal(parts.keys.start(), false, "quiet: nothing is saved, so the start runs no pass")
    parts.keys.compositorReloaded()
    h.after(700, function() {
      h.equal(h.log("hyprctl"), [], "quiet: hyprctl is not started, not at the start and not on a reload")
      h.equal(parts.keys.rows.map(function(row) {
        return [row.action, row.label, row.combo, row.status, row.proposal, row.note]
      }), [
        ["panel", "Open panel", "", "unassigned", "", ""],
        ["video", "Show or hide video", "", "unassigned", "", ""],
        ["output", "Next audio output", "", "unassigned", "", ""],
        ["playPause", "Play or pause", "", "unassigned", "", ""],
        ["next", "Next track", "", "unassigned", "", ""],
        ["previous", "Previous track", "", "unassigned", "", ""]
      ], "quiet: six rows without a shortcut")
      h.equal([parts.keys.gate, parts.keys.busy], ["ok", false],
        "quiet: nothing stands in the way, nothing runs")
      root.next()
    })
  }

  // Opening the page looks, proposes, and changes nothing.
  function opened() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.theirs(root.j1, "Placeholder 7")])
    h.equal(parts.keys.refresh(), true, "opened: a pass starts")
    h.equal(parts.keys.busy, true, "opened: and is running at once")
    parts.settled(function() {
      h.equal(parts.requests(), ["version"].concat(root.pass),
        "opened: the gate, the keyboard layout, the list, and no line")
      h.equal(h.log("hyprctl").filter(function(entry) { return entry.argv[1] === "getoption" })
        .map(function(entry) { return entry.argv[2] }), KeyCombo.LAYOUT_OPTIONS,
        "opened: the four options that say which letter a key number types")
      h.equal(parts.keys.rows.map(function(row) { return [row.status, row.proposal] }),
        [["unassigned", root.j2], ["unassigned", root.v1], ["unassigned", root.o1]],
        "opened: each action is offered its first combination that is free")
      h.equal(parts.store.patches.length, 0, "opened: nothing is saved by looking")
      root.next()
    })
  }

  function refusals() {
    var h = root.h
    var parts = root.parts
    var before = parts.requests().length
    var bad = ["", "V", "SHIFT + V", "super + alt + v", "SUPER + ALT + v", "ALT + SUPER + V", "SUPER+ALT+V",
      "SUPER + ALT + F13", "SUPER + ALT + 1", "all", "MOD4 + MOD1 + V", "SUPER + ALT + V\n"]
    var taken = 0
    for (var i = 0; i < bad.length; i++) {
      if (parts.keys.assign("video", bad[i]) !== false) taken++
    }
    h.equal(taken, 0, "refusals: what is no combination in the written form is not taken")
    h.equal(parts.keys.assign("volume", root.v1), false, "refusals: nor an action there is none of")
    h.equal(parts.keys.assign("constructor", root.v1), false, "refusals: whatever its name")
    h.equal(parts.keys.unassign("constructor"), false, "refusals: and it cannot be given up either")
    h.equal([parts.requests().length, parts.store.patches.length, parts.keys.busy], [before, 0, false],
      "refusals: none of this started a pass or saved anything")
    root.next()
  }

  function assignFree() {
    var h = root.h
    var parts = root.parts
    var before = parts.requests().length
    h.equal(parts.keys.assign("video", root.v1), true, "assign: taken")
    h.equal(parts.keys.busy, true, "assign: a pass runs")
    h.equal(parts.saved(), root.wishes("", root.v1, "", true),
      "assign: the wish is saved, and that a change is under way")
    h.equal(parts.store.flushes, 1, "assign: and written at once, not a moment later")
    parts.settled(function() {
      h.equal(parts.requests().slice(before), root.pass.concat(root.change),
        "assign: the list says free, is read again right before the line, and once more after it")
      h.equal(parts.lines(), [parts.bindLine("video", root.v1)],
        "assign: one bind, under the registered spelling")
      h.equal(parts.table(), ["76 J Placeholder 7", parts.listed("video", root.v1)],
        "assign: the stub's table holds the bind")
      h.equal(parts.shown("video"), ["assigned", root.v1, ""], "assign: the row says assigned")
      h.equal(parts.saved(), root.wishes("", root.v1, "", false),
        "assign: confirmed, so nothing is under way")
      root.next()
    })
  }

  function takenByName() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.theirs(root.o2, "Placeholder 8")])
    var sent = parts.lines().length
    h.equal(parts.keys.assign("output", root.o2), true, "taken: the wish is taken")
    parts.settled(function() {
      h.equal(parts.shown("output"), ["unassigned", "", "Now used by: Placeholder 8"],
        "taken: theirs wins, and the row says whose it is")
      h.equal(parts.saved(), root.wishes("", root.v1, "", false), "taken: the wish is dropped")
      h.equal(parts.lines().length, sent, "taken: no line was sent")
      h.equal(parts.row("output").proposal, root.o1, "taken: another combination is proposed")
      h.equal(parts.shown("video"), ["assigned", root.v1, ""], "taken: the other shortcut is untouched")
      root.next()
    })
  }

  // A bind given by key number is somebody's letter on a plain US keyboard.
  function takenByNumber() {
    var h = root.h
    var parts = root.parts
    var numbered = { modmask: 72, key: "code:32", description: "Placeholder 9" }
    parts.desktop([parts.ours("video", root.v1), numbered])
    var sent = parts.lines().length
    parts.keys.assign("output", root.o2)
    parts.settled(function() {
      h.equal(parts.shown("output"), ["unassigned", "", "Now used by: Placeholder 9"],
        "by number: key 32 is the letter O there, so the combination is taken")
      h.equal(parts.lines().length, sent, "by number: no line was sent")
      root.next()
    })
  }

  // On another keyboard nobody can say which letter that key types.
  function otherLayout() {
    var h = root.h
    var parts = root.parts
    parts.patchStub({ options: root.options("de") })
    var sent = parts.lines().length
    parts.keys.assign("output", root.o2)
    parts.settled(function() {
      h.equal(parts.shown("output"), ["blocked", root.o2, root.unconfirmed],
        "other layout: the combination cannot be confirmed free")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "other layout: the wish is kept")
      h.equal(parts.lines().length, sent, "other layout: no line was sent")
      h.equal(parts.row("output").proposal, root.o1,
        "other layout: a combination without such binds is proposed")
      root.next()
    })
  }

  function grantedLater() {
    var h = root.h
    var parts = root.parts
    parts.patchStub({ options: root.options("us") })
    parts.desktop([parts.ours("video", root.v1)])
    var sent = parts.lines().length
    parts.keys.refresh()
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.bindLine("output", root.o2)],
        "later: once the list can be judged, the kept wish is granted")
      h.equal(parts.shown("output"), ["assigned", root.o2, ""], "later: assigned")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "later: and confirmed")
      root.next()
    })
  }

  // A list that cannot be read or understood proves nothing.
  function unreadable() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    h.scenario({ hyprctl: "garbage:binds" })
    parts.keys.assign("panel", root.j2)
    parts.settled(function() {
      h.equal([parts.shown("panel"), parts.shown("video"), parts.shown("output")], [
        ["blocked", root.j2, root.unconfirmed], ["blocked", root.v1, root.unconfirmed],
        ["blocked", root.o2, root.unconfirmed]
      ], "unreadable: a list that is no list confirms nothing, old or new")
      h.scenario({ hyprctl: "fail:binds" })
      parts.keys.refresh()
      parts.settled(function() {
        h.equal(parts.shown("panel"), ["blocked", root.j2, root.unconfirmed],
          "unreadable: nor does a failed read")
        h.equal(parts.lines().length, sent, "unreadable: no line was sent either time")
        h.equal(parts.saved(), root.wishes(root.j2, root.v1, root.o2, true),
          "unreadable: the wishes are kept")
        h.scenario({ hyprctl: "ok" })
        parts.keys.refresh()
        parts.settled(function() {
          h.equal(parts.lines().slice(sent), [parts.bindLine("panel", root.j2)],
            "unreadable: with a readable list the wish is granted")
          h.equal([parts.shown("panel"), parts.shown("video"), parts.shown("output")], [
            ["assigned", root.j2, ""], ["assigned", root.v1, ""], ["assigned", root.o2, ""]
          ], "unreadable: and the rows say what is there again")
          root.next()
        })
      })
    })
  }

  // A bind that takes every key on the same held keys cannot be weighed, so
  // even our own bind beside it is not judged ours, and not removed.
  function besideUnknown() {
    var h = root.h
    var parts = root.parts
    var mine = [parts.ours("video", root.v1), parts.ours("output", root.o2), parts.ours("panel", root.j2)]
    var everyKey = { modmask: 72, key: "", catchall: true, description: "", dispatcher: "submap" }
    parts.desktop(mine.concat([everyKey]))
    var sent = parts.lines().length
    parts.keys.unassign("panel")
    parts.settled(function() {
      h.equal(parts.shown("panel"), ["unassigned", "", ""], "beside unknown: the wish is given up")
      h.equal(parts.shown("output"), ["blocked", root.o2, root.unconfirmed],
        "beside unknown: a shortcut on those held keys can no longer be confirmed")
      h.equal(parts.lines().length, sent, "beside unknown: and no removal is sent into what cannot be read")
      parts.desktop(mine)
      parts.keys.refresh()
      parts.settled(function() {
        h.equal(parts.lines().slice(sent), [parts.unbindLine(root.j2)],
          "beside unknown: once the list is clear the bind that was left is removed")
        h.equal(parts.table(), [parts.listed("output", root.o2), parts.listed("video", root.v1)].sort(),
          "beside unknown: and only that one")
        h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "beside unknown: all confirmed")
        root.next()
      })
    })
  }

  // Somebody binds the combination between the first look and the line.
  function racedBefore() {
    var h = root.h
    var parts = root.parts
    parts.patchStub({ appear: [{ at: 2, bind: parts.theirs(root.j1, "Placeholder 10") }], listings: 0 })
    var sent = parts.lines().length
    var before = parts.requests().length
    parts.keys.assign("panel", root.j1)
    parts.settled(function() {
      h.equal(parts.requests().slice(before), root.pass.concat(["binds"]),
        "raced: the list is read a second time, and that reading stops the line")
      h.equal(parts.lines().length, sent, "raced: no bind is made on a combination that was taken meanwhile")
      h.equal(parts.shown("panel"), ["unassigned", "", "Now used by: Placeholder 10"], "raced: theirs wins")
      root.next()
    })
  }

  // Somebody binds it right after ours: two binds fire now, and ours cannot
  // be told apart safely enough to remove it.
  function racedAfter() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2)])
    parts.patchStub({ appear: [{ at: 3, bind: parts.theirs(root.j2, "Placeholder 11") }], listings: 0 })
    var sent = parts.lines().length
    parts.keys.assign("panel", root.j2)
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.bindLine("panel", root.j2)],
        "raced after: the bind was sent, and nothing after it")
      h.equal(parts.shown("panel"), ["failed", root.j2, root.shared],
        "raced after: the row says what happened")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, true),
        "raced after: the wish is dropped, and the change stays unconfirmed")
      root.next()
    })
  }

  function sharedCombo() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.theirs(root.v1, "Placeholder 12"),
      parts.ours("output", root.o2)])
    var sent = parts.lines().length
    parts.keys.refresh()
    parts.settled(function() {
      h.equal(parts.shown("video"), ["unassigned", "", root.shared], "shared: the row says how to clear it")
      h.equal(parts.saved(), root.wishes("", "", root.o2, false), "shared: the wish is dropped")
      h.equal(parts.lines().length, sent, "shared: our bind beside somebody else's is never removed")
      h.equal(parts.table().length, 3, "shared: the table is as it was")
      root.next()
    })
  }

  function doubled() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v2), parts.ours("video", root.v2), parts.ours("output", root.o2)])
    parts.save(root.wishes("", root.v2, root.o2, false))
    var sent = parts.lines().length
    var before = parts.requests().length
    var patched = parts.store.patches.length
    var flushed = parts.store.flushes
    parts.keys.refresh()
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.unbindLine(root.v2), parts.bindLine("video", root.v2)],
        "doubled: two binds of ours on one combination are removed, and one is made")
      h.equal(parts.store.patches.slice(patched).map(function(patch) { return patch.shortcuts.dirty }),
        [true, false], "doubled: that a change is under way is saved before the lines, and cleared after")
      h.equal(parts.store.flushes - flushed, 1, "doubled: and written at once")
      h.equal(parts.requests().slice(before), root.pass.concat(root.change).concat(root.change),
        "doubled: each line between its own readings of the list")
      h.equal(parts.table(), [parts.listed("output", root.o2), parts.listed("video", root.v2)].sort(),
        "doubled: one bind is left")
      h.equal(parts.shown("video"), ["assigned", root.v2, ""], "doubled: assigned")
      root.next()
    })
  }

  function changed() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    parts.keys.assign("video", root.v1)
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.bindLine("video", root.v1), parts.unbindLine(root.v2)],
        "changed: the new combination is bound, then the old one is removed")
      h.equal(parts.table(), [parts.listed("output", root.o2), parts.listed("video", root.v1)].sort(),
        "changed: one bind per action")
      h.equal(parts.shown("video"), ["assigned", root.v1, ""], "changed: the row shows the new one")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "changed: saved and confirmed")
      root.next()
    })
  }

  function unassigned() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    h.equal(parts.keys.unassign("video"), true, "unassign: taken")
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.unbindLine(root.v1)], "unassign: one removal")
      h.equal(parts.table(), [parts.listed("output", root.o2)], "unassign: the bind is gone, the other stays")
      h.equal([parts.shown("video"), parts.row("video").proposal], [["unassigned", "", ""], root.v1],
        "unassign: the row is empty again and proposes")
      h.equal(parts.saved(), root.wishes("", "", root.o2, false), "unassign: saved and confirmed")
      h.equal(parts.keys.unassign("panel"), true, "unassign: giving up what was never there is fine")
      parts.settled(function() {
        h.equal(parts.lines().length, sent + 1, "unassign: and sends nothing")
        root.next()
      })
    })
  }

  // Somebody binds the combination between the first look and the removal:
  // our bind is no longer alone there, and stays.
  function racedRemoval() {
    var h = root.h
    var parts = root.parts
    parts.patchStub({ appear: [{ at: 2, bind: parts.theirs(root.o2, "Placeholder 15") }], listings: 0 })
    var sent = parts.lines().length
    var before = parts.requests().length
    parts.keys.unassign("output")
    parts.settled(function() {
      h.equal(parts.requests().slice(before), root.pass.concat(["binds"]),
        "raced removal: the list is read a second time, and that reading stops the line")
      h.equal(parts.lines().length, sent,
        "raced removal: nothing is removed where somebody else has a bind too")
      h.equal(parts.table().length, 2, "raced removal: both binds are there")
      h.equal(parts.shown("output"), ["unassigned", "", root.shared],
        "raced removal: the row says that our bind is still there, and how to clear it")
      parts.desktop([parts.ours("output", root.o2)])
      parts.save(root.wishes("", "", root.o2, false))
      parts.keys.refresh()
      parts.settled(function() {
        h.equal([parts.shown("output"), parts.lines().length], [["assigned", root.o2, ""], sent],
          "raced removal: (the desktop of the steps before is put back)")
        root.next()
      })
    })
  }

  // Hyprland answers with an error: the list shows no bind, so there is none.
  function refusedLine() {
    var h = root.h
    var parts = root.parts
    var sent = parts.lines().length
    h.scenario({ hyprctl: "refuse" })
    parts.keys.assign("video", root.v1)
    parts.settled(function() {
      h.equal(parts.lines().length, sent + 1, "refused: the line was sent once and not repeated")
      h.equal(parts.shown("video"), ["failed", root.v1, root.refused], "refused: the row says failed")
      h.equal(parts.saved(), root.wishes("", "", root.o2, true), "refused: the wish is dropped, unconfirmed")
      h.scenario({ hyprctl: "ok" })
      parts.keys.refresh()
      parts.settled(function() {
        h.equal(parts.lines().length, sent + 1, "refused: a later pass sends nothing by itself")
        h.equal(parts.saved(), root.wishes("", "", root.o2, false),
          "refused: and finds nothing left to confirm")
        root.next()
      })
    })
  }

  // The answer is not the plain "ok", yet the list shows the bind.
  function noisyLine() {
    var h = root.h
    var parts = root.parts
    h.scenario({ hyprctl: "noisy" })
    parts.keys.assign("video", root.v1)
    parts.settled(function() {
      h.equal(parts.shown("video"), ["assigned", root.v1, ""], "noisy: the list decides, not the answer")
      h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "noisy: confirmed by the list")
      h.scenario({ hyprctl: "ok" })
      root.next()
    })
  }

  // The line the user pasted into their own configuration is theirs.
  function pastedLine() {
    var h = root.h
    var parts = root.parts
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2),
      parts.pasted("panel", root.j2)])
    var sent = parts.lines().length
    parts.keys.refresh()
    parts.settled(function() {
      h.equal(parts.shown("panel"), ["config", root.j2, ""],
        "pasted: shown as set in the user's configuration")
      parts.keys.assign("panel", root.j2)
      parts.settled(function() {
        h.equal(parts.shown("panel"), ["config", root.j2, ""],
          "pasted: asking for the same keys changes nothing")
        h.equal(parts.saved(), root.wishes("", root.v1, root.o2, false), "pasted: the wish is dropped")
        h.equal(parts.lines().length, sent, "pasted: no line was sent")
        parts.keys.assign("panel", root.j1)
        parts.settled(function() {
          h.equal(parts.shown("panel"), ["assigned", root.j1, ""],
            "pasted: a shortcut on other keys can be added")
          h.equal(parts.lines().slice(sent), [parts.bindLine("panel", root.j1)], "pasted: with one bind")
          h.equal(parts.table().indexOf("72 J OmaJuke panel (bindings.lua)") !== -1, true,
            "pasted: the user's bind is still there")
          root.next()
        })
      })
    })
  }

  // A bind that reads like ours but was written under another spelling: the
  // removal cannot reach it, and is not sent over and over.
  function lookalike() {
    var h = root.h
    var parts = root.parts
    var theirs = parts.ours("output", root.o1)
    theirs.spelling = root.o1
    parts.desktop([parts.ours("video", root.v1), parts.ours("output", root.o2), parts.ours("panel", root.j1),
      theirs])
    var sent = parts.lines().length
    parts.keys.refresh()
    parts.settled(function() {
      h.equal(parts.lines().slice(sent), [parts.unbindLine(root.o1)], "lookalike: one removal is tried")
      h.equal(parts.table().length, 4, "lookalike: under our spelling it removes nothing of theirs")
      h.equal(parts.shown("output"), ["assigned", root.o2, ""], "lookalike: the real shortcut is untouched")
      h.equal(parts.saved().dirty, true, "lookalike: the change stays unconfirmed")
      parts.keys.refresh()
      parts.settled(function() {
        h.equal(parts.lines().length, sent + 1, "lookalike: the next pass does not try again")
        root.next()
      })
    })
  }

  function singleFlight() {
    var h = root.h
    var parts = root.parts
    var count = function() {
      return parts.requests().filter(function(request) { return request === "binds" }).length
    }
    var before = count()
    h.scenario({ hyprctl: "slow:40" })
    parts.keys.refresh()
    parts.keys.refresh()
    parts.keys.refresh()
    parts.keys.refresh()
    parts.settled(function() {
      h.equal(count() - before, 2, "single flight: four requests in a row are one pass and one more")
      h.scenario({ hyprctl: "ok" })
      root.next()
    })
  }

  function texts() {
    var h = root.h
    var keys = root.parts.keys
    var before = root.parts.requests().length
    h.equal(keys.lineFor("video", root.v2), "o.bind(\"SUPER + ALT + V\", \"OmaJuke video (bindings.lua)\", "
      + "\"omarchy-shell -q " + h.manifest.id + " video toggle\")", "texts: the line to paste")
    h.equal(keys.lineFor("video", "V"), "", "texts: none for what is no combination")
    h.equal(keys.lineFor("volume", root.v2), "", "texts: none for what is no action")
    h.equal(keys.copyLine("video", "V"), false, "texts: and nothing is copied then")
    h.equal(keys.copyLine("output", root.o1), true, "texts: a line is put on the clipboard")
    h.equal(keys.comboFromKeyEvent(0x56, 0x10000000 + 0x08000000), root.v2,
      "texts: a key press with held keys")
    h.equal(keys.comboFromKeyEvent(0x56, 0), "", "texts: a key alone is no shortcut")
    h.equal(keys.comboFromKeyEvent(0x01000030, 0x04000000), "CTRL + F1", "texts: a function key")
    h.equal(root.parts.requests().length, before, "texts: none of this asks the compositor anything")
    root.next()
  }

  // Over everything the stub was started with in this case.
  function everyLine() {
    var h = root.h
    var parts = root.parts
    var lines = parts.lines()
    h.equal(parts.strays(), 0,
      "every line: a bind or a removal under the registered spelling, between two readings of the list")
    h.equal(lines.filter(function(line) { return line.indexOf("all") !== -1 }).length, 0,
      "every line: none removes everything")
    h.equal(lines.filter(function(line) { return line.indexOf("hl.unbind(") === 0 }), [
      parts.unbindLine(root.j2), parts.unbindLine(root.v2), parts.unbindLine(root.v2),
      parts.unbindLine(root.v1), parts.unbindLine(root.o1)
    ], "every line: the removals are those of binds the list showed to be ours alone, and no other")
    var session = JSON.stringify(["HOME", "HYPRLAND_INSTANCE_SIGNATURE", "LANG", "PATH", "XDG_RUNTIME_DIR"])
    h.equal(h.log("hyprctl").filter(function(entry) {
      return JSON.stringify(entry.env) !== session
    }).length, 0, "every line: hyprctl got the instance signature and nothing else of the session")
    h.equal(h.jobs().filter(function(job) { return job.tag.indexOf("hypr-") !== 0 }).length, 0,
      "every line: and no other program was run")
    root.next()
  }
}
