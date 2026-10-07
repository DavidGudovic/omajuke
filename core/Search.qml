import QtQuick
import "../lib/Clean.js" as Clean
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Errors.js" as Errors
import "../lib/Ids.js" as Ids
import "../lib/Track.js" as Track
import "../lib/YtArgs.js" as YtArgs

// The search: at most one yt-dlp job at a time, and what came of the last
// one. It owns the search state the panel shows (the query, whether a search
// is running, its results or its error).
//
// The query never appears in a command line. It is written to yt-dlp's
// standard input as one line behind a constant prefix, and it is cleaned
// here once more whatever the caller did: that reader takes one entry per
// line, so a line break inside a query would be a second entry of someone
// else's choosing.
//
// Nothing can put this component into an error state from outside: "error"
// always means a search that ran and failed, and query is then the query it
// ran for.
//
// It also fetches the tracks YouTube relates to one video, for a queue that
// has run out. That is a second, separate job: it has no state here, it
// shows nothing, and a search neither waits for it nor is changed by it.
Item {
  id: root

  // Given by the service: the process runner, the tool table (replaced only
  // by tests) and the file layer, which knows our paths and whether the
  // private directories have been prepared.
  property var runner: null
  property var tools: Const.TOOLS
  property var fs: null

  // "idle", "searching", "results", "empty" or "error".
  readonly property string status: _status
  // The cleaned query the state belongs to; "" while idle.
  readonly property string query: _query
  // Tracks, at most Const.LIMITS.searchCount. While a new search runs these
  // are still the results of the one before, so the panel can keep showing
  // them dimmed.
  readonly property var results: _results
  // The code of the failure while status is "error", else "".
  readonly property string errorCode: _errorCode

  property string _status: "idle"
  property string _query: ""
  property var _results: []
  property string _errorCode: ""
  // Counts searches. A job that finds another number than the one it was
  // started under has been superseded and says nothing.
  property int _gen: 0
  property int _job: 0
  // The fetch of related tracks in progress, or null: { job, callback,
  // open }. open turns false the moment it is answered or given up.
  property var _mix: null
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // Starts a search for query and gives up the one that is running. Returns
  // false, and changes nothing, when nothing is left of the query after
  // cleaning.
  function submit(query: var): bool {
    if (typeof query !== "string") return false
    var cleaned = Clean.query(query)
    if (cleaned === "") return false
    var gen = ++root._gen
    root._cancelJob()
    root._query = cleaned
    root._errorCode = ""
    root._status = "searching"
    var paths = root._paths()
    var argv = YtArgs.search(root.tools, paths)
    var env = Env.net(paths)
    if (root.runner === null || argv === null || env === null) {
      root._fail("E_RUNTIME_DIR")
      return true
    }
    root._job = root.runner.run({
      tag: "search",
      argv: argv,
      stdin: "ytsearch" + Const.LIMITS.searchCount + ":" + cleaned + "\n",
      timeoutSec: Const.TIMEOUTS.search,
      maxBytes: Const.LIMITS.searchBytes,
      env: env,
      done: function(result) {
        // A newer search owns the state now, and a job we stopped ourselves
        // has nothing to say.
        if (gen !== root._gen) return
        root._job = 0
        // Stopped by someone else: there will be no answer, so the search
        // must not be shown as running for ever.
        if (result.error === "cancelled") { root.clear(); return }
        if (!result.ok) { root._fail(Errors.fromYtDlp(result)); return }
        var parsed = Track.listFromPlaylistJson(result.stdout, Const.LIMITS.searchCount)
        if (!parsed.ok) { root._fail("E_BAD_OUTPUT"); return }
        root._results = parsed.tracks
        root._status = parsed.tracks.length > 0 ? "results" : "empty"
      }
    })
    return true
  }

  // Gives up a running search and forgets the query, the results and the
  // error.
  function clear(): void {
    root._gen += 1
    root._cancelJob()
    root._results = []
    root._errorCode = ""
    root._query = ""
    root._status = "idle"
  }

  // Fetches the tracks YouTube relates to the video id and hands them to
  // done({ ok, code, tracks }): at most Const.LIMITS.mixFetch tracks, each
  // once, without the video itself. done is called exactly once and never
  // before this request has returned. YouTube builds such a list for music
  // only; for any other video the answer is that one video, which is a
  // failure here like every other, and none of them changes anything else.
  // One fetch runs at a time: a new request gives up the one in progress,
  // which is answered with the code "cancelled".
  function mix(id, done) {
    var callback = typeof done === "function" ? done : function(result) {}
    if (!Ids.isId(id)) { root._mixLater(callback, root._noMix("E_INVALID_INPUT")); return }
    root._cancelMix()
    var paths = root._paths()
    var argv = YtArgs.mix(root.tools, paths)
    var env = Env.net(paths)
    if (root.runner === null || argv === null || env === null) {
      root._mixLater(callback, root._noMix("E_RUNTIME_DIR"))
      return
    }
    var fetch = { job: 0, callback: callback, open: true }
    root._mix = fetch
    fetch.job = root.runner.run({
      tag: "mix",
      argv: argv,
      stdin: Ids.mixUrl(id) + "\n",
      timeoutSec: Const.TIMEOUTS.mix,
      maxBytes: Const.LIMITS.mixBytes,
      env: env,
      done: function(result) {
        // Given up meanwhile: it has had its answer.
        if (!fetch.open) return
        fetch.open = false
        if (root._mix === fetch) root._mix = null
        root._mixAnswer(callback, root._mixResult(id, result))
      }
    })
  }

  // Our paths, or null until the file layer has vouched for the private
  // directories: yt-dlp keeps its cache in one of them.
  function _paths() {
    return root.fs !== null && root.fs.status === "ready" ? root.fs.paths : null
  }

  function _cancelJob() {
    if (root._job !== 0 && root.runner !== null) root.runner.cancel(root._job)
    root._job = 0
  }

  // The results of an earlier query do not belong to the one that failed.
  function _fail(code) {
    root._results = []
    root._errorCode = code
    root._status = "error"
  }

  function _noMix(code) {
    return { ok: false, code: code, tracks: [] }
  }

  // What a finished fetch of related tracks amounts to. A job that someone
  // else stopped gets a code like any other failure, so that its caller
  // does not wait for ever.
  function _mixResult(id, result) {
    if (!result.ok) return root._noMix(Errors.fromYtDlp(result))
    // Anything but a list means that YouTube builds none for this video.
    var parsed = Track.listFromPlaylistJson(result.stdout, Const.LIMITS.mixFetch)
    if (!parsed.ok) return root._noMix("E_BAD_OUTPUT")
    // The list starts with the video it was built around.
    var tracks = parsed.tracks.filter(function(track) { return track.id !== id })
    return { ok: true, code: "", tracks: tracks }
  }

  function _cancelMix() {
    var fetch = root._mix
    if (fetch === null) return
    root._mix = null
    fetch.open = false
    if (fetch.job !== 0 && root.runner !== null) root.runner.cancel(fetch.job)
    root._mixLater(fetch.callback, root._noMix("cancelled"))
  }

  function _mixAnswer(callback, result) {
    try {
      callback(result)
    } catch (error) {
      // What the caller threw is not logged: a message can carry anything.
      console.warn("omajuke: a mix callback failed")
    }
  }

  function _mixLater(callback, result) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) root._mixAnswer(callback, result)
    })
  }

  Component.onDestruction: root._life.alive = false
}
