.pragma library

// Input and expectation table for lib/Errors.js: which code a finished
// yt-dlp job gets, which codes mean "this track is the problem", and when a
// job that was given a login shows that the login no longer counts. The
// error lines are the ones yt-dlp prints (collected from a real run and
// from its source), with a synthetic id in place of the video's. The same
// table runs under node and inside Qt's JavaScript engine.

var _ID = "AAAAAAAAAAA"

// yt-dlp prints this before anything else when its input comes on stdin.
var _STDIN_NOTE = "Reading URLs from STDIN - EOF (Ctrl+D) to end:\n"

// A finished job as the process runner reports it.
function _job(error, stderr) {
  return { ok: false, error: error, exitCode: 1, stdout: "null\n", stderr: stderr, durationMs: 900 }
}

// A job that ran and exited with an error, with this on stderr.
function _exited(stderr) {
  return _job("exit", stderr)
}

// The same for the usual case: one error line about the video.
function _said(message) {
  return _job("exit", "ERROR: [youtube] " + _ID + ": " + message + "\n")
}

// A job that finished with success, with this on stderr.
function _done(stderr) {
  return { ok: true, error: "", exitCode: 0, stdout: "{}\n", stderr: stderr, durationMs: 900 }
}

function _repeat(unit, count) {
  var text = ""
  for (var i = 0; i < count; i++) text += unit
  return text
}

