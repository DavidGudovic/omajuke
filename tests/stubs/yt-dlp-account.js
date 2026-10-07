#!/usr/bin/node
"use strict"
// Stands in for yt-dlp where an account is involved. A case that signs in
// puts this file into the tool table in place of yt-dlp.js. It knows the
// two ways the real tool is run with a login, and no network is involved in
// either.
//
// Exporting ("--cookies-from-browser <name>+basictext:<profile>" with
// "--cookies <file>" and no address): reads the made-up cookie store the
// stand-in browser (browser.js) left in that profile, writes every row of
// it, whatever the site, as a cookie file where --cookies points and, like
// the real tool run without an address, exits with 2. Without a store it
// writes nothing and exits with 1.
//
// A signed-in call ("--cookies <file>" with "-a -"): reads the address from
// standard input and answers with a made-up list for it, or reports a video
// as watched by printing nothing. Like the real tool it writes the cookie
// file it was given anew, so that a case can see which permissions a file
// made by this process gets.
//
// Every start is recorded under "ytdlp": the arguments, standard input, the
// names of the environment variables, and for a signed-in call the sites
// and names (never the values) of the cookies in the file it was given.
// The scenario the case wrote under "ytdlp" chooses how a call ends:
//
//   ok              the list, exit 0 (the default)
//   slow:<ms>       the same, after that many milliseconds
//   empty           a list with nothing in it
//   signed-out      the warning the real tool prints when YouTube no longer
//                   accepts the login, then a list all the same, exit 0
//   fail            an error line, exit 1
//   garbage         exit 0, and output that is not JSON
//   hang            no answer; waits until it is ended
//   export-stuck    an export that does not end when asked to; a signed-in
//                   call is answered as with "ok"
var fs = require("fs")
var path = require("path")
var lib = require("./lib.js")

var EXIT_FAILED = 1
var EXIT_USAGE = 2

var HOST = "https://www.youtube.com"
var WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/
var LIST = /^https:\/\/www\.youtube\.com\/playlist\?list=([A-Za-z0-9_-]{2,64})$/
var FROM_BROWSER = /^(chrome|chromium|brave|vivaldi|firefox)\+basictext:(\/.+)$/

// The made-up lists: how many rows each feed has, and the two letters its
// ids start with. One is longer than the plugin ever asks for.
var FEEDS = {
  "/feed/recommended": { letters: "FY", count: 60, title: "For you", channel: true },
  "/feed/subscriptions": { letters: "SB", count: 3, title: "Subscriptions", channel: true },
  "/playlist?list=WL": { letters: "WL", count: 2, title: "Watch later", channel: true },
  "/feed/history": { letters: "HS", count: 5, title: "History", channel: false }
}

var stub = lib.start("ytdlp")
// Read before the start is recorded: a case that waits for the record may
// then write the scenario of the next start.
var scenario = stub.scenario()
var argv = process.argv.slice(2)

// The argument behind a flag, or null.
function valueOf(flag) {
  var at = argv.indexOf(flag)
  return at !== -1 && typeof argv[at + 1] === "string" ? argv[at + 1] : null
}

function wait() {
  setInterval(function() {}, 60000)
}

// Ends the process once everything written to standard output has left.
function finish(code) {
  process.stdout.write("", function() { process.exit(code) })
}

// ---- Exporting ----

function cookieLine(row) {
  var domain = String(row[0])
  var subdomains = domain.charAt(0) === "." ? "TRUE" : "FALSE"
  var fields = [domain, subdomains, "/", "TRUE", "1893456000", row[1], row[2]]
  return (row[3] === true ? "#HttpOnly_" : "") + fields.join("\t")
}

function exportCookies(source, target) {
  var found = FROM_BROWSER.exec(source)
  if (found === null || target === null) {
    process.stderr.write("yt-dlp: error: unsupported browser specification\n")
    process.exit(EXIT_USAGE)
  }
  var store = found[1] === "firefox" ? path.join(found[2], "cookies.sqlite")
    : path.join(found[2], "Default", "Cookies")
  var rows
  try {
    rows = JSON.parse(fs.readFileSync(store, "utf8")).rows
  } catch (error) {
    process.stderr.write("ERROR: could not find " + found[1] + " cookies database\n")
    process.exit(EXIT_FAILED)
  }
  var lines = ["# Netscape HTTP Cookie File", "# Written by a test.", ""].concat(rows.map(cookieLine))
  fs.writeFileSync(target, lines.join("\n") + "\n")
  process.stderr.write("Usage: yt-dlp [OPTIONS] URL [URL...]\n\nyt-dlp: error: no address was named\n")
  process.exit(EXIT_USAGE)
}

// ---- A signed-in call ----

// "<site> <name>" for every row of a cookie file, or null when it cannot
// be read. Values are left out on purpose: they go into no record.
function cookieNames(file) {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(function(line) {
      return line !== "" && (line.charAt(0) !== "#" || line.indexOf("#HttpOnly_") === 0)
    }).map(function(line) {
      var fields = line.replace(/^#HttpOnly_/, "").split("\t")
      return fields[0] + " " + fields[5]
    })
  } catch (error) {
    return null
  }
}

