import QtQuick

// The whole service in a session that has a proxy configured (the launcher
// sets https_proxy for this case alone). No child ever uses a proxy: mpv
// could not use it for media streams, so part of the traffic would leave it
// unnoticed. Instead the service holds every action that would cause a
// request until the user has read that its connections go direct, asks that
// once, and passes no proxy variable to any tool.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok", curl: "ok" })
    root.steps = [
      root.held, root.nothingLeft, root.acknowledged, root.searches, root.plays, root.fetches, root.overIpc,
      root.noProxyAnywhere, root.remembered, root.askedOnce, root.quiet
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

  function row(id) {
    return { id: id, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  function records() {
    var h = root.h
    return [h.log("ytdlp").length, h.log("curl").length, h.log("mpv-start").length]
  }

  // The state file as it is on disk right now, or null.
  function onDisk() {
    try {
      return JSON.parse(root.h.readFile(root.h.runDir + "/sbx/state/omajuke/state.json"))
    } catch (error) {
      return null
    }
  }

  // Everything that would reach the network is asked for, with a panel open
  // so that nothing is held back for another reason.
  function held() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.equal([s.networkHold, s.fatalCode], [true, ""], "held: the service is ready and holds")
      h.check(s.errorText("N_PROXY").indexOf("proxy") !== -1, "held: there is a sentence that says why")
      h.shell.panelShown = true
      s.notePanelOpen(true)
      h.equal(s.submit("some words", false), "empty", "held: a query is not searched")
      h.equal(s.submit("https://youtu.be/" + root.idA, false), "empty", "held: a link is not played")
      h.equal(s.submit("file:///etc/hostname", false), "link", "held: other links are told apart as always")
      h.equal(s.playTrack(root.row(root.idA)), false, "held: a row is not played")
      h.equal(s.playPause(), false, "held: nothing to resume")
      s.wantThumbs([root.idA, root.idB])
      h.equal([s._ipcPlay(root.idA), s._ipcEnqueue(root.idA), s._ipcSearch("some words")],
        ["unavailable", "unavailable", "unavailable"], "held: nothing can be started over IPC")
      h.equal(s._ipcToggle(), "ok", "held: the panel can still be opened, to read the notice")
      root.next()
    })
  }

  function nothingLeft() {
    var h = root.h
    var s = h.service
    h.after(600, function() {
      h.equal(root.records(), [0, 0, 0], "held: zero yt-dlp, curl and mpv records")
      h.equal(h.jobs().map(function(job) { return job.tag }), ["prepare"], "held: no job but the preparation")
      h.equal([s.playbackState, s.searchState, s.searchQuery, s.queue.length], ["idle", "idle", "", 0],
        "held: no state moved, no text was kept")
      h.equal(Object.keys(s.thumbs), [], "held: no picture")
      h.equal(root.onDisk(), null, "held: nothing was saved")
      root.next()
    })
  }

  function acknowledged() {
    var h = root.h
    var s = h.service
    s.acknowledgeProxy()
    h.equal(s.networkHold, false, "acknowledged: the hold ends at once")
    h.after(300, function() {
      h.equal(root.records(), [0, 0, 0],
        "acknowledged: what was refused while held is not started afterwards")
      root.next()
    })
  }

  function searches() {
    var h = root.h
    var s = h.service
    h.equal(s.submit("some words", false), "query", "after: a query is searched")
    root.until("after: results", function() { return s.searchState === "results" }, 8000, root.next)
  }

  function plays() {
    var h = root.h
    var s = h.service
    h.check(s.playTrack(root.row(root.idA)), "after: a row is played")
    root.until("after: it plays", function() { return s.playbackState === "playing" }, 8000, root.next)
  }

  function fetches() {
    var h = root.h
    var s = h.service
    s.wantThumbs([root.idA])
    root.until("after: a picture arrives", function() { return typeof s.thumbs[root.idA] === "string" }, 8000,
      root.next)
  }

  function overIpc() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcPlay(root.idB), "ok", "after: play over IPC is taken")
    root.until("after: it plays", function() {
      return s.playbackState === "playing" && s.currentTrack.id === root.idB
    }, 8000, root.next)
  }

  // The proxy variable is in the environment of this very instance. No tool
  // got it, by any name, and no tool was told about a proxy another way.
  function noProxyAnywhere() {
    var h = root.h
    var starts = h.log("ytdlp").concat(h.log("curl"), h.log("mpv-start"))
    h.equal([h.log("ytdlp").length, h.log("curl").length, h.log("mpv-start").length], [3, 1, 1],
      "after: a search and two lookups, one fetch, one mpv")
    var names = []
    var words = []
    for (var i = 0; i < starts.length; i++) {
      names = names.concat(starts[i].env.filter(function(name) { return /proxy/i.test(name) }))
      words = words.concat(starts[i].argv.filter(function(arg) { return /proxy|127\.0\.0\.1/i.test(arg) }))
    }
    h.equal(names, [], "after: no recorded environment lists a proxy name")
    h.equal(words, [], "after: no command line names a proxy")
    h.check(/proxy|127\.0\.0\.1/i.test(JSON.stringify(h.jobs())) === false, "after: nor does any job")
    root.next()
  }

  function remembered() {
    var h = root.h
    root.until("after: the answer is saved", function() {
      var state = root.onDisk()
      return state !== null && state.proxyAck === true
    }, 5000, root.next)
  }

  // The proxy is still set at the next start, and the question is not asked
  // again.
  function askedOnce() {
    var h = root.h
    h.recreate(function() {
      var s = h.service
      root.until("next start: ready", function() { return s.ready }, 5000, function() {
        h.equal(s.networkHold, false, "next start: no hold")
        h.shell.panelShown = false
        h.check(s.playTrack(root.row(root.idA)), "next start: a row is played")
        var plays = function() { return s.playbackState === "playing" }
        root.until("next start: it plays", plays, 8000, function() {
          h.check(s.stop(), "next start: stopped")
          root.until("next start: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
            root.next)
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, "some words", "127.0.0.1"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no query, no proxy address")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
