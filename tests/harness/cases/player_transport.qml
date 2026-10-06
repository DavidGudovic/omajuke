import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/MpvProto.js" as MpvProto
import "../../../lib/Paths.js" as Paths

// core/Player.qml while a track plays, against the mpv stub: pause, seek,
// volume, mute, the levelling filter, the speed, and the watched position.
// Each of them is checked for what the player shows at once, for the exact
// command mpv receives, and for what a change made by another program does.
// The end of the case is about core/MpvSocket.qml alone: an answer that is
// late, one that never comes, and requests that cannot be sent.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var player: null
  property var signals: []
  property var phases: []
  property var steps: []
  property int at: 0

  readonly property var levelOn: ["af", "add", "@omajuke-norm:dynaudnorm=f=250:g=31:p=0.9"]
  readonly property var levelOff: ["af", "remove", "@omajuke-norm"]

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
    root.player = h.mount("core/Player.qml", {
      tools: h.tools, fs: root.fs, startVolume: 55, startMuted: true, evenVolume: true
    })
    if (root.runner === null || root.fs === null || root.player === null) { h.finish(); return }
    root.listen()
    root.steps = [
      root.handshake, root.pause, root.resume, root.seek, root.seekRefused, root.volume,
      root.volumeFromOutside, root.mute, root.levelling, root.speed, root.watch, root.unwatch,
      root.replaceWhilePaused, root.lateForItsTrack, root.whileOff, root.nextMpv, root.lateAnswer,
      root.tooMany, root.notSent, root.closedInsideHandler, root.end
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

  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function load(key) {
    root.player.load(key, "AAAAAAAAAAA", "Track", Paths.infoFile(root.fs.paths, key), { mode: "replace" })
  }

  // The commands the stub has received, as JSON text, without the
  // questions about the position (how many of those there are depends on
  // timing).
  function sent() {
    return root.h.log("mpv").map(function(line) { return JSON.stringify(line.command) })
      .filter(function(text) { return text !== "[\"get_property\",\"time-pos\"]" })
  }

  // What was sent since mark, a length of sent() taken earlier.
  function since(mark) {
    return root.sent().slice(mark).map(function(text) { return JSON.parse(text) })
  }

  // True once exactly count commands were sent since mark.
  function sentSince(mark, count) {
    return function() { return root.since(mark).length === count }
  }

  function playing() {
    return root.player.phase === "playing"
  }

  function handshake() {
    var h = root.h
    h.equal([root.player.volume, root.player.muted], [55, true], "the saved volume and mute, before any mpv")
    root.load(1)
    root.until("the track plays", root.playing, 8000, function() {
      h.equal(root.since(8).slice(0, 3).map(function(command) { return command[0] + " " + command[1] }),
        ["set_property mute", "af add", "loadfile https://www.youtube.com/watch?v=AAAAAAAAAAA"],
        "the saved mute and the levelling filter are sent before the load")
      h.equal(root.since(8).slice(0, 2), [["set_property", "mute", true], root.levelOn], "with these values")
      h.equal(h.log("mpv-start")[0].argv.filter(function(arg) { return arg.indexOf("--volume=") === 0 }),
        ["--volume=55"], "the saved volume is in mpv's arguments")
      h.equal([root.player.volume, root.player.muted], [55, true], "and mpv reports both back")
      root.next()
    })
  }

  function pause() {
    var h = root.h
    root.phases = []
    var mark = root.sent().length
    root.player.setPause(true)
    root.until("the track is paused", function() { return root.player.phase === "paused" }, 3000, function() {
      h.equal(root.since(mark), [["set_property", "pause", true]], "pause: the command")
      var held = root.player.positionNow()
      h.after(400, function() {
        h.equal(root.phases, ["paused"], "pause: one change of phase")
        h.check(Math.abs(root.player.positionNow() - held) < 0.05, "a paused track does not move")
        root.next()
      })
    })
  }

  function resume() {
    var h = root.h
    root.phases = []
    var mark = root.sent().length
    root.player.setPause(false)
    root.until("the track plays again", root.playing, 3000, function() {
      h.equal(root.since(mark), [["set_property", "pause", false]], "resume: the command")
      // mpv lifts the pause first and plays a moment later.
      h.equal(root.phases, ["buffering", "playing"], "resume: through buffering")
      h.equal(root.signals, ["idle", "loading 1", "started 1"], "pause and resume report no signal")
      root.next()
    })
  }

  function seek() {
    var h = root.h
    var mark = root.sent().length
    root.player.seek(50)
    h.equal(root.player.position, 50, "a seek: the position is the target at once")
    h.check(Math.abs(root.player.positionNow() - 50) < 0.05, "and so is the estimate")
    root.player.seek(1000)
    h.equal(root.player.position, 199, "a seek past the end is clamped to one second before it")
    root.player.seek(-5)
    h.equal(root.player.position, 0, "a seek before the start is clamped to the start")
    root.player.seek(61.23456)
    h.equal(root.player.position, 61.235, "a seek is rounded to milliseconds")
    root.until("mpv has carried the seeks out", function() {
      return root.since(mark).length === 4 && root.player.phase === "playing"
    }, 3000, function() {
      h.equal(root.since(mark), [
        ["seek", 50, "absolute"], ["seek", 199, "absolute"], ["seek", 0, "absolute"],
        ["seek", 61.235, "absolute"]
      ], "the seek commands, clamped before they left")
      h.after(400, function() {
        var now = root.player.positionNow()
        h.check(now > 61.4 && now < 63, "the track plays on from the last target")
        h.equal(root.signals, ["idle", "loading 1", "started 1"], "a seek reports no signal")
        root.next()
      })
    })
  }

  function seekRefused() {
    var h = root.h
    var mark = root.sent().length
    var position = root.player.position
    var targets = [NaN, Infinity, "30", null, undefined, {}]
    for (var i = 0; i < targets.length; i++) root.player.seek(targets[i])
    h.after(200, function() {
      h.equal(root.since(mark).filter(function(command) { return command[0] === "seek" }), [],
        "a target that is no number is not sent")
      h.equal(root.player.position, position, "and moves nothing")
      root.next()
    })
  }

  function volume() {
    var h = root.h
    var mark = root.sent().length
    var shown = []
    var values = [30, 250, -3, 41.6, 17]
    for (var i = 0; i < values.length; i++) {
      root.player.setVolume(values[i])
      shown.push(root.player.volume)
    }
    h.equal(shown, [30, 100, 0, 42, 17], "the volume is clamped, rounded and shown at once")
    var others = [NaN, Infinity, "80", null, undefined]
    for (var k = 0; k < others.length; k++) root.player.setVolume(others[k])
    h.equal(root.player.volume, 17, "a volume that is no number changes nothing")
    // From here on the volume may only change if mpv's reports of the
    // earlier values were taken for news.
    var jumps = []
    var jumped = function() { jumps.push(root.player.volume) }
    root.player.volumeChanged.connect(jumped)
    root.until("mpv has the volume", root.sentSince(mark, 5), 3000, function() {
      h.equal(root.since(mark), [
        ["set_property", "volume", 30], ["set_property", "volume", 100], ["set_property", "volume", 0],
        ["set_property", "volume", 42], ["set_property", "volume", 17]
      ], "the volume commands, clamped before they left")
      h.after(300, function() {
        root.player.volumeChanged.disconnect(jumped)
        h.equal(jumps, [], "mpv's reports of the earlier values do not pull the volume back")
        h.equal(root.player.volume, 17, "it is what was asked for last")
        root.next()
      })
    })
  }

  // Another program on the session bus can set any volume, also one above
  // mpv's own maximum.
  function volumeFromOutside() {
    var h = root.h
    var mark = root.sent().length
    h.inject("mpv", ["set_property", "volume", 150])
    root.until("the volume from outside is clamped", function() {
      return root.player.volume === 100 && root.since(mark).length === 1
    }, 3000, function() {
      h.equal(root.since(mark), [["set_property", "volume", 100]], "mpv is told the clamped volume")
      h.inject("mpv", ["set_property", "volume", 37])
      root.until("a volume in range is taken over", function() {
        return root.player.volume === 37
      }, 3000, function() {
        h.equal(root.since(mark).length, 1, "and nothing is sent back for it")
        root.next()
      })
    })
  }

  function mute() {
    var h = root.h
    var mark = root.sent().length
    root.player.setMuted(false)
    h.equal(root.player.muted, false, "mute is shown at once")
    root.until("mpv has the mute", root.sentSince(mark, 1), 3000, function() {
      h.equal(root.since(mark), [["set_property", "mute", false]], "the mute command")
      h.inject("mpv", ["set_property", "mute", true])
      root.until("a mute from outside is taken over", function() { return root.player.muted }, 3000,
        function() {
          h.equal(root.since(mark).length, 1, "and nothing is sent back for it")
          root.next()
        })
    })
  }

  function levelling() {
    var h = root.h
    var mark = root.sent().length
    root.player.evenVolume = false
    root.until("the filter is removed", root.sentSince(mark, 1), 3000, function() {
      root.player.evenVolume = true
      root.until("the filter is added", root.sentSince(mark, 2), 3000, function() {
        h.equal(root.since(mark), [root.levelOff, root.levelOn], "the setting becomes these two commands")
        h.equal(root.signals, ["idle", "loading 1", "started 1"], "and no signal")
        root.next()
      })
    })
  }

  // The position estimate assumes real time, so a speed set from outside
  // is set back.
  function speed() {
    var h = root.h
    var mark = root.sent().length
    h.inject("mpv", ["set_property", "speed", 2])
    root.until("the speed is set back", root.sentSince(mark, 1), 3000, function() {
      h.equal(root.since(mark), [["set_property", "speed", 1]], "the only speed ever sent is 1")
      root.next()
    })
  }

  function watch() {
    var h = root.h
    var mark = root.sent().length
    var before = root.player.position
    var shown = [before]
    var moved = function() { shown.push(root.player.position) }
    root.player.positionChanged.connect(moved)
    root.player.setPositionWatch(true)
    root.player.setPositionWatch(true)
    root.until("the watched position follows the track", function() {
      return root.player.position > before + 1
    }, 5000, function() {
      root.player.positionChanged.disconnect(moved)
      h.equal(root.since(mark), [["observe_property", 7, "time-pos"]], "the position is observed, once")
      h.check(Math.abs(root.player.position - root.player.positionNow()) < 0.4,
        "the reported position keeps up with the estimate")
      // mpv reports about a dozen positions a second; a view is handed far
      // fewer.
      var small = 0
      for (var i = 1; i < shown.length; i++) {
        if (shown[i] - shown[i - 1] < 0.249) small++
      }
      h.equal(small, 0, "the position moves in steps of a quarter of a second or more")
      h.check(shown.length >= 3, "and it does move in steps, not in one jump")
      root.next()
    })
  }

  function unwatch() {
    var h = root.h
    var mark = root.sent().length
    root.player.setPositionWatch(false)
    root.player.setPositionWatch(false)
    root.until("the observation is ended", root.sentSince(mark, 1), 3000, function() {
      h.equal(root.since(mark), [["unobserve_property", 7]], "by its id, once")
      h.after(150, function() {
        var held = root.player.position
        h.after(600, function() {
          h.equal(root.player.position, held, "an unwatched position stays where it was last told")
          h.check(root.player.positionNow() > held + 0.3, "while the estimate goes on")
          root.next()
        })
      })
    })
  }

  // mpv keeps a pause across files unless it is started with the flag that
  // resets it. A track that is loaded while another sits paused must play.
  function replaceWhilePaused() {
    var h = root.h
    root.player.setPause(true)
    root.until("the track is paused", function() { return root.player.phase === "paused" }, 3000, function() {
      root.signals = []
      var mark = root.sent().length
      root.load(9)
      root.until("the track loaded over a paused one plays", function() {
        return root.player.currentKey === 9 && root.player.phase === "playing"
      }, 5000, function() {
        h.equal(root.signals, ["loading 9", "started 9"], "it starts as any other")
        h.equal(root.since(mark).map(function(command) { return command[0] }), ["loadfile"],
          "and the player sent nothing to lift the pause: mpv does that itself")
        root.next()
      })
    })
  }

  // The player asks mpv where a track is, and the track is replaced before
  // the answer arrives. The answer belongs to the old track: it must not
  // become the position of the new one.
  function lateForItsTrack() {
    var h = root.h
    root.player.seek(120)
    h.after(300, function() {
      h.scenario({ mpv: "slow-position:400" })
      // Pausing makes the player ask; the answer is on its way for a while.
      root.player.setPause(true)
      root.until("the track is paused", function() { return root.player.phase === "paused" }, 3000,
        function() {
          var shown = []
          var moved = function() { shown.push(root.player.position) }
          root.player.positionChanged.connect(moved)
          root.load(10)
          root.until("the next track plays", function() {
            return root.player.currentKey === 10 && root.player.phase === "playing"
          }, 5000, function() {
            // Long enough for every answer that was held back.
            h.after(900, function() {
              root.player.positionChanged.disconnect(moved)
              h.check(shown.length > 0 && shown[0] === 0, "the new track starts at 0")
              h.equal(shown.filter(function(position) { return position > 5 }), [],
                "and the position of the track before never lands on it")
              h.check(root.player.positionNow() < 5, "nor on the estimate")
              h.scenario({ mpv: "ok" })
              root.next()
            })
          })
        })
    })
  }

  // Without an mpv nothing is sent and nothing is started; volume, mute
  // and the watch are kept for the next one.
  function whileOff() {
    var h = root.h
    root.player.shutdown()
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      var lines = h.log("mpv").length
      root.signals = []
      root.player.setPause(true)
      root.player.seek(10)
      root.player.setEvenVolume(true)
      root.player.stopPlayback()
      root.player.setVolume(20)
      root.player.setMuted(false)
      root.player.setPositionWatch(true)
      h.after(300, function() {
        h.equal([root.player.mpvState, h.log("mpv-start").length, h.log("mpv").length], ["off", 1, lines],
          "no command starts mpv or reaches the old one")
        h.equal(root.signals, [], "and none reports anything")
        h.equal([root.player.volume, root.player.muted], [20, false], "volume and mute are kept")
        root.player.startVolume = 64
        root.player.startMuted = false
        root.player.startMuted = true
        h.equal([root.player.volume, root.player.muted], [64, true],
          "a saved value that changes is taken over")
        root.next()
      })
    })
  }

  function nextMpv() {
    var h = root.h
    var mark = root.sent().length
    root.load(2)
    root.until("the next mpv plays", function() {
      return root.player.currentKey === 2 && root.player.phase === "playing"
    }, 8000, function() {
      var starts = h.log("mpv-start")
      h.equal(starts.length, 2, "a second mpv was started")
      h.equal(starts[1].argv.filter(function(arg) { return arg.indexOf("--volume=") === 0 }), ["--volume=64"],
        "with the volume as it is now")
      h.equal(root.since(mark).slice(8, 11),
        [["observe_property", 7, "time-pos"], ["set_property", "mute", true], root.levelOn],
        "the watch, the mute and the filter are part of its handshake")
      // A saved value that changes while mpv runs is not sent to it: the
      // running mpv has the last word, and the service sends changes itself.
      root.player.startVolume = 12
      h.equal(root.player.volume, 64, "a connected mpv is not overruled by the saved volume")
      root.player.setPositionWatch(false)
      root.next()
    })
  }

  // ---- The socket alone ----

  function connect(then) {
    var socket = root.h.mount("core/MpvSocket.qml", { path: root.fs.paths.sock })
    if (socket === null) { root.h.finish(); return }
    var gaveUp = function() { root.h.check(false, "the second connection came about") }
    socket.gaveUp.connect(gaveUp)
    var opened = function() {
      socket.opened.disconnect(opened)
      then(socket)
    }
    socket.opened.connect(opened)
    socket.open()
  }

  // An answer that comes after its time finds nobody waiting.
  function lateAnswer() {
    var h = root.h
    root.connect(function(socket) {
      h.check(socket.connected, "a second connection to the same mpv is up")
      h.scenario({ mpv: "slow-reply:500" })
      var answers = []
      var asked = Date.now()
      var returned = false
      var id = socket.send(MpvProto.getProperty("playlist"), function(error, data) {
        h.check(returned, "a callback is never called before send() returns")
        answers.push(error + " after " + (Date.now() - asked >= 150 ? "its time" : "too short a time"))
      }, { timeoutMs: 150 })
      returned = true
      h.check(id > 0, "a request that is sent has an id")
      h.after(1000, function() {
        h.equal(answers, ["timeout after its time"], "one answer: the timeout, and the late reply is dropped")
        var patient = []
        socket.send(MpvProto.getProperty("playlist"), function(error, data) {
          patient.push([error, Array.isArray(data)])
        })
        root.until("an answer inside its time arrives", function() { return patient.length === 1 }, 3000,
          function() {
            h.equal(patient, [["", true]], "with no error and mpv's data")
            socket.destroy()
            root.next()
          })
      })
    })
  }

  // No more than a fixed number of answers may be due at a time, and a
  // connection that closes answers every one of them.
  function tooMany() {
    var h = root.h
    root.connect(function(socket) {
      var answers = []
      var ids = []
      for (var i = 0; i < Const.LIMITS.mpvPending + 1; i++) {
        ids.push(socket.send(MpvProto.getProperty("playlist"), function(error, data) { answers.push(error) }))
      }
      h.equal(ids.filter(function(id) { return id > 0 }).length, Const.LIMITS.mpvPending,
        "as many requests as answers may be due are sent")
      h.equal(ids[ids.length - 1], 0, "the one after that is not")
      h.equal(answers, [], "and it is told so later, not inside send()")
      root.until("the request too many is answered", function() { return answers.length === 1 }, 3000,
        function() {
          h.equal(answers, ["busy"], "as busy")
          socket.close()
          h.equal(answers.length, Const.LIMITS.mpvPending + 1, "closing answers everything that was due")
          h.equal(answers.slice(1).filter(function(error) { return error !== "disconnected" }), [],
            "as disconnected")
          h.check(!socket.connected, "the connection is closed")
          socket.destroy()
          h.scenario({ mpv: "ok" })
          root.next()
        })
    })
  }

  function notSent() {
    var h = root.h
    var socket = h.mount("core/MpvSocket.qml", { path: root.fs.paths.sock })
    var answers = []
    var note = function(error, data) { answers.push(error) }
    h.equal(socket.send(MpvProto.getProperty("playlist"), note), 0, "nothing is sent without a connection")
    root.connect(function(open) {
      var before = h.log("mpv").length
      var outside = [
        ["run", "/usr/bin/true"], ["loadfile", "/etc/hostname"], ["set_property", "volume", 250],
        ["get_property", "path"], ["quit", 1], "quit", null, []
      ]
      for (var i = 0; i < outside.length; i++) {
        h.equal(open.send(outside[i], note), 0, "a command outside the vocabulary gets no id: " + i)
      }
      root.until("each of them is answered", function() { return answers.length === 9 }, 3000, function() {
        h.equal(answers[0], "disconnected", "the one without a connection as disconnected")
        h.equal(answers.slice(1).filter(function(error) { return error !== "refused" }), [],
          "the others as refused")
        h.after(200, function() {
          h.equal(h.log("mpv").length, before, "and mpv received none of them")
          socket.destroy()
          open.destroy()
          root.next()
        })
      })
    })
  }

  // mpv sends several lines in one go. Whoever closes the connection while
  // handling the first of them must not be handed the others.
  function closedInsideHandler() {
    var h = root.h
    root.connect(function(socket) {
      var events = []
      socket.message.connect(function(object) {
        events.push(object.name)
        socket.close()
      })
      // The stub reports the first values of all three in one write.
      socket.send(MpvProto.observe("idle-active"))
      socket.send(MpvProto.observe("pause"))
      socket.send(MpvProto.observe("mute"))
      root.until("the first line arrives", function() { return events.length > 0 }, 3000, function() {
        h.after(300, function() {
          h.equal(events, ["idle-active"], "the lines behind the one that closed are dropped unread")
          h.check(!socket.connected, "and the connection is closed")
          socket.destroy()
          root.next()
        })
      })
    })
  }

  function end() {
    var h = root.h
    root.player.shutdown()
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      h.alive(function(names) {
        h.equal(names, [], "no stub is left")
        root.next()
      })
    })
  }
}
