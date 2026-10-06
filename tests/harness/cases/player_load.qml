import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/MpvArgs.js" as MpvArgs
import "../../../lib/Paths.js" as Paths

// core/Player.qml from nothing to a playing track, against the mpv stub:
// what mpv is started with, what the first lines on the socket are and in
// which order, the exact load command, the signals and phases a start goes
// through, the position estimate, a start in the middle of a track, a live
// stream, loads the player refuses, and a file that starts and never plays.
//
// The last of these waits for the time a load is allowed, so this case
// takes a while.
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
  // True while a function of the player is being called: nothing may be
  // reported from inside a call.
  property bool calling: false
  property var steps: []
  property int at: 0

  readonly property string videoId: "AAAAAAAAAAA"
  readonly property string address: "https://www.youtube.com/watch?v=AAAAAAAAAAA"
  readonly property string title: "A,vid=1,title=x \"q\" %5%${path}"

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
    root.player = h.mount("core/Player.qml", { tools: h.tools, fs: root.fs, startVolume: 55 })
    if (root.runner === null || root.fs === null || root.player === null) { h.finish(); return }
    root.listen()
    root.steps = [
      root.atRest, root.coldStart, root.firstLines, root.estimate, root.middleOfTrack, root.liveStream,
      root.backFromLive, root.refusedLoads, root.neverPlays, root.end
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
    player.loading.connect(function(key) { root.note("loading " + key) })
    player.started.connect(function(key) { root.note("started " + key) })
    player.ended.connect(function(key, reason, fileError) {
      root.note(("ended " + key + " " + reason + " " + fileError).trim())
    })
    player.idle.connect(function() { root.note("idle") })
    player.exited.connect(function(crashed) { root.note("exited " + crashed) })
    player.failed.connect(function(code) { root.note("failed " + code) })
    player.phaseChanged.connect(function() { root.phases.push(player.phase) })
  }

  function note(text) {
    if (root.calling) root.h.check(false, "reported from inside a call: " + text)
    root.signals.push(text)
  }

  function seen(text) {
    return root.signals.indexOf(text) !== -1
  }

  // Waits for predicate, asserts that it came true, and goes on.
  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function load(key, title, opts) {
    root.calling = true
    root.player.load(key, root.videoId, title, Paths.infoFile(root.fs.paths, key), opts)
    root.calling = false
  }

  // The commands the stub has received so far.
  function commands() {
    return root.h.log("mpv").map(function(line) { return line.command })
  }

  function loads() {
    return root.commands().filter(function(command) { return command && command[0] === "loadfile" })
  }

  function count(name) {
    return root.commands().filter(function(command) { return command && command[0] === name }).length
  }

  function facts() {
    var player = root.player
    return [player.mpvState, player.phase, player.currentKey, player.hasFile, player.duration]
  }

  // Whether the player's one timer, the watchdog over a load, is running.
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

  function atRest() {
    var h = root.h
    h.equal(root.facts(), ["off", "idle", 0, false, 0], "nothing runs before the first load")
    h.equal([root.player.volume, root.player.muted, root.player.position, root.player.positionNow()],
      [55, false, 0, 0], "the saved volume is the volume")
    h.equal(h.log("mpv-start"), [], "no mpv was started")
    root.next()
  }

  function coldStart() {
    var h = root.h
    root.load(1, root.title, { mode: "replace" })
    h.equal(root.player.mpvState, "starting", "the first load starts mpv")
    h.equal(root.signals, [], "and reports nothing by itself")
    root.until("the track plays", function() { return root.player.phase === "playing" }, 8000, function() {
      h.equal(root.signals, ["idle", "loading 1", "started 1"], "a cold start: the signals")
      h.equal(root.phases, ["loading", "buffering", "playing"], "a cold start: the phases")
      h.equal(root.facts(), ["running", "playing", 1, true, 200], "a cold start: the facts")
      h.check(!root.watchdogRuns(), "a track that plays is no longer waited for")

      var starts = h.log("mpv-start")
      h.equal(starts.length, 1, "one mpv was started")
      var argv = MpvArgs.launch({
        sock: root.fs.paths.sock, volume: 55, mpris: root.fs.mprisAvailable, ytdlp: h.tools.ytdlp
      })
      h.equal(starts[0].argv, argv, "with exactly the launch arguments")
      h.equal(starts[0].env, ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
        "and the environment of its profile")
      var command = JSON.stringify(starts[0].argv)
      h.check(command.indexOf(root.videoId) === -1 && command.indexOf("vid=1") === -1,
        "neither the id nor the title is in mpv's arguments")
      h.check(JSON.stringify(h.jobs()).indexOf(root.videoId) === -1, "nor in any job")
      h.equal(h.jobs().length, 1, "the player started no job of its own")
      root.next()
    })
  }

  function firstLines() {
    var h = root.h
    var lines = h.log("mpv")
    var file = root.fs.paths.infoDir + "/1.json"
    h.equal(lines.slice(0, 10).map(function(line) { return line.command }), [
      ["keybind", "CLOSE_WIN", "set vid no; script-message omajuke-video-closed"],
      ["observe_property", 1, "idle-active"],
      ["observe_property", 2, "pause"],
      ["observe_property", 3, "core-idle"],
      ["observe_property", 4, "duration"],
      ["observe_property", 5, "volume"],
      ["observe_property", 6, "mute"],
      ["observe_property", 8, "speed"],
      ["set_property", "mute", false],
      ["loadfile", root.address, "replace", -1,
        { "force-media-title": root.title, "ytdl-raw-options-append": "load-info-json=" + file }]
    ], "the handshake, then the load that waited")
    h.equal(lines.slice(0, 10).map(function(line) { return line.request_id }),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "request ids count from 1")
    var odd = lines.filter(function(line) { return Object.keys(line).sort().join() !== "command,request_id" })
    h.equal(odd, [], "a line is a command and its request id, nothing else")
    var rest = lines.slice(10).map(function(line) { return JSON.stringify(line.command) })
    h.check(rest.length >= 1, "the position is asked for when the track starts")
    h.equal(rest.filter(function(text) { return text !== "[\"get_property\",\"time-pos\"]" }), [],
      "and nothing else is sent")
    root.next()
  }

  function estimate() {
    var h = root.h
    var first = root.player.positionNow()
    h.after(500, function() {
      var moved = root.player.positionNow() - first
      h.check(moved > 0.3 && moved < 2, "the estimate moves at real time while playing")
      h.check(root.player.position < 0.25, "the reported position does not: nobody watches it")
      root.next()
    })
  }

  function middleOfTrack() {
    var h = root.h
    root.load(2, "", { mode: "replace", startAt: 42.9 })
    root.until("a track started at 42 s plays", function() {
      return root.player.currentKey === 2 && root.player.phase === "playing"
    }, 5000, function() {
      var load = root.loads()[1]
      h.equal(load[4], {
        "force-media-title": "OmaJuke",
        "ytdl-raw-options-append": "load-info-json=" + root.fs.paths.infoDir + "/2.json",
        "start": "42"
      }, "whole seconds as text, and the app's name for a track without a title")
      root.until("the position is where the track started", function() {
        return root.player.position >= 42 && root.player.position < 44
      }, 3000, function() {
        h.check(root.player.positionNow() >= 42 && root.player.positionNow() < 45, "and so is the estimate")
        h.equal(root.signals.slice(3), ["loading 2", "started 2"],
          "a replace: loading and started, nothing else")
        root.next()
      })
    })
  }

  function liveStream() {
    var h = root.h
    root.load(3, "Live", { mode: "replace", startAt: 10, live: true })
    root.until("a live stream plays", function() {
      return root.player.currentKey === 3 && root.player.phase === "playing"
    }, 5000, function() {
      h.equal(root.loads()[2][4]["start"], undefined, "a live stream is never started at a position")
      root.until("its length is no longer observed", function() {
        return root.count("unobserve_property") === 1
      }, 3000, function() {
        var last = root.commands().filter(function(command) { return command[0] === "unobserve_property" })
        h.equal(last, [["unobserve_property", 4]], "the observation of duration, by its id")
        h.equal(root.player.duration, 0, "a live stream has no length")
        var position = root.player.position
        root.player.seek(30)
        h.after(200, function() {
          h.equal([root.count("seek"), root.player.position], [0, position], "and cannot be sought in")
          root.next()
        })
      })
    })
  }

  function backFromLive() {
    var h = root.h
    root.load(4, "Not live", { mode: "replace" })
    root.until("an ordinary track has its length again", function() {
      return root.player.currentKey === 4 && root.player.duration === 200
    }, 5000, function() {
      var observed = root.commands().filter(function(command) {
        return command[0] === "observe_property" && command[2] === "duration"
      })
      h.equal(observed.length, 2, "duration is observed again for it")
      root.next()
    })
  }

  function refusedLoads() {
    var h = root.h
    var player = root.player
    var before = root.loads().length
    var told = root.signals.length
    var good = Paths.infoFile(root.fs.paths, 5)
    root.calling = true
    player.load(5, "AAAAAAAAAA/", "t", good, { mode: "replace" })
    player.load(5, "AAAAAAAAAA", "t", good, { mode: "replace" })
    player.load(5, root.videoId, "t", root.fs.paths.runtimeDir + "/5.json", { mode: "replace" })
    player.load(5, root.videoId, "t", root.fs.paths.infoDir + "/../info/5.json", { mode: "replace" })
    player.load(5, root.videoId, "t", root.fs.paths.infoDir + "/a,b=c.json", { mode: "replace" })
    player.load(0, root.videoId, "t", good, { mode: "replace" })
    player.load(1.5, root.videoId, "t", good, { mode: "replace" })
    player.load(5, root.videoId, "t", good, { mode: "replace", startAt: -1 })
    // Not a replace: nobody waits for these, so they are only dropped.
    player.load(5, root.videoId, "t", good, { mode: "append" })
    player.load(5, root.videoId, "t", good, null)
    player.load(5, root.videoId, "t", good, { mode: "insert-at", index: -1 })
    root.calling = false
    h.equal(root.signals.length, told, "a refused load is not reported inside the call")
    root.until("each refused replace is reported", function() {
      return root.signals.length === told + 8
    }, 3000, function() {
      h.equal(root.signals.slice(told).filter(function(text) { return text !== "failed E_MPV_START" }), [],
        "as a failure, so nobody waits for it")
      h.after(200, function() {
        h.equal(root.signals.length, told + 8, "the other three are dropped in silence")
        h.equal(root.loads().length, before, "none of them reached mpv")
        h.equal(root.facts(), ["running", "playing", 4, true, 200], "and the track plays on")
        root.next()
      })
    })
  }

  // mpv begins to open a file and gets nowhere. No command of ours stands
  // behind this start (the file was appended to an idle mpv), so only the
  // start itself can have set the watchdog.
  function neverPlays() {
    var h = root.h
    root.player.stopPlayback()
    root.until("mpv is idle", function() { return root.player.phase === "idle" && root.seen("idle") }, 5000,
      function() {
        h.scenario({ mpv: "stall" })
        var told = root.signals.length
        root.load(6, "Stalls", { mode: "append-play" })
        root.until("the file starts", function() { return root.signals.length > told }, 5000, function() {
          var began = Date.now()
          h.equal([root.signals[told], root.player.phase, root.player.currentKey],
            ["loading 6", "loading", 6], "a file that starts is loading")
          h.check(root.watchdogRuns(), "and waited for")
          var failed = function() { return root.signals.length > told + 1 }
          root.until("the wait ends", failed, Const.TIMEOUTS.loadMs + 3000, function() {
            var took = Date.now() - began
            h.equal(root.signals[told + 1], "failed E_TIMEOUT", "with a failure")
            h.check(took >= Const.TIMEOUTS.loadMs - 500 && took <= Const.TIMEOUTS.loadMs + 2000,
              "after the time a load is allowed")
            h.equal([root.player.phase, root.player.currentKey, root.player.hasFile], ["idle", 0, false],
              "the file is given up at that moment")
            h.check(!root.watchdogRuns(), "and nothing is waited for")
            h.after(400, function() {
              h.equal(root.signals.slice(told), ["loading 6", "failed E_TIMEOUT", "idle"],
                "mpv was told to drop it, and says so")
              h.scenario({ mpv: "ok" })
              root.next()
            })
          })
        })
      })
  }

  function end() {
    var h = root.h
    var told = root.signals.length
    root.calling = true
    root.player.shutdown()
    root.calling = false
    h.equal(root.facts(), ["stopping", "idle", 0, false, 0], "shutdown: nothing is current at once")
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      h.equal(root.signals.length, told, "and its exit is not reported")
      h.alive(function(names) {
        h.equal(names, [], "no stub is left")
        root.next()
      })
    })
  }
}
