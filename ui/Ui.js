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
var VERSION = "0.2.2"

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
  spinner: "\udb82\udd96",      // U+F0996
  queue: "\udb81\udc11",        // U+F0411
  queueAdd: "\udb81\udc12",     // U+F0412
  close: "\udb80\udd56",        // U+F0156
  check: "\udb80\udd2c",        // U+F012C
  video: "\udb81\udd67",        // U+F0567
  videoOff: "\udb81\udd68",     // U+F0568
  speaker: "\udb81\udcc3",      // U+F04C3
  topLeft: "\udb80\udc5b",      // U+F005B
  topRight: "\udb80\udc5c",     // U+F005C
  bottomLeft: "\udb80\udc42",   // U+F0042
  bottomRight: "\udb80\udc43"   // U+F0043
}

// ---- Keys ----

// The Qt key and modifier numbers keyAction compares against. They are
// spelled out because node has no Qt object; a harness case checks them
// against Qt's own constants. X is the letter that removes a queue row.
var KEY = {
  Escape: 0x01000000, Tab: 0x01000001, Backtab: 0x01000002, Backspace: 0x01000003,
  Return: 0x01000004, Enter: 0x01000005, Delete: 0x01000007,
  Left: 0x01000012, Up: 0x01000013, Right: 0x01000014, Down: 0x01000015,
  PageUp: 0x01000016, PageDown: 0x01000017,
  Space: 0x20, Slash: 0x2f, X: 0x58
}

var MOD = { Shift: 0x02000000, Control: 0x04000000, Alt: 0x08000000, Meta: 0x10000000 }

// A key pressed together with one of these is a shortcut of something else
// (the text field's own editing keys, the compositor), never ours.
var _CHORD = MOD.Control | MOD.Alt | MOD.Meta

// Qt numbers every key that is not a character from here upwards.
var _FIRST_SPECIAL_KEY = 0x01000000

// The keys that are only ever held down with another one: Shift, Control,
// Meta, Alt, the three locks, both Super and both Hyper keys, AltGr. A
// shortcut is recorded when the key after them arrives.
var _HELD_KEYS = [
  0x01000020, 0x01000021, 0x01000022, 0x01000023, 0x01000024, 0x01000025, 0x01000026,
  0x01000053, 0x01000054, 0x01000056, 0x01000057, 0x01001103
]

// What Qt reports for a key it has no name for.
var _UNKNOWN_KEY = 0x01ffffff

// ---- Limits and steps ----

// fieldChars equals LIMITS.refChars in lib/Const.js: the longest text the
// service accepts as a link.
var LIMITS = { fieldChars: 2048 }

// How far one step goes: rows for PageUp and PageDown, seconds for a wheel
// notch on the seek bar, volume points for a notch on the volume slider or
// on the bar icon.
var STEP = { page: 6, seek: 5, volume: 5 }

// For how many seconds of playing time the strip says that a sponsor
// segment was skipped.
var _SKIP_NOTE_SEC = 8

