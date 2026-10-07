"use strict"
// Tests for lib/KeyCombo.js: the vector table (also run inside Qt's engine),
// the whole key grammar by enumeration, the made-up listing in
// tests/fixtures/binds.txt with at least one combination per verdict, and
// the properties a table cannot state: a reply that was cut short or
// damaged is never read as a shorter good one, the reader agrees with a
// second reader written another way, the verdicts agree with a model of
// what the compositor does with a bind, no argument makes a function fail,
// and no input makes it slow.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var load = require("./load.js")
var generator = require("../gen-binds.js")

var KeyCombo = load.lib("KeyCombo")
var Const = load.lib("Const")
var table = load.vectors("keycombo")

var FIXTURE = path.join(__dirname, "..", "fixtures", "binds.txt")
var LUA = path.join(__dirname, "..", "..", "lib", "Lua.js")
var fixture = fs.readFileSync(FIXTURE, "utf8")
var listing = KeyCombo.parseBinds(fixture)

var US = { plainUs: true }
var OTHER = { plainUs: false }
var BAD = { ok: false, records: null }
var CLASSES = ["free", "ours", "duplicate", "foreign", "shared", "unknown"]

var MODS = ["SUPER", "CTRL", "ALT", "SHIFT"]
var ALIASES = ["MOD4", "CONTROL", "MOD1", "SHIFT"]
var BITS = [64, 4, 8, 1]
var QT_MODS = [0x10000000, 0x04000000, 0x08000000, 0x02000000]
var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
var F_KEYS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]
var KEYS = LETTERS.concat(F_KEYS)

// What the compositor-side gate accepts as a key name. Written out a second
// time here: every alias parse() returns has to match it.
var ALIAS = /^(?:MOD4 \+ )?(?:CONTROL \+ )?(?:MOD1 \+ )?(?:SHIFT \+ )?(?:[A-Z]|F(?:[1-9]|1[0-2]))$/

// The sixteen ways to hold the four modifiers, as lists of positions in MODS.
var SUBSETS = []
for (var bits = 0; bits < 16; bits++) {
  SUBSETS.push([0, 1, 2, 3].filter(function(i) { return (bits >> i) & 1 }))
}

function spell(names, subset, key) {
  return subset.map(function(i) { return names[i] }).concat([key]).join(" + ")
}

function sum(numbers, subset) {
  return subset.reduce(function(total, i) { return total + numbers[i] }, 0)
}

function strong(subset) {
  return subset.some(function(i) { return i < 3 })
}

// Every combination the grammar has.
var COMBOS = []
SUBSETS.filter(strong).forEach(function(subset) {
  KEYS.forEach(function(key) { COMBOS.push(spell(MODS, subset, key)) })
})

function verdict(records, layout, action, combo) {
  return KeyCombo.classify(records, layout, action, KeyCombo.parse(combo))
}

function elapsedMs(fn) {
  var start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

// A small generator of repeatable "random" numbers.
function sequence(seed) {
  var state = seed >>> 0
  return function(below) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return Math.floor(state / 4294967296 * below)
  }
}

// The reader's rules a second time, written the short way node allows.
// parseBinds() has to give the same answer for every text.
var READ = ["modmask", "submap", "key", "keycode", "catchall", "description", "dispatcher", "flags"]
var NEEDED = ["modmask", "submap", "key", "keycode", "catchall"]
var NUMBER = /^[0-9]{1,10}$/
function reference(text) {
  if (typeof text !== "string" || text.length > Const.LIMITS.hyprBytes) return BAD
  // The line the compositor prints for an empty result, and nothing else.
  if (/^unknown request\r?\n(\r?\n)*\r?$/.test(text)) return { ok: true, records: [] }
  var lines = text.split("\n")
  var tail = lines.pop()
  if (tail !== "" && tail !== "\r") return BAD
  var records = []
  var open = null
  for (var n = 0; n < lines.length; n++) {
    var line = lines[n].replace(/\r$/, "")
    var field = /^\t([a-z_]+): ?([^]*)$/.exec(line)
    if (line === "") {
      if (!open) continue
      if (!NEEDED.every(function(name) { return open.has(name) })) return BAD
      if (!NUMBER.test(open.get("modmask")) || !NUMBER.test(open.get("keycode"))) return BAD
      if (!/^(true|false)$/.test(open.get("catchall")) || open.get("key").length > 256) return BAD
      records.push({
        modmask: Number(open.get("modmask")),
        submap: open.get("submap").slice(0, 256),
        key: open.get("key"),
        keycode: Number(open.get("keycode")),
        catchall: open.get("catchall") === "true",
        description: (open.get("description") || "").slice(0, 256),
        dispatcher: (open.get("dispatcher") || "").slice(0, 256),
        ignoreMods: (open.get("flags") || "").split(",").some(function(flag) {
          return flag.replace(/^[ \t]+|[ \t]+$/g, "") === "ignore_mods"
        })
      })
      open = null
    } else if (field) {
      if (!open || open.has(field[1])) return BAD
      if (READ.includes(field[1])) open.set(field[1], field[2])
    } else {
      if (open || records.length === 2000 || !/^bind[a-z]*$/.test(line)) return BAD
      open = new Map()
    }
  }
  if (open || records.length === 0) return BAD
  return { ok: true, records: records }
}

// A listing of the first few records of the fixture: small enough to try
// every cut and every damaged line.
var SAMPLE = fixture.split("\n\n").slice(0, 12).join("\n\n") + "\n\n"

function record(modmask, key, description) {
  return {
    modmask: modmask, submap: "", key: key, keycode: 0, catchall: false, description: description,
    dispatcher: "__lua", ignoreMods: false
  }
}

function lines(modmask, key, description) {
  return "bindd\n\tmodmask: " + modmask + "\n\tsubmap: \n\tkey: " + key + "\n\tkeycode: 0\n"
    + "\tcatchall: false\n\tdescription: " + description + "\n\tdispatcher: __lua\n\targ: 5\n\n"
}

// ---- The table ----

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(KeyCombo).sort(), [
    "ACTIONS", "LAYOUT_OPTIONS", "action", "classify", "command", "copyLine", "findConfigured", "findRuntime",
    "fromQt", "layoutFacts", "parse", "parseBinds", "propose", "takenBy"
  ])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(KeyCombo, c)
    assert.strictEqual(result.got, result.want, (JSON.stringify(c.args) || "").slice(0, 200))
  })
})

