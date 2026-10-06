import QtQuick
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Ids.js" as Ids
import "../lib/Paths.js" as Paths
import "../lib/Thumbs.js" as Thumbs

// Thumbnails: fetched in small batches by one bounded curl process at a
// time, kept as private files in the runtime directory, and handed to the
// panel as local file paths. No remote address ever reaches the panel, and
// none that came from outside is ever fetched: the address of a thumbnail
// is built from the video id and a constant host.
//
// It owns the thumbnail files and the table that says which video each one
// belongs to. That table exists in memory only. A file is named by a
// counter, so no video id is in a file name, in a command line, or in a
// warning Qt prints about a file. Whenever files go, the published map
// loses them first and the files are deleted a turn later, so a row never
// points at a file that is being deleted.
Item {
  id: root

  // Given by the service: the process runner, the tool table (replaced only
  // by tests) and the file layer.
  property var runner: null
  property var tools: Const.TOOLS
  property var fs: null
  // Nothing is fetched unless a panel is open to show it. What is asked for
  // meanwhile waits: a row may ask a moment before its panel counts as open.
  property bool panelOpen: false

  // id -> absolute path of the local file. An object without a prototype,
  // replaced by a new one whenever its content changes.
  readonly property var map: _map

  property var _map: Object.freeze(Object.create(null))
  // id -> { n, path }, oldest first.
  property var _ready: new Map()
  // Ids that could not be fetched or shown. They are not asked for again,
  // so a missing thumbnail costs one request and not one per look.
  property var _failed: new Set()
  // Ids waiting for a batch, oldest first.
  property var _queue: []
  // The items of the batch whose result is still wanted, or null.
  property var _batch: null
  // True while a curl process exists, wanted or not.
  property bool _busy: false
  property int _job: 0
  // Counts purges. A batch that finds another number than the one it was
  // started under must leave nothing behind.
  property int _gen: 0
  // Names the files: 1, 2, 3, and never the same number twice.
  property int _counter: 0
  property bool _pumpPending: false
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // Asks for the thumbnails of these video ids. Ids that are not ids, that
  // are there already, that failed before or that are already asked for are
  // skipped. When more wait than the queue holds, the oldest give way.
  function want(ids) {
    if (!Array.isArray(ids)) return
    var room = Const.LIMITS.thumbQueue
    var queue = root._queue.slice()
    for (var i = Math.max(0, ids.length - room); i < ids.length; i++) {
      var id = ids[i]
      if (Ids.isId(id) && !root._known(id) && queue.indexOf(id) === -1) queue.push(id)
    }
    root._queue = queue.slice(Math.max(0, queue.length - room))
    root._pumpSoon()
  }

  // A row could not show the file it was given: the id counts as failed,
  // leaves the map, and its file is removed.
  function reportError(id) {
    var found = root._ready.get(id)
    if (found === undefined) return
    root._ready.delete(id)
    root._noteFailed(id)
    root._publish()
    root._removeSoon([found.path])
  }

  // Forgets everything and empties the folder. A batch that is running is
  // stopped, and what it wrote goes as soon as it has ended.
  function purge() {
    root._gen += 1
    if (root._job !== 0 && root.runner !== null) root.runner.cancel(root._job)
    root._job = 0
    root._batch = null
    root._queue = []
    root._ready = new Map()
    root._failed = new Set()
    root._publish()
    root._later(function() {
      var paths = root._paths()
      if (paths !== null) root.fs.purgeDir(paths.thumbsDir)
    })
  }

  // Our paths, or null until the file layer has vouched for the private
  // directories.
  function _paths() {
    return root.fs !== null && root.fs.status === "ready" ? root.fs.paths : null
  }

  // True when nothing has to be done for the id: its file is there, it
  // failed before, or it is being fetched right now.
  function _known(id) {
    if (root._ready.has(id) || root._failed.has(id)) return true
    var batch = root._batch === null ? [] : root._batch
    for (var i = 0; i < batch.length; i++) {
      if (batch[i].id === id) return true
    }
    return false
  }

  // Remembers a failure. The memory is bounded: beyond the number of files
  // the cache may hold, the oldest failure is forgotten and may be tried
  // once more.
  function _noteFailed(id) {
    root._failed.add(id)
    if (root._failed.size <= Const.LIMITS.thumbFiles) return
    var oldest = null
    root._failed.forEach(function(failed) {
      if (oldest === null) oldest = failed
    })
    root._failed.delete(oldest)
  }

  function _publish() {
    var next = Object.create(null)
    root._ready.forEach(function(found, id) { next[id] = found.path })
    root._map = Object.freeze(next)
  }

  function _later(action) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) action()
    })
  }

  // Deletes files a turn later, after the map that no longer names them
  // has reached the rows.
  function _removeSoon(files) {
    if (files.length === 0) return
    root._later(function() { root.fs.remove(files) })
  }

  // Any number of requests within one turn make one batch.
  function _pumpSoon() {
    if (root._pumpPending) return
    root._pumpPending = true
    root._later(function() {
      root._pumpPending = false
      root._pump()
    })
  }

  // Starts the next batch, unless one is running or no panel is open.
  function _pump() {
    if (root._busy || !root.panelOpen || root._queue.length === 0) return
    var paths = root._paths()
    var argv = Thumbs.argv(root.tools)
    var env = Env.net(paths)
    if (root.runner === null || argv === null || env === null) {
      root._queue = []
      return
    }
    var ids = root._queue.slice(0, Const.LIMITS.thumbBatch)
    root._queue = root._queue.slice(ids.length)
    var items = []
    for (var i = 0; i < ids.length; i++) {
      root._counter += 1
      items.push({ id: ids[i], n: root._counter, path: Paths.thumbFile(paths, root._counter) })
    }
    var transfers = Thumbs.config(paths, items)
    if (transfers === "") {
      // Every id was checked on its way into the queue, so this is a bug.
      // The ids are dropped: curl is never run without its list.
      console.warn("omajuke: a thumbnail batch could not be described")
      return
    }
    var gen = root._gen
    root._batch = items
    root._busy = true
    root._job = root.runner.run({
      tag: "thumbs",
      argv: argv,
      stdin: transfers,
      timeoutSec: Const.TIMEOUTS.thumbs,
      maxBytes: Const.LIMITS.thumbOutBytes,
      env: env,
      // curl creates the files, and they are to be private from the start.
      umask077: true,
      done: function(result) { root._fetched(gen, items, result) }
    })
  }

  // curl has ended. Its exit code says nothing (it is an error as soon as
  // one transfer failed); its report says which files are there.
  function _fetched(gen, items, result) {
    root._busy = false
    var purged = gen !== root._gen
    if (!purged) {
      root._job = 0
      root._batch = null
    }
    if (purged || result.error === "cancelled") {
      // Purged while it ran, or stopped by someone else: whatever it wrote
      // has to go, and nothing is known about its ids, so they are neither
      // kept nor counted as failed.
      root.fs.remove(items.map(function(item) { return item.path }))
      root._pumpSoon()
      return
    }
    var verdict = Thumbs.parse(result.stdout, items)
    var doomed = []
    for (var i = 0; i < verdict.ready.length; i++) {
      var got = items[verdict.ready[i]]
      root._ready.set(got.id, { n: got.n, path: got.path })
    }
    for (var k = 0; k < verdict.failed.length; k++) {
      var lost = items[verdict.failed[k]]
      root._noteFailed(lost.id)
      // A transfer that failed half-way, or brought something that is not
      // a picture, may have left a file.
      doomed.push(lost.path)
    }
    var surplus = Thumbs.evictCount(root._ready.size)
    var evicted = []
    root._ready.forEach(function(found, id) {
      if (evicted.length < surplus) evicted.push(id)
    })
    for (var e = 0; e < evicted.length; e++) {
      doomed.push(root._ready.get(evicted[e]).path)
      root._ready.delete(evicted[e])
    }
    if (verdict.ready.length > 0 || evicted.length > 0) root._publish()
    root._removeSoon(doomed)
    root._pumpSoon()
  }

  onPanelOpenChanged: {
    // What the closed panel asked for is not fetched behind its back; a
    // batch that is running may finish.
    if (root.panelOpen) root._pumpSoon()
    else root._queue = []
  }

  Component.onDestruction: root._life.alive = false
}
