"use strict"
// Tests for ui/Ui.js: the vector table (also run inside Qt's engine), the
// keyboard tables of the panel cell by cell, and the properties a table
// cannot state, such as "no key does anything behind a confirmation", "a
// shortcut of the text field never reaches the list", "the highlight is
// never in two places", "no key is recorded before the compositor holds its
// shortcuts back" and "a button that needs the compositor is never offered
// without it".
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Ui = load.ui("Ui")
var Const = load.lib("Const")
var Settings = load.lib("Settings")
var table = load.vectors("ui")

var K = Ui.KEY
var M = Ui.MOD

// Every answer keyAction may give.
var ACTIONS = [
  "", "none", "close", "back", "switchNext", "switchPrev", "down", "up", "pageDown", "pageUp",
  "activate", "enqueue", "submit", "submitEnqueue", "playPause", "focusField", "fieldBackspace",
  "fieldAppend", "left", "right", "remove", "moveUp", "moveDown"
]

// Qt's own numbers (qnamespace.h), written a second time on purpose: a
// typing mistake in ui/Ui.js must not be able to hide behind itself.
var QT_KEYS = {
  Escape: 16777216, Tab: 16777217, Backtab: 16777218, Backspace: 16777219, Return: 16777220,
  Enter: 16777221, Delete: 16777223, Left: 16777234, Up: 16777235, Right: 16777236, Down: 16777237,
  PageUp: 16777238, PageDown: 16777239, Space: 32, Slash: 47, X: 88
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
  var pages = ["main", "settings", "queue", "shortcuts"]
  var bools = [false, true]
  pages.forEach(function(page) {
    bools.forEach(function(dialogOpen) {
      bools.forEach(function(hasText) {
        bools.forEach(function(matches) {
          bools.forEach(function(searching) {
            [0, 1, 7].forEach(function(rowCount) {
              var kinds = rowCount > 0
                ? ["", "result", "queue", "choice", "action", "chips", "controls", "shortcut", "feed", "list"]
                : [""]
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
  .concat([KEY_A, 48, 63, 120, 126, 127, 201, 16777248, 16777264])
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
    "CHOICES", "CONTROLS", "CONTROL_HOME", "FEEDS", "GLYPH", "KEY", "LIMITS", "MOD", "PAGES", "STEP", "TEXT",
    "VERSION", "accountOffer",
    "barIcon", "captureStep", "clampIndex", "dropLast", "duration", "feedRows", "gateCode", "indexOfKey",
    "keyAction",
    "listArea", "moveCursor", "outputChoice", "outputRows", "pageTitle", "parentPage", "placeKind",
    "printable",
    "recentSkip", "rows", "shortcutRows", "signInButtons", "signInScreen", "stepChoice", "stepControl",
    "stripLine", "thumbPath", "videoButton"
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
    chevronLeft: 0xf0141, closeCircle: 0xf0159, volumeHigh: 0xf057e, volumeMute: 0xf075f, spinner: 0xf0996,
    queue: 0xf0411, queueAdd: 0xf0412, close: 0xf0156, check: 0xf012c, video: 0xf0567, videoOff: 0xf0568,
    speaker: 0xf04c3, topLeft: 0xf005b, topRight: 0xf005c, bottomLeft: 0xf0042, bottomRight: 0xf0043
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
  assert.strictEqual(Ui.TEXT.QUEUE, "QUEUE")
  assert.strictEqual(Ui.TEXT.QUEUE_EMPTY, "Queue is empty")
  assert.strictEqual(Ui.TEXT.VIDEO_LOADING, "Loading video…")
  assert.strictEqual(Ui.TEXT.OUTPUTS_IDLE, "Outputs are available while something is playing")
  assert.strictEqual(Ui.TEXT.OUTPUT_DEFAULT, "System default")
  assert.strictEqual(Ui.TEXT.PRELOAD, "Start faster")
  assert.strictEqual(Ui.TEXT.PRELOAD_HINT, "Prepare the highlighted result before you press Enter. YouTube"
    + " sees a lookup for the top result of each search and for any result you rest on.")
  assert.strictEqual(Ui.TEXT.SPONSOR_ASK,
    "Skip sponsor segments? Looks up a hash prefix of the video id at sponsor.ajay.app.")
  assert.strictEqual(Ui.TEXT.SPONSOR_ENABLE, "Enable")
  assert.strictEqual(Ui.TEXT.SPONSOR_DECLINE, "No thanks")
  assert.strictEqual(Ui.TEXT.SKIPPED, "Skipped sponsor segment")
  assert.strictEqual(Ui.TEXT.FEED_EMPTY, "Nothing here yet")
  assert.strictEqual(Ui.TEXT.SHORTCUT_ASSIGN, "Assign")
  assert.strictEqual(Ui.TEXT.SHORTCUT_UNASSIGN, "Unassign")
  assert.strictEqual(Ui.TEXT.SHORTCUT_CHANGE, "Change…")
  assert.strictEqual(Ui.TEXT.SHORTCUT_COPY, "Copy line")
  assert.strictEqual(Ui.TEXT.SHORTCUT_CONFIG, "Set in your bindings.lua")
  assert.strictEqual(Ui.TEXT.SHORTCUT_BLOCKED, "Cannot confirm that this key is free")
  assert.strictEqual(Ui.TEXT.USE_COPY_LINE, "Use Copy line")
  assert.strictEqual(Ui.TEXT.SHORTCUTS_OPEN, "Shortcuts…")
  assert.strictEqual(Ui.TEXT.SIGNIN_OPEN, "Sign in to YouTube…")
  assert.strictEqual(Ui.TEXT.SIGNOUT, "Sign out")
})

test("the account page says what a sign-in keeps, where, at what risk, and what stays", function() {
  // The sentences a user decides on. Their wording may change; what they
  // admit to may not.
  assert.match(Ui.TEXT.SIGNIN_WHAT, /new, empty profile/)
  assert.match(Ui.TEXT.SIGNIN_WHAT, /never sees your password/)
  assert.match(Ui.TEXT.SIGNIN_WHERE, /cookies\.txt/)
  assert.match(Ui.TEXT.SIGNIN_WHERE, /can use your YouTube account/)
  assert.match(Ui.TEXT.SIGNIN_USE, /Searching and playing stay signed out/)
  // The one exception is named where the rule is.
  assert.match(Ui.TEXT.SIGNIN_USE, /asks before it plays that one video with your login/)
  assert.match(Ui.TEXT.SIGNIN_RISK, /restricted or blocked/)
  assert.match(Ui.TEXT.SIGNIN_IN_BROWSER, /15 minutes/)
  var leaving = [Ui.TEXT.SIGNOUT_NOTE, Ui.TEXT.SIGNED_OUT]
  leaving.forEach(function(text) {
    assert.match(text, /still exists at Google/)
    assert.match(text, /Your devices/)
  })
  assert.match(Ui.TEXT.SIGNOUT_NOTE, /not securely erased/)
  // Nothing here promises more than is done.
  Object.keys(Ui.TEXT).forEach(function(name) {
    assert.ok(!/\b(?:safe|secure|securely|anonymous|private)\b/i.test(Ui.TEXT[name])
      || name === "SIGNOUT_NOTE", name)
  })
})

test("the feed chips are the home list and the five lists the service knows", function() {
  var FeedUrls = load.lib("FeedUrls")
  assert.strictEqual(Ui.FEEDS[0].value, "")
  assert.deepStrictEqual(Ui.FEEDS.slice(1).map(function(chip) { return chip.value }), FeedUrls.KINDS.slice())
  Ui.FEEDS.forEach(function(chip) {
    assert.deepStrictEqual(Object.keys(chip), ["value", "label"])
    assert.ok(chip.label.length > 0 && chip.label.length <= 13, chip.label)
    assert.ok(chip.value === "" || FeedUrls.isKind(chip.value), chip.value)
  })
  assert.strictEqual(new Set(Ui.FEEDS.map(function(chip) { return chip.label })).size, Ui.FEEDS.length)
  // Left and Right walk the chips and stop at the ends.
  assert.strictEqual(Ui.stepChoice(Ui.FEEDS, "", 1, false), "foryou")
  assert.strictEqual(Ui.stepChoice(Ui.FEEDS, "history", 1, false), "history")
  assert.strictEqual(Ui.stepChoice(Ui.FEEDS, "foryou", -1, false), "")
})

test("every page has a title except the main one, and only pages have one", function() {
  assert.strictEqual(Ui.PAGES[0], "main")
  assert.strictEqual(new Set(Ui.PAGES).size, Ui.PAGES.length)
  Ui.PAGES.forEach(function(page) {
    assert.strictEqual(Ui.pageTitle(page) === "", page === "main", page)
    // Going back always ends on the main page, and never loops.
    var seen = [page]
    var at = page
    while (at !== "main") {
      at = Ui.parentPage(at)
      assert.ok(Ui.PAGES.indexOf(at) !== -1 && seen.indexOf(at) === -1, page)
      seen.push(at)
    }
  })
  assert.strictEqual(Ui.parentPage("shortcuts"), "settings")
  assert.strictEqual(Ui.parentPage("signin"), "settings")
  var others = ["", "Main", "queue ", "toString", "__proto__", "length", "0", null, undefined, 0, {}, []]
  others.forEach(function(name) {
    assert.strictEqual(Ui.pageTitle(name), "", String(name))
  })
})

test("every chip of a choice is a value the settings accept, and every such value has a chip", function() {
  assert.deepStrictEqual(Object.keys(Ui.CHOICES).sort(), ["maxHeight", "videoCorner", "videoSize"])
  Object.keys(Ui.CHOICES).forEach(function(key) {
    var values = Ui.CHOICES[key].map(function(option) { return option.value })
    assert.strictEqual(new Set(values).size, values.length, key)
    assert.ok(values.indexOf(String(Settings.DEFAULTS[key])) !== -1, key + ": the default has a chip")
    Ui.CHOICES[key].forEach(function(option) {
      assert.strictEqual(typeof option.value, "string", key)
      assert.strictEqual(typeof option.label, "string", key)
      // A chip shows a word or an icon that is explained by its tooltip.
      assert.ok(option.label !== "" || (option.icon && option.tooltip), key + " " + option.value)
      // The page sends maxHeight as a number and the others as they are.
      var sent = key === "maxHeight" ? Number(option.value) : option.value
      assert.notStrictEqual(Settings.withChange({}, key, sent), null, key + " " + option.value)
    })
  })
  assert.deepStrictEqual(Ui.CHOICES.videoCorner.map(function(option) { return option.value }).sort(),
    Settings.CORNERS.slice().sort())
  // Values just outside each list are refused, so the lists are complete.
  var outside = [["maxHeight", 360], ["maxHeight", 1440], ["videoSize", "full"], ["videoSize", "fifth"]]
  outside.forEach(function(pair) {
    assert.strictEqual(Settings.withChange({}, pair[0], pair[1]), null, pair.join(" "))
  })
})

test("stepChoice always answers with one of the options and only wraps when asked", function() {
  Object.keys(Ui.CHOICES).forEach(function(key) {
    var options = Ui.CHOICES[key]
    var values = options.map(function(option) { return option.value })
    values.concat(["", "other", null, 7]).forEach(function(value) {
      [-9, -1, 0, 1, 9].forEach(function(delta) {
        [true, false].forEach(function(wrap) {
          assert.ok(values.indexOf(Ui.stepChoice(options, value, delta, wrap)) !== -1, key)
        })
      })
    })
    assert.strictEqual(Ui.stepChoice(options, values[0], -1, false), values[0])
    assert.strictEqual(Ui.stepChoice(options, values[values.length - 1], 1, false), values[values.length - 1])
    assert.strictEqual(Ui.stepChoice(options, values[values.length - 1], 1, true), values[0])
    // Enter on a row goes through every value and returns to the first.
    var seen = []
    var value = values[0]
    for (var i = 0; i < values.length; i++) {
      seen.push(value)
      value = Ui.stepChoice(options, value, 1, true)
    }
    assert.deepStrictEqual(seen, values, key)
    assert.strictEqual(value, values[0], key)
  })
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
      // Buttons that are always on the page (the settings button, the
      // strip) do not count: Enter never puts the highlight on one. The
      // arrows do.
      assert.strictEqual(Ui.keyAction(K.Return, modifiers, typing, ctx({ rowCount: 2, fixed: 2 })), "none")
      assert.strictEqual(Ui.keyAction(K.Return, modifiers, typing, ctx({ rowCount: 1, fixed: 2 })), "none")
      assert.strictEqual(Ui.keyAction(K.Return, modifiers, typing, ctx({ rowCount: 3, fixed: 2 })), "down")
      assert.strictEqual(Ui.keyAction(K.Return, modifiers, typing, ctx({ rowCount: 3, fixed: "2" })), "down")
      assert.strictEqual(Ui.keyAction(K.Down, modifiers, typing, ctx({ rowCount: 2, fixed: 2 })), "down")
      assert.strictEqual(Ui.keyAction(K.Up, modifiers, typing, ctx({ rowCount: 1, fixed: 1 })), "up")
    })
  })
})

test("moveCursor: without rows the first Down shows a notice's button before one that is always there",
  function() {
    var nowhere = { active: false, index: 0, action: -1 }
    // Two buttons that are always there, then two of notices.
    assert.deepStrictEqual(Ui.moveCursor(nowhere, 1, 0, 4, 2), { active: false, index: 0, action: 2 })
    assert.deepStrictEqual(Ui.moveCursor(nowhere, -1, 0, 4, 2), { active: false, index: 0, action: 3 })
    // Only the ones that are always there: the first of them.
    assert.deepStrictEqual(Ui.moveCursor(nowhere, 1, 0, 2, 2), { active: false, index: 0, action: 0 })
    assert.deepStrictEqual(Ui.moveCursor(nowhere, 1, 0, 2, 5), { active: false, index: 0, action: 0 })
    assert.deepStrictEqual(Ui.moveCursor(nowhere, 1, 0, 2), { active: false, index: 0, action: 0 })
    assert.deepStrictEqual(Ui.moveCursor(nowhere, 1, 0, 3, "1"), { active: false, index: 0, action: 0 })
    // With rows nothing changes: the first press shows a row, Up from the
    // first row reaches the nearest button, and on from there to the top.
    assert.deepStrictEqual(Ui.moveCursor(nowhere, 1, 3, 4, 2), { active: true, index: 0, action: -1 })
    var top = { active: true, index: 0, action: -1 }
    assert.deepStrictEqual(Ui.moveCursor(top, -1, 3, 4, 2), { active: false, index: 0, action: 3 })
    var onButton = { active: false, index: 0, action: 2 }
    assert.deepStrictEqual(Ui.moveCursor(onButton, -1, 3, 4, 2), { active: false, index: 0, action: 1 })
    assert.deepStrictEqual(Ui.moveCursor({ active: false, index: 0, action: 0 }, -1, 3, 4, 2),
      { active: false, index: 0, action: 0 })
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

test("queue page: x and Delete remove the highlighted row, Shift and an arrow carry it", function() {
  var row = ctx({ page: "queue", rowCount: 3, rowKind: "queue" })
  assert.strictEqual(Ui.keyAction(K.X, 0, false, row), "remove")
  assert.strictEqual(Ui.keyAction(K.Delete, 0, false, row), "remove")
  assert.strictEqual(Ui.keyAction(K.Up, M.Shift, false, row), "moveUp")
  assert.strictEqual(Ui.keyAction(K.Down, M.Shift, false, row), "moveDown")
  assert.strictEqual(Ui.keyAction(K.Up, 0, false, row), "up")
  assert.strictEqual(Ui.keyAction(K.Down, 0, false, row), "down")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, row), "activate")
  assert.strictEqual(Ui.keyAction(K.Space, 0, false, row), "activate")
  var button = ctx({ page: "queue", rowCount: 3, rowKind: "clear" })
  assert.strictEqual(Ui.keyAction(K.X, 0, false, button), "")
  assert.strictEqual(Ui.keyAction(K.Up, M.Shift, false, button), "up")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, button), "activate")
})

test("a row that is a choice: Left and Right pick the neighbour, Enter and Space the next", function() {
  var row = ctx({ page: "settings", rowCount: 9, rowKind: "choice" })
  assert.strictEqual(Ui.keyAction(K.Left, 0, false, row), "left")
  assert.strictEqual(Ui.keyAction(K.Right, 0, false, row), "right")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, row), "activate")
  assert.strictEqual(Ui.keyAction(K.Space, 0, false, row), "activate")
  var other = ctx({ page: "settings", rowCount: 9, rowKind: "setting" })
  assert.strictEqual(Ui.keyAction(K.Left, 0, false, other), "")
  assert.strictEqual(Ui.keyAction(K.Right, 0, false, other), "")
})

test("a shortcut row: Left and Right pick the neighbouring button, Enter and Space press it", function() {
  var row = ctx({ page: "shortcuts", rowCount: 3, rowKind: "shortcut" })
  assert.strictEqual(Ui.keyAction(K.Left, 0, false, row), "left")
  assert.strictEqual(Ui.keyAction(K.Right, 0, false, row), "right")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, row), "activate")
  assert.strictEqual(Ui.keyAction(K.Space, 0, false, row), "activate")
  assert.strictEqual(Ui.keyAction(K.Up, 0, false, row), "up")
  assert.strictEqual(Ui.keyAction(K.Escape, 0, false, row), "back")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, ctx({ page: "shortcuts", rowCount: 3 })), "down")
})

