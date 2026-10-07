import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Paths.js" as Paths

// core/Feeds.qml against the stand-in for a signed-in yt-dlp: each feed is
// asked for when it is selected and not otherwise, with a constant command
// line and its address on standard input; a list that was just fetched is
// shown again without a request; an empty list and a failed one are two
// different states; a playlist can be opened and left; nothing of a list
// reaches the disk; and everything is forgotten when the login is no longer
// accepted.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var signIn: null
  property var feeds: null
  property var steps: []
  property int at: 0
  // What the disk held outside the runtime directory before any list was
  // read.
  property var filesBefore: []

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
    root.feeds = h.mount("core/Feeds.qml", { tools: h.tools, fs: root.fs, signIn: root.signIn })
    if (root.runner === null || root.fs === null || root.signIn === null || root.feeds === null) {
      h.finish()
      return
    }
    root.steps = [
      root.notSignedIn, root.signInFirst, root.notAFeed, root.forYou, root.recorded, root.otherFeeds,
      root.fromMemory, root.playlists, root.openedList, root.backToLists, root.emptyList, root.emptyAndFailed,
      root.superseded, root.neverByItself, root.nothingOnDisk, root.noLongerAccepted, root.quiet
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

  function snapshot() {
    var f = root.feeds
    return [f.kind, f.status, f.rows.length, f.errorCode, f.listTitle]
  }

  function loaded() {
    return root.feeds.status !== "loading"
  }

  // Selects a feed and calls then() when it is no longer loading.
  function show(kind, then) {
    var h = root.h
    h.equal(root.feeds.select(kind), true, kind + ": taken")
    h.waitFor(root.loaded, 10000, function(done) {
      h.check(done, kind + ": answered")
      then()
    })
  }

  // The requests the stand-in was asked: one address each.
  function asked() {
    return root.h.log("ytdlp").filter(function(record) { return record.mode === "account" })
      .map(function(record) { return record.stdin })
  }

  // then(files): every file below the state and the data directory, each
  // with its size.
  function diskFiles(then) {
    var paths = root.fs.paths
    var find = ["/usr/bin/find", paths.stateDir, paths.dataDir, "-type", "f", "-printf", "%f %s\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  // ---- Steps ----

  function notSignedIn() {
    var h = root.h
    h.waitFor(function() { return root.signIn.known }, 5000, function() {
      var before = h.jobs().length
      h.equal(root.snapshot(), ["", "idle", 0, "", ""], "signed out: nothing is shown")
      h.equal(root.feeds.select("foryou"), false, "signed out: a feed cannot be selected")
      h.equal(root.feeds.openRow(1), null, "signed out: and there is no row to open")
      h.equal(root.snapshot(), ["", "idle", 0, "", ""], "signed out: nothing changed")
      h.equal(h.jobs().length, before, "signed out: no job")
      root.next()
    })
  }

  function signInFirst() {
    var h = root.h
    root.scene("ok")
    h.equal(root.signIn.beginSignIn(), true, "sign in: taken")
    h.waitFor(function() { return root.signIn.browserPath !== "" }, 8000, function() {
      h.equal(root.signIn.confirmSignIn(), true, "sign in: confirmed")
      h.waitFor(function() { return root.signIn.status === "on" }, 15000, function(on) {
        h.check(on, "sign in: signed in")
        h.equal(root.snapshot(), ["", "idle", 0, "", ""], "sign in: no feed is fetched by signing in")
        root.diskFiles(function(files) {
          root.filesBefore = files
          root.next()
        })
      })
    })
  }

  // A kind is text from the panel. It selects one of five constants or
  // nothing.
  function notAFeed() {
    var h = root.h
    var before = h.jobs().length
    var odd = ["", "trending", "constructor", "__proto__", "foryou ", "FORYOU", "https://media.example/feed",
      "/feed/history", null, undefined, 3, ["foryou"], { kind: "foryou" }]
    for (var i = 0; i < odd.length; i++) {
      h.equal(root.feeds.select(odd[i]), false, "not a feed " + i + ": refused")
    }
    h.equal(root.snapshot(), ["", "idle", 0, "", ""], "not a feed: nothing changed")
    h.equal(h.jobs().length, before, "not a feed: no job")
    root.next()
  }

  function forYou() {
    var h = root.h
    h.equal(root.feeds.select("foryou"), true, "for you: taken")
    h.equal(root.snapshot(), ["foryou", "loading", 0, "", ""], "for you: loading at once")
    h.waitFor(root.loaded, 10000, function() {
      // The stand-in holds sixty rows; fifty were asked for.
      h.equal(root.snapshot(), ["foryou", "rows", Const.LIMITS.feedCount, "", ""], "for you: the first fifty")
      h.equal(root.feeds.rows[0], { key: 1, playlist: false, id: "FYAAAAAAA01", title: "For you track 1",
        channel: "Synthetic Channel", duration: 101, live: false }, "for you: a row is a track with a key")
      var keys = root.feeds.rows.map(function(row) { return row.key })
      h.equal(keys[49] - keys[0], 49, "for you: every row has a key of its own")
      h.equal(root.feeds.openRow(keys[2]), { id: "FYAAAAAAA03", title: "For you track 3",
        channel: "Synthetic Channel", duration: 103, live: false }, "for you: choosing a row gives its track")
      h.equal(root.feeds.openRow(99999), null, "for you: an unknown key gives nothing")
      h.equal(root.snapshot(), ["foryou", "rows", 50, "", ""],
        "for you: choosing a video changes nothing here")
      root.next()
    })
  }

  function recorded() {
    var h = root.h
    var paths = root.fs.paths
    var records = h.log("ytdlp").filter(function(record) { return record.mode === "account" })
    // The first signed-in call was the check of the fresh login.
    h.equal(records.length, 2, "recorded: one request for the feed")
    var copy = Paths.jarCopyFile(paths, 2)
    h.equal(records[1].argv, [
      "--ignore-config", "--no-plugin-dirs", "--cache-dir", paths.ytCacheDir, "--color", "never",
      "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10",
      "--cookies", copy, "--flat-playlist", "--playlist-items", "1:50", "-J", "-a", "-"
    ], "recorded: the constant list, with a copy of the login")
    h.equal(records[1].stdin, "https://www.youtube.com/feed/recommended\n", "recorded: the address on stdin")
    var jobs = h.jobs().filter(function(job) { return job.tag === "feed" })
    h.equal(jobs.length, 1, "recorded: one job")
    h.equal(jobs[0].command.slice(0, 7),
      [h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "25"], "recorded: bounded")
    var signedIn = JSON.stringify(h.jobs().filter(function(job) {
      return job.tag === "feed" || job.tag === "signin-verify"
    }))
    h.check(signedIn.indexOf("youtube.com") === -1 && signedIn.indexOf("/feed/") === -1
      && signedIn.indexOf("list=") === -1, "recorded: no address, and no part of one, in a signed-in command")
    root.next()
  }

  function otherFeeds() {
    var h = root.h
    root.show("subs", function() {
      h.equal(root.snapshot(), ["subs", "rows", 3, "", ""], "subs: its rows")
      h.equal(root.feeds.rows[0].id, "SBAAAAAAA01", "subs: its own")
      root.show("later", function() {
        h.equal(root.snapshot(), ["later", "rows", 2, "", ""], "later: its rows")
        root.show("history", function() {
          h.equal(root.snapshot(), ["history", "rows", 5, "", ""], "history: its rows")
          h.equal([root.feeds.rows[4].id, root.feeds.rows[4].channel], ["HSAAAAAAA05", ""],
            "history: a row without a channel keeps an empty one")
          h.equal(root.asked().slice(2), [
            "https://www.youtube.com/feed/subscriptions\n", "https://www.youtube.com/playlist?list=WL\n",
            "https://www.youtube.com/feed/history\n"
          ], "feeds: one request each, to its constant address")
          root.next()
        })
      })
    })
  }

  // A list that was fetched a moment ago is shown again as it was.
  function fromMemory() {
    var h = root.h
    var requests = root.asked().length
    var before = h.jobs().length
    h.equal(root.feeds.select("foryou"), true, "memory: taken")
    h.equal(root.snapshot(), ["foryou", "rows", 50, "", ""], "memory: shown at once")
    h.equal(root.feeds.rows[0].key, 1, "memory: the same rows, with the keys they had")
    h.equal(root.feeds.select("subs"), true, "memory: another one")
    h.equal(root.snapshot(), ["subs", "rows", 3, "", ""], "memory: at once as well")
    h.after(300, function() {
      h.equal([root.asked().length - requests, h.jobs().length - before], [0, 0], "memory: without a request")
      root.next()
    })
  }

  function playlists() {
    var h = root.h
    root.show("playlists", function() {
      // The stand-in lists a video, a list without a title and one list
      // twice among them.
      h.equal(root.snapshot(), ["playlists", "rows", 2, "", ""], "playlists: the two that can be shown")
      var rows = root.feeds.rows
      h.equal([rows[0].playlist, rows[0].listId, rows[0].title, rows[0].count],
        [true, "PLsynthetic000000001", "First synthetic list", null], "playlists: a row is a playlist")
      h.equal(rows[1].listId, "PLsynthetic000000003", "playlists: each once")
      h.equal(root.feeds.closeList(), false, "playlists: no list is open")
      root.next()
    })
  }

  function openedList() {
    var h = root.h
    var requests = root.asked().length
    var first = root.feeds.rows[0].key
    h.equal(root.feeds.openRow(first), null, "open: a playlist is not a track to play")
    h.equal(root.snapshot(), ["playlists", "loading", 0, "", "First synthetic list"],
      "open: loading its rows")
    h.waitFor(root.loaded, 10000, function() {
      h.equal(root.snapshot(), ["playlists", "rows", 4, "", "First synthetic list"], "open: its videos")
      h.equal(root.feeds.rows[0].id, "L1AAAAAAA01", "open: of that list")
      h.equal(root.asked().slice(requests), ["https://www.youtube.com/playlist?list=PLsynthetic000000001\n"],
        "open: one request, the address rebuilt from the checked id")
      h.equal(root.feeds.openRow(root.feeds.rows[1].key).id, "L1AAAAAAA02", "open: its rows are tracks")
      root.next()
    })
  }

  function backToLists() {
    var h = root.h
    var requests = root.asked().length
    h.equal(root.feeds.closeList(), true, "back: taken")
    h.equal(root.snapshot(), ["playlists", "rows", 2, "", ""], "back: the playlists again, at once")
    h.equal(root.asked().length, requests, "back: without a request")
    root.next()
  }

  function emptyList() {
    var h = root.h
    h.equal(root.feeds.openRow(root.feeds.rows[1].key), null, "empty list: opened")
    h.waitFor(root.loaded, 10000, function() {
      h.equal(root.snapshot(), ["playlists", "empty", 0, "", "Second synthetic list"],
        "empty list: read, and nothing in it")
      root.feeds.deselect()
      h.equal(root.snapshot(), ["", "idle", 0, "", ""], "empty list: the user looks at something else")
      root.next()
    })
  }

  // "Nothing here" and "could not be read" are told apart, and a failure is
  // not remembered: selecting the feed again asks again.
  function emptyAndFailed() {
    var h = root.h
    root.feeds.clear()
    root.scene("empty")
    root.show("subs", function() {
      h.equal(root.snapshot(), ["subs", "empty", 0, "", ""], "empty: a feed with nothing in it")
      root.feeds.clear()
      root.scene("fail")
      root.show("subs", function() {
        h.equal(root.snapshot(), ["subs", "error", 0, "E_FEED", ""], "failed: an error, not an empty list")
        root.scene("garbage")
        var requests = root.asked().length
        root.show("subs", function() {
          h.equal(root.snapshot(), ["subs", "error", 0, "E_FEED", ""], "garbage: an error as well")
          h.equal(root.asked().length - requests, 1, "failed: asked again, a failure is not remembered")
          h.equal(root.signIn.signedIn, true, "failed: and nobody was signed out by it")
          root.scene("ok")
          root.show("subs", function() {
            h.equal(root.snapshot(), ["subs", "rows", 3, "", ""], "failed: the next try can succeed")
            root.next()
          })
        })
      })
    })
  }

  // A second selection gives up the first: only its rows are shown.
  function superseded() {
    var h = root.h
    root.feeds.clear()
    root.scene("slow:600")
    var before = h.jobs().length
    h.equal(root.feeds.select("later"), true, "superseded: the first")
    h.after(250, function() {
      h.equal(root.feeds.select("history"), true, "superseded: the second")
      h.equal(root.snapshot(), ["history", "loading", 0, "", ""], "superseded: loading the second")
      h.waitFor(root.loaded, 10000, function() {
        h.equal(root.snapshot(), ["history", "rows", 5, "", ""], "superseded: only the second landed")
        var tags = h.jobs().slice(before).map(function(job) { return job.tag })
        h.equal(tags, ["jar-copy", "feed", "remove", "jar-copy", "feed", "remove"],
          "superseded: the first was ended and its copy removed before the second ran")
        root.scene("ok")
        h.equal(root.feeds.select("later"), true, "superseded: the first again")
        h.equal(root.feeds.status, "loading", "superseded: what was given up is not remembered")
        h.waitFor(root.loaded, 10000, function() {
          h.equal(root.snapshot(), ["later", "rows", 2, "", ""], "superseded: and can be fetched")
          root.next()
        })
      })
    })
  }

  function neverByItself() {
    var h = root.h
    var requests = root.asked().length
    var before = h.jobs().length
    h.after(1200, function() {
      h.equal([root.asked().length - requests, h.jobs().length - before], [0, 0],
        "by itself: nothing is fetched while the user does nothing")
      h.equal([root.runner.active, root.runner.waiting], [0, 0], "by itself: and nothing runs")
      root.next()
    })
  }

  // Lists live in memory. Nothing outside the runtime directory changed
  // while they were read, and no copy of the login is left inside it.
  function nothingOnDisk() {
    var h = root.h
    var paths = root.fs.paths
    root.diskFiles(function(files) {
      h.check(root.filesBefore.length === 1 && root.filesBefore[0].indexOf("cookies.txt") !== -1,
        "disk: before the lists, the saved login was the only file")
      h.equal(files, root.filesBefore, "disk: and it still is, unchanged in size")
      h.equal(h.jobs().filter(function(job) { return job.tag === "write" }).length, 0,
        "disk: no file job wrote")
      var grep = ["/usr/bin/grep", "-rl", "-e", "track ", "-e", "synthetic list", paths.runtimeDir,
        paths.stateDir, paths.dataDir]
      h.exec(grep, null, function(code, out) {
        h.equal(out, "", "disk: no title is in any file of ours")
        h.exec(["/usr/bin/find", paths.jarDir, "-mindepth", "1"], null, function(status, copies) {
          h.equal(copies, "", "disk: no copy of the login is left")
          root.next()
        })
      })
    })
  }

  // The tool reports that the login no longer counts. Its list is not
  // shown, and every list in memory goes.
  function noLongerAccepted() {
    var h = root.h
    root.feeds.clear()
    root.show("history", function() {
      h.equal(root.snapshot(), ["history", "rows", 5, "", ""], "rejected: a list is in memory")
      root.scene("signed-out")
      h.equal(root.feeds.select("foryou"), true, "rejected: another is asked for")
      h.waitFor(function() { return root.signIn.signedIn === false }, 10000, function() {
        h.equal([root.signIn.status, root.signIn.errorCode], ["failed", "E_SIGNED_OUT"],
          "rejected: the sign-in state says why")
        h.equal(root.snapshot(), ["", "idle", 0, "", ""], "rejected: no list is shown")
        var before = h.jobs().length
        h.equal(root.feeds.select("history"), false, "rejected: not even the one that was in memory")
        h.equal(root.feeds.select("foryou"), false, "rejected: and nothing can be asked for")
        h.after(300, function() {
          h.equal(h.jobs().length, before, "rejected: no job")
          root.next()
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.indexOf("track ") === -1 && log.indexOf("synthetic list") === -1,
      "quiet: no title is in the log")
    h.check(log.indexOf("invented-") === -1, "quiet: nor a cookie value")
    h.check(log.indexOf("/feed/") === -1, "quiet: nor an address")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      root.next()
    })
  }
}
