import QtQuick
import "../../../lib/Sh.js" as Sh

// core/Thumbnails.qml against the curl stub, when all goes well: what is
// asked for within one turn is one batch of one bounded curl; the files are
// private and named by a counter; the map hands the panel local paths; a
// batch holds twelve at most and batches never overlap; nothing is fetched
// for a closed panel; and a file a row could not show is dropped. The video
// id may appear in the stub's standard input and nowhere else.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var thumbs: null
  property var steps: []
  property int at: 0
  // Every id this case asks for, to look for afterwards.
  property var asked: []
  // The number of ids in the map each time it was published.
  property var published: []

  readonly property string first: "AAAAAAAAAAA"
  readonly property string second: "BBBBBBBBBBB"
  readonly property string third: "CCCCCCCCCCC"
  // A valid id that is also the name of a member every object has.
  readonly property string named: "constructor"

  // prepare only asks whether mpv is an executable file.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.thumbs = h.mount("core/Thumbnails.qml", {
      runner: root.runner, tools: h.tools, fs: root.fs, panelOpen: true
    })
    if (root.runner === null || root.fs === null || root.thumbs === null) { h.finish(); return }
    root.thumbs.mapChanged.connect(function() { root.published.push(root.size()) })
    root.steps = [
      root.beforeReady, root.oneBatch, root.recorded, root.alreadyThere, root.twoBatches, root.rowError,
      root.closingPanel, root.closedPanel, root.neverNamed
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // The i-th made-up id of this case.
  function tid(i) {
    return "t" + ("000000000" + i).slice(-10)
  }

  function want(ids) {
    var list = Array.isArray(ids) ? ids : []
    for (var i = 0; i < list.length; i++) {
      var id = list[i]
      if (typeof id === "string" && id.length === 11 && root.asked.indexOf(id) === -1) root.asked.push(id)
    }
    root.thumbs.want(ids)
  }

  function size() {
    return Object.keys(root.thumbs.map).length
  }

  function file(n) {
    return root.fs.paths.thumbsDir + "/" + n + ".jpg"
  }

  function starts() {
    return root.h.log("curl").length
  }

  // The two lines curl is given for one thumbnail.
  function transfer(id, n) {
    return "url = \"https://i.ytimg.com/vi/" + id + "/mqdefault.jpg\"\noutput = \"" + root.file(n) + "\"\n"
  }

  // The flags behind the tool, written out a second time.
  function flags() {
    return [
      "-q", "--no-progress-meter", "--fail", "--proto", "=https", "--proto-redir", "=https",
      "--max-redirs", "0", "--tlsv1.2", "--connect-timeout", "4", "--max-time", "8",
      "--max-filesize", "262144", "--remove-on-error", "--parallel", "--parallel-max", "4",
      "--user-agent", "",
      "--write-out", "%{urlnum} %{response_code} %{exitcode} %{size_download} %{content_type}\\n",
      "--config", "-"
    ]
  }

  // then(names): "<mode> <bytes> <name>" for everything in the thumbnail
  // folder, in the order of the counter.
  function listing(then) {
    var find = ["/usr/bin/find", root.fs.paths.thumbsDir, "-mindepth", "1", "-printf", "%m %s %f\n"]
    root.h.exec(find, null, function(code, out) {
      var lines = out.split("\n").filter(function(line) { return line !== "" })
      var counter = function(line) { return parseInt(line.split(" ")[2], 10) }
      then(lines.sort(function(a, b) { return counter(a) - counter(b) }))
    })
  }

  // What the listing shows for the fixture stored under these counters.
  function files(numbers) {
    return numbers.map(function(n) { return "600 189 " + n + ".jpg" })
  }

  // Calls then() once no job is left and no batch is about to start.
  function settled(then) {
    var idle = function() { return root.runner.active === 0 && root.runner.waiting === 0 }
    root.h.waitFor(idle, 8000, function(ok) {
      root.h.check(ok, "every job has settled")
      root.h.after(100, function() {
        if (idle()) then()
        else root.settled(then)
      })
    })
  }

  // Until the private directories are vouched for, nothing is fetched.
  function beforeReady() {
    var h = root.h
    h.equal(root.fs.status, "pending", "before prepare: the file layer is not ready")
    h.check(Object.getPrototypeOf(root.thumbs.map) === null, "before prepare: the map has no prototype")
    root.want([root.first])
    h.after(250, function() {
      h.equal([h.jobs().length, root.starts(), root.size()], [0, 0, 0], "before prepare: nothing is fetched")
      root.fs.prepared.connect(function(ok) {
        h.check(ok, "the directories are prepared")
        if (ok) root.next()
        else h.finish()
      })
      root.fs.prepare()
    })
  }

  function oneBatch() {
    var h = root.h
    h.scenario({ curl: "ok" })
    // Several requests in one turn, with repeats and things that are not ids.
    root.want([root.first, root.second])
    root.want([root.second, "short", null, 5, "AAAAAAAAAAAA", "AAAAA/AAAAA", root.third, root.first])
    root.want("AAAAAAAAAAA")
    root.want([[root.first]])
    root.want([root.named])
    h.equal(root.size(), 0, "one batch: nothing is there inside the request")
    h.waitFor(function() { return root.size() > 0 }, 8000, function(arrived) {
      h.check(arrived, "one batch: the map was published")
      var map = root.thumbs.map
      h.equal(Object.keys(map), [root.first, root.second, root.third, root.named], "one batch: four ids")
      h.equal([map[root.first], map[root.second], map[root.third], map[root.named]],
        [root.file(1), root.file(2), root.file(3), root.file(4)], "one batch: each a local file path")
      h.check(Object.getPrototypeOf(map) === null && Object.isFrozen(map), "one batch: no prototype, frozen")
      h.equal([map.toString, map.hasOwnProperty, map.__proto__], [undefined, undefined, undefined],
        "one batch: the map holds ids and nothing else")
      h.equal(root.published, [4], "one batch: published once")
      root.settled(function() {
        root.listing(function(found) {
          h.equal(found, root.files([1, 2, 3, 4]), "one batch: the files, mode 600, named by the counter")
          root.next()
        })
      })
    })
  }

  function recorded() {
    var h = root.h
    var record = h.log("curl")
    h.equal(record.length, 1, "recorded: curl ran once")
    h.equal(record[0].argv, root.flags(), "recorded: the arguments are the constant list")
    h.equal(record[0].stdin, root.transfer(root.first, 1) + root.transfer(root.second, 2)
      + root.transfer(root.third, 3) + root.transfer(root.named, 4), "recorded: the transfers on stdin")
    var profile = ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"]
    // The shell that sets the private umask adds a few names of its own.
    var shell = ["OLDPWD", "PWD", "SHLVL", "_"]
    var missing = profile.filter(function(name) { return record[0].env.indexOf(name) === -1 })
    var extra = record[0].env.filter(function(name) {
      return profile.indexOf(name) === -1 && shell.indexOf(name) === -1
    })
    h.equal([missing, extra], [[], []], "recorded: the network profile and nothing else")
    var jobs = h.jobs().filter(function(job) { return job.tag !== "prepare" })
    var command = [
      h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "12",
      h.tools.sh, "-c", Sh.UMASK_EXEC, "omajuke", h.tools.curl
    ]
    h.equal(jobs, [{ tag: "thumbs", command: command.concat(root.flags()) }],
      "recorded: one job, bounded by the wrapper, under a private umask")
    root.next()
  }

  function alreadyThere() {
    var h = root.h
    var before = [root.starts(), h.jobs().length]
    root.want([root.first, root.named, root.third])
    h.after(300, function() {
      h.equal([root.starts(), h.jobs().length], before, "already there: nothing is fetched twice")
      root.next()
    })
  }

  // Fourteen new ids: a batch of twelve, then one of two, one after the
  // other.
  function twoBatches() {
    var h = root.h
    var ids = []
    for (var i = 1; i <= 14; i++) ids.push(root.tid(i))
    var before = root.starts()
    var most = 0
    h.scenario({ curl: "slow:250" })
    root.want(ids)
    var done = function() {
      most = Math.max(most, root.runner.active)
      return root.size() === 18
    }
    // Asked for again while the first batch is on its way: what is being
    // fetched and what waits is not queued a second time.
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "two batches: the first one runs")
      root.want(ids)
      root.want([ids[0], ids[13]])
    })
    h.waitFor(done, 10000, function(all) {
      h.check(all, "two batches: all fourteen arrived")
      h.equal(most, 1, "two batches: never two curl processes at once")
      h.equal(root.published, [4, 16, 18], "two batches: published after each batch")
      var record = h.log("curl").slice(before)
      h.equal(record.length, 2, "two batches: curl ran twice")
      var expected = ""
      for (var k = 0; k < 12; k++) expected += root.transfer(ids[k], 5 + k)
      h.equal(record[0].stdin, expected, "two batches: the first twelve, in the order they were asked for")
      h.equal(record[1].stdin, root.transfer(ids[12], 17) + root.transfer(ids[13], 18),
        "two batches: then the other two")
      h.equal(root.thumbs.map[ids[13]], root.file(18), "two batches: the last one's file")
      root.settled(function() {
        h.equal(root.starts(), before + 2, "two batches: and no third one for what was asked twice")
        root.next()
      })
    })
  }

  // A row reports that it could not show its file.
  function rowError() {
    var h = root.h
    var before = [root.starts(), root.published.length]
    h.scenario({ curl: "ok" })
    root.thumbs.reportError(root.second)
    h.equal(root.thumbs.map[root.second], undefined, "row error: the id left the map at once")
    h.equal(root.size(), 17, "row error: the others stay")
    h.check(h.readFile(root.file(2)).length > 0, "row error: the file is still there when the map changes")
    // What is not in the map cannot have failed to show.
    var unknown = [root.tid(99), "short", "", null, undefined, 5, {}, "toString", "__proto__", root.second]
    for (var i = 0; i < unknown.length; i++) root.thumbs.reportError(unknown[i])
    h.equal([root.size(), root.published.length], [17, before[1] + 1], "row error: nothing else changes it")
    root.thumbs.reportError(root.named)
    h.equal([root.thumbs.map[root.named], root.size()], [undefined, 16], "row error: any id can be dropped")
    root.settled(function() {
      root.listing(function(found) {
        var kept = [1, 3]
        for (var n = 5; n <= 18; n++) kept.push(n)
        h.equal(found, root.files(kept), "row error: the two files are removed")
        // It is not fetched a second time, however often it is asked for.
        root.want([root.second, root.named])
        root.want([root.second])
        h.after(300, function() {
          h.equal(root.starts(), before[0], "row error: a failed id is not asked for again")
          // An id that was reported without ever being in the map has not
          // failed: it is fetched when it is asked for.
          root.want([root.tid(99)])
          h.waitFor(function() { return root.size() === 17 }, 5000, function(arrived) {
            h.check(arrived, "row error: a report about an unknown id counts for nothing")
            h.equal(root.thumbs.map[root.tid(99)], root.file(19), "row error: it has its file")
            root.settled(function() { root.next() })
          })
        })
      })
    })
  }

  // The panel closes while a batch runs and more ids wait: the batch may
  // finish, the waiting ones are dropped.
  function closingPanel() {
    var h = root.h
    var ids = []
    for (var i = 20; i < 37; i++) ids.push(root.tid(i))
    var before = root.starts()
    h.scenario({ curl: "slow:400" })
    root.want(ids)
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "closing: the first batch runs")
      root.thumbs.panelOpen = false
      h.waitFor(function() { return root.size() === 29 }, 5000, function(finished) {
        h.check(finished, "closing: the running batch finished and was published")
        root.thumbs.panelOpen = true
        h.after(700, function() {
          h.equal([root.starts(), root.size()], [before + 1, 29], "closing: what waited is not fetched later")
          h.equal(root.thumbs.map[ids[12]], undefined, "closing: the thirteenth never arrived")
          root.next()
        })
      })
    })
  }

  // Nothing is fetched while no panel is open. What was asked for in the
  // meantime is fetched when one opens.
  function closedPanel() {
    var h = root.h
    var before = root.starts()
    h.scenario({ curl: "ok" })
    root.thumbs.panelOpen = false
    root.want([root.tid(50), root.tid(51)])
    h.after(400, function() {
      h.equal([root.starts(), root.runner.active], [before, 0], "closed: nothing is fetched")
      root.thumbs.panelOpen = true
      h.waitFor(function() { return root.size() === 31 }, 5000, function(arrived) {
        h.check(arrived, "closed: fetched once a panel is open")
        h.equal(root.starts(), before + 1, "closed: in one batch")
        // And what a panel asked for before it closed is forgotten.
        root.thumbs.panelOpen = false
        h.scenario({ curl: "slow:300" })
        root.thumbs.panelOpen = true
        root.want([root.tid(52)])
        root.thumbs.panelOpen = false
        root.thumbs.panelOpen = true
        h.after(500, function() {
          h.equal([root.starts(), root.size()], [before + 1, 31], "closed: closing empties the queue")
          root.settled(function() { root.next() })
        })
      })
    })
  }

  function neverNamed() {
    var h = root.h
    var commands = JSON.stringify(h.jobs())
    var named = root.asked.filter(function(id) { return commands.indexOf(id) !== -1 })
    h.check(root.asked.length >= 38, "never named: the ids this case asked for")
    h.equal(named, [], "never named: no id is in any command")
    h.check(commands.indexOf("ytimg") === -1 && commands.indexOf("https:") === -1, "never named: no address")
    var opening = "url = \"https://i.ytimg.com/vi/"
    var seen = h.log("curl").filter(function(record) { return record.stdin.indexOf(opening) === 0 })
    h.equal(seen.length, root.starts(), "never named: the stub got every address on stdin")
    root.listing(function(found) {
      var plain = found.filter(function(line) { return /^600 189 [0-9]{1,10}\.jpg$/.test(line) })
      h.equal([found.length, plain.length], [31, 31], "never named: private files, named by digits alone")
      h.alive(function(names) {
        h.equal(names, [], "never named: no stub is left running")
        var log = h.readFile(h.runDir + "/out.txt")
        var logged = root.asked.filter(function(id) { return log.indexOf(id) !== -1 })
        h.equal(logged, [], "never named: no id is in the log")
        h.check(log.indexOf("ytimg") === -1 && log.indexOf("/thumbs/") === -1, "never named: nor a transfer")
        root.next()
      })
    })
  }
}
