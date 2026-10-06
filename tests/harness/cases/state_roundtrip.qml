pragma ComponentBehavior: Bound

import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Sh.js" as Sh

// core/StateStore.qml with the real shell and coreutils: nothing is written
// before the state was loaded, a change is saved once and a moment later,
// the file holds exactly the documented text, and a large file with titles
// in several scripts comes back unchanged however often it is read.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var store: null
  property var steps: []
  property int at: 0

  // The text of the large file, and the state it was written from.
  property string bigText: ""
  property string bigState: ""

  readonly property string emptyHistory: ",\"recents\":[],\"queue\":{\"items\":[],\"index\":-1}}\n"

  // A list as it arrives after it crossed a QML boundary: handed over as
  // an initial property it is no array any more.
  property Component holder: Component {
    QtObject {
      property var list: []
    }
  }

  // mpv and yt-dlp only have to be executable files for prepare to succeed.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.store = h.mount("core/StateStore.qml", { fs: root.fs, persistHistory: true })
    if (root.runner === null || root.fs === null || root.store === null) { h.finish(); return }
    root.steps = [
      root.beforePrepare, root.firstLoad, root.onePatch, root.debounce, root.changeDuringWrite,
      root.unknownKeys, root.listsFromQml, root.bigFile, root.readFiveTimes
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // How many jobs with this tag the runner has started so far.
  function started(tag) {
    return root.h.jobs().filter(function(job) { return job.tag === tag }).length
  }

  // Calls then(reached) once count writes were started and all are done.
  function whenWritten(count, then) {
    root.h.waitFor(function() {
      return root.started("write") >= count && root.runner.active === 0 && root.runner.waiting === 0
    }, 5000, then)
  }

  // then(listing): "<mode> <name>" for everything directly inside dir.
  function listing(dir, then) {
    var find = ["/usr/bin/find", dir, "-mindepth", "1", "-maxdepth", "1", "-printf", "%m %f\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  function fileText() {
    return root.h.readFile(root.fs.paths.stateFile)
  }

  // True while the store's save timer runs. The timer is found among the
  // store's children: when it runs is part of what is promised.
  function timerRuns() {
    var children = root.store.data
    for (var i = 0; i < children.length; i++) {
      if (typeof children[i].restart === "function" && children[i].interval === Const.TIMEOUTS.saveMs) {
        return children[i].running
      }
    }
    return null
  }

  function head(volume, muted) {
    return "{\"version\":1,\"volume\":" + volume + ",\"muted\":" + muted + ",\"proxyAck\":false,\"prefs\":{}"
  }

  function beforePrepare() {
    var h = root.h
    var store = root.store
    h.check(store.load() === false, "load is refused before the directories are prepared")
    h.check(store.patch({ volume: 5 }) === false, "so is a change")
    store.flushNow()
    h.equal([store.loaded, store.notice, store.values.volume], [false, "", 70],
      "nothing is loaded and the values are the defaults")
    h.after(200, function() {
      h.equal(h.jobs().length, 0, "no job was started")
      root.fs.prepared.connect(function(ok) {
        h.check(ok, "the directories are prepared")
        if (ok) root.next()
        else h.finish()
      })
      root.fs.prepare()
    })
  }

  function firstLoad() {
    var h = root.h
    var store = root.store
    h.check(root.fs.stateFilePresent === false, "there is no state file")
    h.check(store.load(), "load is accepted")
    h.equal([store.loaded, store.notice], [true, ""], "without a file the defaults stand at once")
    h.equal(store.values, {
      volume: 70, muted: false, proxyAck: false, prefs: {}, recents: [], queue: { items: [], index: -1 },
      video: {}, shortcuts: { panel: "", video: "", output: "", dirty: false }, outputDevice: ""
    }, "the complete default state")
    h.check(store.load() === false, "a second load is refused")
    h.after(1200, function() {
      h.equal([root.started("read"), root.started("write")], [0, 0], "loading reads and writes nothing")
      root.listing(root.fs.paths.stateDir, function(found) {
        h.equal(found, [], "and the state dir is still empty")
        root.next()
      })
    })
  }

  function onePatch() {
    var h = root.h
    var store = root.store
    var before = h.jobs().length
    var begun = Date.now()
    h.equal(root.timerRuns(), false, "before a change no timer runs")
    h.check(store.patch({ volume: 33, muted: true }), "a change is accepted")
    h.equal([store.values.volume, store.values.muted], [33, true], "and shows in the values at once")
    h.equal(root.timerRuns(), true, "the save timer runs")
    h.after(Const.TIMEOUTS.saveMs / 2, function() {
      h.equal(root.started("write"), 0, "half the wait later nothing is written yet")
      root.whenWritten(1, function(written) {
        h.check(written, "then it is saved")
        var waited = Date.now() - begun
        h.check(waited >= Const.TIMEOUTS.saveMs - 50 && waited < Const.TIMEOUTS.saveMs + 1500,
          "about the documented wait after the change")
        h.equal(root.fileText(), root.head(33, true) + root.emptyHistory, "the file holds exactly this text")
        var command = [
          h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
          h.tools.sh, "-c", Sh.PRIVATE_WRITE, "omajuke-write", root.fs.paths.stateFile
        ]
        h.equal(h.jobs().slice(before), [{ tag: "write", command: command }],
          "one job: the constant private write, with the state in no command line")
        root.listing(root.fs.paths.stateDir, function(found) {
          h.equal(found, ["600 state.json"], "one private file, and no temporary file left")
          h.equal(root.timerRuns(), false, "after the save no timer runs")
          h.after(Const.TIMEOUTS.saveMs + 400, function() {
            h.equal(root.started("write"), 1, "it is saved once, not again")
            root.next()
          })
        })
      })
    })
  }

  // Changes that follow each other closely are saved together, a moment
  // after the last one.
  function debounce() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    var early = 0
    var volume = 40
    var change = function() {
      if (root.started("write") !== writes) early++
      store.patch({ volume: volume })
      if (volume === 45) { finished(); return }
      volume++
      h.after(Const.TIMEOUTS.saveMs / 3, change)
    }
    var finished = function() {
      var last = Date.now()
      root.whenWritten(writes + 1, function(written) {
        h.check(written, "the changes are saved")
        h.equal(early, 0, "no save started while the changes kept coming")
        h.check(Date.now() - last >= Const.TIMEOUTS.saveMs - 50, "the save waited for the last change")
        h.equal(root.fileText(), root.head(45, true) + root.emptyHistory, "the file holds the last value")
        h.after(Const.TIMEOUTS.saveMs + 400, function() {
          h.equal(root.started("write"), writes + 1, "six changes, one save")
          root.next()
        })
      })
    }
    change()
  }

  // One save at a time: what changes while one runs is saved right after.
  function changeDuringWrite() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    var most = 0
    var watch = function() { most = Math.max(most, root.runner.active) }
    root.runner.activeChanged.connect(watch)
    store.patch({ volume: 50 })
    store.flushNow()
    store.patch({ volume: 51, muted: false })
    store.flushNow()
    store.flushNow()
    root.whenWritten(writes + 2, function(written) {
      h.check(written, "two saves ran")
      h.after(300, function() {
        root.runner.activeChanged.disconnect(watch)
        h.equal(root.started("write"), writes + 2, "exactly two, however often a save was asked for")
        h.equal(most, 1, "never two at the same time")
        h.equal(root.fileText(), root.head(51, false) + root.emptyHistory,
          "the file ends up as the newest state")
        h.after(Const.TIMEOUTS.saveMs + 400, function() {
          h.equal(root.started("write"), writes + 2, "and the wait that was running is over with it")
          root.next()
        })
      })
    })
  }

  function unknownKeys() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    var before = store.values
    var refused = [
      { nonsense: 1 }, { version: 9 }, { searchQuery: "private words", Volume: 5 }, {}, null, undefined,
      "volume", 5, [1, 2], { __proto__: { volume: 5 } }
    ]
    var answers = []
    for (var i = 0; i < refused.length; i++) answers.push(store.patch(refused[i]))
    h.equal(answers.filter(function(answer) { return answer !== false }), [],
      "a change that names no key of the state is refused")
    h.check(store.values === before, "and the values are not even replaced")
    h.check(store.patch({ volume: 250, nonsense: 1 }), "a known key next to an unknown one is taken")
    h.equal([store.values.volume, store.values.nonsense], [100, undefined], "validated, and without the rest")
    root.whenWritten(writes + 1, function() {
      h.equal(root.started("write"), writes + 1, "only the accepted change was saved")
      h.equal(root.fileText(), root.head(100, false) + root.emptyHistory, "as the validated value")
      root.next()
    })
  }

  // A list that came through a signal or a property map is no array, and
  // must still be saved.
  function listsFromQml() {
    var h = root.h
    var store = root.store
    var tracks = [
      { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false, key: 1 },
      { id: "BBBBBBBBBBB", title: "B title", channel: "", duration: null, live: true, key: 2, auto: true }
    ]
    var held = root.holder.createObject(root, { list: tracks })
    h.check(!Array.isArray(held.list) && held.list.length === 2, "a list from a property map is no array")
    h.check(store.patch({ recents: held.list, queue: { items: held.list, index: 1 } }), "it is accepted")
    h.equal(store.values.recents, [
      { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false },
      { id: "BBBBBBBBBBB", title: "B title", channel: "", duration: null, live: true }
    ], "and read as the tracks it holds")
    h.equal(store.values.queue, {
      items: [
        { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false,
          auto: false },
        { id: "BBBBBBBBBBB", title: "B title", channel: "", duration: null, live: true, auto: true }
      ],
      index: 1
    }, "queue items keep auto and lose their key")
    held.destroy()
    root.next()
  }

  // More than 64 KiB, so the read arrives in several chunks, with titles
  // in characters of two, three and four bytes.
  function bigFile() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    var scripts = [
      "\u041f\u0440\u0438\u0432\u0435\u0442, \u043c\u0438\u0440! \u042d\u0442\u043e "
        + "\u0434\u043b\u0438\u043d\u043d\u043e\u0435 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435",
      "\u4e16\u754c\u3053\u3093\u306b\u3061\u306f \u97f3\u697d\u306e\u30bf\u30a4\u30c8\u30eb "
        + "\ud55c\uad6d\uc5b4 \uc81c\ubaa9",
      "\ud83c\udfb5 \ud83d\ude00 caf\u00e9 na\u00efve \u00fcber \u2014 \u201cquoted\u201d \u2026"
    ]
    var recents = []
    var items = []
    for (var r = 0; r < Const.LIMITS.recents; r++) {
      recents.push({ id: "RRRRRRR" + String(10000 + r).slice(1), title: scripts[r % 3] + " " + r,
        channel: scripts[(r + 1) % 3], duration: 100 + r, live: false })
    }
    for (var q = 0; q < Const.LIMITS.queueItems; q++) {
      items.push({ id: "QQQQQQQ" + String(10000 + q).slice(1), title: scripts[q % 3] + " " + q,
        channel: scripts[(q + 2) % 3], duration: q % 7 === 0 ? null : 60 + q, live: false,
        auto: q % 2 === 1 })
    }
    h.check(store.patch({ recents: recents, queue: { items: items, index: 17 }, prefs: { preload: false } }),
      "a full history is accepted")
    h.equal([store.values.recents.length, store.values.queue.items.length], [30, 200], "all of it")
    h.equal(store.values.recents[1].title, scripts[1] + " 1", "titles are kept as they are")
    store.flushNow()
    root.whenWritten(writes + 1, function(written) {
      h.check(written, "it is saved")
      root.bigText = root.fileText()
      root.bigState = JSON.stringify(store.values)
      h.check(root.bigText.length > 65536 && root.bigText.length < Const.LIMITS.stateBytes,
        "the file is larger than one pipe buffer and below the read cap")
      h.check(/^[\x20-\x7e]*\n$/.test(root.bigText), "it is one line of printable ASCII")
      var cyrillic = root.bigText.indexOf("\\u041f\\u0440\\u0438") !== -1
      var emoji = root.bigText.indexOf("\\ud83c\\udfb5") !== -1
      h.check(cyrillic && emoji, "with every other character written as an escape")
      // The same question put to the bytes on disk, by another program.
      var count = ["/usr/bin/grep", "-c", "-a", "-P", "[^\\x0a\\x20-\\x7e]", root.fs.paths.stateFile]
      h.exec(count, null, function(code, out) {
        h.equal(out.trim(), "0", "no byte outside printable ASCII is on disk")
        h.exec(["/usr/bin/stat", "-c", "%a %s", root.fs.paths.stateFile], null, function(status, stat) {
          h.equal(stat.trim(), "600 " + root.bigText.length, "one byte per character, mode 600")
          root.next()
        })
      })
    })
  }

  // Each read is a new start: new file layer, new preparation, new store.
  function readFiveTimes() {
    var h = root.h
    var round = 0
    var writes = root.started("write")
    var once = function() {
      round++
      var label = "read " + round + ": "
      var fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
      var store = h.mount("core/StateStore.qml", { fs: fs, persistHistory: true })
      fs.prepared.connect(function(ok) {
        h.check(ok && fs.stateFilePresent, label + "the state file is found")
        var reads = root.started("read")
        h.check(store.load(), label + "load is accepted")
        // The file is being read: until that is done the store takes no
        // change and writes nothing, whatever it is asked.
        var answers = [store.loaded, store.patch({ volume: 1 }), store.load()]
        store.flushNow()
        store.persistHistory = false
        store.persistHistory = true
        h.equal(answers, [false, false, false], label + "nothing is taken while the file is being read")
        h.waitFor(function() { return store.loaded }, 5000, function(loaded) {
          h.check(loaded, label + "loaded")
          h.equal(store.notice, "", label + "nothing was reset")
          h.check(JSON.stringify(store.values) === root.bigState, label + "the state is identical")
          h.equal(root.started("read"), reads + 1, label + "one read")
          h.after(200, function() {
            h.equal(root.started("write"), writes, label + "nothing was written")
            h.check(root.fileText() === root.bigText, label + "the file is untouched")
            store.destroy()
            fs.destroy()
            if (round < 5) once()
            else root.next()
          })
        })
      })
      fs.prepare()
    }
    once()
  }
}
