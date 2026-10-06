.pragma library

// Input and expectation table for lib/Clean.js: what the cleaner deletes,
// what it turns into a space, where it cuts, what it does to search text
// and to the tooltip, and what counts as a control character. The same
// table runs under node and inside Qt's JavaScript engine.

var _A50 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
var _AB40 = "abababababababababababababababababababab"

var MODULE = "Clean"
var CASES = [
  // ---- text: whitespace becomes one space, the ends are trimmed ----
  { fn: "text", args: ["hello", 10], expect: "hello" },
  { fn: "text", args: ["  hello   world  ", 20], expect: "hello world" },
  { fn: "text", args: ["a\tb\nc\r\nd\u000be\u000cf", 20], expect: "a b c d e f" },
  { fn: "text", args: ["line one\u2028line two\u2029end", 40], expect: "line one line two end" },
  { fn: "text", args: ["a\u00a0b\u3000c\u2003d\u202fe\u205ff\u1680g", 20], expect: "a b c d e f g" },
  { fn: "text", args: ["a \u200b b", 20], expect: "a b" },
  { fn: "text", args: ["\n\n", 20], expect: "" },

  // ---- text: controls and invisible characters are deleted ----
  { fn: "text", args: ["a\u0000b\u0007c\u001bd\u007fe", 20], expect: "abcde" },
  { fn: "text", args: ["a\u0080b\u0085c\u009fd", 20], expect: "abcd" },
  { fn: "text", args: ["\u001b[31mred\u001b[0m", 20], expect: "[31mred[0m" },
  { fn: "text", args: ["abc\u202edef\u202c", 20], expect: "abcdef" },
  { fn: "text", args: ["\u202aa\u202bb\u202dc", 20], expect: "abc" },
  { fn: "text", args: ["\u2066a\u2067b\u2068c\u2069", 20], expect: "abc" },
  { fn: "text", args: ["a\u200eb\u200fc\u061cd", 20], expect: "abcd" },
  { fn: "text", args: ["a\u200bb\u200cc\u200dd\u2060e\ufefff", 20], expect: "abcdef" },
  { fn: "text", args: ["a\u2061b\u2064c\u206ad\u206fe", 20], expect: "abcde" },
  { fn: "text", args: ["co\u00adoperate", 20], expect: "cooperate" },
  { fn: "text", args: ["a\ufff9b\ufffac\ufffbd", 20], expect: "abcd" },
  { fn: "text", args: ["\u200b\u200e\ufeff\u00ad", 20], expect: "" },

  // ---- text: everything else is kept as it is ----
  { fn: "text", args: ["caf\u00e9 \u65e5\u672c\u8a9e \u0440\u043e\u043a", 20],
    expect: "caf\u00e9 \u65e5\u672c\u8a9e \u0440\u043e\u043a" },
  { fn: "text", args: ["<b>&amp;\"'\\</b>", 20], expect: "<b>&amp;\"'\\</b>" },
  { fn: "text", args: ["x\ud83d\ude00y", 10], expect: "x\ud83d\ude00y" },
  { fn: "text", args: ["\u2027\u2030\u205e\ufffc\ufffd", 10], expect: "\u2027\u2030\u205e\ufffc\ufffd" },

  // ---- text: half a surrogate pair is deleted, a whole pair survives ----
  { fn: "text", args: [{ gen: "codes", codes: [97, 55357, 98] }, 10], expect: "ab" },
  { fn: "text", args: [{ gen: "codes", codes: [97, 56832, 98] }, 10], expect: "ab" },
  { fn: "text", args: [{ gen: "codes", codes: [97, 55357] }, 10], expect: "a" },
  { fn: "text", args: [{ gen: "codes", codes: [56832, 55357] }, 10], expect: "" },
  { fn: "text", args: [{ gen: "codes", codes: [55357, 55357, 56832] }, 10], expect: "\ud83d\ude00" },
  { fn: "text", args: [{ gen: "codes", codes: [55357, 56832, 56832] }, 10], expect: "\ud83d\ude00" },
  // A half that stayed behind would take a place in the cut and show here.
  { fn: "text", args: [{ gen: "codes", codes: [97, 55357, 98, 99] }, 2], expect: "ab" },
  { fn: "text", args: [{ gen: "codes", codes: [97, 56832, 98, 99] }, 2], expect: "ab" },
  // A pair split by an invisible character was never a pair.
  { fn: "text", args: [{ gen: "codes", codes: [97, 55357, 8203, 56832, 98] }, 10], expect: "ab" },

  // ---- text: the cut ----
  { fn: "text", args: ["abcdef", 3], expect: "abc" },
  { fn: "text", args: ["abcdef", 6], expect: "abcdef" },
  { fn: "text", args: ["abc def", 4], expect: "abc" },
  { fn: "text", args: ["ab\ud83d\ude00cd", 3], expect: "ab" },
  { fn: "text", args: ["ab\ud83d\ude00cd", 4], expect: "ab\ud83d\ude00" },
  { fn: "text", args: ["\ud83d\ude00", 1], expect: "" },
  { fn: "text", args: ["abc", 2.9], expect: "ab" },
  { fn: "text", args: ["abc", 0], expect: "" },
  { fn: "text", args: ["abc", -1], expect: "" },
  { fn: "text", args: ["abc", null], expect: "" },
  { fn: "text", args: ["abc", "many"], expect: "" },
  { fn: "text", args: [{ gen: "repeat", unit: "a", count: 300000 }, 5], expect: "aaaaa" },
  { fn: "text", args: [{ gen: "repeat", unit: " a", count: 100000 }, 7], expect: "a a a a" },
  { fn: "text", args: [{ gen: "repeat", unit: "\u200b", count: 300000 }, 10], expect: "" },

  // ---- text: only primitives have a text form ----
  { fn: "text", args: [null, 10], expect: "" },
  { fn: "text", args: [42, 10], expect: "42" },
  { fn: "text", args: [-0.5, 10], expect: "-0.5" },
  { fn: "text", args: [true, 10], expect: "true" },
  { fn: "text", args: [{ title: "x" }, 10], expect: "" },
  { fn: "text", args: [["a", "b"], 10], expect: "" },

  // ---- query: no # after a space, so yt-dlp reads no comment ----
  { fn: "query", args: ["never gonna give you up"], expect: "never gonna give you up" },
  { fn: "query", args: ["  rick   astley  "], expect: "rick astley" },
  { fn: "query", args: ["line one\nline two\r\n"], expect: "line one line two" },
  { fn: "query", args: ["foo # bar"], expect: "foo bar" },
  { fn: "query", args: ["foo #bar"], expect: "foo bar" },
  { fn: "query", args: ["foo ## bar"], expect: "foo bar" },
  { fn: "query", args: ["foo # # #bar"], expect: "foo bar" },
  { fn: "query", args: ["foo #"], expect: "foo" },
  { fn: "query", args: ["foo\t#bar"], expect: "foo bar" },
  { fn: "query", args: ["foo\n#bar"], expect: "foo bar" },
  { fn: "query", args: ["foo\u00a0#bar"], expect: "foo bar" },
  { fn: "query", args: ["foo\u2028#bar"], expect: "foo bar" },
  { fn: "query", args: ["foo \u200b#bar"], expect: "foo bar" },
  { fn: "query", args: ["a#b #c#d"], expect: "a#b c#d" },
  { fn: "query", args: ["#shorts"], expect: "#shorts" },
  { fn: "query", args: ["C# tutorial"], expect: "C# tutorial" },
  { fn: "query", args: ["foo\u001f#bar"], expect: "foo#bar" },
  { fn: "query", args: ["# # #"], expect: "#" },
  { fn: "query", args: [" #"], expect: "#" },
  { fn: "query", args: ["\u200b"], expect: "" },
  { fn: "query", args: [{ gen: "repeat", unit: "a", count: 300 }], expect: _A50 + _A50 + _A50 + _A50 },
  { fn: "query", args: [{ gen: "codes", codes: [97, 55357] }], expect: "a" },
  { fn: "query", args: [null], expect: "" },
  { fn: "query", args: [42], expect: "42" },

  // ---- tooltip: one short line, nothing that could open a tag ----
  { fn: "tooltip", args: ["Song <b>bold</b>"], expect: "Song \u2039b\u203abold\u2039/b\u203a" },
  { fn: "tooltip", args: ["<img src=x>"], expect: "\u2039img src=x\u203a" },
  { fn: "tooltip", args: ["first\nsecond"], expect: "first second" },
  { fn: "tooltip", args: ["Paused: \u202edetrevni"], expect: "Paused: detrevni" },
  { fn: "tooltip", args: [{ gen: "repeat", unit: "ab", count: 100 }], expect: _AB40 + _AB40 },
  { fn: "tooltip", args: [null], expect: "" },

  // ---- hasControl: C0 controls and DEL, and anything that is no string ----
  { fn: "hasControl", args: ["plain text"], expect: false },
  { fn: "hasControl", args: [""], expect: false },
  { fn: "hasControl", args: ["caf\u00e9 \ud83d\ude00"], expect: false },
  { fn: "hasControl", args: ["tab\there"], expect: true },
  { fn: "hasControl", args: ["line\nbreak"], expect: true },
  { fn: "hasControl", args: ["carriage\rreturn"], expect: true },
  { fn: "hasControl", args: ["nul\u0000"], expect: true },
  { fn: "hasControl", args: ["\u001f"], expect: true },
  { fn: "hasControl", args: ["del\u007f"], expect: true },
  { fn: "hasControl", args: ["\u001b[0m"], expect: true },
  // Only the C0 range and DEL count here. The rest is the cleaner's job.
  { fn: "hasControl", args: ["nel\u0085"], expect: false },
  { fn: "hasControl", args: [{ gen: "codes", codes: [55357] }], expect: false },
  { fn: "hasControl", args: [null], expect: true },
  { fn: "hasControl", args: [42], expect: true },
  { fn: "hasControl", args: [["a"]], expect: true }
]

if (typeof module !== "undefined") {
  module.exports = { MODULE: MODULE, CASES: CASES }
}
