"use strict"
// Tests for ui/Ui.js: the vector table (also run inside Qt's engine), the
// keyboard tables of the panel cell by cell, and the properties a table
// cannot state, such as "no key does anything behind a confirmation" and
// "a shortcut of the text field never reaches the list".
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Ui = load.ui("Ui")
var Const = load.lib("Const")
var table = load.vectors("ui")

var K = Ui.KEY
var M = Ui.MOD

// Every answer keyAction may give.
var ACTIONS = [
  "", "none", "close", "back", "switchNext", "switchPrev", "down", "up", "pageDown", "pageUp",
  "activate", "enqueue", "submit", "submitEnqueue", "playPause", "focusField", "fieldBackspace", "fieldAppend"
]

// Qt's own numbers (qnamespace.h), written a second time on purpose: a
// typing mistake in ui/Ui.js must not be able to hide behind itself.
var QT_KEYS = {
  Escape: 16777216, Tab: 16777217, Backtab: 16777218, Backspace: 16777219, Return: 16777220,
  Enter: 16777221, Delete: 16777223, Up: 16777235, Down: 16777237, PageUp: 16777238, PageDown: 16777239,
  Space: 32, Slash: 47
}
var QT_MODS = { Shift: 33554432, Control: 67108864, Alt: 134217728, Meta: 268435456 }
var KEYPAD = 536870912
var KEY_A = 65

function ctx(overrides) {
  var base = {
    page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 0,
    rowKind: ""
  }
  Object.keys(overrides || {}).forEach(function(name) { base[name] = overrides[name] })
  return base
}

// Contexts that between them cover every combination keyAction looks at.
function everyContext() {
  var out = []
  var pages = ["main", "settings"]
  var bools = [false, true]
  pages.forEach(function(page) {
    bools.forEach(function(dialogOpen) {
      bools.forEach(function(hasText) {
        bools.forEach(function(matches) {
          bools.forEach(function(searching) {
            [0, 1, 7].forEach(function(rowCount) {
              var kinds = rowCount > 0 ? ["", "result"] : [""]
              kinds.forEach(function(rowKind) {
                out.push({
                  page: page, dialogOpen: dialogOpen, hasText: hasText, matches: matches,
                  searching: searching, rowCount: rowCount, rowKind: rowKind
                })
              })
            })
          })
        })
      })
    })
  })
  return out
}

// Named keys, a few characters, and a few keys that are neither.
var SOME_KEYS = Object.keys(QT_KEYS).map(function(name) { return QT_KEYS[name] })
  .concat([KEY_A, 48, 63, 126, 127, 201, 16777234, 16777236, 16777248, 16777264])
var SOME_MODS = [0, M.Shift, M.Control, M.Alt, M.Meta, KEYPAD, M.Control | M.Shift, KEYPAD | M.Shift]

function sweep(visit) {
  everyContext().forEach(function(context) {
    SOME_KEYS.forEach(function(key) {
      SOME_MODS.forEach(function(modifiers) {
        [true, false].forEach(function(typing) {
          // There is no text field to type into outside the main page.
          if (typing && context.page !== "main") return
          visit(Ui.keyAction(key, modifiers, typing, context), key, modifiers, typing, context)
        })
      })
    })
  })
}

function describe(key, modifiers, typing, context) {
  return JSON.stringify({ key: key, modifiers: modifiers, typing: typing, ctx: context })
}

test("exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(Ui).sort(), [
    "GLYPH", "KEY", "LIMITS", "MOD", "STEP", "TEXT", "VERSION", "barIcon", "clampIndex", "dropLast",
    "duration", "keyAction", "listArea", "printable", "rows", "thumbPath"
  ])
})

table.CASES.forEach(function(c, i) {
  test("vector " + i + ": " + c.fn, function() {
    var result = load.runCase(Ui, c)
    assert.strictEqual(result.got, result.want, JSON.stringify(c.args).slice(0, 200))
  })
})

test("the table names this module and exercises every exported function", function() {
  assert.strictEqual(table.MODULE, "Ui")
  assert.strictEqual(table.SIDE, "ui")
  Object.keys(Ui).forEach(function(name) {
    if (typeof Ui[name] !== "function") return
    assert.ok(table.CASES.some(function(c) { return c.fn === name }), name)
  })
})

