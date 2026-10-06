import QtQuick
import "../lib/Const.js" as Const
import "../lib/StateFile.js" as StateFile

// The saved state: state.json, the only personal data OmaJuke keeps on
// disk. This component holds the validated state in memory, loads it once
// after the directories were prepared, and saves it a moment after it
// changed. What may be in the file is decided by lib/StateFile.js; how it
// is read and written privately, by core/PrivateFs.qml.
//
// It owns these rules:
//
//   A file that cannot be read or does not validate is replaced at once by
//   a fresh one. No copy of it is kept anywhere: it would normally hold the
//   whole history, and would outlive Clear history and the history switch.
//
//   While persistHistory is false, recents and queue are not written, and
//   the moment it becomes false the file is rewritten without them. If that
//   rewrite fails, the file is removed instead.
//
//   Nothing is written before the state was loaded, nothing while frozen,
//   and nothing when the service is destroyed.
Item {
  id: root

  // Given by the service: the file layer.
  property var fs: null
  // The user's choice to keep recents and queue on disk. False as long as
  // the settings are not known.
  property bool persistHistory: false
  // True while the host has taken the shell facade away, which it does
  // before it destroys the service on disable and removal. The settings can
  // no longer be trusted then, so nothing more is written.
  property bool frozen: false

  // True once load() has finished: values are the saved state, or the
  // defaults when there was none or it had to be reset.
  readonly property bool loaded: _loaded
  // The validated state (lib/StateFile.js lists its keys). Replaced by a
  // new object on every change; a key that did not change keeps its value.
  readonly property var values: _values
  // "N_STATE_RESET" when the saved state could not be read and was
  // replaced, else "".
  readonly property string notice: _notice

  property bool _loaded: false
  property bool _loading: false
  property var _values: StateFile.defaults()
  property string _notice: ""
  property bool _writing: false
  // A save was asked for while one was running: it follows when that one
  // is done, so the file always ends up as the newest state.
  property bool _again: false
  // The file on disk may hold recents or a queue: it was there at start,
  // or the last save put them in.
  property bool _historyOnDisk: false
  property bool _warned: false
  // Shared with every callback, so that none of them runs into a store
  // that is already being destroyed.
  property var _life: ({ alive: true })

  // Loads the saved state, once, after the file layer reported ready.
  // Returns false when it was not accepted. Without a state file of ours
  // the defaults stand and loaded is true on return; with one, loaded
  // follows when it has been read.
  function load(): bool {
    if (root._loaded || root._loading || root.fs === null || root.fs.status !== "ready") return false
    if (root.fs.stateFilePresent !== true) {
      root._loaded = true
      return true
    }
    root._loading = true
    root._historyOnDisk = true
    var life = root._life
    root.fs.read(root.fs.paths.stateFile, Const.LIMITS.stateBytes, function(result) {
      if (!life.alive) return
      // A file that is too large arrives as a failed read, and parse()
      // refuses text that is not ASCII, not JSON or not version 1.
      var parsed = result.ok ? StateFile.parse(result.stdout) : { ok: false }
      root._loading = false
      if (parsed.ok) {
        root._values = parsed.state
        root._loaded = true
        return
      }
      root._values = StateFile.defaults()
      root._notice = "N_STATE_RESET"
      root._loaded = true
      root.flushNow()
    })
    return true
  }

  // Replaces whole top-level keys of the state (each validated on the way
  // in) and saves a moment later. Returns false before the state was
  // loaded and when changes names no key of the state.
  function patch(changes: var): bool {
    if (!root._loaded) return false
    var next = StateFile.withChanges(root._values, root._plain(changes))
    if (next === null) return false
    root._values = next
    if (!root.frozen) saveTimer.restart()
    return true
  }

  // A copy made of plain objects and arrays, or null. QML hands a list
  // over in more than one form: one that came through a signal or a
  // property map is no array any more. A trip through JSON text makes one
  // form of them.
  function _plain(value) {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch (error) {
      return null
    }
  }

  // Saves now, without the wait. Used when what is on disk must change at
  // once: history was switched off or cleared.
  function flushNow() {
    saveTimer.stop()
    root._write()
  }

  function _write() {
    if (!root._loaded || root.frozen || root.fs === null) return
    if (root._writing) {
      root._again = true
      return
    }
    root._writing = true
    var history = root.persistHistory
    var life = root._life
    var path = root.fs.paths.stateFile
    root.fs.write(path, StateFile.serialize(root._values, history) + "\n", function(result) {
      if (!life.alive) return
      if (result.ok) {
        root._historyOnDisk = history
        root._warned = false
        root._written()
        return
      }
      // A save that failed is not tried again by itself: the next change
      // saves anyway.
      if (!root._warned) {
        root._warned = true
        console.warn("omajuke: the state file could not be written")
      }
      if (history || !root._historyOnDisk) {
        root._written()
        return
      }
      // But a file that may hold history must not outlive the user's
      // choice to keep none: when the save that was to take the history
      // out fails, the file goes. The state lives on in memory and is
      // written again with the next change.
      root.fs.remove([path], function(removed) {
        if (!life.alive) return
        if (removed.ok) root._historyOnDisk = false
        root._written()
      })
    })
  }

  // A save is over, whichever way it went. One that was asked for
  // meanwhile starts now.
  function _written() {
    root._writing = false
    if (!root._again) return
    root._again = false
    root._write()
  }

  // From true to false the file is rewritten at once. From false to true
  // nothing is written until the next change.
  onPersistHistoryChanged: if (!persistHistory) root.flushNow()
  onFrozenChanged: if (frozen) saveTimer.stop()

  Component.onDestruction: root._life.alive = false

  // Runs only between a change and its save.
  Timer {
    id: saveTimer
    interval: Const.TIMEOUTS.saveMs
    onTriggered: root._write()
  }
}
