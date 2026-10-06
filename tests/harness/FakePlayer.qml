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

  // ---- Signals, emitted by the case ----

  signal loading(int key)
  signal started(int key)
  signal ended(int key, string reason, string fileError)
  signal idle()
  signal exited(bool crashed)
  signal failed(string code)

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

  // The real player forgets every entry and reports no key and no phase from
  // the moment it is told to stop, before mpv has answered. What uses a
  // player relies on that, so the stand-in does the same.
  function _forget() {
    root.currentKey = 0
    root.phase = "idle"
    root.hasFile = false
  }

  // ---- The player's functions ----

  // A command changes a fact only where the real player changes it inside
  // the call itself. Whatever mpv would report later (a load that starts, a
  // pause that takes effect) is for the case to script.

  function load(key, id, title, infoFile, opts) {
    root._record("load", [key, id, title, infoFile, opts])
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
