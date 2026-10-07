import QtQuick

// The whole service while a track plays: pause and resume, a new track over
// a paused one, seeking, volume and mute from the panel and from a media
// key, the settings that reach mpv and yt-dlp, and the position watch. What
// mpv was told is read from the mpv stub's record; what was saved, from the
// state file.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"
  // What the stub's lookup says every video is called.
  readonly property string title: "A,vid=1 \"q\""
  readonly property string filter: "@omajuke-norm:dynaudnorm=f=250:g=31:p=0.9"

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
      root.becomesReady, root.pauses, root.newTrackOverPause, root.resumes, root.seeks, root.volume,
      root.mediaKey, root.saved, root.evenVolume, root.refusedSettings, root.height, root.watch,
      root.missedClose, root.ends
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

  // What mpv was sent, without the questions about the position.
  function sent() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return !(command[0] === "get_property" && command[1] === "time-pos")
    })
  }

  // How often mpv was sent exactly this command.
  function count(command) {
    var text = JSON.stringify(command)
    return root.sent().filter(function(found) { return JSON.stringify(found) === text }).length
  }

  function wasSent(command) {
    return function() { return root.count(command) > 0 }
  }

  function state(name) {
    return function() { return root.h.service.playbackState === name }
  }

  // The state file as it is on disk right now, or null.
  function onDisk() {
    try {
      return JSON.parse(root.h.readFile(root.h.parts.fs.paths.stateFile))
    } catch (error) {
      return null
    }
  }

  function settingsCalls() {
    return root.h.shell.calls.filter(function(call) { return call.name === "updateEntryInline" })
  }

  function becomesReady() {
    var h = root.h
    root.until("ready", function() { return h.service.ready }, 5000, function() {
      h.shell.panelShown = true
      h.service.notePanelOpen(true)
      h.check(h.service.playTrack(root.row(root.idA)), "a track is taken")
      root.until("it plays", root.state("playing"), 8000, root.next)
    })
  }

  function pauses() {
    var h = root.h
    var s = h.service
    h.check(s.playPause(), "pause: taken")
    root.until("pause: paused", root.state("paused"), 5000, function() {
      h.equal([s.paused, s.playing, s.hasTrack], [true, false, true], "pause: the derived facts")
      h.equal(s.tooltip, "Paused: " + root.title, "pause: the icon says so")
      h.equal(root.count(["set_property", "pause", true]), 1, "pause: mpv was told once")
      var position = s.positionNow()
      h.after(300, function() {
        h.equal(s.positionNow(), position, "pause: the position stands still")
        h.equal(h.parts.player.mpvState, "running", "pause: mpv stays")
        root.next()
      })
    })
  }

  // mpv keeps its pause across files. It is started with the option that
  // lifts the pause at every new file; the stub honours that option only if
  // it was given it, like the real one.
  function newTrackOverPause() {
    var h = root.h
    var s = h.service
    h.check(h.log("mpv-start")[0].argv.indexOf("--reset-on-next-file=pause") !== -1,
      "over a pause: mpv was started with the option")
    h.check(s.playTrack(root.row(root.idB)), "over a pause: another track is taken")
    // The old track is still in mpv, with its length, while the new one is
    // looked up; the seek bar must not act on either.
    h.equal([s.playbackState, s.currentTrack.id, s.seekable, s.seekTo(10)],
      ["resolving", root.idB, false, false],
      "over a pause: nothing can be sought in while the new track is on its way")
    root.until("over a pause: it plays", root.state("playing"), 8000, function() {
      h.equal([s.paused, s.playing, s.currentTrack.id], [false, true, root.idB], "over a pause: not paused")
      h.equal(h.log("mpv-start").length, 1, "over a pause: in the same mpv")
      h.equal(root.count(["set_property", "pause", false]), 0, "over a pause: without being told to resume")
      root.next()
    })
  }

  function resumes() {
    var h = root.h
    var s = h.service
    h.check(s.playPause(), "resume: paused first")
    root.until("resume: paused", root.state("paused"), 5000, function() {
      h.check(s.playPause(), "resume: taken")
      root.until("resume: plays", root.state("playing"), 5000, function() {
        h.equal(root.count(["set_property", "pause", false]), 1, "resume: mpv was told once")
        h.equal(root.sent().filter(function(command) { return command[0] === "loadfile" }).length, 2,
          "resume: in place, without a new load")
        root.next()
      })
    })
  }

  function seeks() {
    var h = root.h
    var s = h.service
    h.equal([s.duration, s.seekable], [200, true], "seek: the track can be sought in")
    h.check(s.seekTo(50), "seek: taken")
    h.equal(s.position, 50, "seek: the position is the target at once")
    h.check(s.seekTo(1000000), "seek: far past the end is taken")
    h.equal(s.position, 199, "seek: and clamped to the last second")
    h.check(s.seekTo(-3), "seek: before the start is taken")
    h.equal(s.position, 0, "seek: and clamped to the start")
    h.equal(s.seekTo(NaN), false, "seek: not a number is refused")
    h.check(s.seekTo(120.5), "seek: a fraction is taken")
    h.check(s.previous(), "previous: starts the track again")
    h.equal(s.position, 0, "previous: at the beginning")
    h.equal(s.next(), false, "next: there is nothing to go on to")
    root.until("seek: mpv got the last one", function() { return root.count(["seek", 0, "absolute"]) === 2 },
      5000, function() {
        var seeks = root.sent().filter(function(command) { return command[0] === "seek" })
        h.equal(seeks, [["seek", 50, "absolute"], ["seek", 199, "absolute"], ["seek", 0, "absolute"],
          ["seek", 120.5, "absolute"], ["seek", 0, "absolute"]], "seek: the commands, in order")
        root.until("seek: playing again", root.state("playing"), 5000, root.next)
      })
  }

  function volume() {
    var h = root.h
    var s = h.service
    s.setVolume(40)
    h.equal(s.volume, 40, "volume: set at once")
    s.nudgeVolume(5)
    h.equal(s.volume, 45, "volume: nudged up")
    s.nudgeVolume(-10)
    h.equal(s.volume, 35, "volume: nudged down")
    s.nudgeVolume(500)
    h.equal(s.volume, 100, "volume: not above 100")
    s.setVolume(-7)
    h.equal(s.volume, 0, "volume: not below 0")
    s.setVolume(62)
    s.toggleMute()
    h.equal([s.volume, s.muted], [62, true], "volume: muted")
    root.until("volume: mpv got them", root.wasSent(["set_property", "mute", true]), 5000, function() {
      var volumes = root.sent().filter(function(command) { return command[1] === "volume" })
      h.equal(volumes.map(function(command) { return command[2] }), [40, 45, 35, 100, 0, 62],
        "volume: every value went to mpv, clamped")
      h.equal(JSON.parse(s._ipcStatus()).volume, 62, "volume: the status shows it")
      root.next()
    })
  }

  // A media key or the desktop's volume control changes mpv directly. mpv
  // accepts a volume above its maximum that way; the service follows what
  // mpv reports and puts the volume back into range.
  function mediaKey() {
    var h = root.h
    var s = h.service
    h.inject("mpv", ["set_property", "volume", 150])
    h.inject("mpv", ["set_property", "mute", false])
    root.until("media key: followed", function() { return s.volume === 100 && s.muted === false }, 5000,
      function() {
        var clamped = root.wasSent(["set_property", "volume", 100])
        root.until("media key: mpv is put back into range", clamped, 5000, root.next)
      })
  }

  function saved() {
    var h = root.h
    root.until("saved: volume and mute reach the state file", function() {
      var state = root.onDisk()
      return state !== null && state.volume === 100 && state.muted === false && state.recents.length === 2
    }, 5000, function() {
      var state = root.onDisk()
      h.equal(Object.keys(state), ["version", "volume", "muted", "proxyAck", "prefs", "recents", "queue"],
        "saved: the file has these keys and no others")
      h.equal([state.version, state.proxyAck, state.prefs], [1, false, { autoplay: false }],
        "saved: the one choice that was made is kept beside the lists")
      var track = { id: root.idB, title: root.title, channel: "c", duration: 5, live: false }
      h.equal(state.recents.map(function(recent) { return recent.id }), [root.idB, root.idA],
        "saved: the recent tracks, newest first")
      h.equal(state.recents[0], track, "saved: a track has its five fields")
      var item = { id: root.idB, title: root.title, channel: "c", duration: 5, live: false, auto: false }
      h.equal(state.queue, { items: [item], index: 0 }, "saved: the queue, without the key of this run")
      h.exec(["/usr/bin/stat", "-c", "%a", h.parts.fs.paths.stateFile, h.parts.fs.paths.stateDir], null,
        function(code, out) {
          h.equal(out, "600\n700\n", "saved: a private file in a private folder")
          root.next()
        })
    })
  }

  // The setting goes to the host as a whole entry, and mpv gets the filter
  // while it runs.
  function evenVolume() {
    var h = root.h
    var s = h.service
    var id = h.manifest.id
    h.equal([s.settings.evenVolume, root.count(["af", "add", root.filter])], [false, 0], "even: off at first")
    h.check(s.setSetting("evenVolume", true), "even: switching on is taken")
    h.equal(s.settings.evenVolume, true, "even: on at once")
    h.equal(root.settingsCalls().slice(-1)[0].args, [id, { id: id, autoplay: false, evenVolume: true }],
      "even: the host was handed the whole entry")
    root.until("even: mpv adds the filter", root.wasSent(["af", "add", root.filter]), 5000, function() {
      h.check(s.setSetting("evenVolume", false), "even: switching off is taken")
      h.equal(s.settings.evenVolume, false, "even: off at once")
      root.until("even: mpv removes the filter", root.wasSent(["af", "remove", "@omajuke-norm"]), 5000,
        function() {
          h.equal([root.count(["af", "add", root.filter]), root.count(["af", "remove", "@omajuke-norm"])],
            [1, 1], "even: one command each")
          root.next()
        })
    })
  }

  function refusedSettings() {
    var h = root.h
    var s = h.service
    var calls = root.settingsCalls().length
    var bad = [
      ["evenVolume", "banana"], ["tools", "/usr/bin/sh"], ["__proto__", true], ["constructor", true],
      ["rememberHistory", 0], ["maxHeight", 4320], ["id", "x"], ["exec", "x"], ["", true]
    ]
    for (var i = 0; i < bad.length; i++) {
      h.equal(s.setSetting(bad[i][0], bad[i][1]), false, "refused setting " + i)
    }
    h.equal(root.settingsCalls().length, calls, "refused settings: the host was not called")
    h.equal(Object.keys(s.settings).sort(), ["autoplay", "evenVolume", "keepAwake", "markWatched",
      "maxHeight", "preload", "rememberHistory", "sponsorSkip", "videoCorner", "videoSize"],
      "refused settings: the settings are still the ten")
    root.next()
  }

  // A setting only ever picks one of the constant command lines.
  function height() {
    var h = root.h
    var s = h.service
    h.check(s.setSetting("maxHeight", 1080), "height: taken")
    h.equal(s.settings.maxHeight, 1080, "height: set at once")
    h.check(s.playTrack(root.row(root.idC)), "height: another track is taken")
    root.until("height: it plays", function() {
      return s.playbackState === "playing" && s.currentTrack.id === root.idC
    }, 8000, function() {
      var lookups = h.log("ytdlp")
      var formats = lookups.map(function(record) { return record.argv[record.argv.indexOf("-f") + 1] })
      h.equal(formats, ["bestvideo[height<=?720]+bestaudio/best", "bestvideo[height<=?720]+bestaudio/best",
        "bestvideo[height<=?1080]+bestaudio/best"], "height: the third lookup asks for the larger picture")
      root.next()
    })
  }

  // mpv reports the position only while a main page looks at it.
  function watch() {
    var h = root.h
    var s = h.service
    var observe = ["observe_property", 7, "time-pos"]
    var unobserve = ["unobserve_property", 7]
    h.equal(root.count(observe), 0, "watch: not observed while nobody looks")
    s.setPositionWatch(true)
    s.setPositionWatch(true)
    root.until("watch: observed", root.wasSent(observe), 5000, function() {
      var first = s.position
      root.until("watch: the position follows mpv", function() { return s.position > first + 0.25 }, 5000,
        function() {
          s.setPositionWatch(false)
          h.after(200, function() {
            h.equal([root.count(observe), root.count(unobserve)], [1, 0],
              "watch: one page left, one still looks")
            s.setPositionWatch(false)
            root.until("watch: no longer observed", root.wasSent(unobserve), 5000, function() {
              s.setPositionWatch(false)
              s.setPositionWatch(true)
              root.until("watch: the count does not go below zero", function() {
                return root.count(observe) === 2
              }, 5000, root.next)
            })
          })
        })
    })
  }

  // A panel went away without saying so (the bar was rebuilt under it). The
  // host knows that none is open, and at the next track change the service
  // asks: the position is no longer observed and no panel counts as open.
  function missedClose() {
    var h = root.h
    var s = h.service
    var unobserve = ["unobserve_property", 7]
    h.equal([s.panelOpen, root.count(unobserve)], [true, 1], "missed close: a panel and a page count as open")
    h.check(s.playTrack(root.row(root.idA)), "missed close: a track change with the panel really open")
    root.until("missed close: it plays", function() {
      return s.playbackState === "playing" && s.currentTrack.id === root.idA
    }, 8000, function() {
      h.equal([s.panelOpen, root.count(unobserve)], [true, 1], "missed close: the counts stand")
      h.shell.panelShown = false
      h.check(s.playTrack(root.row(root.idB)), "missed close: a track change after the panel vanished")
      var givenUp = function() { return root.count(unobserve) === 2 }
      root.until("missed close: the watch is given up", givenUp, 8000, function() {
        h.equal(s.panelOpen, false, "missed close: no panel counts as open")
        root.until("missed close: the track plays", root.state("playing"), 8000, root.next)
      })
    })
  }

  function ends() {
    var h = root.h
    var s = h.service
    h.check(s.stop(), "end: stopped")
    root.until("end: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000, function() {
      var log = h.readFile(h.runDir + "/out.txt")
      var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, root.idC, "vid=1"]
      h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
        "log: no message from the plugin, no id, no title")
      h.alive(function(names) {
        h.equal(names, [], "end: no stub is left running")
        root.next()
      })
    })
  }
}