test("the row of feed chips: Left and Right pick the chip, Enter shows its list", function() {
  var chips = ctx({ rowCount: 5, rowKind: "chips" })
  assert.strictEqual(Ui.keyAction(K.Left, 0, false, chips), "left")
  assert.strictEqual(Ui.keyAction(K.Right, 0, false, chips), "right")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, chips), "activate")
  assert.strictEqual(Ui.keyAction(K.Return, M.Shift, false, chips), "none")
  assert.strictEqual(Ui.keyAction(K.Down, 0, false, chips), "down")
  assert.strictEqual(Ui.keyAction(K.Space, 0, false, chips), "playPause")
  // In the field the arrows move the text cursor.
  assert.strictEqual(Ui.keyAction(K.Left, 0, true, chips), "")
  assert.strictEqual(Ui.keyAction(K.Right, 0, true, chips), "")
})

// The now-playing strip is one place for the cursor, like the chips: its
// buttons are picked sideways and pressed with Enter. Every key that meant
// something before still means the same there.
test("the buttons of the strip: Left and Right pick one, Enter presses it", function() {
  var strip = ctx({ rowCount: 5, rowKind: "controls" })
  assert.strictEqual(Ui.keyAction(K.Left, 0, false, strip), "left")
  assert.strictEqual(Ui.keyAction(K.Right, 0, false, strip), "right")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, strip), "activate")
  assert.strictEqual(Ui.keyAction(K.Enter, 0, false, strip), "activate")
  assert.strictEqual(Ui.keyAction(K.Return, M.Shift, false, strip), "none")
  assert.strictEqual(Ui.keyAction(K.Down, 0, false, strip), "down")
  assert.strictEqual(Ui.keyAction(K.Up, 0, false, strip), "up")
  assert.strictEqual(Ui.keyAction(K.Space, 0, false, strip), "playPause")
  assert.strictEqual(Ui.keyAction(K.Slash, 0, false, strip), "focusField")
  assert.strictEqual(Ui.keyAction(K.Escape, 0, false, strip), "close")
  assert.strictEqual(Ui.keyAction(K.Tab, 0, false, strip), "switchNext")
  assert.strictEqual(Ui.keyAction(K.Left, 0, true, strip), "")
  assert.deepStrictEqual(["feeds", "controls", "settings", "dismiss", "", null].map(Ui.placeKind),
    ["chips", "controls", "action", "action", "action", "action"])
})