test("the view's constants agree with the service side", function() {
  assert.strictEqual(Ui.VERSION, Const.VERSION)
  assert.strictEqual(Ui.LIMITS.fieldChars, Const.LIMITS.refChars)
  assert.strictEqual(Ui.TEXT.APP, Const.APP_NAME)
})

test("every glyph is the code point it is meant to be", function() {
  var expected = {
    music: 0xf075a, play: 0xf040a, pause: 0xf03e4, previous: 0xf04ae, next: 0xf04ad, cog: 0xf0493,
    chevronLeft: 0xf0141, closeCircle: 0xf0159, volumeHigh: 0xf057e, volumeMute: 0xf075f, spinner: 0xf0996
  }
  assert.deepStrictEqual(Object.keys(Ui.GLYPH).sort(), Object.keys(expected).sort())
  Object.keys(expected).forEach(function(name) {
    assert.strictEqual(Ui.GLYPH[name], String.fromCodePoint(expected[name]), name)
    assert.strictEqual(Ui.GLYPH[name].length, 2, name)
  })
})

test("KEY and MOD hold Qt's numbers", function() {
  assert.deepStrictEqual(Ui.KEY, QT_KEYS)
  assert.deepStrictEqual(Ui.MOD, QT_MODS)
})

test("the view's own sentences are worded exactly", function() {
  assert.strictEqual(Ui.TEXT.E_NO_SERVICE, "OmaJuke needs the built-in Omarchy bar")
  assert.strictEqual(Ui.TEXT.E_STALE, "OmaJuke was updated. Restart the shell to finish updating")
  assert.strictEqual(Ui.TEXT.SEARCHING, "Searching…")
  assert.strictEqual(Ui.TEXT.NOTHING_FOUND, "Nothing found")
  assert.strictEqual(Ui.TEXT.LOADING, "Loading…")
  assert.strictEqual(Ui.TEXT.HOME_EMPTY, "Nothing played yet. Search above, or paste a YouTube link")
  assert.strictEqual(Ui.TEXT.SEARCH_HINT, "Search YouTube or paste a link")
  assert.strictEqual(Ui.TEXT.RECENT, "RECENTLY PLAYED")
  assert.strictEqual(Ui.TEXT.PROXY_CONTINUE, "Continue without a proxy")
  assert.strictEqual(Ui.TEXT.CLEAR_HISTORY_ASK, "Clear recently played, the queue and search results?")
  assert.strictEqual(Ui.TEXT.NO_MPRIS, "Media keys are unavailable: mpv-mpris is not installed")
})

test("no text is empty, hides a control character or names a privileged command", function() {
  // Built by concatenation so that this file does not contain the words.
  var forbidden = [
    "su" + "do", "pk" + "exec", "system" + "ctl", "systemd" + "-run", "pac" + "man", "apt" + "-get"
  ]
  Object.keys(Ui.TEXT).forEach(function(name) {
    var text = Ui.TEXT[name]
    assert.strictEqual(typeof text, "string", name)
    assert.ok(text.length > 0, name)
    assert.ok(!/[\u0000-\u001f\u007f-\u009f<>]/.test(text), name)
    assert.strictEqual(text, text.trim(), name)
    forbidden.forEach(function(word) {
      assert.ok(text.toLowerCase().indexOf(word) === -1, name + ": " + word)
    })
  })
})

// ---- The keyboard tables, cell by cell ----

test("panel-wide keys: Esc closes the main page and leaves a sub-page, Tab switches panels", function() {
  [true, false].forEach(function(typing) {
    assert.strictEqual(Ui.keyAction(K.Escape, 0, typing, ctx({})), "close")
    assert.strictEqual(Ui.keyAction(K.Tab, 0, typing, ctx({})), "switchNext")
    assert.strictEqual(Ui.keyAction(K.Tab, M.Shift, typing, ctx({})), "switchPrev")
    assert.strictEqual(Ui.keyAction(K.Backtab, M.Shift, typing, ctx({})), "switchPrev")
  })
  assert.strictEqual(Ui.keyAction(K.Escape, 0, false, ctx({ page: "settings" })), "back")
  assert.strictEqual(Ui.keyAction(K.Tab, 0, false, ctx({ page: "settings" })), "switchNext")
  assert.strictEqual(Ui.keyAction(K.Backtab, M.Shift, false, ctx({ page: "settings" })), "switchPrev")
})

