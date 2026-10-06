"use strict"
// Tests for lib/Recover.js: every cell of the decision table for a track
// that failed to start or broke off, the rule that allows one recovery per
// track and another only after it has played on, live streams, and what a
// new request by the user does to that memory.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Recover = load.lib("Recover")
var Const = load.lib("Const")

var SPAN = Const.TIMEOUTS.recoverSpanSec

// mpv's error texts, as the player passes them on.
var NO_DATA = "no audio or video data played"
var HANDOFF = ["loading failed", "unrecognized file format"]
var PREMATURE = "premature-eof"
// Something mpv might say about a file that was already playing.
var OTHER = "audio output initialization failed"

// A failure of track 7 that had no recovery yet; each test changes what it
// is about.
function ctx(changes) {
  var base = { key: 7, fileError: "", started: false, cached: false, live: false, position: 0, last: null }
  Object.keys(changes || {}).forEach(function(name) { base[name] = changes[name] })
  return base
}

function retry(startAt) {
  return { action: "retry", startAt: startAt }
}

function fail(code) {
  return { action: "fail", code: code }
}

// A recovery of this same track that has just been made at that position.
function justRetried(at) {
  return { key: 7, at: at }
}

test("the span between two recoveries is the documented thirty seconds", function() {
  assert.strictEqual(SPAN, 30)
  assert.strictEqual(Recover.PREMATURE_EOF, PREMATURE)
})

// ---- The table, cell by cell ----

test("a failed hand-off before the start: one retry, then E_PLAYBACK", function() {
  HANDOFF.forEach(function(fileError) {
    // Whether the lookup was cached does not matter: the address was never tried.
    var cachedOrNot = [true, false]
    cachedOrNot.forEach(function(cached) {
      var first = ctx({ fileError: fileError, cached: cached })
      assert.deepStrictEqual(Recover.decide(first), retry(-1), fileError + ", first")
      var again = ctx({ fileError: fileError, cached: cached, last: justRetried(0) })
      assert.deepStrictEqual(Recover.decide(again), fail("E_PLAYBACK"), fileError + ", not first")
    })
  })
})

test("the address did not open, from a cached lookup: one retry, then E_STREAM", function() {
  var errors = [NO_DATA, "", "some error mpv has not been seen to report"]
  errors.forEach(function(fileError) {
    assert.deepStrictEqual(Recover.decide(ctx({ fileError: fileError, cached: true })), retry(-1))
    var again = ctx({ fileError: fileError, cached: true, last: justRetried(0) })
    assert.deepStrictEqual(Recover.decide(again), fail("E_STREAM"))
  })
})

test("the address did not open, from a lookup made for this attempt: E_STREAM at once", function() {
  assert.deepStrictEqual(Recover.decide(ctx({ fileError: NO_DATA, cached: false })), fail("E_STREAM"))
  // No "first" here: a second lookup would return the same thing.
  var again = ctx({ fileError: NO_DATA, cached: false, last: justRetried(0) })
  assert.deepStrictEqual(Recover.decide(again), fail("E_STREAM"))
  // Only the boolean true counts as cached.
  var notBooleans = [undefined, null, 1, "true", {}]
  notBooleans.forEach(function(cached) {
    assert.deepStrictEqual(Recover.decide(ctx({ fileError: NO_DATA, cached: cached })), fail("E_STREAM"))
  })
})

test("broke off mid-track: one retry from the position, then E_NETWORK", function() {
  var first = ctx({ fileError: PREMATURE, started: true, position: 73.9 })
  assert.deepStrictEqual(Recover.decide(first), retry(73))
  var again = ctx({ fileError: PREMATURE, started: true, position: 80, last: justRetried(73) })
  assert.deepStrictEqual(Recover.decide(again), fail("E_NETWORK"))
})

test("any other error mid-track: one retry from the position, then E_PLAYBACK", function() {
  var errors = [OTHER, "", "loading failed"]
  errors.forEach(function(fileError) {
    var first = ctx({ fileError: fileError, started: true, position: 12.2 })
    assert.deepStrictEqual(Recover.decide(first), retry(12), JSON.stringify(fileError))
    var again = ctx({ fileError: fileError, started: true, position: 14, last: justRetried(12) })
    assert.deepStrictEqual(Recover.decide(again), fail("E_PLAYBACK"), JSON.stringify(fileError))
  })
})

test("mid-track, whether the lookup was cached changes nothing", function() {
  var cachedOrNot = [true, false]
  cachedOrNot.forEach(function(cached) {
    var broke = ctx({ fileError: PREMATURE, started: true, position: 40, cached: cached })
    assert.deepStrictEqual(Recover.decide(broke), retry(40))
    var other = ctx({ fileError: OTHER, started: true, position: 40, cached: cached })
    assert.deepStrictEqual(Recover.decide(other), retry(40))
  })
})

// ---- "First" ----

