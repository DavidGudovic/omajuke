import QtQuick
import "../../ui/Ui.js" as Ui

// Stand-in for Service.qml in the UI harness: every member of the service's
// public surface, for every feature, and nothing behind it.
// Properties are plain writable properties holding what an idle, ready
// service shows; a case sets them to put the view into a state. Functions
// write themselves into `calls` and answer with the value a case put into
// `returns` under their name, or else with a harmless default.
//
// Only `calls`, `returns` and the private `_record` exist here and not on
// the service. The repo test compares the other names with Service.qml.
QtObject {
  id: root

  // ---- Only on the mock ----

  // { name, args } for every function call, in order.
  property var calls: []
  // Answers by function name, for the cases that need a particular one.
  property var returns: ({})

  function _record(name, args, fallback) {
    root.calls.push({ name: name, args: args })
    return Object.prototype.hasOwnProperty.call(root.returns, name) ? root.returns[name] : fallback
  }

  // ---- Identity, injection, readiness ----

  property var shell: null
  property var manifest: null
  property var tools: null
  property string pluginId: "mock.service"
  property string version: Ui.VERSION
  property bool ready: true
  property string fatalCode: ""
  property bool networkHold: false
  property bool mprisAvailable: true

  function acknowledgeProxy() { return root._record("acknowledgeProxy", [], true) }
  // A text no real sentence equals, so a case can tell where a line came from.
  function errorText(code) { return root._record("errorText", [code], "text of " + code) }

  // ---- Playback ----

  property string playbackState: "idle"
  property bool playing: false
  property bool paused: false
  property bool hasTrack: false
  property var currentTrack: null
  property real position: 0
  property real duration: 0
  property bool seekable: false
  property int volume: 70
  property bool muted: false
  property string errorCode: ""
  property string noticeCode: ""
  property string tooltip: "OmaJuke"

  function playPause() { return root._record("playPause", [], true) }
  function stop() { return root._record("stop", [], true) }
  function next() { return root._record("next", [], true) }
  function previous() { return root._record("previous", [], true) }
  function seekTo(seconds) { return root._record("seekTo", [seconds], true) }
  function setVolume(v) { return root._record("setVolume", [v], true) }
  function nudgeVolume(delta) { return root._record("nudgeVolume", [delta], true) }
  function toggleMute() { return root._record("toggleMute", [], true) }
  function setPositionWatch(on) { return root._record("setPositionWatch", [on], true) }
  function positionNow() { return root._record("positionNow", [], root.position) }
  function dismissNotice() { return root._record("dismissNotice", [], true) }
  function playWithAccount() { return root._record("playWithAccount", [], true) }

  // ---- Lists and queue ----

  property var queue: []
  property int queueIndex: -1
  property var recents: []

  function playTrack(track) { return root._record("playTrack", [track], true) }
  function enqueueTrack(track) { return root._record("enqueueTrack", [track], true) }
  function submit(text, enqueue) { return root._record("submit", [text, enqueue], "query") }
  function queuePlay(key) { return root._record("queuePlay", [key], true) }
  function queueRemove(key) { return root._record("queueRemove", [key], true) }
  function queueMove(key, delta) { return root._record("queueMove", [key, delta], true) }
  function queueClear() { return root._record("queueClear", [], true) }
  function clearHistory() { return root._record("clearHistory", [], true) }
  function hintHighlight(id) { return root._record("hintHighlight", [id], true) }

  // ---- Search ----

  property string searchQuery: ""
  property string searchState: "idle"
  property var searchResults: []
  property string searchError: ""

  function clearSearch() { return root._record("clearSearch", [], true) }
  // As the service decides it, short of its text cleaning: the list on
  // screen belongs to this text.
  function matchesSearch(text) {
    var shown = root.searchState === "results" || root.searchState === "searching"
    return root._record("matchesSearch", [text], shown && String(text).trim() === root.searchQuery)
  }

  // ---- Thumbnails, settings, panel ----

  property var thumbs: Object.create(null)
  property var settings: ({
    autoplay: true, maxHeight: 720, videoSize: "quarter", videoCorner: "bottom-right", keepAwake: true,
    sponsorSkip: "ask", markWatched: false, evenVolume: false, rememberHistory: true, preload: true
  })
  property bool panelOpen: false

  function wantThumbs(ids) { return root._record("wantThumbs", [ids], true) }
  function reportThumbError(id) { return root._record("reportThumbError", [id], true) }
  function setSetting(key, value) { return root._record("setSetting", [key, value], true) }
  function notePanelOpen(open) { return root._record("notePanelOpen", [open], true) }
  function openPanel() { return root._record("openPanel", [], true) }
  function closePanel() { return root._record("closePanel", [], true) }
  function togglePanel() { return root._record("togglePanel", [], true) }

  // ---- Video window ----

  // "hidden", "loading", "shown" or "unavailable".
  property string videoState: "hidden"
  // A code while the current track has no picture to show.
  property string videoNote: ""

  function showVideo() { return root._record("showVideo", [], true) }
  function hideVideo() { return root._record("hideVideo", [], true) }
  function toggleVideo() { return root._record("toggleVideo", [], true) }
  function resetVideoPlacement() { return root._record("resetVideoPlacement", [], true) }

  // ---- Shortcuts ----

  // { action, label, combo, status, proposal, note } per action; status is
  // "unassigned", "assigned", "blocked", "failed" or "config".
  property var shortcuts: []
  // "ok", "version", "config-errors" or "no-hyprland".
  property string shortcutsGate: "ok"
  property bool shortcutsBusy: false
  // The first-use question whether to turn shortcuts on is waiting.
  property bool shortcutsPrompt: false

  function refreshShortcuts() { return root._record("refreshShortcuts", [], true) }
  function assignShortcut(action, combo) { return root._record("assignShortcut", [action, combo], true) }
  function unassignShortcut(action) { return root._record("unassignShortcut", [action], true) }
  function answerShortcutsPrompt(enable) { return root._record("answerShortcutsPrompt", [enable], true) }
  function copyShortcutLine(action, combo) { return root._record("copyShortcutLine", [action, combo], true) }
  // "" is what the service answers for a key press that is no shortcut.
  function comboFromKeyEvent(key, modifiers) {
    return root._record("comboFromKeyEvent", [key, modifiers], "")
  }

  // ---- Audio output ----

  // { name, label, current } per output; empty while nothing is playing.
  property var outputs: []
  property string outputName: ""
  // A code while the chosen output is gone.
  property string outputNote: ""

  function setOutput(name) { return root._record("setOutput", [name], true) }
  function cycleOutput() { return root._record("cycleOutput", [], true) }

  // ---- Sign-in and feeds ----

  property bool signedIn: false
  // "off", "confirm", "browser", "exporting", "verifying", "on" or "failed".
  property string signInState: "off"
  property string signInError: ""
  // A login file lies on disk.
  property bool loginSaved: false
  property string signInBrowserPath: ""
  // The list that is selected, "" for none.
  property string feedKind: ""
  // "idle", "loading", "rows", "empty" or "error".
  property string feedState: "idle"
  property var feedRows: []
  // A code while feedState is "error".
  property string feedError: ""
  // The title of the playlist that is open, "" for none.
  property string feedTitle: ""

  function beginSignIn() { return root._record("beginSignIn", [], true) }
  function confirmSignIn() { return root._record("confirmSignIn", [], true) }
  function cancelSignIn() { return root._record("cancelSignIn", [], true) }
  function signOut() { return root._record("signOut", [], true) }
  function selectFeed(kind) { return root._record("selectFeed", [kind], true) }
  function openFeedRow(key) { return root._record("openFeedRow", [key], true) }

  // ---- Sponsor segments ----

  // The question whether to skip sponsor segments is waiting for an answer.
  property bool sponsorPrompt: false
  // { category, from, to } of the last skip, or null.
  property var lastSkip: null

  function answerSponsorPrompt(enable) { return root._record("answerSponsorPrompt", [enable], true) }
}
