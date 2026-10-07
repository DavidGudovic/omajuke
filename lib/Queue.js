.pragma library
.import "Const.js" as Const
.import "Ids.js" as Ids
.import "Track.js" as Track

// The play queue, and the part of it that mpv holds in its own playlist.
//
// A queue is an array of items. An item is a track (id, title, channel,
// duration, live) plus "key", a number that names this one insertion for as
// long as the service runs (the same video may be queued twice), and "auto",
// true for an item that autoplay added. The position of the current item
// travels beside the array as an index, -1 when there is none.
//
// This file owns the shape of an item, every edit of a queue, and the plan
// that keeps mpv's playlist in step with it. Nothing here keeps state, and
// nothing changes what it is given: an edit answers { ok: true, queue, index }
// with a new array, in which the items it did not touch are the objects they
// were, or { ok: false } when the queue stays as it is, because the request
// was refused or there was nothing to do.
//
// No function here throws. What they are given is plain data in practice,
// but an object can also run code of its own when a member is read, and that
// code can fail. Nothing may throw into the service from here, so each
// function answers such a thing with its refusal.

// A key passes through QML "int" parameters and signals, which hold 32 bits.
var _MAX_KEY = 2147483647

// How many entries appendAuto reads from the end of the list of videos to
// leave out. The list grows with every track played, and nothing else
// bounds it. Far more than a long session plays, and still quick to read.
var _SKIP_IDS = 5000

// The members of an item. An entry with any other member is not one.
var _FIELDS = ["id", "title", "channel", "duration", "live", "key", "auto"]

function _isWhole(value) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value
}

function _isKey(value) {
  return _isWhole(value) && value >= 1 && value <= _MAX_KEY
}

function _make(track, key, auto) {
  return {
    id: track.id, title: track.title, channel: track.channel, duration: track.duration, live: track.live,
    key: key, auto: auto === true
  }
}

// A copy of a queue entry, or null when the entry is not an item exactly as
// _make() builds them: those seven members and no other, each of its type
// and within its limit, and a track of unknown length marked live. Whatever
// a function below decides about an entry, it decides on this copy. Each
// member is read once, so an object that answers differently the next time
// it is asked cannot pass as one thing and act as another. The entry itself
// is what an edit hands on, so that an item stays the object it was.
function _read(value) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null
    var names = Object.keys(value)
    if (names.length !== _FIELDS.length) return null
    for (var i = 0; i < names.length; i++) {
      if (_FIELDS.indexOf(names[i]) < 0) return null
    }
    var auto = value.auto
    var copy = _make(value, value.key, auto)
    if (typeof auto !== "boolean" || !_isKey(copy.key) || !Ids.isId(copy.id)) return null
    if (typeof copy.title !== "string" || copy.title.length > Const.LIMITS.titleChars) return null
    if (typeof copy.channel !== "string" || copy.channel.length > Const.LIMITS.channelChars) return null
    if (typeof copy.live !== "boolean") return null
    if (copy.duration === null) return copy.live ? copy : null
    if (!_isWhole(copy.duration) || copy.duration < 0) return null
    return copy.duration <= Const.LIMITS.durationSeconds ? copy : null
  } catch (error) {
    return null
  }
}

// True for a position in the queue: a whole number inside the list and its
// size limit. Anything else could only be a name the list happens to carry.
function _inside(queue, index) {
  return Array.isArray(queue) && _isWhole(index) && index >= 0
    && index < Math.min(queue.length, Const.LIMITS.queueItems)
}

// The copy of the item at this position, or null when there is none.
function _readAt(queue, index) {
  return _inside(queue, index) ? _read(queue[index]) : null
}

// What every edit starts from: a new array with the items of the queue, a
// second one with their copies, the position of the current item, and a
// table from key to position. Anything that is not an item, a second item
// with a key already seen and whatever lies beyond the size limit is left
// out, and the position follows. A queue made by this file comes back
// unchanged, so this is only the guard that keeps a damaged queue from
// being handed on.
function _view(queue, index) {
  var items = []
  var copies = []
  var keys = new Map()
  var current = -1
  if (Array.isArray(queue)) {
    var end = Math.min(queue.length, Const.LIMITS.queueItems)
    for (var i = 0; i < end; i++) {
      var entry = queue[i]
      var copy = _read(entry)
      if (copy === null || keys.has(copy.key)) continue
      if (i === index) current = items.length
      keys.set(copy.key, items.length)
      items.push(entry)
      copies.push(copy)
    }
  }
  return { items: items, copies: copies, index: current, keys: keys }
}

