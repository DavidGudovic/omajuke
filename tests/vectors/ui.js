.pragma library

// Input and expectation table for ui/Ui.js: the whole keyboard table of the
// panel (which action each key means while typing, while browsing, on a
// sub-page, on the button of a notice and behind a confirmation), where an
// arrow key takes the highlight, what the list area shows in each search
// state, how rows are built from results, the queue and the recents, what
// the now-playing strip and the outputs page show, and the small text
// helpers. The same table runs under node and inside Qt's JavaScript
// engine, so both must agree on every row. Further down: which key press a
// shortcut is recorded from, the rows of the shortcuts page in each state,
// the screens of the account page, and the rows of a signed-in list.

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
var _X = 88
var _KEY_SHIFT = 16777248
var _KEY_CONTROL = 16777249
var _KEY_META = 16777250
var _KEY_ALT = 16777251
var _KEY_CAPS = 16777252
var _KEY_SUPER_L = 16777299
var _KEY_ALT_GR = 16781571
var _KEY_UNKNOWN = 33554431
var _F12 = 16777275

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

// The cursor stands on the button of a notice above the list.
var _ON_ACTION = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 4,
  rowKind: "action"
}
// The same with text in the field that has not been searched for.
var _ON_ACTION_TEXT = {
  page: "main", dialogOpen: false, hasText: true, matches: false, searching: false, rowCount: 4,
  rowKind: "action"
}
// Only a notice is shown and its button is not highlighted yet.
var _NOTICE_ONLY = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 1, rowKind: ""
}
// An upcoming queue item on the home list.
var _HOME_QUEUE_ROW = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 3,
  rowKind: "queue"
}
var _QUEUE = {
  page: "queue", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 4,
  rowKind: "queue"
}
// The queue page with the cursor on its Clear button.
var _QUEUE_CLEAR = {
  page: "queue", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 4,
  rowKind: "clear"
}
var _QUEUE_NO_ROW = {
  page: "queue", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 4, rowKind: ""
}
// A settings row that is one of a few values.
var _CHOICE = {
  page: "settings", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 9,
  rowKind: "choice"
}
var _OUTPUT = {
  page: "outputs", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 2,
  rowKind: "output"
}
// A row of the shortcuts page, with its buttons side by side.
var _SHORTCUT = {
  page: "shortcuts", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 3,
  rowKind: "shortcut"
}
// The main page with the highlight on the row of feed chips.
var _ON_CHIPS = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 6,
  rowKind: "chips"
}
// The main page with the highlight on the buttons of the now-playing strip.
var _ON_STRIP = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 6,
  rowKind: "controls"
}
var _ALL_USABLE = [true, true, true, true, true, true, true]
var _NO_NEIGHBOURS = [false, true, false, true, true, true, true]
// The main page with the highlight on a video of a signed-in list, and on a
// playlist in one.
var _FEED_ROW = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 6,
  rowKind: "feed"
}
var _LIST_ROW = {
  page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 6,
  rowKind: "list"
}

// What the service reports about its shortcuts, one entry per state.
var _S_FREE = {
  action: "panel", label: "Open panel", combo: "", status: "unassigned", proposal: "SUPER + CTRL + ALT + J",
  note: ""
}
var _S_NONE_FREE = {
  action: "panel", label: "Open panel", combo: "", status: "unassigned", proposal: "", note: ""
}
var _S_TAKEN_AWAY = {
  action: "video", label: "Show or hide video", combo: "", status: "unassigned",
  proposal: "SUPER + ALT + V", note: "Now used by: Some other thing"
}
var _S_ASSIGNED = {
  action: "video", label: "Show or hide video", combo: "SUPER + CTRL + ALT + V", status: "assigned",
  proposal: "", note: ""
}
// Another key was recorded for it and could not be had: the old one stays.
var _S_KEPT = {
  action: "video", label: "Show or hide video", combo: "SUPER + CTRL + ALT + V", status: "assigned",
  proposal: "", note: "SUPER + ALT + V was not assigned. Now used by: Some other thing"
}
var _S_CONFIG = {
  action: "output", label: "Next audio output", combo: "SUPER + F9", status: "config", proposal: "",
  note: ""
}
var _S_BLOCKED = {
  action: "output", label: "Next audio output", combo: "SUPER + ALT + O", status: "blocked",
  proposal: "SUPER + CTRL + ALT + O", note: "Cannot confirm that this key is free"
}
var _S_FAILED = {
  action: "output", label: "Next audio output", combo: "", status: "failed", proposal: "", note: ""
}

// What the list area shows for a signed-in list that is on its way, could
// not be read, or holds nothing.
var _FEED_LOADING = { line: "feedLoading", list: false, dim: false }
var _FEED_ERROR = { line: "feedError", list: false, dim: false }
var _FEED_EMPTY = { line: "feedEmpty", list: false, dim: false }

// Rows of a signed-in list: a video, a playlist with and without a count.
var _F1 = {
  key: 4, playlist: false, id: "AAAAAAAAAAA", title: "One", channel: "c", duration: 61, live: false
}
var _F2 = { key: 5, playlist: true, listId: "PL0123456789", title: "Mix tape", count: 12 }
// How the first of the playlists reads as a row.
var _MIX_TAPE = { id: "", title: "Mix tape", channel: "Playlist, 12 videos", duration: null, live: false }
var _F3 = { key: 6, playlist: true, listId: "PL0123456780", title: "Solo", count: 1 }
var _F4 = { key: 7, playlist: true, listId: "PL0123456781", title: "Unknown", count: null }

var _T1 = { id: "AAAAAAAAAAA", title: "One", channel: "c", duration: 61, live: false }
var _T2 = { id: "BBBBBBBBBBB", title: "Two", channel: "", duration: null, live: true }
var _T3 = { id: "constructor", title: "Three", channel: "c", duration: 5, live: false }

// Queue items: a track plus the key of that insertion and whether autoplay
// added it.
var _Q1 = { id: "AAAAAAAAAAA", title: "One", channel: "c", duration: 61, live: false, key: 1, auto: false }
var _Q2 = { id: "BBBBBBBBBBB", title: "Two", channel: "", duration: null, live: true, key: 2, auto: false }
var _Q3 = { id: "AAAAAAAAAAA", title: "One", channel: "c", duration: 61, live: false, key: 7, auto: true }

// The glyphs of the video button: U+F0567, U+F0568 and U+F0996.
var _G_VIDEO = "\udb81\udd67"
var _G_VIDEO_OFF = "\udb81\udd68"
var _G_SPINNER = "\udb82\udd96"

