import QtQuick

// The IPC handler itself, reached the way a user's key binding reaches it:
// through Quickshell's command-line client. The client is started by the
// harness instance, so it has the same scrubbed environment and can find no
// instance but this one, under the run's private runtime directory. What it
// prints must be what the code behind the handler answers, and the methods
// it lists must be exactly the documented ones.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property var methods: [
    "close(): string", "enqueue(target: string): string", "next(): string", "open(): string",
    "output(name: string): string", "play(target: string): string", "playPause(): string",
    "previous(): string", "search(query: string): string", "status(): string", "stop(): string",
    "toggle(): string", "video(action: string): string"
  ]

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.becomesReady, root.status, root.show, root.refusals, root.panel, root.plays, root.searches,
      root.unknownMethod, root.quiet
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // Waits for something that has to happen, and says so when it does not.
  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  // Runs the client against this instance: then(exitCode, stdout).
  function client(args, then) {
    var h = root.h
    h.exec(["/usr/bin/quickshell", "ipc", "-p", h.repo + "/tests/harness/shell.qml"].concat(args), null, then)
  }

  function call(args, then) {
    root.client(["call", root.h.manifest.id].concat(args), then)
  }

  function becomesReady() {
    root.until("ready", function() { return root.h.service.ready }, 5000, root.next)
  }

  function status() {
    var h = root.h
    root.call(["status"], function(code, out) {
      h.equal(code, 0, "status: the client succeeds")
      h.equal(out, h.service._ipcStatus() + "\n", "status: what the client prints is the service's answer")
      h.equal(JSON.parse(out).state, "idle", "status: and it is the JSON of an idle service")
      root.next()
    })
  }

  // The client lists the methods in no particular order.
  function show() {
    var h = root.h
    root.client(["show"], function(code, out) {
      var lines = out.split("\n").filter(function(line) { return line !== "" })
      h.equal(code, 0, "show: the client succeeds")
      h.equal(lines[0], "target " + h.manifest.id, "show: one target, ours")
      var listed = lines.slice(1).map(function(line) { return line.replace(/^\s*function\s+/, "") }).sort()
      h.equal(listed, root.methods, "show: exactly the documented methods, strings in and out")
      root.next()
    })
  }

  function refusals() {
    var h = root.h
    root.call(["play", "file:///etc/hostname"], function(code, out) {
      h.equal(out, "invalid\n", "refusal: a file address is no video")
      root.call(["search", "localhost/x?token=abc"], function(code2, out2) {
        h.equal(out2, "invalid\n", "refusal: an address is no query")
        root.call(["play", "--", "--exec=x"], function(code3, out3) {
          h.equal(out3, "invalid\n", "refusal: an option is no video")
          h.equal([h.service.playbackState, h.service.searchState, h.log("ytdlp").length],
            ["idle", "idle", 0], "refusal: nothing was started")
          root.next()
        })
      })
    })
  }

  function panel() {
    var h = root.h
    var id = h.manifest.id
    root.call(["toggle"], function(code, out) {
      h.equal(out, "ok\n", "panel: toggle is taken")
      h.equal(h.shell.calls.slice(-1), [{ name: "toggle", args: [id, ""] }], "panel: and reaches the host")
      root.next()
    })
  }

  function plays() {
    var h = root.h
    var s = h.service
    root.call(["play", root.idA], function(code, out) {
      h.equal(out, "ok\n", "play: a bare id is taken")
      root.until("play: it plays", function() { return s.playbackState === "playing" }, 8000, function() {
        root.call(["playPause"], function(code2, out2) {
          h.equal(out2, "ok\n", "play: pause is taken")
          root.until("play: paused", function() { return s.playbackState === "paused" }, 5000, function() {
            root.call(["stop"], function(code3, out3) {
              h.equal([out3, s.playbackState], ["ok\n", "idle"], "play: stopped")
              root.until("play: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
                root.next)
            })
          })
        })
      })
    })
  }

  function searches() {
    var h = root.h
    var s = h.service
    root.call(["search", "some words"], function(code, out) {
      h.equal(out, "ok\n", "search: taken")
      h.equal(s.searchQuery, "some words", "search: the query is the service's now")
      h.equal(h.shell.calls.slice(-1)[0].name, "summon", "search: the panel is opened on it")
      root.until("search: results", function() { return s.searchState === "results" }, 8000, function() {
        s.clearSearch()
        root.next()
      })
    })
  }

  // There is no method that takes a command, a path or a setting, and the
  // client says so itself: the service is never asked.
  function unknownMethod() {
    var h = root.h
    var calls = h.shell.calls.length
    var answers = ["ok\n", "invalid\n", "unavailable\n", "unhandled\n"]
    root.call(["run", "/usr/bin/true"], function(code, out) {
      h.equal(answers.indexOf(out), -1, "unknown method: no answer of the service")
      root.call(["acknowledgeProxy"], function(code2, out2) {
        h.equal(answers.indexOf(out2), -1, "unknown method: the proxy notice cannot be answered from outside")
        root.call(["play"], function(code3, out3) {
          h.equal(answers.indexOf(out3), -1, "unknown method: a method without its argument is not called")
          h.equal([h.shell.calls.length, h.service.playbackState], [calls, "idle"],
            "unknown method: nothing reached the service")
          root.next()
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, "some words", "etc/hostname",
      "token="]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, and no argument")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
