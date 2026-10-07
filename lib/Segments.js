.pragma library
.import "Const.js" as Const
.import "Ids.js" as Ids
.import "Sha256.js" as Sha256

// Sponsor segments: the request that asks for them, the reading of the
// answer, and every decision about skipping. The answer comes from a
// crowd-sourced database and names stretches of a track to jump over, so
// believing it would let a stranger steer the player. Nothing in it is
// believed. Every number is checked against the track, what is left is
// merged into stretches that do not overlap, a skip only ever moves
// forward, and a list that would leave less than a fifth of a track to be
// played is ignored as a whole. Two more rules bound what even an accepted
// list can do: automatic seeks are spaced out, and a run of tracks that a
// skip ended right after they began switches skipping off.
//
// This file owns those rules and keeps no state. The caller holds the list
// pick() returned, the marks next() hands back, the time of its last
// automatic seek and the count cascade() maintains.

// ---- Limits ----

// The largest answer that is read: curl stops the transfer there, the job
// that runs curl caps its output there, and nothing longer is parsed.
var MAX_BYTES = 1048576

// Automatic skips are at least this far apart, in milliseconds.
var SEEK_GAP_MS = 500

// An answer lists the videos of one hash bucket, about a hundred. Beyond
// this many it is not what was asked for.
var _MAX_VIDEOS = 2000

// Segments of the track that are looked at. The rest is ignored unread.
var _MAX_SEGMENTS = 100

// A shorter segment is not worth a seek. What counts is the part of it
// that lies within the track.
var _MIN_SECONDS = 1

// How far past the end of the track a segment may claim to reach, and how
// close to the end one has to come to count as reaching it. Both allow for
// the track's length being known to the second at best.
var _END_SECONDS = 1

// A segment is marked on a video of a certain length. If the track's length
// differs by more than this, the video was edited since and the positions
// no longer fit.
var _STALE_SECONDS = 2

// At most four fifths of a track may be skipped. Two whole numbers, so that
// the comparison has no rounding of its own.
var _SHARE_SKIPPED = 4
var _SHARE_WHOLE = 5

// A skip starts only this far or further before the end of its segment: a
// seek that lands a little short of its target must not look like a new
// arrival in the same segment. It follows that a segment has to be longer
// than this for a skip to start in it at all.
var _EDGE_SECONDS = 0.5

// Three tracks in a row that a skip ended within ten seconds of their start
// switch skipping off.
var _CASCADE_TRACKS = 3
var _CASCADE_MS = 10000

// ---- Request ----

// The request names a bucket of videos by the first four characters of the
// hash of the id. Whoever answers it learns which hundred or so videos the
// playing one is among, and not which one it is.
var _PREFIX = /^[0-9a-f]{4}$/

// The category list in the request never changes, whatever is acted on
// later: a request that followed the situation would give it away.
var _URL_HEAD = "https://sponsor.ajay.app/api/skipSegments/"
var _URL_TAIL = "?categories=%5B%22sponsor%22%2C%22selfpromo%22%2C%22interaction%22%2C%22music_offtopic%22%5D"
  + "&actionTypes=%5B%22skip%22%5D"

// What curl prints after the body of an answer that was found.
var _FOUND = "\n200\n"

// ---- Categories ----

// The categories that are skipped. Talk in a music video is skipped only
// while no picture is shown: with the picture on, it belongs to the video.
// A category from the answer is looked up in these lists and never used as
// a key, and the name that is kept is the list's own string.
var _CATEGORIES = ["sponsor", "selfpromo", "interaction"]
var _CATEGORIES_HIDDEN = ["sponsor", "selfpromo", "interaction", "music_offtopic"]

// The runner decodes a child's output chunk by chunk, which damages any
// multi-byte character that straddles two chunks. Everything read from the
// answer is ASCII, so an answer with anything else in it is refused whole.
var _NOT_ASCII = /[^\n\x20-\x7e]/

// ---- Helpers ----

function _isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function _isNumber(value) {
  return typeof value === "number" && isFinite(value)
}

// Reads a key of parsed JSON only when the object itself carries it, so
// that nothing inherited is ever taken for data.
function _own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined
}

// A track length that segments can be checked against: a number of seconds
// above zero and within the longest duration the plugin handles.
function _isLength(duration) {
  return _isNumber(duration) && duration > 0 && duration <= Const.LIMITS.durationSeconds
}

