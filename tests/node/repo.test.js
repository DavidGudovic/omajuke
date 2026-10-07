"use strict"
// Audits of the repository as a whole: what somebody would otherwise have
// to check by hand on every change. Each audit is a function from a list of
// files to a list of problems, so it can be run on the real tree (where it
// must find nothing) and on a small made-up tree with one mistake planted
// in it (where it must find that mistake; see the last section).
//
// The tree is what would be published: every file git tracks or would add,
// never one it ignores. An audit about a file that does not exist yet finds
// nothing and starts to bite when the file appears.
//
// The audits read source text; they do not run it. Where a rule is about
// code and not about comments or strings, the text is split first (lex,
// below), so a word in a comment cannot trip a rule about code, and a brace
// in a string cannot hide one.
var test = require("node:test")
var assert = require("node:assert")
var fs = require("fs")
var path = require("path")
var childProcess = require("child_process")
var load = require("./load.js")

var REPO = path.join(__dirname, "..", "..")

// ---- The tree ----

// One file of the tree. text is the content read as UTF-8 (a binary file
// gives nonsense, which is fine for the rules that look at every file), and
// magic its first bytes, one character per byte.
function makeEntry(file, text, details) {
  var info = details || {}
  return {
    path: file,
    text: text,
    magic: info.magic === undefined ? text.slice(0, 4) : info.magic,
    size: info.size === undefined ? Buffer.byteLength(text) : info.size,
    executable: info.executable === true,
    symlink: info.symlink === true
  }
}

function listTree() {
  var listed = childProcess.execFileSync("git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  var entries = []
  listed.split("\0").sort().forEach(function(file) {
    if (file === "") return
    var stat
    try {
      stat = fs.lstatSync(path.join(REPO, file))
    } catch (error) {
      // Tracked and deleted in the working tree: not part of what is there.
      return
    }
    if (stat.isSymbolicLink()) {
      entries.push(makeEntry(file, "", { symlink: true }))
      return
    }
    var bytes = fs.readFileSync(path.join(REPO, file))
    entries.push(makeEntry(file, bytes.toString("utf8"), {
      magic: bytes.subarray(0, 4).toString("latin1"),
      size: stat.size,
      executable: (stat.mode & 0o111) !== 0
    }))
  })
  return entries
}

var TREE = listTree()

function find(tree, file) {
  for (var i = 0; i < tree.length; i++) {
    if (tree[i].path === file) return tree[i]
  }
  return null
}

function has(tree, file) {
  return find(tree, file) !== null
}

// ---- Kinds of file ----

function under(file, dir) {
  return file.slice(0, dir.length + 1) === dir + "/"
}

function isTest(file) { return under(file, "tests") }
function isFixture(file) { return under(file, "tests/fixtures") }
function isQml(file) { return /\.qml$/.test(file) }
function isScript(file) { return /\.(?:qml|js)$/.test(file) }
function isSource(file) { return /\.(?:qml|js|sh)$/.test(file) && !isFixture(file) }

function isText(entry) {
  return !entry.symlink && !/\.(?:png|jpg)$/.test(entry.path) && entry.text.indexOf("\u0000") === -1
}

// The plugin proper: what the shell loads.
function isPluginQml(file) { return isQml(file) && !isTest(file) }
function isPluginJs(file) { return /^(?:lib|ui)\/[^\/]+\.js$/.test(file) }
function isPluginCode(file) { return isPluginQml(file) || isPluginJs(file) }
function isLib(file) { return /^lib\/[^\/]+\.js$/.test(file) }
function isVectorTable(file) { return /^tests\/vectors\/[^\/]+\.js$/.test(file) }

// The two sides of the plugin, which never share a file: the kept service
// would hand a new panel an old module.
function isViewSide(file) {
  return file === "BarWidget.qml" || file === "Panel.qml" || under(file, "ui")
}

function isServiceSide(file) {
  return file === "Service.qml" || under(file, "core") || under(file, "lib")
}

// Everything that runs on Qt's JavaScript engine, tests included.
function runsOnQt(file) { return isQml(file) || isPluginJs(file) || isVectorTable(file) }

// ---- Reading source text ----

var REGEX_MAY_FOLLOW = [
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else"
]

function isWordChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch)
}

function endOfLine(text, from) {
  var end = text.indexOf("\n", from)
  return end === -1 ? text.length : end
}

// The index after the closing quote, or the end of the line when the
// string is not closed on it.
function endOfString(text, start) {
  var quote = text[start]
  for (var i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue }
    if (text[i] === "\n") return i
    if (text[i] === quote) return i + 1
  }
  return text.length
}

// The index after a regular expression literal and its flags, or -1 when
// what starts here is not one.
function endOfRegex(text, start) {
  var inClass = false
  for (var i = start + 1; i < text.length; i++) {
    var ch = text[i]
    if (ch === "\n") return -1
    if (ch === "\\") { i++; continue }
    if (ch === "[") inClass = true
    else if (ch === "]") inClass = false
    else if (ch === "/" && !inClass) {
      var end = i + 1
      while (end < text.length && /[A-Za-z]/.test(text[end])) end++
      return end
    }
  }
  return -1
}

// The index after the closing backtick. Expressions inside ${ } may hold
// strings and templates of their own.
function endOfTemplate(text, start) {
  var depth = 0
  for (var i = start + 1; i < text.length; i++) {
    var ch = text[i]
    if (ch === "\\") { i++; continue }
    if (depth === 0) {
      if (ch === "`") return i + 1
      if (ch === "$" && text[i + 1] === "{") { depth = 1; i++ }
      continue
    }
    if (ch === "\"" || ch === "'") i = endOfString(text, i) - 1
    else if (ch === "`") i = endOfTemplate(text, i) - 1
    else if (ch === "{") depth++
    else if (ch === "}") depth--
  }
  return text.length
}

// Splits QML or JavaScript into its comments, strings, regular expression
// literals and template strings. What lies between them is code.
function lex(text) {
  var pieces = []
  var regexMayStart = true
  var i = 0
  function take(kind, end) {
    pieces.push({ kind: kind, start: i, end: end })
    i = end
  }
  if (text.slice(0, 2) === "#!") take("comment", endOfLine(text, 0))
  while (i < text.length) {
    var ch = text[i]
    var next = text[i + 1]
    if (ch === "/" && next === "/") { take("comment", endOfLine(text, i)); continue }
    if (ch === "/" && next === "*") {
      var close = text.indexOf("*/", i + 2)
      take("comment", close === -1 ? text.length : close + 2)
      continue
    }
    if (ch === "\"" || ch === "'") { take("string", endOfString(text, i)); regexMayStart = false; continue }
    if (ch === "`") { take("template", endOfTemplate(text, i)); regexMayStart = false; continue }
    if (ch === "/" && regexMayStart) {
      var end = endOfRegex(text, i)
      if (end !== -1) { take("regex", end); regexMayStart = false; continue }
    }
    if (isWordChar(ch)) {
      var stop = i
      while (stop < text.length && isWordChar(text[stop])) stop++
      regexMayStart = REGEX_MAY_FOLLOW.indexOf(text.slice(i, stop)) !== -1
      i = stop
      continue
    }
    // After a value a slash divides; after anything else it opens a pattern.
    if (!/\s/.test(ch)) regexMayStart = ch !== ")" && ch !== "]"
    i++
  }
  return pieces
}

function blanked(text) {
  return text.replace(/[^\n]/g, " ")
}

var SOURCES = new WeakMap()

// The views of a source file the audits work on. All have the length and
// the line breaks of the text, so an index means the same place in each.
//   code:  comments blanked, and the inside of every string, pattern and
//          template blanked (the delimiters stay)
//   plain: comments blanked, everything else as written
function source(entry) {
  if (SOURCES.has(entry)) return SOURCES.get(entry)
  var text = entry.text
  var pieces = lex(text)
  var code = ""
  var plain = ""
  var from = 0
  pieces.forEach(function(piece) {
    var raw = text.slice(piece.start, piece.end)
    code += text.slice(from, piece.start)
    plain += text.slice(from, piece.start)
    if (piece.kind === "comment") {
      code += blanked(raw)
      plain += blanked(raw)
    } else {
      var closed = raw.length > 1 && piece.kind !== "regex" && raw[raw.length - 1] === raw[0]
      var tail = piece.kind === "regex" ? raw.slice(raw.lastIndexOf("/")) : (closed ? raw[0] : "")
      code += raw[0] + blanked(raw.slice(1, raw.length - tail.length)) + tail
      plain += raw
    }
    from = piece.end
  })
  code += text.slice(from)
  plain += text.slice(from)
  var views = { text: text, pieces: pieces, code: code, plain: plain }
  SOURCES.set(entry, views)
  return views
}

function piecesOf(entry, kind) {
  var views = source(entry)
  return views.pieces.filter(function(piece) { return piece.kind === kind }).map(function(piece) {
    return { start: piece.start, raw: views.text.slice(piece.start, piece.end) }
  })
}

function lineOf(text, index) {
  var line = 1
  for (var i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++
  }
  return line
}

function at(entry, index) {
  return entry.path + ":" + lineOf(entry.text, index)
}

// Every match of a pattern (with the g flag) in a text, as { index, groups }.
function matches(pattern, text) {
  var found = []
  var m
  pattern.lastIndex = 0
  while ((m = pattern.exec(text)) !== null) {
    found.push({ index: m.index, groups: m })
    if (m[0] === "") pattern.lastIndex++
  }
  return found
}

// The index of the bracket that closes the one at open, in a code view.
function closing(code, open) {
  var pairs = { "{": "}", "(": ")", "[": "]" }
  var depth = 0
  for (var i = open; i < code.length; i++) {
    if (code[i] === code[open]) depth++
    else if (code[i] === pairs[code[open]] && --depth === 0) return i
  }
  return code.length
}

// The index of the bracket that opens the one closing at close.
function opening(code, close) {
  var pairs = { "}": "{", ")": "(", "]": "[" }
  var depth = 0
  for (var i = close; i >= 0; i--) {
    if (code[i] === code[close]) depth++
    else if (code[i] === pairs[code[close]] && --depth === 0) return i
  }
  return 0
}

// Every QML object block of a type: { index, open, close }, where open and
// close are the indexes of its braces.
function blocksOf(entry, type) {
  var code = source(entry).code
  var pattern = new RegExp("(?:^|[^\\w.])(" + type + ")\\s*\\{", "g")
  return matches(pattern, code).map(function(found) {
    var open = found.index + found.groups[0].length - 1
    return { index: open - found.groups[1].length, open: open, close: closing(code, open) }
  })
}

// What stands directly inside a block, with the blocks nested in it
// blanked: the block's own bindings and declarations. view names the view
// the text is taken from.
function directly(entry, block, view) {
  var views = source(entry)
  var out = ""
  var depth = 0
  for (var i = block.open + 1; i < block.close; i++) {
    var ch = views.code[i]
    if (ch === "}") depth--
    out += depth === 0 || ch === "\n" ? views[view][i] : " "
    if (ch === "{") depth++
  }
  return out
}

// The root object of a QML file: the first block that is opened.
function rootBlock(entry) {
  var code = source(entry).code
  var open = code.indexOf("{")
  return { index: open, open: open, close: open === -1 ? -1 : closing(code, open) }
}

// ---- Layout ----

// The modules a QML file imports by path, each with the file or directory
// it resolves to, relative to the repository.
function pathImports(entry) {
  var pattern = /^import\s+"([^"\n]+)"(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?[ \t]*$/gm
  var dir = path.posix.dirname(entry.path)
  return matches(pattern, source(entry).plain).map(function(found) {
    return {
      index: found.index,
      target: path.posix.normalize(path.posix.join(dir, found.groups[1])),
      qualifier: found.groups[2] || ""
    }
  })
}

// Names a JavaScript import must not be given: a QML type of that name
// would shadow it, or be shadowed by it, depending on the import order.
var TYPE_NAMES = [
  "Text", "Keys", "Item", "Image", "Timer", "Component", "Connections", "Loader", "Rectangle", "Row",
  "Column", "Flickable", "ListView", "Repeater", "Binding", "QtObject", "Screen", "Window", "Process",
  "Quickshell", "Color", "Style", "Util", "Border", "Panel", "Button", "Toggle", "TextField"
]

// lib/ is imported by the service side only and ui/ by the view side only;
// core/ imports nothing of the first-party kit, so the headless harness can
// load it; a lib/ or ui/ script imports only scripts next to it, in the one
// form the node loader understands.
function auditImports(tree) {
  var problems = []
  var ownTypes = tree.filter(function(entry) { return isPluginQml(entry.path) }).map(function(entry) {
    return path.posix.basename(entry.path, ".qml")
  })
  tree.forEach(function(entry) {
    var file = entry.path
    if (isPluginQml(file)) {
      pathImports(entry).forEach(function(found) {
        var where = at(entry, found.index)
        var target = found.target
        var toLib = target === "lib" || under(target, "lib")
        var toUi = target === "ui" || under(target, "ui")
        var toCore = target === "core" || under(target, "core")
        if (toLib && !isServiceSide(file)) problems.push(where + ": lib/ is imported from the view side")
        if (toUi && !isViewSide(file)) problems.push(where + ": ui/ is imported from the service side")
        if (toCore && !isServiceSide(file)) problems.push(where + ": core/ is imported from the view side")
        if (!toLib && !toUi && !toCore) problems.push(where + ": an import from outside the plugin")
        if (TYPE_NAMES.indexOf(found.qualifier) !== -1 || ownTypes.indexOf(found.qualifier) !== -1) {
          problems.push(where + ": the import is named like the QML type " + found.qualifier)
        }
      })
      var plain = source(entry).plain
      if (under(file, "core") && /^import\s+qs\./m.test(plain)) {
        problems.push(file + ": core/ imports the first-party kit")
      }
      if (!isViewSide(file) && /^import\s+QtQuick\.Controls\b/m.test(plain)) {
        problems.push(file + ": QtQuick.Controls outside the view side")
      }
    }
    if (isPluginJs(file) || isVectorTable(file)) {
      var lines = entry.text.split("\n")
      if (lines[0] !== ".pragma library") problems.push(file + ":1: the first line is not .pragma library")
      lines.forEach(function(line, n) {
        if (n === 0 || line[0] !== ".") return
        var where = file + ":" + (n + 1)
        var imported = /^\.import "([A-Za-z0-9]+\.js)" as ([A-Z][A-Za-z0-9]*)$/.exec(line)
        if (!imported) problems.push(where + ": not an import the node loader understands")
        else if (isVectorTable(file)) problems.push(where + ": a vector table imports nothing")
        else if (imported[1] !== imported[2] + ".js") problems.push(where + ": not named after its file")
      })
    }
  })
  return problems
}

