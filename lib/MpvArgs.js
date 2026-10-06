.pragma library
.import "Const.js" as Const

// The command line mpv is started with, and the only place a flag for it is
// written. The list is a constant apart from three slots: the control
// socket, the start volume and the path of yt-dlp, plus the choice whether
// the MPRIS script is loaded. Nothing about a track is ever in it: no URL,
// no title, no id, no cookie path. Tracks reach mpv over the socket only.

// The socket path and the yt-dlp path end up inside option values, and mpv
// splits some of those at commas and reads quotes and percent signs in its
// own way. Both are therefore held to plain path characters here, whatever
// the caller has checked already.
var _PLAIN_PATH = /^\/[A-Za-z0-9._\/-]{1,200}$/

// What mpv's own yt-dlp hook passes on to yt-dlp, as key=value pairs. The
// hook only ever re-reads an info file OmaJuke resolved itself, but it must
// still behave like OmaJuke's own yt-dlp calls: no user configuration, no
// plugins, no cache on disk, nothing marked as watched, no code fetched, no
// browser read. Without sub-langs the hook adds one subtitle track for each
// language, which makes mpv's track list larger than a line may be.
var _HOOK_OPTIONS = [
  "ignore-config=", "no-plugin-dirs=", "no-cache-dir=", "no-mark-watched=", "no-remote-components=",
  "no-cookies-from-browser=", "sub-langs=-all", "socket-timeout=10"
]

function _isPlainPath(value) {
  return typeof value === "string" && _PLAIN_PATH.test(value)
}

// p: { sock, volume, mpris, ytdlp }. Returns the arguments that follow the
// mpv binary, or null when a slot holds something that must not reach a
// command line. The order is fixed: the test holds the same list and
// compares the two item by item.
function launch(p) {
  if (p === null || typeof p !== "object") return null
  if (!_isPlainPath(p.sock) || !_isPlainPath(p.ytdlp)) return null
  if (typeof p.volume !== "number" || !isFinite(p.volume)) return null
  var volume = Math.min(100, Math.max(0, Math.round(p.volume)))
  var argv = [
    // No mpv.conf, input.conf, script, watch-later or cache file of the
    // user's or the system's takes part.
    "--no-config",
    // Stay alive between tracks and while the next one is looked up.
    "--idle=yes",
    "--no-terminal",
    "--input-ipc-server=" + p.sock,
    // The lifetime tether: mpv quits when its standard input closes, which
    // happens when the shell goes away for any reason.
    "--input-ipc-client=fd://0",
    // A focused video window has no key that quits, takes a screenshot or
    // writes a file.
    "--input-default-bindings=no",
    "--input-builtin-bindings=no",
    // Constant names: the track title stays out of window lists, and the
    // audio stream and the MPRIS bus name are always the same.
    "--audio-client-name=" + Const.APP_NAME,
    "--wayland-app-id=" + Const.APP_NAME,
    "--title=" + Const.APP_NAME,
    // Audio only. A window exists only while video is asked for.
    "--force-window=no",
    "--vid=no",
    "--sid=no",
    // mpv keeps a pause across files. With this every new file plays.
    "--reset-on-next-file=pause",
    "--ytdl=yes",
    "--ytdl-format=bestaudio/best",
    "--ytdl-raw-options=" + _HOOK_OPTIONS.join(","),
    // The hook would otherwise search mpv's configuration folder and PATH.
    "--script-opts=ytdl_hook-ytdl_path=" + p.ytdlp,
    // mpv does not verify certificates unless told to.
    "--tls-verify=yes",
    // A stalled connection is retried, and a hanging one given up, sooner.
    "--network-timeout=10",
    // Starting Vulkan blocks long enough to interrupt the sound.
    "--gpu-api=opengl",
    // None of mpv's built-in scripts.
    "--osc=no",
    "--load-stats-overlay=no",
    "--load-console=no",
    "--load-commands=no",
    "--load-select=no",
    "--load-positioning=no",
    "--load-context-menu=no",
    "--load-auto-profiles=no",
    // No file next to the media is looked for.
    "--sub-auto=no",
    "--audio-file-auto=no",
    "--cover-art-auto=no",
    "--autoload-files=no",
    // Nothing dropped on the window is opened, no cookie file is read, and
    // a playlist cannot point mpv at local files.
    "--drag-and-drop=no",
    "--cookies=no",
    "--load-unsafe-playlists=no",
    // Nothing is written to disk.
    "--resume-playback=no",
    "--save-position-on-quit=no",
    "--save-watch-history=no",
    "--cache-on-disk=no",
    "--gpu-shader-cache=no",
    "--icc-cache=no",
    // Switched on over the socket only while video is shown.
    "--stop-screensaver=no",
    // Setting the property over the socket can still exceed this maximum,
    // so the player clamps as well.
    "--volume-max=100",
    "--volume=" + volume
  ]
  // Media keys. The script is optional, and it is named only when it is
  // known to be there.
  if (p.mpris === true) argv.push("--script=" + Const.MPRIS_SO)
  return argv
}

if (typeof module !== "undefined") {
  module.exports = { launch: launch }
}
