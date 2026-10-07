#!/usr/bin/node
"use strict"
// Stands in for curl inside a harness run. Like the real tool with
// "--config -" it reads what to fetch from standard input. No network is
// involved. It serves the two requests the plugin makes, told apart by what
// the configuration holds:
//
//   thumbnails   pairs of lines (url = "...", output = "..."). Each one is
//                "downloaded" by copying the thumbnail fixture to the output
//                file, and one line per transfer is printed in the format
//                "--write-out" asks for.
//   segments     one line (url = "...") that names the segment service and
//                no output file: the answer goes to standard output,
//                followed by what "--write-out" asks for.
//
// Files are created with default permissions, so that their mode shows
// whether the plugin ran this tool under a private umask.
//
// Every start is recorded through lib.js (arguments, standard input, names
// of the environment variables). The scenario the case wrote under "curl"
// chooses how thumbnail transfers end:
//
//   ok             every transfer succeeds (the default)
//   slow:<ms>      the same, after that many milliseconds
//   404            every transfer gets "not found": no file, HTTP 404
//   404:<list>     only the transfers at these positions do ("404:1,3")
//   partial        every second transfer breaks off half-way; like the
//                  real tool with --remove-on-error it leaves no file
//   html           HTTP 200 and a file, but a web page instead of a picture
//   silent         files are written and nothing is reported
//   stubborn:<ms>  does not end when asked to; writes its files after that
//                  many milliseconds, reports nothing and waits
//   loud           does not end when asked to either, and prints far more
//                  than a report may hold
//   hang           nothing happens; waits until it is ended
//
// The scenario under "sponsor" chooses how a segment lookup ends:
//
//   ok             HTTP 200 and a list of segments (the default). The list
//                  is what the case stored as "sponsor" in this stub's
//                  state, h.setStubState("curl", { sponsor: [...] }), in
//                  the service's own format: [{ videoID, segments: [{
//                  category, actionType, segment: [start, end],
//                  videoDuration }] }]. Without stored state it is the
//                  list below: one stretch of the video fixture, and one
//                  of another video that shares the looked-up prefix.
//   slow:<ms>      the same, after that many milliseconds
//   none           HTTP 404 "Not Found": nothing is known about the prefix
//   empty          HTTP 200 and an empty list
//   error          HTTP 500 and a line of text
//   garbage        HTTP 200 and a web page instead of JSON
//   non-ascii      HTTP 200 and JSON with a character outside ASCII
//   big            HTTP 200 and more bytes than an answer may have
//   hang           no answer; waits until it is ended
//
// A lookup whose address does not name a four-digit hexadecimal prefix is
// answered with HTTP 400, as the service does.
var fs = require("fs")
var path = require("path")
var lib = require("./lib.js")

var PICTURE = fs.readFileSync(path.join(__dirname, "..", "fixtures", "thumb.jpg"))
var PAGE = Buffer.from("<html><body>not a picture</body></html>\n")
// curl's own exit codes: a bad command line or configuration, an HTTP error
// answered under --fail, a transfer that ended early.
var EXIT_USAGE = 2
var EXIT_HTTP = 22
var EXIT_PARTIAL = 18

// The segment service, and the part of its address that carries the prefix.
var SEGMENTS = /^https:\/\/sponsor\.ajay\.app\/api\/skipSegments\/([^?\/]*)(\?.*)?$/
var PREFIX = /^[0-9a-f]{4}$/
// More than an answer may have.
var BIG_BYTES = 1048576 + 4096

// What the service knows by default: a sponsor message from second 1 to 3
// of the five-second video fixture, and a stretch of some other video whose
// hash starts the same way. The second must never be acted on.
var KNOWN = [
  {
    videoID: "AAAAAAAAAAA",
    segments: [
      { category: "sponsor", actionType: "skip", segment: [1, 3], UUID: "synthetic-1", videoDuration: 5,
        locked: 0, votes: 4, description: "" }
    ]
  },
  {
    videoID: "ZZZZZZZZZZZ",
    segments: [
      { category: "sponsor", actionType: "skip", segment: [0, 4], UUID: "synthetic-2", videoDuration: 5,
        locked: 0, votes: 1, description: "" }
    ]
  }
]

var stub = lib.start("curl")
var scenario = stub.scenario()
var argv = process.argv.slice(2)

// The value that follows a flag, or null.
function valueOf(flag) {
  var at = argv.indexOf(flag)
  return at === -1 || at + 1 >= argv.length ? null : argv[at + 1]
}

// The transfers in a configuration text: [{ url, output }], or null when a
// line is not one of the two this stub understands. output is null for a
// transfer that names no file.
function transfers(text) {
  var found = []
  var lines = text.split("\n")
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] === "") continue
    var pair = /^(url|output) = "([^"\\]*)"$/.exec(lines[i])
    if (pair === null) return null
    var latest = found.length > 0 ? found[found.length - 1] : null
    if (pair[1] === "url") found.push({ url: pair[2], output: null })
    else if (latest !== null && latest.output === null) latest.output = pair[2]
    else return null
  }
  return found
}

// True when every transfer names the file it goes to.
function allToFiles(items) {
  return items.every(function(item) { return item.output !== null })
}

