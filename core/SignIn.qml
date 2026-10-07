import QtQuick
import Quickshell.Io
import "../lib/Browsers.js" as Browsers
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Errors.js" as Errors
import "../lib/FeedUrls.js" as FeedUrls
import "../lib/Ids.js" as Ids
import "../lib/Paths.js" as Paths

// Signing in to YouTube, which nobody has to do: the steps from "sign in"
// to a saved login, every use of that login afterwards, and its removal.
//
// Signing in. The user's default browser is opened on a fresh, throwaway
// profile inside the runtime directory. The password is typed into that
// real browser window and never comes near the plugin. When the window is
// closed, a constant helper turns the profile's cookies into the saved
// login (YouTube's rows only, private from the first byte), and the profile
// is deleted: on every way that step can end, and before anything else
// happens. One request then shows whether YouTube accepts the login. A
// login that request did not show to work, for whatever reason, is deleted
// again, and so is one that was saved in the moment the user cancelled: a
// failed attempt leaves no new login behind.
//
// Using the login. The saved file is never opened by the plugin and never
// handed to a tool. Each call that needs it gets a throwaway copy, runs
// with a private umask, and the copy is removed when the tool has exited.
// Only one such call runs at a time. What a tool prints when YouTube no
// longer accepts the login is looked for before anything else in its
// result; from then on no call is given the login again.
//
// This file owns the one browser process, the sign-in state the panel
// shows, the queue of signed-in calls, and the report that a video was
// watched: off unless the user switched it on, and only for a track that
// has really been playing for a while.
Item {
  id: root

  // Given by the service: the process runner, the tool table (replaced only
  // by tests) and the file layer.
  property var runner: null
  property var tools: Const.TOOLS
  property var fs: null
  // The user's settings. Only markWatched is read.
  property var settings: null
  // True while nothing may be started: before start-up has finished, while
  // a tool is missing, while the proxy notice waits for its answer. Signing
  // out works all the same; it only removes files.
  property bool hold: true
  // What is playing, for the watched report: the playback status and the
  // current track (or null).
  property string playbackStatus: "idle"
  property var currentTrack: null
  // How long a track has to have been playing before it is reported as
  // watched, in milliseconds.
  property int markAfterMs: Const.TIMEOUTS.markSec * 1000

  // "off", "confirm" (the user is shown what will happen), "browser" (the
  // window is open), "exporting", "verifying", "on" or "failed".
  readonly property string status: _status
  // Why the last attempt failed, or that YouTube ended the session, while
  // status is "failed"; else "".
  readonly property string errorCode: _errorCode
  // The browser that will be opened, once it is known; "" before. The
  // confirmation page shows it, and confirmSignIn() waits for it.
  readonly property string browserPath: _browser !== null ? _browser.bin : ""
  // True while calls may be given the login.
  readonly property bool signedIn: _granted
  // A saved login is on disk, whether or not YouTube still accepts it.
  readonly property bool hasLogin: fs !== null && fs.jarPresent === true
  // Where the saved login lives, for the page that says so.
  readonly property string loginFile: fs !== null && fs.paths.ok === true ? fs.paths.jarFile : ""
  // False until the first look for a saved login has finished.
  readonly property bool known: _known
  // True while an attempt may have saved a login that YouTube has not
  // answered for yet. Whoever ends this component in that moment removes
  // the login file: nobody would be there to do it later, and the next
  // start would count the file as signed in.
  readonly property bool unproven: _status === "exporting" || _status === "verifying"
  // True while signOut() is at work.
  readonly property bool signingOut: _signingOut
  // True when the last signOut() could not remove the saved login.
  readonly property bool loginLeft: _loginLeft

  // What the question for the default browser may print: one desktop id.
  readonly property int _queryReplyBytes: 512
  // A watched report prints nothing.
  readonly property int _markReplyBytes: 4096
  // Seconds between the moment the browser should be gone (the grace it is
  // given after a request to stop) and our own SIGKILL.
  readonly property int _slackSec: 4
  // The exit codes with which timeout and setpriv say that the deadline
  // passed, that the browser had to be killed, or that it could not be run.
  readonly property int _exitDeadline: 124
  readonly property int _exitKilled: 137
  readonly property var _exitUnrunnable: [125, 126, 127]

  property string _status: "off"
  property string _errorCode: ""
  // The row of lib/Browsers.js the default browser selected, or null.
  property var _browser: null
  property bool _granted: false
  property bool _known: false
  property bool _looked: false
  property bool _signingOut: false
  property bool _loginLeft: false
  // Counts sign-in attempts that got past the confirmation. A step that
  // finds another number has been overtaken and says nothing.
  property int _flow: 0
  property int _lookJob: 0
  property int _exportJob: 0
  property int _verifyTicket: 0
  // The user asked to stop the attempt that is under way.
  property bool _cancelRequested: false
  // Counters of the attempt directories: the last one made, and every one
  // that was made and has not been seen removed.
  property int _attempts: 0
  property var _live: []
  // The signed-in calls: the ones that wait, the one that runs, and the
  // counters that name tickets and throwaway copies.
  property var _queue: []
  property var _current: null
  property int _tickets: 0
  property int _copies: 0
  // What signOut() goes on with once no signed-in call is left.
  property var _afterIdle: null
  // The watched report: the track that is being timed, how long it has
  // played before the stretch that is running, when that stretch began
  // (0 while none runs), and whether the track has been reported.
  property string _markId: ""
  property real _playedMs: 0
  property real _since: 0
  property bool _marked: false
  readonly property bool _fsReady: fs !== null && fs.status === "ready"
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // Emitted when signOut() has finished, after every property has its new
  // value. The service drops what it resolved with the account.
  signal signedOut()

  // ---- Signing in ----

  // Starts an attempt: removes what an earlier attempt of this service may
  // have left, checks the data directory and finds the default browser.
  // status is "confirm" at once; browserPath follows, or "failed". Nothing
  // is opened before confirmSignIn(). Returns false when no attempt can be
  // started now.
  function beginSignIn(): bool {
    // Not before the look for a saved login has finished: an attempt that
    // fails removes the login file, and that must never be one in use.
    if (!root._usable() || !root._known || root.hold || root._signingOut) return false
    if (root._status !== "off" && root._status !== "failed") return false
    var gen = ++root._flow
    root._errorCode = ""
    root._browser = null
    root._cancelRequested = false
    root._status = "confirm"
    root._sweep(function() {
      if (gen !== root._flow) return
      root.fs.prepareData(function(prepared) {
        if (gen !== root._flow) return
        if (!prepared.ok) { root._fail(root._localCode(prepared)); return }
        root._findBrowser(gen)
      })
    })
    return true
  }

  // Opens the browser on a fresh profile. Returns false unless the user is
  // looking at the confirmation and the browser is known.
  function confirmSignIn(): bool {
    if (root.hold || root._status !== "confirm" || root._browser === null) return false
    var n = root._attempts + 1
    var dir = Paths.signinAttemptDir(root.fs.paths, n)
    var command = Browsers.launchArgv(root.tools, root._browser.id, dir)
    var environment = Env.browser(dir)
    // An empty command means the browser, the directory or a tool was
    // refused. Nothing is started then, least of all a shortened command.
    if (dir === "" || command.length === 0 || environment === null) {
      root._fail("E_SIGNIN_BROWSER")
      return false
    }
    root._attempts = n
    root._live = root._live.concat([n])
    root._status = "browser"
    var family = root._browser.family
    root.fs.makeSigninDirs(n, family, family === "firefox" ? Browsers.USER_JS : "", function(made) {
      if (!made.ok) { root._discard(n, root._localCode(made)); return }
      if (root._cancelRequested) { root._discard(n, "E_SIGNIN_CANCELLED"); return }
      child.attempt = n
      child.sawStarted = false
      child.sawExit = false
      child.handled = false
      child.command = command
      child.environment = environment
      child.running = true
    })
    return true
  }

  // Stops the attempt that is under way. Before the browser was opened that
  // is all; afterwards the attempt ends as "failed" with E_SIGNIN_CANCELLED
  // once the browser or the running step has really ended and the profile
  // is gone. Returns false when no attempt is under way.
  function cancelSignIn(): bool {
    if (root._status === "confirm") {
      root._flow += 1
      if (root._lookJob !== 0 && root.runner !== null) root.runner.cancel(root._lookJob)
      root._lookJob = 0
      root._browser = null
      root._status = "off"
      return true
    }
    if (root._status === "browser") {
      root._cancelRequested = true
      // SIGTERM to timeout, which passes it on and kills what is left after
      // its grace. The profile is removed when the browser has exited, not
      // now: it may still be writing.
      if (child.running) {
        child.running = false
        force.restart()
      }
      return true
    }
    if (root._status === "exporting") {
      root._cancelRequested = true
      if (root._exportJob !== 0) root.runner.cancel(root._exportJob)
      return true
    }
    if (root._status === "verifying") {
      root._cancelRequested = true
      root.cancelSigned(root._verifyTicket)
      return true
    }
    return false
  }

  // Removes the saved login and everything made from it: waits for the
  // signed-in calls to end, deletes the file, asks the file layer whether
  // it is really gone (loginLeft), and deletes copies and attempt
  // directories. Ends with status "off" and signedOut(). The session itself
  // still exists at Google until the user removes it there; the page says
  // so. Returns false while an attempt or another sign-out is under way.
  function signOut(): bool {
    if (!root._usable() || root._signingOut) return false
    if (root._status !== "off" && root._status !== "on" && root._status !== "failed") return false
    root._signingOut = true
    root._flow += 1
    // From here on no call is given the login.
    root._granted = false
    root._flush("")
    if (root._current !== null) {
      root._afterIdle = function() { root._removeLogin() }
      root._cancelCurrent()
    } else {
      root._removeLogin()
    }
    return true
  }

  // ---- Signed-in calls ----

  // Runs one yt-dlp call with the login, after the ones that are waiting.
  // request: { tag, build, stdin, timeoutSec, maxBytes, done }. build(copy)
  // returns the command line for the throwaway cookie file it is handed,
  // from a builder of lib/FeedUrls.js. done(result, code) gets the runner's
  // result, and code "E_SIGNED_OUT" (with nothing of the output) when the
  // call showed that YouTube no longer accepts the login. It is called
  // exactly once, never before this function returns, and only after the
  // copy is gone. Returns a ticket for cancelSigned(), or 0 when the call
  // was not taken.
  function runSigned(request: var): int {
    return root._enqueue(request, false)
  }

  // Gives up a call. Its done still follows, with the error "cancelled".
  function cancelSigned(ticket: int): void {
    if (ticket <= 0) return
    for (var i = 0; i < root._queue.length; i++) {
      if (root._queue[i].ticket !== ticket) continue
      var entry = root._queue[i]
      root._queue = root._queue.slice(0, i).concat(root._queue.slice(i + 1))
      root._deliverLater(entry.request.done, root._answer("cancelled"), "")
      return
    }
    if (root._current !== null && root._current.ticket === ticket) root._cancelCurrent()
  }

  // ---- Start-up ----

  function _usable() {
    return root._fsReady && root.runner !== null
  }

  // Asks once whether a saved login is there. That is all "signed in" means
  // at start-up: no request is made to find out more.
  function _look() {
    if (root._looked || !root._usable()) return
    root._looked = true
    root.fs.prepareData(function(prepared) {
      if (root._status === "off" && !root._signingOut && root.fs.jarPresent === true) {
        root._granted = true
        root._status = "on"
      }
      root._known = true
    })
  }

  // ---- The steps of an attempt ----

  // A result in the runner's shape for a call that had no child.
  function _answer(error) {
    return { ok: false, error: error, exitCode: -1, stdout: "", stderr: "", durationMs: 0 }
  }

  function _fail(code) {
    root._errorCode = code
    root._status = "failed"
  }

  // The code for a local helper that failed: the tools are not there, or a
  // directory cannot be used.
  function _localCode(result) {
    return result.error === "nowrap" || result.error === "missing" ? "E_TOOLS_MISSING" : "E_RUNTIME_DIR"
  }

  function _forget(n) {
    root._live = root._live.filter(function(other) { return other !== n })
  }

  // Removes every attempt directory this service made and has not seen
  // removed, one after the other, then calls then(). Normally there is
  // none.
  function _sweep(then) {
    var left = root._live.slice()
    var step = function() {
      if (left.length === 0) { then(); return }
      var n = left.shift()
      root.fs.removeTree(Paths.signinAttemptDir(root.fs.paths, n), function(removed) {
        if (removed.ok) root._forget(n)
        step()
      })
    }
    step()
  }

  // Ends an attempt whose directory is not needed any more: removes it,
  // and only then says how the attempt ended.
  function _discard(n, code) {
    root.fs.removeTree(Paths.signinAttemptDir(root.fs.paths, n), function(removed) {
      if (removed.ok) root._forget(n)
      root._fail(code)
    })
  }

  // The default browser, by its desktop id alone: the id selects a row of a
  // fixed table or nothing. No desktop file is read and none is run.
  function _findBrowser(gen) {
    var argv = Browsers.queryArgv(root.tools)
    if (argv.length === 0) { root._fail("E_SIGNIN_BROWSER"); return }
    root._lookJob = root.runner.run({
      tag: "default-browser",
      argv: argv,
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._queryReplyBytes,
      env: Env.local(),
      done: function(result) {
        if (gen !== root._flow) return
        root._lookJob = 0
        var found = result.ok ? Browsers.lookup(result.stdout) : { ok: false }
        if (found.ok !== true) { root._fail("E_SIGNIN_BROWSER"); return }
        root._browser = found
      }
    })
  }

  // The browser process is gone, or never was. Runs once per start.
  function _browserEnded() {
    if (child.handled) return
    child.handled = true
    force.stop()
    var n = child.attempt
    var normal = child.sawExit && child.lastStatus === 0
    var code = child.lastCode
    if (root._cancelRequested) root._discard(n, "E_SIGNIN_CANCELLED")
    else if (!child.sawStarted) root._discard(n, "E_TOOLS_MISSING")
    else if (normal && root._exitUnrunnable.indexOf(code) !== -1) root._discard(n, "E_SIGNIN_BROWSER")
    // The deadline passed, or the process ended in a way no closed window
    // does. Either way nobody finished signing in.
    else if (!normal || code === root._exitDeadline || code === root._exitKilled) {
      root._discard(n, "E_SIGNIN_CANCELLED")
    } else root._export(n)
  }

  // Reports a browser that never ran, one turn later: confirmSignIn() never
  // fails before it has returned.
  function _browserEndedLater() {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) root._browserEnded()
    })
  }

  // The window was closed: the profile's cookies become the saved login.
  // Whatever comes of it, the profile is removed in the job's done, and the
  // state moves on only when that removal has finished. The helper removes
  // the directory itself when it ends by itself, but a helper that had to
  // be killed removes nothing.
  function _export(n) {
    root._status = "exporting"
    root._exportJob = root.fs.exportCookies(root._browser.ytName, n, function(result) {
      root._exportJob = 0
      root.fs.removeTree(Paths.signinAttemptDir(root.fs.paths, n), function(removed) {
        if (removed.ok) root._forget(n)
        root._exported(result)
      })
    })
  }

  // What the export says decides how the attempt goes on. Its helper prints
  // "not-signed-in" or "error" only when it has saved nothing, and a helper
  // that never ran saved nothing either. In every other case that does not
  // end in a login to check (the user cancelled, the time ran out, the
  // helper was stopped) it may have saved the login a moment before, and a
  // login the attempt did not end with does not stay.
  function _exported(result) {
    var said = result.ok || result.error === "exit" ? result.stdout.split("\n")[0] : ""
    var cancelled = root._cancelRequested || result.error === "cancelled"
    if (result.ok && said === "ok" && !cancelled) {
      root.fs.prepareData(function(prepared) {
        if (root._cancelRequested) root._giveUp("E_SIGNIN_CANCELLED")
        else if (!prepared.ok || root.fs.jarPresent !== true) root._giveUp("E_SIGNIN_NONE")
        else root._verify()
      })
      return
    }
    var unrunnable = result.error === "nowrap" || result.error === "missing"
    var code = cancelled ? "E_SIGNIN_CANCELLED" : (unrunnable ? "E_TOOLS_MISSING" : "E_SIGNIN_NONE")
    var savedNothing = !cancelled && (unrunnable || said === "not-signed-in" || said === "error")
    if (savedNothing) root._fail(code)
    else root._giveUp(code)
  }

  // One signed-in request, for one row of the user's own Watch Later list:
  // only an accepted login gets an answer.
  function _verify() {
    root._status = "verifying"
    root._verifyTicket = root._enqueue({
      tag: "signin-verify",
      build: function(copy) { return FeedUrls.verifyArgv(root.tools, root.fs.paths, copy) },
      stdin: FeedUrls.url("later") + "\n",
      timeoutSec: Const.TIMEOUTS.feed,
      maxBytes: Const.LIMITS.feedBytes,
      done: function(result, code) { root._verified(result, code) }
    }, true)
  }

  // Only a login YouTube answered for is kept. Whatever else came of the
  // request (cancelled, no network, an answer that cannot be read, a login
  // YouTube does not accept), the file that was just saved is removed
  // before the attempt is said to have failed: a login nobody saw working
  // must not count as signed in at the next start.
  function _verified(result, code) {
    root._verifyTicket = 0
    var failure = ""
    if (root._cancelRequested || result.error === "cancelled") failure = "E_SIGNIN_CANCELLED"
    else if (code !== "") failure = code
    else if (!result.ok) failure = Errors.fromYtDlp(result)
    else if (FeedUrls.parse("later", result.stdout).ok !== true) failure = "E_BAD_OUTPUT"
    if (failure !== "") { root._giveUp(failure); return }
    root._errorCode = ""
    root._granted = true
    root._status = "on"
  }

  // ---- Removing the login ----

  // Deletes the saved login and asks the file layer whether it is gone.
  function _dropLogin(then) {
    root.fs.remove([root.fs.paths.jarFile], function(removed) {
      root.fs.prepareData(function(prepared) { then() })
    })
  }

  // Ends an attempt that may have saved a login: the login goes first, and
  // only then is the attempt said to have failed.
  function _giveUp(code) {
    root._dropLogin(function() { root._fail(code) })
  }

  function _removeLogin() {
    root._dropLogin(function() {
      root._loginLeft = root.fs.jarPresent === true
      root.fs.purgeDir(root.fs.paths.jarDir, function(purged) {
        root._sweep(function() {
          root._errorCode = ""
          root._browser = null
          root._status = "off"
          root._signingOut = false
          root.signedOut()
        })
      })
    })
  }

  // ---- The queue of signed-in calls ----

  function _deliver(done, result, code) {
    try {
      done(result, code)
    } catch (error) {
      // What a callback threw is not logged: a message can carry anything.
      console.warn("omajuke: a signed-in callback failed")
    }
  }

  function _deliverLater(done, result, code) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) root._deliver(done, result, code)
    })
  }

  function _wellFormed(request) {
    if (request === null || typeof request !== "object") return false
    if (typeof request.build !== "function" || typeof request.done !== "function") return false
    return typeof request.tag === "string" && typeof request.stdin === "string"
  }

  // verifying: the one call that runs before the login counts as accepted.
  function _enqueue(request, verifying) {
    if (!root._wellFormed(request)) {
      console.warn("omajuke: a malformed signed-in call was refused")
      return 0
    }
    var allowed = root._usable() && !root.hold && !root._signingOut && (root._granted || verifying)
    if (!allowed) {
      root._deliverLater(request.done, root._answer("refused"), "")
      return 0
    }
    var ticket = ++root._tickets
    var entry = { ticket: ticket, request: request, copy: 0, job: 0, cancelled: false }
    root._queue = root._queue.concat([entry])
    root._pump()
    return ticket
  }

  // Starts the next call when none runs: first the throwaway copy of the
  // login, then the tool.
  function _pump() {
    if (root._current !== null || root._queue.length === 0) return
    var entry = root._queue[0]
    root._queue = root._queue.slice(1)
    root._current = entry
    entry.copy = ++root._copies
    root.fs.copyJar(entry.copy, function(copied) { root._copied(entry, copied) })
  }

  function _copied(entry, copied) {
    if (!copied.ok) {
      // The saved login may be gone. The file layer finds out, and without
      // one nobody is signed in.
      root.fs.prepareData(function(prepared) {
        if (root.fs.jarPresent !== true && root._granted) {
          root._granted = false
          root._status = "off"
        }
        root._finish(entry, copied)
      })
      return
    }
    if (entry.cancelled) { root._finish(entry, root._answer("cancelled")); return }
    var copy = Paths.jarCopyFile(root.fs.paths, entry.copy)
    var argv = null
    try {
      argv = entry.request.build(copy)
    } catch (error) {
      console.warn("omajuke: a signed-in command could not be built")
    }
    var env = Env.net(root.fs.paths)
    if (!root._carriesCopy(argv, copy) || env === null) {
      root._finish(entry, root._answer("refused"))
      return
    }
    entry.job = root.runner.run({
      tag: entry.request.tag,
      argv: argv,
      stdin: entry.request.stdin,
      timeoutSec: entry.request.timeoutSec,
      maxBytes: entry.request.maxBytes,
      env: env,
      // yt-dlp writes the cookie file it is given anew. The mask keeps that
      // file private whatever the shell's own mask is.
      umask077: true,
      done: function(result) {
        entry.job = 0
        root._finish(entry, result)
      }
    })
  }

  // True for a command line that names exactly this copy as its cookie
  // file and keeps its warnings: the one way a login that is no longer
  // accepted shows is a warning.
  function _carriesCopy(argv, copy) {
    if (!Array.isArray(argv) || copy === "") return false
    var at = argv.indexOf("--cookies")
    if (at === -1 || argv[at + 1] !== copy || argv.lastIndexOf("--cookies") !== at) return false
    return argv.indexOf("--no-warnings") === -1 && argv.indexOf("--no-cookies") === -1
  }

  function _cancelCurrent() {
    var entry = root._current
    if (entry === null) return
    entry.cancelled = true
    if (entry.job !== 0) root.runner.cancel(entry.job)
  }

  // The tool has exited, or never ran: the copy goes first, and nothing is
  // said before it is gone.
  function _finish(entry, result) {
    root.fs.remove([Paths.jarCopyFile(root.fs.paths, entry.copy)], function(removed) {
      root._settle(entry, result)
    })
  }

  function _settle(entry, result) {
    root._current = null
    // Looked for before the exit code or the output: a call can succeed and
    // still have run without an account.
    var code = Errors.fromSignedIn(result)
    var answer = result
    if (code !== "") {
      answer = root._answer("signed-out")
      root._revoke()
    }
    root._deliver(entry.request.done, answer, code)
    if (root._current === null && root._queue.length === 0 && root._afterIdle !== null) {
      var next = root._afterIdle
      root._afterIdle = null
      next()
      return
    }
    root._pump()
  }

  // Answers every waiting call without running it.
  function _flush(code) {
    var waiting = root._queue
    root._queue = []
    for (var i = 0; i < waiting.length; i++) {
      root._deliverLater(waiting[i].request.done, root._answer(code === "" ? "cancelled" : "refused"), code)
    }
  }

  // YouTube no longer accepts the login. No call is given it any more. A
  // login that had been in use stays on disk until the user signs in again
  // or out, and the page offers both. A new login that fails its first
  // request is removed instead: _verified() does that and then says so.
  function _revoke() {
    root._granted = false
    root._flush("E_SIGNED_OUT")
    if (root._signingOut || root._status === "verifying") return
    root._errorCode = "E_SIGNED_OUT"
    root._status = "failed"
  }

  // ---- The watched report ----

  function _wantsMark() {
    var settings = root.settings
    return root._granted && !root.hold && settings !== null && typeof settings === "object"
      && settings.markWatched === true
  }

  function _trackId() {
    var track = root.currentTrack
    var id = track !== null && typeof track === "object" ? track.id : ""
    return Ids.isId(id) ? id : ""
  }

  // Called whenever something changed that the timing depends on. Closes
  // the stretch of playing that was running and opens a new one if the
  // track is playing right now, is not yet reported and the user wants
  // reports. The timer therefore runs only while a track really plays, and
  // only for what is left of its time: a track that sits paused is never
  // reported, however long it sits.
  function _account() {
    var now = Date.now()
    if (root._since > 0) root._playedMs += Math.max(0, now - root._since)
    root._since = 0
    markTimer.stop()
    var id = root._trackId()
    if (id !== root._markId) {
      root._markId = id
      root._playedMs = 0
      root._marked = false
    }
    if (id === "" || root._marked || root.playbackStatus !== "playing" || !root._wantsMark()) return
    root._since = now
    markTimer.interval = Math.max(1, root.markAfterMs - root._playedMs)
    markTimer.start()
  }

  // The track has played long enough. It is reported once, also if the
  // report fails: a second try could report a track the user has left.
  function _report() {
    root._since = 0
    root._playedMs = root.markAfterMs
    var id = root._trackId()
    if (id === "" || id !== root._markId || root.playbackStatus !== "playing" || !root._wantsMark()) return
    root._marked = true
    root.runSigned({
      tag: "mark-watched",
      build: function(copy) { return FeedUrls.markArgv(root.tools, root.fs.paths, copy) },
      stdin: Ids.watchUrl(id) + "\n",
      timeoutSec: Const.TIMEOUTS.resolve,
      maxBytes: root._markReplyBytes,
      done: function(result, code) {}
    })
  }

  onPlaybackStatusChanged: root._account()
  onCurrentTrackChanged: root._account()
  onSettingsChanged: root._account()
  onHoldChanged: root._account()
  onMarkAfterMsChanged: root._account()
  on_GrantedChanged: root._account()
  on_FsReadyChanged: {
    if (root._fsReady) root._look()
    else root._looked = false
  }

  Component.onCompleted: root._look()
  Component.onDestruction: root._life.alive = false

  // The browser. Both outputs are read in raw chunks that nobody keeps:
  // a browser prints a lot, none of it is ours to hold, and a pipe nobody
  // reads would stall it. Its lifetime is bounded by timeout inside the
  // command, not by a timer here, so it also ends if this object's engine
  // goes away without ending it.
  Process {
    id: child

    // The counter of the attempt directory this start belongs to.
    property int attempt: 0
    property bool sawStarted: false
    property bool sawExit: false
    property bool handled: true
    property int lastCode: 0
    property int lastStatus: 0

    clearEnvironment: true
    stdout: SplitParser {
      splitMarker: ""
    }
    stderr: SplitParser {
      splitMarker: ""
    }

    onStarted: sawStarted = true
    // An ending is handled once both are known: how the process exited, and
    // that the host no longer counts it as running.
    onExited: function(exitCode, exitStatus) {
      sawExit = true
      lastCode = exitCode
      lastStatus = exitStatus
      if (!running) root._browserEnded()
    }
    // A wrapper that could not be run gives no start and no exit, only
    // this.
    onRunningChanged: {
      if (running) return
      if (!sawStarted) root._browserEndedLater()
      else if (sawExit) root._browserEnded()
    }
  }

  // Runs only while a browser that was asked to stop has not gone: the last
  // resort behind timeout's own kill.
  Timer {
    id: force

    interval: (Browsers.GRACE_SEC + root._slackSec) * 1000
    onTriggered: if (child.running || !child.handled) child.signal(9)
  }

  // Runs only while a track is playing that has not been reported yet.
  Timer {
    id: markTimer

    onTriggered: root._report()
  }
}
