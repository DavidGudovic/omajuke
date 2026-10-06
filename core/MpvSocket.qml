pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Io
import "../lib/Const.js" as Const
import "../lib/MpvProto.js" as MpvProto

// The client end of mpv's control socket. It owns the connection: the
// attempts to open it while mpv starts, the numbering of requests, the
// table of answers that are still due, and the reading of what mpv sends,
// cut into lines under a cap while it arrives.
//
// What is written and what a line means is decided in lib/MpvProto.js. This
// file writes nothing but what MpvProto.encode() returns, and hands on
// nothing but what MpvProto.parse() made of a line.
Item {
  id: root

  // Where mpv listens. Set by the player before open().
  property string path: ""
  readonly property bool connected: _up

  // The pause before each attempt to connect. The first comes a moment
  // after mpv was started, because mpv needs about that long to listen.
  // After the last entry every further attempt waits as long as the last.
  readonly property var _delays: [60, 80, 100, 150, 200, 250]
  readonly property int _maxAttempts: 25
  // The longest a caller may ask an answer to be waited for.
  readonly property int _maxReplyMs: 60000

  property var _sock: null
  property bool _up: false
  property int _attempts: 0
  property double _openedAt: 0
  // Request ids count up for as long as this object lives and are never
  // used twice, so an answer can only ever meet the request it belongs to.
  property int _seq: 0
  // Request id -> { callback, deadline }, for every request whose answer
  // is still due.
  property var _pending: new Map()
  // What MpvProto.feed() holds of an unfinished line.
  property var _feed: null
  property bool _warnedLong: false
  // The connection of an mpv that was told to quit and has not answered
  // yet, the request id of that quit, and what feed() holds for it. It is
  // no connection of ours any more: nothing is sent on it and nothing it
  // says is handed on. It only stays open until the quit is answered.
  property var _leaving: null
  property int _leavingQuit: 0
  property var _leavingFeed: null
  // Shared with every deferred call, so that none of them runs into a
  // service that is already being destroyed.
  property var _life: ({ alive: true })

  // A fresh connection is up. Nothing has been sent on it yet.
  signal opened()
  // A connection that was up has ended, and not because close() was called.
  signal closed()
  // No connection came about in the time allowed.
  signal gaveUp()
  // An event from mpv, as MpvProto.parse() returns it.
  signal message(var object)

  // Begins the attempts to connect. Whatever connection or attempt there
  // was before is dropped first.
  function open() {
    root._drop()
    root._attempts = 0
    root._openedAt = Date.now()
    retry.interval = root._delays[0]
    retry.restart()
  }

  // Drops the connection and stops trying. Every answer that is still due
  // is reported as "disconnected". No signal follows.
  function close() {
    root._drop()
  }

  // Sends one command and returns its request id, or 0 when nothing was
  // sent. callback(error, data), if given, is called exactly once and never
  // before send() has returned: with "" and mpv's data, with mpv's error,
  // with "timeout" when no answer came in time, with "disconnected" when the
  // connection ended first or was not there, with "busy" when too many
  // answers are due already, with "refused" for a command that is not in
  // the vocabulary. options: { async: bool, timeoutMs: int }, both optional.
  function send(command, callback, options): int {
    var id = root._seq + 1
    var line = MpvProto.encode(command, id, options ? options.async === true : false)
    if (line === "") {
      console.warn("omajuke: a command outside the vocabulary was not sent")
      return root._decline(callback, "refused")
    }
    if (!root._up) return root._decline(callback, "disconnected")
    if (root._pending.size >= Const.LIMITS.mpvPending) return root._decline(callback, "busy")
    var wait = options ? Number(options.timeoutMs) : NaN
    if (!(wait >= 1 && wait <= root._maxReplyMs)) wait = Const.TIMEOUTS.replyMs
    root._seq = id
    root._pending.set(id, {
      callback: typeof callback === "function" ? callback : null,
      deadline: Date.now() + wait
    })
    root._sock.write(line)
    root._sock.flush()
    root._armReplyTimer()
    return id
  }

  // Tells mpv to quit and gives the connection up: from this call on it is
  // not connected, every answer that is due is reported as "disconnected"
  // and no signal follows, as after close(). Returns true when the command
  // was written. An attempt that is still running is dropped.
  //
  // Our end is closed when mpv has answered the quit, not right behind it.
  // mpv answers one command at a time and stops reading a client at the
  // first answer it cannot deliver. A quit that follows another command
  // closely (the question about the position, asked whenever playback
  // changes its pace) would be lost with that command's answer, and mpv
  // would idle on until it is ended by a signal. Closing on the answer
  // normally still comes before mpv closes its own end; when mpv is
  // quicker, the host logs one constant line about a peer that hung up.
  function sendQuitAndClose(): bool {
    var sock = root._up ? root._sock : null
    var quit = 0
    if (sock !== null) {
      root._seq += 1
      quit = root._seq
      sock.write(MpvProto.encode(MpvProto.quit(), quit, false))
      sock.flush()
      // Out of _drop()'s reach: this one is closed by _release().
      root._sock = null
    }
    root._drop()
    if (sock === null) return false
    root._leaving = sock
    root._leavingQuit = quit
    return true
  }

  function _decline(callback, error): int {
    if (typeof callback !== "function") return 0
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) root._call(callback, error, undefined)
    })
    return 0
  }

  function _call(callback, error, data) {
    if (callback === null) return
    try {
      callback(error, data)
    } catch (failure) {
      // What was thrown is not logged: a message can carry anything.
      console.warn("omajuke: a reply callback failed")
    }
  }

  // Takes the socket away first and then reports what was still due, so
  // that a callback which sends again meets a closed connection and not a
  // half-closed one. The object is destroyed, never reused: one whose
  // first connect failed can never connect again.
  function _drop() {
    retry.stop()
    replyTimer.stop()
    root._release()
    var sock = root._sock
    var due = root._pending
    root._sock = null
    root._up = false
    root._feed = null
    root._pending = new Map()
    if (sock !== null) {
      sock.connected = false
      sock.destroy()
    }
    due.forEach(function(entry) { root._call(entry.callback, "disconnected", undefined) })
  }

  // Closes the connection of an mpv that was told to quit: it has answered,
  // it has closed its own end, or this socket is wanted for something else.
  function _release() {
    var sock = root._leaving
    root._leaving = null
    root._leavingQuit = 0
    root._leavingFeed = null
    if (sock === null) return
    sock.connected = false
    sock.destroy()
  }

  // What an mpv that was told to quit still says. It is cut into lines
  // under the same cap as everything else, and read for one thing only: the
  // answer to the quit.
  function _farewell(chunk) {
    var fed = MpvProto.feed(root._leavingFeed, chunk, Const.LIMITS.mpvLineChars)
    root._leavingFeed = fed.pending
    for (var i = 0; i < fed.lines.length; i++) {
      var parsed = MpvProto.parse(fed.lines[i])
      if (parsed === null || parsed.kind !== "reply" || parsed.request_id !== root._leavingQuit) continue
      root._release()
      return
    }
  }

  // One attempt: a new socket object every time.
  function _attempt() {
    if (root._up) return
    var elapsed = Date.now() - root._openedAt
    if (root._attempts >= root._maxAttempts || elapsed >= Const.TIMEOUTS.socketMs) {
      root._drop()
      root.gaveUp()
      return
    }
    if (root._sock !== null) root._sock.destroy()
    root._attempts += 1
    var fresh = socketComponent.createObject(root, { path: root.path })
    root._sock = fresh
    if (fresh === null) {
      console.warn("omajuke: the socket could not be created")
    } else {
      fresh.connected = true
      // It may have connected, or been closed again, inside that call.
      if (root._up || root._sock !== fresh) return
    }
    // The next attempt is due whether this one fails with an error, fails
    // silently or just never answers, so the error itself is not listened
    // for; a connection stops the timer. The last pause is cut so that
    // giving up comes no later than the limit.
    var step = Math.min(root._attempts, root._delays.length - 1)
    retry.interval = Math.max(1, Math.min(root._delays[step], Const.TIMEOUTS.socketMs - elapsed))
    retry.restart()
  }

  function _connectionChanged(sock) {
    if (sock.connected) {
      if (root._up) return
      retry.stop()
      root._feed = null
      root._up = true
      root.opened()
      return
    }
    if (!root._up) return
    // mpv closed the connection, or went away.
    root._drop()
    root.closed()
  }

  // What arrives is cut into lines here, under the cap, and each line is
  // handled completely before the next one is looked at. A handler may
  // close the connection; the rest of the chunk is then dropped unread.
  function _read(sock, chunk) {
    var fed = MpvProto.feed(root._feed, chunk, Const.LIMITS.mpvLineChars)
    root._feed = fed.pending
    if (fed.dropped > 0 && !root._warnedLong) {
      root._warnedLong = true
      console.warn("omajuke: a line from the player was too long and was dropped")
    }
    for (var i = 0; i < fed.lines.length; i++) {
      var parsed = MpvProto.parse(fed.lines[i])
      if (parsed === null) continue
      if (parsed.kind === "reply") root._settle(parsed.request_id, parsed.error, parsed.data)
      else root.message(parsed)
      if (sock !== root._sock) return
    }
  }

  // An answer whose request is not in the table (it timed out, or it never
  // was ours) is ignored.
  function _settle(id, error, data) {
    var entry = root._pending.get(id)
    if (entry === undefined) return
    root._pending.delete(id)
    if (root._pending.size === 0) replyTimer.stop()
    root._call(entry.callback, error, data)
  }

  // One timer for all answers: it is set for the one that is due first.
  function _armReplyTimer() {
    var first = Infinity
    root._pending.forEach(function(entry) { first = Math.min(first, entry.deadline) })
    if (first === Infinity) {
      replyTimer.stop()
      return
    }
    replyTimer.interval = Math.max(1, first - Date.now())
    replyTimer.restart()
  }

  function _expire() {
    var now = Date.now()
    var late = []
    root._pending.forEach(function(entry, id) {
      if (entry.deadline <= now) late.push(id)
    })
    var due = []
    for (var i = 0; i < late.length; i++) {
      due.push(root._pending.get(late[i]))
      root._pending.delete(late[i])
    }
    root._armReplyTimer()
    for (var k = 0; k < due.length; k++) root._call(due[k].callback, "timeout", undefined)
  }

  Component.onDestruction: root._life.alive = false

  // Runs only while mpv is starting.
  Timer {
    id: retry
    onTriggered: root._attempt()
  }

  // Runs only while an answer is due.
  Timer {
    id: replyTimer
    onTriggered: root._expire()
  }

  Component {
    id: socketComponent

    // Every handler first makes sure this is still the socket in use, or
    // the one that waits for the answer to its quit: an object that was
    // replaced or closed may still report for a while.
    Socket {
      id: sock

      parser: SplitParser {
        // Raw chunks: a parser that waits for a whole line would hold a
        // line of any length before the cap could apply.
        splitMarker: ""
        onRead: function(chunk) {
          if (sock === root._leaving) root._farewell(chunk)
          else if (sock === root._sock) root._read(sock, chunk)
        }
      }
      onConnectionStateChanged: {
        if (sock === root._leaving) {
          // mpv went without answering: there is nothing left to wait for.
          if (!sock.connected) root._release()
        } else if (sock === root._sock) {
          root._connectionChanged(sock)
        }
      }
    }
  }
}
