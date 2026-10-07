.pragma library

// Input and expectation table for lib/Sha256.js: the published test
// messages of the standard, id-shaped texts, lengths around the block and
// padding boundaries, text that needs two, three and four UTF-8 bytes per
// character, halves of surrogate pairs, and everything that is refused.
// The same table runs under node and inside Qt's JavaScript engine. The
// node test also holds every expected digest against the platform's own
// implementation.

var _MESSAGE_448 = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
var _MESSAGE_896 = "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno"
  + "ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu"

// What half a surrogate pair hashes to: the digest of U+FFFD.
var _REPLACED = "83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097"

var MODULE = "Sha256"
var CASES = [
  // ---- hex: the test messages of the standard ----
  { fn: "hex", args: [""],
    expect: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { fn: "hex", args: ["abc"],
    expect: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
  { fn: "hex", args: [_MESSAGE_448],
    expect: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1" },
  { fn: "hex", args: [_MESSAGE_896],
    expect: "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 1000000 }],
    expect: "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0" },

  // ---- hex: texts shaped like a video id ----
  { fn: "hex", args: ["AAAAAAAAAAA"],
    expect: "dd20088919031875b7bcca29995545dd40ca994be0558183f9b942b51b3b2249" },
  { fn: "hex", args: ["abcDEF12345"],
    expect: "3abfd846f8951e219133b58fd642736119cdba7e966c68b74b09531b80d67d9b" },
  { fn: "hex", args: ["-_-_-_-_-_-"],
    expect: "e7bb2fe959c8607fce336d53097de15e83552096850ec031475012647c8cdf40" },
  { fn: "hex", args: ["00000000000"],
    expect: "9c9f57efe04f8f5a65b699db1c777238d5876b44cef240654c749dd09e1790ef" },
  // Names of prototype members are ordinary texts.
  { fn: "hex", args: ["constructor"],
    expect: "e3c1703abf8a6b3df04dd30e184fe02bb6724f46830b544562ff083169371068" },
  { fn: "hex", args: ["__proto__"],
    expect: "30e2af384186b57fda019524ade9f9afe48e815480b993d14ec8dc68251b592a" },

  // ---- hex: lengths around the padding and block boundaries ----
  // Up to 55 bytes the padding fits into the same block, from 56 on it
  // needs a second one, and at 64 the message fills its block exactly.
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 55 }],
    expect: "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 56 }],
    expect: "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 57 }],
    expect: "f13b2d724659eb3bf47f2dd6af1accc87b81f09f59f2b75e5c0bed6589dfe8c6" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 63 }],
    expect: "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 64 }],
    expect: "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 65 }],
    expect: "635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 119 }],
    expect: "31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 120 }],
    expect: "2f3d335432c70b580af0e8e1b3674a7c020d683aa5f73aaaedfdc55af904c21c" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 128 }],
    expect: "6836cf13bac400e9105071cd6af47084dfacad4e5e302c94bfed24e013afb73e" },

  // ---- hex: the text is hashed in its UTF-8 form ----
  { fn: "hex", args: ["caf\u00e9"],
    expect: "850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e" },
  { fn: "hex", args: ["\u65e5\u672c\u8a9e"],
    expect: "77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5" },
  { fn: "hex", args: ["\ud83d\ude00"],
    expect: "f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9" },
  { fn: "hex", args: ["a\u00e9\u65e5\ud83d\ude00z"],
    expect: "23f2d49a56b46a9de11875b820e95b46c3caa6ed184bd11a76d5070ef0555db2" },
  // The last character of one byte and the first of two, the last of two
  // and the first of three, and the last of three.
  { fn: "hex", args: ["\u007f\u0080\u07ff\u0800\uffff"],
    expect: "963ca957b25c91837137dbf915cdedd648dfce7b76e12f2df9e3100f2d614839" },
  // The first and the last character that take four bytes.
  { fn: "hex", args: ["\ud800\udc00"],
    expect: "31237b174ba6047a15db0d343ad9550da611b7b7bce867a23522f81a05df3eda" },
  { fn: "hex", args: ["\udbff\udfff"],
    expect: "708b8add9f6b5b556a07b72973b10ff9a3ec30e002034ef24aa076fab4b40e50" },
  { fn: "hex", args: ["\u0000"],
    expect: "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d" },
  { fn: "hex", args: ["a\u0000b"],
    expect: "59b271ae1bbcb1d31d41929817f4b16fb439eb4f31520b5ad1d5ce98920a7138" },
  { fn: "hex", args: ["\n"],
    expect: "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b" },
  { fn: "hex", args: [" "],
    expect: "36a9e7f1c95b82ffb99743e0c5c4ce95d83c9a430aac59f84ef3cbfab6145068" },

  // ---- hex: characters of several bytes that straddle a block boundary ----
  { fn: "hex", args: [{ gen: "repeat", unit: "\u00e9", count: 28 }],
    expect: "a2e7c1f809d17958e21b7cd370a1d7d030e07f3af72588be133d4f73fadee71d" },
  { fn: "hex", args: [{ gen: "repeat", unit: "\u00e9", count: 32 }],
    expect: "2e5152e606afb24d5817608407516dfec44866c8ed63edbb537953895bd07aa9" },
  { fn: "hex", args: [{ gen: "repeat", unit: "\u65e5", count: 21 }],
    expect: "c49f1fa3a5bb6ceddb586a8f35fbf95fba930a943d64bdbe4ec7b2739dc4c38a" },
  { fn: "hex", args: [{ gen: "repeat", unit: "\u65e5", count: 22 }],
    expect: "0a241327fee6712a905a22ee218afe970c0c0e8cf1f9c84447371cab78357efc" },
  { fn: "hex", args: [{ gen: "repeat", unit: "\ud83d\ude00", count: 14 }],
    expect: "057ae8eade36f1887737614f966005cb521bc9c51dc0f53573b1fa54c1b160bb" },
  { fn: "hex", args: [{ gen: "repeat", unit: "\ud83d\ude00", count: 16 }],
    expect: "e1e2db96ab0de4009a27bbf9aa2e715a3f2549f77e232dc43ff6a192662ed5e0" },

  // ---- hex: half a surrogate pair is hashed as U+FFFD ----
  { fn: "hex", args: ["\ufffd"], expect: _REPLACED },
  { fn: "hex", args: [{ gen: "codes", codes: [55357] }], expect: _REPLACED },
  { fn: "hex", args: [{ gen: "codes", codes: [56832] }], expect: _REPLACED },
  { fn: "hex", args: ["a\ufffdb"],
    expect: "05087813392efc16fe8ff448920c6328e53af865df39419436659d9ffda90f7b" },
  { fn: "hex", args: [{ gen: "codes", codes: [97, 55357, 98] }],
    expect: "05087813392efc16fe8ff448920c6328e53af865df39419436659d9ffda90f7b" },
  // A high half at the very end has nothing to pair with.
  { fn: "hex", args: [{ gen: "codes", codes: [97, 55357] }],
    expect: "51d277510ba4bf97b25f12d38513c1b620a2a33fc83b3beeeb0dd971bf429e6d" },
  // Two halves in the wrong order are two halves.
  { fn: "hex", args: ["\ufffd\ufffd"],
    expect: "52793f8dc1d85e409f8c88be99d8b31d58f676246340150f406289e04a11151e" },
  { fn: "hex", args: [{ gen: "codes", codes: [56832, 55357] }],
    expect: "52793f8dc1d85e409f8c88be99d8b31d58f676246340150f406289e04a11151e" },
  // Of two high halves in front of a low one, only the second is in a pair.
  { fn: "hex", args: [{ gen: "codes", codes: [55357, 55357, 56832] }],
    expect: "16bbb56893fdcd3874f3871c3ca69b3b380f4d94a9b7eeb600f66249de41b69f" },

  // ---- hex: the longest text that is hashed, and one unit more ----
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 1048576 }],
    expect: "9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360" },
  { fn: "hex", args: [{ gen: "repeat", unit: "a", count: 1048577 }], expect: "" },

  // ---- hex: only a string has a digest ----
  { fn: "hex", args: [null], expect: "" },
  { fn: "hex", args: [42], expect: "" },
  { fn: "hex", args: [true], expect: "" },
  { fn: "hex", args: [["abc"]], expect: "" },
  { fn: "hex", args: [{ text: "abc" }], expect: "" }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
