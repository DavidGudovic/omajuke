"use strict"
// Tests for lib/Queue.js: the vector table (also run inside Qt's engine),
// every edit of a queue checked over all small queues against a second,
// simpler way of doing the same thing, and the planner's guarantees checked
// over every small case there is rather than a handful of examples. The
// planner is judged by what its steps do to a model of mpv's playlist, so a
// plan that looks right but would cut the playing track fails here. What
// an item is, is said a second time in this file, and every function is
// held to it: whatever it is handed, it answers with items or not at all.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Queue = load.lib("Queue")
var Const = load.lib("Const")
var table = load.vectors("queue")

var LETTERS = ["A", "B", "C", "D", "E", "F"]
var ITEM_FIELDS = ["id", "title", "channel", "duration", "live", "key", "auto"]
var MAX_KEY = 2147483647

function idOf(letter) {
  return letter.repeat(11)
}

function trackOf(letter) {
  return {
    id: idOf(letter), title: "Track " + letter, channel: "Channel " + letter, duration: 100, live: false
  }
}

function itemOf(letter, key, auto) {
  return Object.assign(trackOf(letter), { key: key, auto: auto === true })
}

// Items A, B, C, ... under the keys 1, 2, 3, ...
function queueOf(size) {
  var queue = []
  for (var i = 0; i < size; i++) queue.push(itemOf(LETTERS[i], i + 1, false))
  return queue
}

function keysOf(queue) {
  return queue.map(function(entry) { return entry.key })
}

function idsOf(queue) {
  return queue.map(function(entry) { return entry.id })
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Frozen arguments make any attempt to change them in place throw.
function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.keys(value).forEach(function(name) { deepFreeze(value[name]) })
  }
  return value
}

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

// Every sequence over the alphabet up to a length, with or without the
// same element twice.
function sequences(alphabet, maxLength, distinct) {
  var all = [[]]
  var grown = [[]]
  for (var length = 1; length <= maxLength; length++) {
    var next = []
    grown.forEach(function(prefix) {
      alphabet.forEach(function(element) {
        if (!distinct || prefix.indexOf(element) < 0) next.push(prefix.concat([element]))
      })
    })
    all = all.concat(next)
    grown = next
  }
  return all
}

function subsets(list) {
  var all = []
  for (var mask = 0; mask < (1 << list.length); mask++) {
    all.push(list.filter(function(element, i) { return (mask >> i) & 1 }))
  }
  return all
}

// What an item is, said a second time: exactly the seven fields, each of
// its type and within its limit, and unknown length only on a live track.
function isSoundItem(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false
  if (Object.keys(entry).sort().join() !== ITEM_FIELDS.slice().sort().join()) return false
  return /^[A-Za-z0-9_-]{11}$/.test(entry.id)
    && typeof entry.title === "string" && entry.title.length <= Const.LIMITS.titleChars
    && typeof entry.channel === "string" && entry.channel.length <= Const.LIMITS.channelChars
    && (entry.duration === null ? entry.live === true
      : Number.isInteger(entry.duration) && entry.duration >= 0
        && entry.duration <= Const.LIMITS.durationSeconds)
    && typeof entry.live === "boolean"
    && Number.isInteger(entry.key) && entry.key >= 1 && entry.key <= MAX_KEY
    && typeof entry.auto === "boolean"
}

// What the answer of an edit must be, whatever went in: nothing but items,
// each key once, no more than a queue may hold, and an index that points at
// one of them or is -1.
function assertSoundQueue(result, label) {
  assert.strictEqual(result.ok, true, label)
  assert.ok(Array.isArray(result.queue) && result.queue.length <= Const.LIMITS.queueItems, label)
  var seen = new Set()
  result.queue.forEach(function(entry) {
    assert.ok(isSoundItem(entry), label)
    assert.ok(!seen.has(entry.key), label)
    seen.add(entry.key)
  })
  assert.ok(Number.isInteger(result.index) && result.index >= -1 && result.index < result.queue.length, label)
}

// An item with exactly one thing wrong about it, in every way there is.
function partialItems() {
  function but(changes) {
    return Object.assign(itemOf("E", 50, false), changes)
  }
  function without(name) {
    var entry = itemOf("E", 50, false)
    delete entry[name]
    return entry
  }
  return ITEM_FIELDS.map(without).concat([
    but({ id: 5 }), but({ id: "short" }), but({ id: "EEEEEEEEEE " }), but({ id: null }),
    but({ title: 5 }), but({ title: null }), but({ title: ["t"] }), but({ title: {} }),
    but({ title: "x".repeat(Const.LIMITS.titleChars + 1) }),
    but({ channel: 5 }), but({ channel: null }), but({ channel: "x".repeat(Const.LIMITS.channelChars + 1) }),
    but({ duration: "100" }), but({ duration: 1.5 }), but({ duration: -1 }), but({ duration: NaN }),
    but({ duration: Infinity }), but({ duration: undefined }), but({ duration: [100] }),
    // The last of this row: unknown length on a track that is not marked live.
    but({ duration: Const.LIMITS.durationSeconds + 1 }), but({ duration: null }),
    but({ live: 1 }), but({ live: 0 }), but({ live: "false" }), but({ live: null }),
    but({ key: 0 }), but({ key: -50 }), but({ key: 50.5 }), but({ key: "50" }), but({ key: MAX_KEY + 1 }),
    but({ auto: 1 }), but({ auto: 0 }), but({ auto: "true" }), but({ auto: null }),
    but({ extra: 1 }), but({ toString: 1 }),
    // All seven members, but none of its own; six of its own, one inherited
    // and one too many; and a list that carries the seven as names.
    Object.create(itemOf("E", 50, false)),
    Object.assign(Object.create({ auto: false }), without("auto"), { extra: 1 }),
    Object.assign([], itemOf("E", 50, false)),
    { id: idOf("E"), key: 50 }
  ])
}

// An object that is item C under key 3 the first time its key is read, and
// answers with "later" for its key from then on.
function shifting(later) {
  var entry = itemOf("C", 3, false)
  var reads = 0
  Object.defineProperty(entry, "key", {
    enumerable: true,
    get: function() {
      reads++
      return reads === 1 ? 3 : later
    }
  })
  return entry
}

// Objects that run code of their own when they are looked at, and fail: one
// whose every member throws when read, one that is an item until its key
// has been read twice, one whose text form cannot be had, traps around an
// object and around a list, and two that were revoked.
function failingObjects() {
  var throwing = {}
  var names = ITEM_FIELDS.concat(["length", "0", "1", "op", "gen"])
  names.forEach(function(name) {
    Object.defineProperty(throwing, name, { enumerable: true, get: function() { throw new Error("getter") } })
  })
  var reads = 0
  var fickle = { id: "AAAAAAAAAAA", title: "t", channel: "", duration: 1, live: false, auto: false }
  Object.defineProperty(fickle, "key", {
    enumerable: true,
    get: function() {
      reads++
      if (reads > 2) throw new Error("fickle")
      return 2
    }
  })
  var noText = { id: "AAAAAAAAAAA", title: { toString: function() { throw new Error("toString") } }, key: 1 }
  var traps = {
    get: function() { throw new Error("trap") },
    has: function() { throw new Error("trap") },
    ownKeys: function() { throw new Error("trap") },
    getOwnPropertyDescriptor: function() { throw new Error("trap") }
  }
  var revokedObject = Proxy.revocable({}, {})
  var revokedList = Proxy.revocable([], {})
  revokedObject.revoke()
  revokedList.revoke()
  return [throwing, fickle, noText, new Proxy({}, traps), new Proxy([1, 2, 3], traps), revokedObject.proxy,
    revokedList.proxy]
}

// Nested a few thousand deep: more than a walk by recursion survives.
function deeplyNested() {
  var top = {}
  var inner = top
  for (var depth = 0; depth < 5000; depth++) {
    inner.id = "AAAAAAAAAAA"
    inner.key = 1
    inner.title = {}
    inner = inner.title
  }
  return top
}

// Values no argument should ever be, and some that merely look wrong. The
// first list holds what stays the same however often it is read. HOSTILE
// adds the objects that fail when they are read: of those nothing can be
// said but that no function throws.
var HOSTILE_DATA = [
  undefined, null, true, false, 0, -0, 1, -1, 2, 1.5, NaN, Infinity, -Infinity, 2147483648, 1e21,
  1e308, -1e308, 5e-324, 9007199254740991, 4294967295,
  "", "1", "2", "length", "constructor", "__proto__", "toString", "AAAAAAAAAAA",
  "\u0000", "A\u202eB\u0007", "\ud83d", "\udc00\ud83d", "x".repeat(1000000),
  [], [1], [null], [[]], ["AAAAAAAAAAA"], {}, { length: 3 }, { key: 1 }, { id: "AAAAAAAAAAA", key: 1 },
  new Array(100000).fill(1), new Array(4294967295),
  JSON.parse("{\"__proto__\":{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"key\":1,\"auto\":true}}"),
  { constructor: 1, toString: 2, valueOf: 3, hasOwnProperty: 4 }, deeplyNested(),
  Object.create(null), function() { return true }, function() { throw new Error("no") },
  new Date(0), /x/, Symbol("s"), new Map([[1, 0]])
].concat(partialItems())
var HOSTILE = HOSTILE_DATA.concat(failingObjects())

// ---- The module's surface and the table ----

