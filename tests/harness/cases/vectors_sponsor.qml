import QtQuick
import "../../../lib/Segments.js" as Segments
import "../../../lib/Sha256.js" as Sha256
import "../../vectors/segments.js" as SegmentsVectors
import "../../vectors/sha256.js" as Sha256Vectors

// Runs the vector tables of Sha256 and Segments in Qt's JavaScript engine,
// the one the plugin really runs on. The node tests run the same tables on
// another engine and can compare the hash with a second implementation;
// here the digests written in the table are the proof. The two engines
// differ in their arithmetic on 32-bit words, in JSON and in sorting, which
// is all these two modules are made of.
//
// After the tables comes what a table cannot hold, because the engines
// answer it differently: numbers JSON cannot carry and nesting without end.
// Whatever this engine makes of them, nothing unchecked may come out.
QtObject {
  id: root

  property string kind: "component"

  readonly property string id: "AAAAAAAAAAA"

  // An answer for our video with one good segment and one whose text is
  // spliced in as it is.
  function answer(odd) {
    return "[{\"videoID\":\"" + root.id + "\",\"segments\":["
      + "{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":[10,20],\"videoDuration\":600},"
      + "{\"category\":\"sponsor\",\"actionType\":\"skip\",\"segment\":" + odd + ",\"videoDuration\":600}"
      + "]}]"
  }

  // Every stretch is a pair of finite numbers inside the track, in order.
  function sound(list) {
    if (!Array.isArray(list)) return false
    var last = 0
    for (var i = 0; i < list.length; i++) {
      var s = list[i]
      if (typeof s.start !== "number" || typeof s.end !== "number") return false
      if (!isFinite(s.start) || !isFinite(s.end)) return false
      if (s.start < last || s.end <= s.start || s.end > 600) return false
      last = s.end
    }
    return true
  }

  function checkNumbers(h) {
    var good = { start: 10, end: 20, category: "sponsor", toEnd: false }
    h.equal(Segments.pick(root.answer("[30,40]"), root.id, 600, true),
      [good, { start: 30, end: 40, category: "sponsor", toEnd: false }],
      "the answer as this case builds it is read")
    // One engine reads these as numbers, the other refuses the whole text.
    var odd = [
      "[1e999,2e999]", "[30,1e999]", "[-1e999,40]", "[30.,40.]", "[.5,40]", "[30,4e1]", "[0x1e,40]",
      "[030,040]", "[30,40,]", "[NaN,40]", "[Infinity,40]", "[-0,40]", "[\"30\",\"40\"]", "[30,null]"
    ]
    for (var i = 0; i < odd.length; i++) {
      var list = Segments.pick(root.answer(odd[i]), root.id, 600, true)
      h.check(root.sound(list), "segment " + odd[i] + ": only finite stretches inside the track come out")
      var acted = Segments.next(15, list, [])
      h.check(acted.action === "none" || (acted.action === "seek" && acted.to > 15 && acted.to <= 600),
        "segment " + odd[i] + ": a skip from it goes forward and stays in the track")
    }
  }

  // The longest text that is parsed at all, made of nothing but opening
  // brackets, and the same as an answer nested that deep.
  function checkNesting(h) {
    var deep = new Array(Segments.MAX_BYTES + 1).join("[")
    h.equal(deep.length, Segments.MAX_BYTES, "the nested text is as long as an answer may be")
    h.equal(Segments.pick(deep, root.id, 600, true), [], "nesting without end is no answer")
    var closed = new Array(5001).join("[") + new Array(5001).join("]")
    h.equal(Segments.pick(closed, root.id, 600, true), [], "nor is deep nesting that closes")
    h.equal(Segments.pick(deep + "[", root.id, 600, true), [], "and a longer text is not parsed")
  }

  // The prefix a lookup sends is a slice of the hash: four characters that
  // say nothing a hash would not.
  function checkPrefix(h) {
    var config = Segments.config(root.id)
    h.equal(config.indexOf("/api/skipSegments/" + Sha256.hex(root.id).slice(0, 4) + "?"), 31,
      "the address names the bucket by the first four characters of the hash")
    h.equal(Sha256.hex(root.id).slice(0, 4), "dd20", "which are these for the id of this case")
    h.equal(config.indexOf(root.id), -1, "and the id is not in it")
  }

  function run(h) {
    h.vectors(Sha256, Sha256Vectors)
    h.vectors(Segments, SegmentsVectors)
    root.checkNumbers(h)
    root.checkNesting(h)
    root.checkPrefix(h)
    h.finish()
  }
}