// The names a lib/, ui/ or vector script defines at its top level.
function topLevelNames(entry) {
  var pattern = /^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm
  return matches(pattern, source(entry).code).map(function(found) { return found.groups[1] })
}

// QML sees every top-level name of a script, node only what the footer
// exports. The two must be the same set, or a test would see another
// module than the plugin does.
function auditFooters(tree) {
  var problems = []
  tree.forEach(function(entry) {
    var file = entry.path
    if (!isPluginJs(file) && !isVectorTable(file)) return
    var views = source(entry)
    var open = /^if \(typeof module !== "undefined"\) \{$/m.exec(views.plain)
    if (!open) { problems.push(file + ": no export footer"); return }
    var brace = open.index + open[0].length - 1
    var end = closing(views.code, brace)
    if (views.code.slice(end + 1).trim() !== "") problems.push(at(entry, end) + ": code after the footer")
    var assigned = /^\s*module\.exports = \{([\s\S]*)\}\s*$/.exec(views.code.slice(brace + 1, end))
    if (!assigned) { problems.push(at(entry, brace) + ": the footer is not one exports object"); return }
    var exported = []
    assigned[1].split(",").forEach(function(pair) {
      if (pair.trim() === "") return
      var named = /^\s*([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(pair)
      if (!named || named[1] !== named[2]) problems.push(at(entry, brace) + ": odd export " + pair.trim())
      else exported.push(named[1])
    })
    var defined = topLevelNames(entry)
    defined.forEach(function(name) {
      if (name[0] !== "_" && exported.indexOf(name) === -1) {
        problems.push(file + ": " + name + " is public in QML and missing from the footer")
      }
    })
    exported.forEach(function(name, n) {
      if (name[0] === "_") problems.push(file + ": the footer exports the private " + name)
      if (defined.indexOf(name) === -1) problems.push(file + ": the footer exports " + name + ", not defined")
      if (exported.indexOf(name) !== n) problems.push(file + ": the footer exports " + name + " twice")
    })
  })
  return problems
}

// The plugin's id and version, each written in more than one place.
// constants holds what lib/Const.js and ui/Ui.js export.
function auditIdentity(tree, constants) {
  var problems = []
  var id = constants.pluginId
  if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(id)) problems.push("lib/Const.js: PLUGIN_ID has a bad shape")
  if (!/^\d+\.\d+\.\d+$/.test(constants.version)) problems.push("lib/Const.js: VERSION is not n.n.n")
  if (constants.uiVersion !== undefined && constants.uiVersion !== constants.version) {
    problems.push("ui/Ui.js: VERSION differs from lib/Const.js")
  }
  var manifest = find(tree, "manifest.json")
  var parsed = null
  if (manifest !== null) {
    try {
      parsed = JSON.parse(manifest.text)
    } catch (error) {
      problems.push("manifest.json: not JSON")
    }
  }
  if (parsed !== null) {
    var barWidget = parsed.barWidget || {}
    var entryPoints = parsed.entryPoints || {}
    if (parsed.id !== id) problems.push("manifest.json: id differs from Const.js")
    if (parsed.version !== constants.version) problems.push("manifest.json: version differs from Const.js")
    if (parsed.keepLoaded !== true) problems.push("manifest.json: keepLoaded is not true")
    if (entryPoints.service !== "Service.qml" || entryPoints.barWidget !== "BarWidget.qml") {
      problems.push("manifest.json: unexpected entry points")
    }
    var unread = ["$schema", "repository"].filter(function(key) { return key in parsed })
    if ("defaults" in barWidget || "schema" in barWidget) unread.push("barWidget.defaults or schema")
    unread.forEach(function(key) { problems.push("manifest.json: " + key + " is read by nothing") })
  }
  // The newest entry of the changelog is the version that is published.
  var changelog = find(tree, "CHANGELOG.md")
  if (changelog !== null) {
    var newest = /^## +(\S+)/m.exec(changelog.text)
    if (!newest || newest[1] !== constants.version) {
      problems.push("CHANGELOG.md: the newest entry is not version " + constants.version)
    }
  }
  // The README says which version it describes, and shows the version in
  // an example answer.
  var readme = find(tree, "README.md")
  if (readme !== null) {
    var named = /\bThis is version (\d+\.\d+\.\d+)|"version":\s*"([^"\n]*)"/g
    matches(named, readme.text).forEach(function(found) {
      var written = found.groups[1] !== undefined ? found.groups[1] : found.groups[2]
      if (written !== constants.version) problems.push(at(readme, found.index) + ": names another version")
    })
  }
  // The id is spelled in the manifest, in Const.js and in the README. The
  // widget and the panel get it from the host.
  var spelled = ["manifest.json", "lib/Const.js", "README.md"]
  tree.forEach(function(entry) {
    if (isTest(entry.path) || spelled.indexOf(entry.path) !== -1 || !isText(entry)) return
    var index = entry.text.indexOf(id)
    if (index !== -1) problems.push(at(entry, index) + ": the plugin id is written out here")
  })
  return problems
}

// Every file of this version, by the area of work that owns it. A file
// belongs to exactly one area; a file that is in none is not part of the
// plugin and has no business in the published tree.
var LAYOUT = {
  "foundations": [
    "lib/Const.js", "lib/Ids.js", "lib/Clean.js", "lib/Track.js", "lib/Errors.js", "lib/Paths.js",
    "tests/node/load.js", "tests/node/ids.test.js", "tests/node/clean.test.js", "tests/node/track.test.js",
    "tests/node/errors.test.js", "tests/node/paths.test.js", "tests/node/vectors.test.js",
    "tests/node/repo.test.js", "tests/vectors/ids.js", "tests/vectors/clean.js", "tests/vectors/track.js",
    "tests/vectors/errors.js", "tests/vectors/paths.js", "tests/harness/cases/vectors_base.qml",
    "tests/check.sh", "tests/lint-qml.js", "tests/fixtures/search.json", "tests/fixtures/video.json",
    ".gitignore", ".editorconfig"
  ],
  "processes and storage": [
    "lib/Sh.js", "lib/Env.js", "lib/Settings.js", "lib/StateFile.js", "core/ProcessRunner.qml",
    "core/PrivateFs.qml", "core/StateStore.qml", "core/SettingsStore.qml", "tests/harness.sh",
    "tests/harness/shell.qml", "tests/stubs/lib.js", "tests/stubs/probe.js", "tests/node/sh.test.js",
    "tests/node/env.test.js", "tests/node/settings.test.js", "tests/node/state.test.js",
    "tests/node/argv-fs.test.js", "tests/vectors/settings.js", "tests/vectors/statefile.js",
    "tests/harness/cases/vectors_store.qml", "tests/harness/cases/runner.qml",
    "tests/harness/cases/prepare.qml", "tests/harness/cases/fs_write.qml",
    "tests/harness/cases/state_roundtrip.qml", "tests/harness/cases/state_corrupt.qml",
    "tests/harness/cases/state_no_history.qml", "tests/harness/cases/settings.qml",
    "tests/harness/cases/settings_latch.qml", "tests/node/export.test.js"
  ],
  "player": [
    "lib/MpvArgs.js", "lib/MpvProto.js", "lib/PlayerState.js", "core/MpvProcess.qml", "core/MpvSocket.qml",
    "core/Player.qml", "tests/stubs/mpv.js", "tests/record-traces.js", "tests/fixtures/mpv-traces.json",
    "tests/node/argv-mpv.test.js", "tests/node/proto.test.js", "tests/node/playerstate.test.js",
    "tests/vectors/mpvproto.js", "tests/harness/cases/vectors_player.qml",
    "tests/harness/cases/player_load.qml", "tests/harness/cases/player_replace.qml",
    "tests/harness/cases/player_transport.qml", "tests/harness/cases/player_missing.qml",
    "tests/harness/cases/player_no_socket.qml", "tests/harness/cases/player_exit.qml",
    "tests/harness/cases/player_external.qml", "tests/harness/cases/tether.qml",
    "tests/harness/cases/tether_real.qml", "tests/harness/cases/player_queue.qml",
    "tests/harness/cases/player_video.qml", "tests/harness/cases/player_outputs.qml"
  ],
  "YouTube data": [
    "lib/YtArgs.js", "lib/Thumbs.js", "core/Search.qml", "core/Resolver.qml", "core/Thumbnails.qml",
    "tests/stubs/yt-dlp.js", "tests/stubs/curl.js", "tests/fixtures/thumb.jpg", "tests/node/argv-yt.test.js",
    "tests/node/thumbs.test.js", "tests/vectors/thumbs.js", "tests/harness/cases/vectors_yt.qml",
    "tests/harness/cases/search_ok.qml", "tests/harness/cases/search_cancel.qml",
    "tests/harness/cases/search_errors.qml", "tests/harness/cases/resolve.qml",
    "tests/harness/cases/thumbs_ok.qml", "tests/harness/cases/thumbs_404.qml",
    "tests/harness/cases/thumbs_evict.qml", "tests/fixtures/mix.json", "tests/harness/cases/search_mix.qml",
    "tests/harness/cases/preload.qml", "tests/harness/cases/expiry.qml"
  ],
  "queue": [
    "lib/Queue.js", "tests/node/queue.test.js", "tests/vectors/queue.js",
    "tests/harness/cases/vectors_queue.qml", "tests/harness/cases/queue_order.qml",
    "tests/harness/cases/queue_follow_mpv.qml", "tests/harness/cases/queue_stop_class.qml",
    "tests/harness/cases/autoplay.qml", "tests/harness/cases/autoplay_fail_soft.qml"
  ],
  "video window": [
    "core/HyprCtl.qml", "core/VideoWindow.qml", "lib/Lua.js", "lib/Geometry.js", "tests/stubs/hyprctl.js",
    "tests/node/lua.test.js", "tests/node/geometry.test.js", "tests/vectors/lua.js",
    "tests/vectors/geometry.js", "tests/harness/VideoParts.qml", "tests/harness/cases/vectors_hypr.qml",
    "tests/harness/cases/hypr_gate.qml", "tests/harness/cases/hypr_none.qml",
    "tests/harness/cases/video_show_hide.qml", "tests/harness/cases/video_track_change.qml",
    "tests/harness/cases/video_closed.qml", "tests/harness/cases/video_remember.qml"
  ],
  "shortcuts": [
    "core/Shortcuts.qml", "lib/KeyCombo.js", "tests/gen-binds.js", "tests/fixtures/binds.txt",
    "tests/node/keycombo.test.js", "tests/vectors/keycombo.js", "tests/harness/ShortcutParts.qml",
    "tests/harness/cases/vectors_keycombo.qml", "tests/harness/cases/shortcuts.qml",
    "tests/harness/cases/shortcuts_reload.qml", "tests/harness/cases/shortcuts_teardown.qml",
    "tests/harness/cases/shortcuts_empty.qml", "tests/harness/cases/shortcuts_change.qml"
  ],
  "audio output and sponsor segments": [
    "core/AudioOutputs.qml", "core/Sponsor.qml", "lib/Devices.js", "lib/Sha256.js", "lib/Segments.js",
    "tests/node/devices.test.js", "tests/node/sha256.test.js", "tests/node/segments.test.js",
    "tests/vectors/devices.js", "tests/vectors/sha256.js", "tests/vectors/segments.js",
    "tests/harness/cases/vectors_devices.qml", "tests/harness/cases/outputs.qml",
    "tests/harness/cases/vectors_sponsor.qml", "tests/harness/cases/sponsor.qml"
  ],
  "sign-in and feeds": [
    "core/SignIn.qml", "core/Feeds.qml", "lib/Browsers.js", "lib/FeedUrls.js",
    "tests/stubs/xdg-settings.js", "tests/stubs/browser.js", "tests/stubs/yt-dlp-account.js",
    "tests/node/browsers.test.js", "tests/node/feeds.test.js", "tests/vectors/browsers.js",
    "tests/vectors/feedurls.js", "tests/harness/cases/vectors_signin.qml",
    "tests/harness/cases/signin.qml", "tests/harness/cases/signout.qml", "tests/harness/cases/feeds.qml",
    "tests/harness/cases/markwatched.qml"
  ],
  "bar widget and panel": [
    "BarWidget.qml", "Panel.qml", "ui/Ui.js", "ui/PanelBody.qml", "ui/MainPage.qml", "ui/TrackRow.qml",
    "ui/Thumb.qml", "ui/StatusLine.qml", "ui/Notice.qml", "ui/NowPlaying.qml", "ui/PageHeader.qml",
    "ui/SettingsPage.qml", "tests/harness-ui/shell.qml", "tests/harness-ui/MockService.qml",
    "tests/harness-ui/FakeBar.qml", "tests/harness-ui/FakePanel.qml",
    "tests/harness-ui/cases/vectors_ui.qml", "tests/harness-ui/cases/focus_open.qml",
    "tests/harness-ui/cases/keys_main.qml", "tests/harness-ui/cases/states.qml",
    "tests/harness-ui/cases/stale.qml", "tests/harness-ui/cases/bar_widget.qml",
    "tests/harness-ui/cases/settings_page.qml", "tests/node/ui.test.js", "tests/vectors/ui.js",
    "ui/QueuePage.qml", "ui/OutputsPage.qml", "ui/ChoiceRow.qml", "ui/ShortcutsPage.qml",
    "ui/KeyCapture.qml", "ui/SignInPage.qml", "ui/FeedChips.qml",
    "tests/harness-ui/cases/queue_page.qml", "tests/harness-ui/cases/video_output.qml",
    "tests/harness-ui/cases/shortcuts_page.qml", "tests/harness-ui/cases/signin_page.qml",
    "tests/harness-ui/cases/feeds_sponsor.qml", "tests/harness-ui/cases/account_retry.qml"
  ],
  "service and documents": [
    "Service.qml", "core/Playback.qml", "lib/Recover.js", "manifest.json", "README.md", "SECURITY.md",
    "LICENSE", "NOTICE", "CHANGELOG.md", "tests/harness/FakePlayer.qml", "tests/harness/FakeResolver.qml",
    "tests/node/recover.test.js", "tests/harness/cases/playback_table.qml",
    "tests/harness/cases/play_basic.qml", "tests/harness/cases/play_error.qml",
    "tests/harness/cases/play_recover.qml", "tests/harness/cases/transport.qml",
    "tests/harness/cases/external_stop.qml", "tests/harness/cases/mpv_missing.qml",
    "tests/harness/cases/ipc.qml", "tests/harness/cases/ipc_cli.qml", "tests/harness/cases/idle.qml",
    "tests/harness/cases/state_restore.qml", "tests/harness/cases/teardown.qml",
    "tests/harness/cases/teardown_no_history.qml", "tests/harness/cases/proxy_hold.qml",
    "tests/harness/cases/svc_queue.qml", "tests/harness/cases/svc_video.qml",
    "tests/harness/cases/svc_shortcuts.qml", "tests/harness/cases/svc_outputs.qml",
    "tests/harness/cases/svc_account.qml", "tests/harness/cases/svc_sponsor.qml",
    "tests/harness/cases/svc_gap.qml", "tests/harness/cases/svc_output_next.qml"
  ]
}

