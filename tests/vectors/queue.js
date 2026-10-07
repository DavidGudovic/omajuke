.pragma library

// Input and expectation table for lib/Queue.js: how a queue item is made,
// what every edit of a queue answers, and which steps the planner hands out
// to bring mpv's playlist in step with the queue. The same table runs under
// node and inside Qt's JavaScript engine.
//
// All videos are made up. The readiness tests the planner takes are small
// functions defined here, since a function cannot be written as data, and
// so is the one object that fails when it is read.

// ---- Builders ----

function _id(letter) {
  var id = ""
  for (var i = 0; i < 11; i++) id += letter
  return id
}

function _track(letter) {
  return {
    id: _id(letter), title: "Track " + letter, channel: "Channel " + letter, duration: 100, live: false
  }
}

function _item(letter, key, auto) {
  return {
    id: _id(letter), title: "Track " + letter, channel: "Channel " + letter, duration: 100, live: false,
    key: key, auto: auto
  }
}

// Ids "track-00000", "track-00001", ... for the cases that need many videos.
function _numberedId(n) {
  var digits = String(n)
  while (digits.length < 5) digits = "0" + digits
  return "track-" + digits
}

function _numberedTrack(n) {
  return { id: _numberedId(n), title: "Number " + n, channel: "", duration: 60, live: false }
}

function _numberedItem(n, key, auto) {
  return {
    id: _numberedId(n), title: "Number " + n, channel: "", duration: 60, live: false, key: key, auto: auto
  }
}

// Items number "from" to "to", each under the key that equals its number.
function _numberedItems(from, to, auto) {
  var items = []
  for (var n = from; n <= to; n++) items.push(_numberedItem(n, n, auto))
  return items
}

function _numberedTracks(from, to) {
  var tracks = []
  for (var n = from; n <= to; n++) tracks.push(_numberedTrack(n))
  return tracks
}

function _numberedIds(from, to) {
  var ids = []
  for (var n = from; n <= to; n++) ids.push(_numberedId(n))
  return ids
}

// ---- Readiness tests for the planner ----

function _all() {
  return true
}

function _none() {
  return false
}

function _onlyA(id) {
  return id === _id("A")
}

function _onlyC(id) {
  return id === _id("C")
}

// Not a plain true: must count as "not ready".
function _one() {
  return 1
}

function _broken() {
  throw new Error("broken")
}

// ---- The planner's steps ----

function _rm(key) {
  return { op: "remove", key: key }
}

// The load of the item before the current one, and of the item after it.
function _before(key) {
  return { op: "load", key: key, mode: "insert-at", index: 0 }
}

function _after(key) {
  return { op: "load", key: key, mode: "append-play", index: -1 }
}

// The keys 1 to n in playlist order, and the steps that remove all of them.
function _count(n) {
  var keys = []
  for (var key = 1; key <= n; key++) keys.push(key)
  return keys
}

function _removals(n) {
  var ops = []
  for (var key = n; key >= 1; key--) ops.push(_rm(key))
  return ops
}

// ---- Queues ----

var _A = _item("A", 1, false)
var _B = _item("B", 2, false)
var _C = _item("C", 3, false)
var _D = _item("D", 4, false)
var _E = _item("E", 5, false)
var _ABC = [_A, _B, _C]
var _ABCDE = [_A, _B, _C, _D, _E]

// The same video on both sides of another one: two insertions, two keys.
var _ABA = [_item("A", 1, false), _item("B", 2, false), _item("A", 3, false)]

// A queue at its size limit, and one item short of it.
var _FULL = _numberedItems(1, 200, false)
var _ALMOST = _numberedItems(1, 199, false)

// A damaged queue: things that are no items around A and B, and a second
// item under the key of A.
var _DAMAGED = [null, _A, "x", { id: _id("Z"), key: 0 }, _item("Z", 1, false), _B, [_C]]

// A track as it could arrive from outside: a bidi override, a NUL, a line
// break and spaces to trim in the title, an invisible character in the
// channel, a length that is no whole number. And the item it must become.
var _DIRTY = {
  id: _id("A"), title: "  a\u202eb\u0000c\nd ", channel: "ch\u200b", duration: 12.4, live: false
}

function _cleaned(key) {
  return { id: _id("A"), title: "abc d", channel: "ch", duration: 12, live: false, key: key, auto: false }
}

// A video whose id is also the name of something every object has.
var _ODD = { id: "constructor", title: "t", channel: "", duration: 5, live: false }

function _oddItem(key, auto) {
  return { id: "constructor", title: "t", channel: "", duration: 5, live: false, key: key, auto: auto }
}

// An item started from a bare link, before anything is known about it, and
// what a lookup of that video reports.
var _BARE_B = { id: _id("B"), title: "", channel: "", duration: null, live: true, key: 2, auto: true }
var _NEWS_B = { id: _id("B"), title: "New", channel: "Ch", duration: 7, live: false }
var _NEW_B = { id: _id("B"), title: "New", channel: "Ch", duration: 7, live: false, key: 2, auto: false }
// The same as Track B once it is cleaned: nothing new.
var _SAME_B = { id: _id("B"), title: " Track\u200b B ", channel: "Channel B", duration: 100.2 }

// ---- Entries that are items only in part ----

// Item Z under key 9 with one member changed, and with one member missing.
function _but(name, value) {
  var entry = _item("Z", 9, false)
  entry[name] = value
  return entry
}

function _without(name) {
  var entry = _item("Z", 9, false)
  delete entry[name]
  return entry
}

function _letters(count) {
  var text = ""
  for (var i = 0; i < count; i++) text += "x"
  return text
}

// The same value count times.
function _copies(value, count) {
  var list = []
  for (var i = 0; i < count; i++) list.push(value)
  return list
}

// Nothing but its video and its key.
var _STUB = { id: _id("Z"), key: 9 }

// Six members of its own, one that is only inherited, and one too many.
function _heir() {
  var entry = Object.create({ auto: false })
  entry.id = _id("Z")
  entry.title = "Track Z"
  entry.channel = "Channel Z"
  entry.duration = 100
  entry.live = false
  entry.key = 9
  entry.extra = 1
  return entry
}

// A list that carries the seven members as names.
function _listed() {
  var entry = []
  entry.id = _id("Z")
  entry.title = "Track Z"
  entry.channel = "Channel Z"
  entry.duration = 100
  entry.live = false
  entry.key = 9
  entry.auto = false
  return entry
}

// Queue A, B with an item under a name that is no position: "-1", which a
// careless reader would take for the place before the first item.
function _named() {
  var queue = [_A, _B]
  queue[-1] = _item("Z", 9, false)
  return queue
}

