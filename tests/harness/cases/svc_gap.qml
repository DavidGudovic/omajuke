import QtQuick

// The moment between two tracks, through the whole service: the real
// player against the stub mpv.
//
// When a track ends by itself mpv reports the end of its file and, a moment
// later, the start of the next one, which it already holds. In between the
// player is on no track, while the queue still has the ended item as the
// current one. Whatever makes the service look at mpv's playlist in that
// moment (here: the user queues another track) must leave the playlist
// alone. A plan made then would take the ended item for one that is being
// started and remove the very entry mpv is about to open, and playback
// would end in the middle of the queue.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0
  // Every playback state the service went through since the last reset.
  property var states: []

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"
  // How long a file plays, and how long mpv takes from its end to the
  // start of the next one. Long enough to act in between.
  readonly property int gapMs: 1200

  // Related tracks are another case's subject.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [root.twoTracks, root.queuedInTheGap, root.goesOn, root.quiet]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function row(id) {
    return { id: id, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  function keyOf(id) {
    var queue = root.h.service.queue
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].id === id) return queue[i].key
    }
    return 0
  }

  function playing(id) {
    return function() {
      var s = root.h.service
      return s.playbackState === "playing" && s.currentTrack !== null && s.currentTrack.id === id
    }
  }

  function removals() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return command[0] === "playlist-remove"
    })
  }

  // The first track is one that ends by itself; mpv holds the second.
  function twoTracks() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      s.playbackStateChanged.connect(function() { root.states = root.states.concat([s.playbackState]) })
      h.scenario({ ytdlp: "ok", mpv: "eof-gap:" + root.gapMs })
      h.check(s.playTrack(root.row(root.idA)), "set-up: a track is played")
      h.check(s.enqueueTrack(root.row(root.idB)), "set-up: another is queued")
      root.until("set-up: mpv holds the second while the first plays", function() {
        return h.parts.player.holds(root.keyOf(root.idB)) && s.currentTrack !== null
          && s.currentTrack.id === root.idA
      }, 8000, root.next)
    })
  }

  // The first track is over and the second has not begun.
  function queuedInTheGap() {
    var h = root.h
    var s = h.service
    var player = h.parts.player
    root.states = []
    root.until("gap: the player is on no track, and mpv still runs", function() {
      return player.currentKey === 0 && player.mpvState === "running" && player.holds(root.keyOf(root.idB))
    }, 8000, function() {
      // The tracks after this one play on for good.
      h.scenario({ ytdlp: "ok", mpv: "ok" })
      h.equal([s.queueIndex, s.currentTrack !== null ? s.currentTrack.id : ""], [0, root.idA],
        "gap: the queue still has the track that ended as the current one")
      h.check(s.enqueueTrack(root.row(root.idC)), "gap: a track is queued in that moment")
      h.equal([player.holds(root.keyOf(root.idB)), root.removals()], [true, []],
        "gap: nothing is taken out of mpv's playlist, least of all the entry it is about to open")
      root.next()
    })
  }

  function goesOn() {
    var h = root.h
    var s = h.service
    root.until("goes on: the second track plays", root.playing(root.idB), 8000, function() {
      h.equal(s.queueIndex, 1, "goes on: the position moved")
      h.equal(root.states.filter(function(state) { return state === "idle" || state === "error" }), [],
        "goes on: playback never stopped on the way")
      h.equal(h.log("mpv-start").length, 1, "goes on: in the same mpv")
      root.until("goes on: and the third is handed to mpv behind it", function() {
        return h.parts.player.holds(root.keyOf(root.idC))
      }, 8000, function() {
        h.check(s.stop(), "stopped")
        root.until("mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000, root.next)
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, root.idC]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
