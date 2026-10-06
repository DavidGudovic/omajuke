import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/MpvArgs.js" as MpvArgs
import "../../../lib/MpvProto.js" as MpvProto
import "../../../lib/PlayerState.js" as PlayerState

// The same proof as the tether case, against the real mpv: started by
// core/MpvProcess.qml with the plugin's own launch arguments, it must be
// gone when this shell is ended abruptly.
//
// mpv runs silent and without a window (no audio and no video output, no
// display and no session bus in its environment) and is given nothing to
// play, so nothing is resolved, fetched or heard. The case says it is ready
// only when mpv has answered on its socket: an mpv that refused one of the
// launch arguments and exited would otherwise pass as "not left behind".
//
// On the way the real mpv is sent everything the player sends an idle mpv,
// through core/MpvSocket.qml: every command must be accepted, and what mpv
// reports about itself must read as "idle" to the reducer.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var process: null
  property var socket: null
  property var facts: PlayerState.initial()
  property var signals: []
  // The launcher judges this case by what is left afterwards, not by its
  // assertions. So one that fails must keep the case from saying "ready".
  property bool sound: true

  // The real mpv in place of the stub. yt-dlp only has to be an
  // executable file: nothing is loaded, so mpv never runs it.
  function setup(h, done) {
    h.tools.mpv = Const.TOOLS.mpv
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    if (root.runner === null || root.fs === null) { h.finish(); return }
    root.fs.prepare()
    h.waitFor(function() { return root.fs.status !== "pending" }, 5000, function() {
      root.expect(h.equal(root.fs.status, "ready", "the runtime folder is prepared"))
      root.start()
    })
  }

  function expect(passed) {
    if (!passed) root.sound = false
  }

  function start() {
    var h = root.h
    var paths = root.fs.paths
    root.process = h.mount("core/MpvProcess.qml", { tools: h.tools, paths: paths })
    root.socket = h.mount("core/MpvSocket.qml", { path: paths.sock })
    if (root.process === null || root.socket === null) { h.finish(); return }
    var launch = MpvArgs.launch({ sock: paths.sock, volume: 0, mpris: false, ytdlp: h.tools.ytdlp })
    root.process.started.connect(function() {
      // The stubs record their own PID; for the real mpv the case does.
      h.recordPid("mpv", root.process.pid)
      root.socket.open()
    })
    root.process.startFailed.connect(function(what) {
      h.check(false, "mpv could not be started: " + what)
      h.finish()
    })
    root.process.exited.connect(function(expected, crashed) {
      h.check(false, "mpv exited by itself")
      h.finish()
    })
    root.socket.gaveUp.connect(function() {
      h.check(false, "mpv never listened on its socket")
      h.finish()
    })
    root.socket.opened.connect(root.ask)
    root.socket.message.connect(function(message) {
      var result = PlayerState.onEvent(root.facts, message, null, Date.now())
      root.facts = result.state
      for (var i = 0; i < result.signals.length; i++) root.signals.push(result.signals[i].name)
    })
    root.process.start(launch.concat(["--ao=null", "--vo=null"]))
  }

  // What the player sends a fresh mpv, and what it may send an idle one.
  // The question about the playlist comes last: its answer ends the round.
  function ask() {
    var h = root.h
    root.process.noteConnected()
    var commands = MpvProto.handshake().concat([
      MpvProto.observe("time-pos"), MpvProto.setMute(false), MpvProto.setVolume(0),
      MpvProto.setEvenVolume(true), MpvProto.setEvenVolume(false), MpvProto.setPause(false),
      MpvProto.resetSpeed(), MpvProto.unobserve("time-pos"), MpvProto.unobserve("duration"),
      MpvProto.observe("duration"), MpvProto.stop()
    ])
    var refused = []
    var note = function(command) {
      return function(error, data) { if (error !== "") refused.push(command.slice(0, 2).join(" ")) }
    }
    for (var i = 0; i < commands.length; i++) root.socket.send(commands[i], note(commands[i]))
    // No file, no position: the one question an idle mpv does not answer.
    var position = "unasked"
    root.socket.send(MpvProto.getProperty("time-pos"), function(error, data) { position = error })
    root.socket.send(MpvProto.getProperty("playlist"), function(error, data) {
      root.expect(h.equal(refused, [], "mpv accepts every command of the handshake while idle"))
      root.expect(h.equal(position, "property unavailable", "and has no position to tell"))
      root.expect(h.equal([error, data], ["", []], "it has nothing to play"))
      root.expect(h.equal(root.process.runState, "running", "the process counts as running"))
      h.after(200, root.judge)
    })
  }

  function judge() {
    var h = root.h
    var facts = root.facts
    root.expect(h.equal(root.signals, ["idle"], "what mpv reports reads as idle, once"))
    root.expect(h.equal([facts.phase, facts.key, facts.idleActive, facts.pause, facts.volume, facts.mute],
      ["idle", 0, true, false, 0, false], "with the launch volume, not paused, not muted"))
    h.alive(function(names) {
      root.expect(h.equal(names, ["mpv." + root.process.pid], "mpv is alive and recorded"))
      if (!root.sound) { h.finish(); return }
      // From here on the launcher decides.
      h.ready()
    })
  }
}
