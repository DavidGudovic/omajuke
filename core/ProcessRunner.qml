pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Io
import "../lib/Const.js" as Const
import "../lib/Sh.js" as Sh

// Runs every short-lived child process of the plugin: yt-dlp, curl, the
// shell constants of lib/Sh.js and the coreutils behind the file
// operations. (mpv is long-lived and has its own Process in
// core/MpvProcess.qml.) It owns the bounds that hold for all of them: an
// argv array with absolute tools, an environment that starts empty, a
// deadline, a cap on what is read, at most maxActive children at a time,
// and a result that is delivered exactly once and only after the child is
// gone.
Item {
  id: root

  // Replaced only by tests, through the service, with stub tools.
  property var tools: Const.TOOLS

  readonly property int maxActive: Const.LIMITS.jobs
  // Child objects that exist, including ones that are being stopped.
  readonly property int active: _active
  readonly property int waiting: _queue.length

  // The longest deadline a job may ask for, in seconds.
  readonly property int _maxTimeoutSec: 600
  // The largest stdin payload and the largest stdout cap: the biggest thing
  // any job carries is a resolve answer, on its way out of yt-dlp or into
  // its info file.
  readonly property int _maxPayload: Const.LIMITS.resolveBytes
  readonly property int _stderrChars: 4096
  // Seconds between the moment a child should be gone (its deadline, or a
  // request to stop) and our own SIGKILL: timeout's kill delay, and as much
  // again for it to act.
  readonly property int _slackSec: Const.TIMEOUTS.killGraceSec + 2
  // Every caller runs one job at a time, so a queue this long is a bug.
  readonly property int _longQueue: 32

  property int _active: 0
  property int _seq: 0
  property var _queue: []
  property var _jobs: new Map()
  property bool _warnedLong: false
  // Shared with every deferred call, so that none of them delivers a result
  // into a service that is already being destroyed.
  property var _life: ({ alive: true })

  // Emitted for every child that is started, with its complete wrapped
  // command. Nothing in the plugin listens; the test harness records it to
  // assert what is not in any command line.
  signal jobStarted(string tag, var command)

  // Starts a job, or queues it while maxActive children exist. Returns its
  // id (> 0). spec.done is called exactly once, never before run() returns,
  // and only after the child is gone. Nothing is ever turned away for being
  // one too many: clean-up jobs share this runner, and a dropped one would
  // silently break a deletion guarantee.
  function run(spec: var): int {
    var id = ++root._seq
    if (!root._wellFormed(spec)) {
      console.warn("omajuke: the runner refused a malformed job")
      if (spec !== null && typeof spec === "object" && typeof spec.done === "function") {
        root._later(spec.done, root._unstarted("refused"))
      }
      return id
    }
    if (root._active >= root.maxActive) {
      root._queue = root._queue.concat([{ id: id, spec: spec }])
      if (root._queue.length > root._longQueue && !root._warnedLong) {
        root._warnedLong = true
        console.warn("omajuke: runner queue is long")
      }
      return id
    }
    root._start(id, spec)
    return id
  }

  // Asks a job to stop. Its done({ error: "cancelled" }) follows when the
  // child has exited, so a caller that owns files the child may still be
  // writing cleans them up in done, never right after cancel().
  function cancel(jobId: int): void {
    for (var i = 0; i < root._queue.length; i++) {
      if (root._queue[i].id !== jobId) continue
      var entry = root._queue[i]
      root._queue = root._queue.slice(0, i).concat(root._queue.slice(i + 1))
      root._later(entry.spec.done, root._unstarted("cancelled"))
      return
    }
    var job = root._jobs.get(jobId)
    if (job) job.halt("cancelled")
  }

  function cancelAll(): void {
    var queued = root._queue
    root._queue = []
    for (var i = 0; i < queued.length; i++) root._later(queued[i].spec.done, root._unstarted("cancelled"))
    root._jobs.forEach(function(job) { job.halt("cancelled") })
  }

  function _absolute(path) {
    return typeof path === "string" && path.charAt(0) === "/"
  }

  function _whole(value, min, max) {
    return typeof value === "number" && Math.floor(value) === value && value >= min && value <= max
  }

  // A job is run only if it is completely specified: nothing about a child
  // is ever guessed or defaulted.
  function _wellFormed(spec) {
    if (spec === null || typeof spec !== "object") return false
    if (typeof spec.done !== "function" || typeof spec.tag !== "string") return false
    if (!Array.isArray(spec.argv) || !root._absolute(spec.argv[0])) return false
    for (var i = 0; i < spec.argv.length; i++) {
      if (typeof spec.argv[i] !== "string") return false
    }
    if (!root._whole(spec.timeoutSec, 1, root._maxTimeoutSec)) return false
    if (!root._whole(spec.maxBytes, 1, root._maxPayload)) return false
    if (spec.env === null || typeof spec.env !== "object") return false
    if (spec.stdin !== undefined && typeof spec.stdin !== "string") return false
    if (typeof spec.stdin === "string" && spec.stdin.length > root._maxPayload) return false
    if (spec.umask077 !== undefined && typeof spec.umask077 !== "boolean") return false
    var tools = root.tools
    if (tools === null || typeof tools !== "object") return false
    if (!root._absolute(tools.setpriv) || !root._absolute(tools.timeout)) return false
    return spec.umask077 !== true || root._absolute(tools.sh)
  }

  // The result of a job that never had a child.
  function _unstarted(error) {
    return { ok: false, error: error, exitCode: -1, stdout: "", stderr: "", durationMs: 0 }
  }

  function _deliver(done, result) {
    try {
      done(result)
    } catch (error) {
      // One caller's bug must not keep the job from being cleared away, and
      // what it threw is not logged: a message can carry anything.
      console.warn("omajuke: a job callback failed")
    }
  }

  function _later(done, result) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) root._deliver(done, result)
    })
  }

  // A fresh object per job: a child that ignores SIGTERM can then never
  // block the next job.
  function _start(id, spec) {
    var command = Sh.wrap(root.tools, spec)
    var job = jobComponent.createObject(root, {
      jobId: id,
      spec: spec,
      command: command,
      environment: spec.env,
      stdinEnabled: typeof spec.stdin === "string"
    })
    if (job === null) {
      console.warn("omajuke: the runner could not create a job")
      root._later(spec.done, root._unstarted("nowrap"))
      return
    }
    root._jobs.set(id, job)
    root._active += 1
    root._announce(spec.tag, command)
    // Armed before the start, so that a job is bounded even if its start is
    // never reported either way.
    job.watchdog.start()
    job.running = true
  }

  // jobStarted is emitted one turn late. A listener can only connect once
  // the service exists, and the service starts its first job while it is
  // still being created: this way not even that job goes unseen.
  function _announce(tag, command) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) root.jobStarted(tag, command)
    })
  }

  function _startNext() {
    while (root._queue.length > 0 && root._active < root.maxActive) {
      var next = root._queue[0]
      root._queue = root._queue.slice(1)
      root._start(next.id, next.spec)
    }
  }

  // What happened, in the order that decides: our own verdict; a wrapper
  // that never ran; the deadline; a tool that could not be run; death by a
  // signal; a failing exit code.
  function _result(job, exitCode, exitStatus) {
    var durationMs = job.startedAt > 0 ? Date.now() - job.startedAt : 0
    var normal = exitStatus === 0
    // After its kill delay timeout dies of SIGKILL itself, which is reported
    // as a crash with code 9, not as 137. Before the deadline the same exit
    // means that something else killed the tool.
    var killed = normal ? exitCode === 137 : exitCode === 9
    var error = ""
    if (job.verdict !== "") error = job.verdict
    else if (!job.sawStarted) error = "nowrap"
    else if (normal && exitCode === 124) error = "timeout"
    else if (killed && durationMs >= job.spec.timeoutSec * 1000) error = "timeout"
    else if (normal && exitCode >= 125 && exitCode <= 127) error = "missing"
    else if (!normal) error = "signal"
    else if (exitCode !== 0) error = "exit"
    return {
      ok: error === "",
      error: error,
      exitCode: job.sawStarted ? exitCode : -1,
      stdout: error === "" || error === "exit" ? job.out : "",
      stderr: job.err,
      durationMs: durationMs
    }
  }

  // Runs once per job, when its child is gone: from its exit, from the
  // watchdog (which has just killed it), or for a child that never started.
  // The job leaves the table and the next one starts before done is called,
  // and the object is destroyed last: destroying a Process kills its child
  // outright, so it must never happen while the child may be alive.
  function _settle(job, exitCode, exitStatus) {
    if (job.settled) return
    job.settled = true
    job.watchdog.stop()
    var result = root._result(job, exitCode, exitStatus)
    var done = job.spec.done
    root._jobs.delete(job.jobId)
    root._active -= 1
    root._startNext()
    // Whether a start that failed is reported inside run() or a moment
    // later is up to the host; either way done must not be called before
    // run() has returned.
    if (job.sawStarted) root._deliver(done, result)
    else root._later(done, result)
    job.destroy()
  }

  // The job objects are destroyed with this item, which kills timeout; the
  // tool gets the SIGTERM timeout armed for the death of its parent. Nobody
  // is told: whoever would listen is being destroyed too.
  Component.onDestruction: root._life.alive = false

  Component {
    id: jobComponent

    Process {
      id: job

      required property int jobId
      required property var spec
      property bool sawStarted: false
      property bool settled: false
      // "", "overflow", "timeout" or "cancelled": what we decided about the
      // job ourselves. It outranks whatever the exit says.
      property string verdict: ""
      property string out: ""
      property string err: ""
      property int got: 0
      property double startedAt: 0
      // Runs only while the job runs. The last resort, and the only path
      // that sends SIGKILL.
      property Timer watchdog: Timer {
        interval: (job.spec.timeoutSec + root._slackSec) * 1000
        onTriggered: {
          if (!job.verdict) job.verdict = "timeout"
          job.signal(9)
          root._settle(job, -1, 0)
        }
      }

      // Stops the child the polite way: SIGTERM to timeout, which passes it
      // on to the tool's process group and kills what is left after its
      // delay. The job stays in the table until the child has exited.
      function halt(why: string): void {
        if (job.verdict) return
        job.verdict = why
        job.out = ""
        job.running = false
        job.watchdog.interval = root._slackSec * 1000
        job.watchdog.restart()
      }

      clearEnvironment: true
      stdout: SplitParser {
        // Raw chunks, counted before they are kept.
        splitMarker: ""
        onRead: function(chunk) {
          if (job.verdict) return
          job.got += chunk.length
          if (job.got > job.spec.maxBytes) { job.halt("overflow"); return }
          job.out += chunk
        }
      }
      stderr: SplitParser {
        splitMarker: ""
        onRead: function(chunk) {
          if (job.err.length < root._stderrChars) job.err = (job.err + chunk).slice(0, root._stderrChars)
        }
      }
      onStarted: {
        sawStarted = true
        startedAt = Date.now()
        watchdog.start()
        // Closing stdin is the end of input for the child.
        if (stdinEnabled) { write(spec.stdin); stdinEnabled = false }
      }
      onExited: function(exitCode, exitStatus) { root._settle(job, exitCode, exitStatus) }
      // Without setpriv there is no start and no exit, only this.
      onRunningChanged: if (!running && !sawStarted) root._settle(job, -1, 0)
    }
  }
}
