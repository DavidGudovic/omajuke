pragma ComponentBehavior: Bound

import QtQuick
import "../../../lib/Settings.js" as Settings

// core/SettingsStore.qml against a fake of the host's facade: how the
// plugin's entry in the bar configuration becomes typed settings, what a
// change hands to the host (the whole entry, never a reserved key), and how
// a change that the host has not shown yet is kept from flickering back.
QtObject {
  id: root

  property var h: null
  property string me: ""
  property var steps: []
  property int at: 0

  // A host that takes a change and shows it only when the case says so.
  // The real one writes shell.json first and reads it back a moment later.
  property QtObject slowHost: QtObject {
    property var barConfig: null
    property var entries: []

    function updateEntryInline(id, entry) {
      entries.push(JSON.parse(JSON.stringify(entry)))
      return true
    }
  }

  // A facade made the way the host makes it: created from a component,
  // with the configuration among the initial properties.
  property Component hostFacade: Component {
    QtObject {
      property var barConfig: ({})
      property var entries: []

      function updateEntryInline(id, entry) {
        entries.push(JSON.parse(JSON.stringify(entry)))
        return true
      }
    }
  }

  function run(h) {
    root.h = h
    root.me = h.manifest.id
    root.steps = [
      root.coercion, root.refusals, root.oneChange, root.storedForms, root.noFacade, root.pending,
      root.hostShaped, root.goneFacade, root.quietLog
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // A bar configuration with these entries in the middle of the bar, and
  // another plugin's entries around them.
  function config(entries) {
    return {
      position: "top",
      layout: {
        left: [
          { id: "other.plugin", rememberHistory: false, maxHeight: 480, evenVolume: true }, "clock", null
        ],
        center: entries,
        right: [{ id: "other.plugin" }, 5]
      }
    }
  }

  function mine(settings) {
    var entry = { id: root.me }
    for (var key in settings) entry[key] = settings[key]
    return entry
  }

  function mountStore(shell) {
    return root.h.mount("core/SettingsStore.qml", { shell: shell, pluginId: root.me, mirror: {} })
  }

  // The entries handed to the fake facade since the count was taken.
  function handed(since) {
    return root.h.shell.calls.slice(since).filter(function(call) { return call.name === "updateEntryInline" })
  }

  // The entry as it stands in the fake facade's configuration.
  function shown() {
    return root.h.shell.barConfig.layout.center[0]
  }

  function coercion() {
    var h = root.h
    h.shell.barConfig = root.config([root.mine({
      autoplay: "false", maxHeight: "1080", videoSize: "third", videoCorner: "nowhere", keepAwake: false,
      sponsorSkip: "true", markWatched: "yes", evenVolume: true, custom: "kept", nested: { a: 1 },
      type: "custom", exec: "x", source: "y"
    }), root.mine({ autoplay: true, maxHeight: 480 })])
    var store = root.mountStore(h.shell)
    if (store === null) { h.finish(); return }
    h.check(store.known, "a facade and a mirror make the settings known")
    h.equal(store.values, {
      autoplay: false, maxHeight: 1080, videoSize: "third", videoCorner: "bottom-right", keepAwake: false,
      sponsorSkip: "on", markWatched: false, evenVolume: true, rememberHistory: true, preload: true
    }, "the entry is read into typed settings: text coerced, bad values at their default")
    h.equal(Object.keys(store.values), Object.keys(Settings.DEFAULTS), "all ten keys, in order")
    h.equal(h.shell.calls.length, 0, "reading asks nothing of the host")

    var bare = root.mountStore(h.shell)
    h.shell.barConfig = root.config([{ id: root.me }])
    h.equal(bare.values, Settings.DEFAULTS, "a bare entry gives the defaults")
    h.equal(store.values, Settings.DEFAULTS, "and every store follows the configuration")
    h.shell.barConfig = root.config([root.mine({ sponsorSkip: false }), root.mine({ sponsorSkip: true })])
    h.equal([store.values.sponsorSkip, bare.values.sponsorSkip], ["off", "off"], "the first entry is ours")
    h.shell.barConfig = root.config([root.mine({ sponsorSkip: "ask" })])
    h.equal(store.values.sponsorSkip, "ask", "anything but an answer asks")
    bare.destroy()
    store.destroy()
    root.next()
  }

  function refusals() {
    var h = root.h
    h.shell.barConfig = root.config([root.mine({ evenVolume: true })])
    var store = root.mountStore(h.shell)
    var before = h.shell.calls.length
    var refused = [
      ["volume", 5], ["", true], ["id", "x"], ["type", "custom"], ["exec", "x"], ["source", "y"],
      ["__proto__", true], ["constructor", true], ["toString", true], ["custom", 1], ["Autoplay", true],
      ["autoplay", "yes"], ["autoplay", 1], ["autoplay", null], ["autoplay", undefined], ["maxHeight", 721],
      ["maxHeight", "720p"], ["videoSize", "full"], ["videoCorner", "middle"], ["sponsorSkip", "on"],
      ["sponsorSkip", "ask"], ["rememberHistory", "off"], ["rememberHistory", {}], ["preload", [false]]
    ]
    var answers = []
    for (var i = 0; i < refused.length; i++) answers.push(store.set(refused[i][0], refused[i][1]))
    h.equal(answers.filter(function(answer) { return answer !== false }), [],
      "an unknown key or a value outside the table is refused")
    h.equal(root.handed(before), [], "and nothing is handed to the host for it")
    h.equal(store.values, Settings.coerce({ evenVolume: true }, null, null, true), "nor does a value move")
    store.destroy()
    root.next()
  }

  function oneChange() {
    var h = root.h
    h.shell.barConfig = root.config([root.mine({
      autoplay: "false", maxHeight: "1080", videoCorner: "nowhere", markWatched: "yes", evenVolume: true,
      custom: "kept", nested: { a: 1 }, list: [1], type: "custom", exec: "x", source: "y"
    })])
    var store = root.mountStore(h.shell)
    var before = h.shell.calls.length
    h.check(store.set("evenVolume", false), "a change is accepted")
    var calls = root.handed(before)
    h.equal(calls.length, 1, "one call to the host")
    var entry = {
      id: root.me, autoplay: "false", maxHeight: "1080", videoCorner: "nowhere", markWatched: "yes",
      evenVolume: false, custom: "kept"
    }
    h.equal(calls.length === 1 ? calls[0].args : null, [root.me, entry],
      "the whole entry goes out: our id, every plain key it had, the change in its place")
    var names = calls.length === 1 ? Object.keys(calls[0].args[1]) : []
    h.equal(names.filter(function(name) { return ["type", "exec", "source"].indexOf(name) !== -1 }), [],
      "no reserved key is written back")
    h.equal(root.shown(), entry, "the host replaced the entry with it")
    h.equal([store.values.evenVolume, store.values.autoplay, store.values.maxHeight], [false, false, 1080],
      "the change shows, and the rest still reads the same")

    before = h.shell.calls.length
    h.check(store.set("evenVolume", false), "the same value again is accepted")
    h.equal(root.handed(before).length, 1, "and handed over, which the host sees as no change")
    h.shell.barConfig = root.config([root.mine({ evenVolume: true })])
    h.equal(store.values.evenVolume, true,
      "a later change in the entry is followed: nothing was left pending")
    store.destroy()
    root.next()
  }

  // What is stored is a JSON value, whatever form the caller used.
  function storedForms() {
    var h = root.h
    h.shell.barConfig = root.config([{ id: root.me }])
    var store = root.mountStore(h.shell)
    var changes = [
      ["maxHeight", "480", 480, 480], ["maxHeight", 1080, 1080, 1080], ["videoSize", "half", "half", "half"],
      ["videoCorner", "top-left", "top-left", "top-left"], ["sponsorSkip", true, true, "on"],
      ["sponsorSkip", "false", false, "off"], ["rememberHistory", "false", false, false],
      ["rememberHistory", true, true, true], ["autoplay", false, false, false],
      ["preload", "false", false, false], ["keepAwake", false, false, false],
      ["markWatched", "true", true, true], ["evenVolume", true, true, true]
    ]
    var wrong = []
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i]
      var accepted = store.set(change[0], change[1])
      var stored = root.shown()[change[0]]
      var read = store.values[change[0]]
      if (accepted !== true || stored !== change[2] || read !== change[3]) wrong.push(change)
    }
    h.equal(wrong, [], "each setting is stored as a boolean, a number or one of its words, and reads back")
    h.equal(root.shown(), {
      id: root.me, maxHeight: 1080, videoSize: "half", videoCorner: "top-left", sponsorSkip: false,
      rememberHistory: true, autoplay: false, preload: false, keepAwake: false, markWatched: true,
      evenVolume: true
    }, "one change after the other, each built on the entry before")
    store.destroy()
    root.next()
  }

  function noFacade() {
    var h = root.h
    var store = h.mount("core/SettingsStore.qml", { pluginId: root.me, mirror: {} })
    h.check(store.set("evenVolume", true) === false, "without a facade a change is refused")
    h.check(!store.known, "and the settings are not known")
    var nameless = h.mount("core/SettingsStore.qml", { shell: h.shell, mirror: {} })
    var before = h.shell.calls.length
    h.check(nameless.set("evenVolume", true) === false, "without the plugin's id a change is refused")
    h.equal(root.handed(before), [], "and nothing is handed over")
    store.destroy()
    nameless.destroy()
    root.next()
  }

  function pending() {
    var h = root.h
    var host = root.slowHost
    host.barConfig = root.config([root.mine({ evenVolume: false, custom: "kept" })])
    var store = root.mountStore(host)
    var changes = 0
    store.valuesChanged.connect(function() { changes++ })

    h.check(store.set("evenVolume", true), "a change goes to a host that is slow to show it")
    h.equal(host.entries, [{ id: root.me, evenVolume: true, custom: "kept" }],
      "the host was handed the entry")
    h.equal(host.barConfig.layout.center[0].evenVolume, false, "its configuration still has the old value")
    h.equal(store.values.evenVolume, true, "the setting reads the new value at once")

    // Another plugin saves something: a new configuration, our entry as it was.
    changes = 0
    var other = root.config([root.mine({ evenVolume: false, custom: "kept" })])
    other.layout.left[0].maxHeight = 1080
    host.barConfig = other
    h.equal(store.values.evenVolume, true, "another plugin's change does not make it flicker back")
    h.equal(changes, 0, "and the settings object is not even replaced for it")

    h.check(store.set("maxHeight", 1080), "a second change before the first has landed")
    h.equal(host.entries[1], { id: root.me, evenVolume: true, custom: "kept", maxHeight: 1080 },
      "is built on the first one, so replacing the entry does not undo it")

    host.barConfig = root.config([host.entries[0]])
    h.equal([store.values.evenVolume, store.values.maxHeight], [true, 1080],
      "the first lands: the second is still shown")
    host.barConfig = root.config([host.entries[1]])
    h.equal([store.values.evenVolume, store.values.maxHeight], [true, 1080], "the second lands")

    // Nothing is pending any more, so the entry is followed again.
    host.barConfig = root.config([root.mine({ evenVolume: "false", custom: "kept", maxHeight: 480 })])
    h.equal([store.values.evenVolume, store.values.maxHeight], [false, 480],
      "a later change made elsewhere is followed")

    // Someone else changes the same setting while ours is on its way.
    h.check(store.set("videoSize", "half"), "a change is on its way")
    h.equal(store.values.videoSize, "half", "and shows")
    host.barConfig = root.config([root.mine({ evenVolume: "false", custom: "kept", maxHeight: 480,
      videoSize: "sixth" })])
    h.equal(store.values.videoSize, "sixth", "when the entry moves on to another value, the entry counts")

    // The host hands the value back as text.
    h.check(store.set("keepAwake", false), "one more change")
    host.barConfig = root.config([root.mine({ keepAwake: "false" })])
    h.equal(store.values.keepAwake, false, "it lands spelled as text")
    host.barConfig = root.config([root.mine({ keepAwake: "true" })])
    h.equal(store.values.keepAwake, true, "and was taken as landed: the entry is followed again")
    store.destroy()
    root.next()
  }

  // The first configuration a service ever sees went through the facade's
  // initial properties, and QML hands such a value over as a property map:
  // its lists are no arrays. It must read like any other, or every setting
  // would silently be its default until shell.json next changes.
  function hostShaped() {
    var h = root.h
    var first = root.config([root.mine({ rememberHistory: "false", maxHeight: 1080, evenVolume: true,
      custom: "kept" })])
    var facade = root.hostFacade.createObject(root, { barConfig: first })
    h.check(facade.barConfig !== first && !Array.isArray(facade.barConfig.layout.center),
      "a configuration from initial properties is a property map, and its lists are no arrays")
    var store = h.mount("core/SettingsStore.qml", { pluginId: root.me, mirror: {} })
    store.shell = facade
    h.check(store.known, "it makes the settings known")
    h.equal([store.values.rememberHistory, store.values.maxHeight, store.values.evenVolume],
      [false, 1080, true], "and is read: history is off as the entry says")

    h.check(store.set("preload", false), "a change on top of it")
    var sent = facade.entries.length === 1 ? facade.entries[0] : {}
    h.equal([sent.id, sent.rememberHistory, sent.maxHeight, sent.evenVolume, sent.custom, sent.preload],
      [root.me, "false", 1080, true, "kept", false], "carries every key of the entry")
    h.equal(Object.keys(sent).length, 6, "and nothing else")

    // Later configurations are assigned, and arrive as plain objects.
    var changes = 0
    store.valuesChanged.connect(function() { changes++ })
    var before = JSON.stringify(store.values)
    facade.barConfig = first
    h.check(Array.isArray(facade.barConfig.layout.center), "an assigned configuration keeps its arrays")
    h.equal(JSON.stringify(store.values), before, "the same entry in the other form reads the same")
    facade.barConfig = root.config([root.mine({ rememberHistory: true })])
    h.equal([store.values.rememberHistory, store.values.maxHeight], [true, 720], "and a new one is followed")
    store.destroy()
    facade.destroy()
    root.next()
  }

  // A facade that was destroyed reads as null where it was assigned. Where
  // it arrived as an initial property it is left as an object without
  // members. Neither may make a change throw.
  function goneFacade() {
    var h = root.h
    var facade = root.hostFacade.createObject(root)
    facade.barConfig = root.config([root.mine({ evenVolume: true })])
    var store = h.mount("core/SettingsStore.qml", { shell: facade, pluginId: root.me, mirror: {} })
    h.equal([store.known, store.values.evenVolume], [true, true], "settings from a facade")
    facade.destroy()
    h.after(200, function() {
      h.check(store.shell !== null, "the destroyed facade is still an object here")
      h.check(store.set("evenVolume", false) === false, "a change is refused, not thrown")
      h.equal([store.known, store.values.evenVolume], [true, true], "and the settings stay what they were")
      store.destroy()
      root.next()
    })
  }

  function quietLog() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.length > 0, "the log can be read")
    h.check(log.indexOf("Binding loop") === -1, "no binding loop was reported")
    h.check(log.indexOf("SettingsStore") === -1 && log.indexOf("Error") === -1, "the store logged nothing")
    root.next()
  }
}
