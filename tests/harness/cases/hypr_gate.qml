import QtQuick
import "../../../lib/Lua.js" as Lua

// core/HyprCtl.qml against the hyprctl stub: what may be read, and above
// all when a line of Lua is sent and when it is not. A line goes out only
// if it is one of the templates, the release is one the lines were tried
// on, and the user's configuration has no errors, asked immediately before.
// It counts as run only on the answer "ok". Whenever something stands in
// the way the stub must not have been started for an eval at all.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var hypr: null
  property var steps: []
  property int at: 0

  readonly property string rule: Lua.rule({ pct: 25, corner: "bottom-right", marginX: 5, marginY: 5 })
  readonly property string bind: Lua.bind("MOD4 + CONTROL + V", "video")
  readonly property string unbind: Lua.unbind("MOD4 + CONTROL + V")
  // A window title that must stay inside the component that read it.
  readonly property string title: "Zebracrossing notes"

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.hypr = h.mount("core/HyprCtl.qml", { runner: root.runner, tools: h.tools })
    if (root.runner === null || root.hypr === null) { h.finish(); return }
    root.steps = [
      root.gateOpen, root.sends, root.reads, root.readsRefused, root.notTemplates, root.configErrors,
      root.badAnswers, root.inOrder, root.reloadedMeanwhile, root.detached, root.untested, root.unreachable,
      root.bounded
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // What the stub was started with so far, as the first word that tells the
  // requests apart.
  function requests() {
    return root.h.log("hyprctl").map(function(entry) {
      var argv = entry.argv
      return argv[0] === "-j" ? argv[1] : argv[0]
    })
  }

  function evals() {
    return root.h.log("hyprctl").filter(function(entry) { return entry.argv[0] === "eval" })
  }

  function count(name) {
    return root.requests().filter(function(request) { return request === name }).length
  }

  function gateOpen() {
    var h = root.h
    h.equal(root.hypr.lastGate, "", "before the first question the gate is unknown")
    var inside = true
    root.hypr.gate(function(found) {
      h.check(!inside, "gate: the answer comes after the call has returned")
      h.equal(found, "ok", "gate: a tested release and a sound configuration")
      h.equal(root.hypr.lastGate, "ok", "gate: the answer is kept")
      h.equal(root.requests(), ["version", "configerrors"], "gate: the release, then the errors")
      var entries = h.log("hyprctl")
      h.equal(entries[0].env, ["HOME", "HYPRLAND_INSTANCE_SIGNATURE", "LANG", "PATH", "XDG_RUNTIME_DIR"],
        "gate: hyprctl gets the instance signature and nothing else of the session")
      h.equal(root.hypr.gateCode("ok"), "", "codes: ok is no error")
      h.equal(root.hypr.gateCode("version"), "E_HYPR_VERSION", "codes: an untested release")
      h.equal(root.hypr.gateCode("config-errors"), "E_HYPR_ERRORS", "codes: a broken configuration")
      h.equal(root.hypr.gateCode("no-hyprland"), "E_HYPR_NONE", "codes: no compositor")
      root.next()
    })
    inside = false
  }

  function sends() {
    var h = root.h
    var inside = true
    root.hypr.evalLua(root.rule, function(code) {
      h.check(!inside, "send: the answer comes after the call has returned")
      h.equal(code, "", "send: the rule ran")
      h.equal(root.requests(), ["version", "configerrors", "configerrors", "eval"],
        "send: the errors are asked again right before, the release is not")
      h.equal(root.evals()[0].argv, ["eval", "--", root.rule], "send: the line is one argument behind --")
      h.equal(h.stubState("hyprctl").rule, "25-br-5-5", "send: the stub registered the rule")
      var job = h.jobs().filter(function(entry) { return entry.tag === "hypr-eval" })[0]
      h.equal(job.command.slice(1, 6), ["--pdeathsig", "TERM", h.tools.timeout, "-k", "2"],
        "send: through the runner, with a deadline")
      h.equal(job.command[6], "3", "send: three seconds")
      root.next()
    })
    inside = false
  }

  function reads() {
    var h = root.h
    h.setStubState("hyprctl", {
      clients: [
        { "class": "OmaJuke", title: "OmaJuke", at: [1435, 805], size: [480, 270], floating: true,
          fullscreen: 0 },
        { "class": "editor", title: root.title, at: [0, 30], size: [1920, 1050], floating: false,
          fullscreen: 0 },
        "not a window"
      ],
      binds: [{ modmask: 64, key: "V", description: "Placeholder 1" }]
    })
    root.hypr.monitors(function(monitors) {
      h.check(monitors.ok, "monitors: read")
      h.equal(monitors.value.length, 1, "monitors: the list")
      h.equal(monitors.value[0].name, "DP-1", "monitors: as printed")
      root.hypr.clients(function(clients) {
        h.equal(clients, { ok: true, value: [
          { className: "OmaJuke", at: [1435, 805], size: [480, 270], floating: true, fullscreen: 0 },
          { className: "editor", at: [0, 30], size: [1920, 1050], floating: false, fullscreen: 0 }
        ] }, "clients: class, place and size of each window, and nothing else")
        h.check(JSON.stringify(clients).indexOf("Zebracrossing") === -1, "clients: no title leaves the read")
        root.hypr.option("general:gaps_out", function(gaps) {
          h.equal(gaps, { ok: true, value: { css: "5 5 5 5" } }, "option: the gaps")
          root.hypr.option("input:resolve_binds_by_sym", function(flag) {
            h.equal(flag, { ok: true, value: { bool: false } }, "option: a switch, without its set mark")
            root.hypr.binds(function(binds) {
              h.check(binds.ok, "binds: read")
              h.equal(binds.text, "bindd\n\tmodmask: 64\n\tsubmap: \n\tkey: V\n\tkeycode: 0\n"
                + "\tcatchall: false\n\tdescription: Placeholder 1\n\tdispatcher: exec\n\targ: \n\n\n",
                "binds: the plain listing, whole, with its final empty line")
              h.equal(root.requests().slice(4), ["monitors", "clients", "getoption", "getoption", "binds"],
                "reads: one request each, and no gate in front of a read")
              root.next()
            })
          })
        })
      })
    })
  }

  function readsRefused() {
    var h = root.h
    var before = h.log("hyprctl").length
    var names = ["decoration:rounding", "general:gaps_out x", "", null, "constructor", 7]
    var left = names.length
    names.forEach(function(name) {
      root.hypr.option(name, function(answer) {
        h.equal(answer, { ok: false, value: null }, "option: a name outside the list is not asked")
        left--
        if (left > 0) return
        h.equal(h.log("hyprctl").length, before, "option: and the stub was not started for any of them")
        h.scenario({ hyprctl: "garbage:monitors" })
        root.hypr.monitors(function(monitors) {
          h.equal(monitors, { ok: false, value: null }, "monitors: an answer that is no list is no answer")
          h.scenario({ hyprctl: "fail:clients" })
          root.hypr.clients(function(clients) {
            h.equal(clients, { ok: false, value: null }, "clients: a failed read")
            h.scenario({ hyprctl: "ok" })
            root.next()
          })
        })
      })
    })
  }

  // Whatever is not exactly a line of a template is turned away before
  // anything is started: not even the question about the configuration.
  function notTemplates() {
    var h = root.h
    var before = h.log("hyprctl").length
    var lines = [
      "", "ok", "hl.unbind(\"all\")", "hl.unbind(\"V\")", "hl.dispatch(\"exit\")",
      root.rule + " hl.unbind(\"all\")", root.rule + "\n", " " + root.rule,
      root.bind.replace("video toggle", "video toggle; reboot"),
      root.bind.replace("omarchy-shell", "sh"), root.unbind + root.unbind,
      "os.execute(\"true\")", null, undefined, 7, ["hl.unbind(\"MOD4 + V\")"], { toString: null }
    ]
    var left = lines.length
    lines.forEach(function(line, index) {
      root.hypr.evalLua(line, function(code) {
        h.equal(code, "E_HYPR_EVAL", "not a template " + index + ": refused")
        left--
        if (left > 0) return
        h.equal(h.log("hyprctl").length, before, "not a template: the stub was never started")
        h.equal(h.jobs().filter(function(job) { return job.tag === "hypr-eval" }).length, 1,
          "not a template: no job either")
        root.next()
      })
    })
  }

  function configErrors() {
    var h = root.h
    var errors = "Config error in file /home/user/.config/hypr/hyprland.lua at line 3: unexpected symbol"
    h.setStubState("hyprctl", { configErrors: errors })
    var before = root.evals().length
    root.hypr.evalLua(root.bind, function(code) {
      h.equal(code, "E_HYPR_ERRORS", "config errors: the line is not sent")
      h.equal(root.evals().length, before, "config errors: no eval reached the stub")
      h.equal(h.stubState("hyprctl").configErrors, errors, "config errors: the user's list is still there")
      h.equal(root.hypr.lastGate, "config-errors", "config errors: the gate says so")
      root.hypr.gate(function(found) {
        h.equal(found, "config-errors", "config errors: and says so again when asked")
        h.equal(root.hypr.detachedEvalArgv(root.unbind), null,
          "config errors: nothing may be sent blind after such an answer")
        h.setStubState("hyprctl", { configErrors: "" })
        root.hypr.evalLua(root.bind, function(again) {
          h.equal(again, "", "config errors: once they are fixed the line runs")
          h.equal(root.evals().length, before + 1, "config errors: exactly once")
          var binds = h.stubState("hyprctl").binds
          h.equal([binds.length, binds[0].modmask, binds[0].key, binds[0].description],
            [1, 68, "V", "OmaJuke: show or hide video"], "config errors: the bind is in the stub's table")
          root.next()
        })
      })
    })
  }

  // Only "ok", alone, means that a line ran.
  function badAnswers() {
    var h = root.h
    var before = root.evals().length
    h.scenario({ hyprctl: "refuse" })
    root.hypr.evalLua(root.unbind, function(refused) {
      h.equal(refused, "E_HYPR_EVAL", "answers: an error line is a failure, whatever the exit code")
      h.scenario({ hyprctl: "silent" })
      root.hypr.evalLua(root.unbind, function(silent) {
        h.equal(silent, "E_HYPR_EVAL", "answers: no answer is a failure")
        h.scenario({ hyprctl: "noisy" })
        root.hypr.evalLua(root.unbind, function(noisy) {
          h.equal(noisy, "E_HYPR_EVAL", "answers: ok with something behind it is a failure")
          h.scenario({ hyprctl: "fail:eval" })
          root.hypr.evalLua(root.unbind, function(failed) {
            h.equal(failed, "E_HYPR_EVAL", "answers: a failed start is a failure")
            h.equal(root.evals().length, before + 4, "answers: each line was sent once, none repeated")
            h.scenario({ hyprctl: "ok" })
            root.next()
          })
        })
      })
    })
  }

  // Lines handed over together run one at a time, in that order, each with
  // its own question about the configuration in front.
  function inOrder() {
    var h = root.h
    var from = h.log("hyprctl").length
    var answers = []
    var lines = [root.unbind, root.bind, root.rule, root.unbind]
    lines.forEach(function(line) {
      root.hypr.evalLua(line, function(code) {
        answers.push(code)
        if (answers.length < lines.length) return
        h.equal(answers, ["", "", "", ""], "order: every line ran")
        h.equal(root.requests().slice(from), ["configerrors", "eval", "configerrors", "eval", "configerrors",
          "eval", "configerrors", "eval"], "order: errors, line, errors, line")
        h.equal(root.evals().slice(-4).map(function(entry) { return entry.argv[2] }), lines,
          "order: as handed over")
        h.equal(h.stubState("hyprctl").binds.length, 0, "order: the last removal took the bind out again")
        root.next()
      })
    })
  }

  // The configuration is loaded again while its errors are being asked
  // for: that answer is about the old one, so the question is repeated
  // before anything is sent.
  function reloadedMeanwhile() {
    var h = root.h
    var from = h.log("hyprctl").length
    h.scenario({ hyprctl: "slow:400" })
    root.hypr.evalLua(root.bind, function(code) {
      h.equal(code, "", "reload: the line still runs")
      h.equal(root.requests().slice(from), ["configerrors", "configerrors", "eval"],
        "reload: the errors were asked a second time first")
      h.scenario({ hyprctl: "ok" })
      root.hypr.evalLua(root.unbind, function(removed) {
        h.equal(removed, "", "reload: tidy up")
        root.next()
      })
    })
    h.waitFor(function() { return h.log("hyprctl").length === from + 1 }, 5000, function(started) {
      h.check(started, "reload: the first question is on its way")
      root.hypr.noteReload()
    })
  }

  function detached() {
    var h = root.h
    h.equal(root.hypr.lastGate, "ok", "detached: the last gate was ok")
    h.equal(root.hypr.detachedEvalArgv(root.unbind),
      [h.tools.timeout, "-k", "2", "3", h.tools.hyprctl, "eval", "--", root.unbind],
      "detached: the bounded command for one line")
    h.equal(root.hypr.detachedEvalArgv("hl.unbind(\"all\")"), null, "detached: not for a line of anyone else")
    h.equal(root.hypr.detachedEvalArgv(null), null, "detached: not for nothing")
    root.next()
  }

  // The release is asked once per component, so each of these gets its own.
  function untested() {
    var h = root.h
    var from = h.log("hyprctl").length
    h.setStubState("hyprctl", { version: "0.57.0" })
    var other = h.mount("core/HyprCtl.qml", { runner: root.runner, tools: h.tools })
    other.evalLua(root.rule, function(code) {
      h.equal(code, "E_HYPR_VERSION", "untested: nothing is sent to a release that is not listed")
      h.equal(root.requests().slice(from), ["version"], "untested: not even the errors are asked for")
      other.gate(function(found) {
        h.equal(found, "version", "untested: the gate says so")
        h.equal(root.requests().slice(from), ["version"], "untested: and remembers the release")
        h.equal(other.detachedEvalArgv(root.unbind), null, "untested: nothing blind either")
        var versions = ["0.56", "0.5", "10.56.1", "v0.56.2", " 0.56.2", "0.560.1", ""]
        root.eachVersion(versions, 0)
      })
    })
  }

  function eachVersion(versions, index) {
    var h = root.h
    if (index >= versions.length) {
      h.setStubState("hyprctl", { version: "0.56.2" })
      root.next()
      return
    }
    h.setStubState("hyprctl", { version: versions[index] })
    var other = h.mount("core/HyprCtl.qml", { runner: root.runner, tools: h.tools })
    other.gate(function(found) {
      h.check(found === "version" || found === "no-hyprland",
        "untested: \"" + versions[index] + "\" is not let in")
      root.eachVersion(versions, index + 1)
    })
  }

  // A compositor that does not answer the first question is none, and the
  // failure is not remembered as a release.
  function unreachable() {
    var h = root.h
    var evals = root.evals().length
    h.scenario({ hyprctl: "garbage:version" })
    var other = h.mount("core/HyprCtl.qml", { runner: root.runner, tools: h.tools })
    other.evalLua(root.rule, function(code) {
      h.equal(code, "E_HYPR_NONE", "unreachable: no release, no line")
      h.scenario({ hyprctl: "fail:configerrors" })
      other.evalLua(root.rule, function(second) {
        h.equal(second, "E_HYPR_NONE", "unreachable: errors that cannot be asked for are no permission")
        h.equal(root.evals().length, evals, "unreachable: no eval reached the stub")
        h.scenario({ hyprctl: "ok" })
        other.gate(function(found) {
          h.equal(found, "ok", "unreachable: asked again once it answers")
          root.next()
        })
      })
    })
  }

  // A compositor that never answers a line: the wait ends by itself.
  function bounded() {
    var h = root.h
    var began = Date.now()
    h.scenario({ hyprctl: "hang:eval" })
    root.hypr.evalLua(root.unbind, function(code) {
      var took = Date.now() - began
      h.equal(code, "E_HYPR_EVAL", "bounded: no answer in time is a failure")
      h.check(took >= 2500 && took < 8000, "bounded: after about three seconds")
      h.scenario({ hyprctl: "ok" })
      h.alive(function(names) {
        h.equal(names, [], "bounded: and the tool is gone")
        root.next()
      })
    })
  }
}
