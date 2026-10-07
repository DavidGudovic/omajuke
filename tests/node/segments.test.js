"use strict"
// Tests for lib/Segments.js: the vector table (also run inside Qt's engine),
// and what a table cannot state. The request never carries the id. The
// reading of an answer is held against a second, plainer statement of the
// same rules over thousands of random answers. Simulated playback shows
// that no list, accepted or not, moves the position backwards, seeks
// without end, takes more than four fifths of a track away, or keeps
// cutting tracks short once the breaker has tripped.
var test = require("node:test")
var assert = require("node:assert")
var crypto = require("node:crypto")
var load = require("./load.js")

var Segments = load.lib("Segments")
var Const = load.lib("Const")
var table = load.vectors("segments")

var ID = "AAAAAAAAAAA"
var OTHER = "abcDEF12345"
var ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

var SHOWN = ["sponsor", "selfpromo", "interaction"]
var HIDDEN = ["sponsor", "selfpromo", "interaction", "music_offtopic"]

// The limits the module documents.
var MAX_VIDEOS = 2000
var MAX_SEGMENTS = 100
var EDGE = 0.5

// The player reports its position about eleven times a second.
var TICK = 0.09

// A step that binary numbers hold exactly. Playback that moves in such
// steps over positions that are multiples of it has no rounding at all, so
// what was played can be added up and compared without a tolerance.
var EIGHTH = 0.125

var QUERY = "?categories=%5B%22sponsor%22%2C%22selfpromo%22%2C%22interaction%22%2C%22music_offtopic%22%5D"
  + "&actionTypes=%5B%22skip%22%5D"

// Values no caller should pass, and which must not make anything throw.
var refuse = function() { throw new Error("no") }
var ODD = [
  undefined, null, 0, 1, -1, NaN, Infinity, true, false, "", "sponsor", "toString", "__proto__", ID, [],
  [null], [[]], [ID], {}, { length: 3 }, Object.create(null), { toString: refuse, valueOf: refuse },
  new Proxy({}, { get: refuse }), function() {}, Symbol("sponsor"), new String(ID), new Number(600)
]

