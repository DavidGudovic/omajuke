import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Settings.js" as Settings
import "../../../lib/StateFile.js" as StateFile
import "../../vectors/settings.js" as SettingsVectors
import "../../vectors/statefile.js" as StateFileVectors

// Runs the vector tables of Settings and StateFile in Qt's JavaScript
// engine, the one the plugin really runs on. The node tests run the same
// tables on another engine, and the two differ in places (JSON, property
// order, regular expressions), so the two gates count as proven only when
// their tables pass here as well.
//
// After the tables come the things a table cannot hold: prototypes, a walk
// over every UTF-16 unit through the writer, the size of the largest state,
// and objects as QML itself hands them over.
QtObject {
  id: root

  property string kind: "component"

  // A settings entry and a state as they look after a trip through a QML
  // property: the stores keep them that way.
  property var keptEntry: null
  property var keptState: null

  readonly property var settingKeys: [
    "autoplay", "maxHeight", "videoSize", "videoCorner", "keepAwake", "sponsorSkip", "markWatched",
    "evenVolume", "rememberHistory", "preload"
  ]
  readonly property var stateKeys: [
    "volume", "muted", "proxyAck", "prefs", "recents", "queue", "video", "shortcuts", "outputDevice"
  ]

  function isAscii(text) {
    return /^[\x20-\x7e]*$/.test(text)
  }

  // Tables that are indexed with outside text must hold nothing but what
  // was put into them, in this engine too.
  function checkPrototypes(h) {
    var entry = JSON.parse("{\"id\":\"example.plugin\",\"__proto__\":{\"rememberHistory\":false},"
      + "\"constructor\":\"c\",\"evenVolume\":\"true\"}")
    var config = { layout: { left: [], center: [], right: [entry] } }
    var found = Settings.extract(config, "example.plugin")
    h.check(found !== null && Object.getPrototypeOf(found) === null, "an extracted entry has no prototype")
    h.equal(Object.keys(found), ["id", "constructor", "evenVolume"], "it holds the plain keys only")
    h.equal(found.rememberHistory, undefined, "a __proto__ key in the entry sets nothing")
    h.equal(found.toString, undefined, "and nothing is inherited")
    var values = Settings.coerce(found, null, null, true)
    h.equal([values.rememberHistory, values.evenVolume], [true, true], "the entry is read by its own keys")
    h.equal(Object.keys(values), root.settingKeys, "the settings have their ten keys, in order")
    h.check(Settings.coerce(found, null, null, false) === Settings.CONSERVATIVE,
      "unknown settings are the conservative table itself")
    h.check(Object.isFrozen(Settings.CONSERVATIVE) && Object.isFrozen(Settings.DEFAULTS)
      && Object.isFrozen(Settings.MIRRORED), "the exported tables are frozen")
    // In this engine a write to a frozen table is dropped without an error.
    try {
      Settings.CONSERVATIVE.rememberHistory = true
      Settings.DEFAULTS.rememberHistory = false
    } catch (error) {
      h.check(true, "a write to a frozen table is refused")
    }
    h.equal([Settings.CONSERVATIVE.rememberHistory, Settings.DEFAULTS.rememberHistory], [false, true],
      "a write changes nothing")

    var written = Settings.withChange(found, "preload", false)
    h.check(Object.getPrototypeOf(written) === null, "a written entry has no prototype")
    h.equal(written, { id: Const.PLUGIN_ID, constructor: "c", evenVolume: "true", preload: false },
      "it carries the plugin's id, the kept keys and the change")
    // The host copies an entry with a for-in loop.
    var copied = []
    for (var key in written) copied.push(key)
    h.equal(copied, ["id", "constructor", "evenVolume", "preload"], "a for-in loop sees exactly its keys")

    var read = StateFile.parse("{\"version\":1,\"prefs\":{\"__proto__\":{\"preload\":false},"
      + "\"rememberHistory\":false},\"video\":{\"constructor\":{\"corner\":\"top-left\",\"widthPct\":20},"
      + "\"__proto__\":{\"corner\":\"top-right\",\"widthPct\":30}}}")
    h.check(read.ok === true, "a state with hostile keys is read")
    var state = read.ok ? read.state : StateFile.defaults()
    h.check(Object.getPrototypeOf(state.prefs) === null, "prefs has no prototype")
    h.check(Object.getPrototypeOf(state.video) === null, "video has no prototype")
    h.equal(Object.keys(state.prefs), ["rememberHistory"], "prefs holds the one choice")
    h.equal(Object.keys(state.video), ["constructor", "__proto__"], "both monitors are plain keys")
    h.equal(state.video.constructor, { corner: "top-left", widthPct: 20 }, "a monitor called constructor")
    h.equal(state.video["__proto__"], { corner: "top-right", widthPct: 30 }, "a monitor called __proto__")
    h.equal([state.video.toString, state.video["DP-1"], state.prefs.preload],
      [undefined, undefined, undefined], "what is not in a table is not there")
    h.equal(Object.keys(state), root.stateKeys, "a state has its nine keys, in order")
    var empty = {}
    h.equal([empty.rememberHistory, empty.corner, empty.preload], [undefined, undefined, undefined],
      "Object.prototype is as it was")
  }

  // Shortcut texts are kept verbatim, so every UTF-16 unit can be sent
  // through the writer in one. A lone surrogate half is the exception: this
  // engine's JSON drops it, which loses nothing that could be used.
  function walkUnits(h) {
    var notAscii = 0
    var changed = 0
    var costly = 0
    // What the file takes with an empty text: each unit is counted on top.
    var bare = StateFile.serialize(StateFile.withChanges(StateFile.defaults(), {
      shortcuts: { panel: "", video: "", output: "", dirty: true }
    }), false).length
    for (var start = 0; start < 0x10000; start += 64) {
      var text = ""
      for (var code = start; code < start + 64; code++) {
        if (code < 0xd800 || code > 0xdfff) text += String.fromCharCode(code)
      }
      var state = StateFile.withChanges(StateFile.defaults(), {
        shortcuts: { panel: text, video: "", output: "", dirty: true }
      })
      var written = StateFile.serialize(state, false)
      if (!root.isAscii(written)) notAscii++
      if (written.length > bare + 6 * text.length) costly++
      var read = StateFile.parse(written)
      if (read.ok !== true || read.state.shortcuts.panel !== text) changed++
    }
    h.equal(notAscii, 0, "every UTF-16 unit is written as printable ASCII")
    h.equal(costly, 0, "no unit takes more than six bytes")
    h.equal(changed, 0, "and every one is read back as it was")

    var halves = StateFile.withChanges(StateFile.defaults(), {
      shortcuts: { panel: "a" + String.fromCharCode(0xd83d) + "b" + String.fromCharCode(0xde00) + "c" }
    })
    var lone = StateFile.serialize(halves, false)
    h.check(root.isAscii(lone), "lone surrogate halves do not break the ASCII rule")
    h.check(StateFile.parse(lone).ok === true, "and the text still reads")
  }

  // The largest state there can be, built here a second time: full lists,
  // every text at its full length in six-byte characters.
  function checkLargest(h) {
    var wide = String.fromCharCode(0x4e00)
    var title = new Array(Const.LIMITS.titleChars + 1).join(wide)
    var channel = new Array(Const.LIMITS.channelChars + 1).join(wide)
    var recents = []
    var items = []
    for (var r = 0; r < Const.LIMITS.recents; r++) {
      recents.push({ id: "RRRRRRR" + String(10000 + r).slice(1), title: title, channel: channel,
        duration: Const.LIMITS.durationSeconds, live: false })
    }
    for (var q = 0; q < Const.LIMITS.queueItems; q++) {
      items.push({ id: "QQQQQQQ" + String(10000 + q).slice(1), title: title, channel: channel,
        duration: Const.LIMITS.durationSeconds, live: false, auto: false })
    }
    var state = StateFile.withChanges(StateFile.defaults(), {
      volume: 100, prefs: { rememberHistory: false, preload: false, autoplay: false },
      recents: recents, queue: { items: items, index: items.length - 1 }
    })
    var text = StateFile.serialize(state, true)
    h.check(root.isAscii(text), "the largest state is written as ASCII")
    h.check(text.length > 230 * 420 * 6, "it is as large as it can get")
    h.check(text.length + 1 <= Const.LIMITS.stateBytes, "and it fits under the read cap")
    var read = StateFile.parse(text + "\n")
    h.check(read.ok === true, "it is read back")
    var back = read.ok ? read.state : StateFile.defaults()
    h.equal([back.recents.length, back.queue.items.length, back.queue.index],
      [Const.LIMITS.recents, Const.LIMITS.queueItems, Const.LIMITS.queueItems - 1], "with all 230 tracks")
    var intact = 0
    var all = back.recents.concat(back.queue.items)
    for (var i = 0; i < all.length; i++) {
      if (all[i].title === title && all[i].channel === channel) intact++
    }
    h.equal(intact, 230, "and every title and channel survived")
    h.check(StateFile.serialize(back, true) === text, "written again it is the same text")
    var without = StateFile.serialize(state, false)
    h.check(without.length < 200 && without.indexOf("RRRRRRR") === -1 && without.indexOf("\\u4e00") === -1,
      "without history none of it is in the text")
  }

  // Where this engine reads a file differently from node, so that the row
  // cannot be in the shared table.
  function checkEngine(h) {
    // A number too large to hold: node reads Infinity and the reader then
    // takes the default; Qt's JSON refuses the whole text. Either way no
    // such number becomes part of a state.
    h.equal(StateFile.parse("{\"version\":1,\"volume\":1e999}"), { ok: false },
      "a number too large to hold makes the file unreadable")
    h.equal(StateFile.parse("{\"version\":1,\"queue\":{\"items\":[],\"index\":-1e999}}"), { ok: false },
      "wherever it stands")
    // Nesting deeper than this engine's JSON goes is refused as well.
    var deep = "{\"version\":1,\"recents\":" + new Array(5001).join("[") + new Array(5001).join("]") + "}"
    h.equal(StateFile.parse(deep), { ok: false }, "nesting 5000 deep is refused")
  }

  // What the stores hand around went through a QML property on the way.
  function checkKept(h) {
    var found = Settings.extract({ layout: { right: [{ id: "example.plugin", rememberHistory: "false" }] } },
      "example.plugin")
    root.keptEntry = found
    h.check(root.keptEntry === found, "a property keeps the very table it was given")
    h.check(Object.getPrototypeOf(root.keptEntry) === null, "and the table keeps having no prototype")
    h.equal(Settings.coerce(root.keptEntry, null, null, true).rememberHistory, false,
      "it still reads the same")
    h.equal(Settings.choices(root.keptEntry), { rememberHistory: false }, "and still makes its choice")

    var state = StateFile.withChanges(StateFile.defaults(), {
      prefs: { rememberHistory: false }, recents: [{ id: "AAAAAAAAAAA", title: "A title" }]
    })
    root.keptState = state
    h.check(root.keptState === state && Object.getPrototypeOf(root.keptState.prefs) === null,
      "a state keeps its tables in a property")
    var next = StateFile.withChanges(root.keptState, { volume: 5 })
    h.check(next.prefs === state.prefs && next.recents === state.recents && next.queue === state.queue,
      "a change leaves the other keys the very same objects")
    h.check(StateFile.withChanges(root.keptState, { nonsense: 1 }) === null, "an unknown key changes nothing")
    // A QML object is not a state and not an entry.
    h.equal(StateFile.serialize(root, false), StateFile.serialize(StateFile.defaults(), false),
      "a QML object is written as the defaults")
    h.equal(Settings.extract(root, "example.plugin"), null, "and holds no entry")
    h.equal(Settings.coerce(root, root, root, true), Settings.DEFAULTS, "nor any setting")
  }

  function run(h) {
    h.vectors(Settings, SettingsVectors)
    h.vectors(StateFile, StateFileVectors)
    root.checkPrototypes(h)
    root.walkUnits(h)
    root.checkLargest(h)
    root.checkEngine(h)
    root.checkKept(h)
    h.finish()
  }
}
