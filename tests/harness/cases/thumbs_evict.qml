import QtQuick
import "../../../lib/Const.js" as Const

// core/Thumbnails.qml at its limits: the queue of ids that wait holds sixty
// and drops the oldest; beyond two hundred files the fifty oldest are
// evicted; purge() forgets everything. Whenever files go, the map is
// published without them first and the files are deleted afterwards, and a
// batch that was overtaken by a purge leaves nothing behind.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var thumbs: null
  property var steps: []
  property int at: 0
  // The number of ids in the map each time it was published.
  property var sizes: []
  // Called, inside the publication, whenever the map got smaller.
  property var onShrink: null

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
    root.thumbs.mapChanged.connect(function() {
      var size = root.size()
      var smaller = root.sizes.length > 0 && size < root.sizes[root.sizes.length - 1]
      root.sizes.push(size)
      if (smaller && root.onShrink !== null) root.onShrink()
    })
    root.steps = [
      root.queueCap, root.fill, root.evictedAgain, root.purged, root.afterPurge, root.purgedWhileFetching,
      root.purgedAfterOverflow, root.quiet
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

  // The i-th made-up id of this case, and count of them from number from.
  function tid(i) {
    return "t" + ("000000000" + i).slice(-10)
  }

  function tids(from, count) {
    var ids = []
    for (var i = 0; i < count; i++) ids.push(root.tid(from + i))
    return ids
  }

  function size() {
    return Object.keys(root.thumbs.map).length
  }

  function file(n) {
    return root.fs.paths.thumbsDir + "/" + n + ".jpg"
  }

  function onDisk(n) {
    return root.h.readFile(root.file(n)).length > 0
  }

  function starts() {
    return root.h.log("curl").length
  }

  // then(numbers): the counters of the files in the thumbnail folder.
  function listing(then) {
    var find = ["/usr/bin/find", root.fs.paths.thumbsDir, "-mindepth", "1", "-printf", "%f\n"]
    root.h.exec(find, null, function(code, out) {
      var names = out.split("\n").filter(function(name) { return name !== "" })
      var odd = names.filter(function(name) { return !/^[0-9]{1,10}\.jpg$/.test(name) })
      root.h.equal(odd, [], "every file is named by digits alone")
      then(names.map(function(name) { return parseInt(name, 10) }).sort(function(a, b) { return a - b }))
    })
  }

  function range(from, to) {
    var numbers = []
    for (var n = from; n <= to; n++) numbers.push(n)
    return numbers
  }

  // Calls then() once no job is left and no batch is about to start.
  function settled(then) {
    var idle = function() { return root.runner.active === 0 && root.runner.waiting === 0 }
    root.h.waitFor(idle, 10000, function(ok) {
      root.h.check(ok, "every job has settled")
      root.h.after(100, function() {
        if (idle()) then()
        else root.settled(then)
      })
    })
  }

  // Seventy ids arrive while a batch runs: the last sixty wait, the first
  // ten are dropped.
  function queueCap() {
    var h = root.h
    h.equal([Const.LIMITS.thumbQueue, Const.LIMITS.thumbBatch, Const.LIMITS.thumbFiles], [60, 12, 200],
      "queue: the limits")
    h.scenario({ curl: "slow:400" })
    root.thumbs.want(root.tids(1, 12))
    h.waitFor(function() { return root.starts() === 1 }, 5000, function(started) {
      h.check(started, "queue: the first batch runs")
      h.scenario({ curl: "ok" })
      root.thumbs.want(root.tids(101, 30))
      root.thumbs.want(root.tids(131, 40))
      root.settled(function() {
        h.equal([root.size(), root.starts()], [72, 6], "queue: twelve and sixty arrived, in six batches")
        var map = root.thumbs.map
        h.equal([map[root.tid(101)], map[root.tid(110)], map[root.tid(111)], map[root.tid(170)]],
          [undefined, undefined, root.file(13), root.file(72)], "queue: the ten oldest gave way")
        h.check(h.log("curl")[1].stdin.indexOf(root.tid(111)) !== -1, "queue: the oldest kept goes first")
        root.listing(function(found) {
          h.equal(found, root.range(1, 72), "queue: a file for each that arrived, and no other")
          root.next()
        })
      })
    })
  }

  // Runs count batches of twelve new ids, starting at number from.
  function batches(from, count, then) {
    if (count === 0) { then(); return }
    var before = root.starts()
    root.thumbs.want(root.tids(from, Const.LIMITS.thumbBatch))
    var over = function() { return root.starts() === before + 1 && root.runner.active === 0 }
    root.h.waitFor(over, 8000, function() {
      root.batches(from + Const.LIMITS.thumbBatch, count - 1, then)
    })
  }

  // Eleven more batches: 192 files after ten of them, and the eleventh
  // goes over the limit.
  function fill() {
    var h = root.h
    var before = h.jobs().length
    var atEviction = null
    root.batches(201, 10, function() {
      root.settled(function() {
        h.equal([root.size(), root.sizes[root.sizes.length - 1]], [192, 192], "fill: 192 before the last")
        // Looked at from inside the publication of the smaller map.
        root.onShrink = function() {
          var map = root.thumbs.map
          atEviction = [root.size(), root.onDisk(1), root.onDisk(50), map[root.tid(1)], map[root.tid(148)],
            map[root.tid(149)], root.runner.active]
        }
        root.batches(321, 1, function() {
          root.settled(function() {
            root.onShrink = null
            h.equal(atEviction, [154, true, true, undefined, undefined, root.file(51), 0],
              "evict: the map is published without the fifty oldest while their files are still there")
            h.check(Math.max.apply(null, root.sizes) <= Const.LIMITS.thumbFiles, "evict: never over 200")
            h.equal(root.sizes.slice(-2), [192, 154], "evict: the batch and the eviction are one publication")
            var since = h.jobs().slice(before)
            var last = since[since.length - 1]
            var removals = since.filter(function(job) { return job.tag === "remove" })
            h.equal(removals.length, 1, "evict: one removal")
            h.equal([last.tag, last.command.slice(10)], ["remove", root.range(1, 50).map(root.file)],
              "evict: of the fifty oldest files, after the publication")
            root.listing(function(found) {
              h.equal(found, root.range(51, 204), "evict: 154 files are left")
              h.equal(root.thumbs.map[root.tid(332)], root.file(204), "evict: the newest is there")
              root.next()
            })
          })
        })
      })
    })
  }

  // An evicted thumbnail did not fail: it is fetched again when wanted.
  function evictedAgain() {
    var h = root.h
    var before = root.starts()
    root.thumbs.want([root.tid(1), root.tid(149)])
    root.settled(function() {
      h.equal([root.starts(), root.thumbs.map[root.tid(1)]], [before + 1, root.file(205)],
        "again: an evicted one is fetched anew, under a new counter")
      h.equal(root.thumbs.map[root.tid(149)], root.file(51), "again: one that is there is not")
      // One that cannot be fetched, to see below that purge() forgets that too.
      h.scenario({ curl: "404" })
      root.thumbs.want([root.tid(900)])
      h.waitFor(function() { return root.starts() === before + 2 }, 5000, function() {
        root.settled(function() {
          h.scenario({ curl: "ok" })
          root.next()
        })
      })
    })
  }

  function purged() {
    var h = root.h
    var before = h.jobs().length
    var atPublication = null
    h.equal(root.size(), 155, "purge: 155 thumbnails before")
    // Looked at from inside the publication of the empty map.
    root.onShrink = function() { atPublication = [root.size(), root.runner.active, root.onDisk(205)] }
    root.thumbs.purge()
    root.onShrink = null
    h.equal(atPublication, [0, 0, true], "purge: published empty at once, before anything is deleted")
    h.equal([root.size(), root.sizes[root.sizes.length - 1]], [0, 0], "purge: and it stays empty")
    h.check(Object.getPrototypeOf(root.thumbs.map) === null, "purge: and still has no prototype")
    h.check(root.onDisk(51) && root.onDisk(205), "purge: while the files are still there")
    root.settled(function() {
      h.equal(h.jobs().slice(before), [{ tag: "purge", command: [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
        h.tools.find, root.fs.paths.thumbsDir, "-mindepth", "1", "-maxdepth", "1", "-type", "f", "-delete"
      ] }], "purge: the folder is emptied as a whole")
      root.listing(function(found) {
        h.equal(found, [], "purge: and it is empty")
        root.next()
      })
    })
  }

  // After a purge everything can be asked for again, what failed included,
  // and the counter goes on from where it was.
  function afterPurge() {
    var h = root.h
    var before = root.starts()
    root.thumbs.want([root.tid(1), root.tid(900), root.tid(332)])
    root.settled(function() {
      var map = root.thumbs.map
      h.equal([root.starts(), map[root.tid(1)], map[root.tid(900)], map[root.tid(332)]],
        [before + 1, root.file(207), root.file(208), root.file(209)], "after purge: fetched anew")
      root.listing(function(found) {
        h.equal(found, [207, 208, 209], "after purge: no counter is used twice")
        root.next()
      })
    })
  }

  // A purge overtakes a curl that does not end when asked to and writes its
  // files only after the folder was emptied. No second curl starts while it
  // lives, and its files go as soon as it is gone.
  function purgedWhileFetching() {
    var h = root.h
    var before = root.starts()
    var began = Date.now()
    h.scenario({ curl: "stubborn:700" })
    root.thumbs.want([root.tid(901), root.tid(902)])
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "overtaken: the batch runs")
      h.scenario({ curl: "ok" })
      root.thumbs.purge()
      h.equal(root.size(), 0, "overtaken: the map is empty at once")
      root.thumbs.want([root.tid(903), root.tid(901)])
      h.waitFor(function() { return root.onDisk(210) && root.onDisk(211) }, 1900, function(wrote) {
        h.check(wrote && Date.now() - began >= 700, "overtaken: the old curl wrote on, long after the purge")
        root.listing(function(late) {
          h.equal(late, [210, 211], "overtaken: into the folder the purge had emptied")
          h.equal([root.starts(), root.size()], [before + 1, 0], "overtaken: no second curl runs beside it")
          h.waitFor(function() { return root.size() === 2 }, 8000, function(arrived) {
            h.check(arrived, "overtaken: what was asked for since arrives once the old curl is gone")
            root.settled(function() {
              var map = root.thumbs.map
              h.equal([map[root.tid(903)], map[root.tid(901)], map[root.tid(902)]],
                [root.file(212), root.file(213), undefined], "overtaken: under counters of their own")
              root.listing(function(found) {
                h.equal(found, [212, 213], "overtaken: the old curl's files are gone")
                // Nothing is known about what the old curl was fetching, so
                // that did not fail: it is fetched when asked for again.
                root.thumbs.want([root.tid(902)])
                h.waitFor(function() { return root.size() === 3 }, 5000, function(again) {
                  h.check(again, "overtaken: an id of the old batch can be asked for again")
                  root.settled(function() { root.next() })
                })
              })
            })
          })
        })
      })
    })
  }

  // The same when the runner had already given up on the batch for another
  // reason (it printed too much) and was waiting for it to end: what comes
  // back after the purge is still not taken for an answer.
  function purgedAfterOverflow() {
    var h = root.h
    var before = root.starts()
    h.scenario({ curl: "loud" })
    root.thumbs.want([root.tid(904)])
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "overflow: the batch runs")
      // Time for the runner to read what the stub printed.
      h.after(400, function() {
        h.equal(root.runner.active, 1, "overflow: the curl that prints too much is still there")
        h.scenario({ curl: "ok" })
        root.thumbs.purge()
        root.settled(function() {
          root.thumbs.want([root.tid(904)])
          h.waitFor(function() { return root.size() === 1 }, 5000, function(arrived) {
            h.check(arrived, "overflow: its id did not fail, and is fetched after the purge")
            root.settled(function() {
              root.listing(function(found) {
                h.equal(found, [216], "overflow: one file, under a new counter")
                root.next()
              })
            })
          })
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var commands = JSON.stringify(h.jobs())
    var log = h.readFile(h.runDir + "/out.txt")
    var ids = root.tids(1, 12).concat(root.tids(101, 70), root.tids(201, 132), root.tids(900, 5))
    var named = ids.filter(function(id) { return commands.indexOf(id) !== -1 || log.indexOf(id) !== -1 })
    h.equal([ids.length, named], [219, []], "quiet: no id is in any command or in the log")
    h.check(log.indexOf("ytimg") === -1 && log.indexOf("/thumbs/") === -1, "quiet: nor a transfer")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      root.next()
    })
  }
}
