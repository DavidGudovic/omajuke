.pragma library

// Input and expectation table for lib/Segments.js: the request for sponsor
// segments, the reading of the answer, which stretches of a track are
// skipped and which lists are ignored, what happens at a playback position,
// how automatic seeks are spaced, and when skipping switches itself off.
// Every id and every answer here is invented. The same table runs under
// node and inside Qt's JavaScript engine.

var _ID = "AAAAAAAAAAA"
var _OTHER = "abcDEF12345"

// The length of the track most cases use: ten minutes.
var _LENGTH = 600

// ---- Builders for answers ----

// One segment in the shape the service sends, marked on a video of the
// given length.
function _markedOn(length, start, end, category) {
  return { category: category, actionType: "skip", segment: [start, end], videoDuration: length }
}

function _seg(start, end, category) {
  return _markedOn(_LENGTH, start, end, category)
}

// A segment with one field replaced, or removed when the value is undefined.
function _segWith(key, value) {
  var segment = _seg(60, 80, "sponsor")
  if (value === undefined) delete segment[key]
  else segment[key] = value
  return segment
}

function _video(id, segments) {
  return { videoID: id, segments: segments }
}

// The text of an answer that lists these segments for the video.
function _answer(segments) {
  return JSON.stringify([_video(_ID, segments)])
}

// The text of an answer with one segment written out by hand, for values
// that only raw text can carry.
function _raw(segment) {
  return "[{\"videoID\":\"AAAAAAAAAAA\",\"segments\":[" + segment + "]}]"
}

function _repeat(unit, count) {
  var out = ""
  var piece = unit
  for (var left = count; left > 0; left = Math.floor(left / 2)) {
    if (left % 2 === 1) out += piece
    piece += piece
  }
  return out
}

// An answer padded with spaces, which JSON allows, to an exact length.
function _padded(length) {
  var text = _answer([_seg(60, 80, "sponsor")])
  return text + _repeat(" ", length - text.length)
}

// An answer with this many videos in it, ours last.
function _bucket(count) {
  var videos = []
  for (var i = 1; i < count; i++) videos.push(_video(_OTHER, []))
  videos.push(_video(_ID, [_seg(60, 80, "sponsor")]))
  return JSON.stringify(videos)
}

// This many segments that are too short to keep.
function _junk(count) {
  var segments = []
  for (var i = 0; i < count; i++) segments.push(_seg(i, i + 0.01, "sponsor"))
  return segments
}

// This many segments of one second, two seconds apart, on a long track.
function _spaced(count, length) {
  var segments = []
  for (var i = 0; i < count; i++) segments.push(_markedOn(length, i * 2, i * 2 + 1, "sponsor"))
  return segments
}

// ---- Builders for expectations ----

function _stretch(start, end, category) {
  return { start: start, end: end, category: category, toEnd: false }
}

function _toEnd(start, end, category) {
  return { start: start, end: end, category: category, toEnd: true }
}

function _spacedStretches(count) {
  var stretches = []
  for (var i = 0; i < count; i++) stretches.push(_stretch(i * 2, i * 2 + 1, "sponsor"))
  return stretches
}

function _unfired(count) {
  var marks = []
  for (var i = 0; i < count; i++) marks.push(false)
  return marks
}

function _idle(fired) {
  return { action: "none", to: 0, skip: null, fired: fired }
}

function _act(action, stretch, fired) {
  return {
    action: action,
    to: stretch.end,
    skip: { category: stretch.category, from: stretch.start, to: stretch.end },
    fired: fired
  }
}

// ---- Shared values ----

var _ONE = [_stretch(60, 80, "sponsor")]
var _GOOD = _seg(60, 80, "sponsor")

// A picked list: a stretch early on, one in the middle, one that runs to
// the end of the track.
var _FIRST = _stretch(10, 20, "selfpromo")
var _SECOND = _stretch(60, 90, "sponsor")
var _LAST = _toEnd(590, 600, "interaction")
var _LIST = [_FIRST, _SECOND, _LAST]

var _QUERY = "?categories=%5B%22sponsor%22%2C%22selfpromo%22%2C%22interaction%22%2C%22music_offtopic%22%5D"
  + "&actionTypes=%5B%22skip%22%5D"

var _ARGV_TAIL = [
  "-q", "--no-progress-meter", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "0",
  "--tlsv1.2", "--connect-timeout", "3", "--max-time", "5", "--max-filesize", "1048576",
  "--user-agent", "", "--header", "Accept-Language:", "--write-out", "\\n%{response_code}\\n",
  "--config", "-"
]

// A clock reading in milliseconds.
var _NOW = 1700000000000