var _SIZES = [
  { value: "sixth", label: "1/6" }, { value: "quarter", label: "1/4" },
  { value: "third", label: "1/3" }, { value: "half", label: "1/2" }
]

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

  // ---- keyAction: the queue page ----
  { fn: "keyAction", args: [_DOWN, 0, false, _QUEUE], expect: "down" },
  { fn: "keyAction", args: [_UP, 0, false, _QUEUE], expect: "up" },
  { fn: "keyAction", args: [_RETURN, 0, false, _QUEUE], expect: "activate" },
  { fn: "keyAction", args: [_SPACE, 0, false, _QUEUE], expect: "activate" },
  // x and Delete remove the row.
  { fn: "keyAction", args: [_X, 0, false, _QUEUE], expect: "remove" },
  { fn: "keyAction", args: [_X, _SHIFT, false, _QUEUE], expect: "remove" },
  { fn: "keyAction", args: [_DELETE, 0, false, _QUEUE], expect: "remove" },
  { fn: "keyAction", args: [_DELETE, _KEYPAD, false, _QUEUE], expect: "remove" },
  // Shift and an arrow carry the row along.
  { fn: "keyAction", args: [_UP, _SHIFT, false, _QUEUE], expect: "moveUp" },
  { fn: "keyAction", args: [_DOWN, _SHIFT, false, _QUEUE], expect: "moveDown" },
  { fn: "keyAction", args: [_DOWN, _SHIFT | _KEYPAD, false, _QUEUE], expect: "moveDown" },
  { fn: "keyAction", args: [_PAGE_DOWN, _SHIFT, false, _QUEUE], expect: "pageDown" },
  // Only a queue row is removed or carried: not the Clear button, and
  // nothing while no row is highlighted.
  { fn: "keyAction", args: [_X, 0, false, _QUEUE_CLEAR], expect: "" },
  { fn: "keyAction", args: [_DELETE, 0, false, _QUEUE_CLEAR], expect: "" },
  { fn: "keyAction", args: [_UP, _SHIFT, false, _QUEUE_CLEAR], expect: "up" },
  { fn: "keyAction", args: [_RETURN, 0, false, _QUEUE_CLEAR], expect: "activate" },
  { fn: "keyAction", args: [_X, 0, false, _QUEUE_NO_ROW], expect: "" },
  { fn: "keyAction", args: [_DOWN, _SHIFT, false, _QUEUE_NO_ROW], expect: "down" },
  { fn: "keyAction", args: [_X, _CTRL, false, _QUEUE], expect: "" },
  { fn: "keyAction", args: [_UP, _SHIFT | _CTRL, false, _QUEUE], expect: "" },
  { fn: "keyAction", args: [_LEFT, 0, false, _QUEUE], expect: "" },
  { fn: "keyAction", args: [_ESC, 0, false, _QUEUE], expect: "back" },
  // On the main page a queue row is played or queued again like any other.
  { fn: "keyAction", args: [_RETURN, 0, false, _HOME_QUEUE_ROW], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _HOME_QUEUE_ROW], expect: "enqueue" },
  { fn: "keyAction", args: [_DELETE, 0, false, _HOME_QUEUE_ROW], expect: "" },
  { fn: "keyAction", args: [_X, 0, false, _HOME_QUEUE_ROW], expect: "fieldAppend" },
  { fn: "keyAction", args: [_UP, _SHIFT, false, _HOME_QUEUE_ROW], expect: "up" },
  { fn: "keyAction", args: [_DOWN, _SHIFT, true, _HOME_QUEUE_ROW], expect: "down" },

  // ---- keyAction: rows that are a choice, and the outputs page ----
  { fn: "keyAction", args: [_LEFT, 0, false, _CHOICE], expect: "left" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _CHOICE], expect: "right" },
  { fn: "keyAction", args: [_RIGHT, _KEYPAD, false, _CHOICE], expect: "right" },
  { fn: "keyAction", args: [_RETURN, 0, false, _CHOICE], expect: "activate" },
  { fn: "keyAction", args: [_SPACE, 0, false, _CHOICE], expect: "activate" },
  { fn: "keyAction", args: [_X, 0, false, _CHOICE], expect: "" },
  { fn: "keyAction", args: [_UP, _SHIFT, false, _CHOICE], expect: "up" },
  { fn: "keyAction", args: [_LEFT, _CTRL, false, _CHOICE], expect: "" },
  { fn: "keyAction", args: [_LEFT, 0, false, _SUB], expect: "" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _SUB], expect: "" },
  { fn: "keyAction", args: [_RETURN, 0, false, _OUTPUT], expect: "activate" },
  { fn: "keyAction", args: [_SPACE, 0, false, _OUTPUT], expect: "activate" },
  { fn: "keyAction", args: [_DELETE, 0, false, _OUTPUT], expect: "" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _OUTPUT], expect: "" },

  // ---- keyAction: a shortcut row, the feed chips, the rows of a list ----
  { fn: "keyAction", args: [_LEFT, 0, false, _SHORTCUT], expect: "left" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _SHORTCUT], expect: "right" },
  { fn: "keyAction", args: [_RETURN, 0, false, _SHORTCUT], expect: "activate" },
  { fn: "keyAction", args: [_SPACE, 0, false, _SHORTCUT], expect: "activate" },
  { fn: "keyAction", args: [_DOWN, 0, false, _SHORTCUT], expect: "down" },
  { fn: "keyAction", args: [_X, 0, false, _SHORTCUT], expect: "" },
  { fn: "keyAction", args: [_ESC, 0, false, _SHORTCUT], expect: "back" },
  { fn: "keyAction", args: [_LEFT, 0, false, _ON_CHIPS], expect: "left" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _ON_CHIPS], expect: "right" },
  { fn: "keyAction", args: [_RETURN, 0, false, _ON_CHIPS], expect: "activate" },
  // There is nothing to queue about a chip, and Space stays play or pause.
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _ON_CHIPS], expect: "none" },
  { fn: "keyAction", args: [_SPACE, 0, false, _ON_CHIPS], expect: "playPause" },
  { fn: "keyAction", args: [_DOWN, 0, false, _ON_CHIPS], expect: "down" },
  // In the field Left and Right move the text cursor, wherever the highlight is.
  { fn: "keyAction", args: [_LEFT, 0, true, _ON_CHIPS], expect: "" },
  { fn: "keyAction", args: [_RIGHT, 0, true, _ON_CHIPS], expect: "" },

  // ---- keyAction: the buttons of the now-playing strip ----
  { fn: "keyAction", args: [_LEFT, 0, false, _ON_STRIP], expect: "left" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _ON_STRIP], expect: "right" },
  { fn: "keyAction", args: [_RETURN, 0, false, _ON_STRIP], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _ON_STRIP], expect: "none" },
  { fn: "keyAction", args: [_SPACE, 0, false, _ON_STRIP], expect: "playPause" },
  { fn: "keyAction", args: [_DOWN, 0, false, _ON_STRIP], expect: "down" },
  { fn: "keyAction", args: [_LEFT, 0, true, _ON_STRIP], expect: "" },
  // Enter never puts the highlight on a button that is always there.
  { fn: "keyAction", args: [_RETURN, 0, true, {
    page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 2,
    rowKind: "", fixed: 2
  }], expect: "none" },
  { fn: "keyAction", args: [_RETURN, 0, false, {
    page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 3,
    rowKind: "", fixed: 2
  }], expect: "down" },
  { fn: "keyAction", args: [_DOWN, 0, true, {
    page: "main", dialogOpen: false, hasText: false, matches: false, searching: false, rowCount: 2,
    rowKind: "", fixed: 2
  }], expect: "down" },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, 1, 0, 4, 2],
    expect: { active: false, index: 0, action: 2 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, 1, 0, 2, 2],
    expect: { active: false, index: 0, action: 0 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, -1, 0, 4, 2],
    expect: { active: false, index: 0, action: 3 } },

  // ---- placeKind ----
  { fn: "placeKind", args: ["feeds"], expect: "chips" },
  { fn: "placeKind", args: ["controls"], expect: "controls" },
  { fn: "placeKind", args: ["settings"], expect: "action" },
  { fn: "placeKind", args: ["dismiss"], expect: "action" },
  { fn: "placeKind", args: [""], expect: "action" },
  { fn: "placeKind", args: [null], expect: "action" },

  // ---- stepControl ----
  { fn: "stepControl", args: [1, 1, _ALL_USABLE], expect: 2 },
  { fn: "stepControl", args: [1, -1, _ALL_USABLE], expect: 0 },
  { fn: "stepControl", args: [0, -1, _ALL_USABLE], expect: 0 },
  { fn: "stepControl", args: [6, 1, _ALL_USABLE], expect: 6 },
  { fn: "stepControl", args: [5, 1, _ALL_USABLE], expect: 6 },
  { fn: "stepControl", args: [3, 0, _ALL_USABLE], expect: 3 },
  // A button that cannot be pressed is stepped over, or never left for.
  { fn: "stepControl", args: [1, 1, _NO_NEIGHBOURS], expect: 3 },
  { fn: "stepControl", args: [3, -1, _NO_NEIGHBOURS], expect: 1 },
  { fn: "stepControl", args: [1, -1, _NO_NEIGHBOURS], expect: 1 },
  // The highlighted one cannot be pressed any more: back to play or pause.
  { fn: "stepControl", args: [2, 0, _NO_NEIGHBOURS], expect: 1 },
  { fn: "stepControl", args: [0, 1, _NO_NEIGHBOURS], expect: 1 },
  { fn: "stepControl", args: [-1, 1, _ALL_USABLE], expect: 1 },
  { fn: "stepControl", args: [7, -1, _ALL_USABLE], expect: 1 },
  { fn: "stepControl", args: [1.5, 1, _ALL_USABLE], expect: 1 },
  { fn: "stepControl", args: ["2", 1, _ALL_USABLE], expect: 1 },
  { fn: "stepControl", args: [3, 1, null], expect: 1 },
  { fn: "stepControl", args: [3, 1], expect: 1 },
  { fn: "stepControl", args: [], expect: 1 },
  // On a row of the main page they mean nothing.
  { fn: "keyAction", args: [_LEFT, 0, false, _HOME_ROW], expect: "" },
  { fn: "keyAction", args: [_RIGHT, 0, false, _ON_ACTION], expect: "" },
  { fn: "keyAction", args: [_RETURN, 0, false, _FEED_ROW], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _FEED_ROW], expect: "enqueue" },
  { fn: "keyAction", args: [_RETURN, 0, false, _LIST_ROW], expect: "activate" },
  // A playlist is opened, never queued.
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _LIST_ROW], expect: "none" },
  { fn: "keyAction", args: [_LEFT, 0, false, _FEED_ROW], expect: "" },

  // ---- captureStep ----
  { fn: "captureStep", args: [_A, _META | _CTRL, false, true], expect: "take" },
  { fn: "captureStep", args: [_F12, _ALT, false, true], expect: "take" },
  { fn: "captureStep", args: [_A, 0, false, true], expect: "take" },
  { fn: "captureStep", args: [_TAB, 0, false, true], expect: "take" },
  { fn: "captureStep", args: [_RETURN, _META, false, true], expect: "take" },
  // Esc on its own gives up, armed or not. With a modifier it is a key.
  { fn: "captureStep", args: [_ESC, 0, false, true], expect: "cancel" },
  { fn: "captureStep", args: [_ESC, 0, false, false], expect: "cancel" },
  { fn: "captureStep", args: [_ESC, _KEYPAD, false, true], expect: "cancel" },
  { fn: "captureStep", args: [_ESC, _META, false, true], expect: "take" },
  { fn: "captureStep", args: [_ESC, _SHIFT, false, false], expect: "wait" },
  // Nothing is taken before the compositor holds its shortcuts back.
  { fn: "captureStep", args: [_A, _META | _CTRL, false, false], expect: "wait" },
  { fn: "captureStep", args: [_A, _META, false, null], expect: "wait" },
  { fn: "captureStep", args: [_A, _META, false, 1], expect: "wait" },
  // A key that repeats while held, even Esc.
  { fn: "captureStep", args: [_A, _META, true, true], expect: "wait" },
  { fn: "captureStep", args: [_ESC, 0, true, true], expect: "wait" },
  // Keys that are only ever held with another one.
  { fn: "captureStep", args: [_KEY_SHIFT, _SHIFT, false, true], expect: "wait" },
  { fn: "captureStep", args: [_KEY_CONTROL, _CTRL, false, true], expect: "wait" },
  { fn: "captureStep", args: [_KEY_META, _META, false, true], expect: "wait" },
  { fn: "captureStep", args: [_KEY_ALT, _ALT, false, true], expect: "wait" },
  { fn: "captureStep", args: [_KEY_CAPS, 0, false, true], expect: "wait" },
  { fn: "captureStep", args: [_KEY_SUPER_L, _META, false, true], expect: "wait" },
  { fn: "captureStep", args: [_KEY_ALT_GR, 0, false, true], expect: "wait" },
  { fn: "captureStep", args: [_KEY_UNKNOWN, _META, false, true], expect: "wait" },
  { fn: "captureStep", args: [0, _META, false, true], expect: "wait" },
  { fn: "captureStep", args: ["a", 0, false, true], expect: "wait" },
  { fn: "captureStep", args: [_A, null, false, true], expect: "wait" },

  // ---- keyAction: the button of a notice ----
  { fn: "keyAction", args: [_RETURN, 0, false, _ON_ACTION], expect: "activate" },
  { fn: "keyAction", args: [_ENTER, 0, false, _ON_ACTION], expect: "activate" },
  { fn: "keyAction", args: [_RETURN, 0, true, _ON_ACTION], expect: "activate" },
  // There is nothing to queue about a button.
  { fn: "keyAction", args: [_RETURN, _SHIFT, false, _ON_ACTION], expect: "none" },
  { fn: "keyAction", args: [_RETURN, _SHIFT, true, _ON_ACTION], expect: "none" },
  // Text that was typed since is searched for; the button is not pressed.
  { fn: "keyAction", args: [_RETURN, 0, true, _ON_ACTION_TEXT], expect: "submit" },
  { fn: "keyAction", args: [_RETURN, 0, false, _ON_ACTION_TEXT], expect: "activate" },
  { fn: "keyAction", args: [_SPACE, 0, false, _ON_ACTION], expect: "playPause" },
  { fn: "keyAction", args: [_DOWN, 0, false, _ON_ACTION], expect: "down" },
  { fn: "keyAction", args: [_UP, 0, false, _ON_ACTION], expect: "up" },
  // A notice alone: the first Enter only shows the highlight on its button.
  { fn: "keyAction", args: [_RETURN, 0, false, _NOTICE_ONLY], expect: "down" },
  { fn: "keyAction", args: [_DOWN, 0, false, _NOTICE_ONLY], expect: "down" },
  { fn: "keyAction", args: [_UP, 0, false, _NOTICE_ONLY], expect: "up" },

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

  // ---- moveCursor: within the rows ----
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, 1, 3, 0],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, -1, 3, 0],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: false, index: 2, action: -1 }, 6, 3, 0],
    expect: { active: true, index: 2, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 0, action: -1 }, 1, 3, 0],
    expect: { active: true, index: 1, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 2, action: -1 }, 1, 3, 0],
    expect: { active: true, index: 2, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 0, action: -1 }, -1, 3, 0],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 1, action: -1 }, 6, 9, 0],
    expect: { active: true, index: 7, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 7, action: -1 }, -6, 9, 0],
    expect: { active: true, index: 1, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 1, action: -1 }, -6, 9, 2],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 8, action: -1 }, 1, 3, 0],
    expect: { active: true, index: 2, action: -1 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, 1, 0, 0],
    expect: { active: false, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 4, action: -1 }, 1, 0, 0],
    expect: { active: false, index: 0, action: -1 } },
  // ---- moveCursor: the buttons of notices lie above the rows ----
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, 1, 3, 1],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, -1, 3, 1],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 0, action: -1 }, -1, 3, 1],
    expect: { active: false, index: 0, action: 0 } },
  { fn: "moveCursor", args: [{ active: true, index: 0, action: -1 }, -1, 3, 2],
    expect: { active: false, index: 0, action: 1 } },
  { fn: "moveCursor", args: [{ active: true, index: 0, action: -1 }, -6, 3, 2],
    expect: { active: false, index: 0, action: 1 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: 1 }, -1, 3, 2],
    expect: { active: false, index: 0, action: 0 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: 0 }, -1, 3, 2],
    expect: { active: false, index: 0, action: 0 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: 0 }, 1, 3, 2],
    expect: { active: false, index: 0, action: 1 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: 1 }, 1, 3, 2],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: false, index: 2, action: 0 }, 6, 3, 2],
    expect: { active: true, index: 2, action: -1 } },
  // Without rows the first press shows the highlight on a button.
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, 1, 0, 1],
    expect: { active: false, index: 0, action: 0 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, 1, 0, 2],
    expect: { active: false, index: 0, action: 0 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: -1 }, -1, 0, 2],
    expect: { active: false, index: 0, action: 1 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: 1 }, 1, 0, 2],
    expect: { active: false, index: 0, action: 1 } },
  { fn: "moveCursor", args: [{ active: false, index: 0, action: 0 }, 6, 0, 1],
    expect: { active: false, index: 0, action: 0 } },
  // A button that is gone no longer holds the highlight.
  { fn: "moveCursor", args: [{ active: false, index: 1, action: 3 }, 1, 3, 1],
    expect: { active: true, index: 1, action: -1 } },
  { fn: "moveCursor", args: [{ active: false, index: 1, action: 0 }, 1, 3, 0],
    expect: { active: true, index: 1, action: -1 } },
  // Anything that is not a position counts as "nothing highlighted".
  { fn: "moveCursor", args: [null, 1, 3, 1], expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{}, 1, 0, 1], expect: { active: false, index: 0, action: 0 } },
  { fn: "moveCursor", args: [{ active: "yes", index: "2", action: "0" }, 1, 3, 1],
    expect: { active: true, index: 0, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 1, action: -1 }, "1", 3, 0],
    expect: { active: true, index: 1, action: -1 } },
  { fn: "moveCursor", args: [{ active: true, index: 1, action: -1 }, 1, null, null],
    expect: { active: false, index: 0, action: -1 } },

  // ---- pageTitle ----
  { fn: "pageTitle", args: ["main"], expect: "" },
  { fn: "pageTitle", args: ["settings"], expect: "Settings" },
  { fn: "pageTitle", args: ["queue"], expect: "Queue" },
  { fn: "pageTitle", args: ["outputs"], expect: "Audio output" },
  { fn: "pageTitle", args: ["shortcuts"], expect: "Shortcuts" },
  { fn: "pageTitle", args: ["signin"], expect: "YouTube account" },
  { fn: "pageTitle", args: ["constructor"], expect: "" },
  { fn: "pageTitle", args: [""], expect: "" },
  { fn: "pageTitle", args: [null], expect: "" },
  { fn: "pageTitle", args: [1], expect: "" },

  // ---- parentPage ----
  { fn: "parentPage", args: ["shortcuts"], expect: "settings" },
  { fn: "parentPage", args: ["signin"], expect: "settings" },
  { fn: "parentPage", args: ["settings"], expect: "main" },
  { fn: "parentPage", args: ["queue"], expect: "main" },
  { fn: "parentPage", args: ["outputs"], expect: "main" },
  { fn: "parentPage", args: ["main"], expect: "main" },
  { fn: "parentPage", args: ["constructor"], expect: "main" },
  { fn: "parentPage", args: [null], expect: "main" },

  // ---- stepChoice ----
  { fn: "stepChoice", args: [_SIZES, "quarter", 1, false], expect: "third" },
  { fn: "stepChoice", args: [_SIZES, "quarter", -1, false], expect: "sixth" },
  { fn: "stepChoice", args: [_SIZES, "sixth", -1, false], expect: "sixth" },
  { fn: "stepChoice", args: [_SIZES, "half", 1, false], expect: "half" },
  { fn: "stepChoice", args: [_SIZES, "half", 1, true], expect: "sixth" },
  { fn: "stepChoice", args: [_SIZES, "sixth", -1, true], expect: "half" },
  { fn: "stepChoice", args: [_SIZES, "third", 0, false], expect: "third" },
  { fn: "stepChoice", args: [_SIZES, "third", 9, false], expect: "half" },
  { fn: "stepChoice", args: [_SIZES, "third", 5, true], expect: "half" },
  // A value that is none of the options counts as the first.
  { fn: "stepChoice", args: [_SIZES, "huge", 1, false], expect: "quarter" },
  { fn: "stepChoice", args: [_SIZES, null, 0, false], expect: "sixth" },
  { fn: "stepChoice", args: [_SIZES, "quarter", "1", false], expect: "quarter" },
  { fn: "stepChoice", args: [[], "quarter", 1, true], expect: "" },
  { fn: "stepChoice", args: [null, "quarter", 1, true], expect: "" },
  { fn: "stepChoice", args: [[null, "half", { value: 7 }], "half", 2, false], expect: "" },

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
  // The home list starts with what is queued after the current track.
  { fn: "rows", args: ["home", [_T1], [_Q1, _Q2, _Q3], 0, [_T3]],
    expect: [{ group: "QUEUE", kind: "queue", key: 2, track: _Q2 },
      { group: "QUEUE", kind: "queue", key: 7, track: _Q3 },
      { group: "RECENTLY PLAYED", kind: "recent", key: 0, track: _T3 }] },
  { fn: "rows", args: ["home", [], [_Q1, _Q2, _Q3], 1, []],
    expect: [{ group: "QUEUE", kind: "queue", key: 7, track: _Q3 }] },
  { fn: "rows", args: ["home", [], [_Q1, _Q2, _Q3], 2, [_T3]],
    expect: [{ group: "RECENTLY PLAYED", kind: "recent", key: 0, track: _T3 }] },
  { fn: "rows", args: ["home", [], [_Q1, _Q2], 9, []], expect: [] },
  // Without a current track the whole queue is still to come.
  { fn: "rows", args: ["home", [], [_Q1, _Q2], -1, []],
    expect: [{ group: "QUEUE", kind: "queue", key: 1, track: _Q1 },
      { group: "QUEUE", kind: "queue", key: 2, track: _Q2 }] },
  { fn: "rows", args: ["home", [], [_Q1, _Q2], null, []],
    expect: [{ group: "QUEUE", kind: "queue", key: 1, track: _Q1 },
      { group: "QUEUE", kind: "queue", key: 2, track: _Q2 }] },
  { fn: "rows", args: ["home", [], [_Q1, _Q2], 0.9, []],
    expect: [{ group: "QUEUE", kind: "queue", key: 2, track: _Q2 }] },
  // An item without a usable key cannot be played by key and gets no row.
  { fn: "rows", args: ["home", [], [_T1, _T2], -1, [_T3]],
    expect: [{ group: "RECENTLY PLAYED", kind: "recent", key: 0, track: _T3 }] },
  { fn: "rows", args: ["home", [], [{ id: "AAAAAAAAAAA", key: 0 }, { id: "AAAAAAAAAAA", key: -3 },
    { id: "AAAAAAAAAAA", key: 1.5 }, { id: "AAAAAAAAAAA", key: "4" }, { key: 5 }, null], -1, []],
    expect: [] },
  // The search results never carry queue rows.
  { fn: "rows", args: ["search", [_T1], [_Q1, _Q2], -1, [_T3]],
    expect: [{ group: "", kind: "result", key: 0, track: _T1 }] },
  // The queue page lists the whole queue, the played part included.
  { fn: "rows", args: ["queue", [_T1], [_Q1, _Q2, _Q3], 1, [_T3]],
    expect: [{ group: "", kind: "queue", key: 1, track: _Q1 },
      { group: "", kind: "queue", key: 2, track: _Q2 },
      { group: "", kind: "queue", key: 7, track: _Q3 }] },
  { fn: "rows", args: ["queue", [_T1], [], -1, [_T3]], expect: [] },
  { fn: "rows", args: ["queue", [_T1], null, -1, [_T3]], expect: [] },
  // Lists that are not lists, and entries that are not tracks, give no rows.
  { fn: "rows", args: ["search", null, null, -1, null], expect: [] },
  { fn: "rows", args: ["home", null, null, -1, null], expect: [] },
  { fn: "rows", args: ["home", [], [], -1, "AAAAAAAAAAA"], expect: [] },
  { fn: "rows", args: ["search", [null, 5, "x", { id: 7 }, {}, _T2], [], -1, []],
    expect: [{ group: "", kind: "result", key: 0, track: _T2 }] },

  // ---- feedRows ----
  { fn: "feedRows", args: [[_F1, _F2]],
    expect: [{ group: "", kind: "feed", key: 4, track: _F1 },
      { group: "", kind: "list", key: 5, track: _MIX_TAPE }] },
  { fn: "feedRows", args: [[_F3, _F4]],
    expect: [
      { group: "", kind: "list", key: 6,
        track: { id: "", title: "Solo", channel: "Playlist, 1 video", duration: null, live: false } },
      { group: "", kind: "list", key: 7,
        track: { id: "", title: "Unknown", channel: "Playlist", duration: null, live: false } }] },
  // A row without a key cannot be opened, and one that is neither a video
  // nor a playlist cannot be shown.
  { fn: "feedRows", args: [[null, "x", 7, {}, _T1, { key: 0, playlist: true, title: "No key" },
    { key: 1.5, playlist: true, title: "Half a key" }, { key: 3, playlist: true, title: 9 },
    { key: 2, playlist: false, title: "No id" }, { key: "2", id: "AAAAAAAAAAA" }]], expect: [] },
  { fn: "feedRows", args: [[{ key: 9, playlist: true, title: "", count: -1 }]],
    expect: [{ group: "", kind: "list", key: 9,
      track: { id: "", title: "", channel: "Playlist", duration: null, live: false } }] },
  { fn: "feedRows", args: [[{ key: 9, playlist: true, title: "t", count: 0 }]],
    expect: [{ group: "", kind: "list", key: 9,
      track: { id: "", title: "t", channel: "Playlist, 0 videos", duration: null, live: false } }] },
  { fn: "feedRows", args: [[]], expect: [] },
  { fn: "feedRows", args: [null], expect: [] },
  { fn: "feedRows", args: ["rows"], expect: [] },

  // ---- indexOfKey ----
  { fn: "indexOfKey", args: [[{ key: 1 }, { key: 2 }, { key: 7 }], 7], expect: 2 },
  { fn: "indexOfKey", args: [[{ key: 1 }, { key: 2 }, { key: 7 }], 1], expect: 0 },
  { fn: "indexOfKey", args: [[{ key: 1 }, { key: 2 }, { key: 7 }], 3], expect: -1 },
  { fn: "indexOfKey", args: [[{ key: 0 }, { key: 2 }], 0], expect: -1 },
  { fn: "indexOfKey", args: [[null, 5, { key: 5 }], 5], expect: 2 },
  { fn: "indexOfKey", args: [[{ key: "5" }], 5], expect: -1 },
  { fn: "indexOfKey", args: [[{ key: 5 }], "5"], expect: -1 },
  { fn: "indexOfKey", args: [[], 1], expect: -1 },
  { fn: "indexOfKey", args: [null, 1], expect: -1 },

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
  // A signed-in list in place of the home list.
  { fn: "listArea", args: [false, "idle", 0, ""], expect: { line: "home", list: false, dim: false } },
  { fn: "listArea", args: [false, "idle", 0, "loading"], expect: _FEED_LOADING },
  { fn: "listArea", args: [false, "idle", 9, "loading"], expect: _FEED_LOADING },
  { fn: "listArea", args: [false, "idle", 0, "error"], expect: _FEED_ERROR },
  { fn: "listArea", args: [false, "idle", 9, "error"], expect: _FEED_ERROR },
  { fn: "listArea", args: [false, "idle", 0, "empty"], expect: _FEED_EMPTY },
  { fn: "listArea", args: [false, "idle", 0, "rows"], expect: _FEED_EMPTY },
  { fn: "listArea", args: [false, "idle", 0, "idle"], expect: _FEED_EMPTY },
  { fn: "listArea", args: [false, "idle", 4, "rows"], expect: { line: "", list: true, dim: false } },
  // A search and the link message come before it.
  { fn: "listArea", args: [false, "results", 4, "loading"], expect: { line: "", list: true, dim: false } },
  { fn: "listArea", args: [false, "searching", 0, "error"],
    expect: { line: "searching", list: true, dim: true } },
  { fn: "listArea", args: [true, "idle", 4, "rows"], expect: { line: "link", list: false, dim: false } },
  { fn: "listArea", args: [false, "idle", 0, null], expect: { line: "home", list: false, dim: false } },

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

  // ---- stripLine ----
  { fn: "stripLine", args: ["playing", "hidden"], expect: "channel" },
  { fn: "stripLine", args: ["paused", "shown"], expect: "channel" },
  { fn: "stripLine", args: ["buffering", "hidden"], expect: "channel" },
  { fn: "stripLine", args: ["idle", "hidden"], expect: "channel" },
  { fn: "stripLine", args: ["resolving", "hidden"], expect: "loading" },
  { fn: "stripLine", args: ["loading", "shown"], expect: "loading" },
  { fn: "stripLine", args: ["playing", "loading"], expect: "video" },
  { fn: "stripLine", args: ["paused", "loading"], expect: "video" },
  { fn: "stripLine", args: ["playing", "unavailable"], expect: "novideo" },
  // The track comes before its picture, and a failure before both.
  { fn: "stripLine", args: ["loading", "loading"], expect: "loading" },
  { fn: "stripLine", args: ["resolving", "unavailable"], expect: "loading" },
  { fn: "stripLine", args: ["error", "loading"], expect: "error" },
  { fn: "stripLine", args: ["error", "unavailable"], expect: "error" },
  { fn: "stripLine", args: ["playing", "constructor"], expect: "channel" },
  { fn: "stripLine", args: [null, null], expect: "channel" },
  // A skip is said while nothing more pressing is.
  { fn: "stripLine", args: ["playing", "hidden", true], expect: "skip" },
  { fn: "stripLine", args: ["playing", "shown", true], expect: "skip" },
  { fn: "stripLine", args: ["playing", "hidden", false], expect: "channel" },
  { fn: "stripLine", args: ["playing", "hidden", 1], expect: "channel" },
  { fn: "stripLine", args: ["playing", "loading", true], expect: "video" },
  { fn: "stripLine", args: ["playing", "unavailable", true], expect: "novideo" },
  { fn: "stripLine", args: ["error", "hidden", true], expect: "error" },
  { fn: "stripLine", args: ["loading", "hidden", true], expect: "loading" },
  // A window that could not be asked for stays hidden, and the reason is
  // said like the one of a track without a picture.
  { fn: "stripLine", args: ["playing", "hidden", false, true], expect: "novideo" },
  { fn: "stripLine", args: ["paused", "hidden", true, true], expect: "novideo" },
  { fn: "stripLine", args: ["playing", "hidden", false, false], expect: "channel" },
  { fn: "stripLine", args: ["playing", "hidden", false, 1], expect: "channel" },
  { fn: "stripLine", args: ["playing", "hidden", false, "E_HYPR_ERRORS"], expect: "channel" },
  { fn: "stripLine", args: ["playing", "shown", false, true], expect: "channel" },
  { fn: "stripLine", args: ["playing", "loading", false, true], expect: "video" },
  { fn: "stripLine", args: ["playing", "unavailable", false, false], expect: "novideo" },
  { fn: "stripLine", args: ["resolving", "hidden", false, true], expect: "loading" },
  { fn: "stripLine", args: ["error", "hidden", false, true], expect: "error" },

  // ---- recentSkip ----
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: 60 }, 60], expect: true },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: 60 }, 59.2], expect: true },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: 60 }, 67.9], expect: true },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: 60 }, 68], expect: false },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: 60 }, 58.9], expect: false },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: 60 }, 10], expect: false },
  { fn: "recentSkip", args: [null, 60], expect: false },
  { fn: "recentSkip", args: ["skip", 60], expect: false },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30 }, 60], expect: false },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: "60" }, 60], expect: false },
  { fn: "recentSkip", args: [{ category: "sponsor", from: 30, to: 60 }, null], expect: false },

  // ---- videoButton ----
  { fn: "videoButton", args: ["hidden"], expect: { icon: _G_VIDEO, tip: "show", lit: false } },
  { fn: "videoButton", args: ["loading"], expect: { icon: _G_SPINNER, tip: "loading", lit: false } },
  { fn: "videoButton", args: ["shown"], expect: { icon: _G_VIDEO, tip: "hide", lit: true } },
  { fn: "videoButton", args: ["unavailable"], expect: { icon: _G_VIDEO_OFF, tip: "note", lit: false } },
  { fn: "videoButton", args: ["constructor"], expect: { icon: _G_VIDEO, tip: "show", lit: false } },
  { fn: "videoButton", args: [""], expect: { icon: _G_VIDEO, tip: "show", lit: false } },
  { fn: "videoButton", args: [null], expect: { icon: _G_VIDEO, tip: "show", lit: false } },
  // A showing that was refused: the tooltip says why, a click asks again.
  { fn: "videoButton", args: ["hidden", true], expect: { icon: _G_VIDEO, tip: "note", lit: false } },
  { fn: "videoButton", args: ["hidden", false], expect: { icon: _G_VIDEO, tip: "show", lit: false } },
  { fn: "videoButton", args: ["hidden", 1], expect: { icon: _G_VIDEO, tip: "show", lit: false } },
  { fn: "videoButton", args: ["shown", true], expect: { icon: _G_VIDEO, tip: "hide", lit: true } },
  { fn: "videoButton", args: ["loading", true], expect: { icon: _G_SPINNER, tip: "loading", lit: false } },
  { fn: "videoButton", args: ["unavailable", true], expect: { icon: _G_VIDEO_OFF, tip: "note", lit: false } },
  { fn: "videoButton", args: ["constructor", true], expect: { icon: _G_VIDEO, tip: "show", lit: false } },

  // ---- outputRows ----
  { fn: "outputRows", args: [[{ name: "auto", label: "System default", current: false },
    { name: "pipewire/sink-1", label: "Speakers", current: true }]],
    expect: [{ name: "auto", label: "System default", current: false },
      { name: "pipewire/sink-1", label: "Speakers", current: true }] },
  // Only the three documented members are taken over, each with its type.
  { fn: "outputRows", args: [[{ name: "pipewire/sink-2", label: "", current: "yes", extra: 1 }]],
    expect: [{ name: "pipewire/sink-2", label: "pipewire/sink-2", current: false }] },
  { fn: "outputRows", args: [[{ name: "pipewire/sink-2", label: 7 }]],
    expect: [{ name: "pipewire/sink-2", label: "pipewire/sink-2", current: false }] },
  { fn: "outputRows", args: [[null, "auto", 5, {}, { name: "" }, { name: 3, label: "x" },
    { label: "No name" }]], expect: [] },
  { fn: "outputRows", args: [[]], expect: [] },
  { fn: "outputRows", args: [null], expect: [] },
  { fn: "outputRows", args: ["auto"], expect: [] },

  // ---- outputChoice ----
  { fn: "outputChoice", args: [""], expect: "System default" },
  { fn: "outputChoice", args: ["auto"], expect: "System default" },
  { fn: "outputChoice", args: ["pipewire/sink-1"], expect: "pipewire/sink-1" },
  { fn: "outputChoice", args: [null], expect: "System default" },
  { fn: "outputChoice", args: [7], expect: "System default" },

  // ---- gateCode ----
  { fn: "gateCode", args: ["ok"], expect: "" },
  { fn: "gateCode", args: ["config-errors"], expect: "E_HYPR_ERRORS" },
  { fn: "gateCode", args: ["version"], expect: "E_HYPR_VERSION" },
  { fn: "gateCode", args: ["no-hyprland"], expect: "E_HYPR_NONE" },
  { fn: "gateCode", args: [""], expect: "E_HYPR_NONE" },
  { fn: "gateCode", args: ["constructor"], expect: "E_HYPR_NONE" },
  { fn: "gateCode", args: [null], expect: "E_HYPR_NONE" },

  // ---- shortcutRows ----
  // Nothing assigned, a free key proposed: assign it, record another, or copy a line.
  { fn: "shortcutRows", args: [[_S_FREE], "ok", false],
    expect: [{ action: "panel", label: "Open panel", chip: "SUPER + CTRL + ALT + J",
      proposal: "SUPER + CTRL + ALT + J", line: "suggested", note: "", warn: false,
      copy: "SUPER + CTRL + ALT + J",
      buttons: [{ name: "assign", enabled: true }, { name: "change", enabled: true },
        { name: "copy", enabled: true }] }] },
  // No free key among the proposals: only recording one is left.
  { fn: "shortcutRows", args: [[_S_NONE_FREE], "ok", false],
    expect: [{ action: "panel", label: "Open panel", chip: "", proposal: "", line: "nofree", note: "",
      warn: false, copy: "",
      buttons: [{ name: "assign", enabled: false }, { name: "change", enabled: true },
        { name: "copy", enabled: false }] }] },
  // The key went to something else: the service says to what.
  { fn: "shortcutRows", args: [[_S_TAKEN_AWAY], "ok", false],
    expect: [{ action: "video", label: "Show or hide video", chip: "SUPER + ALT + V",
      proposal: "SUPER + ALT + V", line: "note", note: "Now used by: Some other thing", warn: false,
      copy: "SUPER + ALT + V",
      buttons: [{ name: "assign", enabled: true }, { name: "change", enabled: true },
        { name: "copy", enabled: true }] }] },
  { fn: "shortcutRows", args: [[_S_ASSIGNED], "ok", false],
    expect: [{ action: "video", label: "Show or hide video", chip: "SUPER + CTRL + ALT + V", proposal: "",
      line: "assigned", note: "", warn: false, copy: "SUPER + CTRL + ALT + V",
      buttons: [{ name: "unassign", enabled: true }, { name: "change", enabled: true }] }] },
  // The key that works is shown, and the sentence says what went wrong.
  { fn: "shortcutRows", args: [[_S_KEPT], "ok", false],
    expect: [{ action: "video", label: "Show or hide video", chip: "SUPER + CTRL + ALT + V", proposal: "",
      line: "note", note: "SUPER + ALT + V was not assigned. Now used by: Some other thing", warn: true,
      copy: "SUPER + CTRL + ALT + V",
      buttons: [{ name: "unassign", enabled: true }, { name: "change", enabled: true }] }] },
  { fn: "shortcutRows", args: [[_S_CONFIG], "ok", false],
    expect: [{ action: "output", label: "Next audio output", chip: "SUPER + F9", proposal: "",
      line: "config", note: "", warn: false, copy: "SUPER + F9",
      buttons: [{ name: "change", enabled: true }] }] },
  // It cannot be checked whether the wanted key is free.
  { fn: "shortcutRows", args: [[_S_BLOCKED], "ok", false],
    expect: [{ action: "output", label: "Next audio output", chip: "SUPER + ALT + O",
      proposal: "SUPER + CTRL + ALT + O", line: "note", note: "Cannot confirm that this key is free",
      warn: true, copy: "SUPER + ALT + O",
      buttons: [{ name: "change", enabled: true }, { name: "copy", enabled: true }] }] },
  { fn: "shortcutRows", args: [[_S_FAILED], "ok", false],
    expect: [{ action: "output", label: "Next audio output", chip: "", proposal: "", line: "failed",
      note: "", warn: true, copy: "",
      buttons: [{ name: "change", enabled: true }, { name: "copy", enabled: false }] }] },
  // While a check runs no button answers.
  { fn: "shortcutRows", args: [[_S_FREE], "ok", true],
    expect: [{ action: "panel", label: "Open panel", chip: "SUPER + CTRL + ALT + J",
      proposal: "SUPER + CTRL + ALT + J", line: "suggested", note: "", warn: false,
      copy: "SUPER + CTRL + ALT + J",
      buttons: [{ name: "assign", enabled: false }, { name: "change", enabled: false },
        { name: "copy", enabled: false }] }] },
  // Without a compositor that takes requests only the copied line is left.
  { fn: "shortcutRows", args: [[_S_FREE], "version", false],
    expect: [{ action: "panel", label: "Open panel", chip: "SUPER + CTRL + ALT + J",
      proposal: "SUPER + CTRL + ALT + J", line: "suggested", note: "", warn: false,
      copy: "SUPER + CTRL + ALT + J",
      buttons: [{ name: "assign", enabled: false }, { name: "change", enabled: false },
        { name: "copy", enabled: true }] }] },
  { fn: "shortcutRows", args: [[_S_ASSIGNED], "config-errors", false],
    expect: [{ action: "video", label: "Show or hide video", chip: "SUPER + CTRL + ALT + V", proposal: "",
      line: "assigned", note: "", warn: false, copy: "SUPER + CTRL + ALT + V",
      buttons: [{ name: "unassign", enabled: false }, { name: "change", enabled: false }] }] },
  { fn: "shortcutRows", args: [[_S_NONE_FREE], "no-hyprland", false],
    expect: [{ action: "panel", label: "Open panel", chip: "", proposal: "", line: "nofree", note: "",
      warn: false, copy: "",
      buttons: [{ name: "assign", enabled: false }, { name: "change", enabled: false },
        { name: "copy", enabled: false }] }] },
  // A status and a gate from elsewhere: unassigned, and nothing to assign with.
  { fn: "shortcutRows",
    args: [[{ action: "panel", status: "constructor", combo: 7, proposal: null }], "", 0],
    expect: [{ action: "panel", label: "panel", chip: "", proposal: "", line: "nofree", note: "",
      warn: false, copy: "",
      buttons: [{ name: "assign", enabled: false }, { name: "change", enabled: false },
        { name: "copy", enabled: false }] }] },
  { fn: "shortcutRows", args: [[null, "panel", 3, {}, { action: "" }, { action: 5 }], "ok", false],
    expect: [] },
  { fn: "shortcutRows", args: [[], "ok", false], expect: [] },
  { fn: "shortcutRows", args: [null, "ok", false], expect: [] },

  // ---- signInScreen ----
  { fn: "signInScreen", args: ["off", false], expect: "off" },
  { fn: "signInScreen", args: ["confirm", false], expect: "confirm" },
  { fn: "signInScreen", args: ["browser", false], expect: "browser" },
  { fn: "signInScreen", args: ["exporting", false], expect: "exporting" },
  { fn: "signInScreen", args: ["verifying", false], expect: "verifying" },
  { fn: "signInScreen", args: ["on", true], expect: "on" },
  { fn: "signInScreen", args: ["failed", false], expect: "failed" },
  // The login is still being deleted.
  { fn: "signInScreen", args: ["on", false], expect: "leaving" },
  // A login found at start counts whatever the stage says.
  { fn: "signInScreen", args: ["off", true], expect: "on" },
  { fn: "signInScreen", args: ["", true], expect: "on" },
  { fn: "signInScreen", args: ["failed", true], expect: "on" },
  // An attempt that is running is shown as running.
  { fn: "signInScreen", args: ["verifying", true], expect: "verifying" },
  { fn: "signInScreen", args: ["constructor", false], expect: "off" },
  { fn: "signInScreen", args: [null, null], expect: "off" },
  { fn: "signInScreen", args: ["on", 1], expect: "leaving" },

  // ---- signInButtons ----
  { fn: "signInButtons", args: ["off"], expect: ["begin"] },
  { fn: "signInButtons", args: ["confirm"], expect: ["open", "cancel"] },
  { fn: "signInButtons", args: ["browser"], expect: ["cancel"] },
  { fn: "signInButtons", args: ["exporting"], expect: ["cancel"] },
  { fn: "signInButtons", args: ["verifying"], expect: ["cancel"] },
  { fn: "signInButtons", args: ["on"], expect: ["signout"] },
  { fn: "signInButtons", args: ["failed"], expect: ["begin"] },
  { fn: "signInButtons", args: ["leaving"], expect: [] },
  { fn: "signInButtons", args: ["constructor"], expect: [] },
  { fn: "signInButtons", args: [null], expect: [] },
  // A login file on disk that nobody is signed in with can be deleted.
  { fn: "signInButtons", args: ["failed", true], expect: ["begin", "signout"] },
  { fn: "signInButtons", args: ["off", true], expect: ["begin", "signout"] },
  { fn: "signInButtons", args: ["failed", false], expect: ["begin"] },
  { fn: "signInButtons", args: ["off", false], expect: ["begin"] },
  { fn: "signInButtons", args: ["failed", 1], expect: ["begin"] },
  { fn: "signInButtons", args: ["failed", "true"], expect: ["begin"] },
  { fn: "signInButtons", args: ["on", true], expect: ["signout"] },
  { fn: "signInButtons", args: ["on", false], expect: ["signout"] },
  { fn: "signInButtons", args: ["confirm", true], expect: ["open", "cancel"] },
  { fn: "signInButtons", args: ["verifying", true], expect: ["cancel"] },
  { fn: "signInButtons", args: ["leaving", true], expect: [] },

  // ---- accountOffer ----
  { fn: "accountOffer", args: ["error", "E_NEEDS_ACCOUNT", true], expect: true },
  { fn: "accountOffer", args: ["error", "E_NEEDS_ACCOUNT", false], expect: false },
  { fn: "accountOffer", args: ["error", "E_NEEDS_ACCOUNT", 1], expect: false },
  { fn: "accountOffer", args: ["error", "E_NEEDS_ACCOUNT", null], expect: false },
  { fn: "accountOffer", args: ["error", "E_YT_REFUSED", true], expect: false },
  { fn: "accountOffer", args: ["error", "", true], expect: false },
  { fn: "accountOffer", args: ["playing", "E_NEEDS_ACCOUNT", true], expect: false },
  { fn: "accountOffer", args: ["resolving", "E_NEEDS_ACCOUNT", true], expect: false },
  { fn: "accountOffer", args: ["idle", "", true], expect: false },
  { fn: "accountOffer", args: [null, null, true], expect: false },

  // ---- rowTitle ----
  { fn: "rowTitle", args: [{ id: "AAAAAAAAAAA", title: "A title", channel: "C", duration: 9, live: false }],
    expect: "A title" },
  { fn: "rowTitle", args: [{ id: "AAAAAAAAAAA", title: "", channel: "", duration: null, live: true }],
    expect: "youtu.be/AAAAAAAAAAA" },
  { fn: "rowTitle", args: [{ id: "AAAAAAAAAAA" }], expect: "youtu.be/AAAAAAAAAAA" },
  { fn: "rowTitle", args: [{ id: "AAAAAAAAAAA", title: 7 }], expect: "youtu.be/AAAAAAAAAAA" },
  { fn: "rowTitle", args: [{ id: "", title: "Playlist of mine" }], expect: "Playlist of mine" },
  { fn: "rowTitle", args: [{ id: "", title: "" }], expect: "" },
  { fn: "rowTitle", args: [{ title: "No id" }], expect: "" },
  { fn: "rowTitle", args: [null], expect: "" },
  { fn: "rowTitle", args: ["AAAAAAAAAAA"], expect: "" },

  // ---- topNotice ----
  { fn: "topNotice", args: [false, false, false, false], expect: "" },
  { fn: "topNotice", args: [true, true, true, true], expect: "account" },
  { fn: "topNotice", args: [false, true, true, true], expect: "service" },
  { fn: "topNotice", args: [false, false, true, true], expect: "output" },
  { fn: "topNotice", args: [false, false, false, true], expect: "sponsor" },
  { fn: "topNotice", args: [true, false, false, false], expect: "account" },
  { fn: "topNotice", args: [false, true, false, true], expect: "service" },
  { fn: "topNotice", args: [false, true, false, false], expect: "service" },
  { fn: "topNotice", args: [false, false, true, false], expect: "output" },
  { fn: "topNotice", args: [1, "yes", {}, "true"], expect: "" },
  { fn: "topNotice", args: [null, null, null, null], expect: "" },
  // The question about shortcuts comes last of all.
  { fn: "topNotice", args: [false, false, false, false, true], expect: "shortcuts" },
  { fn: "topNotice", args: [false, false, false, true, true], expect: "sponsor" },
  { fn: "topNotice", args: [false, false, true, false, true], expect: "output" },
  { fn: "topNotice", args: [true, false, false, false, true], expect: "account" },
  { fn: "topNotice", args: [false, false, false, false, "true"], expect: "" },

  // ---- listHeight ----
  // Seven rows and room for them.
  { fn: "listHeight", args: [334, 94, 334, 608, 181], expect: 334 },
  // More rows than fit: seven are shown.
  { fn: "listHeight", args: [960, 94, 334, 608, 181], expect: 334 },
  // A notice took room: the list gives way, by exactly what is missing.
  { fn: "listHeight", args: [960, 94, 334, 608, 300], expect: 308 },
  { fn: "listHeight", args: [334, 94, 334, 608, 300.5], expect: 307 },
  // Few rows need no more than they are tall, but never under two rows.
  { fn: "listHeight", args: [142, 94, 334, 608, 300], expect: 142 },
  { fn: "listHeight", args: [46, 94, 334, 608, 181], expect: 94 },
  { fn: "listHeight", args: [0, 94, 334, 608, 181], expect: 94 },
  // No room at all: two rows stay, and the page scrolls.
  { fn: "listHeight", args: [960, 94, 334, 300, 280], expect: 94 },
  { fn: "listHeight", args: [960, 94, 334, 120, 400], expect: 94 },
  // The limit is not known: only the rows and the cap count.
  { fn: "listHeight", args: [960, 94, 334, 0, 181], expect: 334 },
  { fn: "listHeight", args: [142, 94, 334, 0, 9999], expect: 142 },
  { fn: "listHeight", args: [960, 94, 334, null, null], expect: 334 },
  { fn: "listHeight", args: [960, 94, 334, -5, 181], expect: 334 },
  { fn: "listHeight", args: [null, 94, 334, 608, 181], expect: 94 },

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
