#!/usr/bin/node
"use strict"
// Stands in for yt-dlp inside a harness run. Like the real tool it reads
// what to look up from standard input ("-a -"), one entry per line, and
// prints one JSON answer: the search fixture for "ytsearch<N>:<query>", and
// the video fixture, with the asked id swapped in, for a watch address. No
// network is involved.
//
// Every start is recorded through lib.js (arguments, standard input, names
// of the environment variables). The scenario the case wrote under "ytdlp"
// chooses how the lookup ends:
//
//   ok             the fixture, exit 0 (the default)
//   slow:<ms>      the same, after that many milliseconds
//   big:<bytes>    the same, padded with blanks to exactly that many bytes
//   empty          a search that found nothing
//   refused        the video is private: "null", an error line, exit 1
//   account        the video needs a signed-in account
//   not-started    the video is a premiere that has not begun
//   blocked        YouTube asks to prove that no bot is asking
//   network        no connection
//   unknown        an error line no rule knows
//   wrong-id       a sound answer about another video
//   garbage        exit 0, and output that is not JSON
//   non-ascii      exit 0, and JSON with unescaped characters outside ASCII
//   flood          output without end
//   loud           the same, and it does not end when asked to
//   hang           no answer; waits until it is ended
//
// Error lines are worded like the real ones, the query or the id included:
// that is exactly the text the plugin must never show, store or log.
var fs = require("fs")
var path = require("path")
var lib = require("./lib.js")

var FIXTURES = path.join(__dirname, "..", "fixtures")
// The id the video fixture is written for.
var FIXTURE_ID = "AAAAAAAAAAA"
// What yt-dlp exits with for a failed lookup, and for a bad command line.
var EXIT_FAILED = 1
var EXIT_USAGE = 2

var SEARCH = /^ytsearch([0-9]+):(.*)$/
var WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})(&list=RD[A-Za-z0-9_-]{11})?$/

var stub = lib.start("ytdlp")
// Read before the start is recorded: a case that waits for the record may
// then write the scenario of the next start.
var scenario = stub.scenario()
var argv = process.argv.slice(2)

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8")
}

// Ends the process once everything written to standard output has left.
function finish(code) {
  process.stdout.write("", function() { process.exit(code) })
}

// A failed lookup: the error line, then what "-J" prints for a failure.
function fail(reason, output) {
  process.stderr.write("ERROR: " + reason + "\n")
  process.stdout.write(output === undefined ? "null\n" : output)
  finish(EXIT_FAILED)
}

// What the lookup is about: { kind: "search", query }, { kind: "video", id },
// { kind: "mix", id } or { kind: "other" }.
function request(text) {
  var line = text.split("\n")[0]
  var search = SEARCH.exec(line)
  if (search) return { kind: "search", query: search[2], label: "query \"" + search[2] + "\" page 1" }
  var watch = WATCH.exec(line)
  if (watch) return { kind: watch[2] ? "mix" : "video", id: watch[1], label: "[youtube] " + watch[1] }
  return { kind: "other", label: "[generic] input" }
}

function answer(asked) {
  if (asked.kind === "search") return fixture("search.json")
  if (asked.kind === "video") return fixture("video.json").split(FIXTURE_ID).join(asked.id)
  if (asked.kind === "mix" && fs.existsSync(path.join(FIXTURES, "mix.json"))) return fixture("mix.json")
  return null
}

// size: 0, or the number of bytes the answer is padded to. The blanks go
// in front of the final line break, where JSON allows them.
function succeed(asked, size) {
  var text = answer(asked)
  if (text === null) { fail(asked.label + ": Unsupported URL"); return }
  if (size > text.length) text = text.slice(0, -1) + " ".repeat(size - text.length) + "\n"
  process.stdout.write(text)
  finish(0)
}

function respond(asked) {
  var name = scenario.name
  var unreachable = "Unable to download API page: HTTPSConnection(host='www.youtube.com', port=443): "
    + "Failed to establish a new connection: [Errno 101] Network is unreachable"
  if (name === "ok") succeed(asked, 0)
  else if (name === "slow") setTimeout(function() { succeed(asked, 0) }, Number(scenario.arg) || 0)
  else if (name === "big") succeed(asked, Number(scenario.arg) || 0)
  else if (name === "empty") {
    process.stdout.write(JSON.stringify({ _type: "playlist", id: "synthetic", entries: [] }) + "\n")
    finish(0)
  } else if (name === "refused") fail(asked.label + ": Private video")
  else if (name === "account") {
    fail(asked.label + ": Sign in to confirm your age. Use --cookies-from-browser or --cookies for the "
      + "authentication")
  } else if (name === "not-started") fail(asked.label + ": Premieres in 3 hours")
  else if (name === "blocked") {
    fail(asked.label + ": Sign in to confirm you\u2019re not a bot. Use --cookies-from-browser or --cookies "
      + "for the authentication")
  } else if (name === "network") {
    // Without a connection a search still prints a listing, with nothing in it.
    var listing = JSON.stringify({ _type: "playlist", id: "synthetic", entries: [null] }) + "\n"
    fail(asked.label + ": " + unreachable, asked.kind === "search" ? listing : undefined)
  } else if (name === "unknown") fail(asked.label + ": Something the stub made up")
  else if (name === "wrong-id") {
    process.stdout.write(fixture("video.json").split(FIXTURE_ID).join("ZZZZZZZZZZZ"))
    finish(0)
  } else if (name === "garbage") {
    process.stdout.write("<html><body>not what was asked for</body></html>\n")
    finish(0)
  } else if (name === "non-ascii") {
    // The same answer as "ok", with the escapes yt-dlp writes turned back
    // into the characters themselves.
    var text = answer(asked)
    process.stdout.write(text === null ? "{}" : JSON.stringify(JSON.parse(text)) + "\n")
    finish(0)
  } else if (name === "flood" || name === "loud") {
    if (name === "loud") process.on("SIGTERM", function() {})
    var block = "{\"entries\": [" + "0,".repeat(32768)
    var pour = function() { process.stdout.write(block, function() { setImmediate(pour) }) }
    pour()
  } else if (name === "hang") setInterval(function() {}, 60000)
  else fail(asked.label + ": the stub has no scenario of that name")
}

// A reader that went away is how a flood normally ends.
process.stdout.on("error", function() { process.exit(0) })

lib.readStdin(function(text) {
  stub.recordStart(text)
  // Without these the real tool would not read standard input at all, or
  // would not print JSON.
  var batch = argv.indexOf("-a")
  if (batch === -1 || argv[batch + 1] !== "-" || argv.indexOf("-J") === -1) {
    process.stderr.write("Usage: yt-dlp [OPTIONS] URL [URL...]\n\nyt-dlp: error: no input was named\n")
    process.exit(EXIT_USAGE)
  }
  process.stderr.write("Reading URLs from STDIN - EOF (Ctrl+D) to end:\n")
  respond(request(text))
})
