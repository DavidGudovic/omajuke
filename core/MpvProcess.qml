import QtQuick
import Quickshell.Io
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env

// The mpv child process: how it is started, how it is stopped, and the two
// things that keep it from ever outliving the shell. It owns the Process
// object and nothing else; what mpv is told over its socket is the player's
// business.
//
// The tethers. mpv is started through setpriv with a parent-death signal,
// so the kernel ends it when the shell dies, however the shell dies. And it
// is started with its standard input as a control connection that it quits
// on the end of: the pipe is held open here and never written to, so it
// closes when this process goes away, also where a parent-death signal
// would not fire. Destroying the Process object ends the child as well,
// which covers a plugin that is disabled or reloaded.
Item {
  id: root

  // Given by the player: the tool table (replaced only by tests) and the
  // resolved paths, which the child's environment is built from.
  property var tools: null
  property var paths: null

  // "off", "starting" (launched, the socket is not up yet), "running" or
  // "stopping".
  readonly property string runState: _runState
  // 0 while no child exists. setpriv replaces itself with mpv, so this is
  // mpv's own process id. Only the test harness reads it.
  readonly property int pid: child.running ? (Number(child.processId) || 0) : 0

  property string _runState: "off"
  // Whether the socket of this child ever connected: what tells a binary
  // that could not be run from an mpv that ran and then failed.
  property bool _connected: false
  // The arguments of a start that was asked for while the last child was
  // still on its way out.
  property var _next: null
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // The child exists. Its socket is not up yet.
  signal started()
  // The child is gone. expected: stop() was called for it. crashed: it did
  // not end with exit code 0.
  signal exited(bool expected, bool crashed)
  // The child could not be run: "mpv" when the wrapper ran and mpv itself
  // was not there, "wrapper" when nothing ran at all.
  signal startFailed(string what)

  // Starts mpv with the arguments MpvArgs.launch() built. While a child is
  // stopping the start is remembered and made when it has gone; while one
  // is starting or running nothing happens.
  function start(argv) {
    if (root._runState === "stopping") {
      root._next = argv
      return
    }
    if (root._runState === "off") root._begin(argv)
  }

  // Ends the child: quit over the socket, then SIGTERM, then SIGKILL, each
  // after the one before it had its time. sendQuit writes the quit command
  // and returns true when it really left; without that there is nothing to
  // wait for and SIGTERM goes out at once. A start that was remembered is
  // dropped: whoever stops the player does not want another one.
  function stop(sendQuit) {
    root._next = null
    if (root._runState === "off" || root._runState === "stopping") return
    root._runState = "stopping"
    var asked = false
    if (typeof sendQuit === "function") {
      try {
        asked = sendQuit() === true
      } catch (error) {
        console.warn("omajuke: the quit command could not be sent")
      }
    }
    if (asked) root._arm("term", Const.TIMEOUTS.quitMs)
    else root._terminate()
  }

  // The player calls this when the socket of this child first connects.
  function noteConnected() {
    if (root._runState !== "starting") return
    root._connected = true
    root._runState = "running"
  }

  function _absolute(path) {
    return typeof path === "string" && path.charAt(0) === "/"
  }

  // The complete command line, or null when a piece of it is missing. The
  // arguments come from MpvArgs.launch() and the two tools from the table;
  // nothing else can add a flag.
  function _command(argv) {
    var tools = root.tools
    if (tools === null || typeof tools !== "object") return null
    if (!root._absolute(tools.setpriv) || !root._absolute(tools.mpv) || !Array.isArray(argv)) return null
    for (var i = 0; i < argv.length; i++) {
      if (typeof argv[i] !== "string") return null
    }
    return [tools.setpriv, "--pdeathsig", "TERM", tools.mpv].concat(argv)
  }

  function _begin(argv) {
    var command = root._command(argv)
    var environment = Env.mpv(root.paths)
    root._runState = "starting"
    root._connected = false
    child.run += 1
    child.sawStarted = false
    child.sawExit = false
    if (command === null || environment === null) {
      console.warn("omajuke: the player cannot be started")
      root._endedLater()
      return
    }
    child.command = command
    child.environment = environment
    child.running = true
  }

  function _arm(step, ms) {
    escalation.step = step
    escalation.interval = ms
    escalation.restart()
  }

  // SIGTERM, and the last resort armed behind it.
  function _terminate() {
    child.running = false
    root._arm("force", Const.TIMEOUTS.termMs)
  }

  function _escalate() {
    if (root._runState !== "stopping") return
    if (escalation.step === "term") root._terminate()
    else child.signal(9)
  }

  // Reports a child that never ran, one turn later and only if no other
  // child has been started in the meantime.
  function _endedLater() {
    var life = root._life
    var run = child.run
    Qt.callLater(function() {
      if (life.alive && child.run === run) root._ended()
    })
  }

  // The child is gone, or never was. Says which of the three it was, then
  // makes the start that was waiting for this, if one still is.
  function _ended() {
    var was = root._runState
    if (was === "off") return
    escalation.stop()
    var ran = child.sawStarted
    var normal = child.sawExit && child.lastStatus === 0
    var failed = child.sawExit && !(normal && child.lastCode === 0)
    // setpriv answers "cannot be run" with one of these two exit codes.
    var unrunnable = normal && (child.lastCode === 126 || child.lastCode === 127)
    var connected = root._connected
    root._runState = "off"
    root._connected = false
    if (was === "stopping") root.exited(true, failed)
    else if (!ran) root.startFailed("wrapper")
    else if (unrunnable && !connected) root.startFailed("mpv")
    else root.exited(false, failed)
    // A handler may have started a child itself, or stopped everything.
    if (root._next === null || root._runState !== "off") return
    var argv = root._next
    root._next = null
    root._begin(argv)
  }

  Component.onDestruction: root._life.alive = false

  // No parser on either output: both are closed, and nothing mpv prints is
  // ever read. Standard input is the tether and is never written to.
  Process {
    id: child

    // Counts the starts, so that a late report is never taken for news
    // about the child that came after.
    property int run: 0
    property bool sawStarted: false
    property bool sawExit: false
    property int lastCode: 0
    property int lastStatus: 0

    stdinEnabled: true
    clearEnvironment: true

    onStarted: {
      sawStarted = true
      root.started()
    }
    // An ending is handled once both are known: how the child exited, and
    // that the host no longer counts it as running (only then can the next
    // one be started). The two reports come in that order, but nothing
    // here depends on it.
    onExited: function(exitCode, exitStatus) {
      sawExit = true
      lastCode = exitCode
      lastStatus = exitStatus
      if (!running) root._ended()
    }
    // A wrapper that could not be run gives no start and no exit, only
    // this. Whether it is reported inside the call that started the child
    // is up to the host, so it is handled a turn later: start() never
    // fails before it has returned.
    onRunningChanged: {
      if (running) return
      if (!sawStarted) root._endedLater()
      else if (sawExit) root._ended()
    }
  }

  // Runs only while a child is being stopped.
  Timer {
    id: escalation

    // What happens when it fires: "term" sends SIGTERM, "force" SIGKILL.
    property string step: "term"

    onTriggered: root._escalate()
  }
}
