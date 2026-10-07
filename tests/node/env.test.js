"use strict"
// Tests for lib/Env.js: what each child environment profile contains, that
// none of them can carry a proxy setting or anything beyond the documented
// names, that the sign-in browser gets a configuration directory of its
// own, and when the session counts as having a proxy.
var test = require("node:test")
var assert = require("node:assert")
var load = require("./load.js")

var Env = load.lib("Env")
var Paths = load.lib("Paths")

var paths = Paths.resolve({
  XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
})

var LOCAL = { PATH: "/usr/bin", LANG: "C.UTF-8", HOME: null, XDG_RUNTIME_DIR: null }
var NET = Object.assign({}, LOCAL, { DENO_NO_UPDATE_CHECK: "1", DENO_DIR: "/run/user/1000/omajuke/deno" })
// What a window needs from the session: the cursor, and the choice of a
// graphics driver.
var WINDOW = [
  "XCURSOR_THEME", "XCURSOR_SIZE", "LIBVA_DRIVER_NAME", "GBM_BACKEND", "__GLX_VENDOR_LIBRARY_NAME",
  "__EGL_VENDOR_LIBRARY_FILENAMES", "NVD_BACKEND"
]
var MPV = Object.assign({}, NET, { WAYLAND_DISPLAY: null, DBUS_SESSION_BUS_ADDRESS: null })
WINDOW.forEach(function(name) { MPV[name] = null })
var HYPR = Object.assign({}, LOCAL, { HYPRLAND_INSTANCE_SIGNATURE: null })
var ATTEMPT = "/run/user/1000/omajuke/signin/3"
var BROWSER = {
  PATH: "/usr/bin", XDG_CONFIG_HOME: ATTEMPT + "/config", HOME: null, XDG_RUNTIME_DIR: null,
  WAYLAND_DISPLAY: null, DISPLAY: null, DBUS_SESSION_BUS_ADDRESS: null, XDG_CURRENT_DESKTOP: null,
  XDG_SESSION_TYPE: null, XDG_DATA_DIRS: null, LANG: null
}

var PROXY_NAMES = ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]

function profiles() {
  return {
    local: Env.local(), net: Env.net(paths), mpv: Env.mpv(paths), hypr: Env.hypr(),
    browser: Env.browser(ATTEMPT)
  }
}

test("the paths used here resolve", function() {
  assert.strictEqual(paths.ok, true)
})

test("each profile holds exactly its documented variables", function() {
  var all = profiles()
  assert.deepStrictEqual(all.local, LOCAL)
  assert.deepStrictEqual(all.net, NET)
  assert.deepStrictEqual(all.mpv, MPV)
  assert.deepStrictEqual(all.hypr, HYPR)
  assert.deepStrictEqual(all.browser, BROWSER)
  assert.strictEqual(ATTEMPT, Paths.signinAttemptDir(paths, 3))
})

test("a value is a fixed string or null, never anything else", function() {
  var all = profiles()
  Object.keys(all).forEach(function(name) {
    Object.keys(all[name]).forEach(function(key) {
      var value = all[name][key]
      assert.ok(value === null || (typeof value === "string" && value !== ""), name + "." + key)
      assert.match(key, /^[A-Z_][A-Z0-9_]*$/, name + "." + key)
    })
  })
})

test("no profile names or carries a proxy", function() {
  var all = profiles()
  Object.keys(all).forEach(function(name) {
    var keys = Object.keys(all[name])
    PROXY_NAMES.concat(["no_proxy", "NO_PROXY", "ftp_proxy", "FTP_PROXY"]).forEach(function(proxy) {
      assert.ok(keys.indexOf(proxy) === -1, name + " has " + proxy)
    })
    assert.ok(!/proxy/i.test(JSON.stringify(all[name])), name + " mentions a proxy")
  })
})