test("main page: Down, Up, PageDown and PageUp move the highlight in both modes", function() {
  var moves = [[K.Down, "down"], [K.Up, "up"], [K.PageDown, "pageDown"], [K.PageUp, "pageUp"]]
  moves.forEach(function(move) {
    [true, false].forEach(function(typing) {
      assert.strictEqual(Ui.keyAction(move[0], 0, typing, ctx({ rowCount: 4 })), move[1])
      assert.strictEqual(Ui.keyAction(move[0], 0, typing, ctx({ rowCount: 4, rowKind: "recent" })), move[1])
      assert.strictEqual(Ui.keyAction(move[0], 0, typing, ctx({ rowCount: 0 })), "none")
    })
  })
})

test("main page, typing: Enter decides between the list and a search", function() {
  var row = { rowCount: 4, rowKind: "result" }
  var cells = [
    // field empty: the highlighted row
    [ctx(row), "activate", "enqueue"],
    // text the list belongs to, results shown: the highlighted row
    [ctx({ hasText: true, matches: true, rowCount: 4, rowKind: "result" }), "activate", "enqueue"],
    // text the list belongs to, still searching: nothing, the query is not sent twice
    [ctx({ hasText: true, matches: true, searching: true, rowCount: 4, rowKind: "result" }), "none", "none"],
    [ctx({ hasText: true, matches: true, searching: true }), "none", "none"],
    // any other text: search for it
    [ctx({ hasText: true, rowCount: 4, rowKind: "result" }), "submit", "submitEnqueue"],
    [ctx({ hasText: true }), "submit", "submitEnqueue"],
    // another search is running, but for other text: this one is new
    [ctx({ hasText: true, searching: true }), "submit", "submitEnqueue"]
  ]
  cells.forEach(function(cell) {
    [K.Return, K.Enter].forEach(function(key) {
      assert.strictEqual(Ui.keyAction(key, 0, true, cell[0]), cell[1], JSON.stringify(cell[0]))
      assert.strictEqual(Ui.keyAction(key, M.Shift, true, cell[0]), cell[2], JSON.stringify(cell[0]))
    })
  })
})

test("main page, browsing: Enter plays, Shift+Enter queues, never a search", function() {
  var contexts = [
    ctx({ rowCount: 4, rowKind: "recent" }),
    ctx({ hasText: true, rowCount: 4, rowKind: "result" }),
    ctx({ hasText: true, matches: true, searching: true, rowCount: 4, rowKind: "result" })
  ]
  contexts.forEach(function(context) {
    assert.strictEqual(Ui.keyAction(K.Return, 0, false, context), "activate")
    assert.strictEqual(Ui.keyAction(K.Enter, 0, false, context), "activate")
    assert.strictEqual(Ui.keyAction(K.Return, M.Shift, false, context), "enqueue")
  })
})

test("Enter without a highlighted row shows the highlight first, and does nothing without rows", function() {
  [true, false].forEach(function(typing) {
    [0, M.Shift].forEach(function(modifiers) {
      assert.strictEqual(Ui.keyAction(K.Return, modifiers, typing, ctx({ rowCount: 3 })), "down")
      assert.strictEqual(Ui.keyAction(K.Return, modifiers, typing, ctx({ rowCount: 0 })), "none")
    })
  })
})

test("main page: Space, slash, Backspace and characters are text while typing, else commands", function() {
  var cells = [
    [K.Space, "", "playPause"],
    [K.Slash, "", "focusField"],
    [K.Backspace, "", "fieldBackspace"],
    [KEY_A, "", "fieldAppend"],
    [48, "", "fieldAppend"],
    [126, "", "fieldAppend"]
  ]
  var contexts = [ctx({}), ctx({ hasText: true, matches: true, rowCount: 4, rowKind: "result" })]
  cells.forEach(function(cell) {
    contexts.forEach(function(context) {
      assert.strictEqual(Ui.keyAction(cell[0], 0, true, context), cell[1])
      assert.strictEqual(Ui.keyAction(cell[0], 0, false, context), cell[2])
    })
  })
})