// More shortcut rows or feed rows than these are not shown: the service
// sends three and fifty.
var _MAX_SHORTCUTS = 8
var _MAX_FEED_ROWS = 200

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
  QUEUE: "QUEUE",
  LIVE: "LIVE",
  LINK: "youtu.be/",
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
  QUEUE_TITLE: "Queue",
  QUEUE_EMPTY: "Queue is empty",
  QUEUE_ADD: "Add to queue",
  QUEUE_REMOVE: "Remove from queue",
  QUEUE_CLEAR: "Clear queue",
  QUEUE_CLEAR_ASK: "Remove every track from the queue?",
  VIDEO_SHOW: "Show video",
  VIDEO_HIDE: "Hide video",
  VIDEO_LOADING: "Loading video…",
  OUTPUTS_TITLE: "Audio output",
  OUTPUTS_IDLE: "Outputs are available while something is playing",
  OUTPUT_DEFAULT: "System default",
  OUTPUT_SAVED: "Saved choice",
  OUTPUT_CHOOSE: "Choose output",
  PLAYBACK: "PLAYBACK",
  VIDEO: "VIDEO",
  HISTORY: "HISTORY",
  AUTOPLAY: "Autoplay",
  AUTOPLAY_HINT: "Keep playing related tracks when the queue ends.",
  PRELOAD: "Start faster",
  PRELOAD_HINT: "Prepare the highlighted result before you press Enter. YouTube sees a lookup for the top"
    + " result of each search and for any result you rest on.",
  EVEN_VOLUME: "Even out volume",
  EVEN_VOLUME_HINT: "Play quiet and loud tracks at a similar level.",
  MAX_HEIGHT: "Video quality",
  MAX_HEIGHT_HINT: "The highest resolution the video window asks for.",
  VIDEO_SIZE: "Video size",
  VIDEO_SIZE_HINT: "Width of the video window, as a share of the screen.",
  VIDEO_CORNER: "Video corner",
  VIDEO_CORNER_HINT: "Where the video window appears.",
  TOP_LEFT: "Top left",
  TOP_RIGHT: "Top right",
  BOTTOM_LEFT: "Bottom left",
  BOTTOM_RIGHT: "Bottom right",
  VIDEO_RESET: "Reset video position",
  KEEP_AWAKE: "Keep the screen awake",
  KEEP_AWAKE_HINT: "While video is visible and playing.",
  REMEMBER_HISTORY: "Remember history",
  REMEMBER_HISTORY_HINT: "Keep recently played tracks on this computer between sessions.",
  CLEAR_HISTORY: "Clear history",
  CLEAR_HISTORY_ASK: "Clear recently played, the queue and search results?",
  CLEAR: "Clear",
  NO_MPRIS: "Media keys are unavailable: mpv-mpris is not installed",
  CANCEL: "Cancel",
  SPONSOR_ASK: "Skip sponsor segments? Looks up a hash prefix of the video id at sponsor.ajay.app.",
  SPONSOR_ENABLE: "Enable",
  SPONSOR_DECLINE: "No thanks",
  SPONSOR_SKIP: "Skip sponsor segments",
  SPONSOR_SKIP_HINT: "Looks up a hash prefix of the video id at sponsor.ajay.app.",
  SKIPPED: "Skipped sponsor segment",
  SHORTCUTS: "SHORTCUTS",
  SHORTCUTS_TITLE: "Shortcuts",
  SHORTCUTS_OPEN: "Shortcuts…",
  SHORTCUTS_INTRO: "A shortcut works from anywhere on the desktop. OmaJuke only takes a key that nothing"
    + " else uses, and none until you press Assign.",
  SHORTCUTS_BUSY: "Checking keys…",
  SHORTCUTS_EMPTY: "No shortcuts to show yet",
  SHORTCUT_ASSIGN: "Assign",
  SHORTCUT_UNASSIGN: "Unassign",
  SHORTCUT_CHANGE: "Change…",
  SHORTCUT_COPY: "Copy line",
  SHORTCUT_COPY_TIP: "Copy a line for your bindings.lua",
  SHORTCUT_COPIED: "Copied. Paste the line into your bindings.lua",
  SHORTCUT_NOT_COPIED: "The line could not be copied",
  SHORTCUT_ASSIGNED: "Assigned",
  SHORTCUT_SUGGESTED: "Not assigned. This key is free",
  SHORTCUT_NONE_FREE: "Not assigned. No free key to suggest",
  SHORTCUT_CONFIG: "Set in your bindings.lua",
  SHORTCUT_BLOCKED: "Cannot confirm that this key is free",
  SHORTCUT_FAILED: "That key could not be assigned",
  USE_COPY_LINE: "Use Copy line",
  CAPTURE_PROMPT: "Press the new shortcut. Esc cancels",
  CAPTURE_WAITING: "Waiting for the keyboard. Esc cancels",
  CAPTURE_INVALID: "Hold Super, Ctrl or Alt and press a letter or F1 to F12. Esc cancels",
  ACCOUNT: "YOUTUBE ACCOUNT",
  SIGNIN_TITLE: "YouTube account",
  SIGNIN_OPEN: "Sign in to YouTube…",
  SIGNOUT_OPEN: "Sign out…",
  SIGNIN_WHAT: "OmaJuke opens your browser on a new, empty profile. You sign in to YouTube there and close"
    + " the window. OmaJuke then keeps the YouTube login of that window and deletes the rest of the"
    + " profile. It never sees your password.",
  SIGNIN_USE: "The login is used for your lists (For you, Subscriptions, Watch later, Playlists, History)"
    + " and, if you switch that on, for adding plays to your history. Searching and playing stay signed"
    + " out. When a video needs an account, OmaJuke asks before it plays that one video with your login.",
  SIGNIN_WHERE: "The login is saved as cookies.txt in OmaJuke's data folder (normally"
    + " ~/.local/share/omajuke), readable only by your user. Anything that can read that file can use"
    + " your YouTube account.",
  SIGNIN_RISK: "YouTube does not offer this kind of access. An account used this way may be restricted"
    + " or blocked by YouTube. Consider a separate account.",
  SIGNIN_CONTINUE: "Continue",
  SIGNIN_BROWSER: "Browser",
  SIGNIN_FINDING: "Looking for your browser…",
  SIGNIN_OPEN_BROWSER: "Open browser",
  SIGNIN_IN_BROWSER: "Sign in to YouTube in the browser window that opened, then close that window. It"
    + " closes by itself after 15 minutes",
  SIGNIN_EXPORTING: "Saving the login…",
  SIGNIN_VERIFYING: "Checking the login with YouTube…",
  SIGNIN_ON: "Signed in to YouTube",
  SIGNIN_FAILED: "Sign-in did not finish",
  SIGNIN_RETRY: "Try again",
  SIGNOUT: "Sign out",
  SIGNOUT_ASK: "Sign out and delete the saved login?",
  SIGNOUT_NOTE: "Signing out deletes the saved login from this computer. The session still exists at"
    + " Google until you remove it under Google Account › Security › Your devices. A deleted file is not"
    + " securely erased from the disk.",
  SIGNING_OUT: "Signing out…",
  SIGNED_OUT: "Signed out. The session still exists at Google until you remove it under Google Account ›"
    + " Security › Your devices",
  MARK_WATCHED: "Add plays to YouTube history",
  MARK_WATCHED_HINT: "Tell YouTube when a track has played for 30 seconds, so that it appears in your"
    + " watch history.",
  ACCOUNT_ASK: "OmaJuke can look it up once with your YouTube login. YouTube then sees your account ask"
    + " for this video.",
  ACCOUNT_PLAY: "Play with my account",
  FEED_HOME: "Home",
  FEED_FORYOU: "For you",
  FEED_SUBS: "Subscriptions",
  FEED_LATER: "Watch later",
  FEED_PLAYLISTS: "Playlists",
  FEED_HISTORY: "History",
  FEED_EMPTY: "Nothing here yet",
  PLAYLIST: "Playlist",
  ONE_VIDEO: "1 video",
  VIDEOS: "videos"
}

