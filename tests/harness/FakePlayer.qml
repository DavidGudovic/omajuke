import QtQuick

// A scripted stand-in for core/Player.qml, for cases that test what is
// handed a player without mpv, a socket or a child process. It has the
// members such a component sees: the facts it may read, the signals it may
// connect to and the functions it may call. The facts are plain properties
// the case sets, the signals are emitted by the case (player.started(3)),
// and every command is written down in "calls" instead of being carried out.
//
// What only the service sets on the real player (tool paths, the start
// volume and so on) is left out: nothing that is given a player reads it.
// Members the real player gains in a later version are added here with it,
// so that a call to one of them fails in a case as it would in the shell.
QtObject {
  id: root

  // ---- Record ----

  // Every command the player was given, in order, as { name, args }.
  // Questions (positionNow) are not listed: they change nothing.
  property var calls: []

  // ---- Facts, set by the case ----

  property string mpvState: "off"
  property string phase: "idle"
  property int currentKey: 0
  property bool hasFile: false
  property real position: 0
  property real duration: 0
  property int volume: 70
  property bool muted: false
  // The keys of mpv's playlist, in its order, as mpv last reported them.
  // The real player changes this only when mpv reports, and empties it when
  // it is told to stop. A case sets it, or calls report().
  property var entryKeys: []

  // The real player shows its own loads and removals in entryKeys at once
  // and lets mpv's reports correct it afterwards. With "eager" the stand-in
  // does the same. Without, entryKeys changes only at report(), which is
  // the harder case for whatever plans from it: it sees nothing of what it
  // sent until mpv has answered.
  property bool eager: false

  // What mpv's playlist would hold after every command so far, whether or
  // not it has been "reported" yet, and the keys holds() answers true for.
  property var _playlist: []
  property var _held: []

  // ---- Signals, emitted by the case ----

  signal loading(int key)
  signal started(int key)
  signal ended(int key, string reason, string fileError)
  signal idle()
  signal exited(bool crashed)
  signal failed(string code)
  signal videoClosed()

  // ---- Script ----

  function clearCalls() {
    root.calls = []
  }

  // The names of the recorded commands, for a short assertion on order.
  function names() {
    return root.calls.map(function(call) { return call.name })
  }

  // The arguments are copied as they are now: a caller that changes an
  // object afterwards must not change what the record says was sent.
  function _record(name, args) {
    root.calls.push({ name: name, args: JSON.parse(JSON.stringify(args)) })
  }

  // mpv reports its playlist: entryKeys becomes what the commands so far
  // have made of it.
  function report() {
    root.entryKeys = root._playlist.slice()
  }

  // Something other than a command of ours changed mpv's playlist (a media
  // control that shuffles it, say), and mpv reports the result.
  function setPlaylist(keys) {
    root._playlist = keys.slice()
    root.report()
  }

  // The playlist mpv would hold now, reported or not. A case asserts on it
  // that no command hit an entry it was not meant for.
  function playlist() {
    return root._playlist.slice()
  }

  // mpv begins to open the entry with this key, because it was told to or
  // of its own accord: the key becomes the current one and the file is
  // reported, as the real player does it. mpv can only open what its
  // playlist holds; for anything else this answers false and does nothing,
  // so that a case cannot script a move mpv could not make.
  function open(key) {
    if (root._playlist.indexOf(key) === -1) return false
    root.currentKey = key
    root.hasFile = true
    root.loading(key)
    return true
  }

  // That entry starts to play.
  function begin(key) {
    root.phase = "playing"
    root.started(key)
  }

  // The real player forgets every entry and reports no key, no phase and an
  // empty playlist from the moment it is told to stop, before mpv has
  // answered. What uses a player relies on that, so the stand-in does the
  // same.
  function _forget() {
    root.currentKey = 0
    root.phase = "idle"
    root.hasFile = false
    root._playlist = []
    root._held = []
    root.entryKeys = []
  }

  // ---- The player's functions ----

  // A command changes a fact only where the real player changes it inside
  // the call itself. Whatever mpv would report later (a load that starts, a
  // pause that takes effect) is for the case to script.

  // A replacing load leaves mpv with that one entry; the other two modes
  // add to what it holds, in front or at the end.
  function load(key, id, title, infoFile, opts) {
    root._record("load", [key, id, title, infoFile, opts])
    var mode = opts !== null && typeof opts === "object" ? opts.mode : ""
    if (mode === "append-play") {
      root._playlist.push(key)
    } else if (mode === "insert-at") {
      root._playlist.splice(opts.index, 0, key)
    } else {
      root._playlist = [key]
      root._held = []
    }
    if (root._held.indexOf(key) === -1) root._held.push(key)
    if (root.eager) root.report()
  }

  // True from the moment a load for this key was sent until it is replaced
  // or removed, whether or not mpv has reported the entry.
  function holds(key) {
    return root._held.indexOf(key) !== -1
  }

  // The real player turns the key into a playlist position through what mpv
  // last reported, and sends nothing for a key that is not in that report.
  // The stand-in removes whatever sits at that position by now, which is
  // another entry when the report is older than the playlist.
  function removeKey(key) {
    root._record("removeKey", [key])
    var at = root.entryKeys.indexOf(key)
    if (at === -1) return
    if (at < root._playlist.length) root._playlist.splice(at, 1)
    root._held = root._held.filter(function(held) { return held !== key })
    if (root.eager) root.report()
  }

  function setPause(paused) {
    root._record("setPause", [paused])
  }

  function seek(seconds) {
    root._record("seek", [seconds])
    root.position = seconds
  }

  function setVolume(v) {
    root._record("setVolume", [v])
  }

  function setMuted(m) {
    root._record("setMuted", [m])
  }

  function setEvenVolume(on) {
    root._record("setEvenVolume", [on])
  }

  function setPositionWatch(on) {
    root._record("setPositionWatch", [on])
  }

  function positionNow() {
    return root.position
  }

  function stopPlayback() {
    root._record("stopPlayback", [])
    root._forget()
  }

  function shutdown() {
    root._record("shutdown", [])
    root._forget()
    root.mpvState = "off"
  }
}
