.pragma library

// Input and expectation table for ui/Ui.js: the whole keyboard table of the
// panel (which action each key means while typing, while browsing, on a
// sub-page and behind a confirmation), what the list area shows in each
// search state, how rows are built, and the small text helpers. The same
// table runs under node and inside Qt's JavaScript engine, so both must
// agree on every row.

// Qt's key and modifier numbers, written out: this file imports nothing.
var _ESC = 16777216
var _TAB = 16777217
var _BACKTAB = 16777218
var _BACKSPACE = 16777219
var _RETURN = 16777220
var _ENTER = 16777221
var _DELETE = 16777223
var _LEFT = 16777234
var _UP = 16777235
var _RIGHT = 16777236
var _DOWN = 16777237
var _PAGE_UP = 16777238
var _PAGE_DOWN = 16777239
var _F5 = 16777268
var _SPACE = 32
var _SLASH = 47
var _QUESTION = 63
var _A = 65
var _DIGIT_7 = 55
var _E_ACUTE = 201
var _DEL_CHAR = 127
var _KEY_SHIFT = 16777248

var _SHIFT = 33554432
var _CTRL = 67108864
var _ALT = 134217728
var _META = 268435456
var _KEYPAD = 536870912

// The main page as it opens: an empty field, nothing highlighted, three rows.
var _HOME = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 3, rowKind: ""
}
// The same with the highlight on a row.
var _HOME_ROW = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 3,
  rowKind: "recent"
}
// Nothing to show at all.
var _BARE = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 0, rowKind: ""
}
// Text in the field that has not been searched for.
var _NEW_TEXT = {
  page: "main", dialogOpen: false, hasText: true, matches: false, searching: false, rowCount: 3,
  rowKind: "result"
}
// Results on screen for the text in the field, the first one highlighted.
var _RESULTS = {
  page: "main", dialogOpen: false, hasText: true, matches: true, searching: false, rowCount: 5,
  rowKind: "result"
}
// The same after reopening the panel: results, but no highlight yet.
var _RESULTS_NO_ROW = {
  page: "main", dialogOpen: false, hasText: true, matches: true, searching: false, rowCount: 5, rowKind: ""
}
// The search for the text in the field is still running.
var _SEARCHING = {
  page: "main", dialogOpen: false, hasText: true, matches: true, searching: true, rowCount: 5,
  rowKind: "result"
}
// The link message is showing: the text counts as answered and no row is behind it.
var _LINK = {
  page: "main", dialogOpen: false, hasText: true, matches: true, searching: false, rowCount: 0, rowKind: ""
}
var _SUB = {
  page: "settings", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 3,
  rowKind: "setting"
}
var _SUB_NO_ROW = {
  page: "settings", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 3,
  rowKind: ""
}
var _DIALOG = {
  page: "settings", dialogOpen: true, hasText: false, matches: false, searching: false, rowCount: 3,
  rowKind: "setting"
}

var _T1 = { id: "AAAAAAAAAAA", title: "One", channel: "c", duration: 61, live: false }
var _T2 = { id: "BBBBBBBBBBB", title: "Two", channel: "", duration: null, live: true }
var _T3 = { id: "constructor", title: "Three", channel: "c", duration: 5, live: false }