test("the highlight on the strip steps over a button that cannot be pressed", function() {
  var all = Ui.CONTROLS.map(function() { return true })
  assert.deepStrictEqual(Ui.CONTROLS, ["previous", "playPause", "next", "mute", "video", "outputs", "queue"])
  assert.strictEqual(Ui.CONTROLS[Ui.CONTROL_HOME], "playPause")
  // Left and Right walk the buttons and stop at the ends.
  var at = Ui.CONTROL_HOME
  var seen = [at]
  for (var i = 0; i < Ui.CONTROLS.length + 2; i++) {
    at = Ui.stepControl(at, 1, all)
    seen.push(at)
  }
  assert.deepStrictEqual(seen, [1, 2, 3, 4, 5, 6, 6, 6, 6, 6])
  assert.strictEqual(Ui.stepControl(1, -1, all), 0)
  assert.strictEqual(Ui.stepControl(0, -1, all), 0)
  // Nothing before or after this track: previous and next cannot be
  // pressed, and are never where the highlight stops.
  var alone = [false, true, false, true, true, true, true]
  assert.strictEqual(Ui.stepControl(1, 1, alone), 3)
  assert.strictEqual(Ui.stepControl(3, -1, alone), 1)
  assert.strictEqual(Ui.stepControl(1, -1, alone), 1)
  // The button under the highlight stopped being one: play or pause has it.
  assert.strictEqual(Ui.stepControl(2, 0, alone), Ui.CONTROL_HOME)
  assert.strictEqual(Ui.stepControl(2, 1, alone), Ui.CONTROL_HOME)
  assert.strictEqual(Ui.stepControl(4, 0, alone), 4)
  var odd = [-1, 7, 1.5, NaN, "1", null, undefined]
  odd.forEach(function(index) {
    assert.strictEqual(Ui.stepControl(index, 1, all), Ui.CONTROL_HOME, String(index))
  })
  var none = [null, undefined, "yes", {}, []]
  none.forEach(function(usable) {
    assert.strictEqual(Ui.stepControl(3, 1, usable), Ui.CONTROL_HOME)
  })
})

