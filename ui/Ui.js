.pragma library

// Everything the bar widget and the panel decide without looking at the
// screen: which action a key means, what the list area shows, how a
// duration reads, which rows the list holds. Also the wording that belongs
// to the view alone, the icon glyphs, and the view's own copy of the plugin
// version. Pure functions and constants only, so the same file runs under
// node, where every table below is tested.
//
// The view side imports nothing from lib/: the kept service pins its own
// modules across a plugin update, and a file shared with it would hand new
// view code an old module.

// Equals "version" in manifest.json and VERSION in lib/Const.js (the repo
// test checks). The widget and the panel compare it with the version of the
// running service: a difference means the plugin was updated and the shell
// not yet restarted, and the view then shows the restart notice and nothing
// else.
var VERSION = "0.1.0"

// ---- Glyphs ----

// Icons are glyphs of the bar font (a Nerd Font). They live above the basic
// plane, so each is written as its surrogate pair.
var GLYPH = {
  music: "\udb81\udf5a",        // U+F075A
  play: "\udb81\udc0a",         // U+F040A
  pause: "\udb80\udfe4",        // U+F03E4
  previous: "\udb81\udcae",     // U+F04AE
  next: "\udb81\udcad",         // U+F04AD
  cog: "\udb81\udc93",          // U+F0493
  chevronLeft: "\udb80\udd41",  // U+F0141
  closeCircle: "\udb80\udd59",  // U+F0159
  volumeHigh: "\udb81\udd7e",   // U+F057E
  volumeMute: "\udb81\udf5f",   // U+F075F
  spinner: "\udb82\udd96"       // U+F0996
}

// ---- Keys ----

// The Qt key and modifier numbers keyAction compares against. They are
// spelled out because node has no Qt object; a harness case checks them
// against Qt's own constants.
var KEY = {
  Escape: 0x01000000, Tab: 0x01000001, Backtab: 0x01000002, Backspace: 0x01000003,
  Return: 0x01000004, Enter: 0x01000005, Delete: 0x01000007,
  Up: 0x01000013, Down: 0x01000015, PageUp: 0x01000016, PageDown: 0x01000017,
  Space: 0x20, Slash: 0x2f
}

var MOD = { Shift: 0x02000000, Control: 0x04000000, Alt: 0x08000000, Meta: 0x10000000 }

// A key pressed together with one of these is a shortcut of something else
// (the text field's own editing keys, the compositor), never ours.
var _CHORD = MOD.Control | MOD.Alt | MOD.Meta

// Qt numbers every key that is not a character from here upwards.
var _FIRST_SPECIAL_KEY = 0x01000000

// ---- Limits and steps ----

// fieldChars equals LIMITS.refChars in lib/Const.js: the longest text the
// service accepts as a link.
var LIMITS = { fieldChars: 2048 }

// How far one step goes: rows for PageUp and PageDown, seconds for a wheel
// notch on the seek bar, volume points for a notch on the volume slider or
// on the bar icon.
var STEP = { page: 6, seek: 5, volume: 5 }

// ---- Texts ----

// Wording that belongs to the view. Every error sentence that has a code in
// the service comes from service.errorText(code) instead; the two E_ entries
// here are the ones the view must be able to show without a usable service.
var TEXT = {
  APP: "OmaJuke",
  E_NO_SERVICE: "OmaJuke needs the built-in Omarchy bar",
  E_STALE: "OmaJuke was updated. Restart the shell to finish updating",
  SEARCHING: "Searching…",
  NOTHING_FOUND: "Nothing found",
  LOADING: "Loading…",
  HOME_EMPTY: "Nothing played yet. Search above, or paste a YouTube link",
  SEARCH_HINT: "Search YouTube or paste a link",
  RECENT: "RECENTLY PLAYED",
  LIVE: "LIVE",
  SETTINGS: "Settings",
  BACK: "Back",
  DISMISS: "Dismiss",
  PROXY_CONTINUE: "Continue without a proxy",
  PREVIOUS: "Previous",
  PLAY: "Play",
  PAUSE: "Pause",
  NEXT: "Next",
  MUTE: "Mute",
  UNMUTE: "Unmute",
  REMEMBER_HISTORY: "Remember history",
  REMEMBER_HISTORY_HINT: "Keep recently played tracks on this computer between sessions.",
  EVEN_VOLUME: "Even out volume",
  EVEN_VOLUME_HINT: "Play quiet and loud tracks at a similar level.",
  CLEAR_HISTORY: "Clear history",
  CLEAR_HISTORY_ASK: "Clear recently played, the queue and search results?",
  CLEAR: "Clear",
  NO_MPRIS: "Media keys are unavailable: mpv-mpris is not installed"
}

