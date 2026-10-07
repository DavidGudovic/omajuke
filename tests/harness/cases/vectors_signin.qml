import QtQuick
import "../../../lib/Browsers.js" as Browsers
import "../../../lib/Const.js" as Const
import "../../../lib/FeedUrls.js" as FeedUrls
import "../../../lib/Paths.js" as Paths
import "../../vectors/browsers.js" as BrowsersVectors
import "../../vectors/feedurls.js" as FeedUrlsVectors

// Runs the vector tables of Browsers and FeedUrls in Qt's JavaScript
// engine, the one the plugin really runs on, and then checks there what a
// table cannot hold: that the table of browsers and the list of feeds
// cannot be changed by an importer, that a desktop id or a feed kind
// spelled like a member every object has selects nothing, and that the
// commands built for real paths name only what they should.
QtObject {
  id: root

  property string kind: "component"

  readonly property var paths: Paths.resolve({
    XDG_RUNTIME_DIR: "/run/user/1000", XDG_STATE_HOME: null, XDG_DATA_HOME: null, HOME: "/home/user"
  })
  readonly property var tools: ({
    setpriv: "/usr/bin/setpriv", timeout: "/usr/bin/timeout", browser: "", ytdlp: "/usr/bin/yt-dlp",
    xdgSettings: "/usr/bin/xdg-settings"
  })
  // Names every object answers to. None of them is a browser or a feed.
  readonly property var inherited: [
    "constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", "prototype", "isPrototypeOf"
  ]

  function checkTable(h) {
    var ids = []
    for (var id in Browsers.TABLE) ids.push(id)
    h.equal(ids, [
      "google-chrome.desktop", "chromium.desktop", "brave-browser.desktop", "vivaldi-stable.desktop",
      "firefox.desktop", "librewolf.desktop"
    ], "table: the six supported browsers and nothing inherited")
    for (var i = 0; i < root.inherited.length; i++) {
      var name = root.inherited[i]
      h.equal(Browsers.lookup(name), { ok: false }, "lookup: " + name + " is no browser")
      h.equal(Browsers.lookup(name + ".desktop"), { ok: false }, "lookup: nor with .desktop behind it")
      h.equal(Browsers.launchArgv(root.tools, name, Paths.signinAttemptDir(root.paths, 1)), [],
        "launchArgv: " + name + " starts nothing")
      h.equal(FeedUrls.isKind(name), false, "isKind: " + name + " is no feed")
      h.equal(FeedUrls.url(name), "", "url: and has no address")
      h.equal(FeedUrls.parse(name, "{\"_type\":\"playlist\",\"entries\":[]}"), { ok: false },
        "parse: nor an answer")
    }
    // In this engine a frozen object can still be written to without an
    // error, so what counts is that a write changes nothing.
    try {
      Browsers.TABLE["evil.desktop"] = { family: "chromium", bin: "/usr/bin/evil", ytName: "chrome" }
      Browsers.TABLE["firefox.desktop"].bin = "/usr/bin/evil"
      FeedUrls.KINDS.push("trending")
      FeedUrls.KINDS[0] = "trending"
    } catch (error) {
      h.check(true, "table: a write is refused")
    }
    h.equal(Browsers.lookup("evil.desktop"), { ok: false }, "table: a row cannot be added")
    h.equal(Browsers.lookup("firefox.desktop").bin, "/usr/bin/firefox", "table: a row cannot be changed")
    h.equal(FeedUrls.isKind("trending"), false, "kinds: a feed cannot be added")
    h.equal(FeedUrls.isKind("foryou"), true, "kinds: nor one taken away")
    h.equal(FeedUrls.url("foryou"), "https://www.youtube.com/feed/recommended",
      "kinds: nor its address moved")
    h.equal(FeedUrls.url("trending"), "", "kinds: and what was written has none")
  }

  function checkCommands(h) {
    var dir = Paths.signinAttemptDir(root.paths, 3)
    h.equal(dir, "/run/user/1000/omajuke/signin/3", "the attempt directory of the real paths")
    h.equal(Browsers.profileDir(dir), dir + "/profile", "profileDir: inside the attempt directory")
    h.equal(Browsers.profileDir(root.paths.signinDir), "", "profileDir: not the directory of all attempts")
    h.equal(Browsers.profileDir(root.paths.runtimeDir), "", "profileDir: not the runtime directory")
    h.equal(Browsers.profileDir("/home/user/.config/chromium"), "", "profileDir: not an everyday profile")
    var chromium = Browsers.launchArgv(root.tools, "chromium.desktop", dir)
    h.equal(chromium.slice(0, 9), [
      "/usr/bin/setpriv", "--pdeathsig", "TERM", "/usr/bin/timeout", "-k", String(Browsers.GRACE_SEC),
      String(Const.TIMEOUTS.signInSec), "/usr/bin/chromium", "--user-data-dir=" + dir + "/profile"
    ], "chromium: bounded, and on the attempt's own profile")
    h.equal(chromium[chromium.length - 1], Browsers.START_URL, "chromium: the address comes last")
    var firefox = Browsers.launchArgv(root.tools, "firefox.desktop", dir)
    h.equal(firefox.slice(7), ["/usr/bin/firefox", "--no-remote", "--profile", dir + "/profile",
      Browsers.START_URL], "firefox: its whole command behind the wrapper")
    var never = ["--remote-debugging", "--headless", "--enable-automation", "--no-sandbox",
      "--enable-logging", "--log-net-log", "--incognito", "--load-extension", "gnome-libsecret"]
    var all = chromium.concat(firefox).join("\n")
    for (var i = 0; i < never.length; i++) {
      h.check(all.indexOf(never[i]) === -1, "no command holds " + never[i])
    }
    h.equal(Browsers.queryArgv(root.tools), ["/usr/bin/xdg-settings", "get", "default-web-browser"],
      "queryArgv: the one question")
    h.check(Browsers.USER_JS.split("\n").length === 33 && Browsers.USER_JS.indexOf("user_pref(") === 0,
      "USER_JS: one preference per line")

    var copy = Paths.jarCopyFile(root.paths, 5)
    var feed = FeedUrls.feedArgv(root.tools, root.paths, copy)
    h.equal(feed.slice(12), ["--cookies", "/run/user/1000/omajuke/jar/5.txt", "--flat-playlist",
      "--playlist-items", "1:" + Const.LIMITS.feedCount, "-J", "-a", "-"],
      "feedArgv: behind the common flags")
    var signed = [feed, FeedUrls.verifyArgv(root.tools, root.paths, copy),
      FeedUrls.markArgv(root.tools, root.paths, copy)]
    for (var k = 0; k < signed.length; k++) {
      h.check(signed[k].indexOf("--no-warnings") === -1 && signed[k].indexOf("--no-cookies") === -1,
        "signed-in call " + k + ": keeps its warnings")
      h.equal(signed[k].slice(-2), ["-a", "-"], "signed-in call " + k + ": reads its address from stdin")
    }
    h.equal(FeedUrls.feedArgv(root.tools, root.paths, root.paths.jarFile), null,
      "feedArgv: never the saved login itself")
    h.equal(FeedUrls.markArgv(root.tools, root.paths, Paths.infoFile(root.paths, 5)), null,
      "markArgv: never another file of ours")
  }

  function run(h) {
    h.vectors(Browsers, BrowsersVectors)
    h.vectors(FeedUrls, FeedUrlsVectors)
    root.checkTable(h)
    root.checkCommands(h)
    h.finish()
  }
}
