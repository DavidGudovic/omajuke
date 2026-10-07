import QtQuick
import "../../../lib/Const.js" as Const

// Autoplay in core/Playback.qml, against a scripted player, a scripted
// resolver and a scripted source of related tracks: when the last item of
// the queue starts, related tracks are asked for once and added behind it,
// so that playing goes on. What is added is never something the queue
// holds or the session has played, and never interrupts what plays.
QtObject {
  id: root

  property var h: null

  function run(h) {
    root.h = h
    var rows = [
      root.askedOnceForTheLast, root.whatIsAdded, root.neverWhatWasPlayed, root.goingOn, root.switchedOff,
      root.endedWhileAsking, root.stoppedWhileAsking, root.somethingElseSince, root.queuedBehindTheSeed,
      root.becomesTheLast
    ]
    for (var i = 0; i < rows.length; i++) rows[i]()
    root.quietLog()
    h.finish()
  }

  function quietLog() {
    var log = root.h.readFile(root.h.runDir + "/out.txt")
    var files = ["Playback.qml", "Queue.js", "FakePlayer.qml", "FakeResolver.qml", "autoplay.qml"]
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

  // Related tracks "mix-000-000" and so on: n of them, numbered from "from".
  function related(from, n) {
    var rows = []
    for (var i = from; i < from + n; i++) {
      var digits = ("00" + i).slice(-3)
      rows.push({
        id: "mix-" + digits + "-000", title: "Related " + i, channel: "Mix", duration: 180, live: false
      })
    }
    return rows
  }

  // A playback component with autoplay on. "mix" records every question
  // for related tracks and keeps its callback until the case answers.
  function rig() {
    var h = root.h
    var r = { patches: [], mix: { asked: [], waiting: [] } }
    r.player = h.mount("tests/harness/FakePlayer.qml", { duration: 200 })
    r.resolver = h.mount("tests/harness/FakeResolver.qml", {})
    r.playback = h.mount("core/Playback.qml", {
      player: r.player, resolver: r.resolver, hold: false, persistHistory: true
    })
    // Assigned, not passed at creation: a script object handed over there
    // arrives as a copy without its functions.
    r.playback.store = { patch: function(changes) { r.patches.push(JSON.parse(JSON.stringify(changes))) } }
    r.playback.mixer = {
      mix: function(id, done) {
        r.mix.asked.push(id)
        r.mix.waiting.push(done)
      }
    }
    r.playback.settings = { autoplay: true }
    return r
  }

  function answer(r, tracks) {
    var done = r.mix.waiting.shift()
    done({ ok: true, code: "", tracks: tracks })
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
    root.h.check(r.player.open(item.key), "set-up: mpv holds the entry it opens")
    r.player.begin(item.key)
    root.settle(r)
  }

  function quiet(r) {
    r.player.clearCalls()
    r.resolver.clearCalls()
    r.patches.length = 0
  }

  function order(r) {
    return r.playback.queue.map(function(item) { return item.id })
  }

  function shown(r) {
    return [r.playback.status, r.playback.queue.length, r.playback.queueIndex]
  }

  // ---- Rows ----

  function askedOnceForTheLast() {
    var h = root.h
    var r = root.rig()
    r.playback.enqueueTrack(root.track("A"))
    r.playback.enqueueTrack(root.track("B"))
    h.equal(r.mix.asked, [], "asked: not when a track is requested")
    root.start(r)
    h.equal([root.shown(r), r.mix.asked], [["playing", 2, 0], []],
      "asked: not for a track that has one after it")
    r.playback.next()
    r.resolver.succeedFor(root.id("B"))
    r.player.report()
    r.player.open(r.playback.current.key)
    h.equal(r.mix.asked, [], "asked: not while the last one is still loading")
    r.player.begin(r.playback.current.key)
    h.equal(r.mix.asked, [root.id("B")], "asked: when the last item starts, for that video")
    root.settle(r)

    // The same item starts a second time: after a recovery, and when the
    // user plays it again.
    r.player.position = 50
    r.player.ended(r.playback.current.key, "error", "premature-eof")
    root.start(r)
    h.equal([root.shown(r), r.mix.asked.length], [["playing", 2, 1], 1],
      "asked: once, however often the item starts")
    r.playback.queuePlay(r.playback.current.key)
    root.start(r)
    h.equal(r.mix.asked.length, 1, "asked: also when the user starts it again")
    // The answer arrives after all that, and is still used.
    root.answer(r, root.related(1, 3))
    h.equal(root.shown(r), ["playing", 5, 1], "asked: the answer is added to the queue")
  }

  function whatIsAdded() {
    var h = root.h
    var r = root.rig()
    r.playback.enqueueTrack(root.track("P"))
    r.playback.enqueueTrack(root.track("A"))
    root.start(r)
    r.playback.next()
    root.start(r)
    h.equal([root.shown(r), r.mix.asked], [["playing", 2, 1], [root.id("A")]], "added: set-up")
    root.quiet(r)

    var rows = root.related(1, 24)
    // The video the tracks are related to comes first in such a list. The
    // rest holds what is in the queue already, a row twice and rows that
    // are no tracks: twenty-five rows in all, of which twenty can be added.
    rows[1].extra = "left behind"
    rows[1].key = 1
    rows[1].auto = false
    var list = [root.track("A"), root.track("P"), rows[0], rows[0], { id: "not an id", title: "x" }, null]
      .concat(rows.slice(1, 20))
    h.equal(list.length, Const.LIMITS.mixFetch, "added: set-up, a list as long as is ever read")
    root.answer(r, list.concat(rows.slice(20)))

    var q = r.playback.queue
    h.equal(root.shown(r), ["playing", 2 + Const.LIMITS.mixAppend, 1],
      "added: twenty tracks, behind the queue")
    h.equal(root.order(r).slice(0, 2), [root.id("P"), root.id("A")], "added: what was queued stays in front")
    var firstTwenty = rows.slice(0, Const.LIMITS.mixAppend).map(function(row) { return row.id })
    h.equal(root.order(r).slice(2), firstTwenty,
      "added: in the order given, each video once, without the seed and without what is queued")
    h.equal(q.slice(2).filter(function(item) { return item.auto !== true }), [],
      "added: all marked as added by autoplay")
    h.equal([q[0].auto, q[1].auto], [false, false], "added: the user's own items are not")
    var keys = q.map(function(item) { return item.key })
    h.equal(keys.filter(function(key, i) { return keys.indexOf(key) !== i }), [],
      "added: every item has its own key")
    h.equal(Object.keys(q[3]).sort(), ["auto", "channel", "duration", "id", "key", "live", "title"],
      "added: an item is built anew, with nothing a row brought along")
    h.equal([q[3].key === 1, q[3].auto], [false, true], "added: not its key, not its mark")
    h.equal(r.playback.noticeCode, "", "added: no notice")

    // What plays is not touched; the first added track is looked up in the
    // background and joins mpv's playlist.
    h.equal(r.player.calls, [], "added: nothing is asked of the player at once")
    h.equal(r.resolver.calls.filter(function(call) { return call.name === "ensure" }),
      [{ name: "ensure", args: [rows[0].id, "next"] }], "added: the first one is looked up for later")
    root.settle(r)
    h.equal(r.player.playlist(), [q[0].key, q[1].key, q[2].key],
      "added: and then waits behind the track that plays")
    var saved = r.patches[r.patches.length - 1].queue
    h.equal([saved.items.length, saved.index, saved.items[2].auto, saved.items[1].auto],
      [2 + Const.LIMITS.mixAppend, 1, true, false],
        "added: the store is handed the longer queue, marks included")
  }

  function neverWhatWasPlayed() {
    var h = root.h
    var r = root.rig()
    // Three tracks are played one after the other, each as a queue of one,
    // so that only the last is in the queue.
    r.playback.playTrack(root.track("P"))
    root.start(r)
    r.mix.waiting.shift()
    r.playback.playTrack(root.related(2, 1)[0])
    root.start(r)
    r.mix.waiting.shift()
    r.playback.playTrack(root.track("A"))
    root.start(r)
    h.equal([root.shown(r), r.mix.asked.length], [["playing", 1, 0], 3], "played: set-up")
    var rows = root.related(1, 4)
    root.answer(r, [root.track("P")].concat(rows))
    h.equal(root.order(r), [root.id("A"), rows[0].id, rows[2].id, rows[3].id],
      "played: what was played in this session is not brought back")

    // Clearing the history forgets that too.
    var c = root.rig()
    c.playback.playTrack(root.track("P"))
    root.start(c)
    c.mix.waiting.shift()
    c.playback.playTrack(root.track("A"))
    root.start(c)
    c.playback.clearHistory()
    root.answer(c, [root.track("P"), root.track("A")])
    h.equal(root.order(c), [root.id("A"), root.id("P")],
      "played: after the history was cleared, only the seed itself is left out")
  }

  function goingOn() {
    var h = root.h
    var r = root.rig()
    r.playback.playTrack(root.track("A"))
    root.start(r)
    var rows = root.related(1, 2)
    root.answer(r, rows)
    root.settle(r)
    var k = r.playback.queue.map(function(item) { return item.key })
    h.equal(r.player.playlist(), [k[0], k[1]], "going on: set-up, mpv holds the first related track")
    root.quiet(r)

    // The seed ends, and mpv goes on by itself.
    r.player.ended(k[0], "eof", "")
    h.check(r.player.open(k[1]), "going on: mpv opens the related track")
    r.player.begin(k[1])
    root.settle(r)
    h.equal([root.shown(r), r.playback.current.auto], [["playing", 3, 1], true], "going on: it plays")
    h.equal(r.mix.asked.length, 1, "going on: nothing is asked while more tracks wait")
    h.equal(r.player.names().filter(function(n) { return n === "shutdown" || n === "stopPlayback" }), [],
      "going on: mpv was never stopped")

    r.player.ended(k[1], "eof", "")
    h.check(r.player.open(k[2]), "going on: mpv opens the last one")
    r.player.begin(k[2])
    h.equal(r.mix.asked, [root.id("A"), rows[1].id],
      "going on: the last related track is asked about in its turn")
    root.answer(r, root.related(1, 5))
    h.equal(root.order(r).slice(3), root.related(3, 3).map(function(row) { return row.id }),
      "going on: and what it brings is added, without what the queue holds")
  }

  function switchedOff() {
    var h = root.h
    var off = root.rig()
    off.playback.settings = { autoplay: false }
    off.playback.playTrack(root.track("A"))
    root.start(off)
    h.equal([root.shown(off), off.mix.asked], [["playing", 1, 0], []],
      "off: with the setting off, nothing is asked")
    off.playback.settings = { autoplay: true }
    h.equal(off.mix.asked, [root.id("A")],
      "off: switched on while the last track plays, that track is asked about at once")
    off.playback.settings = { autoplay: true }
    h.equal(off.mix.asked.length, 1, "off: once, however often the settings arrive")
    // Switched off again before the answer is there: it is not wanted.
    off.playback.settings = { autoplay: false }
    root.quiet(off)
    root.answer(off, root.related(1, 3))
    h.equal([root.shown(off), off.playback.noticeCode, off.player.calls, off.resolver.calls],
      [["playing", 1, 0], "", [], []], "off: an answer that arrives after it was switched off adds nothing")
    off.playback.settings = { autoplay: true }
    h.equal(off.mix.asked, [root.id("A"), root.id("A")], "off: switched on once more, it is asked again")
    root.answer(off, root.related(1, 3))
    h.equal(root.shown(off), ["playing", 4, 0], "off: and that answer is added")
    off.playback.playTrack(root.track("B"))
    root.start(off)
    h.equal(off.mix.asked.slice(2), [root.id("B")], "off: the next last track is asked about")

    // Switched on with a track behind the one that plays: nothing to ask.
    var mid = root.rig()
    mid.playback.settings = { autoplay: false }
    mid.playback.enqueueTrack(root.track("A"))
    mid.playback.enqueueTrack(root.track("B"))
    root.start(mid)
    mid.playback.settings = { autoplay: true }
    h.equal(mid.mix.asked, [], "off: switched on while the queue goes on, nothing is asked")
    // Nor before the track has started.
    var early = root.rig()
    early.playback.settings = { autoplay: false }
    early.playback.playTrack(root.track("A"))
    early.playback.settings = { autoplay: true }
    h.equal(early.mix.asked, [], "off: switched on while the track is still on its way, nothing is asked yet")
    root.start(early)
    h.equal(early.mix.asked, [root.id("A")], "off: its start asks")

    var odd = [null, {}, { autoplay: "true" }, { autoplay: 1 }]
    for (var i = 0; i < odd.length; i++) {
      var r = root.rig()
      r.playback.settings = odd[i]
      r.playback.playTrack(root.track("A"))
      root.start(r)
      h.equal(r.mix.asked, [], "off: settings " + i + " are not a yes")
    }

    var none = root.rig()
    none.playback.mixer = null
    none.playback.playTrack(root.track("A"))
    root.start(none)
    none.player.ended(none.playback.current.key, "eof", "")
    h.equal(root.shown(none), ["idle", 1, -1], "off: without a source of related tracks playing simply ends")
  }

  // The seed is over before its related tracks arrive: the first of them
  // starts, as it would have by itself had it been there in time.
  function endedWhileAsking() {
    var h = root.h
    var r = root.rig()
    r.playback.playTrack(root.track("A"))
    root.start(r)
    r.player.ended(r.playback.current.key, "eof", "")
    h.equal([root.shown(r), r.player.mpvState], [["idle", 1, -1], "off"], "ended: idle, mpv off")
    root.quiet(r)
    var rows = root.related(1, 3)
    root.answer(r, rows)
    h.equal(root.shown(r), ["resolving", 4, 1], "ended: the first related track is started")
    h.equal(r.resolver.calls.filter(function(call) { return call.name === "ensure" }),
      [{ name: "ensure", args: [rows[0].id, "play"] }], "ended: with a lookup for playing")
    root.start(r)
    h.equal([root.shown(r), r.playback.current.id, r.playback.current.auto],
      [["playing", 4, 1], rows[0].id, true],
      "ended: and plays")

    // While nothing may be started, nothing is.
    var held = root.rig()
    held.playback.playTrack(root.track("A"))
    root.start(held)
    held.player.ended(held.playback.current.key, "eof", "")
    held.playback.hold = true
    root.answer(held, root.related(1, 3))
    h.equal(root.shown(held), ["idle", 4, -1], "ended: under a hold the tracks are added and nothing starts")
  }

  function stoppedWhileAsking() {
    var h = root.h
    // Stopped while the seed plays.
    var r = root.rig()
    r.playback.playTrack(root.track("A"))
    root.start(r)
    r.playback.stop()
    root.quiet(r)
    root.answer(r, root.related(1, 3))
    h.equal([root.shown(r), r.resolver.calls, r.player.calls, r.playback.noticeCode],
      [["idle", 1, -1], [], [], ""],
      "stopped: the answer to a withdrawn question is dropped")
    // Played again, the item is asked about again.
    r.playback.queuePlay(r.playback.queue[0].key)
    root.start(r)
    h.equal(r.mix.asked.length, 2, "stopped: playing the item again asks again")

    // Stopped after the seed had ended by itself.
    var late = root.rig()
    late.playback.playTrack(root.track("A"))
    root.start(late)
    late.player.ended(late.playback.current.key, "eof", "")
    h.check(late.playback.stop() === false, "stopped: a stop with nothing playing declines")
    root.quiet(late)
    root.answer(late, root.related(1, 3))
    h.equal([root.shown(late), late.resolver.calls], [["idle", 1, -1], []],
      "stopped: but it still says that nothing more is wanted")

    // Stopped from outside: a media control.
    var outside = root.rig()
    outside.playback.playTrack(root.track("A"))
    root.start(outside)
    outside.player.idle()
    root.answer(outside, root.related(1, 3))
    h.equal(root.shown(outside), ["idle", 1, -1], "stopped: the same when mpv was stopped from outside")
  }

  function somethingElseSince() {
    var h = root.h
    var r = root.rig()
    r.playback.playTrack(root.track("A"))
    root.start(r)
    r.player.ended(r.playback.current.key, "eof", "")
    // The user plays another track before the answer is there.
    r.playback.playTrack(root.track("B"))
    root.start(r)
    h.equal([root.shown(r), r.mix.asked], [["playing", 1, 0], [root.id("A"), root.id("B")]], "since: set-up")
    root.quiet(r)
    root.answer(r, root.related(1, 3))
    h.equal([root.shown(r), r.player.calls, r.resolver.calls], [["playing", 1, 0], [], []],
      "since: an answer for a track that left the queue is dropped")
    root.answer(r, root.related(4, 2))
    var wanted = root.related(4, 2).map(function(row) { return row.id })
    h.equal([root.shown(r), root.order(r).slice(1)], [["playing", 3, 0], wanted],
      "since: the answer for the track that plays is used")
  }

  function queuedBehindTheSeed() {
    var h = root.h
    var r = root.rig()
    r.playback.playTrack(root.track("A"))
    root.start(r)
    r.playback.enqueueTrack(root.track("B"))
    root.answer(r, root.related(1, 3))
    h.equal([root.shown(r), r.playback.noticeCode], [["playing", 2, 0], ""],
      "queued: the user added a track meanwhile, so the queue is not running out and nothing is added")
    r.playback.next()
    root.start(r)
    h.equal(r.mix.asked, [root.id("A"), root.id("B")],
      "queued: the new last track is asked about when it starts")
  }

  // The track that plays was not the last one when it started, and is now:
  // the user took away what came after it. Without a question at that
  // moment playing would simply end with this track, autoplay or not.
  function becomesTheLast() {
    var h = root.h
    var cleared = root.rig()
    cleared.playback.enqueueTrack(root.track("A"))
    cleared.playback.enqueueTrack(root.track("B"))
    cleared.playback.enqueueTrack(root.track("C"))
    root.start(cleared)
    h.equal([root.shown(cleared), cleared.mix.asked], [["playing", 3, 0], []], "last: set-up, nothing asked")
    cleared.playback.queueClear()
    h.equal([root.shown(cleared), cleared.mix.asked], [["playing", 1, 0], [root.id("A")]],
      "last: the queue is cleared around it, and it is asked about")
    root.answer(cleared, root.related(1, 3))
    h.equal(root.shown(cleared), ["playing", 4, 0], "last: the related tracks join")

    var removed = root.rig()
    removed.playback.enqueueTrack(root.track("A"))
    removed.playback.enqueueTrack(root.track("B"))
    removed.playback.enqueueTrack(root.track("C"))
    root.start(removed)
    removed.playback.queueRemove(removed.playback.queue[2].key)
    h.equal(removed.mix.asked, [], "last: one of two taken away, there is still a track after it")
    removed.playback.queueRemove(removed.playback.queue[1].key)
    h.equal([root.shown(removed), removed.mix.asked], [["playing", 1, 0], [root.id("A")]],
      "last: the other one too, and it is asked about")
    removed.playback.queueClear()
    h.equal(removed.mix.asked.length, 1, "last: once")

    var forgotten = root.rig()
    forgotten.playback.enqueueTrack(root.track("A"))
    forgotten.playback.enqueueTrack(root.track("B"))
    root.start(forgotten)
    forgotten.playback.clearHistory()
    h.equal([root.shown(forgotten), forgotten.mix.asked], [["playing", 1, 0], [root.id("A")]],
      "last: history is cleared, which empties the queue around it too")

    // The answer came while a track was queued behind the seed and was
    // dropped. That track is taken away again: the question is asked again.
    var again = root.rig()
    again.playback.playTrack(root.track("A"))
    root.start(again)
    again.playback.enqueueTrack(root.track("B"))
    root.answer(again, root.related(1, 3))
    h.equal([root.shown(again), again.mix.asked], [["playing", 2, 0], [root.id("A")]], "last: dropped")
    again.playback.queueRemove(again.playback.queue[1].key)
    h.equal(again.mix.asked, [root.id("A"), root.id("A")], "last: last again, asked again")
    root.answer(again, root.related(1, 2))
    h.equal(root.shown(again), ["playing", 3, 0], "last: and this time the answer is added")
  }
}
