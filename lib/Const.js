.pragma library

// The constants every other module refers to: the plugin's identity, the
// tools it runs, and every limit and timeout. A name or a number lives here
// and nowhere else, so that changing one is a one-line edit and a reader
// finds the bounds of the whole plugin in one place.

// ---- Identity ----

// The id is embedded in a Hyprland bind command, so it has to keep matching
// ^[a-z0-9]+(\.[a-z0-9-]+)+$ (the repo test checks). This is its only home
// in JavaScript.
var PLUGIN_ID = "davidgudovic.omajuke"

// mpv's app-id, window title and audio client name, and the title shown for
// a track whose own title is not known yet.
var APP_NAME = "OmaJuke"

// Name of the runtime, state and data directories.
var DIR_NAME = "omajuke"

// Equals "version" in manifest.json and VERSION in ui/Ui.js (the repo test
// checks): the panel compares them to notice an update that still needs a
// shell restart.
var VERSION = "0.1.0"

// ---- Tools ----

// Plain absolute paths: nothing is ever looked up through PATH. Only tests
// replace entries (with stub scripts), by handing the service a changed copy
// before anything runs. No setting, IPC argument or stored value reaches a
// tool path.
var TOOLS = {
  mpv: "/usr/bin/mpv", ytdlp: "/usr/bin/yt-dlp", curl: "/usr/bin/curl", hyprctl: "/usr/bin/hyprctl",
  setpriv: "/usr/bin/setpriv", timeout: "/usr/bin/timeout", sh: "/usr/bin/sh",
  head: "/usr/bin/head", rm: "/usr/bin/rm", find: "/usr/bin/find",
  // Sign-in only.
  cp: "/usr/bin/cp", xdgSettings: "/usr/bin/xdg-settings",
  // Test seam for sign-in: when not empty it replaces the browser binary.
  browser: ""
}

// The mpv script that publishes playback over MPRIS (media keys). Optional:
// playback works without it.
var MPRIS_SO = "/usr/lib/mpv-mpris/mpris.so"

// The only shape of media URL that is ever handed to mpv by us: https, a
// googlevideo.com host, printable ASCII. Both the reader of yt-dlp's answer
// and the builder of mpv commands test against this one pattern.
var VIDEO_URL_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.googlevideo\.com\/[\x21-\x7e]{1,4000}$/

// ---- Limits ----

var LIMITS = {
  // Lengths of kept text, in UTF-16 units.
  queryChars: 200, refChars: 2048, titleChars: 300, channelChars: 120,
  // A longer duration is treated as unknown (two days, in seconds).
  durationSeconds: 172800,
  // List lengths.
  searchCount: 20, mixFetch: 25, mixAppend: 20, feedCount: 50, queueItems: 200, recents: 30,
  // Bytes accepted from a child or a file before the read is abandoned.
  // stateBytes follows from the list caps: 230 stored tracks of 420 UTF-16
  // units, each unit up to six bytes once escaped, are about 600 KiB.
  searchBytes: 1048576, resolveBytes: 4194304, mixBytes: 1048576, feedBytes: 1048576,
  stateBytes: 1048576, thumbBytes: 262144, thumbOutBytes: 8192, hyprBytes: 524288, mpvLineChars: 65536,
  // Caches and queues.
  resolveCache: 8, resolveTtlMs: 18000000, thumbFiles: 200, thumbBatch: 12, thumbQueue: 60,
  mpvPending: 64, mpvOutbox: 32, jobs: 6, settingsKeys: 32
}

// ---- Timeouts ----

var TIMEOUTS = {
  // Seconds, for jobs run through the process runner.
  local: 5, search: 15, resolve: 25, mix: 15, feed: 25, thumbs: 12, hypr: 3, sponsor: 6, cookieExport: 60,
  signInSec: 900, killGraceSec: 2,
  // Milliseconds, for timers (the names ending in Sec are seconds).
  dwellMs: 600, loadMs: 15000, socketMs: 5000, replyMs: 5000, quitMs: 1500, termMs: 1000, saveMs: 800,
  reloadMs: 300, stallMs: 30000, recoverSpanSec: 30, videoMs: 20000, devicesMs: 1000, markSec: 30
}

if (typeof module !== "undefined") {
  module.exports = {
    PLUGIN_ID: PLUGIN_ID,
    APP_NAME: APP_NAME,
    DIR_NAME: DIR_NAME,
    VERSION: VERSION,
    TOOLS: TOOLS,
    MPRIS_SO: MPRIS_SO,
    VIDEO_URL_RE: VIDEO_URL_RE,
    LIMITS: LIMITS,
    TIMEOUTS: TIMEOUTS
  }
}