function auditLayout(tree, layout) {
  var problems = []
  var owner = new Map()
  Object.keys(layout).forEach(function(area) {
    layout[area].forEach(function(file) {
      if (owner.has(file)) problems.push(file + ": listed under " + owner.get(file) + " and under " + area)
      owner.set(file, area)
    })
  })
  tree.forEach(function(entry) {
    if (!owner.has(entry.path)) problems.push(entry.path + ": not a file the layout names")
  })
  return problems
}

// A vector table proves a gate on Qt's engine only if a harness case runs
// it there. The node test finds a new table by itself; a case has to import
// it, and this audit is what notices a table nobody imported.
function auditVectorCases(tree) {
  var problems = []
  var cases = tree.filter(function(entry) {
    return /^tests\/harness(?:-ui)?\/cases\/vectors_[a-z0-9_]+\.qml$/.test(entry.path)
  })
  tree.forEach(function(entry) {
    if (!isVectorTable(entry.path)) return
    var run = cases.some(function(testCase) {
      return pathImports(testCase).some(function(found) {
        if (found.target !== entry.path || found.qualifier === "") return false
        var table = found.qualifier + "(?:\\.CASES)?"
        var call = new RegExp("\\.vectors\\(\\s*[A-Za-z_]\\w*\\s*,\\s*" + table + "\\s*\\)")
        return call.test(source(testCase).code)
      })
    })
    if (!run) problems.push(entry.path + ": no vectors_* harness case imports and runs this table")
  })
  return problems
}

// Quickshell maps a relative import in a root file that leaves the root
// directory to nothing, and the whole configuration fails to load. The
// harness roots therefore load everything by file URL.
function auditHarnessRoots(tree) {
  var problems = []
  var roots = ["tests/harness/shell.qml", "tests/harness-ui/shell.qml"]
  roots.forEach(function(file) {
    var entry = find(tree, file)
    if (entry === null) return
    entry.text.split("\n").forEach(function(line, n) {
      if (/^\s*import\s+"/.test(line)) problems.push(file + ":" + (n + 1) + ": an import by path")
    })
  })
  return problems
}

var DECLARATION = "^\\s*(?:(?:default|required|readonly)\\s+)*(?:property\\s+[\\w.<>]+|function|signal)\\s+"

// The members an object declares itself: its properties, functions and
// signals.
function declaredMembers(entry, block) {
  var pattern = new RegExp(DECLARATION + "([A-Za-z_]\\w*)", "gm")
  return matches(pattern, directly(entry, block, "code")).map(function(found) { return found.groups[1] })
}

// The panel is tested against a mock of the service. A member the mock has
// and the service lacks would let a page pass its tests and fail in the bar.
function auditMock(tree) {
  var service = find(tree, "Service.qml")
  var mock = find(tree, "tests/harness-ui/MockService.qml")
  if (service === null || mock === null) return []
  var problems = []
  function isPublic(name) { return name[0] !== "_" }
  var real = declaredMembers(service, rootBlock(service)).filter(isPublic)
  // The mock's own two members: what was called, and what to answer.
  var mocked = declaredMembers(mock, rootBlock(mock)).filter(isPublic).filter(function(name) {
    return name !== "calls" && name !== "returns"
  })
  mocked.forEach(function(name) {
    if (real.indexOf(name) === -1) problems.push(mock.path + ": " + name + " is not a member of the service")
  })
  real.forEach(function(name) {
    if (mocked.indexOf(name) === -1) problems.push(mock.path + ": the service's " + name + " is missing")
  })
  return problems
}

// ---- Style ----

var LANGUAGE_RULES = [
  [/\blet\s+[A-Za-z_$\[{]/g, "let"],
  [/\bconst\s+[A-Za-z_$\[{]/g, "const"],
  [/=>/g, "an arrow function"],
  [/`/g, "a template string"],
  [/\bclass\s+[A-Za-z_$]/g, "a class"],
  [/\?\.(?!\d)/g, "optional chaining"],
  [/\.\.\./g, "spread or rest"],
  [/\bvar\s*[\[{]/g, "destructuring"],
  [/\bfunction\b[^(\n]*\([^)\n]*[^=!<>]=[^=>][^)\n]*\)/g, "a default parameter"],
  [/(?:^|[^=!<>])==(?!=)/g, "== (use ===)"],
  [/!=(?!=)/g, "!= (use !==)"]
]

// Code that runs on Qt's engine is written like first-party Omarchy QML:
// var and function only, no statement ends with a semicolon, comments are
// line comments.
function auditLanguage(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!runsOnQt(entry.path)) return
    var views = source(entry)
    LANGUAGE_RULES.forEach(function(rule) {
      matches(rule[0], views.code).forEach(function(found) {
        problems.push(at(entry, found.index) + ": " + rule[1])
      })
    })
    matches(/;[ \t]*$/gm, views.code).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a statement ends with a semicolon")
    })
    piecesOf(entry, "comment").forEach(function(piece) {
      if (piece.raw.slice(0, 2) === "/*") problems.push(at(entry, piece.start) + ": a block comment")
    })
  })
  return problems
}

// What Qt's JavaScript engine lacks. A pattern it cannot compile fails the
// whole file at load, so these are caught here and not at run time.
var MISSING_ON_QT = [
  /\.(replaceAll|at|flatMap|findLast|findLastIndex|trimStart|trimEnd)\s*\(/g,
  // The kit has a function of this name that takes two arguments; the array
  // method takes none, or a depth.
  /\.(flat)\s*\(\s*(?:\d+|Infinity)?\s*\)/g,
  /\b(Object\.fromEntries|globalThis|structuredClone|Intl)\b/g
]

function auditEngine(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!runsOnQt(entry.path)) return
    var views = source(entry)
    MISSING_ON_QT.forEach(function(pattern) {
      matches(pattern, views.code).forEach(function(found) {
        problems.push(at(entry, found.index) + ": Qt's engine has no " + found.groups[1])
      })
    })
    piecesOf(entry, "regex").forEach(function(piece) {
      var where = at(entry, piece.start)
      var flags = piece.raw.slice(piece.raw.lastIndexOf("/") + 1)
      if (/\(\?<|\\[pPk][{<]/.test(piece.raw)) problems.push(where + ": lookbehind, a named group or \\p")
      if (/[^gimuy]/.test(flags)) problems.push(where + ": a pattern flag Qt's engine lacks")
    })
    // The same syntax inside a string would only fail once RegExp runs it.
    piecesOf(entry, "string").forEach(function(piece) {
      if (/\(\?<|\\\\[pP]\{/.test(piece.raw)) {
        problems.push(at(entry, piece.start) + ": lookbehind, a named group or \\p in a string")
      }
    })
  })
  return problems
}

// Without the pragma an inline component cannot see the ids around it, and
// the lint gate reports every use as unqualified.
function auditBound(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isQml(entry.path)) return
    var code = source(entry).code
    var inline = /(?:^|[^\w.])Component\s*\{/.test(code) || /\b(?:delegate|sourceComponent)\s*:/.test(code)
    if (inline && entry.text.split("\n")[0] !== "pragma ComponentBehavior: Bound") {
      problems.push(entry.path + ":1: an inline component without pragma ComponentBehavior: Bound")
    }
  })
  return problems
}

// Characters that change how a line reads without being seen: the bidi
// controls and marks, zero-width characters, the soft hyphen, the byte
// order mark and the interlinear marks. Then the control characters, the
// carriage return among them.
var HIDDEN = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g
var CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

// The typographic characters a sentence shown to the user may hold.
var TYPOGRAPHIC = "\u2026\u2014\u2039\u203a"

function auditCharacters(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isText(entry)) return
    var text = entry.text
    matches(HIDDEN, text).forEach(function(found) {
      var code = text.charCodeAt(found.index).toString(16)
      problems.push(at(entry, found.index) + ": a hidden character, U+" + code)
    })
    matches(CONTROLS, text).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a control character")
    })
    // A recorded fixture keeps the shape of what it imitates, tabs included.
    if (!isFixture(entry.path) && text.indexOf("\t") !== -1) {
      problems.push(at(entry, text.indexOf("\t")) + ": a tab")
    }
    if (!isScript(entry.path)) return
    // In QML and JavaScript only a string may hold a character outside
    // ASCII, and in the plugin itself only the typographic ones.
    var strings = source(entry).pieces.filter(function(piece) {
      return piece.kind === "string" || piece.kind === "template"
    })
    var plugin = isPluginCode(entry.path)
    matches(/[^\x00-\x7f]/g, text).forEach(function(found) {
      var index = found.index
      var inString = strings.some(function(piece) { return index >= piece.start && index < piece.end })
      if (!inString) problems.push(at(entry, index) + ": a character outside ASCII outside a string")
      else if (plugin && TYPOGRAPHIC.indexOf(text[index]) === -1) {
        problems.push(at(entry, index) + ": write this character as a \\u escape")
      }
    })
  })
  return problems
}

var MAX_COLUMNS = 110

// Two-space indentation, lines of at most 110 columns, no trailing blanks,
// one newline at the end.
function auditFormatting(tree) {
  var problems = []
  tree.forEach(function(entry) {
    var file = entry.path
    if (!isSource(file)) return
    var lines = entry.text.split("\n")
    var last = lines.length - 1
    if (lines[last] !== "") problems.push(file + ": no newline at the end")
    else if (last > 0 && lines[last - 1] === "") problems.push(file + ": blank lines at the end")
    lines.forEach(function(line, n) {
      var where = file + ":" + (n + 1)
      if (line.length > MAX_COLUMNS) problems.push(where + ": " + line.length + " columns")
      if (/[ \t]$/.test(line)) problems.push(where + ": trailing blanks")
      if (isScript(file) && /^ */.exec(line)[0].length % 2 === 1) problems.push(where + ": odd indentation")
    })
  })
  return problems
}

// Every source file opens with a comment that says what the file is and
// what it owns, before its first line of code.
function auditHeaders(tree) {
  var problems = []
  var preamble = /^(?:\.pragma library|\.import .*|pragma .*|import .*|"use strict"|#!.*|)$/
  tree.forEach(function(entry) {
    var file = entry.path
    if (!isSource(file)) return
    var mark = /\.sh$/.test(file) ? "#" : "//"
    var lines = entry.text.split("\n")
    var first = 0
    while (first < lines.length && preamble.test(lines[first])) first++
    if (first >= lines.length || lines[first].slice(0, mark.length) !== mark) {
      problems.push(file + ":" + (first + 1) + ": the file does not open with a comment about itself")
    }
  })
  return problems
}

// ---- Safety ----

// The only thing the plugin ever writes to the log is a constant that
// names a broken invariant. Anything else could carry a title, a query, an
// id or a path into the journal.
function auditConsole(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isPluginCode(entry.path)) return
    var views = source(entry)
    matches(/\bconsole\b/g, views.code).forEach(function(found) {
      var call = /^console\.warn\("omajuke: [^"\\\n]+"\)/.exec(views.text.slice(found.index))
      if (!call) problems.push(at(entry, found.index) + ": console is used for more than a constant warning")
    })
  })
  return problems
}

// What plugin code never uses: unbounded readers, anything that runs a
// string as a command or as code, timers that never stop.
var NEVER = [
  [/\b(StdioCollector|FileView|JsonAdapter|XMLHttpRequest)\b/g, "an unbounded reader"],
  [/\b(bar\.run|Util\.execDetached|Util\.execArgv|Hyprland\.dispatch)\b/g, "a command outside the runner"],
  [/\b(Qt\.openUrlExternally|Qt\.createQmlObject|Qt\.createComponent)\b/g, "something opened by name"],
  [/\b(eval|Function)\s*\(/g, "code made from text"],
  [/\b(setSource)\s*\(/g, "a loader source set from code"],
  [/\b(repeat\s*:\s*true)\b/g, "a repeating timer"]
]

// Process objects exist in the runner and for mpv (and for the sign-in
// browser, once there is one). Everything else goes through the runner.
var PROCESS_OWNERS = ["core/ProcessRunner.qml", "core/MpvProcess.qml", "core/SignIn.qml"]

function auditForbidden(tree) {
  var problems = []
  tree.forEach(function(entry) {
    var file = entry.path
    if (!isTest(file) && (/\.sh$/.test(file) || /(?:^|\/)libexec\//.test(file))) {
      problems.push(file + ": a script file outside tests/")
    }
    if (!isPluginCode(file)) return
    var views = source(entry)
    NEVER.forEach(function(rule) {
      matches(rule[0], views.code).forEach(function(found) {
        problems.push(at(entry, found.index) + ": " + rule[1] + " (" + found.groups[1] + ")")
      })
    })
    // A detached command is an argv array from a builder in lib/, never text.
    matches(/\bexecDetached\s*\(/g, views.code).forEach(function(found) {
      var open = found.index + found.groups[0].length - 1
      var call = views.plain.slice(open, closing(views.code, open) + 1)
      var qualified = /Quickshell\.$/.test(views.code.slice(0, found.index))
      if (!qualified || /["'`]/.test(call)) problems.push(at(entry, found.index) + ": execDetached with text")
    })
    if (!isQml(file)) return
    blocksOf(entry, "SplitParser").forEach(function(block) {
      if (!/\bsplitMarker\s*:\s*""/.test(directly(entry, block, "plain"))) {
        problems.push(at(entry, block.index) + ": a SplitParser that waits for whole lines (unbounded)")
      }
    })
    if (PROCESS_OWNERS.indexOf(file) === -1 && blocksOf(entry, "Process").length > 0) {
      problems.push(file + ": a Process outside the runner")
    }
    blocksOf(entry, "Loader").forEach(function(block) {
      var bound = /^\s*source\s*:\s*(.*)$/m.exec(directly(entry, block, "plain"))
      if (bound && !/^(?:"[^"]*"|root\.panelSource)\s*$/.test(bound[1])) {
        problems.push(at(entry, block.index) + ": a Loader source that is not a constant")
      }
    })
    if (!isViewSide(file)) return
    var busy = ["Timer", "Process", "IpcHandler"]
    busy.forEach(function(type) {
      if (blocksOf(entry, type).length > 0) problems.push(file + ": a " + type + " on the view side")
    })
  })
  return problems
}

