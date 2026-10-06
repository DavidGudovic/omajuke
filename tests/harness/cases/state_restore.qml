import QtQuick

// The whole service across a shell restart. What was played, the queue,
// the volume and the mute are in the state file and come back; the search
// does not, and nothing plays by itself. A state file that cannot be read
// is replaced, and the service says so once.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0
  // Records of the stubs at the moment of a restart.
  property int lookups: 0
  property int mpvs: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  // What the stub's lookup says the video is.
  readonly property var track: ({
    id: "AAAAAAAAAAA", title: "A,vid=1 \"q\"", channel: "c", duration: 5, live: false
  })

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.becomesReady, root.playsAndSaves, root.restarts, root.nothingPlays, root.playButton,
      root.clearsHistory, root.stopsAndSaves, root.restartsStopped, root.unreadable, root.dismissed,
      root.unreadableAgain, root.quiet
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // Waits for something that has to happen, and says so when it does not.
  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function stateFile() {
    return root.h.runDir + "/sbx/state/omajuke/state.json"
  }

  // The state file as it is on disk right now, or null.
  function onDisk() {
    try {
      return JSON.parse(root.h.readFile(root.stateFile()))
    } catch (error) {
      return null
    }
  }

  // The files in the two runtime folders that hold numbered files.
  function runtimeFiles(then) {
    var paths = root.h.parts.fs.paths
    var find = ["/usr/bin/find", paths.infoDir, paths.thumbsDir, "-type", "f", "-printf", "%P\\n"]
    root.h.exec(find, null, function(code, out) {
      var names = out.split("\n").filter(function(name) { return name !== "" })
      then(names.map(function(name) { return (/json$/.test(name) ? "info/" : "thumbs/") + name }).sort())
    })
  }

  // A shell restart as the plugin sees it; goes on when the new service is
  // ready.
  function restart(label, then) {
    var h = root.h
    root.lookups = h.log("ytdlp").length
    root.mpvs = h.log("mpv-start").length
    h.recreate(function() {
      root.until(label + ": ready again", function() { return h.service.ready }, 5000, then)
    })
  }

  function becomesReady() {
    root.until("ready", function() { return root.h.service.ready }, 5000, root.next)
  }

  function playsAndSaves() {
    var h = root.h
    var s = h.service
    s.setVolume(55)
    s.toggleMute()
    h.equal(s.submit("some words", false), "query", "before: a search is started")
    h.check(s.playTrack({ id: root.idA, title: "A row", channel: "", duration: null, live: true }),
      "before: a track is taken")
    root.until("before: it plays", function() { return s.playbackState === "playing" }, 8000, function() {
      root.until("before: the search has results", function() { return s.searchState === "results" }, 8000,
        function() {
          root.until("before: all of it is saved", function() {
            var state = root.onDisk()
            return state !== null && state.muted === true && state.recents.length === 1
              && state.queue.items.length === 1 && state.queue.items[0].title === root.track.title
          }, 5000, function() {
            var state = root.onDisk()
            h.equal([state.volume, state.muted, state.queue.index], [55, true, 0],
              "before: volume, mute, position")
            h.equal(state.recents, [root.track],
              "before: the track as the lookup knows it, not as the row said")
            h.equal(JSON.stringify(state).indexOf("some words"), -1, "before: the search is not in the file")
            root.next()
          })
        })
    })
  }

  // The service is destroyed while the track plays, as at a shell exit.
  function restarts() {
    var h = root.h
    root.restart("restart", function() {
      var s = h.service
      h.equal([s.playbackState, s.playing, s.paused, s.errorCode], ["idle", false, false, ""],
        "restart: idle")
      h.check(Array.isArray(s.queue) && Array.isArray(s.recents), "restart: the lists are arrays")
      h.equal(s.recents, [root.track], "restart: the recent tracks are back")
      h.equal([s.queue.length, s.queueIndex, s.hasTrack], [1, 0, true],
        "restart: the queue is back, with its position")
      h.equal([s.currentTrack.id, s.currentTrack.title, s.currentTrack.auto],
        [root.idA, root.track.title, false], "restart: the current track is the one that played")
      h.check(s.currentTrack.key > 0, "restart: under a key of this run")
      h.equal([s.volume, s.muted], [55, true], "restart: volume and mute are back")
      h.equal([s.searchState, s.searchQuery, s.searchResults.length], ["idle", "", 0],
        "restart: the search is not")
      h.equal([s.position, s.duration, s.seekable, s.tooltip], [0, 0, false, "OmaJuke"],
        "restart: nothing about a playing track")
      h.equal(s.noticeCode, "", "restart: nothing to tell")
      root.next()
    })
  }

  function nothingPlays() {
    var h = root.h
    var s = h.service
    h.after(700, function() {
      h.equal([h.log("ytdlp").length - root.lookups, h.log("mpv-start").length - root.mpvs], [0, 0],
        "restart: no tool was started for the restored track")
      h.equal([s.playbackState, h.parts.player.mpvState, h.parts.runner.active], ["idle", "off", 0],
        "restart: nothing plays until the user acts")
      root.next()
    })
  }

  // The play button on a restored track starts it from the beginning.
  function playButton() {
    var h = root.h
    var s = h.service
    h.check(s.playPause(), "play button: taken")
    var plays = function() { return s.playbackState === "playing" }
    root.until("play button: it plays", plays, 8000, function() {
      h.equal([h.log("ytdlp").length - root.lookups, h.log("mpv-start").length - root.mpvs], [1, 1],
        "play button: looked up again, in a new mpv")
      var launch = h.log("mpv-start").slice(-1)[0].argv
      h.check(launch.indexOf("--volume=55") !== -1, "play button: mpv starts at the saved volume")
      var mute = h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
        return command[0] === "set_property" && command[1] === "mute"
      })
      h.equal(mute.slice(-1), [["set_property", "mute", true]], "play button: and muted")
      h.equal([s.queue.length, s.queueIndex, s.recents.length], [1, 0, 1], "play button: the same queue")
      root.next()
    })
  }

  // Clear history: what was played and searched is forgotten, in memory, in
  // the runtime folder and, at once, on disk. The track that plays is not
  // interrupted, so what it needs stays.
  function clearsHistory() {
    var h = root.h
    var s = h.service
    var ids = function(tracks) { return tracks.map(function(track) { return track.id }) }
    h.shell.panelShown = true
    s.notePanelOpen(true)
    h.check(s.playTrack({ id: root.idB, title: "Another", channel: "", duration: 9, live: false }),
      "clear: a second track is taken")
    h.equal(s.submit("some words", false), "query", "clear: a search is started")
    s.wantThumbs([root.idA, root.idB])
    root.until("clear: the second track plays, with results and pictures", function() {
      return s.playbackState === "playing" && s.currentTrack.id === root.idB && s.searchState === "results"
        && typeof s.thumbs[root.idA] === "string" && typeof s.thumbs[root.idB] === "string"
    }, 8000, function() {
      // A row could not show the picture it was given.
      s.reportThumbError(root.idA)
      h.check(s.thumbs[root.idA] === undefined && typeof s.thumbs[root.idB] === "string",
        "clear: a picture that could not be shown leaves the map, the other stays")
      h.equal(ids(s.recents), [root.idB, root.idA], "clear: two recent tracks")
      // Its file goes a moment after the map has dropped it.
      h.after(400, function() { root.cleared(ids) })
    })
  }

  function cleared(ids) {
    var h = root.h
    var s = h.service
    root.runtimeFiles(function(before) {
      h.equal(before, ["info/1.json", "info/2.json", "thumbs/2.jpg"],
        "clear: two lookups and one picture on file")
      s.clearHistory()
      h.equal([s.recents.length, ids(s.queue), s.queueIndex], [0, [root.idB], 0],
        "clear: no recent tracks, the queue is the current track")
      h.equal([s.playbackState, s.currentTrack.id], ["playing", root.idB], "clear: which plays on")
      h.equal([s.searchState, s.searchQuery, s.searchResults.length], ["idle", "", 0], "clear: no search")
      h.equal(Object.keys(s.thumbs), [], "clear: no pictures")
      // Sooner than a save that waits for its turn would be written.
      root.until("clear: the file is rewritten at once", function() {
        var state = root.onDisk()
        return state !== null && state.recents.length === 0 && state.queue.items.length === 1
      }, 600, function() {
        h.after(400, function() {
          root.runtimeFiles(function(after) {
            h.equal(after, ["info/2.json"], "clear: only the lookup of the playing track is left on file")
            h.shell.panelShown = false
            s.notePanelOpen(false)
            root.next()
          })
        })
      })
    })
  }

  function stopsAndSaves() {
    var h = root.h
    var s = h.service
    s.toggleMute()
    h.check(s.stop(), "stopped: taken")
    root.until("stopped: saved", function() {
      var state = root.onDisk()
      return state !== null && state.queue.index === -1 && state.muted === false
    }, 5000, root.next)
  }

  function restartsStopped() {
    var h = root.h
    root.restart("restart stopped", function() {
      var s = h.service
      h.equal([s.queue.length, s.queueIndex, s.hasTrack, s.muted], [1, -1, false, false],
        "restart stopped: the queue without a current track")
      h.equal(s.playPause(), false, "restart stopped: the play button has nothing to start")
      h.equal(s.playbackState, "idle", "restart stopped: idle")
      root.next()
    })
  }

  // The file is damaged while the shell is down.
  function unreadable() {
    var h = root.h
    h.revoke()
    h.writeFile(root.stateFile(), "{\"version\":1,\"recents\":[")
    root.restart("unreadable", function() {
      var s = h.service
      h.equal(s.noticeCode, "N_STATE_RESET", "unreadable: the service says so")
      h.equal(s.errorText(s.noticeCode), "Saved history could not be read and was reset",
        "unreadable: in words")
      h.equal([s.queue.length, s.recents.length, s.volume, s.muted], [0, 0, 70, false],
        "unreadable: a first start's values")
      root.until("unreadable: the file is replaced", function() { return root.onDisk() !== null }, 5000,
        function() {
          h.exec(["/usr/bin/ls", "-A", h.runDir + "/sbx/state/omajuke"], null, function(code, out) {
            h.equal(out, "state.json\n", "unreadable: and no copy of the damaged one is kept")
            root.next()
          })
        })
    })
  }

  function dismissed() {
    var h = root.h
    var s = h.service
    s.dismissNotice()
    h.equal(s.noticeCode, "", "dismissed: the notice is gone")
    root.restart("dismissed", function() {
      h.equal(h.service.noticeCode, "", "dismissed: and does not come back with the next start")
      root.next()
    })
  }

  // Playing something answers the notice as well.
  function unreadableAgain() {
    var h = root.h
    h.revoke()
    h.writeFile(root.stateFile(), "not a state file")
    root.restart("unreadable again", function() {
      var s = h.service
      h.equal(s.noticeCode, "N_STATE_RESET", "unreadable again: the notice")
      h.check(s.playTrack(root.track), "unreadable again: a track is taken")
      h.equal(s.noticeCode, "", "unreadable again: the notice goes with the play")
      root.until("unreadable again: it plays", function() { return s.playbackState === "playing" }, 8000,
        function() {
          h.equal(s.noticeCode, "", "unreadable again: and stays away")
          h.check(s.stop(), "unreadable again: stopped")
          root.until("unreadable again: mpv is gone", function() { return h.parts.player.mpvState === "off" },
            5000, root.next)
        })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, "some words", "vid=1"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no query, no title")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