test("sub-pages: arrows move, Enter and Space activate, nothing is typed", function() {
  var row = ctx({ page: "settings", rowCount: 3, rowKind: "setting" })
  assert.strictEqual(Ui.keyAction(K.Down, 0, false, row), "down")
  assert.strictEqual(Ui.keyAction(K.Up, 0, false, row), "up")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, row), "activate")
  assert.strictEqual(Ui.keyAction(K.Enter, 0, false, row), "activate")
  assert.strictEqual(Ui.keyAction(K.Space, 0, false, row), "activate")
  assert.strictEqual(Ui.keyAction(KEY_A, 0, false, row), "")
  assert.strictEqual(Ui.keyAction(K.Slash, 0, false, row), "")
  assert.strictEqual(Ui.keyAction(K.Backspace, 0, false, row), "")
})

// ---- Properties over every combination ----

test("keyAction only ever answers with a documented action", function() {
  sweep(function(action, key, modifiers, typing, context) {
    assert.ok(ACTIONS.indexOf(action) !== -1, action + " " + describe(key, modifiers, typing, context))
  })
})

test("behind a confirmation every key is swallowed", function() {
  sweep(function(action, key, modifiers, typing, context) {
    if (context.dialogOpen) assert.strictEqual(action, "none", describe(key, modifiers, typing, context))
  })
})

test("a key held with Control, Alt or Meta is never ours, except Esc", function() {
  sweep(function(action, key, modifiers, typing, context) {
    if (context.dialogOpen || key === K.Escape) return
    if ((modifiers & (M.Control | M.Alt | M.Meta)) === 0) return
    assert.strictEqual(action, "", describe(key, modifiers, typing, context))
  })
})

test("Esc always leaves: back on a sub-page, close on the main page", function() {
  sweep(function(action, key, modifiers, typing, context) {
    if (context.dialogOpen || key !== K.Escape) return
    assert.strictEqual(action, context.page === "main" ? "close" : "back")
  })
})

test("while typing, no key turns into a browsing command", function() {
  var browsingOnly = ["playPause", "focusField", "fieldBackspace", "fieldAppend"]
  sweep(function(action, key, modifiers, typing, context) {
    if (typing) assert.ok(browsingOnly.indexOf(action) === -1, describe(key, modifiers, typing, context))
  })
})

test("a search is only ever started by Enter in the field, on new text", function() {
  sweep(function(action, key, modifiers, typing, context) {
    if (action !== "submit" && action !== "submitEnqueue") return
    var where = describe(key, modifiers, typing, context)
    assert.ok(key === K.Return || key === K.Enter, where)
    assert.ok(typing && context.page === "main" && context.hasText && !context.matches, where)
  })
})

test("a row is only activated when one is highlighted, and nothing moves without rows", function() {
  sweep(function(action, key, modifiers, typing, context) {
    var where = describe(key, modifiers, typing, context)
    if (action === "activate" || action === "enqueue") assert.ok(context.rowKind !== "", where)
    if (["down", "up", "pageDown", "pageUp"].indexOf(action) !== -1) assert.ok(context.rowCount > 0, where)
  })
})

test("sub-pages never search, type, queue or toggle playback", function() {
  var mainOnly = [
    "close", "enqueue", "submit", "submitEnqueue", "playPause", "focusField", "fieldBackspace", "fieldAppend"
  ]
  sweep(function(action, key, modifiers, typing, context) {
    if (context.page === "main") return
    assert.ok(mainOnly.indexOf(action) === -1, action + " " + describe(key, modifiers, typing, context))
  })
})