test("the table exercises every exported function", function() {
  Object.keys(KeyCombo).forEach(function(name) {
    if (typeof KeyCombo[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

// ---- Grammar ----

test("parse: every combination of the grammar, and its mask, key and alias", function() {
  var seen = new Set()
  SUBSETS.forEach(function(subset) {
    KEYS.forEach(function(key) {
      var text = spell(MODS, subset, key)
      var parsed = KeyCombo.parse(text)
      if (!strong(subset)) {
        assert.strictEqual(parsed, null, text)
        return
      }
      assert.deepStrictEqual(parsed, {
        canonical: text, mask: sum(BITS, subset), key: key, alias: spell(ALIASES, subset, key)
      })
      seen.add(parsed.mask + " " + parsed.key)
    })
  })
  // Fourteen sets of modifiers with SUPER, CTRL or ALT in them, 38 keys.
  assert.strictEqual(seen.size, 14 * 38)
  assert.strictEqual(COMBOS.length, 14 * 38)
})

test("parse: an alias is nothing but upper-case letters, digits, spaces and plus signs", function() {
  COMBOS.forEach(function(combo) {
    var alias = KeyCombo.parse(combo).alias
    assert.match(alias, ALIAS)
    assert.match(alias, /^[A-Z0-9 +]+$/)
    assert.ok(alias.indexOf(" + ") !== -1, alias)
    assert.ok(alias.length <= 40, alias)
    assert.notStrictEqual(alias.toLowerCase().replace(/ /g, ""), "all")
    // The alias is a different text than the combination wherever the
    // spelling can differ at all, and it is never taken back as input.
    if (/SUPER|CTRL|ALT/.test(combo)) assert.notStrictEqual(alias, combo)
    assert.strictEqual(KeyCombo.parse(alias), null, alias)
  })
})

test("parse: the modifiers in any other order are refused", function() {
  function permutations(list) {
    if (list.length < 2) return [list]
    var all = []
    list.forEach(function(item, i) {
      permutations(list.slice(0, i).concat(list.slice(i + 1))).forEach(function(rest) {
        all.push([item].concat(rest))
      })
    })
    return all
  }
  var refused = 0
  SUBSETS.filter(strong).forEach(function(subset) {
    permutations(subset).forEach(function(order) {
      var text = spell(MODS, order, "V")
      if (order.join() === subset.join()) {
        assert.notStrictEqual(KeyCombo.parse(text), null, text)
      } else {
        assert.strictEqual(KeyCombo.parse(text), null, text)
        refused++
      }
    })
  })
  assert.ok(refused >= 40)
})

test("parse: what it accepts is what it returns, for any small change to a combination", function() {
  var extra = [
    " ", "+", "\n", "\t", "\r", "\u0000", "\"", "'", ")", "]", "-", "/", "\\", "a", "v", "1", "F", "A"
  ]
  var samples = ["SUPER + V", "CTRL + ALT + F12", "SUPER + CTRL + ALT + SHIFT + F1", "ALT + SHIFT + A"]
  var accepted = 0
  samples.forEach(function(sample) {
    var changed = []
    for (var i = 0; i <= sample.length; i++) {
      changed.push(sample.slice(0, i) + sample.slice(i + 1))
      extra.forEach(function(ch) {
        changed.push(sample.slice(0, i) + ch + sample.slice(i))
        changed.push(sample.slice(0, i) + ch + sample.slice(i + 1))
      })
    }
    changed.push(sample.toLowerCase(), " " + sample, sample + " ", sample + sample, sample + "\n" + sample)
    changed.forEach(function(text) {
      var parsed = KeyCombo.parse(text)
      if (parsed === null) return
      accepted++
      assert.strictEqual(parsed.canonical, text)
      assert.ok(COMBOS.indexOf(text) !== -1, JSON.stringify(text))
      assert.match(parsed.alias, ALIAS)
    })
  })
  // Some changes give another combination (a different key, a modifier
  // less), so the loop above did check something.
  assert.ok(accepted > 20)
})

test("parse: only a string is read, never something that turns into one", function() {
  var disguised = [
    new String("SUPER + V"), ["SUPER + V"], { toString: function() { return "SUPER + V" } },
    { canonical: "SUPER + V" }, Object.create(null), function() { return "SUPER + V" }, Symbol("SUPER + V")
  ]
  disguised.forEach(function(value, i) {
    assert.strictEqual(KeyCombo.parse(value), null, "case " + i)
  })
})

test("parse: the result is a new object every time", function() {
  var first = KeyCombo.parse("SUPER + V")
  first.alias = "all"
  first.mask = 0
  assert.deepStrictEqual(KeyCombo.parse("SUPER + V"),
    { canonical: "SUPER + V", mask: 64, key: "V", alias: "MOD4 + V" })
})

// ---- Captured key presses ----

test("fromQt: every letter and function key with every set of the four modifiers", function() {
  KEYS.forEach(function(key, index) {
    var qtKey = index < 26 ? 0x41 + index : 0x01000030 + index - 26
    SUBSETS.forEach(function(subset) {
      var combo = KeyCombo.fromQt(qtKey, sum(QT_MODS, subset))
      assert.strictEqual(combo, strong(subset) ? spell(MODS, subset, key) : "")
      if (combo !== "") assert.strictEqual(KeyCombo.parse(combo).canonical, combo)
    })
  })
})

test("fromQt: any modifier bit besides the four refuses the press", function() {
  var held = QT_MODS[0] + QT_MODS[1]
  for (var bit = 0; bit < 53; bit++) {
    var flag = Math.pow(2, bit)
    if (QT_MODS.indexOf(flag) !== -1) continue
    assert.strictEqual(KeyCombo.fromQt(0x56, held + flag), "", "bit " + bit)
    assert.strictEqual(KeyCombo.fromQt(0x56, flag), "", "bit " + bit)
  }
  assert.strictEqual(KeyCombo.fromQt(0x56, held), "SUPER + CTRL + V")
})

test("fromQt: no other key number gives a combination", function() {
  var ranges = [[0, 0x400], [0x01000000, 0x01000100], [0x01001000, 0x01001200], [0x7ffffff0, 0x80000010]]
  var given = 0
  ranges.forEach(function(range) {
    for (var key = range[0]; key < range[1]; key++) {
      if (KeyCombo.fromQt(key, QT_MODS[0]) !== "") given++
    }
  })
  assert.strictEqual(given, KEYS.length)
})

// ---- Actions ----

test("actions: six, with constant texts that cannot be changed from outside", function() {
  assert.deepStrictEqual(KeyCombo.ACTIONS.slice(),
    ["panel", "video", "output", "playPause", "next", "previous"])
  assert.ok(Object.isFrozen(KeyCombo.ACTIONS))
  assert.ok(Object.isFrozen(KeyCombo.LAYOUT_OPTIONS))
  KeyCombo.ACTIONS.forEach(function(name) {
    var first = KeyCombo.action(name)
    var again = JSON.stringify(first)
    first.description = "changed"
    first.proposals.push("SUPER + X")
    first.proposals[0] = "all"
    assert.strictEqual(JSON.stringify(KeyCombo.action(name)), again)
  })
})

test("actions: descriptions are comma-free, distinct, plain ASCII and carry the app name", function() {
  var texts = []
  KeyCombo.ACTIONS.forEach(function(name) {
    var a = KeyCombo.action(name)
    texts.push(a.description, a.configDescription)
    assert.match(a.description, new RegExp("^" + Const.APP_NAME + ": [a-z ]+$"))
    assert.strictEqual(a.configDescription, Const.APP_NAME + " " + name + " (bindings.lua)")
    assert.match(a.label, /^[A-Z][a-z ]+$/)
  })
  texts.forEach(function(text) {
    assert.strictEqual(text.indexOf(","), -1, text)
    assert.match(text, /^[\x20-\x7e]+$/)
    // Short enough to be shown whole, and to survive the reader's cut.
    assert.ok(text.length <= 60, text)
  })
  assert.strictEqual(new Set(texts).size, 12)
})

test("actions: every proposal is a combination, and none is offered for two actions", function() {
  var all = []
  KeyCombo.ACTIONS.forEach(function(name) {
    var proposals = KeyCombo.action(name).proposals
    assert.ok(proposals.length >= 2, name)
    proposals.forEach(function(combo) {
      assert.strictEqual(KeyCombo.parse(combo).canonical, combo)
      all.push(combo)
    })
    // The first choice sits where few desktops bind anything.
    assert.strictEqual(KeyCombo.parse(proposals[0]).mask, 76)
  })
  assert.strictEqual(new Set(all).size, all.length)
})

test("command: the shell call of each action, made of constants and the plugin id", function() {
  assert.match(Const.PLUGIN_ID, /^[a-z0-9]+(\.[a-z0-9-]+)+$/)
  var calls = {
    panel: "toggle", video: "video toggle", output: "output next", playPause: "playPause", next: "next",
    previous: "previous"
  }
  KeyCombo.ACTIONS.forEach(function(name) {
    var command = KeyCombo.command(name)
    assert.strictEqual(command, "omarchy-shell -q " + Const.PLUGIN_ID + " " + calls[name])
    // Nothing a shell would treat as more than words.
    assert.match(command, /^[A-Za-z0-9 .-]+$/)
  })
})

test("command: a plugin id of another shape produces no command and no line to paste", function() {
  var real = Const.PLUGIN_ID
  var broken = [
    "", "omajuke", "a.b; reboot", "a.b\nc", "A.b", "a..b", ".a.b", "a.b.", "a.b c", "a.$(id)", 7, null
  ]
  try {
    broken.forEach(function(id) {
      Const.PLUGIN_ID = id
      KeyCombo.ACTIONS.forEach(function(name) {
        assert.strictEqual(KeyCombo.command(name), "", JSON.stringify(id))
        assert.strictEqual(KeyCombo.copyLine(name, "SUPER + V"), "", JSON.stringify(id))
      })
    })
  } finally {
    Const.PLUGIN_ID = real
  }
  assert.notStrictEqual(KeyCombo.command("panel"), "")
})

test("copyLine: one line for the user's own configuration, in the usual spelling", function() {
  KeyCombo.ACTIONS.forEach(function(name) {
    COMBOS.forEach(function(combo) {
      var line = KeyCombo.copyLine(name, combo)
      assert.strictEqual(line, "o.bind(\"" + combo + "\", \"" + KeyCombo.action(name).configDescription
        + "\", \"" + KeyCombo.command(name) + "\")")
      assert.match(line, /^o\.bind\("[A-Z0-9 +]+", "[A-Za-z .()]+", "[A-Za-z0-9 .-]+"\)$/)
      assert.strictEqual(line.split("\"").length, 7)
    })
  })
  // The pasted bind must not carry the description of a bind made at
  // runtime, or it would pass for one.
  var line = KeyCombo.copyLine("video", "SUPER + CTRL + ALT + V")
  assert.strictEqual(line.indexOf(KeyCombo.action("video").description), -1)
  assert.strictEqual(line.indexOf("MOD4"), -1)
})

// The texts of a bind exist twice: where the line for the compositor is
// built, and here, where a bind is later recognised by its description. If
// the two ever differ, a bind we made is taken for somebody else's.
test("a bind made from the Lua template is one this file recognises as ours",
  { skip: !fs.existsSync(LUA) }, function() {
    var Lua = load.lib("Lua")
    KeyCombo.ACTIONS.forEach(function(name) {
      COMBOS.forEach(function(combo) {
        var parsed = KeyCombo.parse(combo)
        var line = Lua.bind(parsed.alias, name)
        assert.ok(line.indexOf("(\"" + parsed.alias + "\",") !== -1, line)
        assert.ok(line.indexOf("(\"" + KeyCombo.command(name) + "\")") !== -1, line)
        assert.ok(line.indexOf("description = \"" + KeyCombo.action(name).description + "\"") !== -1, line)
        assert.ok(Lua.unbind(parsed.alias).indexOf("(\"" + parsed.alias + "\")") !== -1)
        // Only the alias spelling may enter a line, never the usual one.
        if (parsed.alias !== combo) assert.strictEqual(Lua.bind(combo, name), "")
      })
    })
  })

// ---- Keyboard layout ----

// What the tool answers on a desktop where only the layout was ever set. A
// text option nobody has set is printed as a marker, not as empty text.
var REPLIES = [
  "{\"option\": \"input:kb_layout\", \"str\": \"us\", \"set\": true }",
  "{\"option\": \"input:kb_variant\", \"str\": \"[[EMPTY]]\", \"set\": false }",
  "{\"option\": \"input:resolve_binds_by_sym\", \"bool\": false, \"set\": false }",
  "{\"option\": \"input:kb_file\", \"str\": \"[[EMPTY]]\", \"set\": false }"
]

test("layoutFacts: one reply per option, in the order of LAYOUT_OPTIONS", function() {
  assert.deepStrictEqual(KeyCombo.LAYOUT_OPTIONS.slice(),
    ["input:kb_layout", "input:kb_variant", "input:resolve_binds_by_sym", "input:kb_file"])
  REPLIES.forEach(function(reply, i) {
    assert.strictEqual(JSON.parse(reply).option, KeyCombo.LAYOUT_OPTIONS[i])
  })
  assert.strictEqual(KeyCombo.layoutFacts.length, KeyCombo.LAYOUT_OPTIONS.length)
  assert.deepStrictEqual(KeyCombo.layoutFacts.apply(null, REPLIES), { plainUs: true })
  assert.deepStrictEqual(KeyCombo.layoutFacts.apply(null, REPLIES.map(function(reply) {
    return JSON.parse(reply)
  })), { plainUs: true })
})

test("layoutFacts: plain US needs every one of the replies, and each in its own place", function() {
  var spoiled = [
    undefined, null, "", "ok", "no such option", "{}", "[]", "{\"str\": \"de\"}", "{\"bool\": true}",
    "{\"int\": 1}", "{\"str\": \"keymap.xkb\"}", {}, { str: 1 }, 0, false
  ]
  REPLIES.forEach(function(reply, i) {
    spoiled.forEach(function(value) {
      var replies = REPLIES.slice()
      replies[i] = value
      assert.deepStrictEqual(KeyCombo.layoutFacts.apply(null, replies), { plainUs: false },
        KeyCombo.LAYOUT_OPTIONS[i] + " = " + JSON.stringify(value))
    })
    assert.deepStrictEqual(KeyCombo.layoutFacts.apply(null, REPLIES.slice(0, i)), { plainUs: false })
  })
  // A list is no reply, whatever it carries.
  var list = []
  list.str = "us"
  assert.deepStrictEqual(KeyCombo.layoutFacts(list, REPLIES[1], REPLIES[2], REPLIES[3]), { plainUs: false })
  // A reply in the place of another one settles nothing either.
  for (var a = 0; a < REPLIES.length; a++) {
    for (var b = a + 1; b < REPLIES.length; b++) {
      var swapped = REPLIES.slice()
      swapped[a] = REPLIES[b]
      swapped[b] = REPLIES[a]
      var same = a === 1 && b === 3
      assert.deepStrictEqual(KeyCombo.layoutFacts.apply(null, swapped), { plainUs: same }, a + " and " + b)
    }
  }
})

// ---- The made-up listing ----

test("fixture: the file is what the generator builds", function() {
  assert.strictEqual(fixture, generator.build())
  assert.strictEqual(generator.build(), generator.build())
})

test("fixture: synthetic, and of the size and variety of a real desktop's listing", function() {
  assert.strictEqual(listing.ok, true)
  var headers = fixture.split("\n").filter(function(line) { return /^bind/.test(line) })
  assert.strictEqual(listing.records.length, headers.length)
  assert.ok(headers.length >= 200 && headers.length <= 260, String(headers.length))
  headers.forEach(function(header) { assert.match(header, /^bindl?m?r?e?n?a?d?x?$/) })
  assert.ok(new Set(headers).size >= 10)

  var ours = []
  KeyCombo.ACTIONS.forEach(function(name) {
    ours.push(KeyCombo.action(name).description, KeyCombo.action(name).configDescription)
  })
  var used = new Set()
  listing.records.forEach(function(r) {
    used.add(r.description)
    assert.ok(/^(Placeholder [1-9][0-9]*)?$/.test(r.description) || ours.indexOf(r.description) !== -1,
      r.description)
  })
  assert.ok(used.has(""))
  ours.forEach(function(text) { assert.ok(used.has(text), text) })

  assert.match(fixture, /^[\x20-\x7e\t\n]*$/)
  assert.doesNotMatch(fixture, /\/home\/|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|https?:/)
  assert.ok(fixture.length < Const.LIMITS.hyprBytes / 4)
  // The tool's own last line break follows the empty line of the last record.
  assert.match(fixture, /[^\n]\n\n\n$/)

  function some(test) {
    return listing.records.some(test)
  }
  function scripted(r) {
    return r.dispatcher === "__lua"
  }
  assert.ok(some(function(r) { return /^[A-Z]+( \+ [A-Z]+)* \+ code:[0-9]+$/.test(r.key) }), "key by number")
  assert.ok(some(function(r) { return /^[A-Z+]+\+code:[0-9]+$/.test(r.key) }), "written without spaces")
  assert.ok(some(function(r) { return /code:[0-9]+ \+ code:[0-9]+$/.test(r.key) }), "two keys")
  assert.ok(some(function(r) { return r.key === "code:148" }), "a bare key number")
  assert.ok(some(function(r) { return r.submap !== "" && !r.catchall && scripted(r) }), "submap")
  assert.ok(some(function(r) { return r.submap !== "" && !r.catchall && !scripted(r) }), "older submap")
  assert.ok(some(function(r) { return r.catchall && r.key === "catchall" && scripted(r) }), "catch-all")
  assert.ok(some(function(r) { return r.catchall && r.key === "" && !scripted(r) }), "older catch-all")
  assert.ok(some(function(r) { return r.catchall && r.modmask !== 0 }), "catch-all with modifiers")
  assert.ok(some(function(r) { return /^mouse:[0-9]+$/.test(r.key) && scripted(r) }), "mouse button")
  assert.ok(some(function(r) { return /^mouse:[0-9]+$/.test(r.key) && r.dispatcher === "mouse" }),
    "older mouse bind")
  assert.ok(some(function(r) { return /^mouse_(up|down)$/.test(r.key) }), "mouse wheel")
  assert.ok(some(function(r) { return /^switch:(on|off):/.test(r.key) }), "switch")
  assert.ok(some(function(r) { return r.key === "" && !r.catchall }), "no key")
  assert.ok(some(function(r) { return /\+$/.test(r.key) }), "key text ending in a plus sign")
  assert.ok(some(function(r) { return /^[a-z][0-9]?$/.test(r.key) }), "lower-case key")
  assert.ok(some(function(r) { return (r.modmask & 2) !== 0 }), "Caps Lock in the mask")
  assert.ok(some(function(r) { return (r.modmask & 16) !== 0 }), "a modifier the grammar lacks")
  // A bind from the scripted configuration is never listed with the "m"
  // flag or without its running number.
  assert.doesNotMatch(fixture, /^bind[a-z]*m[a-z]*\n(?:\t.*\n)*\tdispatcher: __lua\n/m)
  assert.doesNotMatch(fixture, /\tdispatcher: __lua\n\targ: (?![0-9]+\n)/)
})

// [combination, action, verdict on a plain US keyboard, verdict on any other]
var VERDICTS = [
  // Nobody has it, and nothing on these modifiers is unexplained.
  ["SUPER + CTRL + ALT + P", "panel", "free", "free"],
  ["SUPER + CTRL + ALT + C", "video", "free", "free"],
  ["SUPER + CTRL + ALT + F5", "video", "free", "free"],
  ["SUPER + CTRL + ALT + SHIFT + Z", "panel", "free", "free"],
  ["SUPER + CTRL + J", "panel", "free", "free"],
  ["CTRL + ALT + V", "video", "free", "free"],
  ["CTRL + ALT + F3", "video", "free", "free"],
  ["ALT + V", "video", "free", "free"],
  ["CTRL + F12", "video", "free", "free"],
  // Free only where a key given by number is known to be another key.
  ["SUPER + ALT + J", "panel", "free", "unknown"],
  ["SUPER + Z", "panel", "free", "unknown"],
  ["SUPER + SHIFT + Z", "panel", "free", "unknown"],
  ["SUPER + ALT + SHIFT + J", "panel", "free", "unknown"],
  // Taken by a key given by number, which only a plain US keyboard shows.
  ["SUPER + ALT + V", "video", "foreign", "unknown"],
  ["SUPER + A", "video", "foreign", "unknown"],
  ["SUPER + S", "video", "foreign", "unknown"],
  ["SUPER + SHIFT + B", "video", "foreign", "unknown"],
  // Somebody else's, by name in any spelling.
  ["SUPER + CTRL + ALT + J", "panel", "foreign", "foreign"],
  ["SUPER + CTRL + ALT + Q", "panel", "foreign", "foreign"],
  ["SUPER + T", "panel", "foreign", "foreign"],
  ["SUPER + G", "panel", "foreign", "foreign"],
  ["SUPER + R", "panel", "foreign", "foreign"],
  ["SUPER + CTRL + B", "panel", "foreign", "foreign"],
  ["SUPER + CTRL + SHIFT + E", "panel", "foreign", "foreign"],
  ["SUPER + ALT + B", "panel", "foreign", "foreign"],
  ["SUPER + ALT + SHIFT + C", "panel", "foreign", "foreign"],
  ["CTRL + ALT + F1", "video", "foreign", "foreign"],
  ["CTRL + ALT + F2", "video", "foreign", "foreign"],
  ["CTRL + ALT + F4", "video", "foreign", "foreign"],
  ["ALT + F4", "video", "foreign", "foreign"],
  ["CTRL + F11", "video", "foreign", "foreign"],
  // A bind of ours for another action, and one the user pasted.
  ["SUPER + CTRL + ALT + V", "panel", "foreign", "foreign"],
  ["SUPER + CTRL + ALT + O", "video", "foreign", "foreign"],
  ["SUPER + ALT + O", "panel", "foreign", "foreign"],
  ["SUPER + CTRL + ALT + SHIFT + P", "video", "foreign", "foreign"],
  ["SUPER + CTRL + ALT + SHIFT + J", "panel", "foreign", "foreign"],
  ["SUPER + CTRL + ALT + SHIFT + V", "video", "foreign", "foreign"],
  ["SUPER + CTRL + ALT + SHIFT + O", "output", "foreign", "foreign"],
  // Ours.
  ["SUPER + CTRL + ALT + SHIFT + P", "panel", "ours", "ours"],
  ["SUPER + CTRL + ALT + V", "video", "ours", "ours"],
  ["SUPER + CTRL + ALT + O", "output", "duplicate", "duplicate"],
  ["SUPER + ALT + O", "output", "shared", "shared"],
  // Cannot be confirmed: a submap, a catch-all, a numbered symbol, and two
  // binds without a key.
  ["SUPER + CTRL + ALT + K", "video", "unknown", "unknown"],
  ["SUPER + CTRL + SHIFT + J", "panel", "unknown", "unknown"],
  ["ALT + SHIFT + V", "video", "unknown", "unknown"],
  ["ALT + SHIFT + J", "panel", "unknown", "unknown"],
  ["CTRL + SHIFT + V", "video", "unknown", "unknown"],
  ["CTRL + ALT + SHIFT + V", "video", "unknown", "unknown"]
]

VERDICTS.forEach(function(row) {
  test("fixture: " + row[0] + " for " + row[1] + " is " + row[2] + " (plain US), " + row[3] + " (other)",
    function() {
      assert.strictEqual(verdict(listing.records, US, row[1], row[0]), row[2])
      assert.strictEqual(verdict(listing.records, OTHER, row[1], row[0]), row[3])
      // A layout that is not known for sure counts as "other".
      assert.strictEqual(verdict(listing.records, null, row[1], row[0]), row[3])
    })
})

test("fixture: the cases above cover every verdict", function() {
  CLASSES.forEach(function(cls) {
    assert.ok(VERDICTS.some(function(row) { return row[2] === cls || row[3] === cls }), cls)
  })
})

test("fixture: every combination gets one of the six verdicts, and never a better one without a layout",
  function() {
    COMBOS.forEach(function(combo) {
      KeyCombo.ACTIONS.forEach(function(name) {
        var us = verdict(listing.records, US, name, combo)
        var other = verdict(listing.records, OTHER, name, combo)
        assert.ok(CLASSES.indexOf(us) !== -1 && CLASSES.indexOf(other) !== -1, combo)
        // Not knowing the layout can only take certainty away.
        if (other === "free") assert.strictEqual(us, "free", combo)
        if (other !== us) assert.strictEqual(other, "unknown", combo + " " + us)
      })
    })
  })

test("fixture: whose a taken combination is", function() {
  var panel = KeyCombo.parse("SUPER + CTRL + ALT + J")
  assert.match(KeyCombo.takenBy(listing.records, US, "panel", panel), /^Placeholder [0-9]+$/)
  var video = KeyCombo.parse("SUPER + CTRL + ALT + V")
  assert.strictEqual(KeyCombo.takenBy(listing.records, US, "panel", video),
    KeyCombo.action("video").description)
  assert.strictEqual(KeyCombo.takenBy(listing.records, US, "video", video), "")
  var pasted = KeyCombo.parse("SUPER + CTRL + ALT + SHIFT + J")
  assert.strictEqual(KeyCombo.takenBy(listing.records, US, "panel", pasted),
    KeyCombo.action("panel").configDescription)
  var shared = KeyCombo.parse("SUPER + ALT + O")
  assert.match(KeyCombo.takenBy(listing.records, OTHER, "output", shared), /^Placeholder [0-9]+$/)
  // By key number: named on a plain US keyboard, not confirmed on another.
  var numbered = KeyCombo.parse("SUPER + ALT + V")
  assert.match(KeyCombo.takenBy(listing.records, US, "video", numbered), /^Placeholder [0-9]+$/)
  assert.strictEqual(KeyCombo.takenBy(listing.records, OTHER, "video", numbered), "")
})

test("fixture: proposals skip what is taken, ours already, or not confirmed", function() {
  assert.strictEqual(KeyCombo.propose(listing.records, US, "panel"), "SUPER + ALT + J")
  assert.strictEqual(KeyCombo.propose(listing.records, OTHER, "panel"), "SUPER + CTRL + ALT + P")
  assert.strictEqual(KeyCombo.propose(listing.records, US, "video"), "")
  assert.strictEqual(KeyCombo.propose(listing.records, OTHER, "video"), "")
  assert.strictEqual(KeyCombo.propose(listing.records, US, "output"), "")
  assert.strictEqual(KeyCombo.propose(listing.records, OTHER, "output"), "")
  // The later actions: K is in a submap and N is somebody else's, so only
  // the Back key is offered where nothing of theirs is bound yet.
  assert.strictEqual(KeyCombo.propose(listing.records, OTHER, "playPause"), "")
  assert.strictEqual(KeyCombo.propose(listing.records, OTHER, "next"), "")
  assert.strictEqual(KeyCombo.propose(listing.records, OTHER, "previous"), "SUPER + CTRL + ALT + B")

  // The same desktop before OmaJuke bound anything.
  var runtime = KeyCombo.ACTIONS.map(function(name) { return KeyCombo.action(name).description })
  var before = listing.records.filter(function(r) { return runtime.indexOf(r.description) === -1 })
  assert.strictEqual(before.length, listing.records.length - 8)
  assert.strictEqual(KeyCombo.propose(before, US, "video"), "SUPER + CTRL + ALT + V")
  assert.strictEqual(KeyCombo.propose(before, OTHER, "video"), "SUPER + CTRL + ALT + V")
  assert.strictEqual(KeyCombo.propose(before, OTHER, "output"), "SUPER + CTRL + ALT + O")
  assert.strictEqual(KeyCombo.propose(before, US, "panel"), "SUPER + ALT + J")
})

test("fixture: the binds a user pasted are found, each for its own action", function() {
  assert.strictEqual(KeyCombo.findConfigured(listing.records, "panel"), "SUPER + CTRL + ALT + SHIFT + J")
  assert.strictEqual(KeyCombo.findConfigured(listing.records, "video"), "SUPER + CTRL + ALT + SHIFT + V")
  assert.strictEqual(KeyCombo.findConfigured(listing.records, "output"), "SUPER + CTRL + ALT + SHIFT + O")
  assert.strictEqual(KeyCombo.findConfigured(listing.records, "playPause"), "SUPER + CTRL + ALT + SHIFT + K")
  assert.strictEqual(KeyCombo.findConfigured(listing.records, "next"), "SUPER + CTRL + ALT + SHIFT + N")
  assert.strictEqual(KeyCombo.findConfigured(listing.records, "previous"), "SUPER + CTRL + ALT + SHIFT + B")
})

test("fixture: the later format with a line of flag names gives the same verdicts", function() {
  var later = KeyCombo.parseBinds(generator.build("flags"))
  assert.strictEqual(later.ok, true)
  assert.strictEqual(later.records.length, listing.records.length)
  assert.ok(later.records.some(function(r) { return r.keycode !== 0 }))
  assert.ok(listing.records.every(function(r) { return r.keycode === 0 }))
  later.records.forEach(function(r, i) {
    var now = listing.records[i]
    assert.deepStrictEqual(
      [r.modmask, r.submap, r.key, r.catchall, r.description, r.dispatcher, r.ignoreMods],
      [now.modmask, now.submap, now.key, now.catchall, now.description, now.dispatcher, false])
  })
  COMBOS.forEach(function(combo) {
    KeyCombo.ACTIONS.forEach(function(name) {
      [US, OTHER].forEach(function(layout) {
        assert.strictEqual(verdict(later.records, layout, name, combo),
          verdict(listing.records, layout, name, combo), combo)
      })
    })
  })
})

test("fixture: line ends of the other kind change nothing", function() {
  assert.deepStrictEqual(KeyCombo.parseBinds(fixture.replace(/\n/g, "\r\n")), listing)
})

// ---- A reply that was cut short or damaged ----

test("a cut listing is refused unless the cut falls exactly between two records", function() {
  var whole = KeyCombo.parseBinds(SAMPLE)
  assert.strictEqual(whole.records.length, 12)
  var accepted = 0
  for (var length = 0; length < SAMPLE.length; length++) {
    var cut = SAMPLE.slice(0, length)
    var result = KeyCombo.parseBinds(cut)
    if (!result.ok) {
      assert.deepStrictEqual(result, BAD)
      continue
    }
    accepted++
    assert.ok(/\n\n$/.test(cut), "cut at " + length)
    assert.deepStrictEqual(result.records, whole.records.slice(0, result.records.length))
  }
  // The eleven places between two of the twelve records.
  assert.strictEqual(accepted, 11)
})

test("the fixture cut anywhere inside a record is refused", function() {
  for (var length = 1; length < fixture.length; length += 53) {
    var cut = fixture.slice(0, length)
    if (/\n\n$/.test(cut)) continue
    assert.deepStrictEqual(KeyCombo.parseBinds(cut), BAD, "cut at " + length)
  }
})

test("a listing with one line missing is refused, unless the line decides nothing", function() {
  var all = SAMPLE.split("\n")
  var harmless = 0
  for (var n = 0; n < all.length; n++) {
    var without = all.slice(0, n).concat(all.slice(n + 1)).join("\n")
    var result = KeyCombo.parseBinds(without)
    if (/^\t(description|dispatcher|arg): /.test(all[n])) {
      // What is left of the record can only be taken for somebody else's.
      assert.strictEqual(result.ok, true, all[n])
      assert.strictEqual(result.records.length, 12)
      harmless++
    } else {
      assert.deepStrictEqual(result, BAD, "line " + n + ": " + JSON.stringify(all[n]))
    }
  }
  assert.strictEqual(harmless, 36)
})

test("a listing with one line twice is refused, whichever line it is", function() {
  var all = SAMPLE.split("\n")
  for (var n = 0; n < all.length; n++) {
    // An empty line more changes nothing, and the argument is not read.
    if (all[n] === "" || /^\targ: /.test(all[n])) continue
    var twice = all.slice(0, n + 1).concat(all.slice(n)).join("\n")
    assert.deepStrictEqual(KeyCombo.parseBinds(twice), BAD, "line " + n + ": " + JSON.stringify(all[n]))
  }
})

test("a description with line breaks in it can add records, but never hide its own bind", function() {
  var hostile = [
    "x\n\nbindd\n\tmodmask: 0\n\tsubmap: \n\tkey: W\n\tkeycode: 0\n\tcatchall: false\n\tdescription: y",
    "x\n\tdispatcher: __lua\n\targ: 5\n\nbindd\n\tmodmask: 0\n\tsubmap: \n\tkey: W\n\tkeycode: 0\n"
      + "\tcatchall: false\n\tdescription: y",
    "x\n\tkey: W", "x\n\tmodmask: 0", "x\n\tsubmap: demo", "x\n\tkeycode: 0", "x\n\tcatchall: true",
    "x\n\tflags: ", "x\ny", "x\n", "\n", "x\r\n\tkey: W", "x\n\n"
  ]
  var readable = 0
  hostile.forEach(function(description) {
    var result = KeyCombo.parseBinds(lines(76, "V", description))
    if (!result.ok) return
    // A description that spells out the rest of its record and a whole
    // second one, or adds a field the record did not have, gives
    // well-formed text, which no reader can refuse. The real bind is still
    // the first record, on its own key and modifiers: what follows a key
    // can add binds, never hide the one it belongs to.
    readable++
    assert.strictEqual(result.records[0].modmask, 76)
    assert.strictEqual(result.records[0].key, "V")
    assert.strictEqual(verdict(result.records, US, "video", "SUPER + CTRL + ALT + V"), "foreign")
  })
  assert.strictEqual(readable, 3)
})

test("a key text with a line break in it is refused or weighed as unexplained, never dropped", function() {
  // The compositor ignores blanks around the parts of a key text, line
  // breaks included, and lists the text as it was written. The V key by
  // number, on the modifiers of the combination, with a break in each place
  // a part may have one.
  var mods = "MOD4 + CONTROL + MOD1"
  var texts = [
    mods + " +\ncode:55", mods + " +\n\tcode:55", mods + "\n+ code:55", mods + "\n\t+ code:55",
    "\n" + mods + " + code:55", "\n\t" + mods + " + code:55", mods + " + code:55\n", mods + " + code:55\n\t",
    "MOD4 +\n\tcode:10 + code:55", mods + " +\r\n\tcode:55", mods + " +\n\tcode: 55",
    mods + " +\n\tcode:55 +"
  ]
  var weighed = 0
  texts.forEach(function(text) {
    var result = KeyCombo.parseBinds(lines(76, text, "Placeholder 1"))
    var got = verdict(result.records, US, "video", "SUPER + CTRL + ALT + V")
    assert.ok(got === "unknown" || got === "foreign", JSON.stringify(text) + " is " + got)
    if (result.ok) weighed++
  })
  // Both ways out occur: a second line shaped like a field passes the
  // reader, and the part before it is then left with nothing after a plus.
  assert.ok(weighed >= 2 && weighed < texts.length, String(weighed))
})

test("the reader agrees with a second reader on every text of the table and the fixture", function() {
  var texts = [fixture, generator.build("flags"), fixture.replace(/\n/g, "\r\n"), SAMPLE, SAMPLE + "\n\n\n"]
  table.CASES.forEach(function(c) {
    if (c.fn === "parseBinds" && typeof c.args[0] === "string") texts.push(c.args[0])
  })
  assert.ok(texts.length > 120)
  texts.forEach(function(text) {
    assert.deepStrictEqual(KeyCombo.parseBinds(text), reference(text), JSON.stringify(text).slice(0, 160))
  })
})

test("the reader agrees with the second reader on thousands of damaged listings", function() {
  var next = sequence(20240229)
  var pieces = [
    "\n", "\n\n", "\t", ":", ": ", " ", "+", "\r", "\r\n", "\u0000", "bind", "bindd\n", "\tkey: V\n",
    "\tmodmask: 76\n", "\tcatchall: true\n", "\tsubmap: demo\n", "\tflags: ignore_mods\n", "code:55", "x"
  ]
  var allLines = SAMPLE.split("\n")
  var good = 0
  for (var round = 0; round < 6000; round++) {
    var text = SAMPLE
    var changes = 1 + next(3)
    for (var c = 0; c < changes; c++) {
      var at = next(text.length + 1)
      var kind = next(6)
      if (kind === 0) text = text.slice(0, at) + text.slice(at + 1 + next(4))
      else if (kind === 1) text = text.slice(0, at) + pieces[next(pieces.length)] + text.slice(at)
      else if (kind === 2) text = text.slice(0, at) + pieces[next(pieces.length)] + text.slice(at + 1)
      else if (kind === 3) text = text.slice(0, at)
      else {
        // Whole lines: one dropped, replaced by another, or moved.
        var rows = text.split("\n")
        var from = next(rows.length)
        var moved = rows.splice(from, 1)[0]
        if (kind === 5) rows.splice(next(rows.length + 1), 0, moved)
        else if (next(2) === 0) rows.splice(from, 0, allLines[next(allLines.length)])
        text = rows.join("\n")
      }
    }
    var result = KeyCombo.parseBinds(text)
    assert.deepStrictEqual(result, reference(text), JSON.stringify(text))
    if (result.ok) {
      good++
      assert.ok(result.records.length >= 1 && result.records.length <= 2000)
    } else {
      assert.strictEqual(verdict(result.records, US, "video", "SUPER + CTRL + ALT + V"), "unknown")
    }
  }
  // Both outcomes have to occur, or the comparison above proved little.
  assert.ok(good > 200 && good < 5800, String(good))
})

test("a listing that cannot be read leaves every combination unknown and nothing proposed", function() {
  var unreadable = 0
  table.CASES.forEach(function(c) {
    if (c.fn !== "parseBinds" || typeof c.args[0] !== "string" || c.expect.ok) return
    unreadable++
    var result = KeyCombo.parseBinds(c.args[0])
    assert.deepStrictEqual(result, BAD)
    KeyCombo.ACTIONS.forEach(function(name) {
      KeyCombo.action(name).proposals.forEach(function(combo) {
        assert.strictEqual(verdict(result.records, US, name, combo), "unknown")
      })
      assert.strictEqual(KeyCombo.propose(result.records, US, name), "")
      assert.strictEqual(KeyCombo.findConfigured(result.records, name), "")
    })
  })
  assert.ok(unreadable > 90)
  // Handing over the whole result instead of its records is caught as well.
  assert.strictEqual(verdict(listing, US, "panel", "SUPER + CTRL + ALT + P"), "unknown")
  assert.strictEqual(verdict(listing.records, US, "panel", "SUPER + CTRL + ALT + P"), "free")
})

test("a bad result is a new object every time", function() {
  var first = KeyCombo.parseBinds("")
  first.ok = true
  first.records = [record(64, "W", "x")]
  assert.deepStrictEqual(KeyCombo.parseBinds(""), BAD)
})

// A compositor without a single bind answers with the line it has for an
// empty result. That is a list, and every combination in it is free; an
// empty reply stays what it was, a read that failed.
test("a desktop without binds is a list that was read", function() {
  var none = KeyCombo.parseBinds("unknown request\n")
  assert.deepStrictEqual(none, { ok: true, records: [] })
  none.records.push(record(76, "V", "x"))
  assert.deepStrictEqual(KeyCombo.parseBinds("unknown request\n"), { ok: true, records: [] })
  KeyCombo.ACTIONS.forEach(function(name) {
    var proposals = KeyCombo.action(name).proposals
    assert.strictEqual(KeyCombo.propose([], US, name), proposals[0])
    proposals.forEach(function(combo) {
      assert.strictEqual(verdict([], US, name, combo), "free")
      assert.strictEqual(verdict(KeyCombo.parseBinds("\n").records, US, name, combo), "unknown")
      assert.strictEqual(verdict(KeyCombo.parseBinds("").records, US, name, combo), "unknown")
    })
    assert.deepStrictEqual(KeyCombo.findRuntime([], name), [])
    assert.strictEqual(KeyCombo.findConfigured([], name), "")
  })
})

// ---- A model of the compositor ----

// The verdicts are compared with a slow, plain model of the three things the
// compositor does with a bind: reading its key text, printing it in the
// list, and deciding whether a key press triggers it. The model knows what
// each bind really is. classify() only ever sees the printed list.

// Key symbols by name, with the numbers the keyboard library gives them:
// the letters in both cases, the function keys (two of which have a second
// name) and a few others.
var SYMBOLS = new Map()
LETTERS.forEach(function(letter) {
  SYMBOLS.set(letter, letter.charCodeAt(0))
  SYMBOLS.set(letter.toLowerCase(), letter.toLowerCase().charCodeAt(0))
})
F_KEYS.forEach(function(name, i) { SYMBOLS.set(name, 0xffbe + i) })
SYMBOLS.set("L1", 0xffc8).set("L2", 0xffc9).set("F13", 0xffca).set("L3", 0xffca)
SYMBOLS.set("Return", 0xff0d).set("space", 0x20).set("Tab", 0xff09).set("comma", 0x2c).set("Up", 0xff52)

// The number of the symbol a name stands for, or 0: by its exact name, or
// (anyCase) by its name in any case with the lower-case symbol preferred,
// and failing that as "U" and a hexadecimal character code, or as "0x" and
// the number itself.
function symbolOf(name, anyCase) {
  if (!anyCase && SYMBOLS.has(name)) return SYMBOLS.get(name)
  if (anyCase) {
    var found = 0
    SYMBOLS.forEach(function(value, known) {
      if (known.toLowerCase() !== name.toLowerCase()) return
      if (found === 0 || known === name.toLowerCase()) found = value
    })
    if (found !== 0) return found
  }
  var written = anyCase ? name.replace(/^u/, "U").replace(/^0X/, "0x") : name
  var hex = /^(U|0x)([0-9a-fA-F]{1,8})$/.exec(written)
  if (!hex) return 0
  var value = parseInt(hex[2], 16)
  if (hex[1] === "0x") return value
  if (value < 0x20 || (value > 0x7e && value < 0xa0) || value > 0x10ffff) return 0
  return value < 0x100 ? value : value + 0x01000000
}

var MOD_BITS = new Map([
  ["SHIFT", 1], ["CAPS", 2], ["CTRL", 4], ["CONTROL", 4], ["ALT", 8], ["MOD1", 8], ["MOD2", 16],
  ["SUPER", 64], ["WIN", 64], ["LOGO", 64], ["MOD4", 64], ["META", 64]
])

function blankBind() {
  return {
    // What was written, the modifier mask, and the keys in the order given:
    // { symbol, code }, one of the two being 0.
    text: "", modmask: 0, keys: [], keycode: 0,
    // What the list prints as the key, when it is not the whole text.
    shown: "",
    special: false, catchall: false, older: false, broken: false
  }
}

// A key text as the scripted configuration reads it, or null when it is
// refused. Modifiers come first and are upper case, the parts are split at
// plus signs with the blanks around them dropped, an empty part is skipped,
// a button or a switch stands alone, and "code:N" names a key by number.
function scripted(text) {
  var bind = blankBind()
  bind.text = text
  // An empty part or a blank other than a space or a tab: the bind is
  // made all the same, and its text is no longer what one would write.
  bind.broken = /^\s*$|^\s*\+|\+\s*\+|\+\s*$|[\v\f\r]/.test(text)
  if (text === "catchall") {
    bind.catchall = true
    return bind
  }
  var parts = text.split("+").map(function(part) { return part.replace(/^\s+|\s+$/g, "") })
  var keysBegan = false
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i]
    if (part === "") continue
    if (MOD_BITS.has(part)) {
      if (keysBegan) return null
      bind.modmask |= MOD_BITS.get(part)
      continue
    }
    keysBegan = true
    if (bind.special) return null
    if (/^(?:mouse_(?:down|up|left|right)$|mouse:|switch:)/.test(part)) {
      if (bind.keys.length > 0) return null
      bind.special = true
      bind.shown = part
      continue
    }
    var numbered = /^code:([0-9]+)$/.exec(part)
    if (numbered) {
      bind.keys.push({ symbol: 0, code: Number(numbered[1]) })
      continue
    }
    var symbol = symbolOf(part, true)
    if (symbol === 0) return null
    bind.keys.push({ symbol: symbol, code: 0 })
    bind.shown = part
  }
  return bind
}

// "MODS, KEY" as the older configuration style reads it: the modifiers are
// found anywhere in their text, a number above 9 and "code:N" are a key
// number, and a bind written for several keys at once (several) keeps no
// key of its own.
function older(mods, key, several) {
  var bind = blankBind()
  bind.older = true
  MOD_BITS.forEach(function(bit, name) {
    if (mods.toUpperCase().indexOf(name) !== -1) bind.modmask |= bit
  })
  if (several) return bind
  if (/^[0-9]+$/.test(key) && Number(key) > 9) bind.keycode = Number(key)
  else if (/^code:[0-9]+$/.test(key)) bind.keycode = Number(key.slice(5))
  else if (key === "catchall") bind.catchall = true
  else bind.shown = key
  bind.special = /^(?:mouse|switch):/.test(key)
  return bind
}

function printed(bind) {
  return "bind" + (bind.description === "" ? "" : "d") + "\n\tmodmask: " + bind.modmask + "\n\tsubmap: "
    + bind.submap + "\n\tkey: " + (bind.shown === "" ? bind.text : bind.shown) + "\n\tkeycode: "
    + bind.keycode + "\n\tcatchall: " + bind.catchall + "\n\tdescription: " + bind.description
    + "\n\tdispatcher: " + (bind.older ? "exec" : "__lua") + "\n\targ: 1\n\n"
}

// True when pressing or releasing a key (its symbol and number) with
// exactly these modifiers held can trigger the bind while the bind's submap
// is the current one. A bind on several keys acts on its last one, once the
// others are down.
function triggers(bind, mask, press) {
  if (bind.modmask !== mask) return false
  if (bind.keys.length > 0) {
    var last = bind.keys[bind.keys.length - 1]
    return press.symbol === last.symbol || press.code === last.code
  }
  if (bind.keycode !== 0) return press.code === bind.keycode
  if (bind.catchall) return true
  var exact = symbolOf(bind.shown, false)
  var loose = symbolOf(bind.shown, true)
  return (exact !== 0 || loose !== 0) && (press.symbol === exact || press.symbol === loose)
}

// A bind on several keys is listed under the last key it names. When a key
// given by number comes after that one, the list shows a key that does not
// trigger the bind, and nobody reading the list can know. Such a bind is
// taken here for what the list says it is.
function hidden(bind) {
  return bind.keys.length > 1 && bind.shown !== "" && bind.keys[bind.keys.length - 1].code !== 0
}

function triggersAsListed(bind, mask, press) {
  if (!hidden(bind)) return triggers(bind, mask, press)
  return bind.modmask === mask && press.symbol === symbolOf(bind.shown, true)
}

// Key numbers on a plain US keyboard: the kernel's numbers for the three
// letter rows and the function keys, plus eight.
var US_CODES = new Map()
var ROWS = [["QWERTYUIOP", 16], ["ASDFGHJKL", 30], ["ZXCVBNM", 44]]
ROWS.forEach(function(row) {
  row[0].split("").forEach(function(letter, i) { US_CODES.set(letter, row[1] + i + 8) })
})
var F_CODES = new Map()
F_KEYS.forEach(function(name, i) { F_CODES.set(name, (i < 10 ? 59 + i : 77 + i) + 8) })

// A keyboard on which the letters sit on other keys: each on the key of
// another letter, or on one that is punctuation on a US keyboard.
function otherKeyboard(next) {
  var places = Array.from(US_CODES.values()).concat([20, 21, 34, 35, 47, 48, 51, 59, 60, 61])
  var codes = new Map()
  LETTERS.forEach(function(letter) {
    codes.set(letter, places.splice(next(places.length), 1)[0])
  })
  return codes
}

function pressOf(key, codes) {
  if (F_CODES.has(key)) return { symbol: SYMBOLS.get(key), code: F_CODES.get(key) }
  return { symbol: SYMBOLS.get(key.toLowerCase()), code: codes.get(key) }
}

// What a bind means for a key ("taken", "unsure" or "none"), worked out
// from what the bind is, as far as the list shows it.
function meaning(bind, key, plainUs) {
  var found = []
  function byNumber(code) {
    var fixed = Array.from(F_CODES.keys()).filter(function(name) { return F_CODES.get(name) === code })
    if (fixed.length > 0) found.push(fixed[0] === key ? "taken" : "none")
    else if (!plainUs) found.push("unsure")
    else found.push(US_CODES.get(key) === code ? "taken" : "none")
  }
  function byName(name) {
    var upper = name.toUpperCase()
    if (upper === key || (upper === "L1" && key === "F11") || (upper === "L2" && key === "F12")) {
      found.push("taken")
    } else {
      found.push(/^(?:u|0x)[0-9a-f]+$/i.test(name) ? "unsure" : "none")
    }
  }
  if (bind.catchall) found.push("unsure")
  else if (bind.special) found.push("none")
  else if (bind.keycode !== 0) byNumber(bind.keycode)
  else if (bind.shown !== "") byName(bind.shown)
  else if (bind.older) found.push("unsure")
  else {
    bind.keys.forEach(function(one) { byNumber(one.code) })
    if (bind.broken) found.push("unsure")
  }
  var result = found.indexOf("taken") !== -1 ? "taken" : found.indexOf("unsure") !== -1 ? "unsure" : "none"
  return bind.submap !== "" && result !== "none" ? "unsure" : result
}

// The verdict the rules give when they are applied to the binds themselves.
function expected(binds, mask, key, plainUs, description) {
  var ours = 0
  var theirs = 0
  var unsure = 0
  binds.forEach(function(bind) {
    if ((bind.modmask & ~2) !== mask) return
    var means = meaning(bind, key, plainUs)
    if (means === "unsure") unsure++
    if (means !== "taken") return
    // Ours is what a bind made here looks like in the list: scripted, under
    // the action's description, on exactly these modifiers, the key by name.
    if (!bind.older && bind.description === description && bind.modmask === mask && bind.shown === key) ours++
    else theirs++
  })
  if (theirs > 0) return ours > 0 ? "shared" : "foreign"
  if (unsure > 0) return "unknown"
  return ours === 0 ? "free" : ours === 1 ? "ours" : "duplicate"
}

// The masks and keys the made-up desktops below are built from and asked
// about: every key a bind there can be on, and two it cannot.
var MODEL_MASKS = [4, 8, 12, 64, 65, 68, 72, 76, 77]
var MODEL_KEYS = ["J", "V", "O", "P", "A", "B", "Z", "K", "F1", "F2", "F5", "F11", "F12"]
var MODEL_NAMES = new Map([
  [64, ["SUPER", "MOD4", "WIN", "LOGO", "META"]], [4, ["CTRL", "CONTROL"]], [8, ["ALT", "MOD1"]],
  [1, ["SHIFT"]]
])

function comboOf(mask, key) {
  var subset = [0, 1, 2, 3].filter(function(i) { return (mask & BITS[i]) !== 0 })
  return spell(MODS, subset, key)
}

// One made-up desktop: a handful of binds in every shape the two
// configuration styles allow, a few of them made the way OmaJuke makes its
// own.
function desktop(next) {
  function pick(list) {
    return list[next(list.length)]
  }
  function hexOf(text) {
    return text.charCodeAt(0).toString(16)
  }
  function someKey() {
    var letter = pick(["j", "v", "o", "p", "a", "b", "z"])
    var kind = next(13)
    if (kind === 0) return letter
    if (kind === 1) return pick(["F1", "F2", "F11", "F12", "f11", "f2", "L1", "L2", "l1", "l2", "F13", "L3"])
    if (kind < 4) return "code:" + pick([55, 44, 32, 33, 38, 56, 58, 24, 67, 68, 95, 96, 10, 47, "055", 250])
    if (kind === 4) {
      return pick([
        "U" + hexOf(letter), "u00" + hexOf(letter), "0x" + hexOf(letter), "0X" + hexOf(letter),
        "U" + hexOf(letter.toUpperCase()), "0xffbe", "0xFFC9"
      ])
    }
    if (kind === 5) return pick(["Return", "space", "Tab", "comma", "Up", "RETURN", "up"])
    if (kind === 6) return pick(["mouse:272", "mouse_down", "mouse_up", "switch:on:Example Switch"])
    return letter.toUpperCase()
  }
  function someMods() {
    var mask = pick([0, 72, 76, 76].concat(MODEL_MASKS))
    var names = []
    MODEL_NAMES.forEach(function(spellings, bit) {
      if ((mask & bit) !== 0) names.push(pick(spellings))
    })
    if (next(10) === 0) names.push("CAPS")
    if (next(25) === 0) names.push("MOD2")
    return names
  }
  function someText() {
    var mods = someMods()
    var parts = mods.concat([someKey()])
    if (next(7) === 0) parts.push(someKey())
    if (next(30) === 0) parts.pop()
    var text = parts.join(pick([" + ", " + ", " + ", "+", " +", "+ ", "  +  ", "\t+ ", " + \t"]))
    // Texts nobody would write and the compositor takes all the same: a
    // plus sign too many, or a blank of another kind in front of the first
    // modifier.
    if (next(25) === 0) text += pick([" +", "+", " + "])
    if (next(25) === 0) text = pick(["+ ", " + ", "+"]) + text
    if (next(40) === 0) text = text.replace("+", "+ +")
    if (mods.length > 0 && next(40) === 0) text = pick(["\r", "\v", "\f"]) + text
    return text
  }
  var descriptions = ["Placeholder 1", ""]
  KeyCombo.ACTIONS.forEach(function(name) {
    descriptions.push(KeyCombo.action(name).description, KeyCombo.action(name).configDescription)
  })
  var binds = []
  var count = 1 + next(7)
  while (binds.length < count) {
    var bind = null
    var kind = next(10)
    if (kind < 2) {
      // The way a bind is made here: the alias spelling of a combination,
      // under the description of an action.
      bind = scripted(KeyCombo.parse(comboOf(pick([12, 72, 76, 76]), pick(["J", "V", "O", "F11"]))).alias)
      bind.description = KeyCombo.action(pick(KeyCombo.ACTIONS)).description
      bind.submap = ""
      binds.push(bind)
      if (next(4) === 0) binds.push(Object.assign({}, bind))
      continue
    }
    if (kind < 4) {
      var several = next(8) === 0
      var oldKey = pick([someKey(), someKey(), "55", "44", "9", "68", "catchall"])
      bind = older(someMods().join(pick([" ", "_", "&", ""])), oldKey, several)
    } else {
      bind = scripted(next(40) === 0 ? "catchall" : someText())
    }
    if (bind === null) continue
    bind.submap = bind.catchall || next(8) === 0 ? "demo" : ""
    bind.description = pick(descriptions)
    binds.push(bind)
  }
  return binds
}

test("a key given by number: every number against every key of the grammar", function() {
  var combos = KEYS.map(function(key) { return KeyCombo.parse("SUPER + CTRL + ALT + " + key) })
  var fixedCodes = Array.from(F_CODES.values())
  var taken = 0
  for (var code = 0; code < 300; code++) {
    // The number as part of the key text, and in the field of its own that
    // later versions of the compositor fill in.
    var inText = [record(76, "SUPER + CTRL + ALT + code:" + code, "Placeholder 1")]
    var inField = [Object.assign(record(76, "", "Placeholder 1"), { keycode: code })]
    var fixed = fixedCodes.indexOf(code) !== -1
    KEYS.forEach(function(key, i) {
      var isKey = (F_CODES.has(key) ? F_CODES.get(key) : US_CODES.get(key)) === code
      var known = isKey ? "foreign" : "free"
      var where = "code:" + code + " for " + key
      assert.strictEqual(KeyCombo.classify(inText, US, "video", combos[i]), known, where)
      assert.strictEqual(KeyCombo.classify(inText, OTHER, "video", combos[i]), fixed ? known : "unknown",
        where)
      // Without a number and without a text there is nothing to go by.
      assert.strictEqual(KeyCombo.classify(inField, US, "video", combos[i]), code === 0 ? "unknown" : known,
        where)
      if (isKey) taken++
    })
  }
  // Each key of the grammar has exactly one number.
  assert.strictEqual(taken, KEYS.length)
  assert.strictEqual(new Set(Array.from(US_CODES.values()).concat(fixedCodes)).size, KEYS.length)
})

test("the verdicts agree with a model of the compositor on thousands of made-up desktops", function() {
  var next = sequence(20250306)
  var seen = new Map(CLASSES.map(function(cls) { return [cls, 0] }))
  var refusedToBind = 0
  for (var round = 0; round < 2500; round++) {
    var binds = desktop(next)
    var text = binds.map(printed).join("") + "\n"
    var read = KeyCombo.parseBinds(text)
    assert.strictEqual(read.ok, true, JSON.stringify(text))
    assert.strictEqual(read.records.length, binds.length)
    var shuffled = otherKeyboard(next)
    MODEL_MASKS.forEach(function(mask) {
      MODEL_KEYS.forEach(function(key) {
        var combo = KeyCombo.parse(comboOf(mask, key))
        var usPress = pressOf(key, US_CODES)
        var otherPress = pressOf(key, shuffled)
        KeyCombo.ACTIONS.forEach(function(name) {
          var description = KeyCombo.action(name).description
          var where = combo.canonical + " for " + name + " in " + JSON.stringify(text)
          var us = KeyCombo.classify(read.records, US, name, combo)
          var other = KeyCombo.classify(read.records, OTHER, name, combo)
          seen.set(us, seen.get(us) + 1)

          // The rules, applied to the binds themselves, give the same answer.
          assert.strictEqual(us, expected(binds, mask, key, true, description), where)
          assert.strictEqual(other, expected(binds, mask, key, false, description), where + " (other)")

          // Free means that pressing the combination triggers nothing that
          // the list shows, in any submap, whichever keyboard it is.
          var usHits = binds.filter(function(bind) { return triggersAsListed(bind, mask, usPress) })
          var otherHits = binds.filter(function(bind) { return triggersAsListed(bind, mask, otherPress) })
          if (us === "free") assert.strictEqual(usHits.length, 0, where)
          else refusedToBind++
          if (other === "free") {
            assert.strictEqual(us, "free", where)
            assert.strictEqual(otherHits.length, 0, where + " (other)")
          }

          // Ours means that it triggers binds under this action's
          // description and nothing else, and as many as the verdict says.
          if (us === "ours" || us === "duplicate") {
            assert.ok(usHits.every(function(bind) {
              return bind.description === description && bind.submap === "" && !bind.older
            }), where)
            assert.ok(us === "ours" ? usHits.length === 1 : usHits.length > 1, where)
          }
          if (other === "ours" || other === "duplicate") {
            assert.ok(otherHits.every(function(bind) { return bind.description === description }), where)
          }

          // No bind at all on these modifiers leaves the combination free.
          if (binds.every(function(bind) { return (bind.modmask & ~2) !== mask })) {
            assert.strictEqual(us, "free", where)
            assert.strictEqual(other, "free", where)
          }
        })
      })
    })
  }
  // Every verdict has to occur often, or the comparison proved little.
  seen.forEach(function(count, cls) { assert.ok(count >= 100, cls + " " + count) })
  assert.ok(refusedToBind > 20000)
})

test("more binds never make a combination safer, and their order decides nothing", function() {
  var next = sequence(20250307)
  var blocked = ["foreign", "shared", "unknown"]
  var checked = 0
  for (var round = 0; round < 1500; round++) {
    var first = KeyCombo.parseBinds(desktop(next).map(printed).join("") + "\n").records
    var second = KeyCombo.parseBinds(desktop(next).map(printed).join("") + "\n").records
    var both = first.concat(second)
    var turned = both.slice().reverse()
    var mask = MODEL_MASKS[next(MODEL_MASKS.length)]
    var combo = KeyCombo.parse(comboOf(mask, MODEL_KEYS[next(MODEL_KEYS.length)]))
    KeyCombo.ACTIONS.forEach(function(name) {
      [US, OTHER].forEach(function(layout) {
        var alone = KeyCombo.classify(first, layout, name, combo)
        var joined = KeyCombo.classify(both, layout, name, combo)
        assert.strictEqual(KeyCombo.classify(turned, layout, name, combo), joined)
        // A combination that may not be bound stays that way, and one whose
        // binds may not be removed stays that way too.
        if (alone !== "free") assert.notStrictEqual(joined, "free")
        if (blocked.indexOf(alone) !== -1) {
          assert.ok(blocked.indexOf(joined) !== -1, alone + " then " + joined)
        }
        if (alone !== "free") checked++
      })
    })
  }
  assert.ok(checked > 300, String(checked))
})

// ---- Arguments of the wrong kind ----

test("classify: a list holding anything but well-formed records is unknown", function() {
  var junk = [
    null, undefined, 0, -1, 1.5, NaN, Infinity, "", "76", "V", true, false, [], [76], {}, { valueOf: null },
    function() {}, Symbol("x")
  ]
  var kinds = {
    modmask: "count", keycode: "count", submap: "string", key: "string", description: "string",
    dispatcher: "string", catchall: "boolean", ignoreMods: "boolean"
  }
  function fits(value, kind) {
    if (kind === "count") return typeof value === "number" && isFinite(value) && value >= 0 && value % 1 === 0
    return typeof value === kind
  }
  var refused = 0
  Object.keys(kinds).forEach(function(name) {
    junk.forEach(function(value) {
      var odd = record(64, "W", "Placeholder 1")
      odd[name] = value
      var got = verdict([record(64, "Y", "Placeholder 2"), odd], US, "video", "SUPER + CTRL + ALT + V")
      if (fits(value, kinds[name])) {
        assert.ok(CLASSES.indexOf(got) !== -1)
        return
      }
      refused++
      assert.strictEqual(got, "unknown", name + " = " + String(value))
      assert.strictEqual(KeyCombo.propose([odd], US, "video"), "")
      assert.strictEqual(KeyCombo.findConfigured([odd], "video"), "")
    })
    var missing = record(64, "W", "Placeholder 1")
    delete missing[name]
    assert.strictEqual(verdict([missing], US, "video", "SUPER + CTRL + ALT + V"), "unknown", name)
  })
  assert.ok(refused > 100)
})

test("classify: a list longer than a listing can be, or nested deeply, is unknown", function() {
  var one = record(64, "W", "Placeholder 1")
  var many = []
  for (var i = 0; i < 10000; i++) many.push(one)
  assert.strictEqual(verdict(many, US, "video", "SUPER + CTRL + ALT + V"), "unknown")
  assert.strictEqual(verdict(many.slice(0, 2001), US, "video", "SUPER + CTRL + ALT + V"), "unknown")
  assert.strictEqual(verdict(many.slice(0, 2000), US, "video", "SUPER + CTRL + ALT + V"), "free")
  assert.strictEqual(KeyCombo.propose(many, US, "video"), "")
  assert.strictEqual(KeyCombo.findConfigured(many, "video"), "")

  var deep = []
  for (var d = 0; d < 5000; d++) deep = [deep]
  assert.strictEqual(verdict(deep, US, "video", "SUPER + CTRL + ALT + V"), "unknown")
  assert.strictEqual(verdict([deep], US, "video", "SUPER + CTRL + ALT + V"), "unknown")
  var nested = record(64, "W", "Placeholder 1")
  nested.key = deep
  assert.strictEqual(verdict([nested], US, "video", "SUPER + CTRL + ALT + V"), "unknown")
  assert.deepStrictEqual(KeyCombo.layoutFacts(deep, deep, deep, deep), { plainUs: false })
})

// An object whose named member cannot be read, and one of which nothing
// can be read at all.
function failingAt(base, name) {
  var copy = Object.assign({}, base)
  Object.defineProperty(copy, name, { get: function() { throw new Error("not readable") } })
  return copy
}

function unreadable(target) {
  var refuse = function() { throw new Error("not readable") }
  return new Proxy(target, { get: refuse, has: refuse, ownKeys: refuse, getOwnPropertyDescriptor: refuse })
}

test("an argument that fails when it is read gives the cautious answer, never an error", function() {
  var good = record(64, "W", "Placeholder 1")
  var combo = KeyCombo.parse("SUPER + CTRL + ALT + V")
  var lists = [unreadable([good]), [unreadable(good)], [good, unreadable({})]]
  Object.keys(good).forEach(function(name) { lists.push([good, failingAt(good, name)]) })
  lists.forEach(function(list, i) {
    assert.strictEqual(KeyCombo.classify(list, US, "video", combo), "unknown", "list " + i)
    assert.strictEqual(KeyCombo.takenBy(list, US, "video", combo), "", "list " + i)
    assert.strictEqual(KeyCombo.findConfigured(list, "video"), "", "list " + i)
    assert.strictEqual(KeyCombo.propose(list, US, "video"), "", "list " + i)
  })
  var combos = [unreadable(combo)]
  Object.keys(combo).forEach(function(name) { combos.push(failingAt(combo, name)) })
  combos.forEach(function(parsed, i) {
    assert.strictEqual(KeyCombo.classify([good], US, "video", parsed), "unknown", "combination " + i)
    assert.strictEqual(KeyCombo.takenBy([good], US, "video", parsed), "", "combination " + i)
  })
  // A layout that cannot be read is no layout: the key by number stays
  // unexplained.
  var numbered = [record(76, "SUPER + CTRL + ALT + code:54", "Placeholder 1")]
  assert.strictEqual(KeyCombo.classify(numbered, US, "video", combo), "free")
  var layouts = [unreadable(US), failingAt(US, "plainUs")]
  layouts.forEach(function(layout) {
    assert.strictEqual(KeyCombo.classify(numbered, layout, "video", combo), "unknown")
    assert.strictEqual(KeyCombo.propose(numbered, layout, "video"), "")
  })
  var reply = { str: "us", bool: false, int: 0 }
  var replies = [unreadable(reply)].concat(Object.keys(reply).map(function(name) {
    return failingAt(reply, name)
  }))
  replies.forEach(function(broken, i) {
    for (var place = 0; place < 4; place++) {
      var args = [{ str: "us" }, { str: "" }, { bool: false }, { str: "" }]
      args[place] = broken
      assert.deepStrictEqual(KeyCombo.layoutFacts.apply(null, args), { plainUs: false }, i + " at " + place)
    }
  })
  var names = [unreadable({}), { toString: function() { throw new Error("not readable") } }]
  names.forEach(function(name) {
    assert.strictEqual(KeyCombo.action(name), null)
    assert.strictEqual(KeyCombo.command(name), "")
    assert.strictEqual(KeyCombo.copyLine(name, "SUPER + V"), "")
    assert.strictEqual(KeyCombo.classify([good], US, name, combo), "unknown")
    assert.strictEqual(KeyCombo.findConfigured([good], name), "")
    assert.strictEqual(KeyCombo.propose([good], US, name), "")
    assert.strictEqual(KeyCombo.parse(name), null)
    assert.strictEqual(KeyCombo.fromQt(name, name), "")
    assert.deepStrictEqual(KeyCombo.parseBinds(name), BAD)
  })
})

test("every member of a record, a combination and a reply is read once, so it cannot change under way",
  function() {
    // Each member answers with its first value once and with another one
    // ever after. The verdict has to be the one for the first values.
    function shifting(first, later, reads) {
      var object = {}
      Object.keys(first).forEach(function(name) {
        reads[name] = 0
        Object.defineProperty(object, name, {
          enumerable: true,
          get: function() { return reads[name]++ === 0 ? first[name] : later[name] }
        })
      })
      return object
    }
    var combo = KeyCombo.parse("SUPER + CTRL + ALT + V")
    var harmless = record(64, "W", "Placeholder 1")
    var taken = record(76, "V", "Placeholder 2")
    var cases = [[harmless, taken, "free"], [taken, harmless, "foreign"]]
    cases.forEach(function(one) {
      var reads = {}
      assert.strictEqual(KeyCombo.classify([shifting(one[0], one[1], reads)], US, "video", combo), one[2])
      Object.keys(reads).forEach(function(name) { assert.strictEqual(reads[name], 1, name) })
    })

    var other = KeyCombo.parse("SUPER + W")
    var comboReads = {}
    assert.strictEqual(KeyCombo.classify([harmless], US, "video", shifting(combo, other, comboReads)), "free")
    Object.keys(comboReads).forEach(function(name) { assert.strictEqual(comboReads[name], 1, name) })
    comboReads = {}
    assert.strictEqual(KeyCombo.classify([harmless], US, "video", shifting(other, combo, comboReads)),
      "foreign")

    var layoutReads = {}
    var numbered = [record(76, "SUPER + CTRL + ALT + code:54", "Placeholder 1")]
    var shiftingLayout = shifting(OTHER, US, layoutReads)
    assert.strictEqual(KeyCombo.classify(numbered, shiftingLayout, "video", combo), "unknown")
    assert.strictEqual(layoutReads.plainUs, 1)

    var replyReads = {}
    var facts = KeyCombo.layoutFacts(shifting({ str: "de" }, { str: "us" }, replyReads), { str: "" },
      { bool: false }, { str: "" })
    assert.deepStrictEqual(facts, { plainUs: false })
    assert.strictEqual(replyReads.str, 1)
  })

test("nothing a caller hands over is changed, and nothing reaches the prototype of all objects", function() {
  var records = [record(76, "V", "Placeholder 1"), record(76, "V", KeyCombo.action("video").description)]
  var frozen = Object.freeze(records.map(function(r) { return Object.freeze(Object.assign({}, r)) }))
  var combo = Object.freeze(KeyCombo.parse("SUPER + CTRL + ALT + V"))
  assert.strictEqual(KeyCombo.classify(frozen, Object.freeze({ plainUs: true }), "video", combo), "shared")
  assert.strictEqual(KeyCombo.takenBy(frozen, US, "video", combo), "Placeholder 1")
  assert.strictEqual(KeyCombo.findConfigured(frozen, "video"), "")
  assert.strictEqual(KeyCombo.propose(frozen, US, "video"), "SUPER + ALT + V")

  var polluting = JSON.parse("{\"__proto__\": {\"plainUs\": true, \"str\": \"us\", \"modmask\": 0}}")
  assert.deepStrictEqual(KeyCombo.layoutFacts(polluting, polluting, polluting, polluting), { plainUs: false })
  assert.strictEqual(KeyCombo.classify([polluting], polluting, "__proto__", polluting), "unknown")
  assert.strictEqual(KeyCombo.classify([record(76, "code:54", "x")], polluting, "video", combo), "unknown")
  assert.strictEqual({}.plainUs, undefined)
  assert.strictEqual({}.str, undefined)
  assert.strictEqual({}.modmask, undefined)
})

test("takenBy: half a character from a damaged reply is never shown", function() {
  var half = "\ud83c"
  var result = KeyCombo.parseBinds(lines(76, "V", "Place" + half + "holder " + half))
  assert.strictEqual(result.ok, true)
  var shown = KeyCombo.takenBy(result.records, US, "video", KeyCombo.parse("SUPER + CTRL + ALT + V"))
  assert.strictEqual(shown, "Placeholder")
})

// ---- Limits ----

test("a listing may hold 2000 records and fill the read limit, and not one more", function() {
  var one = lines(64, "W", "Placeholder 1")
  var full = KeyCombo.parseBinds(one.repeat(2000))
  assert.strictEqual(full.ok, true)
  assert.strictEqual(full.records.length, 2000)
  assert.strictEqual(verdict(full.records, US, "video", "SUPER + CTRL + ALT + V"), "free")
  assert.strictEqual(verdict(full.records, US, "video", "SUPER + W"), "foreign")
  assert.deepStrictEqual(KeyCombo.parseBinds(one.repeat(2001)), BAD)

  var limit = Const.LIMITS.hyprBytes
  var head = one.slice(0, one.length - 1)
  var padded = head + "\tnote: " + "n".repeat(limit - head.length - 9) + "\n\n"
  assert.strictEqual(padded.length, limit)
  assert.strictEqual(KeyCombo.parseBinds(padded).ok, true)
  assert.deepStrictEqual(KeyCombo.parseBinds(padded + "\n"), BAD)
})

test("no input makes the reader or the verdict slow", function() {
  var limit = Const.LIMITS.hyprBytes
  var one = lines(64, "W", "Placeholder 1")
  function fill(unit) {
    return unit.repeat(Math.floor(limit / unit.length))
  }
  function capped(text) {
    return text.slice(0, limit)
  }
  var hostile = [
    fill("\n"), fill("\t"), fill("a"), fill("bind\n"), fill("bind"), fill("\tkey: V\n"), fill("\t: "),
    fill(": "),
    fill("\tmodmask"), "bind" + fill("d"), "bindd\n\tkey: " + fill("+"), "bindd\n\tflags: " + fill(","),
    "bindd\n\tdescription: " + fill("\r"), fill("\r\n"), fill("\tx: y\n"), "bindd\n" + fill("\targ: 5\n"),
    one.repeat(2000), one.repeat(4000), fill(one.slice(0, one.length - 1)), fill("bindd\n\n"),
    one + fill("\u0000"), fill("\ud83c")
  ]
  hostile.map(capped).forEach(function(text, i) {
    var ms = elapsedMs(function() { KeyCombo.parseBinds(text) })
    assert.ok(ms < 2000, "input " + i + " took " + Math.round(ms) + " ms")
  })

  // A list of the largest size, with the longest keys a record may have,
  // on the modifiers of every proposal.
  var wide = []
  for (var n = 0; n < 2000; n++) wide.push(record(n % 2 ? 76 : 72, "+".repeat(256), "Placeholder 1"))
  var plusMs = elapsedMs(function() {
    KeyCombo.ACTIONS.forEach(function(name) {
      assert.strictEqual(KeyCombo.propose(wide, US, name), "")
    })
  })
  assert.ok(plusMs < 3000, "took " + Math.round(plusMs) + " ms")
  var all = KeyCombo.parseBinds(one.repeat(2000)).records
  var passMs = elapsedMs(function() {
    COMBOS.slice(0, 60).forEach(function(combo) { verdict(all, OTHER, "video", combo) })
  })
  assert.ok(passMs < 3000, "took " + Math.round(passMs) + " ms")
})

// ---- Binds left behind ----

test("fixture: the binds made at runtime are found, each for its own action", function() {
  assert.deepStrictEqual(KeyCombo.findRuntime(listing.records, "panel"), ["SUPER + CTRL + ALT + SHIFT + P"])
  assert.deepStrictEqual(KeyCombo.findRuntime(listing.records, "video"), ["SUPER + CTRL + ALT + V"])
  assert.deepStrictEqual(KeyCombo.findRuntime(listing.records, "output"),
    ["SUPER + CTRL + ALT + O", "SUPER + ALT + O"])
})

test("findRuntime: a place it names never classifies as free, and a place it leaves out never as ours",
  function() {
    var mine = KeyCombo.action("video").description
    var shapes = [
      record(76, "V", mine), record(72, "V", mine), record(78, "V", mine), record(76, "v", mine),
      record(76, "V", "Placeholder 1"), record(72, "code:55", mine), record(12, "F2", mine),
      Object.assign(record(76, "V", mine), { dispatcher: "exec" }),
      Object.assign(record(72, "V", mine), { submap: "resize" }),
      Object.assign(record(76, "", mine), { keycode: 55 })
    ]
    var combos = ["SUPER + CTRL + ALT + V", "SUPER + ALT + V", "CTRL + ALT + F2"]
    for (var bits = 1; bits < 1 << shapes.length; bits++) {
      var list = shapes.filter(function(shape, i) { return (bits >> i) % 2 === 1 })
      var found = KeyCombo.findRuntime(list, "video")
      found.forEach(function(combo) {
        assert.notStrictEqual(verdict(list, US, "video", combo), "free", bits + " " + combo)
        assert.ok(combos.indexOf(combo) !== -1, bits + " " + combo)
      })
      combos.forEach(function(combo) {
        var cls = verdict(list, US, "video", combo)
        if (cls === "ours" || cls === "duplicate") assert.ok(found.indexOf(combo) !== -1, bits + " " + combo)
      })
    }
  })

test("findRuntime: an argument that fails when it is read names nothing, and nothing handed over is changed",
  function() {
    var mine = record(76, "V", KeyCombo.action("video").description)
    var refuse = function() { throw new Error("not readable") }
    var closed = unreadable({})
    assert.deepStrictEqual(KeyCombo.findRuntime(closed, "video"), [])
    assert.deepStrictEqual(KeyCombo.findRuntime([mine, closed], "video"), [])
    assert.deepStrictEqual(KeyCombo.findRuntime([mine], closed), [])
    assert.deepStrictEqual(KeyCombo.findRuntime([mine], { toString: refuse }), [])
    var frozen = Object.freeze([Object.freeze(Object.assign({}, mine))])
    var first = KeyCombo.findRuntime(frozen, "video")
    assert.deepStrictEqual(first, ["SUPER + CTRL + ALT + V"])
    first.push("changed")
    assert.deepStrictEqual(KeyCombo.findRuntime(frozen, "video"), ["SUPER + CTRL + ALT + V"])
  })
