import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Sh.js" as Sh

// The start-up preparation of core/PrivateFs.qml with the real shell and
// coreutils: what it refuses, what it creates and with which modes, what it
// wipes and what it leaves alone, how its tokens become properties, when it
// may run again, and the clean-up that empties the runtime directory.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property var fs: null
  property string probe: ""
  property var steps: []
  property int at: 0

  // mpv and yt-dlp only have to be executable files here.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.probe = h.repo + "/tests/stubs/probe.js"
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = root.mountFs(h.tools)
    if (root.runner === null || root.fs === null) { h.finish(); return }
    root.steps = [
      root.beforeAnything, root.linkedStateDir, root.firstRun, root.secondStart, root.missingTools,
      root.missingWrapper, root.cleanup
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function mountFs(tools) {
    return root.h.mount("core/PrivateFs.qml", { runner: root.runner, tools: tools })
  }

  function toolsWith(changes) {
    var tools = {}
    for (var name in root.h.tools) tools[name] = root.h.tools[name]
    for (var changed in changes) tools[changed] = changes[changed]
    return tools
  }

  // Runs prepare() on fs and calls then(ok) with what the signal said.
  function prepareThen(fs, then) {
    var handler = function(ok) {
      fs.prepared.disconnect(handler)
      then(ok)
    }
    fs.prepared.connect(handler)
    root.h.check(fs.prepare(), "prepare is accepted")
  }

  // then(lines): the output of a program, split into lines.
  function lines(argv, then) {
    root.h.exec(argv, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }))
    })
  }

  function beforeAnything() {
    var h = root.h
    var paths = root.fs.paths
    var runtimeDir = h.runDir + "/" + Const.DIR_NAME
    h.equal([paths.ok, paths.runtimeBase, paths.runtimeDir], [true, h.runDir, runtimeDir],
      "the runtime paths come from the session")
    h.equal(paths.stateDir, h.runDir + "/sbx/state/" + Const.DIR_NAME, "so does the state dir")
    h.equal([root.fs.status, root.fs.failCode], ["pending", ""], "nothing is known before the first run")
    var before = h.jobs().length
    root.fs.write(paths.stateFile, "early", function(result) {
      h.equal([result.ok, result.error], [false, "refused"], "no write before the directories are checked")
      h.equal(h.jobs().length, before, "and no job is started for it")
      root.next()
    })
  }

  // A state directory that is a link is refused, and nothing is created
  // behind it. Without a checked directory the clean-up removes nothing.
  function linkedStateDir() {
    var h = root.h
    var base = h.runDir + "/sbx/state"
    var target = h.runDir + "/sbx/elsewhere"
    var plant = "/usr/bin/mkdir -p \"$1\" \"$2\" && /usr/bin/ln -s \"$2\" \"$1/$3\""
    h.exec(["/usr/bin/sh", "-c", plant, "plant", base, target, Const.DIR_NAME], null, function(code) {
      h.equal(code, 0, "a link is planted where the state dir belongs")
      root.prepareThen(root.fs, function(ok) {
        h.equal([ok, root.fs.status, root.fs.failCode], [false, "failed", "E_RUNTIME_DIR"],
          "a linked dir is refused")
        root.lines(["/usr/bin/ls", "-A", target], function(behind) {
          h.equal(behind, [], "nothing was created behind the link")
          var watched = root.mountFs(root.toolsWith({ rm: root.probe }))
          var starts = h.log("probe").length
          watched.cleanupDetached()
          root.fs.cleanupDetached()
          h.after(400, function() {
            h.equal(h.log("probe").length, starts, "no clean-up without a checked directory")
            watched.destroy()
            h.exec(["/usr/bin/rm", "--", base + "/" + Const.DIR_NAME], null, function() { root.next() })
          })
        })
      })
    })
  }

  function firstRun() {
    var h = root.h
    var fs = root.fs
    var paths = fs.paths
    var before = h.jobs().length
    var emitted = []
    fs.prepared.connect(function(ok) { emitted.push(ok) })
    h.check(fs.prepare(), "after a failure prepare may run again")
    h.check(fs.prepare() === false, "but not while it is running")
    h.equal([fs.status, fs.failCode], ["pending", "E_RUNTIME_DIR"], "the old failure stays up while it runs")
    h.waitFor(function() { return emitted.length > 0 }, 5000, function(done) {
      h.check(done, "prepared is emitted")
      h.equal([emitted, fs.status, fs.failCode], [[true], "ready", ""], "ready")
      h.equal(fs.stateFilePresent, false, "there is no state file yet")
      var command = [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
        h.tools.sh, "-c", Sh.PREPARE, "omajuke-prepare",
        paths.runtimeDir, paths.stateDir, Const.MPRIS_SO, paths.runtimeBase, h.tools.mpv, h.tools.ytdlp
      ]
      h.equal(h.jobs().slice(before), [{ tag: "prepare", command: command }], "one job, the constant command")
      h.check(fs.prepare() === false, "a second prepare is refused once ready")

      var dirs = [
        paths.runtimeDir, paths.infoDir, paths.thumbsDir, paths.jarDir, paths.signinDir, paths.ytCacheDir,
        paths.denoDir, paths.stateDir
      ]
      root.lines(["/usr/bin/stat", "-c", "%a %F"].concat(dirs), function(modes) {
        h.equal(modes.length, dirs.length, "every directory exists")
        h.equal(modes.filter(function(mode) { return mode !== "700 directory" }), [], "each with mode 700")
        h.equal(h.jobs().length, before + 1, "the refused prepare started nothing")
        h.exec(["/usr/bin/test", "-r", Const.MPRIS_SO], null, function(code) {
          h.equal(fs.mprisAvailable, code === 0, "mprisAvailable says whether the script is readable")
          root.next()
        })
      })
    })
  }

  // The next shell start: what the last one left in the runtime directory
  // is wiped, the state file is found and made private, and a file the user
  // keeps beside it survives.
  function secondStart() {
    var h = root.h
    var paths = root.fs.paths
    h.writeFile(paths.infoDir + "/1.json", "{}")
    h.writeFile(paths.thumbsDir + "/1.jpg", "x")
    h.writeFile(paths.jarDir + "/1.txt", "x")
    h.writeFile(paths.sock, "a stale socket file")
    h.writeFile(paths.ytCacheDir + "/kept", "x")
    h.writeFile(paths.stateFile, "{}\n")
    h.writeFile(paths.stateDir + "/.state.json.AbC123", "left by a write that never finished")
    h.writeFile(paths.stateDir + "/state.json.backup", "the user's own copy")
    var again = root.mountFs(h.tools)
    h.exec(["/usr/bin/chmod", "644", paths.stateFile], null, function() {
      root.prepareThen(again, function(ok) {
        h.equal([ok, again.status, again.stateFilePresent], [true, "ready", true], "the state file is found")
        var find = ["/usr/bin/find", paths.runtimeDir, paths.stateDir, "-mindepth", "1", "-printf", "%y %P\n"]
        root.lines(find, function(found) {
          var want = [
            "d deno", "d info", "d jar", "d signin", "d thumbs", "d ytcache", "f state.json",
            "f state.json.backup", "f ytcache/kept"
          ]
          h.equal(found.sort(), want, "wiped: info, thumbs, jar, the socket, the dotted leftover")
          root.lines(["/usr/bin/stat", "-c", "%a", paths.stateFile], function(mode) {
            h.equal(mode, ["600"], "the state file was made private")
            again.destroy()
            root.next()
          })
        })
      })
    })
  }

  function missingTools() {
    var h = root.h
    var absent = "/nonexistent/oj-tool"
    var noMpv = root.mountFs(root.toolsWith({ mpv: absent }))
    root.prepareThen(noMpv, function(ok) {
      h.equal([ok, noMpv.status, noMpv.failCode], [false, "failed", "E_MPV_MISSING"], "no mpv, no mpv token")
      noMpv.read(noMpv.paths.stateFile, 64, function(result) {
        h.equal(result.error, "refused", "nothing is read while the preparation has failed")
        // The tool is installed meanwhile: the same object becomes ready.
        noMpv.tools = h.tools
        root.prepareThen(noMpv, function(fixed) {
          h.equal([fixed, noMpv.status, noMpv.failCode], [true, "ready", ""], "ready once mpv is there")
          noMpv.destroy()
          var noYt = root.mountFs(root.toolsWith({ ytdlp: absent }))
          root.prepareThen(noYt, function() {
            h.equal([noYt.status, noYt.failCode], ["failed", "E_YTDLP_MISSING"], "no yt-dlp")
            noYt.destroy()
            var neither = root.mountFs(root.toolsWith({ mpv: absent, ytdlp: absent }))
            root.prepareThen(neither, function() {
              h.equal(neither.failCode, "E_MPV_MISSING", "both missing: mpv is named first")
              neither.destroy()
              root.next()
            })
          })
        })
      })
    })
  }

  function missingWrapper() {
    var h = root.h
    var noSh = root.mountFs(root.toolsWith({ sh: "/nonexistent/sh" }))
    root.prepareThen(noSh, function() {
      h.equal([noSh.status, noSh.failCode], ["failed", "E_TOOLS_MISSING"], "no shell")
      noSh.destroy()
      var tools = root.toolsWith({ setpriv: "/nonexistent/setpriv" })
      var bareRunner = h.mount("core/ProcessRunner.qml", { tools: tools })
      var bare = h.mount("core/PrivateFs.qml", { runner: bareRunner, tools: tools })
      root.prepareThen(bare, function() {
        h.equal([bare.status, bare.failCode], ["failed", "E_TOOLS_MISSING"], "no setpriv")
        var unwired = h.mount("core/PrivateFs.qml", { tools: h.tools })
        root.prepareThen(unwired, function() {
          h.equal(unwired.failCode, "E_TOOLS_MISSING", "without a runner nothing can be prepared")
          bare.destroy()
          bareRunner.destroy()
          unwired.destroy()
          root.next()
        })
      })
    })
  }

  // The clean-up of a service that is being destroyed: its command and its
  // environment (seen by a probe in place of rm), then the real thing.
  function cleanup() {
    var h = root.h
    var paths = root.fs.paths
    var watched = root.mountFs(root.toolsWith({ rm: root.probe }))
    root.prepareThen(watched, function(ok) {
      h.check(ok, "a third start is ready")
      var starts = h.log("probe").length
      watched.cleanupDetached()
      h.waitFor(function() { return h.log("probe").length > starts }, 5000, function(ran) {
        h.check(ran, "the clean-up runs detached")
        var record = h.log("probe")[starts]
        var seven = [
          paths.sock, paths.infoDir, paths.thumbsDir, paths.jarDir, paths.signinDir, paths.ytCacheDir,
          paths.denoDir
        ]
        h.equal(record ? record.argv : null, ["-rf", "--"].concat(seven), "exactly the seven runtime paths")
        h.equal(record ? record.env : null, ["HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
          "in the environment of a local job")
        watched.destroy()
        h.writeFile(paths.infoDir + "/7.json", "{}")
        h.writeFile(paths.thumbsDir + "/7.jpg", "x")
        h.writeFile(paths.sock, "a socket file")
        h.writeFile(paths.denoDir + "/cache", "x")
        root.fs.cleanupDetached()
        root.untilEmpty(paths.runtimeDir, Date.now() + 5000, function(left) {
          h.equal(left, [], "afterwards the runtime directory is empty")
          root.lines(["/usr/bin/ls", "-A", paths.stateDir], function(kept) {
            h.equal(kept.sort(), ["state.json", "state.json.backup"], "and the state directory is untouched")
            root.next()
          })
        })
      })
    })
  }

  // Lists dir every 100 ms until it is empty or the time is up, then calls
  // then(names) with what is left.
  function untilEmpty(dir, until, then) {
    root.lines(["/usr/bin/ls", "-A", dir], function(names) {
      if (names.length === 0 || Date.now() >= until) { then(names); return }
      root.h.after(100, function() { root.untilEmpty(dir, until, then) })
    })
  }
}
