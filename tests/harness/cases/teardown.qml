import QtQuick

// The whole service when the plugin is disabled or removed, or the shell
// exits: the host takes its facade away and destroys the service. Whatever
// was running then (mpv with a track, a lookup, a thumbnail fetch) is gone,
// the runtime directory is empty, and nothing was written to the state file
// on the way out.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0
  // Kept from before the service is destroyed.
  property string runtimeDir: ""
  property string stamp: ""

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"

  // Related tracks are another case's subject. Here the user has switched
  // them off, so a queue ends where the user's own tracks end.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok", curl: "ok" })
    root.steps = [
      root.becomesReady, root.fills, root.inFlight, root.before, root.serviceEnds, root.processesGone,
      root.nothingWritten, root.quiet
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

  function stateFile() {
    return root.h.runDir + "/sbx/state/omajuke/state.json"
  }

  // What is inside the runtime directory, as sorted relative names.
  function contents(then) {
    root.h.exec(["/usr/bin/find", root.runtimeDir, "-mindepth", "1", "-printf", "%P\\n"], null,
      function(code, out) {
        then(out.split("\n").filter(function(name) { return name !== "" }).sort())
      })
  }

  // The time the state file was last written, to the nanosecond.
  function written(then) {
    root.h.exec(["/usr/bin/stat", "-c", "%y", root.stateFile()], null, function(code, out) { then(out) })
  }

  function becomesReady() {
    var h = root.h
    root.until("ready", function() { return h.service.ready }, 5000, function() {
      root.runtimeDir = h.parts.fs.paths.runtimeDir
      h.shell.panelShown = true
      h.service.notePanelOpen(true)
      root.next()
    })
  }

  // A track plays, its row has a picture, and the state file has been
  // written.
  function fills() {
    var h = root.h
    var s = h.service
    var row = { id: root.idA, title: "A track", channel: "A channel", duration: 200, live: false }
    h.check(s.playTrack(row), "a track is taken")
    s.wantThumbs([root.idA, root.idB])
    root.until("it plays", function() { return s.playbackState === "playing" }, 8000, function() {
      root.until("the pictures arrive", function() { return typeof s.thumbs[root.idB] === "string" }, 8000,
        function() {
          root.until("the state is saved", function() {
            return h.readFile(root.stateFile()).indexOf(root.idA) !== -1
          }, 5000, root.next)
        })
    })
  }

  // And a search and a thumbnail fetch are still running when the end
  // comes: neither tool will answer by itself.
  function inFlight() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "hang", mpv: "ok", curl: "hang" })
    h.equal(s.submit("some words", false), "query", "a search is started")
    s.wantThumbs(["CCCCCCCCCCC"])
    root.until("both tools hang", function() { return h.parts.runner.active === 2 }, 5000, function() {
      root.toolsUp(100)
    })
  }

  // The runner has started both tools some time before their stubs have
  // written the files that say they run: waits for those, tries times at
  // most, and goes on either way (before says what is missing).
  function toolsUp(tries) {
    var h = root.h
    h.alive(function(alive) {
      var up = alive.map(function(name) { return name.split(".")[0] })
      if ((up.indexOf("curl") !== -1 && up.indexOf("ytdlp") !== -1) || tries <= 0) {
        root.next()
        return
      }
      h.after(50, function() { root.toolsUp(tries - 1) })
    })
  }

  function before() {
    var h = root.h
    root.contents(function(names) {
      h.equal(names, ["deno", "info", "info/1.json", "jar", "mpv.sock", "signin", "thumbs", "thumbs/1.jpg",
        "thumbs/2.jpg", "ytcache"], "before: the runtime directory is in use")
      h.alive(function(alive) {
        var tools = alive.map(function(name) { return name.split(".")[0] }).sort()
        h.equal(tools, ["curl", "mpv", "ytdlp"], "before: mpv, a lookup and a fetch are running")
        root.written(function(stamp) {
          root.stamp = stamp
          h.check(stamp !== "", "before: the state file is there")
          root.next()
        })
      })
    })
  }

  // What the host does: the facade goes first, then the service.
  function serviceEnds() {
    var h = root.h
    var until = Date.now() + 5000
    h.revoke()
    h.service.destroy()
    h.service = null
    h.parts = null
    var look = function() {
      root.contents(function(names) {
        if (names.length > 0 && Date.now() < until) { h.after(50, look); return }
        h.equal(names, [], "after: the runtime directory is empty")
        h.exec(["/usr/bin/ls", "-A", h.runDir + "/omajuke"], null, function(code, out) {
          h.equal([code, out], [0, ""], "after: the directory itself is still there, with nothing in it")
          root.next()
        })
      })
    }
    look()
  }

  function processesGone() {
    var h = root.h
    var until = Date.now() + 4000
    var look = function() {
      h.alive(function(alive) {
        if (alive.length > 0 && Date.now() < until) { h.after(50, look); return }
        h.equal(alive, [], "after: no recorded process is alive")
        root.next()
      })
    }
    look()
  }

  // Longer than a save takes to start: none was left to start.
  function nothingWritten() {
    var h = root.h
    h.after(1200, function() {
      root.written(function(stamp) {
        h.equal(stamp, root.stamp, "after: the state file was not written on the way out")
        root.contents(function(names) {
          h.equal(names, [], "after: and the runtime directory stays empty")
          root.next()
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, "some words"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no query")
    root.next()
  }
}
