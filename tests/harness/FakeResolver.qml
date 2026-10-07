import QtQuick
import "../../lib/Const.js" as Const

// A scripted stand-in for core/Resolver.qml, for cases that test what is
// handed a resolver without yt-dlp, files or a process runner. It has the
// functions such a component may call and no others, writes every command
// down in "calls", and answers a lookup only when the case says so: with
// succeed() or fail() for the oldest that waits, with succeedFor() or
// failFor() for every one that waits for a given video. The callback of a
// lookup therefore never runs inside the call that made it, which is the
// one promise of the real resolver that its callers build on.
//
// It keeps a small cache of made-up entries, so that fresh(), entry() and
// the "cached" flag of an answer tell the same story as the real thing: an
// entry counts as cached when it was there, and fresh, at the moment the
// request was made.
QtObject {
  id: root

  // ---- Record ----

  // Every command the resolver was given, in order, as { name, args }. The
  // callback is not part of args. Questions (fresh, entry) are not listed.
  property var calls: []

  // Where the made-up info files claim to be. Nothing ever opens them.
  property string infoDir: "/run/oj-fake/info"

  // The made-up cache, from id to entry. A Map, so that an id such as
  // "constructor" is a key like any other.
  property var _cache: new Map()
  // Requests that were made and not answered yet, oldest first.
  property var _waiting: []
  // Requests that cancelPlay() took out of the line.
  property var _cancelled: []
  // The counter that names info files; a number is never used twice.
  property int _n: 0

  // ---- Script ----

  function clearCalls() {
    root.calls = []
  }

  // The names of the recorded commands, for a short assertion on order.
  function names() {
    return root.calls.map(function(call) { return call.name })
  }

  // How many requests still wait for succeed() or fail().
  function pending() {
    return root._waiting.length
  }

  // Answers the oldest waiting request with an entry: the one the request
  // found in the cache, else a new one, which then replaces whatever the
  // cache holds for that id. "fields" may give the new entry's title,
  // channel, duration and live flag. Returns false when nothing waits.
  function succeed(fields) {
    var request = root._waiting.shift()
    if (!request) return false
    var found = request.hit
    if (found === null) {
      found = root._newEntry(request.id, fields)
      root._cache.set(request.id, found)
    }
    request.done({ ok: true, code: "", entry: found, cached: request.hit !== null })
    return true
  }

  // Answers the oldest waiting request with a failure. The cache is left
  // alone: a failed refresh keeps the old entry.
  function fail(code) {
    var request = root._waiting.shift()
    if (!request) return false
    request.done({ ok: false, code: code, entry: null, cached: false })
    return true
  }

  // Answers every waiting request for this video with one entry, as the
  // real resolver does when a play joins a lookup that is already running.
  // Returns how many were answered.
  function succeedFor(id, fields) {
    var mine = root._take(id)
    for (var i = 0; i < mine.length; i++) {
      var found = mine[i].hit
      if (found === null) {
        found = i === 0 ? root._newEntry(id, fields) : root._cache.get(id)
        root._cache.set(id, found)
      }
      mine[i].done({ ok: true, code: "", entry: found, cached: mine[i].hit !== null })
    }
    return mine.length
  }

  // Fails every waiting request for this video. Returns how many.
  function failFor(id, code) {
    var mine = root._take(id)
    for (var i = 0; i < mine.length; i++) mine[i].done({ ok: false, code: code, entry: null, cached: false })
    return mine.length
  }

  // The purposes of the waiting requests, oldest first.
  function purposes() {
    return root._waiting.map(function(request) { return request.purpose })
  }

  function _take(id) {
    var mine = []
    var rest = []
    for (var i = 0; i < root._waiting.length; i++) {
      if (root._waiting[i].id === id) mine.push(root._waiting[i])
      else rest.push(root._waiting[i])
    }
    root._waiting = rest
    return mine
  }

  // Hands every request cancelPlay() dropped the result "cancelled", which
  // a caller has to ignore. A case that never calls this plays the resolver
  // that says nothing at all about a cancelled request; both are allowed.
  // Returns how many were told.
  function deliverCancelled() {
    var dropped = root._cancelled
    root._cancelled = []
    for (var i = 0; i < dropped.length; i++) {
      dropped[i].done({ ok: false, code: "cancelled", entry: null, cached: false })
    }
    return dropped.length
  }

  // Puts an entry into the cache as if it had been resolved earlier, and
  // returns it.
  function seed(id, fields) {
    var made = root._newEntry(id, fields)
    root._cache.set(id, made)
    return made
  }

  // Makes the cached entry of this id look ms milliseconds old. Returns
  // false when there is none.
  function age(id, ms) {
    var found = root._cache.get(id)
    if (found === undefined) return false
    found.resolvedAt = Date.now() - ms
    return true
  }

  function _record(name, args) {
    root.calls.push({ name: name, args: JSON.parse(JSON.stringify(args)) })
  }

  function _newEntry(id, fields) {
    var given = fields ? fields : {}
    root._n += 1
    return {
      id: id,
      n: root._n,
      file: root.infoDir + "/" + root._n + ".json",
      track: {
        id: id,
        title: given.title === undefined ? "Fake title" : given.title,
        channel: given.channel === undefined ? "Fake channel" : given.channel,
        duration: given.duration === undefined ? 200 : given.duration,
        live: given.live === true
      },
      videoUrl: "",
      resolvedAt: Date.now()
    }
  }

  function _wait(id, purpose, done, hit) {
    root._waiting.push({
      id: id,
      purpose: purpose,
      done: typeof done === "function" ? done : function() {},
      hit: hit
    })
  }

  // ---- The resolver's functions ----

  function ensure(id, purpose, done) {
    root._record("ensure", [id, purpose])
    root._wait(id, purpose, done, root.fresh(id) ? root._cache.get(id) : null)
  }

  // Always resolves again, whatever the cache holds, in the place of a play.
  function refresh(id, done) {
    root._record("refresh", [id])
    root._wait(id, "play", done, null)
  }

  // The lookup that carries the saved login: always a new one, in the
  // place of a play.
  function refreshWithAccount(id, done) {
    root._record("refreshWithAccount", [id])
    root._wait(id, "play", done, null)
  }

  // Looks the video address of a cached entry up again. The stand-in
  // answers at once with what it has, on the next turn like the real one.
  function refreshVideoUrl(id, done) {
    root._record("refreshVideoUrl", [id])
    var found = root._cache.get(id)
    var answer = found === undefined ? { ok: false, code: "E_YTDLP_FAILED", videoUrl: "" }
      : { ok: true, code: "", videoUrl: found.videoUrl }
    if (typeof done === "function") Qt.callLater(done, answer)
  }

  // The highlighted search row; the real resolver may look it up early.
  function hint(id) {
    root._record("hint", [id])
  }

  function cancelPlay() {
    root._record("cancelPlay", [])
    var kept = []
    for (var i = 0; i < root._waiting.length; i++) {
      if (root._waiting[i].purpose === "play") root._cancelled.push(root._waiting[i])
      else kept.push(root._waiting[i])
    }
    root._waiting = kept
  }

  function fresh(id) {
    var found = root._cache.get(id)
    return found !== undefined && Date.now() - found.resolvedAt < Const.LIMITS.resolveTtlMs
  }

  function entry(id) {
    var found = root._cache.get(id)
    return found === undefined ? null : found
  }

  // The real resolver trims its cache here. The stand-in holds a handful of
  // entries at most, so there is nothing to trim.
  function retain(ids) {
    root._record("retain", [ids])
  }

  function purge(keepIds) {
    root._record("purge", [keepIds])
    var kept = new Map()
    var ids = Array.isArray(keepIds) ? keepIds : []
    for (var i = 0; i < ids.length; i++) {
      if (root._cache.has(ids[i])) kept.set(ids[i], root._cache.get(ids[i]))
    }
    root._cache = kept
  }
}
