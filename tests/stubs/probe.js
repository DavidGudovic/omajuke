#!/usr/bin/node
"use strict"
// The generic child for process-runner cases. It is run in place of a real
// tool and does one simple thing, chosen by its first argument, so that a
// case can watch how the runner treats a child that answers, hangs, floods,
// ignores SIGTERM or fails:
//
//   echo           print standard input
//   env            print the names of the environment variables, sorted
//   value:<name>   print the value of that environment variable, or nothing
//   state:<text>   add the text to the list the probe keeps between its
//                  runs, and print the list as JSON
//   hang           wait until it is ended
//   linger         print "partial", then wait until it is ended
//   flood          print without end
//   ignore-term    wait, and do not end on SIGTERM
//   tree           start a second probe that hangs, then hang as well
//   sleep:<ms>     print "done" after that many milliseconds
//   exit:<n>       print "out", write "err" to standard error, exit with n
//   stderr:<n>     write n characters to standard error
//   write:<path>   create that file with default permissions
//   -k ...         what it is given when it is run in place of timeout:
//                  enforce nothing, start nothing, ignore SIGTERM and wait
//   --ignore-config ...
//                  what it is given when it is run in place of yt-dlp to
//                  export a browser's cookies: write a cookie file of
//                  invented rows where --cookies points and, like the real
//                  tool run without an address, exit with 2
//
// Anything else is recorded and answered with exit code 64. Every start is
// recorded through lib.js before the mode does its work.
var childProcess = require("child_process")
var fs = require("fs")
var lib = require("./lib.js")

var EXIT_UNKNOWN_MODE = 64
var EXIT_NO_ADDRESS = 2

// One row of a cookie file: seven fields with tabs between them.
function cookieRow(domain, name, value) {
  return [domain, "TRUE", "/", "TRUE", "1893456000", name, value].join("\t")
}

// What the stand-in for a cookie export writes: a signed-in session's two
// rows for YouTube, one of them marked HttpOnly, among rows of other sites.
var COOKIE_FILE = [
  "# Netscape HTTP Cookie File",
  "# Written by a test.",
  "",
  cookieRow(".example.com", "session", "invented-other"),
  "#HttpOnly_" + cookieRow(".youtube.com", "LOGIN_INFO", "invented-login"),
  "#HttpOnly_" + cookieRow(".accounts.example", "LOGIN_INFO", "invented-elsewhere"),
  cookieRow(".youtube.com", "SAPISID", "invented-key")
].join("\n") + "\n"

var stub = lib.start("probe")
var mode = String(process.argv[2] || "")
var cut = mode.indexOf(":")
var name = cut === -1 ? mode : mode.slice(0, cut)
var arg = cut === -1 ? "" : mode.slice(cut + 1)

// Keeps the process alive without doing anything.
function wait() {
  setInterval(function() {}, 60000)
}

// Ends the process once everything written to standard output has left.
function finish(code) {
  process.stdout.write("", function() { process.exit(code) })
}

// A reader that went away is how a flood normally ends.
process.stdout.on("error", function() { process.exit(0) })

if (name === "echo") {
  lib.readStdin(function(text) {
    stub.recordStart(text)
    process.stdout.write(text, function() { process.exit(0) })
  })
} else if (name === "env") {
  stub.recordStart(null)
  process.stdout.write(Object.keys(process.env).sort().join("\n") + "\n")
  finish(0)
} else if (name === "value") {
  stub.recordStart(null)
  var value = Object.prototype.hasOwnProperty.call(process.env, arg) ? process.env[arg] : ""
  process.stdout.write(value + "\n")
  finish(0)
} else if (name === "state") {
  stub.recordStart(null)
  var kept = stub.readState([])
  var list = Array.isArray(kept) ? kept.concat([arg]) : [arg]
  stub.writeState(list)
  process.stdout.write(JSON.stringify(list) + "\n")
  finish(0)
} else if (name === "hang") {
  stub.recordStart(null)
  wait()
} else if (name === "linger") {
  stub.recordStart(null)
  process.stdout.write("partial\n")
  wait()
} else if (name === "flood") {
  stub.recordStart(null)
  var block = "x".repeat(65536)
  var pour = function() { process.stdout.write(block, function() { setImmediate(pour) }) }
  pour()
} else if (name === "ignore-term" || name === "-k") {
  // The handler is in place before the start is recorded, so a case that
  // waits for the record knows SIGTERM will be ignored.
  process.on("SIGTERM", function() {})
  stub.recordStart(null)
  wait()
} else if (name === "--ignore-config") {
  stub.recordStart(null)
  var flag = process.argv.indexOf("--cookies")
  if (flag !== -1 && typeof process.argv[flag + 1] === "string") {
    fs.writeFileSync(process.argv[flag + 1], COOKIE_FILE)
  }
  finish(EXIT_NO_ADDRESS)
} else if (name === "tree") {
  // The second probe gets no pipe of ours: it must not keep the runner's
  // read of this process's output open.
  childProcess.spawn(process.execPath, [__filename, "hang"], { stdio: "ignore" })
  stub.recordStart(null)
  wait()
} else if (name === "sleep") {
  stub.recordStart(null)
  setTimeout(function() {
    process.stdout.write("done\n")
    finish(0)
  }, Number(arg) || 0)
} else if (name === "exit") {
  stub.recordStart(null)
  process.stderr.write("err\n")
  process.stdout.write("out\n")
  finish(Number(arg) || 0)
} else if (name === "stderr") {
  stub.recordStart(null)
  process.stderr.write("e".repeat(Number(arg) || 0), function() { process.exit(0) })
} else if (name === "write") {
  stub.recordStart(null)
  fs.writeFileSync(arg, "written\n")
  finish(0)
} else {
  stub.recordStart(null)
  finish(EXIT_UNKNOWN_MODE)
}
