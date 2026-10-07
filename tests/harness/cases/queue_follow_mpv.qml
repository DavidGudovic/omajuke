import QtQuick
import "../../../lib/Const.js" as Const

// mpv moves through its playlist without being asked: the desktop's Next
// and Previous media keys act on mpv itself, and mpv goes on by itself at
// the end of a track. core/Playback.qml has to follow and nothing more: the
// queue position goes where mpv went, the playlist window is shaped around
// the new track, and at no point is the player stopped, shut down or told
// to load the track again. Run against a scripted player that keeps a
// playlist the way mpv does.
QtObject {
  id: root

  property var h: null
  // Whether the scripted player shows its own commands in its copy of the
  // playlist at once, as the real one does, or only when mpv reports.
  property bool eager: false

  function run(h) {
    var rows = [
      root.mediaNext, root.mediaPrevious, root.keysInARow, root.endOfATrack, root.whilePaused,
      root.shuffled, root.anEntryThatLeftTheQueue, root.whileARequestIsPending
    ]
    // Every row twice: the outcome must be the same whichever way the
    // player keeps its copy of mpv's playlist.
    var modes = [false, true]
    for (var m = 0; m < modes.length; m++) {
      root.eager = modes[m]
      root.h = root.labelled(h, modes[m] ? "shown at once, " : "")
      for (var i = 0; i < rows.length; i++) rows[i]()
    }
    root.h = h
    root.quietLog()
    h.finish()
  }

  // The harness with a word in front of every label.
  function labelled(h, prefix) {
    return {
      runDir: h.runDir,
      check: function(condition, label) { return h.check(condition, prefix + label) },
      equal: function(a, b, label) { return h.equal(a, b, prefix + label) },
      mount: function(path, props) { return h.mount(path, props) },
      readFile: function(path) { return h.readFile(path) }
    }
  }

  function quietLog() {
    var log = root.h.readFile(root.h.runDir + "/out.txt")
    var files = ["Playback.qml", "Queue.js", "FakePlayer.qml", "FakeResolver.qml", "queue_follow_mpv.qml"]
    var named = files.filter(function(name) { return log.indexOf(name) !== -1 })
    root.h.check(log.indexOf("Configuration Loaded") !== -1, "log: readable while the case runs")
    root.h.equal(named, [], "log: no message names a file of this case")
  }

  // ---- Set-up ----

  function id(letter) {
    return new Array(12).join(letter)
  }

  function track(letter) {
    return { id: root.id(letter), title: "Title " + letter, channel: "Channel", duration: 200, live: false }
  }

  function settle(r) {
    for (var i = 0; i < 4; i++) {
      while (r.resolver.pending() > 0) r.resolver.succeed()
      r.player.report()
    }
  }

  function start(r) {
    var item = r.playback.current
    r.resolver.succeedFor(item.id)
    r.player.report()
    root.opens(r, item.key)
    r.player.begin(item.key)
    root.settle(r)
  }

  // mpv opens an entry, which it can only do with one it holds.
  function opens(r, key) {
    root.h.check(r.player.open(key), "mpv holds the entry it opens")
  }

  // A queue of these letters with the item at "index" playing between its
  // neighbours, and everything recorded from that moment on: each state
  // the component shows, each track signal, each command.
  function playing(letters, index) {
    var h = root.h
    var r = { states: [], events: [] }
    r.player = h.mount("tests/harness/FakePlayer.qml", { duration: 200, eager: root.eager })
    r.resolver = h.mount("tests/harness/FakeResolver.qml", {})
    r.playback = h.mount("core/Playback.qml", {
      player: r.player, resolver: r.resolver, hold: false, persistHistory: true
    })
    for (var i = 0; i < letters.length; i++) r.playback.enqueueTrack(root.track(letters[i]))
    root.start(r)
    if (index > 0) {
      r.playback.queuePlay(r.playback.queue[index].key)
      root.start(r)
    }
    r.keys = r.playback.queue.map(function(item) { return item.key })
    r.playback.statusChanged.connect(function() { r.states.push(r.playback.status) })
    r.playback.trackStarted.connect(function(item) { r.events.push("started " + item.id[0]) })
    r.playback.trackEnded.connect(function(item) { r.events.push("ended " + item.id[0]) })
    r.player.clearCalls()
    r.resolver.clearCalls()
    return r
  }

  // mpv was told by a media key to go to another entry, which the player
  // reports as that file being opened and then playing. The end of the
  // file it left is never reported.
  function mpvGoesTo(r, key) {
    root.opens(r, key)
    r.player.begin(key)
    root.settle(r)
  }

  function shown(r) {
    return [r.playback.status, r.playback.current === null ? "" : r.playback.current.id[0],
      r.playback.queueIndex]
  }

  function names(fake, wanted) {
    return fake.calls.filter(function(call) { return wanted.indexOf(call.name) !== -1 }).map(function(call) {
      return call.name
    })
  }

  // What would mean that this component went ahead of mpv: stopping it,
  // quitting it, replacing what it plays, asking for a track to play.
  function interference(r) {
    var replaces = r.player.calls.filter(function(call) {
      return call.name === "load" && call.args[4].mode === "replace"
    }).length
    var plays = r.resolver.calls.filter(function(call) {
      return call.name === "refresh" || (call.name === "ensure" && call.args[1] === "play")
    }).length
    var stops = root.names(r.player, ["shutdown", "stopPlayback", "setPause", "seek"])
    return [stops, replaces, plays, root.names(r.resolver, ["cancelPlay"])]
  }

  readonly property var none: [[], 0, 0, []]

  function never(states, unwanted) {
    return states.filter(function(state) { return unwanted.indexOf(state) !== -1 })
  }

  // ---- Rows ----

  function mediaNext() {
    var h = root.h
    var r = root.playing("ABCD", 1)
    var k = r.keys
    h.equal([root.shown(r), r.player.playlist()], [["playing", "B", 1], [k[0], k[1], k[2]]], "next: set-up")

    root.opens(r, k[2])
    h.equal(root.shown(r), ["loading", "C", 2], "next: the queue position follows mpv at once")
    h.equal(r.player.playlist().indexOf(k[2]) !== -1, true, "next: the entry mpv opens stays in its playlist")
    r.player.begin(k[2])
    root.settle(r)
    h.equal(root.shown(r), ["playing", "C", 2], "next: the third plays")
    h.equal(r.player.playlist(), [k[1], k[2], k[3]], "next: the window moved with it")
    h.equal(r.events, ["ended B", "started C"], "next: one track ended, one started")

    root.mpvGoesTo(r, k[3])
    h.equal([root.shown(r), r.player.playlist()], [["playing", "D", 3], [k[2], k[3]]],
      "next: and again, onto the last item")
    h.equal(r.states, ["loading", "playing", "loading", "playing"], "next: loading and playing, nothing else")
    h.equal(root.never(r.states, ["idle", "error", "resolving"]), [], "next: never idle")
    h.equal(root.interference(r), root.none, "next: mpv was never stopped, replaced or asked to play")
    h.equal([r.playback.errorCode, r.playback.noticeCode], ["", ""], "next: no error, no notice")
    h.equal(r.playback.recents.map(function(t) { return t.id[0] }).join(""), "DCBA",
      "next: each track it went through counts as played")
  }

  function mediaPrevious() {
    var h = root.h
    var r = root.playing("ABCD", 2)
    var k = r.keys
    h.equal([root.shown(r), r.player.playlist()], [["playing", "C", 2], [k[1], k[2], k[3]]],
      "previous: set-up")

    root.mpvGoesTo(r, k[1])
    h.equal([root.shown(r), r.player.playlist()], [["playing", "B", 1], [k[0], k[1], k[2]]],
      "previous: the second plays, between the first and the third")
    root.mpvGoesTo(r, k[0])
    h.equal([root.shown(r), r.player.playlist()], [["playing", "A", 0], [k[0], k[1]]],
      "previous: and the first, with nothing in front of it")
    h.equal(root.never(r.states, ["idle", "error", "resolving"]), [], "previous: never idle")
    h.equal(root.interference(r), root.none, "previous: mpv was never stopped, replaced or asked to play")
    h.equal(r.events, ["ended C", "started B", "ended B", "started A"], "previous: starts and ends pair up")

    // mpv starts the same entry again, which is what Previous does on the
    // first entry of its playlist.
    root.mpvGoesTo(r, k[0])
    h.equal([root.shown(r), r.events.slice(-2)], [["playing", "A", 0], ["ended A", "started A"]],
      "previous: the same entry started again is followed too")
    h.equal(root.interference(r), root.none, "previous: still without interference")
  }

  function keysInARow() {
    var h = root.h
    var r = root.playing("ABCD", 1)
    var k = r.keys
    // Next and then Previous, before the first file has started to play.
    root.opens(r, k[2])
    h.equal(root.shown(r), ["loading", "C", 2], "in a row: on to the third")
    root.opens(r, k[1])
    h.equal(root.shown(r), ["loading", "B", 1], "in a row: and back; the position is where mpv is now")
    // The first item left mpv's playlist when it moved on, so that is as
    // far back as mpv can go until the window is shaped again.
    h.check(r.player.open(k[0]) === false, "in a row: mpv holds nothing further back for the moment")
    r.player.begin(k[1])
    root.settle(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "B", 1], k.slice(0, 3)],
      "in a row: the window is shaped around where it came to rest")
    h.equal(r.events, ["ended B", "started B"], "in a row: a track that never started is not announced")
    h.equal(root.never(r.states, ["idle", "error", "resolving"]), [], "in a row: never idle")
    h.equal(root.interference(r), root.none, "in a row: no interference")
    // A start reported for a file mpv has already left counts for nothing.
    r.player.started(k[2])
    h.equal(root.shown(r), ["playing", "B", 1], "in a row: a late start of another entry is ignored")
    root.mpvGoesTo(r, k[0])
    h.equal([root.shown(r), r.player.playlist()], [["playing", "A", 0], [k[0], k[1]]],
      "in a row: and now mpv can go further back")
  }

  function endOfATrack() {
    var h = root.h
    var r = root.playing("ABC", 0)
    var k = r.keys
    r.player.ended(k[0], "eof", "")
    h.equal([root.shown(r), r.states], [["playing", "A", 0], []],
      "end: nothing changes until mpv says what it does next")
    root.mpvGoesTo(r, k[1])
    h.equal([root.shown(r), r.player.playlist()], [["playing", "B", 1], k],
      "end: mpv went on, and so did the queue")
    r.player.ended(k[1], "eof", "")
    root.mpvGoesTo(r, k[2])
    h.equal([root.shown(r), r.player.playlist()], [["playing", "C", 2], [k[1], k[2]]],
      "end: and on to the last")
    h.equal(root.never(r.states, ["idle", "error", "resolving"]), [], "end: never idle in between")
    h.equal(root.interference(r), root.none, "end: no interference")
    r.player.ended(k[2], "eof", "")
    h.equal([root.shown(r), root.names(r.player, ["shutdown"])], [["idle", "", -1], ["shutdown"]],
      "end: only after the last track does playing end")
  }

  function whilePaused() {
    var h = root.h
    var r = root.playing("AB", 0)
    var k = r.keys
    r.player.phase = "paused"
    h.equal(root.shown(r), ["paused", "A", 0], "paused: set-up")
    // mpv is started so that every new file plays.
    root.mpvGoesTo(r, k[1])
    h.equal(root.shown(r), ["playing", "B", 1], "paused: the next key starts the next track playing")
    h.equal(root.interference(r), root.none, "paused: without a command of ours")
  }

  function shuffled() {
    var h = root.h
    var r = root.playing("ABC", 1)
    var k = r.keys
    r.player.setPlaylist([k[2], k[1], k[0]])
    // A playlist no step of ours leads to could also be a report that is
    // behind. It is acted on once it has stood for a while.
    h.equal([r.player.calls, r.player.playlist()], [[], [k[2], k[1], k[0]]],
      "shuffled: nothing is done at once")
    var wait = null
    var parts = r.playback.resources
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].interval === Const.TIMEOUTS.replyMs && typeof parts[i].triggered === "function") {
        wait = parts[i]
      }
    }
    h.check(wait !== null && wait.running === true, "shuffled: the wait is running")
    wait.triggered()
    h.equal(r.player.playlist(), k, "shuffled: then the window is put back in queue order")
    h.equal(root.names(r.player, ["removeKey"]).length, 2, "shuffled: by taking out the two neighbours")
    h.equal(r.player.calls.filter(function(call) {
      return call.name === "removeKey" && call.args[0] === k[1]
    }), [], "shuffled: never the entry that plays")
    h.equal([root.shown(r), root.interference(r)], [["playing", "B", 1], root.none],
      "shuffled: which goes on undisturbed")
    r.player.report()
    r.player.clearCalls()
    r.player.report()
    h.equal(r.player.calls, [], "shuffled: a window in shape is left alone")
  }

  // The one case in which mpv is stopped: it opens an entry whose item is
  // no longer in the queue.
  function anEntryThatLeftTheQueue() {
    var h = root.h
    var r = root.playing("ABC", 0)
    var k = r.keys
    // The second item is removed, and mpv moves into its entry before the
    // removal has reached it.
    r.playback.queueRemove(k[1])
    h.equal(root.names(r.player, ["removeKey"]), ["removeKey"], "left the queue: its entry is being removed")
    h.equal(r.player.holds(k[1]), false, "left the queue: and the player no longer counts it as held")
    r.player.clearCalls()
    r.player.currentKey = k[1]
    r.player.loading(k[1])
    h.equal([root.shown(r), r.player.names()], [["playing", "A", 0], ["stopPlayback"]],
      "left the queue: mpv is told to stop, and nothing is shown of it")
    r.player.started(k[1])
    h.equal(root.shown(r), ["playing", "A", 0], "left the queue: its start is not followed either")
    r.player.idle()
    h.equal([root.shown(r), r.player.names()], [["idle", "", -1], ["stopPlayback", "shutdown"]],
      "left the queue: mpv's idle then ends playing")
  }

  function whileARequestIsPending() {
    var h = root.h
    var r = root.playing("ABCD", 1)
    var k = r.keys
    // The user asked for the last item; a media key arrives before its
    // lookup has answered.
    r.playback.queuePlay(k[3])
    r.player.clearCalls()
    r.player.currentKey = k[0]
    r.player.loading(k[0])
    h.equal(root.shown(r), ["resolving", "D", 3], "pending: mpv's own move is not followed")
    h.equal(r.player.calls, [], "pending: and not fought either: the replace is on its way")
    root.start(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "D", 3], [k[2], k[3]]],
      "pending: the track that was asked for plays")
  }
}
