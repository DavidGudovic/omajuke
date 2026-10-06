import QtQuick
import "../lib/Const.js" as Const
import "../lib/Errors.js" as Errors
import "../lib/Recover.js" as Recover
import "../lib/Track.js" as Track

// The playback orchestrator. It owns the queue, the recently played list,
// the current track and its error, and it decides what happens next: it
// asks the resolver for a track's streams, hands the answer to the player,
// follows what the player reports and recovers a track that broke off.
//
// It talks to the player and the resolver it is given and to nothing else:
// no socket, no process, no file. What mpv does is known here only through
// the player's signals, and a signal is acted on only when it fits what
// this component itself has in flight (see "intent" below).
Item {
  id: root

  // ---- Given by the service ----

  property var player: null
  property var resolver: null
  // The state store; only patch() is used.
  property var store: null
  // The typed settings. Nothing is read from them yet: no setting changes
  // how a single track is played.
  property var settings: null
  // True while the user wants history kept on disk.
  property bool persistHistory: false
  // True while nothing may be started: before start-up has finished, while
  // a tool is missing, while the proxy notice waits for its answer.
  property bool hold: true

  // ---- What the service re-exports ----

  // idle, resolving, loading, playing, paused, buffering or error.
  readonly property string status: _stage === "started" ? _phase : _stage
  // Queue items: a track plus "key" (a number that names this insertion for
  // as long as the service lives) and "auto". A new array on every change.
  readonly property var queue: _list.items
  readonly property int queueIndex: _list.index
  readonly property var current: _list.index >= 0 && _list.index < _list.items.length
    ? _list.items[_list.index] : null
  // Tracks, most recent first, each id once.
  readonly property var recents: _recents
  // The error of the current track, or "".
  readonly property string errorCode: _errorCode
  readonly property string noticeCode: _noticeCode

  // ---- Private ----

  // Where the current item is on its way to being heard: "idle",
  // "resolving" (its streams are being looked up), "loading" (handed to the
  // player), "started" (the player plays, pauses or buffers it) or "error".
  property string _stage: "idle"
  // While started: the last of playing, paused and buffering the player
  // reported. Its other phases belong to the moments between two files,
  // which the signals describe better.
  property string _phase: "buffering"
  readonly property var _phases: ["playing", "paused", "buffering"]

  // What of ours is pending, which is what tells mpv's own moves from the
  // echo of a request made here:
  //   ""         nothing: whatever mpv does next, mpv or a media key decided
  //   "resolve"  a lookup for the current item is running
  //   "load"     the player was told to load the current item and has not
  //              reported that file yet
  property string _intent: ""

  // The queue and the position in it, replaced together so that nothing
  // ever sees a new list with an old position.
  property var _list: ({ items: [], index: -1 })
  property var _recents: []
  property string _errorCode: ""
  property string _noticeCode: ""
  property int _nextKey: 1

  // Counts start requests, so that the answer to an earlier one can be
  // told from the answer to the latest.
  property int _request: 0
  // Where the load in flight begins, in whole seconds.
  property int _startAt: 0
  // True when the lookup the current item plays from was made before this
  // attempt. An address that fails to open is then worth a new lookup; one
  // that was looked up for this very attempt is not.
  property bool _cached: false
  // { key, at } of the last recovery, or null. A request by the user clears
  // it, so that every manual attempt gets the whole recovery again.
  property var _last: null
  // The item whose start was announced with trackStarted and whose end has
  // not been announced yet.
  property var _announced: null
  // True when the lists changed while history was off, so that the store
  // has an older copy.
  property bool _unsaved: false

  // A paused track is resumed in place while its stream grant can be
  // trusted. A grant lasts about six hours; from half an hour before that
  // the track is looked up again instead.
  readonly property int _resumeMaxAgeMs: 19800000

  // Each start is followed by exactly one end, whatever ends the file:
  // its own end, a stop, a failure, a recovery, the next track.
  signal trackStarted(var item)
  signal trackEnded(var item)

  // ---- Requests ----

  // Puts back the lists the state file held. Nothing starts: a restored
  // track waits for playPause().
  function restore(values: var) {
    if (root._stage !== "idle" || values === null || typeof values !== "object") return
    var recents = []
    var seen = new Map()
    var stored = Array.isArray(values.recents) ? values.recents : []
    for (var i = 0; i < stored.length && recents.length < Const.LIMITS.recents; i++) {
      var track = Track.fromStored(stored[i])
      if (track === null || seen.has(track.id)) continue
      seen.set(track.id, true)
      recents.push(track)
    }
    var saved = values.queue !== null && typeof values.queue === "object" ? values.queue : {}
    var rows = Array.isArray(saved.items) ? saved.items : []
    var items = []
    var index = -1
    for (var k = 0; k < rows.length && items.length < Const.LIMITS.queueItems; k++) {
      var row = Track.fromStored(rows[k])
      if (row === null) continue
      if (k === saved.index) index = items.length
      items.push(root._item(row, root._newKey(), rows[k].auto === true))
    }
    root._recents = recents
    root._list = { items: items, index: index }
  }

  // Plays a row the panel hands back, as a queue of one.
  function playTrack(track: var): bool {
    var clean = Track.fromUi(track)
    return clean !== null && root._play(clean)
  }

  // Plays a video known by its id alone. Its title and length arrive with
  // the lookup; until then it counts as of unknown length.
  function playId(id: string): bool {
    var bare = Track.fromStored({ id: id, title: "", channel: "", duration: null, live: false })
    return bare !== null && root._play(bare)
  }

  function playPause(): bool {
    var list = root._list
    if (root._stage === "started") {
      if (root._phase !== "paused") {
        root.player.setPause(true)
        return true
      }
      // After a long pause the stream may no longer open where it stopped:
      // look the track up again and load it at the same place.
      if (root._grantAged(root.current.id)) {
        return root._startByUser(list.items, list.index, false, Math.floor(root._position()))
      }
      root.player.setPause(false)
      return true
    }
    if (root.current === null) return false
    // The lookup that just failed is not trusted a second time.
    if (root._stage === "error") return root._startByUser(list.items, list.index, true, 0)
    if (root._stage === "idle") return root._startByUser(list.items, list.index, false, 0)
    return false
  }

  function stop(): bool {
    if (root._stage === "idle") return false
    root._becomeIdle(true)
    return true
  }

  // One track at a time: there is nothing to go on to, and going back
  // means starting this track again.
  function next(): bool {
    return false
  }

  function previous(): bool {
    return root.seekTo(0)
  }

  function seekTo(seconds: real): bool {
    var item = root.current
    if (root._stage !== "started" || item === null || item.live === true) return false
    var length = root.player.duration
    if (!(length > 0) || !isFinite(seconds)) return false
    root.player.seek(Math.max(0, Math.min(seconds, Math.max(0, length - 1))))
    return true
  }

  // Forgets what was played. The current track stays and keeps playing.
  function clearHistory() {
    var item = root.current
    root._recents = []
    root._list = { items: item === null ? [] : [item], index: item === null ? -1 : 0 }
    // Whatever the history setting says: a list the user cleared must not
    // survive in the store's copy either.
    root._save(true)
  }

  function dismissNotice() {
    root._noticeCode = ""
  }

  // The ids whose lookups must outlive a clean-up: the track that is
  // loading or playing reads its file again when mpv reopens it.
  function keepIds() {
    var item = root.current
    return item === null ? [] : [item.id]
  }

  // ---- Starting ----

  function _mayStart() {
    return !root.hold && root.player !== null && root.resolver !== null
  }

  function _play(track) {
    return root._startByUser([root._item(track, root._newKey(), false)], 0, false, 0)
  }

  // A start the user asked for, as opposed to a recovery made here.
  function _startByUser(items, index, again, startAt) {
    if (!root._mayStart()) return false
    root._last = null
    root._noticeCode = ""
    return root._start(items, index, again, startAt)
  }

  // The one way playback begins: makes items[index] the current item and
  // asks for its streams. "again" asks for a new lookup even when an
  // answer is cached; startAt is where to begin, in whole seconds. Whatever
  // plays meanwhile keeps playing until the new file takes its place.
  function _start(items, index, again, startAt) {
    if (!root._mayStart()) return false
    if (root._intent === "resolve") root.resolver.cancelPlay()
    root._request += 1
    var request = root._request
    var id = items[index].id
    root._errorCode = ""
    root._intent = "resolve"
    root._startAt = startAt
    root._stage = "resolving"
    root._setList(items, index)
    // The answer never arrives inside the call, so everything above is in
    // place before it is looked at.
    var done = function(result) { root._resolved(request, result) }
    if (again) root.resolver.refresh(id, done)
    else root.resolver.ensure(id, "play", done)
    return true
  }

  // The answer of a lookup. It is used once, and only while it is awaited:
  // not when another request, a stop or a failure came in between.
  function _resolved(request, result) {
    if (request !== root._request || root._intent !== "resolve") return
    var answer = result !== null && typeof result === "object" ? result : {}
    var item = root.current
    root._intent = ""
    if (answer.ok !== true) {
      root._enterError(root._code(answer.code, "E_YTDLP_FAILED"))
      return
    }
    var entry = answer.entry !== null && typeof answer.entry === "object" ? answer.entry : {}
    var track = Track.fromStored(entry.track)
    if (track === null || track.id !== item.id || typeof entry.file !== "string") {
      root._enterError("E_BAD_OUTPUT")
      return
    }
    root._cached = answer.cached === true
    // The lookup knows the track better than a search row does, and it is
    // all that is known about a track that was started by its id.
    var known = root._item(track, item.key, item.auto)
    var items = root._list.items.slice()
    items[root._list.index] = known
    root._list = { items: items, index: root._list.index }
    root._save(false)
    root._intent = "load"
    root._stage = "loading"
    root.player.load(known.key, known.id, known.title, entry.file, {
      mode: "replace", startAt: known.live ? 0 : root._startAt, live: known.live
    })
  }

  // ---- What the player reports ----

  // In idle and in error the player has been shut down, and a line from an
  // mpv on its way out must never bring playback back to life.
  function _attending() {
    return root._stage !== "idle" && root._stage !== "error"
  }

  function _onLoading(key) {
    if (!root._attending()) return
    var item = root.current
    if (root._intent === "load" && item !== null && key === item.key) {
      root._intent = ""
      root._stage = "loading"
      root._endAnnounced()
      return
    }
    // A lookup or a load of ours is on its way and replaces whatever mpv
    // has just begun.
    if (root._intent !== "") return
    // mpv moved by itself: a media key, or its own playlist.
    var index = root._indexOf(key)
    if (index === -1) {
      root.player.stopPlayback()
      return
    }
    root._errorCode = ""
    root._startAt = 0
    // Whatever mpv moves into was looked up when it was handed over, not
    // for this attempt.
    root._cached = true
    root._stage = "loading"
    if (index !== root._list.index) root._setList(root._list.items, index)
    root._endAnnounced()
  }

  function _onStarted(key) {
    var item = root.current
    if (root._stage !== "loading" || item === null || key !== item.key) return
    // A start also says that the file was reported, should that report
    // have gone missing.
    root._intent = ""
    // Nothing is known to be audible until the player says so.
    root._phase = root._phases.indexOf(root.player.phase) !== -1 ? root.player.phase : "buffering"
    root._stage = "started"
    root._remember(item)
    root._announced = item
    root.trackStarted(item)
  }

  function _onPhase() {
    if (root._phases.indexOf(root.player.phase) !== -1) root._phase = root.player.phase
  }

  function _onEnded(key, reason, fileError) {
    var item = root.current
    // The old file of a replace may still end while the new one is on its
    // way; only the end of the file that is current counts.
    if (root._intent !== "" || item === null || key !== item.key) return
    if (root._stage !== "loading" && root._stage !== "started") return
    if (reason === "error") {
      root._recover(fileError)
    } else if (reason === "eof") {
      // A live stream has no end to fall short of. One that stops once its
      // lookup has aged was cut off, not finished.
      if (item.live === true && !root.resolver.fresh(item.id)) {
        root._recover(Recover.PREMATURE_EOF)
      } else {
        root._becomeIdle(false)
      }
    }
  }

  function _onIdle() {
    // With something of ours pending, mpv is only idle between two of our
    // own steps. Without, somebody else stopped it.
    if (!root._attending() || root._intent !== "") return
    root._becomeIdle(true)
  }

  function _onExited(crashed) {
    if (root._stage === "idle") return
    if (crashed) {
      root._enterError("E_MPV_EXITED")
      return
    }
    // Asked to quit by a media control. With nothing of ours pending that
    // is a stop; a start that is pending simply gets a new mpv.
    if (root._intent === "") root._becomeIdle(true)
  }

  function _onFailed(code) {
    if (root._stage === "idle") return
    root._enterError(root._code(code, "E_PLAYBACK"))
  }

  // The stall watchdog fired: the stream has been buffering for as long
  // as it is given, which is treated like one that broke off.
  function _stalled() {
    if (root.status === "buffering") root._recover(Recover.PREMATURE_EOF)
  }

  // ---- Failing and stopping ----

  // Looks up what to do about the current track having failed, and does
  // it: one more attempt, or the error.
  function _recover(fileError) {
    var item = root.current
    var started = root._stage === "started"
    var position = started ? root._position() : root._startAt
    var decision = Recover.decide({
      key: item.key, fileError: fileError, started: started, cached: root._cached, live: item.live,
      position: position, last: root._last
    })
    if (decision.action !== "retry") {
      root._enterError(decision.code)
      return
    }
    root._last = { key: item.key, at: Math.floor(position) }
    // After a failed file mpv starts its next entry by itself; stopping
    // first keeps that from being heard or reported.
    root.player.stopPlayback()
    // A recovery is never the way around a hold.
    if (!root._start(root._list.items, root._list.index, true, Math.max(0, decision.startAt))) {
      root._enterError("E_PLAYBACK")
    }
    root._endAnnounced()
  }

  // In error nothing is audible and no mpv lingers. The current item
  // stays, so that playPause() can try it again.
  function _enterError(code) {
    if (root._intent === "resolve") root.resolver.cancelPlay()
    root._intent = ""
    root._errorCode = code
    root._stage = "error"
    root.player.shutdown()
    root._endAnnounced()
  }

  // The end of playing: after the last track, on stop(), or when mpv was
  // stopped from outside. "cancel" also withdraws a lookup, as a stop does.
  function _becomeIdle(cancel) {
    root._intent = ""
    root._errorCode = ""
    root._stage = "idle"
    if (cancel) root.resolver.cancelPlay()
    root.player.shutdown()
    root._setList(root._list.items, -1)
    root._endAnnounced()
  }

  function _endAnnounced() {
    var item = root._announced
    if (item === null) return
    root._announced = null
    root.trackEnded(item)
  }

  // ---- Small helpers ----

  function _indexOf(key) {
    var items = root._list.items
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key) return i
    }
    return -1
  }

  function _position() {
    var seconds = root.player.positionNow()
    return typeof seconds === "number" && isFinite(seconds) && seconds > 0 ? seconds : 0
  }

  function _grantAged(id) {
    var entry = root.resolver.entry(id)
    if (entry === null || typeof entry !== "object" || typeof entry.resolvedAt !== "number") return false
    return Date.now() - entry.resolvedAt > root._resumeMaxAgeMs
  }

  // A code without a sentence would leave the panel with an empty error
  // line, so one that is not in the table becomes the fallback.
  function _code(code, fallback) {
    var known = typeof code === "string" && Object.prototype.hasOwnProperty.call(Errors.TEXT, code)
    return known ? code : fallback
  }

  // ---- The lists ----

  // The five fields of a track, as a fresh object.
  function _trackOf(source) {
    return {
      id: source.id, title: source.title, channel: source.channel, duration: source.duration,
      live: source.live
    }
  }

  // A queue item: the track, the key of this insertion, and whether the
  // user or the plugin put it there.
  function _item(track, key, auto) {
    var item = root._trackOf(track)
    item.key = key
    item.auto = auto
    return item
  }

  function _newKey() {
    var key = root._nextKey
    root._nextKey += 1
    return key
  }

  // Changes the queue or the position in it, tells the resolver which
  // lookups are still needed and hands the lists to the store.
  function _setList(items, index) {
    if (items === root._list.items && index === root._list.index) return
    root._list = { items: items, index: index }
    root.resolver.retain(root.keepIds())
    root._save(false)
  }

  function _remember(item) {
    var list = [root._trackOf(item)]
    for (var i = 0; i < root._recents.length && list.length < Const.LIMITS.recents; i++) {
      if (root._recents[i].id !== item.id) list.push(root._recents[i])
    }
    root._recents = list
    root._save(false)
  }

  // Hands the lists to the store, which writes them a moment later. While
  // history is off the store is told nothing, so that what is played then
  // is not even in its copy; "always" is for clearing.
  function _save(always) {
    if (root.store === null) return
    if (!root.persistHistory && !always) {
      root._unsaved = true
      return
    }
    root._unsaved = false
    // A key means something only while this service lives, so it stays here.
    var items = root._list.items.map(function(item) {
      var stored = root._trackOf(item)
      stored.auto = item.auto
      return stored
    })
    root.store.patch({ recents: root._recents.slice(), queue: { items: items, index: root._list.index } })
  }

  // History was switched on: the store's copy of the lists dates from
  // before it was off. Nothing is handed over when nothing changed, so
  // start-up, where this turns true once, causes no write.
  onPersistHistoryChanged: {
    if (root.persistHistory && root._unsaved) root._save(false)
  }

  Connections {
    target: root.player
    function onLoading(key) { root._onLoading(key) }
    function onStarted(key) { root._onStarted(key) }
    function onEnded(key, reason, fileError) { root._onEnded(key, reason, fileError) }
    function onIdle() { root._onIdle() }
    function onExited(crashed) { root._onExited(crashed) }
    function onFailed(code) { root._onFailed(code) }
    function onPhaseChanged() { root._onPhase() }
  }

  // Runs only while the current track is buffering, and is started anew
  // each time it begins to.
  Timer {
    interval: Const.TIMEOUTS.stallMs
    running: root.status === "buffering"
    onTriggered: root._stalled()
  }
}