// ---- Pages and choices ----

// The pages of the panel. "main" is the one a panel opens on; the others
// are reached from it and have a header with a way back.
var PAGES = ["main", "settings", "queue", "outputs", "shortcuts", "signin"]

var _PAGE_TITLES = [
  "", TEXT.SETTINGS, TEXT.QUEUE_TITLE, TEXT.OUTPUTS_TITLE, TEXT.SHORTCUTS_TITLE, TEXT.SIGNIN_TITLE
]

// The heading of a page, "" for the main page and for a name that is none.
function pageTitle(page) {
  var at = PAGES.indexOf(page)
  return at === -1 ? "" : _PAGE_TITLES[at]
}

// The pages that are reached from the settings page rather than from the
// main one. Going back from them returns there.
var _UNDER_SETTINGS = ["shortcuts", "signin"]

// The page that Esc and the back button of a page lead to: "main" for the
// main page itself and for a name that is none.
function parentPage(page) {
  return _UNDER_SETTINGS.indexOf(page) !== -1 ? "settings" : "main"
}

// The settings that are one of a few values, each with the chips it is
// picked from: value is what the service stores (as text; the row turns
// maxHeight back into a number), label and icon what the chip shows. The
// corners are drawn as arrows, because four worded chips do not fit the
// width of the panel.
var CHOICES = {
  maxHeight: [
    { value: "480", label: "480p" }, { value: "720", label: "720p" }, { value: "1080", label: "1080p" }
  ],
  videoSize: [
    { value: "sixth", label: "1/6" }, { value: "quarter", label: "1/4" },
    { value: "third", label: "1/3" }, { value: "half", label: "1/2" }
  ],
  videoCorner: [
    { value: "top-left", label: "", icon: GLYPH.topLeft, tooltip: TEXT.TOP_LEFT },
    { value: "top-right", label: "", icon: GLYPH.topRight, tooltip: TEXT.TOP_RIGHT },
    { value: "bottom-left", label: "", icon: GLYPH.bottomLeft, tooltip: TEXT.BOTTOM_LEFT },
    { value: "bottom-right", label: "", icon: GLYPH.bottomRight, tooltip: TEXT.BOTTOM_RIGHT }
  ]
}

// The lists a signed-in main page can show in place of the home list, as
// the chips that select them: value is the kind the service knows, "" for
// the home list itself.
var FEEDS = [
  { value: "", label: TEXT.FEED_HOME }, { value: "foryou", label: TEXT.FEED_FORYOU },
  { value: "subs", label: TEXT.FEED_SUBS }, { value: "later", label: TEXT.FEED_LATER },
  { value: "playlists", label: TEXT.FEED_PLAYLISTS }, { value: "history", label: TEXT.FEED_HISTORY }
]

// The value delta chips away from value in options. At either end it stays
// where it is, or with wrap true starts again at the other end. A value
// that is none of the options counts as the first.
function stepChoice(options, value, delta, wrap) {
  if (!_isList(options) || options.length === 0) return ""
  var at = 0
  for (var i = 0; i < options.length; i++) {
    if (options[i] !== null && typeof options[i] === "object" && options[i].value === value) at = i
  }
  var step = typeof delta === "number" && isFinite(delta) ? Math.floor(delta) : 0
  var to = at + step
  var count = options.length
  if (wrap === true) to = ((to % count) + count) % count
  else to = Math.max(0, Math.min(count - 1, to))
  var option = options[to]
  return option !== null && typeof option === "object" && typeof option.value === "string" ? option.value : ""
}

// ---- Keyboard ----

function _move(action, ctx) {
  return ctx.rowCount > 0 ? action : "none"
}

// Enter on a row. Without a highlighted row there is nothing to activate
// yet: the first press shows the highlight, as the first arrow key does,
// and the next one acts on it. The button of a notice is pressed by Enter
// alone: there is nothing to queue about it, nor about the row of feed
// chips, the buttons of the now-playing strip or a playlist in a list.
var _NOT_QUEUED = ["action", "chips", "controls", "list"]

// The places of the main page that are several buttons side by side, where
// Left and Right pick one: the feed chips and the now-playing strip.
var _BUTTON_ROWS = ["chips", "controls"]

