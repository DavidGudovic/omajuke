import QtQuick
import "../../../lib/Const.js" as Const

// core/Thumbnails.qml when a thumbnail cannot be fetched: a missing picture,
// a transfer that broke off, a page instead of a picture, a curl that says
// nothing, never answers or is not there. The id is left out of the map,
// nothing of the transfer stays on disk, and the id is not asked for a
// second time. The memory of failures is bounded.
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
  // How often the map was published.
  property int published: 0

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
    root.thumbs.mapChanged.connect(function() { root.published += 1 })
    root.steps = [
      root.noCurl, root.oneMissing, root.notAgain, root.allMissing, root.brokenOff, root.notAPicture,
      root.nothingReported, root.noAnswer, root.stoppedByAnother, root.forgetting, root.quiet
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

  // The id made of one letter eleven times over, and the i-th numbered id.
  function vid(letter) {
    return root.note(new Array(12).join(letter))
  }

  function tid(i) {
    return root.note("t" + ("000000000" + i).slice(-10))
  }

  function note(id) {
    if (root.asked.indexOf(id) === -1) root.asked.push(id)
    return id
  }

  function file(n) {
    return root.fs.paths.thumbsDir + "/" + n + ".jpg"
  }

  function starts() {
    return root.h.log("curl").length
  }

  function keys() {
    return Object.keys(root.thumbs.map)
  }

  // then(names): the files in the thumbnail folder, by counter.
  function listing(then) {
    var find = ["/usr/bin/find", root.fs.paths.thumbsDir, "-mindepth", "1", "-printf", "%f\n"]
    root.h.exec(find, null, function(code, out) {
      var names = out.split("\n").filter(function(name) { return name !== "" })
      then(names.sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10) }))
    })
  }

  function names(numbers) {
    return numbers.map(function(n) { return n + ".jpg" })
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

  // Asks for ids under a scenario and calls then() when that batch is over.
  function fetched(scenario, ids, then) {
    var h = root.h
    var before = root.starts()
    h.scenario({ curl: scenario })
    root.thumbs.want(ids)
    h.waitFor(function() { return root.starts() === before + 1 }, 8000, function(started) {
      h.check(started, scenario + ": curl was started")
      root.settled(then)
    })
  }

  function oneMissing() {
    var h = root.h
    var ids = [root.vid("a"), root.vid("b"), root.vid("c")]
    var before = h.jobs().length
    root.fetched("404:1", ids, function() {
      h.equal(root.keys(), [ids[0], ids[2]], "one missing: the other two are in the map")
      h.equal([root.thumbs.map[ids[0]], root.thumbs.map[ids[1]], root.thumbs.map[ids[2]]],
        [root.file(1), undefined, root.file(3)], "one missing: each with its own file")
      var since = h.jobs().slice(before)
      h.equal(since.map(function(job) { return job.tag }), ["thumbs", "remove"], "one missing: a removal")
      h.equal(since[1].command.slice(10), [root.file(2)], "one missing: of what the transfer may have left")
      root.listing(function(found) {
        h.equal(found, root.names([1, 3]), "one missing: two files")
        root.next()
      })
    })
  }

  function notAgain() {
    var h = root.h
    var before = root.starts()
    h.scenario({ curl: "ok" })
    root.thumbs.want([root.vid("b")])
    root.thumbs.want([root.vid("b"), root.vid("b")])
    h.after(300, function() {
      h.equal(root.starts(), before, "not again: the missing one is not asked for a second time")
      // Not even as part of a batch that has other work to do.
      root.fetched("ok", [root.vid("b"), root.vid("d")], function() {
        var record = h.log("curl")
        h.equal(record[record.length - 1].stdin.split("\n").length, 3, "not again: one transfer, two lines")
        h.equal(root.keys(), [root.vid("a"), root.vid("c"), root.vid("d")], "not again: only the new one")
        root.next()
      })
    })
  }

  function allMissing() {
    var h = root.h
    var ids = [root.vid("e"), root.vid("f")]
    var before = [root.published, h.jobs().length]
    root.fetched("404", ids, function() {
      h.equal(root.keys().length, 3, "all missing: nothing new in the map")
      h.equal(root.published, before[0], "all missing: and the map was not published again")
      root.listing(function(found) {
        h.equal(found, root.names([1, 3, 4]), "all missing: no file")
        var starts = root.starts()
        root.thumbs.want(ids)
        h.after(300, function() {
          h.equal(root.starts(), starts, "all missing: neither is asked for again")
          root.next()
        })
      })
    })
  }

  // Every second transfer ends half-way.
  function brokenOff() {
    var h = root.h
    var ids = [root.vid("g"), root.vid("h"), root.vid("i"), root.vid("j")]
    root.fetched("partial", ids, function() {
      var map = root.thumbs.map
      h.equal([map[ids[0]], map[ids[1]], map[ids[2]], map[ids[3]]],
        [root.file(7), undefined, root.file(9), undefined], "broken off: the whole ones only")
      root.listing(function(found) {
        h.equal(found, root.names([1, 3, 4, 7, 9]), "broken off: their files only")
        root.next()
      })
    })
  }

  // HTTP 200 and a file, but the server sent a web page. The file the tool
  // wrote has to go again.
  function notAPicture() {
    var h = root.h
    var id = root.vid("k")
    var before = h.jobs().length
    root.fetched("html", [id], function() {
      h.equal(root.thumbs.map[id], undefined, "not a picture: not in the map")
      var since = h.jobs().slice(before)
      h.equal(since.map(function(job) { return job.tag }), ["thumbs", "remove"], "not a picture: a removal")
      h.equal(since[1].command.slice(10), [root.file(11)], "not a picture: of the file that was written")
      root.listing(function(found) {
        h.equal(found, root.names([1, 3, 4, 7, 9]), "not a picture: the file is gone")
        root.next()
      })
    })
  }

  // Files appear, but curl reports nothing about them.
  function nothingReported() {
    var h = root.h
    var ids = [root.vid("l"), root.vid("m")]
    root.fetched("silent", ids, function() {
      h.equal([root.thumbs.map[ids[0]], root.thumbs.map[ids[1]]], [undefined, undefined],
        "nothing reported: nothing is taken on trust")
      root.listing(function(found) {
        h.equal(found, root.names([1, 3, 4, 7, 9]), "nothing reported: the files are gone")
        root.next()
      })
    })
  }

  // A curl that never answers is ended at the deadline, shortened here.
  function noAnswer() {
    var h = root.h
    var id = root.vid("n")
    var usual = Const.TIMEOUTS.thumbs
    var began = Date.now()
    var before = h.jobs().length
    Const.TIMEOUTS.thumbs = 1
    h.scenario({ curl: "hang" })
    root.thumbs.want([id])
    h.waitFor(function() { return h.jobs().length > before }, 5000, function() {
      Const.TIMEOUTS.thumbs = usual
      h.equal(h.jobs()[before].command.slice(3, 7), [h.tools.timeout, "-k", "2", "1"], "hang: the deadline")
      root.settled(function() {
        h.check(Date.now() - began < 6000, "hang: ended at the shortened deadline")
        h.equal(root.thumbs.map[id], undefined, "hang: not in the map")
        h.alive(function(names) {
          h.equal(names, [], "hang: the stub is gone")
          root.next()
        })
      })
    })
  }

  // Someone else stops every job of the runner. Nothing is known about the
  // ids of that batch, so they did not fail: asked for again, they are
  // fetched.
  function stoppedByAnother() {
    var h = root.h
    var ids = [root.vid("q"), root.vid("r")]
    var before = root.starts()
    h.scenario({ curl: "hang" })
    root.thumbs.want(ids)
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "stopped: curl is running")
      root.runner.cancelAll()
      root.settled(function() {
        h.equal([root.thumbs.map[ids[0]], root.thumbs.map[ids[1]]], [undefined, undefined],
          "stopped: nothing arrived")
        root.fetched("ok", ids, function() {
          h.equal([root.thumbs.map[ids[0]], root.thumbs.map[ids[1]]], [root.file(17), root.file(18)],
            "stopped: and nothing failed, both are fetched when asked for again")
          root.next()
        })
      })
    })
  }

  // A second component over a tool table without curl. It comes first in
  // this case: it counts its files from 1 like the other one, and the two
  // share a folder here, which they never do in the plugin.
  function noCurl() {
    var h = root.h
    var tools = {}
    for (var name in h.tools) tools[name] = h.tools[name]
    tools.curl = "/nonexistent/curl"
    var runner = h.mount("core/ProcessRunner.qml", { tools: tools })
    var thumbs = h.mount("core/Thumbnails.qml", {
      runner: runner, tools: tools, fs: root.fs, panelOpen: true
    })
    var tried = function() {
      return h.jobs().filter(function(job) { return job.tag === "thumbs" }).length
    }
    thumbs.want([root.vid("o"), root.vid("p")])
    h.waitFor(function() { return tried() === 1 && runner.active === 0 }, 5000, function(ran) {
      h.check(ran, "no curl: the batch was tried")
      thumbs.want([root.vid("o"), root.vid("p")])
      h.after(400, function() {
        h.equal([tried(), Object.keys(thumbs.map).length], [1, 0], "no curl: tried once, and nothing arrived")
        root.settled(function() { root.next() })
      })
    })
  }

  // Runs count failing batches of twelve new ids, starting at number from.
  function failingBatches(from, count, then) {
    if (count === 0) { then(); return }
    var ids = []
    for (var i = 0; i < Const.LIMITS.thumbBatch; i++) ids.push(root.tid(from + i))
    var before = root.starts()
    root.thumbs.want(ids)
    var over = function() { return root.starts() === before + 1 && root.runner.active === 0 }
    root.h.waitFor(over, 8000, function() {
      root.failingBatches(from + Const.LIMITS.thumbBatch, count - 1, then)
    })
  }

  // Only so many failures are remembered. Beyond that the oldest is
  // forgotten, and may be tried once more.
  function forgetting() {
    var h = root.h
    h.equal([Const.LIMITS.thumbFiles, Const.LIMITS.thumbBatch], [200, 12], "forgetting: the limits")
    h.scenario({ curl: "404" })
    // Nine ids have failed so far. 204 more push those nine out, and the
    // first four of their own.
    root.failingBatches(1, 17, function() {
      root.settled(function() {
        var before = root.starts()
        h.scenario({ curl: "ok" })
        root.thumbs.want([root.tid(5), root.tid(204)])
        h.after(400, function() {
          h.equal(root.starts(), before, "forgetting: the latest 200 failures are remembered")
          root.fetched("ok", [root.vid("b"), root.tid(4), root.tid(5)], function() {
            var map = root.thumbs.map
            h.equal([map[root.vid("b")], map[root.tid(4)], map[root.tid(5)]],
              [root.file(223), root.file(224), undefined], "forgetting: an older one is tried again")
            root.next()
          })
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    h.equal(Const.TIMEOUTS.thumbs, 12, "quiet: the deadline is the usual one again")
    var commands = JSON.stringify(h.jobs())
    var named = root.asked.filter(function(id) { return commands.indexOf(id) !== -1 })
    h.check(root.asked.length >= 222, "quiet: the ids this case asked for")
    h.equal(named, [], "quiet: no id is in any command")
    root.listing(function(found) {
      h.equal(found, root.names([1, 3, 4, 7, 9, 17, 18, 223, 224]), "quiet: the files of what is in the map")
      h.alive(function(names) {
        h.equal(names, [], "quiet: no stub is left running")
        var log = h.readFile(h.runDir + "/out.txt")
        var logged = root.asked.filter(function(id) { return log.indexOf(id) !== -1 })
        h.equal(logged, [], "quiet: no id is in the log")
        h.check(log.indexOf("ytimg") === -1 && log.indexOf("/thumbs/") === -1, "quiet: nor a transfer")
        root.next()
      })
    })
  }
}
