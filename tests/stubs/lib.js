"use strict"
// Shared helper of the stub tools (probe.js, mpv.js, yt-dlp.js,
// yt-dlp-account.js, curl.js, hyprctl.js, xdg-settings.js, browser.js). A
// stub stands in for a real program inside a harness run. It sees only the
// scrubbed environment the plugin gave it and finds the run's record
// directory, <XDG_RUNTIME_DIR>/oj-stub, through that environment.
//
// For every stub this file owns: the PID record the launcher's leak check
// reads, the log of what the stub was started with, the scenario the case
// wrote for it, and what a stub that is started once per request remembers
// from one run to the next. It is required by the stubs and is not
// executable.
var fs = require("fs")
var path = require("path")

// Exit code of a stub that was started outside a harness run. It has no
// directory to record in, and a stub that cannot be watched must not run.
var EXIT_NO_RUN = 70

function fail(message) {
  process.stderr.write("stub: " + message + "\n")
  process.exit(EXIT_NO_RUN)
}

// Announces this process as the stub named tool ("mpv", "ytdlp", "curl",
// "probe", ...) and returns its handle. Writes oj-stub/<tool>.<pid>.pid at
// once; the file is removed again when the process exits by itself, and
// stays behind when it is ended by a signal it does not handle (the
// launcher then finds the PID gone, which is all it asks).
function start(tool) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(String(tool))) fail("bad tool name")
  var base = process.env.XDG_RUNTIME_DIR
  if (typeof base !== "string" || !base.startsWith("/")) fail("XDG_RUNTIME_DIR is not set")
  var dir = path.join(base, "oj-stub")
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail("not inside a harness run")

  var pidFile = path.join(dir, tool + "." + process.pid + ".pid")
  fs.writeFileSync(pidFile, String(process.pid))
  process.on("exit", function() {
    try {
      fs.unlinkSync(pidFile)
    } catch (error) {
      // Already gone with the run directory.
    }
  })

  var logFile = path.join(dir, tool + ".jsonl")

  // Appends one object as one line to oj-stub/<tool>.jsonl.
  function record(entry) {
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n")
  }

  // The usual record of a start: the arguments, what arrived on stdin (null
  // when the stub did not read it) and the names, never the values, of the
  // environment variables it was given.
  function recordStart(stdin) {
    record({
      argv: process.argv.slice(2),
      stdin: typeof stdin === "string" ? stdin : null,
      env: Object.keys(process.env).sort()
    })
  }

  // What the case wrote with h.scenario(), whole. {} when it wrote nothing.
  function scenarios() {
    try {
      var parsed = JSON.parse(fs.readFileSync(path.join(dir, "scenario.json"), "utf8"))
      return parsed !== null && typeof parsed === "object" ? parsed : {}
    } catch (error) {
      return {}
    }
  }

  // This stub's own entry of the scenario as { name, arg }: "slow:300" is
  // { name: "slow", arg: "300" }, and no entry is { name: "ok", arg: "" }.
  function scenario() {
    var all = scenarios()
    var value = Object.prototype.hasOwnProperty.call(all, tool) ? String(all[tool]) : "ok"
    var cut = value.indexOf(":")
    return cut === -1 ? { name: value, arg: "" } : { name: value.slice(0, cut), arg: value.slice(cut + 1) }
  }

  // Lines the case queued with h.inject(tool, ...) that this process has
  // not taken yet, parsed. The file is read from where the last call ended.
  var injectOffset = 0
  function takeInjected() {
    var text = ""
    try {
      text = fs.readFileSync(path.join(dir, tool + ".inject"), "utf8")
    } catch (error) {
      return []
    }
    var end = text.lastIndexOf("\n") + 1
    var lines = text.slice(injectOffset, end).split("\n")
    injectOffset = end
    var commands = []
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === "") continue
      try {
        commands.push(JSON.parse(lines[i]))
      } catch (error) {
        // Not a command; nothing to run.
      }
    }
    return commands
  }

  // What this stub kept from its earlier runs (oj-stub/<tool>.state.json),
  // or fallback when there is nothing yet. A case can read and seed the
  // same file through the harness.
  var stateFile = path.join(dir, tool + ".state.json")
  function readState(fallback) {
    try {
      return JSON.parse(fs.readFileSync(stateFile, "utf8"))
    } catch (error) {
      return fallback === undefined ? null : fallback
    }
  }

  // Written beside the file and renamed over it, so that a case which reads
  // while the stub writes sees the old state or the new one, never half.
  function writeState(state) {
    var next = stateFile + "." + process.pid
    fs.writeFileSync(next, JSON.stringify(state))
    fs.renameSync(next, stateFile)
  }

  return {
    tool: tool,
    dir: dir,
    record: record,
    recordStart: recordStart,
    scenario: scenario,
    scenarios: scenarios,
    takeInjected: takeInjected,
    readState: readState,
    writeState: writeState
  }
}

// Reads standard input to its end as UTF-8 text, then calls done(text).
function readStdin(done) {
  var chunks = []
  process.stdin.on("data", function(chunk) { chunks.push(chunk) })
  process.stdin.on("end", function() { done(Buffer.concat(chunks).toString("utf8")) })
  process.stdin.on("error", function() { done(Buffer.concat(chunks).toString("utf8")) })
  process.stdin.resume()
}

module.exports = { start: start, readStdin: readStdin, EXIT_NO_RUN: EXIT_NO_RUN }
