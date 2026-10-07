#!/usr/bin/node
"use strict"
// Stands in for yt-dlp inside a harness run. No network is involved. It is
// started in one of three ways, told apart by its arguments alone:
//
//   a lookup   "-a -" and "-J". Like the real tool it reads what to look up
//              from standard input, one entry per line, and prints one JSON
//              answer:
//                "ytsearch<N>:<query>"            the search fixture
//                a watch address                  the video fixture, with
//                                                 the asked id swapped in
//                a watch address with "&list=RD"  the mix fixture, seeded
//                                                 with the asked id
//                /feed/recommended, /feed/subscriptions, /feed/history,
//                /playlist?list=WL                a list of videos (the
//                                                 search fixture)
//                /feed/playlists                  a list of playlists
//                /playlist?list=<id>              a list of videos
//              "--playlist-items <a>:<b>" keeps that range of a list.
//   a report   "-a -" and "--simulate", without "-J": looks the video up and
//              prints nothing (how a video is marked as watched).
//   an export  "--cookies-from-browser <name>+basictext:<profile>" and
//              "--cookies <file>", no input: writes a cookie file of
//              invented rows to <file> and, like the real tool run without
//              an address, exits with 2.
//
// Every start is recorded through lib.js: the arguments, standard input and
// the names of the environment variables. A start that was given a cookie
// file adds "jar": { found, mode, login } (whether the file was there, its
// permissions, and whether it holds a YouTube login). An export adds
// "profile": the names inside the profile folder it was pointed at, or null
// when there is no such folder.
//
// The cookie file. Like the real tool, a lookup or report that is given
// "--cookies <file>" writes that file anew. The stub removes it and creates
// it again with default permissions, so its mode afterwards shows whether
// the plugin ran this tool under a private umask. The account counts as
// signed in only when the file holds a LOGIN_INFO row for youtube.com. The
// lists of an account (the feeds and Watch Later) are refused without one.
//
// Watched videos. A video that is looked up while "--mark-watched" is in
// force (the last of it and "--no-mark-watched" decides) is added to
// "marked" in the state this stub keeps between its runs. A case reads it
// with h.stubState("ytdlp").
//
// The scenario the case wrote under "ytdlp" chooses how a lookup or a
// report ends:
//
//   ok             the answer, exit 0 (the default)
//   slow:<ms>      the same, after that many milliseconds
//   big:<bytes>    the same, padded with blanks to exactly that many bytes
//   empty          a search or a list with nothing in it
//   no-mix         a mix address is answered with the one video alone, as
//                  for a video YouTube builds no mix around
//   moved          a video is answered with its media on another server,
//                  as when it is looked up a second time
//   refused        the video is private: "null", an error line, exit 1
//   account        the video needs a signed-in account
//   restricted     the same, unless a cookie file with a login was given:
//                  then the answer, exit 0
//   signed-out     with a cookie file: a warning that YouTube no longer
//                  accepts the login, then the answer and exit 0 all the
//                  same. Without one: the answer
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
// The scenario under "export" chooses how an export ends:
//
//   ok             a signed-in session's rows among those of other sites
//                  (the default)
//   anonymous      the rows of a browser nobody signed in with
//   none           no cookie store was found: no file, an error line, exit 1
//   slow:<ms>      as ok, after that many milliseconds
//   hang           no file; waits until it is ended
//   stubborn       the same, and it does not end when asked to
//
// Error lines are worded like the real ones, the query or the id included:
// that is exactly the text the plugin must never show, store or log.
var fs = require("fs")
var path = require("path")
var lib = require("./lib.js")

var FIXTURES = path.join(__dirname, "..", "fixtures")
// The id the video and mix fixtures are written for.
var FIXTURE_ID = "AAAAAAAAAAA"
// The server the media of the video fixture are on, and the one they are
// on after they "moved".
var MEDIA_HOST = "rr1---sn-test.googlevideo.com"
var MOVED_HOST = "rr2---sn-test.googlevideo.com"
// What yt-dlp exits with for a failed lookup, and for a bad command line.
var EXIT_FAILED = 1
var EXIT_USAGE = 2

