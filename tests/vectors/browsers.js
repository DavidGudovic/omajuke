.pragma library

// Input and expectation table for lib/Browsers.js: which answers to "what
// is the default browser" select a browser and which are refused, which
// directories count as a sign-in attempt directory, and the exact command
// each browser is started with. The commands are written out here a second
// time on purpose: a flag changes only when both places are edited. The
// same table runs under node and inside Qt's JavaScript engine.

var _NO = { ok: false }

var _CHROME = {
  ok: true, id: "google-chrome.desktop", family: "chromium", bin: "/usr/bin/google-chrome-stable",
  ytName: "chrome"
}
var _CHROMIUM = {
  ok: true, id: "chromium.desktop", family: "chromium", bin: "/usr/bin/chromium", ytName: "chromium"
}
var _BRAVE = {
  ok: true, id: "brave-browser.desktop", family: "chromium", bin: "/usr/bin/brave", ytName: "brave"
}
var _VIVALDI = {
  ok: true, id: "vivaldi-stable.desktop", family: "chromium", bin: "/usr/bin/vivaldi-stable",
  ytName: "vivaldi"
}
var _FIREFOX = {
  ok: true, id: "firefox.desktop", family: "firefox", bin: "/usr/bin/firefox", ytName: "firefox"
}
var _LIBREWOLF = {
  ok: true, id: "librewolf.desktop", family: "firefox", bin: "/usr/bin/librewolf", ytName: "firefox"
}

// The tools as the plugin has them, and with a stand-in for the browser as
// a test run has them.
var _SETPRIV = "/usr/bin/setpriv"
var _TIMEOUT = "/usr/bin/timeout"
var _STUB = "/tmp/oj-test.1/stubs/browser.js"
var _TOOLS = { setpriv: _SETPRIV, timeout: _TIMEOUT, browser: "" }
var _TOOLS_STUB = { setpriv: _SETPRIV, timeout: _TIMEOUT, browser: _STUB }

// Attempt directories below the usual runtime directory and below a
// test run's.
var _DIR = "/run/user/1000/omajuke/signin/1"
var _DIR_LAST = "/run/user/1000/omajuke/signin/9999999999"
var _DIR_TEST = "/tmp/oj-test.1/run_dir/omajuke/signin/42"

// 110 characters: with a slash in front and "/omajuke/signin/1" behind,
// a directory at the length limit of 128.
var _A25 = "aaaaaaaaaaaaaaaaaaaaaaaaa"
var _A110 = _A25 + _A25 + _A25 + _A25 + _A25.slice(0, 10)

// The text unit repeated count times, built by doubling.
function _repeat(unit, count) {
  var text = ""
  var chunk = unit
  var left = count
  while (left > 0) {
    if (left % 2 === 1) text += chunk
    chunk += chunk
    left = Math.floor(left / 2)
  }
  return text
}

// With the fifteen characters of "firefox.desktop" in front, an answer of
// 256 characters: the longest one that is read.
var _BLANKS241 = _repeat(" ", 241)

// A path of 256 characters, the longest a tool may have.
var _TOOL256 = "/" + _repeat("a", 255)

// A stand-in in a directory with a blank, a quote and an accent in its
// name. A command is a list of arguments, so none of them means anything.
var _STUB_ODD = "/tmp/oj test/it's \u00e9/browser.js"

// Every printable ASCII character that is not allowed in an attempt
// directory.
var _NOT_PLAIN = " !\"#$%&'()*+,:;<=>?@[\\]^\u0060{|}~"

// One case per character of chars: the case make(character) returns.
function _perCharacter(chars, make) {
  var cases = []
  for (var i = 0; i < chars.length; i++) cases.push(make(chars.charAt(i)))
  return cases
}

function _refusedInDirectory(ch) {
  return { fn: "profileDir", args: ["/run/x" + ch + "y/omajuke/signin/1"], expect: "" }
}

// A tools table with single entries replaced.
function _tools(setpriv, timeout, browser) {
  return { setpriv: setpriv, timeout: timeout, browser: browser }
}

