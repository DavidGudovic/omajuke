.pragma library

// Input and expectation table for lib/Thumbs.js: the command line of the
// thumbnail fetch, the transfer list curl reads from standard input, the
// reader of curl's report, and the eviction rule. The same table runs under
// node and inside Qt's JavaScript engine.

var _A = "AAAAAAAAAAA"
var _B = "BBBBBBBBBBB"
var _DIR = "/run/user/1000/omajuke/thumbs"

// As much of a resolved table of lib/Paths.js as thumbnails need.
var _PATHS = { ok: true, thumbsDir: _DIR }

var _ARGV = [
  "/usr/bin/curl", "-q", "--no-progress-meter", "--fail", "--proto", "=https", "--proto-redir", "=https",
  "--max-redirs", "0", "--tlsv1.2", "--connect-timeout", "4", "--max-time", "8", "--max-filesize", "262144",
  "--remove-on-error", "--parallel", "--parallel-max", "4", "--user-agent", "",
  "--write-out", "%{urlnum} %{response_code} %{exitcode} %{size_download} %{content_type}\\n",
  "--config", "-"
]

// The two lines of one transfer.
function _transfer(id, n) {
  return "url = \"https://i.ytimg.com/vi/" + id + "/mqdefault.jpg\"\n"
    + "output = \"" + _DIR + "/" + n + ".jpg\"\n"
}

// count different items; the ids are one letter eleven times over.
function _items(count) {
  var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  var items = []
  for (var i = 0; i < count; i++) items.push({ id: new Array(12).join(letters.charAt(i)), n: i + 1 })
  return items
}

function _config(count) {
  var items = _items(count)
  var text = ""
  for (var i = 0; i < items.length; i++) text += _transfer(items[i].id, items[i].n)
  return text
}

// The report line of a transfer that worked.
function _ok(position) {
  return position + " 200 0 17000 image/jpeg\n"
}

function _verdict(ready, failed) {
  return { ready: ready, failed: failed }
}

// text followed by as many x as it takes to reach length characters.
function _padded(text, length) {
  return text + new Array(length - text.length + 1).join("x")
}

var _ONE = [{ id: _A, n: 1 }]
var _TWO = [{ id: _A, n: 1 }, { id: _B, n: 2 }]
var _NONE = _verdict([], [0, 1])

