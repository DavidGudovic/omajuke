import QtQuick
import "../../../lib/Const.js" as Const

// core/Resolver.qml and entries that have grown old, against the yt-dlp
// stub and the real file tools. The media addresses in an entry stop
// working after some hours, so an old entry counts as absent for whoever
// wants to play from it: a play, the next track of a queue and a rested
// highlight all look the video up anew, and the old file goes only when the
// new one is in place. What must not make an old entry young again, or take
// it away while playback still needs it, is checked as well. The age limit
// is shortened for single steps to make the entries of this case old.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var resolver: null
  property var steps: []
  property int at: 0
  readonly property int usual: 18000000
  readonly property string movedUrl: "https://rr2---sn-test.googlevideo.com/videoplayback"
    + "?id=synthetic&itag=247"

  // prepare only asks whether mpv is an executable file.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.resolver = h.mount("core/Resolver.qml", {
      runner: root.runner, tools: h.tools, fs: root.fs, settings: { maxHeight: 720, preload: true },
      panelOpen: true
    })
    if (root.runner === null || root.fs === null || root.resolver === null) { h.finish(); return }
    root.steps = [
      root.young, root.oldForAPlay, root.oldForTheQueue, root.oldUnderTheHighlight, root.pictureKeepsTheAge,
      root.failureKeepsTheOld, root.oldButNeeded, root.quiet
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // The id made of one letter eleven times over.
  function vid(letter) {
    return new Array(12).join(letter)
  }

  function infoFile(n) {
    return root.fs.paths.infoDir + "/" + n + ".json"
  }

  function starts() {
    return root.h.log("ytdlp").length
  }

  // then(names): the files in the info folder, sorted.
  function listing(then) {
    var find = ["/usr/bin/find", root.fs.paths.infoDir, "-mindepth", "1", "-printf", "%f\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  // Calls then() once no job is left, running or waiting.
  function settled(then) {
    var idle = function() { return root.runner.active === 0 && root.runner.waiting === 0 }
    root.h.waitFor(idle, 8000, function(ok) {
      root.h.check(ok, "every job has settled")
      then()
    })
  }

  // Makes every entry made so far old, runs act(), and sets the usual age
  // limit again when act calls back.
  function aged(act) {
    root.h.after(40, function() {
      Const.LIMITS.resolveTtlMs = 20
      act(function() { Const.LIMITS.resolveTtlMs = root.usual })
    })
  }

  // The tags of the jobs started since job number first.
  function tagsSince(first) {
    return root.h.jobs().slice(first).map(function(job) { return job.tag })
  }

  function young() {
    var h = root.h
    var id = root.vid("A")
    h.equal(Const.LIMITS.resolveTtlMs, root.usual, "an entry counts as fresh for five of its six hours")
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (!ok) { h.finish(); return }
      h.scenario({ ytdlp: "ok" })
      root.resolver.ensure(id, "play", function(result) {
        h.equal([result.ok, result.cached, result.entry.n], [true, false, 1], "young: looked up")
        root.resolver.ensure(id, "play", function(again) {
          h.equal([again.cached, again.entry === result.entry, root.starts()], [true, true, 1],
            "young: a fresh entry is handed out again, and nothing is asked")
          root.next()
        })
      })
    })
    root.fs.prepare()
  }

  // A play finds only an old entry: the video is looked up anew, and the
  // old file is removed after the new one was written.
  function oldForAPlay() {
    var h = root.h
    var id = root.vid("A")
    var old = root.resolver.entry(id)
    var before = h.jobs().length
    root.aged(function(restore) {
      h.equal([root.resolver.fresh(id), root.resolver.entry(id) === old], [false, true],
        "old for a play: not fresh, and still there to be asked about")
      root.resolver.ensure(id, "play", function(result) {
        restore()
        h.equal([result.ok, result.cached, result.entry.n], [true, false, 2], "old for a play: looked up")
        h.check(result.entry.resolvedAt > old.resolvedAt, "old for a play: the new entry is young")
        root.settled(function() {
          h.equal(root.tagsSince(before), ["resolve", "write", "remove"],
            "old for a play: the old file goes after the new one is in place")
          root.listing(function(found) {
            h.equal(found, ["2.json"], "old for a play: one file, the new one")
            root.next()
          })
        })
      })
    })
  }

  // The same for the next track of a queue.
  function oldForTheQueue() {
    var h = root.h
    var id = root.vid("A")
    var before = root.starts()
    root.aged(function(restore) {
      root.resolver.ensure(id, "next", function(result) {
        restore()
        h.equal([result.ok, result.cached, result.entry.n, root.starts() - before], [true, false, 3, 1],
          "old for the queue: looked up anew")
        root.settled(function() {
          root.listing(function(found) {
            h.equal(found, ["3.json"], "old for the queue: one file, the new one")
            root.next()
          })
        })
      })
    })
  }

  // And for the search result the highlight rests on.
  function oldUnderTheHighlight() {
    var h = root.h
    var id = root.vid("A")
    var before = root.starts()
    root.resolver.hint(id)
    h.after(Const.TIMEOUTS.dwellMs + 300, function() {
      h.equal(root.starts() - before, 0, "old under the highlight: a fresh entry is left alone")
      root.aged(function(restore) {
        root.resolver.hint("")
        root.resolver.hint(id)
        h.waitFor(function() { return root.resolver.entry(id).n === 4 }, 5000, function(made) {
          restore()
          h.check(made, "old under the highlight: looked up anew")
          root.resolver.hint("")
          root.settled(function() {
            root.listing(function(found) {
              h.equal([found, root.starts() - before], [["4.json"], 1], "old under the highlight: one lookup")
              root.next()
            })
          })
        })
      })
    })
  }

  // A new address for the picture is not a new lookup of the track: the
  // entry is as old as before, and a play still looks the video up anew.
  function pictureKeepsTheAge() {
    var h = root.h
    var id = root.vid("A")
    var old = root.resolver.entry(id)
    h.scenario({ ytdlp: "moved" })
    root.aged(function(restore) {
      root.resolver.refreshVideoUrl(id, function(picture) {
        h.equal([picture.ok, picture.videoUrl], [true, root.movedUrl], "picture: a new address")
        var entry = root.resolver.entry(id)
        h.equal([entry.n, entry.resolvedAt, root.resolver.fresh(id)], [4, old.resolvedAt, false],
          "picture: the entry is as old as it was")
        h.scenario({ ytdlp: "ok" })
        root.resolver.ensure(id, "play", function(result) {
          restore()
          h.equal([result.cached, result.entry.n], [false, 5], "picture: a play still looks the video up")
          root.settled(function() { root.next() })
        })
      })
    })
  }

  // A lookup that fails leaves an old entry and its file where they are:
  // playback may be in the middle of that track.
  function failureKeepsTheOld() {
    var h = root.h
    var id = root.vid("A")
    var old = root.resolver.entry(id)
    h.scenario({ ytdlp: "refused" })
    root.aged(function(restore) {
      var answers = []
      var note = function(result) { answers.push(result.code) }
      root.resolver.ensure(id, "play", function(played) {
        note(played)
        root.resolver.refresh(id, function(again) {
          note(again)
          root.resolver.ensure(id, "next", function(ahead) {
            note(ahead)
            restore()
            h.equal(answers, ["E_YT_REFUSED", "E_YT_REFUSED", "E_YT_REFUSED"], "failure: each is told")
            h.check(root.resolver.entry(id) === old, "failure: the old entry stays")
            root.settled(function() {
              root.listing(function(found) {
                h.equal(found, ["5.json"], "failure: and so does its file")
                root.next()
              })
            })
          })
        })
      })
    })
  }

  // Old entries that playback still needs are kept through a trim and a
  // purge, with their files: the player may hold them.
  function oldButNeeded() {
    var h = root.h
    var held = root.vid("A")
    var other = root.vid("B")
    var before = h.jobs().length
    h.scenario({ ytdlp: "ok" })
    root.resolver.ensure(other, "next", function(made) {
      h.equal([made.ok, made.entry.n], [true, 6], "needed: a second entry")
      root.aged(function(restore) {
        root.resolver.retain([held])
        root.resolver.purge([held])
        restore()
        h.equal([root.resolver.entry(held).n, root.resolver.entry(other)], [5, null],
          "needed: the old entry playback needs is kept, the other is dropped")
        root.settled(function() {
          h.equal(root.tagsSince(before), ["resolve", "write", "remove"], "needed: one file was removed")
          root.listing(function(found) {
            h.equal(found, ["5.json"], "needed: the file of the kept entry is there")
            root.resolver.purge([])
            root.settled(function() {
              root.listing(function(left) {
                h.equal(left, [], "needed: until nothing is needed any more")
                root.next()
              })
            })
          })
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    h.equal(Const.LIMITS.resolveTtlMs, root.usual, "quiet: the usual age limit")
    var withLogin = h.log("ytdlp").filter(function(record) { return record.jar !== undefined })
    h.equal(withLogin.length, 0, "quiet: no lookup was made with a login")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      var log = h.readFile(h.runDir + "/out.txt")
      var printed = [root.vid("A"), root.vid("B"), "watch?v=", "googlevideo", "ERROR:", "Private video"]
      for (var i = 0; i < printed.length; i++) {
        h.check(log.indexOf(printed[i]) === -1, "quiet: the log holds nothing of a lookup (" + i + ")")
      }
      root.next()
    })
  }
}