// Types that render text as rich text unless told otherwise. One of them
// showing a title would let a title load an image from the network.
var RICH_TEXT_TYPES = ["Label", "ToolTip", "TextEdit", "TextArea", "TextInput"]
var CONTROLS_TYPES = [
  "AbstractButton", "CheckBox", "CheckDelegate", "ComboBox", "DelayButton", "ItemDelegate", "Menu", "MenuBar",
  "MenuItem", "RadioButton", "RadioDelegate", "RoundButton", "SwipeDelegate", "Switch", "SwitchDelegate",
  "TabButton", "ToolButton", "GroupBox", "SpinBox"
]

function auditText(tree) {
  var problems = []
  var rich = new RegExp("(?:^|[^\\w.])(" + RICH_TEXT_TYPES.join("|") + ")\\b", "g")
  tree.forEach(function(entry) {
    if (!isQml(entry.path) || !isViewSide(entry.path)) return
    var views = source(entry)
    blocksOf(entry, "Text").forEach(function(block) {
      if (!/\btextFormat\s*:\s*Text\.PlainText\b/.test(directly(entry, block, "code"))) {
        problems.push(at(entry, block.index) + ": a Text without textFormat: Text.PlainText")
      }
    })
    matches(/\btextFormat\s*:\s*(?!\s|Text\.PlainText\b)/g, views.code).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a text format other than plain text")
    })
    matches(rich, views.code).forEach(function(found) {
      problems.push(at(entry, found.index) + ": " + found.groups[1] + " renders rich text")
    })
    CONTROLS_TYPES.forEach(function(type) {
      blocksOf(entry, type).forEach(function(block) {
        problems.push(at(entry, block.index) + ": " + type + " renders rich text")
      })
    })
    // The kit has a Button and a TextField of its own. Imported after
    // QtQuick.Controls they are the ones a plain name finds.
    var controls = /^import\s+QtQuick\.Controls\b/m.exec(views.plain)
    var kit = /^import\s+qs\.Ui\b/m.exec(views.plain)
    if (controls && kit && kit.index < controls.index) {
      problems.push(at(entry, controls.index) + ": QtQuick.Controls is imported after the kit and shadows it")
    }
  })
  return problems
}

// One image in the whole plugin, showing a local file the service fetched,
// with a bounded decoded size. No address ever reaches an image.
function auditImages(tree) {
  var problems = []
  var count = 0
  var others = ["AnimatedImage", "BorderImage", "IconImage"]
  tree.forEach(function(entry) {
    if (!isPluginQml(entry.path)) return
    others.forEach(function(type) {
      blocksOf(entry, type).forEach(function(block) { problems.push(at(entry, block.index) + ": " + type) })
    })
    blocksOf(entry, "Image").forEach(function(block) {
      count++
      var where = at(entry, block.index)
      var own = directly(entry, block, "plain")
      var bound = /^\s*source\s*:\s*(.*)$/m.exec(own)
      if (entry.path !== "ui/Thumb.qml") problems.push(where + ": an Image outside ui/Thumb.qml")
      if (!bound || !/^Util\.fileUrl\((?:root\.)?path\)\s*$/.test(bound[1])) {
        problems.push(where + ": the Image source is not Util.fileUrl(path)")
      }
      if (!/\bsourceSize\b/.test(own)) problems.push(where + ": an Image without sourceSize")
    })
    matches(/\.source\s*=(?!=)/g, source(entry).code).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a source assigned from code")
    })
  })
  if (count > 1) problems.push("more than one Image in the plugin")
  return problems
}

// The methods the service answers over IPC. The video and output methods
// arrive with the parts that implement them.
function ipcMethods(tree) {
  var methods = [
    "toggle", "open", "close", "playPause", "next", "previous", "stop", "play", "enqueue", "search", "status"
  ]
  if (has(tree, "core/VideoWindow.qml")) methods.push("video")
  if (has(tree, "core/AudioOutputs.qml")) methods.push("output")
  return methods
}

// One IPC handler, in the service. Its methods are exactly the documented
// ones, take and return strings, and each is one call into the service, so
// a test can drive the same code without a client.
function auditIpc(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isPluginQml(entry.path) || entry.path === "Service.qml") return
    if (blocksOf(entry, "IpcHandler").length > 0) problems.push(entry.path + ": an IpcHandler here")
  })
  var panel = find(tree, "Panel.qml")
  if (panel !== null) {
    var own = directly(panel, rootBlock(panel), "code")
    if (!/^\s*manageIpc\s*:\s*false\s*$/m.test(own)) problems.push("Panel.qml: manageIpc is not false")
    if (/\bipcTarget\b/.test(source(panel).code)) problems.push("Panel.qml: the panel names an IPC target")
  }
  var service = find(tree, "Service.qml")
  if (service === null) return problems
  var handlers = blocksOf(service, "IpcHandler")
  if (handlers.length !== 1) {
    problems.push("Service.qml: " + handlers.length + " IpcHandler blocks, expected one")
    return problems
  }
  var handler = handlers[0]
  var body = directly(service, handler, "code")
  if (!/^\s*target\s*:\s*root\.pluginId\s*$/m.test(body)) problems.push("Service.qml: another IPC target")
  if (/^\s*(?:readonly\s+)?property\b/m.test(body)) problems.push("Service.qml: a property on the handler")
  var code = source(service).code
  var signature = /\bfunction\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*(\w+))?\s*\{/g
  var methods = matches(signature, code.slice(handler.open, handler.close))
  var expected = ipcMethods(tree)
  expected.forEach(function(name) {
    var present = methods.some(function(method) { return method.groups[1] === name })
    if (!present) problems.push("Service.qml: the IPC method " + name + " is missing")
  })
  methods.forEach(function(method) {
    var name = method.groups[1]
    var where = "Service.qml: IPC " + name
    if (expected.indexOf(name) === -1) problems.push(where + " is not a documented method")
    if (method.groups[3] !== "string") problems.push(where + " does not return a string")
    method.groups[2].split(",").forEach(function(parameter) {
      if (parameter.trim() !== "" && !/^\s*\w+\s*:\s*string\s*$/.test(parameter)) {
        problems.push(where + " takes something that is not a string")
      }
    })
    var open = handler.open + method.index + method.groups[0].length - 1
    var inner = code.slice(open + 1, closing(code, open)).trim()
    var call = "_ipc" + name[0].toUpperCase() + name.slice(1)
    if (!new RegExp("^return root\\." + call + "\\([\\w, ]*\\)$").test(inner)) {
      problems.push(where + " is not one call to root." + call)
    }
  })
  return problems
}

// Places the plugin never writes to and never falls back to. Paths come
// from lib/Paths.js, which builds them from the session's own directories.
var FOREIGN_PLACES = /\.config\/hypr|hyprland\.lua|\/usr\/share\/omarchy|["'`]\/tmp\b|\/var\/tmp|\/dev\/shm/g

function auditPlaces(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isPluginCode(entry.path)) return
    matches(FOREIGN_PLACES, source(entry).plain).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a place the plugin never touches")
    })
  })
  return problems
}

// The hosts the plugin itself names, and the domains its patterns may
// recognise. This proves what we ask for, not what yt-dlp or mpv go on to
// contact.
var HOSTS = ["www.youtube.com", "i.ytimg.com", "sponsor.ajay.app"]
var PATTERN_DOMAINS = ["youtube.com", "youtu.be", "googlevideo.com"]

// Spellings with "://" that name nothing on the network: a file, and the
// inherited descriptor mpv is tethered to.
var LOCAL_SCHEMES = ["file", "fd"]

function auditHosts(tree) {
  var problems = []
  var address = /\b([A-Za-z][A-Za-z0-9+.-]*):\/\/([^\/"'`\s\\)]*)/g
  tree.forEach(function(entry) {
    if (!isPluginCode(entry.path)) return
    matches(address, source(entry).plain).forEach(function(found) {
      var scheme = found.groups[1].toLowerCase()
      if (LOCAL_SCHEMES.indexOf(scheme) !== -1) return
      if (scheme !== "https" || HOSTS.indexOf(found.groups[2]) === -1) {
        problems.push(at(entry, found.index) + ": an address that is not https to a host we name")
      }
    })
    // Patterns that recognise an address spell its host with escaped dots.
    piecesOf(entry, "regex").forEach(function(piece) {
      if (piece.raw.indexOf("\\/\\/") === -1) return
      matches(/((?:[a-z0-9-]+\\\.)+[a-z]{2,})\b/g, piece.raw).forEach(function(found) {
        var host = found.groups[1].replace(/\\/g, "")
        var known = PATTERN_DOMAINS.some(function(domain) {
          return host === domain || host.slice(-domain.length - 1) === "." + domain
        })
        if (!known) problems.push(at(entry, piece.start) + ": a pattern for the unexpected host " + host)
      })
    })
  })
  return problems
}

// The two seams tests use to put stand-ins in place: the tool table and the
// panel's source. Nothing in the plugin itself may reach either, or a
// setting, an IPC argument or a stored value could choose what is run.
function auditSeams(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isPluginCode(entry.path)) return
    var views = source(entry)
    var code = views.code
    matches(/((?:[A-Za-z_$][\w$]*\.)*)tools\s*=(?!=)([^\n]*)/g, code).forEach(function(found) {
      var before = code.slice(0, found.index)
      if (/[\w$.]$/.test(before)) return
      // A local name for the table is a read, not a write.
      var local = found.groups[1] === "" && /\bvar\s+$/.test(before)
      var alias = /^\s*[A-Za-z_$][\w$]*\.tools\s*$/.test(found.groups[2])
      if (!local || !alias) problems.push(at(entry, found.index) + ": the tool table is assigned")
    })
    matches(/\b(?:tools|TOOLS)\s*(?:\.\s*[\w$]+|\[[^\]\n]*\])\s*=(?!=)/g, code).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a tool path is assigned")
    })
    matches(/\bproperty\s+var\s+tools\b([^\n]*)/g, code).forEach(function(found) {
      if (!/^(?:\s*:\s*(?:Const\.TOOLS|null))?\s*$/.test(found.groups[1])) {
        problems.push(at(entry, found.index) + ": tools starts as something other than Const.TOOLS")
      }
    })
    matches(/(?:^|[{;,(])\s*tools\s*:\s*([^,;}\n]+)/gm, code).forEach(function(found) {
      var line = code.slice(code.lastIndexOf("\n", found.index + 1) + 1, found.index + 1)
      // A typed parameter of a function is not a binding.
      if (/\bfunction\b[^{]*$/.test(line)) return
      if (!/^(?:[a-z][A-Za-z0-9]*\.tools|Const\.TOOLS)\s*$/.test(found.groups[1])) {
        problems.push(at(entry, found.index) + ": tools is bound to something other than the parent's tools")
      }
    })
    matches(/\bpanelSource\b/g, code).forEach(function(found) {
      var rest = views.plain.slice(found.index).split("\n")[0]
      var declared = /property\s+url\s+$/.test(code.slice(0, found.index))
        && /^panelSource: Qt\.resolvedUrl\("Panel\.qml"\)\s*$/.test(rest)
      var read = /^panelSource\b(?!\s*(?::|=(?!=)))/.test(rest)
      if (entry.path !== "BarWidget.qml" || !(declared || read)) {
        problems.push(at(entry, found.index) + ": panelSource is set to something other than its constant")
      }
    })
  })
  return problems
}

// The view reads the service's public members only.
function auditPrivateAccess(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isPluginCode(entry.path) || !isViewSide(entry.path)) return
    matches(/\bservice\s*(?:\.\s*_|\[)/g, source(entry).code).forEach(function(found) {
      problems.push(at(entry, found.index) + ": the view reaches into the service")
    })
  })
  return problems
}

