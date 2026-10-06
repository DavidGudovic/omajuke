.pragma library

// Input and expectation table for lib/MpvProto.js: what each command
// builder returns and refuses, which commands encode() will turn into a
// line, how feed() cuts a stream into lines and what it drops, and what
// parse() makes of the lines mpv can send, hostile ones included. The same
// table runs under node and inside Qt's JavaScript engine, so both must
// agree on every row. All ids and paths are synthetic.

var _ID = "AAAAAAAAAAA"
var _URL = "https://www.youtube.com/watch?v=AAAAAAAAAAA"
var _INFO_DIR = "/run/user/1000/omajuke/info"
var _INFO = _INFO_DIR + "/7.json"
var _INFO_OPTION = "load-info-json=" + _INFO

// The part of a resolved path table the load builder looks at.
var _PATHS = {
  ok: true,
  infoDir: _INFO_DIR,
  thumbsDir: "/run/user/1000/omajuke/thumbs",
  stateFile: "/data/state/omajuke/state.json"
}
// A table whose info directory could not stand inside an option value.
var _PATHS_COMMA = {
  ok: true,
  infoDir: "/run/user/1000/oma,juke/info",
  thumbsDir: "/run/user/1000/oma,juke/thumbs",
  stateFile: "/data/state/omajuke/state.json"
}
// Tables whose state file is named like an info file, beside the info
// directory and below it.
var _PATHS_STATE = {
  ok: true,
  infoDir: _INFO_DIR,
  thumbsDir: "/run/user/1000/omajuke/thumbs",
  stateFile: "/run/user/1000/omajuke/other/7.json"
}
var _PATHS_NESTED = {
  ok: true,
  infoDir: _INFO_DIR,
  thumbsDir: "/run/user/1000/omajuke/thumbs",
  stateFile: _INFO_DIR + "/sub/7.json"
}

var _CLOSE_WIN = ["keybind", "CLOSE_WIN", "set vid no; script-message omajuke-video-closed"]
var _NORM_ON = ["af", "add", "@omajuke-norm:dynaudnorm=f=250:g=31:p=0.9"]
var _NORM_OFF = ["af", "remove", "@omajuke-norm"]

// A copy of base with the members of changes laid over it. Only ever used on
// the literals of this file.
function _with(base, changes) {
  var copy = {}
  var key
  for (key in base) copy[key] = base[key]
  for (key in changes) copy[key] = changes[key]
  return copy
}

// A description of a load as the player hands it to the builder.
function _load(changes) {
  return _with({ id: _ID, title: "A title", infoFile: _INFO, mode: "replace" }, changes)
}

// The options of a load command, and the command itself.
function _options(changes) {
  return _with({ "force-media-title": "A title", "ytdl-raw-options-append": _INFO_OPTION }, changes)
}

// The options with another title, and with another info option.
function _titled(title) {
  return _options({ "force-media-title": title })
}

function _informed(option) {
  return _options({ "ytdl-raw-options-append": option })
}

function _command(url, mode, index, options) {
  return ["loadfile", url, mode, index, options]
}

// The line encode() writes for a command.
function _line(command, id) {
  return JSON.stringify({ command: command, request_id: id }) + "\n"
}

// A line as mpv would send it.
function _text(value) {
  return JSON.stringify(value)
}

// An event as parse() returns it, with single fields replaced.
function _event(name, changes) {
  // data is listed where parse() puts it: the comparison is by JSON text.
  return _with({
    kind: "event", event: name, id: 0, name: "", data: undefined, playlist_entry_id: 0, reason: "",
    file_error: "", args: []
  }, changes)
}

function _feed(lines, text, skipping, dropped) {
  return { lines: lines, pending: { text: text, skipping: skipping }, dropped: dropped }
}