// The scenario of a segment lookup as { name, arg }.
function sponsorScenario() {
  var all = stub.scenarios()
  var value = Object.prototype.hasOwnProperty.call(all, "sponsor") ? String(all.sponsor) : "ok"
  var cut = value.indexOf(":")
  return cut === -1 ? { name: value, arg: "" } : { name: value.slice(0, cut), arg: value.slice(cut + 1) }
}

// The list of segments an "ok" lookup is answered with.
function knownSegments() {
  var state = stub.readState(null)
  var stored = state !== null && typeof state === "object" ? state.sponsor : undefined
  return JSON.stringify(stored === undefined ? KNOWN : stored)
}

// Prints the answer of a segment lookup and what the command line asked to
// have written behind it, then ends. Without --fail an HTTP error is not an
// error of the tool: it ends with 0 all the same.
function answerSegments(code, body) {
  var format = valueOf("--write-out")
  var tail = format === null ? "" : report(format, 0, { code: code, exit: 0, size: body.length, type: "" })
  process.stdout.write(body + tail, function() { process.exit(0) })
}

function lookUpSegments(item) {
  var kind = sponsorScenario()
  var address = SEGMENTS.exec(item.url)
  if (address === null) {
    process.stderr.write("curl: the stub does not know that address\n")
    process.exit(EXIT_USAGE)
  }
  if (!PREFIX.test(address[1])) {
    answerSegments(400, "Hash prefix does not match format requirements.")
    return
  }
  if (kind.name === "hang") setInterval(function() {}, 60000)
  else if (kind.name === "slow") {
    setTimeout(function() { answerSegments(200, knownSegments()) }, Number(kind.arg) || 0)
  } else if (kind.name === "none") answerSegments(404, "Not Found")
  else if (kind.name === "empty") answerSegments(200, "[]")
  else if (kind.name === "error") answerSegments(500, "Internal Server Error")
  else if (kind.name === "garbage") answerSegments(200, "<html><body>not what was asked for</body></html>")
  else if (kind.name === "non-ascii") {
    answerSegments(200, JSON.stringify([{ videoID: "AAAAAAAAAAA", segments: [], note: "caf\u00e9" }]))
  } else if (kind.name === "big") answerSegments(200, "[" + " ".repeat(BIG_BYTES) + "]")
  else answerSegments(200, knownSegments())
}

// Positions named in the scenario's argument; an empty argument means all.
function chosen(position) {
  if (scenario.arg === "") return true
  return scenario.arg.split(",").indexOf(String(position)) !== -1
}

// What happens to one transfer: writes or leaves the file, and returns what
// curl would report about it.
function transfer(item, position) {
  var name = scenario.name
  if (name === "404" && chosen(position)) {
    return { code: 404, exit: EXIT_HTTP, size: 0, type: "text/html; charset=UTF-8" }
  }
  if (name === "partial" && position % 2 === 1) {
    var half = PICTURE.subarray(0, Math.floor(PICTURE.length / 2))
    fs.writeFileSync(item.output, half)
    fs.unlinkSync(item.output)
    return { code: 200, exit: EXIT_PARTIAL, size: half.length, type: "image/jpeg" }
  }
  if (name === "html") {
    fs.writeFileSync(item.output, PAGE)
    return { code: 200, exit: 0, size: PAGE.length, type: "text/html; charset=UTF-8" }
  }
  fs.writeFileSync(item.output, PICTURE)
  return { code: 200, exit: 0, size: PICTURE.length, type: "image/jpeg" }
}

// One report line, in the format the command line asked for.
function report(format, position, outcome) {
  var values = {
    urlnum: position, response_code: outcome.code, exitcode: outcome.exit, size_download: outcome.size,
    content_type: outcome.type
  }
  return format.replace(/%\{([a-z_]+)\}/g, function(whole, key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : ""
  }).replace(/\\n/g, "\n")
}

function run(items) {
  var format = valueOf("--write-out")
  var last = 0
  var lines = ""
  items.forEach(function(item, position) {
    var outcome = transfer(item, position)
    if (outcome.exit !== 0) last = outcome.exit
    if (format !== null && scenario.name !== "silent") lines += report(format, position, outcome)
  })
  process.stdout.write(lines, function() { process.exit(last) })
}

lib.readStdin(function(text) {
  stub.recordStart(text)
  var items = valueOf("--config") === "-" ? transfers(text) : null
  var segments = items !== null && items.length === 1 && items[0].output === null
  if (items === null || (!segments && !allToFiles(items))) {
    process.stderr.write("curl: the stub could not read its configuration\n")
    process.exit(EXIT_USAGE)
  }
  if (segments) lookUpSegments(items[0])
  else if (scenario.name === "hang") setInterval(function() {}, 60000)
  else if (scenario.name === "slow") setTimeout(function() { run(items) }, Number(scenario.arg) || 0)
  else if (scenario.name === "stubborn") {
    process.on("SIGTERM", function() {})
    setTimeout(function() {
      items.forEach(function(item) { fs.writeFileSync(item.output, PICTURE) })
    }, Number(scenario.arg) || 0)
    setInterval(function() {}, 60000)
  } else if (scenario.name === "loud") {
    process.on("SIGTERM", function() {})
    process.stdout.write("x".repeat(65536))
    setInterval(function() {}, 60000)
  } else run(items)
})