// ---- Items ----

// Returns a queue item, or null when the track is not a track or the key is
// not a key. The track is validated again here, so that nothing unchecked
// can enter a queue whatever the caller did before.
function item(track, key, auto) {
  try {
    var clean = Track.fromUi(track)
    if (clean === null || !_isKey(key)) return null
    return _make(clean, key, auto)
  } catch (error) {
    return null
  }
}

// ---- Edits ----

// Adds a track at the end under the given key. A refusal says why:
// { ok: false, code } with "invalid" for a bad track, a bad key or a key
// that is already in the queue, and "full" for a queue at its limit.
function append(queue, index, track, key, auto) {
  try {
    var entry = item(track, key, auto)
    var view = _view(queue, index)
    if (entry === null || view.keys.has(key)) return { ok: false, code: "invalid" }
    if (view.items.length >= Const.LIMITS.queueItems) return { ok: false, code: "full" }
    view.items.push(entry)
    return { ok: true, queue: view.items, index: view.index }
  } catch (error) {
    return { ok: false, code: "invalid" }
  }
}

// Adds what autoplay found: the tracks of a related mix, in their order,
// marked auto. A track is left out when its video is already in the queue,
// already among the added ones, or listed in skipIds, where the caller names
// the video the mix was made for and everything played in this session, so
// that autoplay does not go round in circles. Of a very long skipIds only
// the end is read, so the caller adds to it at the end: what played last is
// what a new mix is most likely to bring again. The keys used are firstKey
// and the numbers after it. On success the result also carries "added", the
// count, and "nextKey", the first key that is still unused.
function appendAuto(queue, index, tracks, skipIds, firstKey) {
  try {
    if (!Array.isArray(tracks) || !Array.isArray(skipIds) || !_isKey(firstKey)) return { ok: false }
    var view = _view(queue, index)
    var taken = new Map()
    var i
    for (i = 0; i < view.copies.length; i++) taken.set(view.copies[i].id, true)
    // Counted from the end, with the length read once: whatever the list
    // claims to hold, this loop takes a bounded number of turns.
    var skips = skipIds.length
    var read = Math.min(skips, _SKIP_IDS)
    for (i = 1; i <= read; i++) taken.set(skipIds[skips - i], true)
    var key = firstKey
    var added = 0
    var end = Math.min(tracks.length, Const.LIMITS.mixFetch)
    for (i = 0; i < end; i++) {
      if (added >= Const.LIMITS.mixAppend || view.items.length >= Const.LIMITS.queueItems) break
      var entry = item(tracks[i], key, true)
      if (entry === null || taken.has(entry.id)) continue
      // A key that is in use means the caller's counter went wrong: refuse
      // the lot rather than put two items under one key.
      if (view.keys.has(key)) return { ok: false }
      taken.set(entry.id, true)
      view.items.push(entry)
      key++
      added++
    }
    if (added === 0) return { ok: false }
    return { ok: true, queue: view.items, index: view.index, added: added, nextKey: key }
  } catch (error) {
    return { ok: false }
  }
}

// Takes the item with this key out. When it was the current one the queue
// has no current item afterwards (index -1): "wasCurrent" is true and
// "successor" is where the item that followed it now sits, -1 when it was
// the last. What to play then is for the caller to decide.
function remove(queue, index, key) {
  try {
    var view = _view(queue, index)
    if (!view.keys.has(key)) return { ok: false }
    var at = view.keys.get(key)
    view.items.splice(at, 1)
    if (at === view.index) {
      return {
        ok: true, queue: view.items, index: -1, wasCurrent: true,
        successor: at < view.items.length ? at : -1
      }
    }
    return {
      ok: true, queue: view.items, index: at < view.index ? view.index - 1 : view.index,
      wasCurrent: false, successor: -1
    }
  } catch (error) {
    return { ok: false }
  }
}

