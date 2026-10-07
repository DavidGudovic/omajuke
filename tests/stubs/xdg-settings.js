#!/usr/bin/node
"use strict"
// Stands in for xdg-settings inside a harness run. The plugin asks it one
// question, "which is the default web browser", and reads the answer as
// text from outside: one desktop id on one line. Nothing of the machine the
// test runs on is looked at.
//
// Every start is recorded through lib.js (arguments, names of the
// environment variables). The scenario the case wrote under "xdg-settings"
// chooses the answer:
//
//   ok             "chromium.desktop" and a line break (the default)
//   id:<text>      that text and a line break
//   raw:<text>     that text exactly, without a line break
//   silent         nothing, exit 0
//   fail           an error line, exit 1
//   flood          output without end
//   hang           no answer; waits until it is ended
var lib = require("./lib.js")

var DEFAULT_ID = "chromium.desktop"
var EXIT_FAILED = 1
var EXIT_USAGE = 2

var stub = lib.start("xdg-settings")
// Read before the start is recorded: a case that waits for the record may
// then write the scenario of the next start.
var scenario = stub.scenario()
var argv = process.argv.slice(2)

// Ends the process once everything written to standard output has left.
function finish(code) {
  process.stdout.write("", function() { process.exit(code) })
}

// A reader that went away is how a flood normally ends.
process.stdout.on("error", function() { process.exit(0) })

stub.recordStart(null)

if (argv.length !== 2 || argv[0] !== "get" || argv[1] !== "default-web-browser") {
  // The one question the plugin may ask. Anything else is a bug in it.
  process.stderr.write("xdg-settings: unknown request\n")
  process.exit(EXIT_USAGE)
} else if (scenario.name === "ok") {
  process.stdout.write(DEFAULT_ID + "\n")
  finish(0)
} else if (scenario.name === "id") {
  process.stdout.write(scenario.arg + "\n")
  finish(0)
} else if (scenario.name === "raw") {
  process.stdout.write(scenario.arg)
  finish(0)
} else if (scenario.name === "silent") {
  finish(0)
} else if (scenario.name === "flood") {
  var block = "chromium.desktop\n".repeat(4096)
  var pour = function() { process.stdout.write(block, function() { setImmediate(pour) }) }
  pour()
} else if (scenario.name === "hang") {
  setInterval(function() {}, 60000)
} else {
  process.stderr.write("xdg-settings: no default browser is known\n")
  process.exit(EXIT_FAILED)
}