var MODULE = "Errors"
var CASES = [
  // ---- fromYtDlp: what the runner found out decides before stderr is read ----
  { fn: "fromYtDlp", args: [_job("nowrap", "")], expect: "E_TOOLS_MISSING" },
  { fn: "fromYtDlp", args: [_job("missing", "")], expect: "E_YTDLP_MISSING" },
  { fn: "fromYtDlp", args: [_job("timeout", "")], expect: "E_TIMEOUT" },
  { fn: "fromYtDlp", args: [_job("overflow", "")], expect: "E_BAD_OUTPUT" },
  { fn: "fromYtDlp", args: [_job("nowrap", "ERROR: [youtube] " + _ID + ": Private video\n")],
    expect: "E_TOOLS_MISSING" },
  { fn: "fromYtDlp", args: [_job("missing", "ERROR: Network is unreachable\n")], expect: "E_YTDLP_MISSING" },
  { fn: "fromYtDlp", args: [_job("timeout", "ERROR: [youtube] " + _ID + ": Private video\n")],
    expect: "E_TIMEOUT" },
  { fn: "fromYtDlp", args: [_job("overflow", "ERROR: Sign in to confirm you're not a bot\n")],
    expect: "E_BAD_OUTPUT" },
  // Ended by a signal, or with an exit code: stderr decides.
  { fn: "fromYtDlp", args: [_job("signal", "")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_job("exit", "")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_job("signal", "ERROR: [youtube] " + _ID + ": Private video\n")],
    expect: "E_YT_REFUSED" },
  // A cancelled job never comes here. If one did, it would be a plain failure.
  { fn: "fromYtDlp", args: [_job("cancelled", "")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_job("constructor", "")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_job("__proto__", "")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_job("", "")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_job(["timeout"], "")], expect: "E_YTDLP_FAILED" },

  // ---- fromYtDlp: a job that succeeded has no code ----
  { fn: "fromYtDlp", args: [{ ok: true, error: "", exitCode: 0, stdout: "{}", stderr: "", durationMs: 900 }],
    expect: "" },
  { fn: "fromYtDlp",
    args: [{ ok: true, error: "", exitCode: 0, stdout: "{}", stderr: "ERROR: Private video\n",
      durationMs: 900 }],
    expect: "" },

  // ---- fromYtDlp: results that are no results ----
  { fn: "fromYtDlp", args: [null], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [undefined], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [5], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: ["timeout"], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [true], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [[]], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [{}], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [{ ok: "true" }], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [{ ok: false, stderr: 5 }], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [{ ok: false, stderr: null, error: 7 }], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [{ ok: false, stderr: ["ERROR: Private video"] }], expect: "E_YTDLP_FAILED" },

  // ---- fromYtDlp: YouTube is refusing requests as a whole ----
  { fn: "fromYtDlp",
    args: [_said("Sign in to confirm you\u2019re not a bot. Use --cookies-from-browser or --cookies for the "
      + "authentication.")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp", args: [_said("Sign in to confirm you're not a bot.")], expect: "E_YT_BLOCKED" },
  // The apostrophe may arrive damaged: the runner decodes output in chunks.
  { fn: "fromYtDlp", args: [_said("Sign in to confirm you\ufffd\ufffdre not a bot.")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp",
    args: [_said("Video unavailable. YouTube is requiring a captcha challenge before playback")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp",
    args: [_said("This content isn't available, try again later. The current session has been rate-limited "
      + "by YouTube for up to an hour.")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp",
    args: [_said("All player responses are invalid. Your IP is likely being blocked by Youtube")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp", args: [_said("Unable to download webpage: HTTP Error 429: Too Many Requests")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp",
    args: [_exited("ERROR: query \"some words\" page 1: HTTP Error 429: Too Many Requests\n")],
    expect: "E_YT_BLOCKED" },

  // ---- fromYtDlp: the video needs an account ----
  { fn: "fromYtDlp",
    args: [_said("Sign in to confirm your age. Use --cookies-from-browser or --cookies for the "
      + "authentication.")],
    expect: "E_NEEDS_ACCOUNT" },
  { fn: "fromYtDlp", args: [_said("Join this channel to get access to members-only content like this video")],
    expect: "E_NEEDS_ACCOUNT" },
  { fn: "fromYtDlp",
    args: [_said("This video is available to this channel's members on level: Synthetic (or any higher "
      + "level). Join this channel to get access to members-only content and other exclusive perks.")],
    expect: "E_NEEDS_ACCOUNT" },
  { fn: "fromYtDlp", args: [_said("Join this channel to get access to perks")], expect: "E_NEEDS_ACCOUNT" },

  // ---- fromYtDlp: the video has not started ----
  { fn: "fromYtDlp", args: [_said("Premieres in 3 hours")], expect: "E_NOT_STARTED" },
  { fn: "fromYtDlp", args: [_said("This live event will begin in 2 days.")], expect: "E_NOT_STARTED" },
  { fn: "fromYtDlp", args: [_said("This live event will begin in a few moments.")], expect: "E_NOT_STARTED" },
  { fn: "fromYtDlp", args: [_said("The channel is offline.")], expect: "E_NOT_STARTED" },

  // ---- fromYtDlp: the network is the problem ----
  { fn: "fromYtDlp",
    args: [_said("Unable to download API page: HTTPSConnection(host='www.youtube.com', port=443): Failed to "
      + "establish a new connection: [Errno 101] Network is unreachable (caused by TransportError())")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_exited("ERROR: query \"some words\" page 1: Unable to download API page: x\n")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp",
    args: [_said("Unable to download webpage: <urlopen error [Errno -3] Temporary failure in name "
      + "resolution>")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp",
    args: [_said("Failed to resolve 'www.youtube.com' ([Errno -2] Name or service not known)")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_exited("ERROR: [Errno -2] Name or service not known\n")], expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_exited("ERROR: [Errno 101] Network is unreachable\n")], expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_exited("ERROR: [Errno -3] Temporary failure in name resolution\n")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_exited("ERROR: unable to download video data: The read operation timed out\n")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_said("[Errno 111] Connection refused")], expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_said("[Errno 104] Connection reset by peer")], expect: "E_NETWORK" },

  // ---- fromYtDlp: YouTube refuses this video ----
  { fn: "fromYtDlp", args: [_said("This video is unavailable")], expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp", args: [_said("Video unavailable")], expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp", args: [_said("Private video")], expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp", args: [_said("Private video. Sign in if you've been granted access to this video")],
    expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp", args: [_said("The uploader has not made this video available in your country")],
    expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp", args: [_said("This video has been removed by the uploader")], expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp",
    args: [_said("This video is no longer available because the YouTube account associated with this video "
      + "has been terminated.")],
    expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp",
    args: [_said("Requested format is not available. Use --list-formats for a list of available formats")],
    expect: "E_YT_REFUSED" },

  // ---- fromYtDlp: anything else is yt-dlp's own failure ----
  { fn: "fromYtDlp", args: [_exited("ERROR: [youtube:tab] RD" + _ID + ": YouTube said: This playlist type is "
    + "unviewable.\n")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_said("Something nobody has seen yet")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited("ERROR: " + _repeat("a", 4089))], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited("Traceback (most recent call last):\n  File \"yt-dlp\", line 1\n")],
    expect: "E_YTDLP_FAILED" },

  // ---- fromYtDlp: letter case does not matter ----
  { fn: "fromYtDlp", args: [_said("PRIVATE VIDEO")], expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp", args: [_said("NOT A BOT")], expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp", args: [_said("network is unreachable")], expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_said("premieres IN 5 minutes")], expect: "E_NOT_STARTED" },
  { fn: "fromYtDlp", args: [_said("MEMBERS-ONLY")], expect: "E_NEEDS_ACCOUNT" },

  // ---- fromYtDlp: when a line fits two classes, the earlier class wins ----
  { fn: "fromYtDlp", args: [_said("Sign in to confirm your age. Sign in to confirm you're not a bot")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp", args: [_said("Video unavailable. The current session has been rate-limited")],
    expect: "E_YT_BLOCKED" },
  { fn: "fromYtDlp", args: [_said("members-only. Premieres in 1 hour")], expect: "E_NEEDS_ACCOUNT" },
  { fn: "fromYtDlp", args: [_said("The channel is offline. Connection timed out")], expect: "E_NOT_STARTED" },
  { fn: "fromYtDlp", args: [_said("Unable to download webpage: This video is unavailable")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp", args: [_said("Private video. Join this channel to get access")],
    expect: "E_NEEDS_ACCOUNT" },

  // ---- fromYtDlp: only the first line that starts with "ERROR:" is read ----
  { fn: "fromYtDlp", args: [_exited(_STDIN_NOTE + "ERROR: [youtube] " + _ID + ": Private video\n")],
    expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp",
    args: [_exited(_STDIN_NOTE + "WARNING: [youtube] Unable to download webpage: HTTP Error 429\n"
      + "ERROR: [youtube] " + _ID + ": Private video\n")],
    expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp",
    args: [_exited("ERROR: [youtube] " + _ID + ": Private video\nERROR: Network is unreachable\n")],
    expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp",
    args: [_exited("ERROR: Network is unreachable\nERROR: [youtube] " + _ID + ": Private video\n")],
    expect: "E_NETWORK" },
  { fn: "fromYtDlp",
    args: [_exited("ERROR: something else\nERROR: [youtube] " + _ID + ": Private video\n")],
    expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited("ERROR: [youtube] " + _ID + ": Private video")], expect: "E_YT_REFUSED" },
  { fn: "fromYtDlp", args: [_exited("\n\nERROR: [youtube] " + _ID + ": Private video\r\n")],
    expect: "E_YT_REFUSED" },
  // A warning, an indented line and a lower-case prefix are not the error line.
  { fn: "fromYtDlp", args: [_exited("WARNING: [youtube] " + _ID + ": Private video\n")],
    expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp",
    args: [_exited("WARNING: [youtube:tab] Unable to recognize playlist. Downloading just video " + _ID
      + "\n")],
    expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited(" ERROR: Network is unreachable\n")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited("error: Network is unreachable\n")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited("yt-dlp: ERROR: Network is unreachable\n")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited("Network is unreachable\n")], expect: "E_YTDLP_FAILED" },
  { fn: "fromYtDlp", args: [_exited("ERROR\n: Network is unreachable\n")], expect: "E_YTDLP_FAILED" },

  // ---- isSkipClass: this track is the problem, a queue moves on ----
  { fn: "isSkipClass", args: ["E_YT_REFUSED"], expect: true },
  { fn: "isSkipClass", args: ["E_NEEDS_ACCOUNT"], expect: true },
  { fn: "isSkipClass", args: ["E_NOT_STARTED"], expect: true },
  { fn: "isSkipClass", args: ["E_BAD_OUTPUT"], expect: true },
  { fn: "isSkipClass", args: ["E_YTDLP_FAILED"], expect: true },
  { fn: "isSkipClass", args: ["E_PLAYBACK"], expect: true },

  // ---- isSkipClass: the network, the tools or YouTube as a whole is the problem ----
  { fn: "isSkipClass", args: ["E_NETWORK"], expect: false },
  { fn: "isSkipClass", args: ["E_STREAM"], expect: false },
  { fn: "isSkipClass", args: ["E_TIMEOUT"], expect: false },
  { fn: "isSkipClass", args: ["E_YT_BLOCKED"], expect: false },
  { fn: "isSkipClass", args: ["E_YTDLP_MISSING"], expect: false },
  { fn: "isSkipClass", args: ["E_TOOLS_MISSING"], expect: false },
  { fn: "isSkipClass", args: ["E_MPV_MISSING"], expect: false },
  { fn: "isSkipClass", args: ["E_MPV_START"], expect: false },
  { fn: "isSkipClass", args: ["E_MPV_EXITED"], expect: false },
  { fn: "isSkipClass", args: ["E_RUNTIME_DIR"], expect: false },
  { fn: "isSkipClass", args: ["E_INVALID_INPUT"], expect: false },
  { fn: "isSkipClass", args: ["E_LINK"], expect: false },
  { fn: "isSkipClass", args: ["N_PROXY"], expect: false },
  { fn: "isSkipClass", args: ["N_STATE_RESET"], expect: false },
  { fn: "isSkipClass", args: ["N_NO_RELATED"], expect: false },
  { fn: "isSkipClass", args: ["N_SKIPPED"], expect: false },
  { fn: "isSkipClass", args: ["E_VIDEO_NONE"], expect: false },
  { fn: "isSkipClass", args: ["E_HYPR_VERSION"], expect: false },
  { fn: "isSkipClass", args: ["E_HYPR_ERRORS"], expect: false },
  { fn: "isSkipClass", args: ["E_HYPR_EVAL"], expect: false },
  { fn: "isSkipClass", args: ["E_HYPR_NONE"], expect: false },
  { fn: "isSkipClass", args: ["N_OUTPUT_FALLBACK"], expect: false },
  { fn: "isSkipClass", args: ["E_SIGNIN_BROWSER"], expect: false },
  { fn: "isSkipClass", args: ["E_SIGNIN_CANCELLED"], expect: false },
  { fn: "isSkipClass", args: ["E_SIGNIN_NONE"], expect: false },
  { fn: "isSkipClass", args: ["E_SIGNED_OUT"], expect: false },
  { fn: "isSkipClass", args: ["E_SIGNOUT_LEFT"], expect: false },
  { fn: "isSkipClass", args: ["E_FEED"], expect: false },

  // ---- isSkipClass: anything that is not a code ----
  { fn: "isSkipClass", args: [""], expect: false },
  { fn: "isSkipClass", args: [], expect: false },
  { fn: "isSkipClass", args: ["e_playback"], expect: false },
  { fn: "isSkipClass", args: ["E_PLAYBACK "], expect: false },
  { fn: "isSkipClass", args: ["E_NOPE"], expect: false },
  { fn: "isSkipClass", args: ["constructor"], expect: false },
  { fn: "isSkipClass", args: ["__proto__"], expect: false },
  { fn: "isSkipClass", args: ["toString"], expect: false },
  { fn: "isSkipClass", args: ["length"], expect: false },
  { fn: "isSkipClass", args: ["0"], expect: false },
  { fn: "isSkipClass", args: [0], expect: false },
  { fn: "isSkipClass", args: [null], expect: false },
  { fn: "isSkipClass", args: [true], expect: false },
  { fn: "isSkipClass", args: [["E_PLAYBACK"]], expect: false },
  { fn: "isSkipClass", args: [{ code: "E_PLAYBACK" }], expect: false },

  // ---- fromSignedIn: the login is gone when yt-dlp says so on any line ----
  { fn: "fromSignedIn", expect: "E_SIGNED_OUT",
    args: [_done(_STDIN_NOTE + "WARNING: [youtube] The provided YouTube account cookies are no longer valid. "
      + "They have likely been rotated in the browser as a security measure.\n")] },
  { fn: "fromSignedIn", args: [_said("Sign in to confirm your age. This video may be inappropriate")],
    expect: "E_SIGNED_OUT" },
  { fn: "fromSignedIn", args: [_said("Sign in to confirm you're not a bot")], expect: "E_SIGNED_OUT" },
  { fn: "fromSignedIn", expect: "E_SIGNED_OUT",
    args: [_exited("ERROR: [youtube:tab] WL: This playlist is private; login required\n")] },
  { fn: "fromSignedIn", args: [_exited("ERROR: [youtube:tab] The feed requires authentication\n")],
    expect: "E_SIGNED_OUT" },
  { fn: "fromSignedIn", args: [_done("warning: LOGIN REQUIRED\n")], expect: "E_SIGNED_OUT" },
  { fn: "fromSignedIn", args: [_done("first line\nsecond line\nthe cookies are no longer valid\n")],
    expect: "E_SIGNED_OUT" },
  { fn: "fromSignedIn", args: [_job("timeout", "WARNING: login required\n")], expect: "E_SIGNED_OUT" },

  // ---- fromSignedIn: anything else says nothing about the login ----
  { fn: "fromSignedIn", args: [_done("")], expect: "" },
  { fn: "fromSignedIn", args: [_done(_STDIN_NOTE)], expect: "" },
  { fn: "fromSignedIn", args: [_done("WARNING: [youtube] Falling back to another player\n")], expect: "" },
  { fn: "fromSignedIn", args: [_said("Private video")], expect: "" },
  { fn: "fromSignedIn", args: [_said("Video unavailable")], expect: "" },
  { fn: "fromSignedIn", args: [_job("timeout", "")], expect: "" },
  { fn: "fromSignedIn", args: [_job("missing", "")], expect: "" },
  { fn: "fromSignedIn", args: [_done("login\nrequired\n")], expect: "" },
  { fn: "fromSignedIn", args: [{ ok: true, stdout: "login required", stderr: "" }], expect: "" },
  { fn: "fromSignedIn", args: [{ ok: true, stderr: ["login required"] }], expect: "" },
  { fn: "fromSignedIn", args: [{ ok: true, stderr: null }], expect: "" },
  { fn: "fromSignedIn", args: [{}], expect: "" },
  { fn: "fromSignedIn", args: [null], expect: "" },
  { fn: "fromSignedIn", args: ["login required"], expect: "" },
  { fn: "fromSignedIn", args: [], expect: "" },
  { fn: "fromSignedIn", args: [_done(_repeat("Sign in to ", 4096))], expect: "" }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