// A script module is one object for the whole engine. Qt's engine lets any
// file that imports it replace what it exports and reach the names it keeps
// to itself, and freezing does not protect an array there. The checks in
// lib/ therefore hold only while no file of the plugin writes into a
// module, changes one of its lists in place or uses a private name of it.
var MUTATORS = ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]

// The names under which a file knows the scripts it imports.
function moduleNames(entry) {
  var names = pathImports(entry).filter(function(found) {
    return /\.js$/.test(found.target) && found.qualifier !== ""
  }).map(function(found) { return found.qualifier })
  var scripted = /^\.import\s+"[^"\n]+"\s+as\s+([A-Za-z_]\w*)[ \t]*$/gm
  matches(scripted, source(entry).plain).forEach(function(found) { names.push(found.groups[1]) })
  return names
}

function auditModules(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isPluginCode(entry.path)) return
    var code = source(entry).code
    moduleNames(entry).forEach(function(name) {
      var member = "\\b" + name + "\\s*\\.\\s*[\\w$]+(?:\\s*\\.\\s*[\\w$]+|\\s*\\[[^\\]\\n]*\\])*"
      var rules = [
        [member + "\\s*(?:[-+*\\/%|&^]?=(?!=)|\\+\\+|--)", "writes into the module " + name],
        ["(?:\\+\\+|--|\\bdelete\\s)\\s*\\b" + name + "\\s*\\.", "writes into the module " + name],
        [member + "\\s*\\.\\s*(?:" + MUTATORS.join("|") + ")\\s*\\(", "changes a list of the module " + name],
        ["\\b" + name + "\\s*\\.\\s*_", "uses a private name of the module " + name]
      ]
      rules.forEach(function(rule) {
        matches(new RegExp(rule[0], "g"), code).forEach(function(found) {
          // A member of something else that happens to carry the name.
          if (/\.\s*$/.test(code.slice(0, found.index))) return
          problems.push(at(entry, found.index) + ": " + rule[1])
        })
      })
    })
  })
  return problems
}

// Members every Item already has. Declaring a property of that name is an
// error; a function of that name silently replaces the built-in one.
function auditMemberNames(tree) {
  var problems = []
  var pattern = new RegExp(DECLARATION + "(state|data|children|visible|update|margin)\\b", "gm")
  tree.forEach(function(entry) {
    if (!isPluginQml(entry.path)) return
    matches(pattern, source(entry).code).forEach(function(found) {
      problems.push(at(entry, found.index) + ": declares " + found.groups[1] + ", a member Item already has")
    })
  })
  return problems
}

var KEYWORDS_BEFORE_ARRAY = [
  "return", "typeof", "in", "of", "case", "else", "var", "new", "delete", "void", "throw"
]

// The names a script only ever starts at a number or at a length: its loop
// counters and positions. Maps each declared name to true or false.
function counters(code) {
  var kinds = new Map()
  matches(/\bvar\s+([A-Za-z_$][\w$]*)\b\s*(?:=\s*([^;,\n]*))?/g, code).forEach(function(found) {
    var start = (found.groups[2] || "").trim()
    var numeric = /^(?:\d+|[\w$.]+\.length(?:\s*-\s*\d+)?)\)?$/.test(start)
    kinds.set(found.groups[1], numeric && kinds.get(found.groups[1]) !== false)
  })
  return kinds
}

// Every computed lookup in a script whose key is neither a literal nor a
// counter: { index, text }, with text spelled "receiver[key]".
function keyedLookups(entry) {
  var views = source(entry)
  var code = views.code
  var numeric = counters(code)
  var found = []
  for (var i = 0; i < code.length; i++) {
    if (code[i] !== "[") continue
    var before = i - 1
    while (before >= 0 && code[before] === " ") before--
    if (before < 0 || !/[\w$)\]]/.test(code[before])) continue
    // Walk back to the start of the expression that is indexed.
    var start = before + 1
    while (start > 0) {
      var prev = code[start - 1]
      if (prev === ")" || prev === "]") { start = opening(code, start - 1); continue }
      if (!/[\w$.]/.test(prev)) break
      while (start > 0 && /[\w$.]/.test(code[start - 1])) start--
      if (code[start] !== ".") break
    }
    if (KEYWORDS_BEFORE_ARRAY.indexOf(code.slice(start, before + 1)) !== -1) continue
    var end = closing(code, i)
    var key = views.plain.slice(i + 1, end).replace(/\s+/g, " ").trim()
    var name = /^([A-Za-z_$][\w$]*)(?:\s*[-+]\s*\d+)?$/.exec(key)
    if (/^\d+$/.test(key) || /^"[^"]*"$/.test(key) || (name && numeric.get(name[1]) === true)) continue
    found.push({ index: i, text: views.plain.slice(start, end + 1).replace(/\s+/g, " ") })
  }
  return found
}

// Every lookup in lib/ with a key that is not a constant, each with the
// reason outside text cannot steer it into Object.prototype. A new lookup
// fails the audit until someone has looked at it and listed it here; one
// that is gone has to be taken out again.
var REVIEWED_LOOKUPS = {
  "lib/Errors.js": {
    "table[rows[i][0]]": "writes the constant rows into a table that has no prototype"
  },
  "lib/Track.js": {
    "object[key]": "read only behind hasOwnProperty.call, in the same expression"
  },
  "lib/Browsers.js": {
    "table[rows[i][0]]": "writes the constant rows into a table that has no prototype",
    "TABLE[id]": "read only behind hasOwnProperty.call, in the same expression"
  },
  "lib/Devices.js": {
    "object[key]": "read only behind hasOwnProperty.call, in the same expression",
    "seen[name]": "a table without a prototype, and the name has passed the device-name pattern",
    "list[(index + 1) % list.length]": "a number: the position after the one indexOf found"
  },
  "lib/FeedUrls.js": {
    "object[key]": "read only behind hasOwnProperty.call, in the same expression",
    "_URLS[index]": "a number: what indexOf found in the constant list of kinds, checked against -1"
  },
  "lib/Geometry.js": {
    "table[name]": "read only after hasOwnProperty.call said the table itself has the name"
  },
  "lib/KeyCombo.js": {
    "_ROWS[which]": "a number: what indexOf found in the constant list of actions, checked against -1",
    "_KEYS[at]": "a number: what indexOf found in the constant list of keys, checked against -1",
    "values[slot]": "a number: what indexOf found in the constant list of fields, checked against -1"
  },
  "lib/Queue.js": {
    "names[i]": "a loop counter into the list Object.keys made",
    "queue[index]": "a number that was checked to be a position of the array",
    "queue[i]": "a loop counter",
    "view.copies[i]": "a loop counter",
    "skipIds[skips - i]": "a loop counter, counted back from the length of the array",
    "tracks[i]": "a loop counter",
    "view.items[view.index]": "a number the view made, checked to be a position of its array",
    "view.copies[at]": "a number out of the view's own Map of keys",
    "view.items[at]": "a number out of the view's own Map of keys",
    "items[i]": "a loop counter",
    "entryKeys[i]": "a loop counter",
    "keys[at - 1]": "a number: a position of the array, checked to be above 0",
    "keys[at + 1]": "a number: a position of the array, checked to be below its length",
    "keys[i]": "a loop counter"
  },
  "lib/Segments.js": {
    "object[key]": "read only behind hasOwnProperty.call, in the same expression",
    "sorted[i]": "a loop counter",
    "merged[merged.length - 1]": "a number: the last position of an array that is not empty",
    "_CATEGORIES_HIDDEN[rank]": "a number: what indexOf found in that very list, checked against -1",
    "segments[i]": "a loop counter",
    "videos[i]": "a loop counter",
    "allowed[stretch.rank]": "a number: the rank indexOf gave the category when the stretch was read",
    "fired[i]": "a loop counter",
    "entries[i]": "a loop counter",
    "marks[i]": "a loop counter"
  },
  "lib/Sha256.js": {
    "block[at]": "a number: a position in the block the function was handed by its only caller",
    "block[at + 1]": "as block[at]",
    "block[at + 2]": "as block[at]",
    "block[at + 3]": "as block[at]",
    "words[i]": "a loop counter into an array the function made",
    "words[i - 15]": "as words[i]",
    "words[i - 2]": "as words[i]",
    "words[i - 16]": "as words[i]",
    "words[i - 7]": "as words[i]",
    "_ROUNDS[i]": "a loop counter into the constant table",
    "hash.block[hash.fill++]": "a number the hash counts itself",
    "hash.value[i]": "a loop counter"
  }
}

function auditLookups(tree, reviewed) {
  var problems = []
  tree.forEach(function(entry) {
    if (!isLib(entry.path)) return
    var known = reviewed[entry.path] || {}
    var seen = {}
    keyedLookups(entry).forEach(function(found) {
      var first = seen[found.text] !== true
      seen[found.text] = true
      if (first && !Object.prototype.hasOwnProperty.call(known, found.text)) {
        problems.push(at(entry, found.index) + ": the keyed lookup " + found.text + " has not been reviewed")
      }
    })
    Object.keys(known).forEach(function(text) {
      if (!seen[text]) problems.push(entry.path + ": the reviewed lookup " + text + " is no longer there")
    })
  })
  Object.keys(reviewed).forEach(function(file) {
    if (!has(tree, file)) problems.push(file + ": reviewed lookups for a file that does not exist")
  })
  return problems
}

// ---- Marketplace ----

// Words and phrases the marketplace's scanner reads as privileged
// commands, package installation or code fetched at install time. They
// appear nowhere outside tests/: not in a message, not in the README.
var SCANNER_PHRASES = [
  /\bsudo\b/i, /\bpkexec\b/i, /\bsystemctl\b/i, /\bsystemd-run\b/i,
  /\bomarchy\s+pkg\s+(?:add|drop|remove|update)\b/i,
  /\b(?:pacman|paru|yay|apt|apt-get|dnf|zypper|apk)\s+(?:-[SRU]\w*|install|remove|upgrade|add|del)\b/i,
  /\b(?:pip|pip3|pipx)\s+install\b/i, /\bpython3?\s+-m\s+pip\s+install\b/i,
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add)\b/i, /\b(?:cargo|go|gem)\s+install\b/i,
  /\bbrew\s+(?:install|uninstall|upgrade)\b/i, /\bgit\s+(?:clone|fetch|pull)\b/i, /\bwget\b/i
]

var MAX_FILE_BYTES = 512 * 1024

// The notes and the settings folders that coding assistants keep in a
// project. The first name of each list is put together from two halves: a
// search of the published tree for it finds the ignore file and nothing else.
var AGENT_NOTES = new RegExp("^(?:CLA" + "UDE|AGENTS|GEMINI)\\.md$", "i")
var AGENT_FOLDERS = new RegExp("(?:^|\\/)\\.(?:cla" + "ude|cursor|aider)")

// The first bytes of a compiled program: ELF, PE and the Mach-O variants.
var BINARY_MAGIC = /^(?:\x7fELF|MZ|\xcf\xfa\xed\xfe|\xfe\xed\xfa[\xce\xcf]|\xca\xfe\xba\xbe)/

