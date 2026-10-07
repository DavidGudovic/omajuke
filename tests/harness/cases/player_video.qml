import QtQuick
import "../../../lib/Paths.js" as Paths

// core/Player.qml and video, against the mpv stub. A track is loaded
// without video; video is a second track that is added to the file once
// its audio plays, and then selected. This case walks through what the
// video window needs from the player: the facts are known only while they
// are watched, a video is added only from a media address and never in a
// way that makes mpv wait, only a track mpv has listed can be selected,
// nothing is carried over to the next file, the window's close request
// arrives as one signal, and an answer about a file that is no longer the
// current one is never handed on.
QtObject {
  id: root

  readonly property string video: "https://rr1---sn-abc123.googlevideo.com/videoplayback?expire=1&itag=399"
  readonly property string other: "https://rr2---sn-abc123.googlevideo.com/videoplayback?expire=1&itag=398"

  property var h: null
  property var runner: null
  property var fs: null
  property var player: null
  property var signals: []
  // What the callbacks of readTracks and addVideo were handed, in order.
  property var answers: []
  property var steps: []
  property int at: 0

  // yt-dlp only has to be an executable file here: the player hands its
  // path to mpv and never runs it.
  function setup(h, done) {
    h.tools.ytdlp = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ mpv: "ok" })
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.player = h.mount("core/Player.qml", { tools: h.tools, fs: root.fs })
    if (root.runner === null || root.fs === null || root.player === null) { h.finish(); return }
    root.listen()
    root.steps = [
      root.first, root.refuses, root.watches, root.adds, root.selects, root.hides, root.showsAgain,
      root.nextFileHasNone, root.closedByUser, root.addFails, root.noPicture, root.answerForOldFile,
      root.idleHasNoTrack, root.keptForNextMpv, root.withoutMpv
    ]
    root.fs.prepare()
    h.waitFor(function() { return root.fs.status !== "pending" }, 5000, function() {
      h.equal(root.fs.status, "ready", "the runtime folder is prepared")
      root.next()
    })
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function listen() {
    var player = root.player
    player.loading.connect(function(key) { root.signals.push("loading " + key) })
    player.started.connect(function(key) { root.signals.push("started " + key) })
    player.ended.connect(function(key, reason, fileError) {
      root.signals.push(("ended " + key + " " + reason + " " + fileError).trim())
    })
    player.idle.connect(function() { root.signals.push("idle") })
    player.exited.connect(function(crashed) { root.signals.push("exited " + crashed) })
    player.failed.connect(function(code) { root.signals.push("failed " + code) })
    player.videoClosed.connect(function() { root.signals.push("videoClosed") })
  }

  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function plays(key) {
    return function() { return root.player.currentKey === key && root.player.phase === "playing" }
  }

  function load(key) {
    var file = Paths.infoFile(root.fs.paths, key)
    root.player.load(key, "AAAAAAAAAAA", "Track " + key, file, { mode: "replace" })
  }

  // The lines mpv was sent, without the questions about the position.
  function lines() {
    return root.h.log("mpv").filter(function(line) {
      return !(line.command[0] === "get_property" && line.command[1] === "time-pos")
    })
  }

  // The commands since a mark, each as its name and its first argument.
  function since(mark) {
    return root.lines().slice(mark).map(function(line) { return line.command.slice(0, 2).join(" ") })
  }

  function facts() {
    var player = root.player
    return [player.videoTrack, player.externalVideo, player.hasPicture]
  }

  // A callback that writes down what it was handed.
  function noted(label) {
    return function(error, value) { root.answers.push(label + " " + JSON.stringify([error, value])) }
  }

  function answered(count) {
    return function() { return root.answers.length >= count }
  }

  function first() {
    var h = root.h
    root.load(1)
    root.until("the first track plays", root.plays(1), 8000, function() {
      var names = root.since(0)
      h.check(names.indexOf("observe_property 9") === -1 && names.indexOf("observe_property 10") === -1
        && names.indexOf("observe_property 11") === -1, "nothing about video is observed until it is wanted")
      h.equal(root.facts(), [0, 0, false], "no video track, no picture")
      root.next()
    })
  }

  // Nothing but a media address is ever added, and no track that mpv has
  // not listed is ever selected.
  function refuses() {
    var h = root.h
    var mark = root.lines().length
    var bad = [
      "https://media.example/v.mp4", "http://rr1---sn-abc123.googlevideo.com/videoplayback",
      "/srv/video.mkv", "file:///srv/video.mkv", "edl://" + root.video, "", null, undefined, 7, [root.video]
    ]
    root.answers = []
    for (var i = 0; i < bad.length; i++) root.player.addVideo(bad[i], root.noted("add"))
    h.equal(root.answers, [], "an answer never comes from inside the call")
    h.equal([root.player.selectVideo(1), root.player.selectVideo(7), root.player.selectVideo("1"),
      root.player.selectVideo(null)], [false, false, false, false], "a track mpv has not listed is refused")
    root.until("every address was answered", root.answered(bad.length), 2000, function() {
      h.equal(root.answers.filter(function(text) { return text !== "add [\"refused\",0]" }), [],
        "each is refused")
      h.equal(root.since(mark), [], "and mpv was told nothing")
      root.next()
    })
  }

  function watches() {
    var h = root.h
    var mark = root.lines().length
    root.player.setVideoWatch(true)
    root.player.setVideoWatch(true)
    root.player.setForceWindow(true)
    root.answers = []
    root.player.readTracks(root.noted("tracks"))
    root.until("mpv has listed its tracks", root.answered(1), 3000, function() {
      h.equal(root.since(mark), ["observe_property 9", "observe_property 10", "observe_property 11",
        "set_property force-window", "get_property track-list"], "watched once, window forced, tracks read")
      h.equal(root.lines()[mark + 3].command[2], "yes", "forced with a yes")
      h.equal(root.answers, ["tracks [\"\",0]"], "the file has no video of its own")
      root.next()
    })
  }

  function adds() {
    var h = root.h
    var mark = root.lines().length
    root.answers = []
    root.signals = []
    root.player.addVideo(root.video, root.noted("add"))
    root.until("the video was added", root.answered(1), 3000, function() {
      var sent = root.lines().slice(mark)
      h.equal(sent.map(function(line) { return line.command }), [
        ["set_property", "stream-lavf-o", { "request_size": "10485760" }], ["video-add", root.video, "auto"]
      ], "the request size, then the address, not selected")
      h.equal([sent[0].async, sent[1].async], [undefined, true], "mpv is told not to wait for the video")
      h.equal(root.answers, ["add [\"\",0]"], "the answer says it is there")
      h.equal(root.facts(), [0, 1, false], "the added track is known by its id, and not selected")
      root.player.readTracks(root.noted("tracks"))
      root.until("the tracks were read again", root.answered(2), 3000, function() {
        h.equal(root.answers[1], "tracks [\"\",1]", "reading the tracks tells the same id")
        h.equal([root.signals, root.player.phase], [[], "playing"], "the audio played on without a word")
        root.next()
      })
    })
  }

  function selects() {
    var h = root.h
    var mark = root.lines().length
    h.equal(root.player.selectVideo(7), false, "a track that is not there is still refused")
    h.equal(root.player.selectVideo(1), true, "the added track is selected")
    root.player.setKeepAwake(true)
    h.equal(root.player.hasPicture, false, "the picture is not there at once")
    root.until("the picture is there", function() { return root.player.hasPicture }, 3000, function() {
      h.equal(root.facts(), [1, 1, true], "selected, and shown")
      h.equal(root.lines().slice(mark).map(function(line) { return line.command }), [
        ["set_property", "vid", 1], ["set_property", "stop-screensaver", "yes"]
      ], "the selection and the screen kept awake")
      root.next()
    })
  }

  function hides() {
    var h = root.h
    var mark = root.lines().length
    h.equal(root.player.selectVideo(0), true, "no video is always a valid choice")
    root.player.setForceWindow(false)
    root.player.setKeepAwake(false)
    root.until("the picture is gone", function() { return !root.player.hasPicture }, 3000, function() {
      h.equal(root.facts(), [0, 1, false], "nothing selected; the track stays with the file")
      h.equal(root.lines().slice(mark).map(function(line) { return line.command }), [
        ["set_property", "vid", "no"], ["set_property", "force-window", "no"],
        ["set_property", "stop-screensaver", "no"]
      ], "hidden, the window let go, the screen free to sleep")
      root.next()
    })
  }

  // The track is still there: showing again needs no second add.
  function showsAgain() {
    var h = root.h
    root.answers = []
    root.player.readTracks(root.noted("tracks"))
    root.until("the tracks were read", root.answered(1), 3000, function() {
      h.equal(root.answers, ["tracks [\"\",1]"], "the track added earlier is still listed")
      h.check(root.player.selectVideo(1), "and can be selected again")
      root.until("the picture is back", function() { return root.player.hasPicture }, 3000, root.next)
    })
  }

  // mpv does not keep the selection, and the track belonged to the file.
  function nextFileHasNone() {
    var h = root.h
    root.signals = []
    root.load(2)
    h.equal(root.facts(), [1, 1, true], "a load that has not started changes nothing yet")
    root.until("the next track plays", root.plays(2), 5000, function() {
      h.equal(root.signals, ["loading 2", "started 2"], "a replace")
      h.equal(root.facts(), [0, 0, false], "the next file has no video track and none selected")
      h.equal(root.player.selectVideo(1), false, "the old track cannot be selected on it")
      root.answers = []
      root.player.addVideo(root.other, root.noted("add"))
      root.until("a video was added to it", root.answered(1), 3000, function() {
        h.equal([root.answers, root.player.externalVideo], [["add [\"\",0]"], 1], "added anew")
        h.check(root.player.selectVideo(1), "and selected")
        root.until("the picture is there", function() { return root.player.hasPicture }, 3000, root.next)
      })
    })
  }

  // The compositor closes the window. mpv runs what the handshake bound to
  // that request: it hides the video, tells us, and plays on.
  function closedByUser() {
    var h = root.h
    var mark = root.lines().length
    root.signals = []
    h.inject("mpv", ["keypress", "CLOSE_WIN"])
    root.until("the close is reported", function() { return root.signals.length > 0 }, 3000, function() {
      root.until("and the picture is gone", function() { return !root.player.hasPicture }, 3000, function() {
        h.equal(root.signals, ["videoClosed"], "one signal, and nothing about the track")
        h.equal(root.facts(), [0, 1, false], "mpv has hidden the video itself")
        h.equal([root.player.mpvState, root.player.phase, root.player.currentKey], ["running", "playing", 2],
          "mpv did not quit: the track plays on")
        h.equal(root.since(mark), [], "the player sent nothing: what follows is for the window's owner")
        root.next()
      })
    })
  }

  function addFails() {
    var h = root.h
    h.scenario({ mpv: "video-fail:1" })
    root.answers = []
    root.signals = []
    root.player.addVideo(root.video, root.noted("add"))
    root.until("the failure is told", root.answered(1), 3000, function() {
      h.equal(root.answers, ["add [\"error running command\",0]"], "mpv's own word for it")
      h.equal([root.player.externalVideo, root.signals, root.player.phase], [1, [], "playing"],
        "no track was added, and the audio plays on")
      root.player.addVideo(root.video, root.noted("add"))
      root.until("a second attempt is answered", root.answered(2), 3000, function() {
        h.equal([root.answers[1], root.player.externalVideo], ["add [\"\",0]", 2],
          "it works, and the newest track is the one that counts")
        h.scenario({ mpv: "ok" })
        root.next()
      })
    })
  }

  // A track that is selected and never shows a picture: the player reports
  // what is, and how long to wait is the window's business.
  function noPicture() {
    var h = root.h
    h.scenario({ mpv: "no-picture" })
    h.check(root.player.selectVideo(2), "the newer track is selected")
    root.until("mpv has selected it", function() { return root.player.videoTrack === 2 }, 3000, function() {
      h.after(300, function() {
        h.equal(root.facts(), [2, 2, false], "selected, and still no picture")
        h.scenario({ mpv: "ok" })
        root.next()
      })
    })
  }

  // An add that is still on its way when the track changes. mpv gives it up
  // and answers; the answer is about a file that is gone and is not handed
  // on, and neither is a late list of tracks.
  function answerForOldFile() {
    var h = root.h
    h.scenario({ mpv: "video-hang" })
    root.answers = []
    root.player.addVideo(root.video, root.noted("add"))
    h.after(100, function() {
      h.scenario({ mpv: "slow-reply:150" })
      var mark = root.lines().length
      root.player.readTracks(root.noted("tracks"))
      // The stub holds an answer by the scenario it reads when it answers:
      // only the question about the tracks is to be slow, so the next track
      // is loaded once mpv has that question, not before.
      var asked = function() {
        return root.since(mark).indexOf("get_property track-list") !== -1
      }
      root.until("mpv has the question about the tracks", asked, 3000, function() {
        h.scenario({ mpv: "ok" })
        root.load(3)
        root.until("the next track plays", root.plays(3), 5000, function() {
          h.after(400, function() {
            h.equal(root.answers, [], "neither answer reached its callback")
            h.equal(root.facts(), [0, 0, false], "and the new file starts without video")
            root.next()
          })
        })
      })
    })
  }

  function idleHasNoTrack() {
    var h = root.h
    var mark = root.lines().length
    root.player.stopPlayback()
    root.answers = []
    root.player.addVideo(root.video, root.noted("add"))
    root.player.readTracks(root.noted("tracks"))
    root.until("both are answered", root.answered(2), 3000, function() {
      h.equal(root.answers, ["add [\"idle\",0]", "tracks [\"idle\",0]"], "no track, nothing to add to")
      h.equal(root.since(mark), ["stop"], "and mpv was only told to stop")
      root.next()
    })
  }

  // The watch is an intent, not a state of one mpv: the next one is told
  // again, in its handshake.
  function keptForNextMpv() {
    var h = root.h
    root.player.shutdown()
    h.equal(root.facts(), [0, 0, false], "after shutdown: nothing is known")
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      var mark = root.lines().length
      root.load(4)
      root.until("a new mpv plays", root.plays(4), 8000, function() {
        var told = root.since(mark)
        var load = told.indexOf("loadfile https://www.youtube.com/watch?v=AAAAAAAAAAA")
        var watch = [told.indexOf("observe_property 9"), told.indexOf("observe_property 10"),
          told.indexOf("observe_property 11")]
        h.check(watch[0] !== -1 && watch[0] < watch[1] && watch[1] < watch[2] && watch[2] < load,
          "the new mpv is told to report video before the first load")
        var before = root.lines().length
        root.player.setVideoWatch(false)
        h.after(200, function() {
          var unwatched = ["unobserve_property 9", "unobserve_property 10", "unobserve_property 11"]
          h.equal(root.since(before), unwatched, "and told to stop when video is no longer wanted")
          root.next()
        })
      })
    })
  }

  function withoutMpv() {
    var h = root.h
    root.player.shutdown()
    root.until("mpv is gone", function() { return root.player.mpvState === "off" }, 5000, function() {
      var mark = root.lines().length
      var starts = h.log("mpv-start").length
      root.answers = []
      root.player.addVideo(root.video, root.noted("add"))
      root.player.readTracks(root.noted("tracks"))
      root.player.setForceWindow(true)
      root.player.setKeepAwake(true)
      root.player.setVideoWatch(true)
      h.equal([root.player.selectVideo(0), root.player.selectVideo(1)], [false, false], "nothing to select")
      root.until("both are answered", root.answered(2), 3000, function() {
        h.equal(root.answers, ["add [\"disconnected\",0]", "tracks [\"disconnected\",0]"],
          "without an mpv the answer says so")
        h.equal([root.since(mark), h.log("mpv-start").length, root.player.mpvState], [[], starts, "off"],
          "and none of it starts one")
        root.next()
      })
    })
  }
}
