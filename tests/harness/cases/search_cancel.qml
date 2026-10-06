import QtQuick

// core/Search.qml when a search is overtaken: a second submit ends the first
// one's yt-dlp and only the second's answer lands; clear() ends a running
// search for good; and of several submits in one turn only the last counts.
// In every case the overtaken process is really gone, not merely ignored.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var search: null
  property var steps: []
  property int at: 0

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
      root.superseded, root.clearedWhileRunning, root.clearedAfterOverflow, root.stoppedByAnother,
      root.severalInOneTurn, root.atRest
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

  function snapshot() {
    var s = root.search
    return [s.status, s.query, s.results.length, s.errorCode]
  }

  function starts() {
    return root.h.log("ytdlp").length
  }

  // then(count): the PID records yt-dlp stubs left behind. A stub removes
  // its record when it ends by itself, so each one left stands for a stub
  // that was ended from outside.
  function leftRecords(then) {
    var find = ["/usr/bin/find", root.h.runDir + "/oj-stub", "-name", "ytdlp.*.pid"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).length)
    })
  }

  // Calls then() once no job and no recorded process is left.
  function settled(label, then) {
    var h = root.h
    var idle = function() { return root.runner.active === 0 && root.runner.waiting === 0 }
    h.waitFor(idle, 6000, function(ok) {
      h.check(ok, label + ": every job has settled")
      h.alive(function(names) {
        h.equal(names, [], label + ": no stub is left running")
        then()
      })
    })
  }

  function superseded() {
    var h = root.h
    var began = Date.now()
    // The first search would answer after three seconds, with results.
    h.scenario({ ytdlp: "slow:3000" })
    h.equal(root.search.submit("first search"), true, "superseded: the first is taken")
    h.waitFor(function() { return root.starts() === 1 }, 5000, function(started) {
      h.check(started, "superseded: the first yt-dlp is running")
      h.scenario({ ytdlp: "empty" })
      h.equal(root.search.submit("second search"), true, "superseded: the second is taken")
      h.equal(root.snapshot(), ["searching", "second search", 0, ""], "superseded: the state is the second's")
      h.waitFor(function() { return root.search.status !== "searching" }, 5000, function() {
        h.equal(root.snapshot(), ["empty", "second search", 0, ""], "superseded: the second's answer landed")
        root.settled("superseded", function() {
          h.check(Date.now() - began < 2500, "superseded: all of it before the first could have answered")
          var record = h.log("ytdlp")
          h.equal([record.length, record[0].stdin, record[1].stdin],
            [2, "ytsearch20:first search\n", "ytsearch20:second search\n"], "superseded: two starts")
          root.leftRecords(function(left) {
            h.equal(left, 1, "superseded: the first yt-dlp was ended, it did not finish")
            // Past the moment the first would have answered.
            h.after(3200 - (Date.now() - began), function() {
              h.equal(root.snapshot(), ["empty", "second search", 0, ""], "superseded: nothing lands later")
              root.next()
            })
          })
        })
      })
    })
  }

  function clearedWhileRunning() {
    var h = root.h
    var before = root.starts()
    h.scenario({ ytdlp: "hang" })
    h.equal(root.search.submit("third search"), true, "clear: a search that will not answer is taken")
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "clear: its yt-dlp is running")
      h.equal(root.snapshot(), ["searching", "third search", 0, ""], "clear: searching")
      root.search.clear()
      h.equal(root.snapshot(), ["idle", "", 0, ""], "clear: idle at once")
      root.settled("clear", function() {
        root.leftRecords(function(left) {
          h.equal(left, 2, "clear: its yt-dlp was ended")
          h.equal(root.snapshot(), ["idle", "", 0, ""], "clear: and it stays idle")
          root.next()
        })
      })
    })
  }

  // The runner has already given up on a yt-dlp that prints without end
  // and waits for it to go, which this one takes its time over. A clear()
  // in between still ends the search for good: what the runner reports when
  // the process is finally gone is not taken for an answer.
  function clearedAfterOverflow() {
    var h = root.h
    var before = root.starts()
    h.scenario({ ytdlp: "loud" })
    h.equal(root.search.submit("fourth search"), true, "overflow: taken")
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "overflow: its yt-dlp is running")
      // Time for the runner to read more than a listing may hold.
      h.after(500, function() {
        h.equal(root.snapshot(), ["searching", "fourth search", 0, ""], "overflow: no answer while it lives")
        h.equal(root.runner.active, 1, "overflow: and it is still there")
        root.search.clear()
        root.settled("overflow", function() {
          h.equal(root.snapshot(), ["idle", "", 0, ""], "overflow: idle, and no error turns up afterwards")
          root.next()
        })
      })
    })
  }

  // Someone else stops every job of the runner. No answer will come, so
  // the search must not be shown as running for ever.
  function stoppedByAnother() {
    var h = root.h
    var before = root.starts()
    h.scenario({ ytdlp: "hang" })
    h.equal(root.search.submit("fifth search"), true, "stopped: taken")
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "stopped: its yt-dlp is running")
      root.runner.cancelAll()
      h.equal(root.snapshot(), ["searching", "fifth search", 0, ""], "stopped: searching for the moment")
      root.settled("stopped", function() {
        h.equal(root.snapshot(), ["idle", "", 0, ""], "stopped: idle once the job is gone")
        root.next()
      })
    })
  }

  function severalInOneTurn() {
    var h = root.h
    var before = root.starts()
    h.scenario({ ytdlp: "ok" })
    root.search.submit("one of three")
    root.search.submit("two of three")
    h.equal(root.search.submit("three of three"), true, "one turn: the last is taken")
    h.equal(root.snapshot(), ["searching", "three of three", 0, ""], "one turn: the state is the last one's")
    h.waitFor(function() { return root.search.status !== "searching" }, 8000, function() {
      h.equal(root.snapshot(), ["results", "three of three", 11, ""], "one turn: the last one's results")
      root.settled("one turn", function() {
        var record = h.log("ytdlp")
        // The two that were overtaken were ended at once, perhaps before
        // they had read anything.
        h.check(record.length >= before + 1 && record.length <= before + 3, "one turn: at most three starts")
        h.equal(record[record.length - 1].stdin, "ytsearch20:three of three\n", "one turn: the last ran")
        var finished = record.filter(function(entry) { return entry.stdin === "ytsearch20:three of three\n" })
        h.equal(finished.length, 1, "one turn: and it ran once")
        root.next()
      })
    })
  }

  function atRest() {
    var h = root.h
    root.search.clear()
    h.after(300, function() {
      h.equal(root.snapshot(), ["idle", "", 0, ""], "at rest: idle")
      h.equal([root.runner.active, root.runner.waiting], [0, 0], "at rest: no job")
      var cancelled = h.jobs().filter(function(job) { return job.tag === "search" }).length
      h.check(cancelled >= 4, "at rest: every search was a job of the runner")
      root.next()
    })
  }
}