function auditFiles(tree) {
  var problems = []
  tree.forEach(function(entry) {
    var file = entry.path
    var base = path.posix.basename(file)
    if (entry.symlink) problems.push(file + ": a symbolic link")
    if (/install|setup/i.test(base)) problems.push(file + ": the name reads as an installer")
    if (/\.service$/.test(base)) problems.push(file + ": a service unit")
    if (AGENT_NOTES.test(base) || AGENT_FOLDERS.test(file)) {
      problems.push(file + ": a file for a coding agent")
    }
    if (entry.size > MAX_FILE_BYTES && file !== "preview.png") problems.push(file + ": larger than 512 KiB")
    if (BINARY_MAGIC.test(entry.magic)) problems.push(file + ": a compiled binary")
    // Nothing is ever executed from the plugin directory. Under tests/ the
    // launchers and the stub tools are scripts with an interpreter line.
    if (entry.executable && (!isTest(file) || !/^#!\/usr\/bin\/(?:sh|node)\n/.test(entry.text))) {
      problems.push(file + ": executable, and not a test script")
    }
  })
  return problems
}

function auditPhrases(tree) {
  var problems = []
  tree.forEach(function(entry) {
    if (isTest(entry.path) || !isText(entry)) return
    entry.text.split("\n").forEach(function(line, n) {
      var flagged = SCANNER_PHRASES.some(function(phrase) { return phrase.test(line) })
      if (flagged) problems.push(entry.path + ":" + (n + 1) + ": a phrase the marketplace scanner flags")
    })
  })
  return problems
}

var INSTALL_LINE = "omarchy plugin add https://github.com/DavidGudovic/omajuke.git --enable"

// The README's sections, in order. The two that describe a part appear
// together with that part.
function readmeHeadings(tree) {
  var headings = ["Requirements", "Install", "Use"]
  if (has(tree, "core/Shortcuts.qml")) headings.push("Shortcuts")
  headings.push("Settings", "IPC", "What it connects to", "What it stores")
  if (has(tree, "core/SignIn.qml")) headings.push("Sign-in")
  headings.push("Updating", "Removing", "Terms and credits", "Development and testing", "License")
  return headings
}

// The sections of a Markdown text: { heading, text, blocks }, where blocks
// are its fenced code blocks as { language, lines }.
function markdownSections(text) {
  var sections = [{ heading: "", text: "", blocks: [] }]
  var block = null
  text.split("\n").forEach(function(line) {
    var current = sections[sections.length - 1]
    var fence = /^\s*(```+|~~~+)\s*([A-Za-z0-9_-]*)/.exec(line)
    if (block !== null) {
      if (fence && fence[2] === "") { current.blocks.push(block); block = null } else block.lines.push(line)
      return
    }
    if (fence) { block = { language: fence[2].toLowerCase(), lines: [] }; return }
    var heading = /^## +(.*?)\s*$/.exec(line)
    if (heading) sections.push({ heading: heading[1], text: "", blocks: [] })
    else current.text += line + "\n"
  })
  return sections
}

function auditReadme(tree) {
  var readme = find(tree, "README.md")
  if (readme === null) return []
  var problems = []
  var sections = markdownSections(readme.text)
  var headings = sections.slice(1).map(function(section) { return section.heading })
  var expected = readmeHeadings(tree)
  if (JSON.stringify(headings) !== JSON.stringify(expected)) {
    problems.push("README.md: the sections are [" + headings.join(", ") + "]")
    problems.push("README.md: they should be [" + expected.join(", ") + "]")
  }
  sections.forEach(function(section) {
    var name = section.heading
    var shell = section.blocks.filter(function(block) {
      return ["sh", "bash", "shell"].indexOf(block.language) !== -1
    })
    // The scanner reads a shell block as a script to run, unless its
    // heading says development or testing.
    if (shell.length > 0 && name !== "Install" && name !== "Development and testing") {
      problems.push("README.md: a shell block under \"" + name + "\"")
    }
    if (name === "Install") {
      var lines = section.blocks.length === 1 ? section.blocks[0].lines : []
      if (lines.length !== 1 || lines[0] !== INSTALL_LINE) {
        problems.push("README.md: Install is not exactly the one plugin-add line")
      }
    }
    // What preloading tells YouTube has to be said where the setting is.
    var disclosed = section.text.indexOf("preload") !== -1 && section.text.indexOf("top result") !== -1
    if (name === "Settings" && has(tree, "lib/Queue.js") && !disclosed) {
      problems.push("README.md: Settings does not say what preload looks up")
    }
  })
  return problems
}

// Working notes of the build are not published, so nothing published may
// point at them: not by their file names, and not by the name the main
// document went by while the plugin was built. (The bracket in the last
// alternative keeps this line from matching itself.)
function auditReferences(tree) {
  var problems = []
  var notes = /\.dev\/|\bdesign(?:-resolutions)?\.md\b|\bdecisions\.md\b|\b[Bb]lue[p]rints?\b/g
  tree.forEach(function(entry) {
    if (!isText(entry) || entry.path === ".gitignore") return
    matches(notes, entry.text).forEach(function(found) {
      problems.push(at(entry, found.index) + ": points at unpublished working notes")
    })
  })
  return problems
}

// ---- Tests cannot harm the session ----

// The words these audits look for are put together from halves, so that
// this file passes its own rules: no file under tests/ is exempt.
var SIGNAL = "ki" + "ll"
var BY_NAME = ["p" + SIGNAL, SIGNAL + "all", "pg" + "rep", "pid" + "of"]
var SHELL_FORM = SIGNAL + " -KILL \"$p\""
var DISPLAY_NAME = "WAYLAND_" + "DISPLAY"
var BUS_NAME = "DBUS_SESSION_" + "BUS_ADDRESS"
var COMPOSITOR_NAME = "HYPRLAND_INSTANCE_" + "SIGNATURE"

// A test may end a process in two ways only. The launcher script signals a
// PID it recorded itself and checked against its own run directory; node
// code ends a child through the handle it got when it spawned that child.
// Nothing is ever selected by name or command line: with one wrong
// variable that selects every process of the session.
function auditSignals(tree) {
  var problems = []
  var word = new RegExp("\\b" + SIGNAL + "\\b", "g")
  tree.forEach(function(entry) {
    var file = entry.path
    if (!isTest(file)) return
    var text = entry.text
    BY_NAME.forEach(function(name) {
      var index = text.toLowerCase().indexOf(name)
      if (index !== -1) problems.push(at(entry, index) + ": names a tool that selects processes by name")
    })
    if (text.indexOf("process." + SIGNAL) !== -1) problems.push(file + ": signals a PID from node")
    matches(word, text).forEach(function(found) {
      var where = at(entry, found.index)
      if (/\.js$/.test(file)) {
        var handle = /([A-Za-z_$][\w$]*)\.$/.exec(text.slice(0, found.index))
        if (!handle || handle[1] === "process" || text[found.index + SIGNAL.length] !== "(") {
          problems.push(where + ": not a call on a child's handle")
          return
        }
        var spawned = new RegExp("\\b" + handle[1].replace(/\$/g, "\\$") + "\\s*=\\s*[\\w.]*spawn\\(")
        if (!spawned.test(text)) problems.push(where + ": the handle was not spawned in this file")
        return
      }
      if (file !== "tests/harness.sh") { problems.push(where + ": a signal outside the launcher"); return }
      if (text.slice(found.index, found.index + SHELL_FORM.length) !== SHELL_FORM) {
        problems.push(where + ": not the one allowed form")
        return
      }
      // The PID in $p must come from ours(), which checks that it belongs
      // to this run. The assignment nearest above decides.
      var assigned = matches(/(?:^|[\s;(])p=(\S*\s?)/g, text.slice(0, found.index))
      if (assigned.length === 0 || assigned[assigned.length - 1].groups[1] !== "$(ours ") {
        problems.push(where + ": the PID does not come from ours()")
      }
    })
  })
  var launcher = find(tree, "tests/harness.sh")
  if (launcher !== null) {
    var lines = launcher.text.split("\n")
    var strict = lines.indexOf("set -eu")
    var firstTemp = lines.findIndex(function(line) { return line.indexOf("mktemp") !== -1 })
    if (strict === -1 || (firstTemp !== -1 && firstTemp < strict)) {
      problems.push("tests/harness.sh: set -eu does not come before the run directory is made")
    }
    if (launcher.text.indexOf("env -i ") === -1) problems.push("tests/harness.sh: the environment is kept")
  }
  return problems
}

// No test gives a child the live display or session bus, and none reads
// the compositor's instance from its own environment. The launcher clears
// the environment and names a compositor instance that does not exist.
function auditSession(tree) {
  var problems = []
  var reads = new RegExp("\\$\\{?" + COMPOSITOR_NAME + "|env\\s*[.(\\[]\\s*[\"']?" + COMPOSITOR_NAME, "g")
  var sets = new RegExp(COMPOSITOR_NAME + "=(\\S*)", "g")
  tree.forEach(function(entry) {
    var file = entry.path
    if (!isTest(file)) return
    var text = entry.text
    var names = [DISPLAY_NAME, BUS_NAME]
    names.forEach(function(name) {
      var index = text.indexOf(name + "=")
      if (index !== -1) problems.push(at(entry, index) + ": sets " + name)
    })
    matches(reads, text).forEach(function(found) {
      problems.push(at(entry, found.index) + ": reads " + COMPOSITOR_NAME + " from its own environment")
    })
    matches(sets, text).forEach(function(found) {
      if (file !== "tests/harness.sh" || found.groups[1] !== "\"$HIS\"}") {
        problems.push(at(entry, found.index) + ": sets " + COMPOSITOR_NAME)
      }
    })
    if (file !== "tests/harness.sh") return
    matches(/\bHIS=(\S*)/g, text).forEach(function(found) {
      if (found.groups[1] !== "" && found.groups[1] !== "oj-harness-dummy") {
        problems.push(at(entry, found.index) + ": the compositor instance is not the dummy")
      }
    })
  })
  return problems
}

// ---- Fixtures ----

// One character repeated, with at most a short counter behind it, or one
// of the two ids that are words.
function isSyntheticId(id) {
  return /^([A-Za-z0-9])\1{6,}[A-Za-z0-9]{0,4}$/.test(id) || id === "constructor" || id === "--no-config"
}

// Fixtures are written by hand or generated: nothing in them comes from a
// real account, a real machine or a real session.
function auditFixtures(tree) {
  var problems = []
  var sentences = []
  tree.forEach(function(entry) {
    if (!isLib(entry.path)) return
    piecesOf(entry, "string").forEach(function(piece) { sentences.push(piece.raw.slice(1, -1)) })
  })
  tree.forEach(function(entry) {
    if (!isFixture(entry.path) || !isText(entry)) return
    var text = entry.text
    matches(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, text).forEach(function(found) {
      if (found.groups[0] !== "127.0.0.1") problems.push(at(entry, found.index) + ": an IP address")
    })
    // A real media address is signed for one client and a few hours.
    matches(/[?&](?:ip|expire)=/g, text).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a signed media address")
    })
    matches(/\/home\//g, text).forEach(function(found) {
      problems.push(at(entry, found.index) + ": a home directory")
    })
    matches(/(?:watch\?v=|\/vi\/)([\w-]{11})(?![\w-])/g, text).forEach(function(found) {
      if (!isSyntheticId(found.groups[1])) problems.push(at(entry, found.index) + ": an id that looks real")
    })
    if (entry.path !== "tests/fixtures/binds.txt") return
    // A real bind listing describes somebody's desktop.
    matches(/^\s*description:[ \t]*(.*)$/gm, text).forEach(function(found) {
      var description = found.groups[1]
      var ours = sentences.indexOf(description) !== -1
      if (description !== "" && !/^Placeholder \d+$/.test(description) && !ours) {
        problems.push(at(entry, found.index) + ": a bind description that is not a placeholder")
      }
    })
  })
  return problems
}

// ---- The audits, on the tree ----

function constants() {
  var Const = load.lib("Const")
  var values = { pluginId: Const.PLUGIN_ID, version: Const.VERSION }
  if (has(TREE, "ui/Ui.js")) values.uiVersion = load.ui("Ui").VERSION
  return values
}

// Every audit: the name its test carries and how to run it. The second
// argument says whether the tree is the miniature one of the next section,
// which brings its own constants, layout and list of reviewed lookups.
var AUDITS = [
  ["layout: lib/ serves the service side only, ui/ the view side only", auditImports],
  ["layout: what a script shows QML is what its footer shows node", auditFooters],
  ["layout: the id and the version agree wherever they are written", function(tree, isMiniature) {
    return auditIdentity(tree, isMiniature ? SOUND_CONSTANTS : constants())
  }],
  ["layout: every file is one the layout names, under one area", function(tree, isMiniature) {
    return auditLayout(tree, isMiniature ? SOUND_LAYOUT : LAYOUT)
  }],
  ["layout: every vector table is run by a harness case on Qt's engine", auditVectorCases],
  ["layout: a harness root imports nothing by path", auditHarnessRoots],
  ["layout: the mock service has the members of the service, and no others", auditMock],
  ["style: var and function only, no statement ends in a semicolon", auditLanguage],
  ["style: nothing Qt's JavaScript engine lacks", auditEngine],
  ["style: a file with an inline component binds it", auditBound],
  ["style: no tabs, no hidden characters, ASCII outside strings", auditCharacters],
  ["style: two-space indentation, 110 columns, tidy line ends", auditFormatting],
  ["style: every source file opens with a comment about itself", auditHeaders],
  ["safety: the log gets constant warnings only", auditConsole],
  ["safety: no unbounded reader, no command or code from text, no stray process", auditForbidden],
  ["safety: every Text is plain text, and nothing that renders rich text is used", auditText],
  ["safety: one Image, showing a local file at a bounded size", auditImages],
  ["safety: one IPC handler, with exactly the documented methods", auditIpc],
  ["safety: no path into the Hyprland config, the shell's files or a shared temp folder", auditPlaces],
  ["safety: the only addresses are https to the hosts we name", auditHosts],
  ["safety: the tool table and the panel source are set by tests only", auditSeams],
  ["safety: the view reads no private member of the service", auditPrivateAccess],
  ["safety: no file writes into a script module or uses its private names", auditModules],
  ["safety: no component redeclares a member of Item", auditMemberNames],
  ["safety: every keyed lookup in lib/ has been reviewed", function(tree, isMiniature) {
    return auditLookups(tree, isMiniature ? SOUND_LOOKUPS : REVIEWED_LOOKUPS)
  }],
  ["marketplace: no link, installer name, agent file, binary or oversized file", auditFiles],
  ["marketplace: no phrase the scanner flags outside tests/", auditPhrases],
  ["marketplace: the README has its sections, and commands only where they belong", auditReadme],
  ["marketplace: nothing points at unpublished working notes", auditReferences],
  ["tests: a process is ended by recorded PID or by handle, never by name", auditSignals],
  ["tests: no live display, bus or compositor reaches a test", auditSession],
  ["fixtures: synthetic data only", auditFixtures]
]

test("the tree was listed", function() {
  assert.ok(has(TREE, "tests/node/repo.test.js"))
  assert.ok(has(TREE, "lib/Const.js"))
  // Ignored working material is never part of it.
  assert.ok(!TREE.some(function(entry) { return /^\.dev\/|^node_modules\//.test(entry.path) }))
})

AUDITS.forEach(function(audit) {
  test(audit[0], function() {
    assert.deepStrictEqual(audit[1](TREE, false), [])
  })
})

// ---- The audits bite ----

// A plugin in miniature that every audit accepts. Each test below plants
// one mistake in a copy of it and expects the audit made for that mistake
// to report it. An audit that finds nothing in the real tree is only worth
// something if it would have found the mistake.

var SOUND_CONSTANTS = { pluginId: "example.plugin", version: "0.1.0", uiVersion: "0.1.0" }
var SOUND_LOOKUPS = { "lib/Ids.js": { "table[key]": "behind hasOwnProperty.call" } }

function asFile(list) {
  return list.join("\n") + "\n"
}

// The IPC handler's methods, each one call into the service.
function soundHandlers() {
  return ipcMethods([]).map(function(name) {
    var parameter = ["play", "enqueue", "search"].indexOf(name) === -1 ? "" : "text"
    var call = "root._ipc" + name[0].toUpperCase() + name.slice(1) + "(" + parameter + ")"
    return "    function " + name + "(" + (parameter === "" ? "" : parameter + ": string") + "): string {\n"
      + "      return " + call + "\n    }\n"
  }).join("")
}

var SOUND = {
  ".gitignore": ".de" + "v/\n",
  "manifest.json": JSON.stringify({
    id: "example.plugin", version: "0.1.0", keepLoaded: true,
    entryPoints: { service: "Service.qml", barWidget: "BarWidget.qml" }
  }) + "\n",
  "README.md": "# Example\n\nA plugin.\n\n" + readmeHeadings([]).map(function(heading) {
    if (heading === "Install") return "## Install\n\n```sh\n" + INSTALL_LINE + "\n```\n"
    return "## " + heading + "\n\nWords.\n"
  }).join("\n"),
  "lib/Const.js": asFile([
    ".pragma library", "", "// Constants.", "var PLUGIN_ID = \"example.plugin\"",
    "var TOOLS = { sh: \"/usr/bin/sh\" }", "", "if (typeof module !== \"undefined\") {",
    "  module.exports = { PLUGIN_ID: PLUGIN_ID, TOOLS: TOOLS }", "}"
  ]),
  "lib/Ids.js": asFile([
    ".pragma library", ".import \"Const.js\" as Const", "", "// Ids.",
    "var _REF = /^https:\\/\\/www\\.youtube\\.com\\/watch\\?v=([\\w-]{11})$/", "",
    "function watchUrl(id) {", "  return \"https://www.youtube.com/watch?v=\" + id", "}", "",
    "function pick(table, key, list) {", "  for (var i = 0; i < list.length; i++) list[i] = list[0]",
    "  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : \"\"", "}", "",
    "if (typeof module !== \"undefined\") {", "  module.exports = { watchUrl: watchUrl, pick: pick }", "}"
  ]),
  "Service.qml": asFile([
    "import QtQuick", "import Quickshell.Io", "import \"core\"", "import \"lib/Const.js\" as Const", "",
    "// The service.", "Item {", "  id: root", "", "  property var tools: Const.TOOLS",
    "  readonly property string pluginId: Const.PLUGIN_ID", "  readonly property bool ready: false", "",
    "  function playPause(): bool {", "    return false", "  }", "", "  function _ipcToggle() {",
    "    return \"ok\"", "  }", "", "  ProcessRunner {", "    id: runner", "    tools: root.tools", "  }", "",
    "  IpcHandler {", "    target: root.pluginId", ""
  ]) + soundHandlers() + "  }\n}\n",
  "core/ProcessRunner.qml": asFile([
    "pragma ComponentBehavior: Bound", "", "import QtQuick", "import Quickshell", "import Quickshell.Io",
    "import \"../lib/Const.js\" as Const", "", "// The runner.", "Item {", "  id: root", "",
    "  property var tools: Const.TOOLS", "", "  function run(spec: var): int {", "    var tools = root.tools",
    "    if (!tools) console.warn(\"omajuke: the runner has no tools\")",
    "    Quickshell.execDetached({ command: spec.argv, clearEnvironment: true })", "    return 1", "  }", "",
    "  Component {", "    id: jobComponent", "", "    Process {", "      stdout: SplitParser {",
    "        splitMarker: \"\"", "      }", "    }", "  }", "}"
  ]),
  "BarWidget.qml": asFile([
    "import QtQuick", "import qs.Ui", "import \"ui/Ui.js\" as Ui", "", "// The bar icon.", "BarWidget {",
    "  id: root", "", "  property url panelSource: Qt.resolvedUrl(\"Panel.qml\")",
    "  readonly property var service: bar ? bar.shell.serviceFor(root.moduleName) : null",
    "  readonly property bool stale: service !== null && service.version !== Ui.VERSION", "", "  Loader {",
    "    id: panelLoader", "    active: false", "    source: root.panelSource", "  }", "}"
  ]),
  "Panel.qml": asFile([
    "import QtQuick", "import qs.Ui", "import \"ui\"", "", "// The panel.", "Panel {", "  id: root", "",
    "  manageIpc: false", "", "  Thumb {", "    path: \"\"", "  }", "}"
  ]),
  "ui/Ui.js": asFile([
    ".pragma library", "", "// View constants.", "var VERSION = \"0.1.0\"", "var LOADING = \"Loading\u2026\"",
    "", "if (typeof module !== \"undefined\") {", "  module.exports = { VERSION: VERSION, LOADING: LOADING }",
    "}"
  ]),
  "ui/Thumb.qml": asFile([
    "import QtQuick", "import QtQuick.Controls", "import qs.Commons", "import qs.Ui",
    "import \"Ui.js\" as Ui", "", "// The thumbnail.", "Item {", "  id: root", "",
    "  property string path: \"\"", "", "  Text {",
    "    textFormat: Text.PlainText", "    text: Ui.LOADING", "  }", "", "  Image {",
    "    source: Util.fileUrl(root.path)", "    sourceSize.width: 128", "  }", "}"
  ]),
  "tests/vectors/ids.js": asFile([
    ".pragma library", "", "// Vectors.", "var MODULE = \"Ids\"",
    "var CASES = [{ fn: \"watchUrl\", args: [\"AAAAAAAAAAA\"], expect: \"x\" }]", "",
    "if (typeof module !== \"undefined\") {", "  module.exports = { MODULE: MODULE, CASES: CASES }", "}"
  ]),
  "tests/harness/cases/vectors_base.qml": asFile([
    "import QtQuick", "import \"../../../lib/Ids.js\" as Ids",
    "import \"../../vectors/ids.js\" as IdsVectors", "", "// The case.", "QtObject {",
    "  function run(h) {", "    h.vectors(Ids, IdsVectors)", "    h.finish()", "  }", "}"
  ]),
  "tests/harness/shell.qml": asFile([
    "import QtQuick", "import Quickshell", "", "// The root.", "ShellRoot {", "}"
  ]),
  "tests/harness-ui/MockService.qml": asFile([
    "import QtQuick", "", "// The mock.", "QtObject {", "  id: root", "", "  property var calls: []",
    "  property var returns: ({})", "  property var tools: null", "  property string pluginId: \"mock\"",
    "  property bool ready: true", "", "  function playPause() { return true }", "}"
  ]),
  "tests/harness.sh": asFile([
    "#!/usr/bin/sh", "# The launcher.", "set -eu", "RUN=$(/usr/bin/mktemp -d \"$BASE/oj-test.XXXXXX\")",
    "ours() {", "  cat \"$1\"", "}",
    "if p=$(ours \"$RUN/qs.pid\"); then " + SHELL_FORM + " 2>/dev/null || true; fi",
    "HIS=oj-harness-dummy", "case \"$CASE\" in hypr_none) HIS= ;; esac",
    "env -i HOME=\"$RUN\" ${HIS:+" + COMPOSITOR_NAME + "=\"$HIS\"} \"$QS\" &"
  ]),
  "tests/node/sh.test.js": asFile([
    "\"use strict\"", "// A test that ends its own child.", "var spawn = require(\"child_process\").spawn",
    "var child = spawn(\"/usr/bin/sleep\", [\"5\"])", "child." + SIGNAL + "()"
  ]),
  "tests/fixtures/video.json": asFile([
    "{", "\t\"webpage_url\": \"https://www.youtube.com/watch?v=AAAAAAAAAAA\",",
    "\t\"url\": \"http://127.0.0.1:9/x?id=synthetic\"", "}"
  ])
}

var SOUND_LAYOUT = { "everything": Object.keys(SOUND) }

// The miniature tree, with the files in changes replacing or joining it.
// Each is given as its new text, as a function from the sound text to the
// new one, or as an object with the text and what else makes up the file.
function miniature(changes) {
  var files = {}
  Object.keys(SOUND).forEach(function(file) {
    files[file] = { text: SOUND[file], executable: file === "tests/harness.sh" }
  })
  Object.keys(changes || {}).forEach(function(file) {
    var edit = changes[file]
    if (typeof edit === "function") files[file].text = edit(SOUND[file])
    else files[file] = typeof edit === "string" ? { text: edit } : edit
  })
  return Object.keys(files).sort().map(function(file) {
    return makeEntry(file, files[file].text, files[file])
  })
}

// An edit that puts a line in after the first line containing marker.
function after(marker, line) {
  return function(text) {
    var index = text.indexOf(marker)
    assert.notStrictEqual(index, -1, "the sample has no " + marker)
    var end = text.indexOf("\n", index) + 1
    return text.slice(0, end) + line + "\n" + text.slice(end)
  }
}

// An edit that replaces the first from with to.
function swap(from, to) {
  return function(text) {
    assert.notStrictEqual(text.indexOf(from), -1, "the sample has no " + from)
    return text.replace(from, function() { return to })
  }
}

function change(file, edit) {
  var changes = {}
  changes[file] = edit
  return changes
}

// One more file for the plugin or its tests, sound except for its body.
function inLib(body) {
  return change("lib/Extra.js", asFile([
    ".pragma library", "", "// A script.", body, "", "if (typeof module !== \"undefined\") {",
    "  module.exports = {}", "}"
  ]))
}

function component(body) {
  return asFile(["import QtQuick", "", "// A component.", "Item {", "  id: root", "", body, "}"])
}

function inCore(body) { return change("core/Extra.qml", component(body)) }
function inView(body) { return change("ui/Extra.qml", component(body)) }
function inCase(body) { return change("tests/harness/cases/extra.qml", component(body)) }
function inNodeTest(body) { return change("tests/node/extra.test.js", NODE_HEAD + body + "\n") }
function inShell(file, body) { return change(file, "#!/usr/bin/sh\n# A script.\n" + body + "\n") }

var NODE_HEAD = "\"use strict\"\n// A test.\n"
var FIRST_IMPORT = "import QtQuick\n"
var HIDDEN_MARK = String.fromCharCode(0x202e)
var ACCENTED = String.fromCharCode(0xe9)
var KIT_LAST = "import QtQuick.Controls\nimport qs.Commons\nimport qs.Ui\n"

// For each audit (named by the start of its test's name): the mistakes it
// must notice, each with the files that carry it.
var PLANTED = {
  "layout: lib/": [
    ["the view imports lib/",
      change("ui/Thumb.qml", after(FIRST_IMPORT, "import \"../lib/Const.js\" as Const"))],
    ["the service imports ui/", change("Service.qml", after(FIRST_IMPORT, "import \"ui/Ui.js\" as Ui"))],
    ["the view imports core/", change("Panel.qml", after(FIRST_IMPORT, "import \"core\""))],
    ["the plugin imports a test file",
      change("Service.qml", after(FIRST_IMPORT, "import \"tests/harness\""))],
    ["core/ imports the kit", change("core/ProcessRunner.qml", after(FIRST_IMPORT, "import qs.Commons"))],
    ["an import named like a type", change("Service.qml", swap("as Const", "as Text"))],
    ["a script without the pragma", change("lib/Ids.js", swap(".pragma library\n", "\n"))],
    ["a script import from another directory", change("lib/Ids.js", swap("\"Const.js\"", "\"../ui/Ui.js\""))],
    ["a vector table that imports",
      change("tests/vectors/ids.js", after(".pragma", ".import \"Ids.js\" as Ids"))]
  ],
  "layout: what a script": [
    ["a public name missing from the footer", change("lib/Const.js", after("var TOOLS", "var EXTRA = 1"))],
    ["a private name in the footer", change("lib/Ids.js", swap("{ watchUrl:", "{ _REF: _REF, watchUrl:"))],
    ["an export under another name", change("lib/Ids.js", swap("pick: pick", "choose: pick"))],
    ["a script without a footer",
      change("ui/Ui.js", ".pragma library\n\n// Constants.\nvar VERSION = \"0.1.0\"\n")]
  ],
  "layout: the id": [
    ["a manifest with another version", change("manifest.json", swap("0.1.0", "0.2.0"))],
    ["a manifest with another id", change("manifest.json", swap("example.plugin", "other.plugin"))],
    ["a manifest key nothing reads", change("manifest.json", swap("{\"id\"", "{\"$schema\":\"x\",\"id\""))],
    ["the id written into the widget",
      change("BarWidget.qml", after("id: root", "  property string target: \"example.plugin\""))],
    ["a changelog that ends at another version",
      change("CHANGELOG.md", "# Changelog\n\n## 0.0.9 - 2026-01-01\n\nWords.\n")],
    ["a changelog without an entry", change("CHANGELOG.md", "# Changelog\n\nNothing yet.\n")],
    ["a README about another version", change("README.md", after("# Example", "This is version 0.0.9."))],
    ["a README example with another version",
      change("README.md", after("# Example", "`{ \"version\": \"0.0.9\", \"state\": \"idle\" }`"))]
  ],
  "layout: every file": [
    ["a file the layout does not name", change("notes.txt", "left behind\n")]
  ],
  "layout: every vector": [
    ["a table no case imports", change("tests/vectors/clean.js", SOUND["tests/vectors/ids.js"])],
    ["a table imported and not run",
      change("tests/harness/cases/vectors_base.qml", swap("    h.vectors(Ids, IdsVectors)\n", ""))]
  ],
  "layout: a harness root": [
    ["a harness root that imports by path",
      change("tests/harness/shell.qml", after("import Quickshell", "import \"../../lib/Const.js\" as Const"))]
  ],
  "layout: the mock": [
    ["a mock member the service lacks",
      change("tests/harness-ui/MockService.qml", after("property bool ready", "  property bool more: true"))],
    ["a service member the mock lacks",
      change("Service.qml", after("readonly property bool ready", "  readonly property int volume: 70"))]
  ],
  "style: var and function": [
    ["let", inLib("function f() {\n  let x = 1\n  return x\n}")],
    ["const", inLib("const X = 1")],
    ["an arrow function", inLib("var f = function(list) { return list.map(x => x) }")],
    ["a template string", inLib("var X = `a`")],
    ["a semicolon at the end of a line", inLib("var X = 1;")],
    ["a block comment", inLib("/* note */\nvar X = 1")],
    ["loose equality", inLib("function f(a) {\n  return a == 1\n}")],
    ["optional chaining", inView("  property var x: root?.parent")],
    ["a default parameter", inLib("function f(a = 1) {\n  return a\n}")]
  ],
  "style: nothing Qt": [
    ["replaceAll", inLib("function f(s) {\n  return s.replaceAll(\"a\", \"b\")\n}")],
    ["Array.prototype.at, in a harness case", inCase("  property var x: [1].at(0)")],
    ["lookbehind", inLib("var X = /(?<=a)b/")],
    ["a Unicode property class", inLib("var X = /\\p{L}/u")],
    ["the s flag", inLib("var X = /a.b/s")],
    ["lookbehind in a string", inLib("var X = new RegExp(\"(?<!a)b\")")]
  ],
  "style: a file with an inline": [
    ["an inline component without the pragma",
      change("core/ProcessRunner.qml", swap("pragma ComponentBehavior: Bound\n\n", ""))]
  ],
  "style: no tabs": [
    ["a tab", inLib("var X =\t1")],
    ["a bidi override in a string", inNodeTest("var x = \"" + HIDDEN_MARK + "\"")],
    ["a carriage return", change("README.md", swap("A plugin.\n", "A plugin.\r\n"))],
    ["a letter outside ASCII in a comment", inLib("// caf" + ACCENTED + "\nvar X = 1")],
    ["a letter outside ASCII in a plugin string", inLib("var X = \"caf" + ACCENTED + "\"")]
  ],
  "style: two-space": [
    ["a long line", inLib("var X = \"" + "x".repeat(MAX_COLUMNS) + "\"")],
    ["trailing blanks", inLib("var X = 1  ")],
    ["odd indentation", inLib("function f() {\n   return 1\n}")],
    ["a file without a final newline", change("tests/node/extra.test.js", NODE_HEAD + "var x = 1")]
  ],
  "style: every source": [
    ["a file that opens with code", change("tests/node/extra.test.js", "\"use strict\"\nvar x = 1\n")]
  ],
  "safety: the log": [
    ["console.log", inCore("  function f() { console.log(\"omajuke: x\") }")],
    ["a warning built from data", inCore("  function f(title) { console.warn(\"omajuke: \" + title) }")],
    ["a warning without the prefix", inLib("function f() {\n  console.warn(\"broken\")\n}")]
  ],
  "safety: no unbounded": [
    ["a StdioCollector", inCore("  property var out: StdioCollector {\n  }")],
    ["a FileView", inCore("  property var file: FileView {\n  }")],
    ["a line-mode SplitParser", change("core/ProcessRunner.qml", swap("        splitMarker: \"\"\n", ""))],
    ["a Process outside the runner", inCore("  Process {\n  }")],
    ["execDetached with text",
      change("core/ProcessRunner.qml", swap("{ command: spec.argv, clearEnvironment: true }", "\"sh x\""))],
    ["the kit's execDetached", inCore("  function f(argv) { Util.execDetached(argv) }")],
    ["eval", inLib("function f(text) {\n  return eval(text)\n}")],
    ["a component made from text", inCore("  function f(text) { return Qt.createQmlObject(text, root) }")],
    ["a repeating timer", inCore("  Timer {\n    repeat: true\n  }")],
    ["a timer in the view", inView("  Timer {\n  }")],
    ["a Loader source from data",
      change("BarWidget.qml", swap("source: root.panelSource", "source: root.page"))],
    ["a shell script in the plugin", inShell("helper.sh", "true")]
  ],
  "safety: every Text": [
    ["a Text without a format", change("ui/Thumb.qml", swap("    textFormat: Text.PlainText\n", ""))],
    ["a rich Text", change("ui/Thumb.qml", swap("Text.PlainText", "Text.RichText"))],
    ["a Label", inView("  Label {\n  }")],
    ["an attached ToolTip", inView("  ToolTip.visible: true")],
    ["a Controls delegate", inView("  ItemDelegate {\n  }")],
    ["Controls imported after the kit",
      change("ui/Thumb.qml", swap(KIT_LAST, "import qs.Commons\nimport qs.Ui\nimport QtQuick.Controls\n"))]
  ],
  "safety: one Image": [
    ["an Image fed from the service", change("ui/Thumb.qml", swap("Util.fileUrl(root.path)", "root.artUrl"))],
    ["an Image with an address",
      change("ui/Thumb.qml", swap("Util.fileUrl(root.path)", "\"https://i.ytimg.com/vi/x/a.jpg\""))],
    ["an Image without a size cap", change("ui/Thumb.qml", swap("    sourceSize.width: 128\n", ""))],
    ["a second Image",
      inView("  Image {\n    source: Util.fileUrl(root.path)\n    sourceSize.width: 1\n  }")],
    ["a source assigned from code", inView("  function f(url) { root.source = url }")]
  ],
  "safety: one IPC": [
    ["an undocumented IPC method", change("Service.qml", after("target: root.pluginId",
      "    function run(command: string): string {\n      return root._ipcRun(command)\n    }"))],
    ["a missing IPC method", change("Service.qml", swap("function status(", "function state("))],
    ["an IPC method that is not one call",
      change("Service.qml", swap("return root._ipcStop()", "return root.stop() ? \"ok\" : \"unhandled\""))],
    ["an IPC parameter that is not a string",
      change("Service.qml", swap("function play(text: string)", "function play(text: var)"))],
    ["another IPC target", change("Service.qml", swap("target: root.pluginId", "target: \"omajuke\""))],
    ["a handler in the panel", change("Panel.qml", after("manageIpc: false", "  IpcHandler {\n  }"))],
    ["a panel that manages IPC", change("Panel.qml", swap("  manageIpc: false\n", ""))]
  ],
  "safety: no path": [
    ["the Hyprland config", inLib("var X = \"/.config/hypr/bindings.lua\"")],
    ["a shared temp folder", inLib("var X = \"/tmp/omajuke\"")]
  ],
  "safety: the only addresses": [
    ["plain http", change("lib/Ids.js", swap("\"https://www.youtube.com/", "\"http://www.youtube.com/"))],
    ["another host", inLib("var X = \"https://stats.example/ping\"")],
    ["a look-alike host", inLib("var X = \"https://www.youtube.com.example/\"")],
    ["a pattern for another host", inLib("var X = /^https:\\/\\/media\\.example\\//")]
  ],
  "safety: the tool table": [
    ["the tool table assigned",
      change("Service.qml", after("function playPause", "    root.tools = { sh: \"/bin/sh\" }"))],
    ["one tool path assigned",
      change("core/ProcessRunner.qml", after("var tools = root.tools", "    tools.sh = spec.shell"))],
    ["tools from a setting", change("Service.qml", swap("tools: root.tools", "tools: root.settings.tools"))],
    ["tools starting as something else",
      change("Service.qml", swap("property var tools: Const.TOOLS", "property var tools: ({ sh: \"sh\" })"))],
    ["the panel source assigned",
      change("BarWidget.qml", after("id: panelLoader", "    onLoaded: root.panelSource = \"Other.qml\""))],
    ["another panel source",
      change("BarWidget.qml", swap("Qt.resolvedUrl(\"Panel.qml\")", "Qt.resolvedUrl(root.settings.panel)"))]
  ],
  "safety: the view reads": [
    ["a private member read by the view",
      change("BarWidget.qml", after("id: root", "  readonly property var parts: service._parts"))]
  ],
  "safety: no file writes": [
    ["a constant of a module replaced",
      change("Service.qml", after("id: root", "  function widen() {\n    Const.PLUGIN_ID = \"other\"\n  }"))],
    ["a member of a module's table replaced",
      change("core/ProcessRunner.qml", after("id: root", "  function sh() {\n    Const.TOOLS.sh = 1\n  }"))],
    ["a counter kept in a module",
      change("Service.qml", after("id: root", "  function count() {\n    Const.TOOLS.used++\n  }"))],
    ["a member of a module deleted",
      change("Service.qml", after("id: root", "  function drop() {\n    delete Const.TOOLS\n  }"))],
    ["a list of a module grown in place",
      change("Service.qml", after("id: root", "  function more() {\n    Const.TOOLS.list.push(\"x\")\n  }"))],
    ["a private name of a module read by a component",
      change("Service.qml", after("id: root", "  readonly property int cap: Const._CAP"))],
    ["a script that writes into the script it imports",
      change("lib/Ids.js", after("// Ids.", "Const.TOOLS[\"sh\"] = \"sh\""))],
    ["a private name of a module read by a script",
      change("lib/Ids.js", after("// Ids.", "var _CAP = Const._CAP"))]
  ],
  "safety: no component": [
    ["a property called state", inCore("  property string state: \"idle\"")],
    ["a function called update", inView("  function update() {\n  }")]
  ],
  "safety: every keyed": [
    ["a lookup nobody reviewed", inLib("function f(table, key) {\n  return table[key]\n}")],
    ["a reviewed lookup that is gone", change("lib/Ids.js", swap("table[key]", "\"\""))]
  ],
  "marketplace: no link": [
    ["a symbolic link", change("link.qml", { text: "", symlink: true })],
    ["an installer by name", change("tests/setup-env.js", "\"use strict\"\n// A helper.\n")],
    ["an agent file", change("AGENTS.md", "notes\n")],
    ["an agent file of another kind", change("CLA" + "UDE.md", "notes\n")],
    ["an agent's settings folder", change(".cla" + "ude/settings.json", "{}\n")],
    ["a compiled binary", change("tests/stubs/tool", String.fromCharCode(0x7f) + "ELF")],
    ["an executable in the plugin", change("Service.qml", { text: SOUND["Service.qml"], executable: true })],
    ["an oversized file", change("CHANGELOG.md", "x".repeat(MAX_FILE_BYTES + 1))]
  ],
  "marketplace: no phrase": [
    ["a package-manager command in a message", inLib("var X = \"Run: omarchy pkg add mpv\"")],
    ["a privileged command in the README", change("README.md", swap("A plugin.", "A plugin. Needs sudo."))]
  ],
  "marketplace: the README": [
    ["a missing README section", change("README.md", swap("## Removing\n", "## Uninstalling\n"))],
    ["a shell block outside its sections",
      change("README.md", swap("## Use\n\nWords.\n", "## Use\n\n```sh\nomarchy-shell toggle\n```\n"))],
    ["a second way to install",
      change("README.md", swap(INSTALL_LINE + "\n", INSTALL_LINE + "\ncp -r . ~/plugins\n"))]
  ],
  "marketplace: nothing points": [
    ["a pointer to working notes", inLib("// See design" + ".md for the reason.\nvar X = 1")],
    ["the working notes under the name they went by", inLib("// As the blue" + "print has it.\nvar X = 1")]
  ],
  "tests: a process": [
    ["a process ended by name", inShell("tests/stop.sh", BY_NAME[0] + " -f quickshell")],
    ["a signal from a harness case", inCase("  property var argv: [\"" + SIGNAL + "\", \"-9\", \"1\"]")],
    ["a PID signalled from node", inNodeTest("process." + SIGNAL + "(1234)")],
    ["a handle the file did not spawn",
      change("tests/node/sh.test.js", swap("child." + SIGNAL, "other." + SIGNAL))],
    ["a PID that ours() did not check", change("tests/harness.sh",
      swap("if p=$(ours \"$RUN/qs.pid\"); then", "p=$(cat \"$RUN/qs.pid\"); if true; then"))],
    ["another signal form", change("tests/harness.sh", swap(SHELL_FORM, SIGNAL + " -9 \"$p\""))],
    ["a launcher that goes on after an error", change("tests/harness.sh", swap("set -eu\n", ""))]
  ],
  "tests: no live": [
    ["the live display handed to a child",
      inShell("tests/run.sh", "env " + DISPLAY_NAME + "=wayland-1 true")],
    ["the session bus handed to a child", inNodeTest("var e = \"" + BUS_NAME + "=unix:path=/run/bus\"")],
    ["the live compositor read by a script", inShell("tests/run.sh", "echo \"$" + COMPOSITOR_NAME + "\"")],
    ["the live compositor read from node", inNodeTest("var his = process.env." + COMPOSITOR_NAME)],
    ["a compositor instance that could exist",
      change("tests/harness.sh", swap("HIS=oj-harness-dummy", "HIS=$1"))]
  ],
  "fixtures:": [
    ["an IP address in a fixture", change("tests/fixtures/video.json", swap("127.0.0.1", "192.0.2.7"))],
    ["a signed media address",
      change("tests/fixtures/video.json", swap("?id=synthetic", "?expire=1791300000&id=x"))],
    ["a home directory in a fixture",
      change("tests/fixtures/traces.json", "{ \"path\": \"/home/user/a.wav\" }\n")],
    ["a video id that looks real", change("tests/fixtures/video.json", swap("AAAAAAAAAAA", "a1B2c3D4e5F"))],
    ["a real bind description",
      change("tests/fixtures/binds.txt", "bind\n\tdescription: Open my banking app\n")]
  ]
}

function auditNamed(start) {
  var named = AUDITS.filter(function(audit) { return audit[0].indexOf(start) === 0 })
  assert.strictEqual(named.length, 1, "no single audit is called " + start)
  return named[0]
}

test("the miniature plugin passes every audit", function() {
  AUDITS.forEach(function(audit) {
    assert.deepStrictEqual(audit[1](miniature({}), true), [], audit[0])
  })
})

Object.keys(PLANTED).forEach(function(start) {
  PLANTED[start].forEach(function(row) {
    test("planted: " + row[0], function() {
      var audit = auditNamed(start)
      var problems = audit[1](miniature(row[1]), true)
      assert.ok(problems.length > 0, "\"" + audit[0] + "\" did not notice")
    })
  })
})

test("every audit is shown to bite", function() {
  var starts = Object.keys(PLANTED)
  AUDITS.forEach(function(audit) {
    var shown = starts.filter(function(start) { return audit[0].indexOf(start) === 0 })
    assert.strictEqual(shown.length, 1, audit[0])
  })
})
