import QtQuick
import "../../../lib/Paths.js" as Paths

// core/Player.qml when one track follows another, against the mpv stub:
// which signals a replace, three loads in a row, a stop followed by a load,
// a natural end and a failed file produce, and which they do not. A track
// that is replaced or stopped ends without a word; only a track that ends
// by itself is reported as ended. At the end the player itself is destroyed
// while a track plays, and mpv has to go with it.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var player: null
  // Every signal of the player in order, spelled "name argument ...", and
  // every phase it went through.
  property var signals: []
  property var phases: []
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
      root.first, root.replace, root.threeInARow, root.threeWithAFalseStart, root.stopThenLoad,
      root.stopBehindLoad, root.stopAlone, root.loadWhileIdle, root.endWithSuccessor,
      root.failureWithSuccessor, root.brokenOff, root.end
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
    player.ended.connect(function(key, reason, fileError) {
      root.signals.push(("ended " + key + " " + reason + " " + fileError).trim())
    })
    player.idle.connect(function() { root.signals.push("idle") })
    player.exited.connect(function(crashed) { root.signals.push("exited " + crashed) })
    player.failed.connect(function(code) { root.signals.push("failed " + code) })
    player.phaseChanged.connect(function() { root.phases.push(player.phase) })
  }

  // Forgets what was reported so far, so that a step lists only its own.
  function fresh() {
    root.signals = []
    root.phases = []
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
    root.player.load(key, "AAAAAAAAAAA", "Track " + key, Paths.infoFile(root.fs.paths, key), { mode: mode })
  }

  function loads() {
    return root.h.log("mpv").filter(function(line) { return line.command[0] === "loadfile" })
  }

  function stops() {
    return root.h.log("mpv").filter(function(line) { return line.command[0] === "stop" }).length
  }

  function first() {
    root.load(1, "replace")
    root.until("the first track plays", root.plays(1), 8000, function() {
      root.h.equal(root.signals, ["idle", "loading 1", "started 1"], "a cold start")
      root.next()
    })
  }

  function replace() {
    var h = root.h
    root.fresh()
    root.load(2, "replace")
    root.until("the second track plays", root.plays(2), 5000, function() {
      h.equal(root.signals, ["loading 2", "started 2"], "a replace: no ended, no idle")
      // The old track winds down and is over before the new one begins.
      h.equal(root.phases, ["buffering", "idle", "loading", "buffering", "playing"], "a replace: the phases")
      root.next()
    })
  }

  function threeInARow() {
    var h = root.h
    root.fresh()
    var before = root.loads().length
    root.load(3, "replace")
    root.load(4, "replace")
    root.load(5, "replace")
    root.until("the last of three plays", root.plays(5), 5000, function() {
      h.equal(root.signals, ["loading 5", "started 5"], "three loads in a row: nothing for the first two")
      h.equal(root.loads().length, before + 3, "all three reached mpv")
      root.next()
    })
  }

  // mpv sometimes begins to open an earlier one of several loads and drops
  // it again at once. By then the player knows that entry was replaced: it
  // is neither reported nor taken for somebody else's file.
  function threeWithAFalseStart() {
    var h = root.h
    root.fresh()
    h.scenario({ mpv: "apart" })
    var stopped = root.stops()
    root.load(13, "replace")
    root.load(14, "replace")
    root.load(15, "replace")
    root.until("the last of three plays", root.plays(15), 5000, function() {
      h.equal(root.signals, ["loading 15", "started 15"],
        "a replaced entry that starts anyway is not reported")
      h.equal(root.stops(), stopped, "and it is not stopped as a foreign file")
      h.scenario({ mpv: "ok" })
      root.next()
    })
  }

  function stopThenLoad() {
    var h = root.h
    root.fresh()
    root.player.stopPlayback()
    h.equal([root.player.phase, root.player.currentKey, root.player.hasFile, root.player.duration],
      ["idle", 0, false, 0], "stopPlayback: no track from that moment")
    h.equal(root.signals, [], "and nothing is reported for it")
    root.load(6, "replace")
    root.until("the track loaded behind a stop plays", root.plays(6), 5000, function() {
      h.equal(root.signals, ["loading 6", "started 6"], "a stop and a load back to back: no idle in between")
      h.equal(root.player.mpvState, "running", "mpv was kept")
      root.next()
    })
  }

  // A stop right behind a load, with an mpv that had begun to open the
  // file before it read the stop: the load is forgotten, so its entry is
  // dead when mpv names it.
  function stopBehindLoad() {
    var h = root.h
    root.fresh()
    h.scenario({ mpv: "eager" })
    var stopped = root.stops()
    root.load(16, "replace")
    root.player.stopPlayback()
    root.until("mpv reports itself idle", function() { return root.signals.length > 0 }, 5000, function() {
      h.after(300, function() {
        h.equal(root.signals, ["idle"], "a load that was stopped before mpv answered is never reported")
        h.equal(root.stops(), stopped + 1, "and nothing but our own stop was sent")
        h.equal([root.player.phase, root.player.currentKey], ["idle", 0], "nothing is current")
        h.scenario({ mpv: "ok" })
        root.load(6, "replace")
        root.until("a track plays again", root.plays(6), 5000, root.next)
      })
    })
  }

  function stopAlone() {
    var h = root.h
    root.fresh()
    root.player.stopPlayback()
    root.until("mpv reports itself idle", function() { return root.signals.length > 0 }, 5000, function() {
      h.after(300, function() {
        h.equal(root.signals, ["idle"], "a stop alone: idle, and no ended")
        h.equal([root.player.mpvState, root.player.phase, root.player.currentKey], ["running", "idle", 0],
          "mpv stays, with nothing to play")
        var lines = h.log("mpv").length
        root.player.seek(10)
        root.player.setPause(true)
        h.after(200, function() {
          h.equal(h.log("mpv").length, lines, "an mpv without a track is not sent a seek or a pause")
          root.next()
        })
      })
    })
  }

  function loadWhileIdle() {
    var h = root.h
    root.fresh()
    root.load(7, "append-play")
    root.until("a track appended to an idle mpv plays", root.plays(7), 5000, function() {
      h.equal(root.signals, ["loading 7", "started 7"], "append-play while idle starts the track")
      h.equal(h.log("mpv-start").length, 1, "all of this in one mpv")
      root.next()
    })
  }

  // A track that ends by itself: mpv goes on to the next entry if it holds
  // one, and reports itself idle after the last.
  function endWithSuccessor() {
    var h = root.h
    root.fresh()
    h.scenario({ mpv: "eof:300" })
    root.load(8, "replace")
    root.load(9, "append-play")
    root.until("both tracks have ended", function() { return root.signals.indexOf("idle") !== -1 }, 8000,
      function() {
        h.equal(root.signals,
          ["loading 8", "started 8", "ended 8 eof", "loading 9", "started 9", "ended 9 eof", "idle"],
          "a natural end: ended, then the successor; after the last one, idle")
        h.equal([root.player.phase, root.player.currentKey], ["idle", 0], "nothing is current afterwards")
        root.next()
      })
  }

  function failureWithSuccessor() {
    var h = root.h
    root.fresh()
    h.scenario({ mpv: "load-error:1" })
    root.load(10, "replace")
    root.load(11, "append-play")
    root.until("the track behind a failed one plays", root.plays(11), 5000, function() {
      h.equal(root.signals,
        ["loading 10", "ended 10 error no audio or video data played", "loading 11", "started 11"],
        "a file that fails: ended with mpv's reason, then the successor by itself")
      root.next()
    })
  }

  // An end long before the end of the track is a broken connection.
  function brokenOff() {
    var h = root.h
    root.fresh()
    h.scenario({ mpv: "premature:400" })
    root.load(12, "replace")
    root.until("the track that broke off is reported", function() {
      return root.signals.length >= 3
    }, 5000, function() {
      h.equal(root.signals, ["loading 12", "started 12", "ended 12 error premature-eof"],
        "an early end is an error, not the end of the track")
      var position = root.player.positionNow()
      h.check(position > 0.2 && position < 3, "the position stays where it broke off")
      root.next()
    })
  }

  // The player is destroyed while a track plays, as it is when the plugin
  // is disabled or reloaded. mpv must go with it, without a word.
  function end() {
    var h = root.h
    h.scenario({ mpv: "ok" })
    root.load(17, "replace")
    root.until("a track plays", root.plays(17), 5000, function() {
      h.alive(function(before) {
        h.equal(before.length, 1, "one stub is running")
        root.fresh()
        root.player.destroy()
        h.after(500, function() {
          h.equal(root.signals, [], "a destroyed player reports nothing")
          h.alive(function(names) {
            h.equal(names, [], "and its mpv is gone with it")
            root.next()
          })
        })
      })
    })
  }
}
