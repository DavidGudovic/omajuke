import QtQuick
import Quickshell
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Paths.js" as Paths
import "../lib/Sh.js" as Sh

// The plugin's files on disk: where they are, the start-up preparation of
// the private directories, and the only write, read and removal operations
// the plugin has. Every one of them is a bounded job of the process runner
// with a command line from lib/Sh.js.
//
// It owns two rules. Nothing is touched before prepare() has vouched for
// the directories (ours, mode 700, not links). And no path is written, read
// or removed unless Paths.kind() says it has exactly the shape of a file
// the plugin creates and is of a kind that operation is meant for; anything
// else is answered with "refused" and no job.
//
// The saved login (a cookie file) is held tighter than the rest. Nothing
// here can read it or write text to it: it comes to exist through
// exportCookies() alone, is handed to a tool only as a throwaway copy made
// by copyJar(), and can otherwise only be removed.
Item {
  id: root

  // Given by the service: the process runner, and the tool table (replaced
  // only by tests).
  property var runner: null
  property var tools: Const.TOOLS

  // Every path the plugin uses, or { ok: false } when the session's
  // directories cannot be trusted. The session's variables do not change
  // while the shell runs, so this is worked out once.
  readonly property var paths: Paths.resolve({
    XDG_RUNTIME_DIR: Quickshell.env("XDG_RUNTIME_DIR"),
    XDG_STATE_HOME: Quickshell.env("XDG_STATE_HOME"),
    XDG_DATA_HOME: Quickshell.env("XDG_DATA_HOME"),
    HOME: Quickshell.env("HOME")
  })
  // "pending" until a preparation has finished, then "ready" or "failed".
  readonly property string status: _status
  // Why the last preparation failed: E_RUNTIME_DIR, E_TOOLS_MISSING,
  // E_MPV_MISSING or E_YTDLP_MISSING. While prepare() runs again it keeps
  // its value, so the panel does not flicker between two messages.
  readonly property string failCode: _failCode
  // Reported by the preparation: the MPRIS script is readable (media keys
  // will work), and a state file of ours is there to be loaded.
  readonly property bool mprisAvailable: _mprisAvailable
  readonly property bool stateFilePresent: _stateFilePresent
  // What the last prepareData() found: a saved login of ours is there. This
  // is the only way the plugin learns it; the file is never opened to ask.
  readonly property bool jarPresent: _jarPresent

  // What a file job may print: PRIVATE_WRITE prints nothing, the
  // preparation a handful of short tokens.
  readonly property int _writeReplyBytes: 64
  readonly property int _prepareReplyBytes: 256
  // The browser families a sign-in profile can be made for.
  readonly property var _families: ["chromium", "firefox"]

  property string _status: "pending"
  property string _failCode: ""
  property bool _mprisAvailable: false
  property bool _stateFilePresent: false
  property bool _jarPresent: false
  property bool _preparing: false
  // True once a preparation has vouched for the private directories. They
  // then exist and are ours even if a tool is missing; the clean-up at
  // destruction needs to know exactly that.
  property bool _dirsVerified: false
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // Emitted when a preparation has finished, after status and failCode
  // have their new values.
  signal prepared(bool ok)

  // Checks and creates the private directories, wipes what an earlier shell
  // left in the runtime directory, and reports what is installed. Runs once
  // at service creation; it is accepted again only after it failed (nothing
  // can be running then, so wiping the runtime directory is safe). Returns
  // false when it was not accepted.
  function prepare(): bool {
    if (root._preparing || root._status === "ready") return false
    root._preparing = true
    root._status = "pending"
    if (root.paths.ok !== true) {
      root._later(function() { root._finish("E_RUNTIME_DIR") })
      return true
    }
    if (root.runner === null) {
      console.warn("omajuke: the file layer has no runner")
      root._later(function() { root._finish("E_TOOLS_MISSING") })
      return true
    }
    root.runner.run({
      tag: "prepare",
      argv: Sh.prepareArgv(root.tools, root.paths),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._prepareReplyBytes,
      env: Env.local(),
      done: function(result) { root._prepared(result) }
    })
    return true
  }

  // Writes text to the state file or to an info file: private from the
  // first byte, and swapped into place in one step. done(result) gets the
  // runner's result.
  function write(path, text, done) {
    if (!root._usable() || typeof text !== "string" || !root._writable(path)) {
      root._refuse(done)
      return
    }
    root.runner.run({
      tag: "write",
      argv: Sh.writeArgv(root.tools, path),
      stdin: text,
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._writeReplyBytes,
      env: Env.local(),
      done: root._callback(done)
    })
  }

  // Reads at most maxBytes of a file of ours; result.stdout is its text. A
  // larger file is not read cut short: it ends as "overflow". The text is
  // exact only if the file is ASCII (the runner decodes chunk by chunk).
  function read(path, maxBytes, done) {
    var sized = typeof maxBytes === "number" && Math.floor(maxBytes) === maxBytes && maxBytes >= 1
    if (!root._usable() || !sized || !root._readable(path)) {
      root._refuse(done)
      return
    }
    root.runner.run({
      tag: "read",
      argv: Sh.readArgv(root.tools, path, maxBytes),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: maxBytes,
      env: Env.local(),
      done: root._callback(done)
    })
  }

  // Removes files of ours, the saved login and its copies among them. One
  // path that is not a file of ours refuses the whole list. A file that is
  // already gone is not an error.
  function remove(list, done) {
    var ours = root._usable() && Array.isArray(list)
    for (var i = 0; ours && i < list.length; i++) ours = root._removable(list[i])
    if (!ours) {
      root._refuse(done)
      return
    }
    if (list.length === 0) {
      root._later(function() { root._callback(done)(root._answer(true, "")) })
      return
    }
    root.runner.run({
      tag: "remove",
      argv: Sh.removeArgv(root.tools, list),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._writeReplyBytes,
      env: Env.local(),
      done: root._callback(done)
    })
  }

  // Deletes every file directly inside one of the runtime directories that
  // hold numbered files. The directory itself stays.
  function purgeDir(dir, done) {
    var known = root.paths.ok === true
      && (dir === root.paths.infoDir || dir === root.paths.thumbsDir || dir === root.paths.jarDir)
    if (!root._usable() || !known) {
      root._refuse(done)
      return
    }
    root.runner.run({
      tag: "purge",
      argv: Sh.purgeArgv(root.tools, dir),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._writeReplyBytes,
      env: Env.local(),
      done: root._callback(done)
    })
  }

  // Removes the directory of one sign-in attempt with everything in it: the
  // browser profile and whatever an export left. A directory that is already
  // gone is not an error. Nothing else is ever removed as a tree.
  function removeTree(dir, done) {
    if (!root._usable() || Paths.kind(root.paths, dir) !== "signinAttempt") {
      root._refuse(done)
      return
    }
    root.runner.run({
      tag: "remove-tree",
      argv: Sh.removeTreeArgv(root.tools, dir),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._writeReplyBytes,
      env: Env.local(),
      done: root._callback(done)
    })
  }

  // ---- The saved login ----

  // Checks and creates the data directory, removes what an interrupted
  // export left in it, and finds out whether a saved login is there
  // (jarPresent, set before done is called). done(result) gets the runner's
  // result; it is not ok when the directory cannot be trusted.
  function prepareData(done) {
    if (!root._usable()) {
      root._refuse(done)
      return
    }
    root.runner.run({
      tag: "prepare-data",
      argv: Sh.prepareDataArgv(root.tools, root.paths),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._prepareReplyBytes,
      env: Env.local(),
      done: function(result) {
        var tokens = result.ok ? result.stdout.split("\n") : []
        root._jarPresent = tokens.indexOf("ok") !== -1 && tokens.indexOf("jar") !== -1
        root._callback(done)(result)
      }
    })
  }

  // Makes the directory of sign-in attempt n (a counter) with an empty
  // browser profile and an empty configuration directory in it. family is
  // "chromium" or "firefox"; for firefox, userJs is the text of the
  // profile's preferences file. Fails when the directory already exists: an
  // attempt never starts on a profile that was there before it.
  function makeSigninDirs(n, family, userJs, done) {
    var dir = Paths.signinAttemptDir(root.paths, n)
    var firefox = family === "firefox"
    var known = root._families.indexOf(family) !== -1
    var text = !firefox || (typeof userJs === "string" && userJs !== "")
    if (!root._usable() || dir === "" || !known || !text) {
      root._refuse(done)
      return
    }
    var spec = {
      tag: "signin-dirs",
      argv: Sh.signinDirsArgv(root.tools, dir, family),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._writeReplyBytes,
      env: Env.local(),
      done: root._callback(done)
    }
    if (firefox) spec.stdin = userJs
    root.runner.run(spec)
  }

  // Turns the cookies of sign-in attempt n's browser profile into the saved
  // login. browserName is yt-dlp's name for the browser, one of
  // Sh.COOKIE_BROWSERS. result.stdout is one word: "ok", "not-signed-in" or
  // "error". Returns the job's id for runner.cancel(), or 0 when nothing was
  // started.
  //
  // The export removes the attempt directory when it ends by itself, but
  // not when it is killed: the caller calls removeTree() in done whatever
  // the result, and only then moves on.
  function exportCookies(browserName, n, done) {
    var dir = Paths.signinAttemptDir(root.paths, n)
    if (!root._usable() || dir === "" || Sh.COOKIE_BROWSERS.indexOf(browserName) === -1) {
      root._refuse(done)
      return 0
    }
    return root.runner.run({
      tag: "cookie-export",
      argv: Sh.cookieExportArgv(root.tools, browserName, dir, root.paths.jarFile),
      timeoutSec: Const.TIMEOUTS.cookieExport,
      maxBytes: root._writeReplyBytes,
      env: Env.local(),
      umask077: true,
      done: root._callback(done)
    })
  }

  // Copies the saved login to the throwaway file of counter n, for one
  // yt-dlp run: yt-dlp rewrites the cookie file it is given, so it never
  // gets the saved one. The caller removes the copy in that run's done.
  function copyJar(n, done) {
    var copy = Paths.jarCopyFile(root.paths, n)
    if (!root._usable() || copy === "") {
      root._refuse(done)
      return
    }
    root.runner.run({
      tag: "jar-copy",
      argv: Sh.copyArgv(root.tools, root.paths.jarFile, copy),
      timeoutSec: Const.TIMEOUTS.local,
      maxBytes: root._writeReplyBytes,
      env: Env.local(),
      umask077: true,
      done: root._callback(done)
    })
  }

  // ---- Destruction ----

  // Removes everything under the runtime directory, for the service's
  // destruction. Detached, because the runner dies with the service, and
  // bounded by timeout alone. Does nothing unless a preparation has vouched
  // for the directory: an unchecked one may be a link to somewhere else.
  // withJar true removes the saved login as well, for when the plugin is
  // being switched off or removed and not merely restarted.
  function cleanupDetached(withJar) {
    if (!root._dirsVerified) return
    Quickshell.execDetached({
      command: withJar === true ? Sh.cleanupWithJarArgv(root.tools, root.paths)
        : Sh.cleanupArgv(root.tools, root.paths),
      clearEnvironment: true,
      environment: Env.local()
    })
  }

  function _usable() {
    return root._status === "ready" && root.runner !== null
  }

  // The state file or an info file: the two things written through here.
  // (Thumbnails are ours too, but curl writes them.)
  function _writable(path) {
    var kind = Paths.kind(root.paths, path)
    return kind === "state" || kind === "info"
  }

  // What may be read back: never the saved login or a copy of it.
  function _readable(path) {
    var kind = Paths.kind(root.paths, path)
    return kind === "state" || kind === "info" || kind === "thumb"
  }

  // Every file of ours. A sign-in attempt is a directory and goes through
  // removeTree() instead.
  function _removable(path) {
    var kind = Paths.kind(root.paths, path)
    return kind !== "" && kind !== "signinAttempt"
  }

  // A result in the runner's shape for a request that started no job.
  function _answer(ok, error) {
    return { ok: ok, error: error, exitCode: -1, stdout: "", stderr: "", durationMs: 0 }
  }

  function _callback(done) {
    return typeof done === "function" ? done : function(result) {}
  }

  // Like the runner, never answers before the request has returned.
  function _refuse(done) {
    root._later(function() { root._callback(done)(root._answer(false, "refused")) })
  }

  function _later(action) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) action()
    })
  }

  // Reads the constant tokens the preparation printed. The output of a
  // script that ended any other way than by itself is not looked at.
  function _prepared(result) {
    var tokens = result.error === "" || result.error === "exit" ? result.stdout.split("\n") : []
    var has = function(token) { return tokens.indexOf(token) !== -1 }
    var dirsFine = result.ok && has("ok") && !has("bad-dir")
    root._dirsVerified = dirsFine
    root._mprisAvailable = dirsFine && has("mpris")
    root._stateFilePresent = dirsFine && has("state")
    if (result.error === "nowrap" || result.error === "missing") root._finish("E_TOOLS_MISSING")
    else if (!dirsFine) root._finish("E_RUNTIME_DIR")
    else if (!has("mpv")) root._finish("E_MPV_MISSING")
    else if (!has("ytdlp")) root._finish("E_YTDLP_MISSING")
    else root._finish("")
  }

  function _finish(code) {
    root._preparing = false
    root._failCode = code
    root._status = code === "" ? "ready" : "failed"
    root.prepared(code === "")
  }

  Component.onDestruction: root._life.alive = false
}
