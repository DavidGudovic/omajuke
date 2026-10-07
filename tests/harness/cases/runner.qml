import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Env.js" as Env
import "../../../lib/Sh.js" as Sh

// core/ProcessRunner.qml against the probe stub: the result of every way a
// job can end, the order of events around cancelling, the cap on running
// children, the environment a child really gets, and that no child is left
// behind, whether it ends by itself, is stopped, or loses its runner.
QtObject {
  id: root

  property var h: null
  property var runner: null
  property string probe: ""
  property var steps: []
  property int at: 0

  function run(h) {
    root.h = h
    root.probe = h.repo + "/tests/stubs/probe.js"
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    if (root.runner === null) { h.finish(); return }
    h.equal(root.runner.maxActive, Const.LIMITS.jobs, "maxActive is the constant")
    root.steps = [
      root.echo, root.bigEcho, root.exitCodes, root.missingTool, root.missingWrapper, root.malformed,
      root.environment, root.privateFiles, root.overflow, root.deadline, root.cancelled,
      root.deafToTermCancelled, root.deafToTermDeadline, root.lastResort, root.grandchild, root.queueing,
      root.cancelWaiting, root.brokenCallback, root.orphaned
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // A job on the probe with the usual bounds; extra overrides or adds.
  function spec(tag, args, extra, done) {
    var s = {
      tag: tag, argv: [root.probe].concat(args), timeoutSec: 5, maxBytes: 4096, env: Env.local(), done: done
    }
    for (var key in extra) s[key] = extra[key]
    return s
  }

  // Calls then() once every recorded child is gone; fails label otherwise.
  function gone(label, then) {
    root.h.alive(function(names) {
      root.h.equal(names, [], label)
      then()
    })
  }

  // The number of starts the probe has recorded.
  function starts() {
    return root.h.log("probe").length
  }

  function echo() {
    var h = root.h
    var returned = false
    var id = root.runner.run(root.spec("echo", ["echo"], { stdin: "hello\n" }, function(result) {
      h.check(returned, "done is not called before run() returns")
      h.equal([result.ok, result.error, result.exitCode, result.stdout, result.stderr],
        [true, "", 0, "hello\n", ""], "echo: the result")
      h.check(result.durationMs >= 0 && result.durationMs < 5000, "echo: a plausible duration")
      h.equal(root.runner.active, 0, "echo: the job left the table before done")
      var record = h.log("probe")[0]
      h.equal(record.argv, ["echo"], "echo: the tool sees its own arguments only")
      h.equal(record.stdin, "hello\n", "echo: stdin arrived and was closed")
      var wrapped = [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5", root.probe, "echo"
      ]
      h.equal(h.jobs(), [{ tag: "echo", command: wrapped }], "jobStarted carries the wrapped command")
      root.next()
    }))
    returned = true
    h.check(id > 0, "run returns a positive id")
    h.equal(root.runner.active, 1, "the job counts as active at once")
  }

  function bigEcho() {
    var h = root.h
    // One mebibyte that is different everywhere, so lost, repeated or
    // reordered pieces cannot go unnoticed.
    var lines = []
    for (var i = 0; i < 65536; i++) lines.push(("000000000000000" + i).slice(-15))
    var text = lines.join("\n") + "\n"
    h.equal(text.length, 1048576, "1 MiB: the payload")
    root.runner.run(root.spec("big", ["echo"], { stdin: text, maxBytes: 2097152 }, function(result) {
      h.equal([result.ok, result.stdout.length], [true, 1048576], "1 MiB: all of it came back")
      h.check(result.stdout === text, "1 MiB: unchanged")
      root.runner.run(root.spec("empty", ["echo"], { stdin: "" }, function(empty) {
        h.equal([empty.ok, empty.stdout], [true, ""], "an empty stdin is still closed")
        root.next()
      }))
    }))
  }

  function exitCodes() {
    var h = root.h
    root.runner.run(root.spec("exit", ["exit:3"], {}, function(failed) {
      h.equal([failed.ok, failed.error, failed.exitCode, failed.stdout, failed.stderr],
        [false, "exit", 3, "out\n", "err\n"], "exit 3: error exit, output kept")
      root.runner.run(root.spec("stderr", ["stderr:10000"], {}, function(noisy) {
        h.equal([noisy.ok, noisy.stderr.length], [true, 4096], "stderr is cut at 4096 characters")
        root.endedByForce()
      }))
    }))
  }

  // A tool that is ended by force before its deadline did not time out,
  // whichever way the wrapper reports it: as exit code 137, or (when the
  // wrapper is taken down with the tool) as its own death by signal 9.
  function endedByForce() {
    var h = root.h
    var inner = ["/usr/bin/timeout", "-s", "9", "0.2", "/usr/bin/sleep", "5"]
    var job = function(argv, done) {
      var bounds = { tag: "forced", argv: argv, timeoutSec: 5, maxBytes: 64, env: Env.local(), done: done }
      root.runner.run(bounds)
    }
    job([inner[0], "--foreground"].concat(inner.slice(1)), function(reported) {
      h.equal([reported.error, reported.exitCode], ["exit", 137], "137 before the deadline is an exit")
      job(inner, function(taken) {
        h.equal([taken.ok, taken.error, taken.exitCode, taken.stdout], [false, "signal", 9, ""],
          "death by a signal before the deadline is a signal")
        root.next()
      })
    })
  }

  function missingTool() {
    var h = root.h
    var before = h.jobs().length
    var job = function(tag, tool, umask077, done) {
      root.runner.run({
        tag: tag, argv: [tool], timeoutSec: 5, maxBytes: 64, env: Env.local(), umask077: umask077, done: done
      })
    }
    job("absent", "/nonexistent/oj-tool", false, function(absent) {
      h.equal([absent.ok, absent.error, absent.exitCode, absent.stdout], [false, "missing", 127, ""],
        "a tool that does not exist")
      // A file that is there but cannot be executed.
      job("plain", h.repo + "/tests/stubs/lib.js", false, function(plain) {
        h.equal([plain.error, plain.exitCode], ["missing", 126], "a tool that is not executable")
        job("absent", "/nonexistent/oj-tool", true, function(underSh) {
          h.equal([underSh.error, underSh.exitCode], ["missing", 127], "a missing tool behind the shell")
          h.equal(h.jobs().length, before + 3, "each of them was started")
          root.next()
        })
      })
    })
  }

  function missingWrapper() {
    var h = root.h
    var tools = {}
    for (var name in h.tools) tools[name] = h.tools[name]
    tools.setpriv = "/nonexistent/setpriv"
    var bare = h.mount("core/ProcessRunner.qml", { tools: tools })
    var returned = false
    bare.run(root.spec("nowrap", ["echo"], { stdin: "x" }, function(result) {
      h.check(returned, "nowrap: done is not called before run() returns")
      h.equal([result.ok, result.error, result.exitCode, result.stdout, result.durationMs],
        [false, "nowrap", -1, "", 0], "setpriv is missing")
      h.equal([bare.active, bare.waiting], [0, 0], "nowrap: nothing is left in the table")
      bare.destroy()
      root.next()
    }))
    returned = true
  }

  function malformed() {
    var h = root.h
    var before = h.jobs().length
    var seen = []
    var bad = [
      ["a relative tool", { argv: ["probe.js", "echo"] }],
      ["an empty argv", { argv: [] }],
      ["an argv that is no array", { argv: root.probe }],
      ["a number in argv", { argv: [root.probe, 5] }],
      ["no deadline", { timeoutSec: undefined }],
      ["a deadline of 0", { timeoutSec: 0 }],
      ["a deadline of 601 s", { timeoutSec: 601 }],
      ["a fractional deadline", { timeoutSec: 1.5 }],
      ["no output cap", { maxBytes: undefined }],
      ["an output cap of 0", { maxBytes: 0 }],
      ["an output cap above the largest answer", { maxBytes: Const.LIMITS.resolveBytes + 1 }],
      ["no environment", { env: null }],
      ["a stdin that is no string", { stdin: 5 }],
      ["a stdin above the largest payload", { stdin: new Array(Const.LIMITS.resolveBytes + 2).join("a") }],
      ["a tag that is no string", { tag: 7 }],
      ["a umask flag that is no boolean", { umask077: "yes" }]
    ]
    var returned = false
    for (var i = 0; i < bad.length; i++) {
      var id = root.runner.run(root.spec("bad", ["echo"], bad[i][1], function(result) {
        h.check(returned, "refused: done is not called before run() returns")
        seen.push(result.error + "/" + result.exitCode + "/" + result.ok)
      }))
      h.check(id > 0, "refused: still an id for " + bad[i][0])
    }
    returned = true
    h.equal(root.runner.run(null) > 0, true, "a job that is no object is survived")
    h.equal(root.runner.run({ tag: "x" }) > 0, true, "a job without done is survived")
    h.waitFor(function() { return seen.length === bad.length }, 3000, function(all) {
      h.check(all, "every malformed job got its answer")
      h.equal(seen.filter(function(s) { return s !== "refused/-1/false" }), [], "each was refused")
      h.equal(h.jobs().length, before, "no malformed job was started")
      h.equal([root.runner.active, root.runner.waiting], [0, 0], "nothing malformed is queued")
      root.next()
    })
  }

  function environment() {
    var h = root.h
    // The profiles and the proxy test, here on Qt's engine.
    var resolved = { ok: true, denoDir: "/run/user/1000/omajuke/deno" }
    var local = { PATH: "/usr/bin", LANG: "C.UTF-8", HOME: null, XDG_RUNTIME_DIR: null }
    h.equal(Env.local(), local, "Env.local")
    h.equal([Env.net(resolved).DENO_DIR, Env.net(resolved).DENO_NO_UPDATE_CHECK, Env.mpv(resolved).DENO_DIR],
      [resolved.denoDir, "1", resolved.denoDir], "Env.net and Env.mpv carry deno's directory")
    h.equal([Env.net({ ok: false }), Env.mpv(null), Env.net(undefined)], [null, null, null],
      "no network profile without resolved paths")
    h.equal(Object.keys(Env.mpv(resolved)).sort(), [
      "DBUS_SESSION_BUS_ADDRESS", "DENO_DIR", "DENO_NO_UPDATE_CHECK", "GBM_BACKEND", "HOME", "LANG",
      "LIBVA_DRIVER_NAME", "NVD_BACKEND", "PATH", "WAYLAND_DISPLAY", "XCURSOR_SIZE", "XCURSOR_THEME",
      "XDG_RUNTIME_DIR", "__EGL_VENDOR_LIBRARY_FILENAMES", "__GLX_VENDOR_LIBRARY_NAME"
    ], "Env.mpv")
    var attempt = "/run/user/1000/omajuke/signin/3"
    h.equal(Object.keys(Env.browser(attempt)).sort(), [
      "DBUS_SESSION_BUS_ADDRESS", "DISPLAY", "HOME", "LANG", "PATH", "WAYLAND_DISPLAY", "XDG_CONFIG_HOME",
      "XDG_CURRENT_DESKTOP", "XDG_DATA_DIRS", "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE"
    ], "Env.browser")
    h.equal([Env.browser(attempt).XDG_CONFIG_HOME, Env.browser(attempt + "/profile"), Env.browser(null),
      Env.browser("/run/user/1000/omajuke/signin")], [attempt + "/config", null, null, null],
      "Env.browser exists for a sign-in attempt directory only")
    h.equal(Object.keys(Env.hypr()).sort(),
      ["HOME", "HYPRLAND_INSTANCE_SIGNATURE", "LANG", "PATH", "XDG_RUNTIME_DIR"], "Env.hypr")
    var session = { http_proxy: null, https_proxy: "", all_proxy: null, ALL_PROXY: "socks5://127.0.0.1:9" }
    h.equal([Env.proxySet(session), Env.proxySet({ https_proxy: "", HTTP_PROXY: null }), Env.proxySet(null)],
      [true, false, false], "Env.proxySet")

    var usual = "HOME\nLANG\nPATH\nXDG_RUNTIME_DIR\n"
    var at = root.starts()
    root.runner.run(root.spec("env", ["env"], {}, function(result) {
      h.equal(result.stdout, usual, "the child has exactly the names of the profile")
      h.equal(h.log("probe")[at].env, ["HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"], "and so says its record")
      // null hands on the session's value; a variable the session does not
      // have stays absent, and nothing else of the session leaks through.
      var sparse = { PATH: "/usr/bin", XDG_RUNTIME_DIR: null, OJ_NOT_IN_SESSION: null, QT_QPA_PLATFORM: null }
      root.runner.run(root.spec("env", ["env"], { env: sparse }, function(narrow) {
        h.equal(narrow.stdout, "PATH\nQT_QPA_PLATFORM\nXDG_RUNTIME_DIR\n",
          "null passes one variable through, if it is set")
        root.windowEnvironment()
      }))
    }))
  }

  // The launcher gives this case a cursor theme, as a session would. Only
  // the player is handed it, and the sign-in browser gets a configuration
  // directory of its own in place of the session's.
  function windowEnvironment() {
    var h = root.h
    var resolved = { ok: true, denoDir: h.runDir + "/omajuke/deno" }
    var attempt = h.runDir + "/omajuke/signin/3"
    root.runner.run(root.spec("env", ["env"], { env: Env.mpv(resolved) }, function(player) {
      h.equal(player.stdout.split("\n"),
        ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XCURSOR_THEME", "XDG_RUNTIME_DIR", ""],
        "the player gets what the session says about a window, and nothing the session does not have")
      root.runner.run(root.spec("env", ["env"], { env: Env.net(resolved) }, function(net) {
        h.equal(net.stdout, "DENO_DIR\nDENO_NO_UPDATE_CHECK\nHOME\nLANG\nPATH\nXDG_RUNTIME_DIR\n",
          "a network tool does not")
        root.runner.run(root.spec("env", ["env"], { env: Env.browser(attempt) }, function(names) {
          h.equal(names.stdout, "HOME\nLANG\nPATH\nXDG_CONFIG_HOME\nXDG_RUNTIME_DIR\n",
            "the sign-in browser gets the session's own names and no cursor of ours")
          var ask = ["value:XDG_CONFIG_HOME"]
          root.runner.run(root.spec("env", ask, { env: Env.browser(attempt) }, function(config) {
            h.equal(config.stdout, attempt + "/config\n",
              "and its configuration directory is the attempt's, not the session's")
            root.stubMemory()
          }))
        }))
      }))
    }))
  }

  // A stub that is started once per request keeps what it has to remember
  // in a file of the run; a case can seed that file and read it back.
  function stubMemory() {
    var h = root.h
    h.equal(h.stubState("probe"), null, "a stub that kept nothing has no state")
    root.runner.run(root.spec("state", ["state:first"], {}, function(first) {
      h.equal([first.stdout, h.stubState("probe")], ["[\"first\"]\n", ["first"]], "a stub keeps its state")
      h.setStubState("probe", ["seeded"])
      root.runner.run(root.spec("state", ["state:second"], {}, function(second) {
        h.equal([second.stdout, h.stubState("probe")], ["[\"seeded\",\"second\"]\n", ["seeded", "second"]],
          "and starts from the state a case gave it")
        root.next()
      }))
    }))
  }

  function privateFiles() {
    var h = root.h
    var open = h.runDir + "/sbx/probe-open"
    var closed = h.runDir + "/sbx/probe-private"
    var at = root.starts()
    root.runner.run(root.spec("write", ["write:" + closed], { umask077: true }, function(result) {
      h.check(result.ok, "umask077: the tool ran")
      h.equal(h.log("probe")[at].argv, ["write:" + closed], "umask077: the tool sees its own arguments only")
      var wrapped = [
        h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "5",
        h.tools.sh, "-c", Sh.UMASK_EXEC, "omajuke", root.probe, "write:" + closed
      ]
      h.equal(h.jobs()[h.jobs().length - 1].command, wrapped, "umask077: the wrapped command")
      root.runner.run(root.spec("write", ["write:" + open], {}, function() {
        h.exec(["/usr/bin/stat", "-c", "%a", closed, open], null, function(code, out) {
          var modes = out.split("\n")
          h.equal(modes[0], "600", "umask077: the file is private")
          h.check(modes[1] !== "600", "without it the session's umask applies")
          root.next()
        })
      }))
    }))
  }

  function overflow() {
    var h = root.h
    var began = Date.now()
    root.runner.run(root.spec("flood", ["flood"], { maxBytes: 100000 }, function(result) {
      h.equal([result.ok, result.error, result.stdout], [false, "overflow", ""], "a flood overflows")
      h.check(Date.now() - began < 3000, "and is stopped at once, not at its deadline")
      root.gone("overflow: the child is gone when done is called", root.next)
    }))
  }

  function deadline() {
    var h = root.h
    root.runner.run(root.spec("hang", ["linger"], { timeoutSec: 1 }, function(result) {
      h.equal([result.ok, result.error, result.exitCode, result.stdout], [false, "timeout", 124, ""],
        "a hanging tool times out, and what it printed until then is not handed on")
      h.check(result.durationMs >= 1000 && result.durationMs < 3000, "at its deadline")
      root.gone("timeout: the child is gone when done is called", root.next)
    }))
  }

  function cancelled() {
    var h = root.h
    var at = root.starts()
    var done = false
    var asked = 0
    var id = root.runner.run(root.spec("hang", ["linger"], {}, function(result) {
      done = true
      h.equal([result.ok, result.error, result.stdout], [false, "cancelled", ""], "a cancelled job")
      h.check(Date.now() - asked < 1500, "cancel: a tool that listens is stopped at once")
      h.equal(root.runner.active, 0, "cancel: the job left the table")
      root.gone("cancel: the child is gone when done is called", root.next)
    }))
    h.waitFor(function() { return root.starts() > at }, 5000, function(up) {
      h.check(up, "cancel: the child is up")
      asked = Date.now()
      root.runner.cancel(id)
      h.check(!done, "cancel: done waits for the exit")
      h.equal(root.runner.active, 1, "cancel: the job stays in the table until then")
      root.runner.cancel(id)
      root.runner.cancel(987654)
    })
  }

  // A tool that ignores SIGTERM is ended by timeout after its delay. The job
  // is reported only then, and as what we asked for.
  function deafToTermCancelled() {
    var h = root.h
    var at = root.starts()
    var asked = 0
    var id = root.runner.run(root.spec("deaf", ["ignore-term"], { timeoutSec: 30 }, function(result) {
      var waited = Date.now() - asked
      h.equal([result.ok, result.error], [false, "cancelled"], "deaf to SIGTERM, cancelled: the result")
      h.check(waited >= 1500 && waited < 3900, "it is reported after timeout's own delay, before ours")
      root.gone("deaf to SIGTERM, cancelled: the child is gone when done is called", root.next)
    }))
    h.waitFor(function() { return root.starts() > at }, 5000, function(up) {
      h.check(up, "deaf to SIGTERM: the child is up and ignores the signal")
      asked = Date.now()
      root.runner.cancel(id)
      h.after(1000, function() {
        h.equal(root.runner.active, 1, "one second later the job is still in the table")
      })
    })
  }

  function deafToTermDeadline() {
    var h = root.h
    root.runner.run(root.spec("deaf", ["ignore-term"], { timeoutSec: 1 }, function(result) {
      h.equal([result.ok, result.error], [false, "timeout"], "deaf to SIGTERM, deadline: the result")
      h.check(result.durationMs >= 2500 && result.durationMs < 4900, "after the deadline and timeout's delay")
      root.gone("deaf to SIGTERM, deadline: the child is gone when done is called", root.next)
    }))
  }

  // The runner's own bound, for a wrapper that does not do its work: here
  // the probe runs in place of timeout, enforces nothing and ignores
  // SIGTERM. One job runs into its deadline and one is cancelled, at the
  // same time; both are ended by the runner itself, a moment later.
  function lastResort() {
    var h = root.h
    var tools = {}
    for (var name in h.tools) tools[name] = h.tools[name]
    tools.timeout = root.probe
    var unguarded = h.mount("core/ProcessRunner.qml", { tools: tools })
    var at = root.starts()
    var began = Date.now()
    var late = null
    var stopped = null
    var asked = 0
    unguarded.run(root.spec("late", ["hang"], { timeoutSec: 1 }, function(result) {
      var ran = Date.now() - began
      late = [result.ok, result.error, result.exitCode, ran >= 4500, ran < 7000]
    }))
    var id = unguarded.run(root.spec("stopped", ["hang"], { timeoutSec: 30 }, function(result) {
      var waited = Date.now() - asked
      stopped = [result.ok, result.error, result.exitCode, waited >= 3500, waited < 6000]
    }))
    h.waitFor(function() { return root.starts() === at + 2 }, 5000, function(up) {
      h.check(up, "last resort: both wrappers are up and deaf")
      asked = Date.now()
      unguarded.cancel(id)
      h.waitFor(function() { return late !== null && stopped !== null }, 10000, function(both) {
        h.check(both, "last resort: both jobs are reported")
        h.equal(late, [false, "timeout", -1, true, true], "past its deadline: a timeout, after the wait")
        h.equal(stopped, [false, "cancelled", -1, true, true], "cancelled: reported as that, after the wait")
        h.equal([unguarded.active, unguarded.waiting], [0, 0], "last resort: nothing is left in the table")
        root.gone("last resort: neither wrapper is left", function() {
          unguarded.destroy()
          root.next()
        })
      })
    })
  }

  // What the tool started goes with it: timeout signals the process group.
  function grandchild() {
    var h = root.h
    var at = root.starts()
    var id = root.runner.run(root.spec("tree", ["tree"], {}, function(result) {
      h.equal(result.error, "cancelled", "a tool with a child of its own, cancelled")
      root.gone("its child went with it", function() {
        at = root.starts()
        root.runner.run(root.spec("tree", ["tree"], { timeoutSec: 1 }, function(late) {
          h.equal(late.error, "timeout", "a tool with a child of its own, at its deadline")
          root.gone("its child went with it then too", root.next)
        }))
      })
    }))
    h.waitFor(function() { return root.starts() >= at + 2 }, 5000, function(up) {
      h.check(up, "the tool and its child are up")
      root.runner.cancel(id)
    })
  }

  function queueing() {
    var h = root.h
    var most = 0
    var results = []
    var watch = function() { most = Math.max(most, root.runner.active) }
    root.runner.activeChanged.connect(watch)
    for (var i = 0; i < 8; i++) {
      root.runner.run(root.spec("sleep", ["sleep:300"], {}, function(result) { results.push(result.stdout) }))
    }
    h.equal([root.runner.active, root.runner.waiting], [6, 2], "8 jobs: six run, two wait")
    h.waitFor(function() { return results.length === 8 }, 10000, function(all) {
      root.runner.activeChanged.disconnect(watch)
      h.check(all, "8 jobs: all settle")
      h.equal(results.filter(function(out) { return out !== "done\n" }), [], "8 jobs: all succeed")
      h.equal(most, 6, "8 jobs: never more than six at a time")
      h.equal([root.runner.active, root.runner.waiting], [0, 0], "8 jobs: nothing is left")
      root.next()
    })
  }

  function cancelWaiting() {
    var h = root.h
    var at = root.starts()
    var ended = []
    for (var i = 0; i < 6; i++) {
      root.runner.run(root.spec("hang", ["hang"], {}, function(result) { ended.push(result.error) }))
    }
    var waitingDone = false
    var returned = false
    var id = root.runner.run(root.spec("late", ["echo"], { stdin: "never" }, function(result) {
      waitingDone = true
      h.check(returned, "a waiting job: done is not called inside cancel()")
      h.equal([result.error, result.exitCode], ["cancelled", -1], "a waiting job, cancelled")
    }))
    h.equal(root.runner.waiting, 1, "the seventh job waits")
    h.waitFor(function() { return root.starts() === at + 6 }, 5000, function(up) {
      h.check(up, "six children are up")
      root.runner.cancel(id)
      returned = true
      h.equal(root.runner.waiting, 0, "cancel takes it out of the queue")
      root.runner.run(root.spec("late", ["echo"], { stdin: "never" }, function(result) {
        ended.push(result.error)
      }))
      root.runner.cancelAll()
      h.waitFor(function() { return ended.length === 7 && waitingDone }, 5000, function(all) {
        h.check(all, "cancelAll: every job is reported")
        h.equal(ended.filter(function(error) { return error !== "cancelled" }), [], "cancelAll: as cancelled")
        h.equal(root.starts(), at + 6, "a job cancelled while waiting never ran")
        h.equal([root.runner.active, root.runner.waiting], [0, 0], "cancelAll: nothing is left")
        root.gone("cancelAll: no child is left", root.next)
      })
    })
  }

  // A caller whose done throws must not wedge the runner, and what it threw
  // must not reach the log: an error message can carry anything.
  function brokenCallback() {
    var h = root.h
    root.runner.run(root.spec("throws", ["echo"], { stdin: "x" }, function(result) {
      throw new Error("oj-thrown-" + "text")
    }))
    root.runner.run(root.spec("after", ["echo"], { stdin: "y" }, function(result) {
      h.equal([result.ok, result.stdout], [true, "y"], "the job after a throwing callback runs")
      h.after(200, function() {
        h.equal([root.runner.active, root.runner.waiting], [0, 0], "and the table is empty again")
        var logged = h.readFile(h.runDir + "/out.txt")
        var constant = "omajuke: a job callback failed"
        h.check(logged.indexOf(constant) !== -1, "the failure is logged as a constant")
        h.check(logged.indexOf("oj-thrown-text") === -1, "and the thrown text is not in the log")
        root.next()
      })
    }))
  }

  // Destroying the runner (what a disable or a reload does) leaves no child.
  function orphaned() {
    var h = root.h
    var at = root.starts()
    var called = false
    var doomed = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    var note = function(result) { called = true }
    for (var i = 0; i < 7; i++) doomed.run(root.spec("hang", ["hang"], {}, note))
    h.waitFor(function() { return root.starts() === at + 6 }, 5000, function(up) {
      h.check(up, "destroy: six children are up")
      doomed.destroy()
      h.after(1000, function() {
        h.check(!called, "destroy: nobody is called back")
        root.gone("destroy: no recorded child is alive", root.next)
      })
    })
  }
}
