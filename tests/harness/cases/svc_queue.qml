import QtQuick

// The queue through the whole service: the real player against the stub
// mpv. Tracks are added from the panel, from a pasted link and over IPC;
// the item after the playing one is handed to mpv ahead of time, so that
// going on needs no lookup and a media key can do it; when mpv moves by
// itself the service follows and never passes through "idle"; related
// tracks join when the user's own run out; and a network that fails twice
// stops the queue where it is, although mpv had already begun the next
// track.
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
  readonly property string idD: "DDDDDDDDDDD"

  // The user has switched related tracks off; one step switches them on.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.becomesReady, root.fills, root.goesOn, root.mediaKeys, root.goesBack, root.reorders,
      root.runsOut, root.relatedTracks, root.networkFails, root.fullQueue, root.quiet
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

  function row(id) {
    return { id: id, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  function ids() {
    return root.h.service.queue.map(function(item) { return item.id })
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

  function loads() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return command[0] === "loadfile"
    })
  }

  function becomesReady() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      s.playbackStateChanged.connect(function() { root.states = root.states.concat([s.playbackState]) })
      root.next()
    })
  }

  // Four tracks, each by another way in.
  function fills() {
    var h = root.h
    var s = h.service
    h.check(s.playTrack(root.row(root.idA)), "fill: a row is played")
    h.check(s.enqueueTrack(root.row(root.idB)), "fill: a row is queued")
    h.equal(s.submit("https://youtu.be/" + root.idC, true), "video", "fill: a pasted link is queued")
    h.equal(s._ipcEnqueue(root.idD), "ok", "fill: a video is queued over IPC")
    h.equal([s.enqueueTrack({ id: "short" }), s.enqueueTrack(null), s._ipcEnqueue("file:///etc/hostname")],
      [false, false, "invalid"], "fill: what is no track is not queued")
    h.equal([root.ids(), s.queueIndex], [[root.idA, root.idB, root.idC, root.idD], 0],
      "fill: four items, in the order they came, the first one current")
    root.until("fill: the first plays", root.playing(root.idA), 8000, function() {
      root.until("fill: mpv holds the item after it", function() {
        return h.parts.player.holds(root.keyOf(root.idB))
      }, 8000, function() {
        h.equal(h.log("ytdlp").length, 2, "fill: two lookups, for the playing track and the one after it")
        h.equal(root.loads().map(function(command) { return command[2] }), ["replace", "append-play"],
          "fill: the second is appended to mpv's own list")
        h.equal([h.parts.player.holds(root.keyOf(root.idC)), JSON.parse(s._ipcStatus()).queueLength],
          [false, 4], "fill: the items further on wait in the service alone")
        root.next()
      })
    })
  }

  // Next goes on within mpv: nothing is looked up for it, and nothing stops.
  function goesOn() {
    var h = root.h
    var s = h.service
    root.states = []
    h.check(s.next(), "next: taken")
    root.until("next: the second plays", root.playing(root.idB), 8000, function() {
      h.equal(s.queueIndex, 1, "next: the position moved")
      h.equal(root.states.filter(function(state) { return state === "idle" || state === "error" }), [],
        "next: playback never stopped on the way")
      root.until("next: mpv holds the third by now", function() {
        return h.parts.player.holds(root.keyOf(root.idC))
      }, 8000, root.next)
    })
  }

  // A media key moves mpv directly. The service follows.
  function mediaKeys() {
    var h = root.h
    var s = h.service
    var lookups = h.log("ytdlp").length
    root.states = []
    h.inject("mpv", ["playlist-next"])
    root.until("media key: the third plays", root.playing(root.idC), 8000, function() {
      h.equal(s.queueIndex, 2, "media key: the position followed")
      root.until("media key: the fourth is handed over", function() {
        return h.parts.player.holds(root.keyOf(root.idD))
      }, 8000, function() {
        h.inject("mpv", ["playlist-prev"])
        root.until("media key: back to the second", root.playing(root.idB), 8000, function() {
          h.equal(s.queueIndex, 1, "media key: the position followed back")
          h.equal(root.states.filter(function(state) { return state === "idle" || state === "error" }), [],
            "media key: the service was never idle on the way")
          h.equal(h.log("mpv-start").length, 1, "media key: it is the same mpv all along")
          h.equal(h.log("ytdlp").length, lookups + 1,
            "media key: one lookup on the way, for the item that came into reach")
          root.next()
        })
      })
    })
  }

  // Previous, right after a track began, goes to the item before it.
  function goesBack() {
    var h = root.h
    var s = h.service
    h.check(s.previous(), "previous: taken")
    root.until("previous: the first plays again", root.playing(root.idA), 8000, function() {
      h.equal(s.queueIndex, 0, "previous: the position moved back")
      root.next()
    })
  }

  function reorders() {
    var h = root.h
    var s = h.service
    h.equal([s.queueMove(999999, 1), s.queueRemove(999999), s.queuePlay(999999), s.queuePlay(0)],
      [false, false, false, false], "reorder: a key the queue does not hold changes nothing")
    h.check(s.queueMove(root.keyOf(root.idD), -2), "reorder: an item is moved up")
    h.check(s.queueRemove(root.keyOf(root.idC)), "reorder: an item is removed")
    h.equal([root.ids(), s.queueIndex, s.playbackState], [[root.idA, root.idD, root.idB], 0, "playing"],
      "reorder: the queue is as asked, and the track plays on")
    root.until("reorder: mpv holds the new neighbour", function() {
      return h.parts.player.holds(root.keyOf(root.idD)) && !h.parts.player.holds(root.keyOf(root.idB))
    }, 8000, function() {
      h.check(s.queuePlay(root.keyOf(root.idB)), "reorder: an item is started by its key")
      root.until("reorder: it plays", root.playing(root.idB), 8000, function() {
        h.equal(s.queueIndex, 2, "reorder: at its place in the queue")
        s.queueClear()
        h.equal([root.ids(), s.queueIndex, s.playbackState], [[root.idB], 0, "playing"],
          "clear: only the playing track is left, and it plays on")
        root.next()
      })
    })
  }

  // With related tracks switched off, the queue ends with its last item.
  function runsOut() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "eof:300" })
    h.check(s.playTrack(root.row(root.idA)), "runs out: a last track is played")
    root.until("runs out: idle after it", function() {
      return s.playbackState === "idle" && h.parts.player.mpvState === "off"
    }, 8000, function() {
      h.equal([s.queueIndex, s.noticeCode, s.errorCode], [-1, "", ""], "runs out: no track, nothing to say")
      h.scenario({ ytdlp: "ok", mpv: "ok" })
      root.next()
    })
  }

  // Switched on, related tracks join the queue behind the last item, and
  // playback goes on into them.
  function relatedTracks() {
    var h = root.h
    var s = h.service
    var lookups = h.log("ytdlp").length
    h.check(s.setSetting("autoplay", true), "related: switched on")
    h.check(s.playTrack(root.row(root.idA)), "related: a track is played")
    root.until("related: tracks have joined", function() { return s.queue.length > 1 }, 8000, function() {
      h.equal([s.queue[0].auto, s.queue[1].auto, s.queueIndex], [false, true, 0],
        "related: marked as added for the user, behind the user's own")
      h.check(root.ids().slice(1).indexOf(root.idA) === -1, "related: the track itself is not among them")
      var mix = h.log("ytdlp").slice(lookups).filter(function(record) {
        return record.stdin.indexOf("&list=RD") !== -1
      })
      h.equal(mix.length, 1, "related: one request for the list")
      h.check(mix[0].argv.indexOf("--no-cookies") !== -1 && mix[0].argv.indexOf("--flat-playlist") !== -1,
        "related: signed out, and without looking any of them up")
      h.check(JSON.stringify(h.jobs()).indexOf(root.idA) === -1, "related: no id in any command line")
      var second = s.queue[1].id
      root.until("related: the first of them is handed to mpv", function() {
        return h.parts.player.holds(s.queue[1].key)
      }, 8000, function() {
        root.states = []
        h.scenario({ ytdlp: "ok", mpv: "eof:300" })
        h.inject("mpv", ["playlist-next"])
        root.until("related: playback goes on into them", function() {
          return s.currentTrack !== null && s.currentTrack.id === second && s.playbackState === "playing"
        }, 8000, function() {
          h.equal(root.states.filter(function(state) { return state === "idle" || state === "error" }), [],
            "related: without a stop in between")
          h.scenario({ ytdlp: "ok", mpv: "ok" })
          h.check(s.stop(), "related: stopped")
          root.until("related: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
            function() {
              h.check(s.setSetting("autoplay", false), "related: switched off again")
              s.queueClear()
              h.equal(root.ids(), [], "related: an idle queue is emptied whole")
              root.next()
            })
        })
      })
    })
  }

  // A track breaks off twice within a moment: that is the network, not the
  // track. mpv has begun the next one by itself each time; the queue stops
  // on the track that failed all the same, and nothing plays on.
  function networkFails() {
    var h = root.h
    var s = h.service
    h.check(s.playTrack(root.row(root.idA)), "network: a track is played")
    h.check(s.enqueueTrack(root.row(root.idB)), "network: another is queued")
    root.until("network: both are in mpv", function() {
      return s.playbackState === "playing" && h.parts.player.holds(root.keyOf(root.idB))
    }, 8000, function() {
      h.scenario({ ytdlp: "ok", mpv: "premature:300" })
      h.check(s.playTrack(root.row(root.idC)), "network: a track that will break off")
      h.check(s.enqueueTrack(root.row(root.idD)), "network: with one behind it")
      root.until("network: the queue stops", function() { return s.playbackState === "error" }, 15000,
        function() {
          h.equal([s.errorCode, s.currentTrack.id, s.queueIndex], ["E_NETWORK", root.idC, 0],
            "network: on the track that broke off, with the network's code")
          root.states = []
          root.until("network: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
            function() {
              h.after(800, function() {
                h.equal([s.playbackState, s.currentTrack.id, root.states], ["error", root.idC, []],
                  "network: the track behind it was not started, and nothing moved afterwards")
                h.scenario({ ytdlp: "ok", mpv: "ok" })
                h.check(s.stop(), "network: stopped")
                s.queueClear()
                root.next()
              })
            })
        })
    })
  }

  // The queue has a limit, and every way in says so in its own words.
  function fullQueue() {
    var h = root.h
    var s = h.service
    var taken = 0
    for (var i = 0; i < 200; i++) {
      if (s._ipcEnqueue(root.idA) === "ok") taken += 1
    }
    h.equal([taken, s.queue.length], [200, 200], "full: two hundred items are taken")
    h.equal([s._ipcEnqueue(root.idB), s.enqueueTrack(root.row(root.idB)),
      s.submit("https://youtu.be/" + root.idB, true)], ["full", false, "empty"],
      "full: one more is refused, over IPC, from a row and from a link")
    h.equal(s.queue.length, 200, "full: and the queue is as long as it was")
    root.until("full: the first of them plays", root.playing(root.idA), 8000, function() {
      h.check(s.stop(), "full: stopped")
      s.queueClear()
      root.until("full: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
        root.next)
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, root.idC, root.idD,
      "RRRRRRRR"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