// Moves the item with this key by delta places, stopping at either end. The
// current item stays the current item, wherever it lands. Refused when the
// item would not move at all.
function move(queue, index, key, delta) {
  try {
    var view = _view(queue, index)
    if (!view.keys.has(key) || !_isWhole(delta)) return { ok: false }
    var from = view.keys.get(key)
    var to = Math.max(0, Math.min(view.items.length - 1, from + delta))
    if (to === from) return { ok: false }
    var moved = view.items.splice(from, 1)
    view.items.splice(to, 0, moved[0])
    var current = view.index
    if (current === from) current = to
    else if (from < current && to >= current) current--
    else if (from > current && to <= current) current++
    return { ok: true, queue: view.items, index: current }
  } catch (error) {
    return { ok: false }
  }
}

// Cuts the queue down to its current item, or to nothing when there is
// none. Always answers with a queue: clearing the history rests on this,
// and a queue that cannot be read is cleared altogether.
function keepCurrent(queue, index) {
  try {
    var view = _view(queue, index)
    if (view.index < 0) return { ok: true, queue: [], index: -1 }
    return { ok: true, queue: [view.items[view.index]], index: 0 }
  } catch (error) {
    return { ok: true, queue: [], index: -1 }
  }
}

// Replaces what is known about the item with this key: title, channel,
// duration and live, as a lookup of the video reported them. An item
// started from a bare link has no title until then. The item keeps its key
// and its auto mark. Refused when the track is about another video, when it
// has no title (a lookup always reports one, so such a track could only
// erase what is known) and when it says nothing new.
function withTrack(queue, index, key, track) {
  try {
    var clean = Track.fromUi(track)
    var view = _view(queue, index)
    if (clean === null || clean.title === "" || !view.keys.has(key)) return { ok: false }
    var at = view.keys.get(key)
    var old = view.copies[at]
    if (old.id !== clean.id) return { ok: false }
    if (old.title === clean.title && old.channel === clean.channel && old.duration === clean.duration
      && old.live === clean.live) return { ok: false }
    view.items[at] = _make(clean, old.key, old.auto)
    return { ok: true, queue: view.items, index: view.index }
  } catch (error) {
    return { ok: false }
  }
}

// One element of the stored list as { track, auto }, or null when it is no
// track or cannot be read. Only a mark the element itself carries counts.
function _stored(value) {
  try {
    var track = Track.fromStored(value)
    if (track === null) return null
    return { track: track, auto: Object.prototype.hasOwnProperty.call(value, "auto") && value.auto === true }
  } catch (error) {
    return null
  }
}

// Builds a queue from what the state file held: tracks with an auto mark
// and the index of the current one. Each track is validated like any other
// outside text, a bad one is dropped and the index follows; an index that
// points at nothing, or at a dropped track, becomes -1. Keys are handed out
// from firstKey on, and the result carries "nextKey" like appendAuto.
function fromStored(items, index, firstKey) {
  try {
    if (!_isKey(firstKey)) return { ok: false }
    var queue = []
    var current = -1
    var key = firstKey
    if (Array.isArray(items)) {
      var end = Math.min(items.length, Const.LIMITS.queueItems)
      for (var i = 0; i < end && key <= _MAX_KEY; i++) {
        var stored = _stored(items[i])
        if (stored === null) continue
        if (i === index) current = queue.length
        queue.push(_make(stored.track, key, stored.auto))
        key++
      }
    }
    return { ok: true, queue: queue, index: current, nextKey: key }
  } catch (error) {
    return { ok: false }
  }
}

// ---- Questions ----

// The item at this position, or null when there is none.
function itemAt(queue, index) {
  try {
    if (!_inside(queue, index)) return null
    var entry = queue[index]
    return _read(entry) === null ? null : entry
  } catch (error) {
    return null
  }
}

// The position of the item with this key, or -1.
function indexOfKey(queue, key) {
  try {
    if (!Array.isArray(queue) || !_isKey(key)) return -1
    var end = Math.min(queue.length, Const.LIMITS.queueItems)
    for (var i = 0; i < end; i++) {
      var copy = _read(queue[i])
      if (copy !== null && copy.key === key) return i
    }
    return -1
  } catch (error) {
    return -1
  }
}

