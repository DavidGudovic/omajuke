.pragma library
.import "Const.js" as Const
.import "Clean.js" as Clean

// Video ids and everything derived from them. Text from the user or from
// outside becomes an id only through parseVideoRef, and every address
// OmaJuke hands to a program is rebuilt here from a validated id: the text
// itself is never forwarded. This file also owns the rule that keeps a
// pasted link, network address or file path from being sent to YouTube as
// search text.

var _ID = /^[A-Za-z0-9_-]{11}$/

// Fully anchored, with literal hosts: a look-alike host, user info in front
// of the host, a redirect or a second address inside the query matches
// nothing. Only the captured id leaves this file. The id is spelled [\w-]
// here to keep each pattern on one line: the same characters as in _ID.
var _REFS = [
  /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})(?:[&#]|$)/,
  /^(?:https?:\/\/)?youtu\.be\/([\w-]{11})(?:[?#&\/]|$)/,
  /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([\w-]{11})(?:[?#\/]|$)/
]

// Controls, spaces and backslashes: none belongs in a link, and a parser
// further down the line might read them differently than we do.
var _UNSAFE = /[\x00-\x20\x7f\\]/

// What a pasted link, address or path looks like. Spaces are allowed in the
// first list, because a pasted path or URL may contain them.
var _ANY_TEXT = [
  /^[A-Za-z][A-Za-z0-9+.-]*:\/\//,                    // scheme://...
  /^(?:\/|~\/|\.\.?\/)/                               // a path: /x, ~/x, ./x, ../x, and //host/x
]

// The same, for text without any whitespace in it.
var _ONE_TOKEN = [
  /^[A-Za-z][A-Za-z0-9+.-]*:/,                        // any scheme: mailto:, file:, host:port
  /^(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:[\/:?#]|$)/,   // a bare host name, with or without a path
  /^(?:\d{1,3}\.){3}\d{1,3}(?:[\/:?#]|$)/,            // an IPv4 host
  /^localhost(?:[\/:?#]|$)/i,                         // localhost
  /^\[[0-9A-Fa-f:.]+\]/,                              // a bracketed IPv6 host
  /^[^\s\/@]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/,      // user@host..., a mail address
  /\/.*[\/?=&%#]/,                                    // a slash, then a second slash or one of ? = & % #
  /[?=&%#].*\//,                                      // ... or one of them, then a slash
  /\/[^\/]*\.[A-Za-z0-9]{1,5}$/                       // something/file.ext
]

// Whitespace is spelled out by code point, so that both JavaScript engines
// this file runs on (Qt's in the shell, V8 in the tests) agree on where a
// link starts and whether a text is one token, whatever their own tables say.
function _isSpace(code) {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680
    || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f
    || code === 0x205f || code === 0x3000 || code === 0xfeff
}

function _hasSpace(string) {
  for (var i = 0; i < string.length; i++) {
    if (_isSpace(string.charCodeAt(i))) return true
  }
  return false
}

function _trim(string) {
  var start = 0
  var end = string.length
  while (start < end && _isSpace(string.charCodeAt(start))) start++
  while (end > start && _isSpace(string.charCodeAt(end - 1))) end--
  return string.slice(start, end)
}

function _matchesAny(patterns, string) {
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(string)) return true
  }
  return false
}

function _linkShaped(string) {
  if (_matchesAny(_ANY_TEXT, string)) return true
  if (_hasSpace(string)) return false
  // Nobody types a word this long: an unbroken run beyond the longest link
  // we accept is a paste (an address, a token, data) and is not searched.
  // The cap also bounds the work of the unanchored patterns below.
  if (string.length > Const.LIMITS.refChars) return true
  return _matchesAny(_ONE_TOKEN, string)
}

function isId(id) {
  return typeof id === "string" && _ID.test(id)
}

// Returns the id of the video a link refers to, or "" when the text is not
// a supported video link. A bare id is taken only where the caller says so
// (IPC): in the search box an eleven-letter word is a query.
function parseVideoRef(input, allowBareId) {
  if (typeof input !== "string") return ""
  var ref = _trim(input)
  if (ref.length === 0 || ref.length > Const.LIMITS.refChars) return ""
  if (_UNSAFE.test(ref)) return ""
  if (allowBareId === true && _ID.test(ref)) return ref
  for (var i = 0; i < _REFS.length; i++) {
    var match = _REFS[i].exec(ref)
    if (match) return match[1]
  }
  return ""
}

// The three builders throw on anything that is not an id. That is a bug in
// the caller, and the message is a constant: Qt logs uncaught errors, and
// the log must never hold what was passed in.
function watchUrl(id) {
  if (!isId(id)) throw new Error("bad id")
  return "https://www.youtube.com/watch?v=" + id
}

function thumbUrl(id) {
  if (!isId(id)) throw new Error("bad id")
  return "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"
}

// The automatic mix YouTube builds around a video ("RD" + id).
function mixUrl(id) {
  return watchUrl(id) + "&list=RD" + id
}

// True when the text is, or looks like, a link, a network address or a file
// path. The caller has already tried parseVideoRef, so a true answer means
// "not a video link, and not something to search for": a private URL pasted
// by mistake must not reach YouTube as a query. The price is that a few
// one-word queries (will.i.am, re:zero) are taken for links, and putting a
// word in front always makes a text a query again.
function looksLikeUrl(input) {
  if (typeof input !== "string") return false
  var typed = _trim(input)
  // What would be sent is the cleaned text, so that form is judged as well:
  // an invisible character in front of an address must not hide it from the
  // patterns and then be cleaned away on the way out.
  return _linkShaped(typed) || _linkShaped(Clean.query(typed))
}

if (typeof module !== "undefined") {
  module.exports = {
    isId: isId,
    parseVideoRef: parseVideoRef,
    watchUrl: watchUrl,
    thumbUrl: thumbUrl,
    mixUrl: mixUrl,
    looksLikeUrl: looksLikeUrl
  }
}