test("no profile hands on more of the session than it must", function() {
  var all = profiles()
  var passed = function(profile) {
    return Object.keys(profile).filter(function(key) { return profile[key] === null }).sort()
  }
  assert.deepStrictEqual(passed(all.local), ["HOME", "XDG_RUNTIME_DIR"])
  assert.deepStrictEqual(passed(all.net), ["HOME", "XDG_RUNTIME_DIR"])
  assert.deepStrictEqual(passed(all.mpv),
    ["DBUS_SESSION_BUS_ADDRESS", "HOME", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR"].concat(WINDOW).sort())
  assert.deepStrictEqual(passed(all.hypr), ["HOME", "HYPRLAND_INSTANCE_SIGNATURE", "XDG_RUNTIME_DIR"])
  assert.deepStrictEqual(passed(all.browser), [
    "DBUS_SESSION_BUS_ADDRESS", "DISPLAY", "HOME", "LANG", "WAYLAND_DISPLAY", "XDG_CURRENT_DESKTOP",
    "XDG_DATA_DIRS", "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE"
  ])
  // Only mpv and the sign-in browser may reach the display and the session
  // bus; only hyprctl the compositor.
  var withoutDisplay = ["local", "net", "hypr"]
  withoutDisplay.forEach(function(name) {
    assert.ok(!("WAYLAND_DISPLAY" in all[name]), name)
    assert.ok(!("DISPLAY" in all[name]), name)
    assert.ok(!("DBUS_SESSION_BUS_ADDRESS" in all[name]), name)
    WINDOW.forEach(function(variable) { assert.ok(!(variable in all[name]), name + " " + variable) })
  })
  var withoutCompositor = ["local", "net", "mpv", "browser"]
  withoutCompositor.forEach(function(name) {
    assert.ok(!("HYPRLAND_INSTANCE_SIGNATURE" in all[name]), name)
  })
  // The window variables choose a cursor and a driver; none of them can
  // point a program at a file to load code from.
  WINDOW.concat(Object.keys(BROWSER)).forEach(function(variable) {
    assert.ok(!/^(LD_|PYTHON|NODE_|GTK_MODULES|QT_PLUGIN|BROWSER$|XAUTHORITY$)/.test(variable), variable)
  })
})

test("the browser reads its configuration from the attempt directory, never from the user's", function() {
  var env = Env.browser(ATTEMPT)
  assert.strictEqual(env.XDG_CONFIG_HOME, ATTEMPT + "/config")
  assert.strictEqual(env.PATH, "/usr/bin")
  // Every other variable is the session's own or absent; none is made up here.
  Object.keys(env).forEach(function(key) {
    if (key !== "XDG_CONFIG_HOME" && key !== "PATH") assert.strictEqual(env[key], null, key)
  })
  var other = Env.browser("/run/elsewhere/omajuke/signin/9999999999")
  assert.strictEqual(other.XDG_CONFIG_HOME, "/run/elsewhere/omajuke/signin/9999999999/config")
  assert.notStrictEqual(Env.browser(ATTEMPT), Env.browser(ATTEMPT))
})

test("without a sign-in attempt directory there is no browser profile at all", function() {
  var unusable = [
    undefined, null, "", 7, {}, [], [ATTEMPT], { toString: function() { return ATTEMPT } },
    "/run/user/1000/omajuke/signin", "/run/user/1000/omajuke/signin/", ATTEMPT + "/", ATTEMPT + "/profile",
    "/run/user/1000/omajuke/signin/a", "/run/user/1000/omajuke/signin/12345678901",
    "/run/user/1000/omajuke/jar/3", "/run/user/1000/other/signin/3", "/run/user/1000/signin/3",
    "/omajuke/signin/3", "omajuke/signin/3", "run/user/1000/omajuke/signin/3",
    "/run/user/1000//omajuke/signin/3", "/run/user/1000/./omajuke/signin/3",
    "/run/user/1000/../omajuke/signin/3", "/run/user/my dir/omajuke/signin/3",
    "/run/user/1000/omajuke/signin/3\n", "/run/user/1000/omajuke/signin/\u0663",
    "/home/user/.config", "/home/user", "/", "/" + "a".repeat(120) + "/omajuke/signin/3",
    paths.runtimeBase, paths.runtimeDir, paths.signinDir, paths.dataDir, paths.jarFile
  ]
  unusable.forEach(function(value) {
    assert.strictEqual(Env.browser(value), null, JSON.stringify(value))
  })
  var counters = [1, 2, 10, 4294967296, 9999999999]
  counters.forEach(function(n) {
    assert.notStrictEqual(Env.browser(Paths.signinAttemptDir(paths, n)), null, String(n))
  })
  // The longest runtime base still gives an attempt directory that is taken.
  var longest = Paths.resolve({ XDG_RUNTIME_DIR: "/" + "a".repeat(64), HOME: "/home/user" })
  assert.notStrictEqual(Env.browser(Paths.signinAttemptDir(longest, 9999999999)), null)
})

test("every call returns a fresh object", function() {
  var first = Env.local()
  first.PATH = "/somewhere/else"
  first.EXTRA = "x"
  assert.deepStrictEqual(Env.local(), LOCAL)
  var net = Env.net(paths)
  net.DENO_DIR = "/elsewhere"
  assert.deepStrictEqual(Env.net(paths), NET)
  assert.deepStrictEqual(Env.mpv(paths), MPV)
  assert.deepStrictEqual(Env.hypr(), HYPR)
  var browser = Env.browser(ATTEMPT)
  browser.XDG_CONFIG_HOME = "/home/user/.config"
  assert.deepStrictEqual(Env.browser(ATTEMPT), BROWSER)
})

test("deno's directory comes from the resolved paths", function() {
  var other = Paths.resolve({ XDG_RUNTIME_DIR: "/run/elsewhere", HOME: "/home/user" })
  assert.strictEqual(Env.net(other).DENO_DIR, other.denoDir)
  assert.strictEqual(Env.mpv(other).DENO_DIR, other.denoDir)
  assert.strictEqual(Env.net(other).DENO_NO_UPDATE_CHECK, "1")
})

test("without resolved paths there is no network profile at all", function() {
  var unusable = [
    undefined, null, {}, { ok: false }, { ok: true }, { ok: true, denoDir: "" }, { ok: true, denoDir: 5 },
    { ok: "true", denoDir: "/x" }, { denoDir: "/x" }, "paths", 7, [], Paths.resolve({})
  ]
  unusable.forEach(function(value) {
    assert.strictEqual(Env.net(value), null, JSON.stringify(value))
    assert.strictEqual(Env.mpv(value), null, JSON.stringify(value))
  })
})

test("proxySet is true for each of the six names, and only for a non-empty string", function() {
  assert.deepStrictEqual(Env.PROXY_NAMES, PROXY_NAMES)
  PROXY_NAMES.forEach(function(name) {
    var env = {}
    env[name] = "http://127.0.0.1:9"
    assert.strictEqual(Env.proxySet(env), true, name)
    env[name] = "x"
    assert.strictEqual(Env.proxySet(env), true, name + " with any text")
    var unset = [null, "", undefined, 0, 1, true, {}, ["http://127.0.0.1:9"]]
    unset.forEach(function(value) {
      env[name] = value
      assert.strictEqual(Env.proxySet(env), false, name + " = " + JSON.stringify(value))
    })
  })
})

test("proxySet looks at nothing but those six own properties", function() {
  var unset = {}
  PROXY_NAMES.forEach(function(name) { unset[name] = null })
  assert.strictEqual(Env.proxySet(unset), false)
  assert.strictEqual(Env.proxySet({}), false)
  var others = { no_proxy: "localhost", ftp_proxy: "http://127.0.0.1:9", Http_Proxy: "x" }
  assert.strictEqual(Env.proxySet(others), false)
  assert.strictEqual(Env.proxySet(Object.create({ https_proxy: "http://127.0.0.1:9" })), false, "inherited")
  var bare = Object.create(null)
  bare.all_proxy = "socks5://127.0.0.1:9"
  assert.strictEqual(Env.proxySet(bare), true, "an object without a prototype")
  var odd = [undefined, null, "https_proxy", 5, true, []]
  odd.forEach(function(value) {
    assert.strictEqual(Env.proxySet(value), false, JSON.stringify(value))
  })
})

test("the module exports exactly the documented names", function() {
  assert.deepStrictEqual(Object.keys(Env).sort(),
    ["PROXY_NAMES", "browser", "hypr", "local", "mpv", "net", "proxySet"])
})
