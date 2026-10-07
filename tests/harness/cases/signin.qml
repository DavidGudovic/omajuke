import QtQuick
import "../../../lib/Paths.js" as Paths
import "../../../lib/Sh.js" as Sh

// core/SignIn.qml from "sign in" to a saved login and on to the calls that
// use it, against stand-ins for the question about the default browser, the
// browser itself and yt-dlp. No real browser, profile, cookie or request is
// involved: the "cookies" are invented rows whose values all begin with the
// same word, which is then looked for everywhere a cookie must never be.
//
// What it shows: the browser is chosen by desktop id from a fixed table and
// started on a profile and a configuration directory of its own; the
// profile is gone after every way an attempt can end, also when the export
// had to be killed; the saved login holds YouTube's rows only and is
// private; a tool only ever gets a throwaway copy, one call at a time;
// once a tool reports that the login is no longer accepted, no call is
// given it again; and an attempt that does not end with a login YouTube
// answered for leaves no login file behind, whatever stopped it.
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
  // Where in the list of jobs the first whole attempt begins.
  property int jobsBefore: 0

  // The word every invented cookie value begins with.
  readonly property string secret: "invented-"

  // prepare only asks whether mpv is an executable file. yt-dlp is the
  // stand-in that knows the two ways the tool is run with a login.
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
    root.signIn.signedOut.connect(function() { root.signedOutSignals += 1 })
    root.steps = [
      root.beforeReady, root.atRest, root.held, root.unknownBrowser, root.declined, root.unrunnable,
      root.wholeAttempt, root.whatRan, root.whatWasSaved, root.oneCopyPerCall, root.oneAtATime,
      root.refusedCalls, root.noLongerAccepted, root.cancelledWindow, root.visitor, root.deadline,
      root.killedExport, root.rejectedAtOnce, root.failedCheck, root.cancelledCheck, root.firefox,
      root.quiet, root.destroyedWithWindow
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // ---- Helpers ----

  function scene(defaultBrowser, browser, ytdlp) {
    root.h.scenario({ "xdg-settings": defaultBrowser, browser: browser, ytdlp: ytdlp })
  }

  // then(listing): "<mode> <name>" for everything directly inside dir.
  function listing(dir, then) {
    var find = ["/usr/bin/find", dir, "-mindepth", "1", "-maxdepth", "1", "-printf", "%m %f\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  function snapshot() {
    var s = root.signIn
    return [s.status, s.errorCode, s.signedIn, s.hasLogin]
  }

  function settled() {
    var status = root.signIn.status
    return status === "on" || status === "failed" || status === "off"
  }

  function tagsSince(from) {
    return root.h.jobs().slice(from).map(function(job) { return job.tag })
  }

  // Starts an attempt and calls then() when the browser is known.
  function begin(then) {
    var h = root.h
    h.equal(root.signIn.beginSignIn(), true, "begin: taken")
    h.equal(root.signIn.status, "confirm", "begin: the confirmation is shown at once")
    h.waitFor(function() { return root.signIn.browserPath !== "" || root.signIn.status !== "confirm" }, 8000,
      function() { then() })
  }

  // A whole attempt, from the confirmation to wherever it ends.
  function attempt(then) {
    var h = root.h
    root.begin(function() {
      h.equal(root.signIn.confirmSignIn(), true, "attempt: confirmed")
      h.equal(root.signIn.status, "browser", "attempt: the browser stage at once")
      h.waitFor(root.settled, 15000, function(done) {
        h.check(done, "attempt: it ended")
        then()
      })
    })
  }

  // The flags behind the tool, written out a second time.
  function common() {
    return [
      "--ignore-config", "--no-plugin-dirs", "--cache-dir", root.fs.paths.ytCacheDir, "--color", "never",
      "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10"
    ]
  }

  function chromiumFlags(profile) {
    return [
      "--user-data-dir=" + profile, "--password-store=basic", "--ozone-platform-hint=auto", "--no-first-run",
      "--no-default-browser-check", "--disable-sync", "--allow-browser-signin=false", "--disable-extensions",
      "--disable-component-extensions-with-background-pages", "--disable-default-apps",
      "--disable-component-update", "--disable-background-networking", "--disable-domain-reliability",
      "--no-pings", "--disable-breakpad", "--metrics-recording-only", "--new-window",
      "https://www.youtube.com/"
    ]
  }

  // A signed-in call as another part of the plugin would make it.
  function call(tag, notes) {
    var copySeen = { path: "" }
    var ticket = root.signIn.runSigned({
      tag: tag,
      build: function(copy) {
        copySeen.path = copy
        return [root.h.tools.ytdlp].concat(root.common(), ["--cookies", copy, "--flat-playlist",
          "--playlist-items", "1:50", "-J", "-a", "-"])
      },
      stdin: "https://www.youtube.com/feed/subscriptions\n",
      timeoutSec: 25,
      maxBytes: 1048576,
      done: function(result, code) {
        notes.push({ tag: tag, result: result, code: code, copy: copySeen.path })
      }
    })
    return ticket
  }

  // ---- Steps ----

  function beforeReady() {
    var h = root.h
    h.equal(root.snapshot(), ["off", "", false, false], "before prepare: off")
    h.equal(root.signIn.known, false, "before prepare: nothing is known yet")
    h.equal(root.signIn.beginSignIn(), false, "before prepare: no attempt")
    h.equal(root.signIn.signOut(), false, "before prepare: no sign-out")
    h.equal(h.jobs().length, 0, "before prepare: no job")
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (ok) root.next()
      else h.finish()
    })
    root.fs.prepare()
  }

  function atRest() {
    var h = root.h
    var paths = root.fs.paths
    h.waitFor(function() { return root.signIn.known }, 5000, function(known) {
      h.check(known, "at rest: the look for a saved login has finished")
      h.equal(root.snapshot(), ["off", "", false, false], "at rest: off, and no login")
      h.equal(root.signIn.loginFile, paths.jarFile, "at rest: the page can say where a login would live")
      h.equal(root.signIn.browserPath, "", "at rest: no browser is named")
      h.equal(root.tagsSince(1), ["prepare-data"], "at rest: one look at the data directory, no request")
      h.exec(["/usr/bin/stat", "-c", "%a", paths.dataDir], null, function(code, out) {
        h.equal(out, "700\n", "at rest: the data directory is private")
        h.equal(root.signIn.confirmSignIn(), false, "at rest: nothing to confirm")
        h.equal(root.signIn.cancelSignIn(), false, "at rest: nothing to cancel")
        root.next()
      })
    })
  }

  function held() {
    var h = root.h
    var before = h.jobs().length
    root.signIn.hold = true
    h.equal(root.signIn.beginSignIn(), false, "held: no attempt while nothing may start")
    h.equal(root.signIn.runSigned({ tag: "x", build: function() { return [] }, stdin: "", timeoutSec: 5,
      maxBytes: 64, done: function() {} }), 0, "held: no signed-in call")
    root.signIn.hold = false
    h.equal(h.jobs().length, before, "held: no job")
    root.next()
  }

  // The answer to "which is the default browser" is text from outside. It
  // selects a row of the table or nothing.
  function unknownBrowser() {
    var h = root.h
    var answers = [
      "id:constructor", "id:__proto__", "id:org.example.Browser.desktop", "id:chromium_chromium.desktop",
      "id:chromium.desktop --remote-debugging-port=9222", "id:/usr/bin/chromium",
      "raw:chromium.desktop\u0000", "silent", "fail", "flood"
    ]
    var i = 0
    var one = function() {
      if (i >= answers.length) {
        h.equal(h.log("browser").length, 0, "unknown browser: no browser was ever started")
        root.listing(root.fs.paths.signinDir, function(found) {
          h.equal(found, [], "unknown browser: and no profile made")
          root.next()
        })
        return
      }
      var answer = answers[i++]
      root.scene(answer, "ok", "ok")
      root.begin(function() {
        h.equal(root.snapshot(), ["failed", "E_SIGNIN_BROWSER", false, false], "unknown browser: " + answer)
        h.equal(root.signIn.browserPath, "", "unknown browser: none is named")
        h.equal(root.signIn.confirmSignIn(), false, "unknown browser: nothing to confirm")
        one()
      })
    }
    one()
  }

  function declined() {
    var h = root.h
    root.scene("id:chromium.desktop", "ok", "ok")
    var asked = h.log("xdg-settings").length
    root.begin(function() {
      h.equal(root.signIn.browserPath, "/usr/bin/chromium", "declined: the page names the browser")
      h.equal(root.snapshot(), ["confirm", "", false, false], "declined: waiting for the user")
      var record = h.log("xdg-settings")[asked]
      h.equal(record ? record.argv : null, ["get", "default-web-browser"], "declined: the one question")
      h.equal(record ? record.env : null, ["HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
        "declined: asked with the local environment, which names no browser")
      h.equal(root.signIn.cancelSignIn(), true, "declined: the user says no")
      h.equal(root.snapshot(), ["off", "", false, false], "declined: off, and no error")
      h.equal(root.signIn.confirmSignIn(), false, "declined: nothing left to confirm")
      h.after(300, function() {
        h.equal(h.log("browser").length, 0, "declined: no browser was started")
        root.next()
      })
    })
  }

  // A browser the table names but the machine does not have. The tool
  // table is handed over as a copy, so this takes a component of its own.
  function unrunnable() {
    var h = root.h
    var tools = {}
    for (var name in h.tools) tools[name] = h.tools[name]
    tools.browser = h.repo + "/tests/stubs/no-such-browser.js"
    var other = h.mount("core/SignIn.qml", { runner: root.runner, tools: tools, fs: root.fs, hold: false })
    if (other === null) { h.finish(); return }
    root.scene("id:chromium.desktop", "ok", "ok")
    h.waitFor(function() { return other.known }, 5000, function() {
      h.equal(other.beginSignIn(), true, "unrunnable: taken")
      h.waitFor(function() { return other.browserPath !== "" }, 8000, function() {
        h.equal(other.confirmSignIn(), true, "unrunnable: confirmed")
        h.waitFor(function() { return other.status !== "browser" }, 8000, function() {
          h.equal([other.status, other.errorCode, other.signedIn], ["failed", "E_SIGNIN_BROWSER", false],
            "unrunnable: the browser is not there")
          root.listing(root.fs.paths.signinDir, function(found) {
            h.equal(found, [], "unrunnable: the profile is gone")
            h.equal(h.log("ytdlp").length, 0, "unrunnable: nothing was exported")
            other.destroy()
            root.next()
          })
        })
      })
    })
  }

  function wholeAttempt() {
    var h = root.h
    root.scene("id:chromium.desktop", "ok", "ok")
    root.jobsBefore = h.jobs().length
    root.attempt(function() {
      h.equal(root.snapshot(), ["on", "", true, true], "attempt: signed in")
      h.equal(root.tagsSince(root.jobsBefore), [
        "prepare-data", "default-browser", "signin-dirs", "cookie-export", "remove-tree", "prepare-data",
        "jar-copy", "signin-verify", "remove"
      ], "attempt: its jobs, in order")
      root.next()
    })
  }

  function whatRan() {
    var h = root.h
    var paths = root.fs.paths
    var dir = Paths.signinAttemptDir(paths, 1)
    var browser = h.log("browser")
    h.equal(browser.length, 1, "ran: one browser")
    var started = browser[0]
    h.equal(started.argv, root.chromiumFlags(dir + "/profile"), "ran: the constant flags on a fresh profile")
    h.equal(started.env, ["HOME", "LANG", "PATH", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR"],
      "ran: the browser profile of the environment and nothing else")
    h.equal(started.configHome, dir + "/config", "ran: a configuration directory of its own")
    h.equal(started.configEntries, [], "ran: with no flag file in it")
    h.check(started.configHome !== h.runDir + "/sbx/config", "ran: not the session's configuration directory")
    h.check(JSON.stringify(h.jobs()).indexOf("browser.js") === -1, "ran: the browser is no runner job")

    var wrapper = [h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2"]
    var jobs = h.jobs().slice(root.jobsBefore)
    h.equal(jobs[1], { tag: "default-browser", command: wrapper.concat(["5", h.tools.xdgSettings, "get",
      "default-web-browser"]) }, "ran: the question")
    h.equal(jobs[3].command.slice(7), [
      h.tools.sh, "-c", Sh.UMASK_EXEC, "omajuke", h.tools.sh, "-c", Sh.COOKIE_EXPORT, "omajuke-export",
      "chromium", dir + "/profile", dir, paths.jarFile, h.tools.ytdlp
    ], "ran: the export, a constant with five parameters")
    h.equal(jobs[4].command.slice(7), [h.tools.rm, "-rf", "--", dir], "ran: then the profile is removed")

    var records = h.log("ytdlp")
    h.equal(records.length, 2, "ran: yt-dlp twice")
    h.equal([records[0].mode, records[0].argv], ["export", [
      "--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--no-remote-components",
      "--cookies-from-browser", "chromium+basictext:" + dir + "/profile", "--cookies", dir + "/export.txt"
    ]], "ran: the export reads the attempt's own profile and no keyring")
    h.equal(records[0].tmpdir, dir, "ran: with its temporary files inside the attempt")
    var copy = Paths.jarCopyFile(paths, 1)
    h.equal(records[1].argv, root.common().concat(["--cookies", copy, "--flat-playlist", "--playlist-items",
      "1:1", "-J", "-a", "-"]), "ran: the check asks for one row, with a copy of the login")
    h.equal(records[1].stdin, "https://www.youtube.com/playlist?list=WL\n", "ran: of the user's own list")
    // The shell that sets the umask adds names of its own.
    var given = records[1].env.filter(function(name) { return ["PWD", "SHLVL", "_"].indexOf(name) === -1 })
    h.equal(given, ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
      "ran: with the network profile")
    h.equal(jobs[7].command.slice(0, 12), wrapper.concat(["25", h.tools.sh, "-c", Sh.UMASK_EXEC, "omajuke",
      h.tools.ytdlp]), "ran: under the private umask")
    h.equal(records[1].cookies, [
      ".youtube.com VISITOR_INFO1_LIVE", ".youtube.com PREF", ".youtube.com LOGIN_INFO",
      ".youtube.com SAPISID", ".youtube.com __Secure-3PAPISID", "www.youtube.com CONSISTENCY",
      "youtube.com SIDCC"
    ], "ran: the copy holds YouTube's rows and no other site's")
    root.next()
  }

  function whatWasSaved() {
    var h = root.h
    var paths = root.fs.paths
    root.listing(paths.dataDir, function(data) {
      h.equal(data, ["600 cookies.txt"], "saved: one private file, and no temporary file")
      root.listing(paths.signinDir, function(attempts) {
        h.equal(attempts, [], "saved: the profile and the unfiltered export are gone")
        root.listing(paths.jarDir, function(copies) {
          h.equal(copies, [], "saved: the copy is gone")
          var rows = h.readFile(paths.jarFile).split("\n").filter(function(line) {
            return line !== "" && line !== "# Netscape HTTP Cookie File"
          })
          var foreign = rows.filter(function(line) {
            var domain = line.replace("#HttpOnly_", "").split("\t")[0]
            return domain !== "youtube.com" && domain.slice(-12) !== ".youtube.com"
          })
          h.equal([rows.length, foreign], [7, []], "saved: seven rows, all of youtube.com")
          h.check(JSON.stringify(h.jobs()).indexOf(root.secret) === -1,
            "saved: no cookie value in any command")
          h.check(JSON.stringify(h.log("ytdlp")).indexOf(root.secret) === -1
            && JSON.stringify(h.log("browser")).indexOf(root.secret) === -1,
            "saved: nor in what a tool was given")
          root.next()
        })
      })
    })
  }

  // The tool writes the cookie file it is given anew. The copy stays
  // private all the same, and is gone when the call is answered.
  function oneCopyPerCall() {
    var h = root.h
    var paths = root.fs.paths
    var notes = []
    root.scene("id:chromium.desktop", "ok", "slow:700")
    var starts = h.log("ytdlp").length
    var ticket = root.call("list-a", notes)
    h.check(ticket > 0, "copy: the call is taken")
    h.equal(notes.length, 0, "copy: done is not called before the call returns")
    h.waitFor(function() { return h.log("ytdlp").length > starts }, 8000, function() {
      h.after(150, function() {
        root.listing(paths.jarDir, function(during) {
          h.equal(during, ["600 2.txt"], "copy: private while the tool runs, after the tool rewrote it")
          h.waitFor(function() { return notes.length === 1 }, 8000, function() {
            var note = notes[0]
            h.equal([note.result.ok, note.code, note.copy], [true, "", Paths.jarCopyFile(paths, 2)],
              "copy: answered")
            h.check(note.result.stdout.indexOf("Subscriptions track 1") !== -1,
              "copy: with the tool's output")
            root.listing(paths.jarDir, function(after) {
              h.equal(after, [], "copy: gone when the answer arrives")
              root.listing(paths.dataDir, function(data) {
                h.equal(data, ["600 cookies.txt"], "copy: the saved login was not touched")
                root.next()
              })
            })
          })
        })
      })
    })
  }

  function oneAtATime() {
    var h = root.h
    var notes = []
    root.scene("id:chromium.desktop", "ok", "slow:400")
    var before = h.jobs().length
    var starts = h.log("ytdlp").length
    var first = root.call("list-b", notes)
    var second = root.call("list-c", notes)
    var third = root.call("list-d", notes)
    h.check(first > 0 && second > first && third > second, "queue: three tickets")
    root.signIn.cancelSigned(second)
    h.waitFor(function() { return notes.length === 3 }, 12000, function(all) {
      h.check(all, "queue: every call is answered")
      h.equal(notes.map(function(note) { return note.tag + " " + note.result.error }),
        ["list-c cancelled", "list-b ", "list-d "], "queue: in turn, the cancelled one without running")
      h.equal(root.tagsSince(before), ["jar-copy", "list-b", "remove", "jar-copy", "list-d", "remove"],
        "queue: one call at a time, each with a copy made before and removed after")
      h.equal(h.log("ytdlp").length - starts, 2, "queue: the cancelled call never reached the tool")
      root.next()
    })
  }

  // A command line that does not name its copy, or hides warnings, is not
  // run: a login that is no longer accepted shows only as a warning.
  function refusedCalls() {
    var h = root.h
    var notes = []
    var starts = h.log("ytdlp").length
    var builds = [
      function(copy) { return [h.tools.ytdlp].concat(root.common(), ["-J", "-a", "-"]) },
      function(copy) { return [h.tools.ytdlp, "--cookies", root.fs.paths.jarFile, "-J", "-a", "-"] },
      function(copy) { return [h.tools.ytdlp, "--cookies", copy, "--no-warnings", "-J", "-a", "-"] },
      function(copy) { return [h.tools.ytdlp, "--cookies", copy, "--cookies", "/home/user/x", "-a", "-"] },
      function(copy) { return null },
      function(copy) { throw new Error("no command") }
    ]
    for (var i = 0; i < builds.length; i++) {
      root.signIn.runSigned({ tag: "bad-" + i, build: builds[i], stdin: "x\n", timeoutSec: 5, maxBytes: 64,
        done: function(result, code) { notes.push(result.error + "/" + code) } })
    }
    var malformed = [null, 7, {}, { tag: "x" }, { tag: "x", build: "b", stdin: "", done: function() {} },
      { tag: "x", build: function() {}, stdin: 5, done: function() {} }]
    for (var k = 0; k < malformed.length; k++) {
      h.equal(root.signIn.runSigned(malformed[k]), 0, "refused: a malformed call " + k)
    }
    h.waitFor(function() { return notes.length === builds.length }, 8000, function() {
      h.equal(notes.filter(function(note) { return note !== "refused/" }), [], "refused: each answered so")
      h.equal(h.log("ytdlp").length, starts, "refused: the tool was not started")
      root.listing(root.fs.paths.jarDir, function(copies) {
        h.equal(copies, [], "refused: and no copy is left")
        h.equal(root.snapshot(), ["on", "", true, true], "refused: still signed in")
        root.next()
      })
    })
  }

  // The tool ends with success and a warning that the login no longer
  // counts. That is looked for first, and it ends every use of the login.
  function noLongerAccepted() {
    var h = root.h
    var notes = []
    root.scene("id:chromium.desktop", "ok", "signed-out")
    root.call("list-e", notes)
    root.call("list-f", notes)
    h.waitFor(function() { return notes.length === 2 }, 8000, function() {
      h.equal([notes[0].result.ok, notes[0].result.stdout, notes[0].result.stderr, notes[0].code],
        [false, "", "", "E_SIGNED_OUT"], "rejected: the call's output is not handed on")
      h.equal([notes[1].result.error, notes[1].code], ["refused", "E_SIGNED_OUT"],
        "rejected: the call that waited is not run")
      h.equal(root.snapshot(), ["failed", "E_SIGNED_OUT", false, true],
        "rejected: signed out, and the file is kept until the user decides")
      var starts = h.log("ytdlp").length
      var before = h.jobs().length
      root.scene("id:chromium.desktop", "ok", "ok")
      h.equal(root.call("list-g", notes), 0, "rejected: no further call is taken")
      h.waitFor(function() { return notes.length === 3 }, 3000, function() {
        h.equal([notes[2].result.error, notes[2].code], ["refused", ""], "rejected: and it is told so")
        h.equal([h.log("ytdlp").length - starts, h.jobs().length - before], [0, 0],
          "rejected: nothing is given the login any more")
        root.listing(root.fs.paths.dataDir, function(data) {
          h.equal(data, ["600 cookies.txt"], "rejected: the file is still there")
          root.next()
        })
      })
    })
  }

  // The user cancels while the window is open and the browser takes a
  // second to go. Its profile is not removed underneath it.
  function cancelledWindow() {
    var h = root.h
    var paths = root.fs.paths
    root.scene("id:chromium.desktop", "ignore-term:1000", "ok")
    var windows = h.log("browser").length
    var exports = h.log("ytdlp").length
    root.begin(function() {
      h.equal(root.signIn.confirmSignIn(), true, "cancel window: confirmed")
      h.waitFor(function() { return h.log("browser").length > windows }, 8000, function(open) {
        h.check(open, "cancel window: the window is open")
        h.equal(root.signIn.signOut(), false, "cancel window: no sign-out while an attempt is under way")
        h.equal(root.signIn.beginSignIn(), false, "cancel window: and no second attempt")
        h.equal(root.signIn.cancelSignIn(), true, "cancel window: the user cancels")
        h.equal(root.signIn.status, "browser", "cancel window: not over before the browser has gone")
        h.after(400, function() {
          root.listing(paths.signinDir, function(found) {
            h.equal(found, ["700 2"], "cancel window: the profile is still there while the browser runs")
            h.equal(root.signIn.status, "browser", "cancel window: and the state has not moved")
            h.waitFor(root.settled, 10000, function() {
              h.equal(root.snapshot(), ["failed", "E_SIGNIN_CANCELLED", false, true],
                "cancel window: cancelled")
              root.listing(paths.signinDir, function(left) {
                h.equal(left, [], "cancel window: the profile is gone once the browser has")
                h.equal(h.log("ytdlp").length, exports, "cancel window: nothing was exported")
                root.next()
              })
            })
          })
        })
      })
    })
  }

  // A window that was closed without a login in it, and one that was closed
  // before any cookie was written.
  function visitor() {
    var h = root.h
    var paths = root.fs.paths
    var saved = h.readFile(paths.jarFile)
    root.scene("id:chromium.desktop", "visitor", "ok")
    root.attempt(function() {
      h.equal(root.snapshot(), ["failed", "E_SIGNIN_NONE", false, true], "visitor: no login was found")
      root.scene("id:chromium.desktop", "no-store", "ok")
      root.attempt(function() {
        h.equal(root.snapshot(), ["failed", "E_SIGNIN_NONE", false, true], "no store: no login was found")
        root.listing(paths.signinDir, function(left) {
          h.equal(left, [], "visitor: both profiles are gone")
          root.listing(paths.dataDir, function(data) {
            h.equal(data, ["600 cookies.txt"], "visitor: nothing new was saved")
            h.check(h.readFile(paths.jarFile) === saved, "visitor: the file from before is untouched")
            root.next()
          })
        })
      })
    })
  }

  // The window was still open when its time ran out. The wrapper ended the
  // browser and says so with its exit code. Nobody finished signing in, so
  // nothing is exported.
  function deadline() {
    var h = root.h
    root.scene("id:chromium.desktop", "exit:124", "ok")
    var exports = h.log("ytdlp").length
    root.attempt(function() {
      h.equal(root.snapshot(), ["failed", "E_SIGNIN_CANCELLED", false, true], "deadline: ended as cancelled")
      h.equal(h.log("ytdlp").length, exports, "deadline: nothing was exported")
      root.listing(root.fs.paths.signinDir, function(left) {
        h.equal(left, [], "deadline: the profile is gone")
        root.next()
      })
    })
  }

  // The user cancels during the export, and the tool inside it does not end
  // when asked. The helper is killed and can clean up nothing itself. A
  // helper that was stopped cannot say how far it came, so whatever login
  // lies in the data directory afterwards goes: here the one from before,
  // which stands for one the helper saved a moment before it was stopped.
  function killedExport() {
    var h = root.h
    var paths = root.fs.paths
    root.scene("id:chromium.desktop", "ok", "export-stuck")
    var exports = h.log("ytdlp").length
    root.begin(function() {
      h.equal(root.signIn.confirmSignIn(), true, "killed export: confirmed")
      h.waitFor(function() { return h.log("ytdlp").length > exports }, 8000, function(running) {
        h.check(running, "killed export: the export runs")
        h.equal(root.signIn.status, "exporting", "killed export: the export stage")
        root.listing(paths.signinDir, function(found) {
          h.equal(found, ["700 6"], "killed export: the profile is there for it to read")
          h.equal(root.signIn.hasLogin, true, "killed export: and a login file lies in the data directory")
          h.equal(root.signIn.cancelSignIn(), true, "killed export: the user cancels")
          h.equal(root.signIn.status, "exporting", "killed export: not over before the helper has gone")
          h.waitFor(root.settled, 12000, function() {
            h.equal(root.snapshot(), ["failed", "E_SIGNIN_CANCELLED", false, false],
              "killed export: cancelled, and no login is left")
            root.listing(paths.signinDir, function(left) {
              h.equal(left, [], "killed export: the profile is gone although the helper was killed")
              root.listing(paths.dataDir, function(data) {
                h.equal(data, [], "killed export: neither an unfinished login file nor a finished one")
                var before = h.jobs().length
                root.scene("id:chromium.desktop", "ok", "ok")
                root.begin(function() {
                  h.equal(root.tagsSince(before), ["prepare-data", "default-browser"],
                    "killed export: the next attempt finds nothing left to remove")
                  root.signIn.cancelSignIn()
                  h.alive(function(names) {
                    h.equal(names, [], "killed export: no process is left")
                    root.next()
                  })
                })
              })
            })
          })
        })
      })
    })
  }

  // A fresh login that YouTube rejects at the first request. It is of no
  // use and does not stay.
  function rejectedAtOnce() {
    var h = root.h
    root.scene("id:chromium.desktop", "ok", "signed-out")
    var before = h.jobs().length
    root.attempt(function() {
      h.equal(root.snapshot(), ["failed", "E_SIGNED_OUT", false, false],
        "rejected at once: not signed in, and the login is gone")
      var last = ["jar-copy", "signin-verify", "remove", "remove", "prepare-data"]
      h.equal(root.tagsSince(before).slice(-5), last,
        "rejected at once: the copy is removed, then the login, then the data directory is looked at")
      root.listing(root.fs.paths.dataDir, function(data) {
        h.equal(data, [], "rejected at once: no login file")
        root.next()
      })
    })
  }

  // The one request that tries a new login out fails for a reason that says
  // nothing about the login: no answer, or one that cannot be read. Nobody
  // has seen that login work, so it is removed, and a later start does not
  // count as signed in.
  function failedCheck() {
    var h = root.h
    var paths = root.fs.paths
    var endings = [["fail", "E_NETWORK"], ["garbage", "E_BAD_OUTPUT"]]
    var i = 0
    var one = function() {
      if (i >= endings.length) {
        var later = h.mount("core/SignIn.qml", {
          runner: root.runner, tools: h.tools, fs: root.fs, hold: false
        })
        if (later === null) { h.finish(); return }
        h.waitFor(function() { return later.known }, 5000, function() {
          h.equal([later.status, later.signedIn, later.hasLogin], ["off", false, false],
            "failed check: the next start is not signed in")
          later.destroy()
          root.next()
        })
        return
      }
      var ending = endings[i++]
      var exports = h.log("ytdlp").length
      root.scene("id:chromium.desktop", "ok", ending[0])
      root.attempt(function() {
        h.equal(h.log("ytdlp").length - exports, 2, "failed check " + ending[0] + ": saved, then tried out")
        h.equal(root.snapshot(), ["failed", ending[1], false, false],
          "failed check " + ending[0] + ": the attempt failed, and the login is gone")
        root.listing(paths.dataDir, function(data) {
          h.equal(data, [], "failed check " + ending[0] + ": no login file")
          root.listing(paths.jarDir, function(copies) {
            h.equal(copies, [], "failed check " + ending[0] + ": and no copy")
            one()
          })
        })
      })
    }
    one()
  }

  // The user cancels while the new login is being tried out. The request is
  // ended, and the login that was saved a moment ago is removed.
  function cancelledCheck() {
    var h = root.h
    var paths = root.fs.paths
    root.scene("id:chromium.desktop", "ok", "hang")
    var starts = h.log("ytdlp").length
    root.begin(function() {
      h.equal(root.signIn.confirmSignIn(), true, "cancelled check: confirmed")
      var asking = function() {
        return root.signIn.status === "verifying" && h.log("ytdlp").length >= starts + 2
      }
      h.waitFor(asking, 15000, function(reached) {
        h.check(reached, "cancelled check: the request is under way")
        root.listing(paths.dataDir, function(saved) {
          h.equal(saved, ["600 cookies.txt"], "cancelled check: the login has been saved")
          h.equal(root.signIn.signedIn, false, "cancelled check: but nobody is signed in yet")
          h.equal(root.signIn.cancelSignIn(), true, "cancelled check: the user cancels")
          h.waitFor(root.settled, 10000, function() {
            h.equal(root.snapshot(), ["failed", "E_SIGNIN_CANCELLED", false, false],
              "cancelled check: cancelled, and the login is gone")
            root.listing(paths.dataDir, function(data) {
              h.equal(data, [], "cancelled check: no login file")
              h.alive(function(names) {
                h.equal(names, [], "cancelled check: no process is left")
                root.next()
              })
            })
          })
        })
      })
    })
  }

  function firefox() {
    var h = root.h
    var paths = root.fs.paths
    root.scene("id:firefox.desktop\r", "ok", "ok")
    var windows = h.log("browser").length
    var starts = h.log("ytdlp").length
    root.begin(function() {
      h.equal(root.signIn.browserPath, "/usr/bin/firefox", "firefox: named on the page")
      h.equal(root.signIn.confirmSignIn(), true, "firefox: confirmed")
      h.waitFor(root.settled, 15000, function() {
        h.equal(root.snapshot(), ["on", "", true, true], "firefox: signed in")
        // The eleventh attempt this component confirmed.
        var dir = Paths.signinAttemptDir(paths, 11)
        var started = h.log("browser")[windows]
        h.equal(started.argv, ["--no-remote", "--profile", dir + "/profile", "https://www.youtube.com/"],
          "firefox: its own short command")
        h.check(started.profileEntries.indexOf("user.js") !== -1, "firefox: the profile has its preferences")
        h.equal(started.configHome, dir + "/config", "firefox: a configuration directory of its own")
        var exported = h.log("ytdlp")[starts]
        h.equal(exported.argv[5], "firefox+basictext:" + dir + "/profile", "firefox: exported by its name")
        root.listing(paths.signinDir, function(left) {
          h.equal(left, [], "firefox: the profile is gone")
          root.next()
        })
      })
    })
  }

  // Nothing of an attempt may reach the log: no cookie, and nothing a tool
  // or the browser printed.
  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.indexOf(root.secret) === -1, "quiet: no cookie value is in the log")
    h.check(log.indexOf("browser-stub") === -1, "quiet: nor what the browser printed")
    h.check(log.indexOf("LOGIN_INFO") === -1 && log.indexOf("cookies are no longer valid") === -1,
      "quiet: nor what a tool printed")
    h.check(JSON.stringify(h.jobs()).indexOf(root.secret) === -1, "quiet: no cookie value in any command")
    h.equal(root.signedOutSignals, 0, "quiet: nobody signed out")
    root.next()
  }

  // The service goes away while the window is open: the browser goes too.
  function destroyedWithWindow() {
    var h = root.h
    var second = h.mount("core/SignIn.qml", { runner: root.runner, tools: h.tools, fs: root.fs, hold: false })
    if (second === null) { h.finish(); return }
    root.scene("id:chromium.desktop", "stay", "ok")
    var windows = h.log("browser").length
    h.waitFor(function() { return second.known }, 5000, function() {
      h.equal([second.status, second.signedIn], ["on", true], "restart: a saved login means signed in")
      // Only an attempt directory this one made is its to remove, so the
      // first component's counters are no concern of the second.
      h.equal(second.beginSignIn(), false, "restart: no attempt while signed in")
      root.signIn.signOut()
      var signedOut = function() { return root.signIn.status === "off" && !root.signIn.signingOut }
      h.waitFor(signedOut, 8000, function() {
        h.equal(root.signIn.beginSignIn(), true, "destroyed: a new attempt")
        h.waitFor(function() { return root.signIn.browserPath !== "" }, 8000, function() {
          h.equal(root.signIn.confirmSignIn(), true, "destroyed: confirmed")
          h.waitFor(function() { return h.log("browser").length > windows }, 8000, function(open) {
            h.check(open, "destroyed: the window is open")
            h.alive(function(before) {
              h.equal(before.filter(function(name) { return name.indexOf("browser.") === 0 }).length, 1,
                "destroyed: one browser runs")
              root.signIn.destroy()
              h.after(1500, function() {
                h.alive(function(after) {
                  h.equal(after, [], "destroyed: the browser went with the component")
                  root.next()
                })
              })
            })
          })
        })
      })
    })
  }
}