// Returns the parsed value, or undefined when the text is too long, not
// ASCII or not JSON. JSON itself has no undefined, so the two cannot be
// confused.
function _parse(text) {
  if (typeof text !== "string" || text.length > MAX_BYTES || _NOT_ASCII.test(text)) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    return undefined
  }
}

// One segment of the answer as { start, end, rank }, or null when anything
// about it is off. A segment that says nothing about the length of the
// video it was marked on cannot be checked against the track and is dropped
// with the stale ones.
function _segment(raw, duration, allowed) {
  if (!_isObject(raw) || _own(raw, "actionType") !== "skip") return null
  var category = _own(raw, "category")
  var rank = typeof category === "string" ? allowed.indexOf(category) : -1
  if (rank === -1) return null
  var span = _own(raw, "segment")
  if (!Array.isArray(span) || span.length !== 2) return null
  var start = span[0]
  var end = span[1]
  if (!_isNumber(start) || !_isNumber(end)) return null
  if (start < 0 || end > duration + _END_SECONDS) return null
  // A segment may claim to end a little past the end of the track, and is
  // cut there. The length that counts is the one after the cut: what is
  // left of a segment that starts in the last second is not worth a seek,
  // and in half a second of it no skip could even start. The same test
  // drops what starts at or after the end, and what ends before it starts.
  var cut = Math.min(end, duration)
  if (cut - start < _MIN_SECONDS) return null
  var markedOn = _own(raw, "videoDuration")
  if (!_isNumber(markedOn) || markedOn <= 0 || Math.abs(markedOn - duration) > _STALE_SECONDS) return null
  // JSON can spell a negative zero, and it must not travel on as one.
  return { start: start === 0 ? 0 : start, end: cut, rank: rank }
}

// By start, and by category where two start together. Segments that are
// equal in both may come out in either order (Qt's sort is not stable),
// which the merge below cannot tell apart.
function _byStart(a, b) {
  return a.start - b.start || a.rank - b.rank
}

// Merges segments that overlap or touch into stretches in playing order.
// Afterwards a seek to the end of one stretch never lands inside another,
// which is what rules out a chain or a loop of seeks. A merged stretch
// keeps the category of the segment that opens it, and of several that
// open it together, the one that comes first in the list of categories.
function _merge(segments) {
  var sorted = segments.slice().sort(_byStart)
  var merged = []
  for (var i = 0; i < sorted.length; i++) {
    var segment = sorted[i]
    var last = merged.length > 0 ? merged[merged.length - 1] : null
    if (last !== null && segment.start <= last.end) {
      if (segment.end > last.end) last.end = segment.end
    } else {
      merged.push({ start: segment.start, end: segment.end, rank: segment.rank })
    }
  }
  return merged
}

// An entry of a list as pick() makes it, checked again and copied, or null.
// The skip decisions read their list through here, so they do not depend on
// the caller having passed what pick() returned. No entry reaches further
// than the longest track, so no seek does either. And an entry is one only
// if a skip can start in it: next() would never act on a shorter one, and
// pending() must not wait for it.
function _entry(raw) {
  if (!_isObject(raw)) return null
  var start = _own(raw, "start")
  var end = _own(raw, "end")
  var category = _own(raw, "category")
  if (!_isNumber(start) || !_isNumber(end) || start < 0 || end > Const.LIMITS.durationSeconds) return null
  if (!(start < end - _EDGE_SECONDS)) return null
  var rank = typeof category === "string" ? _CATEGORIES_HIDDEN.indexOf(category) : -1
  if (rank === -1) return null
  return { start: start, end: end, category: _CATEGORIES_HIDDEN[rank], toEnd: _own(raw, "toEnd") === true }
}

// The entries of a list, null where one is not an entry, so that positions
// keep matching the marks. A list longer than pick() can make is no list.
function _entries(segments) {
  var entries = []
  if (!Array.isArray(segments) || segments.length > _MAX_SEGMENTS) return entries
  for (var i = 0; i < segments.length; i++) entries.push(_entry(segments[i]))
  return entries
}

function _isPosition(pos) {
  return _isNumber(pos) && pos >= 0
}

function _isCount(count) {
  return _isNumber(count) && count >= 0 && Math.floor(count) === count
}

