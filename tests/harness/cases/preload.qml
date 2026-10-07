import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/YtArgs.js" as YtArgs

// core/Resolver.qml looking videos up ahead of a play, against the yt-dlp
// stub and the real file tools: for the search result the highlight rests
// on, and for the next track of a queue. Such a lookup starts only after
// the highlight has rested, only while the setting is on and a panel is
// open, one at a time, and it goes when the highlight moves on. It is the
// same signed-out command as any other lookup, and nothing it looks up is
// ever marked as watched. A play that asks for the video being looked up
// takes that lookup over instead of starting a second one.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var resolver: null
  property var steps: []
  property int at: 0
  // Every id this case asks for, to look for afterwards.
  property var asked: []

  // Longer than the rest the highlight needs, so that "nothing was started"
  // is said after the moment at which something would have been.
  readonly property int rested: Const.TIMEOUTS.dwellMs + 400

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
      root.prepared, root.rests, root.sameRow, root.movesOn, root.leaves, root.oneAhead, root.queueFirst,
      root.takenOver, root.besideAPlay, root.notOvertaken, root.noPanel, root.reopened, root.panelCloses,
      root.settingOff,
      root.dropped, root.stillNeeded, root.quiet
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // The id made of one letter eleven times over.
  function vid(letter) {
    var id = new Array(12).join(letter)
    if (root.asked.indexOf(id) === -1) root.asked.push(id)
    return id
  }

  // The flags behind the tool, written out a second time. The fields a
  // lookup asks to have printed are not: vectors_yt compares them name by
  // name, and here they are taken from the builder.
  function flags() {
    var built = YtArgs.resolve({ ytdlp: "/usr/bin/yt-dlp" }, root.fs.paths, 720)
    return [
      "--ignore-config", "--no-plugin-dirs", "--cache-dir", root.fs.paths.ytCacheDir, "--color", "never",
      "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10",
      "--no-cookies", "--no-warnings", "--no-playlist", "-f", "bestvideo[height<=?720]+bestaudio/best",
      "--print", built[built.indexOf("--print") + 1], "-a", "-"
    ]
  }

  function starts() {
    return root.h.log("ytdlp").length
  }

  // The addresses the stub was asked for from record number first on.
  function lookedUp(first) {
    return root.h.log("ytdlp").slice(first).map(function(record) {
      return record.stdin.replace("https://www.youtube.com/watch?v=", "").replace("\n", "")
    })
  }

  // then(count): how many files the info folder holds.
  function fileCount(then) {
    var find = ["/usr/bin/find", root.fs.paths.infoDir, "-mindepth", "1", "-printf", "%m\n"]
    root.h.exec(find, null, function(code, out) {
      var modes = out.split("\n").filter(function(line) { return line !== "" })
      root.h.check(modes.every(function(mode) { return mode === "600" }), "every info file is private")
      then(modes.length)
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

  // Calls then() when the stub has been started count more times than
  // before.
  function started(label, before, count, then) {
    root.h.waitFor(function() { return root.starts() === before + count }, 5000, function(ok) {
      root.h.check(ok, label + ": yt-dlp was started")
      then()
    })
  }

  // Calls then() when the video has a fresh entry.
  function cached(label, id, then) {
    root.h.waitFor(function() { return root.resolver.fresh(id) }, 6000, function(ok) {
      root.h.check(ok, label + ": the entry is there")
      then()
    })
  }

  // Lets more time pass than the highlight needs to rest, then says how
  // many times the stub was started since.
  function afterRest(before, then) {
    root.h.after(root.rested, function() { then(root.starts() - before) })
  }

  function prepared() {
    var h = root.h
    h.equal(Const.TIMEOUTS.dwellMs, 600, "the highlight rests for 600 ms")
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (ok) root.next()
      else h.finish()
    })
    root.fs.prepare()
  }

  // Nothing is asked while the highlight has only just arrived. After the
  // rest the video is looked up, signed out, and kept like any other.
  function rests() {
    var h = root.h
    var id = root.vid("A")
    h.scenario({ ytdlp: "ok" })
    root.resolver.hint(id)
    h.after(Const.TIMEOUTS.dwellMs - 250, function() {
      h.equal([root.starts(), root.resolver.fresh(id)], [0, false], "rests: nothing before the rest is over")
      root.cached("rests", id, function() {
        var record = h.log("ytdlp")
        h.equal(record.length, 1, "rests: one lookup")
        h.equal(record[0].argv, root.flags(), "rests: the signed-out command of every lookup")
        h.equal(record[0].stdin, "https://www.youtube.com/watch?v=" + id + "\n", "rests: the address")
        var names = ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"]
        h.equal(record[0].env, names, "rests: the network profile and nothing else")
        var entry = root.resolver.entry(id)
        h.equal([entry.n, entry.file], [1, root.fs.paths.infoDir + "/1.json"], "rests: kept as entry 1")
        root.settled(function() {
          root.fileCount(function(count) {
            h.equal(count, 1, "rests: one file")
            root.next()
          })
        })
      })
    })
  }

  // A row that was looked up is not looked up again, however often the
  // panel names it.
  function sameRow() {
    var h = root.h
    var before = root.starts()
    root.resolver.hint(root.vid("A"))
    root.resolver.hint(root.vid("A"))
    root.afterRest(before, function(more) {
      h.equal(more, 0, "same row: nothing is asked for a video that is fresh")
      root.next()
    })
  }

  // A highlight that keeps moving asks for nothing, and one that moves on
  // from a row being looked up ends that lookup.
  function movesOn() {
    var h = root.h
    var before = root.starts()
    var passed = [root.vid("B"), root.vid("C"), root.vid("D")]
    h.scenario({ ytdlp: "slow:3000" })
    root.resolver.hint(passed[0])
    h.after(300, function() {
      root.resolver.hint(passed[1])
      h.after(300, function() {
        root.resolver.hint(passed[2])
        h.after(300, function() {
          h.equal(root.starts(), before, "moves on: three rows passed, nothing asked")
          root.started("moves on", before, 1, function() {
            h.equal(root.lookedUp(before), [passed[2]], "moves on: the row it rested on")
            h.scenario({ ytdlp: "ok" })
            root.resolver.hint(root.vid("E"))
            root.cached("moves on", root.vid("E"), function() {
              h.equal(root.runner.active, 0, "moves on: the lookup for the row it left was ended")
              h.equal(root.lookedUp(before), [passed[2], root.vid("E")], "moves on: one lookup per rest")
              h.equal(root.resolver.entry(passed[2]), null, "moves on: no entry for the row it left")
              root.settled(function() {
                h.alive(function(names) {
                  h.equal(names, [], "moves on: no yt-dlp is left running")
                  root.fileCount(function(count) {
                    h.equal(count, 2, "moves on: and no file for it")
                    root.next()
                  })
                })
              })
            })
          })
        })
      })
    })
  }

  // The highlight leaves the results: the lookup for the row goes, and
  // nothing takes its place.
  function leaves() {
    var h = root.h
    var before = root.starts()
    var id = root.vid("F")
    h.scenario({ ytdlp: "slow:1500" })
    root.resolver.hint(id)
    root.started("leaves", before, 1, function() {
      root.resolver.hint("")
      root.settled(function() {
        h.equal([root.resolver.entry(id), root.starts() - before], [null, 1], "leaves: ended, nothing kept")
        // Text that is not an id means "no row" as well.
        root.resolver.hint(id)
        root.resolver.hint("not an id")
        root.afterRest(before, function(more) {
          h.equal(more, 1, "leaves: nothing more was asked")
          root.next()
        })
      })
    })
  }

  // One lookup runs ahead of a play. The next track of the queue takes the
  // place of a lookup for a highlighted row.
  function oneAhead() {
    var h = root.h
    var before = root.starts()
    var row = root.vid("G")
    var queued = root.vid("H")
    var answers = []
    h.scenario({ ytdlp: "slow:1200" })
    root.resolver.hint(row)
    root.started("one ahead", before, 1, function() {
      h.scenario({ ytdlp: "ok" })
      var returned = false
      root.resolver.ensure(queued, "next", function(result) {
        h.check(returned, "one ahead: answered after the request returned")
        answers.push(result)
      })
      returned = true
      h.waitFor(function() { return answers.length === 1 }, 5000, function() {
        h.equal(answers.map(function(a) { return [a.ok, a.code, a.cached, a.entry ? a.entry.id : ""] }),
          [[true, "", false, queued]], "one ahead: the next track is looked up")
        h.equal(root.resolver.entry(row), null, "one ahead: the lookup for the row gave way")
        // The highlight still rests on its row, so the row gets its turn
        // once the queue's lookup has ended.
        root.cached("one ahead", row, function() {
          h.equal(root.lookedUp(before), [row, queued, row], "one ahead: one after the other")
          // A next track that is already there costs nothing.
          var again = root.starts()
          root.resolver.ensure(queued, "next", function(result) {
            h.equal([result.ok, result.cached, root.starts() - again], [true, true, 0],
              "one ahead: a fresh next track is answered from the cache")
            root.settled(function() { root.next() })
          })
        })
      })
    })
  }

  // While the next track of the queue is being looked up, a highlighted row
  // waits: it neither ends that lookup nor runs beside it.
  function queueFirst() {
    var h = root.h
    var before = root.starts()
    var queued = root.vid("I")
    var row = root.vid("J")
    var answers = []
    h.scenario({ ytdlp: "slow:1500" })
    root.resolver.hint("")
    root.resolver.ensure(queued, "next", function(result) { answers.push(result) })
    root.started("queue first", before, 1, function() {
      h.scenario({ ytdlp: "ok" })
      root.resolver.hint(row)
      h.after(root.rested, function() {
        h.equal([root.starts() - before, answers.length], [1, 0], "queue first: the row waits")
        h.waitFor(function() { return answers.length === 1 }, 5000, function() {
          h.equal([answers[0].ok, answers[0].entry ? answers[0].entry.id : ""], [true, queued],
            "queue first: the next track was looked up to the end")
          root.cached("queue first", row, function() {
            h.equal(root.lookedUp(before), [queued, row], "queue first: then the row")
            root.settled(function() { root.next() })
          })
        })
      })
    })
  }

  // Enter on the row that is being looked up: no second yt-dlp. The lookup
  // now belongs to the play, and a highlight that goes away (as it does
  // when the panel closes right after Enter) no longer ends it.
  function takenOver() {
    var h = root.h
    var before = root.starts()
    var id = root.vid("K")
    var answers = []
    h.scenario({ ytdlp: "slow:1000" })
    root.resolver.hint(id)
    root.started("taken over", before, 1, function() {
      root.resolver.ensure(id, "play", function(result) { answers.push(result) })
      root.resolver.hint("")
      root.resolver.ensure(root.vid("L"), "next", null)
      h.waitFor(function() { return answers.length === 1 }, 5000, function(answered) {
        h.check(answered, "taken over: the play hears back")
        var got = answers.length === 1 ? answers[0] : { ok: false, code: "none", cached: true, entry: null }
        h.equal([got.ok, got.code, got.cached, got.entry ? got.entry.id : ""], [true, "", false, id],
          "taken over: with the entry the lookup made")
        root.cached("taken over", root.vid("L"), function() {
          h.equal(root.lookedUp(before), [id, root.vid("L")], "taken over: the video was looked up once")
          // And playback can still give it up, like any play.
          var given = []
          h.scenario({ ytdlp: "slow:1500" })
          var third = root.starts()
          root.resolver.hint(root.vid("M"))
          root.started("taken over, given up", third, 1, function() {
            root.resolver.ensure(root.vid("M"), "play", function(result) { given.push(result.code) })
            root.resolver.cancelPlay()
            root.settled(function() {
              h.equal([given, root.resolver.entry(root.vid("M"))], [["cancelled"], null],
                "taken over: playback gave it up")
              root.resolver.hint("")
              root.next()
            })
          })
        })
      })
    })
  }

  // A play for another video and a lookup ahead run side by side.
  function besideAPlay() {
    var h = root.h
    var before = root.starts()
    var queued = root.vid("N")
    var played = root.vid("O")
    var answers = []
    h.scenario({ ytdlp: "slow:800" })
    root.resolver.ensure(queued, "next", function(result) { answers.push("next " + result.ok) })
    root.started("beside a play", before, 1, function() {
      root.resolver.ensure(played, "play", function(result) { answers.push("play " + result.ok) })
      root.started("beside a play, the play", before, 2, function() {
        h.equal(root.runner.active, 2, "beside a play: two yt-dlp jobs, one in front and one ahead")
        h.waitFor(function() { return answers.length === 2 }, 5000, function() {
          h.equal(answers, ["next true", "play true"], "beside a play: neither ended the other")
          // A lookup ahead for the video a play is already looking up joins it.
          var joined = []
          var third = root.starts()
          root.resolver.ensure(root.vid("P"), "play", function(result) { joined.push("play " + result.ok) })
          root.resolver.ensure(root.vid("P"), "next", function(result) { joined.push("next " + result.ok) })
          h.waitFor(function() { return joined.length === 2 }, 5000, function() {
            h.equal([joined, root.starts() - third], [["play true", "next true"], 1],
              "beside a play: one job for a video asked for twice")
            root.settled(function() { root.next() })
          })
        })
      })
    })
  }

  // A lookup in front for the video one ahead is working on must not be
  // overtaken by it: playback is handed an entry, and that entry and its
  // file must still be the ones when the lookup ahead would have ended.
  function notOvertaken() {
    var h = root.h
    var before = root.starts()
    var id = root.vid("Y")
    var ahead = []
    h.scenario({ ytdlp: "slow:1200" })
    root.resolver.ensure(id, "next", function(result) { ahead.push(result.code) })
    root.started("not overtaken", before, 1, function() {
      h.scenario({ ytdlp: "ok" })
      root.resolver.refresh(id, function(result) {
        h.equal([result.ok, result.cached], [true, false], "not overtaken: looked up in front")
        h.after(1500, function() {
          h.equal(ahead, ["cancelled"], "not overtaken: the lookup ahead was given up")
          h.check(root.resolver.entry(id) === result.entry, "not overtaken: the entry is the one handed out")
          root.settled(function() {
            var stat = ["/usr/bin/stat", "-c", "%a", result.entry.file]
            h.exec(stat, null, function(code, out) {
              h.equal(out, "600\n", "not overtaken: and its file is there")
              root.next()
            })
          })
        })
      })
    })
  }

  // No panel is open: a highlight means nothing, and a lookup for one is
  // refused whoever asks.
  function noPanel() {
    var h = root.h
    var before = root.starts()
    var id = root.vid("Q")
    var answers = []
    h.scenario({ ytdlp: "ok" })
    root.resolver.panelOpen = false
    root.resolver.hint(id)
    root.resolver.ensure(id, "preload", function(result) { answers.push(result.code) })
    root.afterRest(before, function(more) {
      h.equal([more, answers, root.resolver.entry(id)], [0, ["cancelled"], null], "no panel: nothing asked")
      root.next()
    })
  }

  // A panel that opens again asks for nothing by itself: not for the row a
  // highlight was reported on while it was closed, and not for the row it
  // rested on before it closed.
  function reopened() {
    var h = root.h
    var before = root.starts()
    root.resolver.panelOpen = true
    // A lookup for the queue that ends gives a waiting highlight its turn.
    // There is none: what was reported while no panel was open is not one.
    root.resolver.ensure(root.vid("Z"), "next", null)
    root.afterRest(before, function(more) {
      h.equal([more, root.resolver.entry(root.vid("Q")), root.resolver.fresh(root.vid("Z"))], [1, null, true],
        "reopened: nothing for a row named while no panel was open")
      before = root.starts()
      root.resolver.hint(root.vid("R"))
      root.resolver.panelOpen = false
      root.resolver.panelOpen = true
      root.afterRest(before, function(later) {
        h.equal([later, root.resolver.entry(root.vid("R"))], [0, null],
          "reopened: nothing for the row the highlight was on when the panel closed")
        root.next()
      })
    })
  }

  // The panel closes while a row is being looked up.
  function panelCloses() {
    var h = root.h
    var before = root.starts()
    var id = root.vid("S")
    h.scenario({ ytdlp: "slow:2500" })
    root.resolver.hint(id)
    root.started("panel closes", before, 1, function() {
      var since = Date.now()
      root.resolver.panelOpen = false
      root.settled(function() {
        h.check(Date.now() - since < 1200, "panel closes: the lookup was ended")
        h.equal(root.resolver.entry(id), null, "panel closes: nothing is kept")
        root.resolver.panelOpen = true
        root.next()
      })
    })
  }

  // The setting is off: nothing is looked up for a highlight, and switching
  // it off ends the lookup that runs. The next track of a queue is still
  // looked up.
  function settingOff() {
    var h = root.h
    var before = root.starts()
    var id = root.vid("T")
    h.scenario({ ytdlp: "slow:1500" })
    root.resolver.hint(id)
    root.started("setting off", before, 1, function() {
      root.resolver.settings = { maxHeight: 720, preload: false }
      root.settled(function() {
        h.equal(root.resolver.entry(id), null, "setting off: the running lookup was ended")
        h.scenario({ ytdlp: "ok" })
        root.resolver.hint("")
        root.resolver.hint(id)
        root.afterRest(before, function(more) {
          h.equal(more, 1, "setting off: a rested highlight asks for nothing")
          root.resolver.ensure(root.vid("U"), "next", function(result) {
            h.equal([result.ok, result.cached], [true, false], "setting off: the queue is still looked ahead")
            root.resolver.settings = { maxHeight: 720, preload: true }
            root.resolver.hint("")
            root.settled(function() { root.next() })
          })
        })
      })
    })
  }

  // Dropping everything also drops a lookup ahead of a play, so that what
  // is being dropped does not come back a moment later. One for a video
  // that is to be kept goes on.
  function dropped() {
    var h = root.h
    var before = root.starts()
    var row = root.vid("V")
    var queued = root.vid("W")
    var answers = []
    h.scenario({ ytdlp: "slow:1000" })
    root.resolver.hint(row)
    root.started("dropped", before, 1, function() {
      root.resolver.purge([])
      root.settled(function() {
        root.fileCount(function(count) {
          h.equal([count, root.resolver.entry(row), root.resolver.entry(root.vid("A"))], [0, null, null],
            "dropped: no entry and no file, old or new")
          root.resolver.hint("")
          root.resolver.ensure(queued, "next", function(result) { answers.push(result.ok) })
          root.started("dropped, kept", before, 2, function() {
            root.resolver.purge([queued])
            h.waitFor(function() { return answers.length === 1 }, 5000, function() {
              h.equal([answers, root.resolver.fresh(queued)], [[true], true],
                "dropped: the lookup for a kept video went on")
              root.settled(function() {
                root.fileCount(function(left) {
                  h.equal(left, 1, "dropped: its file is there")
                  root.next()
                })
              })
            })
          })
        })
      })
    })
  }

  // An old entry that playback still needs is not replaced because the
  // highlight rests on its row: the player may hold its file. One that
  // playback does not need is looked up anew.
  function stillNeeded() {
    var h = root.h
    var usual = Const.LIMITS.resolveTtlMs
    var held = root.vid("W")
    var free = root.vid("X")
    h.scenario({ ytdlp: "ok" })
    root.resolver.ensure(free, "next", function(made) {
      h.check(made.ok, "still needed: a second entry")
      root.resolver.retain([held])
      var before = root.starts()
      h.after(40, function() {
        Const.LIMITS.resolveTtlMs = 20
        h.equal([root.resolver.fresh(held), root.resolver.fresh(free)], [false, false], "still needed: old")
        var old = root.resolver.entry(held)
        root.resolver.hint(held)
        root.afterRest(before, function(more) {
          h.equal(more, 0, "still needed: nothing is asked for the entry playback holds")
          h.check(root.resolver.entry(held) === old, "still needed: and it is the same entry")
          root.resolver.hint(free)
          root.started("still needed", before, 1, function() {
            h.equal(root.lookedUp(before), [free], "still needed: the other one is looked up anew")
            root.settled(function() {
              Const.LIMITS.resolveTtlMs = usual
              h.check(root.resolver.entry(free).n > made.entry.n, "still needed: and replaced")
              root.resolver.hint("")
              root.next()
            })
          })
        })
      })
    })
  }

  // Whatever was looked up ahead of a play was looked up signed out, marked
  // nothing as watched, and left nothing in the log.
  function quiet() {
    var h = root.h
    h.equal(Const.LIMITS.resolveTtlMs, 18000000, "quiet: the usual age limit")
    var records = h.log("ytdlp")
    var plain = records.filter(function(record) {
      return JSON.stringify(record.argv) === JSON.stringify(root.flags()) && record.jar === undefined
    })
    h.equal(plain.length, records.length, "quiet: every lookup was the signed-out command, without a login")
    h.equal(h.stubState("ytdlp"), null, "quiet: nothing was marked as watched")
    var tags = h.jobs().map(function(job) { return job.tag })
    var known = ["prepare", "resolve", "write", "remove", "purge"]
    h.equal(tags.filter(function(tag) { return known.indexOf(tag) === -1 }), [], "quiet: no other job")
    h.check(JSON.stringify(h.jobs()).indexOf("cookies.txt") === -1, "quiet: the saved login is in no command")
    var named = root.asked.filter(function(id) { return JSON.stringify(h.jobs()).indexOf(id) !== -1 })
    h.equal(named, [], "quiet: no id is in any command")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      var log = h.readFile(h.runDir + "/out.txt")
      var logged = root.asked.filter(function(id) { return log.indexOf(id) !== -1 })
      h.equal(logged, [], "quiet: no id is in the log")
      var printed = ["watch?v=", "googlevideo", "Reading URLs", "vid=1"]
      for (var i = 0; i < printed.length; i++) {
        h.check(log.indexOf(printed[i]) === -1, "quiet: the log holds nothing of a lookup (" + i + ")")
      }
      root.next()
    })
  }
}
