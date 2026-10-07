import QtQuick
import "../../../lib/Paths.js" as Paths

// Signing out of core/SignIn.qml: the saved login, every copy of it and
// every sign-in directory are deleted, the calls that were using the login
// are ended first, a fresh look at the data directory confirms that the
// file is gone, and when it is not, the component says so. A file the user
// keeps beside the login is not touched. A login YouTube no longer accepts
// is removed the same way.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var signIn: null
  property var steps: []
  property int at: 0
  property int signedOutSignals: 0
  // What signedOut() found when it was emitted.
  property var seenAtSignal: []
  // Where in the list of jobs the sign-out with running calls begins.
  property int jobsBefore: 0

  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    h.tools.ytdlp = h.repo + "/tests/stubs/yt-dlp-account.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.signIn = h.mount("core/SignIn.qml", {
      runner: root.runner, tools: h.tools, fs: root.fs, hold: false
    })
    if (root.runner === null || root.fs === null || root.signIn === null) { h.finish(); return }
    root.signIn.signedOut.connect(function() {
      root.signedOutSignals += 1
      root.seenAtSignal = root.snapshot()
    })
    root.steps = [
      root.nothingToRemove, root.signInFirst, root.whileCallsRun, root.everythingGone, root.afterwards,
      root.signInAgain, root.fileThatStays, root.secondTry, root.whileHeld, root.endedSession, root.quiet
    ]
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (ok) root.next()
      else h.finish()
    })
    root.fs.prepare()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // ---- Helpers ----

  function scene(ytdlp) {
    root.h.scenario({ "xdg-settings": "id:chromium.desktop", browser: "ok", ytdlp: ytdlp })
  }

  // then(names): what is directly inside dir, hidden files included.
  function names(dir, then) {
    var find = ["/usr/bin/find", dir, "-mindepth", "1", "-maxdepth", "1", "-printf", "%f\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  function snapshot() {
    var s = root.signIn
    return [s.status, s.errorCode, s.signedIn, s.hasLogin, s.signingOut, s.loginLeft]
  }

  function tagsSince(from) {
    return root.h.jobs().slice(from).map(function(job) { return job.tag })
  }

  // then(): signed in through a whole attempt.
  function signInThen(then) {
    var h = root.h
    root.scene("ok")
    h.equal(root.signIn.beginSignIn(), true, "sign in: taken")
    h.waitFor(function() { return root.signIn.browserPath !== "" }, 8000, function() {
      h.equal(root.signIn.confirmSignIn(), true, "sign in: confirmed")
      h.waitFor(function() { return root.signIn.status === "on" }, 15000, function(on) {
        h.check(on, "sign in: signed in")
        then()
      })
    })
  }

  function call(tag, notes) {
    return root.signIn.runSigned({
      tag: tag,
      build: function(copy) {
        return [root.h.tools.ytdlp, "--cookies", copy, "--flat-playlist", "-J", "-a", "-"]
      },
      stdin: "https://www.youtube.com/feed/subscriptions\n",
      timeoutSec: 25,
      maxBytes: 1048576,
      done: function(result, code) { notes.push(tag + " " + result.error + "/" + code) }
    })
  }

  // ---- Steps ----

  // Signing out with nothing saved is not an error: it removes whatever
  // may be there and ends "off".
  function nothingToRemove() {
    var h = root.h
    h.waitFor(function() { return root.signIn.known }, 5000, function() {
      var before = h.jobs().length
      h.equal(root.signIn.signOut(), true, "nothing saved: taken")
      h.equal(root.signIn.signingOut, true, "nothing saved: at work")
      h.equal(root.signIn.signOut(), false, "nothing saved: not twice at once")
      h.waitFor(function() { return root.signedOutSignals === 1 }, 8000, function() {
        h.equal(root.snapshot(), ["off", "", false, false, false, false], "nothing saved: off")
        h.equal(root.tagsSince(before), ["remove", "prepare-data", "purge"], "nothing saved: the same steps")
        root.next()
      })
    })
  }

  function signInFirst() {
    root.signInThen(root.next)
  }

  // Two calls are using the login when the user signs out, and files lie
  // about: a stray copy, what an interrupted export left, and a file of the
  // user's own beside the login.
  function whileCallsRun() {
    var h = root.h
    var paths = root.fs.paths
    var notes = []
    h.writeFile(paths.jarDir + "/99.txt", "stray copy\n")
    h.writeFile(paths.dataDir + "/.cookies.txt.AbC123", "unfinished\n")
    h.writeFile(paths.dataDir + "/notes.txt", "the user's own\n")
    root.scene("hang")
    var starts = h.log("ytdlp").length
    root.jobsBefore = h.jobs().length
    root.call("running", notes)
    root.call("waiting", notes)
    h.waitFor(function() { return h.log("ytdlp").length > starts }, 8000, function(started) {
      h.check(started, "calls: one runs")
      root.names(paths.jarDir, function(copies) {
        h.equal(copies, ["2.txt", "99.txt"], "calls: its copy is there")
        h.equal(root.signIn.signOut(), true, "calls: the user signs out")
        h.equal(root.snapshot(), ["on", "", false, true, true, false],
          "calls: no call is given the login from this moment")
        h.equal(root.call("late", notes), 0, "calls: a new call is not taken")
        h.equal(root.signIn.beginSignIn(), false, "calls: and no attempt starts meanwhile")
        h.waitFor(function() { return root.signedOutSignals === 2 }, 12000, function(done) {
          h.check(done, "calls: signed out")
          h.equal(notes, ["waiting cancelled/", "late refused/", "running cancelled/"],
            "calls: each call is answered, the running one once it has really ended")
          root.next()
        })
      })
    })
  }

  function everythingGone() {
    var h = root.h
    var paths = root.fs.paths
    h.equal(root.seenAtSignal, ["off", "", false, false, false, false],
      "gone: the signal comes when everything has its new value")
    var jobs = h.jobs().slice(root.jobsBefore)
    h.equal(jobs.map(function(job) { return job.tag }),
      ["jar-copy", "running", "remove", "remove", "prepare-data", "purge"],
      "gone: the call ends and its copy goes before the login is removed")
    h.equal(jobs[2].command.slice(-1), [Paths.jarCopyFile(paths, 2)], "gone: first the copy")
    h.equal(jobs[3].command.slice(-4), [h.tools.rm, "-f", "--", paths.jarFile], "gone: then the saved login")
    h.equal(jobs[5].command.slice(7, 9), [h.tools.find, paths.jarDir], "gone: then every copy")
    root.names(paths.dataDir, function(data) {
      h.equal(data, ["notes.txt"], "gone: the login and the unfinished file, not the user's own file")
      root.names(paths.jarDir, function(copies) {
        h.equal(copies, [], "gone: every copy, the stray one too")
        root.names(paths.signinDir, function(attempts) {
          h.equal(attempts, [], "gone: no sign-in directory")
          h.alive(function(left) {
            h.equal(left, [], "gone: the call that was running has ended")
            root.next()
          })
        })
      })
    })
  }

  function afterwards() {
    var h = root.h
    var notes = []
    var starts = h.log("ytdlp").length
    var before = h.jobs().length
    root.scene("ok")
    h.equal(root.call("after", notes), 0, "afterwards: no call is taken")
    h.waitFor(function() { return notes.length === 1 }, 3000, function() {
      h.equal(notes, ["after refused/"], "afterwards: and it is told so")
      h.equal([h.log("ytdlp").length - starts, h.jobs().length - before], [0, 0], "afterwards: nothing ran")
      // A component that starts now finds nobody signed in.
      var fresh = h.mount("core/SignIn.qml", {
        runner: root.runner, tools: h.tools, fs: root.fs, hold: false
      })
      if (fresh === null) { h.finish(); return }
      h.waitFor(function() { return fresh.known }, 5000, function() {
        h.equal([fresh.status, fresh.signedIn, fresh.hasLogin], ["off", false, false],
          "afterwards: a restart finds no login")
        fresh.destroy()
        root.next()
      })
    })
  }

  function signInAgain() {
    root.signInThen(function() {
      root.names(root.fs.paths.dataDir, function(data) {
        root.h.equal(data, ["cookies.txt", "notes.txt"], "again: a login is saved again")
        root.next()
      })
    })
  }

  // The file cannot be deleted. The component does not pretend: it looks
  // again, finds the file, and says that it is still there.
  function fileThatStays() {
    var h = root.h
    var paths = root.fs.paths
    h.exec(["/usr/bin/chmod", "500", paths.dataDir], null, function() {
      h.equal(root.signIn.signOut(), true, "stays: taken")
      h.waitFor(function() { return root.signedOutSignals === 3 }, 8000, function() {
        h.equal(root.snapshot(), ["off", "", false, true, false, true],
          "stays: signed out, and the page can say that the file is still there")
        root.names(paths.dataDir, function(data) {
          h.equal(data, ["cookies.txt", "notes.txt"], "stays: it is")
          root.next()
        })
      })
    })
  }

  // The look at the data directory made it ours to write again, so a
  // second try succeeds.
  function secondTry() {
    var h = root.h
    h.equal(root.signIn.signOut(), true, "second try: taken")
    h.waitFor(function() { return root.signedOutSignals === 4 }, 8000, function() {
      h.equal(root.snapshot(), ["off", "", false, false, false, false], "second try: gone now")
      root.names(root.fs.paths.dataDir, function(data) {
        h.equal(data, ["notes.txt"], "second try: only the user's own file is left")
        root.next()
      })
    })
  }

  // Signing out only removes files, so it works while nothing else may
  // start.
  function whileHeld() {
    var h = root.h
    root.signInThen(function() {
      root.signIn.hold = true
      h.equal(root.signIn.signOut(), true, "held: signing out is taken")
      h.waitFor(function() { return root.signedOutSignals === 5 }, 8000, function() {
        h.equal(root.snapshot(), ["off", "", false, false, false, false], "held: signed out")
        root.signIn.hold = false
        root.next()
      })
    })
  }

  // YouTube ended the session. The login is of no use any more, its file
  // is still there, and signing out is how the user gets rid of it: the
  // failed state takes a sign-out like the signed-in one.
  function endedSession() {
    var h = root.h
    var notes = []
    root.signInThen(function() {
      root.scene("signed-out")
      root.call("ended", notes)
      h.waitFor(function() { return root.signIn.status === "failed" }, 8000, function() {
        h.equal(root.snapshot(), ["failed", "E_SIGNED_OUT", false, true, false, false],
          "ended: not signed in, and the file is still there")
        h.equal(root.signIn.signOut(), true, "ended: signing out is taken")
        h.waitFor(function() { return root.signedOutSignals === 6 }, 8000, function() {
          h.equal(root.snapshot(), ["off", "", false, false, false, false], "ended: off, with no error left")
          root.names(root.fs.paths.dataDir, function(data) {
            h.equal(data, ["notes.txt"], "ended: the login file is gone")
            root.next()
          })
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.indexOf("invented-") === -1, "quiet: no cookie value is in the log")
    h.check(JSON.stringify(h.jobs()).indexOf("invented-") === -1, "quiet: nor in any command")
    root.next()
  }
}
