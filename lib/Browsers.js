.pragma library
.import "Const.js" as Const

// The browser side of signing in to YouTube: which browsers may be used and
// the exact command each one is started with. The default browser's desktop
// id is text from outside, so all it can do is select a row of the fixed
// table below. No desktop file is read and no Exec line is run. The command
// is an argument array, never shell text, and its one variable part is a
// profile directory that has to be one of OmaJuke's own numbered sign-in
// directories. This file also owns the preferences written into a fresh
// Firefox profile before that browser starts.

// ---- Browsers ----

// One row per desktop id: the browser family, the binary the system package
// installs, and the name yt-dlp reads that kind of cookie store under
// (LibreWolf keeps its cookies the way Firefox does). A Flatpak or Snap
// build answers to another id and is deliberately absent: it is no binary
// in /usr/bin, and it runs in a sandbox of its own.
var _ROWS = [
  ["google-chrome.desktop", "chromium", "/usr/bin/google-chrome-stable", "chrome"],
  ["chromium.desktop", "chromium", "/usr/bin/chromium", "chromium"],
  ["brave-browser.desktop", "chromium", "/usr/bin/brave", "brave"],
  ["vivaldi-stable.desktop", "chromium", "/usr/bin/vivaldi-stable", "vivaldi"],
  ["firefox.desktop", "firefox", "/usr/bin/firefox", "firefox"],
  ["librewolf.desktop", "firefox", "/usr/bin/librewolf", "firefox"]
]

// Built without a prototype, so that an id such as "constructor" finds
// nothing, and frozen, because every importer shares this one object.
function _table(rows) {
  var table = Object.create(null)
  for (var i = 0; i < rows.length; i++) {
    table[rows[i][0]] = Object.freeze({ family: rows[i][1], bin: rows[i][2], ytName: rows[i][3] })
  }
  return Object.freeze(table)
}

var TABLE = _table(_ROWS)

// ---- Command line ----

// The page the browser opens. The password is typed into the browser; no
// part of OmaJuke ever sees it.
var START_URL = "https://www.youtube.com/"

// What a Chromium-family browser gets after its profile directory, in this
// order. Nothing here opens a debugging port, automates the browser, writes
// a log, loads an extension or weakens the sandbox, and no private window
// is used: its cookies would never reach the disk. Flags a launcher script
// would add from the user's configuration are kept out by the environment
// the browser is started in, not by anything in this list.
var _CHROMIUM_FLAGS = [
  // No keyring. The profile must not share a key with the everyday browser,
  // and reading the cookies back must not need one.
  "--password-store=basic",
  // The window follows the session, Wayland or X11.
  "--ozone-platform-hint=auto",
  // Nothing between the user and the sign-in page.
  "--no-first-run", "--no-default-browser-check",
  // The login stays a web login: no account on the browser itself, no sync.
  "--disable-sync", "--allow-browser-signin=false",
  // No extensions, the bundled ones included.
  "--disable-extensions", "--disable-component-extensions-with-background-pages", "--disable-default-apps",
  // Less traffic of the browser's own: component updates, background
  // fetches, reliability reports, link pings, crash and metrics uploads.
  "--disable-component-update", "--disable-background-networking", "--disable-domain-reliability",
  "--no-pings", "--disable-breakpad", "--metrics-recording-only",
  // The address follows.
  "--new-window"
]

// Seconds a browser gets after the stop signal, at the deadline or when the
// user cancels, to write its cookie store and leave by itself, before it is
// ended by force.
var GRACE_SEC = 5

// ---- Input checks ----

// The answer to "which is the default browser" is one short line.
var _OUTPUT_CHARS = 256

// An attempt directory is spelled with these characters only, so it cannot
// hold anything a browser or yt-dlp reads as a separator, and it is short.
var _PLAIN_PATH = /^\/[A-Za-z0-9._\/-]+$/
var _DIR_CHARS = 128

// Its last three parts: OmaJuke's directory, the directory that holds the
// sign-in attempts, and the counter of one attempt.
var _SIGNIN_NAME = "signin"
var _COUNTER = /^[0-9]{1,10}$/

var _TOOL_CHARS = 256
var _CONTROL = /[\u0000-\u001f\u007f]/

