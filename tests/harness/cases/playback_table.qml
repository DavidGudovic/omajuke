import QtQuick
import "../../../lib/Const.js" as Const

// The playback state machine of core/Playback.qml, row by row, against a
// scripted player and a scripted resolver: every way playback begins, what
// each report of the player does in each state, each answer to a failed
// track, what is handed to the state store, and the rows a queue adds: the
// end of a track with another one behind it, a skipped track, and the
// part of the queue that mpv is given to hold. Nothing here runs a
// process or waits for one, so the case is a plain sequence of steps and
// assertions.
QtObject {
  id: root

  property var h: null

  // mpv's error texts, as the player passes them on.
  readonly property string noData: "no audio or video data played"
  readonly property string prematureEof: "premature-eof"

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"

  function run(h) {
    root.h = h
    var rows = [
      root.atCreation, root.startRequest, root.startRefused, root.startById, root.resolveOk,
      root.resolveFailed, root.oddAnswers, root.loadingOfOurs, root.loadingFollowed, root.followedFailure,
      root.loadingOfUnknown, root.loadingIgnored, root.idleAndErrorAreDeaf, root.started,
      root.phaseChanges, root.endOfTrack, root.failedBeforeStartCached, root.failedBeforeStartFresh,
      root.failedHandOff, root.brokeOff, root.otherErrorMidTrack, root.stalled, root.recoveryDetails,
      root.liveStream, root.stopping, root.playerIdle, root.playerExited, root.playerFailed,
      root.pauseAndResume, root.resumeAfterLongPause, root.retryFromError, root.superseding,
      root.newTrackWhilePlaying, root.seeking, root.recentTracks, root.savedLists, root.historyOff,
      root.restoring, root.clearing, root.endOfTrackInAQueue, root.skippedLookupOntoAHeldEntry,
      root.skippedInsideMpv, root.startRequestSparesWhatPlays, root.windowWaitsForMpv, root.lookingAhead,
      root.withTheAccount
    ]
    for (var i = 0; i < rows.length; i++) rows[i]()
    root.quietLog()
    h.finish()
  }

  // An error inside a handler does not stop a QML program: it is logged
  // and the run goes on, possibly with every assertion still true. So the
  // log is part of the result.
  function quietLog() {
    var log = root.h.readFile(root.h.runDir + "/out.txt")
    var files = ["Playback.qml", "Recover.js", "FakePlayer.qml", "FakeResolver.qml", "playback_table.qml"]
    var named = files.filter(function(name) { return log.indexOf(name) !== -1 })
    root.h.check(log.indexOf("Configuration Loaded") !== -1, "log: readable while the case runs")
    root.h.equal(named, [], "log: no message names a file of this case")
  }

  // ---- Set-up ----

  // A playback component wired to a scripted player and resolver, a store
  // that writes down what it is handed, and a list of the track signals.
  function rig(history) {
    var h = root.h
    var r = { patches: [], events: [] }
    r.player = h.mount("tests/harness/FakePlayer.qml", {})
    r.resolver = h.mount("tests/harness/FakeResolver.qml", {})
    r.playback = h.mount("core/Playback.qml", {
      player: r.player, resolver: r.resolver, hold: false, persistHistory: history !== false
    })
    // Assigned, not passed at creation: a script object handed over there
    // arrives as a copy without its functions.
    r.playback.store = { patch: function(changes) { r.patches.push(JSON.parse(JSON.stringify(changes))) } }
    r.playback.trackStarted.connect(function(item) { r.events.push("started " + item.key) })
    r.playback.trackEnded.connect(function(item) { r.events.push("ended " + item.key) })
    return r
  }

  // A row as the panel hands it back.
  function track(id) {
    return { id: id, title: "Title " + id[0], channel: "Channel", duration: 200, live: false }
  }

  // Forgets what was recorded so far, so that a row asserts its own step.
  function quiet(r) {
    r.player.clearCalls()
    r.resolver.clearCalls()
    r.patches.length = 0
    r.events.length = 0
  }

  // The states a row starts from. Each returns the key of the item.

  // resolving: the lookup is running.
  function request(r, id) {
    root.h.check(r.playback.playTrack(root.track(id)), "set-up: " + id + " accepted")
    return r.playback.current.key
  }

  // loading, the player told to load and silent so far.
  function load(r, id, fields) {
    var key = root.request(r, id)
    r.resolver.succeed(fields)
    return key
  }

  // loading, the player has reported the file.
  function open(r, id, fields) {
    var key = root.load(r, id, fields)
    r.player.loading(key)
    return key
  }

  // playing.
  function play(r, id, fields) {
    var key = root.open(r, id, fields)
    root.begin(r, key)
    root.quiet(r)
    return key
  }

  function begin(r, key) {
    r.player.phase = "playing"
    r.player.started(key)
  }

  // What the playback shows, in one value.
  function shown(r) {
    return [r.playback.status, r.playback.errorCode, r.playback.queueIndex]
  }

  function lastLoad(r) {
    var loads = r.player.calls.filter(function(call) { return call.name === "load" })
    return loads.length === 0 ? null : loads[loads.length - 1].args
  }

  function count(fake, name) {
    return fake.calls.filter(function(call) { return call.name === name }).length
  }

  // The stall watchdog: the one timer the component has.
  function stallTimer(r) {
    var parts = r.playback.resources
    for (var i = 0; i < parts.length; i++) {
      if (typeof parts[i].interval === "number" && typeof parts[i].triggered === "function") return parts[i]
    }
    return null
  }

  // A resolver that keeps the callbacks, for answers the scripted one
  // never gives.
  function bareResolver() {
    var bare = { waiting: [], cancelled: 0 }
    bare.ensure = function(id, purpose, done) { bare.waiting.push(done) }
    bare.refresh = function(id, done) { bare.waiting.push(done) }
    bare.cancelPlay = function() { bare.cancelled += 1 }
    bare.fresh = function(id) { return false }
    bare.entry = function(id) { return null }
    bare.retain = function(ids) {}
    return bare
  }

  function entryFor(id) {
    return {
      id: id, n: 1, file: "/run/oj-fake/info/1.json", videoUrl: "", resolvedAt: Date.now(),
      track: { id: id, title: "Looked up", channel: "Channel", duration: 100, live: false }
    }
  }

  // ---- Rows: starting ----

  function atCreation() {
    var h = root.h
    var r = root.rig()
    h.equal(root.shown(r), ["idle", "", -1], "at creation: idle")
    h.equal([r.playback.queue, r.playback.recents, r.playback.current], [[], [], null], "at creation: empty")
    h.equal([r.playback.noticeCode, r.playback.keepIds()], ["", []], "at creation: no notice, nothing kept")
    var answers = [
      r.playback.playPause(), r.playback.stop(), r.playback.next(), r.playback.previous(),
      r.playback.seekTo(5)
    ]
    h.equal(answers, [false, false, false, false, false], "at creation: every transport request declines")
    r.playback.dismissNotice()
    r.playback.clearHistory()
    h.equal([r.player.calls, r.resolver.calls], [[], []], "at creation: nothing is asked of the parts")
    h.equal(root.shown(r), ["idle", "", -1], "at creation: still idle")
  }

  function startRequest() {
    var h = root.h
    var r = root.rig()
    var row = root.track(root.idA)
    row.key = 99
    row.auto = true
    row.extra = "left behind"
    h.check(r.playback.playTrack(row), "start request: accepted")
    h.equal(root.shown(r), ["resolving", "", 0], "start request: resolving")
    var item = r.playback.current
    h.equal(Object.keys(item).sort(), ["auto", "channel", "duration", "id", "key", "live", "title"],
      "start request: a queue item has exactly its keys")
    h.equal([item.id, item.title, item.key, item.auto], [root.idA, "Title A", 1, false],
      "start request: the item is built anew, with its own key")
    h.equal(r.playback.queue, [item], "start request: a queue of one")
    h.equal(r.resolver.calls, [
      { name: "retain", args: [[root.idA]] }, { name: "ensure", args: [root.idA, "play"] }
    ], "start request: one lookup for playing, and nothing withdrawn")
    h.equal(r.player.calls, [], "start request: the player is not touched yet")
    h.equal(r.playback.keepIds(), [root.idA], "start request: the current id is kept")

    var before = JSON.stringify([root.shown(r), r.playback.queue, r.resolver.calls])
    var refused = [
      r.playback.playTrack(null), r.playback.playTrack(root.idB), r.playback.playTrack({ id: "short" }),
      r.playback.playTrack({ id: root.idB, title: 5 }), r.playback.playTrack([root.track(root.idB)])
    ]
    h.equal(refused, [false, false, false, false, false], "start request: what is not a track is refused")
    h.equal(JSON.stringify([root.shown(r), r.playback.queue, r.resolver.calls]), before,
      "start request: a refused one changes nothing")
  }

  function startRefused() {
    var h = root.h
    var r = root.rig()
    r.playback.hold = true
    h.equal([r.playback.playTrack(root.track(root.idA)), r.playback.playId(root.idA)], [false, false],
      "hold: no start is accepted")
    h.equal([root.shown(r), r.playback.queue, r.resolver.calls, r.player.calls, r.patches],
      [["idle", "", -1], [], [], [], []], "hold: nothing changes and nothing is asked")
    r.playback.hold = false
    h.check(r.playback.playTrack(root.track(root.idA)), "hold: accepted once it is lifted")

    var alone = h.mount("core/Playback.qml", { hold: false })
    h.equal([alone.playTrack(root.track(root.idA)), alone.playId(root.idA), alone.status],
      [false, false, "idle"],
      "hold: without a player and a resolver nothing starts")
  }

  function startById() {
    var h = root.h
    var r = root.rig()
    var refused = [r.playback.playId(""), r.playback.playId("not an id"), r.playback.playId(root.idA + "A")]
    h.equal(refused, [false, false, false], "by id: what is not an id is refused")
    h.equal(root.shown(r), ["idle", "", -1], "by id: and changes nothing")
    h.check(r.playback.playId(root.idB), "by id: accepted")
    var item = r.playback.current
    h.equal([item.id, item.title, item.channel, item.duration, item.live], [root.idB, "", "", null, true],
      "by id: no title, and an unknown length until the lookup answers")
    r.resolver.succeed({ title: "Looked up", channel: "Found", duration: 123 })
    var known = r.playback.current
    h.equal([known.id, known.title, known.channel, known.duration, known.live, known.key],
      [root.idB, "Looked up", "Found", 123, false, item.key], "by id: the lookup fills the item in")
    h.equal(root.lastLoad(r).slice(0, 3), [item.key, root.idB, "Looked up"], "by id: loaded under that title")
  }

  function resolveOk() {
    var h = root.h
    var r = root.rig()
    var key = root.request(r, root.idA)
    root.quiet(r)
    r.resolver.succeed({ title: "A,vid=1 \"q\"", duration: 321 })
    h.equal(root.shown(r), ["loading", "", 0], "resolve ok: loading")
    var file = r.resolver.entry(root.idA).file
    h.equal(r.player.calls, [{
      name: "load", args: [key, root.idA, "A,vid=1 \"q\"", file, { mode: "replace", startAt: 0, live: false }]
    }], "resolve ok: one load that replaces, from the beginning, with the entry's file")
    h.equal([r.playback.current.title, r.playback.current.duration, r.playback.current.key],
      ["A,vid=1 \"q\"", 321, key], "resolve ok: the item takes the entry's fields and keeps its key")
    h.equal(r.resolver.calls, [], "resolve ok: nothing more is asked of the resolver")
  }

  function resolveFailed() {
    var h = root.h
    var r = root.rig()
    var key = root.request(r, root.idA)
    root.quiet(r)
    r.resolver.fail("E_YT_REFUSED")
    h.equal(root.shown(r), ["error", "E_YT_REFUSED", 0], "resolve failed: error with the resolver's code")
    h.equal(r.player.names(), ["shutdown"], "resolve failed: the player is shut down, nothing is loaded")
    h.equal(r.resolver.calls, [], "resolve failed: a lookup that ended is not withdrawn")
    h.equal(r.playback.current.key, key, "resolve failed: the item stays current, to be tried again")

    var codes = ["cancelled", "", "constructor", "toString"]
    for (var i = 0; i < codes.length; i++) {
      var odd = root.rig()
      root.request(odd, root.idA)
      odd.resolver.fail(codes[i])
      h.equal(root.shown(odd), ["error", "E_YTDLP_FAILED", 0],
        "resolve failed: a code without a sentence (" + codes[i] + ") becomes the general one")
    }
  }

  function oddAnswers() {
    var h = root.h
    var answers = [
      [null, "E_YTDLP_FAILED"], [undefined, "E_YTDLP_FAILED"], ["ok", "E_YTDLP_FAILED"],
      [{ ok: true }, "E_BAD_OUTPUT"], [{ ok: true, entry: null }, "E_BAD_OUTPUT"],
      [{ ok: true, entry: root.entryFor(root.idB) }, "E_BAD_OUTPUT"],
      [{ ok: true, entry: { track: root.entryFor(root.idA).track } }, "E_BAD_OUTPUT"],
      [{ ok: 1, entry: root.entryFor(root.idA) }, "E_YTDLP_FAILED"]
    ]
    for (var i = 0; i < answers.length; i++) {
      var r = root.rig()
      var bare = root.bareResolver()
      r.playback.resolver = bare
      root.request(r, root.idA)
      bare.waiting[0](answers[i][0])
      h.equal([root.shown(r), r.player.names()], [["error", answers[i][1], 0], ["shutdown"]],
        "odd answers: " + String(JSON.stringify(answers[i][0])).slice(0, 40) + " is an error, no load")
    }

    // An answer inside the call, which the real resolver never gives.
    var eager = root.rig()
    var inside = root.bareResolver()
    inside.ensure = function(id, purpose, done) {
      done({ ok: true, entry: root.entryFor(id), cached: false })
    }
    eager.playback.resolver = inside
    h.check(eager.playback.playTrack(root.track(root.idA)), "odd answers: accepted")
    h.equal([root.shown(eager), eager.player.names()], [["loading", "", 0], ["load"]],
      "odd answers: an answer inside the call is handled like any other")

    // The answer to a request that was replaced, arriving late and well.
    var late = root.rig()
    var slow = root.bareResolver()
    late.playback.resolver = slow
    root.request(late, root.idA)
    var keyB = root.request(late, root.idB)
    h.equal(slow.cancelled, 1, "odd answers: the first lookup is withdrawn")
    slow.waiting[0]({ ok: true, entry: root.entryFor(root.idA), cached: false })
    h.equal([root.shown(late), late.player.calls], [["resolving", "", 0], []],
      "odd answers: the answer to a replaced request is dropped")
    slow.waiting[1]({ ok: true, entry: root.entryFor(root.idB), cached: false })
    h.equal([root.shown(late), root.lastLoad(late)[0]], [["loading", "", 0], keyB],
      "odd answers: the answer to the current one is used")
    slow.waiting[1]({ ok: false, code: "E_NETWORK" })
    h.equal(root.shown(late), ["loading", "", 0], "odd answers: an answer given twice counts once")
  }

  // ---- Rows: what the player reports while a track is on its way ----

  function loadingOfOurs() {
    var h = root.h
    var r = root.rig()
    var key = root.load(r, root.idA)
    root.quiet(r)
    r.player.idle()
    h.equal([root.shown(r), r.player.calls], [["loading", "", 0], []],
      "our loading: a fresh mpv's idle before it is ignored")
    r.player.loading(key)
    h.equal([root.shown(r), r.player.calls, r.resolver.calls], [["loading", "", 0], [], []],
      "our loading: loading, and nothing is asked")
    // Nothing of ours is pending any more, so an idle now is a stop.
    r.player.idle()
    h.equal(root.shown(r), ["idle", "", -1], "our loading: it ended the wait for the player")
  }

  // A queue of two, as a saved queue brings it back, with the first item
  // playing from a lookup made for this very attempt. The second has been
  // looked up before, so that its start asks for nothing.
  function twoItems(r) {
    var b = root.track(root.idB)
    b.auto = true
    r.playback.restore({ recents: [], queue: { items: [root.track(root.idA), b], index: 0 } })
    r.resolver.seed(root.idB)
    var keys = [r.playback.queue[0].key, r.playback.queue[1].key]
    root.h.check(r.playback.playPause(), "set-up: the restored item starts")
    r.resolver.succeed()
    r.player.loading(keys[0])
    root.begin(r, keys[0])
    root.quiet(r)
    return keys
  }

  function loadingFollowed() {
    var h = root.h
    var r = root.rig()
    var keys = root.twoItems(r)
    // mpv moved by itself: a media key, or its own playlist.
    r.player.loading(keys[1])
    h.equal(root.shown(r), ["loading", "", 1], "followed: loading, on the item with that key")
    h.equal([r.playback.current.id, r.playback.current.auto], [root.idB, true], "followed: it is current")
    h.equal(r.player.calls, [], "followed: no shutdown, no stop, no load")
    h.equal(r.resolver.calls, [{ name: "retain", args: [[root.idA, root.idB]] }],
      "followed: no lookup, and the item before it is still needed")
    h.equal(r.events, ["ended " + keys[0]], "followed: the track before it has ended")
    h.equal(r.patches[r.patches.length - 1].queue.index, 1,
      "followed: the new position is handed to the store")
    root.begin(r, keys[1])
    h.equal([root.shown(r), r.events[1]], [["playing", "", 1], "started " + keys[1]], "followed: it plays")

    // The same file again, started by mpv.
    var again = root.rig()
    var key = root.play(again, root.idA)
    again.player.loading(key)
    h.equal([root.shown(again), again.player.calls, again.resolver.calls], [["loading", "", 0], [], []],
      "followed: the same entry started again is followed too")
    h.equal(again.events, ["ended " + key], "followed: its first run has ended")
  }

  function followedFailure() {
    var h = root.h
    var r = root.rig()
    var keys = root.twoItems(r)
    r.player.loading(keys[1])
    root.quiet(r)
    // The first item was looked up for its own attempt. The one mpv moved
    // into was not: its address gets a new lookup.
    r.player.ended(keys[1], "error", root.noData)
    h.equal([root.shown(r), r.player.names()], [["resolving", "", 1], ["stopPlayback"]],
      "followed, then failed: one recovery")
    h.equal(r.resolver.calls, [{ name: "refresh", args: [root.idB] }],
      "followed, then failed: exactly one refresh")
    r.resolver.succeed()
    h.equal([root.shown(r), root.count(r.player, "load"), root.lastLoad(r)[0]],
      [["loading", "", 1], 1, keys[1]],
      "followed, then failed: a load of that item, and never E_STREAM")

    var again = root.rig()
    var key = root.play(again, root.idA)
    again.player.loading(key)
    again.player.ended(key, "error", root.noData)
    h.equal([root.shown(again), again.resolver.names()], [["resolving", "", 0], ["refresh"]],
      "followed, then failed: the same for an entry mpv started again")
  }

  function loadingOfUnknown() {
    var h = root.h
    var r = root.rig()
    root.play(r, root.idA)
    r.player.loading(999)
    h.equal([root.shown(r), r.player.names(), r.resolver.calls], [["playing", "", 0], ["stopPlayback"], []],
      "unknown key: the player is told to stop, nothing else changes")
    r.player.idle()
    h.equal([root.shown(r), r.player.names()], [["idle", "", -1], ["stopPlayback", "shutdown"]],
      "unknown key: its idle then ends playback")
  }

  function loadingIgnored() {
    var h = root.h
    var r = root.rig()
    var keyA = root.play(r, root.idA)
    var keyB = root.request(r, root.idB)
    root.quiet(r)
    // A lookup of ours is running.
    r.player.loading(keyA)
    r.player.loading(keyB)
    r.player.loading(999)
    h.equal([root.shown(r), r.playback.current.key, r.player.calls, r.resolver.calls],
      [["resolving", "", 0], keyB, [], []], "ignored: a loading while a lookup of ours runs")
    // A load of ours is on its way, for another key.
    r.resolver.succeed()
    root.quiet(r)
    r.player.loading(keyA)
    r.player.loading(999)
    h.equal([root.shown(r), r.player.calls], [["loading", "", 0], []],
      "ignored: a loading for another key while a load of ours is on its way")
    r.player.idle()
    h.equal(root.shown(r), ["loading", "", 0], "ignored: and the load is still awaited")
    r.player.loading(keyB)
    root.begin(r, keyB)
    h.equal(root.shown(r), ["playing", "", 0], "ignored: until its own file is reported and starts")
  }

  // Every report of the player, sent in a state in which no mpv of ours
  // is supposed to be alive.
  function reportAll(r, keys) {
    for (var i = 0; i < keys.length; i++) {
      r.player.loading(keys[i])
      r.player.started(keys[i])
      r.player.ended(keys[i], "eof", "")
      r.player.ended(keys[i], "error", root.noData)
      r.player.ended(keys[i], "error", root.prematureEof)
    }
    r.player.phase = "playing"
    r.player.idle()
  }

  function idleAndErrorAreDeaf() {
    var h = root.h
    var fresh = root.rig()
    root.reportAll(fresh, [1, 2])
    fresh.player.exited(true)
    fresh.player.exited(false)
    fresh.player.failed("E_TIMEOUT")
    h.equal([root.shown(fresh), fresh.player.calls, fresh.resolver.calls], [["idle", "", -1], [], []],
      "idle: no report of the player changes anything")

    var stopped = root.rig()
    var key = root.play(stopped, root.idA)
    stopped.playback.stop()
    root.quiet(stopped)
    root.reportAll(stopped, [key, 999])
    stopped.player.exited(true)
    stopped.player.exited(false)
    stopped.player.failed("E_TIMEOUT")
    h.equal([root.shown(stopped), stopped.player.calls, stopped.resolver.calls, stopped.events],
      [["idle", "", -1], [], [], []], "idle after a stop: the same")

    var failed = root.rig()
    var failedKey = root.request(failed, root.idA)
    failed.resolver.fail("E_NETWORK")
    root.quiet(failed)
    root.reportAll(failed, [failedKey, 999])
    h.equal([root.shown(failed), failed.player.calls, failed.resolver.calls, failed.events],
      [["error", "E_NETWORK", 0], [], [], []],
      "error: loading, started, ended and idle change nothing, state and code stay")

    var broken = root.rig()
    var brokenKey = root.play(broken, root.idA)
    broken.player.failed("E_TIMEOUT")
    root.quiet(broken)
    root.reportAll(broken, [brokenKey, 999])
    h.equal([root.shown(broken), broken.player.calls, broken.resolver.calls, broken.events],
      [["error", "E_TIMEOUT", 0], [], [], []], "error after playing: the same")
  }

  function started() {
    var h = root.h
    var phases = [["playing", "playing"], ["paused", "paused"], ["buffering", "buffering"],
      ["idle", "buffering"], ["loading", "buffering"]]
    for (var i = 0; i < phases.length; i++) {
      var each = root.rig()
      var eachKey = root.open(each, root.idA)
      each.player.phase = phases[i][0]
      each.player.started(eachKey)
      h.equal(each.playback.status, phases[i][1], "started: the player's phase " + phases[i][0])
    }

    var r = root.rig()
    var key = root.open(r, root.idA)
    root.quiet(r)
    r.player.phase = "playing"
    r.player.started(999)
    h.equal([root.shown(r), r.events, r.playback.recents], [["loading", "", 0], [], []],
      "started: a start of another key is ignored")
    r.player.started(key)
    h.equal(root.shown(r), ["playing", "", 0], "started: playing")
    h.equal(r.events, ["started " + key], "started: announced once")
    h.equal(r.playback.recents, [root.track(root.idA)].map(function(row) {
      row.title = "Fake title"
      row.channel = "Fake channel"
      return row
    }), "started: the track, as looked up and without its key, is the most recent one")
    h.equal([r.player.calls, r.resolver.calls], [[], []], "started: nothing is asked of the parts")
    r.player.started(key)
    h.equal([r.events.length, r.playback.recents.length], [1, 1], "started: a second report is ignored")

    // The player's loading report went missing: the start still counts,
    // and nothing of ours is pending afterwards.
    var skipped = root.rig()
    var skippedKey = root.load(skipped, root.idA)
    root.begin(skipped, skippedKey)
    h.equal(root.shown(skipped), ["playing", "", 0], "started: accepted while the load is still awaited")
    skipped.player.idle()
    h.equal(root.shown(skipped), ["idle", "", -1], "started: and an idle after it is a stop")

    var early = root.rig()
    var earlyKey = root.request(early, root.idA)
    root.begin(early, earlyKey)
    h.equal(root.shown(early), ["resolving", "", 0], "started: ignored while the lookup still runs")
  }

  function phaseChanges() {
    var h = root.h
    var r = root.rig()
    var timer = root.stallTimer(r)
    h.check(timer !== null, "phases: the stall watchdog is there")
    h.equal([timer.interval, timer.repeat, timer.running], [Const.TIMEOUTS.stallMs, false, false],
      "phases: thirty seconds, single shot, not running while idle")
    var key = root.open(r, root.idA)
    r.player.phase = "buffering"
    h.equal([r.playback.status, timer.running], ["loading", false], "phases: not running while loading")
    r.player.started(key)
    h.equal([r.playback.status, timer.running], ["buffering", true], "phases: running while buffering")
    var steps = [
      ["playing", "playing", false], ["paused", "paused", false], ["buffering", "buffering", true],
      ["playing", "playing", false], ["idle", "playing", false], ["loading", "playing", false],
      ["buffering", "buffering", true], ["idle", "buffering", true], ["paused", "paused", false]
    ]
    for (var i = 0; i < steps.length; i++) {
      r.player.phase = steps[i][0]
      h.equal([r.playback.status, timer.running], [steps[i][1], steps[i][2]],
        "phases: step " + i + ", the player reports " + steps[i][0])
    }
    h.equal([r.player.calls.length, r.resolver.calls.length], [1, 2],
      "phases: a phase asks nothing of the parts")
    r.player.phase = "buffering"
    r.playback.stop()
    h.equal([r.playback.status, timer.running], ["idle", false], "phases: stopped with the track")
  }

  function endOfTrack() {
    var h = root.h
    var r = root.rig()
    var key = root.play(r, root.idA)
    r.player.ended(999, "eof", "")
    r.player.ended(999, "error", root.noData)
    h.equal([root.shown(r), r.player.calls], [["playing", "", 0], []],
      "end: the end of another key is ignored")
    r.player.ended(key, "stop", "")
    h.equal([root.shown(r), r.player.calls], [["playing", "", 0], []],
      "end: a reason that is no end is ignored")
    r.player.ended(key, "eof", "")
    h.equal(root.shown(r), ["idle", "", -1], "end: idle, with no item current")
    h.equal([r.playback.current, r.playback.queue.length], [null, 1], "end: the queue keeps the item")
    h.equal(r.player.names(), ["shutdown"], "end: the player is shut down")
    h.equal(r.resolver.calls, [{ name: "retain", args: [[]] }], "end: no lookup is withdrawn, none is kept")
    h.equal(r.events, ["ended " + key], "end: announced")
    h.equal(r.playback.keepIds(), [], "end: nothing to keep")

    var paused = root.rig()
    var pausedKey = root.play(paused, root.idA)
    paused.player.phase = "paused"
    paused.player.ended(pausedKey, "eof", "")
    h.equal(root.shown(paused), ["idle", "", -1], "end: the same from paused")

    var buffering = root.rig()
    var bufferingKey = root.play(buffering, root.idA)
    buffering.player.phase = "buffering"
    buffering.player.ended(bufferingKey, "eof", "")
    h.equal(root.shown(buffering), ["idle", "", -1], "end: the same from buffering")
  }

  // ---- Rows: a track that failed ----

  function failedBeforeStartCached() {
    var h = root.h
    var r = root.rig()
    r.resolver.seed(root.idA)
    var first = r.resolver.entry(root.idA).file
    var key = root.open(r, root.idA)
    h.equal(root.lastLoad(r)[3], first, "cached, failed: loaded from the cached entry")
    root.quiet(r)
    r.player.ended(key, "error", root.noData)
    h.equal(root.shown(r), ["resolving", "", 0], "cached, failed: resolving again, no error shown")
    h.equal(r.player.names(), ["stopPlayback"], "cached, failed: the player is stopped first, not shut down")
    h.equal(r.resolver.calls, [{ name: "refresh", args: [root.idA] }], "cached, failed: a new lookup")
    r.resolver.succeed()
    var second = root.lastLoad(r)
    h.equal([second[0], second[4]], [key, { mode: "replace", startAt: 0, live: false }],
      "cached, failed: a second load of the same item, from the beginning")
    h.check(second[3] !== first, "cached, failed: from the new entry's file")
    r.player.loading(key)
    root.quiet(r)
    r.player.ended(key, "error", root.noData)
    h.equal([root.shown(r), r.player.names(), r.resolver.calls], [["error", "E_STREAM", 0], ["shutdown"], []],
      "cached, failed: the new lookup failing the same way is E_STREAM")
  }

  function failedBeforeStartFresh() {
    var h = root.h
    var r = root.rig()
    var key = root.open(r, root.idA)
    root.quiet(r)
    r.player.ended(key, "error", root.noData)
    h.equal(root.shown(r), ["error", "E_STREAM", 0], "fresh, failed: E_STREAM at once")
    h.equal([r.player.names(), r.resolver.calls], [["shutdown"], []], "fresh, failed: no second lookup")

    // mpv counts a file whose start position lies beyond its end as started.
    var counted = root.rig()
    var countedKey = root.play(counted, root.idA)
    counted.player.ended(countedKey, "error", root.noData)
    h.equal([root.shown(counted), counted.resolver.calls], [["error", "E_STREAM", 0], []],
      "fresh, failed: the same when the player had reported a start")

    // Any error but a failed hand-off, before the start, is judged alike.
    var unnamed = root.rig()
    var unnamedKey = root.open(unnamed, root.idA)
    unnamed.player.ended(unnamedKey, "error", "")
    h.equal([root.shown(unnamed), root.count(unnamed.resolver, "refresh")], [["error", "E_STREAM", 0], 0],
      "fresh, failed: the same for an error without a text")
    var cached = root.rig()
    cached.resolver.seed(root.idA)
    var cachedKey = root.open(cached, root.idA)
    cached.player.ended(cachedKey, "error", "")
    cached.resolver.succeed()
    cached.player.loading(cachedKey)
    cached.player.ended(cachedKey, "error", "")
    h.equal([root.shown(cached), root.count(cached.resolver, "refresh")], [["error", "E_STREAM", 0], 1],
      "fresh, failed: which from a cached lookup gets its one new lookup first")

    var early = root.rig()
    var earlyKey = root.load(early, root.idA)
    root.quiet(early)
    early.player.ended(earlyKey, "error", root.noData)
    h.equal([root.shown(early), early.player.calls], [["loading", "", 0], []],
      "fresh, failed: an end before the file was reported is not about this load")
  }

  function failedHandOff() {
    var h = root.h
    var errors = ["loading failed", "unrecognized file format"]
    for (var i = 0; i < errors.length; i++) {
      var r = root.rig()
      var key = root.open(r, root.idA)
      root.quiet(r)
      r.player.ended(key, "error", errors[i])
      h.equal([root.shown(r), r.player.names(), r.resolver.names()],
        [["resolving", "", 0], ["stopPlayback"], ["refresh"]],
        "hand-off (" + errors[i] + "): one retry, even for a fresh lookup")
      r.resolver.succeed()
      r.player.loading(key)
      root.quiet(r)
      r.player.ended(key, "error", errors[i])
      h.equal([root.shown(r), r.player.names(), r.resolver.calls], [["error", "E_PLAYBACK", 0], ["shutdown"],
        []],
        "hand-off (" + errors[i] + "): the second time is E_PLAYBACK")
    }
  }

  function brokeOff() {
    var h = root.h
    var r = root.rig()
    var key = root.play(r, root.idA)
    r.player.position = 73.9
    r.player.ended(key, "error", root.prematureEof)
    h.equal([root.shown(r), r.player.names(), r.resolver.names()],
      [["resolving", "", 0], ["stopPlayback"], ["refresh"]], "broke off: one recovery")
    h.equal(r.events, ["ended " + key], "broke off: the broken run has ended")
    r.resolver.succeed()
    h.equal(root.lastLoad(r)[4], { mode: "replace", startAt: 73, live: false },
      "broke off: reloaded at the whole second it had reached")
    r.player.loading(key)
    root.begin(r, key)
    h.equal(r.events, ["ended " + key, "started " + key], "broke off: and announced again")

    // Thirty seconds further on it has really moved on: once more.
    root.quiet(r)
    r.player.position = 103.2
    r.player.ended(key, "error", root.prematureEof)
    h.equal([root.shown(r), r.resolver.names()], [["resolving", "", 0], ["refresh"]],
      "broke off: another recovery after thirty seconds of progress")
    r.resolver.succeed()
    h.equal(root.lastLoad(r)[4].startAt, 103, "broke off: from the new place")
    r.player.loading(key)
    root.begin(r, key)

    // Again before another thirty seconds have passed: the network is gone.
    root.quiet(r)
    r.player.position = 132.9
    r.player.ended(key, "error", root.prematureEof)
    h.equal([root.shown(r), r.player.names(), r.resolver.calls], [["error", "E_NETWORK", 0], ["shutdown"],
      []],
      "broke off: twice within thirty seconds is E_NETWORK")
    h.equal(r.events, ["ended " + key], "broke off: the last run has ended")
  }

  function otherErrorMidTrack() {
    var h = root.h
    var r = root.rig()
    var key = root.play(r, root.idA)
    r.player.position = 12.2
    r.player.ended(key, "error", "audio output initialization failed")
    h.equal([root.shown(r), r.resolver.names()], [["resolving", "", 0], ["refresh"]],
      "other error: one recovery")
    r.resolver.succeed()
    h.equal(root.lastLoad(r)[4].startAt, 12, "other error: from the position")
    r.player.loading(key)
    root.begin(r, key)
    r.player.position = 20
    r.player.ended(key, "error", "audio output initialization failed")
    h.equal(root.shown(r), ["error", "E_PLAYBACK", 0], "other error: the second time is E_PLAYBACK")
  }

  function stalled() {
    var h = root.h
    var r = root.rig()
    var key = root.play(r, root.idA)
    var timer = root.stallTimer(r)
    r.player.position = 41.7
    r.player.phase = "buffering"
    h.check(timer.running, "stall: the watchdog runs while buffering")
    timer.triggered()
    h.equal([root.shown(r), r.player.names(), r.resolver.names()],
      [["resolving", "", 0], ["stopPlayback"], ["refresh"]], "stall: treated as a stream that broke off")
    h.equal(timer.running, false, "stall: the watchdog rests during the recovery")
    r.resolver.succeed()
    h.equal(root.lastLoad(r)[4].startAt, 41, "stall: reloaded at the position")
    r.player.loading(key)
    r.player.phase = "buffering"
    r.player.started(key)
    r.player.position = 45
    timer.triggered()
    h.equal(root.shown(r), ["error", "E_NETWORK", 0],
      "stall: a second one within thirty seconds is E_NETWORK")

    var calm = root.rig()
    root.play(calm, root.idA)
    root.stallTimer(calm).triggered()
    h.equal([root.shown(calm), calm.player.calls], [["playing", "", 0], []],
      "stall: a watchdog that fires outside buffering does nothing")
  }

  function recoveryDetails() {
    var h = root.h
    // The new lookup of a recovery fails: the resolver's own code is shown.
    var r = root.rig()
    var key = root.play(r, root.idA)
    r.player.position = 30
    r.player.ended(key, "error", root.prematureEof)
    root.quiet(r)
    r.resolver.fail("E_YT_BLOCKED")
    h.equal([root.shown(r), r.player.names()], [["error", "E_YT_BLOCKED", 0], ["shutdown"]],
      "recovery: a failed lookup ends it with that lookup's code")

    // mpv's idle after the stop of a recovery is between two of our steps.
    var between = root.rig()
    var betweenKey = root.play(between, root.idA)
    between.player.ended(betweenKey, "error", root.prematureEof)
    between.player.idle()
    h.equal(root.shown(between), ["resolving", "", 0], "recovery: the idle after its stop is ignored")

    // A position that is no number counts as the beginning.
    var lost = root.rig()
    var lostKey = root.play(lost, root.idA)
    lost.player.position = NaN
    lost.player.ended(lostKey, "error", root.prematureEof)
    lost.resolver.succeed()
    h.equal(root.lastLoad(lost)[4].startAt, 0, "recovery: without a usable position, from the beginning")
    lost.player.loading(lostKey)
    root.begin(lost, lostKey)
    lost.player.position = 100
    lost.player.ended(lostKey, "error", root.prematureEof)
    h.equal(root.shown(lost), ["resolving", "", 0], "recovery: and remembered as made at the beginning")

    // A reload that fails before it starts stands where it was to begin,
    // whatever the player last reported as its position.
    var reload = root.rig()
    var reloadKey = root.play(reload, root.idA)
    reload.player.position = 100
    reload.player.ended(reloadKey, "error", root.prematureEof)
    reload.resolver.succeed()
    reload.player.loading(reloadKey)
    reload.player.position = 500
    root.quiet(reload)
    reload.player.ended(reloadKey, "error", "loading failed")
    h.equal([root.shown(reload), reload.resolver.calls], [["error", "E_PLAYBACK", 0], []],
      "recovery: a reload that does not start is not progress")

    // A recovery is never the way around a hold.
    var held = root.rig()
    var heldKey = root.play(held, root.idA)
    held.playback.hold = true
    held.player.ended(heldKey, "error", root.prematureEof)
    h.equal([root.shown(held), held.resolver.calls, held.player.names()],
      [["error", "E_PLAYBACK", 0], [], ["stopPlayback", "shutdown"]],
      "recovery: refused while held, no lookup")

    // A recovery of one item says nothing about the next one.
    var two = root.rig()
    var first = root.play(two, root.idA)
    two.player.position = 10
    two.player.ended(first, "error", root.prematureEof)
    var second = root.play(two, root.idB)
    two.player.position = 12
    two.player.ended(second, "error", root.prematureEof)
    h.equal([root.shown(two), two.resolver.names()], [["resolving", "", 0], ["refresh"]],
      "recovery: another track gets its own")
  }

  function liveStream() {
    var h = root.h
    var live = { live: true, duration: null }
    var r = root.rig()
    var key = root.play(r, root.idA, live)
    // A stream may report a length (how much of it is buffered); it is
    // still not something to seek in.
    r.player.duration = 300
    h.equal([r.playback.current.live, r.playback.seekTo(10), r.playback.previous(), r.player.calls],
      [true, false, false, []], "live: no seeking")
    r.player.position = 4000.5
    r.player.ended(key, "error", root.prematureEof)
    r.resolver.succeed(live)
    h.equal(root.lastLoad(r)[4], { mode: "replace", startAt: 0, live: true },
      "live: a recovery starts from the beginning, never from a position")

    // A stream that simply ends while its lookup is fresh has ended.
    var ended = root.rig()
    var endedKey = root.play(ended, root.idA, live)
    ended.player.ended(endedKey, "eof", "")
    h.equal([root.shown(ended), ended.resolver.names()], [["idle", "", -1], ["retain"]], "live: a normal end")

    // One that ends once its lookup has aged was cut off: one recovery.
    var aged = root.rig()
    var agedKey = root.play(aged, root.idA, live)
    aged.resolver.age(root.idA, Const.LIMITS.resolveTtlMs + 1000)
    aged.player.ended(agedKey, "eof", "")
    h.equal([root.shown(aged), aged.player.names(), aged.resolver.names()],
      [["resolving", "", 0], ["stopPlayback"], ["refresh"]], "live: an end on an aged lookup is recovered")
    aged.resolver.succeed(live)
    aged.player.loading(agedKey)
    root.begin(aged, agedKey)
    root.quiet(aged)
    aged.player.ended(agedKey, "eof", "")
    h.equal([root.shown(aged), aged.player.names()], [["idle", "", -1], ["shutdown"]],
      "live: with the new lookup the next end is an end")

    // Resumed after a long pause, a stream starts where it is now.
    var paused = root.rig()
    root.play(paused, root.idA, live)
    paused.player.phase = "paused"
    paused.player.position = 500
    paused.resolver.age(root.idA, Const.LIMITS.resolveTtlMs + 3600000)
    paused.playback.playPause()
    paused.resolver.succeed(live)
    h.equal(root.lastLoad(paused)[4], { mode: "replace", startAt: 0, live: true },
      "live: looked up again after a long pause, and loaded without a start position")

    // Only a live track is treated so.
    var plain = root.rig()
    var plainKey = root.play(plain, root.idA)
    plain.resolver.age(root.idA, Const.LIMITS.resolveTtlMs + 1000)
    plain.player.ended(plainKey, "eof", "")
    h.equal(root.shown(plain), ["idle", "", -1],
      "live: a track with a length ends as usual, whatever its age")
  }

  // ---- Rows: stopping, and a player that stops by itself ----

  function stopping() {
    var h = root.h
    var resolving = root.rig()
    root.request(resolving, root.idA)
    root.quiet(resolving)
    h.check(resolving.playback.stop(), "stop: accepted while resolving")
    h.equal(root.shown(resolving), ["idle", "", -1], "stop: idle, no item current")
    h.equal([resolving.resolver.names(), resolving.player.names()], [["cancelPlay", "retain"], ["shutdown"]],
      "stop: the lookup is withdrawn and the player shut down")
    h.equal(resolving.resolver.deliverCancelled(), 1, "stop: the resolver reports the withdrawn lookup")
    h.equal([root.shown(resolving), resolving.player.names()], [["idle", "", -1], ["shutdown"]],
      "stop: and that report changes nothing")
    h.equal(resolving.playback.stop(), false, "stop: declined while idle")
    h.equal(resolving.player.names(), ["shutdown"], "stop: and then nothing is asked")
    root.quiet(resolving)
    root.request(resolving, root.idB)
    h.equal(resolving.resolver.names(), ["retain", "ensure"], "stop: the next start has nothing to withdraw")

    var loading = root.rig()
    root.load(loading, root.idA)
    root.quiet(loading)
    h.check(loading.playback.stop(), "stop: accepted while loading")
    h.equal([root.shown(loading), loading.resolver.names(), loading.player.names()],
      [["idle", "", -1], ["cancelPlay", "retain"], ["shutdown"]], "stop: the same from loading")
    // The load is no longer awaited: the old mpv's reports are not followed.
    loading.player.idle()
    h.equal(root.shown(loading), ["idle", "", -1], "stop: nothing of ours is pending afterwards")

    var playing = root.rig()
    var key = root.play(playing, root.idA)
    h.check(playing.playback.stop(), "stop: accepted while playing")
    h.equal([root.shown(playing), playing.resolver.names(), playing.player.names(), playing.events],
      [["idle", "", -1], ["cancelPlay", "retain"], ["shutdown"], ["ended " + key]],
      "stop: the same from playing")
    h.equal(playing.patches[playing.patches.length - 1].queue.index, -1, "stop: the store is told")

    var failed = root.rig()
    root.request(failed, root.idA)
    failed.resolver.fail("E_NETWORK")
    h.check(failed.playback.stop(), "stop: accepted in error")
    h.equal(root.shown(failed), ["idle", "", -1], "stop: the error is gone with the item")
  }

  function playerIdle() {
    var h = root.h
    var playing = root.rig()
    var key = root.play(playing, root.idA)
    playing.player.idle()
    h.equal(root.shown(playing), ["idle", "", -1], "player idle: without an intent it is a stop")
    h.equal([playing.resolver.names(), playing.player.names(), playing.events],
      [["cancelPlay", "retain"], ["shutdown"], ["ended " + key]], "player idle: carried out like stop()")

    var opened = root.rig()
    root.open(opened, root.idA)
    opened.player.idle()
    h.equal(root.shown(opened), ["idle", "", -1], "player idle: the same while its file was loading")

    var paused = root.rig()
    root.play(paused, root.idA)
    paused.player.phase = "paused"
    paused.player.idle()
    h.equal(root.shown(paused), ["idle", "", -1], "player idle: the same from paused")

    var resolving = root.rig()
    root.request(resolving, root.idA)
    root.quiet(resolving)
    resolving.player.idle()
    h.equal([root.shown(resolving), resolving.player.calls, resolving.resolver.calls],
      [["resolving", "", 0], [], []], "player idle: nothing while a lookup of ours runs")
    resolving.resolver.succeed()
    root.quiet(resolving)
    resolving.player.idle()
    h.equal([root.shown(resolving), resolving.player.calls, resolving.resolver.calls],
      [["loading", "", 0], [], []], "player idle: nothing while a load of ours is on its way")
  }

  function playerExited() {
    var h = root.h
    var crashed = root.rig()
    var key = root.play(crashed, root.idA)
    crashed.player.exited(true)
    h.equal([root.shown(crashed), crashed.player.names(), crashed.resolver.calls, crashed.events],
      [["error", "E_MPV_EXITED", 0], ["shutdown"], [], ["ended " + key]], "exited: a crash is an error")

    var during = root.rig()
    root.play(during, root.idA)
    root.request(during, root.idB)
    root.quiet(during)
    during.player.exited(true)
    h.equal([root.shown(during), during.resolver.names()], [["error", "E_MPV_EXITED", 0], ["cancelPlay"]],
      "exited: a crash during a lookup withdraws it")
    during.resolver.deliverCancelled()
    h.equal([root.shown(during), root.count(during.player, "load")], [["error", "E_MPV_EXITED", 0], 0],
      "exited: and its answer is dropped")

    var quit = root.rig()
    root.play(quit, root.idA)
    quit.player.exited(false)
    h.equal([root.shown(quit), quit.resolver.names(), quit.player.names()],
      [["idle", "", -1], ["cancelPlay", "retain"], ["shutdown"]],
      "exited: a quit without an intent is a stop")

    var pending = root.rig()
    root.play(pending, root.idA)
    var keyB = root.request(pending, root.idB)
    root.quiet(pending)
    pending.player.exited(false)
    h.equal([root.shown(pending), pending.player.calls, pending.resolver.calls], [["resolving", "", 0], [],
      []],
      "exited: a quit while a lookup runs changes nothing")
    pending.resolver.succeed()
    h.equal([root.shown(pending), root.lastLoad(pending)[0]], [["loading", "", 0], keyB],
      "exited: the pending start goes on to a new mpv")
    pending.player.exited(false)
    h.equal(root.shown(pending), ["loading", "", 0],
      "exited: a quit while a load is on its way changes nothing")

    // What the table says for error, which the player never reaches: it
    // reports no exit it was asked for.
    var failed = root.rig()
    root.request(failed, root.idA)
    failed.resolver.fail("E_NETWORK")
    failed.player.exited(true)
    h.equal(root.shown(failed), ["error", "E_MPV_EXITED", 0], "exited: in error, a crash is the newer error")
    failed.player.exited(false)
    h.equal(root.shown(failed), ["idle", "", -1], "exited: in error, a quit ends in idle")
  }

  function playerFailed() {
    var h = root.h
    var codes = ["E_MPV_MISSING", "E_TOOLS_MISSING", "E_MPV_START", "E_TIMEOUT"]
    for (var i = 0; i < codes.length; i++) {
      var loading = root.rig()
      root.load(loading, root.idA)
      root.quiet(loading)
      loading.player.failed(codes[i])
      h.equal([root.shown(loading), loading.player.names(), loading.resolver.calls],
        [["error", codes[i], 0], ["shutdown"], []], "failed: " + codes[i] + " while loading is the error")
    }

    var playing = root.rig()
    var key = root.play(playing, root.idA)
    playing.player.failed("E_TIMEOUT")
    h.equal([root.shown(playing), playing.events], [["error", "E_TIMEOUT", 0], ["ended " + key]],
      "failed: the same while playing")

    var resolving = root.rig()
    root.request(resolving, root.idA)
    root.quiet(resolving)
    resolving.player.failed("E_MPV_START")
    h.equal([root.shown(resolving), resolving.resolver.names(), resolving.player.names()],
      [["error", "E_MPV_START", 0], ["cancelPlay"], ["shutdown"]],
      "failed: during a lookup, which is withdrawn")
    resolving.resolver.deliverCancelled()
    h.equal(root.shown(resolving), ["error", "E_MPV_START", 0], "failed: and whose answer is dropped")
    root.quiet(resolving)
    h.check(resolving.playback.playPause(), "failed: trying again is accepted")
    h.equal(resolving.resolver.names(), ["refresh"], "failed: with nothing left to withdraw")

    var quit = root.rig()
    root.load(quit, root.idA)
    quit.player.failed("E_TIMEOUT")
    quit.player.exited(false)
    h.equal(root.shown(quit), ["idle", "", -1], "failed: the load is no longer awaited afterwards")

    var odd = root.rig()
    root.load(odd, root.idA)
    odd.player.failed("hasOwnProperty")
    h.equal(root.shown(odd), ["error", "E_PLAYBACK", 0],
      "failed: a code without a sentence becomes E_PLAYBACK")

    // Entering error leaves nothing of ours pending.
    var after = root.rig()
    root.load(after, root.idA)
    after.player.failed("E_TIMEOUT")
    h.check(after.playback.playTrack(root.track(root.idB)), "failed: a new track is accepted in error")
    h.equal([root.shown(after), after.resolver.names()], [["resolving", "", 0],
      ["retain", "ensure", "retain", "ensure"]],
      "failed: and starts with a plain lookup, nothing to withdraw")
  }

  // ---- Rows: play and pause ----

  function pauseAndResume() {
    var h = root.h
    var r = root.rig()
    root.play(r, root.idA)
    h.check(r.playback.playPause(), "play/pause: accepted while playing")
    h.equal(r.player.calls, [{ name: "setPause", args: [true] }], "play/pause: playing is paused")
    r.player.phase = "paused"
    root.quiet(r)
    h.check(r.playback.playPause(), "play/pause: accepted while paused")
    h.equal([r.player.calls, r.resolver.calls], [[{ name: "setPause", args: [false] }], []],
      "play/pause: paused is resumed in place, without a lookup")
    r.player.phase = "buffering"
    root.quiet(r)
    h.check(r.playback.playPause(), "play/pause: accepted while buffering")
    h.equal(r.player.calls, [{ name: "setPause", args: [true] }], "play/pause: buffering is paused")
    h.equal(root.shown(r), ["buffering", "", 0], "play/pause: the state follows the player, not the request")

    var resolving = root.rig()
    root.request(resolving, root.idA)
    root.quiet(resolving)
    h.equal([resolving.playback.playPause(), resolving.player.calls, resolving.resolver.calls], [false, [],
      []],
      "play/pause: declined while resolving")
    resolving.resolver.succeed()
    root.quiet(resolving)
    h.equal([resolving.playback.playPause(), resolving.player.calls, resolving.resolver.calls], [false, [],
      []],
      "play/pause: declined while loading")
  }

  function resumeAfterLongPause() {
    var h = root.h
    var halfHour = 1800000
    var r = root.rig()
    var key = root.play(r, root.idA)
    r.player.phase = "paused"
    r.player.position = 3601.8
    // Past the cache's own limit, but the grant still holds: in place.
    r.resolver.age(root.idA, Const.LIMITS.resolveTtlMs + halfHour - 60000)
    h.check(r.playback.playPause(), "long pause: accepted")
    h.equal([r.player.names(), r.resolver.calls], [["setPause"], []], "long pause: resumed in place at first")

    // Half an hour past it: looked up again and loaded at the same place.
    root.quiet(r)
    r.resolver.age(root.idA, Const.LIMITS.resolveTtlMs + halfHour + 60000)
    h.check(r.playback.playPause(), "long pause: accepted once the grant has aged")
    h.equal([root.shown(r), r.player.calls], [["resolving", "", 0], []],
      "long pause: resolving, mpv left alone")
    h.equal(r.resolver.calls, [{ name: "ensure", args: [root.idA, "play"] }], "long pause: one lookup")
    r.resolver.succeed()
    h.equal([root.lastLoad(r)[0], root.lastLoad(r)[4]],
      [key, { mode: "replace", startAt: 3601, live: false }],
      "long pause: the same item, loaded where it stood")
    r.player.loading(key)
    h.equal(r.events, ["ended " + key], "long pause: the old file has ended")
    root.begin(r, key)
    h.equal([root.shown(r), r.events], [["playing", "", 0], ["ended " + key, "started " + key]],
      "long pause: and it plays again")

    // The lookup was made for this attempt: an address that fails ends it.
    var renewed = root.rig()
    var renewedKey = root.play(renewed, root.idA)
    renewed.player.phase = "paused"
    renewed.resolver.age(root.idA, Const.LIMITS.resolveTtlMs + halfHour + 60000)
    renewed.playback.playPause()
    renewed.resolver.succeed()
    renewed.player.loading(renewedKey)
    root.quiet(renewed)
    renewed.player.ended(renewedKey, "error", root.noData)
    h.equal([root.shown(renewed), renewed.resolver.calls], [["error", "E_STREAM", 0], []],
      "long pause: the new lookup's address failing is E_STREAM at once")

    var held = root.rig()
    root.play(held, root.idA)
    held.player.phase = "paused"
    held.resolver.age(root.idA, Const.LIMITS.resolveTtlMs + halfHour + 60000)
    held.playback.hold = true
    h.equal([held.playback.playPause(), held.player.calls, held.resolver.calls], [false, [], []],
      "long pause: declined while held, and nothing is asked")
  }

  function retryFromError() {
    var h = root.h
    var r = root.rig()
    r.resolver.seed(root.idA)
    var key = root.open(r, root.idA)
    r.player.ended(key, "error", root.noData)
    r.resolver.succeed()
    r.player.loading(key)
    r.player.ended(key, "error", root.noData)
    h.equal(root.shown(r), ["error", "E_STREAM", 0], "try again: a recovery has ended in E_STREAM")
    var counts = [
      root.count(r.resolver, "ensure"), root.count(r.resolver, "refresh"), root.count(r.player, "load")
    ]
    h.equal(counts, [1, 1, 2], "try again: after one cached lookup and one new one")

    root.quiet(r)
    h.check(r.playback.playPause(), "try again: accepted")
    h.equal(root.shown(r), ["resolving", "", 0], "try again: resolving, the error is cleared")
    h.equal(r.resolver.calls, [{ name: "refresh", args: [root.idA] }],
      "try again: a new lookup, never the cached answer")
    r.resolver.succeed()
    h.equal([root.count(r.player, "load"), root.lastLoad(r)[0], root.lastLoad(r)[4].startAt], [1, key, 0],
      "try again: one load of the same item, from the beginning")
    r.player.loading(key)
    root.quiet(r)
    r.player.ended(key, "error", root.noData)
    h.equal([root.shown(r), r.resolver.calls], [["error", "E_STREAM", 0], []],
      "try again: its address failing is E_STREAM at once")

    // The recovery this item already had does not count against a new try.
    root.quiet(r)
    h.check(r.playback.playPause(), "try again: accepted a second time")
    h.equal(r.resolver.names(), ["refresh"], "try again: again exactly one new lookup")
    r.resolver.succeed()
    h.equal(root.count(r.player, "load"), 1, "try again: and one load")
    r.player.loading(key)
    root.quiet(r)
    r.player.ended(key, "error", "loading failed")
    h.equal([root.shown(r), r.resolver.names()], [["resolving", "", 0], ["refresh"]],
      "try again: the manual try gets the whole recovery again")

    var held = root.rig()
    root.request(held, root.idA)
    held.resolver.fail("E_NETWORK")
    root.quiet(held)
    held.playback.hold = true
    h.equal([held.playback.playPause(), root.shown(held), held.resolver.calls],
      [false, ["error", "E_NETWORK", 0], []], "try again: declined while held")
  }

  // ---- Rows: one request after another ----

  function superseding() {
    var h = root.h
    var r = root.rig()
    var keyA = root.request(r, root.idA)
    root.quiet(r)
    h.check(r.playback.playTrack(root.track(root.idB)), "superseding: a second track is accepted")
    var keyB = r.playback.current.key
    h.check(keyB !== keyA, "superseding: it has a key of its own")
    h.equal(r.resolver.calls, [
      { name: "cancelPlay", args: [] }, { name: "retain", args: [[root.idB]] },
      { name: "ensure", args: [root.idB, "play"] }
    ], "superseding: the first lookup is withdrawn, then the second is made")
    h.equal([r.playback.queue.length, r.playback.current.id], [1, root.idB],
      "superseding: the queue is replaced")
    r.resolver.deliverCancelled()
    h.equal([root.shown(r), r.player.calls], [["resolving", "", 0], []],
      "superseding: the withdrawn lookup's report changes nothing")
    r.resolver.succeed()
    h.equal(root.lastLoad(r)[0], keyB, "superseding: only the second track is loaded")

    // The same video twice in a row is two insertions.
    var twice = root.rig()
    var first = root.request(twice, root.idA)
    var second = root.request(twice, root.idA)
    h.check(second !== first, "superseding: the same video again gets a new key")
    h.equal(root.count(twice.resolver, "cancelPlay"), 1, "superseding: and withdraws the lookup before it")
  }

  function newTrackWhilePlaying() {
    var h = root.h
    var r = root.rig()
    var keyA = root.play(r, root.idA)
    var keyB = root.request(r, root.idB)
    h.equal([root.shown(r), r.playback.current.id], [["resolving", "", 0], root.idB],
      "new track: resolving, and it is the current item")
    h.equal(r.player.calls, [], "new track: what plays is left to play")
    h.equal(r.resolver.names(), ["retain", "ensure"], "new track: no lookup of ours to withdraw")
    h.equal(r.events, [], "new track: the old one has not ended yet")
    // The old track ends by itself meanwhile, and mpv goes idle.
    r.player.ended(keyA, "eof", "")
    r.player.idle()
    h.equal([root.shown(r), r.player.calls], [["resolving", "", 0], []],
      "new track: the old one ending, and mpv idling, change nothing")
    r.resolver.succeed()
    r.player.ended(keyA, "error", root.prematureEof)
    h.equal([root.shown(r), r.player.names()], [["loading", "", 0], ["load"]],
      "new track: nor does the old one failing while the load is on its way")
    r.player.loading(keyB)
    h.equal(r.events, ["ended " + keyA], "new track: the old one has ended when the new file is reported")
    root.begin(r, keyB)
    h.equal([root.shown(r), r.events], [["playing", "", 0], ["ended " + keyA, "started " + keyB]],
      "new track: it plays")
    h.equal(r.playback.recents.map(function(row) { return row.id }), [root.idB, root.idA],
      "new track: most recent first")
  }

  function seeking() {
    var h = root.h
    var r = root.rig()
    root.play(r, root.idA)
    h.equal([r.playback.seekTo(10), r.playback.previous(), r.player.calls], [false, false, []],
      "seek: declined while the length is unknown")
    r.player.duration = 200
    var targets = [[50, 50], [12.5, 12.5], [500, 199], [199.5, 199], [-3, 0], [Infinity, null], [NaN, null]]
    for (var i = 0; i < targets.length; i++) {
      root.quiet(r)
      var accepted = r.playback.seekTo(targets[i][0])
      var sought = r.player.calls.length === 1 ? r.player.calls[0].args[0] : null
      h.equal([accepted, r.player.names(), sought],
        targets[i][1] === null ? [false, [], null] : [true, ["seek"], targets[i][1]],
        "seek: to " + targets[i][0])
    }
    root.quiet(r)
    h.equal([r.playback.previous(), r.player.calls], [true, [{ name: "seek", args: [0] }]],
      "seek: previous starts the track again")
    h.equal([r.playback.next(), r.player.calls.length], [false, 1], "seek: next has nowhere to go")
    r.player.phase = "paused"
    h.check(r.playback.seekTo(20), "seek: accepted while paused")
    r.player.phase = "buffering"
    h.check(r.playback.seekTo(30), "seek: accepted while buffering")
    r.player.duration = 0.5
    root.quiet(r)
    h.equal([r.playback.seekTo(30), r.player.calls[0].args], [true, [0]],
      "seek: a very short track seeks to 0")

    var loading = root.rig()
    root.open(loading, root.idA)
    loading.player.duration = 200
    h.equal([loading.playback.seekTo(10), loading.playback.previous()], [false, false],
      "seek: declined before the track has started")
  }

  // ---- Rows: the lists ----

  function recentTracks() {
    var h = root.h
    var r = root.rig()
    var ids = [root.idA, root.idB, root.idA, root.idC, root.idB]
    for (var i = 0; i < ids.length; i++) {
      root.play(r, ids[i])
      r.playback.stop()
    }
    h.equal(r.playback.recents.map(function(row) { return row.id }), [root.idB, root.idC, root.idA],
      "recents: most recent first, each id once")
    h.equal(Object.keys(r.playback.recents[0]).sort(), ["channel", "duration", "id", "live", "title"],
      "recents: tracks, without a key")

    // A track that never started is not remembered.
    root.open(r, "DDDDDDDDDDD")
    r.playback.stop()
    h.equal(r.playback.recents.length, 3, "recents: only what has started")

    var full = root.rig()
    var stored = []
    for (var n = 10; n < 45; n++) stored.push(root.track("EEEEEEEEE" + n))
    full.playback.restore({ recents: stored })
    h.equal(full.playback.recents.length, Const.LIMITS.recents, "recents: at most thirty are put back")
    root.play(full, root.idA)
    h.equal([full.playback.recents.length, full.playback.recents[0].id, full.playback.recents[29].id],
      [Const.LIMITS.recents, root.idA, "EEEEEEEEE38"], "recents: the oldest makes room for a new one")
  }

  function savedLists() {
    var h = root.h
    var r = root.rig()
    var key = root.request(r, root.idA)
    h.equal(r.patches, [{
      recents: [], queue: { items: [{
        id: root.idA, title: "Title A", channel: "Channel", duration: 200, live: false, auto: false
      }], index: 0 }
    }], "saved: a start hands the queue to the store, items without their key")
    r.resolver.succeed({ title: "Looked up" })
    h.equal([r.patches.length, r.patches[1].queue.items[0].title], [2, "Looked up"],
      "saved: the lookup's fields are handed over")
    r.player.loading(key)
    root.begin(r, key)
    h.equal([r.patches.length, r.patches[2].recents.map(function(row) { return row.id })], [3, [root.idA]],
      "saved: a start hands over the recent tracks")
    r.playback.stop()
    h.equal([r.patches.length, r.patches[3].queue.index, r.patches[3].queue.items.length], [4, -1, 1],
      "saved: a stop hands over the emptied position")
    h.check(JSON.stringify(r.patches).indexOf("\"key\"") === -1, "saved: no key is ever handed over")
    h.equal(Object.keys(r.patches[3]).sort(), ["queue", "recents"], "saved: the two lists and nothing else")

    // What the store was handed is its own: later changes do not reach it.
    var kept = []
    var live = root.rig()
    live.playback.store = { patch: function(changes) { kept.push(changes) } }
    root.play(live, root.idA)
    var handed = kept[kept.length - 1]
    var before = JSON.stringify(handed)
    root.play(live, root.idB)
    h.equal(JSON.stringify(handed), before, "saved: a handed-over list is not changed afterwards")

    var none = h.mount("core/Playback.qml", {
      player: h.mount("tests/harness/FakePlayer.qml", {}),
      resolver: h.mount("tests/harness/FakeResolver.qml", {}), hold: false, persistHistory: true
    })
    h.check(none.playTrack(root.track(root.idA)), "saved: without a store playback works all the same")
    none.clearHistory()
    h.equal(none.status, "resolving", "saved: and clearing does too")
  }

  function historyOff() {
    var h = root.h
    var r = root.rig(false)
    root.play(r, root.idA)
    r.playback.stop()
    root.play(r, root.idB)
    h.equal(r.patches, [], "history off: the store is told nothing about what is played")
    h.equal(r.playback.recents.length, 2, "history off: the lists work for the session")

    // Switched on: what changed meanwhile is handed over, once.
    r.playback.persistHistory = true
    h.equal([r.patches.length, r.patches[0].recents.map(function(row) { return row.id })],
      [1, [root.idB, root.idA]], "history on: the lists as they are now are handed over")
    r.playback.persistHistory = false
    r.playback.persistHistory = true
    h.equal(r.patches.length, 1, "history on: nothing more when nothing changed")

    // At start-up the setting turns true once, with nothing played yet.
    var startUp = root.rig(false)
    startUp.playback.restore({
      recents: [root.track(root.idA)], queue: { items: [root.track(root.idB)], index: 0 }
    })
    startUp.playback.persistHistory = true
    h.equal(startUp.patches, [], "history on: start-up hands nothing over, so nothing is written")

    // Clearing reaches the store whatever the setting says.
    var cleared = root.rig(false)
    root.play(cleared, root.idA)
    cleared.playback.clearHistory()
    h.equal([cleared.patches.length, cleared.patches[0].recents, cleared.patches[0].queue.items.length],
      [1, [], 1], "history off: a cleared list is handed over at once")
    cleared.playback.persistHistory = true
    h.equal(cleared.patches.length, 1, "history off: and not a second time when history is switched on")
  }

  function restoring() {
    var h = root.h
    var r = root.rig()
    var auto = root.track(root.idC)
    auto.auto = true
    var hostile = { id: root.idB, title: "x", channel: "y", duration: 1, live: false, key: 77, extra: "no" }
    r.playback.restore({
      recents: [root.track(root.idA), hostile, root.track(root.idA), { id: "short" }, null, 7],
      queue: { items: [hostile, { title: "no id" }, "text", auto], index: 3 }
    })
    h.equal(r.playback.recents, [root.track(root.idA), { id: root.idB, title: "x", channel: "y", duration: 1,
      live: false }], "restore: the valid recent tracks, each id once, built anew")
    h.equal(r.playback.queue.map(function(item) { return [item.id, item.key, item.auto] }),
      [[root.idB, 1, false], [root.idC, 2, true]],
      "restore: the valid queue items, with keys of this service")
    h.equal(Object.keys(r.playback.queue[0]).sort(),
      ["auto", "channel", "duration", "id", "key", "live", "title"],
      "restore: built anew, nothing extra")
    h.equal(root.shown(r), ["idle", "", 1], "restore: idle, on the item that was current")
    h.equal(r.playback.current.id, root.idC, "restore: the position follows the items that were dropped")
    h.equal([r.player.calls, r.resolver.calls, r.patches, r.events], [[], [], [], []],
      "restore: nothing starts, nothing is asked, nothing is handed back to the store")

    r.playback.hold = true
    h.equal([r.playback.playPause(), r.resolver.calls], [false, []], "restore: not started while held")
    r.playback.hold = false
    h.check(r.playback.playPause(), "restore: play starts the restored item")
    h.equal([root.shown(r), r.resolver.names(), r.playback.queue.length], [["resolving", "", 1],
      ["ensure"], 2],
      "restore: with a plain lookup, the queue as it was")
    r.resolver.succeed()
    h.equal(root.lastLoad(r)[4].startAt, 0, "restore: from the beginning")
    r.playback.restore({ recents: [], queue: { items: [], index: -1 } })
    h.equal([r.playback.queue.length, r.playback.recents.length], [2, 2],
      "restore: refused once something plays")

    var dropped = root.rig()
    dropped.playback.restore({ queue: { items: [{ id: "short" }, root.track(root.idA)], index: 0 } })
    h.equal([dropped.playback.queue.length, dropped.playback.queueIndex, dropped.playback.current],
      [1, -1, null], "restore: a current item that is not valid leaves none current")
    h.equal(dropped.playback.playPause(), false, "restore: and then there is nothing to play")

    var odd = [null, undefined, "text", 5, [], {}, { recents: "x", queue: "y" }, { queue: { items: {} } },
      { queue: { items: [root.track(root.idA)], index: 5 } }, { queue: { items: [root.track(root.idA)] } },
      { queue: { items: [root.track(root.idA)], index: "0" } }]
    for (var i = 0; i < odd.length; i++) {
      var each = root.rig()
      each.playback.restore(odd[i])
      h.equal([root.shown(each), each.playback.recents], [["idle", "", -1], []],
        "restore: odd input " + i + " leaves nothing current")
    }
  }

  function clearing() {
    var h = root.h
    var r = root.rig()
    root.play(r, root.idA)
    r.playback.stop()
    var key = root.play(r, root.idB)
    r.playback.clearHistory()
    h.equal(r.playback.recents, [], "clear: no recent tracks")
    h.equal([r.playback.queue.length, r.playback.current.key, root.shown(r)], [1, key, ["playing", "", 0]],
      "clear: the queue is the current item, which keeps playing")
    h.equal([r.player.calls, r.resolver.calls, r.events], [[], [], []],
      "clear: nothing is asked of the parts")
    h.equal(r.patches, [{
      recents: [], queue: { items: [{
        id: root.idB, title: "Fake title", channel: "Fake channel", duration: 200, live: false, auto: false
      }], index: 0 }
    }], "clear: the store is handed the cleared lists")
    h.equal(r.playback.keepIds(), [root.idB], "clear: the current id is still to be kept")

    var two = root.rig()
    var keys = root.twoItems(two)
    two.player.loading(keys[1])
    two.playback.clearHistory()
    h.equal([two.playback.queue.length, two.playback.queueIndex, two.playback.current.key], [1, 0, keys[1]],
      "clear: a longer queue is cut down to the current item")

    var idle = root.rig()
    root.play(idle, root.idA)
    idle.playback.stop()
    idle.playback.clearHistory()
    h.equal([idle.playback.queue, idle.playback.recents, root.shown(idle)], [[], [], ["idle", "", -1]],
      "clear: with nothing current, both lists are empty")
  }

  // ---- Rows: a queue ----

  // A queue of three with the first item playing, mpv holding it and the
  // item after it, and everything said so far forgotten.
  function threeItems(r) {
    var ids = [root.idA, root.idB, root.idC]
    for (var i = 0; i < ids.length; i++) r.playback.enqueueTrack(root.track(ids[i]))
    var keys = r.playback.queue.map(function(item) { return item.key })
    root.carry(r)
    root.quiet(r)
    return keys
  }

  // Plays the parts of the lookup and of mpv for the current item: the
  // lookup answers, mpv reports its playlist, opens the file and plays it,
  // and whatever is looked up or reported after that happens too.
  function carry(r) {
    var item = r.playback.current
    r.resolver.succeedFor(item.id)
    r.player.report()
    root.h.check(r.player.open(item.key), "set-up: mpv holds the entry it opens")
    root.begin(r, item.key)
    for (var i = 0; i < 3; i++) {
      while (r.resolver.pending() > 0) r.resolver.succeed()
      r.player.report()
    }
  }

  function removedKeys(r) {
    return r.player.calls.filter(function(call) { return call.name === "removeKey" }).map(function(call) {
      return call.args[0]
    })
  }

  function endOfTrackInAQueue() {
    var h = root.h
    var r = root.rig()
    var keys = root.threeItems(r)
    h.equal([r.player.holds(keys[1]), r.player.playlist()], [true, [keys[0], keys[1]]],
      "end, queued: set-up, mpv holds the next entry")
    r.player.ended(keys[0], "eof", "")
    h.equal([root.shown(r), r.player.calls, r.resolver.calls, r.events], [["playing", "", 0], [], [], []],
      "end, queued: with the next entry held, nothing is done")
    r.player.open(keys[1])
    h.equal([root.shown(r), r.events], [["loading", "", 1], ["ended " + keys[0]]],
      "end, queued: mpv's own start of the next entry moves the queue on")

    // The next item is not in mpv's playlist: its lookup has not answered.
    var late = root.rig()
    late.playback.enqueueTrack(root.track(root.idA))
    late.playback.enqueueTrack(root.track(root.idB))
    var lateKeys = late.playback.queue.map(function(item) { return item.key })
    late.resolver.succeedFor(root.idA)
    late.player.report()
    late.player.open(lateKeys[0])
    root.begin(late, lateKeys[0])
    root.quiet(late)
    late.player.ended(lateKeys[0], "eof", "")
    h.equal(root.shown(late), ["resolving", "", 1],
      "end, queued: an entry mpv does not hold gets a start request")
    h.equal([late.player.calls, late.resolver.calls.filter(function(call) { return call.name !== "retain" })],
      [[], [{ name: "ensure", args: [root.idB, "play"] }]], "end, queued: a lookup for playing, no shutdown")
    late.player.idle()
    h.equal(root.shown(late), ["resolving", "", 1], "end, queued: mpv's idle in between is not a stop")
    h.equal(late.events, ["ended " + lateKeys[0]], "end, queued: the track that ended is announced as ended")
  }

  // A lookup fails because of the track, and the item after it is one mpv
  // holds: the track that still plays. No file failed inside mpv, so mpv
  // starts nothing by itself; waiting for it would never end.
  function skippedLookupOntoAHeldEntry() {
    var h = root.h
    var r = root.rig()
    var keys = root.threeItems(r)
    r.playback.next()
    root.carry(r)
    h.equal([root.shown(r), r.player.playlist()], [["playing", "", 1], keys], "skip, lookup: set-up")
    r.player.position = 1
    r.playback.previous()
    root.quiet(r)
    h.equal(r.player.holds(keys[1]), true, "skip, lookup: mpv holds the item after the one asked for")
    r.resolver.failFor(root.idA, "E_YT_REFUSED")
    h.equal([root.shown(r), r.playback.noticeCode], [["resolving", "", 1], "N_SKIPPED"],
      "skip, lookup: a start request for the next item, never a wait")
    h.equal(r.resolver.calls.filter(function(call) { return call.name !== "retain" }),
      [{ name: "ensure", args: [root.idB, "play"] }], "skip, lookup: with a lookup")
    h.equal(r.player.calls, [], "skip, lookup: and the player left alone until it answers")
    r.resolver.succeedFor(root.idB)
    h.equal([root.shown(r), root.lastLoad(r)[0], root.lastLoad(r)[4].mode],
      [["loading", "", 1], keys[1], "replace"],
      "skip, lookup: then a replacing load of it")
  }

  // A file fails inside mpv for good, for a reason of its own, while mpv
  // holds the next entry: mpv is on its way there already.
  function skippedInsideMpv() {
    var h = root.h
    var failTwice = function(r, keys) {
      r.player.position = 50
      r.player.ended(keys[0], "error", "decoder failed")
      root.carry(r)
      root.quiet(r)
      r.player.position = 55
      r.player.ended(keys[0], "error", "decoder failed")
    }
    var r = root.rig()
    var keys = root.threeItems(r)
    failTwice(r, keys)
    h.equal([root.shown(r), r.playback.noticeCode], [["loading", "", 0], "N_SKIPPED"],
      "skip, in mpv: loading, with the notice")
    h.equal([r.player.calls, r.resolver.calls], [[], []], "skip, in mpv: nothing is called")
    h.equal(r.events, ["ended " + keys[0]], "skip, in mpv: the failed track has ended")
    r.player.loading(keys[1])
    h.equal(root.shown(r), ["loading", "", 1],
      "skip, in mpv: mpv's start of the next entry moves the queue on")
    root.begin(r, keys[1])
    h.equal(root.shown(r), ["playing", "", 1], "skip, in mpv: which then plays")

    var idle = root.rig()
    var idleKeys = root.threeItems(idle)
    failTwice(idle, idleKeys)
    idle.player.idle()
    h.equal([root.shown(idle), idle.player.names()], [["idle", "", -1], ["shutdown"]],
      "skip, in mpv: an idle instead ends in idle")
  }

  function startRequestSparesWhatPlays() {
    var h = root.h
    var r = root.rig()
    var keys = root.threeItems(r)
    r.playback.next()
    root.carry(r)
    root.quiet(r)
    r.player.currentKey = keys[1]
    h.check(r.playback.queuePlay(keys[2]), "spares: another row is asked for")
    h.equal(root.removedKeys(r), [keys[2], keys[0]], "spares: the other entries leave, from the back")
    h.equal(r.player.playlist(), [keys[1]], "spares: the entry that plays is not among them")
    h.equal(root.count(r.player, "load"), 0, "spares: and nothing is added before the new track has started")
    r.player.report()
    r.player.clearCalls()
    h.check(r.playback.playTrack(root.track(root.idA)), "spares: a new track altogether")
    h.equal([root.removedKeys(r), r.player.playlist()], [[], [keys[1]]],
      "spares: there is nothing left to remove, and the playing entry stays")
    r.resolver.succeed()
    h.equal([root.lastLoad(r)[4].mode, r.player.playlist()], ["replace", [r.playback.current.key]],
      "spares: until the replacing load takes its place")
  }

  // The player turns keys into positions through what mpv last reported.
  // So the window is planned only against a report that shows the last
  // thing sent.
  function windowWaitsForMpv() {
    var h = root.h
    var r = root.rig()
    r.playback.enqueueTrack(root.track(root.idA))
    r.playback.enqueueTrack(root.track(root.idB))
    r.resolver.seed(root.idB)
    var keys = r.playback.queue.map(function(item) { return item.key })
    r.resolver.succeedFor(root.idA)
    r.player.currentKey = keys[0]
    r.player.loading(keys[0])
    root.begin(r, keys[0])
    h.equal([root.shown(r), root.count(r.player, "load")], [["playing", "", 0], 1],
      "window: the track plays, and mpv has not reported its playlist yet: nothing is added")
    r.player.report()
    h.equal([root.count(r.player, "load"), root.lastLoad(r)[0], root.lastLoad(r)[4]],
      [2, keys[1], { mode: "append-play", index: -1, startAt: 0, live: false }],
      "window: at mpv's report the next item is appended, to be played after this one")
    h.equal(root.lastLoad(r)[3], r.resolver.entry(root.idB).file, "window: from the file its lookup wrote")
    r.player.clearCalls()
    r.player.report()
    r.player.report()
    h.equal(r.player.calls, [], "window: a playlist in shape is left alone, however often it is reported")
    h.equal(r.playback.keepIds(), [root.idA, root.idB], "window: both lookups are to be kept")

    // In idle and in error there is no mpv to plan for.
    r.playback.stop()
    r.player.clearCalls()
    r.player.entryKeys = [7, 8]
    h.equal(r.player.calls, [], "window: a report in idle is ignored")
  }

  function lookingAhead() {
    var h = root.h
    var r = root.rig()
    r.playback.enqueueTrack(root.track(root.idA))
    h.equal(r.playback.enqueueId(root.idB), "ok", "ahead: set-up, a second item known by its id")
    var keys = r.playback.queue.map(function(item) { return item.key })
    r.resolver.succeedFor(root.idA)
    r.player.report()
    r.player.open(keys[0])
    r.resolver.clearCalls()
    h.equal(r.resolver.pending(), 0, "ahead: nothing is looked up while the track loads")
    root.begin(r, keys[0])
    h.equal(r.resolver.calls, [{ name: "ensure", args: [root.idB, "next"] }],
      "ahead: once it plays, the item after it is looked up in the background")
    r.playback.enqueueTrack(root.track(root.idC))
    r.playback.queueMove(keys[0], 0)
    h.equal(root.count(r.resolver, "ensure"), 1, "ahead: once, whatever happens to the queue meanwhile")
    r.resolver.succeedFor(root.idB, { title: "Looked up" })
    h.equal([r.playback.queue[1].title, r.playback.queue[1].key], ["Looked up", keys[1]],
      "ahead: the answer names the item")
    h.equal([root.lastLoad(r)[0], root.lastLoad(r)[2], root.lastLoad(r)[4].mode],
      [keys[1], "Looked up", "append-play"], "ahead: and puts it into mpv's playlist")
    h.equal(root.shown(r), ["playing", "", 0], "ahead: the track that plays is not disturbed")

    // A lookup ahead that fails costs nothing: the track gets its own
    // attempt, and its own error, when its turn comes.
    var failing = root.rig()
    failing.playback.enqueueTrack(root.track(root.idA))
    failing.playback.enqueueTrack(root.track(root.idB))
    var failingKeys = failing.playback.queue.map(function(item) { return item.key })
    failing.resolver.succeedFor(root.idA)
    failing.player.report()
    failing.player.open(failingKeys[0])
    root.begin(failing, failingKeys[0])
    root.quiet(failing)
    failing.resolver.failFor(root.idB, "E_NETWORK")
    h.equal([root.shown(failing), failing.playback.noticeCode, failing.player.calls, failing.resolver.calls],
      [["playing", "", 0], "", [], []], "ahead: a failed lookup changes nothing")

    // While nothing may be started, nothing is looked up ahead either.
    var held = root.rig()
    held.playback.enqueueTrack(root.track(root.idA))
    held.playback.enqueueTrack(root.track(root.idB))
    var heldKeys = held.playback.queue.map(function(item) { return item.key })
    held.resolver.succeedFor(root.idA)
    held.player.report()
    held.player.open(heldKeys[0])
    held.playback.hold = true
    held.resolver.clearCalls()
    root.begin(held, heldKeys[0])
    h.equal(root.count(held.resolver, "ensure"), 0, "ahead: not under a hold")
  }

  // A video that needs a signed-in account: the saved login is used only
  // when the user asks for it, for that one attempt.
  function withTheAccount() {
    var h = root.h
    var r = root.rig()
    root.request(r, root.idA)
    h.check(r.playback.playWithAccount() === false, "account: not while a lookup runs")
    r.resolver.fail("E_NEEDS_ACCOUNT")
    h.equal(root.shown(r), ["error", "E_NEEDS_ACCOUNT", 0], "account: set-up")
    root.quiet(r)
    h.check(r.playback.playWithAccount(), "account: accepted for the track that needs one")
    h.equal([root.shown(r), r.resolver.calls], [["resolving", "", 0], [{
      name: "refreshWithAccount", args: [root.idA]
    }]], "account: one lookup with the login, for that video")
    r.resolver.succeed()
    h.equal([root.shown(r), root.lastLoad(r)[1], root.lastLoad(r)[4].mode],
      [["loading", "", 0], root.idA, "replace"],
      "account: its answer is loaded like any other")
    var key = r.playback.current.key
    r.player.loading(key)
    root.begin(r, key)
    h.check(r.playback.playWithAccount() === false, "account: not while the track plays")
    // A recovery is made here, not asked for by the user: it never
    // carries the login.
    root.quiet(r)
    r.player.position = 50
    r.player.ended(key, "error", root.prematureEof)
    h.equal(r.resolver.names().filter(function(name) { return name !== "retain" }), ["refresh"],
      "account: a recovery of that track looks it up without the login")
    r.resolver.fail("E_NEEDS_ACCOUNT")
    h.equal(root.shown(r), ["error", "E_NEEDS_ACCOUNT", 0],
      "account: and so ends where the user can ask again")
    root.quiet(r)
    h.check(r.playback.playPause(), "account: an ordinary retry")
    h.equal(r.resolver.names(), ["refresh"], "account: does not carry the login either")
    r.resolver.fail("E_NETWORK")
    h.check(r.playback.playWithAccount() === false, "account: not offered for another error")
    r.playback.stop()
    h.check(r.playback.playWithAccount() === false, "account: not in idle")

    // The login never takes the place of a lookup made for another reason.
    var held = root.rig()
    root.request(held, root.idA)
    held.resolver.fail("E_NEEDS_ACCOUNT")
    held.playback.hold = true
    held.resolver.clearCalls()
    h.check(held.playback.playWithAccount() === false, "account: refused while nothing may start")
    h.equal(held.resolver.calls, [], "account: and nothing is looked up")

    // A resolver that has no such lookup: the request declines.
    var bare = root.bareResolver()
    var old = root.rig()
    old.playback.resolver = bare
    old.playback.playTrack(root.track(root.idA))
    bare.waiting.shift()({ ok: false, code: "E_NEEDS_ACCOUNT", entry: null, cached: false })
    h.equal(root.shown(old), ["error", "E_NEEDS_ACCOUNT", 0], "account: set-up without the lookup")
    h.check(old.playback.playWithAccount() === false, "account: declines when the resolver cannot do it")
    h.equal(root.shown(old), ["error", "E_NEEDS_ACCOUNT", 0], "account: and the error stays")
  }
}
