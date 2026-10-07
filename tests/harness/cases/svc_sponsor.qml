import QtQuick

// Sponsor skipping through the whole service: the real player against the
// stub mpv, and the lookup against the stub curl. The user is asked once,
// by a question that waits in the panel and opens nothing. Until the
// answer is yes, the segment database hears nothing at all. After a yes
// each track gets one lookup, which names a bucket of videos and not the
// video, and a segment is jumped over with every panel closed.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"
  readonly property string opening: "url = \"https://sponsor.ajay.app/api/skipSegments/"

  // Related tracks are another case's subject. Here the user has switched
  // them off, so a queue ends where the user's own tracks end.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok", curl: "ok", sponsor: "ok" })
    // What the database knows: a stretch of the first track, and one of a
    // video that merely shares its bucket.
    h.setStubState("curl", { sponsor: [
      { videoID: "zzzzzzzzzzz", segments: [root.segment(0, 190)] },
      { videoID: root.idA, segments: [root.segment(1, 60)] }
    ] })
    root.steps = [
      root.becomesReady, root.asked, root.saysNo, root.switchedOn, root.skips, root.nextTrack,
      root.switchedOff, root.quiet
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

  function segment(from, to) {
    return { category: "sponsor", actionType: "skip", segment: [from, to], videoDuration: 200 }
  }

  function row(id) {
    return { id: id, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  function lookups() {
    return root.h.log("curl").filter(function(record) {
      return typeof record.stdin === "string" && record.stdin.indexOf("skipSegments") !== -1
    })
  }

  function commands(name) {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return command[0] === name
    })
  }

  function entryCalls() {
    return root.h.shell.calls.filter(function(call) { return call.name === "updateEntryInline" })
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
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.equal([s.settings.sponsorSkip, s.sponsorPrompt, s.lastSkip], ["ask", false, null],
        "ready: not decided, and nothing is asked before something plays")
      root.next()
    })
  }

  // The first track raises the question. Nothing is looked up for it.
  function asked() {
    var h = root.h
    var s = h.service
    root.plays("asked", root.idA, function() {
      h.equal(s.sponsorPrompt, true, "asked: the question waits")
      h.after(500, function() {
        h.equal([root.lookups().length, h.log("curl").length], [0, 0],
          "asked: nothing was looked up meanwhile")
        var opened = h.shell.calls.filter(function(call) {
          return call.name === "summon" || call.name === "toggle"
        })
        h.equal(opened, [], "asked: and no panel was opened for the question")
        root.next()
      })
    })
  }

  function saysNo() {
    var h = root.h
    var s = h.service
    var id = h.manifest.id
    s.answerSponsorPrompt(false)
    h.equal([s.sponsorPrompt, s.settings.sponsorSkip], [false, "off"],
      "no: answered, and the setting says off")
    h.equal(root.entryCalls().slice(-1)[0].args, [id, { id: id, autoplay: false, sponsorSkip: false }],
      "no: the answer went to the host as the setting")
    root.plays("no", root.idB, function() {
      h.after(400, function() {
        h.equal([root.lookups().length, s.sponsorPrompt], [0, false],
          "no: nothing is looked up, and the question is not asked again")
        root.next()
      })
    })
  }

  // Switched on in the settings while a track plays: that track gets its
  // one lookup at that moment.
  function switchedOn() {
    var h = root.h
    var s = h.service
    root.plays("on", root.idA, function() {
      h.equal(root.commands("observe_property").filter(function(command) {
        return command[2] === "time-pos"
      }).length, 0, "on: nobody watches the position so far")
      h.check(s.setSetting("sponsorSkip", true), "on: the setting is taken")
      h.equal(s.settings.sponsorSkip, "on", "on: at once")
      root.until("on: the track is looked up", function() { return root.lookups().length === 1 }, 5000,
        function() {
          var record = root.lookups()[0]
          h.check(record.stdin.indexOf(root.opening) === 0
            && /^[0-9a-f]{4}\?/.test(record.stdin.slice(root.opening.length)),
            "on: the address names a bucket of four hash digits")
          h.check(record.stdin.indexOf(root.idA) === -1 && record.argv.join(" ").indexOf(root.idA) === -1,
            "on: the video's id is nowhere in the request")
          h.check(record.argv.join(" ").indexOf("sponsor.ajay.app") === -1,
            "on: the address travels on standard input only")
          h.equal(record.env.filter(function(name) { return /proxy|cookie/i.test(name) }), [],
            "on: the request carries nothing of the session")
          root.next()
        })
    })
  }

  // No panel is open and no page watches the position. The segment is
  // seen all the same, and jumped over once.
  function skips() {
    var h = root.h
    var s = h.service
    // The step before saw the lookup go out; its answer may still be on
    // its way.
    root.until("skip: the answer is in", function() { return h.parts.sponsor.watching }, 5000, function() {
      h.equal([s.panelOpen, h.parts.sponsor.watching], [false, true],
        "skip: a segment lies ahead, no panel open")
      root.skipped()
    })
  }

  function skipped() {
    var h = root.h
    var s = h.service
    root.until("skip: the segment is jumped over", function() { return s.lastSkip !== null }, 8000,
      function() {
        h.equal([s.lastSkip.category, s.lastSkip.to], ["sponsor", 60], "skip: to the end of the segment")
        h.check(s.lastSkip.from >= 1 && s.lastSkip.from < 59.5, "skip: from inside it")
        h.equal(root.commands("seek"), [["seek", 60, "absolute"]], "skip: mpv was told once")
        h.check(s.positionNow() >= 60, "skip: the position is behind the segment")
        root.until("skip: the position is no longer watched", function() {
          return h.parts.sponsor.watching === false && root.commands("unobserve_property").length === 1
        }, 5000, function() {
          root.until("skip: the note goes away by itself", function() { return s.lastSkip === null }, 8000,
            function() {
              h.equal([root.commands("seek").length, s.playbackState], [1, "playing"],
                "skip: once, and the track plays on")
              root.next()
            })
        })
      })
  }

  // The next track is looked up when it starts. The database knows no
  // stretch of it, only one of a video in the same bucket, and nothing is
  // skipped.
  function nextTrack() {
    var h = root.h
    var s = h.service
    h.setStubState("curl", { sponsor: [{ videoID: "zzzzzzzzzzz", segments: [root.segment(0, 190)] }] })
    root.plays("next track", root.idC, function() {
      root.until("next track: one lookup of its own", function() { return root.lookups().length === 2 }, 5000,
        function() {
          h.after(1500, function() {
            h.equal([root.commands("seek").length, h.parts.sponsor.watching, s.lastSkip], [1, false, null],
              "next track: a stretch of another video moves nothing")
            root.next()
          })
        })
    })
  }

  function switchedOff() {
    var h = root.h
    var s = h.service
    h.check(s.setSetting("sponsorSkip", false), "off: the setting is taken")
    root.plays("off", root.idB, function() {
      h.after(400, function() {
        h.equal(root.lookups().length, 2, "off: nothing is looked up any more")
        h.check(s.stop(), "off: stopped")
        root.until("off: mpv is gone", function() { return h.parts.player.mpvState === "off" }, 5000,
          root.next)
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idB, root.idC, "skipSegments"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, no lookup")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
