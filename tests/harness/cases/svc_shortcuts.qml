import QtQuick
import "../../../lib/KeyCombo.js" as KeyCombo
import "../../../lib/Lua.js" as Lua

// The shortcuts through the whole service, against the stub hyprctl. A user
// who never asks for a shortcut causes no call to the compositor. A bind is
// made on request; when the compositor says that it loaded its
// configuration again, the list is read before anything is done, so that a
// bind that was kept is not doubled, one that was wiped comes back, and a
// combination the user took meanwhile is theirs. When the service ends it
// takes its bind out of the compositor, and the next start puts it back.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  property string videoCombo: ""
  property string outputCombo: ""

  // Binds of other people, as nearly every desktop has some. These touch
  // none of the combinations the plugin proposes. The last step takes them
  // away: a desktop without a single bind is one too.
  readonly property var others: [
    { modmask: 64, key: "Return", description: "Placeholder 1" },
    { modmask: 0, key: "XF86AudioPlay", description: "" }
  ]

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok", hyprctl: "ok" })
    root.setBinds([])
    root.steps = [
      root.becomesReady, root.pageOpens, root.refusals, root.assigns, root.reloadKept, root.reloadWiped,
      root.reloadTaken, root.outputShortcut, root.serviceEnds, root.bareDesktop, root.quiet
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // Waits for something that has to happen, and says so when it does not.
  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function row(action) {
    var rows = root.h.service.shortcuts
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].action === action) return rows[i]
    }
    return { action: action, combo: "", status: "", proposal: "", note: "" }
  }

  function shown() {
    return root.h.service.shortcuts.map(function(entry) { return [entry.action, entry.status, entry.combo] })
  }

  // What the stub was started for, as the word that tells requests apart.
  function requests() {
    return root.h.log("hyprctl").map(function(entry) {
      return entry.argv[0] === "-j" ? entry.argv[1] : entry.argv[0]
    })
  }

  // The lines the compositor was asked to run.
  function lines() {
    return root.h.log("hyprctl").filter(function(entry) { return entry.argv[0] === "eval" })
      .map(function(entry) { return entry.argv[2] })
  }

  function bindLine(action, combo) {
    return Lua.bind(KeyCombo.parse(combo).alias, action)
  }

  function unbindLine(combo) {
    return Lua.unbind(KeyCombo.parse(combo).alias)
  }

  // The binds the compositor holds beside the usual ones, as
  // "<modmask> <key> <description>".
  function table() {
    var state = root.h.stubState("hyprctl")
    var binds = state && Array.isArray(state.binds) ? state.binds.slice(root.others.length) : []
    return binds.map(function(bind) { return bind.modmask + " " + bind.key + " " + bind.description }).sort()
  }

  function ours(action, combo) {
    var parsed = KeyCombo.parse(combo)
    return parsed.mask + " " + parsed.key + " " + KeyCombo.action(action).description
  }

  function setBinds(binds) {
    var state = root.h.stubState("hyprctl") || {}
    state.binds = root.others.concat(binds)
    root.h.setStubState("hyprctl", state)
  }

  // The compositor reports an event, and the pass that follows has ended.
  function reloaded(label, then) {
    var h = root.h
    var asked = root.requests().filter(function(request) { return request === "binds" }).length
    h.hyprEvent("configreloaded")
    h.hyprEvent("configreloaded")
    root.until(label + ": the list is read again", function() {
      var now = root.requests().filter(function(request) { return request === "binds" }).length
      return now > asked && h.service.shortcutsBusy === false
    }, 6000, function() {
      // Long enough for a second pass, if a burst had caused one.
      h.after(600, then)
    })
  }

  function becomesReady() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.after(600, function() {
        h.equal(h.log("hyprctl").length, 0,
          "start: nobody asked for a shortcut, so the compositor is not asked")
        h.equal(root.shown(), [["panel", "unassigned", ""], ["video", "unassigned", ""],
          ["output", "unassigned", ""]], "start: three actions, none with a shortcut")
        h.equal([s.shortcutsGate, s.shortcutsBusy], ["ok", false],
          "start: nothing in the way, nothing running")
        h.hyprEvent("configreloaded")
        h.after(600, function() {
          h.equal(h.log("hyprctl").length, 0, "start: nor after a reload")
          root.next()
        })
      })
    })
  }

  // The shortcuts page reads the list, and proposes a free combination for
  // each action. Nothing is bound.
  function pageOpens() {
    var h = root.h
    var s = h.service
    h.check(s.refreshShortcuts(), "page: a look is started")
    h.equal(s.shortcutsBusy, true, "page: and shows as running")
    root.until("page: the look ends", function() { return s.shortcutsBusy === false }, 6000, function() {
      root.videoCombo = root.row("video").proposal
      root.outputCombo = root.row("output").proposal
      h.check(KeyCombo.parse(root.videoCombo) !== null && KeyCombo.parse(root.outputCombo) !== null
        && root.videoCombo !== root.outputCombo, "page: each action is proposed a combination of its own")
      h.equal([root.lines(), root.table(), s.shortcutsGate], [[], [], "ok"], "page: and nothing was bound")
      h.equal(s.comboFromKeyEvent(Qt.Key_V, Qt.MetaModifier | Qt.AltModifier), "SUPER + ALT + V",
        "page: a key press is told as a combination")
      h.equal(s.comboFromKeyEvent(Qt.Key_V, Qt.NoModifier), "", "page: a bare letter is none")
      root.next()
    })
  }

  function refusals() {
    var h = root.h
    var s = h.service
    var asked = h.log("hyprctl").length
    var bad = [
      ["constructor", root.videoCombo], ["video", "F1\") os.execute(\"x"], ["video", "super + alt + v"],
      ["video", ""], ["", root.videoCombo], ["video", "all"]
    ]
    for (var i = 0; i < bad.length; i++) {
      h.equal(s.assignShortcut(bad[i][0], bad[i][1]), false, "refused wish " + i)
      h.equal(s.copyShortcutLine(bad[i][0], bad[i][1]), false, "refused line " + i)
    }
    h.equal(s.unassignShortcut("constructor"), false, "refused: no such action to take a shortcut from")
    h.after(400, function() {
      h.equal([h.log("hyprctl").length, root.lines()], [asked, []], "refused: the compositor heard nothing")
      h.equal(h.parts.store.values.shortcuts, { panel: "", video: "", output: "", dirty: false },
        "refused: and nothing was saved")
      h.check(s.copyShortcutLine("video", root.videoCombo),
        "a line for the user's own configuration is copied")
      root.next()
    })
  }

  function assigns() {
    var h = root.h
    var s = h.service
    h.check(s.assignShortcut("video", root.videoCombo), "assign: the wish is taken")
    var bound = function() { return root.row("video").status === "assigned" }
    root.until("assign: bound", bound, 6000, function() {
      h.equal(root.lines(), [root.bindLine("video", root.videoCombo)], "assign: one line, the bind")
      h.equal(root.table(), [root.ours("video", root.videoCombo)], "assign: the compositor holds it")
      h.equal(root.row("video").combo, root.videoCombo, "assign: the row shows the combination")
      root.until("assign: saved and confirmed", function() {
        var saved = h.parts.store.values.shortcuts
        return saved.video === root.videoCombo && saved.dirty === false
      }, 5000, root.next)
    })
  }

  // The configuration was loaded again and the bind is still there, as
  // after a configuration that failed to load.
  function reloadKept() {
    var h = root.h
    root.reloaded("kept", function() {
      h.equal(root.lines().length, 1, "kept: a bind that is still there gets no second one")
      h.equal(root.table(), [root.ours("video", root.videoCombo)], "kept: the table is as it was")
      h.equal(root.row("video").status, "assigned", "kept: and the row says so")
      root.next()
    })
  }

  // The usual reload: what was bound at runtime is gone.
  function reloadWiped() {
    var h = root.h
    root.setBinds([])
    root.reloaded("wiped", function() {
      var line = root.bindLine("video", root.videoCombo)
      h.equal(root.lines(), [line, line], "wiped: bound again, by one line")
      h.equal(root.table(), [root.ours("video", root.videoCombo)], "wiped: the compositor holds it again")
      root.next()
    })
  }

  // After a reload the combination is bound by a line of the user's own.
  function reloadTaken() {
    var h = root.h
    var parsed = KeyCombo.parse(root.videoCombo)
    root.setBinds([{ modmask: parsed.mask, key: parsed.key, description: "A bind of the user" }])
    root.reloaded("taken", function() {
      h.equal(root.lines().length, 2, "taken: no line is sent, and nothing is removed")
      h.equal(root.table().length, 1, "taken: the user's bind is all there is")
      h.equal([root.row("video").status, root.row("video").combo], ["unassigned", ""],
        "taken: the wish is given up")
      h.check(root.row("video").note.indexOf("A bind of the user") !== -1,
        "taken: and the row says who has it")
      h.equal(h.parts.store.values.shortcuts.video, "", "taken: nothing is saved for the action any more")
      root.next()
    })
  }

  // A shortcut for the next audio output works with every panel closed, so
  // mpv is asked for its outputs from then on.
  function outputShortcut() {
    var h = root.h
    var s = h.service
    h.equal(h.parts.player.watchOutputs, false, "output: nobody needs the list of outputs yet")
    h.check(s.assignShortcut("output", root.outputCombo), "output: the wish is taken")
    root.until("output: bound", function() { return root.row("output").status === "assigned" }, 6000,
      function() {
        h.equal(h.parts.player.watchOutputs, true, "output: now the list is wanted")
        h.equal(root.lines().slice(-1), [root.bindLine("output", root.outputCombo)], "output: one more bind")
        root.until("output: saved", function() {
          var text = h.readFile(h.parts.fs.paths.stateFile)
          return text.indexOf("\"dirty\":false") !== -1 && text.indexOf("\"output\":\"SUPER") !== -1
        }, 5000, root.next)
      })
  }

  // The plugin is switched off: its bind leaves the compositor, by the
  // spelling it was made with, and the wish stays on disk. Switched on
  // again, the bind is made again.
  function serviceEnds() {
    var h = root.h
    var sent = root.lines().length
    var ourBind = root.ours("output", root.outputCombo)
    h.recreate(function() {
      root.until("end: the bind is taken back", function() {
        return root.lines().indexOf(root.unbindLine(root.outputCombo)) >= sent
      }, 6000, function() {
        var removals = root.lines().filter(function(line) { return /^hl\.unbind\(/.test(line) })
        h.equal(removals, [root.unbindLine(root.outputCombo)], "end: one removal, of our own bind")
        root.until("next start: bound again", function() {
          return root.row("output").status === "assigned" && root.table().indexOf(ourBind) !== -1
            && h.service.shortcutsBusy === false
        }, 15000, function() {
          h.equal(root.table().filter(function(bind) { return bind === ourBind }).length, 1,
            "next start: once")
          h.equal(root.table().length, 2, "next start: beside the user's bind, which nobody touched")
          h.equal(h.parts.store.values.shortcuts.output, root.outputCombo, "next start: from the saved wish")
          root.next()
        })
      })
    })
  }

  // A compositor whose configuration binds nothing at all: after a reload
  // its list is empty, which it can only say with the line it has for every
  // empty result. The saved shortcut is bound there like anywhere else.
  function bareDesktop() {
    var h = root.h
    var state = h.stubState("hyprctl") || {}
    state.binds = []
    h.setStubState("hyprctl", state)
    var sent = root.lines().length
    root.reloaded("bare", function() {
      var now = h.stubState("hyprctl").binds.map(function(bind) {
        return bind.modmask + " " + bind.key + " " + bind.description
      })
      h.equal(now, [root.ours("output", root.outputCombo)],
        "bare: the saved shortcut is bound on a desktop without any other bind")
      h.equal(root.lines().slice(sent), [root.bindLine("output", root.outputCombo)], "bare: with one line")
      h.equal(root.row("output").status, "assigned", "bare: and the row says so")
      root.next()
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", "SUPER", "A bind of the user"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no combination, nothing of the user's binds")
    root.next()
  }
}
