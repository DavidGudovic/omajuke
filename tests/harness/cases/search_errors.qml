import QtQuick
import "../../../lib/Const.js" as Const

// core/Search.qml when the search fails: every way the yt-dlp stub can fail
// ends in the state "error" with the code of that failure, the query the
// search ran for and no results; the next good search clears the error; and
// nothing of what the tool printed, the query included, reaches the log.
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
  readonly property string marker: "Quokkaburra"

  // Scenario of the stub, and the code the search must end with.
  readonly property var failures: [
    ["refused", "E_YT_REFUSED"],
    ["account", "E_NEEDS_ACCOUNT"],
    ["not-started", "E_NOT_STARTED"],
    ["blocked", "E_YT_BLOCKED"],
    ["network", "E_NETWORK"],
    ["unknown", "E_YTDLP_FAILED"],
    // Exit code 0, and something that is not the listing that was asked for.
    ["garbage", "E_BAD_OUTPUT"],
    ["non-ascii", "E_BAD_OUTPUT"],
    ["wrong-id", "E_BAD_OUTPUT"],
    // More output than a listing may have: without end, and by one byte.
    ["flood", "E_BAD_OUTPUT"],
    ["big:1048577", "E_BAD_OUTPUT"]
  ]

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
    root.steps = [root.everyFailure, root.noAnswer, root.noYtDlp, root.noWrapper, root.quiet]
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

  function snapshot(search) {
    return [search.status, search.query, search.results.length, search.errorCode]
  }

  // Runs one search on the given component and calls then() with it ended.
  function ended(search, scenario, query, then) {
    var h = root.h
    h.scenario({ ytdlp: scenario })
    h.equal(search.submit(query), true, scenario + ": taken")
    h.waitFor(function() { return search.status !== "searching" }, 12000, function(done) {
      h.check(done, scenario + ": the search ended")
      then()
    })
  }

  // A good search, then the failing one: the failure has results to drop
  // and the good one an error to clear.
  function failure(i) {
    var h = root.h
    if (i >= root.failures.length) { root.next(); return }
    var scenario = root.failures[i][0]
    var good = root.marker + " works before " + scenario
    var bad = root.marker + " fails with " + scenario
    root.ended(root.search, "ok", good, function() {
      h.equal(root.snapshot(root.search), ["results", good, 11, ""], scenario + ": first a search that works")
      root.ended(root.search, scenario, bad, function() {
        h.equal(root.snapshot(root.search), ["error", bad, 0, root.failures[i][1]],
          scenario + ": the code, the query it ran for, no results")
        root.failure(i + 1)
      })
    })
  }

  function everyFailure() {
    root.failure(0)
  }

  // A yt-dlp that never answers is ended at the deadline. The deadline is
  // shortened for this one search, so that the case does not take as long
  // as the real one.
  function noAnswer() {
    var h = root.h
    var usual = Const.TIMEOUTS.search
    var query = root.marker + " never answered"
    var began = Date.now()
    Const.TIMEOUTS.search = 1
    h.scenario({ ytdlp: "hang" })
    h.equal(root.search.submit(query), true, "hang: taken")
    Const.TIMEOUTS.search = usual
    h.waitFor(function() { return root.search.status !== "searching" }, 12000, function() {
      h.equal(root.snapshot(root.search), ["error", query, 0, "E_TIMEOUT"], "hang: the deadline ends it")
      h.check(Date.now() - began < 6000, "hang: at the shortened deadline")
      var jobs = h.jobs()
      h.equal(jobs[jobs.length - 1].command.slice(3, 7), [h.tools.timeout, "-k", "2", "1"],
        "hang: the deadline is the wrapper's")
      h.alive(function(names) {
        h.equal(names, [], "hang: the stub is gone")
        root.next()
      })
    })
  }

  // A second search component over a tool table of its own.
  function withTools(change) {
    var tools = {}
    for (var name in root.h.tools) tools[name] = root.h.tools[name]
    change(tools)
    var runner = root.h.mount("core/ProcessRunner.qml", { tools: tools })
    return root.h.mount("core/Search.qml", { runner: runner, tools: tools, fs: root.fs })
  }

  function noYtDlp() {
    var h = root.h
    var search = root.withTools(function(tools) { tools.ytdlp = "/nonexistent/yt-dlp" })
    var query = root.marker + " without the tool"
    root.ended(search, "ok", query, function() {
      h.equal(root.snapshot(search), ["error", query, 0, "E_YTDLP_MISSING"], "no yt-dlp: says so")
      root.next()
    })
  }

  function noWrapper() {
    var h = root.h
    var search = root.withTools(function(tools) { tools.setpriv = "/nonexistent/setpriv" })
    var query = root.marker + " without the wrapper"
    root.ended(search, "ok", query, function() {
      h.equal(root.snapshot(search), ["error", query, 0, "E_TOOLS_MISSING"], "no wrapper: says so")
      root.next()
    })
  }

  function quiet() {
    var h = root.h
    h.equal([Const.TIMEOUTS.search, Const.LIMITS.searchBytes], [15, 1048576], "quiet: the usual limits")
    h.check(JSON.stringify(h.jobs()).indexOf(root.marker) === -1, "quiet: the query is in no command")
    var seen = h.log("ytdlp").filter(function(record) { return record.stdin.indexOf(root.marker) !== -1 })
    h.equal(seen.length, 2 * root.failures.length + 1, "quiet: the stub saw every query on stdin")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      var log = h.readFile(h.runDir + "/out.txt")
      h.check(log.length > 0, "quiet: the log can be read")
      h.check(log.indexOf(root.marker) === -1, "quiet: the query is not in the log")
      var printed = ["ERROR:", "Private video", "Premieres", "not a bot", "unreachable", "Reading URLs"]
      for (var i = 0; i < printed.length; i++) {
        h.check(log.indexOf(printed[i]) === -1, "quiet: the log holds nothing the tool printed (" + i + ")")
      }
      root.next()
    })
  }
}
