.pragma library

// Input and expectation table for lib/Paths.js: which environments yield
// a table of paths and which are refused, which exact paths the plugin may
// write or remove, and how runtime files are named. The same table runs
// under node and inside Qt's JavaScript engine.

// The usual session, and the table resolve() returns for it.
var _ENV = {
  XDG_RUNTIME_DIR: "/run/user/1000",
  XDG_STATE_HOME: null,
  XDG_DATA_HOME: null,
  HOME: "/home/user"
}
var _ENV_EMPTY_XDG = {
  XDG_RUNTIME_DIR: "/run/user/1000",
  XDG_STATE_HOME: "",
  XDG_DATA_HOME: "",
  HOME: "/home/user"
}
var _PATHS = {
  ok: true,
  runtimeBase: "/run/user/1000",
  runtimeDir: "/run/user/1000/omajuke",
  sock: "/run/user/1000/omajuke/mpv.sock",
  infoDir: "/run/user/1000/omajuke/info",
  thumbsDir: "/run/user/1000/omajuke/thumbs",
  ytCacheDir: "/run/user/1000/omajuke/ytcache",
  denoDir: "/run/user/1000/omajuke/deno",
  jarDir: "/run/user/1000/omajuke/jar",
  signinDir: "/run/user/1000/omajuke/signin",
  stateDir: "/home/user/.local/state/omajuke",
  stateFile: "/home/user/.local/state/omajuke/state.json",
  dataDir: "/home/user/.local/share/omajuke",
  jarFile: "/home/user/.local/share/omajuke/cookies.txt"
}

// A session that sets every XDG variable. The doubled and trailing slashes
// must not survive into the table.
var _ENV_XDG = {
  XDG_RUNTIME_DIR: "/tmp/oj-test.1/run_dir",
  XDG_STATE_HOME: "/data/my state/",
  XDG_DATA_HOME: "/data//share",
  HOME: "/ignored"
}
var _PATHS_XDG = {
  ok: true,
  runtimeBase: "/tmp/oj-test.1/run_dir",
  runtimeDir: "/tmp/oj-test.1/run_dir/omajuke",
  sock: "/tmp/oj-test.1/run_dir/omajuke/mpv.sock",
  infoDir: "/tmp/oj-test.1/run_dir/omajuke/info",
  thumbsDir: "/tmp/oj-test.1/run_dir/omajuke/thumbs",
  ytCacheDir: "/tmp/oj-test.1/run_dir/omajuke/ytcache",
  denoDir: "/tmp/oj-test.1/run_dir/omajuke/deno",
  jarDir: "/tmp/oj-test.1/run_dir/omajuke/jar",
  signinDir: "/tmp/oj-test.1/run_dir/omajuke/signin",
  stateDir: "/data/my state/omajuke",
  stateFile: "/data/my state/omajuke/state.json",
  dataDir: "/data/share/omajuke",
  jarFile: "/data/share/omajuke/cookies.txt"
}

var _NO = { ok: false }

