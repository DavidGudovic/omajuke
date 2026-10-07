import QtQuick
import Quickshell
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Lua.js" as Lua

// Everything OmaJuke asks of the compositor, through hyprctl and nothing
// else: a few bounded reads, and the one way a line of Lua reaches Hyprland.
//
// Lua sent this way runs inside the compositor, where a mistake can end the
// whole session. So this component owns the rules for sending any:
//
//   Only a line lib/Lua.js can return is sent. Lua.check looks at it when it
//   is handed over and once more as the very last thing before the command
//   is built, and no other function here can build that command.
//
//   Nothing is sent without a compositor, to a Hyprland release the lines
//   were not tried on, or while the user's configuration has errors. The
//   last is asked afresh before every line, because sending one makes the
//   compositor forget its list of errors: we would wipe what the user still
//   has to read, and add state to a configuration that is broken.
//
//   One line at a time, in the order they were handed over, and a line
//   counts as run only when the answer is exactly "ok". The answer is
//   never kept, shown or logged.
//
// There is no dispatch, no keyword, no reload and no socket of our own.
Item {
  id: root

  // ---- Given by the service ----

  // The process runner and the tool table (replaced only by tests).
  property var runner: null
  property var tools: Const.TOOLS

  // ---- What others read ----

  // The options option() may be asked for. Nothing else is ever read.
  readonly property var optionNames: [
    "general:gaps_out", "input:kb_layout", "input:kb_variant", "input:resolve_binds_by_sym", "input:kb_file"
  ]
  // What gate() found last: "" before the first time, then "ok",
  // "no-hyprland", "version" or "config-errors".
  readonly property string lastGate: _lastGate

  // ---- Private ----

  // A line that ran answers with two letters.
  readonly property int _evalBytes: 4096
  // Each caller sends one line at a time, so a longer wait is a bug.
  readonly property int _maxWaiting: 16
  // How many windows of a client list are looked at, and how much of a
  // name or an option's text is kept.
  readonly property int _maxWindows: 512
  readonly property int _nameChars: 64
  readonly property int _textChars: 4096
  // How often the question about configuration errors is repeated when the
  // configuration was loaded again while it was being asked.
  readonly property int _maxAsks: 3
  readonly property var _versionText: /^[\x21-\x7e]{1,64}$/
  readonly property var _prefix: /^[0-9]{1,4}\.[0-9]{1,4}\.$/

  property string _lastGate: ""
  // The release the compositor reported, "" until it did. It cannot change
  // while the compositor runs, so it is asked once.
  property string _version: ""
  // Lines waiting for their turn: { code, done }.
  property var _waiting: []
  property bool _sending: false
  // Counts the reloads the service told us about.
  property int _reloads: 0
  // Shared with every callback, so that none of them runs into a service
  // that is already being destroyed.
  property var _life: ({ alive: true })

  // ---- The gate ----

  // Finds out whether a line could be sent right now and calls done with
  // "ok", "no-hyprland" (no compositor, or it does not answer), "version"
  // (a release the lines were not tried on) or "config-errors". Never
  // before gate() has returned.
  function gate(done) {
    root._gate(function(found) {
      if (typeof done === "function") root._deliver(done, found)
    })
  }

  // The error a gate result stands for, "" for "ok".
  function gateCode(found) {
    if (found === "ok") return ""
    if (found === "version") return "E_HYPR_VERSION"
    if (found === "config-errors") return "E_HYPR_ERRORS"
    return "E_HYPR_NONE"
  }

  // The service says that the compositor loaded its configuration again.
  // A question about its errors that is still on its way was answered for
  // the configuration before, and is asked again.
  function noteReload() {
    root._reloads += 1
  }

  // ---- Reads ----

  // The monitor list as hyprctl prints it, parsed: done({ ok, value }).
  // value is null when the read failed. The entries are other people's
  // data and are checked where they are used (lib/Geometry.js).
  function monitors(done) {
    root._run("hypr-monitors", ["-j", "monitors"], function(result) {
      var parsed = result.ok ? root._json(result.stdout) : null
      root._deliver(done, Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false, value: null })
    })
  }

  // The windows of the desktop: done({ ok, value }), value a list of
  // { className, at, size, floating, fullscreen }. Titles and everything
  // else hyprctl prints about other people's windows are dropped here and
  // travel no further.
  function clients(done) {
    root._run("hypr-clients", ["-j", "clients"], function(result) {
      var list = result.ok ? root._windows(root._json(result.stdout)) : null
      root._deliver(done, list !== null ? { ok: true, value: list } : { ok: false, value: null })
    })
  }

  // One option, by a name from optionNames: done({ ok, value }), value a
  // new object with those of css, str, int, float and bool the answer has.
  function option(name, done) {
    if (root.optionNames.indexOf(name) === -1) {
      console.warn("omajuke: an option outside the list was asked for")
      root._later(function() { root._deliver(done, { ok: false, value: null }) })
      return
    }
    root._run("hypr-option", ["-j", "getoption", name], function(result) {
      var value = result.ok ? root._optionValue(root._json(result.stdout)) : null
      root._deliver(done, value !== null ? { ok: true, value: value } : { ok: false, value: null })
    })
  }

  // The key bindings, as the plain listing: done({ ok, text }). The text
  // is handed on whole, final empty line included, for lib/KeyCombo.js.
  function binds(done) {
    root._run("hypr-binds", ["binds"], function(result) {
      root._deliver(done, result.ok ? { ok: true, text: result.stdout } : { ok: false, text: "" })
    })
  }

  // ---- Sending a line ----

  // Runs one line of lib/Lua.js in the compositor, after the gate, and
  // calls done with "" when it ran or with the code of what stood in the
  // way: E_HYPR_NONE, E_HYPR_VERSION, E_HYPR_ERRORS, or E_HYPR_EVAL for a
  // line that is not one of ours, was refused, or got no clear answer.
  // Never before evalLua() has returned.
  function evalLua(code, done) {
    if (typeof code !== "string" || !Lua.check(code)) {
      console.warn("omajuke: a line that is not a template was not sent")
      root._later(function() { root._deliver(done, "E_HYPR_EVAL") })
      return
    }
    if (root._waiting.length >= root._maxWaiting) {
      console.warn("omajuke: too many lines are waiting for the compositor")
      root._later(function() { root._deliver(done, "E_HYPR_EVAL") })
      return
    }
    root._waiting = root._waiting.concat([{ code: code, done: done }])
    root._next()
  }

  // For the moment the service is destroyed, when nothing can wait for an
  // answer any more: the command that runs one line, bounded by timeout,
  // for Quickshell.execDetached. Null unless the line is one of ours and
  // the last gate was "ok": what cannot be asked now must have been
  // answered before.
  function detachedEvalArgv(code) {
    var command = root._evalArgv(code)
    var timeout = root.tools ? root.tools.timeout : null
    if (command === null || root._lastGate !== "ok" || !root._absolute(timeout)) return null
    return [timeout, "-k", String(Const.TIMEOUTS.killGraceSec), String(Const.TIMEOUTS.hypr)].concat(command)
  }

  function _next() {
    if (root._sending || root._waiting.length === 0) return
    var item = root._waiting[0]
    root._waiting = root._waiting.slice(1)
    root._sending = true
    var finish = function(code) {
      root._sending = false
      root._deliver(item.done, code)
      root._next()
    }
    root._gate(function(found) {
      if (found !== "ok") { finish(root.gateCode(found)); return }
      root._send(item.code, finish)
    })
  }

  // The only place a line leaves from. Between the gate and here nothing
  // else of ours can have been sent: lines go one at a time.
  function _send(code, finish) {
    var argv = root._evalArgv(code)
    if (argv === null || root.runner === null) { finish("E_HYPR_EVAL"); return }
    var life = root._life
    root.runner.run({
      tag: "hypr-eval",
      argv: argv,
      timeoutSec: Const.TIMEOUTS.hypr,
      maxBytes: root._evalBytes,
      env: Env.hypr(),
      done: function(result) {
        if (!life.alive) return
        finish(result.ok && result.stdout.trim() === "ok" ? "" : "E_HYPR_EVAL")
      }
    })
  }

  // The command for one line, or null. This is the last look at the line,
  // and the only function that puts one into a command.
  function _evalArgv(code) {
    var tool = root.tools ? root.tools.hyprctl : null
    if (!root._absolute(tool) || typeof code !== "string" || !Lua.check(code)) return null
    return [tool, "eval", "--", code]
  }

  // ---- The gate, step by step ----

  // then(found) is called later, never from inside.
  function _gate(then) {
    var settle = function(found) {
      root._lastGate = found
      then(found)
    }
    if (!root._hasSession()) {
      root._later(function() { settle("no-hyprland") })
      return
    }
    root._withVersion(function(version) {
      if (version === "") { settle("no-hyprland"); return }
      if (!root._tested(version)) { settle("version"); return }
      root._askErrors(1, settle)
    })
  }

  // The session names a compositor. hyprctl finds it by this variable.
  function _hasSession() {
    var signature = Quickshell.env("HYPRLAND_INSTANCE_SIGNATURE")
    return typeof signature === "string" && signature !== ""
  }

  function _withVersion(then) {
    if (root._version !== "") {
      var known = root._version
      root._later(function() { then(known) })
      return
    }
    root._run("hypr-version", ["-j", "version"], function(result) {
      var parsed = result.ok ? root._json(result.stdout) : null
      var version = parsed !== null && typeof parsed === "object" ? parsed.version : null
      if (typeof version === "string" && root._versionText.test(version)) root._version = version
      then(root._version)
    })
  }

  // True when the release starts with one of the prefixes lib/Lua.js lists.
  // An entry that is not a full major and minor number matches nothing.
  function _tested(version) {
    var prefixes = Lua.TESTED
    var count = Array.isArray(prefixes) ? Math.min(prefixes.length, 16) : 0
    for (var i = 0; i < count; i++) {
      var prefix = prefixes[i]
      if (typeof prefix === "string" && root._prefix.test(prefix) && version.startsWith(prefix)) return true
    }
    return false
  }

  // Asks for the configuration's errors: anything but an empty answer is
  // one. An answer that cannot be had is no permission either.
  function _askErrors(attempt, then) {
    var reloads = root._reloads
    root._run("hypr-errors", ["configerrors"], function(result) {
      if (reloads !== root._reloads) {
        // Loaded again meanwhile: this answer is about the one before.
        if (attempt < root._maxAsks) root._askErrors(attempt + 1, then)
        else then("config-errors")
        return
      }
      if (result.error === "overflow") { then("config-errors"); return }
      if (!result.ok) { then("no-hyprland"); return }
      then(result.stdout.trim() === "" ? "ok" : "config-errors")
    })
  }

  // ---- Running hyprctl ----

  // Runs one read and calls then(result) with the runner's result, or with
  // a failed one when the read could not even start. Never from inside.
  function _run(tag, args, then) {
    var tool = root.tools ? root.tools.hyprctl : null
    if (!root._hasSession() || root.runner === null || !root._absolute(tool)) {
      root._later(function() { then({ ok: false, error: "refused", stdout: "" }) })
      return
    }
    var life = root._life
    root.runner.run({
      tag: tag,
      argv: [tool].concat(args),
      timeoutSec: Const.TIMEOUTS.hypr,
      maxBytes: Const.LIMITS.hyprBytes,
      env: Env.hypr(),
      done: function(result) {
        if (life.alive) then(result)
      }
    })
  }

  function _absolute(path) {
    return typeof path === "string" && path.charAt(0) === "/"
  }

  function _later(call) {
    var life = root._life
    Qt.callLater(function() {
      if (life.alive) call()
    })
  }

  function _deliver(done, value) {
    if (typeof done !== "function") return
    try {
      done(value)
    } catch (error) {
      // One caller's bug must not stop the lines behind it, and what it
      // threw is not logged: a message can carry anything.
      console.warn("omajuke: a compositor callback failed")
    }
  }

  // ---- Reading what hyprctl printed ----

  function _json(text) {
    try {
      return JSON.parse(text)
    } catch (error) {
      return null
    }
  }

  function _pair(value) {
    if (!Array.isArray(value) || value.length !== 2) return null
    var first = value[0]
    var second = value[1]
    return typeof first === "number" && typeof second === "number" ? [first, second] : null
  }

  // The client list reduced to what placing a window needs, or null when it
  // is no list.
  function _windows(parsed) {
    if (!Array.isArray(parsed)) return null
    var count = Math.min(parsed.length, root._maxWindows)
    var list = []
    for (var i = 0; i < count; i++) {
      var entry = parsed[i]
      if (entry === null || typeof entry !== "object") continue
      var name = entry["class"]
      var floating = entry.floating
      var fullscreen = entry.fullscreen
      list.push({
        className: typeof name === "string" ? name.slice(0, root._nameChars) : "",
        at: root._pair(entry.at),
        size: root._pair(entry.size),
        floating: typeof floating === "boolean" ? floating : null,
        fullscreen: typeof fullscreen === "boolean" || typeof fullscreen === "number" ? fullscreen : null
      })
    }
    return list
  }

  // The value part of an option's answer, or null when it is no answer.
  function _optionValue(parsed) {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null
    var value = {}
    var css = parsed.css
    var str = parsed.str
    var whole = parsed["int"]
    var real = parsed["float"]
    var flag = parsed.bool
    if (typeof css === "string") value.css = css.slice(0, root._textChars)
    if (typeof str === "string") value.str = str.slice(0, root._textChars)
    if (typeof whole === "number") value["int"] = whole
    if (typeof real === "number") value["float"] = real
    if (typeof flag === "boolean") value.bool = flag
    return value
  }

  Component.onDestruction: root._life.alive = false
}
