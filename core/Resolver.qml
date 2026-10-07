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
// At most two lookups run. One is in front: it is for the track that is
// about to play, or for the picture of the track that is playing. Its
// caller always hears back exactly once and never before the request has
// returned: with the entry, with an error code, or with the code
// "cancelled" when playback itself asked for something else meanwhile. The
// other runs ahead of a play: for the next track of the queue, or for the
// search result the highlight rests on. A lookup ahead never holds up the
// one in front, and nobody has to wait for it. When a play asks for the
// very video a lookup ahead is working on, that lookup moves to the front
// instead of being started a second time.
//
// Every lookup is made without the account, except the one the user asks
// for by name after YouTube refused a video to a visitor. That one is not
// run here: it is handed to whoever keeps the saved login, who gives yt-dlp
// a throwaway copy of it and lets one such call run at a time. A lookup
// ahead of a play is never made with the account and never marks anything
// watched.
Item {
  id: root

  // Given by the service: the process runner, the tool table (replaced only
  // by tests), the file layer and the typed settings, of which maxHeight
  // and preload are read.
  property var runner: null
  property var tools: Const.TOOLS
  property var fs: null
  property var settings: null
  // Whether a panel is open. Nothing is looked up for a highlighted row
  // while none is.
  property bool panelOpen: false
  // Whoever keeps the saved login, or null while nobody can be signed in.
  // Two functions are used. runSigned({ tag, build, stdin, timeoutSec,
  // maxBytes, done }) runs one yt-dlp call whose command line build(copy)
  // makes for the throwaway cookie file it is handed, and returns a ticket,
  // or 0 when it does not take the call; done(result, code) gets the
  // runner's result once the copy is gone, and code "E_SIGNED_OUT" when
  // YouTube no longer accepts the login. cancelSigned(ticket) gives the
  // call up.
  property var account: null

  // id -> entry, least recently used first. A Map, so that an id such as
  // "constructor" is a key like any other.
  property var _cache: new Map()
  // Names the info files: 1, 2, 3, and never the same number twice.
  property int _counter: 0
  // True from the first write on until the folder is emptied as a whole:
  // while nothing was written there is nothing to delete, and no job is
  // started to find that out.
  property bool _unswept: false
  // The lookup in front, or null: { id, kind, purpose, callbacks, job,
  // ticket, open }. kind is "entry" (it ends in an entry and a file),
  // "account" (the same, asked with the account) or "video" (only the
  // address of the picture is wanted). job is our own yt-dlp job, ticket
  // the call the keeper of the login runs for us; at most one of them is
  // not 0. open turns false the moment the lookup is answered or given up;
  // whatever still arrives for it afterwards only cleans up.
  property var _lookup: null
  // The lookup ahead of a play, or null. The same shape, kind "entry",
  // purpose "next" or "preload".
  property var _ahead: null
  // The search result the highlight rests on, or "".
  property string _hinted: ""
  // The ids playback last said it still needs. mpv may hold their files.
  property var _kept: new Set()
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // Makes sure there is a fresh entry for the video and hands it to
  // done({ ok, code, entry, cached }). cached is true when the entry was
  // already there, false when a lookup had to make it.
  //
  // purpose "play": the lookup in front. A request for another video gives
  // up the one in front; one for the same video joins it.
  // purpose "next" or "preload": the lookup ahead. A request for another
  // video gives up the one that runs ahead; one for the same video joins
  // it. A preload is refused unless the setting is on and a panel is open.
  function ensure(id, purpose, done) {
    var callback = root._callback(done)
    if (!Ids.isId(id)) { root._answerLater([callback], root._failure("E_INVALID_INPUT")); return }
    if (purpose === "play") root._ensureInFront(id, callback)
    else if (purpose === "next" || purpose === "preload") root._ensureAhead(id, purpose, callback)
    // Any other purpose starts nothing and gets the one answer every caller
    // ignores.
    else root._answerLater([callback], root._failure("cancelled"))
  }

  // Playback stopped or replaced the play it asked for. The lookup in front
  // is given up and answered with the code "cancelled".
  function cancelPlay() {
    var lookup = root._lookup
    if (lookup === null) return
    root._lookup = null
    root._giveUp(lookup)
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
    root._dropAheadFor(id)
    root._run(root._begin(id, "entry", callback))
  }

  // refresh() with the account, for a video YouTube refused to a visitor
  // and the user asked to play signed in. It answers like refresh(). The
  // code "E_SIGNED_OUT" says that there is no login to use, or that YouTube
  // no longer accepts it.
  function refreshWithAccount(id, done) {
    var callback = root._callback(done)
    if (!Ids.isId(id)) { root._answerLater([callback], root._failure("E_INVALID_INPUT")); return }
    var paths = root._paths()
    if (paths === null) { root._answerLater([callback], root._failure("E_RUNTIME_DIR")); return }
    var account = root.account
    var usable = account !== null && account !== undefined && typeof account.runSigned === "function"
    if (!usable) { root._answerLater([callback], root._failure("E_SIGNED_OUT")); return }
    root._dropAheadFor(id)
    var lookup = root._begin(id, "account", callback)
    var tools = root.tools
    var height = root.settings ? root.settings.maxHeight : undefined
    var ticket = account.runSigned({
      tag: "resolve",
      // Only a numbered copy in our own runtime directory gets a command
      // line; for anything else this is null and nothing can run.
      build: function(copy) { return YtArgs.resolveWithAccount(tools, paths, height, copy) },
      stdin: Ids.watchUrl(id) + "\n",
      timeoutSec: Const.TIMEOUTS.resolve,
      maxBytes: Const.LIMITS.resolveBytes,
      done: function(result, code) { root._signedDone(lookup, result, code) }
    })
    if (typeof ticket === "number" && ticket > 0) {
      lookup.ticket = ticket
      return
    }
    // Not taken: nobody is signed in. Whether or not done still follows,
    // the caller hears back once.
    root._later(function() { root._finish(lookup, root._failure("E_SIGNED_OUT")) })
  }

  // Asks again for the address of the picture of a track that keeps
  // playing, and hands it to done({ ok, code, videoUrl }). On success the
  // entry keeps its file, its counter and its age, and only the address is
  // new. No file is written and none is deleted: mpv's playlist still names
  // the old one. On failure nothing changes. A play that is being looked up
  // comes first: this request joins it when it is for the same video and is
  // answered "cancelled" when it is for another.
  function refreshVideoUrl(id, done) {
    var callback = root._callback(done)
    if (!Ids.isId(id)) { root._answerLater([callback], root._noVideo("E_INVALID_INPUT")); return }
    var front = root._lookup
    if (front !== null && front.id === id) {
      front.callbacks.push(front.kind === "video" ? callback : root._videoOf(callback))
      return
    }
    if (front !== null) { root._answerLater([callback], root._noVideo("cancelled")); return }
    // Without an entry there is no playing track whose picture could be
    // meant, and nothing the new address could be kept in.
    if (!root._cache.has(id)) { root._answerLater([callback], root._noVideo("E_VIDEO_NONE")); return }
    root._run(root._begin(id, "video", callback))
  }

  // The panel says which search result the highlight rests on, or "" for
  // none. After a short rest on one row the video is looked up ahead, so
  // that Enter starts it at once. A highlight that moves on gives up the
  // lookup made for the row it left. While no panel is open there is no
  // highlight, whatever is reported.
  function hint(id) {
    var wanted = root.panelOpen && Ids.isId(id) ? id : ""
    dwell.stop()
    if (wanted !== root._hinted) {
      root._hinted = wanted
      var ahead = root._ahead
      if (ahead !== null && ahead.purpose === "preload" && ahead.id !== wanted) root._dropAhead()
    }
    if (wanted !== "") dwell.restart()
  }

  // Trims the cache to its size limit, least recently used first, and
  // deletes the files of what goes. The entries of ids are never dropped,
  // even if that leaves the cache over its limit: mpv may still hold them.
  function retain(ids) {
    var keep = root._idSet(ids)
    root._kept = keep
    var surplus = root._cache.size - Const.LIMITS.resolveCache
    var doomed = []
    root._cache.forEach(function(found, id) {
      if (doomed.length < surplus && !keep.has(id)) doomed.push(found)
    })
    root._forget(doomed)
  }

  // Drops every entry except those of keepIds and deletes the files of the
  // dropped ones. A lookup ahead of a play for any other video is given up
  // as well: it would bring back what is being dropped. With nothing kept
  // and no lookup in progress the whole folder is emptied, which also takes
  // whatever a failed write left there.
  function purge(keepIds) {
    var keep = root._idSet(keepIds)
    root._kept = keep
    if (root._ahead !== null && !keep.has(root._ahead.id)) root._dropAhead()
    var doomed = []
    root._cache.forEach(function(found, id) {
      if (!keep.has(id)) doomed.push(found)
    })
    if (doomed.length < root._cache.size || root._lookup !== null || root._ahead !== null) {
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

  // What a request for the address of the picture hears when there is none.
  function _noVideo(code) {
    return { ok: false, code: code, videoUrl: "" }
  }

  // The failure in the shape the callers of this lookup expect.
  function _failed(lookup, code) {
    return lookup.kind === "video" ? root._noVideo(code) : root._failure(code)
  }

  // Lets a request for the address of the picture wait for a lookup that
  // ends in a whole entry.
  function _videoOf(callback) {
    return function(result) {
      if (!result.ok) callback(root._noVideo(result.code))
      else if (result.entry.videoUrl === "") callback(root._noVideo("E_VIDEO_NONE"))
      else callback({ ok: true, code: "", videoUrl: result.entry.videoUrl })
    }
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

  // Whether a video may be looked up just because the highlight rests on
  // it: only while the user allows it and looks at the panel.
  function _preloadAllowed() {
    var settings = root.settings
    return root.panelOpen && settings !== null && settings !== undefined && settings.preload === true
  }

  function _newLookup(id, kind, purpose, callback) {
    return { id: id, kind: kind, purpose: purpose, callbacks: [callback], job: 0, ticket: 0, open: true }
  }

  // Gives up the lookup in front and makes one for id the current one.
  function _begin(id, kind, callback) {
    root.cancelPlay()
    var lookup = root._newLookup(id, kind, "play", callback)
    root._lookup = lookup
    return lookup
  }

  // Stops a lookup that has already been taken out of its slot, and tells
  // its callers.
  function _giveUp(lookup) {
    lookup.open = false
    if (lookup.job !== 0 && root.runner !== null) root.runner.cancel(lookup.job)
    var account = root.account
    if (lookup.ticket !== 0 && account && typeof account.cancelSigned === "function") {
      account.cancelSigned(lookup.ticket)
    }
    root._answerLater(lookup.callbacks, root._failed(lookup, "cancelled"))
  }

  function _dropAhead() {
    var ahead = root._ahead
    if (ahead === null) return
    root._ahead = null
    root._giveUp(ahead)
  }

  // A new lookup in front for the video the one ahead is working on would
  // otherwise be overtaken by it: the later answer would replace the entry
  // playback was just handed, and delete its file.
  function _dropAheadFor(id) {
    if (root._ahead !== null && root._ahead.id === id) root._dropAhead()
  }

  function _ensureInFront(id, callback) {
    var front = root._lookup
    if (front !== null && front.id === id && front.kind !== "video") {
      front.callbacks.push(callback)
      return
    }
    var ahead = root._ahead
    if (ahead !== null && ahead.id === id) {
      // The lookup ahead becomes the one in front. From here on only
      // playback can give it up: a highlight that moves away, or another
      // lookup ahead, no longer touches it, so the play always hears back.
      root.cancelPlay()
      root._ahead = null
      ahead.purpose = "play"
      ahead.callbacks.push(callback)
      root._lookup = ahead
      return
    }
    var lookup = root._begin(id, "entry", callback)
    if (!root.fresh(id)) {
      root._run(lookup)
      return
    }
    // A hit is answered on the next turn. Until then it is a lookup like
    // any other: it can be joined and given up.
    var hit = root._touch(id)
    root._later(function() {
      if (!lookup.open) return
      var now = root._cache.get(id)
      if (now !== undefined && now.n === hit.n) root._finish(lookup, root._success(now, true))
      // Dropped from the cache within this very turn: look it up after all.
      else root._run(lookup)
    })
  }

  function _ensureAhead(id, purpose, callback) {
    if (purpose === "preload" && !root._preloadAllowed()) {
      root._answerLater([callback], root._failure("cancelled"))
      return
    }
    // Already being looked up, in front or ahead: no second job.
    var front = root._lookup
    if (front !== null && front.id === id && front.kind !== "video") {
      front.callbacks.push(callback)
      return
    }
    var ahead = root._ahead
    if (ahead !== null && ahead.id === id) {
      ahead.callbacks.push(callback)
      // The queue now waits for it too, so a highlight that moves on must
      // leave it alone.
      if (purpose === "next") ahead.purpose = "next"
      return
    }
    // The next track of the queue will be played; a highlighted row only
    // may be. So a preload waits its turn (the rest timer starts again when
    // the lookup for the queue ends) and never takes that lookup's place.
    if (purpose === "preload" && ahead !== null && ahead.purpose === "next") {
      root._answerLater([callback], root._failure("cancelled"))
      return
    }
    if (root.fresh(id)) {
      // A hit needs no job and gives up nobody else's.
      var hit = root._touch(id)
      root._later(function() {
        var now = root._cache.get(id)
        var still = now !== undefined && now.n === hit.n
        root._answer([callback], still ? root._success(now, true) : root._failure("cancelled"))
      })
      return
    }
    root._dropAhead()
    var lookup = root._newLookup(id, "entry", purpose, callback)
    root._ahead = lookup
    root._run(lookup)
  }

  // The highlight has rested on one search result for long enough.
  function _dwelt() {
    var id = root._hinted
    if (id === "" || !root._preloadAllowed() || root.fresh(id)) return
    // An old entry playback still needs is left alone: its file may be in
    // mpv's playlist, and a new entry would delete it. Playing the track
    // again looks it up anyway.
    if (root._kept.has(id) && root._cache.has(id)) return
    root.ensure(id, "preload", null)
  }

  // The setting was switched off, or the panel closed, while a video was
  // being looked up for the highlight.
  function _checkPreload() {
    if (root._preloadAllowed()) return
    if (root._ahead !== null && root._ahead.purpose === "preload") root._dropAhead()
  }

  // Ends a lookup with its answer. One that was given up meanwhile has had
  // its answer already.
  function _finish(lookup, result) {
    if (!lookup.open) return
    lookup.open = false
    if (root._lookup === lookup) root._lookup = null
    if (root._ahead === lookup) {
      root._ahead = null
      // A highlight that rested meanwhile gets its turn now.
      if (root._hinted !== "" && root._hinted !== lookup.id) dwell.restart()
    }
    root._answer(lookup.callbacks, result)
  }

  // Starts the yt-dlp job of a lookup that is made without the account.
  function _run(lookup) {
    var paths = root._paths()
    var height = root.settings ? root.settings.maxHeight : undefined
    var argv = YtArgs.resolve(root.tools, paths, height)
    var env = Env.net(paths)
    if (root.runner === null || argv === null || env === null) {
      root._later(function() { root._finish(lookup, root._failed(lookup, "E_RUNTIME_DIR")) })
      return
    }
    lookup.job = root.runner.run({
      tag: "resolve",
      argv: argv,
      stdin: Ids.watchUrl(lookup.id) + "\n",
      timeoutSec: Const.TIMEOUTS.resolve,
      maxBytes: Const.LIMITS.resolveBytes,
      env: env,
      done: function(result) {
        lookup.job = 0
        root._resolved(lookup, result)
      }
    })
  }

  // The call that was made with the account has ended, or was never made.
  function _signedDone(lookup, result, code) {
    lookup.ticket = 0
    if (!lookup.open) return
    var readable = result !== null && typeof result === "object"
    // Asked before anything else is looked at, and asked here once more
    // whatever the keeper of the login found: a call can succeed and still
    // have run without the account, and its answer is then not to be used.
    var signedOut = code === "E_SIGNED_OUT" || !readable || Errors.fromSignedIn(result) !== ""
    if (signedOut) { root._finish(lookup, root._failure("E_SIGNED_OUT")); return }
    // Taken and then not run: the command or its environment could not be
    // made, which is about our own directories and not about the video.
    if (result.error === "refused") { root._finish(lookup, root._failure("E_RUNTIME_DIR")); return }
    root._resolved(lookup, result)
  }

  // yt-dlp has answered, or failed. Either way it has exited.
  function _resolved(lookup, result) {
    if (!lookup.open) return
    // This also covers a job that someone else stopped: the caller still
    // waits, and gets a code that ends its wait.
    if (!result.ok) { root._finish(lookup, root._failed(lookup, Errors.fromYtDlp(result))); return }
    var parsed = Track.fromInfoJson(result.stdout, lookup.id)
    if (!parsed.ok) { root._finish(lookup, root._failed(lookup, "E_BAD_OUTPUT")); return }
    if (lookup.kind === "video") { root._videoFound(lookup, parsed); return }
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

  // A new address for the picture of a track that keeps playing. Entries
  // are frozen, so the entry is made anew around the same file; it keeps
  // its place in the order of use.
  function _videoFound(lookup, parsed) {
    var old = root._cache.get(lookup.id)
    if (old === undefined || parsed.videoUrl === "") {
      root._finish(lookup, root._noVideo("E_VIDEO_NONE"))
      return
    }
    root._cache.set(lookup.id, Object.freeze({
      id: old.id,
      n: old.n,
      file: old.file,
      track: old.track,
      videoUrl: parsed.videoUrl,
      resolvedAt: old.resolvedAt
    }))
    root._finish(lookup, { ok: true, code: "", videoUrl: parsed.videoUrl })
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

  onPanelOpenChanged: if (!root.panelOpen) root.hint("")
  onSettingsChanged: root._checkPreload()

  Component.onDestruction: root._life.alive = false

  // Runs only while the highlight rests on a search result that has not
  // been looked up yet.
  Timer {
    id: dwell
    interval: Const.TIMEOUTS.dwellMs
    onTriggered: root._dwelt()
  }
}
