.pragma library
.import "Const.js" as Const
.import "Ids.js" as Ids
.import "Paths.js" as Paths

// Thumbnail fetching, as far as it is pure: the command line of the one
// curl call, the list of transfers it reads from standard input, the reader
// of what it reports back, and the rule for when old files have to go.
//
// The address of a thumbnail is built here from a validated video id and a
// constant host, and from nothing else: an address that came from YouTube
// or from anywhere outside is never fetched. The id is only ever in that
// address, which travels on standard input. The file is named by a counter,
// so no id is in a command line or in a file name.

// Seconds: to connect, and for one whole transfer.
var _CONNECT_TIMEOUT = 4
var _TRANSFER_TIMEOUT = 8

// Connections open at the same time.
var _CONNECTIONS = 4

// How many of the oldest files go at once when there are too many, so that
// the next batches do not each start with a removal.
var _EVICT_AT_ONCE = 50

// One line per transfer: which one, the HTTP status, curl's own verdict,
// the bytes received and the type the server named. curl turns the last
// two characters into a line break.
var _REPORT = "%{urlnum} %{response_code} %{exitcode} %{size_download} %{content_type}\\n"

// A transfer that worked: HTTP 200, no error from curl, a JPEG.
var _DONE = /^(\d{1,3}) 200 0 (\d{1,6}) image\/jpeg\b/

// The transfer a report line is about, whatever it says.
var _ABOUT = /^(\d{1,3}) /

// What may stand between the quotes of a line curl reads: neither a quote
// nor a backslash, which curl would read as the start of an escape.
var _PLAIN_PATH = /^\/[A-Za-z0-9._\/-]+$/

function _isObject(value) {
  return value !== null && typeof value === "object"
}

// The arguments of the fetch, or null without a curl path. Everything that
// bounds a transfer is here: https only, also after a redirect, and no
// redirect is followed anyway; a time limit; a size limit that also ends a
// transfer that turns out larger than announced; no file left behind by a
// transfer that failed.
function argv(tools) {
  if (!_isObject(tools) || typeof tools.curl !== "string" || tools.curl.charAt(0) !== "/") return null
  return [
    tools.curl,
    // Must come first: the user's own curl configuration is not read.
    "-q",
    "--no-progress-meter", "--fail",
    "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "0", "--tlsv1.2",
    "--connect-timeout", String(_CONNECT_TIMEOUT), "--max-time", String(_TRANSFER_TIMEOUT),
    "--max-filesize", String(Const.LIMITS.thumbBytes),
    "--remove-on-error",
    "--parallel", "--parallel-max", String(_CONNECTIONS),
    // Nothing about the machine or the program is sent along.
    "--user-agent", "",
    "--write-out", _REPORT,
    // The transfers themselves are read from standard input.
    "--config", "-"
  ]
}

// The transfers of one batch, as the text curl reads from standard input:
// for each item its address and the file it goes to. items is a list of
// { id, n } with n the counter that names the file. Returns "" unless every
// item is sound: the reports are matched to the items by position, so a
// batch is fetched as a whole or not at all.
function config(paths, items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > Const.LIMITS.thumbBatch) return ""
  var ids = new Set()
  var files = new Set()
  var lines = []
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (!_isObject(item) || !Ids.isId(item.id)) return ""
    // curl may write a numbered thumbnail and no other file of ours.
    var file = Paths.thumbFile(paths, item.n)
    if (Paths.kind(paths, file) !== "thumb" || !_PLAIN_PATH.test(file)) return ""
    if (ids.has(item.id) || files.has(file)) return ""
    ids.add(item.id)
    files.add(file)
    lines.push("url = \"" + Ids.thumbUrl(item.id) + "\"")
    lines.push("output = \"" + file + "\"")
  }
  return lines.join("\n") + "\n"
}

// Reads curl's report for a batch of items. Returns { ready, failed }: the
// positions in items whose file is there and good, and all the others. A
// transfer counts only when exactly one line is about it and that line
// says it worked, with a size inside the limit; a transfer curl said
// nothing about has failed. Part of each line is text the server chose, so
// nothing else is taken from it.
function parse(stdout, items) {
  var count = Array.isArray(items) ? items.length : 0
  var readable = typeof stdout === "string" && stdout.length <= Const.LIMITS.thumbOutBytes
  var lines = readable ? stdout.split("\n") : []
  var mentions = new Map()
  var good = new Set()
  for (var i = 0; i < lines.length; i++) {
    var about = _ABOUT.exec(lines[i])
    if (about === null) continue
    var position = Number(about[1])
    // Only the plain spelling of a number is a position: curl prints no
    // other. A position this batch does not have is never asked about below.
    if (String(position) !== about[1]) continue
    mentions.set(position, (mentions.get(position) || 0) + 1)
    var done = _DONE.exec(lines[i])
    if (done === null) continue
    var size = Number(done[2])
    if (size >= 1 && size <= Const.LIMITS.thumbBytes) good.add(position)
  }
  var ready = []
  var failed = []
  for (var k = 0; k < count; k++) {
    if (mentions.get(k) === 1 && good.has(k)) ready.push(k)
    else failed.push(k)
  }
  return { ready: ready, failed: failed }
}

// How many of the oldest files to remove when total files are kept: none up
// to the limit, and beyond it enough to be well below the limit again.
function evictCount(total) {
  if (typeof total !== "number" || !isFinite(total) || total <= Const.LIMITS.thumbFiles) return 0
  return Math.max(_EVICT_AT_ONCE, Math.ceil(total) - Const.LIMITS.thumbFiles)
}

if (typeof module !== "undefined") {
  module.exports = { argv: argv, config: config, parse: parse, evictCount: evictCount }
}