// ---- The request and its answer ----

// The curl command that fetches the segments of one hash bucket. The
// address is not part of it: it arrives on standard input, from config().
// Returns [] when the tool table has no absolute path for curl.
function argv(tools) {
  var curl = _isObject(tools) ? _own(tools, "curl") : ""
  if (typeof curl !== "string" || curl.charAt(0) !== "/") return []
  return [
    curl,
    // Has to come first: curl then reads no configuration file of the user.
    "-q",
    "--no-progress-meter",
    // HTTPS only, and no redirect is followed.
    "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "0", "--tlsv1.2",
    "--connect-timeout", "3", "--max-time", "5",
    "--max-filesize", String(MAX_BYTES),
    // No client name and no language preference: the request describes
    // neither the program nor the machine.
    "--user-agent", "", "--header", "Accept-Language:",
    // The status code follows the body, on a line of its own.
    "--write-out", "\\n%{response_code}\\n",
    "--config", "-"
  ]
}

// The text curl reads from standard input for one video: the address of
// the bucket its id hashes into. Returns "" for anything that is not an id.
// The id itself appears nowhere in the text.
function config(id) {
  if (!Ids.isId(id)) return ""
  var prefix = Sha256.hex(id).slice(0, 4)
  if (!_PREFIX.test(prefix)) return ""
  return "url = \"" + _URL_HEAD + prefix + _URL_TAIL + "\"\n"
}

// The body of the answer, taken from the finished job (a runner result), or
// "" when there is nothing to read: the job failed, or the service answered
// with anything but "found". A bucket without segments is answered with
// "not found", so "" is the normal case and never an error to show.
function reply(result) {
  if (!_isObject(result) || _own(result, "ok") !== true) return ""
  var output = _own(result, "stdout")
  if (typeof output !== "string" || output.length > MAX_BYTES) return ""
  if (output.slice(-_FOUND.length) !== _FOUND) return ""
  return output.slice(0, output.length - _FOUND.length)
}

// ---- Which segments to skip ----

// Reads the answer and returns the stretches of the track to skip, in
// playing order and without overlaps, as fresh { start, end, category,
// toEnd } objects. start and end are seconds within the track. toEnd says
// that the stretch reaches the end of the track, where the right move is
// the next track and not a seek. Returns [] whenever the answer, the id or
// the duration is not usable, and when acting on the stretches would skip
// more than four fifths of the track.
//
// duration is the length of the track in seconds as the player reports it,
// and nothing is skipped while it is unknown. videoHidden is true while no
// picture is shown.
function pick(body, id, duration, videoHidden) {
  if (!Ids.isId(id) || !_isLength(duration)) return []
  var videos = _parse(body)
  if (!Array.isArray(videos) || videos.length > _MAX_VIDEOS) return []
  var allowed = videoHidden === true ? _CATEGORIES_HIDDEN : _CATEGORIES
  var kept = []
  var looked = 0
  for (var i = 0; i < videos.length && looked < _MAX_SEGMENTS; i++) {
    var video = videos[i]
    if (!_isObject(video) || _own(video, "videoID") !== id) continue
    var segments = _own(video, "segments")
    if (!Array.isArray(segments)) continue
    // The cap counts what is looked at, not what is kept, and it holds
    // across entries: repeating the video in the answer buys nothing.
    for (var j = 0; j < segments.length && looked < _MAX_SEGMENTS; j++) {
      looked++
      var segment = _segment(segments[j], duration, allowed)
      if (segment !== null) kept.push(segment)
    }
  }
  var merged = _merge(kept)
  var total = 0
  var picked = []
  for (var k = 0; k < merged.length; k++) {
    var stretch = merged[k]
    var toEnd = stretch.end >= duration - _END_SECONDS
    // Going to the next track also skips what is left behind the stretch,
    // so a stretch that reaches the end counts all the way to the end.
    // Otherwise one segment could take a short track away whole.
    total += (toEnd ? duration : stretch.end) - stretch.start
    picked.push({ start: stretch.start, end: stretch.end, category: allowed[stretch.rank], toEnd: toEnd })
  }
  if (total * _SHARE_WHOLE > duration * _SHARE_SKIPPED) return []
  return picked
}

// ---- When to skip ----

