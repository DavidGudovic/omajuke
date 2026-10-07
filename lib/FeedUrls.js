.pragma library
.import "Const.js" as Const
.import "Clean.js" as Clean
.import "Paths.js" as Paths
.import "Track.js" as Track
.import "YtArgs.js" as YtArgs

// The signed-in lists. This file owns which feeds exist, the one address
// each is read from, the address of a playlist the user opens, how long a
// fetched list may be shown again, and what is kept of yt-dlp's answer.
// These are the requests that carry the user's cookies, so every address is
// a constant on www.youtube.com or is rebuilt here from a validated playlist
// id: no text from outside ever becomes an address. What comes back is
// treated like any other outside text and kept only as fresh, capped rows.
//
// It also owns the command lines of the yt-dlp calls that carry the login
// for the account's own sake: reading a list, the one request that proves
// a fresh login works, and reporting a video as watched. They are written
// here and nowhere else. One more call is ever given a cookie file: the
// lookup of a video the user asked to play with the account, which
// lib/YtArgs.js builds beside the signed-out lookup it mirrors.

// ---- Feeds ----

// The feeds. The panel shows all but "history" as chips, in this order.
function _kinds() {
  return ["foryou", "subs", "later", "playlists", "history"]
}

// The list the functions below look a kind up in. It is never handed out.
var _KINDS = _kinds()

// The same list, for whoever wants to read it. The functions below do not
// read it back: this file is shared by everything that imports it, and Qt's
// engine lets a frozen list be written to all the same.
var KINDS = Object.freeze(_kinds())

// The address of each feed, at the position of its kind.
var _URLS = [
  "https://www.youtube.com/feed/recommended",
  "https://www.youtube.com/feed/subscriptions",
  "https://www.youtube.com/playlist?list=WL",
  "https://www.youtube.com/feed/playlists",
  "https://www.youtube.com/feed/history"
]

// The one feed whose rows are playlists, not videos.
var _PLAYLISTS_KIND = "playlists"

var _LIST_URL = "https://www.youtube.com/playlist?list="

// A playlist id. None of these characters means anything in an address, so
// the id can end the query and can add nothing to it.
var _LIST_ID = /^[A-Za-z0-9_-]{2,64}$/

// A fetched list is shown again for five minutes before it is asked for
// anew. Lists are fetched for the feed on screen only and never on a timer,
// so this bounds how often a person flipping between feeds causes requests.
var CACHE_MS = 300000

// ---- Answers ----

// yt-dlp escapes its JSON to ASCII, and the runner decodes output chunk by
// chunk, which damages a multi-byte character that straddles two chunks. A
// character outside this range therefore means damaged or foreign output.
var _NOT_ASCII = /[^\n\x20-\x7e]/

// yt-dlp names the extractor that would handle each entry. This one handles
// a single video, so an entry that carries it is not a playlist.
var _VIDEO_EXTRACTOR = "Youtube"

// A larger item count than any playlist has is treated as unknown.
var _COUNT_MAX = 99999

function _isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// Reads a key of parsed JSON only when the object itself carries it, so
// that nothing inherited is ever taken for data.
function _own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined
}

// A whole number of items, or null for unknown.
function _count(value) {
  if (typeof value !== "number" || !isFinite(value) || value < 0 || value > _COUNT_MAX) return null
  var count = Math.floor(value)
  // JSON can spell a negative zero, and it must not travel on as one.
  return count === 0 ? 0 : count
}

// One entry of the playlists feed. Returns { id, title, count } or null. A
// row needs an id that can be opened and a title that can be shown. The
// entry's own url, thumbnails and description are never read.
function _playlistRow(entry) {
  if (!_isObject(entry) || _own(entry, "ie_key") === _VIDEO_EXTRACTOR) return null
  var id = _own(entry, "id")
  var title = _own(entry, "title")
  if (!isListId(id) || typeof title !== "string") return null
  var cleanTitle = Clean.text(title, Const.LIMITS.titleChars)
  if (cleanTitle === "") return null
  return { id: id, title: cleanTitle, count: _count(_own(entry, "playlist_count")) }
}

// The rows of a playlists answer, each id once, or null when the text is
// not a playlist answer.
function _playlists(text) {
  if (typeof text !== "string" || text.length > Const.LIMITS.feedBytes || _NOT_ASCII.test(text)) return null
  var answer
  try {
    answer = JSON.parse(text)
  } catch (error) {
    return null
  }
  if (!_isObject(answer) || _own(answer, "_type") !== "playlist") return null
  var entries = _own(answer, "entries")
  if (!Array.isArray(entries)) return null
  var seen = new Map()
  var rows = []
  for (var i = 0; i < entries.length && rows.length < Const.LIMITS.feedCount; i++) {
    var row = _playlistRow(entries[i])
    if (row === null || seen.has(row.id)) continue
    seen.set(row.id, true)
    rows.push(row)
  }
  return rows
}

