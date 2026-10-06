import QtQuick

// The whole service on a machine where a tool it needs is not installed.
// The start-up preparation finds that out, the service says which one is
// missing and starts nothing at all, and once the tool is there, opening a
// panel is enough to get going: no shell restart.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"

  function setup(h, done) {
    h.tools.mpv = "/nonexistent/mpv"
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.reportsMpv, root.startsNothing, root.closingLooksAtNothing, root.reportsYtDlp, root.becomesReady,
      root.plays, root.quiet
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

  function row() {
    return { id: root.idA, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  // Hands the service a tool table with one entry changed, the way only a
  // test can. The table the service was created with is a copy of the
  // harness's, so the change is made to the service's own.
  function setTool(name, path) {
    var tools = {}
    var current = root.h.service.tools
    for (var key in current) tools[key] = current[key]
    tools[name] = path
    root.h.service.tools = tools
  }

  function prepares() {
    return root.h.jobs().filter(function(job) { return job.tag === "prepare" }).length
  }

  function reportsMpv() {
    var h = root.h
    var s = h.service
    root.until("missing mpv: reported", function() { return s.fatalCode !== "" }, 5000, function() {
      h.equal(s.fatalCode, "E_MPV_MISSING", "missing mpv: the code")
      h.equal(s.errorText(s.fatalCode), "mpv is not installed", "missing mpv: with its text")
      h.equal([s.ready, s.playbackState, s.networkHold], [false, "idle", false], "missing mpv: not ready")
      root.next()
    })
  }

  function startsNothing() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcPlay(root.idA), "unavailable", "missing mpv: play over IPC is unavailable")
    h.equal(s._ipcEnqueue(root.idA), "unavailable", "missing mpv: so is enqueue")
    h.equal(s._ipcSearch("some words"), "unavailable", "missing mpv: and search")
    h.equal(s._ipcPlay("file:///etc/hostname"), "invalid", "missing mpv: a bad argument is still refused")
    h.equal(s.playTrack(root.row()), false, "missing mpv: a row is not played")
    h.equal(s.submit("some words", false), "empty", "missing mpv: a query is not searched")
    h.equal(s.submit("https://youtu.be/" + root.idA, false), "empty", "missing mpv: a link is not played")
    h.equal(s.playPause(), false, "missing mpv: nothing to resume")
    s.wantThumbs([root.idA])
    s.setVolume(30)
    h.equal(s.volume, 70, "missing mpv: the volume is left alone")
    h.after(400, function() {
      h.equal([s.playbackState, s.searchState, s.queue.length], ["idle", "idle", 0],
        "missing mpv: no state moved")
      h.equal(h.jobs().map(function(job) { return job.tag }), ["prepare"],
        "missing mpv: only the preparation ran")
      h.equal([h.log("ytdlp").length, h.log("curl").length, h.log("mpv-start").length], [0, 0, 0],
        "missing mpv: no tool was started")
      h.exec(["/usr/bin/ls", "-A", h.parts.fs.paths.stateDir], null, function(code, out) {
        h.equal(out, "", "missing mpv: nothing was saved")
        root.next()
      })
    })
  }

  // Only the opening of a panel looks again, and only while something is
  // missing.
  function closingLooksAtNothing() {
    var h = root.h
    var s = h.service
    s.notePanelOpen(false)
    h.after(300, function() {
      h.equal(root.prepares(), 1, "closing a panel does not look again")
      s.notePanelOpen(true)
      root.until("an opening looks again", function() { return root.prepares() === 2 }, 5000, function() {
        h.equal(s.fatalCode, "E_MPV_MISSING", "still missing: the code stays while it is looked for")
        root.until("still missing: looked", function() { return h.parts.fs.status === "failed" }, 5000,
          function() {
            h.equal([s.fatalCode, s.ready], ["E_MPV_MISSING", false], "still missing: the same answer")
            s.notePanelOpen(false)
            root.next()
          })
      })
    })
  }

  // mpv is there now, yt-dlp is not: the other code.
  function reportsYtDlp() {
    var h = root.h
    var s = h.service
    root.setTool("mpv", h.repo + "/tests/stubs/mpv.js")
    root.setTool("ytdlp", "/nonexistent/yt-dlp")
    s.notePanelOpen(true)
    root.until("missing yt-dlp: reported", function() { return s.fatalCode === "E_YTDLP_MISSING" }, 5000,
      function() {
        h.equal(s.errorText(s.fatalCode), "yt-dlp is not installed", "missing yt-dlp: with its text")
        h.equal([s.ready, s._ipcPlay(root.idA)], [false, "unavailable"],
          "missing yt-dlp: still nothing can start")
        s.notePanelOpen(false)
        root.next()
      })
  }

  function becomesReady() {
    var h = root.h
    var s = h.service
    root.setTool("ytdlp", h.repo + "/tests/stubs/yt-dlp.js")
    h.shell.panelShown = true
    s.notePanelOpen(true)
    root.until("fixed: ready", function() { return s.ready }, 5000, function() {
      h.equal([s.fatalCode, s.playbackState], ["", "idle"], "fixed: no code left")
      var looked = root.prepares()
      s.notePanelOpen(false)
      s.notePanelOpen(true)
      h.after(300, function() {
        h.equal(root.prepares(), looked, "fixed: a later opening prepares nothing again")
        root.next()
      })
    })
  }

  function plays() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcPlay(root.idA), "ok", "fixed: play over IPC is taken")
    root.until("fixed: it plays", function() { return s.playbackState === "playing" }, 8000, function() {
      h.check(s.stop(), "fixed: stopped")
      var gone = function() { return h.parts.player.mpvState === "off" }
      root.until("fixed: mpv is gone", gone, 5000, root.next)
    })
  }

  // The preparation names the tools it looks for in its command line; that
  // is a path of ours, never anything about a track.
  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, "some words"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no query")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
