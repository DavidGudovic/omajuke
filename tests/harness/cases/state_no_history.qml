pragma ComponentBehavior: Bound

import QtQuick
import "../../../core" as Core
import "../../../lib/Const.js" as Const

// core/StateStore.qml and the user's choice to keep no history: with
// persistHistory false the file holds no recents and no queue, switching it
// off takes them out of the file at once, switching it on writes nothing by
// itself, and a frozen store (the host has taken the facade away) writes
// nothing at all. If the rewrite that takes the history out fails, the file
// is removed instead of left behind.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var store: null
  property var steps: []
  property int at: 0

  // Words that are only in the file while history is.
  readonly property string title: "oj-played-title"
  readonly property string channel: "oj-played-channel"

  readonly property var history: ({
    recents: [
      { id: "AAAAAAAAAAA", title: "oj-played-title one", channel: "oj-played-channel", duration: 213,
        live: false },
      { id: "BBBBBBBBBBB", title: "oj-played-title two", channel: "oj-played-channel", duration: 100,
        live: false }
    ],
    queue: {
      items: [{ id: "CCCCCCCCCCC", title: "oj-played-title three", channel: "oj-played-channel", duration: 50,
        live: false, auto: true }],
      index: 0
    }
  })

  // The two stores wired to each other the way the service wires them:
  // history is kept while the settings are known and say so, the settings
  // read their mirror from the state, and a choice is stored there.
  property Component wiredStores: Component {
    Item {
      id: wired

      property var shell: null
      property var fs: null
      property string pluginId: ""
      property bool hadShell: false
      readonly property alias state: wiredState
      readonly property alias settings: wiredSettings

      onShellChanged: if (shell !== null) hadShell = true

      Core.StateStore {
        id: wiredState
        fs: wired.fs
        persistHistory: wiredSettings.known && wiredSettings.values.rememberHistory
        frozen: wired.hadShell && wired.shell === null
      }

      Core.SettingsStore {
        id: wiredSettings
        shell: wired.shell
        pluginId: wired.pluginId
        mirror: wiredState.loaded ? wiredState.values.prefs : null
        onExplicitChoice: function(key, value) {
          var prefs = {}
          for (var name in wiredState.values.prefs) prefs[name] = wiredState.values.prefs[name]
          prefs[key] = value
          wiredState.patch({ prefs: prefs })
        }
      }
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
    root.store = h.mount("core/StateStore.qml", { fs: root.fs })
    if (root.runner === null || root.fs === null || root.store === null) { h.finish(); return }
    root.steps = [
      root.offFromTheStart, root.switchedOn, root.switchedOff, root.offDuringWrite, root.frozen,
      root.thawed, root.afterDestruction, root.failedWithHistory, root.failedWithout, root.wiredTogether,
      root.quietLog
    ]
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (ok && root.store.load()) root.next()
      else h.finish()
    })
    root.fs.prepare()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // How many jobs with this tag the runner has started so far.
  function started(tag) {
    return root.h.jobs().filter(function(job) { return job.tag === tag }).length
  }

  function idle() {
    return root.runner.active === 0 && root.runner.waiting === 0
  }

  // Calls then(reached) once count writes were started and all are done.
  function whenWritten(count, then) {
    root.h.waitFor(function() { return root.started("write") >= count && root.idle() }, 5000, then)
  }

  function fileText() {
    return root.h.readFile(root.fs.paths.stateFile)
  }

  // The top-level keys of the file, or a word when it is not a state file.
  function fileKeys() {
    var text = root.fileText()
    if (text === "") return "no file"
    try {
      return Object.keys(JSON.parse(text))
    } catch (error) {
      return "unreadable"
    }
  }

  // True when nothing in the file tells what was played.
  function clean() {
    var text = root.fileText()
    var words = [root.title, root.channel, "recents", "queue", "AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC"]
    for (var i = 0; i < words.length; i++) {
      if (text.indexOf(words[i]) !== -1) return false
    }
    return true
  }

  // then(identity): inode, size and time of the state file. A save replaces
  // the file, so the same identity means it was not written.
  function identity(then) {
    root.h.exec(["/usr/bin/stat", "-c", "%i %s %y", root.fs.paths.stateFile], null, function(code, out) {
      then(code === 0 ? out.trim() : "no file")
    })
  }

  // The store's save timer, found among its children: whether it runs is
  // part of what is promised, and the store does not tell.
  function saveTimer() {
    var children = root.store.data
    for (var i = 0; i < children.length; i++) {
      if (typeof children[i].restart === "function" && children[i].interval === Const.TIMEOUTS.saveMs) {
        return children[i]
      }
    }
    return null
  }

  function toolsWith(changes) {
    var tools = {}
    for (var name in root.h.tools) tools[name] = root.h.tools[name]
    for (var changed in changes) tools[changed] = changes[changed]
    return tools
  }

  readonly property var basics: ["version", "volume", "muted", "proxyAck", "prefs"]
  readonly property var withHistory: ["version", "volume", "muted", "proxyAck", "prefs", "recents", "queue"]

  function offFromTheStart() {
    var h = root.h
    var store = root.store
    h.check(store.persistHistory === false, "history is off unless the service says otherwise")
    h.check(store.patch({ volume: 20, recents: root.history.recents, queue: root.history.queue }),
      "tracks are played with history off")
    h.equal([store.values.recents.length, store.values.queue.items.length], [2, 1],
      "the lists live on in memory for the session")
    root.whenWritten(1, function(written) {
      h.check(written, "the state is saved")
      h.equal(root.fileKeys(), root.basics, "the file has no recents and no queue key")
      h.check(root.clean(), "and nothing in it tells what was played")
      h.equal(JSON.parse(root.fileText()).volume, 20, "the rest is saved as usual")
      root.next()
    })
  }

  function switchedOn() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    root.identity(function(before) {
      store.persistHistory = true
      h.after(Const.TIMEOUTS.saveMs + 400, function() {
        h.equal(root.started("write"), writes, "switching history on writes nothing by itself")
        root.identity(function(after) {
          h.equal(after, before, "the file is the same file")
          h.check(root.clean(), "still without history")
          store.patch({ volume: 21 })
          root.whenWritten(writes + 1, function() {
            h.equal(root.fileKeys(), root.withHistory, "the next change saves the lists too")
            h.check(!root.clean() && root.fileText().indexOf(root.title + " three") !== -1,
              "now the titles are in the file")
            root.next()
          })
        })
      })
    })
  }

  function switchedOff() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    var begun = Date.now()
    store.persistHistory = false
    root.whenWritten(writes + 1, function(written) {
      var took = Date.now() - begun
      h.check(written, "switching history off rewrites the file")
      h.check(took < Const.TIMEOUTS.saveMs - 150, "at once, not after the usual wait")
      h.equal(root.fileKeys(), root.basics, "without recents and queue")
      h.check(root.clean(), "and without a trace of what was played")
      h.equal(store.values.recents.length, 2, "the lists in memory are untouched")
      h.after(Const.TIMEOUTS.saveMs + 400, function() {
        h.equal(root.started("write"), writes + 1, "one rewrite")
        root.next()
      })
    })
  }

  // The switch is thrown while a save with history is on its way to disk.
  function offDuringWrite() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    store.persistHistory = true
    store.patch({ volume: 22 })
    store.flushNow()
    store.persistHistory = false
    root.whenWritten(writes + 2, function(written) {
      h.check(written, "the save that was running is followed by another")
      h.after(200, function() {
        h.equal(root.started("write"), writes + 2, "two saves")
        h.equal(root.fileKeys(), root.basics, "the file ends up without history")
        h.check(root.clean() && JSON.parse(root.fileText()).volume === 22, "and with the change")
        root.next()
      })
    })
  }

  // The host has taken the facade away: the settings can no longer be
  // trusted, and nothing more is written.
  function frozen() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    root.identity(function(before) {
      // A change is waiting for its save when the facade goes.
      var timer = root.saveTimer()
      h.check(timer !== null && timer.running === false, "between saves the save timer does not run")
      store.patch({ volume: 23 })
      h.check(timer !== null && timer.running === true, "a change starts it")
      store.frozen = true
      h.check(timer !== null && timer.running === false, "frozen: the timer is stopped")
      // What a vanished facade must never cause: history believed to be
      // on, new plays, and every way of asking for a save.
      store.persistHistory = true
      h.check(store.patch({ volume: 24, recents: root.history.recents }),
        "a frozen store still takes changes")
      h.check(timer !== null && timer.running === false, "frozen: a change does not start the timer")
      store.flushNow()
      store.persistHistory = false
      store.persistHistory = true
      store.flushNow()
      h.equal(store.values.volume, 24, "in memory")
      h.after(Const.TIMEOUTS.saveMs + 500, function() {
        h.equal(root.started("write"), writes, "frozen: no save was started, and the pending one was dropped")
        root.identity(function(after) {
          h.equal(after, before, "frozen: the file is the same file")
          h.check(root.clean() && JSON.parse(root.fileText()).volume === 22, "frozen: with its old content")
          root.next()
        })
      })
    })
  }

  // The host hands the kept service a facade again.
  function thawed() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    store.persistHistory = false
    store.frozen = false
    h.after(Const.TIMEOUTS.saveMs + 400, function() {
      h.equal(root.started("write"), writes, "thawing writes nothing by itself")
      h.check(store.patch({ muted: true }), "the next change")
      root.whenWritten(writes + 1, function() {
        var saved = JSON.parse(root.fileText())
        h.equal([saved.volume, saved.muted], [24, true], "is saved as usual, with what changed meanwhile")
        h.check(root.clean(), "and without history")
        root.next()
      })
    })
  }

  // Nothing is written when the store is destroyed, pending change or not.
  function afterDestruction() {
    var h = root.h
    var writes = root.started("write")
    var doomed = h.mount("core/StateStore.qml", { fs: root.fs, persistHistory: true })
    h.check(doomed.load() && doomed.loaded, "a second store on the same file layer")
    doomed.patch({ volume: 99, recents: root.history.recents })
    doomed.destroy()
    h.after(Const.TIMEOUTS.saveMs + 500, function() {
      h.equal(root.started("write"), writes, "a destroyed store writes nothing")
      h.check(root.clean() && JSON.parse(root.fileText()).volume === 24, "the file is as it was")
      root.next()
    })
  }

  // A save that fails while history is on leaves the file alone.
  function failedWithHistory() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    store.persistHistory = true
    store.patch({ volume: 30 })
    store.flushNow()
    root.whenWritten(writes + 1, function() {
      h.equal(root.fileKeys(), root.withHistory, "history is on and in the file")
      var text = root.fileText()
      // The shell that does the private write is replaced by a program
      // that fails.
      root.fs.tools = root.toolsWith({ sh: h.repo + "/tests/stubs/probe.js" })
      store.patch({ volume: 31 })
      store.flushNow()
      root.whenWritten(writes + 2, function() {
        h.after(300, function() {
          h.equal([root.started("write"), root.started("remove")], [writes + 2, 0],
            "a failed save with history on: nothing is removed, nothing is tried again")
          h.check(root.fileText() === text, "the file is as it was")
          root.next()
        })
      })
    })
  }

  // The save that was to take the history out fails: the file goes.
  function failedWithout() {
    var h = root.h
    var store = root.store
    var writes = root.started("write")
    h.check(!root.clean(), "the file on disk holds history")
    store.persistHistory = false
    h.waitFor(function() { return root.started("remove") >= 1 && root.idle() }, 5000, function(removed) {
      h.check(removed, "the rewrite failed, and the file is removed instead")
      h.equal([root.started("write"), root.started("remove")], [writes + 1, 1], "one attempt, one removal")
      h.exec(["/usr/bin/ls", "-A", root.fs.paths.stateDir], null, function(code, out) {
        h.equal(out, "", "nothing is left in the state dir")
        h.equal([store.values.volume, store.values.recents.length], [31, 2], "the state lives on in memory")
        // With a working shell again, the next change brings the file back.
        root.fs.tools = h.tools
        store.patch({ volume: 32 })
        root.whenWritten(writes + 2, function() {
          h.equal(root.fileKeys(), root.basics, "the next save writes the file again, without history")
          h.check(root.clean() && JSON.parse(root.fileText()).volume === 32, "and with the state of now")
          h.equal(root.started("remove"), 1, "nothing more is removed")
          root.next()
        })
      })
    })
  }

  // Both stores together, from the user's opt-out to the host taking the
  // facade away: the first rewrite of the file already has no history and
  // carries the choice, and nothing is written once the facade is gone.
  function wiredTogether() {
    var h = root.h
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [{ id: h.manifest.id }] } }
    var fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    var pair = root.wiredStores.createObject(root, { pluginId: h.manifest.id })
    pair.fs = fs
    h.check(!pair.state.persistHistory, "wired: nothing is kept before the settings are known")
    fs.prepared.connect(function(ok) {
      h.check(ok && pair.state.load(), "wired: the state is loaded")
      h.waitFor(function() { return pair.state.loaded }, 5000, function() {
        h.check(!pair.settings.known && !pair.state.persistHistory,
          "wired: still not known without the facade")
        pair.shell = h.shell
        h.check(pair.settings.known && pair.state.persistHistory,
          "wired: known, and history is on by default")
        var writes = root.started("write")
        pair.state.patch({ recents: root.history.recents, queue: root.history.queue })
        pair.state.flushNow()
        root.whenWritten(writes + 1, function() {
          h.check(!root.clean(), "wired: what was played is in the file")
          // The user switches history off in the panel.
          h.check(pair.settings.set("rememberHistory", false), "wired: the user opts out")
          h.equal([pair.state.persistHistory, pair.state.values.prefs.rememberHistory], [false, false],
            "wired: history is off and the choice is in the state before set() returns")
          root.whenWritten(writes + 2, function() {
            h.check(root.clean(), "wired: the first rewrite has no history")
            h.equal(JSON.parse(root.fileText()).prefs, { rememberHistory: false },
              "wired: and already carries the choice, so it survives the entry being deleted")
            h.equal(h.shell.barConfig.layout.right[0].rememberHistory, false, "wired: the entry has it too")
            root.identity(function(before) {
              // Disable: the host takes the facade away, then destroys.
              pair.shell = null
              h.equal([pair.state.frozen, pair.settings.values.rememberHistory, pair.state.persistHistory],
                [true, false, false], "wired: without the facade the opt-out holds and the state is frozen")
              pair.state.patch({ recents: root.history.recents, volume: 77 })
              pair.state.flushNow()
              h.after(Const.TIMEOUTS.saveMs + 500, function() {
                h.equal(root.started("write"), writes + 2, "wired: nothing is written after the facade went")
                root.identity(function(after) {
                  h.equal(after, before, "wired: the file is the same file")
                  pair.destroy()
                  fs.destroy()
                  h.after(300, function() {
                    h.equal(root.started("write"), writes + 2, "wired: nor when the stores are destroyed")
                    h.check(root.clean(), "wired: the file ends without history")
                    root.next()
                  })
                })
              })
            })
          })
        })
      })
    })
    fs.prepare()
  }

  function quietLog() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var warning = "omajuke: the state file could not be written"
    h.equal(log.split(warning).length - 1, 1, "failed saves are reported once, by a constant line")
    h.check(log.indexOf(root.title) === -1 && log.indexOf(root.channel) === -1,
      "nothing played is in the log")
    h.check(log.indexOf("StateStore") === -1 && log.indexOf("Error") === -1, "the store logged no error")
    h.check(log.indexOf("Binding loop") === -1, "no binding loop was reported")
    root.next()
  }
}
