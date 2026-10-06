import QtQuick
import "../../../lib/Paths.js" as Paths

// core/Player.qml when mpv cannot be started at all: mpv is not installed,
// is not executable, the wrapper it is started through is missing, or the
// player was handed something it cannot build a command line from. Each
// must end as a failure with its own code, never inside the call that asked
// for the track, and never as a wait that does not end.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
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
    if (root.runner === null || root.fs === null) { h.finish(); return }
    root.steps = [
      root.mpvAbsent, root.mpvNotExecutable, root.wrapperAbsent, root.toolNotAbsolute, root.noCommandLine,
      root.noFileLayer, root.end
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

  function toolsWith(changes) {
    var tools = {}
    for (var name in root.h.tools) tools[name] = root.h.tools[name]
    for (var changed in changes) tools[changed] = changes[changed]
    return tools
  }

  // A player with its own tool table. Its signals are collected in the
  // list that is returned with it.
  function mount(tools, fs) {
    var player = root.h.mount("core/Player.qml", { tools: tools, fs: fs })
    var signals = []
    player.loading.connect(function(key) { signals.push("loading " + key) })
    player.started.connect(function(key) { signals.push("started " + key) })
    player.ended.connect(function(key, reason, fileError) { signals.push("ended " + key + " " + reason) })
    player.idle.connect(function() { signals.push("idle") })
    player.exited.connect(function(crashed) { signals.push("exited " + crashed) })
    player.failed.connect(function(code) { signals.push("failed " + code) })
    return { player: player, signals: signals }
  }

  // Loads a track twice, one after the other, and expects each load to end
  // with the same failure and nothing else.
  function failsWith(label, tools, fs, code, then) {
    var h = root.h
    var mounted = root.mount(tools, fs)
    var player = mounted.player
    var signals = mounted.signals
    var file = Paths.infoFile(root.fs.paths, 1)
    player.load(1, "AAAAAAAAAAA", "Track", file, { mode: "replace" })
    h.equal(signals, [], label + ": nothing is reported inside load()")
    h.waitFor(function() { return signals.length > 0 }, 5000, function() {
      h.equal(signals, ["failed " + code], label + ": the failure")
      h.equal([player.mpvState, player.phase, player.currentKey, player.hasFile], ["off", "idle", 0, false],
        label + ": nothing runs afterwards")
      player.load(2, "AAAAAAAAAAA", "Track", file, { mode: "replace" })
      h.waitFor(function() { return signals.length > 1 }, 5000, function() {
        h.after(300, function() {
          h.equal(signals, ["failed " + code, "failed " + code], label + ": a second try fails the same way")
          player.destroy()
          then()
        })
      })
    })
  }

  function mpvAbsent() {
    root.failsWith("mpv is not installed", root.toolsWith({ mpv: "/nonexistent/oj-mpv" }), root.fs,
      "E_MPV_MISSING", root.next)
  }

  function mpvNotExecutable() {
    root.failsWith("mpv is not executable", root.toolsWith({ mpv: root.h.repo + "/tests/stubs/lib.js" }),
      root.fs, "E_MPV_MISSING", root.next)
  }

  function wrapperAbsent() {
    root.failsWith("setpriv is missing", root.toolsWith({ setpriv: "/nonexistent/setpriv" }), root.fs,
      "E_TOOLS_MISSING", root.next)
  }

  // Nothing is ever looked up through PATH.
  function toolNotAbsolute() {
    root.failsWith("mpv is not an absolute path", root.toolsWith({ mpv: "mpv" }), root.fs, "E_TOOLS_MISSING",
      root.next)
  }

  // A path that cannot stand inside an option value never reaches a
  // command line.
  function noCommandLine() {
    root.failsWith("a tool path with a space", root.toolsWith({ ytdlp: "/nonexistent/yt dlp" }), root.fs,
      "E_MPV_START", root.next)
  }

  function noFileLayer() {
    root.failsWith("no file layer", root.h.tools, null, "E_MPV_START", root.next)
  }

  function end() {
    var h = root.h
    h.equal(h.log("mpv-start"), [], "no mpv was ever started")
    h.equal(h.jobs().map(function(job) { return job.tag }), ["prepare"], "and no job but the preparation")
    h.alive(function(names) {
      h.equal(names, [], "nothing is left")
      root.next()
    })
  }
}
