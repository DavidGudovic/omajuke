.pragma library

// SHA-256 of a text, as lowercase hex. Qt's JavaScript engine offers no hash
// beyond MD5 and no text encoder, so both the digest and the UTF-8 encoding
// it is computed over are written out here. The plugin hashes a video id
// with it, to ask for sponsor segments by hash prefix instead of by id.
// Nothing secret is ever hashed, so no attempt is made to run in constant
// time. This file owns the algorithm and nothing else: it keeps no state
// between calls.

// The longest text that is hashed, in UTF-16 units. The work happens on the
// caller's thread and needs a ceiling. Callers hash eleven characters.
var _MAX_CHARS = 1048576

// The first 32 bits of the fractional parts of the square roots of the
// first eight primes: the hash value before the first block.
var _INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]

// The first 32 bits of the fractional parts of the cube roots of the first
// sixty-four primes: one constant per round.
var _ROUNDS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

// Mixes one 64-byte block into the eight words of the hash value. Every sum
// is brought back to 32 bits with "| 0". The largest one adds five 32-bit
// values, which a JavaScript number still holds exactly.
function _compress(value, block, words) {
  var i
  for (i = 0; i < 16; i++) {
    var at = i * 4
    words[i] = (block[at] << 24) | (block[at + 1] << 16) | (block[at + 2] << 8) | block[at + 3]
  }
  for (i = 16; i < 64; i++) {
    var near = words[i - 15]
    var far = words[i - 2]
    var small = ((near >>> 7) | (near << 25)) ^ ((near >>> 18) | (near << 14)) ^ (near >>> 3)
    var large = ((far >>> 17) | (far << 15)) ^ ((far >>> 19) | (far << 13)) ^ (far >>> 10)
    words[i] = (words[i - 16] + small + words[i - 7] + large) | 0
  }
  var a = value[0]
  var b = value[1]
  var c = value[2]
  var d = value[3]
  var e = value[4]
  var f = value[5]
  var g = value[6]
  var h = value[7]
  for (i = 0; i < 64; i++) {
    var mixE = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
    var choose = (e & f) ^ (~e & g)
    var first = (h + mixE + choose + _ROUNDS[i] + words[i]) | 0
    var mixA = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
    var majority = (a & b) ^ (a & c) ^ (b & c)
    var second = (mixA + majority) | 0
    h = g
    g = f
    f = e
    e = (d + first) | 0
    d = c
    c = b
    b = a
    a = (first + second) | 0
  }
  value[0] = (value[0] + a) | 0
  value[1] = (value[1] + b) | 0
  value[2] = (value[2] + c) | 0
  value[3] = (value[3] + d) | 0
  value[4] = (value[4] + e) | 0
  value[5] = (value[5] + f) | 0
  value[6] = (value[6] + g) | 0
  value[7] = (value[7] + h) | 0
}

// Appends one byte to the message and mixes the block in when it is full.
// The message is never held as a whole: only the current block is.
function _put(hash, byte) {
  hash.block[hash.fill++] = byte
  hash.bytes++
  if (hash.fill === 64) {
    _compress(hash.value, hash.block, hash.words)
    hash.fill = 0
  }
}

// Appends the UTF-8 form of a text. Half a surrogate pair has no UTF-8 form
// and is encoded as U+FFFD, which is what every standard encoder does.
function _putText(hash, text) {
  var length = text.length
  for (var i = 0; i < length; i++) {
    var code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < length) {
      var low = text.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)
        i++
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd
    if (code < 0x80) {
      _put(hash, code)
    } else if (code < 0x800) {
      _put(hash, 0xc0 | (code >> 6))
      _put(hash, 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      _put(hash, 0xe0 | (code >> 12))
      _put(hash, 0x80 | ((code >> 6) & 0x3f))
      _put(hash, 0x80 | (code & 0x3f))
    } else {
      _put(hash, 0xf0 | (code >> 18))
      _put(hash, 0x80 | ((code >> 12) & 0x3f))
      _put(hash, 0x80 | ((code >> 6) & 0x3f))
      _put(hash, 0x80 | (code & 0x3f))
    }
  }
}

// Ends the message: a single one bit, zero bits up to the last eight bytes
// of a block, then the length of the message in bits as a 64-bit number.
function _finish(hash) {
  var bytes = hash.bytes
  _put(hash, 0x80)
  while (hash.fill !== 56) _put(hash, 0)
  // Shifting works on 32 bits only, so the upper half of the bit count is
  // found by division: the bytes that 2^29 goes into.
  var high = Math.floor(bytes / 0x20000000)
  var low = bytes << 3
  _put(hash, (high >>> 24) & 0xff)
  _put(hash, (high >>> 16) & 0xff)
  _put(hash, (high >>> 8) & 0xff)
  _put(hash, high & 0xff)
  _put(hash, (low >>> 24) & 0xff)
  _put(hash, (low >>> 16) & 0xff)
  _put(hash, (low >>> 8) & 0xff)
  _put(hash, low & 0xff)
}

// Returns the SHA-256 of the text's UTF-8 form as 64 lowercase hex digits,
// or "" for anything that is not a string and for a text beyond the length
// that is hashed. "" is not a digest of anything, so a caller that cuts a
// prefix from it gets "" again and cannot mistake it for a hash.
function hex(text) {
  if (typeof text !== "string" || text.length > _MAX_CHARS) return ""
  var hash = { value: _INITIAL.slice(), block: [], words: [], fill: 0, bytes: 0 }
  _putText(hash, text)
  _finish(hash)
  var digits = ""
  for (var i = 0; i < 8; i++) {
    // ">>> 0" reads the word as unsigned. The zeros in front keep a small
    // word eight digits wide.
    digits += ("0000000" + (hash.value[i] >>> 0).toString(16)).slice(-8)
  }
  return digits
}

if (typeof module !== "undefined") {
  module.exports = { hex: hex }
}
