import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Paths.js" as Paths

// core/Player.qml and the socket mpv is slow to open, or never opens. A
// socket that appears late must still be reached: each attempt uses a new
// socket object, because one whose first attempt failed never connects
// again. A socket that never appears must end as a failure within the time
// allowed, with the mpv that was started for it gone, and the player ready
// for the next try.
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
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.player = h.mount("core/Player.qml", { tools: h.tools, fs: root.fs })
    if (root.runner === null || root.fs === null || root.player === null) { h.finish(); return }
    root.listen()
    root.steps = [root.lateSocket, root.neverASocket, root.afterwards, root.end]
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
      root.signals.push("ended " + key + " " + reason)
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

  function load(key) {
    root.player.load(key, "AAAAAAAAAAA", "Track", Paths.infoFile(root.fs.paths, key), { mode: "replace" })
  }

  function plays(key) {
    return function() { return root.player.currentKey === key && root.player.phase === "playing" }
  }

  function off() {
    return root.player.mpvState === "off"
  }

  // The first attempts find no socket. A later one must connect.
  function lateSocket() {
    var h = root.h
    h.scenario({ mpv: "slow-socket:450" })
    var began = Date.now()
    root.load(1)
    root.until("a socket that appears late is reached", root.plays(1), 4000, function() {
      var took = Date.now() - began
      h.check(took >= 450 && took < 2500, "after the attempts that came too early")
      h.equal(root.signals, ["idle", "loading 1", "started 1"], "and the track starts as usual")
      root.player.shutdown()
      root.until("that mpv is gone", root.off, 5000, root.next)
    })
  }

  // The socket file of the last mpv is still there, and nothing listens
  // on it.
  function neverASocket() {
    var h = root.h
    h.scenario({ mpv: "no-socket" })
    root.signals = []
    var began = Date.now()
    root.load(2)
    var reported = function() { return root.signals.length > 0 }
    root.until("the wait for the socket ends", reported, 9000, function() {
      var took = Date.now() - began
      h.equal(root.signals, ["failed E_MPV_START"], "no socket: the failure, and nothing else")
      h.check(took >= Const.TIMEOUTS.socketMs - 500 && took <= Const.TIMEOUTS.socketMs + 1000,
        "within the time allowed for the socket")
      h.equal([root.player.phase, root.player.currentKey, root.player.hasFile], ["idle", 0, false],
        "nothing is current")
      h.equal(h.log("mpv-start").length, 2, "an mpv had been started for it")
      var asked = Date.now()
      root.until("that mpv is ended", root.off, 5000, function() {
        h.check(Date.now() - asked < Const.TIMEOUTS.quitMs, "at once: there is no socket to say quit on")
        h.alive(function(names) {
          h.equal(names, [], "the stub is gone")
          h.after(300, function() {
            h.equal(root.signals, ["failed E_MPV_START"], "and its exit is not reported")
            root.next()
          })
        })
      })
    })
  }

  function afterwards() {
    var h = root.h
    h.scenario({ mpv: "ok" })
    root.signals = []
    root.load(3)
    root.until("the next try works", root.plays(3), 8000, function() {
      h.equal(root.signals, ["idle", "loading 3", "started 3"], "the player is as good as new")
      h.equal(h.log("mpv-start").length, 3, "in a third mpv")
      root.next()
    })
  }

  function end() {
    var h = root.h
    root.player.shutdown()
    root.until("mpv is gone", root.off, 5000, function() {
      h.alive(function(names) {
        h.equal(names, [], "no stub is left")
        root.next()
      })
    })
  }
}