// The real tool opens the cookie file it was given for writing and writes
// it out again. Removed first here, so that the new file gets the
// permissions this process would give any file it creates.
function rewrite(file) {
  try {
    var text = fs.readFileSync(file, "utf8")
    fs.unlinkSync(file)
    fs.writeFileSync(file, text)
  } catch (error) {
    // Nothing to write anew.
  }
}

function digits(n) {
  return ("00" + n).slice(-2)
}

function video(letters, n, title, channel) {
  var entry = {
    _type: "url", ie_key: "Youtube", id: letters + "AAAAAAA" + digits(n),
    url: "https://media.example/watch?v=" + letters + digits(n), title: title + " track " + n,
    duration: 100 + n, live_status: null
  }
  if (channel) entry.channel = "Synthetic Channel"
  return entry
}

function videos(feed, count) {
  var entries = []
  for (var n = 1; n <= count; n++) entries.push(video(feed.letters, n, feed.title, feed.channel))
  return entries
}

function playlistRow(id, title) {
  return { _type: "url", ie_key: "YoutubeTab", id: id, url: "https://media.example/playlist?list=" + id,
    title: title }
}

// The entries for an address, or null when the stub knows no such list.
function entriesFor(address) {
  var rest = address.indexOf(HOST) === 0 ? address.slice(HOST.length) : ""
  if (Object.prototype.hasOwnProperty.call(FEEDS, rest)) return videos(FEEDS[rest], FEEDS[rest].count)
  if (rest === "/feed/playlists") {
    return [
      playlistRow("PLsynthetic000000001", "First synthetic list"),
      // A video among the playlists, a row without a title, and a row that
      // comes twice: none of them is a playlist to show.
      video("PV", 1, "Stray", true),
      playlistRow("PLsynthetic000000002", ""),
      playlistRow("PLsynthetic000000003", "Second synthetic list"),
      playlistRow("PLsynthetic000000001", "First synthetic list again")
    ]
  }
  var list = LIST.exec(address)
  if (list !== null && list[1] === "PLsynthetic000000001") {
    return videos({ letters: "L1", title: "First list", channel: true }, 4)
  }
  if (list !== null && list[1] === "PLsynthetic000000003") return []
  return null
}

// Only the rows that were asked for: "1:<n>" keeps the first n.
function asked(entries) {
  var range = /^1:([0-9]+)$/.exec(valueOf("--playlist-items") || "")
  return range === null ? entries : entries.slice(0, Number(range[1]))
}

function answer(address) {
  var entries = scenario.name === "empty" ? [] : entriesFor(address)
  if (entries === null) {
    process.stderr.write("ERROR: [generic] input: Unsupported URL\n")
    process.stdout.write("null\n")
    finish(EXIT_FAILED)
    return
  }
  process.stdout.write(JSON.stringify({ _type: "playlist", id: "synthetic", entries: asked(entries) }) + "\n")
  finish(0)
}

function respond(address) {
  var name = scenario.name
  if (name === "signed-out") {
    process.stderr.write("WARNING: [youtube] The provided YouTube account cookies are no longer valid. "
      + "They have likely been rotated in the browser as a security measure.\n")
  }
  if (argv.indexOf("-J") === -1) {
    // A watched report: nothing is printed, and nothing but a video is
    // reported.
    finish(WATCH.test(address) && argv.indexOf("--simulate") !== -1 ? 0 : EXIT_FAILED)
  } else if (name === "fail") {
    process.stderr.write("ERROR: [youtube:tab] synthetic: Unable to download API page: the stub has no "
      + "network\n")
    process.stdout.write("null\n")
    finish(EXIT_FAILED)
  } else if (name === "garbage") {
    process.stdout.write("<html><body>not what was asked for</body></html>\n")
    finish(0)
  } else if (name === "hang") wait()
  else if (name === "slow") setTimeout(function() { answer(address) }, Number(scenario.arg) || 0)
  else answer(address)
}

// ---- Which of the two it is ----

var source = valueOf("--cookies-from-browser")
var cookieFile = valueOf("--cookies")

if (source !== null) {
  // The handler is in place before the start is recorded, so a case that
  // waits for the record knows the signal will be ignored.
  if (scenario.name === "export-stuck") process.on("SIGTERM", function() {})
  stub.record({
    argv: argv, stdin: null, env: Object.keys(process.env).sort(), mode: "export",
    tmpdir: typeof process.env.TMPDIR === "string" ? process.env.TMPDIR : null
  })
  if (scenario.name === "export-stuck") wait()
  else exportCookies(source, cookieFile)
} else {
  lib.readStdin(function(text) {
    stub.record({
      argv: argv, stdin: text, env: Object.keys(process.env).sort(), mode: "account",
      cookies: cookieFile === null ? null : cookieNames(cookieFile)
    })
    var batch = argv.indexOf("-a")
    var known = argv.indexOf("-J") !== -1 || argv.indexOf("--mark-watched") !== -1
    if (cookieFile === null || batch === -1 || argv[batch + 1] !== "-" || !known) {
      process.stderr.write("Usage: yt-dlp [OPTIONS] URL [URL...]\n\nyt-dlp: error: no input was named\n")
      process.exit(EXIT_USAGE)
    }
    rewrite(cookieFile)
    process.stderr.write("Reading URLs from STDIN - EOF (Ctrl+D) to end:\n")
    respond(text.split("\n")[0])
  })
}
