"use strict"
// Tests for lib/Thumbs.js beyond its vector table: properties that hold for
// any input (the transfer list names our host and our files only, the report
// reader sorts every position into exactly one of its two lists and never
// throws), and the eviction rule over its whole range. The exact command
// line is in argv-yt.test.js; single cases are in tests/vectors/thumbs.js.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")

var Thumbs = load.lib("Thumbs")
var Const = load.lib("Const")
var Ids = load.lib("Ids")
var Paths = load.lib("Paths")

var paths = Paths.resolve({
  XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
})
var DIR = "/run/user/1000/omajuke/thumbs"
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"

// A small repeatable generator, so that a failure can be reproduced.
function generator(seed) {
  var state = seed
  return function(below) {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor(state / 2147483648 * below)
  }
}

function randomId(next) {
  var id = ""
  for (var i = 0; i < 11; i++) id += ALPHABET.charAt(next(ALPHABET.length))
  return id
}

function batch(next, size) {
  var items = []
  var seen = {}
  while (items.length < size) {
    var id = randomId(next)
    if (seen[id]) continue
    seen[id] = true
    items.push({ id: id, n: items.length * 7 + 1 + next(5) })
  }
  return items
}

// The transfers of a config text, read back the way curl pairs them.
function transfers(text) {
  var lines = text.split("\n")
  assert.strictEqual(lines.pop(), "", "the text ends with a line break")
  assert.strictEqual(lines.length % 2, 0, "two lines per transfer")
  var found = []
  for (var i = 0; i < lines.length; i += 2) {
    var url = /^url = "([^"\\]*)"$/.exec(lines[i])
    var output = /^output = "([^"\\]*)"$/.exec(lines[i + 1])
    assert.ok(url && output, "line " + i + " is not a plain quoted pair")
    found.push({ url: url[1], output: output[1] })
  }
  return found
}

function okLine(position) {
  return position + " 200 0 17000 image/jpeg\n"
}

// ---- config ----

test("config: two lines per item, the address from the id and the file from the counter", function() {
  var text = Thumbs.config(paths, [{ id: "AAAAAAAAAAA", n: 1 }, { id: "BBBBBBBBBBB", n: 12 }])
  assert.strictEqual(text,
    "url = \"https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg\"\n"
    + "output = \"/run/user/1000/omajuke/thumbs/1.jpg\"\n"
    + "url = \"https://i.ytimg.com/vi/BBBBBBBBBBB/mqdefault.jpg\"\n"
    + "output = \"/run/user/1000/omajuke/thumbs/12.jpg\"\n")
})

test("config: the address is the one Ids builds, the file the one Paths names and owns", function() {
  var next = generator(7)
  for (var round = 0; round < 200; round++) {
    var items = batch(next, 1 + next(Const.LIMITS.thumbBatch))
    var found = transfers(Thumbs.config(paths, items))
    assert.strictEqual(found.length, items.length)
    found.forEach(function(transfer, i) {
      assert.strictEqual(transfer.url, Ids.thumbUrl(items[i].id))
      assert.strictEqual(transfer.output, Paths.thumbFile(paths, items[i].n))
      assert.strictEqual(Paths.owns(paths, transfer.output), true)
    })
  }
})

test("every address is https to the one thumbnail host, whatever the items hold", function() {
  var next = generator(11)
  for (var round = 0; round < 200; round++) {
    var items = batch(next, 1 + next(Const.LIMITS.thumbBatch))
    // What an item might carry besides its id and counter is never used.
    items.forEach(function(item) {
      item.url = "http://example.invalid/" + item.id
      item.output = "/etc/" + item.id
      item.path = "../" + item.id
    })
    transfers(Thumbs.config(paths, items)).forEach(function(transfer) {
      assert.match(transfer.url, /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/)
      assert.match(transfer.output, /^\/run\/user\/1000\/omajuke\/thumbs\/[0-9]{1,10}\.jpg$/)
    })
  }
})

test("the id is in the address and nowhere else", function() {
  var next = generator(13)
  for (var round = 0; round < 100; round++) {
    var items = batch(next, 1 + next(Const.LIMITS.thumbBatch))
    transfers(Thumbs.config(paths, items)).forEach(function(transfer, i) {
      assert.strictEqual(transfer.output.indexOf(items[i].id), -1)
      assert.strictEqual(transfer.output.slice(0, DIR.length + 1), DIR + "/")
    })
  }
})

