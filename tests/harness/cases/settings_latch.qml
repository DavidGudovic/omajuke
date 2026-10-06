pragma ComponentBehavior: Bound

import QtQuick
import "../../../core" as Core
import "../../../lib/Settings.js" as Settings

// The three rules of core/SettingsStore.qml that keep a privacy choice from
// being lost: the values are the conservative ones until both the facade
// and the state file have been seen; an entry that was seen once is not
// replaced by a missing facade or by a configuration without it; and the
// choices that are mirrored in the state file come back from there when the
// host has deleted the entry. The case plays the service's part: it keeps
// the mirror and stores every choice the store asks it to.
QtObject {
  id: root

  property var h: null
  property string me: ""
  property var steps: []
  property int at: 0

  // What the state file would remember, and every choice that was asked
  // to be stored there.
  property var mirror: null
  property var asked: []

  // A facade that can be destroyed, as the host does on disable.
  property Component facadeComponent: Component {
    QtObject {
      property var barConfig: null

      function updateEntryInline(id, entry) {
        return true
      }
    }
  }

  // The store wired as the service wires it: the mirror is bound to the
  // remembered choices, and a choice is answered by replacing them, so the
  // mirror changes while the choice is still being announced.
  property Component boundService: Component {
    Item {
      id: service

      property var shell: null
      property string pluginId: ""
      // Stands for the prefs of the loaded state; null until it is loaded.
      property var prefs: null
      property var asked: []
      readonly property alias settings: bound

      Core.SettingsStore {
        id: bound
        shell: service.shell
        pluginId: service.pluginId
        mirror: service.prefs
        onExplicitChoice: function(key, value) {
          service.asked.push([key, value])
          var next = Object.create(null)
          for (var name in service.prefs) next[name] = service.prefs[name]
          next[key] = value
          service.prefs = next
        }
      }
    }
  }

  function run(h) {
    root.h = h
    root.me = h.manifest.id
    root.steps = [
      root.conservative, root.known, root.optOut, root.revoked, root.entryGone, root.entryBack,
      root.setFromOutside, root.lateMirror, root.boundMirror, root.destroyedFacade, root.quietLog
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // The store asks for a choice to be stored one turn after the change
  // that led to it. This waits for it to have had its say.
  function settled(then) {
    root.h.after(80, then)
  }

  function config(entries) {
    return { position: "top", layout: { left: [{ id: "other.plugin" }], center: [], right: entries } }
  }

  function mine(settings) {
    var entry = { id: root.me }
    for (var key in settings) entry[key] = settings[key]
    return entry
  }

  // What the service does with a choice: store it in the state, which
  // hands the store a new mirror.
  function follow(store) {
    store.explicitChoice.connect(function(key, value) {
      root.asked.push([key, value])
      var next = Object.create(null)
      for (var name in root.mirror) next[name] = root.mirror[name]
      next[key] = value
      root.mirror = next
      store.mirror = next
    })
  }

  property var store: null
  property int valueChanges: 0

  // The entry of a user who never opted out of anything and switched two
  // things on.
  readonly property var open: ({
    rememberHistory: true, autoplay: "true", preload: true, markWatched: true, sponsorSkip: true
  })
  readonly property var openValues: ({
    autoplay: true, maxHeight: 720, videoSize: "quarter", videoCorner: "bottom-right", keepAwake: true,
    sponsorSkip: "on", markWatched: true, evenVolume: false, rememberHistory: true, preload: true
  })

  function conservative() {
    var h = root.h
    var nothing = h.mount("core/SettingsStore.qml", { pluginId: root.me })
    h.check(!nothing.known, "with nothing seen the settings are not known")
    h.equal(nothing.values, Settings.CONSERVATIVE, "and are the conservative ones")
    nothing.mirror = { rememberHistory: true, preload: true, autoplay: true }
    h.check(!nothing.known, "the state file alone does not make them known")
    h.equal(nothing.values, Settings.CONSERVATIVE, "whatever it remembers")
    nothing.destroy()

    h.shell.barConfig = root.config([root.mine(root.open)])
    root.store = h.mount("core/SettingsStore.qml", { shell: h.shell, pluginId: root.me })
    if (root.store === null) { h.finish(); return }
    root.follow(root.store)
    root.store.valuesChanged.connect(function() { root.valueChanges++ })
    h.check(!root.store.known, "the facade alone does not make them known either")
    h.equal(root.store.values, Settings.CONSERVATIVE, "whatever the entry says")
    h.equal([root.store.values.rememberHistory, root.store.values.preload, root.store.values.autoplay,
      root.store.values.markWatched, root.store.values.sponsorSkip], [false, false, false, false, "ask"],
      "nothing is remembered, looked up ahead, played on, reported or skipped by default")
    root.settled(function() {
      h.equal(root.asked, [], "and nothing is asked to be stored yet")
      root.next()
    })
  }

  function known() {
    var h = root.h
    root.mirror = Object.create(null)
    root.store.mirror = root.mirror
    h.check(root.store.known, "the facade and the state file together make the settings known")
    h.equal(root.store.values, root.openValues, "now the entry counts")
    root.settled(function() {
      h.equal(root.asked, [["rememberHistory", true], ["preload", true], ["autoplay", true]],
        "each mirrored choice the entry makes is asked to be stored, and no other setting")
      h.equal(root.mirror, { rememberHistory: true, preload: true, autoplay: true }, "the mirror has them")
      // Another plugin's write, and the same configuration once more.
      root.valueChanges = 0
      h.shell.barConfig = root.config([root.mine(root.open), { id: "third.plugin", rememberHistory: false }])
      h.shell.barConfig = root.config([root.mine(root.open)])
      root.settled(function() {
        h.equal(root.asked.length, 3, "what is stored already is not asked for again")
        h.equal(root.valueChanges, 0, "and unrelated writes do not touch the settings")
        root.next()
      })
    })
  }

  function optOut() {
    var h = root.h
    root.asked = []
    h.check(root.store.set("rememberHistory", false), "the user switches history off")
    h.equal(root.asked, [["rememberHistory", false]],
      "the choice is asked to be stored in the state file before set() returns")
    h.equal(root.store.values.rememberHistory, false, "the setting is off")
    h.equal(h.shell.barConfig.layout.right[0].rememberHistory, false, "the entry says so")
    h.equal(root.mirror.rememberHistory, false, "and so does the mirror")
    root.settled(function() {
      h.equal(root.asked.length, 1, "asked once")
      root.next()
    })
  }

  // The host takes the facade away before it destroys the service.
  function revoked() {
    var h = root.h
    var before = JSON.stringify(root.store.values)
    root.valueChanges = 0
    root.asked = []
    root.store.shell = null
    h.check(root.store.known, "without the facade the settings stay known")
    h.equal(JSON.stringify(root.store.values), before, "and stay what they were")
    h.equal([root.store.values.rememberHistory, root.store.values.markWatched], [false, true],
      "history stays off; nothing falls back to a default")
    h.equal(root.valueChanges, 0, "the settings object is not even replaced")
    h.check(root.store.set("rememberHistory", true) === false, "nothing can be changed without the facade")
    h.equal(root.store.values.rememberHistory, false, "and a refused change changes nothing")
    root.settled(function() {
      h.equal(root.asked, [], "nothing is asked to be stored")
      root.next()
    })
  }

  // Disable deletes the entry. A kept service may be handed a facade
  // again whose configuration no longer has it.
  function entryGone() {
    var h = root.h
    var before = JSON.stringify(root.store.values)
    root.valueChanges = 0
    var without = [
      root.config([]), root.config([{ id: "other.plugin", rememberHistory: true }]), {}, { layout: null },
      { layout: { right: "x" } }, null, undefined, "config", 5, []
    ]
    h.shell.barConfig = without[0]
    root.store.shell = h.shell
    for (var i = 0; i < without.length; i++) h.shell.barConfig = without[i]
    h.equal(JSON.stringify(root.store.values), before, "a configuration without our entry changes nothing")
    h.equal(root.valueChanges, 0, "the last good entry stays")
    root.settled(function() {
      h.equal(root.asked, [], "and nothing is asked to be stored")
      root.next()
    })
  }

  // Enable adds a bare entry: no key of ours is in it.
  function entryBack() {
    var h = root.h
    h.shell.barConfig = root.config([{ id: root.me }])
    h.equal(root.store.values.rememberHistory, false,
      "history is still off: the choice comes from the mirror")
    h.equal([root.store.values.preload, root.store.values.autoplay], [true, true],
      "the other mirrored choices come from there too")
    h.equal([root.store.values.markWatched, root.store.values.sponsorSkip], [false, "ask"],
      "what is not mirrored falls back to the private side")

    // The same entry without the mirror would switch history back on.
    var forgetful = h.mount("core/SettingsStore.qml", { shell: h.shell, pluginId: root.me, mirror: {} })
    h.equal(forgetful.values.rememberHistory, true, "without the mirror the default would be back")
    forgetful.destroy()
    root.settled(function() {
      h.equal(root.asked, [], "a bare entry makes no choice, so nothing is asked")
      root.next()
    })
  }

  // `omarchy bar set` writes into the entry; it stores text.
  function setFromOutside() {
    var h = root.h
    root.asked = []
    h.shell.barConfig = root.config([root.mine({ preload: "false" })])
    h.equal(root.store.values.preload, false, "a choice made in the entry from outside holds at once")
    root.settled(function() {
      h.equal(root.asked, [["preload", false]], "and is asked to be stored")
      h.equal(root.mirror.preload, false, "so the mirror has it")
      h.shell.barConfig = root.config([root.mine({ preload: "false", rememberHistory: "true" })])
      h.equal(root.store.values.rememberHistory, true, "an explicit choice in the entry wins over the mirror")
      root.settled(function() {
        h.equal(root.asked, [["preload", false], ["rememberHistory", true]],
          "the entry can switch history on again, and the mirror follows")
        h.shell.barConfig = root.config([root.mine({ preload: "banana", autoplay: 0 })])
        h.equal([root.store.values.preload, root.store.values.rememberHistory, root.store.values.autoplay],
          [false, true, true], "a value that is no value leaves the remembered choices standing")
        root.settled(function() {
          h.equal(root.asked.length, 2, "and is no choice to store")
          root.store.destroy()
          root.next()
        })
      })
    })
  }

  // The entry is seen first, the state file later: the entry's choice wins
  // and the state file is brought in line.
  function lateMirror() {
    var h = root.h
    h.shell.barConfig = root.config([root.mine({ rememberHistory: false })])
    var late = h.mount("core/SettingsStore.qml", { shell: h.shell, pluginId: root.me })
    root.asked = []
    root.mirror = { rememberHistory: true, autoplay: false }
    root.follow(late)
    late.mirror = root.mirror
    h.equal([late.values.rememberHistory, late.values.autoplay, late.values.preload], [false, false, true],
      "entry, then mirror, then default")
    root.settled(function() {
      h.equal(root.asked, [["rememberHistory", false]],
        "the entry's choice is stored over the remembered one")
      // A change that is still on its way counts as the entry's choice.
      root.asked = []
      h.check(late.set("autoplay", true), "a mirrored setting is changed")
      h.equal(root.asked, [["autoplay", true]], "and asked to be stored")
      h.check(late.set("evenVolume", true), "a setting that is not mirrored is changed")
      root.settled(function() {
        h.equal(root.asked.length, 1, "and nothing is asked for it")
        late.destroy()
        root.next()
      })
    })
  }

  function boundMirror() {
    var h = root.h
    h.shell.barConfig = root.config([root.mine({ rememberHistory: false, preload: "false" })])
    var service = root.boundService.createObject(root, { pluginId: root.me })
    service.shell = h.shell
    h.check(!service.settings.known, "bound: not known before the state is loaded")
    service.prefs = Object.create(null)
    h.check(service.settings.known, "bound: known once it is")
    root.settled(function() {
      h.equal(service.asked, [["rememberHistory", false], ["preload", false]],
        "bound: the entry's choices are stored through the binding")
      h.equal(service.prefs, { rememberHistory: false, preload: false }, "bound: the mirror holds them")
      h.check(service.settings.set("autoplay", false), "bound: a choice made here")
      h.equal([service.asked.length, service.prefs.autoplay, service.settings.values.autoplay],
        [3, false, false], "bound: is stored before set() returns")
      // The state is replaced under the store: its choices are gone.
      service.asked = []
      service.prefs = Object.create(null)
      h.equal(service.settings.values.rememberHistory, false, "bound: the entry still decides")
      root.settled(function() {
        h.equal(service.asked, [["rememberHistory", false], ["preload", false], ["autoplay", false]],
          "bound: a mirror that lost the choices is brought in line again")
        service.destroy()
        root.next()
      })
    })
  }

  // On disable the host destroys the facade; the property that held it
  // then reads null without ever having been assigned.
  function destroyedFacade() {
    var h = root.h
    var facade = root.facadeComponent.createObject(root)
    facade.barConfig = root.config([root.mine({ rememberHistory: false, markWatched: true })])
    var held = h.mount("core/SettingsStore.qml", { pluginId: root.me, mirror: {} })
    // Assigned, as the host assigns it.
    held.shell = facade
    h.equal([held.known, held.values.rememberHistory, held.values.markWatched], [true, false, true],
      "settings from a facade")
    var before = JSON.stringify(held.values)
    var changes = 0
    held.valuesChanged.connect(function() { changes++ })
    facade.destroy()
    h.waitFor(function() { return held.shell === null }, 2000, function(gone) {
      h.check(gone, "the destroyed facade reads as null")
      h.check(held.known, "the settings stay known")
      h.equal(JSON.stringify(held.values), before, "and stay what they were: history off")
      h.equal(changes, 0, "untouched")
      h.check(held.set("rememberHistory", true) === false, "and cannot be changed")
      root.next()
    })
  }

  // The service answers explicitChoice by changing the mirror. Done at the
  // wrong moment, QML reports that as a binding loop.
  function quietLog() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.length > 0, "the log can be read")
    h.check(log.indexOf("Binding loop") === -1, "no binding loop was reported")
    h.check(log.indexOf("SettingsStore") === -1 && log.indexOf("Error") === -1,
      "the store logged nothing")
    root.next()
  }
}
