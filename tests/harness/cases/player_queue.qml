import QtQuick
import "../../../lib/Paths.js" as Paths

// core/Player.qml and mpv's playlist, against the mpv stub. The queue keeps
// the neighbours of the current track in mpv's playlist, names them by
// track key, and trusts the player to turn a key into the right position.
// This case holds the player to that: entryKeys follows every load, removal
// and stop at once, a second command made before mpv has reported the first
// still hits the entry it names, a key mpv does not hold sends nothing, and
// what mpv or another program does to the playlist by itself is followed.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var player: null
  property var signals: []
  property var steps: []
  property int at: 0

  // yt-dlp only has to be an executable file here: the player hands its
  // path to mpv and never runs it.
  function setup(h, done) {
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ mpv: "ok" })
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.player = h.mount("core/Player.qml", { tools: h.tools, fs: root.fs })
    if (root.runner === null || root.fs === null || root.player === null) { h.finish(); return }
    root.listen()
    root.steps = [
      root.whileStarting, root.window, root.removes, root.twoInARow, root.unknownKeys, root.playsHeld,
      root.removesPlaying, root.advances, root.foreignRemoval, root.foreignFile, root.stopForgets,
      root.takenBackBeforeStart, root.asksWhenInDoubt, root.shutdownForgets
    ]
    root.fs.prepare()
    h.waitFor(function() { return root.fs.status !== "pending" }, 5000, function() {
      h.equal(root.fs.status, "ready", "the runtime folder is prepared")
      root.next()
    })
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function listen() {
    var player = root.player
    player.loading.connect(function(key) { root.signals.push("loading " + key) })
    player.started.connect(function(key) { root.signals.push("started " + key) })
    player.ended.connect(function(key, reason, fileError) {
      root.signals.push(("ended " + key + " " + reason + " " + fileError).trim())
    })
    player.idle.connect(function() { root.signals.push("idle") })
    player.exited.connect(function(crashed) { root.signals.push("exited " + crashed) })
    player.failed.connect(function(code) { root.signals.push("failed " + code) })
  }

  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function plays(key) {
    return function() { return root.player.currentKey === key && root.player.phase === "playing" }
  }

  function load(key, mode, index) {
    root.player.load(key, "AAAAAAAAAAA", "Track " + key, Paths.infoFile(root.fs.paths, key),
      { mode: mode, index: index })
  }

  // What mpv was told, without the questions about the position.
  function sent() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return !(command[0] === "get_property" && command[1] === "time-pos")
    })
  }

  // The same since a mark, each command as short text: its name and its
  // first argument, and for a load the title instead of the address.
  function since(mark) {
    return root.sent().slice(mark).map(function(command) {
      if (command[0] === "loadfile") return "load " + command[4]["force-media-title"] + " " + command[2]
      return command.slice(0, 2).join(" ")
    })
  }

  function holds(keys) {
    return keys.map(function(key) { return root.player.holds(key) })
  }

  // True once mpv has answered everything and the list is what it reports.
  function settled(keys) {
    return function() {
      return root.player._unsettled === 0 && JSON.stringify(root.player.entryKeys) === JSON.stringify(keys)
    }
  }

  // Loads made while no mpv runs: the list shows them from the call on.
  function whileStarting() {
    var h = root.h
    h.equal([root.player.entryKeys, root.player.holds(1)], [[], false], "before anything: nothing is held")
    root.load(1, "replace")
    h.equal([root.player.mpvState, root.player.entryKeys, root.player.holds(1)], ["starting", [1], true],
      "a load is held from the call on, before mpv is up")
    h.check(Array.isArray(root.player.entryKeys), "the list is a plain array")
    root.until("the first track plays", root.plays(1), 8000, function() {
      h.equal(root.signals, ["idle", "loading 1", "started 1"], "a cold start")
      root.until("mpv has told its playlist", root.settled([1]), 2000, function() {
        h.check(root.sent().every(function(command) { return command[0] !== "get_property" }),
          "mpv reported its playlist by itself: it was not asked")
        root.next()
      })
    })
  }

  // The window around the current track: one neighbour behind it, one in
  // front of it.
  function window() {
    var h = root.h
    var mark = root.sent().length
    root.signals = []
    root.load(2, "append-play")
    root.load(3, "insert-at", 0)
    h.equal(root.player.entryKeys, [3, 1, 2], "appended and inserted: in mpv's order, at once")
    h.equal(root.holds([1, 2, 3, 4]), [true, true, true, false], "holds follows the list")
    root.until("mpv has taken both", root.settled([3, 1, 2]), 3000, function() {
      h.equal(root.since(mark), ["load Track 2 append-play", "load Track 3 insert-at"], "two loads were sent")
      h.equal(root.sent()[mark + 1][3], 0, "the inserted one with its position")
      h.equal([root.signals, root.player.currentKey], [[], 1], "the track that plays is not disturbed")
      root.next()
    })
  }

  function removes() {
    var h = root.h
    var mark = root.sent().length
    root.player.removeKey(3)
    h.equal([root.player.entryKeys, root.player.holds(3)], [[1, 2], false], "removed: gone from the list")
    root.until("mpv has removed it", root.settled([1, 2]), 3000, function() {
      h.equal(root.since(mark), ["playlist-remove 0"], "by its position in mpv's playlist")
      h.equal([root.signals, root.player.currentKey], [[], 1], "the track that plays is not disturbed")
      root.next()
    })
  }

  // Two removals back to back, before mpv has reported the first. With a
  // list that only follows mpv's reports the second position would be one
  // off, and at the front of the playlist it would cut the playing track.
  function twoInARow() {
    var h = root.h
    root.load(4, "append-play")
    root.load(5, "insert-at", 0)
    root.until("the window is [5, 1, 2, 4]", root.settled([5, 1, 2, 4]), 3000, function() {
      var mark = root.sent().length
      root.player.removeKey(5)
      root.player.removeKey(2)
      root.player.removeKey(4)
      h.equal(root.player.entryKeys, [1], "three removals in a row: the list follows each")
      root.until("mpv has removed all three", root.settled([1]), 3000, function() {
        h.equal(root.since(mark), ["playlist-remove 0", "playlist-remove 1", "playlist-remove 1"],
          "each position is that of the playlist the removals before it left")
        h.equal([root.signals, root.player.currentKey, root.player.phase], [[], 1, "playing"],
          "and the track that plays was never touched")
        root.next()
      })
    })
  }

  function unknownKeys() {
    var h = root.h
    var mark = root.sent().length
    var odd = [0, -1, 2, 99, 1.5, "1", null, undefined]
    for (var i = 0; i < odd.length; i++) {
      root.player.removeKey(odd[i])
    }
    h.equal(root.holds(odd), [false, false, false, false, false, false, false, false], "none of them is held")
    h.after(200, function() {
      h.equal(root.since(mark), [], "a key mpv does not hold sends nothing")
      h.equal(root.player.entryKeys, [1], "and changes nothing")
      root.next()
    })
  }

  function playsHeld() {
    var h = root.h
    root.load(6, "append-play")
    root.until("the neighbour is held", root.settled([1, 6]), 3000, function() {
      var mark = root.sent().length
      root.signals = []
      // A media key, or another program: mpv is told to jump to an entry
      // it holds. The player has no such command of its own.
      h.inject("mpv", ["playlist-play-index", 1])
      root.until("the held track plays", root.plays(6), 5000, function() {
        h.equal(root.signals.filter(function(signal) { return signal === "idle" }), [],
          "a step to a held track made from outside: no idle on the way")
        h.equal(root.signals.slice(-2), ["loading 6", "started 6"], "the player follows it")
        h.equal(root.since(mark), [], "and sends nothing for it")
        h.equal([root.player.entryKeys, root.holds([1, 6])], [[1, 6], [true, true]],
          "mpv keeps the track it left: it can be started again")
        root.next()
      })
    })
  }

  // Removing the entry that plays ends it without a word; mpv goes on to
  // what is behind it, and here there is nothing.
  function removesPlaying() {
    var h = root.h
    root.signals = []
    root.player.removeKey(6)
    h.equal(root.player.entryKeys, [1], "the playing track removed: gone from the list")
    root.until("mpv is idle", function() { return root.signals.indexOf("idle") !== -1 }, 5000, function() {
      h.equal(root.signals, ["idle"], "its end is not reported as an end")
      var mark = root.sent().length
      root.signals = []
      h.inject("mpv", ["playlist-play-index", 0])
      root.until("the kept track plays again", root.plays(1), 5000, function() {
        h.equal([root.signals, root.since(mark)], [["loading 1", "started 1"], []],
          "a track mpv still holds starts again from an idle mpv, and the player follows")
        root.next()
      })
    })
  }

  // mpv moves on by itself at the end of a track. The list does not change:
  // mpv keeps the entry that ended.
  function advances() {
    var h = root.h
    h.scenario({ mpv: "eof:300" })
    root.signals = []
    root.load(7, "replace")
    root.load(8, "append-play")
    h.equal(root.player.entryKeys, [7, 8], "a replace leaves only the new track, and its neighbour behind it")
    root.until("the second of the two has ended", function() {
      return root.signals.indexOf("idle") !== -1
    }, 8000, function() {
      h.equal(root.signals, ["loading 7", "started 7", "ended 7 eof", "loading 8", "started 8", "ended 8 eof",
        "idle"], "mpv advanced into the neighbour by itself")
      h.equal([root.player.entryKeys, root.holds([7, 8])], [[7, 8], [true, true]],
        "both entries are still in mpv's playlist")
      h.scenario({ mpv: "ok" })
      root.next()
    })
  }

  // Another program removes an entry: mpv says so and the list follows.
  function foreignRemoval() {
    var h = root.h
    var mark = root.sent().length
    h.inject("mpv", ["playlist-remove", 0])
    root.until("the list follows mpv", root.settled([8]), 3000, function() {
      h.equal([root.holds([7, 8]), root.since(mark)], [[false, true], []],
        "an entry that went without us is no longer held, and nothing was sent for it")
      root.next()
    })
  }

  // A file somebody else made mpv open takes the place of the playlist. It
  // is stopped, never adopted, and nothing of ours is held afterwards.
  function foreignFile() {
    var h = root.h
    root.load(9, "replace")
    root.until("a track plays", root.plays(9), 5000, function() {
      var mark = root.sent().length
      root.signals = []
      h.inject("mpv", ["loadfile", "foreign", "replace"])
      var idle = function() { return root.signals.indexOf("idle") !== -1 }
      root.until("mpv is idle again", idle, 5000, function() {
        h.equal([root.signals, root.since(mark)], [["idle"], ["stop"]], "the foreign file is stopped")
        root.until("nothing is held", root.settled([]), 2000, function() {
          h.equal(root.holds([9]), [false], "our track went with the playlist it was in")
          root.next()
        })
      })
    })
  }

  function stopForgets() {
    var h = root.h
    root.load(10, "replace")
    root.load(11, "append-play")
    root.until("a track plays", root.plays(10), 5000, function() {
      root.player.stopPlayback()
      h.equal([root.player.entryKeys, root.holds([10, 11])], [[], [false, false]],
        "stopPlayback: nothing is held from that moment")
      root.until("mpv agrees", root.settled([]), 3000, root.next)
    })
  }

  // A neighbour that is taken back before mpv is there never reaches it.
  function takenBackBeforeStart() {
    var h = root.h
    root.player.shutdown()
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      var mark = root.sent().length
      root.load(12, "replace")
      root.load(13, "append-play")
      root.load(14, "append-play")
      h.equal(root.player.entryKeys, [12, 13, 14], "three loads wait for a new mpv")
      root.player.removeKey(13)
      h.equal([root.player.entryKeys, root.holds([12, 13, 14])], [[12, 14], [true, false, true]],
        "one is taken back while it waits")
      root.until("the new mpv plays", root.plays(12), 8000, function() {
        root.until("and holds the two", root.settled([12, 14]), 3000, function() {
          var told = root.since(mark).filter(function(text) { return text.indexOf("observe_property") !== 0 })
          h.equal(told, ["keybind CLOSE_WIN", "set_property mute", "load Track 12 replace",
            "load Track 14 append-play"], "the load that was taken back was never sent, nor a removal for it")
          root.next()
        })
      })
    })
  }

  // mpv reports its playlist before the answer to the command that changed
  // it (here because every answer is held back). The report is older than
  // the command for all the player can tell, so it is passed over, and when
  // nothing newer comes mpv is asked.
  function asksWhenInDoubt() {
    var h = root.h
    var mark = root.sent().length
    h.scenario({ mpv: "slow-reply:120" })
    root.load(15, "append-play")
    h.equal(root.player.entryKeys, [12, 14, 15], "the load shows at once")
    root.until("mpv is asked for its playlist", function() {
      return root.since(mark).indexOf("get_property playlist") !== -1
    }, 3000, function() {
      root.until("and its answer is taken", root.settled([12, 14, 15]), 3000, function() {
        h.after(500, function() {
          h.equal(root.since(mark), ["load Track 15 append-play", "get_property playlist"], "asked once")
          h.scenario({ mpv: "ok" })
          root.next()
        })
      })
    })
  }

  function shutdownForgets() {
    var h = root.h
    root.signals = []
    root.player.shutdown()
    h.equal([root.player.entryKeys, root.holds([12, 14, 15])], [[], [false, false, false]],
      "shutdown: nothing is held from that moment")
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      h.equal([root.signals, root.player.entryKeys], [[], []], "and nothing is reported from that mpv")
      root.next()
    })
  }
}
