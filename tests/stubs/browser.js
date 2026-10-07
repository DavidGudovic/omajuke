#!/usr/bin/node
"use strict"
// Stands in for a web browser inside a harness run: the window a user would
// sign in to YouTube in. No window is opened and nothing is fetched. Like a
// real browser it is given a profile directory on its command line
// ("--user-data-dir=<dir>" or "--profile <dir>"), leaves a cookie store in
// it, and runs until its "window" is closed.
//
// The cookie store is a made-up one: a JSON file of rows at the place the
// real store of that browser family would be. Every value in it is
// invented, and each begins with "invented-", so that a case can look for
// that word in places a cookie must never reach. The stand-in for yt-dlp
// that exports a login (yt-dlp-account.js) reads this file.
//
// Every start is recorded: the arguments, the names of the environment
// variables, the value of XDG_CONFIG_HOME (a browser's start script reads
// extra flags from a file below it) and what that directory holds. The
// scenario the case wrote under "browser" chooses what the user "does":
//
//   ok                signs in and closes the window at once (the default)
//   visitor           closes the window without having signed in
//   no-store          closes the window before any cookie was written
//   stay              signs in and leaves the window open until it is ended
//   ignore-term:<ms>  the same, and when asked to end takes that long
//   exit:<n>          signs in, then ends with exit code n
var fs = require("fs")
var path = require("path")
var lib = require("./lib.js")

// One row of the made-up store: [domain, name, value, httpOnly].
var OTHER_SITES = [
  [".accounts.example", "SID", "invented-account-session", true],
  [".accounts.example", "LOGIN_INFO", "invented-elsewhere", true],
  [".example.com", "session", "invented-other-site", false],
  ["notyoutube.com.example", "SAPISID", "invented-lookalike", false],
  [".youtube.com.example", "LOGIN_INFO", "invented-lookalike-suffix", true]
]
var VISITOR = [
  [".youtube.com", "VISITOR_INFO1_LIVE", "invented-visitor", true],
  [".youtube.com", "PREF", "invented-preferences", false]
]
var ACCOUNT = [
  [".youtube.com", "LOGIN_INFO", "invented-login", true],
  [".youtube.com", "SAPISID", "invented-key", false],
  [".youtube.com", "__Secure-3PAPISID", "invented-key-3p", false],
  ["www.youtube.com", "CONSISTENCY", "invented-consistency", false],
  ["youtube.com", "SIDCC", "invented-sidcc", false]
]

var stub = lib.start("browser")
// Read before the start is recorded: a case that waits for the record may
// then write the scenario of the next start.
var scenario = stub.scenario()
var argv = process.argv.slice(2)

// The profile directory and the browser family, from the command line the
// way each family is told about it, or null.
function profile() {
  for (var i = 0; i < argv.length; i++) {
    if (argv[i].indexOf("--user-data-dir=") === 0) {
      return { family: "chromium", dir: argv[i].slice("--user-data-dir=".length) }
    }
    if (argv[i] === "--profile" && typeof argv[i + 1] === "string") {
      return { family: "firefox", dir: argv[i + 1] }
    }
  }
  return null
}

// Where the real browser of that family keeps its cookies.
function storeFile(target) {
  return target.family === "firefox" ? path.join(target.dir, "cookies.sqlite")
    : path.join(target.dir, "Default", "Cookies")
}

// Leaves what a browser leaves in a profile it has used: the cookie store,
// and other files and directories around it, with the permissions the
// process's own umask gives them.
function writeStore(target, rows) {
  fs.mkdirSync(path.join(target.dir, "Default", "Cache", "data"), { recursive: true })
  fs.writeFileSync(path.join(target.dir, "Default", "Cache", "data", "block"), "invented-cache\n")
  fs.writeFileSync(path.join(target.dir, "Local State"), "{}\n")
  fs.writeFileSync(storeFile(target), JSON.stringify({ rows: rows }) + "\n")
}

function listing(dir) {
  try {
    return fs.readdirSync(dir).sort()
  } catch (error) {
    return null
  }
}

function wait() {
  setInterval(function() {}, 60000)
}

var target = profile()
var configHome = typeof process.env.XDG_CONFIG_HOME === "string" ? process.env.XDG_CONFIG_HOME : null

// Asked to end while the window is open: the handler is in place before
// the start is recorded, so a case that waits for the record knows how the
// stub will take the signal.
if (scenario.name === "ignore-term") {
  process.on("SIGTERM", function() {
    setTimeout(function() { process.exit(0) }, Number(scenario.arg) || 0)
  })
}

// A real browser is talkative on both outputs. The plugin must not keep or
// log any of it.
process.stdout.write("browser-stub: a line on standard output\n")
process.stderr.write("browser-stub: a line on standard error\n")

if (target !== null && scenario.name !== "no-store") {
  try {
    writeStore(target, OTHER_SITES.concat(VISITOR, scenario.name === "visitor" ? [] : ACCOUNT))
  } catch (error) {
    process.stderr.write("browser-stub: the profile cannot be written\n")
  }
}

stub.record({
  argv: argv,
  stdin: null,
  env: Object.keys(process.env).sort(),
  configHome: configHome,
  configEntries: configHome === null ? null : listing(configHome),
  profile: target === null ? null : target.dir,
  profileEntries: target === null ? null : listing(target.dir)
})

if (scenario.name === "stay" || scenario.name === "ignore-term") wait()
else if (scenario.name === "exit") process.exit(Number(scenario.arg) || 0)
else process.exit(0)