test("config: nothing curl reads specially can get between the quotes", function() {
  // curl's reader takes a backslash inside quotes as the start of an escape
  // and ends the value at the next quote; in an address it expands braces
  // and brackets, and in a file name "#1". None of them is in any text.
  var next = generator(17)
  for (var round = 0; round < 200; round++) {
    var text = Thumbs.config(paths, batch(next, 1 + next(Const.LIMITS.thumbBatch)))
    text.split("\n").forEach(function(line) {
      if (line === "") return
      var value = /^(?:url|output) = "(.*)"$/.exec(line)
      assert.ok(value, line)
      assert.ok(!/["\\{}\[\]#\s\u0000-\u001f\u007f-\uffff]/.test(value[1]), line)
    })
  }
})

test("config: one bad item refuses the whole batch, wherever it stands", function() {
  var bad = [
    null, undefined, "AAAAAAAAAAA", 5, [], {}, { id: "AAAAAAAAAAA" }, { n: 5 }, { id: "short", n: 5 },
    { id: "AAAAAAAAAAA", n: 0 }, { id: "AAAAAAAAAAA", n: "5" }, { id: "AAAAAAAAAAA", n: 2.5 },
    { id: "AAAAAAAAAA\n", n: 5 }, { id: "AAAAA\"AAAAA", n: 5 }, { id: "AAAAAAAAAAA", n: NaN },
    { id: "AAAAAAAAAAA", n: Infinity }, { id: { toString: function() { return "AAAAAAAAAAA" } }, n: 5 }
  ]
  var good = [{ id: "BBBBBBBBBBB", n: 1 }, { id: "CCCCCCCCCCC", n: 2 }, { id: "DDDDDDDDDDD", n: 3 }]
  assert.notStrictEqual(Thumbs.config(paths, good), "")
  bad.forEach(function(item, which) {
    for (var at = 0; at <= good.length; at++) {
      var items = good.slice(0, at).concat([item], good.slice(at))
      assert.strictEqual(Thumbs.config(paths, items), "", "bad item " + which + " at " + at)
    }
  })
})

test("config: a batch is one to twelve items", function() {
  var next = generator(19)
  assert.strictEqual(Thumbs.config(paths, []), "")
  for (var size = 1; size <= Const.LIMITS.thumbBatch; size++) {
    assert.strictEqual(transfers(Thumbs.config(paths, batch(next, size))).length, size)
  }
  assert.strictEqual(Thumbs.config(paths, batch(next, Const.LIMITS.thumbBatch + 1)), "")
  assert.strictEqual(Thumbs.config(paths, batch(next, 100)), "")
})

test("config: the same id or the same file twice is refused", function() {
  assert.strictEqual(Thumbs.config(paths, [{ id: "AAAAAAAAAAA", n: 1 }, { id: "AAAAAAAAAAA", n: 2 }]), "")
  assert.strictEqual(Thumbs.config(paths, [{ id: "AAAAAAAAAAA", n: 1 }, { id: "BBBBBBBBBBB", n: 1 }]), "")
})

test("config: needs resolved paths with a folder curl reads the way we wrote it", function() {
  var item = [{ id: "AAAAAAAAAAA", n: 1 }]
  var odd = [
    null, undefined, {}, { ok: false }, Paths.resolve({ HOME: "/home/user" }), { ok: true },
    { ok: true, thumbsDir: "" }, { ok: true, thumbsDir: "thumbs" }, { ok: true, thumbsDir: "/a b" },
    { ok: true, thumbsDir: "/a\"b" }, { ok: true, thumbsDir: "/a\\b" }, { ok: true, thumbsDir: "/a\nb" },
    { ok: true, thumbsDir: "/a'b" }, { ok: true, thumbsDir: "/a$b" }, { ok: true, thumbsDir: "/a#b" },
    { ok: true, thumbsDir: "/a%b" }, { ok: true, thumbsDir: ["/run"] }
  ]
  odd.forEach(function(p, which) { assert.strictEqual(Thumbs.config(p, item), "", "paths " + which) })
})

test("config: changes neither the items nor the paths", function() {
  var items = [{ id: "AAAAAAAAAAA", n: 1 }, { id: "BBBBBBBBBBB", n: 2 }]
  var before = JSON.stringify([items, paths])
  Thumbs.config(paths, items)
  Thumbs.parse(okLine(0), items)
  assert.strictEqual(JSON.stringify([items, paths]), before)
})

test("an id spelled like a member name is a key like any other", function() {
  var names = ["constructor", "hasOwnProp_", "__proto__AA", "toString___", "prototype__", "__defineGet"]
  var items = names.map(function(id, i) { return { id: id, n: i + 1 } })
  var found = transfers(Thumbs.config(paths, items))
  assert.deepStrictEqual(found.map(function(transfer) { return transfer.url }), names.map(Ids.thumbUrl))
  // The duplicate check is not fooled by them either.
  assert.strictEqual(Thumbs.config(paths, [{ id: "constructor", n: 1 }, { id: "constructor", n: 2 }]), "")
})

// ---- parse ----

test("parse: 200, no error and a JPEG is ready; a 404 and a missing line are not", function() {
  var items = [{ id: "AAAAAAAAAAA", n: 1 }, { id: "BBBBBBBBBBB", n: 2 }, { id: "CCCCCCCCCCC", n: 3 }]
  var report = "2 200 0 16911 image/jpeg\n0 404 22 0 text/html; charset=UTF-8\n"
  assert.deepStrictEqual(Thumbs.parse(report, items), { ready: [2], failed: [0, 1] })
})

test("parse: a transfer that broke off, garbage and extra lines", function() {
  var items = [{ id: "AAAAAAAAAAA", n: 1 }, { id: "BBBBBBBBBBB", n: 2 }]
  assert.deepStrictEqual(Thumbs.parse("0 200 18 4096 image/jpeg\n1 200 0 17000 image/jpeg\n", items),
    { ready: [1], failed: [0] })
  assert.deepStrictEqual(Thumbs.parse("not a report\n\u0000\u0001\n{}\n[]\n", items),
    { ready: [], failed: [0, 1] })
  assert.deepStrictEqual(Thumbs.parse(okLine(0) + okLine(1) + okLine(2) + okLine(57) + "trailing", items),
    { ready: [0, 1], failed: [] })
  assert.deepStrictEqual(Thumbs.parse(okLine(0) + okLine(1).slice(0, 9), items), { ready: [0], failed: [1] })
})

test("parse: every position is in exactly one list, in order, whatever the report says", function() {
  var next = generator(23)
  var pieces = [
    "0", "1", "2", "11", "12", "200", "404", "000", " ", "  ", "\n", "\n", "\r\n", "image/jpeg", "text/html",
    "0 200 0 5 image/jpeg\n", "3 200 0 99 image/jpeg\n", "7 404 22 0 text/html\n", "-", "e", "262144",
    "262145", "\u0000", "\ufffd", "\u2028", "x", "9 200 0 1 image/jpeg", "10 200 0 262144 image/jpeg\n"
  ]
  for (var round = 0; round < 3000; round++) {
    var report = ""
    var length = next(30)
    for (var i = 0; i < length; i++) report += pieces[next(pieces.length)]
    var count = next(14)
    var items = new Array(count).fill(null)
    var verdict = Thumbs.parse(report, items)
    assert.deepStrictEqual(Object.keys(verdict), ["ready", "failed"])
    var all = verdict.ready.concat(verdict.failed).sort(function(a, b) { return a - b })
    var every = []
    for (var k = 0; k < count; k++) every.push(k)
    assert.deepStrictEqual(all, every, JSON.stringify(report))
    assert.deepStrictEqual(verdict.ready.slice().sort(function(a, b) { return a - b }), verdict.ready)
    // What is ready has one line of its own that says so.
    verdict.ready.forEach(function(position) {
      var lines = report.split("\n").filter(function(line) { return line.indexOf(position + " ") === 0 })
      assert.strictEqual(lines.length, 1, JSON.stringify(report))
      assert.match(lines[0], /^\d{1,3} 200 0 \d{1,6} image\/jpeg(?![A-Za-z0-9_])/)
    })
  }
})

test("parse: never throws and never answers with anything but two lists", function() {
  var reports = [
    undefined, null, 0, NaN, true, {}, [], ["0 200 0 5 image/jpeg"], function() {}, Object.create(null),
    { toString: function() { throw new Error("no") } }, "", "\n", "0", "x".repeat(100000),
    "0 200 0 5 image/jpeg\n".repeat(20000)
  ]
  var batches = [
    undefined, null, 0, 3, "abc", {}, { length: 3 }, [], [null], [1, 2, 3], Object.create(null),
    new Array(1000).fill(null)
  ]
  reports.forEach(function(report) {
    batches.forEach(function(items) {
      var verdict = Thumbs.parse(report, items)
      assert.ok(Array.isArray(verdict.ready) && Array.isArray(verdict.failed))
      var count = Array.isArray(items) ? items.length : 0
      assert.strictEqual(verdict.ready.length + verdict.failed.length, count)
    })
  })
})

test("parse: a report longer than curl was allowed to print is not read at all", function() {
  var items = [{ id: "AAAAAAAAAAA", n: 1 }]
  var cap = Const.LIMITS.thumbOutBytes
  var atCap = okLine(0) + "x".repeat(cap - okLine(0).length)
  assert.strictEqual(atCap.length, cap)
  assert.deepStrictEqual(Thumbs.parse(atCap, items), { ready: [0], failed: [] })
  assert.deepStrictEqual(Thumbs.parse(atCap + "x", items), { ready: [], failed: [0] })
})

test("parse: the size limit is the one curl is given", function() {
  var items = [{ id: "AAAAAAAAAAA", n: 1 }]
  var limit = Const.LIMITS.thumbBytes
  var line = function(size) { return "0 200 0 " + size + " image/jpeg\n" }
  assert.deepStrictEqual(Thumbs.parse(line(1), items).ready, [0])
  assert.deepStrictEqual(Thumbs.parse(line(limit), items).ready, [0])
  assert.deepStrictEqual(Thumbs.parse(line(limit + 1), items).ready, [])
  assert.deepStrictEqual(Thumbs.parse(line(0), items).ready, [])
  var argv = Thumbs.argv(Const.TOOLS)
  assert.strictEqual(argv[argv.indexOf("--max-filesize") + 1], String(limit))
})

test("parse: reads the format the command line asks curl for", function() {
  var argv = Thumbs.argv(Const.TOOLS)
  var format = argv[argv.indexOf("--write-out") + 1]
  var fill = function(values) {
    var filled = format.replace(/%\{([a-z_]+)\}/g, function(whole, name) { return values[name] })
    return filled.replace("\\n", "\n")
  }
  var good = { urlnum: 0, response_code: 200, exitcode: 0, size_download: 17000, content_type: "image/jpeg" }
  var missing = { urlnum: 1, response_code: 404, exitcode: 22, size_download: 0, content_type: "text/html" }
  assert.deepStrictEqual(Thumbs.parse(fill(good) + fill(missing), [null, null]), { ready: [0], failed: [1] })
})

// ---- evictCount ----

test("evictCount: nothing up to the limit, then the fifty oldest, then whatever is over", function() {
  var limit = Const.LIMITS.thumbFiles
  for (var total = 0; total <= limit; total++) assert.strictEqual(Thumbs.evictCount(total), 0, String(total))
  for (var over = limit + 1; over <= limit + 50; over++) assert.strictEqual(Thumbs.evictCount(over), 50)
  for (var far = limit + 51; far <= limit + 400; far++) {
    assert.strictEqual(Thumbs.evictCount(far), far - limit)
  }
})

test("evictCount: what is left never exceeds the limit, and something is always left", function() {
  var limit = Const.LIMITS.thumbFiles
  for (var total = 0; total <= 5000; total++) {
    var left = total - Thumbs.evictCount(total)
    assert.ok(left <= limit && left >= Math.min(total, limit - 50) && left >= 0, String(total))
  }
})

test("evictCount: one batch over the limit brings the count down for many batches to come", function() {
  // The cache grows by one batch at a time. After an eviction it has to
  // take several batches before the next one, or every batch would start
  // by removing files.
  var count = Const.LIMITS.thumbFiles
  var evictions = 0
  for (var round = 0; round < 100; round++) {
    count += Const.LIMITS.thumbBatch
    var gone = Thumbs.evictCount(count)
    if (gone > 0) evictions++
    count -= gone
    assert.ok(count <= Const.LIMITS.thumbFiles)
  }
  assert.ok(evictions <= 25, evictions + " evictions in 100 batches")
})

test("evictCount: something that is not a count evicts nothing", function() {
  var odd = [undefined, null, NaN, Infinity, -Infinity, "250", [250], {}, true, function() {}, -250]
  odd.forEach(function(value) { assert.strictEqual(Thumbs.evictCount(value), 0, String(value)) })
})

// ---- The fixture ----

test("fixture: thumb.jpg is a tiny made-up JPEG with nothing in it but the picture", function() {
  var bytes = fs.readFileSync(path.join(__dirname, "..", "fixtures", "thumb.jpg"))
  // The harness cases compare file sizes with this number.
  assert.strictEqual(bytes.length, 189)
  assert.deepStrictEqual(Array.from(bytes.subarray(0, 3)), [0xff, 0xd8, 0xff], "starts like a JPEG")
  assert.deepStrictEqual(Array.from(bytes.subarray(-2)), [0xff, 0xd9], "and ends like one")
  assert.ok(bytes.length <= Const.LIMITS.thumbBytes)
  // No camera data, no comment, no colour profile: nothing a real picture
  // would carry along.
  var text = bytes.toString("latin1")
  var markers = ["Exif", "ICC_PROFILE", "http", "Adobe", "Photoshop", "GIMP", "ImageMagick"]
  markers.forEach(function(marker) { assert.strictEqual(text.indexOf(marker), -1, marker) })
  assert.strictEqual(text.indexOf("\u00ff\u00fe"), -1, "no comment segment")
  assert.strictEqual(text.indexOf("\u00ff\u00e1"), -1, "no metadata segment")
})
