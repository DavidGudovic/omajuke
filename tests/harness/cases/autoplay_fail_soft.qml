import QtQuick

// Autoplay must never cost anything. In core/Playback.qml, against
// scripted parts: whatever the source of related tracks answers (an error,
// nothing, something that is no list, an answer that comes twice or too
// late), the track that plays goes on, the queue stays as it is and the
// user is told nothing: nobody asked for related tracks, and a video
// without any is no news. And when the tracks autoplay adds keep failing,
// it rests until the user plays something.
QtObject {
  id: root

  property var h: null

  function run(h) {
    root.h = h
    var rows = [
      root.failuresWhilePlaying, root.aCancelledQuestion, root.answeredTwice, root.failureAfterTheEnd,
      root.afterAFailure, root.aSourceThatAnswersAtOnce, root.restingAfterThreeFailures
    ]
    for (var i = 0; i < rows.length; i++) rows[i]()
    root.quietLog()
    h.finish()
  }

  function quietLog() {
    var log = root.h.readFile(root.h.runDir + "/out.txt")
    var files = ["Playback.qml", "Queue.js", "FakePlayer.qml", "FakeResolver.qml", "autoplay_fail_soft.qml"]
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
    var r = { patches: [], states: [], mix: { asked: [], waiting: [] } }
    r.player = h.mount("tests/harness/FakePlayer.qml", { duration: 200 })
    r.resolver = h.mount("tests/harness/FakeResolver.qml", {})
    r.playback = h.mount("core/Playback.qml", {
      player: r.player, resolver: r.resolver, hold: false, persistHistory: true
    })
    r.playback.store = { patch: function(changes) { r.patches.push(JSON.parse(JSON.stringify(changes))) } }
    r.playback.mixer = {
      mix: function(id, done) {
        r.mix.asked.push(id)
        r.mix.waiting.push(done)
      }
    }
    r.playback.settings = { autoplay: true }
    r.playback.statusChanged.connect(function() { r.states.push(r.playback.status) })
    return r
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

  // One track playing, its related tracks asked for and not answered yet.
  function asking() {
    var r = root.rig()
    r.playback.playTrack(root.track("A"))
    root.start(r)
    root.h.equal(r.mix.asked, [root.id("A")], "set-up: related tracks were asked for")
    r.player.clearCalls()
    r.resolver.clearCalls()
    r.patches.length = 0
    r.states.length = 0
    return r
  }

  // Everything that must stay as it was.
  function untouched(r) {
    return [r.playback.status, r.playback.errorCode, r.playback.queue.length, r.playback.queueIndex,
      r.player.calls, r.resolver.calls, r.patches, r.states, r.player.playlist().length]
  }

  readonly property var asBefore: ["playing", "", 1, 0, [], [], [], [], 1]

  // ---- Rows ----

  function failuresWhilePlaying() {
    var h = root.h
    var answers = [
      ["an error", { ok: false, code: "E_NETWORK", tracks: [] }],
      ["a refusal", { ok: false, code: "E_YT_BLOCKED" }],
      ["a missing tool", { ok: false, code: "E_YTDLP_MISSING" }],
      ["a failure without a code", { ok: false }],
      ["an error that brings tracks all the same",
        { ok: false, code: "E_TIMEOUT", tracks: [root.track("B")] }],
      ["no tracks", { ok: true, code: "", tracks: [] }],
      ["no list", { ok: true, code: "" }],
      ["text for a list", { ok: true, tracks: "BBBBBBBBBBB" }],
      ["an object for a list", { ok: true, tracks: { 0: root.track("B"), length: 1 } }],
      ["only the seed", { ok: true, tracks: [root.track("A")] }],
      ["only rows that are no tracks", { ok: true, tracks: [null, 7, "x", {}, { id: "nope" }, []] }],
      ["a yes that is not the boolean", { ok: "true", tracks: [root.track("B")] }],
      ["nothing", null],
      ["nothing at all", undefined],
      ["a word", "ok"],
      ["a number", 1]
    ]
    for (var i = 0; i < answers.length; i++) {
      var r = root.asking()
      r.mix.waiting.shift()(answers[i][1])
      h.equal(r.playback.noticeCode, "", answers[i][0] + ": no notice")
      h.equal(root.untouched(r), root.asBefore, answers[i][0] + ": and nothing else")
      // Playing goes on to its end as if nothing had been asked.
      r.player.ended(r.playback.current.key, "eof", "")
      h.equal([r.playback.status, r.playback.errorCode, r.playback.queue.length], ["idle", "", 1],
        answers[i][0] + ": the track plays to its end, and then nothing")
    }
  }

  function aCancelledQuestion() {
    var h = root.h
    var r = root.asking()
    r.mix.waiting.shift()({ ok: false, code: "cancelled" })
    h.equal([r.playback.noticeCode, root.untouched(r)], ["", root.asBefore],
      "cancelled: a question that was withdrawn is no failure and shows nothing")
  }

  function answeredTwice() {
    var h = root.h
    var r = root.asking()
    var done = r.mix.waiting.shift()
    done({ ok: false, code: "E_NETWORK" })
    done({ ok: true, code: "", tracks: [root.track("B")] })
    h.equal([r.playback.noticeCode, r.playback.queue.length], ["", 2],
      "twice: the first answer after a failure counts")
    done({ ok: true, code: "", tracks: [root.track("C")] })
    done({ ok: false, code: "E_NETWORK" })
    h.equal([r.playback.noticeCode, r.playback.queue.length], ["", 2],
      "twice: once tracks follow the seed, a further answer is dropped, without a notice")
  }

  function failureAfterTheEnd() {
    var h = root.h
    var r = root.asking()
    r.player.ended(r.playback.current.key, "eof", "")
    r.player.clearCalls()
    r.resolver.clearCalls()
    r.states.length = 0
    r.mix.waiting.shift()({ ok: false, code: "E_NETWORK" })
    h.equal([r.playback.status, r.playback.errorCode, r.playback.noticeCode], ["idle", "", ""],
      "after the end: no notice, and playing stays over")
    h.equal([r.player.calls, r.resolver.calls, r.states, r.playback.queue.length], [[], [], [], 1],
      "after the end: nothing is started")
  }

  function afterAFailure() {
    var h = root.h
    var again = root.asking()
    again.mix.waiting.shift()({ ok: false, code: "E_NETWORK" })
    again.playback.playTrack(root.track("B"))
    h.equal([again.playback.status === "idle", again.playback.noticeCode], [false, ""],
      "after a failure: the next thing the user plays starts like any other")
    // Nothing went wrong for the track that plays: the transport answers.
    var live = root.asking()
    live.mix.waiting.shift()({ ok: false, code: "E_NETWORK" })
    h.check(live.playback.playPause(), "after a failure: pause still works")
    h.equal(live.player.names(), ["setPause"], "after a failure: and reaches the player")
  }

  // Nothing here depends on the answer coming later than the question.
  function aSourceThatAnswersAtOnce() {
    var h = root.h
    var r = root.rig()
    var asked = []
    r.playback.mixer = {
      mix: function(id, done) {
        asked.push(id)
        done({ ok: false, code: "E_NETWORK" })
      }
    }
    r.playback.playTrack(root.track("A"))
    root.start(r)
    h.equal([r.playback.status, r.playback.noticeCode, asked], ["playing", "", [root.id("A")]],
      "at once: a failure inside the call is as silent")

    var good = root.rig()
    good.playback.mixer = {
      mix: function(id, done) { done({ ok: true, code: "", tracks: [root.track("B"), root.track("C")] }) }
    }
    good.playback.playTrack(root.track("A"))
    root.start(good)
    var q = good.playback
    h.equal([q.status, q.queue.length, q.queueIndex, q.noticeCode], ["playing", 3, 0, ""],
      "at once: and tracks inside the call are added")
    h.equal(good.player.playlist().length, 2, "at once: the first of them joins mpv's playlist")

    // A source that fails instead of answering is one more failure: the
    // track that has just started is announced and plays like any other.
    var broken = root.rig()
    var announced = []
    broken.playback.trackStarted.connect(function(item) { announced.push(item.id) })
    broken.playback.mixer = { mix: function(id, done) { throw new Error("no answer") } }
    broken.playback.playTrack(root.track("A"))
    root.start(broken)
    h.equal([broken.playback.status, broken.playback.errorCode, broken.playback.noticeCode, announced],
      ["playing", "", "", [root.id("A")]], "at once: a source that throws costs nothing either")
  }

  // What the set-up of the last two rows shares: the first track plays,
  // the related tracks arrive and the user's own are added behind them.
  // Nothing is looked up ahead here, so that each track is first tried
  // when its turn comes.
  function mixed(related, own) {
    var r = root.rig()
    r.playback.playTrack(root.track("A"))
    root.begin(r, "A")
    r.mix.waiting.shift()({ ok: true, code: "", tracks: related.map(root.track) })
    for (var i = 0; i < own.length; i++) r.playback.enqueueTrack(root.track(own[i]))
    return r
  }

  function keyOf(r, letter) {
    return r.playback.queue.filter(function(item) { return item.id === root.id(letter) })[0].key
  }

  // The lookup of this track answers, and mpv plays it.
  function begin(r, letter) {
    r.resolver.succeedFor(root.id(letter))
    r.player.report()
    root.h.check(r.player.open(root.keyOf(r, letter)), "set-up: mpv holds the entry it opens")
    r.player.begin(root.keyOf(r, letter))
  }

  // The track that plays ends, and the one after it cannot be looked up:
  // not ahead of time, and not when it is its turn.
  function endsBeforeAFailure(r, letter) {
    r.resolver.failFor(root.id(letter), "E_YT_REFUSED")
    r.player.ended(r.playback.current.key, "eof", "")
    root.h.equal([r.playback.status, r.playback.current.id[0]], ["resolving", letter],
      "resting: at the end of a track, " + letter + " is tried")
    r.resolver.failFor(root.id(letter), "E_YT_REFUSED")
  }

  // Three items autoplay added fail without one of them playing in
  // between: autoplay rests, and the next track the user plays wakes it.
  function restingAfterThreeFailures() {
    var h = root.h
    var r = root.mixed(["X", "Y", "Z"], ["U", "V", "W"])
    // The user's own tracks, placed between the added ones.
    r.playback.queueMove(root.keyOf(r, "U"), -2)
    r.playback.queueMove(root.keyOf(r, "V"), -1)
    h.equal(r.playback.queue.map(function(item) { return item.id[0] + (item.auto ? "*" : "") }).join(" "),
      "A X* U Y* V Z* W", "resting: set-up, added tracks and the user's own in turn")
    var added = ["X", "Y", "Z"]
    var own = ["U", "V", "W"]
    for (var i = 0; i < added.length; i++) {
      root.endsBeforeAFailure(r, added[i])
      h.equal([r.playback.status, r.playback.current.id[0], r.playback.noticeCode],
        ["resolving", own[i], "N_SKIPPED"], "resting: it is skipped, and " + own[i] + " is tried")
      root.begin(r, own[i])
      h.equal([r.playback.status, r.playback.errorCode], ["playing", ""], "resting: " + own[i] + " plays")
    }
    h.equal([r.playback.current.id[0], r.playback.queueIndex, r.playback.queue.length], ["W", 6, 7],
      "resting: the last item of the queue plays")
    h.equal(r.mix.asked, [root.id("A")], "resting: and nothing is asked for it: autoplay rests")
    // The user plays it again: autoplay is back.
    r.playback.queuePlay(root.keyOf(r, "W"))
    root.begin(r, "W")
    h.equal(r.mix.asked, [root.id("A"), root.id("W")], "resting: until the user plays something")

    // An added track that plays in between says that autoplay still finds
    // playable tracks: the count starts again.
    var again = root.mixed(["X", "Y", "Z", "Q"], ["W"])
    root.endsBeforeAFailure(again, "X")
    again.resolver.failFor(root.id("Y"), "E_YT_REFUSED")
    h.equal([again.playback.status, again.playback.current.id[0]], ["resolving", "Z"],
      "resting: two added tracks fail, the third is tried")
    root.begin(again, "Z")
    root.endsBeforeAFailure(again, "Q")
    root.begin(again, "W")
    h.equal([again.playback.status, again.playback.current.id[0], again.mix.asked],
      ["playing", "W", [root.id("A"), root.id("W")]],
      "resting: three failed in all, but one played in between, so autoplay goes on")
  }
}
