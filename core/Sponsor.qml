import QtQuick
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Segments.js" as Segments

// Sponsor skipping: asks a public database which stretches of the playing
// track are sponsor reads and the like, and jumps over them. It owns the
// question whether the user wants that at all, the one lookup a track gets,
// the segments of the track that plays, and every automatic skip.
//
// Three things hold whatever happens. Nothing is asked of the database
// before the user said yes: the lookup tells its operator which hundred or
// so videos the playing one is among. Playback never waits for an answer
// and never suffers from one: a lookup that fails, is late or says nonsense
// means that nothing is skipped, and nothing is shown about it. And a skip
// only ever moves forward, by the rules of lib/Segments.js, which believes
// nothing the answer says without checking it against the track.
Item {
  id: root

  // ---- Given by the service ----

  // The process runner, the tool table (replaced only by tests) and the
  // file layer, whose paths the environment of a network job is made from.
  property var runner: null
  property var tools: Const.TOOLS
  property var fs: null
  // The typed settings. Only sponsorSkip is read: "ask", "on" or "off".
  property var settings: null
  // The player: position, duration and currentKey are read, positionNow()
  // is asked and seek() is called.
  property var player: null
  // The playback orchestrator: its trackStarted and trackEnded say which
  // track plays, and next() is called when a segment reaches the end of one.
  property var playback: null
  // True while no picture is shown. Talk in a music video is skipped only
  // then: with the picture on, it belongs to the video.
  property bool videoHidden: true

  // ---- What the service re-exports ----

  // True while the user is being asked whether segments should be skipped.
  // Raised once, by the first track that starts while the setting says
  // "ask", and it stays until it is answered.
  readonly property bool prompt: _prompt && _mode === "ask"
  // { category, from, to } of the skip that just happened, for a note in
  // the panel; null again a few seconds later.
  readonly property var lastSkip: _lastSkip
  // True while a segment lies ahead: the service has the player report the
  // position for as long, whether or not a panel is looking at it.
  readonly property bool watching: _watching

  // ---- Private ----

  readonly property string _mode: {
    var settings = root.settings
    return settings && typeof settings.sponsorSkip === "string" ? settings.sponsorSkip : ""
  }
  readonly property real _position: root.player ? root.player.position : 0
  readonly property real _duration: root.player ? root.player.duration : 0

  // How long a skip is shown, and for how long after a skip the player is
  // watched for having gone back instead of forward.
  readonly property int _noteMs: 5000
  readonly property int _settleMs: 2000

  property bool _prompt: false
  property bool _prompted: false
  property var _lastSkip: null
  property bool _watching: false

  // { id, key } of the track between its start and its end, or null.
  property var _track: null
  property real _startedAt: 0
  // Counts tracks and whatever else makes an answer stale. A lookup that
  // finds another number than the one it was started under is dropped.
  property int _gen: 0
  property int _job: 0
  // True once this start of the track had its lookup: there is no second.
  property bool _lookedUp: false
  // The answer for the track, "" for none. It is kept for as long as the
  // track lasts, because which of its segments count depends on the length
  // of the track and on the picture, and both can change while it plays.
  property string _body: ""
  // The stretches to skip, from Segments.pick, and one mark per stretch.
  property var _segments: []
  property var _fired: []
  // When the last automatic skip was made, on the clock, in milliseconds.
  property real _actedAt: 0
  // { from, at } of the last automatic seek within this track, or null.
  property var _jump: null
  // True once a skip was made in this track.
  property bool _skipped: false
  // True when skipping was given up for this track.
  property bool _givenUp: false
  // Tracks in a row that a skip ended right after they began (see the
  // cascade breaker in lib/Segments.js).
  property int _cascade: 0

  // ---- Signals ----

  // The user answered the question. The service stores the answer as the
  // setting, which is what switches skipping on or off here.
  signal answered(bool enable)

  // ---- Requests ----

  function answer(enable: bool) {
    if (!root.prompt) return
    root._prompt = false
    root.answered(enable === true)
  }

  // The user did something with playback. Skipping that was switched off by
  // a run of tracks ending right after they began is on again.
  function userActed() {
    root._cascade = 0
    root._step()
  }

  // ---- The track ----

  function _began(item) {
    root._forget()
    var id = item !== null && typeof item === "object" && typeof item.id === "string" ? item.id : ""
    if (id === "") return
    root._track = { id: id, key: typeof item.key === "number" ? item.key : 0 }
    root._startedAt = Date.now()
    if (root._mode === "ask" && !root._prompted) {
      root._prompted = true
      root._prompt = true
    }
    root._lookUp()
  }

  function _ended() {
    if (root._track === null) return
    root._cascade = Segments.cascade(root._cascade, root._skipped, Date.now() - root._startedAt)
    root._forget()
  }

  // Nothing of the last track is left, and nothing that is still on its way
  // for it is taken.
  function _forget() {
    root._gen += 1
    root._cancel()
    root._track = null
    root._lookedUp = false
    root._body = ""
    root._segments = []
    root._fired = []
    root._jump = null
    root._skipped = false
    root._givenUp = false
    root._watching = false
  }

  function _cancel() {
    if (root._job !== 0 && root.runner !== null) root.runner.cancel(root._job)
    root._job = 0
  }

  // ---- The lookup ----

  // One request per start of a track, and none unless the user said yes.
  // Whatever is missing for it, the track simply plays without skips.
  function _lookUp() {
    var track = root._track
    if (track === null || root._mode !== "on" || root._lookedUp) return
    var paths = root.fs !== null && root.fs.status === "ready" ? root.fs.paths : null
    var argv = Segments.argv(root.tools)
    var address = Segments.config(track.id)
    var env = Env.net(paths)
    if (root.runner === null || argv.length === 0 || address === "" || env === null) return
    root._lookedUp = true
    var gen = root._gen
    root._job = root.runner.run({
      tag: "sponsor",
      argv: argv,
      // The address names a bucket of videos, not the video, and travels on
      // standard input: no command line holds it.
      stdin: address,
      timeoutSec: Const.TIMEOUTS.sponsor,
      maxBytes: Segments.MAX_BYTES,
      env: env,
      done: function(result) { root._answered(gen, result) }
    })
  }

  // The lookup has ended. A failure of any kind reads as "no segments":
  // there is no second try, and nothing to tell the user.
  function _answered(gen, result) {
    if (gen !== root._gen) return
    root._job = 0
    if (result === null || typeof result !== "object" || result.error === "cancelled") return
    root._body = Segments.reply(result)
    root._pick()
  }

  // Works out the stretches to skip from the answer and from what is known
  // about the track right now. A list that came out the same keeps its
  // marks, so that a stretch the user went back into to hear stays quiet.
  function _pick() {
    var track = root._track
    var usable = track !== null && root._body !== "" && root._mode === "on"
    var list = usable ? Segments.pick(root._body, track.id, root._duration, root.videoHidden) : []
    if (JSON.stringify(list) !== JSON.stringify(root._segments)) {
      root._segments = list
      root._fired = []
    }
    root._step()
  }

  // ---- Skipping ----

  // The position, as well as the player can tell it at this moment. Its
  // position property is fresh only while positions are being reported.
  function _where() {
    var player = root.player
    var now = typeof player.positionNow === "function" ? Number(player.positionNow()) : NaN
    return isFinite(now) ? now : root._position
  }

  // True while skips may be made at all: a track of ours is the one the
  // player is on, it has segments, and nothing has switched skipping off.
  function _armed() {
    var track = root._track
    var player = root.player
    if (track === null || player === null || root._segments.length === 0) return false
    if (root._mode !== "on" || root._givenUp || Segments.tripped(root._cascade)) return false
    return track.key === 0 || player.currentKey === track.key
  }

  // Looks at the position and skips if a segment begins there. Called for
  // every position the player reports and whenever the segments changed.
  function _step() {
    if (!root._armed()) {
      root._watching = false
      return
    }
    var pos = root._where()
    var now = Date.now()
    var jump = root._jump
    if (jump !== null && now - jump.at < root._settleMs && pos < jump.from) {
      // The player answered a skip by going back to before the segment. It
      // would be sent forward again each time it came round, so skipping is
      // given up for this track.
      root._givenUp = true
      root._watching = false
      return
    }
    var step = Segments.next(pos, root._segments, root._fired)
    if (step.action === "none") {
      root._fired = step.fired
    } else if (step.to > pos && Segments.mayAct(now, root._actedAt)) {
      root._fired = step.fired
      root._actedAt = now
      root._act(step, now)
    }
    // Otherwise a skip is due and may not be made yet: the marks stay, and
    // the segment comes up again with the next position.
    //
    // Acting may have moved the position or ended the track, so what is
    // still ahead is asked last, from scratch.
    root._watching = root._armed() && Segments.pending(root._where(), root._segments, root._fired)
  }

  function _act(step, now) {
    if (step.action === "seek") {
      root._skipped = true
      root._jump = { from: step.skip.from, at: now }
      root._show(step.skip)
      root.player.seek(step.to)
      return
    }
    // The segment reaches the end of the track: on to the next one. The
    // track may end inside that call, and counts as skipped when it does.
    // With no track to go on to, the end of this one is simply played.
    var gen = root._gen
    var before = root._skipped
    root._skipped = true
    var moved = root.playback !== null && root.playback.next() === true
    if (moved) root._show(step.skip)
    else if (gen === root._gen) root._skipped = before
  }

  function _show(skip) {
    root._lastSkip = { category: skip.category, from: skip.from, to: skip.to }
    noteTimer.restart()
  }

  // ---- Wiring ----

  on_ModeChanged: {
    // Changing the setting is the user doing something.
    root._cascade = 0
    // Switched on while a track plays (the answer to the question, mostly):
    // that track gets its lookup now. Switched off: an answer that is still
    // on its way is no longer wanted.
    if (root._mode === "on") root._lookUp()
    else root._cancel()
    root._pick()
  }
  on_PositionChanged: root._step()
  on_DurationChanged: root._pick()
  onVideoHiddenChanged: root._pick()

  Connections {
    target: root.playback
    ignoreUnknownSignals: true

    function onTrackStarted(item) { root._began(item) }
    function onTrackEnded(item) { root._ended() }
  }

  Timer {
    id: noteTimer
    interval: root._noteMs
    onTriggered: root._lastSkip = null
  }
}