// The scenarios in which a lookup is answered.
var ANSWERED = ["ok", "slow", "big", "restricted", "signed-out", "no-mix", "moved"]

var SEARCH = /^ytsearch([0-9]+):(.*)$/
var WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})(&list=RD[A-Za-z0-9_-]{11})?$/
var FEED = /^https:\/\/www\.youtube\.com\/feed\/(recommended|subscriptions|history|playlists)$/
var LIST = /^https:\/\/www\.youtube\.com\/playlist\?list=([A-Za-z0-9_-]{2,64})$/
var ITEMS = /^([0-9]+):([0-9]+)$/
var BROWSER = /^[a-z]+\+basictext:(\/.*)$/

var stub = lib.start("ytdlp")
// Read before the start is recorded: a case that waits for the record may
// then write the scenario of the next start.
var scenario = stub.scenario()
var argv = process.argv.slice(2)

// The value that follows a flag, or null.
function valueOf(flag) {
  var at = argv.indexOf(flag)
  return at === -1 || at + 1 >= argv.length ? null : argv[at + 1]
}

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8")
}

// JSON the way yt-dlp prints it: nothing outside ASCII is left unescaped.
function dump(value) {
  var text = JSON.stringify(value, null, 2).replace(/[\u007f-\uffff]/g, function(unit) {
    return "\\u" + unit.charCodeAt(0).toString(16).padStart(4, "0")
  })
  return text + "\n"
}

// Ends the process once everything written to standard output has left.
function finish(code) {
  process.stdout.write("", function() { process.exit(code) })
}

// A failed lookup: the error line, then what "-J" prints for a failure.
function fail(reason, output) {
  process.stderr.write("ERROR: " + reason + "\n")
  if (argv.indexOf("-J") !== -1) process.stdout.write(output === undefined ? "null\n" : output)
  finish(EXIT_FAILED)
}

// ---- The cookie file ----

function cookieRow(domain, name, value) {
  return [domain, "TRUE", "/", "TRUE", "1893456000", name, value].join("\t")
}

var COOKIE_HEAD = ["# Netscape HTTP Cookie File", "# Written by a test.", ""]

// What an export writes for a browser somebody signed in with: the two rows
// that make a YouTube login, one of them marked HttpOnly, among rows of
// other sites.
var SIGNED_IN_ROWS = COOKIE_HEAD.concat([
  cookieRow(".example.com", "session", "invented-other"),
  "#HttpOnly_" + cookieRow(".youtube.com", "LOGIN_INFO", "invented-login"),
  "#HttpOnly_" + cookieRow(".accounts.example", "LOGIN_INFO", "invented-elsewhere"),
  cookieRow(".youtube.com", "SAPISID", "invented-key"),
  cookieRow(".youtube.com", "PREF", "invented-preference")
]).join("\n") + "\n"

var ANONYMOUS_ROWS = COOKIE_HEAD.concat([
  cookieRow(".example.com", "session", "invented-other"),
  cookieRow(".youtube.com", "PREF", "invented-preference"),
  cookieRow(".youtube.com", "VISITOR_INFO1_LIVE", "invented-visitor")
]).join("\n") + "\n"