// The whole command for a Chromium-family and for a Firefox-family browser.
function _chromiumArgv(bin, profile) {
  return [
    "/usr/bin/setpriv", "--pdeathsig", "TERM", "/usr/bin/timeout", "-k", "5", "900", bin,
    "--user-data-dir=" + profile, "--password-store=basic", "--ozone-platform-hint=auto", "--no-first-run",
    "--no-default-browser-check", "--disable-sync", "--allow-browser-signin=false", "--disable-extensions",
    "--disable-component-extensions-with-background-pages", "--disable-default-apps",
    "--disable-component-update", "--disable-background-networking", "--disable-domain-reliability",
    "--no-pings", "--disable-breakpad", "--metrics-recording-only", "--new-window",
    "https://www.youtube.com/"
  ]
}

function _firefoxArgv(bin, profile) {
  return [
    "/usr/bin/setpriv", "--pdeathsig", "TERM", "/usr/bin/timeout", "-k", "5", "900", bin,
    "--no-remote", "--profile", profile, "https://www.youtube.com/"
  ]
}

var MODULE = "Browsers"
var CASES = [
  // ---- lookup: the six supported desktop ids, as the query prints them ----
  { fn: "lookup", args: ["google-chrome.desktop\n"], expect: _CHROME },
  { fn: "lookup", args: ["chromium.desktop\n"], expect: _CHROMIUM },
  { fn: "lookup", args: ["brave-browser.desktop\n"], expect: _BRAVE },
  { fn: "lookup", args: ["vivaldi-stable.desktop\n"], expect: _VIVALDI },
  { fn: "lookup", args: ["firefox.desktop\n"], expect: _FIREFOX },
  { fn: "lookup", args: ["librewolf.desktop\n"], expect: _LIBREWOLF },

  // ---- lookup: blanks around the one line are ignored ----
  { fn: "lookup", args: ["firefox.desktop"], expect: _FIREFOX },
  { fn: "lookup", args: ["firefox.desktop\r\n"], expect: _FIREFOX },
  { fn: "lookup", args: ["  firefox.desktop \t\n\n"], expect: _FIREFOX },
  { fn: "lookup", args: ["\n\tgoogle-chrome.desktop"], expect: _CHROME },

  // ---- lookup: nothing was answered ----
  { fn: "lookup", args: [""], expect: _NO },
  { fn: "lookup", args: ["\n"], expect: _NO },
  { fn: "lookup", args: [" \t\r\n"], expect: _NO },

  // ---- lookup: names every object has are not browsers ----
  { fn: "lookup", args: ["constructor"], expect: _NO },
  { fn: "lookup", args: ["constructor\n"], expect: _NO },
  { fn: "lookup", args: ["__proto__"], expect: _NO },
  { fn: "lookup", args: ["toString"], expect: _NO },
  { fn: "lookup", args: ["valueOf"], expect: _NO },
  { fn: "lookup", args: ["hasOwnProperty"], expect: _NO },
  { fn: "lookup", args: ["__defineGetter__"], expect: _NO },
  { fn: "lookup", args: ["constructor.desktop"], expect: _NO },
  { fn: "lookup", args: ["__proto__.desktop"], expect: _NO },

  // ---- lookup: near misses of a supported id ----
  { fn: "lookup", args: ["firefox"], expect: _NO },
  { fn: "lookup", args: ["Firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["FIREFOX.DESKTOP"], expect: _NO },
  { fn: "lookup", args: ["firefox.Desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop."], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop/"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop;"], expect: _NO },
  { fn: "lookup", args: [".firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox desktop"], expect: _NO },
  { fn: "lookup", args: ["fire fox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktopx"], expect: _NO },
  { fn: "lookup", args: ["xfirefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["google-chrome"], expect: _NO },
  { fn: "lookup", args: ["google_chrome.desktop"], expect: _NO },
  { fn: "lookup", args: ["chrome.desktop"], expect: _NO },
  { fn: "lookup", args: ["chromium"], expect: _NO },

  // ---- lookup: more than one line or more than one id ----
  { fn: "lookup", args: ["firefox.desktop\nchromium.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\n\nchromium.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop chromium.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop;chromium.desktop;"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop,chromium.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\rchromium.desktop"], expect: _NO },

  // ---- lookup: invisible characters do not trim away ----
  { fn: "lookup", args: ["firefox.desktop\u0000"], expect: _NO },
  { fn: "lookup", args: ["\u0000firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox\u0000.desktop"], expect: _NO },
  { fn: "lookup", args: ["\u00a0firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\u00a0"], expect: _NO },
  { fn: "lookup", args: ["\ufefffirefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\u200b"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\u2028"], expect: _NO },
  { fn: "lookup", args: ["\u202efirefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\u000b"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\u000c"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop\u0085"], expect: _NO },
  { fn: "lookup", args: ["firef\u043ex.desktop"], expect: _NO },
  { fn: "lookup", args: ["\uff46irefox.desktop"], expect: _NO },

  // ---- lookup: sandboxed builds and browsers outside the table ----
  { fn: "lookup", args: ["org.mozilla.firefox.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["com.google.Chrome.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["org.chromium.Chromium.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["com.brave.Browser.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["firefox_firefox.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["chromium_chromium.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["chromium-browser.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["brave.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["vivaldi.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["google-chrome-beta.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["firefox-developer-edition.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["microsoft-edge.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["opera.desktop\n"], expect: _NO },
  { fn: "lookup", args: ["some-other-browser.desktop\n"], expect: _NO },

  // ---- lookup: paths, launcher lines and options are not ids ----
  { fn: "lookup", args: ["/usr/bin/firefox"], expect: _NO },
  { fn: "lookup", args: ["/usr/share/applications/firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["/home/user/.local/share/applications/firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["../firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["./firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["file:///usr/share/applications/firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["Exec=/usr/bin/firefox %u"], expect: _NO },
  { fn: "lookup", args: ["firefox %u"], expect: _NO },
  { fn: "lookup", args: ["env MOZ_LOG=all firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop --remote-debugging-port=9222"], expect: _NO },
  { fn: "lookup", args: ["--remote-debugging-port=9222"], expect: _NO },
  { fn: "lookup", args: ["-firefox.desktop"], expect: _NO },
  { fn: "lookup", args: ["firefox.desktop; id"], expect: _NO },
  { fn: "lookup", args: ["$(id).desktop"], expect: _NO },
  { fn: "lookup", args: ["\u0060id\u0060.desktop"], expect: _NO },
  { fn: "lookup", args: ["'firefox.desktop'"], expect: _NO },
  { fn: "lookup", args: ["\"firefox.desktop\""], expect: _NO },

  // ---- lookup: too long, or not text ----
  // 256 characters are read, blanks included, and 257 are not.
  { fn: "lookup", args: ["firefox.desktop" + _BLANKS241], expect: _FIREFOX },
  { fn: "lookup", args: [_BLANKS241 + "firefox.desktop"], expect: _FIREFOX },
  { fn: "lookup", args: ["firefox.desktop" + _BLANKS241 + "\n"], expect: _NO },
  { fn: "lookup", args: [" " + _BLANKS241 + "firefox.desktop"], expect: _NO },
  { fn: "lookup", args: [{ gen: "repeat", unit: "a", count: 300000 }], expect: _NO },
  { fn: "lookup", args: [{ gen: "repeat", unit: "firefox.desktop\n", count: 20000 }], expect: _NO },
  { fn: "lookup", args: [{ gen: "repeat", unit: " ", count: 300000 }], expect: _NO },
  { fn: "lookup", args: [{ gen: "codes", codes: [55357] }], expect: _NO },
  { fn: "lookup", args: [{ gen: "codes", codes: [102, 105, 114, 101, 102, 111, 120, 56832] }], expect: _NO },
  { fn: "lookup", args: [null], expect: _NO },
  { fn: "lookup", args: [0], expect: _NO },
  { fn: "lookup", args: [7], expect: _NO },
  { fn: "lookup", args: [true], expect: _NO },
  { fn: "lookup", args: [["firefox.desktop"]], expect: _NO },
  { fn: "lookup", args: [{ id: "firefox.desktop" }], expect: _NO },
  { fn: "lookup", args: [_FIREFOX], expect: _NO },
  { fn: "lookup", args: [], expect: _NO },

  // ---- profileDir: a numbered attempt directory ----
  { fn: "profileDir", args: [_DIR], expect: "/run/user/1000/omajuke/signin/1/profile" },
  { fn: "profileDir", args: [_DIR_LAST], expect: "/run/user/1000/omajuke/signin/9999999999/profile" },
  { fn: "profileDir", args: [_DIR_TEST], expect: "/tmp/oj-test.1/run_dir/omajuke/signin/42/profile" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/0"],
    expect: "/run/user/1000/omajuke/signin/0/profile" },
  { fn: "profileDir", args: ["/a/omajuke/signin/1"], expect: "/a/omajuke/signin/1/profile" },
  { fn: "profileDir", args: ["/-a/_b/c.d/omajuke/signin/007"],
    expect: "/-a/_b/c.d/omajuke/signin/007/profile" },

  // ---- profileDir: a counter, but not below the sign-in directory ----
  // The usual runtime directory itself ends in a number.
  { fn: "profileDir", args: ["/run/user/1000"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/jar/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/info/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/thumbs/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1/2"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1/profile/2"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/other/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/other/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/signin/omajuke/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/OmaJuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/Signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajukesignin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke-signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/xomajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/xsignin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signinx/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke./signin/1"], expect: "" },
  { fn: "profileDir", args: ["/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/a/1"], expect: "" },
  { fn: "profileDir", args: ["/tmp/1"], expect: "" },

  // ---- profileDir: the last part is not a counter ----
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1/"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1/profile"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1/config"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/a"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1a"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/a1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/-1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/+1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1.5"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1e3"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/0x1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/12345678901"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/\u0661"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/\uff11"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/AAAAAAAAAAA"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/constructor"], expect: "" },

  // ---- profileDir: not one plain absolute path ----
  { fn: "profileDir", args: [""], expect: "" },
  { fn: "profileDir", args: ["/"], expect: "" },
  { fn: "profileDir", args: ["1"], expect: "" },
  { fn: "profileDir", args: ["/1"], expect: "" },
  { fn: "profileDir", args: ["//1"], expect: "" },
  { fn: "profileDir", args: ["run/user/1000/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["./signin/1"], expect: "" },
  { fn: "profileDir", args: ["../signin/1"], expect: "" },
  { fn: "profileDir", args: ["~/signin/1"], expect: "" },
  { fn: "profileDir", args: ["signin/1"], expect: "" },
  { fn: "profileDir", args: ["//run/user/1000/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin//1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/./1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/../1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/../../../../../etc/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/./signin/1"], expect: "" },
  { fn: "profileDir", args: ["/../1"], expect: "" },
  { fn: "profileDir", args: ["/./1"], expect: "" },
  // A "." or ".." part anywhere above the three last parts: the path would
  // name another directory than the one it spells.
  { fn: "profileDir", args: ["/run/../omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/./omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/../omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/./omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/../../../home/user/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/../1000/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run//user/omajuke/signin/1"], expect: "" },
  // A name that only contains dots, or starts with one, is an ordinary name.
  { fn: "profileDir", args: ["/run/.../.x/..y/z../omajuke/signin/1"],
    expect: "/run/.../.x/..y/z../omajuke/signin/1/profile" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1\n"], expect: "" },
  { fn: "profileDir", args: ["\n/run/user/1000/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1\n/x/2"], expect: "" },
  { fn: "profileDir", args: [" /run/user/1000/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1 "], expect: "" },
  { fn: "profileDir", args: ["/run/user/my dir/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1\u0000"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000\u0000/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a'b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a\"b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/$(id)/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a\u0060b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a;b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a,b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a:b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a::b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a=b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a\\b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a%20b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/a*b/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/caf\u00e9/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["\\run\\user\\1000\\omajuke\\signin\\1"], expect: "" },
  { fn: "profileDir", args: ["file:///run/user/1000/omajuke/signin/1"], expect: "" },

  // ---- profileDir: text that would be an option, or would add one ----
  { fn: "profileDir", args: ["-1"], expect: "" },
  { fn: "profileDir", args: ["--profile"], expect: "" },
  { fn: "profileDir", args: ["-profile/1"], expect: "" },
  { fn: "profileDir", args: ["--remote-debugging-port=9222"], expect: "" },
  { fn: "profileDir", args: ["--remote-debugging-port=9222/1"], expect: "" },
  { fn: "profileDir", args: ["--user-data-dir=/run/user/1000/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1 --remote-debugging-port=9222"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1 --load-extension=/x/1"], expect: "" },
  { fn: "profileDir", args: ["/run/user/1000/omajuke/signin/1\t--enable-logging"], expect: "" },

  // ---- profileDir: never a browser's everyday profile ----
  { fn: "profileDir", args: ["/home/user/.config/google-chrome"], expect: "" },
  { fn: "profileDir", args: ["/home/user/.config/chromium"], expect: "" },
  { fn: "profileDir", args: ["/home/user/.config/chromium/Default"], expect: "" },
  { fn: "profileDir", args: ["/home/user/.config/BraveSoftware/Brave-Browser"], expect: "" },
  { fn: "profileDir", args: ["/home/user/.mozilla/firefox/abcd1234.default-release"], expect: "" },
  { fn: "profileDir", args: ["/home/user/.local/share/omajuke"], expect: "" },
  { fn: "profileDir", args: ["/home/user"], expect: "" },

  // ---- profileDir: too long, or not text ----
  // A directory of 128 characters is the longest one taken.
  { fn: "profileDir", args: ["/" + _A110 + "/omajuke/signin/1"],
    expect: "/" + _A110 + "/omajuke/signin/1/profile" },
  { fn: "profileDir", args: ["/" + _A110 + "a/omajuke/signin/1"], expect: "" },
  { fn: "profileDir", args: ["/" + _A110 + "/omajuke/signin/12"], expect: "" },
  { fn: "profileDir", args: [{ gen: "repeat", unit: "/a", count: 150000 }], expect: "" },
  { fn: "profileDir", args: [{ gen: "repeat", unit: "/1", count: 150000 }], expect: "" },
  { fn: "profileDir", args: [{ gen: "repeat", unit: "/omajuke/signin/1", count: 20000 }], expect: "" },
  { fn: "profileDir", args: [{ gen: "codes", codes: [47, 97, 47, 55357] }], expect: "" },
  { fn: "profileDir", args: [null], expect: "" },
  { fn: "profileDir", args: [1], expect: "" },
  { fn: "profileDir", args: [true], expect: "" },
  { fn: "profileDir", args: [[_DIR]], expect: "" },
  { fn: "profileDir", args: [{ dir: _DIR }], expect: "" },
  { fn: "profileDir", args: [], expect: "" },

  // ---- launchArgv: the exact command for every browser ----
  { fn: "launchArgv", args: [_TOOLS, "google-chrome.desktop", _DIR],
    expect: _chromiumArgv("/usr/bin/google-chrome-stable", "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_TOOLS, "chromium.desktop", _DIR],
    expect: _chromiumArgv("/usr/bin/chromium", "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_TOOLS, "brave-browser.desktop", _DIR],
    expect: _chromiumArgv("/usr/bin/brave", "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_TOOLS, "vivaldi-stable.desktop", _DIR],
    expect: _chromiumArgv("/usr/bin/vivaldi-stable", "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", _DIR],
    expect: _firefoxArgv("/usr/bin/firefox", "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_TOOLS, "librewolf.desktop", _DIR],
    expect: _firefoxArgv("/usr/bin/librewolf", "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_TOOLS, "google-chrome.desktop", _DIR_LAST],
    expect: _chromiumArgv("/usr/bin/google-chrome-stable",
      "/run/user/1000/omajuke/signin/9999999999/profile") },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", _DIR_TEST],
    expect: _firefoxArgv("/usr/bin/firefox", "/tmp/oj-test.1/run_dir/omajuke/signin/42/profile") },

  // ---- launchArgv: a stand-in replaces the binary and nothing else ----
  { fn: "launchArgv", args: [_TOOLS_STUB, "google-chrome.desktop", _DIR_TEST],
    expect: _chromiumArgv(_STUB, "/tmp/oj-test.1/run_dir/omajuke/signin/42/profile") },
  { fn: "launchArgv", args: [_TOOLS_STUB, "librewolf.desktop", _DIR_TEST],
    expect: _firefoxArgv(_STUB, "/tmp/oj-test.1/run_dir/omajuke/signin/42/profile") },
  // An unknown browser stays unknown with a stand-in.
  { fn: "launchArgv", args: [_TOOLS_STUB, "opera.desktop", _DIR_TEST], expect: [] },
  // A stand-in is one argument whatever its path contains, short of a
  // control character, and may be 256 characters long.
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, _STUB_ODD), "firefox.desktop", _DIR],
    expect: _firefoxArgv(_STUB_ODD, "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, "/tmp/a~b"), "chromium.desktop", _DIR],
    expect: _chromiumArgv("/tmp/a~b", "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, _TOOL256), "firefox.desktop", _DIR],
    expect: _firefoxArgv(_TOOL256, "/run/user/1000/omajuke/signin/1/profile") },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, _TOOL256 + "a"), "firefox.desktop", _DIR],
    expect: [] },

  // ---- launchArgv: only an exact id from the table ----
  { fn: "launchArgv", args: [_TOOLS, "", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop\n", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, " firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "Firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "constructor", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "__proto__", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "toString", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "org.mozilla.firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "/usr/bin/firefox", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop --remote-debugging-port=9222", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "--headless", _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, null, _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, 0, _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, ["firefox.desktop"], _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, _FIREFOX, _DIR], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, { gen: "repeat", unit: "a", count: 300000 }, _DIR], expect: [] },

  // ---- launchArgv: only a numbered attempt directory ----
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", ""], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/1000/omajuke/signin"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/1000"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/1000/omajuke/jar/1"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "google-chrome.desktop", "/run/user/1000"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "google-chrome.desktop", "/tmp/1"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/1000/omajuke/signin/1/"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/1000/omajuke/signin/1/profile"],
    expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "run/user/1000/omajuke/signin/1"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/1000/omajuke/signin/../1"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/../1000/omajuke/signin/1"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "google-chrome.desktop", "/run/./omajuke/signin/1"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/run/user/1000/omajuke/signin/1\n"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "-1"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "--headless"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "--remote-debugging-port=9222"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "-profile/1"], expect: [] },
  { fn: "launchArgv",
    args: [_TOOLS, "google-chrome.desktop", "/run/user/1000/omajuke/signin/1 --remote-debugging-port=9222"],
    expect: [] },
  { fn: "launchArgv",
    args: [_TOOLS, "google-chrome.desktop", "/run/user/1000/omajuke/signin/1 --load-extension=/x/1"],
    expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "google-chrome.desktop", "/home/user/.config/google-chrome"],
    expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", "/home/user/.mozilla/firefox"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", null], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", 1], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", [_DIR]], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop"], expect: [] },
  { fn: "launchArgv", args: [_TOOLS, "firefox.desktop", { gen: "repeat", unit: "/1", count: 150000 }],
    expect: [] },

  // ---- launchArgv: only absolute tool paths ----
  { fn: "launchArgv", args: [null, "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: ["/usr/bin", "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [7, "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [{}, "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [[], "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [[_SETPRIV, _TIMEOUT, ""], "firefox.desktop", _DIR], expect: [] },
  // An entry is missing.
  { fn: "launchArgv", args: [{ setpriv: _SETPRIV, timeout: _TIMEOUT }, "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [{ setpriv: _SETPRIV, browser: "" }, "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [{ timeout: _TIMEOUT, browser: "" }, "firefox.desktop", _DIR], expect: [] },
  // An entry is not an absolute path.
  { fn: "launchArgv", args: [_tools("setpriv", _TIMEOUT, ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, "timeout", ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools("", _TIMEOUT, ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools("/", _TIMEOUT, ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools("./setpriv", _TIMEOUT, ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools("--pdeathsig", _TIMEOUT, ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools("/usr/bin/setpriv\n", _TIMEOUT, ""), "firefox.desktop", _DIR],
    expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, "/usr/bin/time\u0000out", ""), "firefox.desktop", _DIR],
    expect: [] },
  { fn: "launchArgv", args: [_tools("/usr/bin/set\u007fpriv", _TIMEOUT, ""), "firefox.desktop", _DIR],
    expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, "/usr/bin/time\u001fout", ""), "firefox.desktop", _DIR],
    expect: [] },
  { fn: "launchArgv", args: [_tools(_TOOL256 + "a", _TIMEOUT, ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TOOL256 + "a", ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools([_SETPRIV], _TIMEOUT, ""), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, null, ""), "firefox.desktop", _DIR], expect: [] },
  // The stand-in is not an absolute path either.
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, "browser"), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, "./browser"), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, "--headless"), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, " "), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, "/x\u0000y"), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, null), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, 0), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, false), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, [_STUB]), "firefox.desktop", _DIR], expect: [] },
  { fn: "launchArgv", args: [_tools(_SETPRIV, _TIMEOUT, "/x\u007fy"), "firefox.desktop", _DIR], expect: [] },

  // ---- queryArgv: the one question about the default browser ----
  { fn: "queryArgv", args: [{ xdgSettings: "/usr/bin/xdg-settings" }],
    expect: ["/usr/bin/xdg-settings", "get", "default-web-browser"] },
  // A stand-in, as a test run has it.
  { fn: "queryArgv", args: [{ xdgSettings: "/tmp/oj-test.1/stubs/xdg-settings.js" }],
    expect: ["/tmp/oj-test.1/stubs/xdg-settings.js", "get", "default-web-browser"] },
  // Nothing else in the table is read.
  { fn: "queryArgv", args: [{ xdgSettings: "/usr/bin/xdg-settings", browser: "/usr/bin/other", sh: 7 }],
    expect: ["/usr/bin/xdg-settings", "get", "default-web-browser"] },
  { fn: "queryArgv", args: [{ xdgSettings: _TOOL256 }], expect: [_TOOL256, "get", "default-web-browser"] },
  // No table, no entry, or an entry that is not an absolute path.
  { fn: "queryArgv", args: [], expect: [] },
  { fn: "queryArgv", args: [null], expect: [] },
  { fn: "queryArgv", args: ["/usr/bin/xdg-settings"], expect: [] },
  { fn: "queryArgv", args: [{}], expect: [] },
  { fn: "queryArgv", args: [{ xdgsettings: "/usr/bin/xdg-settings" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: "" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: "/" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: "xdg-settings" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: "./xdg-settings" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: " /usr/bin/xdg-settings" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: "/usr/bin/xdg\u0000settings" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: "/usr/bin/xdg\nsettings" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: "/usr/bin/xdg\u007fsettings" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: _TOOL256 + "a" }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: null }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: 7 }], expect: [] },
  { fn: "queryArgv", args: [{ xdgSettings: ["/usr/bin/xdg-settings"] }], expect: [] }

  // ---- profileDir: one more case for each character of _NOT_PLAIN ----
].concat(_perCharacter(_NOT_PLAIN, _refusedInDirectory))

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
