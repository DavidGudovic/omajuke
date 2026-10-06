import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Track.js" as Track

// core/Search.qml against the yt-dlp stub, when all goes well: the command
// line is the constant list and the query is only ever in the stub's
// standard input; the state moves from idle through searching to results or
// empty and back; and the results are the cleaned tracks of the fixture.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var search: null
  property var steps: []
  property int at: 0

  // A word that occurs nowhere else, to look for in places it must not be.
  readonly property string marker: "Zebracrossing"
  // As typed: a doubled space, a tag, a tab and a line break. As sent: one
  // line, and nothing yt-dlp's reader would take for a comment.
  readonly property string typed: "  " + marker + "  walk #live\t now\nsecond line "
  readonly property string cleaned: marker + " walk live now second line"

  // prepare only asks whether mpv is an executable file.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.search = h.mount("core/Search.qml", { runner: root.runner, tools: h.tools, fs: root.fs })
    if (root.runner === null || root.fs === null || root.search === null) { h.finish(); return }
    root.steps = [
      root.beforeReady, root.atRest, root.declined, root.found, root.recorded, root.nothingFound,
      root.cleared, root.afterClear, root.largest, root.quiet
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function snapshot() {
    var s = root.search
    return [s.status, s.query, s.results.length, s.errorCode]
  }

  // The flags behind the tool, written out a second time.
  function flags() {
    return [
      "--ignore-config", "--no-plugin-dirs", "--cache-dir", root.fs.paths.ytCacheDir, "--color", "never",
      "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10",
      "--no-cookies", "--no-warnings", "--flat-playlist", "-J", "-a", "-"
    ]
  }

  // Until the private directories are vouched for, nothing is started that
  // would write into them.
  function beforeReady() {
    var h = root.h
    h.equal(root.fs.status, "pending", "before prepare: the file layer is not ready")
    h.equal(root.search.submit("too early"), true, "before prepare: the search is taken")
    h.equal(root.snapshot(), ["error", "too early", 0, "E_RUNTIME_DIR"], "before prepare: and fails at once")
    h.equal(h.jobs().length, 0, "before prepare: no job")
    root.search.clear()
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (ok) root.next()
      else h.finish()
    })
    root.fs.prepare()
  }

  function atRest() {
    root.h.equal(root.snapshot(), ["idle", "", 0, ""], "at rest: idle, and nothing kept")
    root.next()
  }

  function declined() {
    var h = root.h
    var before = h.jobs().length
    var empty = ["", "   ", "\n\t", "\u00a0\u3000", "\u200b\u202e", null, undefined, 7, ["x"], { query: "x" }]
    for (var i = 0; i < empty.length; i++) {
      h.equal(root.search.submit(empty[i]), false, "declined " + i + ": nothing to search for")
    }
    h.equal(root.snapshot(), ["idle", "", 0, ""], "declined: the state is untouched")
    h.after(200, function() {
      h.equal([h.jobs().length - before, h.log("ytdlp").length], [0, 0], "declined: nothing was started")
      root.next()
    })
  }

  function found() {
    var h = root.h
    h.scenario({ ytdlp: "ok" })
    h.equal(root.search.submit(root.typed), true, "found: the search is taken")
    h.equal(root.snapshot(), ["searching", root.cleaned, 0, ""], "found: searching at once, query cleaned")
    h.waitFor(function() { return root.search.status !== "searching" }, 8000, function() {
      h.equal(root.snapshot(), ["results", root.cleaned, 11, ""], "found: results")
      var fixture = Track.listFromPlaylistJson(h.readFile(h.repo + "/tests/fixtures/search.json"),
        Const.LIMITS.searchCount)
      h.check(fixture.ok && fixture.tracks.length === 11, "found: the fixture holds eleven playable entries")
      h.equal(root.search.results, fixture.tracks, "found: the tracks of the fixture, in its order")
      var first = root.search.results[0]
      h.equal(first, { id: "AAAAAAAAAAA", title: "Synthetic track one", channel: "Synthetic Channel",
        duration: 213, live: false }, "found: a track has exactly its five fields")
      h.equal(root.search.results[1].title, "Second track with marks and a line break",
        "found: a title arrives cleaned")
      h.check(root.search.results.length <= Const.LIMITS.searchCount, "found: within the cap")
      h.equal(root.runner.active, 0, "found: the job is gone")
      root.next()
    })
  }

  function recorded() {
    var h = root.h
    var record = h.log("ytdlp")
    h.equal(record.length, 1, "recorded: yt-dlp ran once")
    h.equal(record[0].argv, root.flags(), "recorded: the arguments are the constant list")
    h.equal(record[0].stdin, "ytsearch20:" + root.cleaned + "\n", "recorded: the query, as one line on stdin")
    h.equal(record[0].env, ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
      "recorded: the network profile and nothing else")
    var command = [h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "15", h.tools.ytdlp]
    var searches = h.jobs().filter(function(job) { return job.tag === "search" })
    h.equal(searches, [{ tag: "search", command: command.concat(root.flags()) }],
      "recorded: one job, bounded by the wrapper")
    h.check(JSON.stringify(h.jobs()).indexOf(root.marker) === -1, "recorded: the query is in no command")
    h.check(JSON.stringify(h.jobs()).indexOf("ytsearch") === -1, "recorded: nor is its prefix")
    root.next()
  }

  function nothingFound() {
    var h = root.h
    h.scenario({ ytdlp: "empty" })
    h.equal(root.search.submit("another one"), true, "empty: taken")
    // The rows of the search before stay until the new answer is there.
    h.equal(root.snapshot(), ["searching", "another one", 11, ""], "empty: the earlier results stay shown")
    h.waitFor(function() { return root.search.status !== "searching" }, 8000, function() {
      h.equal(root.snapshot(), ["empty", "another one", 0, ""], "empty: nothing found")
      h.equal(h.log("ytdlp")[1].stdin, "ytsearch20:another one\n", "empty: the second query on stdin")
      root.next()
    })
  }

  function cleared() {
    var h = root.h
    var starts = h.log("ytdlp").length
    root.search.clear()
    h.equal(root.snapshot(), ["idle", "", 0, ""], "clear: idle, and nothing kept")
    root.search.clear()
    h.equal(root.snapshot(), ["idle", "", 0, ""], "clear: twice is the same")
    h.after(200, function() {
      h.equal(h.log("ytdlp").length, starts, "clear: starts nothing")
      root.next()
    })
  }

  function afterClear() {
    var h = root.h
    h.scenario({ ytdlp: "ok" })
    // An id spelled like an option and one spelled like a member name are
    // text like any other here: both are part of the line, not arguments.
    h.equal(root.search.submit("--no-config constructor"), true, "after clear: taken")
    h.waitFor(function() { return root.search.status !== "searching" }, 8000, function() {
      h.equal(root.snapshot(), ["results", "--no-config constructor", 11, ""], "after clear: results again")
      var record = h.log("ytdlp")
      h.equal(record[2].stdin, "ytsearch20:--no-config constructor\n", "after clear: behind the prefix")
      h.equal(record[2].argv, root.flags(), "after clear: the arguments have not changed")
      root.search.clear()
      h.equal(root.snapshot(), ["idle", "", 0, ""], "after clear: results can be cleared")
      root.next()
    })
  }

  // An answer of exactly as many bytes as a listing may have is read.
  function largest() {
    var h = root.h
    h.scenario({ ytdlp: "big:" + Const.LIMITS.searchBytes })
    h.equal(root.search.submit("a long answer"), true, "largest: taken")
    h.waitFor(function() { return root.search.status !== "searching" }, 8000, function() {
      h.equal(root.snapshot(), ["results", "a long answer", 11, ""], "largest: read to the last byte")
      root.search.clear()
      root.next()
    })
  }

  // Nothing of a search may reach the log: not the query, and not what the
  // tool printed.
  function quiet() {
    var h = root.h
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      var log = h.readFile(h.runDir + "/out.txt")
      h.check(log.indexOf(root.marker) === -1, "quiet: the query is not in the log")
      h.check(log.indexOf("ytsearch") === -1 && log.indexOf("Synthetic") === -1, "quiet: nor is any result")
      h.check(log.indexOf("Reading URLs") === -1, "quiet: nor what the tool printed")
      root.next()
    })
  }
}
