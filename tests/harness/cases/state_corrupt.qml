import QtQuick
import "../../../lib/Const.js" as Const

// core/StateStore.qml against a state file that cannot be used: garbage, a
// wrong version, text that is not ASCII, a file that is too large or gone.
// Each time the store starts from the defaults, says so once, and replaces
// the file at once. No copy of the old file is kept anywhere: it would
// normally hold the whole history. A file that is not ours to read (a link)
// is not read at all.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var steps: []
  property int at: 0

  // A word that stands in every seeded file, to look for afterwards.
  readonly property string marker: "oj-marker-history"

  readonly property string fresh: "{\"version\":1,\"volume\":70,\"muted\":false,\"proxyAck\":false,"
    + "\"prefs\":{},\"recents\":[],\"queue\":{\"items\":[],\"index\":-1}}\n"

  readonly property var defaults: ({
    volume: 70, muted: false, proxyAck: false, prefs: {}, recents: [], queue: { items: [], index: -1 },
    video: {}, shortcuts: { panel: "", video: "", output: "", dirty: false }, outputDevice: ""
  })

  // mpv and yt-dlp only have to be executable files for prepare to succeed.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    if (root.runner === null) { h.finish(); return }
    root.steps = [
      root.unusableFiles, root.goodFile, root.atTheCap, root.goneBeforeRead, root.linkedFile,
      root.frozenReset, root.quietLog
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function stateDir() {
    return root.h.runDir + "/sbx/state/" + Const.DIR_NAME
  }

  function stateFile() {
    return root.stateDir() + "/state.json"
  }

  // A state file with history in it, as a version of the plugin wrote it.
  function good(version, title) {
    return JSON.stringify({
      version: version, volume: 42, muted: true, proxyAck: true, prefs: { rememberHistory: true },
      recents: [{ id: "AAAAAAAAAAA", title: title, channel: root.marker, duration: 213, live: false }],
      queue: { items: [{ id: "BBBBBBBBBBB", title: title, channel: "c", duration: 100, live: false,
        auto: false }], index: 0 }
    }) + "\n"
  }

  // text padded with spaces to exactly length characters.
  function padded(text, length) {
    return text + new Array(length - text.length + 1).join(" ")
  }

  // The tags of the jobs started since the count was taken.
  function tagsSince(count) {
    return root.h.jobs().slice(count).map(function(job) { return job.tag })
  }

  // then(lines): the output of a program, split into lines.
  function lines(argv, then) {
    root.h.exec(argv, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }))
    })
  }

  // Puts text where the state file belongs (null leaves what is there),
  // then mounts a file layer and a store, prepares, and calls
  // then(fs, store, jobsBefore).
  function start(text, props, then) {
    var h = root.h
    // The harness cannot write an empty file; truncate makes one.
    var seed = text === "" ? ["/usr/bin/truncate", "-s", "0", root.stateFile()] : ["/usr/bin/true"]
    var make = "/usr/bin/mkdir -p -- \"$1\" && shift && exec \"$@\""
    h.exec(["/usr/bin/sh", "-c", make, "seed", root.stateDir()].concat(seed), null, function() {
      if (text !== null && text !== "") h.writeFile(root.stateFile(), text)
      var before = h.jobs().length
      var fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
      var store = h.mount("core/StateStore.qml", props)
      store.fs = fs
      fs.prepared.connect(function(ok) {
        h.check(ok, "the directories are prepared")
        then(fs, store, before)
      })
      fs.prepare()
    })
  }

  // Calls then() once count jobs were started since the count before was
  // taken and all of them are done (or after five seconds).
  function whenSettled(before, count, then) {
    root.h.waitFor(function() {
      return root.tagsSince(before).length >= count && root.runner.active === 0 && root.runner.waiting === 0
    }, 5000, function() { then() })
  }

  // Everything below the state dir as "<mode> <type> <name>", and the
  // files anywhere in the sandbox that still hold the marker.
  function inspect(then) {
    var find = ["/usr/bin/find", root.stateDir(), "-mindepth", "1", "-printf", "%m %y %P\n"]
    root.lines(find, function(found) {
      var grep = ["/usr/bin/grep", "-r", "-l", "-a", "--", root.marker, root.h.runDir + "/sbx",
        root.h.runDir + "/" + Const.DIR_NAME]
      root.lines(grep, function(holding) { then(found.sort(), holding) })
    })
  }

  // One unusable file after the other, each on a store of its own.
  function unusableFiles() {
    var h = root.h
    var files = [
      ["garbage", "this is not a state file {{{ " + root.marker + "\n"],
      ["half a file", root.good(1, root.marker).slice(0, 150)],
      ["an empty file", ""],
      ["a list", "[\"" + root.marker + "\"]\n"],
      ["a newer version", root.good(2, root.marker)],
      ["a version spelled as text", root.good("1", root.marker)],
      ["no version", JSON.stringify({ volume: 42, recents: [], note: root.marker })],
      ["a title that is not ASCII",
        root.good(1, "\u043f\u0440\u0438\u0432\u0435\u0442 \u4e16\u754c " + root.marker)],
      ["a damaged read", root.good(1, "bro\ufffdken " + root.marker)],
      ["a carriage return", root.good(1, root.marker).replace("\n", "\r\n")],
      ["one byte over the cap", root.padded(root.good(1, root.marker), Const.LIMITS.stateBytes + 1)],
      ["twice the cap", root.padded(root.good(1, root.marker), 2 * Const.LIMITS.stateBytes)]
    ]
    var index = 0
    // The stores stay alive to the end: one that came back to its file by
    // itself, in a retry or a loop, would be seen then.
    var kept = []
    var one = function() {
      if (index >= files.length) { last(); return }
      var label = files[index][0] + ": "
      var text = files[index][1]
      index++
      root.start(text, { persistHistory: true }, function(fs, store, before) {
        kept.push(store, fs)
        h.check(fs.stateFilePresent, label + "the file is found")
        h.check(store.load(), label + "load is accepted")
        h.waitFor(function() { return store.loaded }, 5000, function(loaded) {
          h.check(loaded, label + "loaded")
          h.equal(store.values, root.defaults, label + "the defaults are in memory")
          h.equal(store.notice, "N_STATE_RESET", label + "the reset is announced")
          root.whenSettled(before, 3, function() {
            h.equal(root.tagsSince(before), ["prepare", "read", "write"],
              label + "one read and one write, nothing else")
            h.equal(h.jobs()[before + 1].command.slice(-5),
              [h.tools.head, "-c", String(Const.LIMITS.stateBytes + 1), "--", root.stateFile()],
              label + "the read is capped at the largest state file")
            h.check(h.readFile(root.stateFile()) === root.fresh, label + "the file was replaced at once")
            root.inspect(function(found, holding) {
              h.equal(found, ["600 f state.json"], label + "the state dir holds exactly the new file")
              h.equal(holding, [], label + "no copy of the old content is kept anywhere")
              one()
            })
          })
        })
      })
    }
    var last = function() {
      var jobs = h.jobs().length
      h.after(Const.TIMEOUTS.saveMs + 400, function() {
        h.equal(h.jobs().length, jobs, "after a reset nothing follows: no second attempt, no loop")
        for (var i = 0; i < kept.length; i++) kept[i].destroy()
        root.next()
      })
    }
    one()
  }

  // The file the last reset wrote is good: it loads without a word.
  function goodFile() {
    var h = root.h
    root.start(null, { persistHistory: true }, function(fs, store, before) {
      h.check(store.load(), "a good file: load is accepted")
      h.waitFor(function() { return store.loaded }, 5000, function() {
        h.equal([store.notice, store.values.volume], ["", 70], "a good file: nothing is reset")
        store.destroy()
        fs.destroy()
        var text = root.good(1, "A title")
        root.start(text, { persistHistory: true }, function(fs2, store2, before2) {
          store2.load()
          h.waitFor(function() { return store2.loaded }, 5000, function() {
            h.equal(store2.notice, "", "a file with history: nothing is reset")
            var read = store2.values
            h.equal([read.volume, read.muted, read.proxyAck, read.prefs.rememberHistory, read.recents.length,
              read.recents[0].title, read.queue.items.length, read.queue.index],
              [42, true, true, true, 1, "A title", 1, 0], "its content is in memory")
            h.after(Const.TIMEOUTS.saveMs + 300, function() {
              h.equal(root.tagsSince(before2), ["prepare", "read"], "and reading it writes nothing")
              h.check(h.readFile(root.stateFile()) === text, "the file is untouched")
              store2.destroy()
              fs2.destroy()
              root.next()
            })
          })
        })
      })
    })
  }

  // A file of exactly the largest size is still read.
  function atTheCap() {
    var h = root.h
    var text = root.padded(root.good(1, "A title"), Const.LIMITS.stateBytes)
    root.start(text, { persistHistory: true }, function(fs, store, before) {
      store.load()
      h.waitFor(function() { return store.loaded }, 5000, function() {
        h.equal([store.notice, store.values.volume, store.values.recents.length], ["", 42, 1],
          "a file of exactly the cap is read")
        store.destroy()
        fs.destroy()
        root.next()
      })
    })
  }

  // The file was there when the directories were prepared and is gone when
  // it is read.
  function goneBeforeRead() {
    var h = root.h
    root.start(root.good(1, root.marker), { persistHistory: true }, function(fs, store, before) {
      h.exec(["/usr/bin/rm", "--", root.stateFile()], null, function() {
        store.load()
        h.waitFor(function() { return store.loaded }, 5000, function() {
          h.equal([store.notice, store.values.volume], ["N_STATE_RESET", 70], "an unreadable file: reset")
          root.whenSettled(before, 3, function() {
            h.check(h.readFile(root.stateFile()) === root.fresh, "an unreadable file: a fresh one is written")
            store.destroy()
            fs.destroy()
            root.next()
          })
        })
      })
    })
  }

  // A link where the state file belongs is not ours: it is not read, and
  // the first save replaces the link, not what it points to.
  function linkedFile() {
    var h = root.h
    var target = h.runDir + "/sbx/elsewhere.json"
    var secret = root.good(1, root.marker)
    h.writeFile(target, secret)
    var plant = "/usr/bin/mkdir -p \"$1\" && /usr/bin/rm -f \"$1/state.json\""
      + " && /usr/bin/ln -s \"$2\" \"$1/state.json\""
    h.exec(["/usr/bin/sh", "-c", plant, "plant", root.stateDir(), target], null, function(code) {
      h.equal(code, 0, "a link is planted where the state file belongs")
      root.start(null, { persistHistory: true }, function(fs, store, before) {
        h.check(fs.stateFilePresent === false, "a link: not reported as our state file")
        h.check(store.load(), "a link: load is accepted")
        h.equal([store.loaded, store.notice, store.values.volume, store.values.recents.length],
          [true, "", 70, 0], "a link: the defaults stand, and nothing is announced")
        h.check(store.patch({ volume: 9 }), "a link: a change")
        store.flushNow()
        root.whenSettled(before, 2, function() {
          h.equal(root.tagsSince(before), ["prepare", "write"], "a link: it was never read")
          root.lines(["/usr/bin/stat", "-c", "%F %a", root.stateFile()], function(kind) {
            h.equal(kind, ["regular file 600"], "a link: the save put a private file in its place")
            h.check(h.readFile(target) === secret, "a link: what it pointed to is untouched")
            h.exec(["/usr/bin/rm", "-f", "--", target], null, function() {
              store.destroy()
              fs.destroy()
              root.next()
            })
          })
        })
      })
    })
  }

  // While the facade is gone nothing is written, not even the reset.
  function frozenReset() {
    var h = root.h
    var text = "garbage " + root.marker + "\n"
    root.start(text, { persistHistory: true, frozen: true }, function(fs, store, before) {
      store.load()
      h.waitFor(function() { return store.loaded }, 5000, function() {
        h.equal([store.notice, store.values.volume], ["N_STATE_RESET", 70],
          "frozen: the reset happens in memory")
        h.after(Const.TIMEOUTS.saveMs + 300, function() {
          h.equal(root.tagsSince(before), ["prepare", "read"], "frozen: nothing is written")
          h.check(h.readFile(root.stateFile()) === text, "frozen: the file is as it was")
          store.destroy()
          fs.destroy()
          root.next()
        })
      })
    })
  }

  function quietLog() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.length > 0, "the log can be read")
    h.check(log.indexOf(root.marker) === -1, "nothing of a state file was logged")
    h.check(log.indexOf("StateStore") === -1 && log.indexOf("Error") === -1, "the store logged no error")
    root.next()
  }
}