var MODULE = "Segments"
var CASES = [
  // ---- argv: the same command whatever is asked for ----
  { fn: "argv", args: [{ curl: "/usr/bin/curl" }], expect: ["/usr/bin/curl"].concat(_ARGV_TAIL) },
  { fn: "argv", args: [{ curl: "/opt/stubs/curl.js", mpv: "/usr/bin/mpv" }],
    expect: ["/opt/stubs/curl.js"].concat(_ARGV_TAIL) },
  { fn: "argv", args: [{ curl: "curl" }], expect: [] },
  { fn: "argv", args: [{ curl: "" }], expect: [] },
  { fn: "argv", args: [{ curl: 42 }], expect: [] },
  { fn: "argv", args: [{ curl: ["/usr/bin/curl"] }], expect: [] },
  { fn: "argv", args: [{}], expect: [] },
  { fn: "argv", args: [null], expect: [] },
  { fn: "argv", args: ["/usr/bin/curl"], expect: [] },
  { fn: "argv", args: [["/usr/bin/curl"]], expect: [] },

  // ---- config: the bucket of the id's hash, and never the id ----
  { fn: "config", args: [_ID],
    expect: "url = \"https://sponsor.ajay.app/api/skipSegments/dd20" + _QUERY + "\"\n" },
  { fn: "config", args: [_OTHER],
    expect: "url = \"https://sponsor.ajay.app/api/skipSegments/3abf" + _QUERY + "\"\n" },
  { fn: "config", args: ["constructor"],
    expect: "url = \"https://sponsor.ajay.app/api/skipSegments/e3c1" + _QUERY + "\"\n" },
  { fn: "config", args: ["-_-_-_-_-_-"],
    expect: "url = \"https://sponsor.ajay.app/api/skipSegments/e7bb" + _QUERY + "\"\n" },
  { fn: "config", args: [""], expect: "" },
  { fn: "config", args: ["AAAAAAAAAA"], expect: "" },
  { fn: "config", args: ["AAAAAAAAAAAA"], expect: "" },
  { fn: "config", args: ["AAAAAAAAAA\""], expect: "" },
  { fn: "config", args: ["AAAAAAAAAA\n"], expect: "" },
  { fn: "config", args: ["AAAAAAAAAAA\n"], expect: "" },
  { fn: "config", args: ["https://www.youtube.com/watch?v=AAAAAAAAAAA"], expect: "" },
  { fn: "config", args: [null], expect: "" },
  { fn: "config", args: [42], expect: "" },
  { fn: "config", args: [["AAAAAAAAAAA"]], expect: "" },

  // ---- reply: the body, when the job succeeded and the answer was "found" ----
  { fn: "reply", args: [{ ok: true, stdout: "[{\"videoID\":\"AAAAAAAAAAA\"}]\n200\n" }],
    expect: "[{\"videoID\":\"AAAAAAAAAAA\"}]" },
  { fn: "reply",
    args: [{ ok: true, error: "", exitCode: 0, stdout: "[]\n200\n", stderr: "", durationMs: 300 }],
    expect: "[]" },
  { fn: "reply", args: [{ ok: true, stdout: "[\n1,\n2\n]\n200\n" }], expect: "[\n1,\n2\n]" },
  // A bucket without segments is answered with "not found".
  { fn: "reply", args: [{ ok: true, stdout: "[]\n404\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "Not Found\n404\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n400\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n429\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n500\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n301\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n204\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n000\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n1200\n" }], expect: "" },
  // A body cannot pass for a status line: only the last line counts.
  { fn: "reply", args: [{ ok: true, stdout: "[]\n200\n\n404\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n200\nmore" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\n200" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]200\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "200\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "\n200\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "" }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: "[]\r\n200\r\n" }], expect: "" },
  // A failed job has nothing to say, whatever it printed.
  { fn: "reply", args: [{ ok: false, error: "exit", exitCode: 63, stdout: "[]\n200\n" }], expect: "" },
  { fn: "reply", args: [{ ok: false, error: "timeout", exitCode: 124, stdout: "" }], expect: "" },
  { fn: "reply", args: [{ ok: "true", stdout: "[]\n200\n" }], expect: "" },
  { fn: "reply", args: [{ ok: 1, stdout: "[]\n200\n" }], expect: "" },
  { fn: "reply", args: [{ stdout: "[]\n200\n" }], expect: "" },
  { fn: "reply", args: [{ ok: true }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: null }], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: ["[]\n200\n"] }], expect: "" },
  { fn: "reply", args: [null], expect: "" },
  { fn: "reply", args: ["[]\n200\n"], expect: "" },
  { fn: "reply", args: [[{ ok: true, stdout: "[]\n200\n" }]], expect: "" },
  { fn: "reply", args: [{ ok: true, stdout: _padded(1048576) + "\n200\n" }], expect: "" },

  // ---- pick: the segments of the playing video, in playing order ----
  { fn: "pick", args: [_answer([_GOOD]), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_answer([_seg(59.749, 78.944, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(59.749, 78.944, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(300, 330, "interaction"), _seg(60, 80, "sponsor"),
    _seg(10, 20, "selfpromo")]), _ID, _LENGTH, false],
    expect: [_stretch(10, 20, "selfpromo"), _stretch(60, 80, "sponsor"), _stretch(300, 330, "interaction")] },
  // The answer lists a whole bucket. Other videos' segments are not ours.
  { fn: "pick", args: [JSON.stringify([_video(_OTHER, [_seg(100, 200, "sponsor")]), _video(_ID, [_GOOD]),
    _video("-_-_-_-_-_-", [_seg(300, 400, "sponsor")])]), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [JSON.stringify([_video(_OTHER, [_GOOD])]), _ID, _LENGTH, false], expect: [] },
  // The fields the service sends besides the ones that are read.
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,80],"
    + "\"UUID\":\"0000000000000000000000000000000000000000000000000000000000000000\","
    + "\"videoDuration\":600.4,\"locked\":0,\"votes\":1,\"description\":\"\"}"), _ID, _LENGTH, false],
    expect: _ONE },
  { fn: "pick", args: ["[]", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([]), _ID, _LENGTH, false], expect: [] },
  // An id that is also the name of a prototype member is an id like any other.
  { fn: "pick", args: [JSON.stringify([_video("constructor", [_GOOD])]), "constructor", _LENGTH, false],
    expect: _ONE },
  { fn: "pick", args: [_answer([_GOOD]), "constructor", _LENGTH, false], expect: [] },

  // ---- pick: segments that overlap or touch become one stretch ----
  { fn: "pick", args: [_answer([_seg(60, 80, "sponsor"), _seg(70, 100, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 100, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(70, 100, "sponsor"), _seg(60, 80, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 100, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(60, 80, "sponsor"), _seg(80, 100, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 100, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(60, 100, "sponsor"), _seg(70, 80, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 100, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(90, 120, "sponsor"), _seg(60, 80, "sponsor"), _seg(75, 95, "sponsor"),
    _seg(200, 210, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 120, "sponsor"), _stretch(200, 210, "sponsor")] },
  { fn: "pick", args: [_answer([_GOOD, _GOOD, _GOOD]), _ID, _LENGTH, false], expect: _ONE },
  // A gap, however small, stays a gap.
  { fn: "pick", args: [_answer([_seg(60, 80, "sponsor"), _seg(80.5, 100, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 80, "sponsor"), _stretch(80.5, 100, "sponsor")] },
  // A merged stretch is named after the segment that opens it: the earliest
  // one, and of several that start together the first in the list of
  // categories, whichever of them is longer and wherever they stand.
  { fn: "pick", args: [_answer([_seg(70, 100, "sponsor"), _seg(60, 80, "selfpromo")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 100, "selfpromo")] },
  { fn: "pick",
    args: [_answer([_seg(60, 70, "interaction"), _seg(60, 90, "selfpromo")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 90, "selfpromo")] },
  { fn: "pick", args: [_answer([_seg(60, 80, "interaction"), _seg(60, 80, "sponsor")]), _ID, _LENGTH, false],
    expect: _ONE },
  { fn: "pick", args: [_answer([_seg(60, 80, "sponsor"), _seg(60, 80, "interaction")]), _ID, _LENGTH, false],
    expect: _ONE },
  { fn: "pick", args: [_answer([_seg(60, 90, "interaction"), _seg(60, 70, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 90, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(60, 70, "sponsor"), _seg(60, 90, "interaction")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 90, "sponsor")] },

  // ---- pick: a list that would skip most of the track is ignored whole ----
  { fn: "pick", args: [_answer([_seg(0, 600, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(0, 601, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(0, 481, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(0, 480.5, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  // Four fifths exactly is still allowed.
  { fn: "pick", args: [_answer([_seg(0, 480, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(0, 480, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(120, 600, "sponsor")]), _ID, _LENGTH, false],
    expect: [_toEnd(120, 600, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(0, 200, "sponsor"), _seg(150, 400, "selfpromo"),
    _seg(390, 500, "interaction")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(0, 250, "sponsor"), _seg(300, 550, "sponsor")]), _ID, _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [_answer([_seg(0, 200, "sponsor"), _seg(300, 500, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(0, 200, "sponsor"), _stretch(300, 500, "sponsor")] },
  // The good segment does not survive the bad company.
  { fn: "pick", args: [_answer([_GOOD, _seg(0, 600, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD, _seg(100, 599, "selfpromo")]), _ID, _LENGTH, false], expect: [] },
  // A stretch that reaches the end is carried out by going to the next
  // track, which also skips whatever is left behind it. It counts from its
  // start to the end of the track, so that a fifth of the track is always
  // played, however short the track is.
  { fn: "pick", args: [_answer([_seg(120, 599, "sponsor")]), _ID, _LENGTH, false],
    expect: [_toEnd(120, 599, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(119.5, 599, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(0, 100, "sponsor"), _seg(220, 599.5, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(0, 100, "sponsor"), _toEnd(220, 599.5, "sponsor")] },
  { fn: "pick",
    args: [_answer([_seg(0, 100, "sponsor"), _seg(219.5, 599.5, "sponsor")]), _ID, _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [_answer([_markedOn(5, 0, 4, "sponsor")]), _ID, 5, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(5, 1, 4, "sponsor")]), _ID, 5, false],
    expect: [_toEnd(1, 4, "sponsor")] },
  { fn: "pick", args: [_answer([_markedOn(5, 0.5, 4, "sponsor")]), _ID, 5, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(1.25, 0, 1, "sponsor")]), _ID, 1.25, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(10, 1, 9, "sponsor")]), _ID, 10, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(10, 2, 9, "sponsor")]), _ID, 10, false],
    expect: [_toEnd(2, 9, "sponsor")] },
  { fn: "pick", args: [_answer([_markedOn(10, 0, 8, "sponsor")]), _ID, 10, false],
    expect: [_stretch(0, 8, "sponsor")] },
  // Time that several segments cover is counted once.
  { fn: "pick", args: [_answer([_seg(0, 300, "sponsor"), _seg(0, 300, "sponsor"), _seg(100, 300, "sponsor"),
    _seg(0, 200, "sponsor")]), _ID, _LENGTH, false], expect: [_stretch(0, 300, "sponsor")] },

  // ---- pick: every number is checked against the track ----
  { fn: "pick", args: [_answer([_seg(-5, 20, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(-0.001, 20, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(-80, -60, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(80, 60, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 60, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 60.5, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 60.999, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 61, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 61, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(0, 1, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(0, 1, "sponsor")] },
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[-0,20],"
    + "\"videoDuration\":600}"), _ID, _LENGTH, false], expect: [_stretch(0, 20, "sponsor")] },
  // A segment may claim to end up to a second past the end, and is cut there.
  { fn: "pick", args: [_answer([_seg(590, 601, "sponsor")]), _ID, _LENGTH, false],
    expect: [_toEnd(590, 600, "sponsor")] },
  // What is left of it within the track has to last a second as well. A
  // shorter rest is not worth a seek, and no skip could start in one of
  // half a second.
  { fn: "pick", args: [_answer([_seg(599, 600.9, "sponsor")]), _ID, _LENGTH, false],
    expect: [_toEnd(599, 600, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(599.1, 600.9, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(599.5, 600.9, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(599.9, 600.9, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(500, 599, "sponsor"), _seg(599.2, 600.5, "selfpromo")]), _ID, _LENGTH,
    false], expect: [_toEnd(500, 599, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(590, 601.5, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(590, 6000, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(600, 601, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(700, 720, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  // Within a second of the end counts as reaching it.
  { fn: "pick", args: [_answer([_seg(500, 599, "sponsor")]), _ID, _LENGTH, false],
    expect: [_toEnd(500, 599, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(500, 598.9, "sponsor")]), _ID, _LENGTH, false],
    expect: [_stretch(500, 598.9, "sponsor")] },
  // The bad segment goes, the good one next to it stays.
  { fn: "pick", args: [_answer([_seg(-5, 20, "sponsor"), _GOOD, _seg(80, 60, "sponsor"),
    _seg(590, 6000, "sponsor")]), _ID, _LENGTH, false], expect: _ONE },

  // ---- pick: a position is two numbers and nothing else ----
  { fn: "pick", args: [_answer([_segWith("segment", ["60", "80"])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [60, "80"])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [null, 80])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [60, null])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [false, true])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [[60], [80]])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [60, 80, 100])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [60])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", [])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", { 0: 60, 1: 80, length: 2 })]), _ID, _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", "60,80")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", 60)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", null)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("segment", undefined)]), _ID, _LENGTH, false], expect: [] },
  // JSON has no way to write "not a number", and a number too large to hold
  // arrives as infinity.
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[NaN,80],"
    + "\"videoDuration\":600}"), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,Infinity],"
    + "\"videoDuration\":600}"), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,1e999],"
    + "\"videoDuration\":600}"), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[-1e999,80],"
    + "\"videoDuration\":600}"), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[1e308,1e309],"
    + "\"videoDuration\":600}"), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,80],"
    + "\"videoDuration\":1e999}"), _ID, _LENGTH, false], expect: [] },

  // ---- pick: a segment marked on a video of another length is stale ----
  { fn: "pick", args: [_answer([_markedOn(601.9, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_answer([_markedOn(602, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_answer([_markedOn(598, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_answer([_markedOn(602.5, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(597.5, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(900, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(90, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  // A segment that does not say which length it was marked on cannot be
  // checked, and goes with the stale ones.
  { fn: "pick", args: [_answer([_markedOn(0, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("videoDuration", undefined)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("videoDuration", null)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("videoDuration", "600")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("videoDuration", [600])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("videoDuration", true)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(-600, 60, 80, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(0, 0.2, 1.4, "sponsor")]), _ID, 1.5, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(900, 60, 80, "sponsor"), _GOOD]), _ID, _LENGTH, false],
    expect: _ONE },

  // ---- pick: nothing is skipped while the length of the track is unknown ----
  { fn: "pick", args: [_answer([_GOOD]), _ID, null, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), _ID, 0, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), _ID, -600, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), _ID, "600", false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), _ID, [600], false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), _ID, true, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), _ID, NaN, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), _ID, Infinity, false], expect: [] },
  // Beyond two days a duration counts as unknown everywhere in the plugin.
  { fn: "pick", args: [_answer([_markedOn(172801, 60, 80, "sponsor")]), _ID, 172801, false], expect: [] },
  { fn: "pick", args: [_answer([_markedOn(172800, 60, 80, "sponsor")]), _ID, 172800, false], expect: _ONE },
  { fn: "pick", args: [_answer([_GOOD]), _ID, 599.4, false], expect: _ONE },
  { fn: "pick", args: [_answer([_markedOn(30, 10, 12, "sponsor")]), _ID, 30.02, false],
    expect: [_stretch(10, 12, "sponsor")] },

  // ---- pick: the id has to be an id, and the video has to be this one ----
  { fn: "pick", args: [_answer([_GOOD]), "", _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), "AAAAAAAAAA", _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), null, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), 42, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]), [_ID], _LENGTH, false], expect: [] },
  // Not even when the answer calls a video by the same text.
  { fn: "pick", args: [JSON.stringify([_video("", [_GOOD])]), "", _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([_video("AAAAAAAAAA", [_GOOD])]), "AAAAAAAAAA", _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [JSON.stringify([_video("AAAAAAAAAAAA", [_GOOD])]), "AAAAAAAAAAAA", _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [JSON.stringify([_video("not an id!!", [_GOOD])]), "not an id!!", _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [JSON.stringify([_video("aaaaaaaaaaa", [_GOOD])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([_video("AAAAAAAAAAA ", [_GOOD])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([_video([_ID], [_GOOD])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([_video(null, [_GOOD])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([{ segments: [_GOOD] }]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([{ videoId: _ID, segments: [_GOOD] }]), _ID, _LENGTH, false],
    expect: [] },

  // ---- pick: only the categories that are skipped, compared as plain text ----
  { fn: "pick", args: [_answer([_seg(60, 80, "selfpromo")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 80, "selfpromo")] },
  { fn: "pick", args: [_answer([_seg(60, 80, "interaction")]), _ID, _LENGTH, false],
    expect: [_stretch(60, 80, "interaction")] },
  { fn: "pick", args: [_answer([_seg(60, 80, "constructor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "__proto__")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "toString")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "hasOwnProperty")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "length")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "0")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "Sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "sponsor ")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, ["sponsor"])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, 0)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, null)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("category", undefined)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "intro")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "outro")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "preview")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "filler")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "poi_highlight")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "exclusive_access")]), _ID, _LENGTH, false], expect: [] },

  // ---- pick: talk in a music video is skipped only while no picture shows ----
  { fn: "pick", args: [_answer([_seg(60, 80, "music_offtopic")]), _ID, _LENGTH, true],
    expect: [_stretch(60, 80, "music_offtopic")] },
  { fn: "pick", args: [_answer([_seg(60, 80, "music_offtopic")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "music_offtopic")]), _ID, _LENGTH, "true"], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "music_offtopic")]), _ID, _LENGTH, 1], expect: [] },
  { fn: "pick", args: [_answer([_seg(60, 80, "music_offtopic")]), _ID, _LENGTH, null], expect: [] },
  { fn: "pick", args: [_answer([_seg(10, 20, "music_offtopic"), _GOOD]), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_answer([_seg(10, 20, "music_offtopic"), _GOOD]), _ID, _LENGTH, true],
    expect: [_stretch(10, 20, "music_offtopic"), _stretch(60, 80, "sponsor")] },
  { fn: "pick",
    args: [_answer([_seg(70, 100, "sponsor"), _seg(60, 80, "music_offtopic")]), _ID, _LENGTH, true],
    expect: [_stretch(60, 100, "music_offtopic")] },
  { fn: "pick",
    args: [_answer([_seg(70, 100, "sponsor"), _seg(60, 80, "music_offtopic")]), _ID, _LENGTH, false],
    expect: [_stretch(70, 100, "sponsor")] },
  { fn: "pick", args: [_answer([_seg(60, 80, "constructor")]), _ID, _LENGTH, true], expect: [] },

  // ---- pick: only segments that say "skip" ----
  { fn: "pick", args: [_answer([_segWith("actionType", "mute")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", "full")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", "poi")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", "chapter")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", "SKIP")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", "constructor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", ["skip"])]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", null)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_segWith("actionType", undefined)]), _ID, _LENGTH, false], expect: [] },

  // ---- pick: an answer of the wrong shape yields nothing ----
  { fn: "pick", args: ["", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: ["{}", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: ["null", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: ["42", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: ["\"AAAAAAAAAAA\"", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: ["[", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: ["Not Found", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: ["<html><body>Blocked</body></html>", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]).slice(0, -1), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]) + "]", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify(_video(_ID, [_GOOD])), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([[_video(_ID, [_GOOD])]]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([null, 42, "AAAAAAAAAAA", true, [], [_GOOD]]), _ID, _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [JSON.stringify([null, 42, _video(_ID, [null, 42, "sponsor", [], [60, 80], _GOOD])]),
    _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [JSON.stringify([_video(_ID, null)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([_video(_ID, _GOOD)]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([_video(_ID, "sponsor")]), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [JSON.stringify([{ videoID: _ID }]), _ID, _LENGTH, false], expect: [] },
  // Only text is an answer. An answer that was parsed elsewhere is not.
  { fn: "pick", args: [null, _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [42, _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [[_video(_ID, [_GOOD])], _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_video(_ID, [_GOOD]), _ID, _LENGTH, false], expect: [] },
  // A key spelled __proto__ is an ordinary key, and nothing under it is read.
  { fn: "pick", args: ["[{\"__proto__\":{\"videoID\":\"AAAAAAAAAAA\",\"segments\":[{\"category\":\"sponsor\","
    + "\"actionType\":\"skip\",\"segment\":[60,80],\"videoDuration\":600}]}}]", _ID, _LENGTH, false],
    expect: [] },
  { fn: "pick", args: [_raw("{\"__proto__\":{\"category\":\"sponsor\",\"actionType\":\"skip\","
    + "\"segment\":[60,80],\"videoDuration\":600}}"), _ID, _LENGTH, false], expect: [] },
  // Of two keys with the same name the last one counts, as in any JSON reader.
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,80],"
    + "\"videoDuration\":600,\"category\":\"intro\"}"), _ID, _LENGTH, false], expect: [] },

  // ---- pick: an answer with anything but printable ASCII in it is refused ----
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,80],"
    + "\"videoDuration\":600,\"description\":\"caf\u00e9\"}"), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,80],"
    + "\"videoDuration\":600,\"description\":\"\ufffd\"}"), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]) + "\t", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]) + "\r\n", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]) + "\u0000", _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer([_GOOD]) + "\n", _ID, _LENGTH, false], expect: _ONE },
  // The same text written with escapes is ASCII, and fine.
  { fn: "pick", args: [_raw("{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[60,80],"
    + "\"videoDuration\":600,\"description\":\"caf\\u00e9\"}"), _ID, _LENGTH, false], expect: _ONE },

  // ---- pick: no answer is too large, too long or too deep to refuse ----
  { fn: "pick", args: [_padded(1048576), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_padded(1048577), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [{ gen: "repeat", unit: " ", count: 3000000 }, _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [{ gen: "repeat", unit: "[", count: 100000 }, _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [{ gen: "repeat", unit: "[{\"segments\":", count: 50000 }, _ID, _LENGTH, false],
    expect: [] },
  // Nesting that is well formed, and far deeper than any answer.
  { fn: "pick", args: [_repeat("[", 5000) + _repeat("]", 5000), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_bucket(2000), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_bucket(2001), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_bucket(10000), _ID, _LENGTH, false], expect: [] },
  // Only the first hundred segments of the video are looked at.
  { fn: "pick", args: [_answer(_junk(99).concat([_GOOD])), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [_answer(_junk(100).concat([_GOOD])), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer(_junk(10000)), _ID, _LENGTH, false], expect: [] },
  { fn: "pick", args: [_answer(_junk(10000).concat([_GOOD])), _ID, _LENGTH, false], expect: [] },
  // Listing the video several times does not raise the limit.
  { fn: "pick", args: [JSON.stringify([_video(_ID, _junk(60)), _video(_OTHER, _junk(60)),
    _video(_ID, _junk(39).concat([_GOOD]))]), _ID, _LENGTH, false], expect: _ONE },
  { fn: "pick", args: [JSON.stringify([_video(_ID, _junk(60)), _video(_OTHER, _junk(60)),
    _video(_ID, _junk(40).concat([_GOOD]))]), _ID, _LENGTH, false], expect: [] },
  // Ten thousand segments that each pass every check: a hundred are taken.
  { fn: "pick", args: [_answer(_spaced(10000, 30000)), _ID, 30000, false], expect: _spacedStretches(100) },
  { fn: "pick", args: [_answer(_spaced(100, 300)), _ID, 300, false], expect: _spacedStretches(100) },

  // ---- next: a skip starts inside a segment and goes to its end ----
  { fn: "next", args: [0, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [9.9, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [10, _LIST, []], expect: _act("seek", _FIRST, [true, false, false]) },
  { fn: "next", args: [15, _LIST, []], expect: _act("seek", _FIRST, [true, false, false]) },
  { fn: "next", args: [19.4, _LIST, []], expect: _act("seek", _FIRST, [true, false, false]) },
  // Half a second before the end there is nothing left worth a seek.
  { fn: "next", args: [19.5, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [19.9, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [20, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [40, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [60, _LIST, [true, false, false]], expect: _act("seek", _SECOND, [true, true, false]) },
  { fn: "next", args: [75, _LIST, []], expect: _act("seek", _SECOND, [false, true, false]) },
  { fn: "next", args: [300, _LIST, [true, true, false]], expect: _idle([true, true, false]) },

  // ---- next: a segment that reaches the end means the next track ----
  { fn: "next", args: [590, _LIST, [true, true, false]], expect: _act("advance", _LAST, [true, true, true]) },
  { fn: "next", args: [599.4, _LIST, []], expect: _act("advance", _LAST, [false, false, true]) },
  { fn: "next", args: [599.5, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [600, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [700, _LIST, [true, true, true]], expect: _idle([true, true, true]) },
  // Only the flag itself says so.
  { fn: "next", args: [590, [{ start: 590, end: 600, category: "sponsor", toEnd: "yes" }], []],
    expect: _act("seek", _stretch(590, 600, "sponsor"), [true]) },
  { fn: "next", args: [590, [{ start: 590, end: 600, category: "sponsor" }], []],
    expect: _act("seek", _stretch(590, 600, "sponsor"), [true]) },

  // ---- next: a segment fires once, until the position is in front of it again ----
  { fn: "next", args: [15, _LIST, [true, false, false]], expect: _idle([true, false, false]) },
  { fn: "next", args: [10, _LIST, [true, false, false]], expect: _idle([true, false, false]) },
  { fn: "next", args: [19.4, _LIST, [true, false, false]], expect: _idle([true, false, false]) },
  { fn: "next", args: [75, _LIST, [true, true, false]], expect: _idle([true, true, false]) },
  { fn: "next", args: [595, _LIST, [true, true, true]], expect: _idle([true, true, true]) },
  { fn: "next", args: [9.9, _LIST, [true, false, false]], expect: _idle([false, false, false]) },
  { fn: "next", args: [0, _LIST, [true, true, true]], expect: _idle([false, false, false]) },
  { fn: "next", args: [30, _LIST, [true, true, true]], expect: _idle([true, false, false]) },
  { fn: "next", args: [100, _LIST, [true, true, true]], expect: _idle([true, true, false]) },
  // Seeking back into a skipped segment plays it, and arms the ones behind.
  { fn: "next", args: [65, _LIST, [true, true, true]], expect: _idle([true, true, false]) },
  { fn: "next", args: [15, _LIST, [true, true, true]], expect: _idle([true, false, false]) },
  { fn: "next", args: [15, _LIST, [false, true, true]], expect: _act("seek", _FIRST, [true, false, false]) },

  // ---- next: marks are true or nothing, one per segment ----
  { fn: "next", args: [15, _LIST, null], expect: _act("seek", _FIRST, [true, false, false]) },
  { fn: "next", args: [15, _LIST, "true"], expect: _act("seek", _FIRST, [true, false, false]) },
  { fn: "next", args: [15, _LIST, { 0: true, length: 1 }],
    expect: _act("seek", _FIRST, [true, false, false]) },
  { fn: "next", args: [15, _LIST, [1, "true", null]], expect: _act("seek", _FIRST, [true, false, false]) },
  { fn: "next", args: [15, _LIST, ["true"]], expect: _act("seek", _FIRST, [true, false, false]) },
  { fn: "next", args: [15, _LIST, [true]], expect: _idle([true, false, false]) },
  { fn: "next", args: [300, _LIST, [true, true, false, true, true, true]],
    expect: _idle([true, true, false]) },
  { fn: "next", args: [300, _LIST, [[true], { fired: true }, 1]], expect: _idle([false, false, false]) },

  // ---- next: without a position there is no decision ----
  { fn: "next", args: [null, _LIST, [true]], expect: _idle([true, false, false]) },
  { fn: "next", args: [-1, _LIST, [true]], expect: _idle([true, false, false]) },
  { fn: "next", args: ["15", _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [[15], _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [true, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [NaN, _LIST, []], expect: _idle([false, false, false]) },
  { fn: "next", args: [Infinity, _LIST, [true, true, true]], expect: _idle([true, true, true]) },

  // ---- next: a list is checked again, whoever made it ----
  { fn: "next", args: [15, [], []], expect: _idle([]) },
  { fn: "next", args: [15, null, [true]], expect: _idle([]) },
  { fn: "next", args: [15, "segments", []], expect: _idle([]) },
  { fn: "next", args: [15, _FIRST, []], expect: _idle([]) },
  { fn: "next", args: [15, { 0: _FIRST, length: 1 }, []], expect: _idle([]) },
  { fn: "next", args: [1, _spacedStretches(101), []], expect: _idle([]) },
  { fn: "next", args: [198.2, _spacedStretches(100), []],
    expect: _act("seek", _stretch(198, 199, "sponsor"), _unfired(99).concat([true])) },
  // What is not a segment is passed over, and the marks keep their places.
  { fn: "next", args: [65, [null, _SECOND, "segment"], [true, false, true]],
    expect: _act("seek", _SECOND, [true, true, true]) },
  { fn: "next", args: [15, [{ start: 20, end: 10, category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 15, end: 15, category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  // An entry of half a second or less has no position a skip could start at.
  { fn: "next", args: [15, [{ start: 15, end: 15.5, category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 15, end: 15.75, category: "sponsor", toEnd: false }], []],
    expect: _act("seek", _stretch(15, 15.75, "sponsor"), [true]) },
  // No track is longer than two days, so no seek goes further than that.
  { fn: "next", args: [15, [{ start: 10, end: 172800, category: "sponsor", toEnd: false }], []],
    expect: _act("seek", _stretch(10, 172800, "sponsor"), [true]) },
  { fn: "next", args: [15, [{ start: 10, end: 172800.5, category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, end: 1e308, category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [0, [{ start: -10, end: 20, category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: "10", end: "20", category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, end: null, category: "sponsor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, category: "sponsor", toEnd: false }], []], expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, end: 20, category: "constructor", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, end: 20, category: "__proto__", toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, end: 20, category: ["sponsor"], toEnd: false }], []],
    expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, end: 20, toEnd: false }], []], expect: _idle([false]) },
  { fn: "next", args: [15, [[10, 20, "sponsor", false]], []], expect: _idle([false]) },
  { fn: "next", args: [15, [{ start: 10, end: 20, category: "music_offtopic", toEnd: false }], []],
    expect: _act("seek", _stretch(10, 20, "music_offtopic"), [true]) },
  // Even a list that overlaps or runs backwards only ever sends playback forward.
  { fn: "next", args: [25, [_stretch(10, 50, "sponsor"), _stretch(20, 30, "selfpromo")], []],
    expect: _act("seek", _stretch(10, 50, "sponsor"), [true, false]) },
  { fn: "next", args: [25, [_stretch(10, 50, "sponsor"), _stretch(20, 30, "selfpromo")], [true, false]],
    expect: _act("seek", _stretch(20, 30, "selfpromo"), [true, true]) },
  { fn: "next", args: [50, [_stretch(10, 50, "sponsor"), _stretch(20, 30, "selfpromo")], [true, false]],
    expect: _idle([true, false]) },
  { fn: "next", args: [65, [_SECOND, _FIRST], []], expect: _act("seek", _SECOND, [true, false]) },

  // ---- pending: whether a segment can still fire from here on ----
  { fn: "pending", args: [0, _LIST, []], expect: true },
  { fn: "pending", args: [15, _LIST, []], expect: true },
  { fn: "pending", args: [20, _LIST, [true, false, false]], expect: true },
  { fn: "pending", args: [100, _LIST, [true, true, false]], expect: true },
  { fn: "pending", args: [595, _LIST, [true, true, false]], expect: true },
  { fn: "pending", args: [595, _LIST, [true, true, true]], expect: false },
  { fn: "pending", args: [599.5, _LIST, []], expect: false },
  { fn: "pending", args: [600, _LIST, []], expect: false },
  { fn: "pending", args: [9000, _LIST, []], expect: false },
  { fn: "pending", args: [100, [_FIRST, _SECOND], []], expect: false },
  { fn: "pending", args: [89.5, [_FIRST, _SECOND], []], expect: false },
  { fn: "pending", args: [89.4, [_FIRST, _SECOND], []], expect: true },
  { fn: "pending", args: [89.4, [_FIRST, _SECOND], [true, true]], expect: false },
  // A segment in front of the position will fire, whatever its mark says.
  { fn: "pending", args: [5, _LIST, [true, true, true]], expect: true },
  { fn: "pending", args: [100, _LIST, [true, true, true]], expect: true },
  { fn: "pending", args: [0, [], []], expect: false },
  { fn: "pending", args: [0, null, []], expect: false },
  { fn: "pending", args: [0, "segments", []], expect: false },
  { fn: "pending", args: [0, _spacedStretches(101), []], expect: false },
  { fn: "pending", args: [0, [null, { start: 20, end: 10, category: "sponsor" }, "segment"], []],
    expect: false },
  { fn: "pending", args: [0, [{ start: 10, end: 20, category: "constructor" }], []], expect: false },
  // An entry that can never fire is not worth waiting for.
  { fn: "pending", args: [0, [{ start: 10, end: 10.3, category: "sponsor" }], []], expect: false },
  { fn: "pending", args: [0, [{ start: 10, end: 10.5, category: "sponsor" }], []], expect: false },
  { fn: "pending", args: [0, [{ start: 10, end: 10.75, category: "sponsor" }], []], expect: true },
  { fn: "pending", args: [0, [{ start: 10, end: 1e308, category: "sponsor" }], []], expect: false },
  { fn: "pending", args: [15, _LIST, null], expect: true },
  { fn: "pending", args: [595, _LIST, "true"], expect: true },
  { fn: "pending", args: [null, _LIST, []], expect: false },
  { fn: "pending", args: [-1, _LIST, []], expect: false },
  { fn: "pending", args: ["0", _LIST, []], expect: false },
  { fn: "pending", args: [NaN, _LIST, []], expect: false },

  // ---- mayAct: automatic seeks are half a second apart ----
  { fn: "mayAct", args: [_NOW, 0], expect: true },
  { fn: "mayAct", args: [_NOW, _NOW - 60000], expect: true },
  { fn: "mayAct", args: [_NOW, _NOW - 500], expect: true },
  { fn: "mayAct", args: [_NOW, _NOW - 499], expect: false },
  { fn: "mayAct", args: [_NOW, _NOW - 1], expect: false },
  { fn: "mayAct", args: [_NOW, _NOW], expect: false },
  { fn: "mayAct", args: [499, 0], expect: false },
  { fn: "mayAct", args: [500, 0], expect: true },
  // The clock was set back since the last seek.
  { fn: "mayAct", args: [_NOW, _NOW + 1], expect: true },
  { fn: "mayAct", args: [_NOW, _NOW + 3600000], expect: true },
  { fn: "mayAct", args: [_NOW, null], expect: false },
  { fn: "mayAct", args: [null, 0], expect: false },
  { fn: "mayAct", args: [null, null], expect: false },
  { fn: "mayAct", args: ["1700000000000", 0], expect: false },
  { fn: "mayAct", args: [_NOW, "0"], expect: false },
  { fn: "mayAct", args: [_NOW, [0]], expect: false },
  { fn: "mayAct", args: [NaN, 0], expect: false },
  { fn: "mayAct", args: [_NOW, NaN], expect: false },
  { fn: "mayAct", args: [Infinity, 0], expect: false },
  { fn: "mayAct", args: [_NOW, -Infinity], expect: false },

  // ---- tripped: three in a row, or a count that is no count ----
  { fn: "tripped", args: [0], expect: false },
  { fn: "tripped", args: [1], expect: false },
  { fn: "tripped", args: [2], expect: false },
  { fn: "tripped", args: [3], expect: true },
  { fn: "tripped", args: [4], expect: true },
  { fn: "tripped", args: [1000000], expect: true },
  { fn: "tripped", args: [-1], expect: true },
  { fn: "tripped", args: [1.5], expect: true },
  { fn: "tripped", args: [null], expect: true },
  { fn: "tripped", args: ["0"], expect: true },
  { fn: "tripped", args: [[0]], expect: true },
  { fn: "tripped", args: [false], expect: true },
  { fn: "tripped", args: [NaN], expect: true },
  { fn: "tripped", args: [Infinity], expect: true },

  // ---- cascade: counting tracks that a skip ended right after they began ----
  { fn: "cascade", args: [0, true, 3000], expect: 1 },
  { fn: "cascade", args: [1, true, 3000], expect: 2 },
  { fn: "cascade", args: [2, true, 3000], expect: 3 },
  { fn: "cascade", args: [0, true, 0], expect: 1 },
  { fn: "cascade", args: [0, true, 10000], expect: 1 },
  { fn: "cascade", args: [0, true, 10001], expect: 0 },
  { fn: "cascade", args: [2, true, 10001], expect: 0 },
  { fn: "cascade", args: [2, true, 600000], expect: 0 },
  // A track that ended by itself, or that the user ended, clears the count.
  { fn: "cascade", args: [2, false, 3000], expect: 0 },
  { fn: "cascade", args: [2, false, 600000], expect: 0 },
  { fn: "cascade", args: [1, "true", 3000], expect: 0 },
  { fn: "cascade", args: [1, 1, 3000], expect: 0 },
  { fn: "cascade", args: [1, null, 3000], expect: 0 },
  // A time that is no number counts as early.
  { fn: "cascade", args: [1, true, null], expect: 2 },
  { fn: "cascade", args: [1, true, "600000"], expect: 2 },
  { fn: "cascade", args: [1, true, NaN], expect: 2 },
  { fn: "cascade", args: [1, true, Infinity], expect: 2 },
  { fn: "cascade", args: [1, true, -5], expect: 2 },
  // Once tripped it stays tripped. Only the caller clears it.
  { fn: "cascade", args: [3, true, 3000], expect: 3 },
  { fn: "cascade", args: [3, false, 600000], expect: 3 },
  { fn: "cascade", args: [4, false, 600000], expect: 3 },
  { fn: "cascade", args: [1000000, true, 3000], expect: 3 },
  { fn: "cascade", args: [null, false, 600000], expect: 3 },
  { fn: "cascade", args: [-1, false, 600000], expect: 3 },
  { fn: "cascade", args: [1.5, true, 3000], expect: 3 },
  { fn: "cascade", args: ["0", true, 3000], expect: 3 },
  { fn: "cascade", args: [NaN, false, 600000], expect: 3 }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
