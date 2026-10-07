.pragma library

// Error and notice codes, the one sentence each of them shows the user, and
// the classifiers that turn a failed job into a code. Codes are stable
// identifiers. The sentences here are the only wording the user ever sees
// for them: tool output is used to pick a code and is never shown, stored
// or logged. No sentence tells the user to run a command.
//
// A code that starts with N_ is a notice: something the user should know
// that did not stop what they asked for.

// Builds a table without a prototype, so that a code such as "constructor"
// finds nothing in it. The table is shared by everything that imports this
// file, so it is frozen: no importer can change a sentence for the others.
function _table(rows) {
  var table = Object.create(null)
  for (var i = 0; i < rows.length; i++) table[rows[i][0]] = rows[i][1]
  return Object.freeze(table)
}

var TEXT = _table([
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
  ["N_STATE_RESET", "Saved history could not be read and was reset"],
  // The queue.
  ["N_NO_RELATED", "No related tracks found"],
  ["N_SKIPPED", "Skipped a track that could not be played"],
  // The video window and the shortcuts, which both go through Hyprland.
  ["E_VIDEO_NONE", "No video for this track"],
  ["E_HYPR_VERSION", "This Hyprland version is not tested with OmaJuke"],
  ["E_HYPR_ERRORS", "Fix the errors in your Hyprland config first"],
  ["E_HYPR_EVAL", "Hyprland refused the request"],
  ["E_HYPR_NONE", "Hyprland is not available"],
  // The audio output.
  ["N_OUTPUT_FALLBACK", "That output is gone. Using the system default"],
  // Signing in, and the lists of an account.
  ["E_SIGNIN_BROWSER", "Sign-in needs Chrome, Chromium, Brave, Vivaldi, Firefox or LibreWolf"],
  ["E_SIGNIN_CANCELLED", "Sign-in was cancelled"],
  ["E_SIGNIN_NONE", "No YouTube login was found in that browser window"],
  ["E_SIGNED_OUT", "YouTube signed this session out. Sign in again"],
  ["E_SIGNOUT_LEFT", "The saved login could not be deleted"],
  ["E_FEED", "That list could not be loaded"]
])

// Codes that say "this track is the problem": a queue moves on to the next
// one. Every other code means the network, the tools or YouTube as a whole
// is the problem, and playback stops.
var _SKIP_CLASS = [
  "E_YT_REFUSED", "E_NEEDS_ACCOUNT", "E_NOT_STARTED", "E_BAD_OUTPUT", "E_YTDLP_FAILED", "E_PLAYBACK"
]

// What yt-dlp's error line says. The order is part of the rule: the first
// pattern that matches decides. Neighbouring rows with the same code are
// one alternation, split to keep the lines readable.
var _STDERR_RULES = [
  { code: "E_YT_BLOCKED", pattern: /not a bot|captcha|rate-limited|IP is likely being blocked/i },
  { code: "E_YT_BLOCKED", pattern: /HTTP Error 429/i },
  { code: "E_NEEDS_ACCOUNT", pattern: /confirm your age|members-only|join this channel/i },
  { code: "E_NOT_STARTED", pattern: /Premieres in|will begin in|live event will begin|is offline/i },
  { code: "E_NETWORK", pattern: /Unable to download (API page|webpage)|Failed to (establish|resolve)/i },
  { code: "E_NETWORK", pattern: /Network is unreachable|Temporary failure|Name or service not known/i },
  { code: "E_NETWORK", pattern: /timed out|Connection (refused|reset)/i },
  { code: "E_YT_REFUSED", pattern: /Private video|unavailable|not made this video available/i },
  { code: "E_YT_REFUSED", pattern: /has been removed|terminated|Requested format is not available/i }
]

// What yt-dlp says, on any line, when the login it was given no longer
// counts. It may say so in a warning and still finish with success.
var _SIGNED_OUT = /cookies are no longer valid|Sign in to confirm|login required|requires authentication/i

// The first line of stderr that reports an error. yt-dlp prints other lines
// around it (its note about reading from stdin, warnings), and only this
// one names the cause.
function _errorLine(stderr) {
  if (typeof stderr !== "string") return ""
  var lines = stderr.split("\n")
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("ERROR:") === 0) return lines[i]
  }
  return ""
}

// The code for a finished yt-dlp job (a runner result), or "" when the job
// succeeded. What the runner itself found out comes first, then the error
// line. A cancelled job never comes here: callers return on it.
function fromYtDlp(result) {
  if (result === null || typeof result !== "object") return "E_YTDLP_FAILED"
  if (result.ok === true) return ""
  if (result.error === "nowrap") return "E_TOOLS_MISSING"
  if (result.error === "missing") return "E_YTDLP_MISSING"
  if (result.error === "timeout") return "E_TIMEOUT"
  if (result.error === "overflow") return "E_BAD_OUTPUT"
  var line = _errorLine(result.stderr)
  for (var i = 0; i < _STDERR_RULES.length; i++) {
    if (_STDERR_RULES[i].pattern.test(line)) return _STDERR_RULES[i].code
  }
  return "E_YTDLP_FAILED"
}

// "E_SIGNED_OUT" when a finished job that was given the login shows that
// YouTube no longer accepts it, else "". Asked before the job's exit code
// or output is looked at: such a job can succeed and still have run without
// an account, and what it printed is then not the user's own list.
function fromSignedIn(result) {
  if (result === null || typeof result !== "object") return ""
  return typeof result.stderr === "string" && _SIGNED_OUT.test(result.stderr) ? "E_SIGNED_OUT" : ""
}

function isSkipClass(code) {
  return _SKIP_CLASS.indexOf(code) !== -1
}

if (typeof module !== "undefined") {
  module.exports = { TEXT: TEXT, fromYtDlp: fromYtDlp, fromSignedIn: fromSignedIn, isSkipClass: isSkipClass }
}