test("exports exactly the documented functions", function() {
  assert.deepStrictEqual(Object.keys(Queue).sort(), [
    "append", "appendAuto", "fromStored", "indexOfKey", "item", "itemAt", "keepCurrent", "keepIds", "move",
    "nextIndex", "plan", "previousIndex", "remove", "withTrack"
  ])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Queue, c)
    // The arguments are not spelled out: some are long, and one cannot be read.
    assert.strictEqual(result.got, result.want)
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Queue).forEach(function(name) {
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

// ---- Items ----

test("item: exactly the seven fields, validated, whatever the track carried", function() {
  var rich = Object.assign(trackOf("A"), { key: 99, auto: true, extra: { deep: 1 } })
  var made = Queue.item(rich, 5, false)
  assert.deepStrictEqual(made, itemOf("A", 5, false))
  assert.deepStrictEqual(Object.keys(made), ITEM_FIELDS)
  assert.notStrictEqual(made, rich)
  assert.strictEqual(rich.key, 99)
  // An item made from an item differs from it in key and auto only.
  assert.deepStrictEqual(Queue.item(Queue.item(trackOf("B"), 1, true), 2, false), itemOf("B", 2, false))
})

test("item: a key is a whole number from 1 to the largest 32-bit integer", function() {
  var good = [1, 2, 200, 65536, MAX_KEY - 1, MAX_KEY]
  var bad = [0, -1, 0.5, 1.5, MAX_KEY + 1, 4294967296, 9007199254740991, NaN, Infinity, "1", null, undefined,
    true, [1], { valueOf: function() { return 1 } }]
  good.forEach(function(key) {
    assert.strictEqual(Queue.item(trackOf("A"), key, false).key, key)
  })
  bad.forEach(function(key) {
    assert.strictEqual(Queue.item(trackOf("A"), key, false), null, String(key))
  })
})

// ---- Edits, each against a second way of doing the same ----

test("remove: over all small queues, only that item goes and the current item stays current", function() {
  for (var size = 0; size <= 5; size++) {
    for (var index = -1; index < size; index++) {
      for (var key = 0; key <= size + 1; key++) {
        var queue = deepFreeze(queueOf(size))
        var result = Queue.remove(queue, index, key)
        var label = "size " + size + ", index " + index + ", key " + key
        if (key < 1 || key > size) {
          assert.deepStrictEqual(result, { ok: false }, label)
          continue
        }
        assertSoundQueue(result, label)
        var left = keysOf(queue).filter(function(k) { return k !== key })
        assert.deepStrictEqual(keysOf(result.queue), left, label)
        // Untouched items are the same objects, so what shows them need not redraw.
        result.queue.forEach(function(entry) { assert.strictEqual(entry, queue[entry.key - 1], label) })
        var currentKey = index >= 0 ? queue[index].key : 0
        var follower = index + 1 < size ? queue[index + 1].key : 0
        assert.strictEqual(result.wasCurrent, currentKey === key, label)
        assert.strictEqual(result.index, currentKey === key ? -1 : left.indexOf(currentKey), label)
        assert.strictEqual(result.successor, currentKey === key ? left.indexOf(follower) : -1, label)
      }
    }
  }
})

test("move: over all small queues, the item lands where asked and the current one stays current", function() {
  for (var size = 0; size <= 5; size++) {
    for (var index = -1; index < size; index++) {
      for (var key = 0; key <= size + 1; key++) {
        for (var delta = -7; delta <= 7; delta++) {
          var queue = deepFreeze(queueOf(size))
          var result = Queue.move(queue, index, key, delta)
          var label = "size " + size + ", index " + index + ", key " + key + ", delta " + delta
          var from = key - 1
          var to = Math.max(0, Math.min(size - 1, from + delta))
          if (key < 1 || key > size || to === from) {
            assert.deepStrictEqual(result, { ok: false }, label)
            continue
          }
          assertSoundQueue(result, label)
          // The slow way: take the item out, count to its place, put it in.
          var others = keysOf(queue).filter(function(k) { return k !== key })
          var expected = others.slice(0, to).concat([key], others.slice(to))
          assert.deepStrictEqual(keysOf(result.queue), expected, label)
          result.queue.forEach(function(entry) { assert.strictEqual(entry, queue[entry.key - 1], label) })
          assert.strictEqual(result.index, index < 0 ? -1 : expected.indexOf(queue[index].key), label)
          // The opposite move gives the first queue back.
          var back = Queue.move(result.queue, result.index, key, from - to)
          assert.deepStrictEqual(back, { ok: true, queue: queue, index: index }, label)
        }
      }
    }
  }
})

test("append: adds at the end up to the limit and never changes the current item", function() {
  var queue = []
  var index = -1
  for (var key = 1; key <= Const.LIMITS.queueItems; key++) {
    var track = trackOf(LETTERS[key % LETTERS.length])
    var result = Queue.append(deepFreeze(queue), index, track, key, key % 2 === 0)
    assertSoundQueue(result, "key " + key)
    assert.strictEqual(result.queue.length, key)
    assert.strictEqual(result.queue[key - 1].key, key)
    assert.strictEqual(result.queue[key - 1].auto, key % 2 === 0)
    assert.strictEqual(result.index, index)
    queue = result.queue
    if (key === 3) index = 1
  }
  assert.deepStrictEqual(Queue.append(queue, index, trackOf("A"), 500, false), { ok: false, code: "full" })
  assert.deepStrictEqual(Queue.append(queue, index, trackOf("A"), 7, false), { ok: false, code: "invalid" })
  assert.deepStrictEqual(Queue.append(queue, index, null, 500, false), { ok: false, code: "invalid" })
})

test("appendAuto: over small cases, exactly the new videos are added, in order, each once", function() {
  var mixes = sequences(["A", "B", "C", "D", null], 4, false)
  var skips = subsets(["A", "B", "C"].map(idOf))
  var checked = 0
  for (var size = 0; size <= 2; size++) {
    var queue = deepFreeze(queueOf(size))
    mixes.forEach(function(mix) {
      var tracks = deepFreeze(mix.map(function(letter) { return letter === null ? null : trackOf(letter) }))
      skips.forEach(function(skipIds) {
        var result = Queue.appendAuto(queue, size - 1, tracks, deepFreeze(skipIds.slice()), 10)
        // The slow way: walk the mix and keep what was not seen before.
        var fresh = []
        mix.forEach(function(letter) {
          var id = letter === null ? "" : idOf(letter)
          var known = idsOf(queue).concat(skipIds, fresh)
          if (id !== "" && known.indexOf(id) < 0) fresh.push(id)
        })
        var expected = { ok: false }
        if (fresh.length > 0) {
          expected = {
            ok: true,
            queue: queue.concat(fresh.map(function(id, i) { return itemOf(id.charAt(0), 10 + i, true) })),
            index: size - 1, added: fresh.length, nextKey: 10 + fresh.length
          }
        }
        if (!same(result, expected)) assert.deepStrictEqual(result, expected, JSON.stringify([mix, skipIds]))
        checked++
      })
    })
  }
  assert.ok(checked > 18000, String(checked))
})

test("appendAuto: never more than the mix limit, never beyond the queue limit", function() {
  var tracks = []
  for (var n = 0; n < 60; n++) {
    tracks.push({ id: "mix-" + String(n).padStart(7, "0"), title: "t", channel: "", duration: 1 })
  }
  for (var size = 170; size <= Const.LIMITS.queueItems; size++) {
    var queue = []
    for (var k = 1; k <= size; k++) queue.push(itemOf("A", k, false))
    var result = Queue.appendAuto(queue, 0, tracks, [], 1000)
    var room = Math.min(Const.LIMITS.mixAppend, Const.LIMITS.queueItems - size)
    if (room === 0) {
      assert.deepStrictEqual(result, { ok: false })
      continue
    }
    assertSoundQueue(result, "size " + size)
    assert.strictEqual(result.added, room)
    assert.strictEqual(result.queue.length, size + room)
    assert.strictEqual(result.nextKey, 1000 + room)
  }
  // Only the head of a longer answer is read at all.
  var late = tracks.slice(0, Const.LIMITS.mixFetch).map(function() { return null }).concat(tracks)
  assert.deepStrictEqual(Queue.appendAuto([], -1, late, [], 1), { ok: false })
})

test("appendAuto: of the videos to leave out only the end is read, however long the list", function() {
  var tracks = [trackOf("A"), trackOf("B")]
  var expected = { ok: true, queue: [itemOf("A", 1, true)], index: -1, added: 1, nextKey: 2 }
  // A list that claims the greatest length a list can have and names B in
  // its last place. It gives up when it is asked far more often than the
  // answer needs, so that a reader without a bound fails instead of
  // keeping this test busy.
  function endless(lengthOf) {
    var reads = { length: 0, entries: 0 }
    var list = new Proxy([], {
      get: function(target, name) {
        if (name === "length") {
          reads.length++
          return lengthOf(reads.length)
        }
        reads.entries++
        if (reads.entries > 100000) throw new Error("still reading")
        return name === "4294967294" ? idOf("B") : undefined
      }
    })
    return { list: list, reads: reads }
  }
  var fixed = endless(function() { return 4294967295 })
  assert.deepStrictEqual(Queue.appendAuto([], -1, tracks, fixed.list, 1), expected)
  assert.ok(fixed.reads.entries <= 5000, String(fixed.reads.entries))
  // A list that is longer every time its length is asked for.
  var growing = endless(function(asked) { return 4294967295 - 1000 + Math.min(asked, 1000) })
  assert.strictEqual(Queue.appendAuto([], -1, tracks, growing.list, 1).ok, true)
  assert.ok(growing.reads.entries <= 5000, String(growing.reads.entries))
  // The same with a real list of that length, which holds nothing but its last entry.
  var sparse = new Array(4294967295)
  sparse[4294967294] = idOf("B")
  var began = Date.now()
  assert.deepStrictEqual(Queue.appendAuto([], -1, tracks, sparse, 1), expected)
  assert.ok(Date.now() - began < 2000)
  // What lies in front of the part that is read does not count any more.
  var long = [idOf("A")].concat(new Array(5000).fill(idOf("F")))
  assert.strictEqual(Queue.appendAuto([], -1, tracks, long, 1).added, 2)
  assert.deepStrictEqual(Queue.appendAuto([], -1, tracks, long.slice(1).concat([idOf("A")]), 1),
    { ok: true, queue: [itemOf("B", 1, true)], index: -1, added: 1, nextKey: 2 })
})

test("keepCurrent: the current item alone, the same object, or nothing", function() {
  for (var size = 0; size <= 5; size++) {
    for (var index = -1; index <= size; index++) {
      var queue = deepFreeze(queueOf(size))
      var result = Queue.keepCurrent(queue, index)
      var inside = index >= 0 && index < size
      var kept = inside ? [queue[index]] : []
      assert.deepStrictEqual(result, { ok: true, queue: kept, index: inside ? 0 : -1 })
      if (inside) assert.strictEqual(result.queue[0], queue[index])
    }
  }
})

test("withTrack: only that item changes, and it keeps its key, its auto mark and its place", function() {
  var known = { title: "A real title", channel: "A channel", duration: 321, live: false }
  for (var size = 1; size <= 4; size++) {
    for (var index = -1; index < size; index++) {
      for (var key = 1; key <= size; key++) {
        // A queue of items of which nothing but the video is known yet.
        var queue = deepFreeze(queueOf(size).map(function(entry) {
          var bare = { id: entry.id, title: "", channel: "", duration: null, live: true }
          return Queue.item(bare, entry.key, entry.key % 2 === 1)
        }))
        var target = queue[key - 1]
        var update = Object.assign({ id: target.id }, known)
        var result = Queue.withTrack(queue, index, key, update)
        assertSoundQueue(result, "size " + size)
        assert.strictEqual(result.index, index)
        result.queue.forEach(function(entry, i) {
          if (i !== key - 1) return assert.strictEqual(entry, queue[i])
          assert.deepStrictEqual(entry, Object.assign({}, update, { key: key, auto: target.auto }))
        })
        // The same news again is no news, and news about another video is refused.
        assert.deepStrictEqual(Queue.withTrack(result.queue, index, key, update), { ok: false })
        var other = Object.assign({}, update, { id: idOf("F") })
        assert.deepStrictEqual(Queue.withTrack(queue, index, key, other), { ok: false })
      }
    }
  }
})

test("fromStored: over small lists, valid tracks survive in order and the current one is found", function() {
  var kinds = ["A", "B", "auto", null, "bad", "untitled"]
  function storedOf(kind) {
    if (kind === null) return null
    if (kind === "bad") return { id: "not an id", title: "t", channel: "", duration: 1, auto: true }
    if (kind === "untitled") return { id: idOf("C"), channel: "", duration: 1, live: false }
    if (kind === "auto") return Object.assign(trackOf("C"), { auto: true })
    return Object.assign(trackOf(kind), { auto: false, key: 77 })
  }
  sequences(kinds, 4, false).forEach(function(list) {
    var stored = deepFreeze(list.map(storedOf))
    var valid = []
    list.forEach(function(kind, i) {
      if (kind === "A" || kind === "B" || kind === "auto") valid.push(i)
    })
    var queue = valid.map(function(position, i) {
      var kind = list[position]
      return itemOf(kind === "auto" ? "C" : kind, 5 + i, kind === "auto")
    })
    for (var index = -1; index <= list.length; index++) {
      var expected = { ok: true, queue: queue, index: valid.indexOf(index), nextKey: 5 + valid.length }
      var result = Queue.fromStored(stored, index, 5)
      if (!same(result, expected)) assert.deepStrictEqual(result, expected, JSON.stringify([list, index]))
    }
  })
})

test("fromStored: an element that cannot be read costs that element only", function() {
  function failing(name) {
    var stored = Object.assign(trackOf("B"), { auto: true })
    Object.defineProperty(stored, name, { enumerable: true, get: function() { throw new Error(name) } })
    return stored
  }
  var revoked = Proxy.revocable({}, {})
  revoked.revoke()
  var trapped = new Proxy(trackOf("B"), {
    get: function() { throw new Error("trap") },
    getOwnPropertyDescriptor: function() { throw new Error("trap") }
  })
  var unreadable = ["id", "title", "channel", "duration", "live", "auto"].map(failing)
  unreadable = unreadable.concat([revoked.proxy, trapped])
  unreadable.forEach(function(element, n) {
    var stored = [trackOf("A"), element, Object.assign(trackOf("C"), { auto: true })]
    var kept = [itemOf("A", 5, false), itemOf("C", 6, true)]
    assert.deepStrictEqual(Queue.fromStored(stored, 2, 5), { ok: true, queue: kept, index: 1, nextKey: 7 },
      "element " + n)
    assert.strictEqual(Queue.fromStored(stored, 1, 5).index, -1, "element " + n)
  })
  // An auto mark the element only inherits is none.
  var heir = Object.assign(Object.create({ auto: true }), trackOf("B"))
  assert.deepStrictEqual(Queue.fromStored([heir], 0, 1).queue, [itemOf("B", 1, false)])
})

test("what one function answers, every other function accepts unchanged", function() {
  var restored = Queue.fromStored(queueOf(5), 2, 1)
  assert.deepStrictEqual(Queue.fromStored(restored.queue, restored.index, 1), restored)
  var moved = Queue.move(restored.queue, restored.index, 1, 3)
  var removed = Queue.remove(moved.queue, moved.index, 4)
  var grown = Queue.append(removed.queue, removed.index, trackOf("F"), 6, true)
  assert.deepStrictEqual(keysOf(grown.queue), [2, 3, 1, 5, 6])
  assert.strictEqual(Queue.itemAt(grown.queue, grown.index).key, 3)
  assert.deepStrictEqual(Queue.keepIds(grown.queue, grown.index), [idOf("B"), idOf("C"), idOf("A")])
  assert.strictEqual(Queue.indexOfKey(grown.queue, 6), 4)
})

// ---- Questions ----

test("itemAt, indexOfKey, nextIndex, previousIndex and keepIds on all small queues", function() {
  for (var size = 0; size <= 5; size++) {
    var queue = deepFreeze(queueOf(size))
    for (var index = -2; index <= size + 1; index++) {
      var inside = index >= 0 && index < size
      assert.strictEqual(Queue.itemAt(queue, index), inside ? queue[index] : null)
      assert.strictEqual(Queue.nextIndex(queue, index), inside && index + 1 < size ? index + 1 : -1)
      assert.strictEqual(Queue.previousIndex(queue, index), inside && index > 0 ? index - 1 : -1)
      var around = inside ? queue.slice(Math.max(0, index - 1), index + 2) : []
      assert.deepStrictEqual(Queue.keepIds(queue, index), idsOf(around))
    }
    for (var key = -1; key <= size + 1; key++) {
      assert.strictEqual(Queue.indexOfKey(queue, key), key >= 1 && key <= size ? key - 1 : -1)
    }
  }
})

test("a position is a place in the list, never a name on it", function() {
  var all = function() { return true }
  var queue = queueOf(2)
  // Items under names that are no positions, one of them right "before" the first.
  queue[-1] = itemOf("E", 8, false)
  queue[0.5] = itemOf("F", 9, false)
  queue.last = itemOf("F", 10, false)
  assert.strictEqual(Queue.itemAt(queue, -1), null)
  assert.strictEqual(Queue.itemAt(queue, 0.5), null)
  assert.strictEqual(Queue.itemAt(queue, "last"), null)
  assert.strictEqual(Queue.nextIndex(queue, -1), -1)
  assert.strictEqual(Queue.previousIndex(queue, 0), -1)
  assert.strictEqual(Queue.indexOfKey(queue, 8), -1)
  assert.deepStrictEqual(Queue.keepIds(queue, 0), [idOf("A"), idOf("B")])
  assert.deepStrictEqual(Queue.keepIds(queue, -1), [])
  assert.deepStrictEqual(Queue.keepCurrent(queue, -1), { ok: true, queue: [], index: -1 })
  assert.deepStrictEqual(keysOf(Queue.remove(queue, -1, 2).queue), [1])
  // The first item plays: nothing is put in front of it.
  assert.deepStrictEqual(Queue.plan(queue, 0, all, [1], 1),
    [{ op: "load", key: 2, mode: "append-play", index: -1 }])
  assert.deepStrictEqual(Queue.plan(queue, -1, all, [8, 1], 8), [{ op: "remove", key: 1 }])
})

test("keepIds: names each video once, also when it is queued on both sides", function() {
  var thrice = [itemOf("A", 1), itemOf("A", 2), itemOf("A", 3)]
  var around = [itemOf("A", 1), itemOf("B", 2), itemOf("A", 3)]
  assert.deepStrictEqual(Queue.keepIds(thrice, 1), [idOf("A")])
  assert.deepStrictEqual(Queue.keepIds(around, 1), [idOf("A"), idOf("B")])
  var odd = [itemOf("A", 1), Object.assign(itemOf("B", 2), { id: "constructor" }), itemOf("C", 3)]
  assert.deepStrictEqual(Queue.keepIds(odd, 0), [idOf("A"), "constructor"])
})

// ---- Hostile arguments to the edits and questions ----

// Every way of calling an edit or a question with one argument, or one
// part of an argument, replaced. The first element says what the answer
// must be: an item or null, the answer of an edit, a position, a list of
// video ids.
function hostileCalls() {
  var queue = deepFreeze(queueOf(3))
  var news = Object.assign(trackOf("B"), { title: "New" })
  function trackWith(v) {
    return { id: idOf("A"), title: v, channel: v, duration: v, live: v }
  }
  function newsWith(v) {
    return Object.assign(trackWith(v), { id: idOf("B") })
  }
  return [
    ["item", function(v) { return Queue.item(v, 1, false) }],
    ["item", function(v) { return Queue.item(trackOf("A"), v, false) }],
    ["item", function(v) { return Queue.item(trackOf("A"), 1, v) }],
    ["item", function(v) { return Queue.item(trackWith(v), 1, false) }],
    ["item", function(v) { return Queue.item({ id: v, title: "t", channel: "", duration: 1 }, 1, false) }],
    ["edit", function(v) { return Queue.append(v, 1, trackOf("D"), 4, false) }],
    ["edit", function(v) { return Queue.append(queue, v, trackOf("D"), 4, false) }],
    ["edit", function(v) { return Queue.append(queue, 1, v, 4, false) }],
    ["edit", function(v) { return Queue.append(queue, 1, trackWith(v), 4, false) }],
    ["edit", function(v) { return Queue.append(queue, 1, trackOf("D"), v, false) }],
    ["edit", function(v) { return Queue.append(queue, 1, trackOf("D"), 4, v) }],
    ["edit", function(v) { return Queue.append([queue[0], v, queue[1], v], 2, trackOf("D"), 4, false) }],
    ["edit", function(v) { return Queue.appendAuto(v, 1, [trackOf("D")], [], 4) }],
    ["edit", function(v) { return Queue.appendAuto(queue, v, [trackOf("D")], [], 4) }],
    ["edit", function(v) { return Queue.appendAuto(queue, 1, v, [], 4) }],
    ["edit", function(v) { return Queue.appendAuto(queue, 1, [v, trackOf("D"), v], [], 4) }],
    ["edit", function(v) { return Queue.appendAuto(queue, 1, [trackWith(v), trackOf("D")], [], 4) }],
    ["edit", function(v) { return Queue.appendAuto(queue, 1, [trackOf("D")], v, 4) }],
    ["edit", function(v) { return Queue.appendAuto(queue, 1, [trackOf("D")], [v, v], 4) }],
    ["edit", function(v) { return Queue.appendAuto(queue, 1, [trackOf("D")], [], v) }],
    ["edit", function(v) { return Queue.appendAuto([v, queue[0], v], 1, [trackOf("D")], [], 4) }],
    ["edit", function(v) { return Queue.remove(v, 1, 2) }],
    ["edit", function(v) { return Queue.remove(queue, v, 2) }],
    ["edit", function(v) { return Queue.remove(queue, 1, v) }],
    ["edit", function(v) { return Queue.remove([v, queue[0], queue[1], v], 2, 1) }],
    ["edit", function(v) { return Queue.move(v, 1, 2, 1) }],
    ["edit", function(v) { return Queue.move(queue, v, 2, 1) }],
    ["edit", function(v) { return Queue.move(queue, 1, v, 1) }],
    ["edit", function(v) { return Queue.move(queue, 1, 2, v) }],
    ["edit", function(v) { return Queue.move([queue[0], v, queue[1]], 0, 1, 5) }],
    ["edit", function(v) { return Queue.keepCurrent(v, 1) }],
    ["edit", function(v) { return Queue.keepCurrent(queue, v) }],
    ["edit", function(v) { return Queue.keepCurrent([v], 0) }],
    ["edit", function(v) { return Queue.keepCurrent([v, queue[0], v], 1) }],
    ["edit", function(v) { return Queue.withTrack(v, 1, 2, news) }],
    ["edit", function(v) { return Queue.withTrack(queue, v, 2, news) }],
    ["edit", function(v) { return Queue.withTrack(queue, 1, v, news) }],
    ["edit", function(v) { return Queue.withTrack(queue, 1, 2, v) }],
    ["edit", function(v) { return Queue.withTrack(queue, 1, 2, newsWith(v)) }],
    ["edit", function(v) { return Queue.withTrack([v, queue[1], v], 1, 2, news) }],
    ["edit", function(v) { return Queue.fromStored(v, 0, 1) }],
    ["edit", function(v) { return Queue.fromStored([v, trackOf("A"), v], 1, 1) }],
    ["edit", function(v) { return Queue.fromStored([Object.assign(trackWith(v), { auto: v })], 0, 1) }],
    ["edit", function(v) { return Queue.fromStored(queue, v, 1) }],
    ["edit", function(v) { return Queue.fromStored(queue, 0, v) }],
    ["item", function(v) { return Queue.itemAt(v, 0) }],
    ["item", function(v) { return Queue.itemAt(queue, v) }],
    ["item", function(v) { return Queue.itemAt([v, v], 1) }],
    ["position", function(v) { return Queue.indexOfKey(v, 1) }],
    ["position", function(v) { return Queue.indexOfKey(queue, v) }],
    ["position", function(v) { return Queue.indexOfKey([v, queue[0]], 1) }],
    ["position", function(v) { return Queue.nextIndex(v, 0) }],
    ["position", function(v) { return Queue.nextIndex(queue, v) }],
    ["position", function(v) { return Queue.nextIndex([queue[0], v], 0) }],
    ["position", function(v) { return Queue.previousIndex(v, 1) }],
    ["position", function(v) { return Queue.previousIndex(queue, v) }],
    ["position", function(v) { return Queue.previousIndex([v, queue[0]], 1) }],
    ["ids", function(v) { return Queue.keepIds(v, 1) }],
    ["ids", function(v) { return Queue.keepIds(queue, v) }],
    ["ids", function(v) { return Queue.keepIds([v, queue[0], v], 1) }]
  ]
}

function assertAnswer(kind, result, label) {
  if (kind === "item") return assert.ok(result === null || isSoundItem(result), label)
  if (kind === "position") {
    return assert.ok(Number.isInteger(result) && result >= -1 && result < Const.LIMITS.queueItems, label)
  }
  if (kind === "ids") {
    assert.ok(Array.isArray(result) && result.length <= 3 && new Set(result).size === result.length, label)
    return result.forEach(function(id) { assert.ok(/^[A-Za-z0-9_-]{11}$/.test(id), label) })
  }
  if (result.ok === true) return assertSoundQueue(result, label)
  assert.ok(result.ok === false && !("queue" in result) && !("index" in result), label)
}

test("no data of any kind makes an edit or a question answer with anything but sound items", function() {
  hostileCalls().forEach(function(call, n) {
    HOSTILE_DATA.forEach(function(value, h) {
      var label = "call " + n + ", value " + h
      var result
      assert.doesNotThrow(function() { result = call[1](value) }, label)
      assertAnswer(call[0], result, label)
    })
  })
})

test("no object that fails or changes when it is read makes an edit or a question throw", function() {
  var calls = hostileCalls()
  // A new set for every call: some of these objects wear out.
  calls.forEach(function(call, n) {
    failingObjects().concat([shifting(1), shifting("x"), shifting({})]).forEach(function(value, h) {
      assert.doesNotThrow(function() { call[1](value) }, "call " + n + ", object " + h)
    })
  })
})

test("an entry that is an item in part only is no item to any edit, question or plan", function() {
  var a = itemOf("A", 1, false)
  var b = itemOf("B", 2, false)
  var all = function() { return true }
  var news = { id: idOf("E"), title: "New", channel: "", duration: 9, live: false }
  partialItems().forEach(function(partial, n) {
    var label = "partial " + n
    var around = deepFreeze([a, partial, b])
    assert.deepStrictEqual(Queue.append(around, 2, trackOf("C"), 3, false),
      { ok: true, queue: [a, b, itemOf("C", 3, false)], index: 1 }, label)
    assert.deepStrictEqual(Queue.append(around, 1, trackOf("C"), 3, false).index, -1, label)
    // Its key is not taken and its video is not queued.
    assert.deepStrictEqual(Queue.append(around, 0, trackOf("E"), 50, false),
      { ok: true, queue: [a, b, itemOf("E", 50, false)], index: 0 }, label)
    assert.deepStrictEqual(Queue.appendAuto(around, 0, [trackOf("E")], [], 60),
      { ok: true, queue: [a, b, itemOf("E", 60, true)], index: 0, added: 1, nextKey: 61 }, label)
    assert.deepStrictEqual(Queue.remove(around, 2, 50), { ok: false }, label)
    assert.deepStrictEqual(Queue.remove(around, 2, 1),
      { ok: true, queue: [b], index: 0, wasCurrent: false, successor: -1 }, label)
    assert.deepStrictEqual(Queue.move(around, 2, 50, -1), { ok: false }, label)
    assert.deepStrictEqual(Queue.move(around, 2, 2, -1), { ok: true, queue: [b, a], index: 0 }, label)
    assert.deepStrictEqual(Queue.keepCurrent(around, 1), { ok: true, queue: [], index: -1 }, label)
    assert.deepStrictEqual(Queue.keepCurrent(around, 2), { ok: true, queue: [b], index: 0 }, label)
    assert.deepStrictEqual(Queue.withTrack(around, 0, 50, news), { ok: false }, label)
    assert.strictEqual(Queue.itemAt(around, 1), null, label)
    assert.strictEqual(Queue.indexOfKey(around, 50), -1, label)
    assert.strictEqual(Queue.indexOfKey(around, 2), 2, label)
    assert.strictEqual(Queue.nextIndex(around, 0), -1, label)
    assert.strictEqual(Queue.previousIndex(around, 2), -1, label)
    assert.deepStrictEqual(Queue.keepIds(around, 0), [idOf("A")], label)
    assert.deepStrictEqual(Queue.keepIds(around, 1), [], label)
    // Not the current item, and not loaded as a neighbour on either side.
    assert.deepStrictEqual(Queue.plan([a, partial], 0, all, [1], 1), [], label)
    assert.deepStrictEqual(Queue.plan([partial, b], 1, all, [2], 2), [], label)
    assert.deepStrictEqual(Queue.plan([partial, a], 0, all, [50, 1], 50), [{ op: "remove", key: 1 }], label)
  })
  // The very item the partial ones were made from is one, in any order of its members.
  var whole = itemOf("E", 50, false)
  var shuffled = {}
  ITEM_FIELDS.slice().reverse().forEach(function(name) { shuffled[name] = whole[name] })
  assert.strictEqual(Queue.itemAt([whole], 0), whole)
  assert.strictEqual(Queue.itemAt([shuffled], 0), shuffled)
  assert.strictEqual(Queue.keepCurrent([a, shuffled], 1).queue[0], shuffled)
})

test("an item is an item up to its limits and not beyond", function() {
  var limits = Const.LIMITS
  function entryWith(changes) {
    return Object.assign(itemOf("E", 50, false), changes)
  }
  var inside = [
    { title: "" }, { title: "x".repeat(limits.titleChars) }, { channel: "" },
    { channel: "x".repeat(limits.channelChars) }, { duration: 0 }, { duration: limits.durationSeconds },
    { duration: null, live: true }, { live: true }, { auto: true }, { key: 1 }, { key: MAX_KEY }
  ]
  var outside = [
    { title: "x".repeat(limits.titleChars + 1) }, { channel: "x".repeat(limits.channelChars + 1) },
    { duration: -1 }, { duration: limits.durationSeconds + 1 }, { duration: null, live: false },
    { key: 0 }, { key: MAX_KEY + 1 }
  ]
  inside.forEach(function(changes, n) {
    var entry = entryWith(changes)
    assert.strictEqual(Queue.itemAt([entry], 0), entry, "inside " + n)
    // Whatever this file makes of the same values is an item to it as well.
    var made = Queue.item(entry, entry.key, entry.auto)
    assert.deepStrictEqual(made, entry, "inside " + n)
    assert.strictEqual(Queue.itemAt([made], 0), made, "inside " + n)
  })
  outside.forEach(function(changes, n) {
    assert.strictEqual(Queue.itemAt([entryWith(changes)], 0), null, "outside " + n)
  })
})

test("whatever this file makes of a track, however odd, it takes for an item afterwards", function() {
  // Were it not so, an item would vanish from the queue at the next edit.
  var random = makeRandom(4711)
  var pieces = ["a", " ", "\u0000", "\u202e", "\u200b", "\ud83d\ude00", "\ud83d", "\ude00", "\n", "\u00a0",
    "x".repeat(50), "\ud83d\ude00".repeat(60), "\u0301"]
  var ids = [idOf("A"), "constructor", "a-b_c-d_e-f", "short", "", null]
  var durations = [0, -0, 1, 0.5, 172799.5, 172800, 172800.4, 172801, -1, NaN, Infinity, null, undefined, "5"]
  var marks = [true, false, 1, null, undefined, "true"]
  function pick(list) {
    return list[random(list.length)]
  }
  function text(most) {
    var built = ""
    for (var n = random(most); n > 0; n--) built += pick(pieces)
    return built
  }
  var made = 0
  for (var round = 0; round < 20000; round++) {
    var track = {
      id: pick(ids), title: random(12) === 0 ? 5 : text(40), channel: random(12) === 0 ? null : text(20),
      duration: pick(durations), live: pick(marks), auto: pick(marks)
    }
    var key = 1 + random(9)
    var stored = Queue.fromStored([track], 0, key)
    var mixed = Queue.appendAuto([], -1, [track], [], key)
    var outcomes = [Queue.item(track, key, pick(marks)), stored.queue[0], mixed.ok ? mixed.queue[0] : null]
    outcomes.forEach(function(entry) {
      if (entry === null || entry === undefined) return
      made++
      var label = JSON.stringify(entry)
      assert.ok(isSoundItem(entry), label)
      assert.strictEqual(Queue.itemAt([entry], 0), entry, label)
      assert.strictEqual(Queue.keepCurrent([entry], 0).queue[0], entry, label)
      assert.strictEqual(Queue.indexOfKey([entry], key), 0, label)
    })
  }
  assert.ok(made > 20000, String(made))
})

test("an entry is judged by one reading of it", function() {
  var a = itemOf("A", 1, false)
  var b = itemOf("B", 2, false)
  var all = function() { return true }
  var before = { op: "load", key: 1, mode: "insert-at", index: 0 }
  var after = { op: "load", key: 3, mode: "append-play", index: -1 }
  // As the item after the current one: loaded under the key it was read
  // with, whatever it says afterwards, the playing key included.
  var laters = [2, 1, 0, "x", {}, null, 3.5, MAX_KEY + 1]
  laters.forEach(function(later) {
    var label = String(later)
    assert.deepStrictEqual(Queue.plan([a, b, shifting(later)], 1, all, [2], 2), [before, after], label)
    assert.deepStrictEqual(Queue.plan([a, b, shifting(later)], 1, all, [1, 2, 3], 2), [], label)
    // As the current item: it is the item with key 3 that plays.
    assert.deepStrictEqual(Queue.plan([b, shifting(later)], 1, all, [3], 3),
      [{ op: "load", key: 2, mode: "insert-at", index: 0 }], label)
    assert.deepStrictEqual(Queue.keepIds([a, shifting(later)], 0), [idOf("A"), idOf("C")], label)
    assert.strictEqual(Queue.indexOfKey([a, shifting(later), b], 3), 1, label)
    // In an edit it is the item with key 3, and goes when that key is removed.
    var entry = shifting(later)
    var removed = Queue.remove([a, entry, b], 2, 3)
    assert.strictEqual(removed.ok, true, label)
    assert.ok(removed.queue.length === 2 && removed.queue[0] === a && removed.queue[1] === b, label)
    assert.strictEqual(removed.index, 1, label)
    assert.strictEqual(Queue.append([a, shifting(later)], 0, trackOf("D"), 3, false).ok, false, label)
  })
})

test("a queue with things in it that are no items comes back from any edit without them", function() {
  var junk = [null, 7, "x", [], {}, { key: 1 }, { id: idOf("A") }, { id: "nope", key: 5 },
    { id: idOf("A"), key: 0 }, { id: idOf("A"), key: "1" }]
  var good = queueOf(3)
  junk.forEach(function(thing) {
    // The current item is C, at position 4 of the damaged queue. The last
    // element is a second item under the key of B.
    var damaged = [thing, good[0], thing, good[1], good[2], thing, Object.assign({}, good[1])]
    var results = [
      Queue.append(damaged, 4, trackOf("D"), 9, false),
      Queue.remove(damaged, 4, 1),
      Queue.move(damaged, 4, 1, 1),
      Queue.keepCurrent(damaged, 4),
      Queue.withTrack(damaged, 4, 2, Object.assign(trackOf("B"), { title: "New" })),
      Queue.appendAuto(damaged, 4, [trackOf("E")], [], 9)
    ]
    results.forEach(function(result, n) {
      assertSoundQueue(result, "edit " + n)
      assert.strictEqual(result.queue[result.index].key, 3, "edit " + n)
    })
  })
  // More than a queue may hold: the rest is cut off, and a current item beyond the cut is none.
  var long = []
  for (var key = 1; key <= 260; key++) long.push(itemOf("A", key))
  assert.strictEqual(Queue.keepCurrent(long, 199).queue[0].key, 200)
  assert.deepStrictEqual(Queue.keepCurrent(long, 200), { ok: true, queue: [], index: -1 })
  assert.strictEqual(Queue.indexOfKey(long, 230), -1)
  assert.strictEqual(Queue.itemAt(long, 230), null)
  assert.deepStrictEqual(Queue.remove(long, 0, 230), { ok: false })
  assert.strictEqual(Queue.remove(long, 0, 5).queue.length, 199)
})

// ---- The planner, against a model of mpv ----

// mpv's playlist under a plan, as the player would send it. The player turns
// the key of a "remove" into a position by looking it up in the keys it was
// given, which stay as they are while the steps go out, and mpv removes
// whatever sits at that position by then, meant or not. A "load" is
// inserted where its index says, or appended. "pick" is how the player
// chooses among several positions of one key. Anything about a step that
// does not do what it was meant to do is reported as a fault.
function applyPlan(entryKeys, ops, pick) {
  var playlist = entryKeys.map(function(key, position) { return { key: key, was: position } })
  var faults = []
  var loading = false
  ops.forEach(function(op, n) {
    if (op.op === "remove") {
      if (loading) faults.push("a removal after a load")
      if (Object.keys(op).join() !== "op,key") faults.push("a removal with other fields")
      var position = pick(entryKeys, op.key, n)
      if (position < 0) return faults.push("a removal of a key that is not listed")
      if (position >= playlist.length) return faults.push("a position beyond the end of the playlist")
      // Removing from the back keeps every position meaning what it meant.
      if (playlist[position].was !== position) faults.push("a position that no longer means its entry")
      if (playlist[position].key !== op.key) faults.push("a removal of another key's entry")
      playlist.splice(position, 1)
    } else if (op.op === "load") {
      loading = true
      if (Object.keys(op).join() !== "op,key,mode,index") faults.push("a load with other fields")
      if (op.mode === "append-play") {
        if (op.index !== -1) faults.push("an append with a position")
        playlist.push({ key: op.key, was: -1 })
      } else if (op.mode === "insert-at") {
        if (!Number.isInteger(op.index) || op.index < 0 || op.index >= playlist.length
          || op.index >= entryKeys.length) return faults.push("an insert position outside the playlist")
        playlist.splice(op.index, 0, { key: op.key, was: -1 })
      } else {
        faults.push("a load that is neither insert-at nor append-play")
      }
    } else {
      faults.push("an unknown step")
    }
  })
  return { keys: playlist.map(function(entry) { return entry.key }), entries: playlist, faults: faults }
}

function firstPosition(entryKeys, key) {
  return entryKeys.indexOf(key)
}

function lastPosition(entryKeys, key) {
  return entryKeys.lastIndexOf(key)
}

// Every way a player could choose a position for each removal of a plan.
function everyChoice(entryKeys, ops) {
  var choices = [[]]
  ops.forEach(function(op) {
    var positions = []
    entryKeys.forEach(function(key, position) {
      if (op.op === "remove" && key === op.key) positions.push(position)
    })
    if (positions.length === 0) positions.push(-1)
    var grown = []
    choices.forEach(function(chosen) {
      positions.forEach(function(position) { grown.push(chosen.concat([position])) })
    })
    choices = grown
  })
  return choices.map(function(chosen) {
    return function(keys, key, n) { return chosen[n] }
  })
}

function readyTest(readyIds) {
  return function(id) { return readyIds.indexOf(id) >= 0 }
}

// The window mpv's playlist must be when the current item is what plays.
function wantedWindow(queue, index, readyIds) {
  var keys = [queue[index].key]
  if (index > 0 && readyIds.indexOf(queue[index - 1].id) >= 0) keys.unshift(queue[index - 1].key)
  if (index + 1 < queue.length && readyIds.indexOf(queue[index + 1].id) >= 0) keys.push(queue[index + 1].key)
  return keys
}

// Every case there is, in three sweeps: queues of up to four items with two
// playlist entries that belong to no item any more; a queue of five (the
// smallest that has items on both sides which are no neighbours) with one;
// and queues that hold a video more than once, where only the key tells
// two items apart. A queue is spelled by the letters of its videos, and
// its items have the keys 1, 2, 3, ... For each queue: every position of
// the current item, none included; every set of looked-up videos; every
// playlist of up to four distinct keys, in every order; and every playing
// key, 0 and keys the playlist does not list included.
var SWEEPS = [
  { queues: ["", "A", "AB", "ABC", "ABCD"], stale: [8, 9], maxEntries: 4 },
  { queues: ["ABCDE"], stale: [9], maxEntries: 4 },
  { queues: ["AA", "ABA", "AAB", "AAA", "ABAB"], stale: [9], maxEntries: 4 }
]

function queueSpelled(letters) {
  return letters.split("").map(function(letter, i) { return itemOf(letter, i + 1, false) })
}

function forEveryCase(fn) {
  SWEEPS.forEach(function(sweep) {
    sweep.queues.forEach(function(letters) {
      var queue = deepFreeze(queueSpelled(letters))
      var size = queue.length
      var universe = keysOf(queue).concat(sweep.stale)
      var playlists = sequences(universe, sweep.maxEntries, true)
      var readySets = subsets(idsOf(queue).filter(function(id, i, ids) { return ids.indexOf(id) === i }))
      playlists.forEach(function(entryKeys) {
        Object.freeze(entryKeys)
        for (var index = -1; index < size; index++) {
          for (var r = 0; r < readySets.length; r++) {
            fn(queue, index, readySets[r], entryKeys, 0)
            for (var p = 0; p < universe.length; p++) fn(queue, index, readySets[r], entryKeys, universe[p])
          }
        }
      })
    })
  })
}

// One pass over every case. For each guarantee it keeps how many cases it
// applied to and a description of the first case that broke it, so that the
// tests below can each speak for one guarantee without repeating the sweep.
var survey = null

function surveyed() {
  if (survey !== null) return survey
  survey = { cases: 0, seen: Object.create(null), broken: Object.create(null) }
  var names = ["playing", "steps", "awaited", "window", "settled", "unlisted", "asked"]
  names.forEach(function(name) {
    survey.seen[name] = 0
    survey.broken[name] = null
  })
  // How often nothing played while the playlist listed the current item.
  survey.seen.starting = 0

  forEveryCase(function(queue, index, readyIds, entryKeys, playingKey) {
    var asked = []
    var isReady = function(id) {
      asked.push(id)
      return readyIds.indexOf(id) >= 0
    }
    var ops = Queue.plan(queue, index, isReady, entryKeys, playingKey)
    var result = applyPlan(entryKeys, ops, firstPosition)
    var at = entryKeys.indexOf(playingKey)
    var listed = playingKey === 0 || at >= 0
    var steady = at >= 0 && index >= 0 && queue[index].key === playingKey
    survey.cases++

    function judge(name, holds) {
      survey.seen[name]++
      if (holds || survey.broken[name] !== null) return
      survey.broken[name] = JSON.stringify({
        queue: keysOf(queue), index: index, ready: readyIds.map(function(id) { return id.charAt(0) }),
        entryKeys: entryKeys, playingKey: playingKey, ops: ops, playlistAfter: result.keys,
        faults: result.faults
      })
    }

    // No step names the playing key, and the entry itself is still there.
    judge("playing", !ops.some(function(op) { return op.key === playingKey })
      && (at < 0 || result.entries.some(function(entry) { return entry.was === at })))

    // Every step can be carried out as given: removals first and from the
    // back, then at most one insert-at and one append-play, at real places.
    var loads = ops.filter(function(op) { return op.op === "load" })
    judge("steps", result.faults.length === 0 && loads.length <= 2
      && (loads.length < 2 || (loads[0].mode === "insert-at" && loads[1].mode === "append-play")))

    if (!listed) {
      judge("unlisted", ops.length === 0)
    } else if (!steady) {
      // What stays: the playing entry, or, when nothing plays, the entry of
      // the current item, which is then the track that is being started.
      var staying = playingKey !== 0 ? playingKey : (index >= 0 ? queue[index].key : 0)
      var removals = []
      for (var i = entryKeys.length - 1; i >= 0; i--) {
        if (entryKeys[i] !== staying) removals.push({ op: "remove", key: entryKeys[i] })
      }
      var left = entryKeys.indexOf(staying) >= 0 ? [staying] : []
      judge("awaited", same(ops, removals) && same(result.keys, left))
      if (playingKey === 0 && left.length === 1) survey.seen.starting++
    } else {
      var wanted = wantedWindow(queue, index, readyIds)
      judge("window", same(result.keys, wanted))
      // A neighbour that sits in its place is not touched, and a playlist
      // that has the shape needs no step at all.
      var settled = []
      if (index > 0 && entryKeys[at - 1] === queue[index - 1].key && wanted[0] === queue[index - 1].key) {
        settled.push(queue[index - 1].key)
      }
      if (index + 1 < queue.length && entryKeys[at + 1] === queue[index + 1].key
        && wanted[wanted.length - 1] === queue[index + 1].key) settled.push(queue[index + 1].key)
      var again = Queue.plan(queue, index, readyTest(readyIds), result.keys, playingKey)
      judge("settled", again.length === 0 && !ops.some(function(op) { return settled.indexOf(op.key) >= 0 }))
    }

    // Readiness is asked about the two neighbours, once each, and only when
    // the current item plays.
    var neighbours = []
    if (steady && index > 0) neighbours.push(queue[index - 1].id)
    if (steady && index + 1 < queue.length) neighbours.push(queue[index + 1].id)
    judge("asked", same(asked, neighbours))
  })
  return survey
}

function assertGuarantee(name, atLeast) {
  var found = surveyed()
  assert.strictEqual(found.broken[name], null)
  assert.ok(found.seen[name] >= atLeast, name + ": " + found.seen[name] + " cases")
}

test("plan: the entry mpv plays is never removed, in any case there is", function() {
  assertGuarantee("playing", 1000000)
  assert.strictEqual(surveyed().seen.playing, surveyed().cases)
})

test("plan: while another track is awaited, all but the playing entry goes, nothing is loaded", function() {
  assertGuarantee("awaited", 300000)
  // Among them the cases where nothing plays and the track being started is spared.
  assert.ok(surveyed().seen.starting > 10000, String(surveyed().seen.starting))
})

test("plan: when the current item plays, the playlist becomes exactly [before] current [after]", function() {
  assertGuarantee("window", 50000)
})

test("plan: removals first, from the back; loads are insert-at or append-play at a real place", function() {
  assertGuarantee("steps", 1000000)
})

test("plan: a neighbour in its place is left alone, and a playlist in shape needs no step", function() {
  assertGuarantee("settled", 50000)
})

test("plan: keys that do not list the playing entry are not acted on at all", function() {
  assertGuarantee("unlisted", 300000)
})

test("plan: readiness is asked about the two neighbours only, while the current item plays", function() {
  assertGuarantee("asked", 1000000)
})

test("plan: a readiness test that fails or does not answer true vouches for nothing", function() {
  var answers = [
    function() { throw new Error("no") }, function() { return 1 }, function() { return "true" },
    function() { return {} }, function() {}, null, undefined, true, "all", [idOf("A")], { AAAAAAAAAAA: true }
  ]
  var queue = queueOf(3)
  answers.forEach(function(isReady, n) {
    assert.deepStrictEqual(Queue.plan(queue, 1, isReady, [2], 2), [], "answer " + n)
    assert.deepStrictEqual(Queue.plan(queue, 1, isReady, [1, 2, 3], 2),
      [{ op: "remove", key: 3 }, { op: "remove", key: 1 }], "answer " + n)
  })
})

// ---- The planner, with a queue that is not what it should be ----

test("plan: around things that are no items, and a key held twice, the rules hold all the same", function() {
  var all = function() { return true }
  var none = function() { return false }
  // Three items, a second item under the key of B, and two things that are
  // no items: nothing at all, and an entry with the key of C but no title.
  var slots = [itemOf("A", 1, false), itemOf("B", 2, false), itemOf("C", 3, false), itemOf("D", 2, false),
    null, { id: idOf("C"), key: 3, auto: false }]
  var queues = sequences(slots, 3, false)
  var playlists = sequences([1, 2, 3, 9], 3, true)
  var cases = { awaited: 0, steady: 0, unlisted: 0 }
  queues.forEach(function(queue) {
    for (var index = -1; index < queue.length; index++) {
      var current = itemKeyAt(queue, index)
      // The neighbours by the rules: an item, under another key than the
      // current one, and not under the same key on both sides.
      var before = itemKeyAt(queue, index - 1)
      var after = itemKeyAt(queue, index + 1)
      if (before === current) before = 0
      if (after === current) after = 0
      if (before === after) before = after = 0
      for (var p = 0; p < playlists.length; p++) {
        var entryKeys = playlists[p]
        for (var q = 0; q < 5; q++) {
          var playingKey = [0, 1, 2, 3, 9][q]
          var listed = playingKey === 0 || entryKeys.indexOf(playingKey) >= 0
          for (var r = 0; r < 2; r++) {
            var ops = Queue.plan(queue, index, r === 0 ? all : none, entryKeys, playingKey)
            var result = applyPlan(entryKeys, ops, firstPosition)
            var wanted
            if (!listed) {
              cases.unlisted++
              wanted = entryKeys
            } else if (current === 0 || current !== playingKey) {
              cases.awaited++
              var staying = playingKey !== 0 ? playingKey : current
              wanted = entryKeys.indexOf(staying) >= 0 ? [staying] : []
            } else {
              cases.steady++
              wanted = [current]
              if (r === 0 && before !== 0) wanted.unshift(before)
              if (r === 0 && after !== 0) wanted.push(after)
            }
            if (result.faults.length > 0 || !same(result.keys, wanted)) {
              assert.fail(JSON.stringify({
                queue: queue, index: index, entryKeys: entryKeys, playingKey: playingKey, ready: r === 0,
                ops: ops, playlistAfter: result.keys, wanted: wanted, faults: result.faults
              }))
            }
          }
        }
      }
    }
  })
  assert.ok(cases.steady > 5000 && cases.awaited > 100000 && cases.unlisted > 50000, JSON.stringify(cases))
})

// ---- The planner, with keys that cannot be right ----

test("plan: with entries that have no key or share one, no position is misread", function() {
  var cases = 0
  var queue = deepFreeze(queueOf(3))
  var readySets = [[], idsOf(queue)]
  // 0 stands for an entry that has no key of ours.
  sequences([0, 1, 2, 3, 9], 5, false).forEach(function(entryKeys) {
    var twice = entryKeys.some(function(key, i) { return entryKeys.indexOf(key) !== i })
    if (!twice && entryKeys.indexOf(0) < 0) return
    for (var index = -1; index < queue.length; index++) {
      readySets.forEach(function(readyIds) {
        [0, 1, 2, 3, 9].forEach(function(playingKey) {
          var ops = Queue.plan(queue, index, readyTest(readyIds), entryKeys, playingKey)
          var label = JSON.stringify({ index: index, entryKeys: entryKeys, playingKey: playingKey, ops: ops })
          // What must stay: the playing entry, or, when nothing plays, the
          // entry of the current item, the track that is being started.
          var staying = playingKey !== 0 ? playingKey : (index >= 0 ? queue[index].key : -1)
          var stayingBefore = entryKeys.filter(function(key) { return key === staying }).length
          var removed = []
          cases++
          if (playingKey !== 0 && stayingBefore === 0 && ops.length > 0) assert.fail(label)
          // Removals only, each of a key that is listed, is not the one to
          // stay and was not removed before: nothing is loaded around keys
          // that cannot be right.
          ops.forEach(function(op) {
            var fine = op.op === "remove" && op.key !== staying && op.key !== 0
              && removed.indexOf(op.key) < 0 && entryKeys.indexOf(op.key) >= 0
            if (!fine) assert.fail(label)
            removed.push(op.key)
          })
          // Whichever of its positions the player takes for a key that is
          // listed twice, the entry that goes carries that key, and every
          // entry of the key that must stay does stay.
          everyChoice(entryKeys, ops).concat([lastPosition]).forEach(function(pick) {
            var result = applyPlan(entryKeys, ops, pick)
            var stayingAfter = result.keys.filter(function(key) { return key === staying }).length
            if (result.faults.length > 0 || stayingAfter !== stayingBefore) {
              assert.fail(label + " " + result.faults.join("; "))
            }
          })
        })
      })
    }
  })
  assert.ok(cases > 100000, String(cases))
})

test("plan: a key listed twice is still cleared away, one plan after the other", function() {
  var queue = queueOf(3)
  var all = function() { return true }
  var starts = sequences([1, 2, 3, 9], 6, false).filter(function(keys) {
    return keys.indexOf(2) >= 0 && keys.indexOf(2) === keys.lastIndexOf(2)
  })
  assert.ok(starts.length > 2000, String(starts.length))
  starts.forEach(function(start) {
    var picks = [firstPosition, lastPosition]
    picks.forEach(function(pick) {
      var entryKeys = start
      // Each round stands for mpv reporting its playlist and a new plan.
      for (var round = 0; round < 8; round++) {
        var ops = Queue.plan(queue, 1, all, entryKeys, 2)
        if (ops.length === 0) break
        var result = applyPlan(entryKeys, ops, pick)
        assert.deepStrictEqual(result.faults, [], JSON.stringify([start, entryKeys, ops]))
        entryKeys = result.keys
      }
      assert.deepStrictEqual(entryKeys, [1, 2, 3], JSON.stringify(start))
    })
  })
})

// ---- Hostile arguments to the planner ----

// A plain copy of a list, or null for what is no list, cannot be read or is
// longer than any playlist the planner believes in.
function plainList(value) {
  try {
    if (!Array.isArray(value) || value.length > Const.LIMITS.queueItems) return null
    return Array.prototype.slice.call(value)
  } catch (error) {
    return null
  }
}

// The key of the item at a position, or 0 when no item is there.
function itemKeyAt(queue, index) {
  try {
    return Array.isArray(queue) && Number.isInteger(index) && isSoundItem(queue[index]) ? queue[index].key : 0
  } catch (error) {
    return 0
  }
}

// What must hold for any answer, given the arguments of the call: a list of
// well-formed steps that can be carried out and do not touch the playing
// entry, nothing loaded but an item beside the current one, and no step at
// all when the keys are no list that can be read.
function assertHarmless(ops, args, label) {
  var playingKey = args[4]
  assert.ok(Array.isArray(ops), label)
  ops.forEach(function(op) {
    assert.ok(op.op === "remove" || op.op === "load", label)
    assert.ok(Number.isInteger(op.key) && op.key >= 1 && op.key <= MAX_KEY, label)
    assert.notStrictEqual(op.key, playingKey, label)
    if (op.op !== "load") return
    assert.strictEqual(itemKeyAt(args[0], args[1]), playingKey, label)
    assert.strictEqual(op.key, itemKeyAt(args[0], args[1] + (op.mode === "insert-at" ? -1 : 1)), label)
  })
  var keys = plainList(args[3])
  if (keys === null) return assert.deepStrictEqual(ops, [], label)
  assert.deepStrictEqual(applyPlan(keys, ops, firstPosition).faults, [], label)
}

test("plan: no argument of any kind makes it throw, touch the playing entry or answer nonsense", function() {
  var queue = deepFreeze(queueOf(3))
  var all = function() { return true }
  var calls = [
    function(v) { return [v, 1, all, [1, 2, 3], 2] },
    function(v) { return [queue, v, all, [1, 2, 3], 2] },
    function(v) { return [queue, 1, v, [1, 2, 3], 2] },
    function(v) { return [queue, 1, all, v, 2] },
    function(v) { return [queue, 1, all, [1, 2, 3], v] },
    function(v) { return [queue, 1, all, [v, 2, v, 3], 2] },
    function(v) { return [[v, queue[1], v], 1, all, [2], 2] },
    function(v) { return [[v, queue[1], queue[2]], 1, all, [2], 2] },
    function(v) { return [[queue[0], queue[1], v], 1, all, [2], 2] },
    function(v) { return [[queue[0], v, queue[2]], 1, all, [1, 2, 3], 2] }
  ]
  calls.forEach(function(call, n) {
    HOSTILE.forEach(function(value, h) {
      var args = call(value)
      var ops
      assert.doesNotThrow(function() { ops = Queue.plan.apply(null, args) }, "call " + n + ", value " + h)
      assertHarmless(ops, args, "call " + n + ", value " + h)
    })
  })
  // Three hostile values at once, in every choice of three arguments.
  var some = [undefined, null, 0, 2, -1, 1.5, "2", [], [2], [1, 2, 3], {}, all]
  some = some.concat(failingObjects().slice(0, 2))
  var base = [queue, 1, all, [1, 2, 3], 2]
  some.forEach(function(a) {
    some.forEach(function(b) {
      some.forEach(function(c) {
        for (var i = 0; i < 5; i++) {
          for (var j = i + 1; j < 5; j++) {
            for (var k = j + 1; k < 5; k++) {
              var args = base.slice()
              args[i] = a
              args[j] = b
              args[k] = c
              var ops
              assert.doesNotThrow(function() { ops = Queue.plan.apply(null, args) })
              assertHarmless(ops, args, JSON.stringify([i, j, k]))
            }
          }
        }
      })
    })
  })
})

test("plan: only 0 means that nothing plays, and a list longer than any queue is not believed", function() {
  var queue = queueOf(3)
  var all = function() { return true }
  var both = [{ op: "remove", key: 2 }, { op: "remove", key: 1 }]
  assert.deepStrictEqual(Queue.plan(queue, -1, all, [1, 2], 0), both)
  assert.deepStrictEqual(Queue.plan(queue, -1, all, [1, 2], -0), both)
  // With a current item, its own entry is the track being started, and stays.
  assert.deepStrictEqual(Queue.plan(queue, 1, all, [1, 2], 0), [{ op: "remove", key: 1 }])
  assert.deepStrictEqual(Queue.plan(queue, 1, all, [1, 2], -0), [{ op: "remove", key: 1 }])
  var unknown = [undefined, null, false, "", "0", "2", -1, 0.5, 2.5, NaN, Infinity, MAX_KEY + 1, [2], {}]
  unknown.forEach(function(playingKey) {
    assert.deepStrictEqual(Queue.plan(queue, 1, all, [1, 2], playingKey), [], String(playingKey))
  })
  var many = []
  for (var key = 1; key <= Const.LIMITS.queueItems; key++) many.push(key)
  assert.strictEqual(Queue.plan(queue, 1, all, many, 2).length, Const.LIMITS.queueItems - 3)
  assert.deepStrictEqual(Queue.plan(queue, 1, all, many.concat([many.length + 1]), 2), [])
})

test("plan: nothing it is given is changed, and each answer is a new list of new steps", function() {
  var queue = deepFreeze(queueOf(4))
  var entryKeys = Object.freeze([9, 1, 2, 4])
  var all = function() { return true }
  var first = Queue.plan(queue, 1, all, entryKeys, 2)
  var second = Queue.plan(queue, 1, all, entryKeys, 2)
  assert.deepStrictEqual(first, [
    { op: "remove", key: 4 }, { op: "remove", key: 9 }, { op: "load", key: 3, mode: "append-play", index: -1 }
  ])
  assert.deepStrictEqual(second, first)
  assert.notStrictEqual(second, first)
  first.forEach(function(op, i) { assert.notStrictEqual(op, second[i]) })
})

// ---- A session: the edits and the planner together ----

test("through a long made-up session the playing track is never cut and mpv follows the queue", function() {
  var random = makeRandom(20240229)
  var queue = []
  var index = -1
  var nextKey = 1
  var playlist = []
  var playing = 0
  var ready = new Map()
  var plans = { awaited: 0, steady: 0, starting: 0 }

  function isReady(id) {
    return ready.get(id) === true
  }

  function take(result) {
    assertSoundQueue(result, "step")
    queue = result.queue
    index = result.index
  }

  // Makes a plan, sends it to the model and checks what came of it.
  function replan(why) {
    var ops = Queue.plan(queue, index, isReady, playlist.slice(), playing)
    var result = applyPlan(playlist, ops, firstPosition)
    var label = why + " " + JSON.stringify({
      queue: keysOf(queue), index: index, playlist: playlist, playing: playing, ops: ops
    })
    assert.deepStrictEqual(result.faults, [], label)
    if (index >= 0 && queue[index].key === playing) {
      plans.steady++
      assert.deepStrictEqual(result.keys, wantedWindow(queue, index, idsOf(queue).filter(isReady)), label)
    } else {
      plans.awaited++
      var staying = playing !== 0 ? playing : (index >= 0 ? queue[index].key : 0)
      assert.deepStrictEqual(result.keys, playlist.indexOf(staying) >= 0 ? [staying] : [], label)
    }
    playlist = result.keys
  }

  // A track was asked for: the window is cleared around what plays, the
  // video is looked up, and its load replaces mpv's whole playlist. The
  // old track may run out before that.
  function start(position, oldTrackEndsFirst) {
    index = position
    replan("start")
    if (oldTrackEndsFirst) playing = 0
    ready.set(queue[index].id, true)
    playlist = [queue[index].key]
    // The load went out and mpv lists the new entry, but has not said yet
    // that it is opening it. A plan made in that moment touches nothing,
    // whether the old track still plays or nothing does.
    if (playing !== queue[index].key) {
      plans.starting++
      assert.deepStrictEqual(Queue.plan(queue, index, isReady, playlist.slice(), playing), [], "loaded")
    }
    playing = queue[index].key
    replan("started")
  }

  function stop() {
    index = -1
    playlist = []
    playing = 0
  }

  // mpv went to another entry of its playlist by itself: at the end of a
  // track, or because a media key was pressed.
  function follow(step) {
    var at = playlist.indexOf(playing)
    if (playing === 0 || at + step < 0 || at + step >= playlist.length) return
    playing = playlist[at + step]
    var position = Queue.indexOfKey(queue, playing)
    if (position < 0) return stop()
    index = position
    replan("follow")
  }

  for (var step = 0; step < 8000; step++) {
    var action = random(12)
    var letter = LETTERS[random(LETTERS.length)]
    var someKey = queue.length > 0 ? queue[random(queue.length)].key : 0
    var result
    if (action <= 1) {
      result = Queue.append(queue, index, trackOf(letter), nextKey, false)
      if (!result.ok) continue
      nextKey++
      take(result)
      if (index < 0 && playing === 0) start(queue.length - 1, false)
      else replan("append")
    } else if (action === 2 && someKey !== 0) {
      result = Queue.remove(queue, index, someKey)
      take(result)
      if (!result.wasCurrent) replan("remove")
      else if (result.successor >= 0) start(result.successor, random(2) === 0)
      else stop()
    } else if (action === 3 && someKey !== 0) {
      result = Queue.move(queue, index, someKey, random(7) - 3)
      if (!result.ok) continue
      take(result)
      replan("move")
    } else if (action === 4 && queue.length > 0) {
      start(random(queue.length), random(3) === 0)
    } else if (action === 5 || action === 6) {
      follow(1)
    } else if (action === 7) {
      follow(-1)
    } else if (action === 8) {
      // A lookup finished or went stale. The track that plays was looked up.
      ready.set(idOf(letter), !isReady(idOf(letter)))
      if (index >= 0) ready.set(queue[index].id, true)
      replan("lookup")
    } else if (action === 9 && random(4) === 0) {
      take(Queue.keepCurrent(queue, index))
      replan("clear")
    } else if (action === 10) {
      var mix = [trackOf(LETTERS[random(LETTERS.length)]), trackOf(LETTERS[random(LETTERS.length)])]
      result = Queue.appendAuto(queue, index, mix, index >= 0 ? [queue[index].id] : [], nextKey)
      if (!result.ok) continue
      nextKey = result.nextKey
      take(result)
      replan("autoplay")
    } else if (action === 11 && random(6) === 0) {
      stop()
    }
    assert.strictEqual(new Set(keysOf(queue)).size, queue.length)
  }
  assert.ok(plans.steady > 2000, String(plans.steady))
  assert.ok(plans.awaited > 500, String(plans.awaited))
  assert.ok(plans.starting > 500, String(plans.starting))
})