// How many of the places are buttons that are always there (the settings
// button, the now-playing strip). The arrows reach them. Enter does not
// put the highlight on one by itself: where nothing else can be
// highlighted, Enter in the search field stays what it was, nothing.
function _fixed(ctx) {
  return typeof ctx.fixed === "number" && ctx.fixed > 0 ? Math.floor(ctx.fixed) : 0
}

function _activate(enqueue, ctx) {
  if (_NOT_QUEUED.indexOf(ctx.rowKind) !== -1) return enqueue ? "none" : "activate"
  if (ctx.rowKind) return enqueue ? "enqueue" : "activate"
  return ctx.rowCount > _fixed(ctx) ? "down" : "none"
}

// Enter on the main page. While the field holds text that the list does not
// belong to, Enter searches for it; otherwise it acts on the list. The same
// query is never sent twice: while its search is still running, Enter waits.
function _enter(enqueue, typing, ctx) {
  if (!typing || !ctx.hasText) return _activate(enqueue, ctx)
  if (ctx.matches) return ctx.searching ? "none" : _activate(enqueue, ctx)
  return enqueue ? "submitEnqueue" : "submit"
}

// The rows of a sub-page on which Left and Right mean something: a row
// that is a choice (the neighbouring value) and a shortcut row (the
// neighbouring button). On the main page it is the row of feed chips (the
// neighbouring chip) and the now-playing strip (the neighbouring button).
var _SIDEWAYS = ["choice", "shortcut"]

function _sideways(key, here) {
  if (!here) return ""
  return key === KEY.Left ? "left" : "right"
}

// The keys a sub-page has beyond the arrows and Enter. Left and Right step
// sideways on the rows that have a sideways; x and Delete remove a row of
// the queue.
function _subPage(key, ctx) {
  if (key === KEY.Space) return _activate(false, ctx)
  if (key === KEY.Left || key === KEY.Right) return _sideways(key, _SIDEWAYS.indexOf(ctx.rowKind) !== -1)
  if (key === KEY.Delete || key === KEY.X) return ctx.rowKind === "queue" ? "remove" : ""
  return ""
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
//   rowCount    places the highlight can visit: rows, and buttons of notices
//   fixed       how many of them are buttons that are always on the page
//               (optional, 0 when left out)
//   rowKind     kind of the highlighted place, "" while nothing is
//               highlighted: "result", "recent", "queue", "feed" (a video
//               of a signed-in list), "list" (a playlist in one),
//               "setting", "choice", "output", "shortcut", "action" for
//               a single button (of a notice, or the settings button),
//               "chips" for the row of feed chips, "controls" for the
//               buttons of the now-playing strip
//
// Returns "" when the key is not ours (while typing, the text field then
// gets it), "none" when it is ours and there is nothing to do, or one of:
// "close", "back", "switchNext", "switchPrev", "down", "up", "pageDown",
// "pageUp", "activate", "enqueue", "submit", "submitEnqueue", "playPause",
// "focusField", "fieldBackspace", "fieldAppend", "left", "right", and on
// sub-pages "remove", "moveUp", "moveDown".
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
  // On a sub-page Shift carries a row of the queue along with the arrow.
  var carry = !main && shift && ctx.rowKind === "queue"
  if (key === KEY.Down) return carry ? "moveDown" : _move("down", ctx)
  if (key === KEY.Up) return carry ? "moveUp" : _move("up", ctx)
  if (key === KEY.PageDown) return _move("pageDown", ctx)
  if (key === KEY.PageUp) return _move("pageUp", ctx)
  if (key === KEY.Return || key === KEY.Enter) {
    return main ? _enter(shift, typing, ctx) : _activate(false, ctx)
  }

  // Everything else belongs to the text field while it has the keyboard.
  if (typing) return ""
  if (!main) return _subPage(key, ctx)
  if (key === KEY.Left || key === KEY.Right) return _sideways(key, _BUTTON_ROWS.indexOf(ctx.rowKind) !== -1)
  if (key === KEY.Space) return "playPause"
  if (key === KEY.Slash) return "focusField"
  if (key === KEY.Backspace) return "fieldBackspace"
  if (key > KEY.Space && key < _FIRST_SPECIAL_KEY && key !== 0x7f) return "fieldAppend"
  return ""
}

// The kind of a place of the main page that is not a row of its list,
// from the name the page lists it under: "chips" and "controls" are rows
// of buttons with a sideways, anything else is one button.
function placeKind(name) {
  if (name === "feeds") return "chips"
  if (name === "controls") return "controls"
  return "action"
}

// The buttons of the now-playing strip that the cursor can stand on, left
// to right, and the one it starts on.
var CONTROLS = ["previous", "playPause", "next", "mute", "video", "outputs", "queue"]
var CONTROL_HOME = 1

