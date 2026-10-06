import QtQuick

// The whole service at rest. With nothing playing and no panel open there
// is no child process, no running timer and no connection to mpv, and the
// files of looked-up tracks are gone: they hold media addresses signed for
// this machine. Every way playback ends has to arrive there, also when a
// panel went away without saying so.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok", curl: "ok" })
    root.steps = [
      root.becomesReady, root.stoppedUnderAPanel, root.panelCloses, root.closedWhilePlaying,
      root.stoppedWithoutAPanel, root.trackEnds, root.panelVanished, root.quiet
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

  // Every timer in the service's object tree, found the way the tree is
  // built: an item's visual children and its other child objects.
  function timers(object, found, depth) {
    if (!object || depth > 8) return found
    var isTimer = typeof object.interval === "number" && typeof object.running === "boolean"
      && typeof object.restart === "function"
    if (isTimer) found.push(object)
    var lists = [object.children, object.resources]
    for (var l = 0; l < lists.length; l++) {
      var list = lists[l]
      for (var i = 0; list && i < list.length; i++) root.timers(list[i], found, depth + 1)
    }
    return found
  }

  function running() {
    return root.timers(root.h.service, [], 0).filter(function(timer) { return timer.running }).length
  }

  // What can be read at once: jobs that exist or wait, timers that run,
  // and whether mpv exists.
  function busy() {
    var parts = root.h.parts
    return [parts.runner.active, parts.runner.waiting, root.running(), parts.player.mpvState]
  }

  function infoFiles(then) {
    root.h.exec(["/usr/bin/ls", "-A", root.h.parts.fs.paths.infoDir], null, function(code, out) {
      then(out.split("\n").filter(function(name) { return name !== "" }))
    })
  }

  // The service comes to rest (the last save is written a moment after the
  // last change), and then stays there: nothing wakes up by itself.
  function atRest(label, then) {
    var h = root.h
    root.until(label + ": comes to rest", function() {
      return JSON.stringify(root.busy()) === JSON.stringify([0, 0, 0, "off"])
    }, 6000, function() {
      var jobs = h.jobs().length
      h.after(1200, function() {
        h.equal(root.busy(), [0, 0, 0, "off"], label + ": no job, no running timer, no mpv")
        h.equal(h.jobs().length, jobs, label + ": nothing was started while at rest")
        h.equal(h.service.playbackState, "idle", label + ": idle")
        h.alive(function(names) {
          h.equal(names, [], label + ": no recorded process is alive")
          root.infoFiles(function(files) {
            h.equal(files, [], label + ": the info folder is empty")
            then()
          })
        })
      })
    })
  }

  function plays(label, id, then) {
    var s = root.h.service
    root.h.check(s.playTrack(root.row(id)), label + ": a track is taken")
    root.until(label + ": it plays", function() { return s.playbackState === "playing" }, 8000, then)
  }

  function becomesReady() {
    var h = root.h
    root.until("ready", function() { return h.service.ready }, 5000, function() {
      var all = root.timers(h.service, [], 0)
      h.check(all.length >= 6, "the service's timers can be seen")
      h.equal(all.filter(function(timer) { return timer.repeat }).length, 0, "none of them repeats")
      root.atRest("at start", root.next)
    })
  }

  // A stop while a panel is open keeps the lookup: the row is right there
  // to be played again.
  function stoppedUnderAPanel() {
    var h = root.h
    var s = h.service
    h.shell.panelShown = true
    s.notePanelOpen(true)
    s.setPositionWatch(true)
    root.plays("under a panel", root.idA, function() {
      s.wantThumbs([root.idA])
      root.until("under a panel: the picture arrives", function() {
        return typeof s.thumbs[root.idA] === "string"
      }, 8000, function() {
        h.check(s.stop(), "under a panel: stopped")
        root.until("under a panel: comes to rest", function() {
          return JSON.stringify(root.busy()) === JSON.stringify([0, 0, 0, "off"])
        }, 6000, function() {
          h.equal([s.playbackState, s.panelOpen], ["idle", true], "under a panel: idle, the panel still open")
          root.infoFiles(function(files) {
            h.equal(files, ["1.json"], "under a panel: the lookup is kept")
            root.next()
          })
        })
      })
    })
  }

  function panelCloses() {
    var h = root.h
    var s = h.service
    h.shell.panelShown = false
    s.setPositionWatch(false)
    s.notePanelOpen(false)
    h.equal(s.panelOpen, false, "panel closes: none is open")
    root.atRest("panel closes", root.next)
  }

  // Closing the panel while a track plays removes nothing: the lookups of
  // the last few tracks stay until playback has come to rest.
  function closedWhilePlaying() {
    var h = root.h
    var s = h.service
    h.shell.panelShown = true
    s.notePanelOpen(true)
    root.plays("closed while playing", root.idA, function() {
      h.check(s.playTrack(root.row(root.idC)), "closed while playing: a second track is taken")
      root.until("closed while playing: it plays", function() {
        return s.playbackState === "playing" && s.currentTrack.id === root.idC
      }, 8000, function() {
        h.shell.panelShown = false
        s.notePanelOpen(false)
        h.after(400, function() {
          root.infoFiles(function(files) {
            h.equal(files.length, 2, "closed while playing: both lookups are still there")
            h.equal(s.playbackState, "playing", "closed while playing: and the track plays on")
            h.check(s.stop(), "closed while playing: stopped")
            root.atRest("closed while playing", root.next)
          })
        })
      })
    })
  }

  function stoppedWithoutAPanel() {
    var h = root.h
    var s = h.service
    root.plays("no panel", root.idB, function() {
      root.infoFiles(function(files) {
        h.equal(files.length, 1, "no panel: the playing track has its lookup")
        h.check(s.stop(), "no panel: stopped")
        root.atRest("no panel", root.next)
      })
    })
  }

  // A track that plays to its end leaves the service as a stop does.
  function trackEnds() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "eof:400", curl: "ok" })
    root.plays("track ends", root.idC, function() {
      root.until("track ends: idle by itself", function() { return s.playbackState === "idle" }, 5000,
        function() {
          h.equal([s.hasTrack, s.queueIndex, s.errorCode], [false, -1, ""], "track ends: no track, no error")
          h.scenario({ ytdlp: "ok", mpv: "ok", curl: "ok" })
          root.atRest("track ends", root.next)
        })
    })
  }

  // The counts say that a panel is open and a page watches the position,
  // but the host knows better: the panel went away without its reports.
  // Before the files are kept for it, the host is asked.
  function panelVanished() {
    var h = root.h
    var s = h.service
    root.plays("vanished", root.idA, function() {
      s.notePanelOpen(true)
      s.setPositionWatch(true)
      h.equal(s.panelOpen, true, "vanished: a panel counts as open")
      h.check(s.stop(), "vanished: stopped")
      root.atRest("vanished", function() {
        h.equal(s.panelOpen, false, "vanished: the host was asked, and no panel counts as open")
        root.next()
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, root.idC]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id")
    root.next()
  }
}
