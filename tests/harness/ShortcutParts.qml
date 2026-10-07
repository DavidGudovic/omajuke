import QtQuick
import "../../lib/KeyCombo.js" as KeyCombo
import "../../lib/Lua.js" as Lua
import "../../lib/StateFile.js" as StateFile

// What a case about core/Shortcuts.qml is built from. The compositor side
// is real up to the tool: a process runner and core/HyprCtl.qml, which talk
// to the hyprctl stub and its table of binds. The saved state is a stand-in
// that validates like the real store and keeps no file.
//
// It also holds what every such case asks: which requests reached the stub
// and in which order, which lines were run, and what the stub's table and
// the saved wishes look like now.
Item {
  id: root

  // The harness, given at creation.
  property var h: null

  // The real parts, once build() has run. keys is core/Shortcuts.qml.
  property var runner: null
  property var hypr: null
  property var keys: null
  readonly property var store: fakeStore
  // How many passes have ended since build().
  property int ended: 0

  // Binds of other people that a made-up desktop has, as nearly every real
  // one does. They touch none of the combinations a case uses. The desktop
  // without a single bind has a case of its own (shortcuts_empty).
  readonly property var others: [
    { modmask: 64, key: "Return", description: "Placeholder 1" },
    { modmask: 64, key: "code:10", description: "Placeholder 2" },
    { modmask: 0, key: "XF86AudioPlay", description: "" },
    { modmask: 64, key: "mouse:272", description: "Placeholder 3", header: "bindm" }
  ]

  // Mounts the runner, the compositor access and the shortcuts. Returns
  // false when one of them did not load.
  function build() {
    var h = root.h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.hypr = h.mount("core/HyprCtl.qml", { runner: root.runner, tools: h.tools })
    if (root.runner === null || root.hypr === null) return false
    return root.rebuild()
  }

  // Mounts core/Shortcuts.qml again, on the same store and compositor
  // access, as after the service was created anew.
  function rebuild() {
    root.keys = root.h.mount("core/Shortcuts.qml", { hyprCtl: root.hypr, store: fakeStore })
    if (root.keys === null) return false
    var keys = root.keys
    keys.busyChanged.connect(function() {
      if (!keys.busy) root.ended += 1
    })
    return true
  }

  // ---- The made-up desktop ----

  // A bind as the stub's table holds one that the plugin made at runtime.
  function ours(action, combo) {
    var parsed = KeyCombo.parse(combo)
    return {
      header: "bindd", modmask: parsed.mask, submap: "", key: parsed.key, keycode: 0, catchall: false,
      description: KeyCombo.action(action).description, dispatcher: "__lua", arg: 90,
      spelling: parsed.alias
    }
  }

  // Somebody else's bind on a combination.
  function theirs(combo, description) {
    var parsed = KeyCombo.parse(combo)
    return { modmask: parsed.mask, key: parsed.key, description: description }
  }

  // The bind of the line a user pasted into their own configuration.
  function pasted(action, combo) {
    return root.theirs(combo, KeyCombo.action(action).configDescription)
  }

  // Changes keys of the stub's state and keeps the others.
  function patchStub(changes) {
    var state = root.h.stubState("hyprctl") || {}
    for (var key in changes) state[key] = changes[key]
    root.h.setStubState("hyprctl", state)
  }

  // Sets the table of binds: the usual ones of other people and these.
  function desktop(binds) {
    root.patchStub({ binds: root.others.concat(binds), appear: [], listings: 0 })
  }

  // The binds of the stub's table that are not the usual ones, as
  // "<modmask> <key> <description>", sorted.
  function table() {
    var state = root.h.stubState("hyprctl")
    var binds = state && Array.isArray(state.binds) ? state.binds.slice(root.others.length) : []
    return binds.map(function(bind) {
      return bind.modmask + " " + bind.key + " " + bind.description
    }).sort()
  }

  // The same form for a bind of ours, for a comparison.
  function listed(action, combo) {
    var parsed = KeyCombo.parse(combo)
    return parsed.mask + " " + parsed.key + " " + KeyCombo.action(action).description
  }

  // ---- What reached the stub ----

  // What the stub was started with, as the word that tells the requests
  // apart.
  function requests() {
    return root.h.log("hyprctl").map(function(entry) {
      return entry.argv[0] === "-j" ? entry.argv[1] : entry.argv[0]
    })
  }

  // The lines that were sent to the compositor, in order.
  function lines() {
    return root.h.log("hyprctl").filter(function(entry) { return entry.argv[0] === "eval" })
      .map(function(entry) { return entry.argv[2] })
  }

  function bindLine(action, combo) {
    return Lua.bind(KeyCombo.parse(combo).alias, action)
  }

  function unbindLine(combo) {
    return Lua.unbind(KeyCombo.parse(combo).alias)
  }

  // The rule every line has to keep, over everything the stub has seen: a
  // line is a bind or a removal under the registered spelling, it comes
  // directly after a reading of the list and the question about the
  // configuration's errors, and a reading of the list follows it. Returns
  // the number of lines that broke it.
  function strays() {
    var requests = root.requests()
    var lines = root.lines()
    var spelled = /^hl\.(?:bind|unbind)\("(?:MOD4 \+ )?(?:CONTROL \+ )?(?:MOD1 \+ )?(?:SHIFT \+ )?[A-Z0-9]+"/
    var broken = 0
    var seen = 0
    for (var i = 0; i < requests.length; i++) {
      if (requests[i] !== "eval") continue
      var line = lines[seen++]
      var framed = i >= 2 && requests[i - 1] === "configerrors" && requests[i - 2] === "binds"
        && requests[i + 1] === "binds"
      if (!framed || !spelled.test(line) || line.indexOf(" + ") === -1) broken++
    }
    return broken
  }

  // ---- Rows, wishes, waiting ----

  function row(action) {
    var rows = root.keys.rows
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].action === action) return rows[i]
    }
    return null
  }

  // [status, combo, note] of an action's row.
  function shown(action) {
    var row = root.row(action)
    return row === null ? null : [row.status, row.combo, row.note]
  }

  // The saved wishes as a plain object.
  function saved() {
    return JSON.parse(JSON.stringify(fakeStore.values.shortcuts))
  }

  function save(keys) {
    fakeStore.values = StateFile.withChanges(fakeStore.values, { shortcuts: keys })
  }

  // Calls then() when the pass that is running, and every pass it makes
  // follow, has ended.
  function settled(then) {
    var h = root.h
    h.waitFor(function() { return !root.keys.busy }, 20000, function(met) {
      h.check(met, "the pass ended")
      then()
    })
  }

  // The same for a pass that has yet to begin (after a reload it starts a
  // moment later): waits until one more pass has ended than count.
  function afterPass(count, then) {
    var h = root.h
    h.waitFor(function() { return root.ended > count && !root.keys.busy }, 20000, function(met) {
      h.check(met, "a pass ran and ended")
      then()
    })
  }

  // Keeps the state the way the real store does, through the same
  // validation, without a file.
  QtObject {
    id: fakeStore

    property var values: StateFile.defaults()
    // Every change that was handed in, as it came, and how often an
    // immediate write was asked for.
    property var patches: []
    property int flushes: 0

    function patch(changes) {
      var plain = JSON.parse(JSON.stringify(changes))
      var next = StateFile.withChanges(fakeStore.values, plain)
      if (next === null) return false
      fakeStore.patches = fakeStore.patches.concat([plain])
      fakeStore.values = next
      return true
    }

    function flushNow() {
      fakeStore.flushes += 1
    }
  }
}