// Each of these is one step away from being an item: a member missing, of
// the wrong kind, beyond its limit, or one too many.
var _PARTIAL = [
  _STUB, _without("title"), _without("channel"), _without("duration"), _without("live"), _without("auto"),
  _but("title", 5), _but("title", null), _but("title", ["Track Z"]), _but("title", _letters(301)),
  _but("channel", 5), _but("channel", null), _but("channel", _letters(121)),
  _but("duration", "100"), _but("duration", 1.5), _but("duration", -1), _but("duration", 172801),
  _but("duration", 0 / 0), _but("duration", 1 / 0), _but("duration", [100]),
  _but("live", 1), _but("live", "false"), _but("live", null),
  _but("auto", 1), _but("auto", "true"), _but("auto", null),
  _but("key", 0), _but("key", "9"), _but("key", 9.5), _but("key", 2147483648),
  _but("id", "short"), _but("id", 5), _but("id", "ZZZZZZZZZZ/"),
  _but("extra", 1), _heir(), _listed(),
  // A track of unknown length is always marked live.
  { id: _id("Z"), title: "Track Z", channel: "Channel Z", duration: null, live: false, key: 9, auto: false }
]

// At the edge of what an item may be, and still one.
var _EDGE = [
  _but("title", _letters(300)), _but("title", ""), _but("channel", _letters(120)), _but("channel", ""),
  _but("duration", 0), _but("duration", 172800), _but("auto", true), _but("key", 2147483647),
  { id: _id("Z"), title: "Track Z", channel: "Channel Z", duration: null, live: true, key: 9, auto: false },
  _but("live", true)
]

// The members in another order than this file's builder gives them.
var _SHUFFLED = { auto: false, key: 9, live: false, duration: 100, channel: "Channel Z", title: "Track Z",
  id: _id("Z") }

// A stored track whose auto mark fails when it is read.
function _unreadable() {
  var stored = _track("B")
  Object.defineProperty(stored, "auto", {
    enumerable: true,
    get: function() { throw new Error("unreadable") }
  })
  return stored
}

// A stored track that only inherits an auto mark.
function _inheritedAuto() {
  var stored = Object.create({ auto: true })
  stored.id = _id("B")
  stored.title = "Track B"
  stored.channel = "Channel B"
  stored.duration = 100
  stored.live = false
  return stored
}

// Skip lists around the number of entries that are read from the end: B is
// the first entry of both, just out of reach in the longer one.
var _SKIPS_READ = [_id("B")].concat(_copies(_id("Z"), 4999))
var _SKIPS_LONG = [_id("B")].concat(_copies(_id("Z"), 5000))

// What the state file holds for an item: a track and its auto mark.
function _stored(letter, auto) {
  return {
    id: _id(letter), title: "Track " + letter, channel: "Channel " + letter, duration: 100, live: false,
    auto: auto
  }
}

// A stored list with two entries that are no tracks.
var _HOLES = [null, _stored("A", false), { id: "short", title: "t" }, _stored("B", false)]

// What a lookup reports about video Z.
var _NEWS_Z = { id: _id("Z"), title: "New", channel: "Ch", duration: 7, live: false }

// Every partial entry, to each way a function has of looking at an entry:
// as the queue of an edit, as the answer to a question, and as the current
// item and a neighbour of a plan. None may take it for an item.
function _partialCases() {
  var cases = []
  for (var i = 0; i < _PARTIAL.length; i++) {
    var entry = _PARTIAL[i]
    cases.push({ fn: "keepCurrent", args: [[entry], 0], expect: { ok: true, queue: [], index: -1 } })
    cases.push({ fn: "itemAt", args: [[entry], 0], expect: null })
    cases.push({ fn: "plan", args: [[_A, entry], 0, _all, [1], 1], expect: [] })
    cases.push({ fn: "plan", args: [[entry], 0, _all, [9, 5], 9], expect: [_rm(5)] })
  }
  return cases
}

function _edgeCases() {
  var cases = []
  for (var i = 0; i < _EDGE.length; i++) {
    cases.push({ fn: "itemAt", args: [[_EDGE[i]], 0], expect: _EDGE[i] })
  }
  return cases
}

