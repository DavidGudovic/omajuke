.pragma library
.import "Const.js" as Const
.import "Ids.js" as Ids
.import "Clean.js" as Clean

// Track objects, and the only code that builds them. Whatever the source
// (yt-dlp's JSON, the saved state, a row handed back by the panel), a track
// is put together here field by field as a fresh object with exactly the
// keys id, title, channel, duration and live. Nothing of the input is ever
// copied over wholesale, and a field of the wrong type never survives.

// The runner decodes a child's output chunk by chunk, which damages any
// multi-byte character that straddles two chunks. yt-dlp escapes its JSON
// to ASCII, so a character outside this range means damaged or foreign
// output, and the text is refused before it is parsed.
var _NOT_ASCII = /[^\n\x20-\x7e]/

function _isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// Reads a key of parsed JSON only when the object itself carries it, so
// that nothing inherited is ever taken for data.
function _own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined
}

// Returns the parsed value, or undefined when the text is too long, not
// ASCII or not JSON. JSON itself has no undefined, so the two cannot be
// confused.
function _parse(text, maxChars) {
  if (typeof text !== "string" || text.length > maxChars || _NOT_ASCII.test(text)) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    return undefined
  }
}

// Whole seconds, or null for unknown: not a number, not finite, negative
// or beyond the cap.
function _duration(value) {
  if (typeof value !== "number" || !isFinite(value)) return null
  if (value < 0 || value > Const.LIMITS.durationSeconds) return null
  var seconds = Math.round(value)
  // JSON can spell a negative zero, and it must not travel on as one.
  return seconds === 0 ? 0 : seconds
}

// Assembles the track from fields that were already read one by one.
// Returns null when the id is not an id, the title is not a string, or the
// title is empty where one is required. A track of unknown length counts
// as live: there is nothing to seek in.
function _build(id, title, channel, duration, live, needsTitle) {
  if (!Ids.isId(id) || typeof title !== "string") return null
  var cleanTitle = Clean.text(title, Const.LIMITS.titleChars)
  if (needsTitle && cleanTitle === "") return null
  var seconds = _duration(duration)
  return {
    id: id,
    title: cleanTitle,
    channel: typeof channel === "string" ? Clean.text(channel, Const.LIMITS.channelChars) : "",
    duration: seconds,
    live: live === true || seconds === null
  }
}

// yt-dlp names the channel in "channel", and in "uploader" when that is
// missing.
function _channel(entry) {
  var channel = _own(entry, "channel")
  return typeof channel === "string" ? channel : _own(entry, "uploader")
}

// The address of the video stream yt-dlp chose, or "" when it offered none
// we would hand to mpv.
function _videoUrl(requested) {
  if (!Array.isArray(requested)) return ""
  for (var i = 0; i < requested.length; i++) {
    var format = requested[i]
    if (!_isObject(format)) continue
    var codec = _own(format, "vcodec")
    var url = _own(format, "url")
    if (typeof codec !== "string" || codec === "none") continue
    if (typeof url === "string" && Const.VIDEO_URL_RE.test(url)) return url
  }
  return ""
}

// ---- Readers ----

// fromFlatEntry, fromStored and fromUi are handed an object, and they never
// throw. What they are given is plain data in practice, but an object can
// also run code of its own when a member is read, and that code can fail.
// Nothing may throw into the service from here, so such an object is simply
// not a track.

// One entry of a search, mix or feed answer. Returns a track or null. An
// entry that has not started yet (a premiere, a scheduled stream) cannot be
// played and is dropped. The entry's own url, thumbnails and description
// are never read.
function fromFlatEntry(entry) {
  try {
    if (!_isObject(entry)) return null
    var status = _own(entry, "live_status")
    if (status === "is_upcoming") return null
    return _build(_own(entry, "id"), _own(entry, "title"), _channel(entry), _own(entry, "duration"),
      status === "is_live", true)
  } catch (error) {
    return null
  }
}

// The whole answer of a search, mix or feed job. Returns { ok: false } when
// it is not a playlist, else { ok: true, tracks } with at most cap tracks,
// each id once. An empty list is a valid answer.
function listFromPlaylistJson(text, cap) {
  // Search, mix and feed answers share this reader, so it takes the largest
  // of their caps. The runner enforces each job's own cap while reading, and
  // this one only bounds the parse for a caller that got its text elsewhere.
  var maxChars = Math.max(Const.LIMITS.searchBytes, Const.LIMITS.mixBytes, Const.LIMITS.feedBytes)
  var answer = _parse(text, maxChars)
  if (!_isObject(answer) || _own(answer, "_type") !== "playlist") return { ok: false }
  var entries = _own(answer, "entries")
  if (!Array.isArray(entries)) return { ok: false }
  // A cap that is not a number from 1 up keeps nothing.
  var limit = typeof cap === "number" && cap >= 1 ? Math.floor(cap) : 0
  var seen = new Map()
  var tracks = []
  for (var i = 0; i < entries.length && tracks.length < limit; i++) {
    var track = fromFlatEntry(entries[i])
    if (track === null || seen.has(track.id)) continue
    seen.set(track.id, true)
    tracks.push(track)
  }
  return { ok: true, tracks: tracks }
}

// The answer of a resolve job for one video. Returns { ok: false }, or
// { ok: true, track, videoUrl } where videoUrl is "" when there is no video
// stream to show. The answer must be about the id that was asked for.
function fromInfoJson(text, id) {
  if (!Ids.isId(id)) return { ok: false }
  var info = _parse(text, Const.LIMITS.resolveBytes)
  if (!_isObject(info)) return { ok: false }
  var type = _own(info, "_type")
  if (type !== undefined && type !== "video") return { ok: false }
  if (_own(info, "id") !== id) return { ok: false }
  var formats = _own(info, "formats")
  if (!Array.isArray(formats) || formats.length === 0) return { ok: false }
  var live = _own(info, "live_status") === "is_live" || _own(info, "is_live") === true
  var track = _build(id, _own(info, "title"), _channel(info), _own(info, "duration"), live, true)
  if (track === null) return { ok: false }
  return { ok: true, track: track, videoUrl: _videoUrl(_own(info, "requested_formats")) }
}

// A track read back from the state file. Returns a track or null. The file
// is treated like any other outside text. The title may be empty: a track
// started over IPC has none until it was resolved.
function fromStored(value) {
  try {
    if (!_isObject(value)) return null
    return _build(_own(value, "id"), _own(value, "title"), _own(value, "channel"), _own(value, "duration"),
      _own(value, "live") === true, false)
  } catch (error) {
    return null
  }
}

// A track handed back by the panel. Returns a fresh track or null. The
// fields are read plainly here: a list view may pass a wrapper around our
// object instead of the object itself. Extra members (a queue item's key)
// are left behind.
function fromUi(value) {
  try {
    if (!_isObject(value)) return null
    return _build(value.id, value.title, value.channel, value.duration, value.live === true, false)
  } catch (error) {
    return null
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    fromFlatEntry: fromFlatEntry,
    listFromPlaylistJson: listFromPlaylistJson,
    fromInfoJson: fromInfoJson,
    fromStored: fromStored,
    fromUi: fromUi
  }
}