test("a signed-in list: a video is played or queued, a playlist only opened", function() {
  var video = ctx({ rowCount: 5, rowKind: "feed" })
  var playlist = ctx({ rowCount: 5, rowKind: "list" })
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, video), "activate")
  assert.strictEqual(Ui.keyAction(K.Return, M.Shift, false, video), "enqueue")
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, playlist), "activate")
  assert.strictEqual(Ui.keyAction(K.Return, M.Shift, false, playlist), "none")
  assert.strictEqual(Ui.keyAction(K.Return, M.Shift, true, playlist), "none")
})

test("the button of a notice is pressed by Enter alone", function() {
  var button = ctx({ rowCount: 2, rowKind: "action" })
  var keys = [K.Return, K.Enter]
  keys.forEach(function(key) {
    [true, false].forEach(function(typing) {
      assert.strictEqual(Ui.keyAction(key, 0, typing, button), "activate")
      assert.strictEqual(Ui.keyAction(key, M.Shift, typing, button), "none")
    })
  })
  assert.strictEqual(Ui.keyAction(K.Space, 0, false, button), "playPause")
  // The first Enter on a notice that stands alone only shows the highlight.
  assert.strictEqual(Ui.keyAction(K.Return, 0, false, ctx({ rowCount: 1 })), "down")
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

test("only a highlighted queue row of a sub-page is removed or carried, only a choice stepped", function() {
  sweep(function(action, key, modifiers, typing, context) {
    var where = describe(key, modifiers, typing, context)
    if (["remove", "moveUp", "moveDown"].indexOf(action) !== -1) {
      assert.ok(context.page !== "main" && context.rowKind === "queue" && !typing, where)
    }
    if (action === "left" || action === "right") {
      var sideways = context.page === "main" ? ["chips", "controls"] : ["choice", "shortcut"]
      assert.ok(sideways.indexOf(context.rowKind) !== -1 && !typing, where)
      assert.ok(key === K.Left || key === K.Right, where)
    }
    if (action === "moveUp" || action === "moveDown") assert.ok((modifiers & M.Shift) !== 0, where)
  })
})

test("nothing is ever queued from a button, the feed chips, the strip or a playlist", function() {
  sweep(function(action, key, modifiers, typing, context) {
    if (["action", "chips", "controls", "list"].indexOf(context.rowKind) === -1) return
    assert.notStrictEqual(action, "enqueue", describe(key, modifiers, typing, context))
    // On the main page Space is play or pause, so only Enter presses it.
    if (action === "activate" && context.page === "main") assert.ok(key === K.Return || key === K.Enter)
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

// ---- The highlight ----

function everyPosition(rows, actions) {
  var out = [{ active: false, index: 0, action: -1 }]
  for (var i = 0; i < rows; i++) {
    out.push({ active: true, index: i, action: -1 })
    out.push({ active: false, index: i, action: -1 })
  }
  for (var j = 0; j < actions; j++) out.push({ active: false, index: 0, action: j })
  return out
}

function eachMove(visit) {
  var counts = [0, 1, 3, 8]
  var buttons = [0, 1, 2]
  var deltas = [-6, -1, 1, 6]
  counts.forEach(function(rows) {
    buttons.forEach(function(actions) {
      everyPosition(rows, actions).forEach(function(at) {
        deltas.forEach(function(delta) {
          visit(Ui.moveCursor(at, delta, rows, actions), at, delta, rows, actions)
        })
      })
    })
  })
}

test("moveCursor: the highlight is in one place at most, and that place exists", function() {
  eachMove(function(to, at, delta, rows, actions) {
    var where = JSON.stringify([at, delta, rows, actions])
    assert.deepStrictEqual(Object.keys(to), ["active", "index", "action"], where)
    assert.ok(!(to.active && to.action !== -1), where)
    assert.ok(Number.isInteger(to.index) && to.index >= 0 && to.index < Math.max(1, rows), where)
    assert.ok(Number.isInteger(to.action) && to.action >= -1 && to.action < Math.max(0, actions), where)
    if (to.active) assert.ok(rows > 0, where)
    // With anything to highlight, an arrow key always leaves a highlight.
    if (rows + actions > 0) assert.ok(to.active || to.action !== -1, where)
  })
})

test("moveCursor: the first press shows the highlight on a row, never on a button beside rows", function() {
  eachMove(function(to, at, delta, rows, actions) {
    if (at.active || at.action !== -1 || rows === 0) return
    assert.deepStrictEqual(to, { active: true, index: at.index, action: -1 })
  })
})

test("moveCursor: a button is only reached upwards from the first row, and left downwards", function() {
  eachMove(function(to, at, delta, rows, actions) {
    var where = JSON.stringify([at, delta, rows, actions])
    if (at.active && to.action !== -1) {
      assert.ok(delta < 0 && at.index === 0, where)
      assert.strictEqual(to.action, actions - 1, where)
    }
    if (at.action !== -1 && to.active) {
      assert.ok(delta > 0, where)
      assert.strictEqual(to.index, at.index, where)
    }
    if (at.active && delta > 0) assert.ok(to.active, where)
  })
})

test("moveCursor: every row and every button can be reached with Up and Down alone", function() {
  var rows = 3
  var actions = 2
  var at = { active: false, index: 0, action: -1 }
  var seen = []
  var note = function() { seen.push(at.active ? "row " + at.index : "button " + at.action) }
  at = Ui.moveCursor(at, 1, rows, actions)
  note()
  for (var up = 0; up < 3; up++) {
    at = Ui.moveCursor(at, -1, rows, actions)
    note()
  }
  for (var down = 0; down < 5; down++) {
    at = Ui.moveCursor(at, 1, rows, actions)
    note()
  }
  assert.deepStrictEqual(seen, [
    "row 0", "button 1", "button 0", "button 0", "button 1", "row 0", "row 1", "row 2", "row 2"
  ])
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
  var queue = Object.freeze([Object.freeze({ id: "AAAAAAAAAAA", title: "a", key: 4, auto: false })])
  assert.strictEqual(Ui.rows("home", results, queue, -1, recents)[0].track, queue[0])
  assert.strictEqual(Ui.rows("queue", results, queue, -1, recents)[0].track, queue[0])
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
  var item = { id: "AAAAAAAAAAA", title: "a", channel: "", duration: 1, live: false, key: 3, auto: false }
  var all = Ui.rows("search", [track], [item, item], 0, [track])
    .concat(Ui.rows("home", [track], [item, item], 0, [track]))
    .concat(Ui.rows("queue", [track], [item, item], 0, [track]))
  assert.strictEqual(all.length, 5)
  all.forEach(function(row) {
    assert.deepStrictEqual(Object.keys(row), ["group", "kind", "key", "track"])
    assert.ok(row.kind === "result" || row.kind === "recent" || row.kind === "queue")
    // Exactly the queue rows carry a key: they are the ones addressed by it.
    assert.strictEqual(row.key > 0, row.kind === "queue")
  })
})

test("the home list shows what comes after the current track, the queue page all of it", function() {
  var queue = []
  for (var key = 1; key <= 5; key++) {
    queue.push({ id: "AAAAAAAAAAA", title: "t" + key, key: key, auto: false })
  }
  for (var index = -1; index <= 5; index++) {
    var upcoming = Ui.rows("home", [], queue, index, []).map(function(row) { return row.key })
    assert.deepStrictEqual(upcoming, [1, 2, 3, 4, 5].slice(index + 1), "index " + index)
    assert.strictEqual(Ui.rows("queue", [], queue, index, []).length, 5)
  }
  var page = Ui.rows("queue", [], queue, 2, [])
  queue.forEach(function(entry, at) {
    assert.strictEqual(Ui.indexOfKey(page, entry.key), at)
  })
  assert.strictEqual(Ui.indexOfKey(page, 6), -1)
})

test("the strip's second line and the video button cover every state", function() {
  var playback = ["idle", "resolving", "loading", "playing", "paused", "buffering", "error"]
  var video = ["hidden", "loading", "shown", "unavailable"]
  var lines = ["error", "loading", "video", "novideo", "channel"]
  playback.forEach(function(state) {
    video.forEach(function(shown) {
      var line = Ui.stripLine(state, shown)
      assert.ok(lines.indexOf(line) !== -1, state + " " + shown)
      // A failed track says why, whatever its picture does.
      assert.strictEqual(line === "error", state === "error", state + " " + shown)
      // A reason without a window changes the line only where nothing
      // else has to be said, and then it is the line about the picture.
      var noted = Ui.stripLine(state, shown, false, true)
      if (shown === "hidden" && line === "channel") assert.strictEqual(noted, "novideo", state)
      else assert.strictEqual(noted, line, state + " " + shown)
    })
  })
  video.forEach(function(shown) {
    // A click on a button that carries a reason never hides a window.
    assert.strictEqual(Ui.videoButton(shown, true).tip === "hide", shown === "shown")
    assert.strictEqual(Ui.videoButton("hidden", true).tip, "note")
    var button = Ui.videoButton(shown)
    assert.deepStrictEqual(Object.keys(button), ["icon", "tip", "lit"])
    var glyphs = Object.keys(Ui.GLYPH).map(function(name) { return Ui.GLYPH[name] })
    assert.ok(glyphs.indexOf(button.icon) !== -1, shown)
    assert.ok(["show", "hide", "loading", "note"].indexOf(button.tip) !== -1, shown)
    // Only an open window lights the button, and only then does a click hide.
    assert.strictEqual(button.lit, shown === "shown")
    assert.strictEqual(button.tip === "hide", shown === "shown")
  })
})

test("outputRows builds its own entries and never hands the service's objects on", function() {
  var entry = { name: "pipewire/sink-1", label: "Speakers", current: true, extra: "x" }
  var built = Ui.outputRows([entry])
  assert.notStrictEqual(built[0], entry)
  assert.deepStrictEqual(Object.keys(built[0]), ["name", "label", "current"])
  var odd = [undefined, null, 0, "", "auto", 7, true, {}, function() {}]
  odd.forEach(function(value) {
    assert.deepStrictEqual(Ui.outputRows(value), [])
    assert.deepStrictEqual(Ui.outputRows([value]), [])
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

// ---- Recording a shortcut ----

test("no key is recorded before the compositor holds its shortcuts back, and Esc always leaves", function() {
  var keys = SOME_KEYS.concat([16777249, 16777250, 16777251, 16777299, 16777300, 16781571, 33554431, 0, -1])
  keys.forEach(function(key) {
    SOME_MODS.forEach(function(modifiers) {
      [true, false].forEach(function(autoRepeat) {
        var where = JSON.stringify([key, modifiers, autoRepeat])
        var armed = Ui.captureStep(key, modifiers, autoRepeat, true)
        assert.ok(["cancel", "wait", "take"].indexOf(armed) !== -1, where)
        // Whatever is not exactly true counts as not armed.
        var unarmed = [false, null, undefined, 1, "true", {}]
        unarmed.forEach(function(value) {
          assert.notStrictEqual(Ui.captureStep(key, modifiers, autoRepeat, value), "take", where)
        })
        if (autoRepeat) assert.strictEqual(armed, "wait", where)
        var plain = (modifiers & (M.Shift | M.Control | M.Alt | M.Meta)) === 0
        if (key === K.Escape && plain && !autoRepeat) {
          assert.strictEqual(armed, "cancel", where)
          assert.strictEqual(Ui.captureStep(key, modifiers, autoRepeat, false), "cancel", where)
        } else {
          assert.notStrictEqual(armed, "cancel", where)
        }
      })
    })
  })
})

test("a key that is only held with others is never the shortcut itself", function() {
  // Shift, Control, Meta, Alt, the three locks, both Super and both Hyper
  // keys, AltGr, and the key Qt has no name for (qnamespace.h).
  var held = [
    16777248, 16777249, 16777250, 16777251, 16777252, 16777253, 16777254, 16777299, 16777300, 16777302,
    16777303, 16781571, 33554431
  ]
  held.forEach(function(key) {
    SOME_MODS.forEach(function(modifiers) {
      assert.strictEqual(Ui.captureStep(key, modifiers, false, true), "wait", String(key))
    })
  })
  // Every key a shortcut can end in is taken, with whatever is held.
  var KeyCombo = load.lib("KeyCombo")
  var letters = []
  for (var code = 65; code <= 90; code++) letters.push(code)
  for (var f = 0; f < 12; f++) letters.push(16777264 + f)
  letters.forEach(function(key) {
    [M.Meta, M.Meta | M.Control | M.Alt, M.Alt | M.Shift].forEach(function(modifiers) {
      assert.strictEqual(Ui.captureStep(key, modifiers, false, true), "take", String(key))
      assert.notStrictEqual(KeyCombo.fromQt(key, modifiers), "", String(key))
    })
  })
})

// ---- The shortcuts page ----

function shortcut(status, combo, proposal, note) {
  return {
    action: "video", label: "Show or hide video", combo: combo, status: status, proposal: proposal,
    note: note
  }
}

function everyShortcut() {
  var out = []
  var statuses = ["unassigned", "assigned", "blocked", "failed", "config", "constructor", ""]
  statuses.forEach(function(status) {
    ["", "SUPER + ALT + V"].forEach(function(combo) {
      ["", "SUPER + CTRL + ALT + V"].forEach(function(proposal) {
        ["", "Now used by: something"].forEach(function(note) {
          out.push(shortcut(status, combo, proposal, note))
        })
      })
    })
  })
  return out
}

var GATES = ["ok", "version", "config-errors", "no-hyprland", "", "constructor"]

test("a shortcut row offers the documented buttons for its status", function() {
  var expected = {
    unassigned: ["assign", "change", "copy"], assigned: ["unassign", "change"], config: ["change"],
    blocked: ["change", "copy"], failed: ["change", "copy"]
  }
  Object.keys(expected).forEach(function(status) {
    var entry = shortcut(status, "SUPER + ALT + V", "SUPER + CTRL + ALT + V", "")
    var row = Ui.shortcutRows([entry], "ok", false)[0]
    assert.deepStrictEqual(row.buttons.map(function(button) { return button.name }), expected[status], status)
    assert.ok(row.buttons.every(function(button) { return button.enabled }), status)
  })
})

test("nothing that needs the compositor is offered without it, or while a check runs", function() {
  everyShortcut().forEach(function(entry) {
    GATES.forEach(function(gate) {
      [false, true].forEach(function(busy) {
        var row = Ui.shortcutRows([entry], gate, busy)[0]
        var where = JSON.stringify([entry, gate, busy])
        row.buttons.forEach(function(button) {
          assert.strictEqual(typeof button.enabled, "boolean", where)
          if (busy) assert.strictEqual(button.enabled, false, where)
          if (button.name !== "copy" && gate !== "ok") assert.strictEqual(button.enabled, false, where)
          // Assign takes the proposed key, and Copy line names a key.
          if (button.name === "assign" && button.enabled) assert.notStrictEqual(row.proposal, "", where)
          if (button.name === "copy" && button.enabled) assert.notStrictEqual(row.copy, "", where)
        })
        // Copying needs no compositor: with a key to name it works behind every gate.
        var copy = row.buttons.filter(function(button) { return button.name === "copy" })[0]
        if (copy && !busy) assert.strictEqual(copy.enabled, row.copy !== "", where)
      })
    })
  })
})

test("every shortcut row has a sentence, and the service's own one wins", function() {
  var lines = ["assigned", "suggested", "nofree", "config", "blocked", "failed", "note"]
  everyShortcut().forEach(function(entry) {
    var row = Ui.shortcutRows([entry], "ok", false)[0]
    var where = JSON.stringify(entry)
    assert.deepStrictEqual(Object.keys(row),
      ["action", "label", "chip", "proposal", "line", "note", "warn", "copy", "buttons"], where)
    assert.ok(lines.indexOf(row.line) !== -1, where)
    if (entry.status === "config") assert.strictEqual(row.line, "config", where)
    else if (entry.note !== "") assert.strictEqual(row.line, "note", where)
    assert.strictEqual(row.note, entry.note, where)
    // A shortcut that is assigned and carries a sentence kept its key
    // because another one could not be had: that went wrong too.
    var kept = entry.status === "assigned" && entry.note !== ""
    assert.strictEqual(row.warn, entry.status === "blocked" || entry.status === "failed" || kept, where)
    // The chip never shows a key as taken that is only proposed, or the other way round.
    var held = ["assigned", "config", "blocked", "failed"].indexOf(entry.status) !== -1
    assert.strictEqual(row.chip, held ? entry.combo : entry.proposal, where)
  })
})

test("shortcutRows builds its own rows and survives anything it is handed", function() {
  var entry = shortcut("assigned", "SUPER + ALT + V", "", "")
  var copy = JSON.stringify(entry)
  var rows = Ui.shortcutRows([entry], "ok", false)
  assert.notStrictEqual(rows[0], entry)
  assert.strictEqual(JSON.stringify(entry), copy)
  var odd = [null, undefined, 7, "x", {}, [], [null], [[]], [{ action: 3 }], [{ action: "" }]]
  odd.forEach(function(value) {
    assert.deepStrictEqual(Ui.shortcutRows(value, "ok", false), [], JSON.stringify(value))
  })
  // Text that is not text is dropped, never shown.
  var strange = Ui.shortcutRows(
    [{ action: "a", label: {}, combo: [], status: 1, proposal: {}, note: 5 }], "ok", false)[0]
  assert.deepStrictEqual([strange.label, strange.chip, strange.note, strange.copy], ["a", "", "", ""])
  var many = []
  for (var i = 0; i < 50; i++) many.push(shortcut("assigned", "SUPER + ALT + V", "", ""))
  assert.ok(Ui.shortcutRows(many, "ok", false).length <= 8)
  GATES.forEach(function(gate) {
    assert.strictEqual(Ui.gateCode(gate) === "", gate === "ok", gate)
  })
})

// ---- The account page ----

test("every sign-in state has a screen, and a signed-in user can always sign out", function() {
  var states = [
    "off", "confirm", "browser", "exporting", "verifying", "on", "failed", "", "constructor", null
  ]
  var screens = ["off", "confirm", "browser", "exporting", "verifying", "on", "leaving", "failed"]
  var running = ["confirm", "browser", "exporting", "verifying"]
  states.forEach(function(state) {
    [true, false, null, 1].forEach(function(signedIn) {
      var screen = Ui.signInScreen(state, signedIn)
      var where = JSON.stringify([state, signedIn])
      assert.ok(screens.indexOf(screen) !== -1, where)
      var onDisk = [true, false, null, 1]
      onDisk.forEach(function(saved) {
        var buttons = Ui.signInButtons(screen, saved)
        assert.ok(Array.isArray(buttons), where)
        if (signedIn === true && running.indexOf(state) === -1) {
          assert.deepStrictEqual(buttons, ["signout"], where)
        } else if (running.indexOf(state) !== -1 || screen === "leaving") {
          // Nothing is deleted under an attempt, or twice.
          assert.ok(buttons.indexOf("signout") === -1, where)
        } else {
          // Not signed in and at rest: a login file that lies on disk can
          // be deleted, and without one nobody is shown a way to sign out.
          assert.strictEqual(buttons.indexOf("signout") !== -1, saved === true, where)
          assert.strictEqual(buttons[0], "begin", where)
        }
        // A browser is only ever opened from the confirmation.
        assert.strictEqual(buttons.indexOf("open") !== -1, screen === "confirm", where)
        // An attempt that is running can be cancelled.
        if (running.indexOf(state) !== -1) assert.ok(buttons.indexOf("cancel") !== -1, where)
      })
    })
  })
  // No screen starts an attempt and opens the browser with the same button.
  screens.forEach(function(screen) {
    var onDisk = [true, false]
    onDisk.forEach(function(saved) {
      var buttons = Ui.signInButtons(screen, saved)
      assert.ok(!(buttons.indexOf("begin") !== -1 && buttons.indexOf("open") !== -1), screen)
      assert.strictEqual(new Set(buttons).size, buttons.length, screen)
    })
  })
})

test("a saved login can be removed from every screen on which nothing is running", function() {
  // The screens a user can be left on with a login file on disk: signed
  // in, a failed attempt or an ended session, and a sign-out that could
  // not delete the file.
  var atRest = [["on", true], ["failed", false], ["off", false]]
  atRest.forEach(function(pair) {
    var screen = Ui.signInScreen(pair[0], pair[1])
    assert.ok(Ui.signInButtons(screen, true).indexOf("signout") !== -1, pair[0])
  })
})

test("the account is offered only for a video that needs it, and only to somebody signed in", function() {
  var states = ["idle", "resolving", "loading", "buffering", "playing", "paused", "error", "", null]
  var codes = [
    "E_NEEDS_ACCOUNT", "E_YT_REFUSED", "E_YT_BLOCKED", "E_NETWORK", "E_SIGNED_OUT", "", "constructor", null
  ]
  var offers = 0
  states.forEach(function(state) {
    codes.forEach(function(code) {
      [true, false, null, 1, "true"].forEach(function(signedIn) {
        var offered = Ui.accountOffer(state, code, signedIn)
        var due = state === "error" && code === "E_NEEDS_ACCOUNT" && signedIn === true
        assert.strictEqual(offered, due, JSON.stringify([state, code, signedIn]))
        if (offered) offers += 1
      })
    })
  })
  assert.strictEqual(offers, 1)
  assert.strictEqual(Ui.TEXT.ACCOUNT_PLAY, "Play with my account")
  assert.match(Ui.TEXT.ACCOUNT_ASK, /once with your YouTube login/)
})

// ---- Signed-in lists ----

test("feedRows hands a video on as it is and builds what a playlist row shows", function() {
  var video = {
    key: 3, playlist: false, id: "Abc123Def4Q", title: "T", channel: "C", duration: 9, live: false
  }
  var playlist = { key: 4, playlist: true, listId: "PL0123456789", title: "<b>Mine</b>", count: 3 }
  var rows = Ui.feedRows([video, playlist])
  assert.strictEqual(rows[0].track, video)
  assert.strictEqual(rows[0].kind, "feed")
  assert.strictEqual(rows[1].kind, "list")
  // The playlist's own object is not handed on: nothing of it is a track.
  assert.notStrictEqual(rows[1].track, playlist)
  assert.deepStrictEqual(Object.keys(rows[1].track), ["id", "title", "channel", "duration", "live"])
  assert.strictEqual(rows[1].track.id, "")
  assert.strictEqual(rows[1].track.title, "<b>Mine</b>")
  rows.forEach(function(row) {
    assert.deepStrictEqual(Object.keys(row), ["group", "kind", "key", "track"])
    assert.strictEqual(row.group, "")
  })
  var many = []
  for (var i = 1; i <= 500; i++) many.push({ key: i, playlist: true, title: "p" })
  assert.strictEqual(Ui.feedRows(many).length, 200)
  // A playlist row never asks for a thumbnail by an id.
  assert.strictEqual(Ui.thumbPath({ "": "/x/y.jpg" }, rows[1].track.id), "/x/y.jpg")
  assert.strictEqual(Ui.thumbPath(Object.create(null), rows[1].track.id), "")
})

test("the list area shows a signed-in list only when no search stands in front of it", function() {
  var feedLines = ["feedLoading", "feedError", "feedEmpty"]
  var searchStates = ["idle", "searching", "results", "empty", "error"]
  searchStates.forEach(function(searchState) {
    [true, false].forEach(function(linkNotice) {
      [0, 4].forEach(function(rowCount) {
        ["", "idle", "loading", "rows", "empty", "error", "constructor"].forEach(function(feedState) {
          var area = Ui.listArea(linkNotice, searchState, rowCount, feedState)
          var where = JSON.stringify([linkNotice, searchState, rowCount, feedState])
          if (feedLines.indexOf(area.line) !== -1) {
            assert.ok(!linkNotice && searchState === "idle" && feedState !== "", where)
            assert.strictEqual(area.list, false, where)
          }
          if (area.line === "home") assert.strictEqual(feedState, "", where)
          // Without a feed the answer is the one the home list always had.
          if (feedState === "") {
            assert.deepStrictEqual(area, Ui.listArea(linkNotice, searchState, rowCount), where)
          }
        })
      })
    })
  })
})

test("the note about a skipped segment goes away as the track plays on", function() {
  var skip = { category: "sponsor", from: 100, to: 130 }
  var shown = []
  for (var position = 0; position <= 300; position++) {
    if (Ui.recentSkip(skip, position)) shown.push(position)
  }
  assert.strictEqual(shown[0], 129)
  assert.strictEqual(shown[shown.length - 1], 137)
  assert.strictEqual(shown.length, 9)
  var odd = [null, undefined, 5, "x", [], {}, { to: NaN }, { to: Infinity }, { to: null }]
  odd.forEach(function(value) {
    assert.strictEqual(Ui.recentSkip(value, 130), false, JSON.stringify(value))
  })
  assert.strictEqual(Ui.recentSkip(skip, NaN), false)
})
