"use strict"
// Tests for lib/Errors.js: the vector table (also run inside Qt's engine),
// the wording of every code, the split into "skip this track" and "stop",
// and the order in which a yt-dlp error line is classified.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Errors = load.lib("Errors")
var table = load.vectors("errors")

// Every code of this version with its sentence. Written out a second time
// on purpose: a change of wording has to be made here as well, and so is
// seen by whoever reviews it.
var TEXTS = [
  ["E_YTDLP_MISSING", "yt-dlp is not installed"],
  ["E_MPV_MISSING", "mpv is not installed"],
  ["E_TOOLS_MISSING", "Required system tools are missing"],
  ["E_RUNTIME_DIR", "OmaJuke cannot use its runtime folder"],
  ["E_NETWORK", "No network"],
  ["E_STREAM", "YouTube's stream did not open. Try again"],
  ["E_TIMEOUT", "YouTube did not answer"],
  ["E_YT_REFUSED", "YouTube refused that video"],
  ["E_YT_BLOCKED", "YouTube is refusing requests right now. Try again later"],
  ["E_NEEDS_ACCOUNT", "That video needs a signed-in account"],
  ["E_NOT_STARTED", "That video has not started yet"],
  ["E_YTDLP_FAILED", "yt-dlp could not load that. It may need an update"],
  ["E_BAD_OUTPUT", "yt-dlp returned something unexpected"],
  ["E_INVALID_INPUT", "That is not a YouTube video link"],
  ["E_LINK", "That looks like a link, but not to a YouTube video. Put a word in front to search for it"],
  ["E_MPV_START", "The player did not start"],
  ["E_MPV_EXITED", "The player stopped unexpectedly"],
  ["E_PLAYBACK", "Playback failed"],
  ["N_PROXY", "A proxy is set for this session. OmaJuke does not use it: its connections go direct. "
    + "Use a system-wide VPN to route them"],
  ["N_STATE_RESET", "Saved history could not be read and was reset"]
]
var CODES = TEXTS.map(function(row) { return row[0] })

// This track is the problem: a queue moves on to the next one.
var SKIP = [
  "E_YT_REFUSED", "E_NEEDS_ACCOUNT", "E_NOT_STARTED", "E_BAD_OUTPUT", "E_YTDLP_FAILED", "E_PLAYBACK"
]

// The network, the tools or YouTube as a whole is the problem: playback
// stops. The last five never come from playing a track at all.
var STOP = [
  "E_NETWORK", "E_STREAM", "E_TIMEOUT", "E_YT_BLOCKED", "E_YTDLP_MISSING", "E_TOOLS_MISSING", "E_MPV_MISSING",
  "E_MPV_START", "E_MPV_EXITED", "E_RUNTIME_DIR", "E_INVALID_INPUT", "E_LINK", "N_PROXY", "N_STATE_RESET"
]

// What the runner itself can report about a job, and the code for it.
var RUNNER = [
  ["nowrap", "E_TOOLS_MISSING"], ["missing", "E_YTDLP_MISSING"], ["timeout", "E_TIMEOUT"],
  ["overflow", "E_BAD_OUTPUT"]
]

// The classes of yt-dlp's error line, in the order they are tried, each
// with every phrase that puts a line into it.
var CLASSES = [
  { code: "E_YT_BLOCKED",
    phrases: ["not a bot", "captcha", "rate-limited", "IP is likely being blocked", "HTTP Error 429"] },
  { code: "E_NEEDS_ACCOUNT", phrases: ["confirm your age", "members-only", "join this channel"] },
  { code: "E_NOT_STARTED",
    phrases: ["Premieres in", "will begin in", "live event will begin", "is offline"] },
  { code: "E_NETWORK",
    phrases: ["Unable to download API page", "Unable to download webpage", "Failed to establish",
      "Failed to resolve", "Network is unreachable", "Temporary failure", "Name or service not known",
      "timed out", "Connection refused", "Connection reset"] },
  { code: "E_YT_REFUSED",
    phrases: ["Private video", "unavailable", "not made this video available", "has been removed",
      "terminated", "Requested format is not available"] }
]

// Words the marketplace's scanner takes for privileged or package-manager
// commands. No sentence shown to the user may hold one.
var FORBIDDEN = [
  /\bsudo\b/i, /\bpkexec\b/i, /\bsystemctl\b/i, /\bsystemd-run\b/i,
  /\bomarchy pkg\b/i, /\b(pacman|paru|yay|apt|apt-get|dnf|zypper|apk|pip|pip3|pipx)\b/i,
  /\b(npm|pnpm|yarn|bun|cargo)\b/i, /\b(go|gem|brew) install\b/i, /\bgit (clone|fetch|pull)\b/i,
  /\b(curl|wget)\b/i
]

