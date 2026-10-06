"use strict"
// Tests for lib/Env.js: what each child environment profile contains, that
// none of them can carry a proxy setting or anything beyond the documented
// names, and when the session counts as having a proxy.
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
var MPV = Object.assign({}, NET, { WAYLAND_DISPLAY: null, DBUS_SESSION_BUS_ADDRESS: null })
var HYPR = Object.assign({}, LOCAL, { HYPRLAND_INSTANCE_SIGNATURE: null })

var PROXY_NAMES = ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]

function profiles() {
  return { local: Env.local(), net: Env.net(paths), mpv: Env.mpv(paths), hypr: Env.hypr() }
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
})

test("a value is a fixed string or null, never anything else", function() {
  var all = profiles()
  Object.keys(all).forEach(function(name) {
    Object.keys(all[name]).forEach(function(key) {
      var value = all[name][key]
      assert.ok(value === null || (typeof value === "string" && value !== ""), name + "." + key)
      assert.match(key, /^[A-Z][A-Z0-9_]*$/, name + "." + key)
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
    ["DBUS_SESSION_BUS_ADDRESS", "HOME", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR"])
  assert.deepStrictEqual(passed(all.hypr), ["HOME", "HYPRLAND_INSTANCE_SIGNATURE", "XDG_RUNTIME_DIR"])
  // Only mpv may reach the display and the session bus; only hyprctl the
  // compositor.
  var withoutDisplay = ["local", "net", "hypr"]
  withoutDisplay.forEach(function(name) {
    assert.ok(!("WAYLAND_DISPLAY" in all[name]), name)
    assert.ok(!("DBUS_SESSION_BUS_ADDRESS" in all[name]), name)
  })
  var withoutCompositor = ["local", "net", "mpv"]
  withoutCompositor.forEach(function(name) {
    assert.ok(!("HYPRLAND_INSTANCE_SIGNATURE" in all[name]), name)
  })
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
  assert.deepStrictEqual(Object.keys(Env).sort(), ["PROXY_NAMES", "hypr", "local", "mpv", "net", "proxySet"])
})
