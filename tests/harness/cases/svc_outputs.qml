import QtQuick

// The audio output through the whole service: the real player against the
// stub mpv. The list of outputs is mpv's, and mpv is asked for it only
// while somebody can use it. A choice moves this player's sound, is saved,
// and is in force again before the first track of the next mpv. When the
// chosen device goes away the system default stands in, and the choice is
// taken up again when the device is back.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string speakers: "pipewire/stub.speakers"
  readonly property string headphones: "pipewire/stub.headphones"

  // Related tracks are another case's subject. Here the user has switched
  // them off, so a queue ends where the user's own tracks end.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.becomesReady, root.nobodyAsks, root.panelOpens, root.chooses, root.refusals, root.overIpc,
      root.unplugged, root.pluggedBack, root.stops, root.nextStart, root.quiet
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

  function row(id) {
    return { id: id, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  function commands() {
    return root.h.log("mpv").map(function(line) { return line.command })
  }

  // The devices mpv was told to use, in order.
  function told() {
    return root.commands().filter(function(command) {
      return command[0] === "set_property" && command[1] === "audio-device"
    }).map(function(command) { return command[2] })
  }

  function asked() {
    return root.commands().filter(function(command) {
      return command[0] === "observe_property" && command[2] === "audio-device-list"
    }).length
  }

  function current() {
    var list = root.h.service.outputs.filter(function(output) { return output.current === true })
    return list.map(function(output) { return output.name })
  }

  function status() {
    return JSON.parse(root.h.service._ipcStatus()).output
  }

  function plugged(names) {
    var list = [{ name: "auto", description: "Autoselect device" }]
    if (names.indexOf(root.speakers) !== -1) list.push({ name: root.speakers, description: "Stub speakers" })
    if (names.indexOf(root.headphones) !== -1) {
      list.push({ name: root.headphones, description: "Stub headphones" })
    }
    root.h.inject("mpv", ["stub-devices", list])
  }

  function becomesReady() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.equal([s.outputs, s.outputName, s.outputNote, root.status()], [[], "System default", "", ""],
        "ready: no list while nothing plays, and the system default is the choice")
      h.equal([s.setOutput("auto"), s.cycleOutput()], [false, false], "ready: nothing to choose from")
      root.next()
    })
  }

  // A track plays with every panel closed and no output ever chosen: mpv
  // is not asked which outputs there are.
  function nobodyAsks() {
    var h = root.h
    var s = h.service
    h.check(s.playTrack(root.row(root.idA)), "nobody asks: a track is taken")
    var plays = function() { return s.playbackState === "playing" }
    root.until("nobody asks: it plays", plays, 8000, function() {
      h.after(300, function() {
        h.equal([root.asked(), s.outputs.length, root.told()], [0, 0, []],
          "nobody asks: the outputs were not asked for, and mpv was told none")
        root.next()
      })
    })
  }

  function panelOpens() {
    var h = root.h
    var s = h.service
    h.shell.panelShown = true
    s.notePanelOpen(true)
    var listed = function() { return s.outputs.length === 3 }
    root.until("panel: the outputs are listed", listed, 5000, function() {
      h.equal(s.outputs, [
        { name: "auto", label: "System default", current: true },
        { name: root.speakers, label: "Stub speakers", current: false },
        { name: root.headphones, label: "Stub headphones", current: false }
      ], "panel: the system default and the sinks, the default in use")
      h.equal(root.asked(), 1, "panel: mpv was asked once")
      root.next()
    })
  }

  function chooses() {
    var h = root.h
    var s = h.service
    h.check(s.setOutput(root.headphones), "choose: taken")
    root.until("choose: mpv plays on it", function() {
      return root.current().join() === root.headphones && s.outputName === "Stub headphones"
    }, 5000, function() {
      h.equal([root.told(), root.status(), s.outputNote], [[root.headphones], root.headphones, ""],
        "choose: mpv was told once, and the status names the output")
      root.until("choose: saved", function() {
        return h.readFile(h.parts.fs.paths.stateFile).indexOf("\"outputDevice\":\"" + root.headphones) !== -1
      }, 5000, root.next)
    })
  }

  // A name is only ever compared with the list mpv gave.
  function refusals() {
    var h = root.h
    var s = h.service
    var bad = ["pipewire/stub.other", "alsa/default", "constructor", "__proto__", "", "auto ", "AUTO"]
    for (var i = 0; i < bad.length; i++) {
      h.equal([s.setOutput(bad[i]), s._ipcOutput(bad[i])], [false, "invalid"], "refused name " + i)
    }
    h.equal([root.told(), root.status()], [[root.headphones], root.headphones],
      "refused: mpv heard nothing, and the choice stands")
    root.next()
  }

  // The panel closes. A script, or the shortcut, steps through the outputs.
  function overIpc() {
    var h = root.h
    var s = h.service
    h.shell.panelShown = false
    s.notePanelOpen(false)
    h.equal(s._ipcOutput("next"), "ok", "ipc: next is taken")
    var onDefault = function() { return root.current().join() === "auto" }
    root.until("ipc: back at the system default", onDefault, 5000,
      function() {
        h.equal([root.status(), h.parts.store.values.outputDevice, s.outputs.length], ["", "", 3],
          "ipc: the list wrapped around, nothing is chosen any more, and the list still comes")
        h.equal(s._ipcOutput(root.speakers), "ok", "ipc: an output by its name is taken")
        var onSpeakers = function() { return root.current().join() === root.speakers }
        root.until("ipc: mpv plays on it", onSpeakers, 5000,
          function() {
            h.equal(root.told(), [root.headphones, "auto", root.speakers], "ipc: mpv was told each step once")
            root.next()
          })
      })
  }

  // The chosen device is unplugged: the system default stands in, the user
  // is told, and the choice stays what it was.
  function unplugged() {
    var h = root.h
    var s = h.service
    root.plugged([root.headphones])
    root.until("unplugged: the default stands in", function() {
      return s.outputNote === "N_OUTPUT_FALLBACK"
    }, 5000, function() {
      h.equal(root.told().slice(-1), ["auto"], "unplugged: mpv was put on the system default")
      h.equal(h.parts.store.values.outputDevice, root.speakers, "unplugged: the choice is kept")
      h.check(s.errorText(s.outputNote) !== "", "unplugged: there is a sentence for it")
      h.equal(s.playbackState, "playing", "unplugged: the track plays on")
      root.next()
    })
  }

  function pluggedBack() {
    var h = root.h
    var s = h.service
    root.plugged([root.speakers, root.headphones])
    root.until("plugged back: the choice is taken up again", function() {
      return s.outputNote === "" && root.current().join() === root.speakers
    }, 5000, function() {
      h.equal(root.told().slice(-1), [root.speakers], "plugged back: mpv was told")
      root.next()
    })
  }

  function stops() {
    var h = root.h
    var s = h.service
    h.check(s.stop(), "stop: taken")
    var gone = function() { return h.parts.player.mpvState === "off" }
    root.until("stop: mpv is gone", gone, 5000, function() {
      h.equal([s.outputs, s.outputName, root.status()], [[], "Stub speakers", root.speakers],
        "stop: no list without mpv, and the choice keeps its name")
      root.next()
    })
  }

  // A new mpv is put on the saved output before it is given a track, so
  // that no track begins on another device and jumps.
  function nextStart() {
    var h = root.h
    var s = h.service
    var before = root.commands().length
    h.check(s.playTrack(root.row(root.idB)), "next start: a track is taken")
    root.until("next start: it plays", function() { return s.playbackState === "playing" }, 8000, function() {
      var fresh = root.commands().slice(before).map(function(command) {
        return command[0] === "set_property" ? command[1] + "=" + command[2] : command[0]
      })
      var device = fresh.indexOf("audio-device=" + root.speakers)
      h.check(device !== -1 && device < fresh.indexOf("loadfile"),
        "next start: the output is set before the track is loaded")
      h.equal(h.log("mpv-start").length, 2, "next start: in a fresh mpv")
      root.until("next start: and in use", function() { return root.current().join() === root.speakers },
        5000, function() {
          h.check(s.stop(), "next start: stopped")
          root.until("next start: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
            root.next)
        })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, "pipewire/", "Stub "]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no device")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
