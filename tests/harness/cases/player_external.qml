import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Paths.js" as Paths

// core/Player.qml when somebody else steers mpv. Any program on the session
// bus can stop it, step through its playlist or make it open a file of its
// own choice. The player follows what happens to its own entries, never
// adopts an entry it did not create (it stops it), and when its own load is
// lost behind such a file, the wait for that load still ends: with a
// failure, after the time a load is allowed, never in silence.
//
// The last step waits for that time to pass, so this case takes a while.
QtObject {
  id: root

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
      root.stoppedFromOutside, root.foreignFile, root.nextFromOutside, root.previousFromOutside,
      root.lostLoad, root.end
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
  }

  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function load(key, mode) {
    root.player.load(key, "AAAAAAAAAAA", "Track", Paths.infoFile(root.fs.paths, key), { mode: mode })
  }

  function plays(key) {
    return function() { return root.player.currentKey === key && root.player.phase === "playing" }
  }

  function told(text) {
    return function() { return root.signals.indexOf(text) !== -1 }
  }

  function facts() {
    var player = root.player
    return [player.mpvState, player.phase, player.currentKey, player.hasFile]
  }

  // The commands the stub has received, as JSON text, without the
  // questions about the position: those only read, and how many there are
  // depends on timing.
  function sent() {
    return root.h.log("mpv").map(function(line) { return JSON.stringify(line.command) })
      .filter(function(text) { return text !== "[\"get_property\",\"time-pos\"]" })
  }

  function watchdogRuns() {
    var parts = root.player.resources
    var timers = []
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && typeof parts[i].interval === "number" && typeof parts[i].running === "boolean") {
        timers.push(parts[i])
      }
    }
    if (timers.length !== 1 || timers[0].interval !== Const.TIMEOUTS.loadMs) {
      root.h.check(false, "the player has exactly one timer, the load watchdog")
      return false
    }
    return timers[0].running
  }

  // What a media controller's Stop does.
  function stoppedFromOutside() {
    var h = root.h
    root.load(1, "replace")
    root.until("the track plays", root.plays(1), 8000, function() {
      root.signals = []
      h.inject("mpv", ["stop"])
      root.until("a stop from outside is reported", root.told("idle"), 5000, function() {
        h.after(300, function() {
          h.equal(root.signals, ["idle"], "as idle: the track did not end by itself")
          h.equal(root.facts(), ["running", "idle", 0, false], "mpv stays, with nothing to play")
          root.next()
        })
      })
    })
  }

  // What a media controller's OpenUri does: mpv replaces its playlist with
  // a file the service never asked for.
  function foreignFile() {
    var h = root.h
    root.load(2, "replace")
    root.until("the track plays", root.plays(2), 8000, function() {
      root.signals = []
      var mark = root.sent().length
      h.inject("mpv", ["loadfile", "somebody-elses-file", "replace"])
      root.until("the foreign file is answered", function() { return root.sent().length > mark }, 5000,
        function() {
          root.until("mpv is idle again", root.told("idle"), 5000, function() {
            h.after(300, function() {
              h.equal(root.sent().slice(mark), ["[\"stop\"]"], "with a stop, and with nothing else")
              h.equal(root.signals, ["idle"], "the foreign file is never reported as loading")
              h.equal(root.facts(), ["running", "idle", 0, false], "and nothing is current")
              h.check(!root.watchdogRuns(), "no load is being waited for")
              root.next()
            })
          })
        })
    })
  }

  // What Next and Previous do: mpv moves to another entry it holds.
  function nextFromOutside() {
    var h = root.h
    root.load(3, "replace")
    root.load(4, "append-play")
    root.until("the first of two entries plays", root.plays(3), 8000, function() {
      root.signals = []
      var mark = root.sent().length
      h.inject("mpv", ["playlist-next", "weak"])
      root.until("the player follows mpv to the next entry", root.plays(4), 5000, function() {
        h.equal(root.signals, ["loading 4", "started 4"], "loading and started for the other track only")
        h.equal(root.sent().slice(mark), [], "and the player sent nothing")
        root.next()
      })
    })
  }

  // An entry that was played stays one of ours: mpv can start it again.
  function previousFromOutside() {
    var h = root.h
    root.signals = []
    h.inject("mpv", ["playlist-prev", "weak"])
    root.until("the player follows mpv back", root.plays(3), 5000, function() {
      h.equal(root.signals, ["loading 3", "started 3"], "back to the entry before, the same way")
      root.next()
    })
  }

  // On a cold start our load is answered and then lost behind a file from
  // outside. The fresh mpv's first idle report and the one that follows
  // our stop both arrive while the load is awaited; neither may end the
  // only timer that bounds it.
  function lostLoad() {
    var h = root.h
    root.player.shutdown()
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      h.scenario({ mpv: "lose-load" })
      root.signals = []
      var mark = root.sent().length
      var began = Date.now()
      root.load(5, "replace")
      root.until("the foreign file is stopped", function() {
        return root.sent().indexOf("[\"stop\"]", mark) !== -1
      }, 8000, function() {
        root.until("mpv has reported idle twice", function() { return root.signals.length >= 2 }, 3000,
          function() { root.awaitedInVain(began) })
      })
    })
  }

  function awaitedInVain(began) {
    var h = root.h
    h.equal(root.signals, ["idle", "idle"], "lost load: idle from the fresh mpv and after our stop")
    h.equal(root.facts(), ["running", "idle", 0, false], "nothing is current")
    h.check(root.watchdogRuns(), "and the watchdog is still running")
    root.until("the wait ends", root.told("failed E_TIMEOUT"), Const.TIMEOUTS.loadMs + 3000, function() {
      var took = Date.now() - began
      h.equal(root.signals, ["idle", "idle", "failed E_TIMEOUT"], "with a failure, and nothing before it")
      h.check(took >= Const.TIMEOUTS.loadMs - 500 && took <= Const.TIMEOUTS.loadMs + 2000,
        "after the time a load is allowed")
      h.check(!root.watchdogRuns(), "the watchdog has stopped")
      var last = root.sent()
      h.equal(last[last.length - 1], "[\"stop\"]", "mpv is told to drop whatever it has")
      h.equal(root.facts(), ["running", "idle", 0, false], "what becomes of mpv is its owner's call")
      root.next()
    })
  }

  function end() {
    var h = root.h
    h.scenario({ mpv: "ok" })
    root.player.shutdown()
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      h.alive(function(names) {
        h.equal(names, [], "no stub is left")
        root.next()
      })
    })
  }
}