// The tracks of a video answer, or null when the text is not a playlist
// answer. Videos are read by the one reader every list of videos goes
// through: an entry without a valid video id or a title is dropped, one
// without a channel (the history feed names none) keeps an empty channel,
// and one that has not started yet is left out.
function _tracks(text) {
  if (typeof text !== "string" || text.length > Const.LIMITS.feedBytes) return null
  var answer = Track.listFromPlaylistJson(text, Const.LIMITS.feedCount)
  return answer.ok === true ? answer.tracks : null
}

// ---- Command lines ----

// The path of yt-dlp from the tool table, read once, or "" when there is
// none.
function _tool(tools) {
  if (tools === null || typeof tools !== "object") return ""
  var path = tools.ytdlp
  return typeof path === "string" && path.charAt(0) === "/" ? path : ""
}

// A complete command line for a call that carries the login: the tool, the
// flags every call has, the cookie file, and the flags of that kind of
// call. Returns null unless the cookie file is one of the numbered
// throwaway copies in the runtime directory: yt-dlp rewrites the file it is
// given, so the saved login itself is never handed over, and neither is any
// other file. Such a call keeps its warnings, because a login YouTube no
// longer accepts is reported as a warning and by nothing else.
function _signedIn(tools, paths, copy, own) {
  var tool = _tool(tools)
  var common = YtArgs.base(paths)
  if (tool === "" || common === null || Paths.kind(paths, copy) !== "jarCopy") return null
  return [tool].concat(common, ["--cookies", copy], own)
}

// A list: the first rows of a feed or of an opened playlist, without
// looking any of them up. Standard input: the list's address and a line
// break.
function feedArgv(tools, paths, copy) {
  var rows = "1:" + Const.LIMITS.feedCount
  return _signedIn(tools, paths, copy, ["--flat-playlist", "--playlist-items", rows, "-J", "-a", "-"])
}

// The request that shows whether a login that was just saved is accepted:
// one row of the user's own Watch Later list. Standard input: that list's
// address and a line break.
function verifyArgv(tools, paths, copy) {
  return _signedIn(tools, paths, copy, ["--flat-playlist", "--playlist-items", "1:1", "-J", "-a", "-"])
}

// Reports one video as watched and fetches nothing else. Standard input:
// the video's watch address and a line break. The flag comes behind the
// common ones, which switch reporting off for every other call.
function markArgv(tools, paths, copy) {
  return _signedIn(tools, paths, copy, ["--mark-watched", "--simulate", "--quiet", "-a", "-"])
}

// ---- Public functions ----

function isKind(kind) {
  return typeof kind === "string" && _KINDS.indexOf(kind) !== -1
}

function isListId(id) {
  return typeof id === "string" && _LIST_ID.test(id)
}

// The address a feed is read from, or "" for anything that is not a feed.
// The kind only picks a position in the list of constants. It never becomes
// part of the address.
function url(kind) {
  var index = typeof kind === "string" ? _KINDS.indexOf(kind) : -1
  return index === -1 ? "" : _URLS[index]
}

// The address of a playlist the user opened, or "" when the id is not a
// playlist id.
function playlistUrl(id) {
  return isListId(id) ? _LIST_URL + id : ""
}

// yt-dlp's answer for one feed. Returns { ok: false } when the kind is not
// a feed or the text is not a playlist answer, else
// { ok: true, tracks, playlists }: the playlists feed fills playlists with
// { id, title, count } rows, every other feed fills tracks, and the other
// list is empty. Each list holds at most the feed cap. An answer without
// rows is a valid one, so "nothing there" and "could not be read" stay two
// different results.
function parse(kind, text) {
  if (!isKind(kind)) return { ok: false }
  if (kind === _PLAYLISTS_KIND) {
    var rows = _playlists(text)
    return rows === null ? { ok: false } : { ok: true, tracks: [], playlists: rows }
  }
  var tracks = _tracks(text)
  return tracks === null ? { ok: false } : { ok: true, tracks: tracks, playlists: [] }
}

// yt-dlp's answer for a playlist the user opened. Returns { ok: false } or
// { ok: true, tracks }.
function parseList(text) {
  var tracks = _tracks(text)
  return tracks === null ? { ok: false } : { ok: true, tracks: tracks }
}

// True while a list fetched at fetchedAt may be shown without asking again.
// Both arguments are milliseconds as Date.now() gives them. A clock that
// was set back makes the list stale, not everlasting.
function isFresh(fetchedAt, now) {
  if (typeof fetchedAt !== "number" || typeof now !== "number") return false
  if (!isFinite(fetchedAt) || !isFinite(now)) return false
  var age = now - fetchedAt
  return age >= 0 && age < CACHE_MS
}

if (typeof module !== "undefined") {
  module.exports = {
    KINDS: KINDS,
    CACHE_MS: CACHE_MS,
    isKind: isKind,
    isListId: isListId,
    url: url,
    playlistUrl: playlistUrl,
    parse: parse,
    parseList: parseList,
    isFresh: isFresh,
    feedArgv: feedArgv,
    verifyArgv: verifyArgv,
    markArgv: markArgv
  }
}