var MODULE = "Ui"
var SIDE = "ui"
var CASES = [
  // ---- keyAction: panel-wide keys ----
  { fn: "keyAction", args: [_ESC, 0, true, _HOME], expect: "close" },
  { fn: "keyAction", args: [_ESC, 0, false, _HOME], expect: "close" },
  { fn: "keyAction", args: [_ESC, 0, true, _RESULTS], expect: "close" },
  { fn: "keyAction", args: [_ESC, _SHIFT, false, _HOME], expect: "close" },
  { fn: "keyAction", args: [_ESC, _CTRL, false, _HOME], expect: "close" },
  { fn: "keyAction", args: [_ESC, 0, false, _SUB], expect: "back" },
  { fn: "keyAction", args: [_ESC, 0, false, _SUB_NO_ROW], expect: "back" },
  { fn: "keyAction", args: [_TAB, 0, true, _HOME], expect: "switchNext" },
  { fn: "keyAction", args: [_TAB, 0, false, _HOME], expect: "switchNext" },
  { fn: "keyAction", args: [_TAB, 0, false, _SUB], expect: "switchNext" },
  { fn: "keyAction", args: [_TAB, _SHIFT, true, _HOME], expect: "switchPrev" },
  { fn: "keyAction", args: [_BACKTAB, _SHIFT, true, _HOME], expect: "switchPrev" },
  { fn: "keyAction", args: [_BACKTAB, _SHIFT, false, _HOME], expect: "switchPrev" },
  { fn: "keyAction", args: [_BACKTAB, 0, false, _SUB], expect: "switchPrev" },

  // ---- keyAction: main page, typing ----
  { fn: "keyAction", args: [_DOWN, 0, true, _HOME], expect: "down" },
  { fn: "keyAction", args: [_UP, 0, true, _HOME], expect: "up" },
  { fn: "keyAction", args: [_PAGE_DOWN, 0, true, _HOME], expect: "pageDown" },
  { fn: "keyAction", args: [_PAGE_UP, 0, true, _HOME], expect: "pageUp" },
  { fn: "keyAction", args: [_DOWN, _KEYPAD, true, _HOME], expect: "down" },
  // Without rows the arrows are swallowed and the field keeps the keyboard.
  { fn: "keyAction", args: [_DOWN, 0, true, _BARE], expect: "none" },
  { fn: "keyAction", args: [_UP, 0, true, _BARE], expect: "none" },
  { fn: "keyAction", args: [_PAGE_DOWN, 0, true, _BARE], expect: "none" },
  { fn: "keyAction", args: [_PAGE_UP, 0, true, _BARE], expect: "none" },
  // Enter with an empty field acts on the list.
  { fn: "keyAction", args: [_RETURN, 0, true, _HOME_ROW], expect: "activate" },
  { fn: "keyAction", args: [_ENTER, 0, true, _HOME_ROW], expect: "activate" },
  { fn: "keyAction", args: [_ENTER, _KEYPAD, true, _HOME_ROW], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, 0, true, _HOME], expect: "down" },
  { fn: "keyAction", args: [_RETURN, 0, true, _BARE], expect: "none" },
  // Enter with new text searches for it.
  { fn: "keyAction", args: [_RETURN, 0, true, _NEW_TEXT], expect: "submit" },
  { fn: "keyAction", args: [_ENTER, 0, true, _NEW_TEXT], expect: "submit" },
  // Enter on the results of that text plays the highlighted one.
  { fn: "keyAction", args: [_RETURN, 0, true, _RESULTS], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, 0, true, _RESULTS_NO_ROW], expect: "down" },
  // The same query is not sent twice.
  { fn: "keyAction", args: [_RETURN, 0, true, _SEARCHING], expect: "none" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, true, _SEARCHING], expect: "none" },
  // Behind the link message there is no row and nothing to send again.
  { fn: "keyAction", args: [_RETURN, 0, true, _LINK], expect: "none" },
  { fn: "keyAction", args: [_DOWN, 0, true, _LINK], expect: "none" },
  // Shift+Enter: the same decisions with the queueing actions.
  { fn: "keyAction", args: [_RETURN, _SHIFT, true, _HOME_ROW], expect: "enqueue" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, true, _HOME], expect: "down" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, true, _NEW_TEXT], expect: "submitEnqueue" },
  { fn: "keyAction", args: [_ENTER, _SHIFT, true, _NEW_TEXT], expect: "submitEnqueue" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, true, _RESULTS], expect: "enqueue" },
  // Everything else is typed.
  { fn: "keyAction", args: [_SPACE, 0, true, _HOME], expect: "" },
  { fn: "keyAction", args: [_SPACE, 0, true, _RESULTS], expect: "" },
  { fn: "keyAction", args: [_SLASH, 0, true, _HOME], expect: "" },
  { fn: "keyAction", args: [_BACKSPACE, 0, true, _RESULTS], expect: "" },
  { fn: "keyAction", args: [_A, 0, true, _HOME], expect: "" },
  { fn: "keyAction", args: [_A, _SHIFT, true, _HOME], expect: "" },
  { fn: "keyAction", args: [_DELETE, 0, true, _RESULTS], expect: "" },
  { fn: "keyAction", args: [_LEFT, 0, true, _RESULTS], expect: "" },
  // The field's own shortcuts stay the field's.
  { fn: "keyAction", args: [_A, _CTRL, true, _RESULTS], expect: "" },
  { fn: "keyAction", args: [_BACKSPACE, _CTRL, true, _RESULTS], expect: "" },
  { fn: "keyAction", args: [_RETURN, _CTRL, true, _NEW_TEXT], expect: "" },
  { fn: "keyAction", args: [_RETURN, _ALT, true, _RESULTS], expect: "" },
  { fn: "keyAction", args: [_DOWN, _META, true, _HOME], expect: "" },
  { fn: "keyAction", args: [_TAB, _ALT, true, _HOME], expect: "" },

  // ---- keyAction: main page, browsing ----
  { fn: "keyAction", args: [_DOWN, 0, false, _HOME_ROW], expect: "down" },
  { fn: "keyAction", args: [_UP, 0, false, _HOME_ROW], expect: "up" },
  { fn: "keyAction", args: [_PAGE_DOWN, 0, false, _HOME_ROW], expect: "pageDown" },
  { fn: "keyAction", args: [_PAGE_UP, 0, false, _HOME_ROW], expect: "pageUp" },
  { fn: "keyAction", args: [_DOWN, 0, false, _BARE], expect: "none" },
  { fn: "keyAction", args: [_RETURN, 0, false, _HOME_ROW], expect: "activate" },
  { fn: "keyAction", args: [_ENTER, 0, false, _RESULTS], expect: "activate" },
  // Browsing, Enter never searches, whatever the field holds.
  { fn: "keyAction", args: [_RETURN, 0, false, _NEW_TEXT], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, 0, false, _SEARCHING], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, 0, false, _HOME], expect: "down" },
  { fn: "keyAction", args: [_RETURN, 0, false, _BARE], expect: "none" },
  { fn: "keyAction", args: [_RETURN, 0, false, _LINK], expect: "none" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _HOME_ROW], expect: "enqueue" },
  { fn: "keyAction", args: [_ENTER, _SHIFT, false, _RESULTS], expect: "enqueue" },
  { fn: "keyAction", args: [_SPACE, 0, false, _HOME], expect: "playPause" },
  { fn: "keyAction", args: [_SPACE, 0, false, _RESULTS], expect: "playPause" },
  { fn: "keyAction", args: [_SPACE, _SHIFT, false, _HOME], expect: "playPause" },
  { fn: "keyAction", args: [_SLASH, 0, false, _HOME], expect: "focusField" },
  { fn: "keyAction", args: [_SLASH, _KEYPAD, false, _HOME], expect: "focusField" },
  { fn: "keyAction", args: [_BACKSPACE, 0, false, _RESULTS], expect: "fieldBackspace" },
  { fn: "keyAction", args: [_BACKSPACE, _SHIFT, false, _RESULTS], expect: "fieldBackspace" },
  { fn: "keyAction", args: [_A, 0, false, _HOME], expect: "fieldAppend" },
  { fn: "keyAction", args: [_A, _SHIFT, false, _HOME], expect: "fieldAppend" },
  { fn: "keyAction", args: [_DIGIT_7, 0, false, _HOME], expect: "fieldAppend" },
  { fn: "keyAction", args: [_QUESTION, _SHIFT, false, _HOME], expect: "fieldAppend" },
  { fn: "keyAction", args: [_E_ACUTE, 0, false, _HOME], expect: "fieldAppend" },
  // Keys that are no character, and shortcuts, are not ours.
  { fn: "keyAction", args: [_DELETE, 0, false, _HOME_ROW], expect: "" },
  { fn: "keyAction", args: [_LEFT, 0, false, _HOME_ROW], expect: "" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _HOME_ROW], expect: "" },
  { fn: "keyAction", args: [_F5, 0, false, _HOME_ROW], expect: "" },
  { fn: "keyAction", args: [_DEL_CHAR, 0, false, _HOME_ROW], expect: "" },
  { fn: "keyAction", args: [_KEY_SHIFT, _SHIFT, false, _HOME_ROW], expect: "" },
  { fn: "keyAction", args: [_A, _CTRL, false, _HOME], expect: "" },
  { fn: "keyAction", args: [_A, _ALT, false, _HOME], expect: "" },
  { fn: "keyAction", args: [_A, _META, false, _HOME], expect: "" },
  { fn: "keyAction", args: [_SPACE, _CTRL, false, _HOME], expect: "" },
  { fn: "keyAction", args: [_SLASH, _CTRL, false, _HOME], expect: "" },
  { fn: "keyAction", args: [_BACKSPACE, _CTRL, false, _RESULTS], expect: "" },
  // What the field leaves over arrives a second time as a browsing key:
  // a shortcut must mean nothing there either.
  { fn: "keyAction", args: [_RETURN, _CTRL, false, _RESULTS], expect: "" },
  { fn: "keyAction", args: [_RETURN, _CTRL | _SHIFT, false, _RESULTS], expect: "" },

  // ---- keyAction: sub-pages ----
  { fn: "keyAction", args: [_DOWN, 0, false, _SUB], expect: "down" },
  { fn: "keyAction", args: [_UP, 0, false, _SUB], expect: "up" },
  { fn: "keyAction", args: [_PAGE_DOWN, 0, false, _SUB], expect: "pageDown" },
  { fn: "keyAction", args: [_PAGE_UP, 0, false, _SUB], expect: "pageUp" },
  { fn: "keyAction", args: [_RETURN, 0, false, _SUB], expect: "activate" },
  { fn: "keyAction", args: [_ENTER, 0, false, _SUB], expect: "activate" },
  { fn: "keyAction", args: [_SPACE, 0, false, _SUB], expect: "activate" },
  // There is no queueing on a sub-page.
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _SUB], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, 0, false, _SUB_NO_ROW], expect: "down" },
  { fn: "keyAction", args: [_SPACE, 0, false, _SUB_NO_ROW], expect: "down" },
  // No text field exists there, so nothing is typed or searched.
  { fn: "keyAction", args: [_A, 0, false, _SUB], expect: "" },
  { fn: "keyAction", args: [_SLASH, 0, false, _SUB], expect: "" },
  { fn: "keyAction", args: [_BACKSPACE, 0, false, _SUB], expect: "" },
  { fn: "keyAction", args: [_DELETE, 0, false, _SUB], expect: "" },

  // ---- keyAction: behind a confirmation nothing reacts ----
  { fn: "keyAction", args: [_ESC, 0, false, _DIALOG], expect: "none" },
  { fn: "keyAction", args: [_TAB, 0, false, _DIALOG], expect: "none" },
  { fn: "keyAction", args: [_DOWN, 0, false, _DIALOG], expect: "none" },
  { fn: "keyAction", args: [_RETURN, 0, false, _DIALOG], expect: "none" },
  { fn: "keyAction", args: [_SPACE, 0, false, _DIALOG], expect: "none" },
  { fn: "keyAction", args: [_A, 0, false, _DIALOG], expect: "none" },
  { fn: "keyAction", args: [_A, _CTRL, false, _DIALOG], expect: "none" },

  // ---- keyAction: without a context no key means anything ----
  { fn: "keyAction", args: [_RETURN, 0, true, null], expect: "" },
  { fn: "keyAction", args: [_ESC, 0, false, null], expect: "" },
  { fn: "keyAction", args: [_SPACE, 0, false, "main"], expect: "" },
  { fn: "keyAction", args: [_A, 0, false, 7], expect: "" },
  // A context with nothing in it is a sub-page without rows.
  { fn: "keyAction", args: [_ESC, 0, false, {}], expect: "back" },
  { fn: "keyAction", args: [_RETURN, 0, false, {}], expect: "none" },
  { fn: "keyAction", args: [_DOWN, 0, false, {}], expect: "none" },
  { fn: "keyAction", args: [_A, 0, false, {}], expect: "" },

  // ---- clampIndex ----
  { fn: "clampIndex", args: [0, 5], expect: 0 },
  { fn: "clampIndex", args: [4, 5], expect: 4 },
  { fn: "clampIndex", args: [5, 5], expect: 4 },
  { fn: "clampIndex", args: [99, 5], expect: 4 },
  { fn: "clampIndex", args: [-1, 5], expect: 0 },
  { fn: "clampIndex", args: [-6, 5], expect: 0 },
  { fn: "clampIndex", args: [2.9, 5], expect: 2 },
  { fn: "clampIndex", args: [3, 0], expect: 0 },
  { fn: "clampIndex", args: [3, -2], expect: 0 },
  { fn: "clampIndex", args: [0, 1], expect: 0 },
  { fn: "clampIndex", args: ["2", 5], expect: 0 },
  { fn: "clampIndex", args: [null, 5], expect: 0 },
  { fn: "clampIndex", args: [2, "5"], expect: 0 },
  { fn: "clampIndex", args: [2, null], expect: 0 },

  // ---- duration ----
  { fn: "duration", args: [0], expect: "0:00" },
  { fn: "duration", args: [5], expect: "0:05" },
  { fn: "duration", args: [59], expect: "0:59" },
  { fn: "duration", args: [60], expect: "1:00" },
  { fn: "duration", args: [213], expect: "3:33" },
  { fn: "duration", args: [599.9], expect: "9:59" },
  { fn: "duration", args: [3599], expect: "59:59" },
  { fn: "duration", args: [3600], expect: "1:00:00" },
  { fn: "duration", args: [3661], expect: "1:01:01" },
  { fn: "duration", args: [36000], expect: "10:00:00" },
  { fn: "duration", args: [172800], expect: "48:00:00" },
  { fn: "duration", args: [null], expect: "" },
  { fn: "duration", args: [-1], expect: "" },
  { fn: "duration", args: ["213"], expect: "" },
  { fn: "duration", args: [{}], expect: "" },

  // ---- printable ----
  { fn: "printable", args: ["a"], expect: true },
  { fn: "printable", args: [" "], expect: true },
  { fn: "printable", args: ["\u00e9"], expect: true },
  { fn: "printable", args: ["\ud83c\udfb5"], expect: true },
  { fn: "printable", args: [""], expect: false },
  { fn: "printable", args: ["\u001b"], expect: false },
  { fn: "printable", args: ["\r"], expect: false },
  { fn: "printable", args: ["\t"], expect: false },
  { fn: "printable", args: ["\u007f"], expect: false },
  { fn: "printable", args: ["\u0085"], expect: false },
  { fn: "printable", args: ["a\nb"], expect: false },
  { fn: "printable", args: [null], expect: false },
  { fn: "printable", args: [65], expect: false },

  // ---- dropLast ----
  { fn: "dropLast", args: ["abc"], expect: "ab" },
  { fn: "dropLast", args: ["a"], expect: "" },
  { fn: "dropLast", args: [""], expect: "" },
  { fn: "dropLast", args: ["a b "], expect: "a b" },
  { fn: "dropLast", args: ["ab\ud83c\udfb5"], expect: "ab" },
  { fn: "dropLast", args: ["\ud83c\udfb5\ud83c\udfb5"], expect: "\ud83c\udfb5" },
  { fn: "dropLast", args: ["\ud83c\udfb5a"], expect: "\ud83c\udfb5" },
  { fn: "dropLast", args: [null], expect: "" },
  { fn: "dropLast", args: [12], expect: "" },

  // ---- rows ----
  { fn: "rows", args: ["search", [_T1, _T2], [], -1, [_T3]],
    expect: [{ group: "", kind: "result", key: 0, track: _T1 },
      { group: "", kind: "result", key: 0, track: _T2 }] },
  { fn: "rows", args: ["home", [_T1, _T2], [], -1, [_T3, _T1]],
    expect: [{ group: "RECENTLY PLAYED", kind: "recent", key: 0, track: _T3 },
      { group: "RECENTLY PLAYED", kind: "recent", key: 0, track: _T1 }] },
  { fn: "rows", args: ["search", [], [], -1, [_T3]], expect: [] },
  { fn: "rows", args: ["home", [_T1], [], -1, []], expect: [] },
  // The queue brings no rows yet, whatever it holds.
  { fn: "rows", args: ["home", [], [_T1, _T2], 0, []], expect: [] },
  { fn: "rows", args: ["home", [], [_T1, _T2], -1, [_T3]],
    expect: [{ group: "RECENTLY PLAYED", kind: "recent", key: 0, track: _T3 }] },
  // Lists that are not lists, and entries that are not tracks, give no rows.
  { fn: "rows", args: ["search", null, null, -1, null], expect: [] },
  { fn: "rows", args: ["home", null, null, -1, null], expect: [] },
  { fn: "rows", args: ["home", [], [], -1, "AAAAAAAAAAA"], expect: [] },
  { fn: "rows", args: ["search", [null, 5, "x", { id: 7 }, {}, _T2], [], -1, []],
    expect: [{ group: "", kind: "result", key: 0, track: _T2 }] },

  // ---- listArea ----
  { fn: "listArea", args: [true, "results", 5], expect: { line: "link", list: false, dim: false } },
  { fn: "listArea", args: [true, "searching", 5], expect: { line: "link", list: false, dim: false } },
  { fn: "listArea", args: [true, "idle", 0], expect: { line: "link", list: false, dim: false } },
  { fn: "listArea", args: [false, "searching", 5], expect: { line: "searching", list: true, dim: true } },
  { fn: "listArea", args: [false, "searching", 0], expect: { line: "searching", list: true, dim: true } },
  { fn: "listArea", args: [false, "empty", 0], expect: { line: "empty", list: false, dim: false } },
  { fn: "listArea", args: [false, "error", 0], expect: { line: "error", list: false, dim: false } },
  { fn: "listArea", args: [false, "error", 5], expect: { line: "error", list: false, dim: false } },
  { fn: "listArea", args: [false, "results", 5], expect: { line: "", list: true, dim: false } },
  { fn: "listArea", args: [false, "idle", 0], expect: { line: "home", list: false, dim: false } },
  { fn: "listArea", args: [false, "idle", 3], expect: { line: "", list: true, dim: false } },

  // ---- thumbPath ----
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "/run/omajuke/thumbs/1.jpg" }, "AAAAAAAAAAA"],
    expect: "/run/omajuke/thumbs/1.jpg" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "/run/omajuke/thumbs/1.jpg" }, "BBBBBBBBBBB"], expect: "" },
  { fn: "thumbPath", args: [{}, "AAAAAAAAAAA"], expect: "" },
  // An id that is also a member of every object finds nothing.
  { fn: "thumbPath", args: [{}, "constructor"], expect: "" },
  { fn: "thumbPath", args: [{}, "__proto__"], expect: "" },
  { fn: "thumbPath", args: [{}, "toString"], expect: "" },
  { fn: "thumbPath", args: [{ constructor: "/t/2.jpg" }, "constructor"], expect: "/t/2.jpg" },
  // Only a local absolute path is ever shown.
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "https://i.ytimg.com/vi/x/mqdefault.jpg" }, "AAAAAAAAAAA"],
    expect: "" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "//i.ytimg.com/vi/x/mqdefault.jpg" }, "AAAAAAAAAAA"],
    expect: "" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "file:///t/1.jpg" }, "AAAAAAAAAAA"], expect: "" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "thumbs/1.jpg" }, "AAAAAAAAAAA"], expect: "" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "" }, "AAAAAAAAAAA"], expect: "" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: 7 }, "AAAAAAAAAAA"], expect: "" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: { path: "/t/1.jpg" } }, "AAAAAAAAAAA"], expect: "" },
  { fn: "thumbPath", args: [null, "AAAAAAAAAAA"], expect: "" },
  { fn: "thumbPath", args: ["/t/1.jpg", "length"], expect: "" },
  { fn: "thumbPath", args: [{ AAAAAAAAAAA: "/t/1.jpg" }, null], expect: "" },
  { fn: "thumbPath", args: [{ 7: "/t/1.jpg" }, 7], expect: "" },

  // ---- barIcon ----
  { fn: "barIcon", args: [false, ""], expect: { active: false, dimmed: true } },
  { fn: "barIcon", args: [false, "playing"], expect: { active: false, dimmed: true } },
  { fn: "barIcon", args: [true, "idle"], expect: { active: false, dimmed: false } },
  { fn: "barIcon", args: [true, "playing"], expect: { active: true, dimmed: false } },
  { fn: "barIcon", args: [true, "buffering"], expect: { active: true, dimmed: false } },
  { fn: "barIcon", args: [true, "resolving"], expect: { active: true, dimmed: false } },
  { fn: "barIcon", args: [true, "loading"], expect: { active: true, dimmed: false } },
  { fn: "barIcon", args: [true, "paused"], expect: { active: false, dimmed: true } },
  { fn: "barIcon", args: [true, "error"], expect: { active: false, dimmed: false } },
  { fn: "barIcon", args: [true, "constructor"], expect: { active: false, dimmed: false } }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, SIDE: SIDE, CASES: CASES }
}
