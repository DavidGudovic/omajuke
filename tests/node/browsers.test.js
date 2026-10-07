"use strict"
// Tests for lib/Browsers.js: the vector table (also run inside Qt's engine),
// and the properties a table cannot state, such as "no directory text can
// become an option", "a refusal is an empty command, never a shortened one"
// and "no flag that opens the browser up is ever on the command line". The
// directory check is also compared, on thousands of generated paths, with a
// second description of an attempt directory and with what lib/Paths.js
// hands out.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Browsers = load.lib("Browsers")
var Const = load.lib("Const")
var Errors = load.lib("Errors")
var Paths = load.lib("Paths")
var table = load.vectors("browsers")

var IDS = [
  "google-chrome.desktop", "chromium.desktop", "brave-browser.desktop", "vivaldi-stable.desktop",
  "firefox.desktop", "librewolf.desktop"
]
var FAMILIES = ["chromium", "firefox"]
// What a person calls each browser of the table, by its desktop id.
var SPOKEN = {
  "google-chrome.desktop": "Chrome", "chromium.desktop": "Chromium", "brave-browser.desktop": "Brave",
  "vivaldi-stable.desktop": "Vivaldi", "firefox.desktop": "Firefox", "librewolf.desktop": "LibreWolf"
}
// The browser names yt-dlp accepts for reading a cookie store.
var YT_NAMES = ["brave", "chrome", "chromium", "edge", "firefox", "opera", "safari", "vivaldi", "whale"]

var TOOLS = { setpriv: "/usr/bin/setpriv", timeout: "/usr/bin/timeout", browser: "" }
var STUB = "/tmp/oj-test.1/stubs/browser.js"
var DIRS = [
  "/run/user/1000/omajuke/signin/1", "/run/user/1000/omajuke/signin/42",
  "/run/user/1000/omajuke/signin/9999999999", "/tmp/oj-test.1/run_dir/omajuke/signin/7",
  "/a/omajuke/signin/1"
]
var URL_TEXT = "https://www.youtube.com/"

// What a Chromium-family browser must be given for the sign-in to be safe.
var CHROMIUM_MUST = [
  "--password-store=basic", "--no-first-run", "--no-default-browser-check", "--disable-sync",
  "--allow-browser-signin=false", "--disable-extensions", "--new-window"
]

// What must never be on the command line of a browser a password is typed
// into: a debugging channel, automation, a log, an extension, a keyring, a
// weaker sandbox, a window whose cookies never reach the disk, a detour.
var FORBIDDEN = [
  /^--?remote-debugging/i, /^--?remote-allow/i, /^--?start-debugger-server/i, /^--?jsdebugger/i,
  /^--?jsconsole/i, /^--?marionette/i, /^--?headless/i, /^--?enable-automation/i,
  /^--?enable-logging/i, /^--?log-net-log/i, /^--?net-log/i, /^--?log-file/i, /^--?log-level/i, /^--?v=/,
  /^--?vmodule/i, /MOZ_LOG/i, /^--?ssl-key-log-file/i,
  /^--?load-extension/i, /^--?disable-extensions-except/i, /^--?enable-extensions/i,
  /^--?password-store=(?!basic$)/i, /libsecret|kwallet|keyring/i,
  /^--?no-sandbox/i, /^--?disable-web-security/i, /^--?ignore-certificate-errors/i,
  /^--?allow-running-insecure-content/i,
  /^--?incognito/i, /^--?private/i, /^--?guest/i,
  /^--?proxy-server/i, /^--?host-rules/i, /^--?host-resolver-rules/i,
  /^--?profile-directory/i, /^-P$/, /^--?ProfileManager/i
]

// The preferences of the throwaway Firefox profile, written a second time.
var PREFS = [
  ["toolkit.telemetry.enabled", false],
  ["toolkit.telemetry.unified", false],
  ["toolkit.telemetry.archive.enabled", false],
  ["toolkit.telemetry.server", "data:,"],
  ["toolkit.telemetry.newProfilePing.enabled", false],
  ["toolkit.telemetry.shutdownPingSender.enabled", false],
  ["toolkit.telemetry.updatePing.enabled", false],
  ["toolkit.telemetry.bhrPing.enabled", false],
  ["toolkit.telemetry.firstShutdownPing.enabled", false],
  ["toolkit.coverage.opt-out", true],
  ["datareporting.healthreport.uploadEnabled", false],
  ["datareporting.policy.dataSubmissionEnabled", false],
  ["app.normandy.enabled", false],
  ["app.shield.optoutstudies.enabled", false],
  ["browser.shell.checkDefaultBrowser", false],
  ["browser.aboutwelcome.enabled", false],
  ["browser.startup.homepage_override.mstone", "ignore"],
  ["browser.newtabpage.enabled", false],
  ["browser.newtabpage.activity-stream.feeds.telemetry", false],
  ["browser.newtabpage.activity-stream.telemetry", false],
  ["browser.search.suggest.enabled", false],
  ["browser.urlbar.suggest.quicksuggest.sponsored", false],
  ["extensions.pocket.enabled", false],
  ["extensions.update.enabled", false],
  ["identity.fxaccounts.enabled", false],
  ["network.captive-portal-service.enabled", false],
  ["network.connectivity-service.enabled", false],
  ["network.prefetch-next", false],
  ["network.dns.disablePrefetch", true],
  ["network.predictor.enabled", false],
  ["browser.sessionstore.resume_from_crash", false],
  ["signon.rememberSignons", false]
]