var MODULE = "Queue"
var CASES = [
  // ---- item: a validated track plus key and auto ----
  { fn: "item", args: [_track("A"), 1, false], expect: _item("A", 1, false) },
  { fn: "item", args: [_track("A"), 7, true], expect: _item("A", 7, true) },
  { fn: "item", args: [_track("A"), 2147483647, false], expect: _item("A", 2147483647, false) },
  // Only a plain true marks an item as added by autoplay.
  { fn: "item", args: [_track("A"), 1, "true"], expect: _item("A", 1, false) },
  { fn: "item", args: [_track("A"), 1, 1], expect: _item("A", 1, false) },
  { fn: "item", args: [_track("A"), 1, null], expect: _item("A", 1, false) },
  // The text is cleaned and the number rounded, as for every track.
  { fn: "item", args: [_DIRTY, 3, false], expect: _cleaned(3) },
  // Members the track should not have are left behind, a key of its own included.
  { fn: "item", args: [_item("A", 99, true), 4, false], expect: _item("A", 4, false) },
  { fn: "item", args: [{ id: _id("A"), title: "t", channel: "c", duration: 5, live: false, extra: 1 }, 1, 0],
    expect: { id: _id("A"), title: "t", channel: "c", duration: 5, live: false, key: 1, auto: false } },
  // A track of unknown length counts as live.
  { fn: "item", args: [{ id: _id("A"), title: "t", channel: "", duration: null, live: false }, 1, false],
    expect: { id: _id("A"), title: "t", channel: "", duration: null, live: true, key: 1, auto: false } },
  // An id that is also the name of something every object has is just an id.
  { fn: "item", args: [_ODD, 1, false], expect: _oddItem(1, false) },
  // A track started from a bare link has no title yet.
  { fn: "item", args: [{ id: _id("A"), title: "", channel: "", duration: null, live: false }, 1, false],
    expect: { id: _id("A"), title: "", channel: "", duration: null, live: true, key: 1, auto: false } },
  // Not a key.
  { fn: "item", args: [_track("A"), 0, false], expect: null },
  { fn: "item", args: [_track("A"), -1, false], expect: null },
  { fn: "item", args: [_track("A"), 1.5, false], expect: null },
  { fn: "item", args: [_track("A"), 2147483648, false], expect: null },
  { fn: "item", args: [_track("A"), "1", false], expect: null },
  { fn: "item", args: [_track("A"), null, false], expect: null },
  { fn: "item", args: [_track("A"), [1], false], expect: null },
  { fn: "item", args: [_track("A"), true, false], expect: null },
  // Not a track.
  { fn: "item", args: [null, 1, false], expect: null },
  { fn: "item", args: ["AAAAAAAAAAA", 1, false], expect: null },
  { fn: "item", args: [[_track("A")], 1, false], expect: null },
  { fn: "item", args: [{}, 1, false], expect: null },
  { fn: "item", args: [{ id: "short", title: "t" }, 1, false], expect: null },
  { fn: "item", args: [{ id: "AAAAAAAAAA/", title: "t" }, 1, false], expect: null },
  { fn: "item", args: [{ id: "__proto__", title: "t" }, 1, false], expect: null },
  { fn: "item", args: [{ id: _id("A"), title: 5 }, 1, false], expect: null },
  { fn: "item", args: [{ id: _id("A") }, 1, false], expect: null },

  // ---- append: at the end, the current item stays where it is ----
  { fn: "append", args: [[], -1, _track("A"), 1, false], expect: { ok: true, queue: [_A], index: -1 } },
  { fn: "append", args: [[_A], 0, _track("B"), 2, false], expect: { ok: true, queue: [_A, _B], index: 0 } },
  { fn: "append", args: [_ABC, 2, _track("D"), 4, false],
    expect: { ok: true, queue: [_A, _B, _C, _D], index: 2 } },
  { fn: "append", args: [[_A], 0, _track("B"), 2, true],
    expect: { ok: true, queue: [_A, _item("B", 2, true)], index: 0 } },
  // The same video again is another insertion.
  { fn: "append", args: [[_A, _B], 1, _track("A"), 3, false], expect: { ok: true, queue: _ABA, index: 1 } },
  // A key is used once.
  { fn: "append", args: [_ABC, 0, _track("D"), 2, false], expect: { ok: false, code: "invalid" } },
  { fn: "append", args: [_ABC, 0, _track("D"), 0, false], expect: { ok: false, code: "invalid" } },
  { fn: "append", args: [_ABC, 0, _track("D"), "4", false], expect: { ok: false, code: "invalid" } },
  { fn: "append", args: [_ABC, 0, null, 4, false], expect: { ok: false, code: "invalid" } },
  { fn: "append", args: [_ABC, 0, { id: "nope" }, 4, false], expect: { ok: false, code: "invalid" } },
  // The size limit. A bad track is reported as such even when the queue is full.
  { fn: "append", args: [_ALMOST, 0, _numberedTrack(200), 200, false],
    expect: { ok: true, queue: _FULL, index: 0 } },
  { fn: "append", args: [_FULL, 0, _numberedTrack(201), 201, false], expect: { ok: false, code: "full" } },
  { fn: "append", args: [_FULL, 0, null, 201, false], expect: { ok: false, code: "invalid" } },
  // Whatever is not a queue counts as an empty one, and a damaged queue is
  // repaired on the way: what is no item goes, and so does a second item
  // under a key already seen. The current item is still the current item.
  { fn: "append", args: [null, 0, _track("A"), 1, false], expect: { ok: true, queue: [_A], index: -1 } },
  { fn: "append", args: ["queue", 0, _track("A"), 1, false], expect: { ok: true, queue: [_A], index: -1 } },
  { fn: "append", args: [{ length: 1 }, 0, _track("A"), 1, false],
    expect: { ok: true, queue: [_A], index: -1 } },
  { fn: "append", args: [_DAMAGED, 5, _track("C"), 3, false], expect: { ok: true, queue: _ABC, index: 1 } },
  { fn: "append", args: [_DAMAGED, 4, _track("C"), 3, false], expect: { ok: true, queue: _ABC, index: -1 } },
  { fn: "append", args: [_ABC, "1", _track("D"), 4, false],
    expect: { ok: true, queue: [_A, _B, _C, _D], index: -1 } },
  { fn: "append", args: [_ABC, 7, _track("D"), 4, false],
    expect: { ok: true, queue: [_A, _B, _C, _D], index: -1 } },

  // ---- appendAuto: what autoplay found, without repeats ----
  { fn: "appendAuto", args: [[_A], 0, [_track("B"), _track("C")], [], 2],
    expect: { ok: true, queue: [_A, _item("B", 2, true), _item("C", 3, true)], index: 0, added: 2,
      nextKey: 4 } },
  // Left out: the video the mix was made for, what was played before, what
  // is already queued, a second mention, and whatever is not a track.
  { fn: "appendAuto",
    args: [[_A, _B], 1, [_track("B"), _track("C"), _track("A"), null, _track("D"), _track("D"), _track("E")],
      [_id("C")], 10],
    expect: { ok: true, queue: [_A, _B, _item("D", 10, true), _item("E", 11, true)], index: 1, added: 2,
      nextKey: 12 } },
  { fn: "appendAuto", args: [[_A], 0, [_track("A"), _track("B")], [_id("B")], 2], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, [], [], 2], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, [null, "x", {}, { id: "short", title: "t" }], [], 2],
    expect: { ok: false } },
  // An id named like something every object has is neither skipped by
  // accident nor missed when it is listed.
  { fn: "appendAuto", args: [[], -1, [_ODD], [], 1],
    expect: { ok: true, queue: [_oddItem(1, true)], index: -1, added: 1, nextKey: 2 } },
  { fn: "appendAuto", args: [[], -1, [_ODD], ["constructor"], 1], expect: { ok: false } },
  { fn: "appendAuto", args: [[_oddItem(1, false)], 0, [_ODD, _track("B")], [], 2],
    expect: { ok: true, queue: [_oddItem(1, false), _item("B", 2, true)], index: 0, added: 1, nextKey: 3 } },
  // What is no id in the skip list is ignored.
  { fn: "appendAuto", args: [[], -1, [_track("B")], [null, 7, ["BBBBBBBBBBB"], {}], 1],
    expect: { ok: true, queue: [_item("B", 1, true)], index: -1, added: 1, nextKey: 2 } },
  // At most 20 are added, from the first 25 of the answer.
  { fn: "appendAuto", args: [[], -1, _numberedTracks(1, 30), [], 1],
    expect: { ok: true, queue: _numberedItems(1, 20, true), index: -1, added: 20, nextKey: 21 } },
  { fn: "appendAuto", args: [[_item("A", 900, false)], 0, _numberedTracks(1, 30), _numberedIds(1, 10), 11],
    expect: { ok: true, queue: [_item("A", 900, false)].concat(_numberedItems(11, 25, true)), index: 0,
      added: 15, nextKey: 26 } },
  // The queue's own limit holds here too.
  { fn: "appendAuto", args: [_numberedItems(1, 197, false), 3, _numberedTracks(198, 210), [], 198],
    expect: { ok: true, queue: _numberedItems(1, 197, false).concat(_numberedItems(198, 200, true)), index: 3,
      added: 3, nextKey: 201 } },
  { fn: "appendAuto", args: [_FULL, 0, _numberedTracks(300, 310), [], 300], expect: { ok: false } },
  // Keys: the first one must be a key, and none may be in use.
  { fn: "appendAuto", args: [[_A], 0, [_track("B")], [], 0], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, [_track("B")], [], "2"], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, [_track("B")], [], 1], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A, _C], 0, [_track("B"), _track("D")], [], 2], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, [_track("B"), _track("C")], [], 2147483647],
    expect: { ok: true, queue: [_A, _item("B", 2147483647, true)], index: 0, added: 1,
      nextKey: 2147483648 } },
  // Not lists.
  { fn: "appendAuto", args: [[_A], 0, null, [], 2], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, _track("B"), [], 2], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, [_track("B")], null, 2], expect: { ok: false } },
  { fn: "appendAuto", args: [[_A], 0, [_track("B")], _id("B"), 2], expect: { ok: false } },
  { fn: "appendAuto", args: [null, 0, [_track("B")], [], 2],
    expect: { ok: true, queue: [_item("B", 2, true)], index: -1, added: 1, nextKey: 3 } },

  // ---- remove: the current item stays current, unless it is the one removed ----
  { fn: "remove", args: [_ABC, 1, 1],
    expect: { ok: true, queue: [_B, _C], index: 0, wasCurrent: false, successor: -1 } },
  { fn: "remove", args: [_ABC, 1, 3],
    expect: { ok: true, queue: [_A, _B], index: 1, wasCurrent: false, successor: -1 } },
  { fn: "remove", args: [_ABC, 1, 2],
    expect: { ok: true, queue: [_A, _C], index: -1, wasCurrent: true, successor: 1 } },
  { fn: "remove", args: [_ABC, 0, 1],
    expect: { ok: true, queue: [_B, _C], index: -1, wasCurrent: true, successor: 0 } },
  { fn: "remove", args: [_ABC, 2, 3],
    expect: { ok: true, queue: [_A, _B], index: -1, wasCurrent: true, successor: -1 } },
  { fn: "remove", args: [[_A], 0, 1],
    expect: { ok: true, queue: [], index: -1, wasCurrent: true, successor: -1 } },
  { fn: "remove", args: [_ABC, -1, 2],
    expect: { ok: true, queue: [_A, _C], index: -1, wasCurrent: false, successor: -1 } },
  // Of two insertions of one video, only the one with that key goes.
  { fn: "remove", args: [_ABA, 1, 3],
    expect: { ok: true, queue: [_item("A", 1, false), _B], index: 1, wasCurrent: false, successor: -1 } },
  { fn: "remove", args: [_ABC, 1, 9], expect: { ok: false } },
  { fn: "remove", args: [_ABC, 1, 0], expect: { ok: false } },
  { fn: "remove", args: [_ABC, 1, "2"], expect: { ok: false } },
  { fn: "remove", args: [_ABC, 1, 2.5], expect: { ok: false } },
  { fn: "remove", args: [_ABC, 1, null], expect: { ok: false } },
  { fn: "remove", args: [_ABC, 1, _id("B")], expect: { ok: false } },
  { fn: "remove", args: [[], -1, 1], expect: { ok: false } },
  { fn: "remove", args: [null, 0, 1], expect: { ok: false } },
  { fn: "remove", args: [_DAMAGED, 5, 1],
    expect: { ok: true, queue: [_B], index: 0, wasCurrent: false, successor: -1 } },

  // ---- move: by so many places, stopping at the ends ----
  { fn: "move", args: [_ABC, 0, 3, -1], expect: { ok: true, queue: [_A, _C, _B], index: 0 } },
  { fn: "move", args: [_ABC, 0, 1, 1], expect: { ok: true, queue: [_B, _A, _C], index: 1 } },
  { fn: "move", args: [_ABC, 0, 1, 2], expect: { ok: true, queue: [_B, _C, _A], index: 2 } },
  { fn: "move", args: [_ABC, 0, 1, 99], expect: { ok: true, queue: [_B, _C, _A], index: 2 } },
  { fn: "move", args: [_ABC, 2, 3, -99], expect: { ok: true, queue: [_C, _A, _B], index: 0 } },
  // An item that crosses the current one shifts it by a place.
  { fn: "move", args: [_ABC, 1, 1, 2], expect: { ok: true, queue: [_B, _C, _A], index: 0 } },
  { fn: "move", args: [_ABC, 1, 3, -2], expect: { ok: true, queue: [_C, _A, _B], index: 2 } },
  { fn: "move", args: [_ABC, 1, 1, 1], expect: { ok: true, queue: [_B, _A, _C], index: 0 } },
  { fn: "move", args: [_ABC, 1, 3, -1], expect: { ok: true, queue: [_A, _C, _B], index: 2 } },
  { fn: "move", args: [_ABCDE, 2, 5, -1], expect: { ok: true, queue: [_A, _B, _C, _E, _D], index: 2 } },
  { fn: "move", args: [_ABCDE, 2, 1, 1], expect: { ok: true, queue: [_B, _A, _C, _D, _E], index: 2 } },
  { fn: "move", args: [_ABC, -1, 1, 1], expect: { ok: true, queue: [_B, _A, _C], index: -1 } },
  // Nothing would move.
  { fn: "move", args: [_ABC, 0, 1, -1], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, 3, 1], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, 2, 0], expect: { ok: false } },
  { fn: "move", args: [[_A], 0, 1, 5], expect: { ok: false } },
  // Not a key of this queue, not a whole number of places.
  { fn: "move", args: [_ABC, 0, 9, 1], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, "1", 1], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, 1, 0.5], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, 1, "1"], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, 1, null], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, 1, 1e400], expect: { ok: false } },
  { fn: "move", args: [null, 0, 1, 1], expect: { ok: false } },

  // ---- keepCurrent: the queue cut down to what is playing ----
  { fn: "keepCurrent", args: [_ABC, 1], expect: { ok: true, queue: [_B], index: 0 } },
  { fn: "keepCurrent", args: [_ABC, 2], expect: { ok: true, queue: [_C], index: 0 } },
  { fn: "keepCurrent", args: [[_A], 0], expect: { ok: true, queue: [_A], index: 0 } },
  { fn: "keepCurrent", args: [_ABC, -1], expect: { ok: true, queue: [], index: -1 } },
  { fn: "keepCurrent", args: [_ABC, 3], expect: { ok: true, queue: [], index: -1 } },
  { fn: "keepCurrent", args: [_ABC, "1"], expect: { ok: true, queue: [], index: -1 } },
  { fn: "keepCurrent", args: [[], -1], expect: { ok: true, queue: [], index: -1 } },
  { fn: "keepCurrent", args: [null, 0], expect: { ok: true, queue: [], index: -1 } },
  { fn: "keepCurrent", args: [_DAMAGED, 5], expect: { ok: true, queue: [_B], index: 0 } },
  { fn: "keepCurrent", args: [_DAMAGED, 0], expect: { ok: true, queue: [], index: -1 } },

  // ---- withTrack: what a lookup reported replaces what was known ----
  { fn: "withTrack", args: [[_A, _BARE_B], 1, 2, _track("B")],
    expect: { ok: true, queue: [_A, _item("B", 2, true)], index: 1 } },
  { fn: "withTrack", args: [_ABC, 0, 2, _NEWS_B], expect: { ok: true, queue: [_A, _NEW_B, _C], index: 0 } },
  { fn: "withTrack", args: [_ABC, -1, 2, _NEWS_B], expect: { ok: true, queue: [_A, _NEW_B, _C], index: -1 } },
  { fn: "withTrack", args: [_ABC, 0, 2, _SAME_B], expect: { ok: false } },
  // Nothing new, another video, no such key, no track.
  { fn: "withTrack", args: [_ABC, 0, 2, _track("B")], expect: { ok: false } },
  { fn: "withTrack", args: [_ABC, 0, 2, _track("C")], expect: { ok: false } },
  { fn: "withTrack", args: [_ABC, 0, 9, _track("B")], expect: { ok: false } },
  { fn: "withTrack", args: [_ABC, 0, "2", _track("B")], expect: { ok: false } },
  { fn: "withTrack", args: [_ABC, 0, 2, null], expect: { ok: false } },
  { fn: "withTrack", args: [_ABC, 0, 2, { id: _id("B") }], expect: { ok: false } },
  { fn: "withTrack", args: [null, 0, 2, _track("B")], expect: { ok: false } },

  // ---- fromStored: the queue of the last session, under new keys ----
  { fn: "fromStored", args: [[_stored("A", false), _stored("B", true), _stored("C", false)], 1, 1],
    expect: { ok: true, queue: [_A, _item("B", 2, true), _C], index: 1, nextKey: 4 } },
  { fn: "fromStored", args: [[_stored("A", false)], 0, 40],
    expect: { ok: true, queue: [_item("A", 40, false)], index: 0, nextKey: 41 } },
  // A stored key means nothing in a new session, and extra members are dropped.
  { fn: "fromStored", args: [[_item("A", 77, false)], 0, 1],
    expect: { ok: true, queue: [_A], index: 0, nextKey: 2 } },
  // Only a plain true is an auto mark.
  { fn: "fromStored", args: [[_stored("A", "true"), _stored("B", 1), _track("C")], 0, 1],
    expect: { ok: true, queue: _ABC, index: 0, nextKey: 4 } },
  // What is no track is dropped, and the current item is found again.
  { fn: "fromStored", args: [_HOLES, 3, 1], expect: { ok: true, queue: [_A, _B], index: 1, nextKey: 3 } },
  { fn: "fromStored", args: [_HOLES, 1, 1], expect: { ok: true, queue: [_A, _B], index: 0, nextKey: 3 } },
  { fn: "fromStored", args: [_HOLES, 2, 1], expect: { ok: true, queue: [_A, _B], index: -1, nextKey: 3 } },
  { fn: "fromStored", args: [_HOLES, 0, 1], expect: { ok: true, queue: [_A, _B], index: -1, nextKey: 3 } },
  { fn: "fromStored", args: [[_stored("A", false), _stored("B", false)], 2, 1],
    expect: { ok: true, queue: [_A, _B], index: -1, nextKey: 3 } },
  { fn: "fromStored", args: [[_stored("A", false), _stored("B", false)], -1, 1],
    expect: { ok: true, queue: [_A, _B], index: -1, nextKey: 3 } },
  { fn: "fromStored", args: [[_stored("A", false), _stored("B", false)], "0", 1],
    expect: { ok: true, queue: [_A, _B], index: -1, nextKey: 3 } },
  { fn: "fromStored", args: [[_stored("A", false), _stored("B", false)], 0.5, 1],
    expect: { ok: true, queue: [_A, _B], index: -1, nextKey: 3 } },
  // The text is cleaned on the way in.
  { fn: "fromStored", args: [[_DIRTY], 0, 1],
    expect: { ok: true, queue: [_cleaned(1)], index: 0, nextKey: 2 } },
  // No more than the queue may hold.
  { fn: "fromStored", args: [_numberedItems(1, 250, false), 199, 1],
    expect: { ok: true, queue: _FULL, index: 199, nextKey: 201 } },
  { fn: "fromStored", args: [_numberedItems(1, 250, false), 200, 1],
    expect: { ok: true, queue: _FULL, index: -1, nextKey: 201 } },
  // Keys run out at the largest one: what would need a key beyond it is left out.
  { fn: "fromStored", args: [[_stored("A", false), _stored("B", false), _stored("C", false)], 2, 2147483646],
    expect: { ok: true, queue: [_item("A", 2147483646, false), _item("B", 2147483647, false)], index: -1,
      nextKey: 2147483648 } },
  // Not a list: an empty queue. Not a key: refused.
  { fn: "fromStored", args: [null, 0, 1], expect: { ok: true, queue: [], index: -1, nextKey: 1 } },
  { fn: "fromStored", args: [{ items: [_stored("A", false)] }, 0, 1],
    expect: { ok: true, queue: [], index: -1, nextKey: 1 } },
  { fn: "fromStored", args: ["[]", 0, 1], expect: { ok: true, queue: [], index: -1, nextKey: 1 } },
  { fn: "fromStored", args: [[], 0, 5], expect: { ok: true, queue: [], index: -1, nextKey: 5 } },
  { fn: "fromStored", args: [[_stored("A", false)], 0, 0], expect: { ok: false } },
  { fn: "fromStored", args: [[_stored("A", false)], 0, "1"], expect: { ok: false } },
  { fn: "fromStored", args: [[_stored("A", false)], 0, null], expect: { ok: false } },

  // ---- itemAt ----
  { fn: "itemAt", args: [_ABC, 0], expect: _A },
  { fn: "itemAt", args: [_ABC, 2], expect: _C },
  { fn: "itemAt", args: [_ABC, 3], expect: null },
  { fn: "itemAt", args: [_ABC, -1], expect: null },
  { fn: "itemAt", args: [_ABC, 1.5], expect: null },
  { fn: "itemAt", args: [_ABC, "1"], expect: null },
  { fn: "itemAt", args: [_ABC, null], expect: null },
  { fn: "itemAt", args: [_ABC, "length"], expect: null },
  { fn: "itemAt", args: [_DAMAGED, 0], expect: null },
  { fn: "itemAt", args: [_DAMAGED, 3], expect: null },
  { fn: "itemAt", args: [_DAMAGED, 6], expect: null },
  { fn: "itemAt", args: [_DAMAGED, 1], expect: _A },
  { fn: "itemAt", args: [null, 0], expect: null },
  { fn: "itemAt", args: ["abc", 0], expect: null },
  { fn: "itemAt", args: [{ 0: _A, length: 1 }, 0], expect: null },

  // ---- indexOfKey ----
  { fn: "indexOfKey", args: [_ABC, 1], expect: 0 },
  { fn: "indexOfKey", args: [_ABC, 3], expect: 2 },
  { fn: "indexOfKey", args: [_ABA, 3], expect: 2 },
  { fn: "indexOfKey", args: [_ABC, 4], expect: -1 },
  { fn: "indexOfKey", args: [_ABC, 0], expect: -1 },
  { fn: "indexOfKey", args: [_ABC, "1"], expect: -1 },
  { fn: "indexOfKey", args: [_ABC, null], expect: -1 },
  { fn: "indexOfKey", args: [_ABC, _id("A")], expect: -1 },
  { fn: "indexOfKey", args: [_DAMAGED, 2], expect: 5 },
  { fn: "indexOfKey", args: [[], 1], expect: -1 },
  { fn: "indexOfKey", args: [null, 1], expect: -1 },

  // ---- nextIndex, previousIndex: only from a current item ----
  { fn: "nextIndex", args: [_ABC, 0], expect: 1 },
  { fn: "nextIndex", args: [_ABC, 1], expect: 2 },
  { fn: "nextIndex", args: [_ABC, 2], expect: -1 },
  { fn: "nextIndex", args: [_ABC, -1], expect: -1 },
  { fn: "nextIndex", args: [_ABC, 5], expect: -1 },
  { fn: "nextIndex", args: [_ABC, "0"], expect: -1 },
  { fn: "nextIndex", args: [[_A], 0], expect: -1 },
  { fn: "nextIndex", args: [[], -1], expect: -1 },
  { fn: "nextIndex", args: [null, 0], expect: -1 },
  { fn: "previousIndex", args: [_ABC, 2], expect: 1 },
  { fn: "previousIndex", args: [_ABC, 1], expect: 0 },
  { fn: "previousIndex", args: [_ABC, 0], expect: -1 },
  { fn: "previousIndex", args: [_ABC, 3], expect: -1 },
  { fn: "previousIndex", args: [_ABC, -1], expect: -1 },
  { fn: "previousIndex", args: [_ABC, "2"], expect: -1 },
  { fn: "previousIndex", args: [null, 1], expect: -1 },

  // ---- keepIds: the videos mpv may open by itself ----
  { fn: "keepIds", args: [_ABCDE, 2], expect: [_id("B"), _id("C"), _id("D")] },
  { fn: "keepIds", args: [_ABCDE, 0], expect: [_id("A"), _id("B")] },
  { fn: "keepIds", args: [_ABCDE, 4], expect: [_id("D"), _id("E")] },
  { fn: "keepIds", args: [[_A], 0], expect: [_id("A")] },
  { fn: "keepIds", args: [_ABA, 1], expect: [_id("A"), _id("B")] },
  { fn: "keepIds", args: [_ABCDE, -1], expect: [] },
  { fn: "keepIds", args: [_ABCDE, 5], expect: [] },
  { fn: "keepIds", args: [_ABCDE, "2"], expect: [] },
  { fn: "keepIds", args: [[], 0], expect: [] },
  { fn: "keepIds", args: [null, 0], expect: [] },

  // ---- plan: the current item plays, the window is built around it ----
  { fn: "plan", args: [_ABC, 1, _all, [2], 2],
    expect: [
      { op: "load", key: 1, mode: "insert-at", index: 0 },
      { op: "load", key: 3, mode: "append-play", index: -1 }
    ] },
  { fn: "plan", args: [_ABCDE, 2, _none, [1, 3, 5], 3],
    expect: [{ op: "remove", key: 5 }, { op: "remove", key: 1 }] },
  { fn: "plan", args: [_ABC, 1, _none, [2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _onlyC, [2], 2], expect: [_after(3)] },
  { fn: "plan", args: [_ABC, 1, _onlyA, [2], 2], expect: [_before(1)] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2, 3], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], 2], expect: [_after(3)] },
  { fn: "plan", args: [_ABC, 1, _all, [2, 3], 2], expect: [_before(1)] },
  // The ends of the queue have one neighbour, a queue of one has none.
  { fn: "plan", args: [_ABC, 0, _all, [1], 1], expect: [_after(2)] },
  { fn: "plan", args: [_ABC, 2, _all, [3], 3], expect: [_before(2)] },
  { fn: "plan", args: [[_A], 0, _all, [1], 1], expect: [] },
  // mpv moved on by itself from B to C: A is no neighbour any more, D is one now.
  { fn: "plan", args: [_ABCDE, 2, _all, [1, 2, 3], 3], expect: [_rm(1), _after(4)] },
  // ... and back from C to B.
  { fn: "plan", args: [_ABCDE, 1, _all, [2, 3, 4], 2], expect: [_rm(4), _before(1)] },
  // Entries that are no neighbours go, from the back of the playlist to the front.
  { fn: "plan", args: [_ABCDE, 2, _all, [1, 8, 2, 3, 4, 9, 5], 3],
    expect: [_rm(5), _rm(9), _rm(8), _rm(1)] },
  // A neighbour on the wrong side is removed and loaded again where it belongs.
  { fn: "plan", args: [_ABC, 1, _all, [3, 2, 1], 2], expect: [_rm(1), _rm(3), _before(1), _after(3)] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 3, 2], 2], expect: [_rm(3), _rm(1), _before(1), _after(3)] },
  { fn: "plan", args: [_ABC, 1, _all, [2, 1], 2], expect: [_rm(1), _before(1), _after(3)] },
  { fn: "plan", args: [_ABC, 1, _all, [3, 2], 2], expect: [_rm(3), _before(1), _after(3)] },
  // A neighbour whose lookup is no longer usable leaves the window.
  { fn: "plan", args: [_ABC, 1, _onlyA, [1, 2, 3], 2], expect: [_rm(3)] },
  { fn: "plan", args: [_ABC, 1, _none, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  // The same video before and after: two entries, told apart by key.
  { fn: "plan", args: [_ABA, 1, _all, [2], 2], expect: [_before(1), _after(3)] },

  // ---- plan: another track was asked for, the old one still plays ----
  // Everything but the playing entry goes, and nothing is loaded.
  { fn: "plan", args: [_ABC, 2, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, 0, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [[_D], 0, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [[_D], 0, _all, [2], 2], expect: [] },
  { fn: "plan", args: [[_D], 0, _all, [2, 3], 3], expect: [_rm(2)] },
  // Nothing plays: only an entry of the current item itself is spared, the
  // track that was handed to mpv a moment ago and is about to open.
  { fn: "plan", args: [_ABC, 1, _all, [1, 2, 3], 0], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, 1, _all, [2], 0], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [2, 2, 1], 0], expect: [_rm(1)] },
  { fn: "plan", args: [_ABC, 1, _none, [3, 1], 0], expect: [_rm(1), _rm(3)] },
  { fn: "plan", args: [_ABC, 1, _all, [], 0], expect: [] },
  // No current item: the same.
  { fn: "plan", args: [_ABC, -1, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [[], -1, _all, [1, 2], 0], expect: [_rm(2), _rm(1)] },
  { fn: "plan", args: [[], -1, _all, [], 0], expect: [] },

  // ---- plan: keys that cannot be right ----
  // mpv plays an entry the keys do not list: nothing is touched.
  { fn: "plan", args: [_ABC, 1, _all, [], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 3], 2], expect: [] },
  { fn: "plan", args: [[_D], 0, _all, [1, 2, 3], 9], expect: [] },
  // An entry without a key cannot be named, and nothing is loaded around
  // it. What can be named goes, as if another track were awaited.
  { fn: "plan", args: [_ABC, 1, _all, [0, 2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [2, 0], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2, 0, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, 1, _all, [2, "3", null, 1.5, -1], 2], expect: [] },
  { fn: "plan", args: [[_D], 0, _all, [0, 0, 3], 0], expect: [_rm(3)] },
  // A key that is listed twice is removed once, and only where either of
  // its positions is safe to use. Nothing is loaded.
  { fn: "plan", args: [_ABC, 1, _all, [2, 3, 3], 2], expect: [_rm(3)] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 1, 2], 2], expect: [_rm(1)] },
  { fn: "plan", args: [_ABC, 1, _all, [3, 2, 3], 2], expect: [_rm(3)] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 9, 1, 2], 2], expect: [_rm(9)] },
  { fn: "plan", args: [_ABC, 1, _all, [9, 1, 1, 2], 2], expect: [_rm(1), _rm(9)] },
  // The playing entry is spared however often it is listed.
  { fn: "plan", args: [_ABC, 1, _all, [2, 2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [2, 1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [[_D], 0, _all, [2, 1, 2], 2], expect: [_rm(1)] },

  // ---- plan: hostile arguments ----
  // A readiness test that is no function, fails, or answers something else
  // than true: nothing is ready.
  { fn: "plan", args: [_ABC, 1, null, [2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, true, [2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, [_id("A"), _id("C")], [2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _broken, [2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _one, [2], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _broken, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  // Keys that are no list, that are no keys, or that are more than any
  // queue has items.
  { fn: "plan", args: [_ABC, 1, _all, null, 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, "123", 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, { 0: 2, length: 1 }, 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, 2, 2], expect: [] },
  { fn: "plan", args: [[_D], 0, _all, _numberedIds(1, 3), 0], expect: [] },
  { fn: "plan", args: [[_item("D", 900, false)], 0, _all, _count(200), 0], expect: _removals(200) },
  { fn: "plan", args: [[_item("D", 900, false)], 0, _all, _count(201), 0], expect: [] },
  // Only 0 says "nothing plays". A playing key that is neither 0 nor a key
  // says nothing, and then nothing is touched.
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], "2"], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], null], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], -2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], 2.5], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], false], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], [2]], expect: [] },
  // No queue, no index: the playing entry stays, the rest goes.
  { fn: "plan", args: [null, 0, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, "1", _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, 1.5, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_DAMAGED, 1, _all, [1], 1], expect: [] },
  // A queue that names one key on both sides of the current item, or the
  // current item's own key beside it, is no queue of ours: such a
  // neighbour is not loaded.
  { fn: "plan", args: [[_A, _B, _item("C", 1, false)], 1, _all, [2], 2], expect: [] },
  { fn: "plan", args: [[_A, _B, _item("C", 2, false)], 1, _all, [2], 2], expect: [_before(1)] },
  // Numbers that are no positions and no keys.
  { fn: "plan", args: [_ABC, 0 / 0, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, 1 / 0, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, 1e308, _all, [1, 2, 3], 2], expect: [_rm(3), _rm(1)] },
  { fn: "plan", args: [_ABC, -0, _all, [1], 1], expect: [_after(2)] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], 0 / 0], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], 1e308], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2], -0], expect: [_rm(1)] },
  { fn: "plan", args: [_ABC, -1, _all, [1, 2], -0], expect: [_rm(2), _rm(1)] },
  { fn: "plan", args: [_ABC, 1, _all, [0 / 0, 2, -0, 1e308, 1 / 0], 2], expect: [] },
  { fn: "plan", args: [_ABC, 1, _all, [1, 2, 1e308, 3], 2], expect: [_rm(3), _rm(1)] },

  // ---- Entries that are items only in part ----
  // An edit hands on items and nothing else: what lacks a member, has one
  // of the wrong kind or beyond its limit, or has one too many, is left
  // out like anything else that is no item.
  { fn: "append", args: [[_A, _STUB, _B], 2, _track("C"), 3, false],
    expect: { ok: true, queue: _ABC, index: 1 } },
  { fn: "append", args: [[_A, _but("title", 5), _B], 1, _track("C"), 3, false],
    expect: { ok: true, queue: _ABC, index: -1 } },
  // Its key is free, and its video is not in the queue.
  { fn: "append", args: [[_but("live", 1)], 0, _track("Z"), 9, false],
    expect: { ok: true, queue: [_item("Z", 9, false)], index: -1 } },
  { fn: "appendAuto", args: [[_but("auto", 1)], 0, [_track("Z")], [], 20],
    expect: { ok: true, queue: [_item("Z", 20, true)], index: -1, added: 1, nextKey: 21 } },
  { fn: "remove", args: [[_A, _without("channel"), _B], 2, 9], expect: { ok: false } },
  { fn: "remove", args: [[_A, _but("duration", "100"), _B], 2, 1],
    expect: { ok: true, queue: [_B], index: 0, wasCurrent: false, successor: -1 } },
  { fn: "move", args: [[_A, _but("duration", 1.5), _B], 0, 1, 1],
    expect: { ok: true, queue: [_B, _A], index: 1 } },
  { fn: "move", args: [[_A, _STUB, _B], 0, 9, 1], expect: { ok: false } },
  { fn: "withTrack", args: [[_A, _but("title", null), _B], 0, 9, _NEWS_Z], expect: { ok: false } },
  { fn: "withTrack", args: [[_A, _STUB, _B], 0, 9, _NEWS_Z], expect: { ok: false } },
  { fn: "indexOfKey", args: [[_A, _STUB, _B], 9], expect: -1 },
  { fn: "indexOfKey", args: [[_A, _but("extra", 1), _B], 9], expect: -1 },
  { fn: "indexOfKey", args: [[_A, _STUB, _B], 2], expect: 2 },
  { fn: "nextIndex", args: [[_A, _but("auto", null)], 0], expect: -1 },
  { fn: "previousIndex", args: [[_but("channel", 5), _B], 1], expect: -1 },
  { fn: "keepIds", args: [[_STUB, _A, _but("live", null)], 1], expect: [_id("A")] },
  // The window is built from items only.
  { fn: "plan", args: [[_STUB, _B, _but("title", 5)], 1, _all, [2], 2], expect: [] },
  { fn: "plan", args: [[_STUB, _B, _C], 1, _all, [9, 2], 2], expect: [_rm(9), _after(3)] },
  // A position is a place in the list, never a name on it.
  { fn: "itemAt", args: [_named(), -1], expect: null },
  { fn: "nextIndex", args: [_named(), -1], expect: -1 },
  { fn: "previousIndex", args: [_named(), 0], expect: -1 },
  { fn: "keepIds", args: [_named(), 0], expect: [_id("A"), _id("B")] },
  { fn: "plan", args: [_named(), 0, _all, [1], 1], expect: [_after(2)] },
  // Whatever order the members come in, an item is an item.
  { fn: "itemAt", args: [[_SHUFFLED], 0], expect: _SHUFFLED },
  { fn: "indexOfKey", args: [[_A, _SHUFFLED], 9], expect: 1 },

  // ---- withTrack: a lookup always reports a title ----
  { fn: "withTrack", args: [_ABC, 0, 2, { id: _id("B"), title: "", channel: "Ch", duration: 7, live: false }],
    expect: { ok: false } },
  { fn: "withTrack",
    args: [_ABC, 0, 2, { id: _id("B"), title: " \u200b ", channel: "Ch", duration: 7, live: false }],
    expect: { ok: false } },

  // ---- appendAuto: a long list of videos to leave out is read from its end ----
  { fn: "appendAuto", args: [[], -1, [_track("B")], _SKIPS_READ, 1], expect: { ok: false } },
  { fn: "appendAuto", args: [[], -1, [_track("B")], _SKIPS_LONG, 1],
    expect: { ok: true, queue: [_item("B", 1, true)], index: -1, added: 1, nextKey: 2 } },
  { fn: "appendAuto", args: [[], -1, [_track("B"), _track("Z")], _SKIPS_LONG, 1],
    expect: { ok: true, queue: [_item("B", 1, true)], index: -1, added: 1, nextKey: 2 } },

  // ---- fromStored: one element that cannot be read costs that element only ----
  { fn: "fromStored", args: [[_stored("A", false), _unreadable(), _stored("C", true)], 2, 1],
    expect: { ok: true, queue: [_A, _item("C", 2, true)], index: 1, nextKey: 3 } },
  { fn: "fromStored", args: [[_stored("A", false), _unreadable(), _stored("C", true)], 1, 1],
    expect: { ok: true, queue: [_A, _item("C", 2, true)], index: -1, nextKey: 3 } },
  // An auto mark counts only when the element carries it itself.
  { fn: "fromStored", args: [[_inheritedAuto()], 0, 1],
    expect: { ok: true, queue: [_item("B", 1, false)], index: 0, nextKey: 2 } },

  // ---- Text and numbers from outside ----
  // Half of a surrogate pair, and names every object answers to.
  { fn: "item",
    args: [{ id: _id("A"), title: "a\ud83db", channel: "\udc00", duration: 5, live: false }, 1, false],
    expect: { id: _id("A"), title: "ab", channel: "", duration: 5, live: false, key: 1, auto: false } },
  { fn: "item", args: [{ id: _id("A"), title: "__proto__", channel: "toString", duration: 5 }, 1, false],
    expect: { id: _id("A"), title: "__proto__", channel: "toString", duration: 5, live: false, key: 1,
      auto: false } },
  { fn: "item", args: [{ id: "toString", title: "t" }, 1, false], expect: null },
  { fn: "item", args: [{ id: "hasOwnProperty", title: "t" }, 1, false], expect: null },
  // What an empty object merely inherits is neither a stored track nor an item.
  { fn: "fromStored", args: [[Object.create(_track("A"))], 0, 1],
    expect: { ok: true, queue: [], index: -1, nextKey: 1 } },
  { fn: "itemAt", args: [[Object.create(_A)], 0], expect: null },
  { fn: "item", args: [_track("A"), 0 / 0, false], expect: null },
  { fn: "item", args: [_track("A"), 1 / 0, false], expect: null },
  { fn: "item", args: [_track("A"), 1e308, false], expect: null },
  { fn: "item", args: [_track("A"), -0, false], expect: null },
  { fn: "item", args: [{ id: _id("A"), title: "t", channel: "", duration: 1e308, live: false }, 1, false],
    expect: { id: _id("A"), title: "t", channel: "", duration: null, live: true, key: 1, auto: false } },
  { fn: "move", args: [_ABC, 0, 1, 1e308], expect: { ok: true, queue: [_B, _C, _A], index: 2 } },
  { fn: "move", args: [_ABC, 0, 3, -1e308], expect: { ok: true, queue: [_C, _A, _B], index: 1 } },
  { fn: "move", args: [_ABC, 0, 1, -0], expect: { ok: false } },
  { fn: "move", args: [_ABC, 0, 1, 0 / 0], expect: { ok: false } },
  { fn: "remove", args: [_ABC, -0, 1],
    expect: { ok: true, queue: [_B, _C], index: -1, wasCurrent: true, successor: 0 } },
  { fn: "remove", args: [_ABC, 0 / 0, 1],
    expect: { ok: true, queue: [_B, _C], index: -1, wasCurrent: false, successor: -1 } },
  { fn: "remove", args: [_ABC, 1, 0 / 0], expect: { ok: false } },
  { fn: "remove", args: [_ABC, 1, 1e308], expect: { ok: false } },
  { fn: "itemAt", args: [_ABC, 1e308], expect: null },
  { fn: "itemAt", args: [_ABC, 0 / 0], expect: null },
  { fn: "indexOfKey", args: [_ABC, 0 / 0], expect: -1 },
  { fn: "fromStored", args: [[_stored("A", false)], 0, 0 / 0], expect: { ok: false } },
  { fn: "fromStored", args: [[_stored("A", false)], 0, 1e308], expect: { ok: false } },
  { fn: "fromStored", args: [[_stored("A", false)], 0 / 0, 1],
    expect: { ok: true, queue: [_A], index: -1, nextKey: 2 } },
  { fn: "appendAuto", args: [[_A], 0, [_track("B")], [], 1e308], expect: { ok: false } }
].concat(_partialCases(), _edgeCases())

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
