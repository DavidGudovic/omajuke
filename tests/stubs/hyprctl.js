#!/usr/bin/node
"use strict"
// Stands in for hyprctl inside a harness run. The real tool asks a running
// compositor; this one answers from a small made-up desktop that it keeps in
// oj-stub/hyprctl.state.json, because it is started once per request and has
// no other memory. No compositor is involved, and nothing here could reach
// one: the instance signature a harness run carries names no socket.
//
// Requests it knows, by their exact arguments:
//
//   -j version              the release, as JSON
//   configerrors            the errors of the user's configuration, as text
//   -j monitors             the monitor list
//   -j clients              the window list
//   -j getoption <name>     one option of the table
//   binds                   the key bindings, in the plain listing format;
//                           with an empty table the line the compositor
//                           prints for every empty result, "unknown request"
//   eval -- <code>          runs one line of Lua and prints "ok"
//
// Only three kinds of line can be run, the ones the plugin has templates
// for. A key binding is added to the table of bindings, a removal takes out
// every binding registered under that exact spelling, and the window rule
// is counted and its signature kept, unless the same signature is already
// there. Like the compositor, every eval empties the list of configuration
// errors. Anything else is answered with an error line and changes nothing.
//
// The state, every key optional (h.setStubState("hyprctl", { ... })):
//
//   version        text, "0.56.2" when not given
//   configErrors   text, "" for a sound configuration
//   monitors       list of monitor entries (one full-HD monitor by default)
//   clients        list of window entries (none by default)
//   options        option name -> the value part of its answer, and
//                  "set" where it matters (else true, and false for a text
//                  option that holds the marker of an unset one)
//   binds          list of bindings: { modmask, key, description } and,
//                  when they matter, header, submap, keycode, catchall,
//                  dispatcher, arg and spelling (the text the binding was
//                  registered with; a removal compares against it)
//   rule           signature of the window rule that is registered, or ""
//   ruleCount      how often a rule was registered
//   appear         list of { at, bind }: the binding joins the table right
//                  before the listing number at is printed (the first one
//                  is 1), as if somebody had registered it meanwhile
//   listings       how many listings were printed; counted only while
//                  something is still to appear
//
// Every start is recorded through lib.js (arguments and the names of the
// environment variables). The scenario the case wrote under "hyprctl"
// chooses how a request ends; where a request can be named, the scenario
// applies to that one only ("hang:clients"), else to every request:
//
//   ok                   answered from the state (the default)
//   fail[:<request>]     exit 1 and an error line, as without a compositor
//   garbage[:<request>]  exit 0, and output that is not an answer
//   empty[:<request>]    exit 0 and only the line break the tool adds: the
//                        answer of a compositor that went down meanwhile
//   hang[:<request>]     no answer; waits until it is ended
//   slow:<ms>            every answer comes after that many milliseconds
//   refuse               an eval is answered with an error line, exit 0
//   silent               an eval is answered with nothing, exit 0
//   noisy                an eval is answered with "ok" and a second line
var fs = require("fs")
var path = require("path")
var lib = require("./lib.js")

var EXIT_FAILED = 1
// How long a request waits for another one to finish with the state.
var LOCK_WAIT_MS = 2000
var LOCK_STEP_MS = 5

// The modifier names a registered combination may hold, and the bit each
// has in the listing.
var MODIFIERS = { MOD4: 64, CONTROL: 4, MOD1: 8, SHIFT: 1 }

// What the compositor prints for a result that is empty, and as the value
// of a text option nobody has set.
var NO_RESULT = "unknown request"
var UNSET = "[[EMPTY]]"

var BIND = new RegExp("^hl\\.bind\\(\"([A-Z0-9 +]{1,64})\", hl\\.dsp\\.exec_cmd\\(\"([^\"]{1,200})\"\\),"
  + " \\{ description = \"([^\"]{1,100})\" \\}\\)$")
var UNBIND = /^hl\.unbind\("([A-Z0-9 +]{1,64})"\)$/
var RULE = new RegExp("^if _G\\.__([a-z0-9]+)_rule ~= \"([0-9a-z-]{1,32})\" then"
  + " hl\\.window_rule\\(\\{ name = \"[a-z0-9-]+\", match = \\{ class = \"[^\"]+\" \\},[^{}]*"
  + " size = \\{ [^{}]* \\}, move = \\{ [^{}]* \\} \\}\\)"
  + " _G\\.__([a-z0-9]+)_rule = \"([0-9a-z-]{1,32})\" end$")

var stub = lib.start("hyprctl")
// Read before the start is recorded: a case that waits for the record may
// then write the scenario of the next start.
var scenario = stub.scenario()
var argv = process.argv.slice(2)
stub.recordStart(null)

