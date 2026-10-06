import QtQuick

// The whole service for a user who does not want history kept. The choice
// may have been made while the shell was not running, with a state file
// full of history still on disk: that history is gone from the file right
// after start-up and is not shown. What is played afterwards never reaches
// the file. And while the plugin is being disabled, when the host has
// already taken the facade and with it the settings, nothing is written at
// all: the choice survives the disabling and a later re-enabling.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0
  // When the state file was last written, at the moment of the revoke.
  property string stamp: ""
  property string text: ""

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"

  function stateDir() {
    return root.h.runDir + "/sbx/state/omajuke"
  }

  function stateFile() {
    return root.stateDir() + "/state.json"
  }

  // The settings entry says "no history", and the state file of an earlier
  // run, written when history was still on, holds a queue and recent tracks.
  function setup(h, done) {
    root.h = h
    var id = h.manifest.id
    h.shell.barConfig = { position: "top", layout: { left: [], center: [],
      right: [{ id: id, rememberHistory: false, preload: false }] } }
    var old = { id: root.idB, title: "An old track", channel: "An old channel", duration: 100, live: false }
    var queued = { id: root.idB, title: "An old track", channel: "An old channel", duration: 100, live: false,
      auto: false }
    var state = { version: 1, volume: 40, muted: false, proxyAck: false, prefs: {}, recents: [old],
      queue: { items: [queued], index: 0 } }
    h.exec(["/usr/bin/mkdir", "-p", root.stateDir()], null, function(code, out) {
      h.writeFile(root.stateFile(), JSON.stringify(state) + "\n")
      h.check(h.readFile(root.stateFile()).indexOf(root.idB) !== -1, "before: the old file holds history")
      done()
    })
  }

  function run(h) {
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.oldHistoryGoes, root.switchedOnAndOff, root.playsWithoutTrace, root.revoked, root.frozen,
      root.serviceEnds, root.reenabled, root.quiet
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

  // The state file as it is on disk right now, or null.
  function onDisk() {
    try {
      return JSON.parse(root.h.readFile(root.stateFile()))
    } catch (error) {
      return null
    }
  }

  function written(then) {
    root.h.exec(["/usr/bin/stat", "-c", "%y", root.stateFile()], null, function(code, out) { then(out) })
  }

  function row(id) {
    return { id: id, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  function oldHistoryGoes() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.equal(s.settings.rememberHistory, false, "start: history is off")
      h.equal([s.recents.length, s.queue.length, s.hasTrack], [0, 0, false],
        "start: the old history is not shown")
      h.equal(s.volume, 40, "start: the rest of the saved state is used")
      // Sooner than a save that waits for its turn would be written.
      root.until("start: the file is rewritten without it at once", function() {
        var state = root.onDisk()
        return state !== null && state.recents === undefined
      }, 500, function() {
        root.until("start: the choices reach the file", function() {
          var state = root.onDisk()
          return state !== null && state.prefs.preload === false
        }, 5000, root.startChecked)
      })
    })
  }

  function startChecked() {
    var h = root.h
    var state = root.onDisk()
    h.equal(Object.keys(state), ["version", "volume", "muted", "proxyAck", "prefs"],
      "start: no recents and no queue in the file")
    h.equal([state.volume, state.prefs], [40, { rememberHistory: false, preload: false }],
      "start: the volume is kept, and both choices are remembered in the file")
    h.equal(h.readFile(root.stateFile()).indexOf(root.idB), -1, "start: the old track is nowhere in it")
    h.exec(["/usr/bin/ls", "-A", root.stateDir()], null, function(code, out) {
      h.equal(out, "state.json\n", "start: and no other file holds it")
      root.next()
    })
  }

  // History is switched on again before anything was played. What the old
  // file held must not come back with it: it left the memory too.
  function switchedOnAndOff() {
    var h = root.h
    var s = h.service
    h.check(s.setSetting("rememberHistory", true), "on again: taken")
    root.until("on again: saved", function() {
      var state = root.onDisk()
      return state !== null && state.prefs.rememberHistory === true
    }, 5000, function() {
      var state = root.onDisk()
      h.equal([state.recents, state.queue], [[], { items: [], index: -1 }],
        "on again: the file has empty lists, not the old ones")
      h.equal(state.prefs, { rememberHistory: true, preload: false }, "on again: the other choice stands")
      h.check(s.setSetting("rememberHistory", false), "off again: taken")
      root.until("off again: the lists leave the file at once", function() {
        var again = root.onDisk()
        return again !== null && again.recents === undefined && again.prefs.rememberHistory === false
      }, 500, root.next)
    })
  }

  // The session itself works as always; only the disk hears nothing of it.
  function playsWithoutTrace() {
    var h = root.h
    var s = h.service
    h.check(s.playTrack(root.row(root.idA)), "play: a track is taken")
    root.until("play: it plays", function() { return s.playbackState === "playing" }, 8000, function() {
      h.equal([s.recents.length, s.queue.length], [1, 1],
        "play: recent tracks and queue work for the session")
      s.setVolume(33)
      root.until("play: the volume is saved", function() {
        var state = root.onDisk()
        return state !== null && state.volume === 33
      }, 5000, function() {
        h.equal(Object.keys(root.onDisk()), ["version", "volume", "muted", "proxyAck", "prefs"],
          "play: still no recents and no queue in the file")
        h.equal(h.readFile(root.stateFile()).indexOf(root.idA), -1, "play: the played track is nowhere in it")
        root.next()
      })
    })
  }

  // The host takes the facade away, as it does before it destroys the
  // service. From here on the settings can no longer be trusted, so the
  // state file is left exactly as it is, whatever happens.
  function revoked() {
    var h = root.h
    var s = h.service
    root.written(function(stamp) {
      root.stamp = stamp
      root.text = h.readFile(root.stateFile())
      h.check(stamp !== "", "revoke: the state file is there")
      h.revoke()
      h.equal(s.settings.rememberHistory, false, "revoke: history stays off without the facade")
      h.equal(s.setSetting("rememberHistory", true), false, "revoke: and cannot be switched on through it")
      s.setVolume(21)
      s.toggleMute()
      s.clearHistory()
      h.check(s.stop(), "revoke: stopped")
      h.equal([s.volume, s.muted], [21, true], "revoke: the service still does as it is told")
      root.next()
    })
  }

  // Longer than a save takes to start.
  function frozen() {
    var h = root.h
    h.after(1300, function() {
      root.written(function(stamp) {
        h.equal(stamp, root.stamp, "frozen: the state file was not written after the revoke")
        h.equal(h.readFile(root.stateFile()), root.text, "frozen: and is unchanged")
        root.next()
      })
    })
  }

  function serviceEnds() {
    var h = root.h
    var runtimeDir = h.parts.fs.paths.runtimeDir
    var until = Date.now() + 5000
    h.service.destroy()
    h.service = null
    h.parts = null
    var look = function() {
      h.exec(["/usr/bin/find", runtimeDir, "-mindepth", "1"], null, function(code, out) {
        if (out !== "" && Date.now() < until) { h.after(50, look); return }
        h.equal(out, "", "destroyed: the runtime directory is empty")
        h.after(1300, function() {
          root.written(function(stamp) {
            h.equal(stamp, root.stamp, "destroyed: the state file was not written on the way out")
            var state = root.onDisk()
            h.equal(Object.keys(state), ["version", "volume", "muted", "proxyAck", "prefs"],
              "destroyed: it has no recents and no queue")
            h.equal(state.prefs, { rememberHistory: false, preload: false },
              "destroyed: and it remembers the choices")
            h.alive(function(names) {
              h.equal(names, [], "destroyed: no recorded process is alive")
              root.next()
            })
          })
        })
      })
    }
    look()
  }

  // Disabling a plugin makes the host delete its settings entry. Enabled
  // again, the entry is new and says nothing about history; the default
  // would be to keep it. The state file knows better.
  function reenabled() {
    var h = root.h
    var id = h.manifest.id
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [{ id: id }] } }
    h.recreate(function() {
      var s = h.service
      root.until("re-enabled: ready", function() { return s.ready }, 5000, function() {
        h.equal(s.settings.rememberHistory, false, "re-enabled: history is still off")
        h.equal([s.settings.preload, s.settings.autoplay], [false, true],
          "re-enabled: so is the other choice, and a setting nobody chose has its default")
        h.check(s.playTrack(root.row(root.idC)), "re-enabled: a track is taken")
        var plays = function() { return s.playbackState === "playing" }
        root.until("re-enabled: it plays", plays, 8000, function() {
          s.setVolume(50)
          root.until("re-enabled: the volume is saved", function() {
            var state = root.onDisk()
            return state !== null && state.volume === 50
          }, 5000, function() {
            h.equal(Object.keys(root.onDisk()), ["version", "volume", "muted", "proxyAck", "prefs"],
              "re-enabled: no recents and no queue in the file")
            h.check(s.stop(), "re-enabled: stopped")
            var gone = function() { return h.parts.player.mpvState === "off" }
            root.until("re-enabled: mpv is gone", gone, 5000, root.next)
          })
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, root.idC, "An old track"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no title")
    root.next()
  }
}