// The position after, or before, the current item, or -1 when there is no
// such item. A queue without a current item has neither: nothing is "next"
// when nothing is playing.
function nextIndex(queue, index) {
  return itemAt(queue, index) !== null && itemAt(queue, index + 1) !== null ? index + 1 : -1
}

function previousIndex(queue, index) {
  return itemAt(queue, index) !== null && itemAt(queue, index - 1) !== null ? index - 1 : -1
}

// The video ids of the previous, the current and the next item, each once:
// the tracks whose looked-up data must outlive a clean-up, because mpv may
// open any of them without asking. Empty without a current item.
function keepIds(queue, index) {
  try {
    var ids = []
    if (_readAt(queue, index) === null) return ids
    for (var i = index - 1; i <= index + 1; i++) {
      var copy = _readAt(queue, i)
      if (copy !== null && ids.indexOf(copy.id) < 0) ids.push(copy.id)
    }
    return ids
  } catch (error) {
    return []
  }
}

// ---- The window mpv holds ----

// The caller's test is foreign code: only a plain true counts, and a test
// that fails means "not ready".
function _ready(isReady, id) {
  if (typeof isReady !== "function") return false
  try {
    return isReady(id) === true
  } catch (error) {
    return false
  }
}

// The copy of the item beside the current one, when it should sit in mpv's
// playlist: it exists, it is another insertion than the current item, and
// its video has been looked up. Null otherwise.
function _neighbour(queue, index, current, isReady) {
  var copy = _readAt(queue, index)
  if (copy === null || copy.key === current.key) return null
  return _ready(isReady, copy.id) ? copy : null
}

// The steps that plan() below hands out. plan() itself adds nothing but
// the promise not to throw.
function _steps(queue, index, isReady, entryKeys, playingKey) {
  var ops = []
  if (!Array.isArray(entryKeys)) return ops
  var count = entryKeys.length
  if (!_isWhole(count) || count > Const.LIMITS.queueItems) return ops

  // The playlist as this plan knows it: every entry read once, 0 for one
  // without a key, and where each key sits. "regular" says that every
  // entry has a key of its own, so that a key names exactly one position.
  var keys = []
  var first = new Map()
  var last = new Map()
  var regular = true
  var i
  var key
  for (i = 0; i < count; i++) {
    key = entryKeys[i]
    if (!_isKey(key)) {
      keys.push(0)
      regular = false
      continue
    }
    keys.push(key)
    if (first.has(key)) regular = false
    else first.set(key, i)
    last.set(key, i)
  }

  // mpv plays an entry these keys do not list: they are older than what it
  // is doing, and a position taken from them could be the playing entry's.
  // A playingKey that is no key ends here too, since none is ever listed:
  // only a plain 0 says that nothing plays, and anything else says nothing
  // at all, so that no entry can be known to be safe to touch.
  if (playingKey !== 0 && !first.has(playingKey)) return ops

  var current = _readAt(queue, index)
  var steady = regular && current !== null && current.key === playingKey
  var before = null
  var after = null
  var beforeInPlace = false
  var afterInPlace = false
  if (steady) {
    var at = first.get(playingKey)
    before = _neighbour(queue, index - 1, current, isReady)
    after = _neighbour(queue, index + 1, current, isReady)
    // One key on both sides is no queue of ours: trust neither.
    if (before !== null && after !== null && before.key === after.key) {
      before = null
      after = null
    }
    beforeInPlace = before !== null && at > 0 && keys[at - 1] === before.key
    afterInPlace = after !== null && at + 1 < keys.length && keys[at + 1] === after.key
  }

  // Nothing plays, and yet the playlist lists the current item: that is the
  // track being started, handed to mpv and not yet reported as opening.
  // It is spared like a playing entry. Removing it would undo the start.
  var starting = playingKey === 0 && current !== null ? current.key : 0

  // Back to front. A key that is listed twice could mean either position.
  // It is removed only if both lie in front of everything removed so far,
  // so that neither has shifted, and one of the two entries goes. The next
  // plan, made from newer keys, deals with what is left.
  var lowest = keys.length
  for (i = keys.length - 1; i >= 0; i--) {
    key = keys[i]
    if (key === 0 || first.get(key) !== i || key === playingKey || key === starting) continue
    if (beforeInPlace && key === before.key) continue
    if (afterInPlace && key === after.key) continue
    if (last.get(key) >= lowest) continue
    ops.push({ op: "remove", key: key })
    lowest = i
  }

  if (before !== null && !beforeInPlace) {
    ops.push({ op: "load", key: before.key, mode: "insert-at", index: 0 })
  }
  if (after !== null && !afterInPlace) {
    ops.push({ op: "load", key: after.key, mode: "append-play", index: -1 })
  }
  return ops
}

