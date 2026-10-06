pragma ComponentBehavior: Bound

import QtQuick
import QtQml.Models
import "../../../lib/Clean.js" as Clean
import "../../../lib/Errors.js" as Errors
import "../../../lib/Ids.js" as Ids
import "../../../lib/Paths.js" as Paths
import "../../../lib/Track.js" as Track
import "../../vectors/clean.js" as CleanVectors
import "../../vectors/errors.js" as ErrorsVectors
import "../../vectors/ids.js" as IdsVectors
import "../../vectors/paths.js" as PathsVectors
import "../../vectors/track.js" as TrackVectors

// Runs the vector tables of Ids, Clean, Paths, Track and Errors in Qt's
// JavaScript engine, the one the plugin really runs on. The node tests run
// the same tables on another engine, and the two differ in places (regular
// expressions, JSON, string methods), so a gate counts as proven only when
// its table passes here as well.
//
// After the tables come the things a table cannot hold: a walk over every
// UTF-16 unit, the table of error sentences, and a track row that went
// through a real QML model.
QtObject {
  id: root

  property string kind: "component"

  // What Clean.text does with each UTF-16 unit, written out a second time:
  // these ranges are deleted, the ones below become a space, the rest stays.
  readonly property var deleted: [
    [0x00, 0x08], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x200b, 0x200f],
    [0x202a, 0x202e], [0x2060, 0x206f], [0xd800, 0xdfff], [0xfeff, 0xfeff], [0xfff9, 0xfffb]
  ]
  readonly property var gaps: [
    [0x09, 0x0d], [0x20, 0x20], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029],
    [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]
  ]

  readonly property var row: ({ id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213,
    live: false })

  // A queue as a view sees it: plain objects in a list, handed to a
  // delegate as modelData.
  property Instantiator rows: Instantiator {
    model: [
      { id: "AAAAAAAAAAA", title: "A title", channel: "A channel", duration: 213, live: false, key: 7,
        auto: false },
      { id: "constructor", title: "", channel: "", duration: null, live: true, key: 8, auto: true }
    ]
    delegate: QtObject {
      required property var modelData
    }
  }

  function within(ranges, code) {
    for (var i = 0; i < ranges.length; i++) {
      if (code >= ranges[i][0] && code <= ranges[i][1]) return true
    }
    return false
  }

  // Every UTF-16 unit through the functions whose answer depends on the
  // engine's own tables (character classes, \s, whitespace). Each result is
  // the number of units that got a wrong answer.
  function walkUnits(h) {
    var id = "AAAAAAAAAAA"
    var wrong = { text: 0, control: 0, trim: 0, address: 0 }
    for (var code = 0; code <= 0xffff; code++) {
      var ch = String.fromCharCode(code)
      var gap = root.within(root.gaps, code)
      var want = root.within(root.deleted, code) ? "ab" : (gap ? "a b" : "a" + ch + "b")
      if (Clean.text("a" + ch + "b", 10) !== want) wrong.text++
      if (Clean.hasControl(ch) !== (code < 0x20 || code === 0x7f)) wrong.control++
      // Ids trims what Clean.text turns into a space, and the byte order mark.
      var trimmed = Ids.parseVideoRef(ch + id + ch, true) === id
      if (trimmed !== (gap || code === 0xfeff)) wrong.trim++
      // One token with an address in it is a link, whatever unit sits in the
      // name. A space makes two words of it, and a second @ is no address.
      var address = Ids.looksLikeUrl("a" + ch + "b@example.com")
      if (address !== !(gap || ch === "@")) wrong.address++
    }
    h.equal(wrong.text, 0, "Clean.text keeps, deletes or spaces every UTF-16 unit as specified")
    h.equal(wrong.control, 0, "Clean.hasControl is true for exactly the C0 controls and DEL")
    h.equal(wrong.trim, 0, "Ids trims exactly its own whitespace list")
    h.equal(wrong.address, 0, "Ids.looksLikeUrl sees the address behind every UTF-16 unit")
  }

  // The table of error sentences is looked up with codes that come from
  // outside the file, so it must hold nothing but what was put into it.
  function checkErrorTable(h) {
    var names = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]
    for (var i = 0; i < names.length; i++) {
      h.equal(Errors.TEXT[names[i]], undefined, "Errors.TEXT has no " + names[i])
      h.check(!Object.prototype.hasOwnProperty.call(Errors.TEXT, names[i]), "no own key " + names[i])
    }
    h.equal(Object.keys(Errors.TEXT).length, 20, "Errors.TEXT holds the twenty codes of this version")
    h.equal(Errors.TEXT.E_NETWORK, "No network", "a code finds its sentence")
    h.check(Object.isFrozen(Errors.TEXT), "Errors.TEXT is frozen")
    // In this engine a write to a frozen table is dropped without an error.
    try {
      Errors.TEXT.E_NETWORK = "changed"
      Errors.TEXT.E_ADDED = "added"
    } catch (error) {
      h.check(true, "a write to Errors.TEXT is refused")
    }
    h.equal(Errors.TEXT.E_NETWORK, "No network", "a write changes nothing")
    h.equal(Errors.TEXT.E_ADDED, undefined, "a write adds nothing")
  }

  // Track.fromUi must accept a row whatever the view made of it on the way.
  function checkRows(h) {
    h.equal(Track.fromUi(root.row), root.row, "a row kept in a property is a track")
    h.equal(root.rows.count, 2, "the model made its two delegates")
    var first = root.rows.objectAt(0)
    var second = root.rows.objectAt(1)
    h.equal(Track.fromUi(first ? first.modelData : null), root.row, "a row from a delegate is a track")
    h.equal(Track.fromUi(second ? second.modelData : null),
      { id: "constructor", title: "", channel: "", duration: null, live: true }, "a queue item is a track")
    h.equal(Track.fromUi(first), null, "the delegate itself is not a track")
    h.equal(Track.fromUi(root), null, "nor is any other object")
  }

  function run(h) {
    h.vectors(Ids, IdsVectors)
    h.vectors(Clean, CleanVectors)
    h.vectors(Paths, PathsVectors)
    h.vectors(Track, TrackVectors)
    h.vectors(Errors, ErrorsVectors)
    root.walkUnits(h)
    root.checkErrorTable(h)
    root.checkRows(h)
    h.finish()
  }
}
