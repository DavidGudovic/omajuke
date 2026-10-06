import QtQuick
import "../lib/Clean.js" as Clean
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Errors.js" as Errors
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
}
