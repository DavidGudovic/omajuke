import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Paths.js" as Paths

// core/Player.qml and the audio outputs, against the mpv stub. mpv is asked
// about its outputs only while somebody wants them listed or a saved output
// is set: nobody else pays for the question. A saved output is set on a
// fresh mpv before the first track is loaded, the loads wait for that, and
// they do not wait long. Only an output mpv has listed can be selected.
QtObject {
  id: root

  readonly property string speakers: "pipewire/stub.speakers"
  readonly property string headphones: "pipewire/stub.headphones"

  property var h: null
  property var runner: null
  property var fs: null
  property var player: null
  property var signals: []
  property var steps: []
  property int at: 0

  // yt-dlp only has to be an executable file here: the player hands its
  // path to mpv and never runs it.
  function setup(h, done) {
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ mpv: "ok" })
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.player = h.mount("core/Player.qml", { tools: h.tools, fs: root.fs })
    if (root.runner === null || root.fs === null || root.player === null) { h.finish(); return }
    root.listen()
    root.steps = [
      root.notAskedByDefault, root.watched, root.selects, root.unplugged, root.unwatched,
      root.savedBeforeFirstLoad, root.savedButMissing, root.doesNotWaitLong, root.withoutMpv
    ]
    root.fs.prepare()
    h.waitFor(function() { return root.fs.status !== "pending" }, 5000, function() {
      h.equal(root.fs.status, "ready", "the runtime folder is prepared")
      root.next()
    })
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function listen() {
    var player = root.player
    player.loading.connect(function(key) { root.signals.push("loading " + key) })
    player.started.connect(function(key) { root.signals.push("started " + key) })
    player.idle.connect(function() { root.signals.push("idle") })
    player.failed.connect(function(code) { root.signals.push("failed " + code) })
  }

  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function plays(key) {
    return function() { return root.player.currentKey === key && root.player.phase === "playing" }
  }

  function load(key, mode) {
    var file = Paths.infoFile(root.fs.paths, key)
    root.player.load(key, "AAAAAAAAAAA", "Track " + key, file, { mode: mode })
  }

  // What mpv was told, without the questions about the position.
  function sent() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return !(command[0] === "get_property" && command[1] === "time-pos")
    })
  }

  // The same since a mark, each command as short text: its name and its
  // first argument, and for a load the title instead of the address.
  function since(mark) {
    return root.sent().slice(mark).map(function(command) {
      if (command[0] === "loadfile") return "load " + command[4]["force-media-title"]
      if (command[0] === "set_property" && command[1] === "audio-device") return "output " + command[2]
      return command.slice(0, 2).join(" ")
    })
  }

  function aboutOutputs(texts) {
    return texts.filter(function(text) {
      return text.indexOf("audio-device") !== -1 || text.indexOf("output ") === 0
    })
  }

  function names() {
    return root.player.audioDevices.map(function(device) { return device.name })
  }

  function restart(then) {
    root.player.shutdown()
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, then)
  }

  function notAskedByDefault() {
    var h = root.h
    root.load(1, "replace")
    root.until("the first track plays", root.plays(1), 8000, function() {
      h.after(300, function() {
        h.equal(root.aboutOutputs(root.since(0)), [], "mpv was asked nothing about its outputs")
        h.equal([root.player.audioDevices, root.player.audioDevice], [[], ""], "and nothing is known of them")
        h.equal(root.player.setAudioDevice("auto"), false, "an output that was never listed is not selected")
        root.next()
      })
    })
  }

  function watched() {
    var h = root.h
    var mark = root.sent().length
    root.player.watchOutputs = true
    var listed = function() { return root.player.audioDevices.length > 0 }
    root.until("mpv has listed its outputs", listed, 3000,
      function() {
        h.equal(root.since(mark), ["observe_property 12", "observe_property 13"], "watched: both observed")
        h.equal(root.names(), ["auto", root.speakers, root.headphones], "the outputs, in mpv's order")
        h.equal(root.player.audioDevices[1], { name: root.speakers, description: "Stub speakers" },
          "each with its name and what it calls itself")
        h.check(Array.isArray(root.player.audioDevices), "the list is a plain array")
        var known = function() { return root.player.audioDevice === "auto" }
        root.until("and the one in use", known, 2000, root.next)
      })
  }

  function selects() {
    var h = root.h
    var mark = root.sent().length
    root.signals = []
    h.equal(root.player.setAudioDevice(root.headphones), true, "a listed output is selected")
    var refused = ["pipewire/stub.other", "alsa/default", "null", "pipewire/stub.speakers ", "", null, 7,
      { name: root.speakers }]
    h.equal(refused.filter(function(name) { return root.player.setAudioDevice(name) !== false }), [],
      "anything else is refused")
    var moved = function() { return root.player.audioDevice === root.headphones }
    root.until("mpv plays on it", moved, 3000,
      function() {
        h.equal(root.since(mark), ["output " + root.headphones], "one command, for the listed one")
        h.equal([root.signals, root.player.phase], [[], "playing"], "the track plays on")
        root.next()
      })
  }

  // A device goes away: mpv tells its new list, and what is no longer in
  // it can no longer be selected. What to fall back to is not decided here.
  function unplugged() {
    var h = root.h
    var mark = root.sent().length
    h.inject("mpv", ["stub-devices", [
      { name: "auto", description: "Autoselect device" },
      { name: root.speakers, description: "Stub speakers" },
      { name: "alsa/default", description: "Not selectable" }, { name: "pipewire/stub bad", description: "x" }
    ]])
    var changed = function() { return root.player.audioDevices.length === 2 }
    root.until("the list has changed", changed, 3000,
      function() {
        h.equal(root.names(), ["auto", root.speakers], "only what may be selected is listed")
        h.equal(root.player.audioDevice, root.headphones, "mpv itself stays on the device that went")
        h.equal(root.player.setAudioDevice(root.headphones), false, "which cannot be selected any more")
        h.equal(root.player.setAudioDevice("auto"), true, "the system default always can")
        var back = function() { return root.player.audioDevice === "auto" }
        root.until("mpv is back on the default", back, 3000,
          function() {
            h.equal(root.since(mark), ["output auto"], "nothing was sent but that")
            root.next()
          })
      })
  }

  function unwatched() {
    var h = root.h
    var mark = root.sent().length
    root.player.watchOutputs = false
    h.equal([root.player.audioDevices, root.player.audioDevice], [[], ""], "not watched: nothing is known")
    h.after(200, function() {
      h.equal(root.since(mark), ["unobserve_property 12", "unobserve_property 13"], "and mpv stops reporting")
      root.next()
    })
  }

  // A saved output: the fresh mpv is asked for its outputs, switched, and
  // only then given the tracks that waited.
  function savedBeforeFirstLoad() {
    var h = root.h
    root.restart(function() {
      var mark = root.sent().length
      root.player.startDevice = root.speakers
      root.load(2, "replace")
      root.load(3, "append-play")
      h.equal(root.player.entryKeys, [2, 3], "two loads wait")
      root.until("the track plays", root.plays(2), 8000, function() {
        var told = root.since(mark)
        var tail = told.slice(told.indexOf("get_property audio-device-list"))
        var expected = ["get_property audio-device-list", "output " + root.speakers, "load Track 2",
          "load Track 3"]
        h.equal(tail, expected, "asked, switched, and then the loads in their order")
        h.check(told.indexOf("observe_property 12") !== -1 && told.indexOf("observe_property 13") !== -1,
          "with a saved output the outputs are watched without being asked for")
        root.until("mpv plays on the saved output", function() {
          return root.player.audioDevice === root.speakers
        }, 3000, function() {
          h.equal([root.names().length, root.player.entryKeys], [3, [2, 3]], "listed, and both tracks held")
          root.next()
        })
      })
    })
  }

  // The saved output is not there (unplugged since): nothing is set, and
  // the track plays on the default.
  function savedButMissing() {
    var h = root.h
    root.restart(function() {
      var mark = root.sent().length
      root.player.startDevice = "pipewire/stub.gone"
      root.load(4, "replace")
      root.until("the track plays", root.plays(4), 8000, function() {
        var told = root.since(mark)
        h.equal(told.slice(told.indexOf("get_property audio-device-list")),
          ["get_property audio-device-list", "load Track 4"], "asked, nothing set, loaded")
        h.equal(root.player.audioDevice, "auto", "mpv plays on its default")
        root.next()
      })
    })
  }

  // An mpv that takes its time over the question. The loads wait for the
  // time allowed and no longer; the late answer changes nothing.
  function doesNotWaitLong() {
    var h = root.h
    root.restart(function() {
      var mark = root.sent().length
      h.scenario({ mpv: "slow-devices:" + (Const.TIMEOUTS.devicesMs + 1500) })
      root.player.startDevice = root.speakers
      var began = Date.now()
      root.load(5, "replace")
      var asked = function() { return root.since(mark).indexOf("get_property audio-device-list") !== -1 }
      root.until("mpv is asked", asked, 5000, function() {
        var connected = Date.now()
        h.check(root.since(mark).indexOf("load Track 5") === -1, "the load waits")
        root.until("the track plays", root.plays(5), 8000, function() {
          var waited = Date.now() - connected
          h.check(waited >= Const.TIMEOUTS.devicesMs - 200 && waited < Const.TIMEOUTS.devicesMs + 1200,
            "for about the time allowed (" + waited + " ms, " + (connected - began) + " ms after the call)")
          var set = function() {
            return root.since(mark).filter(function(text) { return text.indexOf("output ") === 0 })
          }
          h.equal(set(), [], "no output was set")
          h.after(2000, function() {
            h.equal(set(), [], "nor when the answer came after all: that is for whoever shows the outputs")
            h.equal([root.player.phase, root.player.currentKey, root.signals.indexOf("failed E_TIMEOUT")],
              ["playing", 5, -1], "the track plays")
            h.scenario({ mpv: "ok" })
            root.next()
          })
        })
      })
    })
  }

  function withoutMpv() {
    var h = root.h
    root.restart(function() {
      var mark = root.sent().length
      root.player.watchOutputs = true
      h.equal([root.player.audioDevices, root.player.audioDevice, root.player.setAudioDevice("auto")],
        [[], "", false], "without an mpv there are no outputs")
      h.after(200, function() {
        h.equal([root.since(mark), root.player.mpvState], [[], "off"], "and asking for them starts none")
        root.next()
      })
    })
  }
}
