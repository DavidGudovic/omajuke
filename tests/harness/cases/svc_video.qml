import QtQuick

// The video window through the whole service: the real player against the
// stub mpv, and the real compositor access against the stub hyprctl. A
// window opens only after the compositor took the rule that floats it; the
// picture is a second stream that is added to every track anew; a reload
// of the compositor's configuration registers the rule again, once for a
// burst of reloads; and a picture that could not be opened is looked up
// again without touching the file the playing track still reads.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

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
    h.scenario({ ytdlp: "ok", mpv: "ok", hyprctl: "ok" })
    root.steps = [
      root.becomesReady, root.nothingToShow, root.shows, root.reloads, root.trackChanges, root.pictureFails,
      root.closedByTheCompositor, root.overIpc, root.brokenConfiguration, root.remembers, root.ends,
      root.quiet
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

  function videoIs(name) {
    return function() { return root.h.service.videoState === name }
  }

  // What mpv was sent, by the name of the command or of the property set.
  function sent(name) {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return command[0] === name || (command[0] === "set_property" && command[1] === name)
    })
  }

  // The lines the compositor was asked to run.
  function lines() {
    return root.h.log("hyprctl").filter(function(entry) { return entry.argv[0] === "eval" })
      .map(function(entry) { return entry.argv[2] })
  }

  function desktop() {
    return root.h.stubState("hyprctl") || {}
  }

  function change(values) {
    var state = root.desktop()
    for (var key in values) state[key] = values[key]
    root.h.setStubState("hyprctl", state)
  }

  function plays(label, id, then) {
    var s = root.h.service
    root.h.check(s.playTrack(root.row(id)), label + ": a track is taken")
    root.until(label + ": it plays", function() {
      return s.playbackState === "playing" && s.currentTrack.id === id
    }, 8000, then)
  }

  function becomesReady() {
    var h = root.h
    root.until("ready", function() { return h.service.ready }, 5000, function() {
      h.equal([h.service.videoState, h.service.videoNote], ["hidden", ""], "ready: no window, nothing to say")
      root.next()
    })
  }

  // Without a track there is no picture to show, and nobody is asked.
  function nothingToShow() {
    var h = root.h
    var s = h.service
    h.equal([s.showVideo(), s.toggleVideo(), s.hideVideo()], [false, false, false],
      "nothing plays: nothing to show or hide")
    h.equal(h.log("hyprctl").length, 0, "nothing plays: the compositor was not asked")
    root.plays("first track", root.idA, root.next)
  }

  function shows() {
    var h = root.h
    var s = h.service
    h.equal(h.parts.sponsor.videoHidden, true, "show: no picture is seen yet")
    h.equal(s._ipcVideo("show"), "ok", "show: taken")
    h.equal(s._ipcVideo("show"), "unhandled", "show: a second request while the first runs changes nothing")
    root.until("show: the picture is there", root.videoIs("shown"), 8000, function() {
      h.equal([root.lines().length, root.desktop().ruleCount], [1, 1], "show: the rule was registered, once")
      h.check(/^if _G\.__omajuke_rule ~= /.test(root.lines()[0]), "show: by the one line there is for it")
      var mpv = h.log("mpv").map(function(line) { return line.command })
      var names = mpv.map(function(command) {
        return command[0] === "set_property" ? command[1] : command[0]
      })
      var window = names.indexOf("force-window")
      h.check(window !== -1 && window < names.indexOf("video-add"),
        "show: mpv keeps a window before the picture is added")
      var adds = root.sent("video-add")
      h.equal(adds.length, 1, "show: one picture was added")
      h.check(/^https:\/\/[a-z0-9.-]+\.googlevideo\.com\//.test(adds[0][1]),
        "show: from the lookup's address")
      h.equal(root.sent("vid").length, 1, "show: and selected")
      h.equal(root.sent("stop-screensaver").slice(-1)[0][2], "yes", "show: the screen stays awake")
      h.equal([s.videoNote, JSON.parse(s._ipcStatus()).video, h.parts.sponsor.videoHidden],
        ["", "shown", false], "show: the surface, the status and the parts agree")
      root.next()
    })
  }

  // The compositor loaded its configuration again. A burst of such events
  // leads to one line, and what the line does is up to the compositor: a
  // rule that survived is left alone, one that was wiped is made again.
  function reloads() {
    var h = root.h
    var told = h.parts.hypr._reloads
    h.hyprEvent("configreloaded")
    h.hyprEvent("openwindow")
    h.hyprEvent("configreloaded")
    h.hyprEvent("configreloaded")
    h.equal(h.parts.hypr._reloads, told + 3, "reload: the compositor access hears of each one at once")
    h.equal(root.lines().length, 1, "reload: and nothing is sent yet")
    root.until("reload: the rule is sent again", function() { return root.lines().length === 2 }, 5000,
      function() {
        h.after(700, function() {
          h.equal([root.lines().length, root.desktop().ruleCount], [2, 1],
            "reload: one line for the burst, and a rule that was kept is not doubled")
          root.change({ rule: "" })
          h.hyprEvent("configreloaded")
          root.until("reload: a wiped rule is registered again", function() {
            return root.desktop().ruleCount === 2
          }, 5000, function() {
            h.equal([root.lines().length, h.service.videoState], [3, "shown"],
              "reload: by one more line, and the window stays")
            root.next()
          })
        })
      })
  }

  // The window stays across tracks; the picture is added to each of them.
  function trackChanges() {
    var h = root.h
    var s = h.service
    var rules = root.lines().length
    root.plays("second track", root.idB, function() {
      root.until("second track: its picture is there", function() {
        return s.videoState === "shown" && root.sent("video-add").length === 2
      }, 8000, function() {
        h.equal(root.sent("force-window").filter(function(command) { return command[2] === "no" }).length, 0,
          "second track: the window was never given up")
        h.equal(root.lines().length, rules, "second track: a window that stays open needs no rule")
        root.next()
      })
    })
  }

  // The address of a picture can be refused while the sound plays on. It
  // is asked for once more, and the file mpv reads the track from stays
  // what and where it was.
  function pictureFails() {
    var h = root.h
    var s = h.service
    var resolver = h.parts.resolver
    var lookups = h.log("ytdlp").length
    h.scenario({ ytdlp: "ok", mpv: "video-fail:1", hyprctl: "ok" })
    root.plays("refused picture", root.idC, function() {
      var file = resolver.entry(root.idC).file
      var text = h.readFile(file)
      root.until("refused picture: the second address is taken", function() {
        return s.videoState === "shown" && root.sent("video-add").length === 4
      }, 8000, function() {
        h.equal(h.log("ytdlp").length, lookups + 2,
          "refused picture: one lookup to play, one for the address")
        h.equal(resolver.entry(root.idC).file, file, "refused picture: the track's file has its name")
        h.check(text !== "" && h.readFile(file) === text, "refused picture: and its content")
        h.equal(s.playbackState, "playing", "refused picture: the sound never stopped")
        h.scenario({ ytdlp: "ok", mpv: "ok", hyprctl: "ok" })
        root.next()
      })
    })
  }

  // The user closes the window with the compositor's own key.
  function closedByTheCompositor() {
    var h = root.h
    var s = h.service
    h.inject("mpv", ["keypress", "CLOSE_WIN"])
    root.until("closed: the service follows", root.videoIs("hidden"), 5000, function() {
      root.until("closed: mpv keeps no window", function() {
        var last = root.sent("force-window").slice(-1)[0]
        return last !== undefined && last[2] === "no"
      }, 5000, function() {
        h.equal([s.playbackState, h.parts.video.wanted], ["playing", false], "closed: the track plays on")
        root.next()
      })
    })
  }

  function overIpc() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcVideo("toggle"), "ok", "ipc: toggle shows")
    root.until("ipc: shown", root.videoIs("shown"), 8000, function() {
      h.equal(s._ipcVideo("toggle"), "ok", "ipc: toggle hides")
      root.until("ipc: hidden", root.videoIs("hidden"), 5000, function() {
        h.equal(s._ipcVideo("hide"), "unhandled", "ipc: nothing left to hide")
        root.next()
      })
    })
  }

  // A configuration with errors: nothing is sent into the compositor, so
  // no window may open, and the surface says why.
  function brokenConfiguration() {
    var h = root.h
    var s = h.service
    var sentBefore = root.lines().length
    var adds = root.sent("video-add").length
    root.change({ configErrors: "a line of the user's configuration" })
    h.check(s.showVideo(), "broken configuration: the request is taken")
    root.until("broken configuration: the reason is shown", function() {
      return s.videoNote === "E_HYPR_ERRORS"
    }, 5000, function() {
      h.equal([s.videoState, root.lines().length, root.sent("video-add").length],
        ["hidden", sentBefore, adds], "broken configuration: no line was sent and no window opened")
      h.check(s.errorText(s.videoNote) !== "", "broken configuration: there is a sentence for it")
      root.change({ configErrors: "" })
      root.next()
    })
  }

  // Where the user left the window is read when it is hidden, kept per
  // monitor, and forgotten on request.
  function remembers() {
    var h = root.h
    var s = h.service
    h.check(s.showVideo(), "remember: shown again")
    root.until("remember: shown", root.videoIs("shown"), 8000, function() {
      root.change({ clients: [
        { "class": "OmaJuke", title: "x", at: [5, 35], size: [960, 540], floating: true, fullscreen: 0 }
      ] })
      h.check(s.hideVideo(), "remember: hidden")
      root.until("remember: the place is kept", function() {
        return Object.keys(h.parts.store.values.video).length === 1
      }, 5000, function() {
        h.equal(h.parts.store.values.video["DP-1"], { corner: "top-left", widthPct: 50 },
          "remember: the corner and the width, for that monitor")
        s.resetVideoPlacement()
        h.equal(Object.keys(h.parts.store.values.video), [], "remember: forgotten on request")
        root.change({ clients: [] })
        root.next()
      })
    })
  }

  function ends() {
    var h = root.h
    var s = h.service
    h.check(s.showVideo(), "end: shown once more")
    root.until("end: shown", root.videoIs("shown"), 8000, function() {
      h.check(s.stop(), "end: stopped")
      h.equal(s.videoState, "hidden", "end: no window without a track")
      var gone = function() { return h.parts.player.mpvState === "off" }
      root.until("end: mpv is gone", gone, 5000, function() {
        h.equal([h.parts.runner.active, h.parts.runner.waiting], [0, 0], "end: no job is left")
        root.next()
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, root.idC, "googlevideo"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no address")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
