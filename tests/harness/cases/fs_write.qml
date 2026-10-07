import QtQuick
import "../../../lib/Paths.js" as Paths
import "../../../lib/Sh.js" as Sh

// The file operations of core/PrivateFs.qml with the real shell and
// coreutils: a private, atomic write; a read that is capped; removal; the
// refusal, without any job, of every path that is not exactly a file the
// plugin creates or not one that operation is meant for; and the files of
// signing in, from the data directory to a saved login and its removal.
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
      root.purge, root.signInDirs, root.exportLogin, root.useLogin, root.forgetLogin
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
      paths.sock, paths.infoDir + "/", "/etc/hostname", "state.json", "", null, undefined, 7,
      paths.jarFile + ".bak", paths.dataDir + "/other.txt", paths.jarDir + "/a.txt", paths.jarDir + "/1.json",
      paths.signinDir + "/1/profile", paths.signinDir + "/1/export.txt", paths.signinDir + "/a"
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
      root.fs.removeTree(foreign[i], note)
    }
    returned = true
    var asked = foreign.length * 6
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
    // The saved login can be removed and nothing else: it is never read
    // back and never written as text. Its copies likewise.
    var attempt = Paths.signinAttemptDir(paths, 1)
    var guarded = [paths.jarFile, Paths.jarCopyFile(paths, 1), attempt]
    for (var g = 0; g < guarded.length; g++) {
      root.fs.write(guarded[g], "x", note)
      root.fs.read(guarded[g], 64, note)
      root.fs.purgeDir(guarded[g], note)
    }
    asked += 9
    // A sign-in attempt is a directory: it goes whole or not at all, and
    // nothing else goes that way.
    root.fs.remove([attempt], note)
    root.fs.remove([paths.jarFile, attempt], note)
    var trees = [
      paths.signinDir, paths.runtimeDir, paths.runtimeBase, paths.infoDir, paths.jarDir, paths.dataDir,
      paths.stateDir, paths.jarFile, paths.stateFile, Paths.infoFile(paths, 1), Paths.jarCopyFile(paths, 1),
      attempt + "/", attempt + "/..", "/"
    ]
    for (var t = 0; t < trees.length; t++) root.fs.removeTree(trees[t], note)
    root.fs.purgeDir(paths.signinDir, note)
    root.fs.purgeDir(paths.dataDir, note)
    asked += 4 + trees.length
    // The operations of signing in take a counter and a name from a list.
    root.fs.copyJar(0, note)
    root.fs.copyJar("1", note)
    root.fs.copyJar(null, note)
    root.fs.makeSigninDirs(0, "chromium", "", note)
    root.fs.makeSigninDirs("1", "chromium", "", note)
    root.fs.makeSigninDirs(1, "opera", "", note)
    root.fs.makeSigninDirs(1, "constructor", "", note)
    root.fs.makeSigninDirs(1, "firefox", "", note)
    root.fs.makeSigninDirs(1, "firefox", null, note)
    var started = [
      root.fs.exportCookies("chrome:/home/user/.config/chromium", 1, note),
      root.fs.exportCookies("chrome+gnomekeyring", 1, note), root.fs.exportCookies("", 1, note),
      root.fs.exportCookies("safari", 1, note), root.fs.exportCookies(["chrome"], 1, note),
      root.fs.exportCookies("chrome", 0, note), root.fs.exportCookies("chrome", "1", note)
    ]
    h.equal(started, [0, 0, 0, 0, 0, 0, 0], "refusal: an export that is refused has no job to cancel")
    asked += 9 + started.length
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

  // ---- The files of signing in ----

  // then(listing): "<mode> <path>" for everything below dir.
  function tree(dir, then) {
    root.lines(["/usr/bin/find", dir, "-mindepth", "1", "-printf", "%m %P\n"], function(found) {
      then(found.sort())
    })
  }

  function signInDirs() {
    var h = root.h
    var paths = root.fs.paths
    var before = h.jobs().length
    h.check(root.fs.jarPresent === false, "data: no login is assumed before anyone looked")
    root.fs.prepareData(function(first) {
      h.equal([first.ok, first.stdout, root.fs.jarPresent], [true, "ok\n", false], "data: prepared")
      var wrapper = [h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5"]
      var command = [h.tools.sh, "-c", Sh.PREPARE_DATA, "omajuke-prepare-data", paths.dataDir, paths.jarFile]
      h.equal(h.jobs()[before], { tag: "prepare-data", command: wrapper.concat(command) }, "data: command")
      root.lines(["/usr/bin/stat", "-c", "%a", paths.dataDir], function(mode) {
        h.equal(mode, ["700"], "data: the directory is private")
        root.fs.makeSigninDirs(1, "firefox", "// preferences\n", function(made) {
          h.check(made.ok, "attempt: made")
          root.tree(paths.signinDir, function(found) {
            h.equal(found, ["600 1/profile/user.js", "700 1", "700 1/config", "700 1/profile"],
              "attempt: a private profile with its preferences, and an empty configuration directory")
            var profile = Paths.signinAttemptDir(paths, 1) + "/profile"
            h.equal(h.readFile(profile + "/user.js"), "// preferences\n", "attempt: the preferences text")
            root.fs.makeSigninDirs(1, "chromium", "", function(again) {
              h.equal([again.ok, again.exitCode], [false, 4], "attempt: never on a directory that is there")
              root.fs.makeSigninDirs(2, "chromium", "ignored", function(second) {
                h.check(second.ok, "attempt: a second one beside it")
                root.tree(paths.signinDir + "/2", function(inside) {
                  h.equal(inside, ["700 config", "700 profile"], "attempt: no preferences file for chromium")
                  root.next()
                })
              })
            })
          })
        })
      })
    })
  }

  function exportLogin() {
    var h = root.h
    var paths = root.fs.paths
    var attempt = Paths.signinAttemptDir(paths, 1)
    var before = h.jobs().length
    var at = h.log("probe").length
    var id = root.fs.exportCookies("chrome", 1, function(result) {
      h.equal([result.ok, result.stdout, result.stderr], [true, "ok\n", ""], "export: one word")
      var command = [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "60",
        h.tools.sh, "-c", Sh.UMASK_EXEC, "omajuke",
        h.tools.sh, "-c", Sh.COOKIE_EXPORT, "omajuke-export", "chrome", attempt + "/profile", attempt,
        paths.jarFile, h.tools.ytdlp
      ]
      h.equal(h.jobs()[before], { tag: "cookie-export", command: command }, "export: one constant job")
      h.check(JSON.stringify(h.jobs()).indexOf("invented") === -1, "export: no cookie in any command")
      var record = h.log("probe")[at]
      h.equal(record ? record.argv : null, [
        "--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--no-remote-components",
        "--cookies-from-browser", "chrome+basictext:" + attempt + "/profile",
        "--cookies", attempt + "/export.txt"
      ], "export: the tool reads the attempt's own profile, offline")
      // The shell that runs the export adds three names of its own.
      var given = (record ? record.env : []).filter(function(name) {
        return ["PWD", "SHLVL", "_"].indexOf(name) === -1
      })
      h.equal(given, ["HOME", "LANG", "PATH", "TMPDIR", "XDG_RUNTIME_DIR"],
        "export: the tool gets the local environment and a temporary directory inside the attempt")
      root.listing(paths.dataDir, function(found) {
        h.equal(found, ["600 cookies.txt"], "export: a private login file, and no temporary file")
        var rows = h.readFile(paths.jarFile).split("\n")
        h.equal(rows.slice(0, 2), ["# Netscape HTTP Cookie File", ""], "export: the file's own header")
        var kept = rows.slice(2).filter(function(line) { return line !== "" })
        h.equal(kept.map(function(line) { return line.split("\t")[0] + " " + line.split("\t")[5] }),
          ["#HttpOnly_.youtube.com LOGIN_INFO", ".youtube.com SAPISID"], "export: YouTube's rows only")
        root.tree(paths.signinDir, function(left) {
          h.equal(left, ["700 2", "700 2/config", "700 2/profile"],
            "export: the attempt's directory is gone, the other attempt is untouched")
          root.fs.prepareData(function(second) {
            h.equal([second.stdout, root.fs.jarPresent], ["jar\nok\n", true], "data: the login is found")
            root.next()
          })
        })
      })
    })
    h.check(id > 0, "export: the job's id is returned, to cancel it by")
  }

  function useLogin() {
    var h = root.h
    var paths = root.fs.paths
    var copy = Paths.jarCopyFile(paths, 7)
    var before = h.jobs().length
    root.fs.copyJar(7, function(result) {
      h.check(result.ok, "copy: made")
      var command = [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
        h.tools.sh, "-c", Sh.UMASK_EXEC, "omajuke", h.tools.cp, "--", paths.jarFile, copy
      ]
      h.equal(h.jobs()[before], { tag: "jar-copy", command: command }, "copy: the command, under the umask")
      root.listing(paths.jarDir, function(found) {
        h.equal(found, ["600 7.txt"], "copy: named by counter, private")
        h.check(h.readFile(copy) === h.readFile(paths.jarFile), "copy: the same rows")
        root.fs.remove([copy], function(removed) {
          h.check(removed.ok, "copy: removed after use")
          root.listing(paths.jarDir, function(left) {
            h.equal(left, [], "copy: gone")
            root.next()
          })
        })
      })
    })
  }

  function forgetLogin() {
    var h = root.h
    var paths = root.fs.paths
    var second = Paths.signinAttemptDir(paths, 2)
    var before = h.jobs().length
    root.fs.removeTree(second, function(result) {
      h.check(result.ok, "tree: an attempt directory is removed whole")
      var command = [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
        h.tools.rm, "-rf", "--", second
      ]
      h.equal(h.jobs()[before], { tag: "remove-tree", command: command }, "tree: the command")
      root.fs.removeTree(second, function(again) {
        h.check(again.ok, "tree: one that is already gone is no error")
        root.tree(paths.signinDir, function(left) {
          h.equal(left, [], "tree: nothing is left of any attempt")
          root.fs.remove([paths.jarFile], function(removed) {
            h.check(removed.ok, "sign out: the login is removed")
            root.fs.prepareData(function(third) {
              h.equal([third.stdout, root.fs.jarPresent], ["ok\n", false], "sign out: and no longer found")
              root.listing(paths.dataDir, function(found) {
                h.equal(found, [], "sign out: the data directory is empty")
                root.next()
              })
            })
          })
        })
      })
    })
  }
}