var MODULE = "MpvProto"
var CASES = [
  // ---- Builders without arguments ----
  { fn: "closeWindowBind", args: [], expect: _CLOSE_WIN },
  { fn: "stop", args: [], expect: ["stop"] },
  { fn: "quit", args: [], expect: ["quit"] },
  { fn: "resetSpeed", args: [], expect: ["set_property", "speed", 1] },
  { fn: "handshake", args: [], expect: [
    _CLOSE_WIN,
    ["observe_property", 1, "idle-active"],
    ["observe_property", 2, "pause"],
    ["observe_property", 3, "core-idle"],
    ["observe_property", 4, "duration"],
    ["observe_property", 5, "volume"],
    ["observe_property", 6, "mute"],
    ["observe_property", 8, "speed"]
  ] },

  // ---- observe, unobserve: only names from the table ----
  { fn: "observe", args: ["idle-active"], expect: ["observe_property", 1, "idle-active"] },
  { fn: "observe", args: ["duration"], expect: ["observe_property", 4, "duration"] },
  { fn: "observe", args: ["time-pos"], expect: ["observe_property", 7, "time-pos"] },
  { fn: "observe", args: ["speed"], expect: ["observe_property", 8, "speed"] },
  { fn: "unobserve", args: ["time-pos"], expect: ["unobserve_property", 7] },
  { fn: "unobserve", args: ["duration"], expect: ["unobserve_property", 4] },
  { fn: "observe", args: ["user-data/mpv/ytdl/json-subprocess-result"], expect: null },
  { fn: "observe", args: ["user-data/mpv/ytdl/path"], expect: null },
  { fn: "observe", args: ["path"], expect: null },
  { fn: "observe", args: ["media-title"], expect: null },
  { fn: "observe", args: ["constructor"], expect: null },
  { fn: "observe", args: ["__proto__"], expect: null },
  { fn: "observe", args: ["length"], expect: null },
  { fn: "observe", args: [""], expect: null },
  { fn: "observe", args: [7], expect: null },
  { fn: "observe", args: [null], expect: null },
  { fn: "observe", args: [["pause"]], expect: null },
  { fn: "observe", args: [], expect: null },
  { fn: "unobserve", args: ["path"], expect: null },
  { fn: "unobserve", args: [7], expect: null },
  { fn: "unobserve", args: ["constructor"], expect: null },

  // ---- loadfile ----
  { fn: "loadfile", args: [_PATHS, _load({})], expect: _command(_URL, "replace", -1, _options({})) },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: 0, live: false })],
    expect: _command(_URL, "replace", -1, _options({})) },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "append-play" })],
    expect: _command(_URL, "append-play", -1, _options({})) },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at", index: 2 })],
    expect: _command(_URL, "insert-at", 2, _options({})) },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at", index: 0 })],
    expect: _command(_URL, "insert-at", 0, _options({})) },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at", index: 200 })],
    expect: _command(_URL, "insert-at", 200, _options({})) },
  // An index is read only where the mode has one.
  { fn: "loadfile", args: [_PATHS, _load({ index: 5 })],
    expect: _command(_URL, "replace", -1, _options({})) },
  // The start is whole seconds, as text, and absent at zero.
  { fn: "loadfile", args: [_PATHS, _load({ startAt: 75.9 })],
    expect: _command(_URL, "replace", -1, _options({ "start": "75" })) },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: 172800 })],
    expect: _command(_URL, "replace", -1, _options({ "start": "172800" })) },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: 0.9 })],
    expect: _command(_URL, "replace", -1, _options({})) },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: null })],
    expect: _command(_URL, "replace", -1, _options({})) },
  // A live stream never gets a start.
  { fn: "loadfile", args: [_PATHS, _load({ startAt: 75, live: true })],
    expect: _command(_URL, "replace", -1, _options({})) },
  // The title is data: whatever it holds stays one value of the options.
  { fn: "loadfile", args: [_PATHS, _load({ title: "A,vid=1,title=x \"q\" %5%${path}" })],
    expect: _command(_URL, "replace", -1, _titled("A,vid=1,title=x \"q\" %5%${path}")) },
  { fn: "loadfile", args: [_PATHS, _load({ title: "one\ntwo\u0000\u202e three" })],
    expect: _command(_URL, "replace", -1, _titled("one two three")) },
  { fn: "loadfile", args: [_PATHS, _load({ title: "" })],
    expect: _command(_URL, "replace", -1, _titled("OmaJuke")) },
  { fn: "loadfile", args: [_PATHS, _load({ title: " \u200b " })],
    expect: _command(_URL, "replace", -1, _titled("OmaJuke")) },
  { fn: "loadfile", args: [_PATHS, _load({ title: undefined })],
    expect: _command(_URL, "replace", -1, _titled("OmaJuke")) },
  { fn: "loadfile", args: [_PATHS, _load({ title: { toString: null } })],
    expect: _command(_URL, "replace", -1, _titled("OmaJuke")) },
  // Ids that look like an option or a prototype member are ordinary ids.
  { fn: "loadfile", args: [_PATHS, _load({ id: "--no-config" })],
    expect: _command("https://www.youtube.com/watch?v=--no-config", "replace", -1, _options({})) },
  { fn: "loadfile", args: [_PATHS, _load({ id: "constructor" })],
    expect: _command("https://www.youtube.com/watch?v=constructor", "replace", -1, _options({})) },
  // Not an id.
  { fn: "loadfile", args: [_PATHS, _load({ id: "AAAAAAAAAA" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ id: "AAAAAAAAAAAA" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ id: _URL })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ id: "AAAAAAAAAA\n" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ id: "../../../etc" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ id: null })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ id: undefined })], expect: null },
  // Not a mode.
  { fn: "loadfile", args: [_PATHS, _load({ mode: "append" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-next" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "constructor" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: ["replace"] })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: undefined })], expect: null },
  // Not an index.
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at", index: -1 })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at", index: 1.5 })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at", index: 201 })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ mode: "insert-at", index: "1" })], expect: null },
  // Not a start.
  { fn: "loadfile", args: [_PATHS, _load({ startAt: -1 })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: NaN })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: Infinity })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: 172801 })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: "60" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ startAt: "60,vid=1" })], expect: null },
  // Not one of our info files.
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: undefined })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: "" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: 7 })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: _INFO_DIR })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: _INFO_DIR + "/x.json" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: _INFO_DIR + "/7.json,vid=1" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: _INFO_DIR + "/7.json\n" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: _INFO_DIR + "/../7.json" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: _INFO_DIR + "/sub/7.json" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: _INFO_DIR + "/12345678901.json" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: "/run/user/1000/omajuke/thumbs/7.jpg" })],
    expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: "/run/user/1000/omajuke/thumbs/7.json" })],
    expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: "/etc/7.json" })], expect: null },
  { fn: "loadfile", args: [_PATHS, _load({ infoFile: "/data/state/omajuke/state.json" })], expect: null },
  { fn: "loadfile", args: [_PATHS_STATE, _load({ infoFile: "/run/user/1000/omajuke/other/7.json" })],
    expect: null },
  { fn: "loadfile", args: [_PATHS_NESTED, _load({ infoFile: _INFO_DIR + "/sub/7.json" })], expect: null },
  { fn: "loadfile", args: [_PATHS_NESTED, _load({})], expect: _command(_URL, "replace", -1, _options({})) },
  { fn: "loadfile", args: [_PATHS_COMMA, _load({ infoFile: "/run/user/1000/oma,juke/info/7.json" })],
    expect: null },
  { fn: "loadfile", args: [{ ok: false }, _load({})], expect: null },
  { fn: "loadfile", args: [null, _load({})], expect: null },
  // Not a description of a load at all.
  { fn: "loadfile", args: [_PATHS, null], expect: null },
  { fn: "loadfile", args: [_PATHS, "replace"], expect: null },
  { fn: "loadfile", args: [_PATHS, [_ID, "A title", _INFO, "replace"]], expect: null },
  { fn: "loadfile", args: [_PATHS], expect: null },

  // ---- Transport and volume ----
  { fn: "setPause", args: [true], expect: ["set_property", "pause", true] },
  { fn: "setPause", args: [false], expect: ["set_property", "pause", false] },
  { fn: "setPause", args: ["yes"], expect: null },
  { fn: "setPause", args: [1], expect: null },
  { fn: "setPause", args: [null], expect: null },
  { fn: "setPause", args: [], expect: null },
  { fn: "setMute", args: [true], expect: ["set_property", "mute", true] },
  { fn: "setMute", args: [false], expect: ["set_property", "mute", false] },
  { fn: "setMute", args: ["no"], expect: null },
  { fn: "setMute", args: [0], expect: null },
  { fn: "seek", args: [1.5, 3], expect: ["seek", 1.5, "absolute"] },
  { fn: "seek", args: [0, 213], expect: ["seek", 0, "absolute"] },
  { fn: "seek", args: [78.9444, 213], expect: ["seek", 78.944, "absolute"] },
  // The last second of a track is out of reach, and so is all behind it.
  { fn: "seek", args: [212.5, 213], expect: ["seek", 212, "absolute"] },
  { fn: "seek", args: [5000, 213], expect: ["seek", 212, "absolute"] },
  { fn: "seek", args: [-10, 213], expect: ["seek", 0, "absolute"] },
  { fn: "seek", args: [10, 0], expect: ["seek", 0, "absolute"] },
  { fn: "seek", args: [10, 0.5], expect: ["seek", 0, "absolute"] },
  { fn: "seek", args: [10, -5], expect: ["seek", 0, "absolute"] },
  { fn: "seek", args: [1e12, 1e12], expect: ["seek", 172800, "absolute"] },
  { fn: "seek", args: [0.0000001, 213], expect: ["seek", 0, "absolute"] },
  { fn: "seek", args: [NaN, 213], expect: null },
  { fn: "seek", args: [Infinity, 213], expect: null },
  { fn: "seek", args: [10, NaN], expect: null },
  { fn: "seek", args: [10, Infinity], expect: null },
  { fn: "seek", args: ["10", 213], expect: null },
  { fn: "seek", args: [10, "213"], expect: null },
  { fn: "seek", args: [10], expect: null },
  { fn: "seek", args: [null, null], expect: null },
  { fn: "setVolume", args: [70], expect: ["set_property", "volume", 70] },
  { fn: "setVolume", args: [0], expect: ["set_property", "volume", 0] },
  { fn: "setVolume", args: [100], expect: ["set_property", "volume", 100] },
  { fn: "setVolume", args: [150], expect: ["set_property", "volume", 100] },
  { fn: "setVolume", args: [1000], expect: ["set_property", "volume", 100] },
  { fn: "setVolume", args: [-5], expect: ["set_property", "volume", 0] },
  { fn: "setVolume", args: [69.5], expect: ["set_property", "volume", 70] },
  { fn: "setVolume", args: [100.4], expect: ["set_property", "volume", 100] },
  { fn: "setVolume", args: [NaN], expect: null },
  { fn: "setVolume", args: [Infinity], expect: null },
  { fn: "setVolume", args: ["70"], expect: null },
  { fn: "setVolume", args: [null], expect: null },
  { fn: "setVolume", args: [], expect: null },
  { fn: "setEvenVolume", args: [true], expect: _NORM_ON },
  { fn: "setEvenVolume", args: [false], expect: _NORM_OFF },
  { fn: "setEvenVolume", args: [1], expect: null },
  { fn: "setEvenVolume", args: ["on"], expect: null },
  { fn: "setEvenVolume", args: [], expect: null },

  // ---- Reads: only names from the list ----
  { fn: "getProperty", args: ["time-pos"], expect: ["get_property", "time-pos"] },
  { fn: "getProperty", args: ["playlist"], expect: ["get_property", "playlist"] },
  { fn: "getProperty", args: ["track-list"], expect: ["get_property", "track-list"] },
  { fn: "getProperty", args: ["audio-device-list"], expect: ["get_property", "audio-device-list"] },
  { fn: "getProperty", args: ["path"], expect: null },
  { fn: "getProperty", args: ["stream-open-filename"], expect: null },
  { fn: "getProperty", args: ["user-data/mpv/ytdl/json-subprocess-result"], expect: null },
  { fn: "getProperty", args: ["options/input-ipc-server"], expect: null },
  { fn: "getProperty", args: ["constructor"], expect: null },
  { fn: "getProperty", args: ["length"], expect: null },
  { fn: "getProperty", args: [0], expect: null },
  { fn: "getProperty", args: [["time-pos"]], expect: null },
  { fn: "getProperty", args: [], expect: null },

  // ---- encode: what the builders make ----
  { fn: "encode", args: [["stop"], 1], expect: "{\"command\":[\"stop\"],\"request_id\":1}\n" },
  { fn: "encode", args: [["quit"], 2], expect: _line(["quit"], 2) },
  { fn: "encode", args: [["set_property", "pause", true], 3],
    expect: "{\"command\":[\"set_property\",\"pause\",true],\"request_id\":3}\n" },
  { fn: "encode", args: [["set_property", "mute", false], 3],
    expect: _line(["set_property", "mute", false], 3) },
  { fn: "encode", args: [["set_property", "volume", 70], 4],
    expect: _line(["set_property", "volume", 70], 4) },
  { fn: "encode", args: [["set_property", "volume", 0], 4], expect: _line(["set_property", "volume", 0], 4) },
  { fn: "encode", args: [["set_property", "volume", 100], 4],
    expect: _line(["set_property", "volume", 100], 4) },
  { fn: "encode", args: [["set_property", "speed", 1], 4], expect: _line(["set_property", "speed", 1], 4) },
  { fn: "encode", args: [["seek", 78.944, "absolute"], 5], expect: _line(["seek", 78.944, "absolute"], 5) },
  { fn: "encode", args: [["seek", 0, "absolute"], 5], expect: _line(["seek", 0, "absolute"], 5) },
  { fn: "encode", args: [["observe_property", 7, "time-pos"], 6],
    expect: _line(["observe_property", 7, "time-pos"], 6) },
  { fn: "encode", args: [["unobserve_property", 7], 7], expect: _line(["unobserve_property", 7], 7) },
  { fn: "encode", args: [["get_property", "time-pos"], 8], expect: _line(["get_property", "time-pos"], 8) },
  { fn: "encode", args: [_CLOSE_WIN, 9], expect: _line(_CLOSE_WIN, 9) },
  { fn: "encode", args: [_NORM_ON, 10], expect: _line(_NORM_ON, 10) },
  { fn: "encode", args: [_NORM_OFF, 11], expect: _line(_NORM_OFF, 11) },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({})), 12],
    expect: "{\"command\":[\"loadfile\",\"https://www.youtube.com/watch?v=AAAAAAAAAAA\",\"replace\",-1,"
      + "{\"force-media-title\":\"A title\","
      + "\"ytdl-raw-options-append\":\"load-info-json=/run/user/1000/omajuke/info/7.json\"}],"
      + "\"request_id\":12}\n" },
  { fn: "encode", args: [_command(_URL, "append-play", -1, _options({ "start": "75" })), 12],
    expect: _line(_command(_URL, "append-play", -1, _options({ "start": "75" })), 12) },
  { fn: "encode", args: [_command(_URL, "insert-at", 3, _options({})), 12],
    expect: _line(_command(_URL, "insert-at", 3, _options({})), 12) },
  // A hostile title is still one string on one line.
  { fn: "encode",
    args: [_command(_URL, "replace", -1, _titled("a\"],\"x\":[\"run\",\"id\"],\"y\":[\"")), 13],
    expect: "{\"command\":[\"loadfile\",\"https://www.youtube.com/watch?v=AAAAAAAAAAA\",\"replace\",-1,"
      + "{\"force-media-title\":\"a\\\"],\\\"x\\\":[\\\"run\\\",\\\"id\\\"],\\\"y\\\":[\\\"\","
      + "\"ytdl-raw-options-append\":\"load-info-json=/run/user/1000/omajuke/info/7.json\"}],"
      + "\"request_id\":13}\n" },
  { fn: "encode", args: [["stop"], 14, true],
    expect: "{\"command\":[\"stop\"],\"request_id\":14,\"async\":true}\n" },
  { fn: "encode", args: [["stop"], 15, "yes"], expect: _line(["stop"], 15) },
  { fn: "encode", args: [["stop"], 9007199254740991], expect: _line(["stop"], 9007199254740991) },

  // ---- encode: request ids ----
  { fn: "encode", args: [["stop"], 0], expect: "" },
  { fn: "encode", args: [["stop"], -1], expect: "" },
  { fn: "encode", args: [["stop"], 1.5], expect: "" },
  { fn: "encode", args: [["stop"], "1"], expect: "" },
  { fn: "encode", args: [["stop"], NaN], expect: "" },
  { fn: "encode", args: [["stop"], Infinity], expect: "" },
  { fn: "encode", args: [["stop"], null], expect: "" },
  { fn: "encode", args: [["stop"]], expect: "" },

  // ---- encode: commands mpv knows and we never send ----
  { fn: "encode", args: [["run", "/usr/bin/id"], 1], expect: "" },
  { fn: "encode", args: [["subprocess", ["id"]], 1], expect: "" },
  { fn: "encode", args: [["request_log_messages", "v"], 1], expect: "" },
  { fn: "encode", args: [["load-script", "/tmp/x.lua"], 1], expect: "" },
  { fn: "encode", args: [["script-message", "x"], 1], expect: "" },
  { fn: "encode", args: [["loadlist", "/tmp/list"], 1], expect: "" },
  { fn: "encode", args: [["screenshot-to-file", "/tmp/x.png"], 1], expect: "" },
  { fn: "encode", args: [["write-watch-later-config"], 1], expect: "" },
  { fn: "encode", args: [["playlist-next", "weak"], 1], expect: "" },
  { fn: "encode", args: [["video-add", "https://example.com/v", "auto"], 1], expect: "" },
  { fn: "encode", args: [["client_name"], 1], expect: "" },
  { fn: "encode", args: [["constructor"], 1], expect: "" },
  { fn: "encode", args: [["__proto__"], 1], expect: "" },
  { fn: "encode", args: [[], 1], expect: "" },
  { fn: "encode", args: [[["stop"]], 1], expect: "" },
  { fn: "encode", args: ["stop", 1], expect: "" },
  { fn: "encode", args: ["quit\n", 1], expect: "" },
  { fn: "encode", args: [{ "0": "stop", length: 1 }, 1], expect: "" },
  { fn: "encode", args: [null, 1], expect: "" },
  { fn: "encode", args: [], expect: "" },

  // ---- encode: known names, wrong shapes ----
  { fn: "encode", args: [["stop", "keep-playlist"], 1], expect: "" },
  { fn: "encode", args: [["quit", 1], 1], expect: "" },
  { fn: "encode", args: [["keybind", "CLOSE_WIN", "quit"], 1], expect: "" },
  { fn: "encode", args: [["keybind", "q", "run id"], 1], expect: "" },
  { fn: "encode", args: [["keybind", "CLOSE_WIN"], 1], expect: "" },
  { fn: "encode", args: [["af", "add", "lavfi=[anull]"], 1], expect: "" },
  { fn: "encode", args: [["af", "set", ""], 1], expect: "" },
  { fn: "encode", args: [["observe_property", 7, "path"], 1], expect: "" },
  { fn: "encode", args: [["observe_property", 1, "time-pos"], 1], expect: "" },
  { fn: "encode", args: [["observe_property", 9, "user-data/mpv/ytdl/path"], 1], expect: "" },
  { fn: "encode", args: [["observe_property", "7", "time-pos"], 1], expect: "" },
  { fn: "encode", args: [["observe_property", 7, "time-pos", "x"], 1], expect: "" },
  { fn: "encode", args: [["observe_property", 7], 1], expect: "" },
  { fn: "encode", args: [["unobserve_property", 9], 1], expect: "" },
  { fn: "encode", args: [["unobserve_property", "7"], 1], expect: "" },
  { fn: "encode", args: [["unobserve_property"], 1], expect: "" },
  { fn: "encode", args: [["get_property", "path"], 1], expect: "" },
  { fn: "encode", args: [["get_property", "user-data/mpv/ytdl/json-subprocess-result"], 1], expect: "" },
  { fn: "encode", args: [["get_property", "time-pos", "x"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "volume", 101], 1], expect: "" },
  { fn: "encode", args: [["set_property", "volume", -1], 1], expect: "" },
  { fn: "encode", args: [["set_property", "volume", 70.5], 1], expect: "" },
  { fn: "encode", args: [["set_property", "volume", "70"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "speed", 2], 1], expect: "" },
  { fn: "encode", args: [["set_property", "speed", "1"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "pause", "yes"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "mute", 1], 1], expect: "" },
  { fn: "encode", args: [["set_property", "input-ipc-server", "/tmp/x"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "ytdl-raw-options", "exec=id"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "script-opts", "x=y"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "constructor", true], 1], expect: "" },
  { fn: "encode", args: [["set_property", "pause"], 1], expect: "" },
  { fn: "encode", args: [["set_property", "pause", true, true], 1], expect: "" },
  { fn: "encode", args: [["seek", 10, "relative"], 1], expect: "" },
  { fn: "encode", args: [["seek", -1, "absolute"], 1], expect: "" },
  { fn: "encode", args: [["seek", "10", "absolute"], 1], expect: "" },
  { fn: "encode", args: [["seek", NaN, "absolute"], 1], expect: "" },
  { fn: "encode", args: [["seek", 172801, "absolute"], 1], expect: "" },
  { fn: "encode", args: [["seek", 10], 1], expect: "" },

  // ---- encode: a load that no builder made ----
  { fn: "encode", args: [_command("/etc/passwd", "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command("file:///etc/passwd", "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command("https://example.com/a.mp4", "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command("https://youtu.be/AAAAAAAAAAA", "replace", -1, _options({})), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL + "&list=PL0123456789", "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(_URL + "\n", "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(" " + _URL, "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode",
    args: [_command("http://www.youtube.com/watch?v=AAAAAAAAAAA", "replace", -1, _options({})), 1],
    expect: "" },
  { fn: "encode", args: [_command(_ID, "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(null, "replace", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "append", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", 0, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", "-1", _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "insert-at", -1, _options({})), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "insert-at", 201, _options({})), 1], expect: "" },
  { fn: "encode", args: [["loadfile", _URL, "replace", -1], 1], expect: "" },
  { fn: "encode", args: [["loadfile", _URL, "replace"], 1], expect: "" },
  { fn: "encode", args: [["loadfile", _URL], 1], expect: "" },
  { fn: "encode", args: [["loadfile", _URL, "replace", -1, _options({}), "x"], 1], expect: "" },
  // The text form of the options, where a comma in a title adds an option.
  { fn: "encode", args: [_command(_URL, "replace", -1, "force-media-title=x,vid=1"), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, null), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, []), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, {}), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, { "force-media-title": "t" }), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, { "ytdl-raw-options-append": _INFO_OPTION }), 1],
    expect: "" },
  // An option we did not choose.
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "vid": "1" })), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "ytdl-raw-options": "exec=id" })), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "constructor": "x" })), 1], expect: "" },
  // Values that are not what the builder writes.
  { fn: "encode", args: [_command(_URL, "replace", -1, _informed("exec=id")), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _informed("load-info-json=/etc/passwd")), 1],
    expect: "" },
  // Another option of the same length in front of one of our files.
  { fn: "encode", args: [_command(_URL, "replace", -1, _informed("exec-before-dl=" + _INFO)), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _informed(_INFO_OPTION + ",exec=id")), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "ytdl-raw-options-append": 7 })), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "force-media-title": "" })), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "force-media-title": "a\nb" })), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "force-media-title": " padded " })), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "force-media-title": 5 })), 1],
    expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "start": 60 })), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "start": "0" })), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "start": "50%" })), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "start": "-5" })), 1], expect: "" },
  { fn: "encode", args: [_command(_URL, "replace", -1, _options({ "start": "172801" })), 1], expect: "" },

  // ---- feed ----
  { fn: "feed", args: [null, "{\"a\":1}\n", 100], expect: _feed(["{\"a\":1}"], "", false, 0) },
  { fn: "feed", args: [null, "one\ntwo\nthr", 100], expect: _feed(["one", "two"], "thr", false, 0) },
  { fn: "feed", args: [{ text: "thr", skipping: false }, "ee\nfour\n", 100],
    expect: _feed(["three", "four"], "", false, 0) },
  { fn: "feed", args: [{ text: "abc", skipping: false }, "", 100], expect: _feed([], "abc", false, 0) },
  { fn: "feed", args: [{ text: "abc", skipping: false }, "\n", 100], expect: _feed(["abc"], "", false, 0) },
  // Empty lines are nothing.
  { fn: "feed", args: [null, "\n\n\none\n\n", 100], expect: _feed(["one"], "", false, 0) },
  // Exactly the cap is kept, one more is dropped.
  { fn: "feed", args: [null, "12345\n", 5], expect: _feed(["12345"], "", false, 0) },
  { fn: "feed", args: [null, "123456\nok\n", 5], expect: _feed(["ok"], "", false, 1) },
  { fn: "feed", args: [{ text: "123", skipping: false }, "45\nok\n", 5],
    expect: _feed(["12345", "ok"], "", false, 0) },
  { fn: "feed", args: [{ text: "123", skipping: false }, "456\nok\n", 5],
    expect: _feed(["ok"], "", false, 1) },
  // An unfinished line that passes the cap is given up at once ...
  { fn: "feed", args: [null, "12345", 5], expect: _feed([], "12345", false, 0) },
  { fn: "feed", args: [null, "123456", 5], expect: _feed([], "", true, 1) },
  { fn: "feed", args: [{ text: "123", skipping: false }, "456", 5], expect: _feed([], "", true, 1) },
  // ... its rest is discarded without being counted again ...
  { fn: "feed", args: [{ text: "", skipping: true }, "789789789", 5], expect: _feed([], "", true, 0) },
  // ... and reading resumes behind its line break.
  { fn: "feed", args: [{ text: "", skipping: true }, "789\nok\nne", 5],
    expect: _feed(["ok"], "ne", false, 0) },
  { fn: "feed", args: [{ text: "", skipping: true }, "\n", 5], expect: _feed([], "", false, 0) },
  { fn: "feed", args: [{ text: "", skipping: true }, "x\n123456", 5], expect: _feed([], "", true, 1) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "a", count: 300000 }, 65536],
    expect: _feed([], "", true, 1) },
  { fn: "feed", args: [{ text: "", skipping: true }, { gen: "repeat", unit: "a", count: 300000 }, 65536],
    expect: _feed([], "", true, 0) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "ab\n", count: 4 }, 65536],
    expect: _feed(["ab", "ab", "ab", "ab"], "", false, 0) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "abcdef\n", count: 1000 }, 5],
    expect: _feed([], "", false, 1000) },
  // A cap that is no cap falls back to the real one: never unbounded.
  { fn: "feed", args: [null, { gen: "repeat", unit: "a", count: 65537 }], expect: _feed([], "", true, 1) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "a", count: 65537 }, 0], expect: _feed([], "", true, 1) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "a", count: 65537 }, -1],
    expect: _feed([], "", true, 1) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "a", count: 65537 }, NaN],
    expect: _feed([], "", true, 1) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "a", count: 65537 }, Infinity],
    expect: _feed([], "", true, 1) },
  { fn: "feed", args: [null, { gen: "repeat", unit: "a", count: 65537 }, "5"],
    expect: _feed([], "", true, 1) },
  // Odd inputs read as nothing held and nothing received.
  { fn: "feed", args: [undefined, "ab\n", 100], expect: _feed(["ab"], "", false, 0) },
  { fn: "feed", args: ["held", "ab\n", 100], expect: _feed(["ab"], "", false, 0) },
  { fn: "feed", args: [{ text: 5, skipping: "yes" }, "ab\n", 100], expect: _feed(["ab"], "", false, 0) },
  { fn: "feed", args: [null, null, 100], expect: _feed([], "", false, 0) },
  { fn: "feed", args: [null, 5, 100], expect: _feed([], "", false, 0) },
  { fn: "feed", args: [{ text: "ab", skipping: false }, ["c\n"], 100], expect: _feed([], "ab", false, 0) },
  { fn: "feed", args: [], expect: _feed([], "", false, 0) },

  // ---- parse: replies ----
  { fn: "parse", args: ["{\"data\":{\"playlist_entry_id\":2},\"request_id\":4,\"error\":\"success\"}"],
    expect: { kind: "reply", request_id: 4, error: "", data: { playlist_entry_id: 2 } } },
  { fn: "parse", args: [_text({ request_id: 5, error: "success" })],
    expect: { kind: "reply", request_id: 5, error: "" } },
  { fn: "parse", args: [_text({ data: null, request_id: 6, error: "success" })],
    expect: { kind: "reply", request_id: 6, error: "", data: null } },
  { fn: "parse", args: [_text({ data: 0.160675, request_id: 12, error: "success" })],
    expect: { kind: "reply", request_id: 12, error: "", data: 0.160675 } },
  { fn: "parse", args: [_text({ request_id: 7, error: "property unavailable" })],
    expect: { kind: "reply", request_id: 7, error: "property unavailable" } },
  // The data of a failed request is not passed on.
  { fn: "parse", args: [_text({ data: 5, request_id: 7, error: "invalid parameter" })],
    expect: { kind: "reply", request_id: 7, error: "invalid parameter" } },
  // A failure never reads as a success.
  { fn: "parse", args: [_text({ request_id: 8 })],
    expect: { kind: "reply", request_id: 8, error: "failed" } },
  { fn: "parse", args: [_text({ request_id: 8, error: "" })],
    expect: { kind: "reply", request_id: 8, error: "failed" } },
  { fn: "parse", args: [_text({ request_id: 8, error: null })],
    expect: { kind: "reply", request_id: 8, error: "failed" } },
  { fn: "parse", args: [_text({ request_id: 8, error: ["success"] })],
    expect: { kind: "reply", request_id: 8, error: "failed" } },
  { fn: "parse", args: [_text({ request_id: 8, error: "line\nbreak" })],
    expect: { kind: "reply", request_id: 8, error: "failed" } },
  { fn: "parse", args: [_text({ request_id: 8, error: "success " })],
    expect: { kind: "reply", request_id: 8, error: "success " } },
  { fn: "parse", args: [_text({ data: 5, request_id: 8, error: "Success" })],
    expect: { kind: "reply", request_id: 8, error: "Success" } },
  // Ids we cannot have sent.
  { fn: "parse", args: [_text({ request_id: 0, error: "success" })], expect: null },
  { fn: "parse", args: [_text({ request_id: -1, error: "success" })], expect: null },
  { fn: "parse", args: [_text({ request_id: 1.5, error: "success" })], expect: null },
  { fn: "parse", args: [_text({ request_id: "4", error: "success" })], expect: null },
  { fn: "parse", args: [_text({ request_id: null, error: "success" })], expect: null },
  { fn: "parse", args: [_text({ request_id: [4], error: "success" })], expect: null },
  // A request id decides: such a line is never taken for an event.
  { fn: "parse", args: [_text({ request_id: 0, event: "start-file", playlist_entry_id: 1 })], expect: null },
  { fn: "parse", args: [_text({ request_id: 3, event: "start-file", error: "success" })],
    expect: { kind: "reply", request_id: 3, error: "" } },

  // ---- parse: events ----
  { fn: "parse", args: ["{\"event\":\"file-loaded\"}"], expect: _event("file-loaded", {}) },
  { fn: "parse", args: [_text({ event: "playback-restart" })], expect: _event("playback-restart", {}) },
  { fn: "parse", args: [_text({ event: "start-file", playlist_entry_id: 1 })],
    expect: _event("start-file", { playlist_entry_id: 1 }) },
  { fn: "parse",
    args: [_text({ event: "end-file", reason: "error", playlist_entry_id: 6, file_error: "loading failed" })],
    expect: _event("end-file", { playlist_entry_id: 6, reason: "error", file_error: "loading failed" }) },
  { fn: "parse", args: [_text({ event: "property-change", id: 2, name: "pause", data: true })],
    expect: _event("property-change", { id: 2, name: "pause", data: true }) },
  { fn: "parse", args: [_text({ event: "property-change", id: 4, name: "duration", data: 213.5 })],
    expect: _event("property-change", { id: 4, name: "duration", data: 213.5 }) },
  // mpv leaves the value out when a property has none.
  { fn: "parse", args: [_text({ event: "property-change", id: 4, name: "duration" })],
    expect: _event("property-change", { id: 4, name: "duration" }) },
  // The value is passed on as it came, whatever it is.
  { fn: "parse", args: [_text({ event: "property-change", id: 2, name: "pause", data: { deep: [1, "x"] } })],
    expect: _event("property-change", { id: 2, name: "pause", data: { deep: [1, "x"] } }) },
  { fn: "parse", args: [_text({ event: "client-message", args: ["omajuke-video-closed"] })],
    expect: _event("client-message", { args: ["omajuke-video-closed"] }) },
  { fn: "parse", args: ["  {\"event\":\"file-loaded\"}  "], expect: _event("file-loaded", {}) },
  // Keys we do not know are not carried along.
  { fn: "parse", args: [_text({ event: "file-loaded", kind: "reply", x: 1, constructor: 2, toString: 3 })],
    expect: _event("file-loaded", {}) },
  { fn: "parse",
    args: ["{\"event\":\"file-loaded\",\"__proto__\":{\"reason\":\"eof\",\"playlist_entry_id\":9}}"],
    expect: _event("file-loaded", {}) },
  // Fields of the wrong type or shape read as absent.
  { fn: "parse", args: [_text({ event: "end-file", reason: 5, playlist_entry_id: "6", file_error: ["x"] })],
    expect: _event("end-file", {}) },
  { fn: "parse", args: [_text({ event: "start-file", playlist_entry_id: 0 })],
    expect: _event("start-file", {}) },
  { fn: "parse", args: [_text({ event: "start-file", playlist_entry_id: -3 })],
    expect: _event("start-file", {}) },
  { fn: "parse", args: [_text({ event: "start-file", playlist_entry_id: 2.5 })],
    expect: _event("start-file", {}) },
  { fn: "parse", args: [_text({ event: "start-file", playlist_entry_id: { valueOf: 1 } })],
    expect: _event("start-file", {}) },
  { fn: "parse", args: [_text({ event: "property-change", id: "2", name: 7 })],
    expect: _event("property-change", {}) },
  { fn: "parse", args: [_text({ event: "end-file", reason: "e\u0000f", file_error: "a\nb" })],
    expect: _event("end-file", {}) },
  { fn: "parse", args: [_text({ event: "end-file", reason: "\u202eeof" })], expect: _event("end-file", {}) },
  { fn: "parse", args: [_text({ event: "client-message", args: "omajuke-video-closed" })],
    expect: _event("client-message", {}) },
  { fn: "parse", args: [_text({ event: "client-message", args: ["omajuke-video-closed", 5] })],
    expect: _event("client-message", {}) },
  { fn: "parse",
    args: [_text({ event: "client-message", args: ["1", "2", "3", "4", "5", "6", "7", "8", "9"] })],
    expect: _event("client-message", {}) },
  { fn: "parse", args: [_text({ event: "client-message", args: { "0": "omajuke-video-closed", length: 1 } })],
    expect: _event("client-message", {}) },
  // Not an event name.
  { fn: "parse", args: [_text({ event: "" })], expect: null },
  { fn: "parse", args: [_text({ event: 5 })], expect: null },
  { fn: "parse", args: [_text({ event: null })], expect: null },
  { fn: "parse", args: [_text({ event: ["start-file"] })], expect: null },
  { fn: "parse", args: [_text({ event: "start\nfile" })], expect: null },
  // {"event":"<half a surrogate pair>"}
  { fn: "parse",
    args: [{ gen: "codes", codes: [123, 34, 101, 118, 101, 110, 116, 34, 58, 34, 55357, 34, 125] }],
    expect: null },

  // ---- parse: not a message ----
  { fn: "parse", args: [""], expect: null },
  { fn: "parse", args: ["null"], expect: null },
  { fn: "parse", args: ["true"], expect: null },
  { fn: "parse", args: ["5"], expect: null },
  { fn: "parse", args: ["\"event\""], expect: null },
  { fn: "parse", args: ["[]"], expect: null },
  { fn: "parse", args: ["[{\"event\":\"file-loaded\"}]"], expect: null },
  { fn: "parse", args: ["{}"], expect: null },
  { fn: "parse", args: [_text({ data: 1, error: "success" })], expect: null },
  { fn: "parse", args: ["{\"__proto__\":{\"event\":\"start-file\",\"request_id\":3}}"], expect: null },
  { fn: "parse", args: ["{\"event\":\"file-loaded\""], expect: null },
  { fn: "parse", args: ["{\"event\":\"file-loaded\"}{\"event\":\"file-loaded\"}"], expect: null },
  { fn: "parse", args: ["{'event':'file-loaded'}"], expect: null },
  { fn: "parse", args: ["{event:\"file-loaded\"}"], expect: null },
  { fn: "parse", args: ["quit"], expect: null },
  { fn: "parse", args: [{ gen: "repeat", unit: "[", count: 20000 }], expect: null },
  { fn: "parse", args: [{ gen: "repeat", unit: "{\"a\":", count: 10000 }], expect: null },
  // Longer than a line may be.
  { fn: "parse", args: [{ gen: "repeat", unit: " ", count: 65537 }], expect: null },
  { fn: "parse", args: [{ gen: "repeat", unit: "{\"event\":\"file-loaded\"}", count: 3000 }], expect: null },
  { fn: "parse", args: [null], expect: null },
  { fn: "parse", args: [5], expect: null },
  { fn: "parse", args: [{ event: "file-loaded" }], expect: null },
  { fn: "parse", args: [["{\"event\":\"file-loaded\"}"]], expect: null },
  { fn: "parse", args: [], expect: null },

  // ---- entryId ----
  { fn: "entryId", args: [{ playlist_entry_id: 1 }], expect: 1 },
  { fn: "entryId", args: [{ playlist_entry_id: 4711, other: true }], expect: 4711 },
  { fn: "entryId", args: [{ playlist_entry_id: 0 }], expect: 0 },
  { fn: "entryId", args: [{ playlist_entry_id: -1 }], expect: 0 },
  { fn: "entryId", args: [{ playlist_entry_id: 1.5 }], expect: 0 },
  { fn: "entryId", args: [{ playlist_entry_id: "1" }], expect: 0 },
  { fn: "entryId", args: [{ playlist_entry_id: NaN }], expect: 0 },
  { fn: "entryId", args: [{ playlist_entry_id: Infinity }], expect: 0 },
  { fn: "entryId", args: [{ playlist_entry_id: null }], expect: 0 },
  { fn: "entryId", args: [{}], expect: 0 },
  { fn: "entryId", args: [[1]], expect: 0 },
  { fn: "entryId", args: [1], expect: 0 },
  { fn: "entryId", args: ["1"], expect: 0 },
  { fn: "entryId", args: [null], expect: 0 },
  { fn: "entryId", args: [], expect: 0 }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