test("the keypad's Enter and arrows behave like the main ones", function() {
  everyContext().forEach(function(context) {
    [true, false].forEach(function(typing) {
      if (typing && context.page !== "main") return
      [[K.Enter, K.Return], [K.Down, K.Down], [K.Up, K.Up]].forEach(function(pair) {
        var plain = Ui.keyAction(pair[1], 0, typing, context)
        assert.strictEqual(Ui.keyAction(pair[0], KEYPAD, typing, context), plain)
      })
    })
  })
})

// ---- The other helpers ----

test("clampIndex always names a row, or 0 when there is none", function() {
  var indexes = [
    -1e9, -3, -1, -0.5, 0, 0.5, 1, 2, 6, 7, 8, 1e9, NaN, Infinity, -Infinity, null, undefined, "3"
  ]
  var counts = [-1, 0, 1, 2, 7, 7.9, NaN, Infinity, null, undefined, "7"]
  indexes.forEach(function(i) {
    counts.forEach(function(n) {
      var got = Ui.clampIndex(i, n)
      assert.ok(Number.isInteger(got) && got >= 0, i + "," + n)
      if (typeof n === "number" && n >= 1 && isFinite(n)) assert.ok(got <= Math.floor(n) - 1, i + "," + n)
      else if (n !== Infinity) assert.strictEqual(got, 0, i + "," + n)
    })
  })
})

test("duration reads as m:ss or h:mm:ss and never shows a fraction or a sign", function() {
  for (var seconds = 0; seconds <= 180000; seconds += 37) {
    var text = Ui.duration(seconds)
    assert.ok(/^(?:\d+:[0-5]\d|[1-9]\d*:[0-5]\d:[0-5]\d)$/.test(text), seconds + " -> " + text)
    var parts = text.split(":").map(Number)
    var back = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
    assert.strictEqual(back, seconds)
  }
  assert.strictEqual(Ui.duration(59.999), "0:59")
  var unknown = [null, undefined, NaN, Infinity, -Infinity, -0.001, "12", true, {}, []]
  unknown.forEach(function(value) {
    assert.strictEqual(Ui.duration(value), "")
  })
})

test("rows hands the service's own track objects on and leaves its lists alone", function() {
  var a = { id: "AAAAAAAAAAA", title: "a", channel: "", duration: 1, live: false }
  var b = { id: "BBBBBBBBBBB", title: "b", channel: "", duration: null, live: true }
  var results = Object.freeze([a, b])
  var recents = Object.freeze([b])
  var search = Ui.rows("search", results, [], -1, recents)
  assert.strictEqual(search.length, 2)
  assert.strictEqual(search[0].track, a)
  assert.strictEqual(search[1].track, b)
  var home = Ui.rows("home", results, [], -1, recents)
  assert.strictEqual(home.length, 1)
  assert.strictEqual(home[0].track, b)
  assert.strictEqual(home[0].group, Ui.TEXT.RECENT)
  // Each call builds a new list: a view may keep one without seeing the next.
  assert.notStrictEqual(Ui.rows("home", results, [], -1, recents), home)
})

test("rows accepts any list-like value and skips what is not a track", function() {
  var track = { id: "AAAAAAAAAAA", title: "a", channel: "", duration: 1, live: false }
  var listLike = { length: 3, 0: track, 1: null, 2: { id: 5 } }
  assert.strictEqual(Ui.rows("search", listLike, [], -1, []).length, 1)
  var odd = [undefined, null, 0, "", "AAAAAAAAAAA", 7, true, {}, [], function() {}]
  odd.forEach(function(value) {
    assert.deepStrictEqual(Ui.rows("search", value, value, value, value), [])
    assert.deepStrictEqual(Ui.rows("home", value, value, value, value), [])
    assert.deepStrictEqual(Ui.rows("search", [value], [], -1, []), [])
  })
})

test("every row has the four documented keys and a kind the page knows", function() {
  var track = { id: "AAAAAAAAAAA", title: "a", channel: "", duration: 1, live: false }
  Ui.rows("search", [track], [track], 0, [track]).concat(Ui.rows("home", [track], [track], 0, [track]))
    .forEach(function(row) {
      assert.deepStrictEqual(Object.keys(row), ["group", "kind", "key", "track"])
      assert.ok(row.kind === "result" || row.kind === "recent")
    })
})

