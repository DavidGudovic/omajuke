import QtQuick
import "../lib/Settings.js" as Settings

// The plugin's settings as the service sees them. They live on the plugin's
// entry in Omarchy's shell.json, which the host hands to widgets but not to
// services, so this component reads the entry out of the bar configuration
// on the shell facade and writes changes back through the facade.
//
// It owns three rules that keep a privacy choice from being lost:
//
//   The entry is latched. The host takes the facade away before it destroys
//   the service, and it deletes the entry when the plugin is disabled. Once
//   an entry has been seen, neither a missing facade nor a configuration
//   without the entry replaces it.
//
//   Until both the facade and the state file have been seen, the values are
//   Settings.CONSERVATIVE: nothing is remembered or looked up because of a
//   default that the user may have switched off.
//
//   The three choices of Settings.MIRRORED are also kept in the state file.
//   Whenever the entry makes one of them and the state file says otherwise,
//   explicitChoice asks the service to store it there.
Item {
  id: root

  // Given by the service: the host's facade (null before it is injected
  // and again once it is revoked), the plugin's id, and the choices the
  // state file remembers (null until the state file has been loaded).
  property var shell: null
  property string pluginId: ""
  property var mirror: null

  // True once a facade has delivered a bar configuration and the state
  // file has been loaded: from then on values are the user's settings.
  readonly property bool known: _seen && mirror !== null && mirror !== undefined
  // The complete typed settings; never missing a key.
  readonly property var values: Settings.coerce(_raw, mirror, _pending, known)

  // The bar configuration as the facade has it now. The host replaces it
  // on every change of shell.json, by any plugin.
  readonly property var _snapshot: shell ? shell.barConfig : null
  property bool _seen: false
  // The latched entry, and its JSON text: a snapshot only counts as a
  // change when our own entry reads differently.
  property var _raw: Object.create(null)
  property string _rawText: "{}"
  // Changes handed to the host that the entry does not show yet. They lie
  // over the entry, so a toggle does not flicker back while the host is
  // still writing its file.
  property var _pending: Object.create(null)
  // The earlier changes of each pending key, sent before the one pending
  // now. A snapshot that shows one of them is the host catching up, not
  // somebody else changing the setting (Settings.unsettled).
  property var _sent: Object.create(null)
  property bool _scheduled: false
  // Shared with every deferred call, so that none of them runs into a
  // store that is already being destroyed.
  property var _life: ({ alive: true })

  // A mirrored setting was chosen, here or in the entry, and the state
  // file does not have it so. The service stores it there.
  signal explicitChoice(string key, bool value)

  // Changes one setting. Returns false when key is not a setting, value is
  // not one it accepts, or there is no facade to write through. The host
  // replaces the whole entry with what it is given, so the complete entry
  // goes out every time, built on the changes that are still on their way.
  function set(key: string, value: var): bool {
    // A facade that is gone reads as null, or as an object without members.
    var facade = root.shell
    if (!facade || typeof facade.updateEntryInline !== "function" || root.pluginId === "") return false
    var entry = Settings.withChange(Settings.overlay(root._raw, root._pending), key, value)
    if (entry === null) return false
    var pending = Settings.overlay(root._pending, null)
    pending[key] = entry[key]
    // The state file hears of a privacy choice before the setting itself
    // changes: switching history off rewrites that file at once, and the
    // rewrite must already carry the choice.
    root._announce(Settings.overlay(root._raw, pending))
    // From here on the setting reads its new value, whenever the host
    // gets round to showing it.
    root._sent = Settings.earlierSent(root._sent, root._pending, key)
    root._pending = pending
    facade.updateEntryInline(root.pluginId, entry)
    return true
  }

  // A copy made of plain objects and arrays, or null. QML hands the same
  // data over in more than one form: the configuration a facade is created
  // with arrives as a property map whose lists are no arrays. A trip
  // through JSON text makes one form of them, and a copy that shares
  // nothing with the host.
  function _plain(value) {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch (error) {
      return null
    }
  }

  // Takes in the facade's current bar configuration. A missing facade, or
  // a configuration without our entry, changes nothing.
  function _absorb() {
    var snapshot = root._plain(root.shell ? root.shell.barConfig : null)
    if (snapshot === null || typeof snapshot !== "object") return
    root._seen = true
    var found = Settings.extract(snapshot, root.pluginId)
    if (found === null) return
    var text = JSON.stringify(found)
    if (text === root._rawText) return
    var before = root._raw
    root._rawText = text
    root._raw = found
    var left = Settings.unsettled(root._pending, found, before, root._sent)
    if (Object.keys(left).length !== Object.keys(root._pending).length) {
      root._sent = Settings.earlierSent(root._sent, left, "")
      root._pending = left
    }
    root._schedule()
  }

  // Asks for every privacy choice entry makes that the state file does
  // not hold. The mirror is read again for each key: a listener usually
  // updates it while the signal is still being delivered.
  function _announce(entry) {
    if (!root.known) return
    var made = Settings.choices(entry)
    for (var i = 0; i < Settings.MIRRORED.length; i++) {
      var key = Settings.MIRRORED[i]
      if (made[key] === undefined) continue
      if (Settings.choices(root.mirror)[key] !== made[key]) root.explicitChoice(key, made[key])
    }
  }

  // Compares the entry (with what is on its way to it) and the mirror one
  // turn later. The service answers explicitChoice by changing the mirror,
  // and that must not happen while the property whose change led here is
  // still being updated.
  function _schedule() {
    if (root._scheduled) return
    root._scheduled = true
    var life = root._life
    Qt.callLater(function() {
      if (!life.alive) return
      root._scheduled = false
      root._announce(Settings.overlay(root._raw, root._pending))
    })
  }

  onShellChanged: root._absorb()
  on_SnapshotChanged: root._absorb()
  onPluginIdChanged: root._absorb()
  onMirrorChanged: root._schedule()

  Component.onCompleted: root._absorb()
  Component.onDestruction: root._life.alive = false
}