// Works out how to bring mpv's playlist in step with the queue.
//
// mpv is not given the whole queue. Its playlist holds a window of at most
// three entries: the current item, with the item before and the item after
// it once their videos have been looked up. That is what lets mpv go on to
// the next track without a gap, and what makes the desktop's Next and
// Previous media keys work, which act on mpv's own playlist.
//
//   queue       the items
//   index       position of the current item, -1 for none
//   isReady     function(id): true when that video has been looked up and
//               the result is still usable
//   entryKeys   the keys of mpv's playlist entries, in playlist order, as
//               mpv last reported them: one element for every entry, 0 for
//               an entry that has no key
//   playingKey  the key of the entry mpv is playing or opening, 0 for none
//
// Returns the steps to take, in order:
//   { op: "remove", key }
//   { op: "load", key, mode: "insert-at", index: 0 }     the item before
//   { op: "load", key, mode: "append-play", index: -1 }  the item after
//
// Three rules hold for every answer.
//
// 1. The entry mpv is playing is never removed. Removing it makes mpv end
//    the track on the spot and move on.
//
// 2. While the current item is not what mpv plays (another track was asked
//    for and is still being looked up, or nothing plays), every entry but
//    the playing one is removed and nothing is loaded. The track that is
//    playing goes on until the new one replaces the whole playlist, and
//    until then mpv has nothing it could wander into by itself. When
//    nothing plays at all, the entry of the current item stays as well: it
//    can only be the track that was just handed to mpv, and mpv, playing
//    nothing, cannot wander anywhere.
//
// 3. When the current item is what mpv plays, the playlist afterwards is
//    exactly [before] current [after], with each neighbour present when it
//    exists and is ready. An entry in the wrong place, a neighbour on the
//    wrong side included, is removed, and the neighbour loaded again where
//    it belongs.
//
// Removals come first and run from the back of the playlist to the front.
// The player turns a key into a position through the same entryKeys this
// plan was made from, and those do not change until mpv reports again, so
// only an order that never shifts a position still to be used is safe. The
// loads follow, and their index counts in the playlist as it is by then:
// the playing entry is first whenever the item before it has to be loaded,
// hence 0. "append-play" needs no position and carries the -1 the mpv
// command takes for it. It is never plain "append": an entry appended just
// after the last one ended would sit in the playlist unplayed, while
// "append-play" starts it then and only appends while something plays.
//
// The plan is only as good as what it is told about mpv. Where that cannot
// be right, the answer does less rather than guess: nothing at all when
// playingKey is neither 0 nor a key, when entryKeys is no list, is longer
// than any queue or does not list the entry that is playing, and removals
// only when it holds something that is not a key or holds a key twice.
// What it cannot see is whether entryKeys already shows the steps of an
// earlier plan. A caller that plans again before mpv has reported them
// would send positions that are off by what the first plan removed or put
// in front, and such a position can be the playing entry's. For the same
// reason a load is repeated for as long as entryKeys does not show it: the
// caller leaves out a load for a key the player already holds, and judges
// that step by step, because a plan may remove a key and load it again.
function plan(queue, index, isReady, entryKeys, playingKey) {
  try {
    return _steps(queue, index, isReady, entryKeys, playingKey)
  } catch (error) {
    return []
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    item: item,
    append: append,
    appendAuto: appendAuto,
    remove: remove,
    move: move,
    keepCurrent: keepCurrent,
    withTrack: withTrack,
    fromStored: fromStored,
    itemAt: itemAt,
    indexOfKey: indexOfKey,
    nextIndex: nextIndex,
    previousIndex: previousIndex,
    keepIds: keepIds,
    plan: plan
  }
}
