pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io

// Root of the core harness. tests/harness.sh starts one headless Quickshell
// on this file per case; it loads tests/harness/cases/<case>.qml and hands
// it the object h below, which is everything a case may use: the stub tool
// table, a fake shell facade, helpers to mount plugin components, to look at
// what the stubs recorded, to wait, to assert and to finish.
//
// This file imports nothing from the repository. Quickshell maps a relative
// import that leaves the root directory to nothing, so every plugin file,
// fake and case is loaded by file URL from $OMAJUKE_REPO instead.
ShellRoot {
  id: root

  Item {
    id: h

    // ---- What a case reads ----

    readonly property string repo: Quickshell.env("OMAJUKE_REPO") || ""
    readonly property string runDir: Quickshell.env("XDG_RUNTIME_DIR") || ""
    readonly property string caseName: Quickshell.env("OMAJUKE_CASE") || ""
    // A copy of Const.TOOLS with the network and media tools replaced by the
    // stubs. A case may change entries in setup(), before anything runs.
    property var tools: null
    // { id, version } from manifest.json.
    property var manifest: null
    readonly property var shell: facade
    // Service cases only: the service and its _parts.
    property var service: null
    property var parts: null

    readonly property string stubDir: h.runDir + "/oj-stub"
    // Tools that never run for real in a test, and the stub that stands in.
    // The compositor's control tool, the question for the default browser
    // and the browser itself are among them: no case ever reaches the real
    // ones. (browser is empty in Const.TOOLS; a path here is what makes the
    // plugin start the stub in place of whatever browser it resolved.)
    readonly property var stubFiles: ({
      mpv: "mpv.js", ytdlp: "yt-dlp.js", curl: "curl.js",
      hyprctl: "hyprctl.js", xdgSettings: "xdg-settings.js", browser: "browser.js"
    })

    property var _consts: null
    property var _caseObject: null
    property var _mounted: []
    property var _jobs: []
    property var _waiters: []
    property var _failed: []
    property int _total: 0
    property bool _finished: false

    // The same test as ours() in tests/harness.sh, for every recorded PID:
    // prints the name of each record whose process is still there and
    // carries this run's XDG_RUNTIME_DIR.
    readonly property string _aliveScript: [
      'for f in "$1"/oj-stub/*.pid; do',
      '  [ -f "$f" ] || continue',
      '  pid=$(cat "$f")',
      '  case "$pid" in \'\'|*[!0-9]*) continue ;; esac',
      '  [ -r "/proc/$pid/environ" ] || continue',
      '  tr \'\\0\' \'\\n\' < "/proc/$pid/environ" | grep -qxF "XDG_RUNTIME_DIR=$1" || continue',
      '  basename "$f" .pid',
      'done'
    ].join("\n")

    // ---- Mounting plugin components ----

    // Creates a component of the repository by file URL, parented to the
    // harness. Returns null (and fails the case) when it does not load.
    function mount(relPath, props) {
      var component = Qt.createComponent("file://" + h.repo + "/" + relPath, Component.PreferSynchronous)
      if (component.status !== Component.Ready) {
        console.warn("harness: cannot load " + relPath + ": " + component.errorString())
        h.check(false, "mount " + relPath)
        return null
      }
      var object = component.createObject(h, props || {})
      if (object === null) {
        console.warn("harness: cannot create " + relPath + ": " + component.errorString())
        h.check(false, "mount " + relPath)
        return null
      }
      h._mounted.push(object)
      h._watch(object)
      return object
    }

    // Records every job a process runner starts, so that a case can assert
    // what is not in any command line.
    function _watch(object) {
      if (object === null || typeof object !== "object" || typeof object.jobStarted !== "function") return
      object.jobStarted.connect(function(tag, command) {
        var copy = []
        for (var i = 0; i < command.length; i++) copy.push(String(command[i]))
        h._jobs.push({ tag: String(tag), command: copy })
      })
    }

    function jobs() {
      return h._jobs.slice()
    }

    // ---- The service, as the host treats it ----

    function _createService() {
      var component = Qt.createComponent("file://" + h.repo + "/Service.qml", Component.PreferSynchronous)
      if (component.status !== Component.Ready) {
        console.warn("harness: cannot load Service.qml: " + component.errorString())
        h.check(false, "load Service.qml")
        return false
      }
      // Parentless and with nothing but the tool table: the host injects the
      // facade and the manifest one turn later.
      var service = component.createObject(null, { tools: h.tools })
      if (service === null) {
        console.warn("harness: cannot create Service.qml: " + component.errorString())
        h.check(false, "create Service.qml")
        return false
      }
      h.service = service
      h.parts = service._parts ? service._parts : null
      if (h.parts) {
        for (var name in h.parts) h._watch(h.parts[name])
      }
      return true
    }

    function injectNow() {
      if (!h.service) return
      h.service.shell = h.shell
      h.service.manifest = { id: h.manifest.id, version: h.manifest.version }
    }

    function revoke() {
      if (h.service) h.service.shell = null
    }

    // A shell restart, or a disable and enable, as the plugin sees it. The
    // old service removes its runtime files with a detached command when it
    // is destroyed; the new one must not be created before that has run, or
    // the removal could take the directories the new service just made.
    function recreate(then) {
      h.revoke()
      if (h.service) h.service.destroy()
      h.service = null
      h.parts = null
      var dir = h.runDir + "/" + h._consts.dirName
      var until = Date.now() + 10000
      var look = function() {
        h.exec(["/usr/bin/find", dir, "-mindepth", "1", "-maxdepth", "1"], null, function(code, out) {
          if (out !== "" && Date.now() < until) { h.after(50, look); return }
          h.check(out === "", "recreate: the runtime dir was emptied")
          if (!h._createService()) { h.finish(); return }
          Qt.callLater(function() {
            h.injectNow()
            h._guard(then, [])
          })
        })
      }
      h.after(50, look)
    }

    // ---- Talking to the stubs ----

    function scenario(obj) {
      h.writeFile(h.stubDir + "/scenario.json", JSON.stringify(obj))
    }

    // Queues a command for a stub to execute as if another client had sent
    // it: one line of JSON per call, appended to oj-stub/<tool>.inject.
    function inject(tool, command) {
      var path = h.stubDir + "/" + tool + ".inject"
      h.writeFile(path, h.readFile(path) + JSON.stringify(command) + "\n")
    }

    // What a stub recorded: the parsed lines of oj-stub/<tool>.jsonl.
    function log(tool) {
      var lines = h.readFile(h.stubDir + "/" + tool + ".jsonl").split("\n")
      var records = []
      for (var i = 0; i < lines.length; i++) {
        if (lines[i] === "") continue
        try {
          records.push(JSON.parse(lines[i]))
        } catch (error) {
          // A line that is still being written; the next call sees it whole.
        }
      }
      return records
    }

    // What a stub keeps between its runs, parsed: oj-stub/<tool>.state.json,
    // or null when there is none. A stub that is started once per request
    // (the compositor's control tool, with its table of key bindings) has no
    // other memory. setStubState writes it, so a case can start from a
    // table of its own; what the object means is the stub's business.
    function stubState(tool) {
      try {
        return JSON.parse(h.readFile(h.stubDir + "/" + tool + ".state.json"))
      } catch (error) {
        return null
      }
    }

    function setStubState(tool, obj) {
      h.writeFile(h.stubDir + "/" + tool + ".state.json", JSON.stringify(obj))
    }

    // Tells the service that the compositor reported an event, as the
    // connection to the compositor would: through the service's own seam,
    // without a compositor. Returns false (and fails the case) when the
    // service has no such seam.
    function hyprEvent(name) {
      if (!h.service || typeof h.service._hyprEvent !== "function") {
        h.check(false, "hyprEvent: the service takes no compositor events")
        return false
      }
      h.service._hyprEvent(String(name))
      return true
    }

    // Makes the launcher's leak check see a process no stub recorded.
    function recordPid(name, pid) {
      var n = Number(pid)
      if (!(n > 0) || Math.floor(n) !== n) { h.check(false, "recordPid " + name); return }
      h.writeFile(h.stubDir + "/" + name + "." + n + ".pid", String(n))
    }

    // Calls then(names) with the recorded processes that are still running,
    // as "<tool>.<pid>". Empty when every recorded child is gone.
    function alive(then) {
      h.exec(["/usr/bin/sh", "-c", h._aliveScript, "oj-alive", h.runDir], null, function(code, out) {
        then(out.split("\n").filter(function(name) { return name !== "" }))
      })
    }

    function ready() {
      console.log("OJ-READY")
    }

    // ---- Files and programs, for set-up and inspection only ----

    // Runs a real program outside the plugin's runner and calls
    // then(exitCode, stdout). The exit code is -1 when the program could not
    // be started.
    function exec(argv, stdin, then) {
      var proc = execComponent.createObject(h, {
        command: argv,
        input: typeof stdin === "string" ? stdin : "",
        stdinEnabled: typeof stdin === "string",
        then: typeof then === "function" ? then : function() {}
      })
      proc.running = true
    }

    function readFile(path) {
      var view = fileComponent.createObject(h, { path: path, blockLoading: true })
      var text = view.text()
      view.destroy()
      return text
    }

    // What the yt-dlp stub prints for a lookup that asks for fields, worked
    // out a second time. argv is the command line of the lookup, with
    // "--print %(.{a,b,c})j" in it, and record the JSON text of everything
    // the stub knows. The answer is those fields in the order asked,
    // without the ones the record lacks or holds as null, on one line and
    // with nothing outside ASCII left unescaped.
    function printed(argv, record) {
      var names = argv[argv.indexOf("--print") + 1].slice(4, -3).split(",")
      var whole = JSON.parse(record)
      var kept = {}
      for (var i = 0; i < names.length; i++) {
        var held = whole[names[i]]
        if (held !== undefined && held !== null) kept[names[i]] = held
      }
      return JSON.stringify(kept).replace(/[\u007f-\uffff]/g, function(unit) {
        return "\\u" + ("000" + unit.charCodeAt(0).toString(16)).slice(-4)
      }) + "\n"
    }

    // FileView does not write an empty text at all: the file would keep
    // what it had, or not come to exist. A case that asks for one is told,
    // and makes it with exec instead.
    function writeFile(path, text) {
      if (String(text) === "") { h.check(false, "writeFile cannot write an empty file"); return }
      var view = fileComponent.createObject(h, { path: path, blockWrites: true })
      view.setText(text)
      view.destroy()
    }

    // ---- Waiting ----

    // Polls predicate every 25 ms. Calls then(true) once it returned
    // something true, or then(false) after ms milliseconds; never before
    // waitFor returns.
    function waitFor(predicate, ms, then) {
      h._waiters.push({ predicate: predicate, until: Date.now() + ms, then: then })
      poller.start()
    }

    function after(ms, then) {
      h.waitFor(function() { return false }, ms, function() { then() })
    }

    function _poll() {
      var waiting = h._waiters
      var due = []
      h._waiters = []
      for (var i = 0; i < waiting.length; i++) {
        var met = false
        try {
          met = waiting[i].predicate() ? true : false
        } catch (error) {
          met = false
        }
        if (met || Date.now() >= waiting[i].until) due.push({ then: waiting[i].then, met: met })
        else h._waiters.push(waiting[i])
      }
      if (h._waiters.length === 0) poller.stop()
      for (var k = 0; k < due.length; k++) h._guard(due[k].then, [due[k].met])
    }

    // Runs a callback of the case. A case that throws would otherwise sit
    // silent until the deadline.
    function _guard(callback, args) {
      if (h._finished || typeof callback !== "function") return
      try {
        callback.apply(null, args)
      } catch (error) {
        console.warn("harness: the case threw: " + error)
        h.check(false, "the case threw")
        h.finish()
      }
    }

    // ---- Asserting ----

    // Passes only for the boolean true, so that a function which answers
    // with a message or an object instead of true cannot pass by accident.
    function check(condition, label) {
      h._total += 1
      if (condition === true) return true
      h._failed.push(typeof condition === "boolean" ? String(label) : label + " (not a boolean)")
      return false
    }

    function equal(a, b, label) {
      var got = JSON.stringify(a)
      var want = JSON.stringify(b)
      if (got !== want) {
        console.warn("harness: " + label + ": got " + String(got).slice(0, 400) + ", want "
          + String(want).slice(0, 400))
      }
      return h.check(got === want, label)
    }

    // A vector argument that source text cannot carry is described instead
    // of written out (see tests/node/load.js, which expands the same forms).
    function _expand(arg) {
      if (arg === null || typeof arg !== "object" || Array.isArray(arg)) return arg
      if (typeof arg.gen !== "string") return arg
      if (arg.gen === "repeat") return new Array(arg.count + 1).join(String(arg.unit))
      if (arg.gen === "codes") return String.fromCharCode.apply(null, arg.codes)
      throw new Error("unknown generator: " + arg.gen)
    }

    // Runs a tests/vectors table against the module the case imported; one
    // assertion per entry. table is the CASES array or the vector module.
    function vectors(module, table) {
      var cases = Array.isArray(table) ? table : (table ? table.CASES : null)
      if (!module || !Array.isArray(cases) || cases.length === 0) {
        h.check(false, "vectors: no table")
        return
      }
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i]
        var label = "vector " + i + " " + c.fn
        if (typeof module[c.fn] !== "function") { h.check(false, label + ": no such function"); continue }
        var want = c.expect && c.expect.throws === true ? "throws" : JSON.stringify(c.expect)
        var got
        try {
          got = JSON.stringify(module[c.fn].apply(null, c.args.map(h._expand)))
        } catch (error) {
          got = "throws"
        }
        if (got !== want) {
          console.warn("harness: " + label + ": got " + String(got).slice(0, 300) + ", want "
            + String(want).slice(0, 300))
        }
        h.check(got === want, label)
      }
    }

    // ---- Finishing ----

    // Prints the result line the launcher looks for, destroys what was
    // created and quits. A case without a single assertion does not pass.
    function finish() {
      if (h._finished) return
      h._finished = true
      deadline.stop()
      poller.stop()
      h._waiters = []
      var passed = h._total - h._failed.length
      if (h._failed.length === 0 && h._total > 0) {
        console.log("OJ-RESULT PASS " + h.caseName + " " + passed + "/" + h._total)
      } else {
        var labels = h._total > 0 ? h._failed.slice(0, 20).join("; ") : "no assertion ran"
        console.log("OJ-RESULT FAIL " + h.caseName + " " + passed + "/" + h._total + " " + labels)
      }
      var created = h._mounted.concat(h.service ? [h.service] : [])
      for (var i = created.length - 1; i >= 0; i--) {
        try {
          created[i].destroy()
        } catch (error) {
          // The case destroyed it already.
        }
      }
      // Quitting from inside a handler is lost while the configuration is
      // still loading, so it always goes through the event loop.
      Qt.callLater(Qt.quit)
    }

    // ---- Start-up ----

    function _readConsts() {
      var text = 'import QtQuick\nimport "file://' + h.repo + '/lib/Const.js" as Const\n'
        + "QtObject {\n"
        + "  readonly property var tools: Const.TOOLS\n"
        + "  readonly property string pluginId: Const.PLUGIN_ID\n"
        + "  readonly property string version: Const.VERSION\n"
        + "  readonly property string dirName: Const.DIR_NAME\n"
        + "}\n"
      try {
        h._consts = Qt.createQmlObject(text, h, "consts")
      } catch (error) {
        console.warn("harness: cannot read lib/Const.js: " + error)
        return false
      }
      // A copy: the stubs go into the copy and Const.TOOLS stays what it is.
      var tools = {}
      for (var name in h._consts.tools) tools[name] = h._consts.tools[name]
      for (var stub in h.stubFiles) tools[stub] = h.repo + "/tests/stubs/" + h.stubFiles[stub]
      h.tools = tools
      return true
    }

    function _readManifest() {
      var manifest = { id: h._consts.pluginId, version: h._consts.version }
      try {
        var parsed = JSON.parse(h.readFile(h.repo + "/manifest.json"))
        if (typeof parsed.id === "string") manifest.id = parsed.id
        if (typeof parsed.version === "string") manifest.version = parsed.version
      } catch (error) {
        // Component cases run before the manifest exists; a service case
        // asserts on it below.
        manifest.missing = true
      }
      h.manifest = manifest
    }

    function _start() {
      deadline.start()
      if (h.repo === "" || h.runDir === "" || h.caseName === "" || !h._readConsts()) {
        h.check(false, "harness environment")
        h.finish()
        return
      }
      h._readManifest()
      facade.barConfig = { position: "top", layout: { left: [], center: [], right: [{ id: h.manifest.id }] } }

      var url = "file://" + h.repo + "/tests/harness/cases/" + h.caseName + ".qml"
      var component = Qt.createComponent(url, Component.PreferSynchronous)
      var object = component.status === Component.Ready ? component.createObject(h) : null
      if (object === null || typeof object.run !== "function") {
        console.warn("harness: cannot load the case: " + component.errorString())
        h.check(false, "load the case")
        h.finish()
        return
      }
      h._caseObject = object

      var begun = false
      var begin = function() {
        if (begun) return
        begun = true
        h._begin()
      }
      if (typeof object.setup === "function") h._guard(object.setup, [h, begin])
      else begin()
    }

    function _begin() {
      var object = h._caseObject
      if (object.kind !== "service") {
        h._guard(object.run, [h])
        return
      }
      h.check(h.manifest.missing !== true, "manifest.json is readable")
      if (!h._createService()) { h.finish(); return }
      Qt.callLater(function() {
        if (object.inject !== false) h.injectNow()
        h._guard(object.run, [h])
      })
    }

    // The launcher signals this process only by the PID recorded here.
    Component.onCompleted: h.writeFile(h.runDir + "/qs.pid", String(Quickshell.processId))

    // What the service is handed as its shell: it records what it is asked
    // and keeps a bar configuration the way the host does.
    QtObject {
      id: facade

      property var barConfig: null
      // What isPluginOpen answers. Set by the case.
      property bool panelShown: false
      property var calls: []

      function _record(name, args) {
        facade.calls.push({ name: name, args: Array.prototype.slice.call(args) })
      }

      function summon(id, payload) {
        facade._record("summon", arguments)
        return true
      }

      function hide(id) {
        facade._record("hide", arguments)
        return true
      }

      function toggle(id, payload) {
        facade._record("toggle", arguments)
        return true
      }

      function isPluginOpen(id) {
        facade._record("isPluginOpen", arguments)
        return facade.panelShown
      }

      // The host replaces the whole entry with { id } plus what it is given
      // and hands out a fresh copy of the configuration.
      function updateEntryInline(id, settings) {
        facade._record("updateEntryInline", arguments)
        if (id !== h.manifest.id || settings === null || typeof settings !== "object") return false
        var next = { id: id }
        for (var key in settings) {
          if (key !== "id") next[key] = settings[key]
        }
        var config = JSON.parse(JSON.stringify(facade.barConfig))
        var sections = ["left", "center", "right"]
        var changed = false
        for (var s = 0; s < sections.length; s++) {
          var list = config.layout ? config.layout[sections[s]] : null
          if (!Array.isArray(list)) continue
          for (var i = 0; i < list.length; i++) {
            if (!list[i] || list[i].id !== id || JSON.stringify(list[i]) === JSON.stringify(next)) continue
            list[i] = next
            changed = true
          }
        }
        if (changed) facade.barConfig = config
        return changed
      }
    }

    // A case is loaded from a timer, not during load: a quit requested
    // while the configuration loads is lost.
    Timer {
      id: starter
      interval: 50
      running: true
      onTriggered: h._start()
    }

    Timer {
      id: deadline
      interval: 50000
      onTriggered: {
        h.check(false, "the case did not finish in 50 s")
        h.finish()
      }
    }

    // The only repeating timer in the repository.
    Timer {
      id: poller
      interval: 25
      repeat: true
      onTriggered: h._poll()
    }

    Component {
      id: execComponent

      Process {
        id: proc

        required property var then
        property string input: ""
        property bool sawStarted: false
        property bool reported: false

        function report(exitCode) {
          if (proc.reported) return
          proc.reported = true
          var out = collector.text
          h._guard(proc.then, [exitCode, out])
          proc.destroy()
        }

        stdout: StdioCollector {
          id: collector
          waitForEnd: true
        }
        onStarted: {
          sawStarted = true
          if (stdinEnabled) { write(input); stdinEnabled = false }
        }
        onExited: function(exitCode, exitStatus) { proc.report(exitStatus === 0 ? exitCode : 128 + exitCode) }
        onRunningChanged: if (!running && !sawStarted) proc.report(-1)
      }
    }

    Component {
      id: fileComponent

      FileView {
        printErrors: false
        watchChanges: false
      }
    }
  }
}
