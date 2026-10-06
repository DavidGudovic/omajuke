import QtQuick
import Quickshell
import Quickshell.Io
import "core"
import "lib/Clean.js" as Clean
import "lib/Const.js" as Const
import "lib/Env.js" as Env
import "lib/Errors.js" as Errors
import "lib/Ids.js" as Ids

// The service: one instance per shell, created by the host and kept loaded
// across plugin reloads. It is the composition root of the plugin: the parts
// under core/ are created at the end of this file and handed to each other
// there, and none of them knows of another except through what it was given.
//
// The bar widget and the panel read and call the members of this root object
// and nothing else. So every fact they show is re-exported here under its
// public name, every request is forwarded from here, and the only IPC
// handler of the plugin lives here, with the checks on its arguments.
//
// What this file decides itself is what no single part can know: when the
// service is ready, when nothing may be started (a tool is missing, or the
// session has a proxy the user has not been told about), how many panels
// are open, and when playback and the panels have both come to rest, so
// that the files of looked-up tracks can go.
Item {
  id: root

  // ---- Injected by the host ----

  // The host's facade. It arrives after construction (it is still null when
  // this object completes) and is null again once the plugin is disabled,
  // before this object is destroyed. Nothing may assume it is there.
  property var shell: null

  // A fresh copy is assigned on every change of the shell's configuration,
  // by anyone, so nothing reacts to it. Only its version is read, to report
  // an update that still waits for a shell restart.
  property var manifest: null

  // ---- Test seam ----

  // The tool paths every part is given. Only the test harness assigns this,
  // before anything runs, to put stub tools in place. No setting, IPC
  // argument or stored value can reach it.
  property var tools: Const.TOOLS

  // ---- Identity and readiness ----

  readonly property string pluginId: Const.PLUGIN_ID

  // The version of the code that is running. After an update the widget and
  // the panel are new code while this kept instance is old until the shell
  // restarts; they compare this with their own version to notice.
  readonly property string version: Const.VERSION

  // True once the private directories are prepared, the saved state is
  // loaded, the settings are known and what the state held has been put
  // back. It turns true once and stays.
  readonly property bool ready: _settled
  // Why nothing can be played at all: a code whose sentence is all the
  // panel then shows, or "". Opening a panel looks again (notePanelOpen).
  readonly property string fatalCode: fs.failCode
  // True while the session has a proxy configured and the user has not yet
  // been told that OmaJuke connects directly. Nothing that would cause a
  // request is started until then.
  readonly property bool networkHold: _proxySet && store.values.proxyAck !== true
  // Media keys work only with mpv's MPRIS script, which is optional.
  readonly property bool mprisAvailable: fs.mprisAvailable

  // ---- Playback ----

  // idle, resolving, loading, playing, paused, buffering or error.
  readonly property string playbackState: playback.status
  // The current queue item, or null. Not null while idle only for a queue
  // that was put back from the saved state.
  readonly property var currentTrack: playback.current
  // Seconds. It follows mpv closely only while a panel watches the
  // position; positionNow() estimates in between.
  readonly property real position: player.position
  // Seconds; 0 when unknown, and for a live stream.
  readonly property real duration: player.duration
  readonly property int volume: player.volume
  readonly property bool muted: player.muted
  // The error of the current track, or "".
  readonly property string errorCode: playback.errorCode
  // Something worth telling that stops nothing, or "". The notice about a
  // saved state that had to be reset is the store's, and the store keeps
  // it; that it was read is remembered here.
  readonly property string noticeCode: playback.noticeCode !== "" ? playback.noticeCode
    : (_stateNoticeRead ? "" : store.notice)
  // One line for the bar icon, cleaned and cut here because a title is
  // remote text and the bar shows whatever it is given.
  readonly property string tooltip: {
    var track = root.currentTrack
    var state = root.playbackState
    if (track === null || state === "idle") return Const.APP_NAME
    if (state === "error") return Clean.tooltip(root.errorText(root.errorCode)) || Const.APP_NAME
    // A video that was started by its link has no title until it is looked up.
    if (track.title === "") return root._loadingText
    if (state === "paused") return Clean.tooltip(root._pausedPrefix + track.title)
    return Clean.tooltip(track.channel === "" ? track.title : track.title + " — " + track.channel)
  }

  // Derived here, so that the widget and the panel never interpret the state
  // names themselves.
  readonly property bool playing: playbackState === "playing" || playbackState === "buffering"
  readonly property bool paused: playbackState === "paused"
  readonly property bool hasTrack: currentTrack !== null
  readonly property bool seekable: duration > 0 && currentTrack !== null && currentTrack.live !== true
    && (playbackState === "playing" || playbackState === "paused" || playbackState === "buffering")

  // ---- Lists and queue ----

  // Queue items: a track plus "key" and "auto". A new array on every change.
  readonly property var queue: playback.queue
  readonly property int queueIndex: playback.queueIndex
  // Tracks, most recent first, each video once.
  readonly property var recents: playback.recents

  // ---- Search ----

  // The cleaned query the results belong to; "" while idle.
  readonly property string searchQuery: search.query
  // idle, searching, results, empty or error.
  readonly property string searchState: search.status
  readonly property var searchResults: search.results
  readonly property string searchError: search.errorCode

  // ---- Thumbnails, settings, panel ----

  // Video id -> absolute path of a local picture. The object has no
  // prototype, so an id such as "constructor" finds nothing in it, and it
  // is replaced by a new one whenever its content changes.
  readonly property var thumbs: thumbnails.map
  // The complete typed settings; never missing a key.
  readonly property var settings: settingsStore.values
  // True while at least one panel is open.
  readonly property bool panelOpen: _panels > 0

  // ---- Private ----

  // True while nothing may be started: before start-up has finished, while a
  // tool or the runtime folder is missing, and while the proxy notice waits
  // for its answer.
  readonly property bool _hold: !ready || fatalCode !== "" || networkHold

  // Looked at once: the variables of a running shell do not change.
  readonly property bool _proxySet: root._sessionProxy()
  // The user's choice to keep recents and queue on disk. False as long as
  // the settings are not known, so that a default never writes history.
  readonly property bool _persistHistory: settingsStore.known && settingsStore.values.rememberHistory === true

  // Everything start-up waits for is there. The saved lists are put back a
  // turn later (_settle), and only then is the service ready.
  readonly property bool _startable: fs.status === "ready" && store.loaded && settingsStore.known
  property bool _settled: false
  // A facade was here once. The host takes it away before it destroys the
  // service, and from then on the settings are no longer the user's word.
  property bool _hadShell: false

  // Open panels, and main pages that show the position. Each panel reports
  // its opening and its closing, and this counts.
  property int _panels: 0
  property int _watchers: 0
  property bool _stateNoticeRead: false
  property bool _tidyPending: false
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // The two bar tooltips that are not a title or an error sentence.
  readonly property string _loadingText: "Loading…"
  readonly property string _pausedPrefix: "Paused: "

  // The second test seam: the parts, by kind. The harness reads them to
  // check what the public surface does not show (how many jobs run, whether
  // mpv is gone). Nothing in the plugin reads this.
  readonly property var _parts: ({
    runner: runner, fs: fs, store: store, settings: settingsStore, player: player,
    search: search, resolver: resolver, thumbs: thumbnails, playback: playback
  })

  // ---- Identity and readiness ----

  // The only wording the widget and the panel have for a code: they cannot
  // read the table themselves. A code that is not in it has no text.
  function errorText(code: string): string {
    return Object.prototype.hasOwnProperty.call(Errors.TEXT, code) ? Errors.TEXT[code] : ""
  }

  // The user has read that OmaJuke does not use the session's proxy. The
  // answer is stored, so the question is asked once and not at every start.
  function acknowledgeProxy() {
    if (root._proxySet) store.patch({ proxyAck: true })
  }

  // ---- Playback ----

  function playPause(): bool {
    return playback.playPause()
  }

  function stop(): bool {
    return playback.stop()
  }

  function next(): bool {
    return playback.next()
  }

  function previous(): bool {
    return playback.previous()
  }

  function seekTo(seconds: real): bool {
    return playback.seekTo(seconds)
  }

  function dismissNotice() {
    playback.dismissNotice()
    root._readStateNotice()
  }

  // Volume and mute are the player's: it clamps them, applies them to a
  // running mpv and keeps them for the next one. Before the saved state is
  // known nothing is changed, because the saved values replace it a moment
  // later.
  function setVolume(v: int) {
    if (root.ready) player.setVolume(v)
  }

  function nudgeVolume(delta: int) {
    root.setVolume(root.volume + delta)
  }

  function toggleMute() {
    if (root.ready) player.setMuted(!player.muted)
  }

  // A main page says true when it appears and false when it goes. mpv
  // reports the position only while at least one of them looks at it.
  function setPositionWatch(on: bool) {
    root._count(root._panels, root._watchers + (on ? 1 : -1))
  }

  // The position in seconds, estimated without asking mpv.
  function positionNow(): real {
    return player.positionNow()
  }

  // ---- Lists and queue ----

  // Plays a row the panel hands back, as a queue of one. The row is checked
  // again on the way in: the panel is not trusted to return what it got.
  function playTrack(track: var): bool {
    return playback.playTrack(track)
  }

  // The search box's Enter. Answers "empty" (nothing was started), "video"
  // (a video link, which now plays), "link" (text that looks like a link, an
  // address or a path and is no video link: it is not sent anywhere and
  // not kept, the page that asked shows the message) or "query" (a search
  // was started). Queueing arrives with the queue; until then a video link
  // is played whatever the second argument says.
  function submit(text: string, enqueue: bool): string {
    var entered = text.trim()
    if (entered === "") return "empty"
    var id = Ids.parseVideoRef(entered, false)
    if (id !== "") return !root._hold && playback.playId(id) ? "video" : "empty"
    if (Ids.looksLikeUrl(entered)) return "link"
    return !root._hold && search.submit(Clean.query(entered)) ? "query" : "empty"
  }

  // Forgets what was played and searched, with the files that belong to
  // it, and rewrites the saved state at once. The current track stays and
  // keeps playing, so its looked-up file stays too.
  function clearHistory() {
    playback.clearHistory()
    search.clear()
    resolver.purge(playback.keepIds())
    thumbnails.purge()
    store.flushNow()
  }

  // ---- Search ----

  function clearSearch() {
    search.clear()
  }

  // True when this text is the query the shown or running search belongs to.
  // The panel asks before Enter, so that the same query is not sent twice.
  function matchesSearch(text: string): bool {
    return Clean.query(text) === root.searchQuery
      && (root.searchState === "results" || root.searchState === "searching")
  }

  // ---- Thumbnails, settings, panel ----

  // Rows ask for the pictures of the ids they show. A request made a moment
  // before its panel counts as open waits in the thumbnail part.
  function wantThumbs(ids: var) {
    if (root._hold) return
    root._panelsOpen()
    thumbnails.want(ids)
  }

  // A row could not show the file it was given.
  function reportThumbError(id: string) {
    thumbnails.reportError(id)
  }

  // Changes one setting. Known keys and the values they accept only.
  function setSetting(key: string, value: var): bool {
    return settingsStore.set(key, value)
  }

  // Every panel reports its opening and its closing.
  function notePanelOpen(open: bool) {
    root._count(root._panels + (open ? 1 : -1), root._watchers)
    // A tool that was missing may have been installed since. Nothing runs
    // while a fatal code is set, so looking again is safe, and it spares
    // the user a shell restart.
    if (open && fs.status === "failed") fs.prepare()
  }

  // The panel belongs to the bar widget, and the host knows which copy of
  // the widget to use: the one whose panel is open, else the one on the
  // focused monitor. Without the facade there is nobody to ask.
  function openPanel(): bool {
    var facade = root.shell
    return facade && typeof facade.summon === "function" ? facade.summon(root.pluginId, "") === true : false
  }

  function closePanel(): bool {
    var facade = root.shell
    return facade && typeof facade.hide === "function" ? facade.hide(root.pluginId) === true : false
  }

  function togglePanel(): bool {
    var facade = root.shell
    return facade && typeof facade.toggle === "function" ? facade.toggle(root.pluginId, "") === true : false
  }

  // ---- Start-up ----

  // True when one of the variables that would make a tool use a proxy is
  // set for the session. They are only looked at: no child ever gets one.
  function _sessionProxy() {
    var seen = Object.create(null)
    for (var i = 0; i < Env.PROXY_NAMES.length; i++) {
      seen[Env.PROXY_NAMES[i]] = Quickshell.env(Env.PROXY_NAMES[i])
    }
    return Env.proxySet(seen)
  }

  function _later(action) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) action()
    })
  }

  // Runs once, a turn after the directories, the saved state and the
  // settings have all become known: by then every value that follows from
  // them has settled, the history setting among them. Until it has run the
  // service is not ready and nothing can be started.
  function _settle() {
    if (root._settled || !root._startable) return
    var saved = store.values
    if (root._persistHistory) {
      playback.restore(saved)
    } else if (saved.recents.length > 0 || saved.queue.items.length > 0) {
      // History was switched off while the shell was not running. What the
      // file still holds is neither shown nor kept: it leaves the store's
      // copy and, at once, the disk.
      store.patch({ recents: [], queue: { items: [], index: -1 } })
      store.flushNow()
    }
    root._settled = true
  }

  // One of the three privacy choices was made, in the panel or in the
  // shell's configuration. The state file keeps a copy of them, because the
  // host deletes the settings when the plugin is disabled.
  function _rememberChoice(key, value) {
    var prefs = Object.create(null)
    var kept = store.values.prefs
    for (var name in kept) prefs[name] = kept[name]
    prefs[key] = value
    store.patch({ prefs: prefs })
  }

  // ---- Panels ----

  function _count(panels, watchers) {
    root._panels = Math.max(0, panels)
    root._watchers = Math.max(0, watchers)
    player.setPositionWatch(root._watchers > 0)
  }

  // Whether a panel is open, after asking the host. The counts rest on
  // every panel reporting its closing. When the host says that none is
  // open, a report was missed and both counts start over: one lost call
  // must not leave the position watched, and the looked-up files kept, for
  // as long as the shell runs.
  function _panelsOpen() {
    if (root._panels === 0 && root._watchers === 0) return false
    var facade = root.shell
    var canAsk = facade && typeof facade.isPluginOpen === "function"
    if (canAsk && facade.isPluginOpen(root.pluginId) !== true) root._count(0, 0)
    return root._panels > 0
  }

  // ---- Coming to rest ----

  function _readStateNotice() {
    if (store.notice !== "") root._stateNoticeRead = true
  }

  function _playbackMoved() {
    var state = playback.status
    // Every start passes through this state, and whoever starts something
    // has had the notice in front of them.
    if (state === "resolving") root._readStateNotice()
    else if (state === "idle") root._tidySoon()
  }

  // Looks a turn later, when whatever led here has finished: playback names
  // the track it still needs only once its own step is complete.
  function _tidySoon() {
    if (root._tidyPending) return
    root._tidyPending = true
    root._later(root._tidy)
  }

  // With nothing playing and no panel open, the files of looked-up tracks
  // have no reader left: mpv is gone, and a later play looks the track up
  // again. They hold media addresses signed for this machine, so they do
  // not stay around.
  function _tidy() {
    root._tidyPending = false
    if (playback.status !== "idle" || root._panelsOpen()) return
    resolver.purge(playback.keepIds())
  }

  // ---- IPC ----

  // The code behind the handler at the end of this file, one function per
  // method, so that a test can drive exactly what a client reaches. An
  // argument is whatever a local program chose to send: it is checked before
  // anything else reads it, and it is never logged and never echoed.

  // Returns the argument when it is a string of bounded length without
  // control characters, else null.
  function _ipcText(value) {
    if (typeof value !== "string" || value.length > Const.LIMITS.refChars) return null
    return Clean.hasControl(value) ? null : value
  }

  // Returns the id of the video the argument names, or "". A bare id is
  // accepted here and nowhere else: in the search box eleven letters are a
  // query.
  function _ipcVideoId(target) {
    var text = root._ipcText(target)
    return text === null ? "" : Ids.parseVideoRef(text, true)
  }

  // True when the files on disk belong to another version than the code
  // that is running: an update was fetched and the shell not yet restarted.
  function _updatePending() {
    var latest = root.manifest
    return latest ? typeof latest.version === "string" && latest.version !== root.version : false
  }

  function _ipcToggle() {
    return root.togglePanel() ? "ok" : "unhandled"
  }

  function _ipcOpen() {
    return root.openPanel() ? "ok" : "unhandled"
  }

  function _ipcClose() {
    return root.closePanel() ? "ok" : "unhandled"
  }

  function _ipcPlayPause() {
    return root.playPause() ? "ok" : "unhandled"
  }

  function _ipcNext() {
    return root.next() ? "ok" : "unhandled"
  }

  function _ipcPrevious() {
    return root.previous() ? "ok" : "unhandled"
  }

  function _ipcStop() {
    return root.stop() ? "ok" : "unhandled"
  }

  // The video plays as a queue of one. Its title arrives with the lookup.
  function _ipcPlay(target) {
    var id = root._ipcVideoId(target)
    if (id === "") return "invalid"
    if (root._hold) return "unavailable"
    return playback.playId(id) ? "ok" : "unavailable"
  }

  // Until there is a queue to append to, this plays when nothing else does
  // and declines otherwise.
  function _ipcEnqueue(target) {
    if (root._ipcVideoId(target) === "") return "invalid"
    if (root._hold) return "unavailable"
    return root.playbackState === "idle" ? root._ipcPlay(target) : "unhandled"
  }

  // A query has to survive cleaning, and text that looks like a link, an
  // address or a path is refused: it must never reach YouTube as a search.
  // The panel is opened on the results; its field follows searchQuery.
  function _ipcSearch(query) {
    var text = root._ipcText(query)
    if (text === null) return "invalid"
    text = text.trim()
    if (text.length > Const.LIMITS.queryChars || Ids.looksLikeUrl(text)) return "invalid"
    var cleaned = Clean.query(text)
    if (cleaned === "") return "invalid"
    if (root._hold) return "unavailable"
    if (!search.submit(cleaned)) return "invalid"
    root.openPanel()
    return "ok"
  }

  // Holds nothing that the desktop's media interface does not already
  // publish, plus counters: no path and no account detail. Without a
  // current track the position is 0, like every other fact about a track:
  // the player still knows where the last one stopped. The last keys
  // belong to features of later versions and are constant until those
  // exist, so that a script written against this version keeps working.
  function _ipcStatus() {
    var track = root.currentTrack
    return JSON.stringify({
      version: root.version,
      state: root.playbackState,
      id: track ? track.id : "",
      title: track ? track.title : "",
      channel: track ? track.channel : "",
      position: track ? Math.round(root.positionNow() * 10) / 10 : 0,
      duration: root.duration,
      live: track ? track.live === true : false,
      volume: root.volume,
      muted: root.muted,
      queueLength: root.queue.length,
      queueIndex: root.queueIndex,
      video: "hidden",
      output: "",
      signedIn: false,
      updatePending: root._updatePending(),
      error: root.errorCode
    })
  }

  onShellChanged: if (root.shell) root._hadShell = true
  on_StartableChanged: if (root._startable) root._later(root._settle)
  onPanelOpenChanged: if (!root.panelOpen) root._tidySoon()

  // The private directories are checked and made before anything else runs.
  Component.onCompleted: fs.prepare()
  // The parts and their child processes end with this object. What they
  // left in the runtime directory is removed by a detached command, the
  // one thing that can outlive this moment. No state is written here.
  Component.onDestruction: {
    root._life.alive = false
    fs.cleanupDetached()
  }

  // ---- The parts ----

  ProcessRunner {
    id: runner
    tools: root.tools
  }

  PrivateFs {
    id: fs
    runner: runner
    tools: root.tools
    // The state file is read only after its directory was vouched for.
    onPrepared: function(ok) { if (ok) store.load() }
  }

  StateStore {
    id: store
    fs: fs
    persistHistory: root._persistHistory
    // A user who turned history off must not get it written while the
    // plugin is being disabled.
    frozen: root._hadShell && !root.shell
  }

  SettingsStore {
    id: settingsStore
    shell: root.shell
    pluginId: root.pluginId
    mirror: store.loaded ? store.values.prefs : null
    onExplicitChoice: function(key, value) { root._rememberChoice(key, value) }
  }

  Player {
    id: player
    tools: root.tools
    fs: fs
    startVolume: store.values.volume
    startMuted: store.values.muted
    evenVolume: settingsStore.values.evenVolume
    // A media key changes these as well as the panel does, so they are
    // saved where they change. Each is compared with its own saved value:
    // when the state is loaded the two do not arrive in the same step.
    onVolumeChanged: if (player.volume !== store.values.volume) store.patch({ volume: player.volume })
    onMutedChanged: if (player.muted !== store.values.muted) store.patch({ muted: player.muted })
  }

  Search {
    id: search
    runner: runner
    tools: root.tools
    fs: fs
  }

  Resolver {
    id: resolver
    runner: runner
    tools: root.tools
    fs: fs
    settings: settingsStore.values
    panelOpen: root.panelOpen
  }

  Thumbnails {
    id: thumbnails
    runner: runner
    tools: root.tools
    fs: fs
    panelOpen: root.panelOpen
  }

  Playback {
    id: playback
    player: player
    resolver: resolver
    store: store
    settings: settingsStore.values
    persistHistory: root._persistHistory
    hold: root._hold
    onStatusChanged: root._playbackMoved()
    // A track change is a moment at which the position watch matters again.
    onTrackStarted: function(item) { root._panelsOpen() }
  }

  // The only handler in the plugin: a second one for the same target, such
  // as one per bar widget copy, would be ignored by the host with a warning.
  // Functions only, strings in and strings out, and every one returns at
  // once from what the service already knows.
  IpcHandler {
    target: root.pluginId

    function toggle(): string {
      return root._ipcToggle()
    }

    function open(): string {
      return root._ipcOpen()
    }

    function close(): string {
      return root._ipcClose()
    }

    function playPause(): string {
      return root._ipcPlayPause()
    }

    function next(): string {
      return root._ipcNext()
    }

    function previous(): string {
      return root._ipcPrevious()
    }

    function stop(): string {
      return root._ipcStop()
    }

    function play(target: string): string {
      return root._ipcPlay(target)
    }

    function enqueue(target: string): string {
      return root._ipcEnqueue(target)
    }

    function search(query: string): string {
      return root._ipcSearch(query)
    }

    function status(): string {
      return root._ipcStatus()
    }
  }
}