test("another recovery is allowed once the track has played on for the span", function() {
  var at = function(position) {
    return ctx({ fileError: PREMATURE, started: true, position: position, last: justRetried(100) })
  }
  assert.deepStrictEqual(Recover.decide(at(100)), fail("E_NETWORK"))
  assert.deepStrictEqual(Recover.decide(at(100 + SPAN - 0.1)), fail("E_NETWORK"))
  assert.deepStrictEqual(Recover.decide(at(100 + SPAN)), retry(100 + SPAN))
  assert.deepStrictEqual(Recover.decide(at(500.5)), retry(500))
  // A position behind the last recovery (the user sought back) is not progress.
  assert.deepStrictEqual(Recover.decide(at(20)), fail("E_NETWORK"))
})

test("a recovery of another track does not count against this one", function() {
  var other = { key: 6, at: 0 }
  assert.deepStrictEqual(Recover.decide(ctx({ fileError: NO_DATA, cached: true, last: other })), retry(-1))
  var broke = ctx({ fileError: PREMATURE, started: true, position: 3, last: { key: 8, at: 3 } })
  assert.deepStrictEqual(Recover.decide(broke), retry(3))
})

test("last: null makes a track that already had its recovery first again", function() {
  // What a start request by the user leaves behind: the same key, the same
  // place, and every cell of the "first" column once more.
  var cells = [
    [ctx({ fileError: "loading failed" }), retry(-1), fail("E_PLAYBACK")],
    [ctx({ fileError: NO_DATA, cached: true }), retry(-1), fail("E_STREAM")],
    [ctx({ fileError: PREMATURE, started: true, position: 50 }), retry(50), fail("E_NETWORK")],
    [ctx({ fileError: OTHER, started: true, position: 50 }), retry(50), fail("E_PLAYBACK")]
  ]
  cells.forEach(function(cell) {
    var failure = cell[0]
    failure.last = justRetried(Math.floor(failure.position))
    assert.deepStrictEqual(Recover.decide(failure), cell[2], "after its recovery")
    failure.last = null
    assert.deepStrictEqual(Recover.decide(failure), cell[1], "after the user asked again")
  })
})

test("a missing or malformed memory counts as none", function() {
  var memories = [undefined, null, 0, "", "7", true]
  memories.forEach(function(last) {
    var failure = ctx({ fileError: PREMATURE, started: true, position: 5 })
    failure.last = last
    assert.deepStrictEqual(Recover.decide(failure), retry(5), JSON.stringify(last))
  })
  var noLast = ctx({ fileError: PREMATURE, started: true, position: 5 })
  delete noLast.last
  assert.deepStrictEqual(Recover.decide(noLast), retry(5))
})

test("a memory of this track without a usable position allows nothing more", function() {
  // Refusing is the side that cannot loop.
  var places = [undefined, null, NaN, "100", {}]
  places.forEach(function(at) {
    var failure = ctx({ fileError: PREMATURE, started: true, position: 900, last: { key: 7, at: at } })
    assert.deepStrictEqual(Recover.decide(failure), fail("E_NETWORK"), String(at))
  })
  var noPlace = ctx({ fileError: NO_DATA, cached: true, last: { key: 7 } })
  assert.deepStrictEqual(Recover.decide(noPlace), fail("E_STREAM"))
})

// ---- Live streams ----

test("a live stream is retried from the beginning, never from a position", function() {
  var broke = ctx({ fileError: PREMATURE, started: true, live: true, position: 4000.7 })
  assert.deepStrictEqual(Recover.decide(broke), retry(-1))
  var other = ctx({ fileError: OTHER, started: true, live: true, position: 4000.7 })
  assert.deepStrictEqual(Recover.decide(other), retry(-1))
  // Only the boolean true makes a track live.
  var notLive = ctx({ fileError: PREMATURE, started: true, live: "true", position: 9 })
  assert.deepStrictEqual(Recover.decide(notLive), retry(9))
})

test("a live stream gets one recovery like any other track", function() {
  var stream = { fileError: PREMATURE, started: true, live: true, last: justRetried(4000) }
  stream.position = 4010
  assert.deepStrictEqual(Recover.decide(ctx(stream)), fail("E_NETWORK"))
  stream.position = 4000 + SPAN
  assert.deepStrictEqual(Recover.decide(ctx(stream)), retry(-1))
  var before = ctx({ fileError: NO_DATA, live: true, cached: true })
  assert.deepStrictEqual(Recover.decide(before), retry(-1))
  assert.deepStrictEqual(Recover.decide(ctx({ fileError: NO_DATA, live: true })), fail("E_STREAM"))
})

// ---- What counts as started ----

test("a file of which nothing was played never began, whatever the player says", function() {
  // mpv reports a start for a file whose start position lies beyond its
  // end, then this error. It is judged as an address that did not open.
  var cached = ctx({ fileError: NO_DATA, started: true, cached: true, position: 300 })
  assert.deepStrictEqual(Recover.decide(cached), retry(-1))
  var fresh = ctx({ fileError: NO_DATA, started: true, cached: false, position: 300 })
  assert.deepStrictEqual(Recover.decide(fresh), fail("E_STREAM"))
  var again = ctx({ fileError: NO_DATA, started: true, cached: true, position: 300, last: justRetried(300) })
  assert.deepStrictEqual(Recover.decide(again), fail("E_STREAM"))
})

