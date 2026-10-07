import QtQuick

// What a failed track does to a queue, in core/Playback.qml against a
// scripted player and resolver. Some failures say that this one track is
// the problem (it is private, it was removed): the queue goes on with a
// notice. Others say that the network, the tools or the service as a whole
// is the problem: going on would only fail track after track, so the queue
// stops on the track with its error, mpv is shut down, and the next track
// is not started, even though mpv, which holds it, has already begun to.
QtObject {
  id: root

  property var h: null
  // Whether the scripted player shows its own commands in its copy of the
  // playlist at once, as the real one does, or only when mpv reports.
  property bool eager: false

  readonly property string prematureEof: "premature-eof"
  readonly property string noData: "no audio or video data played"

  function run(h) {
    var rows = [
      root.brokeOffTwice, root.stopClassLookups, root.playerFailures, root.skipClassLookup,
      root.skipClassInsideMpv, root.skipWithoutAHeldEntry, root.threeInARow, root.aStartResetsTheCount,
      root.lastTrack
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
    var files = ["Playback.qml", "Queue.js", "Recover.js", "FakePlayer.qml", "FakeResolver.qml",
      "queue_stop_class.qml"]
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

  function rig(letters) {
    var h = root.h
    var r = { states: [] }
    r.player = h.mount("tests/harness/FakePlayer.qml", { duration: 200, eager: root.eager })
    r.resolver = h.mount("tests/harness/FakeResolver.qml", {})
    r.playback = h.mount("core/Playback.qml", {
      player: r.player, resolver: r.resolver, hold: false, persistHistory: true
    })
    for (var i = 0; i < letters.length; i++) r.playback.enqueueTrack(root.track(letters[i]))
    r.keys = r.playback.queue.map(function(item) { return item.key })
    r.playback.statusChanged.connect(function() { r.states.push(r.playback.status) })
    return r
  }

  function settle(r) {
    for (var i = 0; i < 4; i++) {
      while (r.resolver.pending() > 0) r.resolver.succeed()
      r.player.report()
    }
  }

  // The lookup of the current item answers and mpv plays it; then the
  // item after it is looked up and joins mpv's playlist.
  function start(r) {
    var item = r.playback.current
    r.resolver.succeedFor(item.id)
    r.player.report()
    root.h.check(r.player.open(item.key), "set-up: mpv holds the entry it opens")
    r.player.begin(item.key)
    root.settle(r)
  }

  function playing(letters) {
    var r = root.rig(letters)
    root.start(r)
    root.quiet(r)
    return r
  }

  function quiet(r) {
    r.player.clearCalls()
    r.resolver.clearCalls()
    r.states.length = 0
  }

  // After a failed file mpv starts the next entry of its playlist within
  // microseconds. This sends what the player would then report, whether or
  // not anybody still listens.
  function mpvStartsByItself(r, key) {
    r.player.currentKey = key
    r.player.loading(key)
    r.player.phase = "playing"
    r.player.started(key)
  }

  function shown(r) {
    var item = r.playback.current
    return [r.playback.status, r.playback.errorCode, item === null ? "" : item.id[0]]
  }

  function loadsOf(r, key) {
    return r.player.calls.filter(function(call) {
      return call.name === "load" && call.args[0] === key
    }).length
  }

  function playLookups(r, letter) {
    return r.resolver.calls.filter(function(call) {
      return call.args[0] === root.id(letter) && (call.name === "refresh"
        || (call.name === "ensure" && call.args[1] === "play"))
    }).length
  }

  // ---- Rows ----

  // A stream that breaks off gets one recovery. Breaking off again before
  // it has played on for half a minute is the network, not the track.
  function brokeOffTwice() {
    var h = root.h
    var r = root.playing("AB")
    var k = r.keys
    h.equal([root.shown(r), r.player.playlist(), r.player.holds(k[1])], [["playing", "", "A"], k, true],
      "broke off: set-up, mpv holds the next entry")

    r.player.position = 50
    r.player.ended(k[0], "error", root.prematureEof)
    h.equal(root.shown(r), ["resolving", "", "A"], "broke off: the first time, the track is looked up again")
    h.equal([r.player.names(), r.resolver.names().filter(function(n) { return n !== "retain" })],
      [["stopPlayback"], ["refresh"]], "broke off: after mpv was told to stop, so that it does not go on")
    r.resolver.succeedFor(root.id("A"))
    var load = r.player.calls[r.player.calls.length - 1]
    h.equal([load.name, load.args[0], load.args[4].mode, load.args[4].startAt], ["load", k[0], "replace", 50],
      "broke off: and loaded where it stopped")
    r.player.report()
    h.check(r.player.open(k[0]), "broke off: mpv opens it")
    r.player.begin(k[0])
    root.settle(r)
    h.equal([root.shown(r), r.player.playlist(), r.player.holds(k[1])], [["playing", "", "A"], k, true],
      "broke off: it plays again, and mpv holds the next entry again")

    root.quiet(r)
    r.player.position = 60
    r.player.ended(k[0], "error", root.prematureEof)
    h.equal(root.shown(r), ["error", "E_NETWORK", "A"],
      "broke off: the second time, the queue stops with the error")
    h.equal([r.player.names(), r.player.mpvState], [["shutdown"], "off"], "broke off: mpv is shut down")
    h.equal(r.playback.queueIndex, 0, "broke off: the position stays on the track that failed")
    // mpv had already begun the next entry when it was told to quit.
    root.mpvStartsByItself(r, k[1])
    r.player.idle()
    h.equal(root.shown(r), ["error", "E_NETWORK", "A"], "broke off: what mpv still reports changes nothing")
    h.equal(r.states, ["error"], "broke off: error, and never loading afterwards")
    h.equal([root.loadsOf(r, k[1]), root.playLookups(r, "B")], [0, 0],
      "broke off: the next item was not started")
    h.equal([r.player.names(), r.resolver.names()], [["shutdown"], []],
      "broke off: nothing else was asked for")
    h.equal(r.playback.noticeCode, "", "broke off: and no track was skipped")

    // The user tries again: the same track, with a new lookup.
    h.check(r.playback.playPause(), "broke off: play is accepted in error")
    h.equal([root.shown(r), root.playLookups(r, "A"), root.playLookups(r, "B")],
      [["resolving", "", "A"], 1, 0],
      "broke off: and tries the failed track, not the next")
  }

  function stopClassLookups() {
    var h = root.h
    var codes = ["E_NETWORK", "E_TIMEOUT", "E_YT_BLOCKED", "E_YTDLP_MISSING", "E_TOOLS_MISSING", "E_STREAM"]
    for (var i = 0; i < codes.length; i++) {
      var r = root.playing("ABC")
      r.playback.next()
      root.quiet(r)
      r.resolver.failFor(root.id("B"), codes[i])
      h.equal(root.shown(r), ["error", codes[i], "B"], codes[i] + " on a lookup: the queue stops there")
      h.equal([r.player.names(), root.playLookups(r, "C"), r.playback.noticeCode], [["shutdown"], 0, ""],
        codes[i] + " on a lookup: mpv is off, the item after it is not tried, nothing was skipped")
    }
  }

  function playerFailures() {
    var h = root.h
    var codes = ["E_TIMEOUT", "E_MPV_START", "E_MPV_MISSING"]
    for (var i = 0; i < codes.length; i++) {
      var r = root.playing("AB")
      r.player.failed(codes[i])
      h.equal([root.shown(r), root.playLookups(r, "B")], [["error", codes[i], "A"], 0],
        codes[i] + " from the player: the queue stops there")
    }
    var crashed = root.playing("AB")
    crashed.player.exited(true)
    h.equal([root.shown(crashed), root.playLookups(crashed, "B")], [["error", "E_MPV_EXITED", "A"], 0],
      "a crashed mpv: the queue stops there")
  }

  // A lookup that fails because of the track: nothing failed inside mpv,
  // so mpv starts nothing by itself, and the next track is asked for.
  function skipClassLookup() {
    var h = root.h
    var codes = ["E_YT_REFUSED", "E_NEEDS_ACCOUNT", "E_NOT_STARTED", "E_BAD_OUTPUT", "E_YTDLP_FAILED"]
    for (var i = 0; i < codes.length; i++) {
      var r = root.playing("ABC")
      var k = r.keys
      r.playback.next()
      root.quiet(r)
      r.resolver.failFor(root.id("B"), codes[i])
      h.equal(root.shown(r), ["resolving", "", "C"], codes[i] + " on a lookup: on to the item after it")
      h.equal([r.playback.noticeCode, root.playLookups(r, "C")], ["N_SKIPPED", 1],
        codes[i] + " on a lookup: with a notice and a lookup for playing")
      h.equal(r.player.names().filter(function(n) { return n !== "removeKey" }), [],
        codes[i] + " on a lookup: mpv is not stopped; what plays goes on meanwhile")
      root.start(r)
      h.equal([root.shown(r), r.playback.queueIndex], [["playing", "", "C"], 2], codes[i] + ": it plays")
      h.equal(r.states.indexOf("error"), -1, codes[i] + ": never an error on the way")
      r.playback.dismissNotice()
      h.equal(r.playback.noticeCode, "", codes[i] + ": the notice can be dismissed")
    }

    // Going back to an item that cannot be looked up: the track that
    // follows it is the one still playing, which starts again.
    var b = root.playing("AB")
    b.playback.next()
    root.start(b)
    root.quiet(b)
    b.player.position = 1
    b.playback.previous()
    b.resolver.failFor(root.id("A"), "E_YT_REFUSED")
    h.equal([root.shown(b), root.playLookups(b, "B")], [["resolving", "", "B"], 1],
      "a skip back onto the playing track: a start request, never a wait")
    b.resolver.succeedFor(root.id("B"))
    var load = b.player.calls[b.player.calls.length - 1]
    h.equal([load.name, load.args[0], load.args[4].mode], ["load", b.keys[1], "replace"],
      "a skip back onto the playing track: it is loaded again")
  }

  // A file that fails inside mpv for a reason of its own, with the next
  // entry held: mpv is already on its way there, and is followed.
  function skipClassInsideMpv() {
    var h = root.h
    var r = root.playing("ABC")
    var k = r.keys
    // The one recovery a track gets.
    r.player.position = 50
    r.player.ended(k[0], "error", "audio output initialization failed")
    root.start(r)
    h.equal([root.shown(r), r.player.holds(k[1])], [["playing", "", "A"], true], "inside mpv: set-up")
    root.quiet(r)
    r.player.position = 55
    r.player.ended(k[0], "error", "audio output initialization failed")
    h.equal([root.shown(r), r.playback.queueIndex], [["loading", "", "A"], 0],
      "inside mpv: loading, the position still on the failed track")
    h.equal([r.player.calls, r.resolver.calls, r.playback.noticeCode], [[], [], "N_SKIPPED"],
      "inside mpv: nothing is asked of anybody; mpv moves by itself")
    root.mpvStartsByItself(r, k[1])
    root.settle(r)
    h.equal([root.shown(r), r.playback.queueIndex], [["playing", "", "B"], 1], "inside mpv: and is followed")
    h.equal([r.states.indexOf("error"), r.states.indexOf("idle")], [-1, -1],
      "inside mpv: never error, never idle")
    h.equal(r.player.calls.filter(function(call) {
      var replaces = call.name === "load" && call.args[4].mode === "replace"
      return call.name === "shutdown" || call.name === "stopPlayback" || replaces
    }), [], "inside mpv: mpv was not stopped and nothing was loaded over it")

    // mpv goes idle instead of opening the next entry: that ends the wait.
    var idle = root.playing("AB")
    idle.player.position = 50
    idle.player.ended(idle.keys[0], "error", "audio output initialization failed")
    root.start(idle)
    idle.player.position = 55
    idle.player.ended(idle.keys[0], "error", "audio output initialization failed")
    h.equal(root.shown(idle), ["loading", "", "A"], "inside mpv, then idle: set-up")
    idle.player.idle()
    h.equal([root.shown(idle), idle.playback.queueIndex], [["idle", "", ""], -1],
      "inside mpv, then idle: playing ends, without an error")
  }

  // The same failure when mpv does not hold the next entry: it has nothing
  // to move into, so waiting for it would never end.
  function skipWithoutAHeldEntry() {
    var h = root.h
    var r = root.rig("AB")
    var k = r.keys
    r.resolver.succeedFor(root.id("A"))
    r.player.report()
    r.player.open(k[0])
    r.player.begin(k[0])
    h.equal(r.player.holds(k[1]), false, "not held: set-up, the next item is still being looked up")
    r.player.position = 50
    r.player.ended(k[0], "error", "audio output initialization failed")
    r.resolver.succeedFor(root.id("A"))
    r.player.report()
    r.player.open(k[0])
    r.player.begin(k[0])
    root.quiet(r)
    r.player.position = 55
    r.player.ended(k[0], "error", "audio output initialization failed")
    h.equal([root.shown(r), r.playback.noticeCode], [["resolving", "", "B"], "N_SKIPPED"],
      "not held: the next item gets a start request")
    h.equal(root.playLookups(r, "B"), 1, "not held: with a lookup for playing")
  }

  function threeInARow() {
    var h = root.h
    var r = root.rig("ABCD")
    r.resolver.failFor(root.id("A"), "E_YT_REFUSED")
    h.equal([root.shown(r), r.playback.noticeCode], [["resolving", "", "B"], "N_SKIPPED"],
      "three: the first is skipped")
    r.resolver.failFor(root.id("B"), "E_YTDLP_FAILED")
    h.equal(root.shown(r), ["resolving", "", "C"], "three: the second is skipped")
    r.resolver.failFor(root.id("C"), "E_YT_REFUSED")
    h.equal(root.shown(r), ["error", "E_YT_REFUSED", "C"],
      "three: the third stops the queue, whatever its kind")
    h.equal([root.playLookups(r, "D"), r.player.names()], [0, ["shutdown"]], "three: the fourth is not tried")

    // The user plays on: the count starts again.
    h.check(r.playback.next(), "three: next is accepted in error")
    r.resolver.failFor(root.id("D"), "E_YT_REFUSED")
    h.equal(root.shown(r), ["error", "E_YT_REFUSED", "D"], "three: the last one fails with nothing after it")
    h.check(r.playback.queuePlay(r.keys[0]), "three: back to the first")
    r.resolver.failFor(root.id("A"), "E_YT_REFUSED")
    h.equal(root.shown(r), ["resolving", "", "B"],
      "three: a request by the user gets all three attempts again")
  }

  function aStartResetsTheCount() {
    var h = root.h
    var r = root.rig("ABCDE")
    r.resolver.failFor(root.id("A"), "E_YT_REFUSED")
    r.resolver.failFor(root.id("B"), "E_YT_REFUSED")
    h.equal(root.shown(r), ["resolving", "", "C"], "count: two failed, the third is tried")
    r.resolver.succeedFor(root.id("C"))
    r.player.report()
    r.player.open(r.keys[2])
    r.player.begin(r.keys[2])
    h.equal(root.shown(r), ["playing", "", "C"], "count: and plays")
    // The lookup that would have put the fourth into mpv's playlist fails,
    // which costs nothing by itself.
    h.equal(r.resolver.failFor(root.id("D"), "E_YT_REFUSED"), 1,
      "count: the early lookup of the fourth fails")
    h.equal([root.shown(r), r.playback.noticeCode], [["playing", "", "C"], "N_SKIPPED"],
      "count: which changes nothing yet")
    r.player.ended(r.keys[2], "eof", "")
    h.equal(root.shown(r), ["resolving", "", "D"], "count: at its end the fourth is tried")
    r.resolver.failFor(root.id("D"), "E_YT_REFUSED")
    h.equal(root.shown(r), ["resolving", "", "E"], "count: one that played in between set the count back")
  }

  function lastTrack() {
    var h = root.h
    var r = root.rig("AB")
    r.playback.queuePlay(r.keys[1])
    r.resolver.failFor(root.id("B"), "E_YT_REFUSED")
    h.equal([root.shown(r), r.playback.noticeCode], [["error", "E_YT_REFUSED", "B"], ""],
      "last: with nothing after it, a failed track is an error, not a skip")
  }
}
