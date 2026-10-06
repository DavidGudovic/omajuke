import QtQuick
import "../../../lib/MpvArgs.js" as MpvArgs

// The two things that keep mpv from outliving the shell, each on its own.
// core/MpvProcess.qml starts the mpv stub twice. One stub does not end on
// SIGTERM, so only the closing of its standard input can end it; the other
// ignores its standard input, so only the signal the kernel sends at the
// death of its parent can. When both are up the case says so and does
// nothing more: the launcher then ends this shell abruptly, as a crash
// would, and passes the case only if neither stub is left.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var first: null
  property var second: null
  // The launcher judges this case by what is left afterwards, not by its
  // assertions. So one that fails must keep the case from saying "ready".
  property bool sound: true

  // yt-dlp only has to be an executable file here.
  function setup(h, done) {
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
      root.startFirst()
    })
  }

  function expect(passed) {
    if (!passed) root.sound = false
  }

  function start(socketName) {
    var process = root.h.mount("core/MpvProcess.qml", { tools: root.h.tools, paths: root.fs.paths })
    if (process === null) return null
    process.start(MpvArgs.launch({
      sock: root.fs.paths.runtimeDir + "/" + socketName, volume: 50, mpris: false, ytdlp: root.h.tools.ytdlp
    }))
    return process
  }

  // The stub reads its scenario when it starts, so the second one is
  // started only when the first has recorded itself.
  function startFirst() {
    var h = root.h
    h.scenario({ mpv: "deaf-term" })
    root.first = root.start("mpv.sock")
    h.waitFor(function() { return h.log("mpv-start").length === 1 }, 5000, function(up) {
      root.expect(h.check(up, "the stub that does not end on SIGTERM is up"))
      root.startSecond()
    })
  }

  function startSecond() {
    var h = root.h
    h.scenario({ mpv: "deaf-stdin" })
    root.second = root.start("second.sock")
    h.waitFor(function() { return h.log("mpv-start").length === 2 }, 5000, function(up) {
      root.expect(h.check(up, "the stub that ignores its standard input is up"))
      root.verify()
    })
  }

  // Both stubs must really be there, as children of the two processes and
  // under PIDs the launcher will look for; otherwise "nothing is left"
  // would prove nothing.
  function verify() {
    var h = root.h
    var starts = h.log("mpv-start")
    var pids = [root.first ? root.first.pid : 0, root.second ? root.second.pid : 0]
    root.expect(h.equal(starts.map(function(start) { return start.pid }), pids,
      "each process reports its child's PID"))
    root.expect(h.check(pids[0] > 0 && pids[1] > 0 && pids[0] !== pids[1], "two different children"))
    h.alive(function(names) {
      var expected = ["mpv." + pids[0], "mpv." + pids[1]].sort()
      root.expect(h.equal(names.slice().sort(), expected, "both stubs are alive and recorded"))
      if (!root.sound) { h.finish(); return }
      // From here on the launcher decides.
      h.ready()
    })
  }
}