var MODULE = "Thumbs"
var CASES = [
  // ---- argv: a constant list around the one tool path ----
  { fn: "argv", args: [{ curl: "/usr/bin/curl" }], expect: _ARGV },
  { fn: "argv", args: [{ curl: "/usr/bin/curl", ytdlp: "/usr/bin/yt-dlp" }, _A], expect: _ARGV },
  { fn: "argv", args: [{ curl: "/opt/stub/curl.js" }], expect: ["/opt/stub/curl.js"].concat(_ARGV.slice(1)) },
  { fn: "argv", args: [{ curl: "curl" }], expect: null },
  { fn: "argv", args: [{ curl: "" }], expect: null },
  { fn: "argv", args: [{ curl: 7 }], expect: null },
  { fn: "argv", args: [{}], expect: null },
  { fn: "argv", args: [null], expect: null },
  { fn: "argv", args: [], expect: null },
  { fn: "argv", args: ["/usr/bin/curl"], expect: null },

  // ---- config: one address and one file per item ----
  { fn: "config", args: [_PATHS, _ONE], expect: _transfer(_A, 1) },
  { fn: "config", args: [_PATHS, _TWO], expect: _transfer(_A, 1) + _transfer(_B, 2) },
  { fn: "config", args: [_PATHS, [{ id: _B, n: 77 }, { id: _A, n: 3 }]],
    expect: _transfer(_B, 77) + _transfer(_A, 3) },
  { fn: "config", args: [_PATHS, [{ id: _A, n: 9999999999 }]], expect: _transfer(_A, 9999999999) },
  { fn: "config", args: [_PATHS, _items(12)], expect: _config(12) },

  // Ids that are valid and look like something else are ids like any other.
  { fn: "config", args: [_PATHS, [{ id: "constructor", n: 1 }]], expect: _transfer("constructor", 1) },
  { fn: "config", args: [_PATHS, [{ id: "--no-config", n: 1 }]], expect: _transfer("--no-config", 1) },
  { fn: "config", args: [_PATHS, [{ id: "-----------", n: 1 }]], expect: _transfer("-----------", 1) },
  { fn: "config", args: [_PATHS, [{ id: "___________", n: 1 }]], expect: _transfer("___________", 1) },

  // Only id and n are read: an address or a file name of the item's own is
  // not taken.
  { fn: "config",
    args: [_PATHS, [{ id: _A, n: 1, url: "https://example.invalid/x.jpg", output: "/etc/hostname" }]],
    expect: _transfer(_A, 1) },

  // ---- config: one unsound item refuses the batch ----
  { fn: "config", args: [_PATHS, []], expect: "" },
  { fn: "config", args: [_PATHS, _items(13)], expect: "" },
  { fn: "config", args: [_PATHS, null], expect: "" },
  { fn: "config", args: [_PATHS], expect: "" },
  { fn: "config", args: [_PATHS, "AAAAAAAAAAA"], expect: "" },
  { fn: "config", args: [_PATHS, { length: 1, 0: { id: _A, n: 1 } }], expect: "" },
  { fn: "config", args: [_PATHS, [null]], expect: "" },
  { fn: "config", args: [_PATHS, [_A]], expect: "" },
  { fn: "config", args: [_PATHS, [[_A, 1]]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: 1 }, null]], expect: "" },
  { fn: "config", args: [_PATHS, [{ n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAAAAAAA", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAAAAAAAAA", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: 12345678901, n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: ["AAAAAAAAAAA"], n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAA/AAAAA", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAA\"AAAAA", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAA\\AAAAA", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAA AAAAA", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAA\nAAAAA", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAAAAAAA\n", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "../../../etc", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "{a,b}[1-9]#", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "AAAAAAAAAA\u00e9", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: "__proto__", n: 1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: 1 }, { id: "bad", n: 2 }]], expect: "" },

  // The file is named by a whole counter from 1, and by nothing else.
  { fn: "config", args: [_PATHS, [{ id: _A }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: 0 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: -1 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: 1.5 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: "1" }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: null }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: 10000000000 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: _A }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: "../x" }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: [1] }]], expect: "" },

  // Two transfers never share an id or a file.
  { fn: "config", args: [_PATHS, [{ id: _A, n: 1 }, { id: _A, n: 2 }]], expect: "" },
  { fn: "config", args: [_PATHS, [{ id: _A, n: 1 }, { id: _B, n: 1 }]], expect: "" },

  // Without resolved paths, or with a folder curl would read differently
  // than we wrote it, nothing is fetched.
  { fn: "config", args: [null, _ONE], expect: "" },
  { fn: "config", args: [{}, _ONE], expect: "" },
  { fn: "config", args: [{ ok: false, thumbsDir: _DIR }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: 5 }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "relative/thumbs" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "/run/a\"b/thumbs" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "/run/a\\b/thumbs" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "/run/a b/thumbs" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "/run/a\nb/thumbs" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "/run/a#1/thumbs" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "/run/{a,b}/thumbs" }, _ONE], expect: "" },
  { fn: "config", args: [{ ok: true, thumbsDir: "/run/caf\u00e9/thumbs" }, _ONE], expect: "" },

  // ---- parse: every transfer worked ----
  { fn: "parse", args: [_ok(0), _ONE], expect: _verdict([0], []) },
  { fn: "parse", args: [_ok(0) + _ok(1), _TWO], expect: _verdict([0, 1], []) },
  // Transfers run side by side and report in the order they end.
  { fn: "parse", args: [_ok(1) + _ok(0), _TWO], expect: _verdict([0, 1], []) },
  { fn: "parse", args: ["0 200 0 1 image/jpeg\n1 200 0 262144 image/jpeg\n", _TWO],
    expect: _verdict([0, 1], []) },
  { fn: "parse", args: ["0 200 0 17000 image/jpeg", _ONE], expect: _verdict([0], []) },
  { fn: "parse", args: ["0 200 0 17000 image/jpeg\r\n1 200 0 9 image/jpeg\r\n", _TWO],
    expect: _verdict([0, 1], []) },
  { fn: "parse", args: ["\n\n" + _ok(1) + "\n" + _ok(0) + "\n", _TWO], expect: _verdict([0, 1], []) },
  { fn: "parse", args: ["0 200 0 17000 image/jpeg; charset=binary\n", _ONE], expect: _verdict([0], []) },
  { fn: "parse", args: ["0 200 0 17000 image/jpeg \n", _ONE], expect: _verdict([0], []) },
  { fn: "parse", args: [_ok(11) + _ok(3), _items(12)],
    expect: _verdict([3, 11], [0, 1, 2, 4, 5, 6, 7, 8, 9, 10]) },

  // ---- parse: a transfer that did not work, or was not reported ----
  { fn: "parse", args: [_ok(0) + "1 404 22 0 text/html; charset=UTF-8\n", _TWO], expect: _verdict([0], [1]) },
  { fn: "parse", args: ["0 404 22 0 \n1 404 22 0 \n", _TWO], expect: _NONE },
  { fn: "parse", args: [_ok(1), _TWO], expect: _verdict([1], [0]) },
  { fn: "parse", args: ["", _TWO], expect: _NONE },
  { fn: "parse", args: ["\n", _TWO], expect: _NONE },
  // Cut off by a read error after the status line had arrived.
  { fn: "parse", args: ["0 200 18 4096 image/jpeg\n" + _ok(1), _TWO], expect: _verdict([1], [0]) },
  // Larger than announced, and ended by curl at the limit.
  { fn: "parse", args: ["0 200 63 262144 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 000 6 0 \n1 000 28 0 \n", _TWO], expect: _NONE },
  { fn: "parse", args: ["0 301 0 0 text/html\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 206 0 100 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 304 0 0 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 2000 0 100 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 00 100 image/jpeg\n", _ONE], expect: _verdict([], [0]) },

  // The size has to be inside the limit, the type a JPEG.
  { fn: "parse", args: ["0 200 0 0 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 262145 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 999999 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 1000000 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 -5 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 1e3 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000.5 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000 \n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000 text/html\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000 image/png\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000 image/jpegx\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000 image/jpeg2000\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000 IMAGE/JPEG\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000 ximage/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 17000  image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0  200 0 17000 image/jpeg\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0\t200\t0\t17000\timage/jpeg\n", _ONE], expect: _verdict([], [0]) },

  // ---- parse: lines that are about no transfer of this batch ----
  { fn: "parse", args: [_ok(2) + _ok(0), _TWO], expect: _verdict([0], [1]) },
  { fn: "parse", args: [_ok(0) + _ok(999), _ONE], expect: _verdict([0], []) },
  { fn: "parse", args: ["1000 200 0 5 image/jpeg\n", _TWO], expect: _NONE },
  { fn: "parse", args: ["-1 200 0 5 image/jpeg\n-0 200 0 5 image/jpeg\n", _TWO], expect: _NONE },
  { fn: "parse", args: [" 0 200 0 5 image/jpeg\n\t1 200 0 5 image/jpeg\n", _TWO], expect: _NONE },
  { fn: "parse", args: ["00 200 0 5 image/jpeg\n01 200 0 5 image/jpeg\n", _TWO], expect: _NONE },
  { fn: "parse", args: ["0x0 200 0 5 image/jpeg\n1.0 200 0 5 image/jpeg\n", _TWO], expect: _NONE },
  { fn: "parse", args: ["constructor 200 0 5 image/jpeg\n__proto__ 200 0 5 image/jpeg\n", _TWO],
    expect: _NONE },
  { fn: "parse", args: ["curl: (6) Could not resolve host\n<html>\n{\"0\": 200}\n", _TWO], expect: _NONE },
  // Two reports run together on one line are neither.
  { fn: "parse", args: ["0 200 0 5 image/jpeg" + _ok(1), _TWO], expect: _NONE },

  // ---- parse: a transfer reported more than once is not trusted ----
  { fn: "parse", args: [_ok(0) + _ok(0), _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: [_ok(0) + _ok(1) + _ok(0), _TWO], expect: _verdict([1], [0]) },
  { fn: "parse", args: [_ok(0) + "0 404 22 0 text/html\n", _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 404 22 0 text/html\n" + _ok(0), _ONE], expect: _verdict([], [0]) },
  { fn: "parse", args: [_ok(0) + "0 \n", _ONE], expect: _verdict([], [0]) },

  // The type is text the server chose. It cannot report another transfer:
  // only a line break ends a line, and the server cannot send one.
  { fn: "parse", args: ["0 200 0 5 text/html\r1 200 0 5 image/jpeg\n", _TWO], expect: _NONE },
  { fn: "parse", args: ["0 404 22 0 text/html 1 200 0 5 image/jpeg\n", _TWO], expect: _NONE },
  { fn: "parse", args: ["0 200 0 5 text/html; x=\"0 200 0 5 image/jpeg\"\n", _ONE],
    expect: _verdict([], [0]) },
  { fn: "parse", args: ["0 200 0 5 image/jpeg\u2028" + _ok(1), _TWO], expect: _verdict([0], [1]) },
  { fn: "parse", args: ["0 200 0 5 image/jpeg\ufffd\ufffd; q=\u00e9\n", _ONE], expect: _verdict([0], []) },
  { fn: "parse", args: [{ gen: "codes", codes: [48, 32, 50, 48, 48, 32, 48, 32, 53, 32, 55357, 10] }, _ONE],
    expect: _verdict([], [0]) },

  // ---- parse: a report that is not text, or longer than curl was allowed ----
  { fn: "parse", args: [null, _TWO], expect: _NONE },
  { fn: "parse", args: [undefined, _TWO], expect: _NONE },
  { fn: "parse", args: [5, _TWO], expect: _NONE },
  { fn: "parse", args: [true, _TWO], expect: _NONE },
  { fn: "parse", args: [{}, _TWO], expect: _NONE },
  { fn: "parse", args: [[_ok(0), _ok(1)], _TWO], expect: _NONE },
  { fn: "parse", args: [_padded(_ok(0) + _ok(1), 8192), _TWO], expect: _verdict([0, 1], []) },
  { fn: "parse", args: [_padded(_ok(0) + _ok(1), 8193), _TWO], expect: _NONE },
  { fn: "parse", args: [{ gen: "repeat", unit: "0 200 0 5 image/jpeg\n", count: 15000 }, _ONE],
    expect: _verdict([], [0]) },
  { fn: "parse", args: [{ gen: "repeat", unit: "9", count: 300000 }, _TWO], expect: _NONE },

  // ---- parse: without a batch there is nothing to report on ----
  { fn: "parse", args: [_ok(0), []], expect: _verdict([], []) },
  { fn: "parse", args: [_ok(0), null], expect: _verdict([], []) },
  { fn: "parse", args: [_ok(0)], expect: _verdict([], []) },
  { fn: "parse", args: [_ok(0), "AB"], expect: _verdict([], []) },
  { fn: "parse", args: [_ok(0), { length: 2 }], expect: _verdict([], []) },
  { fn: "parse", args: [_ok(0), 2], expect: _verdict([], []) },
  // Only the number of items counts: the reader never looks into them.
  { fn: "parse", args: [_ok(0) + _ok(1), [null, "x"]], expect: _verdict([0, 1], []) },

  // ---- evictCount: nothing up to 200 files, then the 50 oldest ----
  { fn: "evictCount", args: [0], expect: 0 },
  { fn: "evictCount", args: [1], expect: 0 },
  { fn: "evictCount", args: [199], expect: 0 },
  { fn: "evictCount", args: [200], expect: 0 },
  { fn: "evictCount", args: [201], expect: 50 },
  { fn: "evictCount", args: [212], expect: 50 },
  { fn: "evictCount", args: [250], expect: 50 },
  { fn: "evictCount", args: [251], expect: 51 },
  { fn: "evictCount", args: [300], expect: 100 },
  { fn: "evictCount", args: [1000000], expect: 999800 },
  { fn: "evictCount", args: [200.5], expect: 50 },
  { fn: "evictCount", args: [250.5], expect: 51 },
  { fn: "evictCount", args: [-1], expect: 0 },
  { fn: "evictCount", args: [-1000], expect: 0 },
  { fn: "evictCount", args: [null], expect: 0 },
  { fn: "evictCount", args: [], expect: 0 },
  { fn: "evictCount", args: ["300"], expect: 0 },
  { fn: "evictCount", args: [[300]], expect: 0 },
  { fn: "evictCount", args: [{ valueOf: null }], expect: 0 },
  { fn: "evictCount", args: [true], expect: 0 }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
