import QtQuick
import "../../../lib/Const.js" as Const

// The whole service when something else controls mpv. mpv's MPRIS script
// puts the player on the session bus, where the desktop's media keys and
// any other program can reach it: they can stop it, tell it to quit, and
// make it open an address of their choice. A stop from there is a stop;
// a file the service did not load is never adopted, it is stopped at once.
// The mpv stub carries out injected commands as if another program had
// sent them.
//
// A stop from outside is also where the service asks mpv a question and
// tells it to quit in one breath, so this is where the case makes sure
// that such a quit is heard.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.becomesReady, root.stoppedFromOutside, root.foreignFile, root.quitFromOutside, root.quitIsHeard,
      root.quiet
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

  // What mpv was sent, without the questions about the position.
  function sent() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return !(command[0] === "get_property" && command[1] === "time-pos")
    })
  }

  function mpvOff() {
    return root.h.parts.player.mpvState === "off"
  }

  // Starts the track and goes on when it plays.
  function play(label, then) {
    var h = root.h
    var s = h.service
    var row = { id: root.idA, title: "A track", channel: "A channel", duration: 200, live: false }
    h.check(s.playTrack(row), label + ": a track is taken")
    root.until(label + ": it plays", function() { return s.playbackState === "playing" }, 8000, then)
  }

  function becomesReady() {
    root.until("ready", function() { return root.h.service.ready }, 5000, root.next)
  }

  // The media Stop key.
  function stoppedFromOutside() {
    var h = root.h
    var s = h.service
    root.play("stop", function() {
      var before = root.sent().length
      h.inject("mpv", ["stop"])
      root.until("stop: idle", function() { return s.playbackState === "idle" }, 5000, function() {
        h.equal([s.hasTrack, s.queueIndex, s.errorCode, s.tooltip], [false, -1, "", "OmaJuke"],
          "stop: as if the user had stopped it")
        root.until("stop: mpv quits", root.mpvOff, 5000, function() {
          h.equal(root.sent().slice(before), [["quit"]], "stop: the only thing mpv was told is to quit")
          root.next()
        })
      })
    })
  }

  // Another program makes mpv open something. mpv starts on it before
  // anybody can object; what the service can do is stop it, and that is the
  // very next thing it says.
  function foreignFile() {
    var h = root.h
    var s = h.service
    root.play("foreign", function() {
      var before = root.sent().length
      var loads = root.sent().filter(function(command) { return command[0] === "loadfile" }).length
      h.inject("mpv", ["loadfile", "elsewhere", "replace"])
      root.until("foreign: idle", function() { return s.playbackState === "idle" }, 5000, function() {
        var after = root.sent().slice(before)
        h.equal(after[0], ["stop"], "foreign: stop is our next command")
        h.equal(root.sent().filter(function(command) { return command[0] === "loadfile" }).length, loads,
          "foreign: nothing was loaded in answer")
        h.equal([s.hasTrack, s.errorCode], [false, ""], "foreign: no track, no error")
        root.until("foreign: mpv quits", root.mpvOff, 5000, function() {
          h.equal(root.sent().slice(before), [["stop"], ["quit"]], "foreign: stopped, then told to quit")
          root.next()
        })
      })
    })
  }

  // The media interface can also tell mpv to quit.
  function quitFromOutside() {
    var h = root.h
    var s = h.service
    root.play("quit", function() {
      var before = root.sent().length
      h.inject("mpv", ["quit"])
      root.until("quit: idle", function() { return s.playbackState === "idle" }, 5000, function() {
        h.equal([s.hasTrack, s.errorCode], [false, ""], "quit: a stop, not an error")
        root.until("quit: mpv is gone", root.mpvOff, 5000, function() {
          h.equal(root.sent().slice(before), [], "quit: mpv was told nothing more")
          // And the service is as usable as before.
          root.play("after the quit", function() {
            h.equal(h.log("mpv-start").length, 4, "after the quit: a fourth mpv")
            h.check(s.stop(), "after the quit: stopped")
            root.until("after the quit: mpv is gone", root.mpvOff, 5000, root.next)
          })
        })
      })
    })
  }

  // mpv answers one command at a time and stops reading a client at the
  // first answer it cannot deliver. When playback stops under it, the
  // service asks where the track was and, a moment later, tells mpv to
  // quit. If it hung up right behind the quit, the answer to the question
  // could not be delivered and the quit would never be read: mpv would idle
  // on until the service ends it with a signal. Here the stub reads its
  // client exactly like that and takes its time to answer, so a service
  // that does not wait for the answer to its quit fails every time.
  function quitIsHeard() {
    var h = root.h
    var s = h.service
    root.play("heard", function() {
      var before = h.log("mpv").length
      var starts = h.log("mpv-start").length
      h.scenario({ ytdlp: "ok", mpv: "ordered:40" })
      var stopped = Date.now()
      h.inject("mpv", ["stop"])
      var gone = function() { return s.playbackState === "idle" && root.mpvOff() }
      root.until("heard: mpv is gone", gone, 5000, function() {
        var took = Date.now() - stopped
        h.scenario({ ytdlp: "ok", mpv: "ok" })
        var told = h.log("mpv").slice(before).map(function(line) { return line.command })
        h.equal(told.slice(0, 1), [["get_property", "time-pos"]], "heard: the service had just asked")
        h.equal(told.slice(-1), [["quit"]], "heard: and the quit behind the question reached mpv")
        // The signal that follows a quit nobody answered comes after
        // quitMs. A quit that was heard ends mpv in a fraction of that.
        h.check(took < Const.TIMEOUTS.quitMs - 500, "heard: mpv went by itself, not by a signal")
        h.equal([s.errorCode, h.log("mpv-start").length], ["", starts], "heard: no error, and no new mpv")
        root.next()
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, "elsewhere"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no address")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
