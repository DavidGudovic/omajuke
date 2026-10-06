import QtQuick
import "../../../lib/Paths.js" as Paths
import "../../../lib/Sh.js" as Sh

// The file operations of core/PrivateFs.qml with the real shell and
// coreutils: a private, atomic write; a read that is capped; removal; and
// the refusal, without any job, of every path that is not exactly a file
// the plugin creates.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property var steps: []
  property int at: 0

  // mpv and yt-dlp only have to be executable files for prepare to succeed.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    if (root.runner === null || root.fs === null) { h.finish(); return }
    root.steps = [
      root.writeState, root.replaceState, root.writeInfo, root.refusals, root.readCapped, root.removeFiles,
      root.purge
    ]
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (ok) root.next()
      else h.finish()
    })
    root.fs.prepare()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // then(lines): the output of a program, split into lines.
  function lines(argv, then) {
    root.h.exec(argv, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }))
    })
  }

  // then(listing): "<mode> <name>" for everything directly inside dir.
  function listing(dir, then) {
    var find = ["/usr/bin/find", dir, "-mindepth", "1", "-maxdepth", "1", "-printf", "%m %f\n"]
    root.lines(find, function(found) { then(found.sort()) })
  }

  function writeState() {
    var h = root.h
    var paths = root.fs.paths
    var text = "{\"marker\":\"oj-written-text\"}\n"
    var before = h.jobs().length
    var returned = false
    root.fs.write(paths.stateFile, text, function(result) {
      h.check(returned, "write: done is not called before write() returns")
      h.equal([result.ok, result.error, result.stdout], [true, "", ""], "write: the result")
      h.equal(h.readFile(paths.stateFile), text, "write: the content")
      root.listing(paths.stateDir, function(found) {
        h.equal(found, ["600 state.json"], "write: mode 600, and no temporary file is left")
        var command = [
          h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
          h.tools.sh, "-c", Sh.PRIVATE_WRITE, "omajuke-write", paths.stateFile
        ]
        h.equal(h.jobs().slice(before), [{ tag: "write", command: command }], "write: one constant job")
        h.check(JSON.stringify(h.jobs()).indexOf("oj-written-text") === -1, "write: text in no command")
        root.next()
      })
    })
    returned = true
  }

  function replaceState() {
    var h = root.h
    var paths = root.fs.paths
    // A longer and then a shorter text: a replaced file has no remains of
    // the one before.
    var longText = new Array(5001).join("0123456789abcdef") + "\n"
    root.fs.write(paths.stateFile, longText, function(first) {
      h.check(first.ok && h.readFile(paths.stateFile) === longText, "replace: the longer text is there")
      root.fs.write(paths.stateFile, "short\n", function(second) {
        h.equal([second.ok, h.readFile(paths.stateFile)], [true, "short\n"], "replace: nothing of it remains")
        root.fs.write(paths.stateFile, "", function(empty) {
          h.equal([empty.ok, h.readFile(paths.stateFile)], [true, ""], "replace: an empty text is written")
          root.listing(paths.stateDir, function(found) {
            h.equal(found, ["600 state.json"], "replace: still one private file")
            root.next()
          })
        })
      })
    })
  }

  function writeInfo() {
    var h = root.h
    var paths = root.fs.paths
    var first = Paths.infoFile(paths, 1)
    // One mebibyte, the size of a large answer from yt-dlp.
    var rows = []
    for (var i = 0; i < 65536; i++) rows.push(("000000000000000" + i).slice(-15))
    var big = rows.join("\n") + "\n"
    root.fs.write(first, big, function(result) {
      h.check(result.ok, "info file: written")
      h.check(h.readFile(first) === big, "info file: one mebibyte, unchanged")
      root.fs.write(Paths.infoFile(paths, 2), "{}", function() {
        root.listing(paths.infoDir, function(found) {
          h.equal(found, ["600 1.json", "600 2.json"], "info files: named by counter, mode 600")
          root.next()
        })
      })
    })
  }

  function refusals() {
    var h = root.h
    var paths = root.fs.paths
    var before = h.jobs().length
    var answers = []
    var note = function(result) { answers.push(result.ok + "/" + result.error + "/" + result.stdout) }
    var foreign = [
      paths.runtimeDir + "/x.json", paths.stateFile + ".bak", paths.stateDir + "/other.json",
      paths.infoDir + "/a.json", paths.infoDir + "/1.json/", paths.infoDir + "/../1.json",
      paths.infoDir + "/1.json\n", paths.infoDir + "//1.json", paths.infoDir + "/12345678901.json",
      paths.sock, paths.jarFile, paths.infoDir + "/", "/etc/hostname", "state.json", "", null, undefined, 7
    ]
    var returned = false
    for (var i = 0; i < foreign.length; i++) {
      root.fs.write(foreign[i], "x", function(result) {
        h.check(returned, "refusal: done is not called before the request returns")
        note(result)
      })
      root.fs.read(foreign[i], 64, note)
      root.fs.remove([foreign[i]], note)
      root.fs.remove([Paths.infoFile(paths, 1), foreign[i]], note)
      root.fs.purgeDir(foreign[i], note)
    }
    returned = true
    var asked = foreign.length * 5
    // Ours, but not for this operation or not in this form.
    root.fs.write(Paths.thumbFile(paths, 1), "x", note)
    root.fs.write(paths.stateFile, 5, note)
    root.fs.write(paths.stateFile, null, note)
    root.fs.read(paths.stateFile, 0, note)
    root.fs.read(paths.stateFile, 1.5, note)
    root.fs.read(paths.stateFile, "64", note)
    root.fs.remove(paths.stateFile, note)
    root.fs.remove(null, note)
    root.fs.purgeDir(paths.runtimeDir, note)
    root.fs.purgeDir(paths.stateDir, note)
    root.fs.purgeDir(paths.ytCacheDir, note)
    asked += 11
    root.fs.write(paths.runtimeDir + "/x.json", "x")
    h.waitFor(function() { return answers.length === asked }, 3000, function(all) {
      h.check(all, "refusal: every request is answered")
      h.equal(answers.filter(function(a) { return a !== "false/refused/" }), [], "refusal: each with refused")
      h.equal(h.jobs().length, before, "refusal: no job was started")
      root.listing(paths.infoDir, function(found) {
        h.equal(found, ["600 1.json", "600 2.json"], "refusal: a list with one foreign path removes nothing")
        root.next()
      })
    })
  }

  function readCapped() {
    var h = root.h
    var paths = root.fs.paths
    var fifty = new Array(51).join("r")
    var before = h.jobs().length
    root.fs.write(paths.stateFile, fifty, function() {
      root.fs.read(paths.stateFile, 50, function(exact) {
        h.equal([exact.ok, exact.stdout], [true, fifty], "read: a file of exactly the cap is read whole")
        var command = [
          h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
          h.tools.head, "-c", "51", "--", paths.stateFile
        ]
        h.equal(h.jobs()[before + 1], { tag: "read", command: command }, "read: the constant command")
        root.fs.read(paths.stateFile, 49, function(over) {
          h.equal([over.ok, over.error, over.stdout], [false, "overflow", ""], "read: one byte too many")
          root.fs.read(Paths.infoFile(paths, 999), 64, function(absent) {
            h.equal([absent.ok, absent.error, absent.stdout], [false, "exit", ""], "read: a missing file")
            root.next()
          })
        })
      })
    })
  }

  function removeFiles() {
    var h = root.h
    var paths = root.fs.paths
    var before = h.jobs().length
    var doomed = [Paths.infoFile(paths, 1), Paths.infoFile(paths, 2), Paths.infoFile(paths, 3)]
    root.fs.remove(doomed, function(result) {
      h.check(result.ok, "remove: files of ours, one of them already gone")
      var command = [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5", h.tools.rm, "-f", "--"
      ]
      h.equal(h.jobs()[before], { tag: "remove", command: command.concat(doomed) }, "remove: the command")
      root.listing(paths.infoDir, function(found) {
        h.equal(found, [], "remove: they are gone")
        var jobs = h.jobs().length
        root.fs.remove([], function(nothing) {
          h.equal([nothing.ok, nothing.error, h.jobs().length], [true, "", jobs], "remove: an empty list")
          root.fs.remove([paths.stateFile])
          h.waitFor(function() { return h.jobs().length === jobs + 1 && root.runner.active === 0 }, 3000,
            function(ran) {
              h.check(ran, "remove: works without a callback")
              root.listing(paths.stateDir, function(left) {
                h.equal(left, [], "remove: the state file is gone")
                root.next()
              })
            })
        })
      })
    })
  }

  function purge() {
    var h = root.h
    var paths = root.fs.paths
    h.writeFile(paths.thumbsDir + "/1.jpg", "x")
    h.writeFile(paths.thumbsDir + "/stray", "x")
    h.writeFile(paths.infoDir + "/5.json", "{}")
    var before = h.jobs().length
    h.exec(["/usr/bin/mkdir", paths.thumbsDir + "/sub"], null, function() {
      h.writeFile(paths.thumbsDir + "/sub/deep", "x")
      root.fs.purgeDir(paths.thumbsDir, function(result) {
        h.check(result.ok, "purge: thumbs")
        var command = [
          h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
          h.tools.find, paths.thumbsDir, "-mindepth", "1", "-maxdepth", "1", "-type", "f", "-delete"
        ]
        h.equal(h.jobs()[before], { tag: "purge", command: command }, "purge: the command")
        root.lines(["/usr/bin/find", paths.runtimeDir, "-mindepth", "2", "-printf", "%P\n"], function(found) {
          h.equal(found.sort(), ["info/5.json", "thumbs/sub", "thumbs/sub/deep"],
            "purge: the files of that directory only, nothing below, no other directory")
          root.fs.purgeDir(paths.infoDir, function() {
            root.fs.purgeDir(paths.jarDir, function(jar) {
              h.check(jar.ok, "purge: an empty directory is fine")
              root.listing(paths.infoDir, function(left) {
                h.equal(left, [], "purge: info")
                root.next()
              })
            })
          })
        })
      })
    })
  }
}