function job(error, stderr) {
  return { ok: false, error: error, exitCode: 1, stdout: "null\n", stderr: stderr, durationMs: 900 }
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

test("exports exactly the documented members", function() {
  assert.deepStrictEqual(Object.keys(Errors).sort(), ["TEXT", "fromYtDlp", "isSkipClass"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Errors, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises both functions", function() {
  var names = ["fromYtDlp", "isSkipClass"]
  names.forEach(function(name) {
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

// ---- The table of sentences ----

test("TEXT holds exactly the codes of this version, each with its sentence", function() {
  assert.deepStrictEqual(Object.keys(Errors.TEXT), CODES)
  TEXTS.forEach(function(row) {
    assert.strictEqual(Errors.TEXT[row[0]], row[1])
  })
})

test("TEXT has no prototype, so no name finds anything that was not put there", function() {
  assert.strictEqual(Object.getPrototypeOf(Errors.TEXT), null)
  var names = ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", "prototype", "", "length"]
  names.forEach(function(name) {
    assert.strictEqual(Errors.TEXT[name], undefined, name)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(Errors.TEXT, name), false, name)
    assert.strictEqual(name in Errors.TEXT, false, name)
  })
  CODES.forEach(function(code) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(Errors.TEXT, code), true, code)
  })
})

test("TEXT cannot be changed by whoever imports it", function() {
  assert.strictEqual(Object.isFrozen(Errors.TEXT), true)
  assert.throws(function() { Errors.TEXT.E_NETWORK = "changed" }, TypeError)
  assert.throws(function() { Errors.TEXT.E_NEW = "added" }, TypeError)
  assert.throws(function() { delete Errors.TEXT.E_NETWORK }, TypeError)
  assert.strictEqual(Errors.TEXT.E_NETWORK, "No network")
})

test("every sentence is one short plain line in sentence case, without a final full stop", function() {
  CODES.forEach(function(code) {
    var text = Errors.TEXT[code]
    assert.strictEqual(typeof text, "string", code)
    assert.ok(/^[\x20-\x7e]{5,130}$/.test(text), code)
    // A capital first, except where the sentence starts with a tool's name.
    assert.ok(/^([A-Z]|yt-dlp |mpv )/.test(text), code)
    assert.ok(!/[.!]$/.test(text), code)
    assert.strictEqual(text, text.trim(), code)
    assert.ok(text.indexOf("  ") === -1, code)
    // Plain text is shown as it is, so nothing in it may look like markup.
    assert.ok(!/[<>&]/.test(text), code)
  })
})

test("no sentence names a command, least of all one that installs something", function() {
  CODES.forEach(function(code) {
    var text = Errors.TEXT[code]
    FORBIDDEN.forEach(function(pattern) {
      assert.ok(!pattern.test(text), code + " matches " + pattern)
    })
    // "is not installed" states a fact. Any other form would be an instruction.
    assert.ok(!/install/i.test(text.replace("is not installed", "")), code)
    assert.ok(!/[`$|]|--|\/usr\//.test(text), code)
  })
})

// ---- Skip class and stop class ----

test("every code is in exactly one of the two classes", function() {
  assert.deepStrictEqual(SKIP.concat(STOP).sort(), CODES.slice().sort())
  CODES.forEach(function(code) {
    var skip = SKIP.indexOf(code) !== -1
    var stop = STOP.indexOf(code) !== -1
    assert.notStrictEqual(skip, stop, code)
    assert.strictEqual(Errors.isSkipClass(code), skip, code)
  })
})

test("every code that names the player or a missing tool stops playback", function() {
  CODES.forEach(function(code) {
    if (/^E_MPV_|_MISSING$/.test(code)) assert.strictEqual(Errors.isSkipClass(code), false, code)
  })
})

test("isSkipClass answers false for anything that is not a code", function() {
  var others = ["", "constructor", "__proto__", "toString", "E_NOPE", "e_playback", null, undefined, 5, {},
    ["E_PLAYBACK"], Symbol("E_PLAYBACK"), function() { return "E_PLAYBACK" }]
  others.forEach(function(code) {
    assert.strictEqual(Errors.isSkipClass(code), false)
  })
})

// ---- The classifier ----

test("fromYtDlp only ever answers with a code that has a sentence, or with nothing", function() {
  var seen = {}
  table.CASES.forEach(function(c) {
    if (c.fn !== "fromYtDlp") return
    var code = Errors.fromYtDlp.apply(null, c.args)
    seen[code] = true
    assert.ok(code === "" || CODES.indexOf(code) !== -1, code)
  })
  // And the table reaches every code the classifier can give.
  var reachable = ["", "E_TOOLS_MISSING", "E_YTDLP_MISSING", "E_TIMEOUT", "E_BAD_OUTPUT", "E_YT_BLOCKED",
    "E_NEEDS_ACCOUNT", "E_NOT_STARTED", "E_NETWORK", "E_YT_REFUSED", "E_YTDLP_FAILED"]
  assert.deepStrictEqual(Object.keys(seen).sort(), reachable.sort())
})

test("what the runner found out wins over anything on stderr", function() {
  RUNNER.forEach(function(row) {
    assert.strictEqual(Errors.fromYtDlp(job(row[0], "")), row[1])
    CLASSES.forEach(function(group) {
      group.phrases.forEach(function(phrase) {
        assert.strictEqual(Errors.fromYtDlp(job(row[0], "ERROR: " + phrase + "\n")), row[1], phrase)
      })
    })
  })
})

test("every phrase puts an error line into its class, in any letter case", function() {
  CLASSES.forEach(function(group) {
    group.phrases.forEach(function(phrase) {
      var lines = [
        phrase, phrase.toUpperCase(), phrase.toLowerCase(), "[youtube] AAAAAAAAAAA: " + phrase + "."
      ]
      lines.forEach(function(line) {
        assert.strictEqual(Errors.fromYtDlp(job("exit", "ERROR: " + line + "\n")), group.code, line)
        assert.strictEqual(Errors.fromYtDlp(job("signal", "ERROR: " + line + "\n")), group.code, line)
      })
    })
  })
})

test("a line that fits two classes gets the one that is tried first", function() {
  CLASSES.forEach(function(early, i) {
    CLASSES.slice(i + 1).forEach(function(late) {
      early.phrases.forEach(function(first) {
        late.phrases.forEach(function(second) {
          var lines = [first + ". " + second, second + ". " + first]
          lines.forEach(function(line) {
            assert.strictEqual(Errors.fromYtDlp(job("exit", "ERROR: " + line + "\n")), early.code, line)
          })
        })
      })
    })
  })
})

test("only the first line that starts with ERROR: is classified", function() {
  var note = "Reading URLs from STDIN - EOF (Ctrl+D) to end:\n"
  CLASSES.forEach(function(group) {
    group.phrases.forEach(function(phrase) {
      var line = "ERROR: " + phrase + "\n"
      CLASSES.forEach(function(other) {
        var noise = other.phrases[0]
        var before = note + "WARNING: " + noise + "\n " + "ERROR: " + noise + "\nerror: " + noise + "\n"
        assert.strictEqual(Errors.fromYtDlp(job("exit", before + line)), group.code, phrase)
        assert.strictEqual(Errors.fromYtDlp(job("exit", line + "ERROR: " + noise + "\n")), group.code, phrase)
      })
      // Without an error line there is nothing to classify.
      assert.strictEqual(Errors.fromYtDlp(job("exit", "WARNING: " + phrase + "\n")), "E_YTDLP_FAILED", phrase)
      assert.strictEqual(Errors.fromYtDlp(job("exit", phrase + "\n")), "E_YTDLP_FAILED", phrase)
    })
  })
})

test("a job that succeeded has no code, whatever it printed", function() {
  CLASSES.forEach(function(group) {
    var stderr = "ERROR: " + group.phrases[0] + "\n"
    assert.strictEqual(Errors.fromYtDlp({ ok: true, error: "", exitCode: 0, stdout: "", stderr: stderr }), "")
  })
})

test("fromYtDlp never throws and is never slow", function() {
  var odd = [undefined, null, 0, "", "x", true, [], {}, Object.create(null), function() {}, Symbol("s"),
    { ok: false, stderr: {} }, { ok: false, error: {} }, { ok: false, stderr: Symbol("s") }]
  odd.forEach(function(value, i) {
    assert.strictEqual(Errors.fromYtDlp(value), "E_YTDLP_FAILED", "value " + i)
  })
  // The runner keeps 4096 characters of stderr. Much more than that still
  // classifies at once.
  var size = 1 << 20
  var hostile = [
    "ERROR: " + "a".repeat(size), "ERROR: " + "not a ".repeat(size / 8), "\n".repeat(size),
    "ERROR: " + "Unable to download ".repeat(size / 32), "ERROR:".repeat(size / 8),
    "x".repeat(size) + "\nERROR: Private video\n", "ERROR: " + "Connection ".repeat(size / 16)
  ]
  hostile.forEach(function(stderr, i) {
    var ms = elapsedMs(function() { Errors.fromYtDlp(job("exit", stderr)) })
    assert.ok(ms < 1000, "input " + i + " took " + Math.round(ms) + " ms")
  })
})
