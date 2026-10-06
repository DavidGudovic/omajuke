import QtQuick
import "../lib/Const.js" as Const
import "../lib/MpvArgs.js" as MpvArgs
import "../lib/MpvProto.js" as MpvProto
import "../lib/PlayerState.js" as PlayerState

// The player: mpv as the rest of the service sees it. It owns the mpv
// process and the socket to it, and turns the two into playback facts and
// commands that speak of track keys, never of mpv's own playlist entries.
//
// Three things are decided here and nowhere else. Which playlist entry of
// mpv belongs to which track: an entry the service did not create is never
// adopted, it is stopped. What mpv may be told: only commands the builders
// of lib/MpvProto.js return, with every value checked and clamped there.
// And how long a track may take to start: one watchdog bounds every load.
// What a line from mpv means is worked out by lib/PlayerState.js; this file
// feeds it one line at a time and acts on the answer.
Item {
  id: root

  // ---- Given by the service ----

  // The tool table (replaced only by tests), and the file layer, for its
  // paths and for whether the MPRIS script is there. No file job is ever
  // started from here.
  property var tools: null
  property var fs: null
  // The saved volume and mute. They are taken over whenever no mpv is
  // connected; a connected mpv has the last word on both.
  property int startVolume: 70
  property bool startMuted: false
  // Bound to the setting of that name.
  property bool evenVolume: false

  // ---- Playback facts ----

  // "off", "starting", "running" or "stopping".
  readonly property string mpvState: mpvProcess.runState
  // "idle", "loading", "playing", "paused" or "buffering". "idle" also
  // between the end of one track and the start of the next.
  readonly property string phase: _facts.phase
  // The track mpv is on, 0 for none.
  readonly property int currentKey: _facts.key
  readonly property bool hasFile: mpvState === "running" && _facts.key !== 0
  // The last position mpv told, in seconds. It follows mpv closely only
  // while the position is watched; positionNow() estimates in between.
  readonly property real position: _position
  // 0 when unknown, and for a live stream.
  readonly property real duration: _facts.duration
  readonly property int volume: _volume
  readonly property bool muted: _muted

  // ---- Private ----

  // A smaller change of the reported position is not passed on: mpv
  // reports about eleven times a second while it is watched.
  readonly property real _positionStep: 0.25
  readonly property string _sockPath: {
    var paths = root.fs ? root.fs.paths : null
    return paths && paths.ok === true && typeof paths.sock === "string" ? paths.sock : ""
  }

  property var _facts: PlayerState.initial()
  property real _position: 0
  property int _volume: 70
  property bool _muted: false
  // The volume mpv was started with. A change made while it was starting
  // is sent after it.
  property int _launchVolume: 70
  // Own volume and mute requests whose answer is still due. While one is,
  // mpv's reports of that value are older than what was asked for, and are
  // not taken.
  property int _volumeDue: 0
  property int _muteDue: 0
  property bool _watching: false
  property bool _durationObserved: false

  // The socket is up and the handshake has been sent.
  property bool _ready: false
  // This mpv was told to go: nothing about its exit is reported.
  property bool _quitting: false

  // mpv's playlist entry id -> { key, live }, for the entries we created
  // and mpv still holds.
  property var _entries: new Map()
  // Entries with a smaller id are dead: replaced or stopped before mpv got
  // to them. mpv's entry ids only grow.
  property int _floor: 0
  // The highest entry id seen from this mpv, ours or not.
  property int _lastEntry: 0
  // Bumped whenever everything is forgotten: a stop, a shutdown, an mpv
  // that went away. An answer to a load that was sent in an older
  // generation names a dead entry.
  property int _gen: 0
  // The key of our last replacing load that was written to the socket and
  // has not started yet, 0 for none.
  property int _awaiting: 0
  // Loads accepted while no mpv was connected: { command, key, mode, live }.
  property var _outbox: []
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // ---- Signals ----

  // mpv began to open one of our entries.
  signal loading(int key)
  // That track plays (or sits paused or buffering, see phase).
  signal started(int key)
  // The current track ended by itself: reason "eof" or "error". A track
  // that was stopped or replaced ends without a signal.
  signal ended(int key, string reason, string fileError)
  // mpv has nothing to play.
  signal idle()
  // mpv went away without being told to. crashed is also true when a load
  // of ours was lost with it.
  signal exited(bool crashed)
  // mpv could not be started, or a load did not start in time:
  // E_MPV_MISSING, E_TOOLS_MISSING, E_MPV_START or E_TIMEOUT.
  signal failed(string code)

  // ---- Commands ----

  // Loads a track into mpv, starting mpv first if none runs. opts:
  // { mode: "replace" | "append-play" | "insert-at", index: int,
  // startAt: int, live: bool }. Nothing is reported from inside this call:
  // loading(key) follows when mpv opens the entry, or failed(code).
  function load(key, id, title, infoFile, opts) {
    var o = opts !== null && typeof opts === "object" ? opts : {}
    var live = o.live === true
    var command = root._isKey(key) ? MpvProto.loadfile(root.fs ? root.fs.paths : null, {
      id: id, title: title, infoFile: infoFile, mode: o.mode, index: o.index, startAt: o.startAt, live: live
    }) : null
    if (command === null) {
      console.warn("omajuke: the player refused a load")
      // Whoever replaces the track waits for it to start.
      if (o.mode === "replace") root._failLater("E_MPV_START")
      return
    }
    var item = { command: command, key: key, mode: o.mode, live: live }
    if (root._ready) {
      root._sendLoad(item)
      return
    }
    root._enqueue(item)
    root._ensureStarted()
  }

  function setPause(paused) {
    if (!root._ready || root._facts.key === 0) return
    mpvSocket.send(MpvProto.setPause(paused === true))
  }

  // Seeks in the current track. The target is clamped to the track, and
  // the position is the target from this moment.
  function seek(seconds) {
    var facts = root._facts
    if (!root._ready || !facts.started || facts.live || facts.duration <= 0) return
    var command = MpvProto.seek(seconds, facts.duration)
    if (command === null) return
    root._facts = PlayerState.onLocalSeek(facts, command[1], Date.now()).state
    root._syncPosition(true)
    mpvSocket.send(command)
  }

  // Volume and mute are kept for the next mpv when none is connected.
  function setVolume(v) {
    var command = MpvProto.setVolume(v)
    if (command === null) return
    root._volume = command[2]
    root._sendVolume()
  }

  function setMuted(m) {
    root._muted = m === true
    root._sendMute()
  }

  // Adds or removes the levelling filter of a connected mpv. Nothing to do
  // otherwise: the handshake applies the setting to the next one.
  function setEvenVolume(on) {
    if (root._ready) mpvSocket.send(MpvProto.setEvenVolume(on === true))
  }

  // Whether somebody looks at the position: mpv reports it only then.
  function setPositionWatch(on) {
    var watching = on === true
    if (watching === root._watching) return
    root._watching = watching
    if (!root._ready) return
    mpvSocket.send(watching ? MpvProto.observe("time-pos") : MpvProto.unobserve("time-pos"))
  }

  // The position in seconds, estimated from the last report. Right after a
  // track has ended it is where that track ended.
  function positionNow() {
    return PlayerState.positionNow(root._facts, Date.now())
  }

  // Makes mpv drop what it plays and holds; mpv itself stays. Every entry
  // and every queued load is forgotten first, so that an entry mpv had
  // already begun to open is not reported.
  function stopPlayback() {
    root._forget()
    if (root._ready) mpvSocket.send(MpvProto.stop())
  }

  // The same forgetting, then mpv is told to quit. From this call on
  // nothing from that mpv is reported, its exit included. A load() made
  // afterwards starts a new one.
  function shutdown() {
    root._forget()
    root._ready = false
    if (mpvProcess.runState === "off") return
    root._quitting = true
    mpvProcess.stop(function() { return mpvSocket.sendQuitAndClose() })
  }

  // ---- Entries ----

  function _isKey(key) {
    return typeof key === "number" && Math.floor(key) === key && key >= 1 && key <= 2147483647
  }

  // What the reducer asks about a playlist entry: ours, dead or foreign.
  function _entryKind(entryId) {
    var entry = root._entries.get(entryId)
    if (entry !== undefined) return { key: entry.key, dead: false, live: entry.live }
    return { key: 0, dead: entryId < root._floor, live: false }
  }

  // Makes every entry dead and no track current, at once and without a
  // signal: whatever mpv still says about what it held is old news.
  function _forget() {
    root._gen += 1
    root._entries = new Map()
    root._outbox = []
    root._floor = root._lastEntry + 1
    root._awaiting = 0
    loadTimer.stop()
    root._facts = PlayerState.onLocalStop(root._facts, Date.now()).state
    root._syncPosition(true)
  }

  // A replacing load makes mpv drop every entry it holds, so what waited
  // in front of it need not be sent at all.
  function _enqueue(item) {
    var queue = item.mode === "replace" ? [] : root._outbox.slice()
    queue.push(item)
    if (queue.length > Const.LIMITS.mpvOutbox) {
      queue.shift()
      console.warn("omajuke: the player outbox overflowed")
    }
    root._outbox = queue
  }

  function _sendLoad(item) {
    var gen = root._gen
    var id = mpvSocket.send(item.command, function(error, data) {
      root._loadAnswered(item, gen, error, data)
    })
    if (item.mode !== "replace") return
    if (id === 0) {
      // Not written: mpv has stopped answering.
      root._failLater("E_MPV_START")
      return
    }
    root._awaiting = item.key
    loadTimer.restart()
  }

  // mpv answers a load with the id of the new playlist entry, before it
  // says anything else about that entry. A load that failed has no entry;
  // the watchdog ends the wait for it.
  function _loadAnswered(item, gen, error, data) {
    var entry = error === "" ? MpvProto.entryId(data) : 0
    if (entry === 0) return
    if (entry > root._lastEntry) root._lastEntry = entry
    if (gen !== root._gen) {
      // Stopped or shut down since it was sent.
      if (entry >= root._floor) root._floor = entry + 1
      return
    }
    if (item.mode === "replace") {
      if (entry > root._floor) root._floor = entry
      var replaced = []
      root._entries.forEach(function(value, id) {
        if (id < entry) replaced.push(id)
      })
      for (var i = 0; i < replaced.length; i++) root._entries.delete(replaced[i])
    }
    root._entries.set(entry, { key: item.key, live: item.live })
  }

  // ---- The mpv process ----

  function _ensureStarted() {
    var runState = mpvProcess.runState
    if (runState === "starting" || runState === "running") return
    var paths = root.fs ? root.fs.paths : null
    var tools = root.tools
    var argv = paths !== null && typeof paths === "object" && tools !== null && typeof tools === "object"
      ? MpvArgs.launch({
        sock: paths.sock, volume: root._volume, mpris: root.fs.mprisAvailable === true, ytdlp: tools.ytdlp
      }) : null
    if (argv === null) {
      console.warn("omajuke: the player has no usable paths")
      root._forget()
      root._failLater("E_MPV_START")
      return
    }
    root._launchVolume = root._volume
    // While the last mpv is still stopping this is remembered and done
    // when it has gone; the load waits in the outbox until then.
    mpvProcess.start(argv)
  }

  function _failLater(code) {
    var life = root._life
    var gen = root._gen
    Qt.callLater(function() {
      if (life.alive && gen === root._gen) root.failed(code)
    })
  }

  // A new mpv numbers its entries from 1 again.
  function _processStarted() {
    root._facts = PlayerState.initial()
    root._entries = new Map()
    root._floor = 0
    root._lastEntry = 0
    root._durationObserved = false
    mpvSocket.open()
  }

  function _processExited(crashed) {
    mpvSocket.close()
    root._ready = false
    if (root._quitting) {
      root._quitting = false
      return
    }
    // Not asked for by us: another program told mpv to quit, or it
    // crashed. A load that went with it must not be waited for.
    var lost = root._awaiting !== 0 || root._outbox.length > 0
    root._forget()
    // Drops a start that was remembered meanwhile: its load is forgotten.
    mpvProcess.stop(null)
    root.exited(crashed || lost)
  }

  function _startFailed(what) {
    mpvSocket.close()
    root._ready = false
    root._quitting = false
    root._forget()
    root.failed(what === "mpv" ? "E_MPV_MISSING" : "E_TOOLS_MISSING")
  }

  // ---- The socket ----

  // What a fresh connection is sent before anything else, in this order:
  // the window binding, the observations, the saved mute and volume, the
  // levelling filter, and then the loads that waited.
  function _handshake() {
    mpvProcess.noteConnected()
    var commands = MpvProto.handshake()
    for (var i = 0; i < commands.length; i++) mpvSocket.send(commands[i])
    root._durationObserved = true
    if (root._watching) mpvSocket.send(MpvProto.observe("time-pos"))
    root._ready = true
    root._sendMute()
    if (root._volume !== root._launchVolume) root._sendVolume()
    if (root.evenVolume) mpvSocket.send(MpvProto.setEvenVolume(true))
    var waiting = root._outbox
    root._outbox = []
    for (var k = 0; k < waiting.length; k++) root._sendLoad(waiting[k])
  }

  // The socket never came up: this mpv is of no use.
  function _gaveUp() {
    root._forget()
    root._ready = false
    root._quitting = true
    mpvProcess.stop(null)
    root.failed("E_MPV_START")
  }

  // The connection ended and we did not close it: mpv is quitting by
  // itself, or it has stopped talking. It gets the time a quit takes and
  // is then ended, so that an mpv nobody can talk to never plays on. Its
  // exit is reported when it comes.
  function _connectionLost() {
    root._ready = false
    if (!root._quitting) mpvProcess.stop(function() { return true })
  }

  // The saved volume, as it would be sent: whole, and from 0 to 100.
  function _adoptVolume() {
    var command = MpvProto.setVolume(root.startVolume)
    if (command !== null) root._volume = command[2]
  }

  function _sendVolume() {
    if (!root._ready) return
    root._volumeDue += 1
    mpvSocket.send(MpvProto.setVolume(root._volume), function(error, data) { root._volumeDue -= 1 })
  }

  function _sendMute() {
    if (!root._ready) return
    root._muteDue += 1
    mpvSocket.send(MpvProto.setMute(root._muted), function(error, data) { root._muteDue -= 1 })
  }

  // ---- What mpv says ----

  // One event from mpv. It is handled completely, signals included, before
  // the socket hands over the next line.
  function _message(message) {
    if (!root._ready) return
    if (message.event === "start-file" && message.playlist_entry_id > root._lastEntry) {
      root._lastEntry = message.playlist_entry_id
    }
    root._take(PlayerState.onEvent(root._facts, message, root._entryKind, Date.now()))
    if (message.event !== "property-change") return
    if (message.name === "volume" && root._volumeDue === 0 && typeof message.data === "number") {
      root._volume = root._facts.volume
    } else if (message.name === "mute" && root._muteDue === 0 && typeof message.data === "boolean") {
      root._muted = root._facts.mute
    }
  }

  // Acts on what the reducer made of one input: the new facts first, then
  // the watchdog, then what mpv has to be told, then the signals, in order.
  function _take(result) {
    var before = root._facts
    var after = result.state
    var gen = root._gen
    root._facts = after
    root._syncPosition(before.key !== after.key)
    // Whoever watches the facts may have stopped or shut down the player.
    if (root._gen !== gen) return

    var names = result.signals.map(function(signal) { return signal.name })
    var opened = names.indexOf("loading") !== -1
    var playing = names.indexOf("started") !== -1
    var over = before.entry !== 0 && after.entry === 0
    if (opened) {
      // One of our entries starts: the watchdog now bounds this file.
      if (root._awaiting === after.key) root._awaiting = 0
      loadTimer.restart()
    } else if (root._awaiting === 0 && (playing || over || names.indexOf("idle") !== -1)) {
      // The file the watchdog stood for plays or is over. While a load of
      // ours has been written and has not started, nothing but that load
      // may end the wait: neither the idle report of a fresh mpv nor the
      // one that follows our stop of a foreign file.
      loadTimer.stop()
    }

    // A live stream has no length; mpv reports a growing estimate for it
    // several times a second, so the observation is paused for its time.
    if (opened && !after.live && !root._durationObserved) {
      mpvSocket.send(MpvProto.observe("duration"))
      root._durationObserved = true
    } else if (playing && after.live && root._durationObserved) {
      mpvSocket.send(MpvProto.unobserve("duration"))
      root._durationObserved = false
    }

    for (var c = 0; c < result.commands.length; c++) root._answer(result.commands[c])
    for (var s = 0; s < result.signals.length; s++) {
      // A handler may have stopped or shut down the player. What is left
      // to report is then about an entry that is dead by now.
      if (root._gen !== gen) return
      root._emit(result.signals[s])
    }
  }

  // The question about the position gets a callback; everything else the
  // reducer asks for (a stop, a clamped volume, the speed set back) is
  // just sent.
  function _answer(command) {
    if (command[0] === "get_property" && command[1] === "time-pos") root._askPosition()
    else mpvSocket.send(command)
  }

  // The answer counts only for the file that was current when it was
  // asked for: a position of the track before must not land on the next.
  function _askPosition() {
    var gen = root._gen
    var entry = root._facts.entry
    if (entry === 0) return
    mpvSocket.send(MpvProto.getProperty("time-pos"), function(error, data) {
      if (error !== "" || gen !== root._gen || entry !== root._facts.entry) return
      root._take(PlayerState.onProperty(root._facts, "time-pos", data, Date.now()))
    })
  }

  function _emit(signal) {
    var args = signal.args
    if (signal.name === "loading") root.loading(args[0])
    else if (signal.name === "started") root.started(args[0])
    else if (signal.name === "ended") root.ended(args[0], args[1], args[2])
    else if (signal.name === "idle") root.idle()
  }

  function _syncPosition(always) {
    var position = root._facts.posBase
    if (always || Math.abs(position - root._position) >= root._positionStep) root._position = position
  }

  // A load did not start in time. mpv is told to drop what it has, which
  // is forgotten here as after any stop of ours, and the wait ends with a
  // failure instead of in silence.
  function _loadTimedOut() {
    root.stopPlayback()
    root.failed("E_TIMEOUT")
  }

  // ---- Wiring ----

  onStartVolumeChanged: if (!root._ready) root._adoptVolume()
  onStartMutedChanged: if (!root._ready) root._muted = root.startMuted
  onEvenVolumeChanged: root.setEvenVolume(root.evenVolume)

  Component.onCompleted: {
    root._adoptVolume()
    root._muted = root.startMuted
  }
  Component.onDestruction: root._life.alive = false

  MpvProcess {
    id: mpvProcess
    tools: root.tools
    paths: root.fs ? root.fs.paths : null
    onStarted: root._processStarted()
    onExited: function(expected, crashed) { root._processExited(crashed) }
    onStartFailed: function(what) { root._startFailed(what) }
  }

  MpvSocket {
    id: mpvSocket
    path: root._sockPath
    onOpened: root._handshake()
    onClosed: root._connectionLost()
    onGaveUp: root._gaveUp()
    onMessage: function(object) { root._message(object) }
  }

  // The load watchdog: the only thing that bounds a load once the command
  // has left. Runs from a replacing load being written, and from every
  // start of one of our entries, until that file plays or is over.
  Timer {
    id: loadTimer
    interval: Const.TIMEOUTS.loadMs
    onTriggered: root._loadTimedOut()
  }
}