function defaults() {
  return {
    version: "0.56.2",
    configErrors: "",
    monitors: [{
      id: 0, name: "DP-1", description: "Synthetic monitor", width: 1920, height: 1080, refreshRate: 60,
      x: 0, y: 0, scale: 1, transform: 0, focused: true, reserved: [0, 30, 0, 0]
    }],
    clients: [],
    options: {
      "general:gaps_out": { css: "5 5 5 5" },
      "input:kb_layout": { str: "us" },
      "input:kb_variant": { str: "[[EMPTY]]" },
      "input:resolve_binds_by_sym": { bool: false, set: false },
      "input:kb_file": { str: "[[EMPTY]]" }
    },
    binds: [],
    rule: "",
    ruleCount: 0,
    appear: [],
    listings: 0,
    nextArg: 1
  }
}

// What the case or an earlier run wrote, with a default for every key it
// left out.
function loadState() {
  var state = defaults()
  var saved = stub.readState({})
  if (saved === null || typeof saved !== "object") return state
  Object.keys(state).forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(saved, key)) state[key] = saved[key]
  })
  return state
}

// Runs work() while no other request changes the state. Two requests can
// run at the same moment (the removals a service sends on its way out do),
// and each of them reads the state, changes it and writes it back. The
// compositor takes one request at a time; a lock directory makes this
// stand-in do the same. A lock that a request ended by force left behind
// is not waited for longer than a moment.
function alone(work) {
  var lock = path.join(stub.dir, "hyprctl.lock")
  var pause = new Int32Array(new SharedArrayBuffer(4))
  var until = Date.now() + LOCK_WAIT_MS
  var held = false
  while (!held && Date.now() < until) {
    try {
      fs.mkdirSync(lock)
      held = true
    } catch (error) {
      Atomics.wait(pause, 0, 0, LOCK_STEP_MS)
    }
  }
  try {
    return work()
  } finally {
    try {
      fs.rmdirSync(lock)
    } catch (error) {
      // Taken away by the request that waited too long for it.
    }
  }
}

// Which of the known requests this is, or "" for anything else.
function request() {
  var line = JSON.stringify(argv)
  if (line === "[\"-j\",\"version\"]") return "version"
  if (line === "[\"configerrors\"]") return "configerrors"
  if (line === "[\"-j\",\"monitors\"]") return "monitors"
  if (line === "[\"-j\",\"clients\"]") return "clients"
  if (line === "[\"binds\"]") return "binds"
  if (argv.length === 3 && argv[0] === "-j" && argv[1] === "getoption") return "getoption"
  if (argv.length === 3 && argv[0] === "eval" && argv[1] === "--") return "eval"
  return ""
}

// Ends the process once everything written to standard output has left.
function finish(text, code) {
  process.stdout.write(text, function() { process.exit(code) })
}

function fail(reason) {
  process.stderr.write(reason + "\n")
  process.exit(EXIT_FAILED)
}

function versionAnswer(state) {
  return JSON.stringify({
    branch: "", commit: "0000000000000000000000000000000000000000", version: String(state.version),
    dirty: false, commit_message: "synthetic", commit_date: "", tag: "v" + state.version, commits: "0",
    flags: []
  }) + "\n"
}

// One option, spaced the way the compositor prints it. The name may be
// written with a colon or with a dot, and comes back as it was asked for.
function optionAnswer(state, name) {
  var options = state.options !== null && typeof state.options === "object" ? state.options : {}
  var known = String(name).replace(".", ":")
  if (!Object.prototype.hasOwnProperty.call(options, known)) return "no such option\n"
  var value = options[known]
  var parts = ["\"option\": " + JSON.stringify(String(name))]
  Object.keys(value).forEach(function(key) {
    if (key !== "set") parts.push(JSON.stringify(key) + ": " + JSON.stringify(value[key]))
  })
  var set = Object.prototype.hasOwnProperty.call(value, "set") ? value.set === true : value.str !== UNSET
  parts.push("\"set\": " + String(set))
  return "{" + parts.join(", ") + " }\n"
}

// One record of the listing. Every record ends with an empty line.
function record(bind) {
  var description = typeof bind.description === "string" ? bind.description : ""
  var field = function(name, fallback) {
    return Object.prototype.hasOwnProperty.call(bind, name) ? String(bind[name]) : fallback
  }
  return [
    field("header", description === "" ? "bind" : "bindd"),
    "\tmodmask: " + field("modmask", "0"),
    "\tsubmap: " + field("submap", ""),
    "\tkey: " + field("key", ""),
    "\tkeycode: " + field("keycode", "0"),
    "\tcatchall: " + field("catchall", "false"),
    "\tdescription: " + description,
    "\tdispatcher: " + field("dispatcher", "exec"),
    "\targ: " + field("arg", "")
  ].join("\n") + "\n\n"
}

// The compositor cannot print an empty result: a desktop without a single
// binding gets the line it has for that, and no record.
function listing(state) {
  var binds = Array.isArray(state.binds) ? state.binds : []
  if (binds.length === 0) return NO_RESULT + "\n"
  return binds.map(record).join("") + "\n"
}