// ---- Keyboard ----

function _move(action, ctx) {
  return ctx.rowCount > 0 ? action : "none"
}

// Enter on a row. Without a highlighted row there is nothing to activate
// yet: the first press shows the highlight, as the first arrow key does,
// and the next one acts on it.
function _activate(enqueue, ctx) {
  if (ctx.rowKind) return enqueue ? "enqueue" : "activate"
  return _move("down", ctx)
}

// Enter on the main page. While the field holds text that the list does not
// belong to, Enter searches for it; otherwise it acts on the list. The same
// query is never sent twice: while its search is still running, Enter waits.
function _enter(enqueue, typing, ctx) {
  if (!typing || !ctx.hasText) return _activate(enqueue, ctx)
  if (ctx.matches) return ctx.searching ? "none" : _activate(enqueue, ctx)
  return enqueue ? "submitEnqueue" : "submit"
}

// The one decision about a key press in the panel.
//
// key, modifiers: Qt values (KEY and MOD above hold the ones compared).
// typing: the search field has the keyboard.
// ctx: { page, dialogOpen, hasText, matches, searching, rowCount, rowKind }
//   page        "main" or the name of a sub-page
//   dialogOpen  a confirmation is open in front of the page
//   hasText     the search field is not empty
//   matches     the list already belongs to the field's text
//   searching   that search is still running
//   rowCount    rows the highlight can visit
//   rowKind     kind of the highlighted row, "" while nothing is highlighted
//
// Returns "" when the key is not ours (while typing, the text field then
// gets it), "none" when it is ours and there is nothing to do, or one of:
// "close", "back", "switchNext", "switchPrev", "down", "up", "pageDown",
// "pageUp", "activate", "enqueue", "submit", "submitEnqueue", "playPause",
// "focusField", "fieldBackspace", "fieldAppend".
function keyAction(key, modifiers, typing, ctx) {
  if (ctx === null || typeof ctx !== "object") return ""
  // The confirmation has already seen the key. Nothing behind it reacts.
  if (ctx.dialogOpen) return "none"
  var main = ctx.page === "main"
  if (key === KEY.Escape) return main ? "close" : "back"
  if ((modifiers & _CHORD) !== 0) return ""
  var shift = (modifiers & MOD.Shift) !== 0

  if (key === KEY.Backtab) return "switchPrev"
  if (key === KEY.Tab) return shift ? "switchPrev" : "switchNext"
  if (key === KEY.Down) return _move("down", ctx)
  if (key === KEY.Up) return _move("up", ctx)
  if (key === KEY.PageDown) return _move("pageDown", ctx)
  if (key === KEY.PageUp) return _move("pageUp", ctx)
  if (key === KEY.Return || key === KEY.Enter) {
    return main ? _enter(shift, typing, ctx) : _activate(false, ctx)
  }

  // Everything else belongs to the text field while it has the keyboard.
  if (typing) return ""
  if (!main) return key === KEY.Space ? _activate(false, ctx) : ""
  if (key === KEY.Space) return "playPause"
  if (key === KEY.Slash) return "focusField"
  if (key === KEY.Backspace) return "fieldBackspace"
  if (key > KEY.Space && key < _FIRST_SPECIAL_KEY && key !== 0x7f) return "fieldAppend"
  return ""
}

// The index nearest to i that names one of n rows, 0 when there are none.
function clampIndex(i, n) {
  if (typeof i !== "number" || !isFinite(i) || typeof n !== "number" || !(n > 0)) return 0
  return Math.max(0, Math.min(Math.floor(n) - 1, Math.floor(i)))
}

// True when text may be appended to the search field: at least one
// character and no control character. A key that produces no character
// (a dead key, a modifier) arrives as the empty text.
function printable(text) {
  return typeof text === "string" && text.length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(text)
}