// Decides what to do at a playback position, in seconds. segments is the
// list from pick(). fired holds one mark per segment, true once it has
// been skipped. [] stands for "none yet".
//
// Returns { action, to, skip, fired }. action is "seek" (go to the position
// in "to", the end of the segment), "advance" (the segment reaches the end
// of the track: go to the next one) or "none". skip is { category, from,
// to } for the segment acted on, null otherwise. fired is the new list of
// marks. The caller keeps it in place of the old one, except when it is
// told to act and may not yet (see mayAct): then it keeps the old marks,
// and the segment comes up again at the next position.
//
// A segment fires once: after the seek the position is past it, and if the
// seek lands short, or the user seeks back into the segment to hear it,
// the mark keeps it quiet. A position in front of a segment arms it again,
// so seeking back to before it skips it again. Since a seek only ever goes
// to the end of the segment the position is in, playback never moves
// backwards and no list can make it loop. The marks go by position alone:
// a player that answered a seek by jumping to before the segment would be
// sent forward again each time it came round, at most once per lap.
function next(pos, segments, fired) {
  var entries = _entries(segments)
  var marks = []
  var i
  for (i = 0; i < entries.length; i++) marks.push(Array.isArray(fired) && fired[i] === true)
  var idle = { action: "none", to: 0, skip: null, fired: marks }
  if (!_isPosition(pos)) return idle
  for (i = 0; i < entries.length; i++) {
    if (entries[i] !== null && pos < entries[i].start) marks[i] = false
  }
  for (i = 0; i < entries.length; i++) {
    var entry = entries[i]
    if (entry === null || marks[i] || pos < entry.start || pos >= entry.end - _EDGE_SECONDS) continue
    marks[i] = true
    return {
      action: entry.toEnd ? "advance" : "seek",
      to: entry.end,
      skip: { category: entry.category, from: entry.start, to: entry.end },
      fired: marks
    }
  }
  return idle
}

// True while a segment can still fire at this position or later, which is
// the only time the position needs watching. A seek by the user can arm a
// segment again, so the question is asked anew after every seek.
function pending(pos, segments, fired) {
  if (!_isPosition(pos)) return false
  var entries = _entries(segments)
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i]
    if (entry === null || pos >= entry.end - _EDGE_SECONDS) continue
    if (pos < entry.start || !(Array.isArray(fired) && fired[i] === true)) return true
  }
  return false
}

// True when a "seek" or an "advance" from next() may be carried out now.
// Both arguments are clock readings in milliseconds: the present, and the
// last time one was carried out (0 for "none yet"). A reading that is no
// number allows nothing.
function mayAct(nowMs, lastMs) {
  if (!_isNumber(nowMs) || !_isNumber(lastMs)) return false
  // A last time in the future means the clock was set back. Waiting for
  // the clock to catch up could take hours, and the worst that acting can
  // do is one skip sooner than usual.
  if (lastMs > nowMs) return true
  return nowMs - lastMs >= SEEK_GAP_MS
}

// ---- The cascade breaker ----

// With autoplay on, a list that ends each track right after it began would
// run through track after track unattended, with a lookup at YouTube for
// every one of them. cascade() counts such tracks. The caller starts at 0,
// passes the count through here whenever a track ends, skips nothing while
// tripped() is true, and goes back to 0 only when the user does something.

// True when skipping is switched off. A count that is no count cannot show
// that skipping is still safe, so it counts as tripped.
function tripped(count) {
  return !_isCount(count) || count >= _CASCADE_TRACKS
}

// The count after a track ended. skipped is true when an automatic skip
// happened during the track, elapsedMs is how long after its start it
// ended. A track that a skip ended early adds one, any other track clears
// the count, and a tripped count stays tripped. A time that is no number
// counts as early.
function cascade(count, skipped, elapsedMs) {
  if (tripped(count)) return _CASCADE_TRACKS
  var early = !(_isNumber(elapsedMs) && elapsedMs > _CASCADE_MS)
  return skipped === true && early ? count + 1 : 0
}

if (typeof module !== "undefined") {
  module.exports = {
    MAX_BYTES: MAX_BYTES,
    SEEK_GAP_MS: SEEK_GAP_MS,
    argv: argv,
    config: config,
    reply: reply,
    pick: pick,
    next: next,
    pending: pending,
    mayAct: mayAct,
    tripped: tripped,
    cascade: cascade
  }
}
