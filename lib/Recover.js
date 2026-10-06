.pragma library
.import "Const.js" as Const

// What to do about a track that failed to start or broke off: try once
// more, or give up with which error. A pure decision over a handful of
// facts, so that every case can be tested without a player or a network.
// It owns the rule that keeps a broken track from looping: one recovery
// per track, and another only after the track has really moved on.

// What the player reports for a track that ended well before its end, and
// what playback reports for one that hung: the connection broke off.
var PREMATURE_EOF = "premature-eof"

// mpv's errors for a hand-off that failed: our info file could not be
// read, or what it led to was not media. The media address was never
// tried, so these say nothing about it.
var _HANDOFF_ERRORS = ["loading failed", "unrecognized file format"]

// mpv's error for a file of which nothing was played, which is what a
// media address that does not open looks like.
var _NOTHING_PLAYED = "no audio or video data played"

function _retry(startAt) {
  return { action: "retry", startAt: startAt }
}

function _fail(code) {
  return { action: "fail", code: code }
}

// Seconds into the track: a number from 0 up, whatever was handed in.
function _seconds(value) {
  return typeof value === "number" && isFinite(value) && value > 0 ? value : 0
}

// True when this failure may be answered with a recovery: the track had
// none yet, or it has played on for a while since its last one. A second
// failure at the same place means the recovery did not help. A memory of
// this track that names no place allows nothing more, which is the answer
// that cannot loop.
function _isFirst(key, position, last) {
  if (last === null || typeof last !== "object" || last.key !== key) return true
  return typeof last.at === "number" && position >= last.at + Const.TIMEOUTS.recoverSpanSec
}

// ctx describes the failure:
//   key        the queue item's key
//   fileError  mpv's error text, PREMATURE_EOF, or ""
//   started    the file had begun to play
//   cached     the lookup it was loaded from was made before this attempt
//   live       a live stream: there is no position to return to
//   position   seconds played, or where the load was to begin
//   last       { key, at } of the previous recovery, or null when there was
//              none or the user has asked for this track again since
// Returns { action: "retry", startAt } with startAt in whole seconds, or -1
// for "from the beginning"; or { action: "fail", code }.
function decide(ctx) {
  if (ctx === null || typeof ctx !== "object") return _fail("E_PLAYBACK")
  var position = _seconds(ctx.position)
  var first = _isFirst(ctx.key, position, ctx.last)

  // mpv counts a file as started even when its start position lies beyond
  // its end, and then reports that nothing was played. The text is the
  // better witness of the two: such a file never began.
  var began = ctx.started === true && ctx.fileError !== _NOTHING_PLAYED

  if (!began) {
    if (_HANDOFF_ERRORS.indexOf(ctx.fileError) !== -1) return first ? _retry(-1) : _fail("E_PLAYBACK")
    // The media address did not open. An older lookup may simply have
    // expired, or been made from another network address: look it up
    // again. One that was made for this very attempt would only come back
    // the same.
    if (ctx.cached !== true) return _fail("E_STREAM")
    return first ? _retry(-1) : _fail("E_STREAM")
  }

  var startAt = ctx.live === true ? -1 : Math.floor(position)
  if (ctx.fileError === PREMATURE_EOF) return first ? _retry(startAt) : _fail("E_NETWORK")
  return first ? _retry(startAt) : _fail("E_PLAYBACK")
}

if (typeof module !== "undefined") {
  module.exports = { PREMATURE_EOF: PREMATURE_EOF, decide: decide }
}