// Text that must not get into a command, alone or inside a path.
var MARKS = [
  "/", ".", "..", "/.", "/../", "//", "0", "9", "a", "-", "--", " ", "\t", "\n", "\r", "\u0000", "\u007f",
  "'", "\"", "\u0060", "$", "$(id)", ";", "|", "&", "<", ">", "*", "?", "#", "%", "%U", "\\", ":",
  "::", ",", "=", "~", "+", "@", "\u00a0", "\u0661", "\u00e9", "\u202e", "\u200b", "\ud83d",
  " --remote-debugging-port=9222", " --load-extension=/x", "\n--enable-logging"
]

// An attempt directory, described a second time and a different way.
function isAttemptDir(dir) {
  return typeof dir === "string" && dir.length <= 128
    && /^(\/[A-Za-z0-9._-]+)+\/omajuke\/signin\/[0-9]{1,10}$/.test(dir) && !/\/\.\.?(\/|$)/.test(dir)
}

function stubTools() {
  return { setpriv: TOOLS.setpriv, timeout: TOOLS.timeout, browser: STUB }
}

// Every text obtained from this one by removing, inserting or replacing at
// one position.
function mutants(text) {
  var out = []
  for (var i = 0; i <= text.length; i++) {
    out.push(text.slice(0, i) + text.slice(i + 1))
    out.push(text.slice(0, i))
    MARKS.forEach(function(mark) {
      out.push(text.slice(0, i) + mark + text.slice(i))
      out.push(text.slice(0, i) + mark + text.slice(i + 1))
    })
  }
  return out
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

// A small generator with a fixed start, so that every run sees the same
// paths and a failure can be reproduced.
function generator(seed) {
  var state = seed >>> 0
  function next() {
    state = (state ^ (state << 13)) >>> 0
    state = (state ^ (state >>> 17)) >>> 0
    state = (state ^ (state << 5)) >>> 0
    return state / 4294967296
  }
  return {
    chance: function(percent) { return next() * 100 < percent },
    below: function(count) { return Math.floor(next() * count) },
    pick: function(list) { return list[Math.floor(next() * list.length)] }
  }
}

// Directory names a path may be made of, and names it may not.
var GOOD_PARTS = [
  "run", "user", "1000", "tmp", "a", "x.y", "_z", "-w", "...", ".hidden", "oj-test.AbC123", "0", "42",
  "omajuke", "signin"
]
var BAD_PARTS = ["", ".", "..", "a b", "a\nb", "caf\u00e9", "a:b", "a=b", "a,b", "$(id)", "a'b", "a\u0000b"]
var COUNTERS = [
  "1", "0", "42", "9999999999", "0000000007", "12345678901", "1a", "-1", "1.5", "\uff11", "", "1\n"
]

function generatedParts(gen, count) {
  var parts = []
  for (var i = 0; i < count; i++) parts.push(gen.chance(95) ? gen.pick(GOOD_PARTS) : gen.pick(BAD_PARTS))
  return parts
}

// Mostly a directory that ends the way an attempt directory does, with
// every kind of near miss among them.
function generatedDirectory(gen) {
  var parts = generatedParts(gen, gen.below(6))
  var ending = gen.below(10)
  if (ending < 7) {
    // The first five counters are the good ones.
    parts.push("omajuke", "signin", gen.chance(80) ? COUNTERS[gen.below(5)] : gen.pick(COUNTERS))
  } else if (ending === 7) {
    parts.push(gen.pick(["omajuke", "signin"]), gen.pick(COUNTERS))
  } else if (ending === 8) {
    parts.push(gen.pick(["Omajuke", "omajuke", "x"]), gen.pick(["Signin", "jar", "signin"]), "1")
  } else {
    parts.push("omajuke", "signin", "1", gen.pick(["profile", "config", "2", ""]))
  }
  var dir = (gen.chance(95) ? "/" : gen.pick(["", "//", "./", "-", "~/"])) + parts.join("/")
  return gen.chance(3) ? "/" + "a".repeat(90 + gen.below(40)) + dir : dir
}

// The checks every command has to pass, whatever it was built from.
function assertSafeCommand(argv, tools, id, dir) {
  var row = Browsers.TABLE[id]
  var profile = dir + "/profile"
  var bin = tools.browser === "" ? row.bin : tools.browser
  var label = id + " " + dir

  argv.forEach(function(arg) {
    assert.strictEqual(typeof arg, "string", label)
    assert.notStrictEqual(arg, "", label)
    // Nothing a shell, a desktop file or an option parser would split on.
    assert.doesNotMatch(arg, /[\s"'\u0060$;|&<>%\\*]/, label)
    FORBIDDEN.forEach(function(pattern) {
      assert.doesNotMatch(arg, pattern, label)
    })
  })

  // The same guards as every other child, then the binary.
  assert.deepStrictEqual(argv.slice(0, 8), [
    tools.setpriv, "--pdeathsig", "TERM", tools.timeout, "-k", "5", String(Const.TIMEOUTS.signInSec), bin
  ], label)
  assert.strictEqual(argv[0].charAt(0), "/", label)
  assert.strictEqual(bin.charAt(0), "/", label)
  assert.match(argv[6], /^[1-9][0-9]{1,4}$/, label)

  // No shell and no launcher in between.
  assert.strictEqual(argv.indexOf("-c"), -1, label)
  argv.forEach(function(arg) {
    assert.doesNotMatch(arg, /(^|\/)(sh|bash|env|xdg-open|gtk-launch|gio)$/, label)
  })

  // The address is the constant one, it comes last, and it is the only one.
  var rest = argv.slice(8)
  assert.strictEqual(rest[rest.length - 1], URL_TEXT, label)
  assert.strictEqual(argv.filter(function(arg) { return arg.indexOf("://") !== -1 }).length, 1, label)

  // The profile is the dedicated one and appears exactly once.
  var withProfile = argv.filter(function(arg) { return arg.indexOf(profile) !== -1 })
  assert.strictEqual(withProfile.length, 1, label)
  assert.strictEqual(argv.filter(function(arg) { return arg.indexOf(dir) !== -1 }).length, 1, label)

  if (row.family === "chromium") {
    assert.strictEqual(rest[0], "--user-data-dir=" + profile, label)
    CHROMIUM_MUST.forEach(function(flag) {
      assert.strictEqual(rest.filter(function(arg) { return arg === flag }).length, 1, label + " " + flag)
    })
    assert.strictEqual(rest[rest.length - 2], "--new-window", label)
    // Everything between the binary and the address is an option.
    rest.slice(0, -1).forEach(function(arg) {
      assert.match(arg, /^--[a-z][a-z-]*(=[A-Za-z0-9._\/-]+)?$/, label)
    })
    var stores = rest.filter(function(arg) { return arg.indexOf("--password-store") === 0 })
    assert.deepStrictEqual(stores, ["--password-store=basic"], label)
    var dataDirs = rest.filter(function(arg) { return arg.indexOf("--user-data-dir") === 0 })
    assert.deepStrictEqual(dataDirs, ["--user-data-dir=" + profile], label)
  } else {
    assert.deepStrictEqual(rest, ["--no-remote", "--profile", profile, URL_TEXT], label)
    // Where the profile stands alone it starts with a slash.
    assert.strictEqual(rest[2].charAt(0), "/", label)
  }
}

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(Browsers).sort(),
    ["GRACE_SEC", "START_URL", "TABLE", "USER_JS", "launchArgv", "lookup", "profileDir", "queryArgv"])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Browsers, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(Browsers).forEach(function(name) {
    if (typeof Browsers[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("the table holds the six supported browsers and nothing inherited", function() {
  assert.strictEqual(Object.getPrototypeOf(Browsers.TABLE), null)
  assert.deepStrictEqual(Object.keys(Browsers.TABLE), IDS)
  assert.strictEqual("constructor" in Browsers.TABLE, false)
  assert.strictEqual("toString" in Browsers.TABLE, false)
  assert.strictEqual(Browsers.TABLE.__proto__, undefined)
  IDS.forEach(function(id) {
    var row = Browsers.TABLE[id]
    assert.match(id, /^[a-z][a-z0-9-]*\.desktop$/)
    assert.deepStrictEqual(Object.keys(row), ["family", "bin", "ytName"], id)
    assert.ok(FAMILIES.indexOf(row.family) !== -1, id)
    // An absolute binary in the system directory: nothing is found through PATH.
    assert.match(row.bin, /^\/usr\/bin\/[a-z][a-z0-9-]*$/, id)
    assert.ok(YT_NAMES.indexOf(row.ytName) !== -1, id)
  })
})

test("the table cannot be changed by an importer", function() {
  assert.ok(Object.isFrozen(Browsers.TABLE))
  IDS.forEach(function(id) {
    assert.ok(Object.isFrozen(Browsers.TABLE[id]), id)
  })
  assert.throws(function() {
    Browsers.TABLE["other.desktop"] = { family: "chromium", bin: "/x", ytName: "x" }
  })
  assert.throws(function() { Browsers.TABLE["firefox.desktop"].bin = "/tmp/other" })
  assert.throws(function() { delete Browsers.TABLE["firefox.desktop"] })
  assert.strictEqual(Browsers.lookup("other.desktop").ok, false)
  assert.strictEqual(Browsers.lookup("firefox.desktop").bin, "/usr/bin/firefox")
})

test("lookup: answers with a fresh object that mirrors the table row", function() {
  IDS.forEach(function(id) {
    var row = Browsers.TABLE[id]
    var found = Browsers.lookup(id + "\n")
    assert.deepStrictEqual(found, { ok: true, id: id, family: row.family, bin: row.bin, ytName: row.ytName })
    assert.deepStrictEqual(Object.keys(found), ["ok", "id", "family", "bin", "ytName"])
    assert.notStrictEqual(found, row)
    assert.notStrictEqual(found, Browsers.lookup(id + "\n"))
    // Changing an answer changes nothing for the next caller.
    found.bin = "/tmp/other"
    found.family = "other"
    assert.strictEqual(Browsers.lookup(id).bin, row.bin)
    assert.strictEqual(Browsers.lookup(id).family, row.family)
  })
})

test("lookup: a refusal carries nothing but ok: false", function() {
  ["", "opera.desktop", "constructor", null, undefined, 7, {}].forEach(function(value) {
    assert.deepStrictEqual(Browsers.lookup(value), { ok: false })
  })
})

test("lookup: no name that every object has is a browser", function() {
  var names = Object.getOwnPropertyNames(Object.prototype)
    .concat(["__proto__", "prototype", "length", "name"])
  assert.ok(names.length > 10)
  names.forEach(function(name) {
    [name, name + "\n", name + ".desktop", name + ".desktop\n"].forEach(function(text) {
      assert.deepStrictEqual(Browsers.lookup(text), { ok: false }, text)
      assert.deepStrictEqual(Browsers.launchArgv(TOOLS, text, DIRS[0]), [], text)
    })
  })
})

test("lookup: only the exact id, on every one-character change", function() {
  var checked = 0
  IDS.forEach(function(id) {
    mutants(id).forEach(function(mutant) {
      // A change that only adds blanks at an end, or changes nothing, still names the browser.
      var same = mutant.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") === id
      assert.strictEqual(Browsers.lookup(mutant).ok, same, JSON.stringify(mutant))
      // The command builder does not trim: it takes the id as lookup returned it.
      assert.strictEqual(Browsers.launchArgv(TOOLS, mutant, DIRS[0]).length > 0, mutant === id,
        JSON.stringify(mutant))
      checked++
    })
  })
  assert.ok(checked > 5000, String(checked))
})

test("lookup: of all characters only space, tab and the two line ends are trimmed", function() {
  var blanks = [0x20, 0x09, 0x0a, 0x0d]
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var expected = blanks.indexOf(code) !== -1
    assert.strictEqual(Browsers.lookup(ch + "firefox.desktop").ok, expected, code.toString(16))
    assert.strictEqual(Browsers.lookup("firefox.desktop" + ch).ok, expected, code.toString(16))
    assert.strictEqual(Browsers.lookup("firefox" + ch + ".desktop").ok, false, code.toString(16))
  }
})

test("lookup: the answer may be 256 characters long, blanks included", function() {
  var id = "firefox.desktop"
  var longest = id + " ".repeat(256 - id.length)
  assert.strictEqual(longest.length, 256)
  assert.strictEqual(Browsers.lookup(longest).ok, true)
  assert.strictEqual(Browsers.lookup(longest + " ").ok, false)
  assert.strictEqual(Browsers.lookup("\n".repeat(300) + id).ok, false)
})

test("lookup: only a plain string is read, and nothing is ever thrown", function() {
  var id = "firefox.desktop"
  var values = [
    new String(id), { toString: function() { return id } }, { valueOf: function() { return id } }, [id],
    { id: id }, { length: 15 }, function() { return id }, Symbol("firefox.desktop"), BigInt(7), NaN, Infinity,
    -0, null, undefined, true, false, new Date(0), /firefox\.desktop/, Object.create(null),
    { toString: function() { throw new Error("no") } }
  ]
  values.forEach(function(value, i) {
    assert.deepStrictEqual(Browsers.lookup(value), { ok: false }, "value " + i)
    assert.strictEqual(Browsers.profileDir(value), "", "value " + i)
    assert.deepStrictEqual(Browsers.launchArgv(TOOLS, value, DIRS[0]), [], "value " + i)
    assert.deepStrictEqual(Browsers.launchArgv(TOOLS, id, value), [], "value " + i)
    assert.deepStrictEqual(Browsers.launchArgv(value, id, DIRS[0]), [], "value " + i)
  })
})

test("profileDir: the profile is the attempt directory plus one constant name", function() {
  DIRS.forEach(function(dir) {
    assert.strictEqual(isAttemptDir(dir), true, dir)
    assert.strictEqual(Browsers.profileDir(dir), dir + "/profile")
    // The profile itself is not an attempt directory: nothing nests.
    assert.strictEqual(Browsers.profileDir(dir + "/profile"), "")
    assert.strictEqual(Browsers.profileDir(dir + "/"), "")
  })
})

test("profileDir: agrees with an independent description on every one-character change", function() {
  var checked = 0
  var accepted = 0
  DIRS.forEach(function(dir) {
    mutants(dir).forEach(function(mutant) {
      var expected = isAttemptDir(mutant)
      var profile = Browsers.profileDir(mutant)
      assert.strictEqual(profile, expected ? mutant + "/profile" : "", JSON.stringify(mutant))
      if (expected) accepted++
      checked++
    })
  })
  assert.ok(checked > 10000, String(checked))
  // The oracle is not vacuous: some changes still spell an attempt directory.
  assert.ok(accepted > 50, String(accepted))
})

test("profileDir: every character outside the plain set is refused, wherever it stands", function() {
  for (var code = 0; code <= 0xffff; code++) {
    var ch = String.fromCharCode(code)
    var plain = /^[A-Za-z0-9._-]$/.test(ch)
    var hex = code.toString(16)
    var slash = ch === "/"
    var digit = /^[0-9]$/.test(ch)
    // A slash only starts the next part of the path, which is fine.
    assert.strictEqual(Browsers.profileDir("/run/x" + ch + "y/omajuke/signin/1") !== "", plain || slash, hex)
    assert.strictEqual(Browsers.profileDir(ch + "/run/omajuke/signin/1"), "", hex)
    assert.strictEqual(Browsers.profileDir("/run/omajuke/signin/1" + ch) !== "", digit, hex)
    assert.strictEqual(Browsers.profileDir("/run/omajuke/signin/" + ch) !== "", digit, hex)
    // Between the two names only the slash itself spells the directory.
    assert.strictEqual(Browsers.profileDir("/run/omajuke" + ch + "signin/1") !== "", slash, hex)
  }
})

test("profileDir: a directory may be 128 characters long", function() {
  var longest = "/" + "a".repeat(110) + "/omajuke/signin/1"
  assert.strictEqual(longest.length, 128)
  assert.strictEqual(Browsers.profileDir(longest), longest + "/profile")
  assert.strictEqual(Browsers.profileDir("/" + "a".repeat(111) + "/omajuke/signin/1"), "")
})

test("profileDir: takes the attempt directories of every runtime directory the plugin accepts", function() {
  var bases = ["/run/user/1000", "/tmp/oj-test.1/run_dir", "/x", "/" + "a".repeat(64), "/a/b/c/d/e/f/g/h"]
  var counters = [1, 2, 10, 4294967296, 9999999999]
  bases.forEach(function(base) {
    var paths = Paths.resolve({
      XDG_RUNTIME_DIR: base, XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
    })
    assert.strictEqual(paths.ok, true, base)
    assert.strictEqual(paths.signinDir, base + "/" + Const.DIR_NAME + "/signin")
    counters.forEach(function(n) {
      var dir = paths.signinDir + "/" + n
      assert.ok(dir.length <= 128, dir)
      assert.strictEqual(Browsers.profileDir(dir), dir + "/profile")
      assert.strictEqual(Browsers.launchArgv(TOOLS, "firefox.desktop", dir).length, 12)
    })
    // Nothing else the plugin keeps in its directories is an attempt directory.
    Object.keys(paths).forEach(function(key) {
      if (key === "ok") return
      assert.strictEqual(Browsers.profileDir(paths[key]), "", key)
      if (key !== "signinDir") assert.strictEqual(Browsers.profileDir(paths[key] + "/1"), "", key)
    })
  })
})

test("profileDir and launchArgv: agree with the second description on generated directories", function() {
  var gen = generator(20260102)
  var taken = 0
  for (var n = 0; n < 4000; n++) {
    var dir = generatedDirectory(gen)
    var expected = isAttemptDir(dir)
    var id = IDS[n % IDS.length]
    assert.strictEqual(Browsers.profileDir(dir), expected ? dir + "/profile" : "", JSON.stringify(dir))
    var argv = Browsers.launchArgv(TOOLS, id, dir)
    if (expected) {
      assertSafeCommand(argv, TOOLS, id, dir)
      taken++
    } else {
      assert.deepStrictEqual(argv, [], JSON.stringify(dir))
    }
  }
  // The comparison is not vacuous: a good share is taken and a good share refused.
  assert.ok(taken > 1000 && taken < 3000, String(taken))
})

test("profileDir: takes the attempt directory below every generated runtime directory", function() {
  var gen = generator(20260103)
  var resolved = 0
  var alike = 0
  // Two runtime directories that are themselves spelled like an attempt directory.
  var bases = ["/run/omajuke/signin/1000", "/x/omajuke/signin/1"]
  for (var n = 0; n < 3000; n++) bases.push("/" + generatedParts(gen, 1 + gen.below(5)).join("/"))
  bases.forEach(function(base) {
    var paths = Paths.resolve({
      XDG_RUNTIME_DIR: base, XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
    })
    if (paths.ok !== true) return
    resolved++
    var counter = 1 + gen.below(gen.pick([9, 99999, 9999999999]))
    var dir = paths.signinDir + "/" + counter
    var id = gen.pick(IDS)
    assert.strictEqual(Browsers.profileDir(dir), dir + "/profile", dir)
    assertSafeCommand(Browsers.launchArgv(TOOLS, id, dir), TOOLS, id, dir)
    // No other directory or file of the plugin passes for one, numbered or not.
    Object.keys(paths).forEach(function(key) {
      if (key === "ok" || key === "runtimeBase") return
      assert.strictEqual(Browsers.profileDir(paths[key]), "", key + " of " + base)
      if (key !== "signinDir") assert.strictEqual(Browsers.profileDir(paths[key] + "/" + counter), "", key)
    })
    // The runtime directory is the session's choice, not the plugin's. Only
    // the spelling is checked here, so one that happens to end like an
    // attempt directory is told apart by nothing.
    assert.strictEqual(Browsers.profileDir(base) !== "", isAttemptDir(base), base)
    if (isAttemptDir(base)) alike++
  })
  assert.ok(resolved > 1500, String(resolved))
  assert.ok(alike >= 2, String(alike))
})

test("profileDir: what comes back is absolute, plain and ends in the counter and the constant", function() {
  var inputs = DIRS.concat(table.CASES.filter(function(c) {
    return c.fn === "profileDir" && typeof c.args[0] === "string"
  }).map(function(c) { return c.args[0] }))
  var seen = 0
  inputs.forEach(function(input) {
    var profile = Browsers.profileDir(input)
    if (profile === "") return
    assert.match(profile, /^\/[A-Za-z0-9._\/-]+\/omajuke\/signin\/[0-9]{1,10}\/profile$/)
    assert.strictEqual(profile.charAt(0), "/")
    assert.strictEqual(profile.indexOf("//"), -1)
    assert.doesNotMatch(profile, /\/\.\.?\//)
    seen++
  })
  assert.ok(seen >= DIRS.length)
})

test("launchArgv: every command for every browser passes every safety check", function() {
  var commands = 0
  IDS.forEach(function(id) {
    DIRS.forEach(function(dir) {
      [TOOLS, stubTools(), Const.TOOLS].forEach(function(tools) {
        var argv = Browsers.launchArgv(tools, id, dir)
        assert.ok(Array.isArray(argv) && argv.length >= 12, id)
        assertSafeCommand(argv, tools, id, dir)
        commands++
      })
    })
  })
  assert.strictEqual(commands, IDS.length * DIRS.length * 3)
})

test("launchArgv: the plugin's own tool table starts the table's binary under the two guards", function() {
  assert.strictEqual(Const.TOOLS.browser, "")
  IDS.forEach(function(id) {
    var argv = Browsers.launchArgv(Const.TOOLS, id, DIRS[0])
    assert.strictEqual(argv[0], Const.TOOLS.setpriv)
    assert.strictEqual(argv[3], Const.TOOLS.timeout)
    assert.strictEqual(argv[6], String(Const.TIMEOUTS.signInSec))
    assert.strictEqual(argv[7], Browsers.TABLE[id].bin)
    assert.strictEqual(argv[7], Browsers.lookup(id + "\n").bin)
  })
})

test("launchArgv: the family decides the flags, also with a stand-in binary", function() {
  IDS.forEach(function(id) {
    var real = Browsers.launchArgv(TOOLS, id, DIRS[0])
    var stubbed = Browsers.launchArgv(stubTools(), id, DIRS[0])
    assert.strictEqual(stubbed[7], STUB)
    // Nothing but the binary differs.
    var patched = real.slice()
    patched[7] = STUB
    assert.deepStrictEqual(stubbed, patched)
    var firefox = Browsers.TABLE[id].family === "firefox"
    assert.strictEqual(real.indexOf("--profile") !== -1, firefox, id)
    assert.strictEqual(real.indexOf("--no-remote") !== -1, firefox, id)
    var dataDir = real.some(function(arg) { return arg.indexOf("--user-data-dir=") === 0 })
    assert.strictEqual(dataDir, !firefox, id)
  })
})

test("launchArgv: no directory text becomes an option or a second argument", function() {
  var checked = 0
  var built = 0
  var ids = ["google-chrome.desktop", "firefox.desktop"]
  DIRS.slice(0, 2).forEach(function(dir) {
    mutants(dir).concat(MARKS).forEach(function(mutant) {
      ids.forEach(function(id) {
        var argv = Browsers.launchArgv(TOOLS, id, mutant)
        if (isAttemptDir(mutant)) {
          assertSafeCommand(argv, TOOLS, id, mutant)
          built++
        } else {
          // A refusal is an empty command, never one that lacks its profile.
          assert.deepStrictEqual(argv, [], JSON.stringify(mutant))
        }
        checked++
      })
    })
  })
  assert.ok(checked > 8000, String(checked))
  assert.ok(built > 20, String(built))
})

test("launchArgv: the browser's everyday profile can never be the one that is opened", function() {
  var everyday = [
    "/home/user/.config/google-chrome", "/home/user/.config/chromium", "/home/user/.config/BraveSoftware",
    "/home/user/.config/vivaldi", "/home/user/.mozilla/firefox", "/home/user/.librewolf", "/home/user",
    "/home/user/.config", "/home/user/.local/share/omajuke", "/run/user/1000", "/run/user/1000/omajuke",
    "/run/user/1000/omajuke/signin", "/run/user/1000/omajuke/jar", "/tmp", "/"
  ]
  everyday.forEach(function(dir) {
    IDS.forEach(function(id) {
      assert.deepStrictEqual(Browsers.launchArgv(TOOLS, id, dir), [], dir)
      assert.deepStrictEqual(Browsers.launchArgv(TOOLS, id, dir + "/"), [], dir)
      assert.deepStrictEqual(Browsers.launchArgv(TOOLS, id, dir + "/Default"), [], dir)
    })
  })
  // And what is opened is always below the directory that was handed in.
  IDS.forEach(function(id) {
    DIRS.forEach(function(dir) {
      var argv = Browsers.launchArgv(TOOLS, id, dir)
      var named = argv.filter(function(arg) { return arg.indexOf("/profile") !== -1 })
      assert.strictEqual(named.length, 1)
      assert.ok(named[0] === dir + "/profile" || named[0] === "--user-data-dir=" + dir + "/profile")
    })
  })
})

test("launchArgv: a tool path that is not absolute yields no command", function() {
  var bad = [
    "", "/", "setpriv", "./setpriv", "../bin/setpriv", "~/bin/setpriv", "-x", "--pdeathsig",
    " /usr/bin/setpriv", "/usr/bin/setpriv\n", "/usr/bin/set\u0000priv", "/usr/bin/set\u007fpriv",
    "/" + "a".repeat(256), null, undefined, 0, 1, true, ["/usr/bin/setpriv"], { path: "/usr/bin/setpriv" }
  ]
  bad.forEach(function(value, i) {
    IDS.forEach(function(id) {
      var noSetpriv = { setpriv: value, timeout: TOOLS.timeout, browser: "" }
      var noTimeout = { setpriv: TOOLS.setpriv, timeout: value, browser: "" }
      assert.deepStrictEqual(Browsers.launchArgv(noSetpriv, id, DIRS[0]), [], "setpriv " + i)
      assert.deepStrictEqual(Browsers.launchArgv(noTimeout, id, DIRS[0]), [], "timeout " + i)
      // Only the empty text means "no stand-in".
      if (value === "") return
      var badBrowser = { setpriv: TOOLS.setpriv, timeout: TOOLS.timeout, browser: value }
      assert.deepStrictEqual(Browsers.launchArgv(badBrowser, id, DIRS[0]), [], "browser " + i)
    })
  })
  var longest = "/" + "a".repeat(255)
  assert.strictEqual(Browsers.launchArgv({ setpriv: longest, timeout: longest, browser: longest },
    "firefox.desktop", DIRS[0]).length, 12)
})

test("launchArgv: a tool table that misbehaves when read yields no command, or the checked one", function() {
  var id = "firefox.desktop"
  var throwing = {
    get setpriv() { throw new Error("no") }, timeout: TOOLS.timeout, browser: ""
  }
  assert.deepStrictEqual(Browsers.launchArgv(throwing, id, DIRS[0]), [])
  var trap = new Proxy({}, { get: function() { throw new Error("no") } })
  assert.deepStrictEqual(Browsers.launchArgv(trap, id, DIRS[0]), [])
  // Every entry is read once, so what was checked is what is used.
  var reads = { setpriv: 0, timeout: 0, browser: 0 }
  var shifting = {
    get setpriv() { return reads.setpriv++ === 0 ? TOOLS.setpriv : "--other" },
    get timeout() { return reads.timeout++ === 0 ? TOOLS.timeout : "--other" },
    get browser() { return reads.browser++ === 0 ? "" : "--remote-debugging-port=9222" }
  }
  var argv = Browsers.launchArgv(shifting, id, DIRS[0])
  assert.deepStrictEqual(reads, { setpriv: 1, timeout: 1, browser: 1 })
  assert.deepStrictEqual(argv, Browsers.launchArgv(TOOLS, id, DIRS[0]))
  // Entries the table only inherits are read like its own: it is the plugin's table.
  var inherited = Object.create(TOOLS)
  assert.deepStrictEqual(Browsers.launchArgv(inherited, id, DIRS[0]), Browsers.launchArgv(TOOLS, id, DIRS[0]))
})

test("launchArgv: returns a fresh array and leaves its arguments alone", function() {
  var tools = Object.freeze({ setpriv: TOOLS.setpriv, timeout: TOOLS.timeout, browser: "" })
  var before = JSON.stringify(tools)
  IDS.forEach(function(id) {
    var first = Browsers.launchArgv(tools, id, DIRS[0])
    var second = Browsers.launchArgv(tools, id, DIRS[0])
    assert.notStrictEqual(first, second)
    assert.deepStrictEqual(first, second)
    // A caller that edits its copy does not change the next command.
    first.push("--remote-debugging-port=9222")
    first[8] = "--headless"
    assert.deepStrictEqual(Browsers.launchArgv(tools, id, DIRS[0]), second)
  })
  assert.strictEqual(JSON.stringify(tools), before)
  assert.notStrictEqual(Browsers.launchArgv(tools, "nothing.desktop", DIRS[0]),
    Browsers.launchArgv(tools, "nothing.desktop", DIRS[0]))
})

test("the sign-in page is the one constant address on www.youtube.com", function() {
  assert.strictEqual(Browsers.START_URL, URL_TEXT)
  var url = new URL(Browsers.START_URL)
  assert.strictEqual(url.protocol, "https:")
  assert.strictEqual(url.hostname, "www.youtube.com")
  assert.strictEqual(url.port, "")
  assert.strictEqual(url.username, "")
  assert.strictEqual(url.password, "")
  assert.strictEqual(url.pathname, "/")
  assert.strictEqual(url.search, "")
  assert.strictEqual(url.hash, "")
  assert.strictEqual(url.href, Browsers.START_URL)
})

test("the Firefox preferences are exactly the expected list, one user_pref line each", function() {
  var text = Browsers.USER_JS
  assert.strictEqual(typeof text, "string")
  assert.match(text, /^[\x20-\x7e\n]+$/)
  assert.ok(text.length < 4096)
  assert.strictEqual(text.charAt(text.length - 1), "\n")
  var lines = text.split("\n")
  assert.strictEqual(lines.pop(), "")
  assert.strictEqual(lines.length, PREFS.length)
  var seen = new Set()
  lines.forEach(function(line, i) {
    var match = /^user_pref\("([A-Za-z0-9._-]+)", (true|false|"[A-Za-z0-9:,._-]*")\);$/.exec(line)
    assert.ok(match, line)
    assert.strictEqual(match[1], PREFS[i][0])
    assert.strictEqual(JSON.parse(match[2]), PREFS[i][1], match[1])
    assert.strictEqual(seen.has(match[1]), false, match[1])
    seen.add(match[1])
  })
})

test("the Firefox preferences switch things off and open nothing up", function() {
  var text = Browsers.USER_JS
  assert.doesNotMatch(text, /devtools|debugger|marionette|remote-enabled|remote\.enabled|logging|proxy/i)
  assert.doesNotMatch(text, /https?:|file:|\/\/|\\/)
  // No telemetry, no account of the browser's own, no stored passwords.
  assert.match(text, /^user_pref\("toolkit\.telemetry\.enabled", false\);$/m)
  assert.match(text, /^user_pref\("datareporting\.healthreport\.uploadEnabled", false\);$/m)
  assert.match(text, /^user_pref\("identity\.fxaccounts\.enabled", false\);$/m)
  assert.match(text, /^user_pref\("signon\.rememberSignons", false\);$/m)
})

test("no input makes the functions slow", function() {
  var size = 1 << 20
  var hostile = [
    "a".repeat(size), "/".repeat(size), "/a".repeat(size / 2), "/1".repeat(size / 2), ".".repeat(size),
    " ".repeat(size), "\n".repeat(size), " ".repeat(size) + "firefox.desktop",
    "firefox.desktop" + " ".repeat(size),
    "firefox.desktop\n".repeat(size / 16), "/run/user/1000/omajuke/signin/" + "1".repeat(size),
    "/" + "a/".repeat(size / 2) + "1", "-".repeat(size), "\u0000".repeat(size), "\ud83d".repeat(size)
  ]
  hostile.forEach(function(input, i) {
    var ms = elapsedMs(function() {
      assert.strictEqual(Browsers.lookup(input).ok, false)
      assert.strictEqual(Browsers.profileDir(input), "")
      assert.deepStrictEqual(Browsers.launchArgv(TOOLS, input, DIRS[0]), [])
      assert.deepStrictEqual(Browsers.launchArgv(TOOLS, "firefox.desktop", input), [])
      assert.deepStrictEqual(Browsers.launchArgv({ setpriv: input, timeout: input, browser: input },
        "firefox.desktop", DIRS[0]), [])
    })
    assert.ok(ms < 2000, "input " + i + " took " + Math.round(ms) + " ms")
  })
})

// The table decides which browsers a sign-in can use. Two sentences tell the
// user: the error shown when the default browser is none of them, and the
// requirement in the README. Both name every browser of the table, and the
// error names nothing else.
test("the sentences that say which browsers sign-in needs name the browsers of the table", function() {
  var ids = Object.keys(Browsers.TABLE).sort()
  assert.deepStrictEqual(ids, Object.keys(SPOKEN).sort())
  var names = ids.map(function(id) { return SPOKEN[id] })
  var sentence = Errors.TEXT.E_SIGNIN_BROWSER
  var readme = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "README.md"), "utf8")
  var requirement = readme.split("\n\n").filter(function(block) {
    return block.indexOf("For sign-in only") !== -1
  })
  assert.strictEqual(requirement.length, 1)
  names.forEach(function(name) {
    assert.ok(new RegExp("\\b" + name + "\\b").test(sentence), "the error: " + name)
    assert.ok(new RegExp("\\b" + name + "\\b").test(requirement[0]), "the README: " + name)
  })
  // The error names no browser the table lacks.
  var words = sentence.replace("Sign-in needs ", "").split(/, | or /)
  assert.deepStrictEqual(words.slice().sort(), names.slice().sort())
})