// A small deterministic generator, so that a failure can be reproduced.
function makeRandom(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

function randomId(random) {
  var id = ""
  for (var i = 0; i < 11; i++) id += ID_ALPHABET[random(ID_ALPHABET.length)]
  return id
}

function seg(start, end, category, markedOn) {
  return { category: category, actionType: "skip", segment: [start, end], videoDuration: markedOn }
}

function answer(segments, id) {
  return JSON.stringify([{ videoID: id || ID, segments: segments }])
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

function isNumber(value) {
  return typeof value === "number" && isFinite(value)
}

// ---- A second statement of the rules ----

// Which stretches an answer should yield, written as plainly as possible
// and without sharing a line with the module: the valid segments are
// collected, then the track is cut at every boundary and each piece is
// either covered or not.
function model(text, id, duration, hidden) {
  var allowed = hidden ? HIDDEN : SHOWN
  var videos = JSON.parse(text)
  var valid = []
  var looked = 0
  videos.forEach(function(video) {
    if (video === null || typeof video !== "object" || video.videoID !== id) return
    if (!Array.isArray(video.segments)) return
    video.segments.forEach(function(raw) {
      if (looked >= MAX_SEGMENTS) return
      looked++
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return
      if (raw.actionType !== "skip" || allowed.indexOf(raw.category) === -1) return
      if (!Array.isArray(raw.segment) || raw.segment.length !== 2) return
      var start = raw.segment[0]
      var end = raw.segment[1]
      if (!isNumber(start) || !isNumber(end) || start < 0 || end > duration + 1) return
      // What lies within the track has to last a second.
      var within = end > duration ? duration : end
      if (within - start < 1) return
      if (!isNumber(raw.videoDuration) || raw.videoDuration <= 0) return
      if (Math.abs(raw.videoDuration - duration) > 2) return
      valid.push({ start: start, end: within, rank: allowed.indexOf(raw.category) })
    })
  })
  var cuts = []
  valid.forEach(function(segment) {
    if (cuts.indexOf(segment.start) === -1) cuts.push(segment.start)
    if (cuts.indexOf(segment.end) === -1) cuts.push(segment.end)
  })
  cuts.sort(function(a, b) { return a - b })
  var stretches = []
  for (var i = 0; i + 1 < cuts.length; i++) {
    var from = cuts[i]
    var to = cuts[i + 1]
    var covered = valid.some(function(segment) { return segment.start <= from && segment.end >= to })
    if (!covered) continue
    var last = stretches[stretches.length - 1]
    if (last && last.end === from) last.end = to
    else stretches.push({ start: from, end: to })
  }
  // What acting on the stretches leaves unplayed: each stretch, and after
  // one that comes within a second of the end, the rest of the track.
  var lost = 0
  stretches.forEach(function(stretch) {
    lost += (stretch.end >= duration - 1 ? duration : stretch.end) - stretch.start
  })
  if (lost > duration * 0.8 + 1e-9) return []
  return stretches.map(function(stretch) {
    // Of the segments that start where the stretch starts, the one whose
    // category comes first in the list gives the stretch its name.
    var rank = allowed.length
    valid.forEach(function(segment) {
      if (segment.start === stretch.start && segment.rank < rank) rank = segment.rank
    })
    return {
      start: stretch.start,
      end: stretch.end,
      category: allowed[rank],
      toEnd: stretch.end >= duration - 1
    }
  })
}

// A random answer for a track of the given length. Positions lie on a grid
// of half seconds, so that sums are exact, and reach past both ends of the
// track. Most fields are sound and every one of them is sometimes not.
function randomAnswer(random, duration) {
  var categories = HIDDEN.concat(["intro", "outro", "constructor", "__proto__", "", null, 7])
  var actions = ["skip", "skip", "skip", "skip", "skip", "skip", "mute", "full", null]
  var lengths = [
    duration, duration, duration, duration, duration + 1.5, duration - 2, duration + 2.5, 0, null,
    String(duration)
  ]
  var oddNumbers = [-3, -0.5, null, "12", 1e300, duration + 1, duration + 1.5, duration + 40]
  function position() {
    if (random(12) === 0) return oddNumbers[random(oddNumbers.length)]
    return random(duration * 2 + 1) / 2
  }
  function segment() {
    var start = position()
    // Mostly short, sometimes long, sometimes backwards.
    var span = random(6) === 0 ? random(duration) : random(40) / 2 - 2
    var end = random(10) === 0 ? position() : (isNumber(start) ? start + span : span)
    var raw = seg(start, end, categories[random(categories.length)], lengths[random(lengths.length)])
    raw.actionType = actions[random(actions.length)]
    if (random(25) === 0) raw.segment = [start, end, end]
    if (random(25) === 0) return null
    return raw
  }
  var videos = []
  var count = 1 + random(3)
  for (var i = 0; i < count; i++) {
    var segments = []
    var size = random(30) === 0 ? 60 + random(120) : random(9)
    for (var j = 0; j < size; j++) segments.push(segment())
    videos.push({ videoID: random(4) === 0 ? OTHER : ID, segments: random(30) === 0 ? "none" : segments })
  }
  return JSON.stringify(videos)
}

// Checks everything a picked list promises, whatever went in.
function assertSound(picked, duration, hidden, label) {
  var allowed = hidden ? HIDDEN : SHOWN
  assert.ok(Array.isArray(picked), label)
  assert.ok(picked.length <= MAX_SEGMENTS, label)
  var lost = 0
  picked.forEach(function(stretch, i) {
    assert.deepStrictEqual(Object.keys(stretch), ["start", "end", "category", "toEnd"], label)
    assert.ok(isNumber(stretch.start) && isNumber(stretch.end), label)
    assert.ok(stretch.start >= 0 && stretch.end <= duration, label)
    // Long enough to be worth a seek, and so for a skip to start in it.
    assert.ok(stretch.end - stretch.start >= 1, label)
    assert.ok(allowed.indexOf(stretch.category) !== -1, label)
    assert.strictEqual(stretch.toEnd, stretch.end >= duration - 1, label)
    // In playing order, with a gap between any two.
    if (i > 0) assert.ok(stretch.start > picked[i - 1].end, label)
    // Only the last stretch can reach the end of the track.
    if (stretch.toEnd) assert.strictEqual(i, picked.length - 1, label)
    lost += (stretch.toEnd ? duration : stretch.end) - stretch.start
  })
  assert.ok(lost <= duration * 0.8 + 1e-9, label)
}

// A random answer whose segments crowd the places where the rules meet:
// the last seconds of the track, the second past its end, and the four
// fifths that may be skipped. Every position is a multiple of an eighth of
// a second, and so has to be the duration.
function edgeAnswer(random, duration) {
  var categories = ["sponsor", "sponsor", "selfpromo", "interaction", "music_offtopic"]
  var segments = []
  // One or two long segments that together come close to the limit.
  var allowed = Math.floor(duration * 0.8 / EIGHTH) * EIGHTH
  var bodies = random(3)
  var from = random(5) * EIGHTH * 2
  for (var i = 0; i < bodies; i++) {
    var length = Math.max(1, Math.floor(allowed / bodies / EIGHTH) * EIGHTH + (random(9) - 6) * EIGHTH)
    segments.push(seg(from, from + length, categories[random(categories.length)], duration))
    from += length + random(4) * EIGHTH
  }
  // Up to three short ones around the end of the track.
  var tails = random(4)
  for (var j = 0; j < tails; j++) {
    var start = duration - random(21) * EIGHTH
    if (start < 0) start = 0
    var end = start + (2 + random(14)) * EIGHTH
    segments.push(seg(start, end, categories[random(categories.length)], duration + (random(5) - 2)))
  }
  // Now and then one that is not a segment at all.
  if (random(10) === 0) segments.push(seg(duration, duration - 1, "sponsor", duration))
  if (random(10) === 0) segments.push(null)
  return answer(segments)
}

// Plays a track from the start in steps of an eighth of a second, acting
// on every answer of next(). Returns { played, seeks, advanced }: the
// seconds that were actually played, exactly.
function playExact(segments, duration) {
  var fired = []
  var pos = 0
  var run = { played: 0, seeks: 0, advanced: false }
  while (pos < duration) {
    var step = Segments.next(pos, segments, fired)
    fired = step.fired
    if (step.action === "advance") {
      run.advanced = true
      return run
    }
    if (step.action === "seek") {
      assert.ok(step.to > pos, "a seek went backwards: " + pos + " to " + step.to)
      run.seeks++
      assert.ok(run.seeks <= MAX_SEGMENTS, "more seeks than stretches")
      pos = step.to
      continue
    }
    pos += EIGHTH
    run.played += EIGHTH
  }
  return run
}

// True when playing on from a position, without anybody seeking, makes
// next() act at some point. Positions and list are multiples of an eighth.
function firesFrom(pos, segments, fired, until) {
  var marks = fired
  for (var at = pos; at <= until; at += EIGHTH) {
    var step = Segments.next(at, segments, marks)
    if (step.action !== "none") return true
    marks = step.fired
  }
  return false
}

// ---- Simulated playback ----

// Plays a track from the start the way the service would: the position
// advances in ticks, every position is put to next(), the marks it returns
// are kept, a "seek" moves the position and an "advance" ends the track.
// options.landShort makes every seek arrive that much before its target,
// options.userSeeks lists { at, to }: once the position passes `at`, the
// user jumps to `to`. Returns what happened.
function play(segments, duration, options) {
  var landShort = options && options.landShort ? options.landShort : 0
  var userSeeks = options && options.userSeeks ? options.userSeeks.slice() : []
  var fired = []
  var pos = 0
  var run = { seeks: [], advanced: false, ticks: 0, endedAt: duration }
  while (pos < duration) {
    run.ticks++
    assert.ok(run.ticks < 2000000, "playback did not end")
    var step = Segments.next(pos, segments, fired)
    fired = step.fired
    if (step.action === "advance") {
      run.advanced = true
      run.endedAt = pos
      run.seeks.push({ from: pos, to: step.to, skip: step.skip })
      return run
    }
    if (step.action === "seek") {
      assert.ok(step.to > pos, "a seek went backwards: " + pos + " to " + step.to)
      run.seeks.push({ from: pos, to: step.to, skip: step.skip })
      pos = Math.max(pos, step.to - landShort)
      continue
    }
    assert.strictEqual(step.action, "none")
    if (userSeeks.length > 0 && pos >= userSeeks[0].at) {
      pos = userSeeks.shift().to
      continue
    }
    pos += TICK
  }
  return run
}

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(Segments).sort(), [
    "MAX_BYTES", "SEEK_GAP_MS", "argv", "cascade", "config", "mayAct", "next", "pending", "pick", "reply",
    "tripped"
  ])
  assert.strictEqual(Segments.MAX_BYTES, 1048576)
  assert.strictEqual(Segments.SEEK_GAP_MS, 500)
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Segments, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Segments).forEach(function(name) {
    if (typeof Segments[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

// ---- The request ----

test("argv: an absolute tool, bounded in every way, with the address left to standard input", function() {
  var argv = Segments.argv(Const.TOOLS)
  assert.strictEqual(argv[0], Const.TOOLS.curl)
  assert.strictEqual(argv[0].charAt(0), "/")
  // curl reads a configuration file of the user unless -q is its first argument.
  assert.strictEqual(argv[1], "-q")
  assert.deepStrictEqual(argv.slice(-2), ["--config", "-"])
  function valueOf(flag) {
    var index = argv.indexOf(flag)
    assert.notStrictEqual(index, -1, flag)
    return argv[index + 1]
  }
  assert.strictEqual(valueOf("--proto"), "=https")
  assert.strictEqual(valueOf("--proto-redir"), "=https")
  assert.strictEqual(valueOf("--max-redirs"), "0")
  assert.strictEqual(valueOf("--max-filesize"), String(Segments.MAX_BYTES))
  assert.strictEqual(valueOf("--user-agent"), "")
  assert.strictEqual(valueOf("--header"), "Accept-Language:")
  // The backslashes are for curl, which turns them into line breaks itself.
  assert.strictEqual(valueOf("--write-out"), "\\n%{response_code}\\n")
  // The job's own limit has to outlast curl's.
  assert.ok(Number(valueOf("--max-time")) < Const.TIMEOUTS.sponsor)
  assert.ok(Number(valueOf("--connect-timeout")) < Number(valueOf("--max-time")))
  argv.forEach(function(arg) {
    assert.strictEqual(typeof arg, "string")
    assert.strictEqual(/https?:|sponsor|\.app/.test(arg), false, arg)
  })
  var forbidden = ["--insecure", "-k", "--location", "-L", "--cookie", "--cookie-jar", "--output", "-o",
    "--proxy", "--data", "--netrc"]
  forbidden.forEach(function(flag) { assert.strictEqual(argv.indexOf(flag), -1, flag) })
})

test("argv: a fresh list on every call, the same whatever is asked for", function() {
  var first = Segments.argv(Const.TOOLS)
  var second = Segments.argv(Const.TOOLS)
  assert.notStrictEqual(first, second)
  assert.deepStrictEqual(first, second)
  first.push("--insecure")
  first[0] = "/elsewhere/curl"
  assert.deepStrictEqual(Segments.argv(Const.TOOLS), second)
  // Only the tool table is taken, so nothing about a video can get in.
  assert.strictEqual(Segments.argv.length, 1)
  assert.deepStrictEqual(Segments.argv(Const.TOOLS, ID), second)
  // A tool path that the table merely inherits is not a tool path.
  assert.deepStrictEqual(Segments.argv(Object.create({ curl: "/usr/bin/curl" })), [])
})

test("config: one line naming the bucket of the id's hash, and never the id", function() {
  var random = makeRandom(1)
  var head = "url = \"https://sponsor.ajay.app/api/skipSegments/"
  var tail = QUERY + "\"\n"
  for (var i = 0; i < 2000; i++) {
    var id = randomId(random)
    var text = Segments.config(id)
    assert.strictEqual(text.slice(0, head.length), head, id)
    assert.strictEqual(text.slice(-tail.length), tail, id)
    // What is left between the constant parts is all that depends on the id.
    var prefix = text.slice(head.length, text.length - tail.length)
    assert.match(prefix, /^[0-9a-f]{4}$/, id)
    assert.strictEqual(prefix, crypto.createHash("sha256").update(id).digest("hex").slice(0, 4), id)
    // One line, one quoted value, nothing curl's configuration reader treats specially.
    assert.match(text, /^url = "[\x21\x23-\x5b\x5d-\x7e]+"\n$/, id)
  }
})

test("config: the query asks for the same four categories and for skips only", function() {
  var text = Segments.config(ID)
  var query = text.slice(text.indexOf("?") + 1, text.lastIndexOf("\""))
  var pairs = query.split("&").map(function(pair) { return pair.split("=").map(decodeURIComponent) })
  assert.deepStrictEqual(pairs, [
    ["categories", "[\"sponsor\",\"selfpromo\",\"interaction\",\"music_offtopic\"]"],
    ["actionTypes", "[\"skip\"]"]
  ])
  assert.deepStrictEqual(JSON.parse(pairs[0][1]), HIDDEN)
})

test("config: two ids in the same bucket make the same request", function() {
  var random = makeRandom(2)
  var byPrefix = new Map()
  var found = 0
  for (var i = 0; i < 4000 && found < 5; i++) {
    var id = randomId(random)
    var text = Segments.config(id)
    if (byPrefix.has(text) && byPrefix.get(text) !== id) found++
    byPrefix.set(text, id)
  }
  // Each request text stands for a whole bucket, so ids had to collide.
  assert.strictEqual(found, 5)
})

test("reply: exactly the body of a found answer, and nothing for any other status", function() {
  var random = makeRandom(3)
  var pieces = ["[", "]", "{", "}", "\"", ",", ":", "0", "200", "404", "\n", "\n200\n", "\n404\n", " ", "a"]
  for (var i = 0; i < 2000; i++) {
    var body = ""
    var length = random(12)
    for (var j = 0; j < length; j++) body += pieces[random(pieces.length)]
    assert.strictEqual(Segments.reply({ ok: true, stdout: body + "\n200\n" }), body, JSON.stringify(body))
    assert.strictEqual(Segments.reply({ ok: false, stdout: body + "\n200\n" }), "", JSON.stringify(body))
  }
  for (var code = 0; code <= 999; code++) {
    var digits = ("00" + code).slice(-3)
    var expected = code === 200 ? "[]" : ""
    assert.strictEqual(Segments.reply({ ok: true, stdout: "[]\n" + digits + "\n" }), expected, digits)
  }
})

test("reply: output beyond the limit is not an answer", function() {
  var tail = "\n200\n"
  var longest = " ".repeat(Segments.MAX_BYTES - tail.length)
  assert.strictEqual(Segments.reply({ ok: true, stdout: longest + tail }), longest)
  assert.strictEqual(Segments.reply({ ok: true, stdout: longest + " " + tail }), "")
  // An inherited result is no result.
  assert.strictEqual(Segments.reply(Object.create({ ok: true, stdout: "[]\n200\n" })), "")
})

test("the request and the reading of its answer fit together", function() {
  var segments = [seg(60, 80, "sponsor", 600)]
  var output = answer(segments) + "\n200\n"
  var body = Segments.reply({ ok: true, error: "", exitCode: 0, stdout: output, stderr: "", durationMs: 250 })
  assert.deepStrictEqual(Segments.pick(body, ID, 600, false), [
    { start: 60, end: 80, category: "sponsor", toEnd: false }
  ])
  // "Not found" is how the service says that a bucket has no segments.
  var notFound = { ok: true, error: "", exitCode: 0, stdout: "[]\n404\n", stderr: "", durationMs: 90 }
  var none = Segments.reply(notFound)
  assert.deepStrictEqual(Segments.pick(none, ID, 600, false), [])
})

// ---- Reading an answer ----

test("pick: agrees with a second statement of the rules on random answers", function() {
  var random = makeRandom(4)
  var durations = [30, 95.5, 600, 3600]
  var kept = 0
  for (var i = 0; i < 6000; i++) {
    var duration = durations[random(durations.length)]
    var hidden = random(2) === 0
    var text = randomAnswer(random, duration)
    var picked = Segments.pick(text, ID, duration, hidden)
    assertSound(picked, duration, hidden, text)
    assert.deepStrictEqual(picked, model(text, ID, duration, hidden), text)
    if (picked.length > 0) kept++
  }
  // The generator has to produce both outcomes often for this to mean anything.
  assert.ok(kept > 1500 && kept < 5500, "kept " + kept)
})

test("pick: agrees with the second statement where the rules meet, on tracks of every length", function() {
  var random = makeRandom(11)
  var durations = [1.25, 2, 2.5, 4, 5, 8, 10, 12.5, 30, 95.5, 600]
  var seen = { kept: 0, refused: 0, toEnd: 0, cut: 0 }
  for (var i = 0; i < 12000; i++) {
    var duration = durations[i % durations.length]
    var hidden = random(2) === 0
    var text = edgeAnswer(random, duration)
    var picked = Segments.pick(text, ID, duration, hidden)
    assertSound(picked, duration, hidden, text)
    assert.deepStrictEqual(picked, model(text, ID, duration, hidden), duration + " " + text)
    if (picked.length === 0) seen.refused++
    else seen.kept++
    if (picked.length > 0 && picked[picked.length - 1].toEnd) seen.toEnd++
    if (picked.length > 0 && picked[picked.length - 1].end === duration) seen.cut++
  }
  // Every outcome has to come up often for this to mean anything.
  assert.ok(seen.kept > 2000 && seen.refused > 2000, JSON.stringify(seen))
  assert.ok(seen.toEnd > 1000 && seen.cut > 300, JSON.stringify(seen))
})

test("pick: the order of the segments in the answer does not matter", function() {
  var random = makeRandom(5)
  for (var i = 0; i < 1500; i++) {
    var videos = JSON.parse(randomAnswer(random, 600))
    var segments = []
    videos.forEach(function(video) {
      if (video.videoID === ID && Array.isArray(video.segments)) segments = segments.concat(video.segments)
    })
    // All of them have to be looked at for the order not to matter.
    segments = segments.slice(0, MAX_SEGMENTS)
    var shuffled = segments.slice()
    for (var j = shuffled.length - 1; j > 0; j--) {
      var k = random(j + 1)
      var held = shuffled[j]
      shuffled[j] = shuffled[k]
      shuffled[k] = held
    }
    var hidden = random(2) === 0
    var expected = Segments.pick(answer(segments), ID, 600, hidden)
    assert.deepStrictEqual(Segments.pick(answer(shuffled), ID, 600, hidden), expected)
    assert.deepStrictEqual(Segments.pick(answer(shuffled.slice().reverse()), ID, 600, hidden), expected)
  }
})

test("pick: showing the picture can only take stretches away", function() {
  var random = makeRandom(6)
  for (var i = 0; i < 1500; i++) {
    var text = randomAnswer(random, 600)
    var hidden = Segments.pick(text, ID, 600, true)
    var shown = Segments.pick(text, ID, 600, false)
    shown.forEach(function(stretch) {
      assert.notStrictEqual(stretch.category, "music_offtopic")
      if (hidden.length === 0) return
      // Unless the longer list was ignored whole, it covers the shorter one.
      var covers = function(wide) { return wide.start <= stretch.start && wide.end >= stretch.end }
      assert.ok(hidden.some(covers), text)
    })
  }
})

test("pick: a fresh list of fresh objects on every call", function() {
  var text = answer([seg(60, 80, "sponsor", 600), seg(300, 330, "selfpromo", 600)])
  var first = Segments.pick(text, ID, 600, false)
  var second = Segments.pick(text, ID, 600, false)
  assert.deepStrictEqual(first, second)
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first[0], second[0])
  first[0].end = 599
  first[0].category = "changed"
  first.push({ start: 0, end: 600, category: "sponsor", toEnd: true })
  assert.deepStrictEqual(Segments.pick(text, ID, 600, false), second)
  second.forEach(function(stretch) { assert.strictEqual(Object.getPrototypeOf(stretch), Object.prototype) })
  // An empty result is not a shared object either.
  var none = Segments.pick("[]", ID, 600, false)
  none.push({ start: 0, end: 600, category: "sponsor", toEnd: true })
  assert.deepStrictEqual(Segments.pick("[]", ID, 600, false), [])
})

test("pick: a start is never a negative zero, a category is one of the module's own", function() {
  var picked = Segments.pick("[{\"videoID\":\"" + ID + "\",\"segments\":[{\"category\":\"sponsor\","
    + "\"actionType\":\"skip\",\"segment\":[-0,20],\"videoDuration\":600}]}]", ID, 600, false)
  assert.strictEqual(picked.length, 1)
  assert.strictEqual(Object.is(picked[0].start, 0), true)
  assert.strictEqual(typeof picked[0].category, "string")
  HIDDEN.forEach(function(category) {
    var one = Segments.pick(answer([seg(60, 80, category, 600)]), ID, 600, true)
    assert.strictEqual(one[0].category, category)
  })
})

test("pick: stale by more than two seconds either way, at every track length", function() {
  var durations = [30, 600, 172800]
  durations.forEach(function(duration) {
    for (var offset = -5; offset <= 5; offset += 0.25) {
      var picked = Segments.pick(answer([seg(10, 20, "sponsor", duration + offset)]), ID, duration, false)
      assert.strictEqual(picked.length, Math.abs(offset) <= 2 ? 1 : 0, duration + " and " + offset)
    }
  })
})

test("pick: four fifths of the track at most, at every track length", function() {
  // Lengths whose four fifths are exact, so that the boundary itself is tested.
  var durations = [5, 10, 30, 47.5, 100, 335, 600, 1000, 3600, 7205, 86400, 172800]
  durations.forEach(function(duration) {
    var allowed = duration * 4 / 5
    var most = Segments.pick(answer([seg(0, allowed, "sponsor", duration)]), ID, duration, false)
    // On the shortest of these tracks four fifths from the start come
    // within a second of the end, and then the whole track would be lost.
    assert.strictEqual(most.length, allowed < duration - 1 ? 1 : 0, String(duration))
    var more = Segments.pick(answer([seg(0, allowed + 0.001, "sponsor", duration)]), ID, duration, false)
    assert.deepStrictEqual(more, [], String(duration))
    // The same share at the other end: a stretch that reaches the end of
    // the track takes everything from its start on.
    var late = duration - allowed
    var tail = Segments.pick(answer([seg(late, duration - 0.5, "sponsor", duration)]), ID, duration, false)
    assert.deepStrictEqual(tail, [{ start: late, end: duration - 0.5, category: "sponsor", toEnd: true }])
    var sooner = [seg(late - 0.001, duration - 0.5, "sponsor", duration)]
    assert.deepStrictEqual(Segments.pick(answer(sooner), ID, duration, false), [], String(duration))
    // The same share in two halves with other segments on top of them.
    var half = allowed / 2
    var split = [
      seg(0, half, "sponsor", duration), seg(duration - half, duration, "selfpromo", duration),
      seg(0, half, "interaction", duration)
    ]
    assert.strictEqual(Segments.pick(answer(split), ID, duration, false).length, 2, String(duration))
    split.push(seg(half, half + 1.001, "sponsor", duration))
    assert.deepStrictEqual(Segments.pick(answer(split), ID, duration, false), [], String(duration))
  })
})

test("pick: only what the answer itself carries is read", function() {
  var names = ["videoID", "segments", "category", "actionType", "segment", "videoDuration"]
  var planted = {
    videoID: ID, segments: [seg(60, 80, "sponsor", 600)], category: "sponsor", actionType: "skip",
    segment: [60, 80], videoDuration: 600
  }
  var texts = [
    "[{}]",
    "[{\"videoID\":\"" + ID + "\"}]",
    "[{\"segments\":[{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,80],"
      + "\"videoDuration\":600}]}]",
    "[{\"videoID\":\"" + ID + "\",\"segments\":[{}]}]",
    "[{\"videoID\":\"" + ID + "\",\"segments\":[{\"segment\":[60,80],\"videoDuration\":600}]}]",
    "[{\"videoID\":\"" + ID + "\",\"segments\":[{\"category\":\"sponsor\",\"actionType\":\"skip\"}]}]",
    // One field missing at a time, the others the segment's own.
    "[{\"videoID\":\"" + ID + "\",\"segments\":[{\"actionType\":\"skip\",\"segment\":[60,80],"
      + "\"videoDuration\":600}]}]",
    "[{\"videoID\":\"" + ID + "\",\"segments\":[{\"category\":\"sponsor\",\"segment\":[60,80],"
      + "\"videoDuration\":600}]}]",
    "[{\"videoID\":\"" + ID + "\",\"segments\":[{\"category\":\"sponsor\",\"actionType\":\"skip\","
      + "\"videoDuration\":600}]}]",
    "[{\"videoID\":\"" + ID + "\",\"segments\":[{\"category\":\"sponsor\",\"actionType\":\"skip\","
      + "\"segment\":[60,80]}]}]"
  ]
  // Every object of every answer now seems to have all the fields.
  names.forEach(function(name) {
    var planting = { value: planted[name], configurable: true, writable: true }
    Object.defineProperty(Object.prototype, name, planting)
  })
  var results
  try {
    results = texts.map(function(text) { return Segments.pick(text, ID, 600, false) })
  } finally {
    names.forEach(function(name) { delete Object.prototype[name] })
  }
  results.forEach(function(picked, i) { assert.deepStrictEqual(picked, [], texts[i]) })
  assert.strictEqual(({}).videoID, undefined)
})

test("pick: the limits on videos and on segments", function() {
  var others = []
  for (var i = 0; i < MAX_VIDEOS - 1; i++) others.push({ videoID: OTHER, segments: [] })
  var ours = { videoID: ID, segments: [seg(60, 80, "sponsor", 600)] }
  assert.strictEqual(Segments.pick(JSON.stringify(others.concat([ours])), ID, 600, false).length, 1)
  assert.strictEqual(Segments.pick(JSON.stringify([ours].concat(others)), ID, 600, false).length, 1)
  var tooMany = JSON.stringify(others.concat([ours, { videoID: OTHER, segments: [] }]))
  assert.deepStrictEqual(Segments.pick(tooMany, ID, 600, false), [])

  // A hundred sound segments in, a hundred stretches out, and the next one unread.
  var many = []
  for (var j = 0; j < 150; j++) many.push(seg(j * 4, j * 4 + 1, "sponsor", 3600))
  var picked = Segments.pick(answer(many), ID, 3600, false)
  assert.strictEqual(picked.length, MAX_SEGMENTS)
  assert.strictEqual(picked[MAX_SEGMENTS - 1].start, (MAX_SEGMENTS - 1) * 4)
})

test("pick: an answer is refused by its size before anything is parsed", function() {
  var text = answer([seg(60, 80, "sponsor", 600)])
  var atLimit = text + " ".repeat(Segments.MAX_BYTES - text.length)
  assert.strictEqual(Segments.pick(atLimit, ID, 600, false).length, 1)
  assert.deepStrictEqual(Segments.pick(atLimit + " ", ID, 600, false), [])
  var huge = "[" + "0,".repeat(8000000) + "0]"
  var ms = elapsedMs(function() {
    assert.deepStrictEqual(Segments.pick(huge, ID, 600, false), [])
  })
  assert.ok(ms < 200, "took " + Math.round(ms) + " ms")
})

// ---- Playback ----

test("a hostile list leaves playback untouched", function() {
  var tiny = []
  var backwards = []
  var negative = []
  var beyond = []
  for (var i = 0; i < 5000; i++) {
    tiny.push(seg(i / 10, i / 10 + 0.05, "sponsor", 600))
    backwards.push(seg(i / 10 + 5, i / 10, "sponsor", 600))
    negative.push(seg(-i - 20, -i, "sponsor", 600))
    beyond.push(seg(600 + i, 700 + i, "sponsor", 600))
  }
  var raw = function(span) {
    return "[{\"videoID\":\"" + ID + "\",\"segments\":[{\"category\":\"sponsor\",\"actionType\":\"skip\","
      + "\"segment\":" + span + ",\"videoDuration\":600}]}]"
  }
  var answers = {
    "thousands of tiny segments": answer(tiny),
    "thousands of segments that end before they start": answer(backwards),
    "thousands of segments before the start": answer(negative),
    "thousands of segments after the end": answer(beyond),
    "the whole track": answer([seg(0, 600, "sponsor", 600)]),
    "the whole track in pieces": answer([seg(0, 200, "sponsor", 600), seg(200, 400, "selfpromo", 600),
      seg(400, 600, "interaction", 600)]),
    "the whole track twice over": answer([seg(0, 350, "sponsor", 600), seg(250, 600, "sponsor", 600)]),
    "all but the first second": answer([seg(1, 600, "sponsor", 600)]),
    "not a number": raw("[NaN,80]"),
    "not a number at the end": raw("[60,NaN]"),
    "infinity": raw("[60,1e999]"),
    "minus infinity": raw("[-1e999,80]"),
    "text for numbers": raw("[\"60\",\"80\"]"),
    "nothing for numbers": raw("[null,null]"),
    "another video's length": answer([seg(60, 80, "sponsor", 6000)]),
    "a category that is a prototype member": answer([seg(60, 80, "constructor", 600)]),
    "too many videos": JSON.stringify(new Array(MAX_VIDEOS + 1).fill({ videoID: ID,
      segments: [seg(60, 80, "sponsor", 600)] })),
    "not an answer": "<html>",
    "nothing": ""
  }
  Object.keys(answers).forEach(function(name) {
    var picked = Segments.pick(answers[name], ID, 600, true)
    assert.deepStrictEqual(picked, [], name)
    var run = play(picked, 600)
    assert.deepStrictEqual(run.seeks, [], name)
    assert.strictEqual(run.advanced, false, name)
    assert.strictEqual(Segments.pending(0, picked, []), false, name)
  })
})

test("whatever the answer, at least a fifth of the track is played", function() {
  var random = makeRandom(12)
  var durations = [1.25, 2, 2.5, 4, 5, 8, 10, 12.5, 30, 95.5, 600]
  var skipped = 0
  var ended = 0
  for (var i = 0; i < 6000; i++) {
    var duration = durations[i % durations.length]
    var text = i % 3 === 0 ? randomAnswer(random, duration) : edgeAnswer(random, duration)
    var picked = Segments.pick(text, ID, duration, true)
    var run = playExact(picked, duration)
    // Every stretch is acted on: none is too short for a skip to start in it.
    assert.strictEqual(run.seeks + (run.advanced ? 1 : 0), picked.length, duration + " " + text)
    assert.ok(run.played * 5 >= duration, duration + " s track, " + run.played + " s played: " + text)
    if (picked.length > 0) skipped++
    if (run.advanced) ended++
  }
  assert.ok(skipped > 1500 && ended > 500, "skipped " + skipped + ", ended " + ended)
  // The plainest case: one segment from the start to a second before the end.
  durations.forEach(function(length) {
    var whole = Segments.pick(answer([seg(0, length - 1, "sponsor", length)]), ID, length, false)
    assert.ok(playExact(whole, length).played * 5 >= length, String(length))
  })
})

test("playback skips each stretch once, forwards, and reaches the end", function() {
  var random = makeRandom(7)
  var played = 0
  for (var i = 0; i < 300; i++) {
    var duration = [30, 95.5, 600][random(3)]
    var picked = Segments.pick(randomAnswer(random, duration), ID, duration, true)
    if (picked.length === 0) continue
    played++
    var run = play(picked, duration)
    // One action for each stretch playback runs into, in order, each to
    // its own end. A stretch that reaches the end of the track ends it.
    var expected = picked.filter(function(stretch) { return stretch.end - stretch.start > EDGE })
    assert.strictEqual(run.seeks.length, expected.length)
    run.seeks.forEach(function(seek, j) {
      assert.strictEqual(seek.to, expected[j].end)
      assert.ok(seek.from >= expected[j].start && seek.from < expected[j].start + TICK)
      assert.deepStrictEqual(seek.skip, {
        category: expected[j].category, from: expected[j].start, to: expected[j].end
      })
      if (j > 0) assert.ok(seek.from >= run.seeks[j - 1].to)
    })
    assert.strictEqual(run.advanced, expected.length > 0 && expected[expected.length - 1].toEnd)
  }
  assert.ok(played > 100, "played " + played)
})

test("a seek that lands short of its target is not answered with another seek", function() {
  var text = answer([seg(60, 80, "sponsor", 600), seg(300, 330, "selfpromo", 600)])
  var picked = Segments.pick(text, ID, 600, false)
  var shortfalls = [0, 0.09, 0.3, 0.49, 0.5, 0.51, 0.7, 1, 3, 10, 19.9]
  shortfalls.forEach(function(landShort) {
    var run = play(picked, 600, { landShort: landShort })
    assert.strictEqual(run.seeks.length, 2, String(landShort))
    assert.strictEqual(run.seeks[0].to, 80)
    assert.strictEqual(run.seeks[1].to, 330)
  })
})

test("seeking back to before a stretch skips it again, seeking back into it plays it", function() {
  var picked = Segments.pick(answer([seg(60, 80, "sponsor", 600)]), ID, 600, false)
  var before = play(picked, 600, { userSeeks: [{ at: 100, to: 30 }] })
  assert.deepStrictEqual(before.seeks.map(function(seek) { return seek.to }), [80, 80])
  var inside = play(picked, 600, { userSeeks: [{ at: 100, to: 70 }] })
  assert.deepStrictEqual(inside.seeks.map(function(seek) { return seek.to }), [80])
  var atStart = play(picked, 600, { userSeeks: [{ at: 100, to: 60 }] })
  assert.deepStrictEqual(atStart.seeks.map(function(seek) { return seek.to }), [80])
  var twice = play(picked, 600, { userSeeks: [{ at: 100, to: 0 }, { at: 200, to: 59.9 }] })
  assert.deepStrictEqual(twice.seeks.map(function(seek) { return seek.to }), [80, 80, 80])
})

test("no list, however it was made, sends playback backwards or seeks without end", function() {
  var random = makeRandom(8)
  var categories = HIDDEN.concat(["constructor", 7])
  for (var i = 0; i < 400; i++) {
    // Lists as pick() would never make them: unsorted, overlapping, nested,
    // with entries that are not stretches at all.
    var list = []
    var size = random(40)
    var far = [172800.5, 1e6, 1e300]
    for (var j = 0; j < size; j++) {
      var start = random(1200) / 2 - 20
      var entry = {
        start: start,
        // Now and then an end that lies beyond any track.
        end: random(12) === 0 ? far[random(far.length)] : start + random(400) / 2 - 10,
        category: categories[random(categories.length)],
        toEnd: random(10) === 0
      }
      list.push(random(15) === 0 ? null : entry)
    }
    var userSeeks = []
    for (var k = 0; k < 3; k++) userSeeks.push({ at: 100 + k * 150, to: random(600) })
    var run = play(list, 600, { landShort: random(3), userSeeks: userSeeks })
    // Every action is a move forward, so between two moves of the user
    // each entry can act once at most.
    assert.ok(run.seeks.length <= size * (userSeeks.length + 1), "seeks " + run.seeks.length)
    run.seeks.forEach(function(seek) {
      assert.ok(seek.to > seek.from)
      assert.ok(seek.to <= Const.LIMITS.durationSeconds, "a seek to " + seek.to)
    })
  }
})

test("next: nothing passed in is changed, and the marks come back as a new list", function() {
  var text = answer([seg(60, 80, "sponsor", 600), seg(300, 330, "selfpromo", 600)])
  var segments = Segments.pick(text, ID, 600, false)
  var fired = [false, true]
  var frozenSegments = Object.freeze(segments.map(Object.freeze))
  var frozenFired = Object.freeze(fired.slice())
  var positions = [0, 60, 70, 79.9, 200, 310, 599]
  positions.forEach(function(pos) {
    var step = Segments.next(pos, frozenSegments, frozenFired)
    assert.notStrictEqual(step.fired, frozenFired)
    assert.deepStrictEqual(Object.keys(step), ["action", "to", "skip", "fired"])
    assert.strictEqual(step.fired.length, 2)
    step.fired.forEach(function(mark) { assert.strictEqual(typeof mark, "boolean") })
    if (step.skip !== null) assert.deepStrictEqual(Object.keys(step.skip), ["category", "from", "to"])
    Segments.pending(pos, frozenSegments, frozenFired)
  })
  assert.deepStrictEqual(frozenFired, fired)
  assert.strictEqual(Segments.next(70, frozenSegments, []).action, "seek")
})

test("next and pending: only what a list entry itself carries is read", function() {
  var inherited = Object.create({ start: 10, end: 20, category: "sponsor", toEnd: false })
  var idle = { action: "none", to: 0, skip: null, fired: [false] }
  assert.deepStrictEqual(Segments.next(15, [inherited], []), idle)
  assert.strictEqual(Segments.pending(0, [inherited], []), false)
  var keys = ["start", "end", "category"]
  keys.forEach(function(missing) {
    var own = { start: 10, end: 20, category: "sponsor", toEnd: false }
    var parent = {}
    parent[missing] = own[missing]
    var entry = Object.create(parent)
    keys.forEach(function(key) { if (key !== missing) entry[key] = own[key] })
    assert.strictEqual(Segments.next(15, [entry], []).action, "none", missing)
    assert.strictEqual(Segments.pending(0, [entry], []), false, missing)
  })
  // An inherited flag does not turn a seek into the end of the track.
  var flagged = Object.create({ toEnd: true })
  flagged.start = 10
  flagged.end = 20
  flagged.category = "sponsor"
  assert.strictEqual(Segments.next(15, [flagged], []).action, "seek")
})

test("pending: false only when nothing can fire from here on", function() {
  var random = makeRandom(9)
  for (var i = 0; i < 400; i++) {
    var picked = Segments.pick(randomAnswer(random, 600), ID, 600, true)
    var fired = picked.map(function() { return random(3) === 0 })
    var from = random(1200) / 2
    var acted = false
    var marks = fired
    // No window in which a stretch can fire is shorter than this step.
    for (var pos = from; pos < 600; pos += 0.2) {
      var step = Segments.next(pos, picked, marks)
      marks = step.fired
      if (step.action !== "none") {
        acted = true
        break
      }
    }
    var stillPending = Segments.pending(from, picked, fired)
    // Whenever something fired later, the question was answered with yes.
    if (acted) assert.strictEqual(stillPending, true, from + " " + JSON.stringify(picked))
    // And a yes names a stretch that is still in front or under the position.
    if (stillPending) {
      assert.ok(picked.some(function(stretch) { return from < stretch.end - EDGE }))
    }
  }
})

test("pending: yes exactly as long as playing on makes something fire", function() {
  var random = makeRandom(13)
  var categories = HIDDEN.concat(["constructor"])
  var answers = { yes: 0, no: 0 }
  function check(list, until, label) {
    for (var n = 0; n < 6; n++) {
      var fired = list.map(function() { return random(3) === 0 })
      var from = random(until / EIGHTH) * EIGHTH
      var expected = firesFrom(from, list, fired, until)
      assert.strictEqual(Segments.pending(from, list, fired), expected, from + " " + label)
      answers[expected ? "yes" : "no"]++
    }
  }
  // Lists as pick() makes them, on short tracks, where the end is never far.
  var durations = [2.5, 5, 10, 30]
  for (var i = 0; i < 1500; i++) {
    var duration = durations[i % durations.length]
    var picked = Segments.pick(edgeAnswer(random, duration), ID, duration, true)
    check(picked, duration + 2, JSON.stringify(picked))
  }
  // And lists nobody picked, with entries too short to act on among them.
  for (var j = 0; j < 1500; j++) {
    var list = []
    var size = random(6)
    for (var k = 0; k < size; k++) {
      var start = random(160) * EIGHTH
      var entry = {
        start: start,
        end: start + random(17) * EIGHTH,
        category: categories[random(categories.length)],
        toEnd: random(4) === 0
      }
      list.push(random(12) === 0 ? null : entry)
    }
    check(list, 24, JSON.stringify(list))
  }
  assert.ok(answers.yes > 3000 && answers.no > 3000, JSON.stringify(answers))
})

// ---- Spacing and the breaker ----

test("mayAct: never two automatic seeks within half a second", function() {
  // A list of one-second stretches a tenth of a second apart, each of
  // which wants a seek as soon as the last one has landed.
  var list = []
  for (var i = 0; i < 100; i++) {
    list.push({ start: i * 1.1, end: i * 1.1 + 1, category: "sponsor", toEnd: false })
  }
  var fired = []
  var pos = 0
  var now = 1700000000000
  var last = 0
  var times = []
  for (var tick = 0; tick < 4000 && pos < 120; tick++) {
    var step = Segments.next(pos, list, fired)
    if (step.action === "seek" && Segments.mayAct(now, last)) {
      fired = step.fired
      last = now
      times.push(now)
      pos = step.to
    } else {
      // Either nothing to do, or too soon: the marks are left as they were.
      pos += TICK
    }
    now += 90
  }
  assert.ok(times.length > 20, "seeks " + times.length)
  for (var j = 1; j < times.length; j++) {
    assert.ok(times[j] - times[j - 1] >= Segments.SEEK_GAP_MS)
  }
})

test("the breaker trips after three tracks cut short in a row and stays tripped", function() {
  // Autoplay runs into tracks whose lists end them a few seconds in.
  var count = 0
  var skippedTracks = 0
  for (var track = 0; track < 50; track++) {
    if (Segments.tripped(count)) {
      // Skipping is off: the track plays through and ends by itself.
      count = Segments.cascade(count, false, 200000)
      continue
    }
    skippedTracks++
    count = Segments.cascade(count, true, 4000)
  }
  assert.strictEqual(skippedTracks, 3)
  assert.strictEqual(Segments.tripped(count), true)
  // The user does something: the caller starts counting again.
  count = 0
  assert.strictEqual(Segments.tripped(count), false)
})

test("the breaker counts only an unbroken run", function() {
  var random = makeRandom(10)
  var count = 0
  var run = 0
  for (var i = 0; i < 5000; i++) {
    var skipped = random(3) !== 0
    var elapsed = random(4) === 0 ? 10001 + random(100000) : random(10001)
    var early = skipped && elapsed <= 10000
    var wasTripped = Segments.tripped(count)
    count = Segments.cascade(count, skipped, elapsed)
    if (wasTripped) {
      assert.strictEqual(Segments.tripped(count), true)
      // The user steps in now and then.
      if (random(5) === 0) {
        count = 0
        run = 0
      }
      continue
    }
    run = early ? run + 1 : 0
    assert.strictEqual(count, run)
    assert.strictEqual(Segments.tripped(count), run >= 3)
    assert.ok(count >= 0 && count <= 3)
  }
})

// ---- Hostile arguments and time ----

test("no argument makes a function throw", function() {
  var text = answer([seg(60, 80, "sponsor", 600)])
  var list = Segments.pick(text, ID, 600, false)
  ODD.forEach(function(value) {
    assert.deepStrictEqual(Segments.argv(value), [])
    if (value !== ID) assert.strictEqual(Segments.config(value), "")
    assert.strictEqual(Segments.reply(value), "")
    assert.strictEqual(Segments.reply({ ok: value, stdout: value }), "")
    assert.strictEqual(Segments.reply({ ok: true, stdout: value }), "")
    assert.deepStrictEqual(Segments.pick(value, value, value, value), [])
    assert.deepStrictEqual(Segments.pick(value, ID, 600, false), [])
    if (value !== ID) assert.deepStrictEqual(Segments.pick(text, value, 600, false), [])
    assert.deepStrictEqual(Segments.pick(text, ID, value, false), [])
    assert.strictEqual(Segments.pick(text, ID, 600, value).length, 1)
    assert.strictEqual(Segments.next(value, value, value).action, "none")
    // One mark per entry of a list, and none for what is not a list.
    var marks = Array.isArray(value) ? value.map(function() { return false }) : []
    var idle = { action: "none", to: 0, skip: null, fired: marks }
    assert.deepStrictEqual(Segments.next(70, value, value), idle)
    assert.strictEqual(Segments.next(70, [value, value], value).action, "none")
    assert.strictEqual(Segments.next(value, list, value).action, "none")
    assert.strictEqual(Segments.next(70, list, value).action, "seek")
    assert.strictEqual(Segments.pending(value, value, value), false)
    assert.strictEqual(Segments.pending(70, [value], value), false)
    assert.strictEqual(typeof Segments.pending(70, list, value), "boolean")
    assert.strictEqual(typeof Segments.mayAct(value, value), "boolean")
    assert.strictEqual(typeof Segments.tripped(value), "boolean")
    assert.strictEqual(typeof Segments.cascade(value, value, value), "number")
    assert.strictEqual(typeof Segments.cascade(1, true, value), "number")
  })
  assert.deepStrictEqual(Segments.argv(), [])
  assert.strictEqual(Segments.config(), "")
  assert.strictEqual(Segments.reply(), "")
  assert.deepStrictEqual(Segments.pick(), [])
  assert.strictEqual(Segments.next().action, "none")
  assert.strictEqual(Segments.pending(), false)
  assert.strictEqual(Segments.mayAct(), false)
  assert.strictEqual(Segments.tripped(), true)
  assert.strictEqual(Segments.cascade(), 3)
})

test("values inside an answer never make pick throw", function() {
  var values = [null, 0, -1, 1e300, true, "", "skip", "sponsor", [], [60, 80], {}, { segment: [60, 80] }]
  var keys = ["category", "actionType", "segment", "videoDuration"]
  values.forEach(function(value) {
    keys.forEach(function(key) {
      var raw = seg(60, 80, "sponsor", 600)
      raw[key] = value
      var picked = Segments.pick(answer([raw, seg(300, 330, "selfpromo", 600)]), ID, 600, false)
      assertSound(picked, 600, false, key + " " + JSON.stringify(value))
      assert.ok(picked.length >= 1)
    })
    var shapes = [
      value, [value], [{ videoID: value, segments: value }], [{ videoID: ID, segments: value }],
      [{ videoID: ID, segments: [value] }]
    ]
    shapes.forEach(function(shape) {
      assert.deepStrictEqual(Segments.pick(JSON.stringify(shape), ID, 600, false), [])
    })
  })
})

test("no answer and no list makes the functions slow", function() {
  var size = Segments.MAX_BYTES
  var full = []
  for (var i = 0; i < 9000; i++) full.push(seg(i * 2, i * 2 + 1.5, "sponsor", 172800))
  var same = []
  for (var j = 0; j < 9000; j++) same.push(seg(60, 80, "sponsor", 600))
  var videos = []
  for (var k = 0; k < MAX_VIDEOS; k++) videos.push({ videoID: ID, segments: [seg(k, k + 1, "sponsor", 600)] })
  var answers = [
    "[".repeat(size), "[{".repeat(size / 2), "{\"a\":".repeat(size / 5),
    "[" + "0,".repeat(size / 2 - 2) + "0]", "\"" + "a".repeat(size - 2) + "\"", " ".repeat(size),
    "[" + "[],".repeat(size / 3 - 1) + "[]]",
    "[" + "1e999,".repeat(size / 6 - 1) + "0]", "\\".repeat(size), "\u00e9".repeat(size),
    answer(full), answer(same), JSON.stringify(videos),
    "[".repeat(5000) + "]".repeat(5000)
  ]
  answers.forEach(function(text, n) {
    assert.ok(text.length <= size, "answer " + n + " is " + text.length + " long")
    var ms = elapsedMs(function() {
      assertSound(Segments.pick(text, ID, 172800, true), 172800, true, "answer " + n)
      Segments.pick(text, ID, 600, false)
      Segments.reply({ ok: true, stdout: text })
    })
    assert.ok(ms < 2000, "answer " + n + " took " + Math.round(ms) + " ms")
  })
  var long = new Array(1000000).fill({ start: 10, end: 20, category: "sponsor", toEnd: false })
  var listMs = elapsedMs(function() {
    for (var n = 0; n < 1000; n++) {
      assert.strictEqual(Segments.next(15, long, long).action, "none")
      assert.strictEqual(Segments.pending(15, long, long), false)
    }
  })
  assert.ok(listMs < 2000, "lists took " + Math.round(listMs) + " ms")
  // A full list, asked about at every position of a long track.
  var picked = Segments.pick(answer(full), ID, 172800, true)
  assert.strictEqual(picked.length, MAX_SEGMENTS)
  var playMs = elapsedMs(function() { play(picked, 400) })
  assert.ok(playMs < 2000, "playback took " + Math.round(playMs) + " ms")
})
