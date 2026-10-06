.pragma library
.import "Const.js" as Const

// Text cleaning. Every string that comes from outside (a title or channel
// from YouTube, a stored value, a device or bind description, what the user
// typed) passes through here before it is kept, shown or sent on. What comes
// out has no control or invisible characters, no stray surrogate halves, one
// space between words and a bounded length.

// The bar tooltip is one short line.
var _TOOLTIP_CHARS = 80

// A surrogate pair, or else a single surrogate. The pair is tried first, so
// a match of one unit is always an unpaired half.
var _SURROGATES = /[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g

// Control characters: the C0 range without the whitespace that _GAPS turns
// into a space, DEL, and the C1 range.
var _CONTROLS = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g

// Invisible formatting: the soft hyphen, the bidirectional marks, embeddings,
// overrides and isolates, the zero-width characters including the byte order
// mark, and the interlinear annotation marks. Several of them can reorder or
// hide the text around them.
var _FORMATS = /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g

// Characters that separate words. A run of them becomes one space, so a line
// break pasted into a query still separates two words afterwards.
var _GAPS = /[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g

var _C0_OR_DEL = /[\u0000-\u001f\u007f]/
var _HASHES_AFTER_SPACE = /(?: #+)+/g
var _SPACE_RUNS = / {2,}/g

function _keepPairs(match) {
  return match.length === 2 ? match : ""
}

// Only primitives have an honest text form. An object would arrive as
// "[object Object]", null as "null", and an object without a prototype
// cannot be converted at all, so everything else is the empty text.
function _toText(value) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function _trimSpaces(string) {
  var start = 0
  var end = string.length
  while (start < end && string.charAt(start) === " ") start++
  while (end > start && string.charAt(end - 1) === " ") end--
  return string.slice(start, end)
}

// A cap that is missing, not a number or not finite counts as zero: no
// caller gets unbounded text by forgetting the argument.
function _cap(max) {
  if (typeof max !== "number" || !isFinite(max) || max < 1) return 0
  return Math.floor(max)
}

// Cleans a value into at most max UTF-16 units of plain text on one line.
// Surrogate halves go first: deleting what stood between two of them must
// not turn them into a pair.
function text(value, max) {
  var cleaned = _toText(value)
    .replace(_SURROGATES, _keepPairs)
    .replace(_CONTROLS, "")
    .replace(_FORMATS, "")
    .replace(_GAPS, " ")
  cleaned = _trimSpaces(cleaned)
  var limit = _cap(max)
  if (cleaned.length <= limit) return cleaned
  // Every surrogate left is half of a pair, so a high half in the last kept
  // position means the cut would fall inside a character.
  var last = cleaned.charCodeAt(limit - 1)
  if (last >= 0xd800 && last <= 0xdbff) limit--
  return _trimSpaces(cleaned.slice(0, limit))
}

// Cleans search text for yt-dlp's batch reader, which takes one entry per
// line and treats whatever follows "whitespace, #" as a comment. text() has
// removed the line breaks. Here every # that follows a space goes too, so
// the whole query arrives and no part of it is read as a comment.
function query(value) {
  var cleaned = text(value, Const.LIMITS.queryChars)
  return _trimSpaces(cleaned.replace(_HASHES_AFTER_SPACE, " ").replace(_SPACE_RUNS, " "))
}

// One line for the bar tooltip. Older hosts rendered tooltips as rich text,
// so the two characters that could open a tag are swapped for look-alikes.
function tooltip(value) {
  return text(value, _TOOLTIP_CHARS).replace(/</g, "\u2039").replace(/>/g, "\u203a")
}

// True when the value is not a string, or holds a C0 control or DEL. An
// untrusted argument for which this is true is refused before anything else
// reads it.
function hasControl(value) {
  return typeof value !== "string" || _C0_OR_DEL.test(value)
}

if (typeof module !== "undefined") {
  module.exports = { text: text, query: query, tooltip: tooltip, hasControl: hasControl }
}
