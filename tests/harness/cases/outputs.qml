import QtQuick
import "../../../lib/Const.js" as Const

// core/AudioOutputs.qml with this case standing in for the player and for
// the state store: it hands over what mpv would report and writes down what
// mpv would be told. What is shown: the list holds the system default and
// the sinks and nothing else; a choice is sent to the player only, and is
// saved; a saved choice is applied inside the very report that first lists
// the device, so that a fresh mpv has it before its first track; a device
// that disappears is replaced by the system default with a note, and taken
// up again when it is back; and nothing that is not a device name on the
// list is ever sent, whoever asks.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  // Every device mpv was told to use, in order.
  property var sent: []
  // Whether mpv reports a new device as soon as it is told, as it does.
  property bool confirms: true
  // The components made so far. They share one store, so each is cut off
  // from it before the next is made.
  property var made: []

  readonly property string speakers: "pipewire/example_output.speakers"
  readonly property string headset: "pipewire/example_output.headset-00_00_00_00_00_00"
  readonly property string note: "N_OUTPUT_FALLBACK"

  // What the state store is to the component: the saved values, and
  // patch(), which this one writes down and carries out at once.
  property QtObject store: QtObject {
    id: fakeStore

    property var values: ({ outputDevice: "" })
    property var patches: []

    function patch(changes) {
      fakeStore.patches.push(JSON.parse(JSON.stringify(changes)))
      fakeStore.values = { outputDevice: changes.outputDevice }
      return true
    }
  }

  // A list that reaches the component through a typed property.
  property list<var> typed: [
    { name: "auto", description: "Autoselect device" },
    { name: "pipewire/example_output.speakers", description: "Example Speakers Analog Stereo" }
  ]

  // A report in the shape mpv sends: the automatic entry, each backend's
  // own default, then every device once per backend that can reach it.
  function report(withHeadset) {
    var list = [
      { name: "auto", description: "Autoselect device" },
      { name: "pipewire", description: "Default (pipewire)" },
      { name: root.speakers, description: "Example Speakers Analog Stereo" }
    ]
    if (withHeadset) list.push({ name: root.headset, description: "Example Headset" })
    return list.concat([
      { name: "pulse/example_output.speakers", description: "Example Speakers Analog Stereo" },
      { name: "alsa/default", description: "Default ALSA Output" },
      { name: "jack", description: "Default (jack)" }
    ])
  }

  function entry(name, label, current) {
    return { name: name, label: label, current: current }
  }

  // The list with the entry of that name flagged.
  function listed(current, withHeadset) {
    var list = [
      root.entry("auto", "System default", current === "auto"),
      root.entry(root.speakers, "Example Speakers Analog Stereo", current === root.speakers)
    ]
    if (withHeadset) list.push(root.entry(root.headset, "Example Headset", current === root.headset))
    return list
  }

  // A component of its own, wired the way the service wires it.
  function make(saved) {
    for (var i = 0; i < root.made.length; i++) {
      root.made[i].store = null
      root.made[i].deviceList = null
    }
    fakeStore.values = { outputDevice: saved }
    fakeStore.patches = []
    root.sent = []
    root.confirms = true
    var outputs = root.h.mount("core/AudioOutputs.qml", { store: fakeStore })
    if (outputs === null) return null
    root.made.push(outputs)
    outputs.deviceWanted.connect(function(name) {
      root.sent.push(name)
      if (root.confirms) outputs.activeDevice = name
    })
    return outputs
  }

  function facts(outputs) {
    return [outputs.outputs, outputs.outputName, outputs.outputNote]
  }

  // Without mpv there is no list: only the saved choice is known.
  function idle(outputs) {
    var h = root.h
    h.equal(root.facts(outputs), [[], "System default", ""], "idle: no list, the default by name, no note")
    h.check(Array.isArray(outputs.outputs), "idle: the list is an array all the same")
    h.equal([outputs.setOutput("auto"), outputs.setOutput(root.speakers), outputs.cycleOutput()],
      [false, false, false], "idle: nothing can be chosen")
    h.equal([root.sent, fakeStore.patches], [[], []], "idle: nothing is sent and nothing saved")
  }

  function firstList(outputs) {
    var h = root.h
    outputs.activeDevice = "auto"
    outputs.deviceList = root.report(true)
    h.equal(root.facts(outputs), [root.listed("auto", true), "System default", ""],
      "list: the system default and the two sinks, the default in use")
    h.equal([root.sent, fakeStore.patches], [[], []], "list: with the default saved, mpv is told nothing")
  }

  function choosing(outputs) {
    var h = root.h
    var before = outputs.outputs
    h.equal(outputs.setOutput(root.headset), true, "choose: a name on the list is accepted")
    h.equal(root.sent, [root.headset], "choose: mpv is told once")
    h.equal(fakeStore.patches, [{ outputDevice: root.headset }], "choose: and the choice is saved")
    h.equal(root.facts(outputs), [root.listed(root.headset, true), "Example Headset", ""],
      "choose: the list flags the new device")
    h.check(outputs.outputs !== before && before[0].current === true,
      "choose: a new list was published and the old one is as it was")
    h.equal(outputs.setOutput(root.headset), true, "choose: choosing it again is fine")
    h.equal([root.sent.length, fakeStore.patches.length], [1, 1], "choose: and changes nothing")

    // Only what the list offers can be chosen, whatever mpv itself lists.
    var refused = [
      "", "pipewire", "alsa/default", "pulse/example_output.speakers", "jack", "pipewire/example_output.gone",
      "constructor", "__proto__", "toString", root.headset + " ", " " + root.headset, "AUTO",
      root.headset + "\nquit", "pipewire/" + new Array(202).join("a")
    ]
    var taken = refused.filter(function(name) { return outputs.setOutput(name) !== false })
    h.equal(taken, [], "choose: a name that is not on the list is refused")
    h.equal([root.sent.length, fakeStore.patches.length, outputs.outputName], [1, 1, "Example Headset"],
      "choose: and neither sent nor saved")

    h.equal(outputs.setOutput("auto"), true, "choose: the system default can be chosen")
    h.equal([root.sent, fakeStore.patches[1]], [[root.headset, "auto"], { outputDevice: "" }],
      "choose: mpv is told, and it is saved as no choice")
  }

  function cycling(outputs) {
    var h = root.h
    root.sent = []
    fakeStore.patches = []
    h.equal([outputs.cycleOutput(), outputs.cycleOutput(), outputs.cycleOutput(), outputs.cycleOutput()],
      [true, true, true, true], "cycle: four steps")
    h.equal(root.sent, [root.speakers, root.headset, "auto", root.speakers],
      "cycle: down the list and round to its top")
    h.equal(fakeStore.patches.map(function(patch) { return patch.outputDevice }),
      [root.speakers, root.headset, "", root.speakers], "cycle: every step is a saved choice")
    // Two steps before mpv has confirmed the first are still two steps.
    root.confirms = false
    h.equal([outputs.cycleOutput(), outputs.cycleOutput()], [true, true], "cycle: two quick steps")
    h.equal(root.sent.slice(4), [root.headset, "auto"], "cycle: each moves on from the one before")
    h.equal(outputs.outputs, root.listed("auto", true), "cycle: the list shows where it is going")
    outputs.activeDevice = root.headset
    outputs.activeDevice = "auto"
    h.equal(root.sent.length, 6, "cycle: mpv catching up is not answered with more commands")
    root.confirms = true
    // One entry is nothing to cycle through.
    outputs.deviceList = [{ name: "auto", description: "Autoselect device" }]
    h.equal(outputs.cycleOutput(), false, "cycle: a list of one has no next entry")
    outputs.deviceList = root.report(true)
  }

  // The chosen device goes away while it is in use, and comes back.
  function fallingBack(outputs) {
    var h = root.h
    outputs.setOutput(root.headset)
    root.sent = []
    fakeStore.patches = []
    outputs.deviceList = root.report(false)
    h.equal(root.sent, ["auto"], "gone: mpv is moved to the system default")
    h.equal(root.facts(outputs), [root.listed("auto", false), "System default", root.note],
      "gone: the list shows the default in use, and the note says why")
    h.equal([fakeStore.patches, fakeStore.values.outputDevice], [[], root.headset],
      "gone: the choice stays saved")
    // Another report without it changes nothing.
    outputs.deviceList = root.report(false).concat([{ name: "pipewire/example_output.monitor" }])
    h.equal([root.sent.length, outputs.outputNote, outputs.outputs.length], [1, root.note, 3],
      "gone: a further report without it is not answered again")
    outputs.deviceList = root.report(true)
    h.equal(root.sent, ["auto", root.headset], "back: the choice is taken up again")
    h.equal(root.facts(outputs), [root.listed(root.headset, true), "Example Headset", ""],
      "back: and the note is gone")
    h.equal(fakeStore.patches, [], "back: nothing was saved on the way")

    // While the default stands in, another choice ends the stand-in.
    outputs.deviceList = root.report(false)
    h.equal(outputs.outputNote, root.note, "choice: the default stands in again")
    h.equal(outputs.setOutput(root.speakers), true, "choice: another device is chosen meanwhile")
    h.equal([outputs.outputNote, fakeStore.values.outputDevice, root.sent.slice(2)],
      ["", root.speakers, ["auto", root.speakers]], "choice: no note, the new choice saved and sent")
    outputs.deviceList = root.report(true)
    h.equal(root.sent.length, 4, "choice: the old device coming back moves nothing")
    outputs.setOutput(root.headset)
  }

  // mpv goes away: the list goes with it, the choice does not.
  function goingIdle(outputs) {
    var h = root.h
    root.sent = []
    outputs.deviceList = []
    outputs.activeDevice = ""
    h.equal(root.facts(outputs), [[], "Example Headset", ""],
      "stopped: no list, and the choice by the name the last list gave it")
    h.equal(outputs.setOutput(root.headset), false, "stopped: nothing can be chosen")
    var none = [null, undefined, "auto", 5, {}, { length: 1, 0: { name: "auto" } }, [[]], [null, 5, "auto"]]
    for (var i = 0; i < none.length; i++) {
      outputs.deviceList = none[i]
      h.equal(root.facts(outputs), [[], "Example Headset", ""], "stopped: report " + i + " is no list")
    }
    h.equal(root.sent, [], "stopped: nothing is sent to an mpv that is not there")
  }

  // A new mpv, in the same service and in a new one.
  function startingAgain(outputs) {
    var h = root.h
    root.confirms = false
    outputs.deviceList = root.report(true)
    // Read right behind the assignment: the command left inside it.
    h.equal(root.sent, [root.headset], "restart: the choice is sent within the first report")
    h.equal(outputs.outputs, root.listed(root.headset, true), "restart: and counts as in use from then")
    outputs.deviceList = root.report(true)
    outputs.deviceList = root.report(true).concat([{ name: "pipewire/example_output.monitor" }])
    h.equal(root.sent.length, 1, "restart: a second report before mpv confirmed repeats nothing")
    outputs.activeDevice = root.headset
    h.equal([root.sent.length, outputs.outputNote], [1, ""], "restart: mpv confirms, and that is all")

    var fresh = root.make(root.headset)
    if (fresh === null) return
    h.equal(root.facts(fresh), [[], "example_output.headset-00_00_00_00_00_00", ""],
      "new service: the saved device is known by its own name until a list describes it")
    fresh.deviceList = root.report(true)
    h.equal([root.sent, fakeStore.patches], [[root.headset], []],
      "new service: the saved choice is sent within the first report, and not saved again")
    h.equal(fresh.outputName, "Example Headset", "new service: the list gives it its label")

    // Saved, but not there when mpv starts.
    var missing = root.make(root.headset)
    if (missing === null) return
    missing.deviceList = root.report(false)
    h.equal([root.sent, missing.outputNote, missing.outputs], [[], root.note, root.listed("auto", false)],
      "missing at start: mpv is on the default already; only the note appears")
    missing.deviceList = root.report(true)
    h.equal([root.sent, missing.outputNote], [[root.headset], ""], "missing at start: used once it appears")
  }

  // The state file is text anyone can write, and a device names itself.
  function hostile() {
    var h = root.h
    var saved = [
      "constructor", "__proto__", "alsa/default", "pipewire", "pipewire/", "pipewire/a b", "auto",
      "pipewire/sink\"; quit", "pipewire/" + new Array(202).join("a")
    ]
    for (var i = 0; i < saved.length; i++) {
      var outputs = root.make(saved[i])
      if (outputs === null) return
      outputs.deviceList = root.report(true)
      h.equal([root.sent, outputs.outputNote, outputs.outputName, outputs.outputs],
        [[], "", "System default", root.listed("auto", true)], "saved " + i + ": no device, so the default")
    }

    var named = root.make("")
    if (named === null) return
    var crowd = [{ name: "auto" }]
    for (var n = 1; n <= 80; n++) crowd.push({ name: "pipewire/sink-" + n, description: "Sink " + n })
    crowd[1].description = "\u202eEvil\u0000 \u200b  Speakers\n" + new Array(200).join("x")
    crowd[2].description = ""
    crowd[3].description = { toString: null }
    crowd.push({ name: "pipewire/sink-1", description: "A second one of that name" })
    named.deviceList = crowd
    var list = named.outputs
    h.equal(list.length, 64, "labels: the list holds sixty-four entries at most")
    h.equal([list[1].label.slice(0, 16), list[1].label.length, list[2].label, list[3].label],
      ["Evil Speakers xx", 80, "sink-2", "sink-3"],
      "labels: cleaned and cut, and a device without a description goes by its name")
    var plain = list.filter(function(entry) { return /^[\x20-\x7e]*$/.test(entry.label) })
    h.equal(plain.length, 64, "labels: none holds a character that is not printable")
    h.equal(list.filter(function(entry) { return entry.name === "pipewire/sink-1" }).length, 1,
      "labels: a name is listed once")
    h.equal(Object.keys(list[1]), ["name", "label", "current"], "labels: an entry has three members")

    named.deviceList = root.typed
    h.equal(named.outputs, root.listed("auto", false), "typed: a list from a typed property is read too")
    h.equal(named.setOutput(root.speakers), true, "typed: and chosen from")
    h.equal(root.sent, [root.speakers], "typed: as from any other")
  }

  // A step that is asked for before the list is there: nobody had watched
  // the outputs, and the request is what makes the player ask for them. It
  // is taken when the list arrives, once, and never without a player.
  function steppingEarly() {
    var h = root.h
    var early = root.make("")
    if (early === null) return
    h.equal(early.cycleOutputSoon(), false, "early: without a player there is nothing to wait for")
    early.deviceList = root.report(true)
    h.equal([root.sent, fakeStore.patches], [[], []], "early: and a list that comes later moves nothing")
    early.deviceList = []

    early.playerRuns = true
    h.equal(early.cycleOutputSoon(), true, "early: with a player running the step is taken on")
    h.equal([root.sent, fakeStore.patches], [[], []], "early: nothing is sent before a list is there")
    early.deviceList = root.report(true)
    h.equal(root.sent, [root.speakers], "early: the list arrives, and the step is taken")
    h.equal(fakeStore.patches, [{ outputDevice: root.speakers }], "early: and saved like any other choice")
    h.equal(root.facts(early), [root.listed(root.speakers, true), "Example Speakers Analog Stereo", ""],
      "early: the list flags the new device")
    early.deviceList = root.report(false)
    early.deviceList = root.report(true)
    h.equal(root.sent, [root.speakers], "early: a later list takes no second step")
    h.equal(early.cycleOutputSoon(), true, "early: with a list there, a step is taken at once")
    h.equal(root.sent, [root.speakers, root.headset], "early: to the next device")

    // The player goes before its list came: the step goes with it.
    var gone = root.make("")
    if (gone === null) return
    gone.playerRuns = true
    h.equal(gone.cycleOutputSoon(), true, "gone: the step is taken on")
    gone.playerRuns = false
    gone.playerRuns = true
    gone.deviceList = root.report(true)
    h.equal([root.sent, fakeStore.patches], [[], []],
      "gone: the list of the next player moves nothing, the request was for the one before")
  }

  // A list that does not come in the time an answer may take: the step is
  // given up, so that it cannot come as a surprise much later.
  function steppingLate(then) {
    var h = root.h
    var late = root.make("")
    if (late === null) { then(); return }
    late.playerRuns = true
    h.equal(late.cycleOutputSoon(), true, "late: the step is taken on")
    h.after(Const.TIMEOUTS.replyMs + 400, function() {
      late.deviceList = root.report(true)
      h.equal([root.sent, fakeStore.patches], [[], []], "late: a list that comes too late moves nothing")
      then()
    })
  }

  function run(h) {
    root.h = h
    var outputs = root.make("")
    if (outputs === null) { h.finish(); return }
    root.idle(outputs)
    root.firstList(outputs)
    root.choosing(outputs)
    root.cycling(outputs)
    root.fallingBack(outputs)
    root.goingIdle(outputs)
    root.startingAgain(outputs)
    root.hostile()
    root.steppingEarly()
    root.steppingLate(function() { h.finish() })
  }
}