test("only the boolean true counts as started", function() {
  var notBooleans = [undefined, null, 1, "true", {}]
  notBooleans.forEach(function(started) {
    var failure = ctx({ fileError: PREMATURE, started: started, cached: true, position: 60 })
    // Not started: judged as an address that did not open.
    assert.deepStrictEqual(Recover.decide(failure), retry(-1), JSON.stringify(started))
  })
})

test("before the start, the position only says whether the track has moved on", function() {
  // A reload that was to begin at 100 and failed again: not first, and the
  // answer never carries the position.
  var reload = ctx({ fileError: "loading failed", position: 100, last: justRetried(100) })
  assert.deepStrictEqual(Recover.decide(reload), fail("E_PLAYBACK"))
  var resume = ctx({ fileError: "loading failed", position: 3600 })
  assert.deepStrictEqual(Recover.decide(resume), retry(-1))
})

// ---- Positions ----

test("the start position is a whole number of seconds from 0 up", function() {
  var positions = [
    [0, 0], [0.99, 0], [1, 1], [59.999, 59], [172800, 172800],
    // What is not a position counts as the beginning.
    [-5, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], ["12", 0], [null, 0], [undefined, 0], [{}, 0]
  ]
  positions.forEach(function(pair) {
    var failure = ctx({ fileError: PREMATURE, started: true, position: pair[0] })
    assert.deepStrictEqual(Recover.decide(failure), retry(pair[1]), String(pair[0]))
  })
})

// ---- The answer ----

test("every answer is a fresh object of one of the two shapes", function() {
  var errors = [NO_DATA, "loading failed", "unrecognized file format", PREMATURE, OTHER, ""]
  var flags = [true, false]
  var memories = [null, justRetried(0), justRetried(50), { key: 1, at: 0 }]
  var positions = [0, 10, 50.5, 90]
  var codes = ["E_PLAYBACK", "E_STREAM", "E_NETWORK"]
  var count = 0
  errors.forEach(function(fileError) {
    flags.forEach(function(started) {
      flags.forEach(function(cached) {
        flags.forEach(function(live) {
          memories.forEach(function(last) {
            positions.forEach(function(position) {
              var failure = { key: 7, fileError: fileError, started: started, cached: cached, live: live,
                position: position, last: last }
              var before = JSON.stringify(failure)
              var decision = Recover.decide(failure)
              count += 1
              assert.strictEqual(JSON.stringify(failure), before, "the input is left alone")
              assert.notStrictEqual(decision, Recover.decide(failure), "a fresh object each time")
              if (decision.action === "retry") {
                assert.deepStrictEqual(Object.keys(decision), ["action", "startAt"])
                assert.ok(Number.isInteger(decision.startAt) && decision.startAt >= -1)
                // A retry is never granted twice at the same place.
                var memory = { key: 7, at: Math.floor(position) }
                failure.last = memory
                assert.strictEqual(Recover.decide(failure).action, "fail", before)
              } else {
                assert.deepStrictEqual(Object.keys(decision), ["action", "code"])
                assert.ok(codes.indexOf(decision.code) !== -1, decision.code)
              }
            })
          })
        })
      })
    })
  })
  assert.strictEqual(count, 6 * 2 * 2 * 2 * 4 * 4)
})

test("every code it can answer has a text, and E_STREAM and E_NETWORK stop a queue", function() {
  var Errors = load.lib("Errors")
  var codes = ["E_PLAYBACK", "E_STREAM", "E_NETWORK"]
  codes.forEach(function(code) {
    assert.ok(Object.prototype.hasOwnProperty.call(Errors.TEXT, code), code)
  })
  assert.strictEqual(Errors.isSkipClass("E_PLAYBACK"), true)
  assert.strictEqual(Errors.isSkipClass("E_STREAM"), false)
  assert.strictEqual(Errors.isSkipClass("E_NETWORK"), false)
})

test("nothing that is handed in makes it throw", function() {
  var odd = [undefined, null, 0, 7, "", "retry", true, [], [1, 2], function() {}]
  odd.forEach(function(value) {
    assert.deepStrictEqual(Recover.decide(value), value !== null && typeof value === "object"
      ? fail("E_STREAM") : fail("E_PLAYBACK"), String(value))
  })
  assert.deepStrictEqual(Recover.decide(), fail("E_PLAYBACK"))
  // An empty description: nothing began and nothing was cached.
  assert.deepStrictEqual(Recover.decide({}), fail("E_STREAM"))
  // Members of the wrong type are read as "not that".
  var wrong = { key: {}, fileError: 5, started: "yes", cached: [], live: 1, position: "x", last: [] }
  assert.deepStrictEqual(Recover.decide(wrong), fail("E_STREAM"))
  // A file error that is a name every object has finds nothing.
  var named = ctx({ fileError: "constructor", cached: true })
  assert.deepStrictEqual(Recover.decide(named), retry(-1))
  var proto = ctx({ fileError: "__proto__", started: true, position: 2 })
  assert.deepStrictEqual(Recover.decide(proto), retry(2))
})
