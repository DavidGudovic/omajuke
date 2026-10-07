import QtQuick
import "../lib/Const.js" as Const
import "../lib/FeedUrls.js" as FeedUrls

// The lists of a signed-in account: For you, Subscriptions, Watch Later,
// Playlists and History, and a playlist opened from the Playlists list. It
// owns which list is shown, its rows or its error, and a short memory of
// what was fetched.
//
// A list is fetched only when the user selects it, never on a timer, and
// only while signed in. What was fetched is kept for a few minutes, in
// memory and nowhere else: nothing of a list is ever written to disk, and
// everything is dropped the moment the user is no longer signed in.
//
// These are the requests that carry the login. Each goes through the
// sign-in component, which hands the tool a throwaway copy of the login and
// runs one such call at a time. The address is a constant per list, or is
// rebuilt from a checked playlist id, and reaches the tool on its standard
// input: no command line names a list.
Item {
  id: root

  // Given by the service: the tool table (replaced only by tests), the file
  // layer, which knows our paths, and the sign-in component.
  property var tools: Const.TOOLS
  property var fs: null
  property var signIn: null

  // The list that is selected: one of FeedUrls.KINDS, or "" for none.
  readonly property string kind: _kind
  // "idle" (nothing selected), "loading", "rows", "empty" (the list was
  // read and holds nothing) or "error" (it could not be read).
  readonly property string status: _status
  // What the list holds. Every row has key (a number that names it for as
  // long as the service lives), playlist and title. A video row
  // (playlist false) has the fields of a track besides. A playlist row has
  // listId and count, the number of its videos or null when unknown.
  readonly property var rows: _rows
  // The code of the failure while status is "error", else "".
  readonly property string errorCode: _errorCode
  // The title of the playlist that is open, "" while a feed itself is
  // shown.
  readonly property string listTitle: _listTitle

  property string _kind: ""
  property string _status: "idle"
  property var _rows: []
  property string _errorCode: ""
  property string _listTitle: ""
  // What was fetched, by kind: { fetchedAt, rows }. The key is always one
  // of the constant kinds. An opened playlist is not kept.
  property var _cache: new Map()
  // Counts fetches. A call that finds another number than the one it was
  // started under has been superseded and says nothing.
  property int _gen: 0
  property int _ticket: 0
  property int _keys: 0
  readonly property bool _signedIn: signIn !== null && signIn.signedIn === true

  // Shows a feed: from memory when it was fetched a moment ago, else by
  // asking for it. Gives up a fetch that is still running, and leaves an
  // opened playlist. Returns false, and changes nothing, for anything that
  // is not a feed and while nobody is signed in.
  function select(kind: var): bool {
    if (!FeedUrls.isKind(kind) || !root._signedIn || root.signIn.hold === true) return false
    root._supersede()
    root._kind = kind
    root._listTitle = ""
    var kept = root._cache.get(kind)
    if (kept !== undefined && FeedUrls.isFresh(kept.fetchedAt, Date.now())) {
      root._show(kept.rows)
      return true
    }
    root._fetch(FeedUrls.url(kind), kind)
    return true
  }

  // The user chose a row, named by its key. For a video, returns its track,
  // for the service to play. For a playlist, starts reading that playlist
  // into rows and returns null. An unknown key returns null and changes
  // nothing.
  function openRow(key) {
    var row = null
    for (var i = 0; i < root._rows.length && row === null; i++) {
      if (root._rows[i].key === key) row = root._rows[i]
    }
    if (row === null) return null
    if (row.playlist !== true) {
      return { id: row.id, title: row.title, channel: row.channel, duration: row.duration, live: row.live }
    }
    var address = FeedUrls.playlistUrl(row.listId)
    if (address === "" || !root._signedIn || root.signIn.hold === true) return null
    root._supersede()
    root._listTitle = row.title
    root._fetch(address, "")
    return null
  }

  // Leaves an opened playlist for the list it was opened from.
  function closeList(): bool {
    if (root._listTitle === "" || root._kind === "") return false
    return root.select(root._kind)
  }

  // The user looks at something else: nothing is selected, and a fetch that
  // is still running is given up. What was fetched stays in memory for its
  // few minutes.
  function deselect(): void {
    root._supersede()
    root._kind = ""
    root._listTitle = ""
    root._rows = []
    root._errorCode = ""
    root._status = "idle"
  }

  // Forgets every list.
  function clear(): void {
    root._cache = new Map()
    root.deselect()
  }

  // Our paths, or null until the file layer has vouched for the private
  // directories.
  function _paths() {
    return root.fs !== null && root.fs.status === "ready" ? root.fs.paths : null
  }

  function _supersede() {
    root._gen += 1
    if (root._ticket !== 0 && root.signIn !== null) root.signIn.cancelSigned(root._ticket)
    root._ticket = 0
  }

  function _show(rows) {
    root._rows = rows
    root._errorCode = ""
    root._status = rows.length > 0 ? "rows" : "empty"
  }

  function _fail(code) {
    root._rows = []
    root._errorCode = code
    root._status = "error"
  }

  // Rows for the panel, built field by field from what the reader kept. A
  // playlist's id is only ever a value here, never a key: an id may be
  // spelled like the name of a member every object has.
  function _compose(parsed) {
    var rows = []
    for (var i = 0; i < parsed.tracks.length; i++) {
      var track = parsed.tracks[i]
      rows.push({
        key: ++root._keys, playlist: false, id: track.id, title: track.title, channel: track.channel,
        duration: track.duration, live: track.live
      })
    }
    for (var k = 0; k < parsed.playlists.length; k++) {
      var list = parsed.playlists[k]
      rows.push({ key: ++root._keys, playlist: true, listId: list.id, title: list.title, count: list.count })
    }
    return rows
  }

  // What yt-dlp printed for a feed, or for an opened playlist (kind "").
  function _read(kind, text) {
    if (kind !== "") return FeedUrls.parse(kind, text)
    var list = FeedUrls.parseList(text)
    return list.ok === true ? { ok: true, tracks: list.tracks, playlists: [] } : { ok: false }
  }

  // Asks for the list at address. kind is the feed it will be remembered
  // under, or "" for an opened playlist.
  function _fetch(address, kind) {
    var gen = root._gen
    root._rows = []
    root._errorCode = ""
    root._status = "loading"
    root._ticket = root.signIn.runSigned({
      tag: "feed",
      build: function(copy) { return FeedUrls.feedArgv(root.tools, root._paths(), copy) },
      stdin: address + "\n",
      timeoutSec: Const.TIMEOUTS.feed,
      maxBytes: Const.LIMITS.feedBytes,
      done: function(result, code) {
        // A newer selection owns the state now.
        if (gen !== root._gen) return
        root._ticket = 0
        // Stopped by someone else, or the login is no longer accepted: the
        // list must not be shown as loading for ever.
        if (result.error === "cancelled") { root.deselect(); return }
        if (code !== "") { root._fail(code); return }
        var parsed = result.ok ? root._read(kind, result.stdout) : { ok: false }
        if (parsed.ok !== true) { root._fail("E_FEED"); return }
        var rows = root._compose(parsed)
        if (kind !== "") root._cache.set(kind, { fetchedAt: Date.now(), rows: rows })
        root._show(rows)
      }
    })
  }

  // Signed out, by the user or by YouTube: nothing of the account stays in
  // memory.
  on_SignedInChanged: if (!root._signedIn) root.clear()
}
