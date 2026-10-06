import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Paths.js" as Paths

// core/Player.qml and the end of an mpv, against the mpv stub. An mpv that
// goes away by itself is reported, as crashed or not. One that is shut down
// is told to quit, exits by itself, and is not reported; the socket file it
// leaves behind is not touched by anything, and the next mpv binds over it.
// And a shutdown or a stop made from inside a handler silences what mpv had
// already sent about the entries it held.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var player: null
  property var signals: []
  // What the handler of "ended" does: "", "shutdown" or "stop".
  property string onEnded: ""
  property var steps: []
  property int at: 0

  readonly property string noData: "no audio or video data played"

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
    root.steps = [
      root.crashes, root.crashesAtStart, root.quitFromOutside, root.hangsUp, root.shutdown,
      root.loadBehindShutdown,
      root.loadAfterExit, root.shutdownBehindLoad, root.stopBehindColdLoad, root.stubbornMpv,
      root.shutdownInsideHandler, root.stopInsideHandler, root.lostWithExit, root.end
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
      // What the playback part does when a track failed for good.
      if (root.onEnded === "shutdown") player.shutdown()
      else if (root.onEnded === "stop") player.stopPlayback()
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

  function off() {
    return root.player.mpvState === "off"
  }

  function told(text) {
    return function() { return root.signals.indexOf(text) !== -1 }
  }

  function facts() {
    var player = root.player
    return [player.mpvState, player.phase, player.currentKey, player.hasFile]
  }

  // How many commands of that name the stub has received.
  function count(name) {
    return root.h.log("mpv").filter(function(line) { return line.command[0] === name }).length
  }

  function lastCommand() {
    var lines = root.h.log("mpv")
    return lines.length > 0 ? lines[lines.length - 1].command : null
  }

  // The player's timers. It has one: the watchdog over a load.
  function watchdogs() {
    var found = []
    var parts = root.player.resources
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i]
      if (part && typeof part.interval === "number" && typeof part.running === "boolean") found.push(part)
    }
    return found
  }

  function watchdogRuns() {
    var timers = root.watchdogs()
    if (timers.length !== 1 || timers[0].interval !== Const.TIMEOUTS.loadMs) {
      root.h.check(false, "the player has exactly one timer, the load watchdog")
      return false
    }
    return timers[0].running
  }

  // then(names): the names in a directory.
  function list(dir, then) {
    root.h.exec(["/usr/bin/ls", "-A", dir], null, function(code, out) {
      then(out.split("\n").filter(function(name) { return name !== "" }))
    })
  }

  function crashes() {
    var h = root.h
    h.scenario({ mpv: "die:700" })
    root.load(1, "replace")
    root.until("an mpv that dies is reported", root.told("exited true"), 8000, function() {
      h.equal(root.signals, ["idle", "loading 1", "started 1", "exited true"], "a crash while a track plays")
      h.equal(root.facts(), ["off", "idle", 0, false], "nothing is current afterwards")
      h.check(!root.watchdogRuns(), "and no timer is left running")
      root.next()
    })
  }

  // An mpv that fails before its socket is up, with an exit code that does
  // not say "cannot be run": a crash, not a missing mpv.
  function crashesAtStart() {
    var h = root.h
    h.scenario({ mpv: "die:1" })
    root.signals = []
    root.load(2, "replace")
    root.until("an mpv that dies while starting is reported", function() {
      return root.signals.length > 0
    }, 8000, function() {
      h.equal(root.signals, ["exited true"], "as crashed, and the load that waited for it is not kept")
      h.equal(root.facts(), ["off", "idle", 0, false], "nothing is current")
      h.after(400, function() {
        h.equal(h.log("mpv-start").length, 2, "no mpv is started again by itself")
        root.next()
      })
    })
  }

  // What a media controller's Quit does.
  function quitFromOutside() {
    var h = root.h
    h.scenario({ mpv: "ok" })
    root.signals = []
    root.load(3, "replace")
    root.until("the track plays", root.plays(3), 8000, function() {
      h.inject("mpv", ["quit"])
      root.until("an mpv that was told to quit by somebody else is reported", root.told("exited false"), 5000,
        function() {
          h.equal(root.signals, ["idle", "loading 3", "started 3", "exited false"], "as gone, not as crashed")
          h.equal(root.facts(), ["off", "idle", 0, false], "nothing is current")
          root.next()
        })
    })
  }

  // An mpv that closes the connection and lives on can no longer be told
  // anything. It is given the time a quit takes and is then ended, so that
  // it never plays on with nobody to stop it.
  function hangsUp() {
    var h = root.h
    h.scenario({ mpv: "hang-up:600" })
    root.signals = []
    root.load(30, "replace")
    root.until("the track plays", root.plays(30), 8000, function() {
      h.scenario({ mpv: "ok" })
      var began = Date.now()
      root.until("the mpv that hung up is reported", function() {
        return root.signals.length > 3
      }, Const.TIMEOUTS.quitMs + Const.TIMEOUTS.termMs + 3000, function() {
        var took = Date.now() - began
        h.equal(root.signals, ["idle", "loading 30", "started 30", "exited true"],
          "as gone, and not by itself")
        h.check(took >= Const.TIMEOUTS.quitMs - 700, "after it had the time to exit by itself")
        h.equal(root.facts(), ["off", "idle", 0, false], "nothing is current")
        h.alive(function(names) {
          h.equal(names, [], "and it is not left running")
          root.next()
        })
      })
    })
  }

  function shutdown() {
    var h = root.h
    root.signals = []
    root.load(4, "replace")
    root.until("the track plays", root.plays(4), 8000, function() {
      var starts = h.log("mpv-start")
      var pid = starts[starts.length - 1].pid
      var told = root.signals.length
      var asked = Date.now()
      root.player.shutdown()
      h.equal(root.facts(), ["stopping", "idle", 0, false], "shutdown: nothing is current from that moment")
      root.until("mpv is gone", root.off, 5000, function() {
        h.check(Date.now() - asked < Const.TIMEOUTS.quitMs, "before any signal would have been sent")
        h.equal(root.lastCommand(), ["quit"], "quit is the last thing mpv was told")
        h.equal(root.signals.length, told, "its exit is not reported")
        root.list(h.runDir + "/oj-stub", function(records) {
          // The stub removes its own record only when it exits by itself.
          h.check(records.indexOf("mpv." + pid + ".pid") === -1, "mpv exited by itself, with code 0")
          root.list(root.fs.paths.runtimeDir, function(names) {
            h.check(names.indexOf("mpv.sock") !== -1, "the socket file mpv left behind is still there")
            root.next()
          })
        })
      })
    })
  }

  // A load right behind a shutdown waits for the old mpv to go and is then
  // played by a new one, which binds over the socket file of the old.
  function loadBehindShutdown() {
    var h = root.h
    root.signals = []
    root.load(5, "replace")
    root.until("the track plays", root.plays(5), 8000, function() {
      var before = h.log("mpv-start").length
      root.signals = []
      root.player.shutdown()
      root.load(6, "replace")
      h.equal(root.player.mpvState, "stopping", "the old mpv is still on its way out")
      root.until("the track behind the shutdown plays", root.plays(6), 8000, function() {
        h.equal(root.signals, ["idle", "loading 6", "started 6"],
          "in a fresh mpv, and nothing from the old one")
        h.equal(h.log("mpv-start").length, before + 1, "exactly one mpv was started for it")
        root.next()
      })
    })
  }

  function loadAfterExit() {
    var h = root.h
    var before = h.log("mpv-start").length
    root.player.shutdown()
    root.until("mpv is gone", root.off, 5000, function() {
      root.signals = []
      // In the very turn the exit was noticed.
      root.load(7, "replace")
      root.until("a load right after the exit plays", root.plays(7), 8000, function() {
        h.equal(root.signals, ["idle", "loading 7", "started 7"], "in a fresh mpv")
        h.equal(h.log("mpv-start").length, before + 1, "one more mpv")
        root.next()
      })
    })
  }

  // A shutdown right behind a load. While the old mpv is still on its way
  // out the load is only remembered, and the shutdown drops it: no mpv is
  // started for it. With no mpv running the load has started one, and the
  // shutdown ends that before it ever played.
  function shutdownBehindLoad() {
    var h = root.h
    var before = h.log("mpv-start").length
    root.signals = []
    root.player.shutdown()
    root.load(20, "replace")
    root.player.shutdown()
    root.until("mpv is gone", root.off, 5000, function() {
      h.after(400, function() {
        h.equal(h.log("mpv-start").length, before, "a remembered start is dropped by the shutdown")
        h.equal([root.signals, root.facts()], [[], ["off", "idle", 0, false]], "and nothing is reported")
        root.load(21, "replace")
        root.player.shutdown()
        root.player.shutdown()
        h.equal(root.facts(), ["stopping", "idle", 0, false], "an mpv that was just started is stopped")
        root.until("it is gone", root.off, 5000, function() {
          h.after(400, function() {
            h.equal(root.signals, [], "a load that was shut down before it started reports nothing")
            h.equal(h.log("mpv-start").length <= before + 1, true, "and no mpv is started for it afterwards")
            h.alive(function(names) {
              h.equal(names, [], "no stub is left")
              root.next()
            })
          })
        })
      })
    })
  }

  // A stop right behind the load that started mpv: the load is forgotten
  // while it still waits for the socket, so the new mpv is never sent it.
  function stopBehindColdLoad() {
    var h = root.h
    var loads = root.count("loadfile")
    root.signals = []
    root.load(24, "replace")
    root.player.stopPlayback()
    root.until("the mpv that was started reports itself idle", root.told("idle"), 8000, function() {
      h.after(300, function() {
        h.equal(root.signals, ["idle"], "a load that was stopped while mpv started is not reported")
        h.equal(root.count("loadfile"), loads, "and was never sent")
        h.equal(root.facts(), ["running", "idle", 0, false], "mpv is there, with nothing to play")
        root.player.shutdown()
        root.until("mpv is gone", root.off, 5000, root.next)
      })
    })
  }

  // An mpv that ignores quit and SIGTERM is still ended: the stop goes on
  // to SIGTERM and then to the signal nothing can ignore. A load made in
  // the meantime waits and is played by the next mpv.
  function stubbornMpv() {
    var h = root.h
    h.scenario({ mpv: "stubborn" })
    root.signals = []
    root.load(22, "replace")
    root.until("the track plays", root.plays(22), 8000, function() {
      var starts = h.log("mpv-start")
      var pid = starts[starts.length - 1].pid
      var asked = Date.now()
      root.signals = []
      root.player.shutdown()
      h.after(300, function() {
        // The stub has read the quit by now; the next mpv is an ordinary one.
        h.scenario({ mpv: "ok" })
        root.load(23, "replace")
        h.after(Const.TIMEOUTS.quitMs + 200, function() {
          h.equal(root.player.mpvState, "stopping", "after SIGTERM it is still there")
          h.alive(function(names) {
            h.equal(names, ["mpv." + pid], "alive, and nothing else was started next to it")
            root.until("it is ended all the same", function() {
              return h.log("mpv-start").length === starts.length + 1
            }, 5000, function() {
              var took = Date.now() - asked
              var whole = Const.TIMEOUTS.quitMs + Const.TIMEOUTS.termMs
              h.check(took >= whole - 100 && took < whole + 1500, "after quit and SIGTERM had their time")
              root.until("the load that waited plays", root.plays(23), 8000, function() {
                h.equal(root.signals, ["idle", "loading 23", "started 23"], "in the next mpv")
                h.alive(function(left) {
                  h.equal(left.indexOf("mpv." + pid), -1, "and the stubborn one is gone")
                  root.next()
                })
              })
            })
          })
        })
      })
    })
  }

  // A file fails while mpv holds a second entry: mpv sends the failure and
  // the start of the next entry in one go. Whoever shuts the player down on
  // the failure must not hear of the second entry.
  function shutdownInsideHandler() {
    var h = root.h
    h.scenario({ mpv: "load-error:1" })
    root.player.shutdown()
    root.until("mpv is gone", root.off, 5000, function() {
      root.signals = []
      root.onEnded = "shutdown"
      root.load(8, "replace")
      root.load(9, "append-play")
      root.until("the failure is reported", root.told("ended 8 error " + root.noData), 8000, function() {
        h.check(!root.watchdogRuns(), "shutdown inside the handler: the load watchdog is stopped")
        h.after(700, function() {
          h.equal(root.signals, ["idle", "loading 8", "ended 8 error " + root.noData],
            "no loading for the entry behind it, no idle, no failure")
          h.equal(root.facts(), ["off", "idle", 0, false], "and mpv is gone")
          h.check(!root.watchdogRuns(), "the watchdog is still not running")
          root.onEnded = ""
          root.next()
        })
      })
    })
  }

  function stopInsideHandler() {
    var h = root.h
    root.signals = []
    root.onEnded = "stop"
    var stopped = root.count("stop")
    root.load(10, "replace")
    root.load(11, "append-play")
    root.until("the failure is reported", root.told("ended 10 error " + root.noData), 8000, function() {
      root.until("mpv reports itself idle after the stop", function() {
        return root.signals.length >= 4
      }, 3000, function() {
        h.after(500, function() {
          h.equal(root.signals, ["idle", "loading 10", "ended 10 error " + root.noData, "idle"],
            "stop inside the handler: no loading for the entry behind it")
          h.equal(root.facts(), ["running", "idle", 0, false], "mpv is kept, with nothing to play")
          h.equal(root.count("stop"), stopped + 1,
            "the entry behind it was not stopped a second time as foreign")
          h.check(!root.watchdogRuns(), "and the load watchdog is not running")
          root.onEnded = ""
          root.next()
        })
      })
    })
  }

  // mpv quits, without failing, while a load of ours is still on its way.
  // Nobody may be left waiting for that load.
  function lostWithExit() {
    var h = root.h
    root.player.shutdown()
    root.until("mpv is gone", root.off, 5000, function() {
      h.scenario({ mpv: "lose-load" })
      root.signals = []
      root.load(12, "replace")
      root.until("the load is lost behind a foreign file", function() {
        return JSON.stringify(root.lastCommand()) === "[\"stop\"]"
      }, 8000, function() {
        h.check(root.watchdogRuns(), "the watchdog runs while the load is awaited")
        h.inject("mpv", ["quit"])
        root.until("the exit is reported", function() {
          return root.signals.indexOf("exited true") !== -1 || root.signals.indexOf("exited false") !== -1
        }, 5000, function() {
          h.equal(root.signals[root.signals.length - 1], "exited true",
            "an exit that takes a load with it counts as a crash")
          h.equal(root.signals.filter(function(text) { return text !== "idle" }), ["exited true"],
            "the lost load was never reported as loading")
          h.check(!root.watchdogRuns(), "and nothing waits for it any more")
          root.next()
        })
      })
    })
  }

  function end() {
    var h = root.h
    h.scenario({ mpv: "ok" })
    h.equal(h.jobs().map(function(job) { return job.tag }), ["prepare"],
      "no job was ever started for the socket file, or for anything else")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left")
      root.next()
    })
  }
}