// Where the highlight on those buttons is after Left (delta -1) or Right
// (delta 1) from index. usable says for each button whether it can be
// pressed now: one that cannot is stepped over, and with none left in that
// direction the highlight stays. An index that is no button, or one that
// cannot be pressed, answers with the button the highlight starts on.
function stepControl(index, delta, usable) {
  var can = function(i) { return _isList(usable) && usable[i] === true }
  if (typeof index !== "number" || index < 0 || index >= CONTROLS.length || Math.floor(index) !== index
    || !can(index)) {
    return CONTROL_HOME
  }
  var step = delta < 0 ? -1 : (delta > 0 ? 1 : 0)
  if (step === 0) return index
  for (var i = index + step; i >= 0 && i < CONTROLS.length; i += step) {
    if (can(i)) return i
  }
  return index
}

// What a key press means to the box that records a shortcut:
//   "cancel"  Esc on its own: recording is given up
//   "wait"    nothing yet: a key that repeats while held, a key that is
//             only held with others, or the compositor has not confirmed
//             that its own shortcuts are off (armed false), in which case
//             the keys pressed could have triggered one and are not taken
//   "take"    this key with these modifiers is the candidate
// Esc cancels whether armed or not, so the box can always be left.
function captureStep(key, modifiers, autoRepeat, armed) {
  if (typeof key !== "number" || typeof modifiers !== "number") return "wait"
  if (autoRepeat === true) return "wait"
  if (key === KEY.Escape && (modifiers & (_CHORD | MOD.Shift)) === 0) return "cancel"
  if (armed !== true) return "wait"
  if (key <= 0 || key === _UNKNOWN_KEY || _HELD_KEYS.indexOf(key) !== -1) return "wait"
  return "take"
}

// The index nearest to i that names one of n rows, 0 when there are none.
function clampIndex(i, n) {
  if (typeof i !== "number" || !isFinite(i) || typeof n !== "number" || !(n > 0)) return 0
  return Math.max(0, Math.min(Math.floor(n) - 1, Math.floor(i)))
}