// The errors, one per line, and the line break the tool adds to every
// answer. Without errors that is two empty lines.
function errorsAnswer(state) {
  return String(state.configErrors) + "\n\n"
}

// Lets the bindings that were set to appear before this listing join the
// table. Nothing is counted or written when none is waiting.
function arrivals(state) {
  var waiting = Array.isArray(state.appear) ? state.appear : []
  if (waiting.length === 0) return state
  state.listings = Number(state.listings) + 1
  if (!Array.isArray(state.binds)) state.binds = []
  state.appear = waiting.filter(function(entry) {
    if (Number(entry.at) !== state.listings) return true
    state.binds.push(entry.bind)
    return false
  })
  stub.writeState(state)
  return state
}

// The compositor compares the texts of two combinations without their
// spaces and without regard to case.
function normalised(spelling) {
  return String(spelling).split(" ").join("").toUpperCase()
}

// A combination in the spelling the plugin registers: its modifier bits and
// its key, or null when a part of it is no modifier of that spelling.
function combination(alias) {
  var parts = alias.split(" + ")
  var modmask = 0
  for (var i = 0; i < parts.length - 1; i++) {
    if (!Object.prototype.hasOwnProperty.call(MODIFIERS, parts[i])) return null
    modmask |= MODIFIERS[parts[i]]
  }
  return { modmask: modmask, key: parts[parts.length - 1] }
}

// Runs one line. Returns "" when it was one of the three known kinds, else
// the error the compositor would answer with.
function run(code, state) {
  var bind = BIND.exec(code)
  if (bind !== null) {
    var combo = combination(bind[1])
    if (combo === null) return "error: invalid key combination"
    if (!Array.isArray(state.binds)) state.binds = []
    // A second binding on the same keys does not replace the first: both
    // are listed, as on the real desktop.
    state.binds.push({
      header: "bindd", modmask: combo.modmask, submap: "", key: combo.key, keycode: 0, catchall: false,
      description: bind[3], dispatcher: "__lua", arg: state.nextArg, spelling: bind[1], command: bind[2]
    })
    state.nextArg = Number(state.nextArg) + 1
    return ""
  }
  var unbind = UNBIND.exec(code)
  if (unbind !== null) {
    var gone = normalised(unbind[1])
    state.binds = (Array.isArray(state.binds) ? state.binds : []).filter(function(entry) {
      return typeof entry.spelling !== "string" || normalised(entry.spelling) !== gone
    })
    return ""
  }
  var rule = RULE.exec(code)
  if (rule !== null && rule[1] === rule[3] && rule[2] === rule[4]) {
    // The line itself skips the registration when its signature is the one
    // that is already there.
    if (state.rule !== rule[2]) {
      state.rule = rule[2]
      state.ruleCount = Number(state.ruleCount) + 1
    }
    return ""
  }
  return "error: this stand-in runs only the three lines the plugin has templates for"
}

function evaluate() {
  if (scenario.name === "refuse") { finish("error: attempt to call a nil value\n", 0); return }
  if (scenario.name === "silent") { finish("", 0); return }
  var error = alone(function() {
    var state = loadState()
    var problem = run(argv[2], state)
    // Every eval empties the compositor's list of configuration errors,
    // whatever the line did.
    state.configErrors = ""
    stub.writeState(state)
    return problem
  })
  if (error !== "") { finish(error + "\n", 0); return }
  finish(scenario.name === "noisy" ? "ok\nok\n" : "ok\n", 0)
}

function answer(kind) {
  if (kind === "eval") { evaluate(); return }
  if (kind === "binds") {
    finish(alone(function() { return listing(arrivals(loadState())) }), 0)
    return
  }
  var state = loadState()
  if (kind === "version") finish(versionAnswer(state), 0)
  else if (kind === "configerrors") finish(errorsAnswer(state), 0)
  else if (kind === "monitors") finish(JSON.stringify(state.monitors) + "\n", 0)
  else if (kind === "clients") finish(JSON.stringify(state.clients) + "\n", 0)
  else finish(optionAnswer(state, argv[2]), 0)
}

function respond() {
  var kind = request()
  if (kind === "") fail("unknown request")
  var applies = scenario.arg === "" || scenario.arg === kind
  if (scenario.name === "fail" && applies) fail("Couldn't connect to the compositor socket")
  if (scenario.name === "garbage" && applies) {
    finish("<html><body>not an answer</body></html>\n", 0)
    return
  }
  if (scenario.name === "empty" && applies) { finish("\n", 0); return }
  if (scenario.name === "hang" && applies) { setInterval(function() {}, 60000); return }
  if (scenario.name === "slow") {
    setTimeout(function() { answer(kind) }, Number(scenario.arg) || 0)
    return
  }
  answer(kind)
}

respond()