test("listArea covers every search state, and the link message wins over all of them", function() {
  var states = ["idle", "searching", "results", "empty", "error"]
  states.forEach(function(state) {
    [0, 5].forEach(function(count) {
      assert.deepStrictEqual(Ui.listArea(true, state, count), { line: "link", list: false, dim: false })
      var area = Ui.listArea(false, state, count)
      assert.deepStrictEqual(Object.keys(area), ["line", "list", "dim"])
      // Only the rows of a running search are dimmed.
      assert.strictEqual(area.dim, state === "searching")
    })
  })
  assert.strictEqual(Ui.listArea(false, "idle", 0).line, "home")
  assert.strictEqual(Ui.listArea(false, "idle", 2).line, "")
  assert.strictEqual(Ui.listArea(false, "results", 2).line, "")
  // A state this version does not know shows the home list rather than nothing.
  assert.deepStrictEqual(Ui.listArea(false, "constructor", 2), { line: "", list: true, dim: false })
})

test("thumbPath reads the service's table without a prototype in the way", function() {
  var thumbs = Object.create(null)
  thumbs.AAAAAAAAAAA = "/run/omajuke/thumbs/1.jpg"
  thumbs.constructor = "/run/omajuke/thumbs/2.jpg"
  assert.strictEqual(Ui.thumbPath(thumbs, "AAAAAAAAAAA"), "/run/omajuke/thumbs/1.jpg")
  assert.strictEqual(Ui.thumbPath(thumbs, "constructor"), "/run/omajuke/thumbs/2.jpg")
  assert.strictEqual(Ui.thumbPath(thumbs, "toString"), "")
  assert.strictEqual(Ui.thumbPath(Object.create(null), "constructor"), "")
  assert.strictEqual(Ui.thumbPath(Object.create({ AAAAAAAAAAA: "/inherited.jpg" }), "AAAAAAAAAAA"), "")
})

test("thumbPath never returns anything but an absolute local path", function() {
  var values = [
    "http://127.0.0.1/x.jpg", "https://i.ytimg.com/vi/x/mqdefault.jpg", "file:///t/1.jpg", "//host/x.jpg",
    "qrc:/x.jpg", "image://provider/x", "data:image/png;base64,AAAA", "t/1.jpg", "./1.jpg", "~/1.jpg",
    " /t/1.jpg",
    "", null, undefined, 0, 1, true, {}, [], ["/t/1.jpg"]
  ]
  values.forEach(function(value) {
    assert.strictEqual(Ui.thumbPath({ AAAAAAAAAAA: value }, "AAAAAAAAAAA"), "", String(value))
  })
})

test("dropLast removes one whole character and printable refuses every control", function() {
  var note = String.fromCodePoint(0x1f3b5)
  assert.strictEqual(Ui.dropLast("a" + note), "a")
  assert.strictEqual(Ui.dropLast(note + note), note)
  // A stray half is removed alone: nothing in front of it is damaged.
  assert.strictEqual(Ui.dropLast("ab\udfb5"), "ab")
  assert.strictEqual(Ui.dropLast("ab\ud83c"), "ab")
  for (var code = 0; code < 0x100; code++) {
    var control = code < 0x20 || (code >= 0x7f && code <= 0x9f)
    assert.strictEqual(Ui.printable(String.fromCharCode(code)), !control, "U+" + code.toString(16))
    assert.strictEqual(Ui.printable("a" + String.fromCharCode(code)), !control, "U+" + code.toString(16))
  }
})

test("the bar icon follows the table of states", function() {
  var states = {
    idle: [false, false], resolving: [true, false], loading: [true, false], playing: [true, false],
    buffering: [true, false], paused: [false, true], error: [false, false]
  }
  Object.keys(states).forEach(function(state) {
    var expected = { active: states[state][0], dimmed: states[state][1] }
    assert.deepStrictEqual(Ui.barIcon(true, state), expected, state)
    // Without a usable service the icon is dimmed whatever the state says.
    assert.deepStrictEqual(Ui.barIcon(false, state), { active: false, dimmed: true }, state)
  })
})
