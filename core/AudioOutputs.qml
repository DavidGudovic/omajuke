import QtQuick
import "../lib/Const.js" as Const
import "../lib/Devices.js" as Devices

// Audio outputs: which device this player's sound goes to. It owns the list
// the user chooses from, the choice, and what happens when the chosen device
// goes away. The choice moves only this player's stream; the default output
// of the system is never touched.
//
// It talks to nothing. What mpv reports arrives in two properties, and what
// mpv has to be told leaves as a signal, so that the player stays the only
// thing that ever writes to mpv. Every decision about a list is made by
// lib/Devices.js; this file keeps the state those decisions need.
//
// The list exists only while mpv runs. In between, only the saved choice is
// known, and it is taken up again as soon as a list arrives. Everything here
// happens inside the change that caused it, never a turn later: a fresh mpv
// reports its devices before it is given its first track, and the device has
// to be chosen in that moment or the track would begin on another one.
Item {
  id: root

  // ---- Given by the service ----

  // The state store. Its values.outputDevice is the saved choice (a device
  // name, or "" for the system default); only patch() is called.
  property var store: null
  // What mpv last reported as its list of audio devices, as it came. While
  // no mpv is connected this has to be empty or no list at all.
  property var deviceList: null
  // The device mpv says it is set to, "" while that is not known.
  property string activeDevice: ""
  // Whether an mpv runs: only then can a list still arrive.
  property bool playerRuns: false

  // ---- What the service re-exports ----

  // The outputs on offer, as { name, label, current }: the system default
  // and the sinks, current being true for the one in use. Empty while no
  // mpv runs. A new array on every change.
  readonly property var outputs: _marked
  // What to call the output in use: its label. While no mpv runs, the label
  // of the saved choice.
  readonly property string outputName: _shown
  // "N_OUTPUT_FALLBACK" while the system default stands in for a chosen
  // device that is not on the list, "" otherwise.
  readonly property string outputNote: _note

  // ---- Private ----

  readonly property string _saved: {
    var values = root.store ? root.store.values : null
    return values && typeof values.outputDevice === "string" ? values.outputDevice : ""
  }
  // The choice in force. It follows the saved one, and leads it for the
  // moment between a choice and its being saved.
  property string _choice: ""
  // The list on offer, as { name, label }.
  property var _offered: []
  property var _marked: []
  property string _shown: ""
  property string _note: ""
  // The device mpv was last told to use and has not confirmed yet, "" for
  // none. Until mpv confirms, its own word is older than the request, so
  // the request is what counts as in use; that also keeps a second report
  // of the same list from repeating the command.
  property string _asked: ""
  // { name, label } of the chosen device as a list last described it, so
  // that it keeps its name while no list is there. Never saved: a device
  // names itself.
  property var _known: ({ name: "", label: "" })
  // A step to the next output that was asked for before any list was
  // there. It is taken when the list arrives, and given up when the player
  // goes or the list does not come in the time an answer of mpv may take.
  property bool _stepDue: false

  // ---- Signals ----

  // mpv has to be told to use this device. The name is on the list mpv
  // last reported, or it is the system default.
  signal deviceWanted(string name)

  // ---- Requests ----

  // Chooses an output by its name. False when the name is not on the list,
  // which it never is while no mpv runs.
  function setOutput(name: string): bool {
    if (!Devices.has(root._offered, name)) return false
    var choice = name === Devices.AUTO ? "" : name
    if (choice !== root._choice) {
      root._choice = choice
      if (root.store !== null) root.store.patch({ outputDevice: choice })
    }
    root._review()
    return true
  }

  // Moves on to the next output of the list, wrapping at its end. False
  // when there is nothing to move to.
  function cycleOutput(): bool {
    var name = Devices.next(root._offered, root._inUse())
    return name !== "" && root.setOutput(name)
  }

  // The same step for a request from outside the panel, which can come
  // when nobody has watched the outputs yet: the caller has asked for the
  // list in the same moment, and with a player running it is on its way.
  // The step is then taken as soon as the list is there. Returns false
  // when there is nothing to move to and nothing to wait for.
  function cycleOutputSoon(): bool {
    if (root._offered.length > 0) return root.cycleOutput()
    if (!root.playerRuns) return false
    root._stepDue = true
    stepTimer.restart()
    return true
  }

  function _dropStep() {
    root._stepDue = false
    stepTimer.stop()
  }

  // ---- Decisions ----

  // The saved choice as a device name, or "" for the system default. The
  // state file is only text: a name that could never be on a list counts as
  // no choice, or the default would stand in for it for ever.
  function _wanted() {
    var choice = root._choice
    return choice !== Devices.AUTO && Devices.has([{ name: choice }], choice) ? choice : ""
  }

  function _inUse() {
    if (root._asked !== "") return root._asked
    return root.activeDevice !== "" ? root.activeDevice : Devices.AUTO
  }

  // A list as the functions of lib/Devices.js want it: a plain array. A
  // list that came through a property of another type is none, and a trip
  // through JSON text makes one of it.
  function _plain(value) {
    if (Array.isArray(value)) return value
    try {
      var copy = JSON.parse(JSON.stringify(value))
      return Array.isArray(copy) ? copy : []
    } catch (error) {
      return []
    }
  }

  function _labelOf(list, name) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) return list[i].label
    }
    return ""
  }

  // Looks at everything again: the list, the choice, what mpv uses. Called
  // whenever one of them changed.
  function _review() {
    var offered = Devices.filter(root._plain(root.deviceList))
    root._offered = offered
    if (offered.length === 0) {
      // No mpv, or one that has not reported yet. A request to the last one
      // went with it: the next mpv starts on the system default.
      root._asked = ""
      root._note = ""
      root._publish()
      return
    }
    var wanted = root._wanted()
    var label = wanted === "" ? "" : root._labelOf(offered, wanted)
    if (label !== "") root._known = { name: wanted, label: label }
    var decision = Devices.plan(offered, wanted, root._inUse())
    // mpv keeps the name of a device that has gone, whatever becomes of the
    // sound, so the default is asked for in its place. The choice stays,
    // and is taken up again when a list has the device once more.
    root._note = decision.fallback ? "N_OUTPUT_FALLBACK" : ""
    if (decision.send) root._asked = decision.device
    root._publish()
    // Last, with everything in place: whoever carries the request out may
    // report its effect before this call returns.
    if (decision.send) root.deviceWanted(decision.device)
    // The list a step was waiting for is here.
    if (root._stepDue) {
      root._dropStep()
      root.cycleOutput()
    }
  }

  function _publish() {
    var marked = Devices.mark(root._offered, root._inUse())
    var shown = ""
    for (var i = 0; i < marked.length; i++) {
      if (marked[i].current) shown = marked[i].label
    }
    if (shown === "") {
      var wanted = root._wanted()
      var name = wanted === "" ? Devices.AUTO : wanted
      // Without a list the device is called what the last list called it,
      // or by its own name.
      var named = Devices.mark([{ name: name }], "")
      shown = root._known.name === name ? root._known.label : (named.length > 0 ? named[0].label : "")
    }
    root._marked = marked
    root._shown = shown
  }

  // ---- Wiring ----

  on_SavedChanged: {
    if (root._saved === root._choice) return
    root._choice = root._saved
    root._review()
  }
  onDeviceListChanged: root._review()
  onActiveDeviceChanged: {
    if (root.activeDevice === root._asked) root._asked = ""
    root._review()
  }

  onPlayerRunsChanged: if (!root.playerRuns) root._dropStep()

  Component.onCompleted: {
    root._choice = root._saved
    root._review()
  }

  // A step that still waits after this long would come as a surprise.
  Timer {
    id: stepTimer
    interval: Const.TIMEOUTS.replyMs
    onTriggered: root._stepDue = false
  }
}
