import QtQuick

// The whole service when a track that was handed to mpv does not play, or
// breaks off: one new lookup and one more load where that can help, the
// error state where it cannot, and never a loop. The lookups are counted in
// the yt-dlp stub's records and the loads in what the mpv stub received.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0
  // Counts taken at the start of a step.
  property int lookups: 0
  property int loads: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"

  // Related tracks are another case's subject. Here the user has switched
  // them off, so a queue ends where the user's own tracks end.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [
      root.becomesReady, root.firstPlay, root.agedAddress, root.deadAddress, root.triedAgain, root.brokeOff,
      root.brokeOffTwice, root.quiet
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
    return { id: id, title: "A track", channel: "A channel", duration: 600, live: false }
  }

  function loadCommands() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return command[0] === "loadfile"
    })
  }

  function mark() {
    root.lookups = root.h.log("ytdlp").length
    root.loads = root.loadCommands().length
  }

  // Lookups and loads since the last mark.
  function since() {
    return [root.h.log("ytdlp").length - root.lookups, root.loadCommands().length - root.loads]
  }

  function plays() {
    return root.h.service.playbackState === "playing"
  }

  function failed() {
    return root.h.service.playbackState === "error"
  }

  function mpvOff() {
    return root.h.parts.player.mpvState === "off"
  }

  // The name of the one info file there is.
  function infoFiles(then) {
    root.h.exec(["/usr/bin/ls", "-A", root.h.parts.fs.paths.infoDir], null, function(code, out) {
      then(out.split("\n").filter(function(name) { return name !== "" }))
    })
  }

  function stopped(label, then) {
    root.h.check(root.h.service.stop(), label + ": stopped")
    root.until(label + ": mpv is gone", root.mpvOff, 5000, then)
  }

  // A panel stays open for the whole case: a lookup then outlives a stop, so
  // the next play of the same video starts from one that was made earlier.
  function becomesReady() {
    var h = root.h
    root.until("ready", function() { return h.service.ready }, 5000, function() {
      h.shell.panelShown = true
      h.service.notePanelOpen(true)
      h.equal(h.service.panelOpen, true, "a panel is open")
      root.next()
    })
  }

  function firstPlay() {
    var h = root.h
    root.mark()
    h.check(h.service.playTrack(root.row(root.idA)), "first: taken")
    root.until("first: plays", root.plays, 8000, function() {
      h.equal(root.since(), [1, 1], "first: one lookup, one load")
      root.stopped("first", function() {
        root.infoFiles(function(names) {
          h.equal(names, ["1.json"], "first: the lookup is kept while the panel is open")
          root.next()
        })
      })
    })
  }

  // The address of an earlier lookup no longer opens: mpv fails the file
  // before it starts. One new lookup, one more load, and the track plays.
  function agedAddress() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "load-error" })
    root.mark()
    h.check(s.playTrack(root.row(root.idA)), "aged: taken")
    root.until("aged: plays after all", root.plays, 8000, function() {
      h.equal(root.since(), [1, 2], "aged: one re-resolve and a second loadfile")
      h.equal(s.errorCode, "", "aged: no error was shown for it")
      var loads = root.loadCommands().slice(-2)
      h.equal(loads[0][4]["ytdl-raw-options-append"].slice(-12), "/info/1.json",
        "aged: the first load used the earlier lookup")
      h.equal(loads[1][4]["ytdl-raw-options-append"].slice(-12), "/info/2.json",
        "aged: the second the new one")
      h.equal([loads[0][4].start, loads[1][4].start], [undefined, undefined], "aged: both from the beginning")
      root.infoFiles(function(names) {
        h.equal(names, ["2.json"], "aged: the file of the lookup that was replaced is gone")
        root.stopped("aged", root.next)
      })
    })
  }

  // The address does not open even right after a new lookup: asking again
  // would return the same thing, so this ends in the error state.
  function deadAddress() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "load-error:2" })
    root.mark()
    h.check(s.playTrack(root.row(root.idA)), "dead: taken")
    root.until("dead: ends in the error state", root.failed, 8000, function() {
      h.equal(s.errorCode, "E_STREAM", "dead: the code")
      h.equal(s.errorText(s.errorCode), "YouTube's stream did not open. Try again", "dead: with its text")
      h.equal(root.since(), [1, 2], "dead: one new lookup, two loads, and no third try")
      h.equal([s.hasTrack, s.playing], [true, false], "dead: the track stays current")
      root.until("dead: mpv off", root.mpvOff, 5000, root.next)
    })
  }

  // The play button in the error state always asks YouTube again.
  function triedAgain() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    h.check(s.playPause(), "again: taken")
    root.until("again: plays", root.plays, 8000, function() {
      h.equal(root.since(), [2, 3], "again: one more yt-dlp record and a third loadfile")
      h.equal(s.errorCode, "", "again: the error is gone")
      root.stopped("again", root.next)
    })
  }

  // The connection dies under a playing track, which mpv reports as an early
  // end of the file. The track is looked up again and loaded where it was.
  function brokeOff() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "premature:1500" })
    root.mark()
    h.check(s.playTrack(root.row(root.idB)), "broke off: taken")
    root.until("broke off: plays", root.plays, 8000, function() {
      h.equal(s.duration, 600, "broke off: a long track")
      // The file that plays ends early; the one loaded in its place plays on.
      h.scenario({ ytdlp: "ok", mpv: "ok" })
      root.until("broke off: loaded again", function() { return root.since()[1] === 2 }, 8000, function() {
        root.until("broke off: plays again", root.plays, 8000, function() {
          h.equal(root.since(), [2, 2], "broke off: one new lookup, one reload")
          var reload = root.loadCommands().slice(-1)[0]
          h.check(/^[1-3]$/.test(String(reload[4].start)), "broke off: the reload starts where the track was")
          h.check(s.positionNow() >= Number(reload[4].start), "broke off: and the position says so")
          h.equal(s.errorCode, "", "broke off: no error was shown for it")
          root.stopped("broke off", root.next)
        })
      })
    })
  }

  // It breaks off again right after the reload: the network is the problem,
  // and a track must not be reloaded for ever.
  function brokeOffTwice() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "ok", mpv: "premature:800" })
    root.mark()
    h.check(s.playTrack(root.row(root.idC)), "twice: taken")
    root.until("twice: ends in the error state", root.failed, 10000, function() {
      h.equal(s.errorCode, "E_NETWORK", "twice: the code")
      h.equal(root.since(), [2, 2], "twice: one recovery, then no more")
      root.until("twice: mpv off", root.mpvOff, 5000, function() {
        h.scenario({ ytdlp: "ok", mpv: "ok" })
        h.check(s.stop(), "twice: stopped from the error state")
        h.alive(function(names) {
          h.equal(names, [], "twice: no stub is left running")
          root.next()
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.indexOf("Configuration Loaded") !== -1, "log: readable while the case runs")
    var ids = [root.idA, root.idB, root.idC, "watch?v", "A track", "vid=1"]
    h.equal(ids.filter(function(text) { return log.indexOf(text) !== -1 }), [],
      "log: no id, address or title")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: "].filter(function(mark) {
      return log.indexOf(mark) !== -1
    })
    h.equal(named, [], "log: no message from the plugin")
    root.next()
  }
}
