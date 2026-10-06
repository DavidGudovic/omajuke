import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Thumbs.js" as Thumbs
import "../../../lib/YtArgs.js" as YtArgs
import "../../vectors/thumbs.js" as ThumbsVectors

// Runs the vector table of Thumbs in Qt's JavaScript engine, the one the
// plugin really runs on, and then checks there what a table cannot hold:
// the yt-dlp command lines item by item, that their shared part cannot be
// changed, and how the two patterns that read outside text treat every
// UTF-16 unit.
QtObject {
  id: root

  property string kind: "component"

  readonly property var paths: ({ ok: true, ytCacheDir: "/run/user/1000/omajuke/ytcache",
    thumbsDir: "/run/user/1000/omajuke/thumbs" })
  readonly property var tools: ({ ytdlp: "/usr/bin/yt-dlp", curl: "/usr/bin/curl" })

  readonly property var common: [
    "/usr/bin/yt-dlp", "--ignore-config", "--no-plugin-dirs", "--cache-dir", "/run/user/1000/omajuke/ytcache",
    "--color", "never", "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components",
    "--socket-timeout", "10", "--no-cookies", "--no-warnings"
  ]

  function resolveList(height) {
    var format = "bestvideo[height<=?" + height + "]+bestaudio/best"
    return root.common.concat(["--no-playlist", "-f", format, "-J", "-a", "-"])
  }

  function checkYtArgs(h) {
    h.equal(YtArgs.search(root.tools, root.paths), root.common.concat(["--flat-playlist", "-J", "-a", "-"]),
      "search: the constant list")
    h.equal(YtArgs.resolve(root.tools, root.paths, 480), root.resolveList(480), "resolve at 480")
    h.equal(YtArgs.resolve(root.tools, root.paths, 720), root.resolveList(720), "resolve at 720")
    h.equal(YtArgs.resolve(root.tools, root.paths, 1080), root.resolveList(1080), "resolve at 1080")
    h.equal(YtArgs.base(root.paths), root.common.slice(1, 12), "base: the part every call shares")
    var odd = [undefined, null, 0, 360, 2160, "480", "1080", "best --exec x", 720.5, true, [480], {}]
    for (var i = 0; i < odd.length; i++) {
      h.equal(YtArgs.resolve(root.tools, root.paths, odd[i]), root.resolveList(720),
        "resolve: odd height " + i + " picks the middle format")
    }
    h.equal(YtArgs.search(root.tools, { ok: false, ytCacheDir: "/x" }), null, "search: unresolved paths")
    h.equal(YtArgs.search(root.tools, { ok: true, ytCacheDir: "x/ytcache" }), null, "search: a relative dir")
    h.equal(YtArgs.resolve(root.tools, null, 720), null, "resolve: no paths")
    h.equal(YtArgs.search({ ytdlp: "yt-dlp" }, root.paths), null, "search: a tool that is not a path")
    h.equal(YtArgs.search(null, root.paths), null, "search: no tools")
  }

  // The module is one instance for everything that imports it, and in this
  // engine a frozen list can still be written to. So no command line may
  // depend on a list another importer can reach.
  function checkShared(h) {
    h.equal(YtArgs.SIGNED_OUT, ["--no-cookies", "--no-warnings"], "SIGNED_OUT: the signed-out pair")
    try {
      YtArgs.SIGNED_OUT[0] = "--cookies"
      YtArgs.SIGNED_OUT.push("--exec")
    } catch (error) {
      h.check(true, "a write to SIGNED_OUT is refused")
    }
    h.equal(YtArgs.search(root.tools, root.paths), root.common.concat(["--flat-playlist", "-J", "-a", "-"]),
      "search: unchanged by a write to SIGNED_OUT")
    h.equal(YtArgs.resolve(root.tools, root.paths, 720), root.resolveList(720),
      "resolve: unchanged by a write to SIGNED_OUT")
    var first = YtArgs.search(root.tools, root.paths)
    first.push("--exec")
    first[1] = "changed"
    h.equal(YtArgs.search(root.tools, root.paths).length, 18, "each call returns a new list")
    h.equal(YtArgs.search(root.tools, root.paths)[1], "--ignore-config", "which another caller cannot change")
  }

  function isWordUnit(code) {
    return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || code === 0x5f
      || (code >= 0x61 && code <= 0x7a)
  }

  // Every UTF-16 unit through the two places whose answer depends on the
  // engine's own tables: the end of the type in a report line, and the
  // characters of an id. Each result is the number of units that got a
  // wrong answer.
  function walkUnits(h) {
    var wrong = { type: 0, id: 0 }
    var one = [null]
    for (var code = 0; code <= 0xffff; code++) {
      var ch = String.fromCharCode(code)
      // The type must end where "image/jpeg" ends: anything may follow but
      // a letter, a digit or an underscore.
      var ready = Thumbs.parse("0 200 0 5 image/jpeg" + ch + "\n", one).ready.length === 1
      if (ready !== !root.isWordUnit(code)) wrong.type++
      var accepted = Thumbs.config(root.paths, [{ id: "AAAAA" + ch + "AAAAA", n: 1 }]) !== ""
      if (accepted !== (root.isWordUnit(code) || code === 0x2d)) wrong.id++
    }
    h.equal(wrong.type, 0, "Thumbs.parse ends the type at the same place for every UTF-16 unit")
    h.equal(wrong.id, 0, "Thumbs.config takes exactly the id alphabet")
  }

  function checkLimits(h) {
    var argv = Thumbs.argv(root.tools)
    h.equal(argv[argv.indexOf("--max-filesize") + 1], String(Const.LIMITS.thumbBytes), "the size limit")
    h.equal(argv[argv.length - 3].slice(-2), "\\n", "the report ends in a backslash and an n")
    var twelve = []
    for (var i = 0; i < Const.LIMITS.thumbBatch; i++) twelve.push({ id: "AAAAAAAAAA" + i % 10, n: i + 1 })
    h.equal(Thumbs.config(root.paths, twelve.slice(0, 10)).split("\n").length, 21, "ten items, twenty lines")
    twelve[10].id = "BBBBBBBBBBB"
    twelve[11].id = "CCCCCCCCCCC"
    h.check(Thumbs.config(root.paths, twelve) !== "", "a full batch is described")
    h.equal(Thumbs.config(root.paths, twelve.concat([{ id: "DDDDDDDDDDD", n: 13 }])), "", "one more is not")
  }

  function run(h) {
    h.vectors(Thumbs, ThumbsVectors)
    root.checkYtArgs(h)
    root.checkShared(h)
    root.walkUnits(h)
    root.checkLimits(h)
    h.finish()
  }
}