var MODULE = "Paths"
var CASES = [
  // ---- resolve: accepted ----
  { fn: "resolve", args: [_ENV], expect: _PATHS },
  { fn: "resolve", args: [_ENV_XDG], expect: _PATHS_XDG },
  { fn: "resolve", args: [_ENV_EMPTY_XDG], expect: _PATHS },

  // ---- resolve: the runtime base is refused, and nothing falls back to a shared directory ----
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: null, HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "run/user/1000", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "./run", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "~/run", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000/", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "//run/user/1000", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run//user/1000", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/./user/1000", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/../../etc", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000/..", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000/.", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/my dir", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000\n", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000\n/x", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000;x", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/$(id)", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000,x", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/a'b", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/a\"b", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/a\\b", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/a=b", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/caf\u00e9", HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000\u0000", HOME: "/home/user" }], expect: _NO },
  // One character more than the base may have.
  { fn: "resolve",
    args: [{ XDG_RUNTIME_DIR: "/run/user/1000/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: 1000, HOME: "/home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: ["/run/user/1000"], HOME: "/home/user" }], expect: _NO },

  // ---- resolve: the state or data base is refused ----
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", HOME: null }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", HOME: "" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", HOME: "home/user" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", HOME: 1000 }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: "/s", HOME: null }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_DATA_HOME: "/d", HOME: null }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: "state", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve",
    args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: "~/state", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve",
    args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: "/a/../b", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: "/a/..", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: "/a\nb", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve",
    args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_DATA_HOME: "/a\u007fb", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_DATA_HOME: "data", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve",
    args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_DATA_HOME: "/a/../b", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_DATA_HOME: "/a::b", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", XDG_DATA_HOME: "/a,b", HOME: "/home/user" }],
    expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", HOME: "/home/user/a,b" }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", HOME: "/home/user/.." }], expect: _NO },
  { fn: "resolve", args: [{ XDG_RUNTIME_DIR: "/run/user/1000", HOME: "/home/user\tname" }], expect: _NO },
  { fn: "resolve", args: [null], expect: _NO },
  { fn: "resolve", args: ["/run/user/1000"], expect: _NO },
  { fn: "resolve", args: [1000], expect: _NO },

  // ---- owns: the exact shapes ----
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke/state.json"], expect: true },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1.json"], expect: true },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/0.json"], expect: true },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/9999999999.json"], expect: true },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/thumbs/12.jpg"], expect: true },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/thumbs/9999999999.jpg"], expect: true },
  { fn: "owns", args: [_PATHS_XDG, "/data/my state/omajuke/state.json"], expect: true },
  { fn: "owns", args: [_PATHS_XDG, "/tmp/oj-test.1/run_dir/omajuke/info/7.json"], expect: true },

  // ---- owns: near misses ----
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/12345678901.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1.jpg"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/thumbs/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1.JSON"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1.json/"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1.json\n"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1.json.bak"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info//1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/a.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1a.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/-1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/+1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/1.5.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/ 1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/\u0661.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/Abc123Def4Q.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/sub/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/../info/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/../../../../../etc/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/infox/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/info/"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/mpv.sock"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/ytcache/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/deno/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/jar/1.txt"], expect: false },
  { fn: "owns", args: [_PATHS, "/run/user/1000/omajuke/signin/1"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/share/omajuke/cookies.txt"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke/"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke/state.json/"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke/state.json.bak"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke/.state.json.AbC123"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke/../omajuke/state.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke//state.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.local/state/omajuke/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "state.json"], expect: false },
  { fn: "owns", args: [_PATHS, "info/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/1.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/etc/passwd"], expect: false },
  { fn: "owns", args: [_PATHS, ""], expect: false },
  // Places the plugin must never write to.
  { fn: "owns", args: [_PATHS, "/home/user/.config/hypr/bindings.lua"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.config/omarchy/shell.json"], expect: false },
  { fn: "owns", args: [_PATHS, "/home/user/.config/omarchy/plugins/davidgudovic.omajuke/1.json"],
    expect: false },
  { fn: "owns", args: [_PATHS, "/usr/share/omarchy/shell/shell.qml"], expect: false },
  { fn: "owns", args: [_PATHS, null], expect: false },
  { fn: "owns", args: [_PATHS, 1], expect: false },
  { fn: "owns", args: [_PATHS, ["/run/user/1000/omajuke/info/1.json"]], expect: false },
  // A table that resolve() did not vouch for owns nothing.
  { fn: "owns", args: [_NO, "/home/user/.local/state/omajuke/state.json"], expect: false },
  { fn: "owns", args: [null, "/run/user/1000/omajuke/info/1.json"], expect: false },
  { fn: "owns", args: ["/run/user/1000/omajuke/info", "/run/user/1000/omajuke/info/1.json"], expect: false },
  { fn: "owns", args: [{ ok: true }, "/1.json"], expect: false },
  { fn: "owns", args: [{ ok: true }, "undefined/1.json"], expect: false },
  { fn: "owns", args: [{ ok: true, infoDir: "", thumbsDir: "", stateFile: "" }, "/1.json"], expect: false },
  { fn: "owns", args: [{ ok: true, infoDir: "", thumbsDir: "", stateFile: "" }, ""], expect: false },
  { fn: "owns", args: [{ ok: true, infoDir: "info" }, "info/1.json"], expect: false },
  { fn: "owns", args: [{ ok: 1, infoDir: "/i", thumbsDir: "/t", stateFile: "/s" }, "/i/1.json"],
    expect: false },

  // ---- infoFile, thumbFile: named by a counter and by nothing else ----
  { fn: "infoFile", args: [_PATHS, 1], expect: "/run/user/1000/omajuke/info/1.json" },
  { fn: "infoFile", args: [_PATHS, 9999999999], expect: "/run/user/1000/omajuke/info/9999999999.json" },
  { fn: "thumbFile", args: [_PATHS, 12], expect: "/run/user/1000/omajuke/thumbs/12.jpg" },
  { fn: "thumbFile", args: [_PATHS, 9999999999], expect: "/run/user/1000/omajuke/thumbs/9999999999.jpg" },
  { fn: "infoFile", args: [_PATHS, 0], expect: "" },
  { fn: "infoFile", args: [_PATHS, -1], expect: "" },
  { fn: "infoFile", args: [_PATHS, 1.5], expect: "" },
  { fn: "infoFile", args: [_PATHS, 10000000000], expect: "" },
  { fn: "infoFile", args: [_PATHS, 1e21], expect: "" },
  { fn: "infoFile", args: [_PATHS, "1"], expect: "" },
  { fn: "infoFile", args: [_PATHS, "Abc123Def4Q"], expect: "" },
  { fn: "infoFile", args: [_PATHS, "../../x"], expect: "" },
  { fn: "infoFile", args: [_PATHS, null], expect: "" },
  { fn: "infoFile", args: [_PATHS, true], expect: "" },
  { fn: "infoFile", args: [_PATHS, [1]], expect: "" },
  { fn: "infoFile", args: [_NO, 1], expect: "" },
  { fn: "infoFile", args: [null, 1], expect: "" },
  { fn: "thumbFile", args: [_PATHS, 0], expect: "" },
  { fn: "thumbFile", args: [_PATHS, 2.5], expect: "" },
  { fn: "thumbFile", args: [_PATHS, "12"], expect: "" },
  { fn: "thumbFile", args: [_PATHS, "Abc123Def4Q"], expect: "" },
  { fn: "thumbFile", args: [_PATHS, null], expect: "" },
  { fn: "thumbFile", args: [_NO, 12], expect: "" },
  { fn: "thumbFile", args: [null, 12], expect: "" }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