// True when the text of a cookie file holds a login row for YouTube.
function holdsLogin(text) {
  return text.split("\n").some(function(line) {
    var fields = line.replace(/^#HttpOnly_/, "").split("\t")
    var domain = fields[0]
    return fields.length === 7 && fields[5] === "LOGIN_INFO"
      && (domain === "youtube.com" || domain.endsWith(".youtube.com"))
  })
}

// Looks at the cookie file a lookup was given and writes it anew, as the
// real tool does. Returns { found, mode, login }, or null when none was
// named. No value of the file is kept.
function takeJar() {
  var file = valueOf("--cookies")
  if (file === null) return null
  var seen = { found: false, mode: "", login: false }
  var text = COOKIE_HEAD.join("\n") + "\n"
  try {
    var stat = fs.lstatSync(file)
    if (stat.isFile()) {
      text = fs.readFileSync(file, "utf8")
      seen = { found: true, mode: (stat.mode & 0o777).toString(8), login: holdsLogin(text) }
    }
    fs.unlinkSync(file)
  } catch (error) {
    // Not there: the real tool starts an empty file in that case.
  }
  fs.writeFileSync(file, text)
  return seen
}

// ---- Exports ----

function exportCookies() {
  var kind = stub.scenarios().export
  var chosen = typeof kind === "string" ? kind : "ok"
  var cut = chosen.indexOf(":")
  var name = cut === -1 ? chosen : chosen.slice(0, cut)
  var arg = cut === -1 ? "" : chosen.slice(cut + 1)
  var from = BROWSER.exec(String(valueOf("--cookies-from-browser")))
  var names = null
  try {
    names = from === null ? null : fs.readdirSync(from[1]).sort()
  } catch (error) {
    names = null
  }
  if (name === "stubborn") process.on("SIGTERM", function() {})
  stub.record({ argv: argv, stdin: null, env: Object.keys(process.env).sort(), profile: names })
  var target = valueOf("--cookies")
  var write = function(rows) {
    if (target !== null) fs.writeFileSync(target, rows)
    process.exit(EXIT_USAGE)
  }
  if (name === "hang" || name === "stubborn") setInterval(function() {}, 60000)
  else if (name === "slow") setTimeout(function() { write(SIGNED_IN_ROWS) }, Number(arg) || 0)
  else if (name === "anonymous") write(ANONYMOUS_ROWS)
  else if (name === "none") {
    process.stderr.write("ERROR: could not find a cookies database in the profile\n")
    process.exit(EXIT_FAILED)
  } else write(SIGNED_IN_ROWS)
}

// ---- Lookups ----

// What the lookup is about: { kind, id, label } with kind "search", "video",
// "mix", "feed" (videos of the account), "playlists", "list" or "other".
function request(text) {
  var line = text.split("\n")[0]
  var search = SEARCH.exec(line)
  if (search) return { kind: "search", query: search[2], label: "query \"" + search[2] + "\" page 1" }
  var watch = WATCH.exec(line)
  if (watch) return { kind: watch[2] ? "mix" : "video", id: watch[1], label: "[youtube] " + watch[1] }
  var feed = FEED.exec(line)
  if (feed) {
    var feedKind = feed[1] === "playlists" ? "playlists" : "feed"
    return { kind: feedKind, id: feed[1], label: "[youtube:tab] " + feed[1] }
  }
  var list = LIST.exec(line)
  if (list) {
    // Watch Later is a list only the account has.
    return { kind: list[1] === "WL" ? "feed" : "list", id: list[1], label: "[youtube:tab] " + list[1] }
  }
  return { kind: "other", label: "[generic] input" }
}

// The rows of the playlists feed: two that can be opened, and one entry
// that is a video and does not belong there.
function playlists() {
  var row = function(id, title, count) {
    return {
      _type: "url", ie_key: "YoutubeTab", id: id, title: title, playlist_count: count,
      url: "https://www.youtube.com/playlist?list=" + id
    }
  }
  return {
    _type: "playlist", id: "playlists", title: "Synthetic playlists", extractor_key: "YoutubeTab",
    entries: [
      row("PLsynthetic0000000000000000000001", "Synthetic playlist one", 12),
      { _type: "url", ie_key: "Youtube", id: FIXTURE_ID, title: "Synthetic video among playlists" },
      row("PLsynthetic0000000000000000000002", "Synthetic playlist two", 3)
    ]
  }
}

function video(id) {
  return fixture("video.json").split(FIXTURE_ID).join(id)
}

// The range "--playlist-items" names, cut out of a list answer.
function ranged(text) {
  var items = ITEMS.exec(String(valueOf("--playlist-items")))
  if (items === null) return text
  var answer = JSON.parse(text)
  answer.entries = answer.entries.slice(Math.max(Number(items[1]), 1) - 1, Number(items[2]))
  return dump(answer)
}

function answer(asked) {
  if (asked.kind === "video" && scenario.name === "moved") {
    return video(asked.id).split(MEDIA_HOST).join(MOVED_HOST)
  }
  if (asked.kind === "video") return video(asked.id)
  if (asked.kind === "mix") {
    if (scenario.name === "no-mix") return video(asked.id)
    return ranged(fixture("mix.json").split(FIXTURE_ID).join(asked.id))
  }
  if (asked.kind === "search" || asked.kind === "feed" || asked.kind === "list") {
    return ranged(fixture("search.json"))
  }
  if (asked.kind === "playlists") return ranged(dump(playlists()))
  return null
}

// size: 0, or the number of bytes the answer is padded to. The blanks go
// in front of the final line break, where JSON allows them.
function succeed(asked, size) {
  var text = answer(asked)
  if (text === null) { fail(asked.label + ": Unsupported URL"); return }
  if (argv.indexOf("-J") === -1) { finish(0); return }
  if (size > text.length) text = text.slice(0, -1) + " ".repeat(size - text.length) + "\n"
  process.stdout.write(text)
  finish(0)
}

function needsAccount(asked) {
  fail(asked.label + ": Sign in to confirm your age. Use --cookies-from-browser or --cookies for the "
    + "authentication")
}

function respond(asked, jar) {
  var name = scenario.name
  var signedIn = jar !== null && jar.login
  var unreachable = "Unable to download API page: HTTPSConnection(host='www.youtube.com', port=443): "
    + "Failed to establish a new connection: [Errno 101] Network is unreachable"
  var ownList = asked.kind === "feed" || asked.kind === "playlists"
  if (name === "signed-out" && jar !== null) {
    process.stderr.write("WARNING: [youtube] The provided YouTube account cookies are no longer valid. "
      + "They have likely been rotated in the browser as a security measure.\n")
    succeed(asked, 0)
  } else if (ownList && !signedIn && (ANSWERED.indexOf(name) !== -1 || name === "empty")) {
    fail(asked.label + ": This list belongs to an account; login required")
  } else if (["ok", "signed-out", "no-mix", "moved"].indexOf(name) !== -1) succeed(asked, 0)
  else if (name === "slow") setTimeout(function() { succeed(asked, 0) }, Number(scenario.arg) || 0)
  else if (name === "big") succeed(asked, Number(scenario.arg) || 0)
  else if (name === "empty") {
    process.stdout.write(JSON.stringify({ _type: "playlist", id: "synthetic", entries: [] }) + "\n")
    finish(0)
  } else if (name === "refused") fail(asked.label + ": Private video")
  else if (name === "account") needsAccount(asked)
  else if (name === "restricted") {
    if (signedIn) succeed(asked, 0)
    else needsAccount(asked)
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
    process.stdout.write(video("ZZZZZZZZZZZ"))
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

// True when the command line leaves videos marked as watched: the last of
// the two flags decides, as in the real tool.
function marks() {
  return argv.lastIndexOf("--mark-watched") > argv.lastIndexOf("--no-mark-watched")
}

// Remembers a video YouTube would now count as watched. The real tool
// reports that at the moment it has looked the video up.
function noteWatched(asked) {
  if (asked.kind !== "video" || !marks() || ANSWERED.indexOf(scenario.name) === -1) return
  var state = stub.readState({ marked: [] })
  var marked = Array.isArray(state.marked) ? state.marked : []
  marked.push(asked.id)
  stub.writeState({ marked: marked })
}

// A reader that went away is how a flood normally ends.
process.stdout.on("error", function() { process.exit(0) })

if (argv.indexOf("--cookies-from-browser") !== -1) {
  exportCookies()
} else {
  lib.readStdin(function(text) {
    var jar = takeJar()
    var entry = { argv: argv, stdin: text, env: Object.keys(process.env).sort() }
    if (jar !== null) entry.jar = jar
    stub.record(entry)
    // Without these the real tool would not read standard input at all, or
    // would print nothing to read.
    var batch = argv.indexOf("-a")
    var prints = argv.indexOf("-J") !== -1 || argv.indexOf("--simulate") !== -1
    if (batch === -1 || argv[batch + 1] !== "-" || !prints) {
      process.stderr.write("Usage: yt-dlp [OPTIONS] URL [URL...]\n\nyt-dlp: error: no input was named\n")
      process.exit(EXIT_USAGE)
    }
    process.stderr.write("Reading URLs from STDIN - EOF (Ctrl+D) to end:\n")
    var asked = request(text)
    noteWatched(asked)
    respond(asked, jar)
  })
}
