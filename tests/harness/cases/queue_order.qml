import QtQuick
import "../../../lib/Const.js" as Const

// The queue of core/Playback.qml against a scripted player and a scripted
// resolver: tracks are added, played in order, skipped over, moved, removed
// and cleared, and after each step the queue, the position in it and the
// playlist mpv would hold are what they should be. The scripted player
// keeps that playlist the way mpv does, so a command that hit the wrong
// entry shows up as a playlist without the track that plays.
QtObject {
  id: root

  property var h: null
  // Whether the scripted player shows its own commands in its copy of the
  // playlist at once, as the real one does, or only when mpv reports.
  property bool eager: false

  function run(h) {
    var rows = [
      root.addingFromIdle, root.playingThrough, root.nextNotReady, root.navigating, root.playingARow,
      root.moving, root.removing, root.removingTheCurrent, root.clearingTheQueue, root.editsBetweenReports,
      root.aReportThatNeverComes, root.anOlderReport, root.limits, root.saving
    ]
    // Every row twice: the queue must come out the same whichever way the
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

  // An error inside a handler does not stop a QML program, so the log is
  // part of the result.
  function quietLog() {
    var log = root.h.readFile(root.h.runDir + "/out.txt")
    var files = ["Playback.qml", "Queue.js", "FakePlayer.qml", "FakeResolver.qml", "queue_order.qml"]
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

  function rig() {
    var h = root.h
    var r = { patches: [] }
    r.player = h.mount("tests/harness/FakePlayer.qml", { duration: 200, eager: root.eager })
    r.resolver = h.mount("tests/harness/FakeResolver.qml", {})
    r.playback = h.mount("core/Playback.qml", {
      player: r.player, resolver: r.resolver, hold: false, persistHistory: true
    })
    r.playback.store = { patch: function(changes) { r.patches.push(JSON.parse(JSON.stringify(changes))) } }
    return r
  }

  // The parts of YouTube and of mpv after a request: every lookup that
  // waits is answered, and mpv reports its playlist, until both are quiet.
  function settle(r) {
    for (var i = 0; i < 4; i++) {
      while (r.resolver.pending() > 0) r.resolver.succeed()
      r.player.report()
    }
  }

  // The same for a start: the lookup of the current item answers, mpv
  // reports the new playlist, opens the file and plays it.
  function start(r) {
    var item = r.playback.current
    r.resolver.succeedFor(item.id)
    r.player.report()
    root.opens(r, item.key)
    r.player.begin(item.key)
    root.settle(r)
    return item.key
  }

  // mpv opens an entry, which it can only do with one it holds.
  function opens(r, key) {
    root.h.check(r.player.open(key), "mpv holds the entry it opens")
  }

  // mpv ends the track that plays and goes on to the next entry it holds.
  function advance(r, toKey) {
    r.player.ended(r.player.currentKey, "eof", "")
    root.opens(r, toKey)
    r.player.begin(toKey)
    root.settle(r)
  }

  // A queue of these letters with the first one playing.
  function playing(letters) {
    var r = root.rig()
    for (var i = 0; i < letters.length; i++) r.playback.enqueueTrack(root.track(letters[i]))
    root.start(r)
    r.player.clearCalls()
    r.resolver.clearCalls()
    return r
  }

  function keys(r) {
    return r.playback.queue.map(function(item) { return item.key })
  }

  function order(r) {
    return r.playback.queue.map(function(item) { return item.id[0] }).join("")
  }

  function shown(r) {
    return [r.playback.status, root.order(r), r.playback.queueIndex]
  }

  function loads(r) {
    return r.player.calls.filter(function(call) { return call.name === "load" }).map(function(call) {
      return [call.args[0], call.args[1], call.args[4].mode, call.args[4].index]
    })
  }

  function removed(r) {
    return r.player.calls.filter(function(call) { return call.name === "removeKey" }).map(function(call) {
      return call.args[0]
    })
  }

  function lookups(r, name) {
    return r.resolver.calls.filter(function(call) { return call.name === name }).map(function(call) {
      return call.args
    })
  }

  // ---- Rows ----

  function addingFromIdle() {
    var h = root.h
    var r = root.rig()
    h.check(r.playback.enqueueTrack(root.track("A")), "add: accepted")
    h.equal(root.shown(r), ["resolving", "A", 0], "add: with nothing playing, the track starts")
    h.check(r.playback.enqueueTrack(root.track("B")), "add: a second one")
    h.equal(r.playback.enqueueId(root.id("C")), "ok", "add: a third one, by its id")
    h.equal(root.shown(r), ["resolving", "ABC", 0], "add: they wait behind the first")
    h.equal(root.keys(r), [1, 2, 3], "add: each insertion has its own key")
    h.equal(r.playback.queue.map(function(item) { return item.auto }), [false, false, false],
      "add: none is marked as added by autoplay")
    h.equal([r.playback.queue[2].title, r.playback.queue[2].live], ["", true],
      "add: one added by its id has no title yet")
    h.equal(root.lookups(r, "ensure"), [[root.id("A"), "play"]], "add: one lookup, for the one that starts")
    h.equal(r.player.calls, [], "add: the player is not touched yet")
    h.equal(r.playback.keepIds(), [root.id("A"), root.id("B")], "add: the current and the next are kept")

    h.check(r.playback.enqueueTrack({ id: "not an id", title: "x" }) === false, "add: no track, refused")
    h.equal(r.playback.enqueueId("nope"), "invalid", "add: no id, refused")
    h.check(r.playback.enqueueTrack(null) === false, "add: nothing, refused")
    h.equal(root.shown(r), ["resolving", "ABC", 0], "add: a refusal changes nothing")

    // The same video twice is two items.
    h.check(r.playback.enqueueTrack(root.track("A")), "add: the same video again")
    h.equal([root.order(r), root.keys(r)], ["ABCA", [1, 2, 3, 4]], "add: as a second item of its own")

    var held = root.rig()
    held.playback.hold = true
    h.equal([held.playback.enqueueTrack(root.track("A")), held.playback.enqueueId(root.id("B"))],
      [false, "unavailable"], "add: refused while nothing may start")
    h.equal([root.shown(held), held.resolver.calls], [["idle", "", -1], []], "add: and nothing changed")
  }

  function playingThrough() {
    var h = root.h
    var r = root.rig()
    r.playback.enqueueTrack(root.track("A"))
    r.playback.enqueueTrack(root.track("B"))
    r.playback.enqueueTrack(root.track("C"))
    var keyA = root.start(r)
    var k = root.keys(r)
    h.equal(root.shown(r), ["playing", "ABC", 0], "through: the first plays")
    h.equal(root.loads(r),
      [[k[0], root.id("A"), "replace", undefined], [k[1], root.id("B"), "append-play", -1]],
      "through: the first replaces, the second is appended so that mpv can go on by itself")
    h.equal(root.lookups(r, "ensure"), [[root.id("A"), "play"], [root.id("B"), "next"]],
      "through: the second was looked up in the background")
    h.equal([keyA, r.player.playlist()], [k[0], [k[0], k[1]]], "through: mpv holds the first two")

    r.player.clearCalls()
    r.player.ended(k[0], "eof", "")
    h.equal([root.shown(r), r.player.calls], [["playing", "ABC", 0], []],
      "through: at its end nothing is asked of mpv, which holds the next")
    root.opens(r, k[1])
    h.equal(root.shown(r), ["loading", "ABC", 1], "through: mpv opens the second, and the queue follows")
    r.player.begin(k[1])
    root.settle(r)
    h.equal(root.shown(r), ["playing", "ABC", 1], "through: the second plays")
    h.equal(r.player.playlist(), k, "through: mpv holds all three now")
    h.equal(root.loads(r), [[k[2], root.id("C"), "append-play", -1]], "through: only the third was added")
    h.equal(r.playback.queue[2].title, "Fake title", "through: the one added by its id got its title")
    h.equal(r.playback.keepIds(), [root.id("A"), root.id("B"), root.id("C")], "through: all three are kept")

    r.player.clearCalls()
    root.advance(r, k[2])
    h.equal(root.shown(r), ["playing", "ABC", 2], "through: the third plays")
    h.equal([root.removed(r), root.loads(r), r.player.playlist()], [[k[0]], [], [k[1], k[2]]],
      "through: the first has left mpv's playlist, nothing was added")

    r.player.clearCalls()
    r.player.ended(k[2], "eof", "")
    h.equal(root.shown(r), ["idle", "ABC", -1], "through: after the last one, idle; the queue stays")
    h.equal(r.player.names(), ["shutdown"], "through: mpv is told to quit")
    h.equal(r.playback.recents.map(function(t) { return t.id[0] }).join(""), "CBA",
      "through: recently played, latest first")
    h.equal(r.playback.keepIds(), [], "through: nothing is kept when nothing is current")
    h.equal([r.playback.next(), r.playback.playPause()], [false, false],
      "through: with no current item there is nothing to go on to or to resume")
  }

  function nextNotReady() {
    var h = root.h
    var r = root.rig()
    r.playback.enqueueTrack(root.track("A"))
    r.playback.enqueueTrack(root.track("B"))
    var k = root.keys(r)
    r.resolver.succeedFor(root.id("A"))
    r.player.report()
    root.opens(r, k[0])
    r.player.begin(k[0])
    h.equal(r.resolver.purposes(), ["next"], "not ready: the lookup of the second is still running")
    r.player.clearCalls()
    r.resolver.clearCalls()
    r.player.ended(k[0], "eof", "")
    h.equal(root.shown(r), ["resolving", "AB", 1], "not ready: the second is started like any other track")
    h.equal(root.lookups(r, "ensure"), [[root.id("B"), "play"]], "not ready: with a lookup for playing")
    h.equal(r.player.calls, [], "not ready: mpv is left alone")
    // mpv, with nothing to move to, reports that it is idle.
    r.player.idle()
    h.equal(root.shown(r), ["resolving", "AB", 1], "not ready: its idle is not taken for a stop")
    h.equal(r.resolver.succeedFor(root.id("B")), 2, "not ready: one answer serves both lookups")
    h.equal(root.loads(r), [[k[1], root.id("B"), "replace", undefined]], "not ready: one load, replacing")
    r.player.report()
    root.opens(r, k[1])
    r.player.begin(k[1])
    root.settle(r)
    h.equal(root.shown(r), ["playing", "AB", 1], "not ready: it plays")
    h.equal(r.player.playlist(), [k[0], k[1]], "not ready: with the first put back in front of it")
  }

  function navigating() {
    var h = root.h
    var r = root.playing("ABC")
    var k = root.keys(r)
    h.equal(r.player.playlist(), [k[0], k[1]], "navigate: set-up")

    h.check(r.playback.next(), "navigate: next is accepted")
    h.equal(root.shown(r), ["resolving", "ABC", 1], "navigate: on to the second")
    h.equal(root.removed(r), [k[1]], "navigate: the entries mpv could wander into leave at once")
    h.equal(r.player.playlist(), [k[0]], "navigate: the track that plays stays until it is replaced")
    root.start(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "ABC", 1], k],
      "navigate: the second plays between its neighbours")
    h.equal(root.loads(r).slice(-2),
      [[k[0], root.id("A"), "insert-at", 0], [k[2], root.id("C"), "append-play", -1]],
      "navigate: the one before goes in front, the one after at the end")

    r.player.clearCalls()
    r.resolver.clearCalls()
    r.player.position = 50
    h.check(r.playback.previous(), "navigate: previous, well into the track")
    h.equal([root.shown(r), r.player.calls], [["playing", "ABC", 1], [{ name: "seek", args: [0] }]],
      "navigate: goes back to its start")
    r.player.position = 2
    h.check(r.playback.previous(), "navigate: previous, right at the start")
    h.equal(root.shown(r), ["resolving", "ABC", 0], "navigate: goes to the item before")
    h.equal(root.removed(r), [k[2], k[0]],
      "navigate: again everything but the playing entry leaves, from the back")
    root.start(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "ABC", 0], [k[0], k[1]]],
      "navigate: the first plays, with the second behind it")

    r.player.clearCalls()
    r.player.position = 1
    h.check(r.playback.previous(), "navigate: previous on the first item")
    h.equal([root.shown(r), r.player.names()], [["playing", "ABC", 0], ["seek"]],
      "navigate: starts it again, there being nothing before it")

    r.playback.next()
    root.start(r)
    r.playback.next()
    root.start(r)
    h.equal(root.shown(r), ["playing", "ABC", 2], "navigate: on to the last")
    r.resolver.clearCalls()
    h.check(r.playback.next() === false, "navigate: next on the last item declines")
    h.equal([root.shown(r), r.resolver.calls], [["playing", "ABC", 2], []], "navigate: and changes nothing")

    // A restored queue: nothing plays, and next starts the item after the
    // one that was current.
    var idle = root.rig()
    idle.playback.restore({ recents: [], queue: { items: [root.track("A"), root.track("B")], index: 0 } })
    h.check(idle.playback.next(), "navigate: next on a restored queue")
    h.equal(root.shown(idle), ["resolving", "AB", 1], "navigate: starts its second item")
  }

  function playingARow() {
    var h = root.h
    var r = root.playing("ABC")
    var k = root.keys(r)
    h.check(r.playback.queuePlay(k[2]), "row: accepted")
    h.equal(root.shown(r), ["resolving", "ABC", 2], "row: that item is current")
    h.equal(root.removed(r).indexOf(k[0]), -1, "row: the playing entry is not removed")
    root.start(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "ABC", 2], [k[1], k[2]]], "row: it plays")
    h.check(r.playback.queuePlay(999) === false, "row: an unknown key declines")
    h.check(r.playback.queuePlay(0) === false, "row: so does no key")
    h.equal(root.shown(r), ["playing", "ABC", 2], "row: and nothing changes")

    // The row that plays: it begins again.
    r.player.clearCalls()
    h.check(r.playback.queuePlay(k[2]), "row: the playing row")
    h.equal([root.shown(r), root.removed(r).indexOf(k[2])], [["resolving", "ABC", 2], -1],
      "row: is looked up again, and its entry stays meanwhile")
    r.resolver.succeedFor(root.id("C"))
    h.equal(root.loads(r).slice(-1), [[k[2], root.id("C"), "replace", undefined]], "row: and replaces itself")
  }

  function moving() {
    var h = root.h
    var r = root.playing("ABCD")
    var k = root.keys(r)
    r.playback.next()
    root.start(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "ABCD", 1], [k[0], k[1], k[2]]],
      "move: set-up")
    r.player.clearCalls()

    h.check(r.playback.queueMove(k[3], -1), "move: the last one up")
    root.settle(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "ABDC", 1], [k[0], k[1], k[3]]],
      "move: the new neighbour takes the old one's place in mpv's playlist")
    h.equal(root.loads(r).filter(function(load) { return load[2] === "replace" }), [],
      "move: the track that plays is not loaded again")

    h.check(r.playback.queueMove(k[1], 1), "move: the current one down")
    root.settle(r)
    h.equal([root.shown(r), r.playback.current.key], [["playing", "ADBC", 2], k[1]],
      "move: it stays the current item, wherever it lands")
    h.equal(r.player.playlist(), [k[3], k[1], k[2]], "move: and mpv's playlist is shaped around it again")

    h.check(r.playback.queueMove(k[0], -1) === false, "move: the first cannot go further up")
    h.check(r.playback.queueMove(k[0], 0) === false, "move: by nothing is no move")
    h.check(r.playback.queueMove(999, 1) === false, "move: an unknown key declines")
    h.equal(root.shown(r), ["playing", "ADBC", 2], "move: a refusal changes nothing")
    h.check(r.playback.queueMove(k[0], 99), "move: far down stops at the end")
    h.equal(root.shown(r), ["playing", "DBCA", 1], "move: the position of the current item follows")
  }

  function removing() {
    var h = root.h
    var r = root.playing("ABCD")
    var k = root.keys(r)
    r.playback.next()
    root.start(r)
    r.player.clearCalls()

    h.check(r.playback.queueRemove(k[2]), "remove: the next one")
    root.settle(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "ABD", 1], [k[0], k[1], k[3]]],
      "remove: the one after it moves up, in mpv's playlist too")
    h.check(r.playback.queueRemove(k[0]), "remove: the one before")
    root.settle(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "BD", 0], [k[1], k[3]]],
      "remove: the position follows")
    h.check(r.playback.queueRemove(999) === false, "remove: an unknown key declines")
    h.check(r.playback.queueRemove(k[0]) === false, "remove: so does one that is gone")
    h.equal(root.removed(r).indexOf(k[1]), -1, "remove: the playing entry was never removed")
    h.equal(root.loads(r).filter(function(load) { return load[2] === "replace" }), [],
      "remove: and never loaded again")
  }

  function removingTheCurrent() {
    var h = root.h
    var r = root.playing("ABC")
    var k = root.keys(r)
    h.check(r.playback.queueRemove(k[0]), "remove current: accepted")
    h.equal(root.shown(r), ["resolving", "BC", 0], "remove current: the item after it is started")
    h.equal(r.player.playlist(), [k[0]], "remove current: what plays goes on until it is replaced")
    root.start(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "BC", 0], [k[1], k[2]]],
      "remove current: the successor plays")

    r.playback.next()
    root.start(r)
    r.player.clearCalls()
    h.check(r.playback.queueRemove(k[2]), "remove current: the last item, while it plays")
    h.equal([root.shown(r), r.player.names()], [["idle", "B", -1], ["shutdown"]],
      "remove current: nothing follows, so playing ends")

    // Nothing plays: the item after it takes its place and waits.
    var idle = root.rig()
    idle.playback.restore({ recents: [], queue: { items: [root.track("A"), root.track("B")], index: 0 } })
    h.check(idle.playback.queueRemove(idle.playback.queue[0].key), "remove current: in a restored queue")
    h.equal([root.shown(idle), idle.player.calls], [["idle", "B", 0], []],
      "remove current: nothing starts by that")

    // A track in error: the error goes with it.
    var failed = root.rig()
    failed.playback.enqueueTrack(root.track("A"))
    failed.playback.enqueueTrack(root.track("B"))
    failed.resolver.fail("E_NETWORK")
    h.equal([failed.playback.status, failed.playback.errorCode], ["error", "E_NETWORK"],
      "remove current: set-up")
    h.check(failed.playback.queueRemove(failed.playback.queue[0].key), "remove current: the failed track")
    h.equal([root.shown(failed), failed.playback.errorCode], [["idle", "B", 0], ""],
      "remove current: leaves the next one waiting, without the error")
  }

  function clearingTheQueue() {
    var h = root.h
    var r = root.playing("ABC")
    var k = root.keys(r)
    r.playback.next()
    root.start(r)
    r.player.clearCalls()
    r.playback.queueClear()
    root.settle(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "B", 0], [k[1]]],
      "clear: the track that plays stays, alone")
    h.equal(root.removed(r).sort(), [k[0], k[2]].sort(), "clear: its neighbours left mpv's playlist")
    h.equal(r.playback.recents.length, 2, "clear: what was played is not forgotten by this")

    r.playback.stop()
    r.playback.restore({ recents: [], queue: { items: [root.track("A"), root.track("B")], index: 1 } })
    r.playback.queueClear()
    h.equal(root.shown(r), ["idle", "", -1], "clear: with nothing playing the queue is emptied")

    // Clearing the history keeps the current track too, and forgets the rest.
    var c = root.playing("ABC")
    var ck = root.keys(c)
    c.playback.next()
    root.start(c)
    c.player.clearCalls()
    c.playback.clearHistory()
    root.settle(c)
    h.equal([root.shown(c), c.playback.recents, c.player.playlist()], [["playing", "B", 0], [], [ck[1]]],
      "clear history: the queue is cut down to what plays, in mpv's playlist as well")
    h.equal(c.patches[c.patches.length - 1], {
      recents: [], queue: { items: [{
        id: root.id("B"), title: "Fake title", channel: "Fake channel", duration: 200, live: false,
        auto: false
      }], index: 0 }
    }, "clear history: and that is what the store is handed")
  }

  // The player turns a key into a position through mpv's last report. A
  // step planned from an older report would hit another entry.
  function editsBetweenReports() {
    var h = root.h
    if (root.eager) return
    var r = root.playing("ABCD")
    var k = root.keys(r)
    r.playback.next()
    root.start(r)
    h.equal(r.player.playlist(), [k[0], k[1], k[2]], "between reports: set-up, the second plays")
    r.player.clearCalls()

    // mpv goes on to the third by itself. The first leaves its playlist,
    // which mpv has not reported yet when the user removes the second.
    r.player.ended(k[1], "eof", "")
    root.opens(r, k[2])
    h.equal([root.removed(r), r.player.playlist()], [[k[0]], [k[1], k[2]]],
      "between reports: the first leaves")
    h.check(r.playback.queueRemove(k[1]), "between reports: the second is removed from the queue")
    h.equal(root.removed(r), [k[0]], "between reports: nothing more is sent before mpv has reported")
    h.equal(r.player.playlist(), [k[1], k[2]], "between reports: so the playing entry is untouched")
    r.player.report()
    h.equal([root.removed(r), r.player.playlist()], [[k[0], k[1]], [k[2]]],
      "between reports: once it has, the second leaves, and only the second")
    r.player.begin(k[2])
    root.settle(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "ACD", 1], [k[0], k[2], k[3]]],
      "between reports: the window ends up around the track that plays")
    h.equal(root.loads(r).filter(function(load) { return load[2] === "replace" }), [],
      "between reports: which was never loaded again")

    // Several edits in a row, each before the report of the one before.
    r.player.clearCalls()
    r.playback.queueRemove(k[3])
    r.playback.queueRemove(k[0])
    r.playback.enqueueTrack(root.track("E"))
    h.equal(root.removed(r), [k[3]], "between reports: of three edits only the first is sent at once")
    root.settle(r)
    var e = r.playback.queue[1].key
    h.equal([root.shown(r), r.player.playlist()], [["playing", "CE", 0], [k[2], e]],
      "between reports: and the rest follows report by report")
  }

  // Should mpv never report the playlist a plan leads to, the wait ends by
  // itself and the next plan starts from what mpv has reported by then.
  function aReportThatNeverComes() {
    var h = root.h
    if (root.eager) return
    var r = root.playing("ABC")
    var k = root.keys(r)
    r.player.clearCalls()
    // The second item leaves mpv's playlist, and mpv reports a playlist no
    // plan of ours leads to: something else has added an entry.
    r.playback.queueMove(k[2], -1)
    h.equal(root.removed(r), [k[1]], "no report: set-up, a plan was sent")
    r.player.entryKeys = [k[0], 999]
    r.resolver.succeedFor(root.id("C"))
    h.equal([root.removed(r), root.loads(r)], [[k[1]], []],
      "no report: nothing is sent while the last plan is not confirmed")
    var timers = []
    var parts = r.playback.resources
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i]
      if (typeof part.interval === "number" && typeof part.triggered === "function") timers.push(part)
    }
    var wait = timers.filter(function(timer) { return timer.interval === Const.TIMEOUTS.replyMs })
    h.equal([timers.length, wait.length], [2, 1], "no report: one timer bounds the wait")
    h.check(wait[0].running === true && wait[0].repeat === false, "no report: it runs, once")
    wait[0].triggered()
    h.equal([root.removed(r), root.loads(r)], [[k[1], 999], [[k[2], root.id("C"), "append-play", -1]]],
      "no report: when it fires, the plan is made from the playlist as reported")
    r.player.report()
    h.check(wait[0].running === false, "no report: and it rests once mpv has confirmed")
  }

  // A player that shows its own commands at once is corrected by mpv's
  // reports afterwards, and the first of those can be older than the last
  // command: mpv reports the state after each step. Such a report must not
  // be planned from.
  function anOlderReport() {
    var h = root.h
    if (!root.eager) return
    var r = root.playing("ABC")
    var k = root.keys(r)
    r.playback.next()
    root.start(r)
    h.equal(r.player.playlist(), k, "older report: set-up, the second plays between its neighbours")
    r.player.clearCalls()
    r.playback.queueClear()
    h.equal([root.removed(r), r.player.entryKeys], [[k[2], k[0]], [k[1]]],
      "older report: two removals, which the player shows at once")
    // Something that plans again, with nothing to send.
    r.playback.enqueueTrack(root.track("E"))
    h.equal(root.removed(r).length, 2, "older report: set-up, a further plan sends nothing")
    // mpv's report of the playlist after the first removal only.
    r.player.entryKeys = [k[0], k[1]]
    h.equal(root.removed(r), [k[2], k[0]], "older report: nothing is sent on a report that is behind")
    h.equal(r.player.playlist(), [k[1]], "older report: so the entry that plays is still there")
    r.player.report()
    root.settle(r)
    var e = r.playback.queue[1].key
    h.equal([root.shown(r), r.player.playlist()], [["playing", "BE", 0], [k[1], e]],
      "older report: and once mpv has caught up, the queue goes on as usual")
  }

  function limits() {
    var h = root.h
    var r = root.rig()
    var answers = new Map()
    for (var i = 0; i < Const.LIMITS.queueItems; i++) {
      var answer = r.playback.enqueueId(root.id("A"))
      answers.set(answer, (answers.get(answer) || 0) + 1)
    }
    h.equal([answers.get("ok"), r.playback.queue.length], [Const.LIMITS.queueItems, Const.LIMITS.queueItems],
      "limit: a full queue of the same video, each an item of its own")
    h.equal(r.playback.enqueueId(root.id("B")), "full", "limit: one more is refused as full")
    h.check(r.playback.enqueueTrack(root.track("B")) === false, "limit: as a row too")
    h.equal(r.playback.queue.length, Const.LIMITS.queueItems, "limit: and the queue stays as it is")
    h.equal(root.lookups(r, "ensure").length, 1, "limit: one lookup in all, for the one that started")
    h.check(r.playback.queueRemove(r.playback.queue[5].key), "limit: after a removal")
    h.equal(r.playback.enqueueId(root.id("B")), "ok", "limit: there is room again")
  }

  function saving() {
    var h = root.h
    var r = root.playing("AB")
    r.playback.next()
    root.start(r)
    var last = r.patches[r.patches.length - 1]
    h.equal(last.queue.index, 1, "saved: the position")
    h.equal(last.queue.items.map(function(item) { return Object.keys(item).sort().join(",") }), [
      "auto,channel,duration,id,live,title", "auto,channel,duration,id,live,title"
    ], "saved: tracks with their autoplay mark, and no key")
    h.equal(last.queue.items.map(function(item) { return item.id }), [root.id("A"), root.id("B")],
      "saved: in queue order")

    // A new service: the queue is back, and nothing plays.
    var again = root.rig()
    again.playback.restore(last)
    h.equal(root.shown(again), ["idle", "AB", 1], "restored: the queue and its position")
    h.equal([again.player.calls, again.resolver.calls, again.patches], [[], [], []],
      "restored: nothing is started, looked up or written")
    h.equal(again.playback.current.id, root.id("B"), "restored: the current item waits")
    h.check(again.playback.playPause(), "restored: until the user plays it")
    h.equal(root.shown(again), ["resolving", "AB", 1], "restored: then it starts")
  }
}
