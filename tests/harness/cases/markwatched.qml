import QtQuick
import "../../../lib/Paths.js" as Paths

// The watched report of core/SignIn.qml: off unless the user switched it
// on, made only while signed in, and only for a track that has really been
// playing for the set time. Time spent paused, buffering, loading or idle
// does not count, a track that is left early is never reported, and a track
// is reported once. The set time is thirty seconds in the plugin; this case
// runs the same clockwork with one second.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var signIn: null
  property var steps: []
  property int at: 0

  // The time a track has to play here before it is reported, and how long
  // the report may take to show up in the stand-in's record after that:
  // a copy of the login is made first, then the tool starts.
  readonly property int after: 1000
  readonly property int wait: 2500

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
      runner: root.runner, tools: h.tools, fs: root.fs, hold: false, markAfterMs: root.after,
      settings: { markWatched: true }
    })
    if (root.runner === null || root.fs === null || root.signIn === null) { h.finish(); return }
    root.steps = [
      root.notSignedIn, root.signInFirst, root.offByDefault, root.pausedDoesNotCount, root.reportedOnce,
      root.shortVisits, root.idleDoesNotCount, root.eachTrackItsOwnTime, root.switchedOffMidway,
      root.whileHeld, root.commands, root.afterSignedOut, root.quiet
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

  // A queue item as the service has it: a track with a key.
  function track(n) {
    return { id: "MKAAAAAAA" + ("0" + n).slice(-2), title: "Track " + n, channel: "", duration: 200,
      live: false, key: n, auto: false }
  }

  function play(n, status) {
    root.signIn.currentTrack = root.track(n)
    root.signIn.playbackStatus = status
  }

  // The watched reports the stand-in received: the address of each.
  function reports() {
    return root.h.log("ytdlp").filter(function(record) {
      return record.argv.indexOf("--mark-watched") !== -1
    }).map(function(record) { return record.stdin })
  }

  function address(n) {
    return "https://www.youtube.com/watch?v=" + root.track(n).id + "\n"
  }

  // Waits long enough for a report to have been made and recorded, then
  // calls then(reports).
  function settle(then) {
    root.h.after(root.after + 600, function() { then(root.reports()) })
  }

  // ---- Steps ----

  // The setting is on and a track plays, but nobody is signed in.
  function notSignedIn() {
    var h = root.h
    h.waitFor(function() { return root.signIn.known }, 5000, function() {
      root.play(1, "playing")
      root.settle(function(reports) {
        h.equal(reports, [], "signed out: nothing is reported")
        h.equal(h.log("ytdlp").length, 0, "signed out: the tool was not started at all")
        root.signIn.playbackStatus = "idle"
        root.signIn.currentTrack = null
        root.next()
      })
    })
  }

  function signInFirst() {
    var h = root.h
    root.scene("ok")
    root.signIn.settings = { markWatched: false }
    h.equal(root.signIn.beginSignIn(), true, "sign in: taken")
    h.waitFor(function() { return root.signIn.browserPath !== "" }, 8000, function() {
      h.equal(root.signIn.confirmSignIn(), true, "sign in: confirmed")
      h.waitFor(function() { return root.signIn.status === "on" }, 15000, function(on) {
        h.check(on, "sign in: signed in")
        root.next()
      })
    })
  }

  // Signed in, a track plays well past the set time, and the setting is as
  // it comes: off.
  function offByDefault() {
    var h = root.h
    root.play(2, "loading")
    root.play(2, "playing")
    root.settle(function(reports) {
      h.equal(reports, [], "off: nothing is reported")
      root.next()
    })
  }

  // Switched on. A track plays briefly, then sits paused for longer than
  // the set time, buffers, and plays on. Only the playing counts.
  function pausedDoesNotCount() {
    var h = root.h
    root.signIn.settings = { markWatched: true }
    root.play(3, "resolving")
    root.play(3, "loading")
    root.play(3, "playing")
    h.after(300, function() {
      root.signIn.playbackStatus = "paused"
      h.after(root.after + 500, function() {
        h.equal(root.reports(), [], "paused: a track that sits paused is not reported")
        root.signIn.playbackStatus = "buffering"
        h.after(300, function() {
          h.equal(root.reports(), [], "paused: nor one that buffers")
          var resumed = Date.now()
          root.signIn.playbackStatus = "playing"
          h.after(400, function() {
            h.equal(root.reports(), [], "paused: not before the playing time adds up")
            h.waitFor(function() { return root.reports().length === 1 }, root.wait, function(reported) {
              h.check(reported, "paused: reported once it does")
              // 300 ms were played before the pause, so about 700 were
              // left; the report cannot have come much sooner.
              h.check(Date.now() - resumed >= 600, "paused: after what was left of the time, not at once")
              h.equal(root.reports(), [root.address(3)], "paused: the track that played")
              root.next()
            })
          })
        })
      })
    })
  }

  function reportedOnce() {
    var h = root.h
    root.settle(function(still) {
      h.equal(still.length, 1, "once: playing on does not report again")
      root.signIn.playbackStatus = "paused"
      root.signIn.playbackStatus = "playing"
      // The same item handed over anew, as after a change of the queue.
      root.signIn.currentTrack = root.track(3)
      root.settle(function(reports) {
        h.equal(reports.length, 1, "once: nor does a pause, or the queue changing around the track")
        root.next()
      })
    })
  }

  // Five tracks, each started and left before its time: what a user who
  // skips through a list does. None of them was watched.
  function shortVisits() {
    var h = root.h
    var n = 10
    var visit = function() {
      if (n === 15) {
        root.play(15, "paused")
        root.settle(function(reports) {
          h.equal(reports.length, 1, "visits: none of the five is reported")
          root.next()
        })
        return
      }
      root.play(n, "loading")
      root.play(n, "playing")
      n += 1
      h.after(250, visit)
    }
    visit()
  }

  function idleDoesNotCount() {
    var h = root.h
    root.play(20, "playing")
    h.after(root.after - 300, function() {
      root.signIn.playbackStatus = "idle"
      root.settle(function(reports) {
        h.equal(reports.length, 1, "idle: a track that stopped is not reported later")
        root.signIn.playbackStatus = "error"
        root.signIn.currentTrack = null
        root.settle(function(none) {
          h.equal(none.length, 1, "idle: and nothing is, with no track at all")
          root.next()
        })
      })
    })
  }

  // The time is counted per track: one track's playing is not added to the
  // next one's.
  function eachTrackItsOwnTime() {
    var h = root.h
    root.play(21, "playing")
    h.after(root.after - 300, function() {
      root.play(22, "playing")
      h.after(root.after - 300, function() {
        h.equal(root.reports().length, 1, "per track: two tracks short of the time, nothing reported")
        h.waitFor(function() { return root.reports().length === 2 }, root.wait, function(reported) {
          h.check(reported, "per track: the second is reported when its own time is up")
          h.equal(root.reports()[1], root.address(22), "per track: and it is the second")
          root.next()
        })
      })
    })
  }

  // Switched off while a track plays: nothing is reported, however long it
  // goes on.
  function switchedOffMidway() {
    var h = root.h
    root.play(23, "playing")
    h.after(400, function() {
      root.signIn.settings = { markWatched: false }
      root.settle(function(reports) {
        h.equal(reports.length, 2, "switched off: nothing is reported")
        root.signIn.playbackStatus = "paused"
        root.next()
      })
    })
  }

  // While nothing may start, nothing is reported either.
  function whileHeld() {
    var h = root.h
    root.signIn.settings = { markWatched: true }
    root.signIn.hold = true
    root.play(24, "playing")
    root.settle(function(reports) {
      h.equal(reports.length, 2, "held: nothing is reported")
      root.signIn.playbackStatus = "paused"
      root.signIn.hold = false
      root.next()
    })
  }

  function commands() {
    var h = root.h
    var paths = root.fs.paths
    var records = h.log("ytdlp").filter(function(record) { return record.mode === "account" })
    // The check of the fresh login, then the two reports.
    h.equal(records.length, 3, "commands: three signed-in calls in all")
    var copy = Paths.jarCopyFile(paths, 2)
    h.equal(records[1].argv, [
      "--ignore-config", "--no-plugin-dirs", "--cache-dir", paths.ytCacheDir, "--color", "never",
      "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10",
      "--cookies", copy, "--mark-watched", "--simulate", "--quiet", "-a", "-"
    ], "commands: a report is the constant list, with a copy of the login")
    h.equal(records[1].stdin, root.address(3), "commands: the video's address on stdin")
    var jobs = h.jobs().filter(function(job) { return job.tag === "mark-watched" })
    h.equal(jobs.length, 2, "commands: one job per report")
    h.check(JSON.stringify(h.jobs()).indexOf("MKAAAAAAA") === -1, "commands: no video id in any command")
    var reporting = h.jobs().filter(function(job) { return job.command.indexOf("--mark-watched") !== -1 })
    h.equal(reporting.length, 2, "commands: and no other job switches reporting on")
    h.exec(["/usr/bin/find", paths.jarDir, "-mindepth", "1"], null, function(code, copies) {
      h.equal(copies, "", "commands: no copy of the login is left")
      root.next()
    })
  }

  // The report itself shows that the login no longer counts. That ends the
  // reports with everything else.
  function afterSignedOut() {
    var h = root.h
    root.scene("signed-out")
    root.play(25, "playing")
    h.waitFor(function() { return root.signIn.signedIn === false }, root.after + root.wait, function(out) {
      h.check(out, "signed out: the report showed it")
      h.equal([root.signIn.status, root.signIn.errorCode], ["failed", "E_SIGNED_OUT"], "signed out: said so")
      var before = root.reports().length
      root.scene("ok")
      root.play(26, "playing")
      root.settle(function(reports) {
        h.equal(reports.length, before, "signed out: nothing is reported any more")
        root.next()
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.indexOf("MKAAAAAAA") === -1, "quiet: no video id is in the log")
    h.check(log.indexOf("invented-") === -1, "quiet: nor a cookie value")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      root.next()
    })
  }
}
