"use strict"
// tests/lint-qml.js <file written by qmllint --json>
// Decides which of qmllint's findings fail the gate. qmllint itself exits 0
// on most real mistakes and reports a good deal of noise for duck-typed QML,
// so tests/check.sh lets it write everything to a file and this filter
// separates the two. Exit status: 0 clean, 1 findings, 2 unusable input.
var fs = require("fs")

// Always a mistake.
var FAIL = [
  "syntax", "import", "unresolved-type", "missing-type", "inheritance-cycle", "required",
  "duplicate-property-binding", "read-only-property", "incompatible-type", "property-override"
]

// A mistake when qmllint names a concrete type. Reported "on type QObject"
// it only means a member was reached through a `var` or an injected object,
// which is how the host hands a plugin its bar and its service.
var FAIL_UNLESS_QOBJECT = ["missing-property", "unqualified"]

// qmllint reports the first for every Process.onExited handler, whatever
// the handler does. The second is an informational remark.
var IGNORE = ["signal-handler-parameters", "unused-imports"]

function fail(message) {
  console.error("lint-qml: " + message)
  process.exit(2)
}

function read(file) {
  if (!file) fail("usage: node tests/lint-qml.js <qmllint json file>")
  var report
  try {
    report = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (error) {
    fail("cannot read " + file + ": " + error.message)
  }
  if (!report || !Array.isArray(report.files) || report.files.length === 0) fail("no linted files in " + file)
  return report
}

// "fail", "ignore", or "note" for a category the gate has no rule for:
// shown, so that someone can decide about it, but not failing.
function verdict(warning) {
  var id = String(warning.id || "")
  if (FAIL.indexOf(id) !== -1) return "fail"
  if (FAIL_UNLESS_QOBJECT.indexOf(id) !== -1) {
    return /on type "QObject"$/.test(String(warning.message || "")) ? "ignore" : "fail"
  }
  return IGNORE.indexOf(id) !== -1 ? "ignore" : "note"
}

function describe(file, warning) {
  var where = file.filename
  if (warning.line) where += ":" + warning.line + ":" + (warning.column || 0)
  return where + ": [" + warning.id + "] " + warning.message
}

var report = read(process.argv[2])
var counts = { fail: 0, ignore: 0, note: 0 }
report.files.forEach(function(file) {
  var warnings = Array.isArray(file.warnings) ? file.warnings : []
  warnings.forEach(function(warning) {
    var kind = verdict(warning)
    counts[kind]++
    if (kind === "fail") console.error(describe(file, warning))
    if (kind === "note") console.error("note: " + describe(file, warning))
  })
})

var summary = report.files.length + " files, " + counts.fail + " failing, " + counts.note + " noted, "
  + counts.ignore + " ignored"
if (counts.fail > 0) {
  console.error("lint-qml: FAIL (" + summary + ")")
  process.exit(1)
}
console.log("lint-qml: ok (" + summary + ")")