// The blanks a command prints around one line of output, and nothing more:
// an id with any other invisible character next to it is not a known id.
function _isBlank(code) {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

function _trim(string) {
  var start = 0
  var end = string.length
  while (start < end && _isBlank(string.charCodeAt(start))) start++
  while (end > start && _isBlank(string.charCodeAt(end - 1))) end--
  return string.slice(start, end)
}

// The table row for exactly this id, or null.
function _row(id) {
  if (typeof id !== "string") return null
  return Object.prototype.hasOwnProperty.call(TABLE, id) ? TABLE[id] : null
}

// True for an absolute path of plain characters without an empty, "." or
// ".." part that ends in OmaJuke's directory, the sign-in directory and a
// counter, below at least one more directory. The shape is what is checked,
// not a prefix: this file does not know where the runtime directory is.
function _isAttemptDir(dir) {
  if (typeof dir !== "string" || dir.length > _DIR_CHARS || !_PLAIN_PATH.test(dir)) return false
  var parts = dir.split("/")
  // parts[0] is the empty text in front of the leading slash.
  for (var i = 1; i < parts.length; i++) {
    if (parts[i] === "" || parts[i] === "." || parts[i] === "..") return false
  }
  var last = parts.length - 1
  return last >= 4 && parts[last - 2] === Const.DIR_NAME && parts[last - 1] === _SIGNIN_NAME
    && _COUNTER.test(parts[last])
}

function _isTool(path) {
  return typeof path === "string" && path.length > 1 && path.length <= _TOOL_CHARS
    && path.charAt(0) === "/" && !_CONTROL.test(path)
}

// The three tool paths this file uses, each read exactly once, or null.
// The table is the plugin's own, but it is handed in from outside this
// file: reading a member of a foreign object can run code and fail, and a
// second read could give another answer than the one that was checked.
function _toolPaths(tools) {
  if (tools === null || typeof tools !== "object") return null
  var paths
  try {
    paths = { setpriv: tools.setpriv, timeout: tools.timeout, browser: tools.browser }
  } catch (error) {
    return null
  }
  if (!_isTool(paths.setpriv) || !_isTool(paths.timeout)) return null
  // Only the empty text means "no stand-in".
  if (paths.browser !== "" && !_isTool(paths.browser)) return null
  return paths
}

// Everything that follows the binary. The profile is the only part that
// varies. It starts with a slash, so where it stands alone (Firefox) it can
// never be read as an option.
function _flags(family, profile) {
  if (family === "chromium") return ["--user-data-dir=" + profile].concat(_CHROMIUM_FLAGS, [START_URL])
  if (family === "firefox") return ["--no-remote", "--profile", profile, START_URL]
  return null
}

// ---- Public functions ----

// Takes the output of "xdg-settings get default-web-browser". Returns
// { ok: false } unless it is exactly one supported desktop id, else
// { ok: true, id, family, bin, ytName } as a fresh object. The id is the
// one to hand to launchArgv, bin is what the confirmation page shows, and
// ytName is what the cookie export tells yt-dlp.
function lookup(output) {
  if (typeof output !== "string" || output.length > _OUTPUT_CHARS) return { ok: false }
  var id = _trim(output)
  var row = _row(id)
  if (row === null) return { ok: false }
  return { ok: true, id: id, family: row.family, bin: row.bin, ytName: row.ytName }
}

// The command that asks which browser is the default one, or [] when the
// tool's path is not absolute. The answer goes to lookup(). The tool is run
// with the plugin's own small environment, so a browser named in a variable
// of the session is not what it answers with.
function queryArgv(tools) {
  if (tools === null || typeof tools !== "object") return []
  var tool
  try {
    tool = tools.xdgSettings
  } catch (error) {
    return []
  }
  return _isTool(tool) ? [tool, "get", "default-web-browser"] : []
}

// The browser profile inside a sign-in attempt directory, or "" when the
// directory is not one: an absolute path that ends in OmaJuke's directory,
// "signin" and the attempt's counter. No everyday browser profile and no
// other directory of OmaJuke has that shape, so none of them can ever be
// the profile that is opened here.
function profileDir(attemptDir) {
  return _isAttemptDir(attemptDir) ? attemptDir + "/profile" : ""
}

// The command that opens the sign-in window: the browser of this desktop
// id, on the profile of this attempt directory, tied to the life of the
// shell and ended at the deadline even if nothing is left to end it.
// Returns [] when the id is not in the table, the directory is not an
// attempt directory or a tool path is not absolute: an empty command cannot
// be run, where a shortened one would open the user's own profile.
function launchArgv(tools, id, attemptDir) {
  var row = _row(id)
  var profile = profileDir(attemptDir)
  var paths = _toolPaths(tools)
  if (row === null || profile === "" || paths === null) return []
  var flags = _flags(row.family, profile)
  if (flags === null) return []
  // Tests put a stand-in for the browser into the tool table. The family,
  // and with it the flags, still come from the table of browsers.
  var bin = paths.browser === "" ? row.bin : paths.browser
  return [
    paths.setpriv, "--pdeathsig", "TERM",
    paths.timeout, "-k", String(GRACE_SEC), String(Const.TIMEOUTS.signInSec),
    bin
  ].concat(flags)
}

// ---- Firefox profile ----

// Preferences for the throwaway Firefox profile: no telemetry or studies,
// no first-run pages, no account or sync of the browser's own, no saved
// passwords, no speculative connections. A preference a newer Firefox no
// longer knows is ignored by it.
var _PREFS = [
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

// One user_pref line per row, in the form Firefox reads from user.js. The
// names and values are the constants above, and JSON spells such plain
// strings and booleans the way that file wants them.
function _userJs(prefs) {
  var lines = []
  for (var i = 0; i < prefs.length; i++) {
    lines.push("user_pref(" + JSON.stringify(prefs[i][0]) + ", " + JSON.stringify(prefs[i][1]) + ");")
  }
  return lines.join("\n") + "\n"
}

// The text of user.js for a fresh Firefox-family profile. A Chromium-family
// profile gets no file: its settings are all on the command line.
var USER_JS = _userJs(_PREFS)

if (typeof module !== "undefined") {
  module.exports = {
    TABLE: TABLE,
    START_URL: START_URL,
    GRACE_SEC: GRACE_SEC,
    USER_JS: USER_JS,
    queryArgv: queryArgv,
    lookup: lookup,
    profileDir: profileDir,
    launchArgv: launchArgv
  }
}
