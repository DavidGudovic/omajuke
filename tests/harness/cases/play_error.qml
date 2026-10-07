import QtQuick

// The whole service when a track cannot be played: every way a lookup fails
// ends in the error state with a code that has a sentence, with no mpv left
// running, and with the track still current so that it can be tried again.
// What the tools print about the failure names the video, and none of it
// may reach the surface or the log.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0
  // The lookup failures still to be played through.
  property var failures: []

  readonly property string id: "AAAAAAAAAAA"

  // The steps count lookups. With related tracks on, a track that starts
  // causes one more, a moment later, and whether it is counted would depend
  // on that moment. Related tracks have their own cases; here the user has
  // switched them off.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "refused", mpv: "ok" })
    root.failures = [
      ["network", "E_NETWORK"], ["blocked", "E_YT_BLOCKED"], ["account", "E_NEEDS_ACCOUNT"],
      ["not-started", "E_NOT_STARTED"], ["unknown", "E_YTDLP_FAILED"], ["garbage", "E_BAD_OUTPUT"],
      ["non-ascii", "E_BAD_OUTPUT"], ["wrong-id", "E_BAD_OUTPUT"]
    ]
    root.steps = [
      root.becomesReady, root.refused, root.eachFailure, root.triedAgain, root.mpvDies, root.afterTheCrash,
      root.stoppedFromError, root.quiet
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

  function row() {
    return { id: root.id, title: "Synthetic track", channel: "Synthetic Channel", duration: 213, live: false }
  }

  function becomesReady() {
    root.until("ready", function() { return root.h.service.ready }, 5000, root.next)
  }

  // A video YouTube does not hand out.
  function refused() {
    var h = root.h
    var s = h.service
    h.check(s.playTrack(root.row()), "refused: the row is taken")
    root.until("refused: ends in the error state", function() { return s.playbackState === "error" }, 8000,
      function() {
        h.equal(s.errorCode, "E_YT_REFUSED", "refused: the code")
        h.equal(s.errorText(s.errorCode), "YouTube refused that video", "refused: with its text")
        h.equal(s.tooltip, "YouTube refused that video", "refused: the icon says the same")
        h.equal([s.playing, s.paused, s.hasTrack, s.queueIndex], [false, false, true, 0],
          "refused: nothing plays, the track stays current")
        h.equal(s.recents, [], "refused: a track that never played is not among the recent ones")
        h.equal(h.parts.player.mpvState, "off", "refused: mpv off")
        h.equal([h.log("ytdlp").length, h.log("mpv-start").length], [1, 0],
          "refused: one lookup, and mpv was never started")
        h.equal(JSON.parse(s._ipcStatus()).error, "E_YT_REFUSED", "refused: the status carries the code")
        root.next()
      })
  }

  // Every other way a lookup ends badly, each started by the user anew.
  function eachFailure() {
    var h = root.h
    var s = h.service
    if (root.failures.length === 0) { root.next(); return }
    var failure = root.failures.shift()
    var label = "lookup " + failure[0]
    var before = h.log("ytdlp").length
    h.scenario({ ytdlp: failure[0], mpv: "ok" })
    h.check(s.playTrack(root.row()), label + ": taken")
    h.equal([s.playbackState, s.errorCode], ["resolving", ""], label + ": a new attempt clears the old error")
    root.until(label + ": ends in the error state", function() { return s.playbackState === "error" }, 8000,
      function() {
        h.equal(s.errorCode, failure[1], label + ": the code")
        h.check(s.errorText(s.errorCode) !== "", label + ": the code has a sentence")
        h.equal([h.log("ytdlp").length - before, h.log("mpv-start").length, h.parts.player.mpvState],
          [1, 0, "off"], label + ": one lookup, no mpv")
        root.eachFailure()
      })
  }

  // The play button in the error state: one new lookup, and this time the
  // track plays.
  function triedAgain() {
    var h = root.h
    var s = h.service
    var before = h.log("ytdlp").length
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    h.check(s.playPause(), "again: taken")
    root.until("again: plays", function() { return s.playbackState === "playing" }, 8000, function() {
      h.equal([s.errorCode, h.log("ytdlp").length - before, h.log("mpv-start").length], ["", 1, 1],
        "again: no error left, one more lookup, one mpv")
      h.equal(s.recents.length, 1, "again: now it is among the recent ones")
      root.next()
    })
  }

  // mpv goes away under a playing track.
  function mpvDies() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "die:400" })
    h.check(s.stop(), "crash: the track before is stopped")
    root.until("crash: the old mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
      function() {
        h.check(s.playTrack(root.row()), "crash: taken")
        root.until("crash: ends in the error state", function() { return s.playbackState === "error" }, 8000,
          function() {
            h.equal(s.errorCode, "E_MPV_EXITED", "crash: the code")
            h.equal(s.errorText(s.errorCode), "The player stopped unexpectedly", "crash: with its text")
            h.equal([h.parts.player.mpvState, s.hasTrack, s.playing], ["off", true, false],
              "crash: mpv off, the track stays current")
            root.next()
          })
      })
  }

  function afterTheCrash() {
    var h = root.h
    var s = h.service
    var mpvs = h.log("mpv-start").length
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    h.check(s.playPause(), "after the crash: taken")
    var plays = function() { return s.playbackState === "playing" }
    root.until("after the crash: plays", plays, 8000, function() {
      h.equal(h.log("mpv-start").length - mpvs, 1, "after the crash: a new mpv")
      root.next()
    })
  }

  // Another video: the one that plays has been looked up and would not be
  // asked for again.
  function stoppedFromError() {
    var h = root.h
    var s = h.service
    var other = { id: "BBBBBBBBBBB", title: "Another", channel: "", duration: null, live: true }
    h.scenario({ ytdlp: "refused", mpv: "ok" })
    h.check(s.playTrack(other), "stop: a failing track is taken")
    root.until("stop: it fails", function() { return s.playbackState === "error" }, 8000, function() {
      h.check(s.stop(), "stop: taken in the error state")
      h.equal([s.playbackState, s.errorCode, s.hasTrack, s.tooltip], ["idle", "", false, "OmaJuke"],
        "stop: idle, and the error is gone")
      var gone = function() { return h.parts.player.mpvState === "off" }
      root.until("stop: mpv is gone", gone, 5000, function() {
        h.alive(function(names) {
          h.equal(names, [], "stop: no stub is left running")
          root.next()
        })
      })
    })
  }

  // The stub words its error lines like the real tool, the id included.
  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.indexOf("Configuration Loaded") !== -1, "log: readable while the case runs")
    h.check(log.indexOf(root.id) === -1 && log.indexOf("BBBBBBBBBBB") === -1 && log.indexOf("watch?v") === -1,
      "log: no id, no address")
    var printed = ["Private video", "ERROR:", "Reading URLs", "Synthetic", "not what was asked"]
    h.equal(printed.filter(function(text) { return log.indexOf(text) !== -1 }), [],
      "log: nothing a tool printed, and no title")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: "].filter(function(mark) {
      return log.indexOf(mark) !== -1
    })
    h.equal(named, [], "log: no message from the plugin")
    root.next()
  }
}