// Where the highlight is after an arrow key moved it by delta.
//
// at: { active, index, action }
//   active  a row is highlighted
//   index   which row that is, or would be
//   action  which button of a notice is highlighted instead, -1 for none
// rows: rows of the page; actions: buttons of the notices above them.
//
// The buttons lie above the rows: Up from the first row reaches the last
// button, Down from the last button returns to the row the highlight left.
// The first press only shows the highlight where it is, on a row whenever
// there is one, so a button is never one hasty key press away.
//
// fixed (optional): the first so many of the buttons are always on the
// page. Without rows the first Down shows the highlight on the first
// button behind them, the one a notice brought, when there is one.
function moveCursor(at, delta, rows, actions, fixed) {
  var here = at !== null && typeof at === "object" ? at : {}
  var rowCount = typeof rows === "number" && rows > 0 ? Math.floor(rows) : 0
  var actionCount = typeof actions === "number" && actions > 0 ? Math.floor(actions) : 0
  var step = typeof delta === "number" && isFinite(delta) ? Math.floor(delta) : 0
  var index = clampIndex(here.index, rowCount)
  var action = typeof here.action === "number" && here.action >= 0 && here.action < actionCount
    ? Math.floor(here.action) : -1

  if (action !== -1) {
    var target = action + step
    if (target >= actionCount && rowCount > 0) return { active: true, index: index, action: -1 }
    return { active: false, index: index, action: Math.max(0, Math.min(actionCount - 1, target)) }
  }
  if (here.active !== true || rowCount === 0) {
    if (rowCount > 0) return { active: true, index: index, action: -1 }
    var lead = typeof fixed === "number" && fixed > 0 && fixed < actionCount ? Math.floor(fixed) : 0
    if (actionCount > 0) return { active: false, index: index, action: step < 0 ? actionCount - 1 : lead }
    return { active: false, index: index, action: -1 }
  }
  if (step < 0 && index === 0 && actionCount > 0) return { active: false, index: 0, action: actionCount - 1 }
  return { active: true, index: clampIndex(index + step, rowCount), action: -1 }
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

function _isList(value) {
  return value !== null && typeof value === "object" && typeof value.length === "number"
}

function _isTrack(value) {
  return value !== null && typeof value === "object" && typeof value.id === "string"
}

// One list row per usable track, in the order given. The track object is
// handed on as it is: it goes back to the service unchanged when the row is
// activated, and the service validates it again there.
function _trackRows(tracks, group, kind) {
  var out = []
  if (!_isList(tracks)) return out
  for (var i = 0; i < tracks.length; i++) {
    if (_isTrack(tracks[i])) out.push({ group: group, kind: kind, key: 0, track: tracks[i] })
  }
  return out
}

// One row per queue item from position `from` on. A queue row is played,
// removed and moved by its key, the number the service gave that insertion,
// so an item without one gets no row.
function _queueRows(queue, from, group) {
  var out = []
  if (!_isList(queue)) return out
  for (var i = from; i < queue.length; i++) {
    var item = queue[i]
    if (!_isTrack(item) || typeof item.key !== "number" || !(item.key > 0)) continue
    if (item.key !== Math.floor(item.key)) continue
    out.push({ group: group, kind: "queue", key: item.key, track: item })
  }
  return out
}

// The rows of a list as { group, kind, key, track }.
//
// mode "search": the search results, without a group heading.
// mode "queue": the whole queue, for the queue page.
// Any other mode is the home list: what is queued after the current track,
// then what was played recently. Without a current track (queueIndex -1)
// the whole queue is still to come.
function rows(mode, results, queue, queueIndex, recents) {
  if (mode === "search") return _trackRows(results, "", "result")
  if (mode === "queue") return _queueRows(queue, 0, "")
  var current = typeof queueIndex === "number" && queueIndex >= 0 && isFinite(queueIndex)
    ? Math.floor(queueIndex) : -1
  return _queueRows(queue, current + 1, TEXT.QUEUE).concat(_trackRows(recents, TEXT.RECENT, "recent"))
}

function _wholeKey(value) {
  return typeof value === "number" && value > 0 && value === Math.floor(value) && isFinite(value)
}

// What the second line of a playlist row says: that it is one, and how
// many videos it holds when the service knows.
function _playlistLine(count) {
  if (typeof count !== "number" || !isFinite(count) || count < 0) return TEXT.PLAYLIST
  var whole = Math.floor(count)
  return TEXT.PLAYLIST + ", " + (whole === 1 ? TEXT.ONE_VIDEO : whole + " " + TEXT.VIDEOS)
}

// The rows of a signed-in list as { group, kind, key, track }. A video
// (kind "feed") hands the service's own object on, like every track row. A
// playlist (kind "list") is opened, never played or queued, so its track is
// only what the row shows: the title, and in place of a channel what it is.
// Both are opened by key, the number the service gave the row.
function feedRows(rows) {
  var out = []
  if (!_isList(rows)) return out
  for (var i = 0; i < rows.length && out.length < _MAX_FEED_ROWS; i++) {
    var entry = rows[i]
    if (entry === null || typeof entry !== "object" || !_wholeKey(entry.key)) continue
    if (entry.playlist === true) {
      if (typeof entry.title !== "string") continue
      out.push({
        group: "", kind: "list", key: entry.key,
        track: {
          id: "", title: entry.title, channel: _playlistLine(entry.count), duration: null, live: false
        }
      })
    } else if (_isTrack(entry)) {
      out.push({ group: "", kind: "feed", key: entry.key, track: entry })
    }
  }
  return out
}

// The position of the row with this key, -1 when there is none.
function indexOfKey(list, key) {
  if (!_isList(list) || typeof key !== "number" || !(key > 0)) return -1
  for (var i = 0; i < list.length; i++) {
    if (list[i] !== null && typeof list[i] === "object" && list[i].key === key) return i
  }
  return -1
}

// What the list area shows, first match wins:
//   line  which status line: "link", "searching", "empty", "error", "home",
//         "feedLoading", "feedError", "feedEmpty", or "" for none
//   list  whether the rows are shown
//   dim   whether they are shown dimmed (the previous results while a new search runs)
// feedState is the state of the signed-in list that stands in for the home
// list, and "" (or left out) while the home list itself is shown. A search
// comes before either.
function listArea(linkNotice, searchState, rowCount, feedState) {
  if (linkNotice) return { line: "link", list: false, dim: false }
  if (searchState === "searching") return { line: "searching", list: true, dim: true }
  if (searchState === "empty") return { line: "empty", list: false, dim: false }
  if (searchState === "error") return { line: "error", list: false, dim: false }
  if (searchState === "results") return { line: "", list: true, dim: false }
  var feed = typeof feedState === "string" && feedState !== ""
  if (feed && feedState === "loading") return { line: "feedLoading", list: false, dim: false }
  if (feed && feedState === "error") return { line: "feedError", list: false, dim: false }
  if (!(rowCount > 0)) return { line: feed ? "feedEmpty" : "home", list: false, dim: false }
  return { line: "", list: true, dim: false }
}

// What a row shows as the title of a track. A track that was queued from a
// link has no title until it is looked up, which happens when its turn
// comes: until then the row names the link.
function rowTitle(track) {
  if (!_isTrack(track)) return ""
  if (typeof track.title === "string" && track.title !== "") return track.title
  return track.id !== "" ? TEXT.LINK + track.id : ""
}

// Which notice the main page shows, "" for none. Only one shows at a time,
// so that the list and the now-playing strip keep their room; the next one
// appears when this one is answered or its reason is gone. First comes what
// waits for a decision about the track that just failed ("account"), then
// what the service has to tell ("service"), then that the chosen output is
// gone ("output"), and last the question that can wait ("sponsor").
function topNotice(account, service, output, sponsor) {
  if (account === true) return "account"
  if (service === true) return "service"
  if (output === true) return "output"
  return sponsor === true ? "sponsor" : ""
}

// How tall the main page's list is: as tall as its rows (content), at
// least `least` and at most `most`, and no taller than what the card has
// left for it. limit is the tallest the page can be (0 when that is not
// known) and around is what everything else on the page takes. The list is
// the part that gives way: the now-playing strip under it is never cut.
function listHeight(content, least, most, limit, around) {
  var number = function(value) { return typeof value === "number" && isFinite(value) ? value : 0 }
  var room = number(limit) > 0 ? Math.floor(number(limit) - number(around)) : number(most)
  return Math.max(number(least), Math.min(number(content), number(most), room))
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

// ---- Now playing ----

var _STARTING = ["resolving", "loading"]

// What the second line of the now-playing strip says, first match wins:
// "error" the reason the track failed, "loading" the track is on its way,
// "video" its picture is, "novideo" why there is no picture, "skip" a
// sponsor segment was just skipped (skipped true), else "channel". There
// is a why when the window stands open to no picture ("unavailable"), and
// when a reason is known although no window was opened at all (noted true:
// the compositor could not be asked for one).
function stripLine(playbackState, videoState, skipped, noted) {
  if (playbackState === "error") return "error"
  if (_STARTING.indexOf(playbackState) !== -1) return "loading"
  if (videoState === "loading") return "video"
  if (videoState === "unavailable" || (videoState === "hidden" && noted === true)) return "novideo"
  if (skipped === true) return "skip"
  return "channel"
}

// True while the playback position is just behind the end of the last
// skipped segment ({ category, from, to } or null). The note about a skip
// thereby goes away by itself as the track plays on, without a clock here.
function recentSkip(lastSkip, position) {
  if (lastSkip === null || typeof lastSkip !== "object") return false
  var to = lastSkip.to
  if (typeof to !== "number" || !isFinite(to) || typeof position !== "number" || !isFinite(position)) {
    return false
  }
  return position >= to - 1 && position < to + _SKIP_NOTE_SEC
}

// How the video button looks in each state of the video window:
//   icon  its glyph
//   tip   which tooltip: "show", "hide", "loading", or "note" for the
//         service's sentence about why there is no picture
//   lit   whether it is drawn in the accent colour (the window is open)
// noted says that the service gave a reason although the window is closed:
// a showing was refused, and the tooltip says why instead of offering it.
// A state this version does not know looks like a closed window.
function videoButton(videoState, noted) {
  if (videoState === "shown") return { icon: GLYPH.video, tip: "hide", lit: true }
  if (videoState === "loading") return { icon: GLYPH.spinner, tip: "loading", lit: false }
  if (videoState === "unavailable") return { icon: GLYPH.videoOff, tip: "note", lit: false }
  if (videoState === "hidden" && noted === true) return { icon: GLYPH.video, tip: "note", lit: false }
  return { icon: GLYPH.video, tip: "show", lit: false }
}

// ---- Outputs ----

// The audio outputs as { name, label, current }, built key by key from
// what the service reports. An entry without a name cannot be chosen and
// gets no row; a missing label falls back to the name.
function outputRows(outputs) {
  var out = []
  if (!_isList(outputs)) return out
  for (var i = 0; i < outputs.length; i++) {
    var entry = outputs[i]
    if (entry === null || typeof entry !== "object" || typeof entry.name !== "string") continue
    if (entry.name === "") continue
    var label = typeof entry.label === "string" && entry.label !== "" ? entry.label : entry.name
    out.push({ name: entry.name, label: label, current: entry.current === true })
  }
  return out
}

// How the saved output reads while no list is available: the system
// default has a name of its own, any other is shown by its device name.
function outputChoice(name) {
  if (typeof name !== "string" || name === "" || name === "auto") return TEXT.OUTPUT_DEFAULT
  return name
}

// ---- Shortcuts ----

var _GATES = ["config-errors", "version", "no-hyprland"]
var _GATE_CODES = ["E_HYPR_ERRORS", "E_HYPR_VERSION", "E_HYPR_NONE"]

// The code of the sentence that heads the shortcuts page while shortcuts
// cannot be assigned, "" while they can. A gate this version does not know
// reads as the compositor being out of reach.
function gateCode(gate) {
  if (gate === "ok") return ""
  var at = _GATES.indexOf(gate)
  return at === -1 ? "E_HYPR_NONE" : _GATE_CODES[at]
}

function _text(value) {
  return typeof value === "string" ? value : ""
}

// The buttons of a shortcut row by its status, left to right.
function _shortcutButtons(status) {
  if (status === "assigned") return ["unassign", "change"]
  if (status === "config") return ["change"]
  if (status === "blocked" || status === "failed") return ["change", "copy"]
  return ["assign", "change", "copy"]
}

// Which sentence stands under the label: the service's own note when it
// has one, else what the status means.
function _shortcutLine(status, note, proposal) {
  if (status === "config") return "config"
  if (note !== "") return "note"
  if (status === "assigned" || status === "blocked" || status === "failed") return status
  return proposal !== "" ? "suggested" : "nofree"
}

// The rows of the shortcuts page, built key by key from what the service
// reports ({ action, label, combo, status, proposal, note } per action):
//   action   which action the row is for
//   label    what the action is called
//   chip     the key shown beside it: the assigned one, or else the free
//            key that is proposed; "" for none
//   proposal the free key Assign would take, "" for none
//   line     which sentence stands under the label: "assigned",
//            "suggested", "nofree", "config", "blocked", "failed", or
//            "note" for the service's own sentence, which is then in note
//   warn     whether that sentence is about something that went wrong
//            (an assigned key with a sentence kept that key because
//            another one could not be had)
//   copy     the key the copied line would name, "" for none
//   buttons  { name, enabled } left to right; name is "assign",
//            "unassign", "change" or "copy"
// Assigning, unassigning and changing need a compositor that takes
// requests (gate "ok"); copying a line needs only a key to name. While a
// check is running (busy) no button answers. A status this version does
// not know reads as unassigned.
function shortcutRows(shortcuts, gate, busy) {
  var out = []
  if (!_isList(shortcuts)) return out
  var open = gate === "ok" && busy !== true
  for (var i = 0; i < shortcuts.length && out.length < _MAX_SHORTCUTS; i++) {
    var entry = shortcuts[i]
    if (entry === null || typeof entry !== "object" || _text(entry.action) === "") continue
    var status = _text(entry.status)
    var combo = _text(entry.combo)
    var proposal = _text(entry.proposal)
    var note = _text(entry.note)
    var taken = status === "assigned" || status === "config" || status === "blocked" || status === "failed"
    var chip = taken ? combo : proposal
    var copy = combo !== "" ? combo : proposal
    var buttons = _shortcutButtons(status).map(function(name) {
      var enabled = name === "copy" ? busy !== true && copy !== "" : open
      if (name === "assign" && proposal === "") enabled = false
      return { name: name, enabled: enabled }
    })
    out.push({
      action: entry.action,
      label: _text(entry.label) !== "" ? entry.label : entry.action,
      chip: chip,
      proposal: proposal,
      line: _shortcutLine(status, note, proposal),
      note: note,
      warn: status === "blocked" || status === "failed" || (status === "assigned" && note !== ""),
      copy: copy,
      buttons: buttons
    })
  }
  return out
}

// ---- Sign-in ----

var _SIGNIN_STAGES = ["confirm", "browser", "exporting", "verifying"]

// Which screen the account page shows, from the service's sign-in state and
// whether it counts as signed in:
//   "off"        nobody is signed in: what signing in means, and Continue
//   "confirm"    the browser was looked up: which one, and Open browser
//   "browser"    the browser window is open
//   "exporting"  the login is being saved
//   "verifying"  it is being tried out
//   "on"         signed in
//   "leaving"    signing out: the login is still being deleted
//   "failed"     the attempt ended with an error
// A running attempt comes first. After that being signed in does, whatever
// the state says, so that there is always a way to sign out.
function signInScreen(state, signedIn) {
  if (_SIGNIN_STAGES.indexOf(state) !== -1) return state
  if (signedIn === true) return "on"
  if (state === "failed") return "failed"
  return state === "on" ? "leaving" : "off"
}

// The buttons of each screen, top to bottom, by the name the page answers
// to. Some screens have none: there is nothing to decide while the login
// is being deleted. loginSaved says that a login file lies on disk. Nobody
// may be signed in with it (YouTube ended the session, or a sign-out could
// not delete it), and then the way to delete it stands beside the way to
// sign in: a saved login can always be removed from here.
function signInButtons(screen, loginSaved) {
  if (screen === "off" || screen === "failed") return loginSaved === true ? ["begin", "signout"] : ["begin"]
  if (screen === "confirm") return ["open", "cancel"]
  if (screen === "browser" || screen === "exporting" || screen === "verifying") return ["cancel"]
  if (screen === "on") return ["signout"]
  return []
}

// True while the main page offers to play the failed track with the
// account: the track failed because YouTube shows it only to a signed-in
// user, and somebody is signed in. The offer is made each time such a track
// fails and is never remembered: the login is used for a video only when
// the user has just asked for exactly that.
function accountOffer(playbackState, errorCode, signedIn) {
  return signedIn === true && playbackState === "error" && errorCode === "E_NEEDS_ACCOUNT"
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
    PAGES: PAGES,
    CHOICES: CHOICES,
    FEEDS: FEEDS,
    pageTitle: pageTitle,
    parentPage: parentPage,
    stepChoice: stepChoice,
    keyAction: keyAction,
    placeKind: placeKind,
    CONTROLS: CONTROLS,
    CONTROL_HOME: CONTROL_HOME,
    stepControl: stepControl,
    captureStep: captureStep,
    clampIndex: clampIndex,
    moveCursor: moveCursor,
    printable: printable,
    dropLast: dropLast,
    rows: rows,
    feedRows: feedRows,
    indexOfKey: indexOfKey,
    listArea: listArea,
    rowTitle: rowTitle,
    topNotice: topNotice,
    listHeight: listHeight,
    thumbPath: thumbPath,
    stripLine: stripLine,
    recentSkip: recentSkip,
    videoButton: videoButton,
    outputRows: outputRows,
    outputChoice: outputChoice,
    gateCode: gateCode,
    shortcutRows: shortcutRows,
    signInScreen: signInScreen,
    signInButtons: signInButtons,
    accountOffer: accountOffer,
    duration: duration,
    barIcon: barIcon
  }
}
