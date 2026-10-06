#!/usr/bin/node
"use strict"
// Stands in for curl inside a harness run. Like the real tool with
// "--config -" it reads its transfers from standard input, as pairs of
// lines (url = "...", output = "..."), "downloads" each one by copying the
// thumbnail fixture to the output file, and prints one line per transfer in
// the format "--write-out" asks for. No network is involved.
//
// Files are created with default permissions, so that their mode shows
// whether the plugin ran this tool under a private umask.
//
// Every start is recorded through lib.js (arguments, standard input, names
// of the environment variables). The scenario the case wrote under "curl"
// chooses how the transfers end:
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

var stub = lib.start("curl")
var scenario = stub.scenario()
var argv = process.argv.slice(2)

// The value that follows a flag, or null.
function valueOf(flag) {
  var at = argv.indexOf(flag)
  return at === -1 || at + 1 >= argv.length ? null : argv[at + 1]
}

// The transfers in a configuration text: [{ url, output }], or null when a
// line is not one of the two this stub understands.
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
  return found.every(function(transfer) { return transfer.output !== null }) ? found : null
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
  if (items === null) {
    process.stderr.write("curl: the stub could not read its configuration\n")
    process.exit(EXIT_USAGE)
  }
  if (scenario.name === "hang") setInterval(function() {}, 60000)
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
