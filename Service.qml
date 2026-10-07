import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
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
// that the files of looked-up tracks can go. It also hears the one thing
// the compositor tells the plugin, that its configuration was loaded
// again, and passes that on to the parts that keep something inside it.
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

  // Queue items: a track plus "key" (which names the item in the queue
  // functions below) and "auto". A new array on every change.
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

  // ---- Video window ----

  // hidden, loading, shown or unavailable (the picture is wanted, but this
  // track has none or the window cannot be opened; videoNote says which).
  readonly property string videoState: videoWindow.videoState
  readonly property string videoNote: videoWindow.videoNote

  // ---- Shortcuts ----

  // One row per action: { action, label, combo, status, proposal, note },
  // status being unassigned, assigned, config, blocked or failed.
  readonly property var shortcuts: shortcutKeys.rows
  // What stands between a shortcut and the compositor: ok, version,
  // config-errors or no-hyprland.
  readonly property string shortcutsGate: shortcutKeys.gate
  readonly property bool shortcutsBusy: shortcutKeys.busy

  // ---- Audio output ----

  // { name, label, current } per output. Empty while nothing plays: the
  // list is mpv's.
  readonly property var outputs: audioOutputs.outputs
  // What to call the output in use, or the saved choice while nothing plays.
  readonly property string outputName: audioOutputs.outputName
  // A notice code while the system default stands in for a chosen output
  // that is gone, or "".
  readonly property string outputNote: audioOutputs.outputNote

  // ---- Sign-in and feeds ----

  // True while requests may carry the saved login.
  readonly property bool signedIn: signIn.signedIn
  // off, confirm, browser, exporting, verifying, on or failed.
  readonly property string signInState: signIn.status
  // Why the last attempt failed, or that YouTube ended the session; and,
  // after a sign-out, that the saved login could not be deleted.
  readonly property string signInError: signIn.errorCode !== "" ? signIn.errorCode
    : (signIn.loginLeft ? "E_SIGNOUT_LEFT" : "")
  // True while a login file lies in the data folder, whether or not anybody
  // is signed in with it: the page offers to delete it in every state.
  readonly property bool loginSaved: signIn.hasLogin
  // The browser a sign-in would open, once it is known.
  readonly property string signInBrowserPath: signIn.browserPath
  // The list of the account that is shown ("" for none), its state (idle,
  // loading, rows, empty or error), its rows and the code of its failure.
  // A row has "key", which names it in openFeedRow().
  readonly property string feedKind: feeds.kind
  readonly property string feedState: feeds.status
  readonly property var feedRows: feeds.rows
  readonly property string feedError: feeds.errorCode
  // The title of the playlist whose videos are the rows, "" while a list
  // itself is shown. It is YouTube's text: shown as plain text only.
  readonly property string feedTitle: feeds.listTitle

  // ---- Sponsor segments ----

  // True while the question whether sponsor segments should be skipped
  // waits for its answer. It is asked once and never opens the panel.
  readonly property bool sponsorPrompt: sponsor.prompt
  // { category, from, to } of a skip that just happened, or null.
  readonly property var lastSkip: sponsor.lastSkip

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

  // The watched report is a choice made for the account that is signed in.
  // True when it is on although nobody is: the user signed out, YouTube
  // ended the session, or the login went with the plugin being switched
  // off. It is switched off then, so that it never passes to the next login
  // unseen.
  readonly property bool _strayWatchedReport: signIn.known && !signIn.signedIn
    && settingsStore.values.markWatched === true

  // Open panels, and main pages that show the position. Each panel reports
  // its opening and its closing, and this counts.
  property int _panels: 0
  property int _watchers: 0
  property bool _stateNoticeRead: false
  property bool _tidyPending: false
  // An output was asked for from outside the panel. It stays true: whoever
  // steps through the outputs with a key does so again.
  property bool _outputsAsked: false
  // Whether mpv is asked which outputs there are. Only while somebody can
  // use the answer: a panel is open, a shortcut for the next output is
  // saved, or one was asked for over IPC. To list them mpv turns to the
  // sound server, and playback should not depend on that for nothing. (A
  // saved output keeps the list coming by itself: the player needs it.)
  readonly property bool _outputsWanted: panelOpen || _outputsAsked || store.values.shortcuts.output !== ""
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
    search: search, resolver: resolver, thumbs: thumbnails, playback: playback,
    hypr: hyprCtl, video: videoWindow, shortcuts: shortcutKeys, outputs: audioOutputs,
    signIn: signIn, feeds: feeds, sponsor: sponsor
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
    sponsor.userActed()
    return playback.playPause()
  }

  function stop(): bool {
    return playback.stop()
  }

  function next(): bool {
    sponsor.userActed()
    return playback.next()
  }

  function previous(): bool {
    sponsor.userActed()
    return playback.previous()
  }

  function seekTo(seconds: real): bool {
    sponsor.userActed()
    return playback.seekTo(seconds)
  }

  // Tries the track that needs a signed-in account once more, with the
  // saved login. Only for the track whose error says so, and only because
  // the user asked: nothing else ever plays with the account.
  function playWithAccount(): bool {
    if (!root.signedIn) return false
    sponsor.userActed()
    return playback.playWithAccount()
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
    sponsor.userActed()
    return playback.playTrack(track)
  }

  // Adds a row at the end of the queue, and starts it when nothing plays.
  // False for a row that is no track and for a queue at its limit.
  function enqueueTrack(track: var): bool {
    sponsor.userActed()
    return playback.enqueueTrack(track)
  }

  // The search box's Enter. Answers "empty" (nothing was started), "video"
  // (a video link, which now plays, or waits at the end of the queue when
  // enqueue is true), "link" (text that looks like a link, an address or a
  // path and is no video link: it is not sent anywhere and not kept, the
  // page that asked shows the message) or "query" (a search was started).
  function submit(text: string, enqueue: bool): string {
    var entered = text.trim()
    if (entered === "") return "empty"
    var id = Ids.parseVideoRef(entered, false)
    if (id !== "") return root._startId(id, enqueue) === "ok" ? "video" : "empty"
    if (Ids.looksLikeUrl(entered)) return "link"
    return !root._hold && search.submit(Clean.query(entered)) ? "query" : "empty"
  }

  // The queue, item by item. An item is named by its key; a key the queue
  // does not hold changes nothing and answers false.
  function queuePlay(key: int): bool {
    sponsor.userActed()
    return playback.queuePlay(key)
  }

  function queueRemove(key: int): bool {
    return playback.queueRemove(key)
  }

  // Moves an item by delta places, towards the end for a positive one.
  function queueMove(key: int, delta: int): bool {
    return playback.queueMove(key, delta)
  }

  // Empties the queue around the track that plays, which goes on.
  function queueClear() {
    playback.queueClear()
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

  // A panel says which search result its highlight rests on, or "" for
  // none. A row the highlight stays on is looked up ahead, so that Enter
  // starts it at once; the resolver decides whether and when. The host is
  // asked first whether a panel is really open: without one nothing is
  // looked up for a highlight.
  function hintHighlight(id: string) {
    if (root._hold) return
    root._panelsOpen()
    resolver.hint(id)
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

  // ---- Video window ----

  // The picture of what plays, in a window of its own. Each answers false
  // when it changed nothing; why a window did not come is in videoNote.
  function showVideo(): bool {
    return videoWindow.showVideo()
  }

  function hideVideo(): bool {
    return videoWindow.hideVideo()
  }

  function toggleVideo(): bool {
    return videoWindow.toggleVideo()
  }

  // Forgets where the window was left on every monitor: the settings
  // decide its size and corner again.
  function resetVideoPlacement() {
    if (root.ready) videoWindow.resetPlacement()
  }

  // ---- Shortcuts ----

  // The shortcuts page was opened: the compositor's list is read again.
  function refreshShortcuts(): bool {
    return root.ready && shortcutKeys.refresh()
  }

  // True when the wish was saved; what came of it is in shortcuts.
  function assignShortcut(action: string, combo: string): bool {
    return root.ready && shortcutKeys.assign(action, combo)
  }

  function unassignShortcut(action: string): bool {
    return root.ready && shortcutKeys.unassign(action)
  }

  // Puts the line for the user's own key configuration on the clipboard.
  function copyShortcutLine(action: string, combo: string): bool {
    return shortcutKeys.copyLine(action, combo)
  }

  // A key press as Qt reports it, as a combination a shortcut can have, or
  // "" when it is none.
  function comboFromKeyEvent(key: int, modifiers: int): string {
    return shortcutKeys.comboFromKeyEvent(key, modifiers)
  }

  // ---- Audio output ----

  // Chooses where this player's sound goes, by a name from outputs. False
  // for a name that is not on the list, which none is while nothing plays.
  function setOutput(name: string): bool {
    return audioOutputs.setOutput(name)
  }

  // Moves on to the next output of the list.
  function cycleOutput(): bool {
    return audioOutputs.cycleOutput()
  }

  // ---- Sign-in and feeds ----

  // The steps of signing in, each asked for by the account page and by
  // nothing else: no IPC method leads here.
  function beginSignIn(): bool {
    return signIn.beginSignIn()
  }

  function confirmSignIn(): bool {
    return signIn.confirmSignIn()
  }

  function cancelSignIn(): bool {
    return signIn.cancelSignIn()
  }

  function signOut(): bool {
    return signIn.signOut()
  }

  // Shows a list of the account, or with "" none of them.
  function selectFeed(kind: string): bool {
    if (kind !== "") return feeds.select(kind)
    feeds.deselect()
    return true
  }

  // The user chose a row of the shown list, named by its key. A video is
  // played, and the answer says whether it was taken; a playlist is read
  // into feedRows instead.
  function openFeedRow(key: int): bool {
    var track = feeds.openRow(key)
    return track !== null && root.playTrack(track)
  }

  // ---- Sponsor segments ----

  // The user's answer to sponsorPrompt. It becomes the setting, and the
  // setting is what switches skipping on.
  function answerSponsorPrompt(enable: bool) {
    sponsor.answer(enable)
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
    // The saved shortcuts are looked after from here on. Without one saved
    // the compositor is not even asked.
    shortcutKeys.start()
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
    root._watchPosition()
  }

  // mpv reports the position while a page shows it, and while a segment to
  // skip lies ahead, which has to be noticed with every panel closed.
  function _watchPosition() {
    player.setPositionWatch(root._watchers > 0 || sponsor.watching)
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

  function _dropWatchedReport() {
    if (root._strayWatchedReport) root.setSetting("markWatched", false)
  }

  // ---- Starting a video by its id ----

  // Plays the video as a queue of one, or adds it to the end of the queue.
  // Its title arrives with the lookup. Answers "ok", "full" for a queue at
  // its limit, or "unavailable" when nothing may be started.
  function _startId(id, enqueue) {
    if (root._hold) return "unavailable"
    sponsor.userActed()
    if (enqueue) return playback.enqueueId(id)
    return playback.playId(id) ? "ok" : "unavailable"
  }

  // ---- The compositor ----

  // The code behind the connection to the compositor at the end of this
  // file, so that a test can say what the compositor would. One event
  // matters: the configuration was loaded again. That usually wipes what
  // was made inside the compositor at runtime, the window rule and the key
  // binds, and a configuration that failed to load keeps them. The parts
  // find out which, each a moment later (such events come in bursts); the
  // compositor access is told at once, because an answer that is on its
  // way to it was given for the configuration before.
  function _hyprEvent(name) {
    if (name !== "configreloaded") return
    hyprCtl.noteReload()
    videoWindow.compositorReloaded()
    shortcutKeys.compositorReloaded()
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

  // The video plays as a queue of one.
  function _ipcPlay(target) {
    var id = root._ipcVideoId(target)
    return id === "" ? "invalid" : root._startId(id, false)
  }

  // The video goes to the end of the queue, and plays when nothing else
  // does. "full" for a queue at its limit.
  function _ipcEnqueue(target) {
    var id = root._ipcVideoId(target)
    return id === "" ? "invalid" : root._startId(id, true)
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

  // One of three words, and nothing else is looked at.
  function _ipcVideo(action) {
    if (action === "toggle") return root.toggleVideo() ? "ok" : "unhandled"
    if (action === "show") return root.showVideo() ? "ok" : "unhandled"
    if (action === "hide") return root.hideVideo() ? "ok" : "unhandled"
    return "invalid"
  }

  // "next", or the name of an output that is on mpv's list right now. A
  // name is only ever compared with that list. The first request of a
  // session is what makes mpv list its outputs at all, so "next" may come
  // before the list: with a player running the step is taken when the list
  // arrives, and only without one is there nothing to step through.
  function _ipcOutput(name) {
    var text = root._ipcText(name)
    if (text === null) return "invalid"
    root._outputsAsked = true
    if (text === "next") return audioOutputs.cycleOutputSoon() ? "ok" : "unhandled"
    return root.setOutput(text) ? "ok" : "invalid"
  }

  // The name of the output in use, "" for the system default. While
  // nothing plays there is no list, and the saved choice is all there is.
  function _outputInUse() {
    var list = root.outputs
    for (var i = 0; i < list.length; i++) {
      if (list[i].current === true) return list[i].name === "auto" ? "" : list[i].name
    }
    return store.values.outputDevice
  }

  // Holds nothing that the desktop's media interface does not already
  // publish, plus counters, the state of the video window, the name of the
  // audio output and whether a login is in use: no path and no account
  // detail. Without a current track the position is 0, like every other
  // fact about a track: the player still knows where the last one stopped.
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
      video: root.videoState,
      output: root._outputInUse(),
      signedIn: root.signedIn,
      updatePending: root._updatePending(),
      error: root.errorCode
    })
  }

  onShellChanged: if (root.shell) root._hadShell = true
  on_StartableChanged: if (root._startable) root._later(root._settle)
  // A turn later: the write changes what this very property is made of.
  on_StrayWatchedReportChanged: if (root._strayWatchedReport) root._later(root._dropWatchedReport)
  onPanelOpenChanged: if (!root.panelOpen) root._tidySoon()

  // The private directories are checked and made before anything else runs.
  Component.onCompleted: fs.prepare()
  // The parts and their child processes end with this object, and the
  // shortcuts part takes its key binds out of the compositor on its own way
  // out. What the parts left in the runtime directory is removed by a
  // detached command, the one thing that can outlive this moment. No state
  // is written here.
  //
  // The host takes its facade away before it destroys the service of a
  // plugin that is being switched off or removed, and not when the shell
  // merely ends. Only then does the saved login go as well: a plugin that
  // was removed leaves no YouTube login behind, and a restart of the shell
  // signs nobody out. A login that a sign-in was still saving or trying
  // out goes in either case: nobody has seen it work.
  Component.onDestruction: {
    root._life.alive = false
    fs.cleanupDetached((root._hadShell && !root.shell) || signIn.unproven)
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
    // The saved output is chosen before the first track of a fresh mpv.
    startDevice: store.values.outputDevice
    watchOutputs: root._outputsWanted
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
    // For the one lookup the user asks to be made with the account. The
    // resolver never sees the saved login: it hands the call over.
    account: signIn
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
    // Related tracks, for when the queue runs out.
    mixer: search
    persistHistory: root._persistHistory
    hold: root._hold
    onStatusChanged: root._playbackMoved()
    // A track change is a moment at which the position watch matters again.
    onTrackStarted: function(item) { root._panelsOpen() }
  }

  HyprCtl {
    id: hyprCtl
    runner: runner
    tools: root.tools
  }

  VideoWindow {
    id: videoWindow
    player: player
    playback: playback
    resolver: resolver
    hyprCtl: hyprCtl
    store: store
    settings: settingsStore.values
  }

  Shortcuts {
    id: shortcutKeys
    hyprCtl: hyprCtl
    store: store
  }

  AudioOutputs {
    id: audioOutputs
    store: store
    deviceList: player.audioDevices
    activeDevice: player.audioDevice
    playerRuns: player.mpvState === "starting" || player.mpvState === "running"
    // The player stays the only thing that writes to mpv.
    onDeviceWanted: function(name) { player.setAudioDevice(name) }
  }

  SignIn {
    id: signIn
    runner: runner
    tools: root.tools
    fs: fs
    settings: settingsStore.values
    hold: root._hold
    playbackStatus: playback.status
    currentTrack: playback.current
    // The user signed out, or YouTube ended the session. The lists of the
    // account are dropped by the part that holds them. The pictures fetched
    // for their rows go here, with every other picture: which is which is
    // not kept, and a row that is shown later asks again.
    onSignedInChanged: if (!signIn.signedIn) thumbnails.purge()
    // What was looked up with the account goes with the login.
    onSignedOut: resolver.purge(playback.keepIds())
  }

  Feeds {
    id: feeds
    tools: root.tools
    fs: fs
    signIn: signIn
  }

  Sponsor {
    id: sponsor
    runner: runner
    tools: root.tools
    fs: fs
    settings: settingsStore.values
    player: player
    playback: playback
    // Talk in a music video is skipped only while its picture is not seen.
    videoHidden: videoWindow.videoState === "hidden" || videoWindow.videoState === "unavailable"
    onAnswered: function(enable) { root.setSetting("sponsorSkip", enable) }
    onWatchingChanged: root._watchPosition()
  }

  // The compositor says when its configuration was loaded again. Nothing
  // else of what it reports is looked at, and nothing is ever sent this way.
  Connections {
    target: Hyprland

    function onRawEvent(event) {
      root._hyprEvent(String(event.name))
    }
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

    function video(action: string): string {
      return root._ipcVideo(action)
    }

    function output(name: string): string {
      return root._ipcOutput(name)
    }

    function status(): string {
      return root._ipcStatus()
    }
  }
}
