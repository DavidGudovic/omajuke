import QtQuick
import "../lib/Const.js" as Const
import "../lib/Errors.js" as Errors
import "../lib/Queue.js" as Queue
import "../lib/Recover.js" as Recover
import "../lib/Track.js" as Track

// The playback orchestrator. It owns the queue, the recently played list,
// the current track and its error, and it decides what happens next: it
// asks the resolver for a track's streams, hands the answer to the player,
// follows what the player reports, recovers a track that broke off, skips
// one that cannot be played and, when the queue runs out, asks for related
// tracks to go on with.
//
// mpv is not given the whole queue. Its playlist holds the current item
// and, once they have been looked up, the items before and after it. That
// is what lets mpv go on without a gap and what makes the desktop's Next
// and Previous keys work; lib/Queue.js plans that window, and this
// component sends the steps and follows mpv when it moves by itself.
//
// It talks to the player, the resolver and the source of related tracks it
// is given and to nothing else: no socket, no process, no file. What mpv
// does is known here only through the player's signals, and a signal is
// acted on only when it fits what this component itself has in flight (see
// "intent" below).
Item {
  id: root

  // ---- Given by the service ----

  property var player: null
  property var resolver: null
  // The state store; only patch() is used.
  property var store: null
  // The typed settings. Only "autoplay" is read here.
  property var settings: null
  // Where related tracks come from: an object with mix(id, done), which
  // answers done({ ok, code, tracks }) once, with tracks a list of track
  // rows. Null switches autoplay off.
  property var mixer: null
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
  // The video ids started in this session, oldest first: what autoplay must
  // not bring back. Only so many are kept.
  property var _played: []
  readonly property int _playedMax: 5000

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

  // How many tracks in a row failed for good. A third one stops the queue:
  // by then the tracks are unlikely to be what is wrong.
  property int _failures: 0
  readonly property int _failuresMax: 3

  // The playlist mpv holds once it has carried out every step sent to it,
  // or null when nothing was sent since mpv last stopped. The player turns
  // a key into a playlist position through its own copy of that playlist,
  // and a copy that is behind (mpv has not reported yet, or reports the
  // state between two of our steps) would turn a step into a hit on
  // another entry, the playing one included. So a plan is made only from a
  // copy that shows exactly this, or one that has shown something else for
  // so long that nothing of ours can still be on its way.
  property var _expected: null
  // True while a plan is being sent, when the player may already report
  // the playlist changing under it.
  property bool _planning: false
  // The video the item after the current one is being looked up for.
  property string _preparing: ""

  // Autoplay. _mixSeed is the key of the item related tracks were last asked
  // for, so that one item is asked for once; _mixRequest tells the answer
  // that is awaited from one that was withdrawn; _mixResume says that the
  // item ended by itself while its answer was still awaited, so that the
  // first related track starts when it arrives.
  property int _mixSeed: 0
  property int _mixRequest: 0
  property bool _mixPending: false
  property bool _mixResume: false
  // How many items that autoplay added have failed since one of them last
  // played. After three, autoplay rests until the user plays something.
  property int _autoFailures: 0
  property bool _autoOff: false

  // A paused track is resumed in place while its stream grant can be
  // trusted. A grant lasts about six hours; from half an hour before that
  // the track is looked up again instead.
  readonly property int _resumeMaxAgeMs: 19800000
  // Previous goes back to the start of a track that has played for longer
  // than this, and to the item before it otherwise.
  readonly property int _restartAfterSec: 3

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
    var made = Queue.fromStored(saved.items, saved.index, root._nextKey)
    root._recents = recents
    if (made.ok !== true) return
    root._nextKey = made.nextKey
    root._list = { items: made.queue, index: made.index }
  }

  // Plays a row the panel hands back, as a queue of one.
  function playTrack(track: var): bool {
    var clean = Track.fromUi(track)
    return clean !== null && root._play(clean)
  }

  // Plays a video known by its id alone. Its title and length arrive with
  // the lookup; until then it counts as of unknown length.
  function playId(id: string): bool {
    var bare = root._bare(id)
    return bare !== null && root._play(bare)
  }

  // Adds a row at the end of the queue, and starts it when nothing plays.
  function enqueueTrack(track: var): bool {
    var clean = Track.fromUi(track)
    return clean !== null && root._enqueue(clean) === "ok"
  }

  // The same for a video known by its id alone. Answers "ok", "full" for a
  // queue at its limit, "invalid" for something that is no video id, and
  // "unavailable" while nothing may be started.
  function enqueueId(id: string): string {
    var bare = root._bare(id)
    return bare === null ? "invalid" : root._enqueue(bare)
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
        return root._startByUser(list.items, list.index, "ensure", Math.floor(root._position()))
      }
      root.player.setPause(false)
      return true
    }
    if (root.current === null) return false
    // The lookup that just failed is not trusted a second time.
    if (root._stage === "error") return root._startByUser(list.items, list.index, "refresh", 0)
    if (root._stage === "idle") return root._startByUser(list.items, list.index, "ensure", 0)
    return false
  }

  // Tries a video that needs a signed-in account once more, this time with
  // the saved login. Only the user's own request leads here, and only for
  // the track whose error says so: nothing else ever uses the account to
  // play something. The resolver hands that one lookup to whoever keeps
  // the login; neither it nor this component ever touches the login.
  function playWithAccount(): bool {
    var list = root._list
    if (root._stage !== "error" || root._errorCode !== "E_NEEDS_ACCOUNT") return false
    if (root.current === null) return false
    if (root.resolver === null || typeof root.resolver.refreshWithAccount !== "function") return false
    return root._startByUser(list.items, list.index, "account", 0)
  }

  function stop(): bool {
    if (root._stage === "idle") {
      // Nothing plays, but related tracks may still be on their way to go
      // on with. A stop says that they are not wanted.
      root._dropMix()
      return false
    }
    root._becomeIdle(true)
    return true
  }

  function next(): bool {
    var list = root._list
    var at = Queue.nextIndex(list.items, list.index)
    return at !== -1 && root._startByUser(list.items, at, "ensure", 0)
  }

  // Back to the start of a track that is well under way, as every player
  // does it; to the item before it otherwise, and to the start again when
  // there is none.
  function previous(): bool {
    var list = root._list
    if (root._stage === "started" && root._position() > root._restartAfterSec && root.seekTo(0)) return true
    var at = Queue.previousIndex(list.items, list.index)
    if (at !== -1) return root._startByUser(list.items, at, "ensure", 0)
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

  // Starts the queue item with this key, the one that is playing included:
  // that one begins again.
  function queuePlay(key: int): bool {
    var list = root._list
    var at = Queue.indexOfKey(list.items, key)
    return at !== -1 && root._startByUser(list.items, at, "ensure", 0)
  }

  // Takes an item out of the queue. Taking out the one that plays goes on
  // to the item after it, and stops when it was the last.
  function queueRemove(key: int): bool {
    var list = root._list
    var cut = Queue.remove(list.items, list.index, key)
    if (cut.ok !== true) return false
    if (!cut.wasCurrent) {
      root._setList(cut.queue, cut.index)
      root._window()
      return true
    }
    if (!root._attending()) {
      // Nothing plays. The item after it waits in its place, and an error
      // goes with the track it was about.
      root._errorCode = ""
      root._stage = "idle"
      root._setList(cut.queue, cut.successor)
      return true
    }
    if (cut.successor !== -1 && root._startByUser(cut.queue, cut.successor, "ensure", 0)) return true
    root._setList(cut.queue, -1)
    root._becomeIdle(true)
    return true
  }

  function queueMove(key: int, delta: int): bool {
    var list = root._list
    var moved = Queue.move(list.items, list.index, key, delta)
    if (moved.ok !== true) return false
    root._setList(moved.queue, moved.index)
    root._window()
    return true
  }

  // Empties the queue around the track that plays, which goes on. When
  // nothing plays the queue is emptied altogether.
  function queueClear() {
    var list = root._list
    if (!root._attending()) {
      root._errorCode = ""
      root._stage = "idle"
      root._setList([], -1)
      return
    }
    var kept = Queue.keepCurrent(list.items, list.index)
    root._setList(kept.queue, kept.index)
    root._window()
  }

  // Forgets what was played. The current track stays and keeps playing.
  function clearHistory() {
    var list = root._list
    var kept = Queue.keepCurrent(list.items, list.index)
    root._recents = []
    root._played = []
    root._list = { items: kept.queue, index: kept.index }
    // Whatever the history setting says: a list the user cleared must not
    // survive in the store's copy either.
    root._save(true)
    // The items beside it are gone, so mpv must not hold them either. And
    // the track that plays may be the last one now.
    root._plan()
    root._seedCurrent()
  }

  function dismissNotice() {
    root._noticeCode = ""
  }

  // The ids whose lookups must outlive a clean-up: the current item and
  // the items beside it, any of which mpv may open without asking.
  function keepIds() {
    return Queue.keepIds(root._list.items, root._list.index)
  }

  // ---- Starting ----

  function _mayStart() {
    return !root.hold && root.player !== null && root.resolver !== null
  }

  // A track of which only the video id is known.
  function _bare(id) {
    return Track.fromStored({ id: id, title: "", channel: "", duration: null, live: false })
  }

  function _play(track) {
    var item = Queue.item(track, root._nextKey, false)
    if (item === null || !root._mayStart()) return false
    root._nextKey += 1
    return root._startByUser([item], 0, "ensure", 0)
  }

  function _enqueue(track) {
    if (!root._mayStart()) return "unavailable"
    var list = root._list
    var added = Queue.append(list.items, list.index, track, root._nextKey, false)
    if (added.ok !== true) return added.code === "full" ? "full" : "invalid"
    root._nextKey += 1
    if (root._stage === "idle") {
      return root._startByUser(added.queue, added.queue.length - 1, "ensure", 0) ? "ok" : "unavailable"
    }
    root._setList(added.queue, added.index)
    root._window()
    return "ok"
  }

  // A start the user asked for, as opposed to one made here: a recovery,
  // a skip, the next track at the end of one, autoplay. It gets the whole
  // recovery again, and autoplay its three attempts.
  function _startByUser(items, index, lookup, startAt) {
    if (!root._mayStart()) return false
    root._last = null
    root._noticeCode = ""
    root._failures = 0
    root._autoFailures = 0
    root._autoOff = false
    root._mixResume = false
    return root._start(items, index, lookup, startAt)
  }

  // The one way playback begins: makes items[index] the current item and
  // asks for its streams. "lookup" says how: "ensure" takes a cached answer
  // when there is one, "refresh" always asks again, "account" asks again
  // with the saved login. startAt is where to begin, in whole seconds.
  // Whatever plays meanwhile keeps playing until the new file takes its
  // place.
  function _start(items, index, lookup, startAt) {
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
    // Everything but the track that plays leaves mpv's playlist at once, so
    // that mpv cannot go on by itself into a track the user just left.
    root._plan()
    // The answer never arrives inside the call, so everything above is in
    // place before it is looked at.
    var done = function(result) { root._resolved(request, result) }
    if (lookup === "account") root.resolver.refreshWithAccount(id, done)
    else if (lookup === "refresh") root.resolver.refresh(id, done)
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
      root._failed(root._code(answer.code, "E_YTDLP_FAILED"), false)
      return
    }
    var entry = answer.entry !== null && typeof answer.entry === "object" ? answer.entry : {}
    var track = Track.fromStored(entry.track)
    if (track === null || track.id !== item.id || typeof entry.file !== "string") {
      root._failed("E_BAD_OUTPUT", false)
      return
    }
    root._cached = answer.cached === true
    var known = root._adopt(item.key, track)
    root._intent = "load"
    root._stage = "loading"
    root.player.load(known.key, known.id, known.title, entry.file, {
      mode: "replace", startAt: known.live ? 0 : root._startAt, live: known.live
    })
    // A replacing load leaves mpv with this one entry.
    root._await([known.key])
  }

  // Takes over what a lookup knows about the item with this key: it knows
  // the track better than a search row does, and it is all that is known
  // about a track that was added by its id. Returns the item as it is now.
  // The window is not planned here; the caller does what comes next.
  function _adopt(key, track) {
    var list = root._list
    var named = Queue.withTrack(list.items, list.index, key, track)
    if (named.ok === true) {
      root._list = { items: named.queue, index: named.index }
      root._save(false)
    }
    return Queue.itemAt(root._list.items, Queue.indexOfKey(root._list.items, key))
  }

  // ---- The window mpv holds ----

  // The player's copy of mpv's playlist, as a list of our own.
  function _mirror() {
    var keys = root.player.entryKeys
    var copy = []
    if (keys === null || keys === undefined || typeof keys.length !== "number") return copy
    // One more than any queue holds is enough to see that it is too long.
    var end = Math.min(keys.length, Const.LIMITS.queueItems + 1)
    for (var i = 0; i < end; i++) copy.push(keys[i])
    return copy
  }

  function _same(a, b) {
    if (a.length !== b.length) return false
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  // Notes the playlist that what was just sent leads to, or with null
  // that mpv was stopped and holds nothing. From now on the timer bounds
  // the wait for the player's copy to show it.
  function _await(keys) {
    root._expected = keys
    if (keys === null) settleTimer.stop()
    else settleTimer.restart()
  }

  // The player's copy has not shown what was expected for as long as mpv
  // is given to answer: whatever it shows now is what mpv holds, changed
  // by something else or not, and the next plan starts from that.
  function _settleTimedOut() {
    root._expected = null
    root._plan()
  }

  // Brings mpv's playlist in step with the queue. Called whenever one of
  // the two may have changed; when nothing needs doing it does nothing.
  function _plan() {
    // In idle and in error there is no mpv. While a replacing load is on
    // its way, anything sent now would be wiped by it. And a plan that is
    // being sent deals with what its own steps change.
    if (!root._attending() || root._intent === "load" || root._planning) return
    // Between the end of one file and the start of the next the player is
    // on no track, while the item that ended is still the current one here.
    // A plan made in that gap would take that item for one that is being
    // started and remove its neighbour, which mpv is about to open. With
    // nothing of ours on its way the player's next report, the start of a
    // file or mpv going idle, comes here again.
    if (root._intent === "" && root.player.currentKey === 0) return
    var mirror = root._mirror()
    if (root._expected !== null) {
      if (!root._same(mirror, root._expected)) {
        if (!settleTimer.running) settleTimer.start()
        return
      }
      settleTimer.stop()
    }
    root._planning = true
    try {
      root._send(mirror)
    } finally {
      root._planning = false
    }
  }

  // Plans from this copy of mpv's playlist and sends the steps.
  function _send(mirror) {
    var list = root._list
    var ready = function(id) { return root.resolver.fresh(id) === true }
    var steps = Queue.plan(list.items, list.index, ready, mirror, root.player.currentKey)
    // Nothing is added before the current track has started: until then
    // mpv is to hold nothing it could move into.
    var mayAdd = root._stage === "started"
    var after = mirror.slice()
    var sent = false
    // Strictly in the order given: removals count from the back, and a
    // key may be removed and loaded again in one plan.
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i]
      if (step.op === "remove") {
        var at = after.indexOf(step.key)
        root.player.removeKey(step.key)
        if (at !== -1) after.splice(at, 1)
        sent = true
        continue
      }
      if (!mayAdd || root.player.holds(step.key)) continue
      var item = Queue.itemAt(list.items, Queue.indexOfKey(list.items, step.key))
      var entry = item === null ? null : root.resolver.entry(item.id)
      if (entry === null || typeof entry !== "object" || typeof entry.file !== "string") continue
      root.player.load(item.key, item.id, item.title, entry.file, {
        mode: step.mode, index: step.index, startAt: 0, live: item.live
      })
      if (step.mode === "insert-at") after.splice(step.index, 0, item.key)
      else after.push(item.key)
      sent = true
    }
    if (!sent) return
    root._await(after)
    // The player shows a step the moment it is handed one. Where its copy
    // already is what the steps lead to, there is nothing left to wait for.
    if (root._same(root._mirror(), after)) settleTimer.stop()
  }

  // Plans the window and has the item after the current one looked up, so
  // that it can join the window before it is needed. Where there is no item
  // after it, related tracks are asked for instead: the track that plays
  // may only now have become the last one.
  function _window() {
    root._plan()
    root._prepareNext()
    root._seedCurrent()
  }

  function _prepareNext() {
    if (root._stage !== "started" || !root._mayStart()) return
    var list = root._list
    var item = Queue.itemAt(list.items, Queue.nextIndex(list.items, list.index))
    if (item === null || root._preparing === item.id || root.resolver.fresh(item.id) === true) return
    var id = item.id
    var key = item.key
    root._preparing = id
    root.resolver.ensure(id, "next", function(result) { root._prepared(id, key, result) })
  }

  // The answer for the item after the current one. A failure is left
  // alone: the track gets its own attempt, and its own error, when its turn
  // comes.
  function _prepared(id, key, result) {
    if (root._preparing === id) root._preparing = ""
    var answer = result !== null && typeof result === "object" ? result : {}
    if (answer.ok !== true) return
    var entry = answer.entry !== null && typeof answer.entry === "object" ? answer.entry : {}
    var track = Track.fromStored(entry.track)
    if (track !== null) root._adopt(key, track)
    root._plan()
  }

  // ---- Autoplay ----

  function _autoplayOn() {
    return root.settings !== null && typeof root.settings === "object" && root.settings.autoplay === true
  }

  // The same as a property, so that a change of the setting is noticed.
  readonly property bool _autoplay: root._autoplayOn()

  // Asks about the track that plays, when it has started. Called whenever
  // it may have become the last of the queue: when it starts, when the
  // queue behind it is taken away, and when autoplay is switched on.
  function _seedCurrent() {
    var item = root.current
    if (root._stage === "started" && item !== null) root._seedMix(item)
  }

  // Asks for tracks related to an item that plays, when it is the last of
  // the queue. Once per item, however often it starts or is looked at.
  function _seedMix(item) {
    if (root.mixer === null || !root._autoplayOn() || root._autoOff || !root._mayStart()) return
    var list = root._list
    if (list.index !== list.items.length - 1 || root._mixSeed === item.key) return
    root._mixSeed = item.key
    root._mixRequest += 1
    root._mixPending = true
    root._mixResume = false
    var request = root._mixRequest
    var key = item.key
    var id = item.id
    // The track has only just started. Whatever goes wrong with this
    // question must not reach it.
    try {
      root.mixer.mix(id, function(result) { root._mixed(request, key, id, result) })
    } catch (error) {
      root._mixed(request, key, id, null)
    }
  }

  // A stop withdraws the question: its answer is not wanted any more, and
  // the item may be asked for again when it is played again.
  function _dropMix() {
    root._mixRequest += 1
    root._mixPending = false
    root._mixResume = false
    root._mixSeed = 0
  }

  // The related tracks arrived, or did not. Whatever goes wrong here costs
  // nothing: what plays is never touched, and nothing is said, because
  // nobody asked for this and many a video simply has no related tracks.
  // The queue then ends with the track that plays.
  function _mixed(request, key, id, result) {
    if (request !== root._mixRequest) return
    var resume = root._mixResume
    root._mixPending = false
    root._mixResume = false
    var answer = result !== null && typeof result === "object" ? result : {}
    if (answer.code === "cancelled") return
    // Switched off since the question was asked: nothing is added.
    if (!root._autoplayOn()) return
    var list = root._list
    var at = Queue.indexOfKey(list.items, key)
    // The item left the queue, or something was queued behind it in the
    // meantime: the queue is not running out, so there is nothing to add.
    // Should the item become the last one again, it is asked about again.
    if (at === -1 || at !== list.items.length - 1) {
      if (root._mixSeed === key) root._mixSeed = 0
      return
    }
    var added = answer.ok === true
      ? Queue.appendAuto(list.items, list.index, answer.tracks, root._played.concat([id]), root._nextKey)
      : { ok: false }
    if (added.ok !== true) return
    root._nextKey = added.nextKey
    root._setList(added.queue, added.index)
    // The item ended while its related tracks were on their way, and the
    // user has done nothing since: go on with the first of them.
    if (resume && root._stage === "idle") root._start(added.queue, at + 1, "ensure", 0)
    else root._window()
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
    // mpv moved by itself: a media key, the end of a track, a failed one.
    var index = Queue.indexOfKey(root._list.items, key)
    if (index === -1) {
      root._await(null)
      root.player.stopPlayback()
      return
    }
    root._errorCode = ""
    root._startAt = 0
    // Whatever mpv moves into was looked up when it joined the window, not
    // for this attempt.
    root._cached = true
    root._stage = "loading"
    if (index !== root._list.index) root._setList(root._list.items, index)
    root._endAnnounced()
    // The window follows: what lies two items back goes now, the new
    // neighbour is added once this track has started.
    root._plan()
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
    root._failures = 0
    // Only an item autoplay added says that its tracks can be played again.
    if (item.auto === true) root._autoFailures = 0
    root._remember(item)
    root._announced = item
    // With nothing behind this item, this also asks for related tracks.
    root._window()
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
      root._recover(fileError, true)
    } else if (reason === "eof") {
      // A live stream has no end to fall short of. One that stops once its
      // lookup has aged was cut off, not finished.
      if (item.live === true && !root.resolver.fresh(item.id)) root._recover(Recover.PREMATURE_EOF, true)
      else root._goOn()
    }
  }

  // The current track played to its end.
  function _goOn() {
    var list = root._list
    var key = list.items[list.index].key
    var next = Queue.itemAt(list.items, Queue.nextIndex(list.items, list.index))
    if (next === null) {
      var awaited = root._mixPending && root._mixSeed === key
      root._becomeIdle(false)
      root._mixResume = awaited
      return
    }
    // mpv holds the next track and starts it by itself; its report moves
    // the queue on. Otherwise the track was not ready in time and is
    // started like any other.
    if (root.player.holds(next.key)) return
    if (!root._start(list.items, list.index + 1, "ensure", 0)) root._becomeIdle(false)
    root._endAnnounced()
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
    else root._await(null)
  }

  function _onFailed(code) {
    if (root._stage === "idle") return
    root._enterError(root._code(code, "E_PLAYBACK"))
  }

  // mpv reported its playlist: the moment a plan that had to wait is made.
  function _onMirror() {
    root._plan()
  }

  // The stall watchdog fired: the stream has been buffering for as long
  // as it is given, which is treated like one that broke off.
  function _stalled() {
    if (root.status === "buffering") root._recover(Recover.PREMATURE_EOF, false)
  }

  // ---- Failing and stopping ----

  // Looks up what to do about the current track having failed, and does
  // it: one more attempt, or the rule for a track that failed for good.
  // "ended" says that mpv itself gave the file up, as opposed to a stream
  // that hangs.
  function _recover(fileError, ended) {
    var item = root.current
    var started = root._stage === "started"
    var position = started ? root._position() : root._startAt
    var decision = Recover.decide({
      key: item.key, fileError: fileError, started: started, cached: root._cached, live: item.live,
      position: position, last: root._last
    })
    if (decision.action !== "retry") {
      root._failed(decision.code, ended)
      return
    }
    root._last = { key: item.key, at: Math.floor(position) }
    // After a failed file mpv starts its next entry by itself; stopping
    // first keeps that from being heard or reported.
    root._await(null)
    root.player.stopPlayback()
    // A recovery is never the way around a hold.
    if (!root._start(root._list.items, root._list.index, "refresh", Math.max(0, decision.startAt))) {
      root._enterError("E_PLAYBACK")
    }
    root._endAnnounced()
  }

  // The current track failed for good. When the track itself is what is
  // wrong and another one follows, the queue goes on with a notice. When
  // the network, the tools or the service as a whole is what is wrong, or
  // nothing follows, or this is the third track in a row, it stops here.
  // "byMpv" says that mpv gave up the file it was playing and has not been
  // told to stop since.
  function _failed(code, byMpv) {
    var list = root._list
    var item = root.current
    var next = Queue.itemAt(list.items, Queue.nextIndex(list.items, list.index))
    root._failures += 1
    if (item !== null && item.auto === true) {
      root._autoFailures += 1
      if (root._autoFailures >= root._failuresMax) root._autoOff = true
    }
    if (!Errors.isSkipClass(code) || next === null || root._failures >= root._failuresMax) {
      root._enterError(code)
      return
    }
    root._noticeCode = "N_SKIPPED"
    if (byMpv && root.player.holds(next.key)) {
      // mpv is already on its way into the next entry, as it is after
      // every failed file. Its report moves the queue on; should it go
      // idle instead, that ends the wait.
      root._intent = ""
      root._stage = "loading"
      root._endAnnounced()
      return
    }
    // Nothing failed inside mpv, or mpv holds nothing to move into: it
    // will start nothing, so the next track is asked for here.
    if (!root._start(list.items, list.index + 1, "ensure", 0)) root._enterError(code)
    root._endAnnounced()
  }

  // In error nothing is audible and no mpv lingers. The current item
  // stays, so that playPause() can try it again.
  function _enterError(code) {
    if (root._intent === "resolve") root.resolver.cancelPlay()
    root._intent = ""
    root._errorCode = code
    root._stage = "error"
    root._await(null)
    root.player.shutdown()
    root._endAnnounced()
  }

  // The end of playing: after the last track, on stop(), or when mpv was
  // stopped from outside. "cancel" is the stop: it also withdraws a lookup
  // and the question for related tracks.
  function _becomeIdle(cancel) {
    root._intent = ""
    root._errorCode = ""
    root._stage = "idle"
    if (cancel) {
      root.resolver.cancelPlay()
      root._dropMix()
    }
    root._await(null)
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
    // Newest last, which is the end autoplay reads from.
    var played = root._played.filter(function(id) { return id !== item.id })
    played.push(item.id)
    root._played = played.length > root._playedMax ? played.slice(played.length - root._playedMax) : played
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
    function onEntryKeysChanged() { root._onMirror() }
  }

  // Runs only while the current track is buffering, and is started anew
  // each time it begins to.
  Timer {
    interval: Const.TIMEOUTS.stallMs
    running: root.status === "buffering"
    onTriggered: root._stalled()
  }

  // Autoplay was switched on or off while a track plays. On: the track may
  // be the last of the queue, and is asked about now instead of never. Off:
  // an answer that is still on its way is not wanted any more.
  on_AutoplayChanged: {
    if (root._autoplay) root._seedCurrent()
    else root._dropMix()
  }

  // Bounds the wait for mpv to report the playlist a plan leads to.
  Timer {
    id: settleTimer
    interval: Const.TIMEOUTS.replyMs
    onTriggered: root._settleTimedOut()
  }
}
