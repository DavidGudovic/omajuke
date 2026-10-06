import QtQuick
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Errors.js" as Errors
import "../lib/Ids.js" as Ids
import "../lib/Paths.js" as Paths
import "../lib/Track.js" as Track
import "../lib/YtArgs.js" as YtArgs

// Looks a video up at YouTube before it is played, and keeps what came back.
// One yt-dlp job answers with everything mpv needs to start the video. That
// answer is written, exactly as it came, to a private file in the runtime
// directory, and mpv's own yt-dlp hook is later pointed at the file instead
// of asking YouTube a second time.
//
// It owns the info files and the cache of entries that name them. A file is
// named by a counter, never by the video id, and it is deleted in the same
// step in which its entry leaves the cache, after the cache was changed.
// The files hold media addresses signed for this machine: they are never
// logged, copied or stored anywhere else.
//
// The address that is looked up is rebuilt from a validated id and reaches
// yt-dlp on its standard input, so no id is in any command line.
//
// One lookup runs at a time, the one for the track that is about to play.
// Its caller always hears back exactly once and never before the request
// has returned: with the entry, with an error code, or with the code
// "cancelled" when the caller itself asked for something else meanwhile.
Item {
  id: root

  // Given by the service: the process runner, the tool table (replaced only
  // by tests), the file layer and the typed settings, of which maxHeight is
  // read.
  property var runner: null
  property var tools: Const.TOOLS
  property var fs: null
  property var settings: null
  // Whether a panel is open. Only a lookup ahead of a play would ask, and
  // there is none yet: every lookup here is for a track the user started.
  property bool panelOpen: false

  // id -> entry, least recently used first. A Map, so that an id such as
  // "constructor" is a key like any other.
  property var _cache: new Map()
  // Names the info files: 1, 2, 3, and never the same number twice.
  property int _counter: 0
  // True from the first write on until the folder is emptied as a whole:
  // while nothing was written there is nothing to delete, and no job is
  // started to find that out.
  property bool _unswept: false
  // The lookup in progress, or null: { id, callbacks, job, open }. open
  // turns false the moment the lookup is answered or given up; whatever
  // still arrives for it afterwards only cleans up.
  property var _lookup: null
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // Makes sure there is a fresh entry for the video and hands it to
  // done({ ok, code, entry, cached }). cached is true when the entry was
  // already there, false when this request had to look it up. A request for
  // another video gives up the lookup in progress; one for the same video
  // joins it.
  function ensure(id, purpose, done) {
    var callback = root._callback(done)
    if (!Ids.isId(id)) { root._answerLater([callback], root._failure("E_INVALID_INPUT")); return }
    // Lookups ahead of a play do not exist yet. Asking for one starts
    // nothing and gets the one answer every caller ignores.
    if (purpose !== "play") { root._answerLater([callback], root._failure("cancelled")); return }
    if (root._lookup !== null && root._lookup.id === id) {
      root._lookup.callbacks.push(callback)
      return
    }
    var lookup = root._begin(id, callback)
    if (!root.fresh(id)) {
      root._run(lookup)
      return
    }
    // A hit is answered on the next turn. Until then it is a lookup like
    // any other: it can be joined and given up.
    var hit = root._touch(id)
    root._later(function() {
      if (!lookup.open) return
      if (root._cache.get(id) === hit) root._finish(lookup, root._success(hit, true))
      // Dropped from the cache within this very turn: look it up after all.
      else root._run(lookup)
    })
  }

  // The caller stopped or replaced the play it asked for. The lookup in
  // progress is given up and answered with the code "cancelled".
  function cancelPlay() {
    var lookup = root._lookup
    if (lookup === null) return
    root._lookup = null
    lookup.open = false
    if (lookup.job !== 0 && root.runner !== null) root.runner.cancel(lookup.job)
    root._answerLater(lookup.callbacks, root._failure("cancelled"))
  }

  // True when there is an entry for the video that is young enough to be
  // played from: the media addresses in it stop working after some hours.
  function fresh(id) {
    var found = root._cache.get(id)
    return found !== undefined && Date.now() - found.resolvedAt < Const.LIMITS.resolveTtlMs
  }

  // The entry for the video, whatever its age, or null:
  // { id, n, file, track, videoUrl, resolvedAt }. Entries are frozen, and
  // they never leave the service side.
  function entry(id) {
    var found = root._cache.get(id)
    return found === undefined ? null : found
  }

  // Looks the video up again, whatever the cache holds, and answers like
  // ensure() with cached false. The new entry replaces the old one only on
  // success, and only then is the old file deleted; after a failure both
  // are still there. The caller must have taken the old file out of mpv's
  // playlist first.
  function refresh(id, done) {
    var callback = root._callback(done)
    if (!Ids.isId(id)) { root._answerLater([callback], root._failure("E_INVALID_INPUT")); return }
    root._run(root._begin(id, callback))
  }

  // Trims the cache to its size limit, least recently used first, and
  // deletes the files of what goes. The entries of ids are never dropped,
  // even if that leaves the cache over its limit: mpv may still hold them.
  function retain(ids) {
    var keep = root._idSet(ids)
    var surplus = root._cache.size - Const.LIMITS.resolveCache
    var doomed = []
    root._cache.forEach(function(found, id) {
      if (doomed.length < surplus && !keep.has(id)) doomed.push(found)
    })
    root._forget(doomed)
  }

  // Drops every entry except those of keepIds and deletes the files of the
  // dropped ones. With nothing kept and no lookup in progress the whole
  // folder is emptied, which also takes whatever a failed write left there.
  function purge(keepIds) {
    var keep = root._idSet(keepIds)
    var doomed = []
    root._cache.forEach(function(found, id) {
      if (!keep.has(id)) doomed.push(found)
    })
    if (doomed.length < root._cache.size || root._lookup !== null) {
      root._forget(doomed)
      return
    }
    root._cache = new Map()
    var paths = root._paths()
    if (!root._unswept || paths === null) return
    root._unswept = false
    root.fs.purgeDir(paths.infoDir)
  }

  function _callback(done) {
    return typeof done === "function" ? done : function(result) {}
  }

  function _success(found, cached) {
    return { ok: true, code: "", entry: found, cached: cached }
  }

  function _failure(code) {
    return { ok: false, code: code, entry: null, cached: false }
  }

  // Our paths, or null until the file layer has vouched for the private
  // directories: yt-dlp keeps its cache in one of them, and the answer is
  // written into another.
  function _paths() {
    return root.fs !== null && root.fs.status === "ready" ? root.fs.paths : null
  }

  // The ids in a list, as a set. Anything that is not an id is left out.
  function _idSet(ids) {
    var set = new Set()
    if (!Array.isArray(ids)) return set
    for (var i = 0; i < ids.length; i++) {
      if (Ids.isId(ids[i])) set.add(ids[i])
    }
    return set
  }

  // Marks the entry as the most recently used one and returns it.
  function _touch(id) {
    var found = root._cache.get(id)
    root._cache.delete(id)
    root._cache.set(id, found)
    return found
  }

  // Takes entries out of the cache, then deletes their files.
  function _forget(entries) {
    if (entries.length === 0) return
    var files = []
    for (var i = 0; i < entries.length; i++) {
      root._cache.delete(entries[i].id)
      files.push(entries[i].file)
    }
    root.fs.remove(files)
  }

  function _later(action) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) action()
    })
  }

  function _answer(callbacks, result) {
    for (var i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i](result)
      } catch (error) {
        // One caller's bug must not keep the others from their answer, and
        // what it threw is not logged: a message can carry anything.
        console.warn("omajuke: a resolve callback failed")
      }
    }
  }

  function _answerLater(callbacks, result) {
    root._later(function() { root._answer(callbacks, result) })
  }

  // Gives up the lookup in progress and makes one for id the current one.
  function _begin(id, callback) {
    root.cancelPlay()
    var lookup = { id: id, callbacks: [callback], job: 0, open: true }
    root._lookup = lookup
    return lookup
  }

  // Ends a lookup with its answer. One that was given up meanwhile has had
  // its answer already.
  function _finish(lookup, result) {
    if (!lookup.open) return
    lookup.open = false
    if (root._lookup === lookup) root._lookup = null
    root._answer(lookup.callbacks, result)
  }

  // Starts the yt-dlp job of a lookup.
  function _run(lookup) {
    var paths = root._paths()
    var height = root.settings ? root.settings.maxHeight : undefined
    var argv = YtArgs.resolve(root.tools, paths, height)
    var env = Env.net(paths)
    if (root.runner === null || argv === null || env === null) {
      root._later(function() { root._finish(lookup, root._failure("E_RUNTIME_DIR")) })
      return
    }
    lookup.job = root.runner.run({
      tag: "resolve",
      argv: argv,
      stdin: Ids.watchUrl(lookup.id) + "\n",
      timeoutSec: Const.TIMEOUTS.resolve,
      maxBytes: Const.LIMITS.resolveBytes,
      env: env,
      done: function(result) { root._resolved(lookup, result) }
    })
  }

  // yt-dlp has answered, or failed.
  function _resolved(lookup, result) {
    lookup.job = 0
    if (!lookup.open) return
    // This also covers a job that someone else stopped: the caller still
    // waits, and gets a code that ends its wait.
    if (!result.ok) { root._finish(lookup, root._failure(Errors.fromYtDlp(result))); return }
    var parsed = Track.fromInfoJson(result.stdout, lookup.id)
    if (!parsed.ok) { root._finish(lookup, root._failure("E_BAD_OUTPUT")); return }
    var paths = root._paths()
    if (paths === null) { root._finish(lookup, root._failure("E_RUNTIME_DIR")); return }
    root._counter += 1
    var n = root._counter
    var file = Paths.infoFile(paths, n)
    root._unswept = true
    // The text goes to disk exactly as it came: mpv's hook hands it back to
    // yt-dlp, which must find its own output.
    root.fs.write(file, result.stdout, function(written) {
      root._stored(lookup, parsed, n, file, written)
    })
  }

  // The answer is on disk, or could not be written.
  function _stored(lookup, parsed, n, file, written) {
    if (!lookup.open) {
      // Given up while the file was being written: nobody will ever name
      // it, so it must not stay.
      root.fs.remove([file])
      return
    }
    if (!written.ok) {
      // Whatever is there may be incomplete.
      root.fs.remove([file])
      var noTools = written.error === "nowrap" || written.error === "missing"
      root._finish(lookup, root._failure(noTools ? "E_TOOLS_MISSING" : "E_RUNTIME_DIR"))
      return
    }
    var made = Object.freeze({
      id: lookup.id,
      n: n,
      file: file,
      track: Object.freeze(parsed.track),
      videoUrl: parsed.videoUrl,
      resolvedAt: Date.now()
    })
    var old = root._cache.get(lookup.id)
    root._cache.delete(lookup.id)
    root._cache.set(lookup.id, made)
    // Only now, with the new file in place and the cache pointing at it,
    // does the file of the entry it replaces go.
    if (old !== undefined) root.fs.remove([old.file])
    root._finish(lookup, root._success(made, false))
  }

  Component.onDestruction: root._life.alive = false
}