// text without its last character. Both halves of a surrogate pair go
// together, so Backspace never leaves half a character in the field.
function dropLast(text) {
  if (typeof text !== "string" || text.length === 0) return ""
  var cut = /[\ud800-\udbff][\udc00-\udfff]$/.test(text) ? 2 : 1
  return text.slice(0, text.length - cut)
}

// ---- List ----

// One list row per usable track, in the order given. The track object is
// handed on as it is: it goes back to the service unchanged when the row is
// activated, and the service validates it again there.
function _trackRows(tracks, group, kind) {
  var out = []
  if (tracks === null || typeof tracks !== "object" || typeof tracks.length !== "number") return out
  for (var i = 0; i < tracks.length; i++) {
    var track = tracks[i]
    if (track === null || typeof track !== "object" || typeof track.id !== "string") continue
    out.push({ group: group, kind: kind, key: 0, track: track })
  }
  return out
}

// The rows of the main list as { group, kind, key, track }.
//
// mode "search": the search results, without a group heading. Any other
// mode is the home list: what was played recently. The queue arguments are
// part of the signature because upcoming queue items head the home list
// once the service has a queue to navigate; until then no queue row is
// produced, since activating one would call a function the service lacks.
function rows(mode, results, queue, queueIndex, recents) {
  if (mode === "search") return _trackRows(results, "", "result")
  return _trackRows(recents, TEXT.RECENT, "recent")
}

// What the list area shows, first match wins:
//   line  which status line: "link", "searching", "empty", "error", "home", or "" for none
//   list  whether the rows are shown
//   dim   whether they are shown dimmed (the previous results while a new search runs)
function listArea(linkNotice, searchState, rowCount) {
  if (linkNotice) return { line: "link", list: false, dim: false }
  if (searchState === "searching") return { line: "searching", list: true, dim: true }
  if (searchState === "empty") return { line: "empty", list: false, dim: false }
  if (searchState === "error") return { line: "error", list: false, dim: false }
  if (searchState === "results") return { line: "", list: true, dim: false }
  if (!(rowCount > 0)) return { line: "home", list: false, dim: false }
  return { line: "", list: true, dim: false }
}

// The local file of a thumbnail, or "" when there is none yet. thumbs is the
// service's table of video id to file path. Only an absolute path counts
// (one slash: two would start a host name), so whatever the table holds, an
// image never gets a network address.
function thumbPath(thumbs, id) {
  if (thumbs === null || typeof thumbs !== "object" || typeof id !== "string") return ""
  if (!Object.prototype.hasOwnProperty.call(thumbs, id)) return ""
  var path = thumbs[id]
  if (typeof path !== "string" || path.charAt(0) !== "/" || path.charAt(1) === "/") return ""
  return path
}

// ---- Formatting ----

// Seconds as m:ss, or h:mm:ss from one hour on. "" for an unknown length.
function duration(seconds) {
  if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return ""
  var total = Math.floor(seconds)
  var hours = Math.floor(total / 3600)
  var minutes = Math.floor((total % 3600) / 60)
  var tail = ":" + String(total % 60).padStart(2, "0")
  if (hours === 0) return minutes + tail
  return hours + ":" + String(minutes).padStart(2, "0") + tail
}

// ---- Bar icon ----

var _ICON_ACTIVE = ["playing", "buffering", "resolving", "loading"]

// How the bar icon looks: accent while something plays or is about to,
// dimmed while paused and whenever there is no usable service.
function barIcon(live, playbackState) {
  if (!live) return { active: false, dimmed: true }
  return { active: _ICON_ACTIVE.indexOf(playbackState) !== -1, dimmed: playbackState === "paused" }
}

if (typeof module !== "undefined") {
  module.exports = {
    VERSION: VERSION,
    GLYPH: GLYPH,
    KEY: KEY,
    MOD: MOD,
    LIMITS: LIMITS,
    STEP: STEP,
    TEXT: TEXT,
    keyAction: keyAction,
    clampIndex: clampIndex,
    printable: printable,
    dropLast: dropLast,
    rows: rows,
    listArea: listArea,
    thumbPath: thumbPath,
    duration: duration,
    barIcon: barIcon
  }
}
