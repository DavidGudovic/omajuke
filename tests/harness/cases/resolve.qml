import QtQuick
import "../../../lib/Const.js" as Const
import "../../../lib/Env.js" as Env
import "../../../lib/Errors.js" as Errors
import "../../../lib/Sh.js" as Sh
import "../../../lib/YtArgs.js" as YtArgs

// core/Resolver.qml against the yt-dlp stub and the real file tools: the
// lookup of a video, the private file its answer is kept in, the cache of
// entries, and every way an entry and its file leave again. Throughout, the
// video id may appear in the stub's standard input and nowhere else: in no
// command line, in no file name and not in the log.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var resolver: null
  property var steps: []
  property int at: 0
  // The entry of the first lookup, to compare later answers with.
  property var first: null
  // Every id this case asks for, to look for afterwards.
  property var asked: []

  // What the video fixture resolves to, whichever id is swapped in.
  readonly property string videoUrl: "https://rr1---sn-test.googlevideo.com/videoplayback"
    + "?id=synthetic&itag=247"
  readonly property string fixtureId: "AAAAAAAAAAA"

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
      runner: root.runner, tools: h.tools, fs: root.fs, settings: { maxHeight: 720, preload: false }
    })
    if (root.runner === null || root.fs === null || root.resolver === null) { h.finish(); return }
    root.steps = [
      root.beforeReady, root.firstLookup, root.recorded, root.cachedHit, root.questions, root.refreshFails,
      root.refreshWorks, root.otherHeights, root.givenUp, root.stoppedByAnother, root.givenUpWhileWriting,
      root.overtaken,
      root.joined, root.failures, root.noAnswer, root.badRequests, root.noYtDlp, root.writeFails,
      root.expired, root.retained, root.neverNamed, root.purged, root.purgedWhileLooking, root.largest,
      root.pictureAddress, root.pictureBesideAPlay, root.accountReady, root.withAccount, root.accountRefused,
      root.quiet
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

  function infoFile(n) {
    return root.fs.paths.infoDir + "/" + n + ".json"
  }

  // The flags behind the tool, written out a second time. The fields a
  // lookup asks to have printed are not: vectors_yt compares them name by
  // name, and here they are taken from the builder.
  function flags(height) {
    var built = YtArgs.resolve({ ytdlp: "/usr/bin/yt-dlp" }, root.fs.paths, 720)
    return [
      "--ignore-config", "--no-plugin-dirs", "--cache-dir", root.fs.paths.ytCacheDir, "--color", "never",
      "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10",
      "--no-cookies", "--no-warnings", "--no-playlist", "-f",
      "bestvideo[height<=?" + height + "]+bestaudio/best", "--print", built[built.indexOf("--print") + 1],
      "-a", "-"
    ]
  }

  // What the stub answers a lookup of id with: of the video fixture, with
  // that id swapped in, the fields a lookup asks for.
  function answer(id) {
    var h = root.h
    var whole = h.readFile(h.repo + "/tests/fixtures/video.json").split(root.fixtureId).join(id)
    return h.printed(root.flags(720), whole)
  }

  function wrapper(seconds) {
    return [root.h.tools.setpriv, "--pdeathsig", "TERM", root.h.tools.timeout, "-k", "2", String(seconds)]
  }

  function starts() {
    return root.h.log("ytdlp").length
  }

  // then(names): "<mode> <name>" for everything in the info folder.
  function listing(then) {
    var find = ["/usr/bin/find", root.fs.paths.infoDir, "-mindepth", "1", "-printf", "%m %f\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  function files(numbers) {
    return numbers.map(function(n) { return "600 " + n + ".json" }).sort()
  }

  // Calls then() once no job is left, running or waiting.
  function settled(then) {
    var idle = function() { return root.runner.active === 0 && root.runner.waiting === 0 }
    root.h.waitFor(idle, 8000, function(ok) {
      root.h.check(ok, "every job has settled")
      then()
    })
  }

  // Asks the resolver and calls then(result) with its answer. The answer
  // must come exactly once and never before the request has returned.
  function ask(label, kind, id, then) {
    var h = root.h
    var returned = false
    var answers = 0
    var done = function(result) {
      answers += 1
      h.check(returned && answers === 1, label + ": answered once, after the request returned")
      then(result)
    }
    if (kind === "refresh") root.resolver.refresh(id, done)
    else root.resolver.ensure(id, "play", done)
    returned = true
  }

  // A lookup that must succeed with a newly made entry in file n.
  function lookUp(label, id, n, then) {
    root.ask(label, "ensure", id, function(result) {
      root.h.equal([result.ok, result.code, result.cached], [true, "", false], label + ": looked up")
      root.checkEntry(label, result.entry, id, n)
      then(result)
    })
  }

  function checkEntry(label, entry, id, n) {
    var h = root.h
    if (entry === null || typeof entry !== "object") { h.check(false, label + ": an entry"); return }
    h.equal(Object.keys(entry), ["id", "n", "file", "track", "videoUrl", "resolvedAt"], label + ": the keys")
    h.equal([entry.id, entry.n, entry.file], [id, n, root.infoFile(n)], label + ": id, counter and file")
    h.equal(entry.track, { id: id, title: "A,vid=1 \"q\"", channel: "c", duration: 5, live: false },
      label + ": the track")
    h.equal(entry.videoUrl, root.videoUrl, label + ": the video stream")
    h.check(Date.now() - entry.resolvedAt >= 0 && Date.now() - entry.resolvedAt < 5000, label + ": the time")
  }

  function failed(label, result, code) {
    root.h.equal(result, { ok: false, code: code, entry: null, cached: false }, label)
  }

  // Until the private directories are vouched for, nothing is started that
  // would write into them.
  function beforeReady() {
    var h = root.h
    h.equal(root.fs.status, "pending", "before prepare: the file layer is not ready")
    root.ask("before prepare", "ensure", root.vid("A"), function(result) {
      root.failed("before prepare: no lookup", result, "E_RUNTIME_DIR")
      h.equal([h.jobs().length, root.starts()], [0, 0], "before prepare: no job")
      root.fs.prepared.connect(function(ok) {
        h.check(ok, "the directories are prepared")
        if (ok) root.next()
        else h.finish()
      })
      root.fs.prepare()
    })
  }

  function firstLookup() {
    var h = root.h
    var id = root.vid("A")
    h.scenario({ ytdlp: "ok" })
    h.equal([root.resolver.fresh(id), root.resolver.entry(id)], [false, null], "first: nothing is cached")
    root.lookUp("first", id, 1, function(result) {
      root.first = result.entry
      h.check(root.resolver.fresh(id), "first: the entry is fresh")
      h.check(root.resolver.entry(id) === result.entry, "first: entry() hands out the same entry")
      // An entry cannot be changed by whoever is handed it.
      result.entry.file = "/etc/hostname"
      result.entry.n = 99
      result.entry.track.title = "changed"
      root.checkEntry("first, after a write to it", root.resolver.entry(id), id, 1)
      var answer = root.answer(id)
      h.check(answer.length > 1000 && h.readFile(root.infoFile(1)) === answer,
        "first: the file holds yt-dlp's answer, byte for byte")
      // The fixture lists captions, as the whole record of a real video
      // does at great length. They were not asked for and are not there.
      var whole = h.readFile(h.repo + "/tests/fixtures/video.json")
      h.equal([whole.indexOf("automatic_captions") !== -1, answer.indexOf("automatic_captions")], [true, -1],
        "first: and it holds the fields that were asked for, not the whole record")
      root.listing(function(found) {
        h.equal(found, root.files([1]), "first: one file, named by the counter, mode 600")
        root.next()
      })
    })
  }

  function recorded() {
    var h = root.h
    var id = root.vid("A")
    var record = h.log("ytdlp")
    h.equal(record.length, 1, "recorded: yt-dlp ran once")
    h.equal(record[0].argv, root.flags(720), "recorded: the arguments are the constant list")
    h.equal([record[0].argv.indexOf("-J"), record[0].argv.indexOf("--dump-single-json")], [-1, -1],
      "recorded: the whole record of the video is not asked for")
    h.equal(record[0].stdin, "https://www.youtube.com/watch?v=" + id + "\n", "recorded: the address on stdin")
    h.equal(record[0].env, ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
      "recorded: the network profile and nothing else")
    var jobs = h.jobs().filter(function(job) { return job.tag !== "prepare" })
    h.equal(jobs, [
      { tag: "resolve", command: root.wrapper(25).concat([h.tools.ytdlp], root.flags(720)) },
      { tag: "write", command: root.wrapper(5).concat([h.tools.sh, "-c", Sh.PRIVATE_WRITE, "omajuke-write",
        root.infoFile(1)]) }
    ], "recorded: one lookup and one private write, both bounded by the wrapper")
    root.next()
  }

  function cachedHit() {
    var h = root.h
    var id = root.vid("A")
    var before = [root.starts(), h.jobs().length]
    var answers = []
    root.ask("hit", "ensure", id, function(result) {
      h.equal([result.ok, result.code, result.cached], [true, "", true], "hit: from the cache")
      h.check(result.entry === root.first, "hit: the very same entry")
      answers.push(result.entry)
    })
    // A second request in the same turn joins the first.
    root.ask("hit, joined", "ensure", id, function(result) {
      h.equal(result.cached, true, "hit, joined: from the cache as well")
      answers.push(result.entry)
    })
    h.equal(answers.length, 0, "hit: not answered inside the request")
    h.waitFor(function() { return answers.length === 2 }, 3000, function(both) {
      h.check(both, "hit: both requests are answered")
      h.after(200, function() {
        h.equal([root.starts(), h.jobs().length], before, "hit: nothing was started")
        root.next()
      })
    })
  }

  function questions() {
    var h = root.h
    var unknown = [
      root.vid("Q"), "constructor", "__proto__", "hasOwnProperty", "", "AAAAAAAAAA", null, undefined, 5, {},
      [root.fixtureId]
    ]
    for (var i = 0; i < unknown.length; i++) {
      h.equal([root.resolver.fresh(unknown[i]), root.resolver.entry(unknown[i])], [false, null],
        "questions: nothing is known about " + i)
    }
    root.next()
  }

  function refreshFails() {
    var h = root.h
    var id = root.vid("A")
    h.scenario({ ytdlp: "refused" })
    root.ask("refresh fails", "refresh", id, function(result) {
      root.failed("refresh fails: the code of the failure", result, "E_YT_REFUSED")
      h.check(root.resolver.entry(id) === root.first, "refresh fails: the old entry stays")
      h.check(root.resolver.fresh(id), "refresh fails: and is still fresh")
      root.settled(function() {
        root.listing(function(found) {
          h.equal(found, root.files([1]), "refresh fails: the old file stays")
          h.equal(root.starts(), 2, "refresh fails: yt-dlp was asked although the entry was fresh")
          root.next()
        })
      })
    })
  }

  function refreshWorks() {
    var h = root.h
    var id = root.vid("A")
    var before = h.jobs().length
    h.scenario({ ytdlp: "ok" })
    root.ask("refresh works", "refresh", id, function(result) {
      h.equal([result.ok, result.code, result.cached], [true, "", false], "refresh works: a new lookup")
      root.checkEntry("refresh works", result.entry, id, 2)
      h.check(root.resolver.entry(id) === result.entry, "refresh works: the new entry replaced the old one")
      h.check(h.readFile(root.infoFile(2)).length > 1000, "refresh works: the new file is there when told")
      root.settled(function() {
        var since = h.jobs().slice(before)
        h.equal(since.map(function(job) { return job.tag }), ["resolve", "write", "remove"],
          "refresh works: the old file is removed after the new one was written")
        h.equal(since[1].command[since[1].command.length - 1], root.infoFile(2), "refresh works: written: 2")
        h.equal(since[2].command.slice(7), [h.tools.rm, "-f", "--", root.infoFile(1)],
          "refresh works: removed: 1, and only that")
        root.listing(function(found) {
          h.equal(found, root.files([2]), "refresh works: one file again, the new one")
          root.next()
        })
      })
    })
  }

  // The height setting picks one of three constant formats.
  function otherHeights() {
    var h = root.h
    var second = root.vid("B")
    var third = root.vid("C")
    root.resolver.settings = { maxHeight: 1080, preload: false }
    root.lookUp("1080", second, 3, function() {
      h.equal(h.log("ytdlp")[root.starts() - 1].argv, root.flags(1080), "1080: the larger format")
      h.check(h.readFile(root.infoFile(3)) === root.answer(second),
        "1080: the file is the answer for that id")
      root.resolver.settings = { maxHeight: "480]+bestaudio/best --exec x", preload: false }
      root.lookUp("odd height", third, 4, function() {
        h.equal(h.log("ytdlp")[root.starts() - 1].argv, root.flags(720), "odd height: the middle format")
        root.resolver.settings = { maxHeight: 720, preload: false }
        root.next()
      })
    })
  }

  function givenUp() {
    var h = root.h
    var id = root.vid("D")
    var before = root.starts()
    var answers = []
    h.scenario({ ytdlp: "slow:3000" })
    root.resolver.cancelPlay()
    root.ask("given up", "ensure", id, function(result) { answers.push(result) })
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "given up: yt-dlp is running")
      var since = Date.now()
      root.resolver.cancelPlay()
      h.equal(answers.length, 0, "given up: not answered inside cancelPlay()")
      root.settled(function() {
        h.check(Date.now() - since < 2000, "given up: yt-dlp was ended, not waited for")
        h.alive(function(names) {
          h.equal(names, [], "given up: and it is gone")
          h.after(300, function() {
            h.equal(answers.length, 1, "given up: one answer")
            root.failed("given up: and it says cancelled", answers[0], "cancelled")
            h.equal([root.resolver.fresh(id), root.resolver.entry(id)], [false, null], "given up: no entry")
            root.listing(function(found) {
              h.equal(found, root.files([2, 3, 4]), "given up: no file")
              root.next()
            })
          })
        })
      })
    })
  }

  // Someone else stops every job of the runner. The caller did not give
  // the lookup up, so it must hear an answer that ends its wait.
  function stoppedByAnother() {
    var h = root.h
    var id = root.vid("D")
    var before = root.starts()
    var answers = []
    h.scenario({ ytdlp: "hang" })
    root.ask("stopped", "ensure", id, function(result) { answers.push(result) })
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "stopped: yt-dlp is running")
      root.runner.cancelAll()
      root.settled(function() {
        h.equal(answers.length, 1, "stopped: one answer")
        root.failed("stopped: a code, not the cancelled every caller ignores", answers[0], "E_YTDLP_FAILED")
        h.equal(root.resolver.entry(id), null, "stopped: no entry")
        root.next()
      })
    })
  }

  // Fills the runner so that the write of the next lookup has to wait: five
  // jobs and the lookup make six, and one more job takes the lookup's place
  // the moment yt-dlp is done. The first job runs for first milliseconds,
  // the others for rest. Asks for id, and calls then() once its answer has
  // arrived from yt-dlp and the write is waiting.
  function withWriteWaiting(label, id, first, rest, done, then) {
    var h = root.h
    var probe = h.repo + "/tests/stubs/probe.js"
    var probes = h.log("probe").length
    var block = function(ms) {
      root.runner.run({
        tag: "blocker", argv: [probe, "sleep:" + ms], timeoutSec: 5, maxBytes: 64, env: Env.local(),
        done: function(result) {}
      })
    }
    h.scenario({ ytdlp: "ok" })
    block(first)
    for (var i = 0; i < 4; i++) block(rest)
    root.ask(label, "ensure", id, done)
    block(rest)
    h.equal([root.runner.active, root.runner.waiting], [6, 1], label + ": the runner is full")
    // The last job can only have started in the place of yt-dlp, so what
    // waits now is the write.
    var writeWaits = function() {
      return h.log("probe").length === probes + 6 && root.runner.active === 6 && root.runner.waiting === 1
    }
    h.waitFor(writeWaits, 5000, function(waits) {
      h.check(waits, label + ": the answer is there and its write waits")
      then()
    })
  }

  // The answer has arrived and its write waits behind other jobs when the
  // lookup is given up: the file is written and removed again at once.
  function givenUpWhileWriting() {
    var h = root.h
    var id = root.vid("E")
    var before = h.jobs().length
    var answers = []
    root.withWriteWaiting("writing", id, 1500, 1500, function(result) { answers.push(result) }, function() {
      root.resolver.cancelPlay()
      root.settled(function() {
        h.equal(answers.length, 1, "writing: one answer")
        root.failed("writing: and it says cancelled", answers[0], "cancelled")
        h.equal(root.resolver.entry(id), null, "writing: no entry")
        var tags = h.jobs().slice(before).map(function(job) { return job.tag })
        var own = tags.filter(function(tag) { return tag !== "blocker" })
        h.equal(own, ["resolve", "write", "remove"], "writing: written, then removed")
        root.listing(function(found) {
          h.equal(found, root.files([2, 3, 4]), "writing: no file is left")
          root.next()
        })
      })
    })
  }

  function overtaken() {
    var h = root.h
    var slow = root.vid("F")
    var quick = root.vid("G")
    var before = root.starts()
    var answers = []
    h.scenario({ ytdlp: "slow:3000" })
    root.ask("overtaken", "ensure", slow, function(result) { answers.push(result) })
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "overtaken: the first yt-dlp is running")
      h.scenario({ ytdlp: "ok" })
      // File 5 was used up by the lookup that was given up while writing.
      var since = Date.now()
      root.lookUp("overtaking", quick, 6, function() {
        h.equal(answers.length, 1, "overtaken: the first request was answered")
        root.failed("overtaken: with cancelled", answers[0], "cancelled")
        root.settled(function() {
          h.check(Date.now() - since < 2000, "overtaken: the first yt-dlp was ended, not waited for")
          h.alive(function(names) {
            h.equal(names, [], "overtaken: and it is gone")
            h.equal(root.resolver.entry(slow), null, "overtaken: no entry for the first")
            // A request that is answered from the cache can be given up too.
            root.ask("hit given up", "ensure", quick, function(result) {
              root.failed("hit given up: cancelled, not the entry", result, "cancelled")
              root.next()
            })
            root.resolver.cancelPlay()
          })
        })
      })
    })
  }

  function joined() {
    var h = root.h
    var id = root.vid("H")
    var before = root.starts()
    var entries = []
    h.scenario({ ytdlp: "slow:300" })
    var note = function(result) {
      h.equal([result.ok, result.cached], [true, false], "joined: a new lookup for each who asked")
      entries.push(result.entry)
    }
    root.ask("joined, first", "ensure", id, note)
    root.ask("joined, second", "ensure", id, note)
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function() {
      // Also while yt-dlp runs.
      root.ask("joined, third", "ensure", id, note)
      h.waitFor(function() { return entries.length === 3 }, 5000, function(all) {
        h.check(all, "joined: all three are answered")
        h.check(entries[0] === entries[1] && entries[1] === entries[2], "joined: with the same entry")
        root.checkEntry("joined", entries[0], id, 7)
        h.equal(root.starts(), before + 1, "joined: yt-dlp ran once")
        root.next()
      })
    })
  }

  function failure(list, i) {
    var h = root.h
    if (i >= list.length) { root.next(); return }
    var id = root.vid("I")
    h.scenario({ ytdlp: list[i][0] })
    root.ask(list[i][0], "ensure", id, function(result) {
      root.failed(list[i][0] + ": its code", result, list[i][1])
      h.equal(root.resolver.entry(id), null, list[i][0] + ": no entry")
      root.failure(list, i + 1)
    })
  }

  function failures() {
    root.failure([
      ["refused", "E_YT_REFUSED"], ["account", "E_NEEDS_ACCOUNT"], ["not-started", "E_NOT_STARTED"],
      ["blocked", "E_YT_BLOCKED"], ["network", "E_NETWORK"], ["unknown", "E_YTDLP_FAILED"],
      // Exit code 0, and something that is not the answer that was asked for.
      ["garbage", "E_BAD_OUTPUT"], ["non-ascii", "E_BAD_OUTPUT"], ["wrong-id", "E_BAD_OUTPUT"],
      ["empty", "E_BAD_OUTPUT"],
      // More output than an answer may have: without end, by one byte, and
      // several times over, as the whole record of a video can be.
      ["flood", "E_BAD_OUTPUT"], ["big:" + (Const.LIMITS.resolveBytes + 1), "E_BAD_OUTPUT"],
      ["big:" + 3 * Const.LIMITS.resolveBytes, "E_BAD_OUTPUT"]
    ], 0)
  }

  // A yt-dlp that never answers is ended at the deadline, shortened here.
  function noAnswer() {
    var h = root.h
    var usual = Const.TIMEOUTS.resolve
    var began = Date.now()
    h.scenario({ ytdlp: "hang" })
    Const.TIMEOUTS.resolve = 1
    root.ask("hang", "ensure", root.vid("I"), function(result) {
      root.failed("hang: the deadline ends it", result, "E_TIMEOUT")
      h.check(Date.now() - began < 6000, "hang: at the shortened deadline")
      root.listing(function(found) {
        h.equal(found, root.files([2, 3, 4, 6, 7]), "failures: none of them left a file")
        root.next()
      })
    })
    Const.TIMEOUTS.resolve = usual
  }

  function badRequests() {
    var h = root.h
    var before = [root.starts(), h.jobs().length]
    var answers = []
    var note = function(result) { answers.push(result.ok + "/" + result.code + "/" + result.entry) }
    var notIds = [
      "", "short", "AAAAAAAAAAAA", "https://www.youtube.com/watch?v=AAAAAAAAAAA", null, undefined, 5, {},
      ["AAAAAAAAAAA"]
    ]
    for (var i = 0; i < notIds.length; i++) {
      root.resolver.ensure(notIds[i], "play", note)
      root.resolver.refresh(notIds[i], note)
    }
    // A purpose that does not exist, and a lookup for a rested highlight
    // while the setting for it is off.
    var purposes = ["preload", "Next", "", undefined, null, "PLAY", 1]
    for (var k = 0; k < purposes.length; k++) root.resolver.ensure(root.vid("I"), purposes[k], note)
    // A request without a callback is still a request.
    root.resolver.ensure("short", "play")
    root.resolver.refresh("short")
    root.resolver.retain(null)
    root.resolver.retain("AAAAAAAAAAA")
    h.equal(answers.length, 0, "bad requests: none is answered inside the request")
    h.after(300, function() {
      var invalid = answers.filter(function(answer) { return answer === "false/E_INVALID_INPUT/null" })
      var ignored = answers.filter(function(answer) { return answer === "false/cancelled/null" })
      h.equal([answers.length, invalid.length, ignored.length], [25, 18, 7], "bad requests: each is answered")
      h.equal([root.starts(), h.jobs().length], before, "bad requests: nothing was started")
      h.equal(root.resolver.entry(root.vid("B")).n, 3, "bad requests: the cache is untouched")
      root.next()
    })
  }

  function noYtDlp() {
    var h = root.h
    var tools = {}
    for (var name in h.tools) tools[name] = h.tools[name]
    tools.ytdlp = "/nonexistent/yt-dlp"
    var runner = h.mount("core/ProcessRunner.qml", { tools: tools })
    var resolver = h.mount("core/Resolver.qml", { runner: runner, tools: tools, fs: root.fs, settings: null })
    resolver.ensure(root.vid("I"), "play", function(result) {
      root.failed("no yt-dlp: says so", result, "E_YTDLP_MISSING")
      root.next()
    })
  }

  // The answer cannot be written: the lookup fails and nothing is kept.
  function writeFails() {
    var h = root.h
    var id = root.vid("J")
    h.scenario({ ytdlp: "ok" })
    h.exec(["/usr/bin/chmod", "500", root.fs.paths.infoDir], null, function() {
      root.ask("write fails", "ensure", id, function(result) {
        root.failed("write fails: the runtime folder is to blame", result, "E_RUNTIME_DIR")
        h.equal([root.resolver.fresh(id), root.resolver.entry(id)], [false, null], "write fails: no entry")
        root.settled(function() {
          h.exec(["/usr/bin/chmod", "700", root.fs.paths.infoDir], null, function() {
            root.listing(function(found) {
              h.equal(found, root.files([2, 3, 4, 6, 7]), "write fails: no file, whole or half")
              root.next()
            })
          })
        })
      })
    })
  }

  // An entry that is too old counts as absent for a lookup, and its file
  // goes when the new one is there. The age limit is shortened to make the
  // entries of this case old.
  function expired() {
    var h = root.h
    var id = root.vid("A")
    var usual = Const.LIMITS.resolveTtlMs
    var old = root.resolver.entry(id)
    var before = h.jobs().length
    h.scenario({ ytdlp: "ok" })
    h.after(30, function() {
      Const.LIMITS.resolveTtlMs = 20
      h.equal(root.resolver.fresh(id), false, "expired: not fresh any more")
      h.check(root.resolver.entry(id) === old, "expired: entry() still hands it out")
      // File 8 went to the lookup whose write failed.
      root.lookUp("expired", id, 9, function(result) {
        Const.LIMITS.resolveTtlMs = usual
        h.check(root.resolver.entry(id) === result.entry && root.resolver.fresh(id), "expired: replaced")
        root.settled(function() {
          var since = h.jobs().slice(before)
          h.equal(since.map(function(job) { return job.tag }), ["resolve", "write", "remove"],
            "expired: looked up, written, and then the old file removed")
          h.equal(since[2].command.slice(10), [root.infoFile(2)], "expired: removed: 2")
          root.listing(function(found) {
            h.equal(found, root.files([3, 4, 6, 7, 9]), "expired: the files of the five entries")
            root.next()
          })
        })
      })
    })
  }

  // Looks up ids one after the other, then calls then().
  function lookUpAll(letters, n, then) {
    if (letters.length === 0) { then(); return }
    root.lookUp("fill " + letters[0], root.vid(letters[0]), n, function() {
      root.lookUpAll(letters.slice(1), n + 1, then)
    })
  }

  function cachedLetters() {
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
    return letters.filter(function(letter) { return root.resolver.entry(root.vid(letter)) !== null }).join("")
  }

  function retained() {
    var h = root.h
    h.equal(Const.LIMITS.resolveCache, 8, "retain: the cache holds eight")
    // Five entries so far: B, C, G, H and A, in the order they were last
    // used. Four more make nine.
    root.lookUpAll(["K", "L", "M", "N"], 10, function() {
      h.equal(root.cachedLetters(), "ABCGHKLMN", "retain: nine entries")
      // B is used again, which makes C the least recently used.
      root.ask("retain, touch", "ensure", root.vid("B"), function(touched) {
        h.equal(touched.cached, true, "retain: B is a hit")
        root.resolver.retain([root.vid("C")])
        h.equal(root.cachedLetters(), "ABCHKLMN", "retain: G went, the oldest that was not to be kept")
        root.resolver.retain([])
        root.resolver.retain(["not an id", null, 5])
        h.equal(root.cachedLetters(), "ABCHKLMN", "retain: at the limit nothing more goes")
        root.lookUpAll(["O", "P"], 14, function() {
          var all = "ABCHKLMNOP".split("").map(root.vid)
          root.resolver.retain(all)
          h.equal(root.cachedLetters(), "ABCHKLMNOP", "retain: ten that are all to be kept stay")
          root.resolver.retain([root.vid("C"), root.vid("H")])
          h.equal(root.cachedLetters(), "BCHLMNOP", "retain: A and K went, the two oldest of the others")
          root.settled(function() {
            root.listing(function(found) {
              h.equal(found, root.files([3, 4, 7, 11, 12, 13, 14, 15]), "retain: their files went with them")
              root.next()
            })
          })
        })
      })
    })
  }

  // With eight entries on disk: no id in any command line or file name.
  function neverNamed() {
    var h = root.h
    var commands = JSON.stringify(h.jobs())
    var named = root.asked.filter(function(id) { return commands.indexOf(id) !== -1 })
    h.check(root.asked.length >= 16, "never named: the ids this case asked for")
    h.equal(named, [], "never named: no id is in any command")
    h.check(commands.indexOf("watch?v=") === -1 && commands.indexOf("youtube") === -1,
      "never named: nor an address")
    var find = ["/usr/bin/find", root.fs.paths.runtimeDir + "/info", root.fs.paths.runtimeDir + "/thumbs",
      "-mindepth", "1", "-printf", "%f\n"]
    h.exec(find, null, function(code, out) {
      var names = out.split("\n").filter(function(name) { return name !== "" })
      var plain = names.filter(function(name) { return /^[0-9]{1,10}\.json$/.test(name) })
      h.equal([names.length, plain.length], [8, 8], "never named: every file is named by digits alone")
      var seen = h.log("ytdlp").filter(function(record) { return record.stdin.indexOf("watch?v=") !== -1 })
      h.equal(seen.length, root.starts(), "never named: the stub got every address on stdin")
      root.next()
    })
  }

  function purged() {
    var h = root.h
    var before = h.jobs().length
    root.resolver.purge([root.vid("B"), "not an id", root.vid("P"), root.vid("Z"), null])
    h.equal(root.cachedLetters(), "BP", "purge: only the entries to be kept are left")
    root.settled(function() {
      var since = h.jobs().slice(before)
      h.equal(since.map(function(job) { return job.tag }), ["remove"], "purge: one removal")
      h.equal(since[0].command.slice(10).sort(),
        [4, 7, 11, 12, 13, 14].map(root.infoFile).sort(), "purge: of exactly the dropped entries' files")
      root.listing(function(found) {
        h.equal(found, root.files([3, 15]), "purge: the kept files are there")
        // With nothing to keep the folder is emptied, strays included.
        h.writeFile(root.fs.paths.infoDir + "/.16.json.AbCdEf", "left by a write that never finished")
        before = h.jobs().length
        root.resolver.purge([])
        h.equal(root.cachedLetters(), "", "purge: nothing is left in the cache")
        root.settled(function() {
          h.equal(h.jobs().slice(before), [{ tag: "purge", command: root.wrapper(5).concat([
            h.tools.find, root.fs.paths.infoDir, "-mindepth", "1", "-maxdepth", "1", "-type", "f", "-delete"
          ]) }], "purge: the folder is emptied as a whole")
          root.listing(function(left) {
            h.equal(left, [], "purge: and it is empty")
            before = h.jobs().length
            root.resolver.purge([])
            root.resolver.purge()
            h.after(200, function() {
              h.equal(h.jobs().length, before, "purge: with nothing written since, no job at all")
              root.next()
            })
          })
        })
      })
    })
  }

  // A purge does not give up the lookup in progress, and does not take its
  // file from under it: here it comes while the write waits, and the one
  // slot that opens first goes to the write alone.
  function purgedWhileLooking() {
    var h = root.h
    var id = root.vid("R")
    var before = h.jobs().length
    var done = function(result) {
      h.equal([result.ok, result.code, result.cached], [true, "", false], "purge while looking: looked up")
      root.checkEntry("purge while looking", result.entry, id, 16)
      root.settled(function() {
        var tags = h.jobs().slice(before).map(function(job) { return job.tag })
        h.equal(tags.filter(function(tag) { return tag !== "blocker" }), ["resolve", "write"],
          "purge while looking: the purge started no job")
        root.listing(function(found) {
          h.equal(found, root.files([16]), "purge while looking: the file is there, and stays")
          root.resolver.purge([])
          root.settled(function() {
            root.listing(function(left) {
              h.equal([left.length, root.resolver.entry(id)], [0, null], "purge while looking: gone later")
              root.next()
            })
          })
        })
      })
    }
    root.withWriteWaiting("purge while looking", id, 1000, 1800, done, function() {
      root.resolver.purge([])
      root.resolver.retain([])
      h.equal(root.resolver.entry(id), null, "purge while looking: no entry yet")
    })
  }

  // An answer of exactly as many bytes as one may have is read, written
  // and kept whole.
  function largest() {
    var h = root.h
    var id = root.vid("S")
    h.equal(Const.LIMITS.resolveBytes, 4194304, "largest: the cap")
    h.scenario({ ytdlp: "big:" + Const.LIMITS.resolveBytes })
    root.lookUp("largest", id, 17, function() {
      var size = ["/usr/bin/stat", "-c", "%a %s", root.infoFile(17)]
      h.exec(size, null, function(code, out) {
        h.equal(out, "600 4194304\n", "largest: every byte is in the file")
        var text = h.readFile(root.infoFile(17))
        h.check(text.length === Const.LIMITS.resolveBytes && text.indexOf(root.answer(id).slice(0, -1)) === 0,
          "largest: and it is the answer")
        root.resolver.purge([])
        root.settled(function() { root.next() })
      })
    })
  }

  // ---- The address of the picture ----

  function askPicture(label, id, then) {
    var h = root.h
    var returned = false
    var answers = 0
    root.resolver.refreshVideoUrl(id, function(result) {
      answers += 1
      h.check(returned && answers === 1, label + ": answered once, after the request returned")
      h.equal(Object.keys(result), ["ok", "code", "videoUrl"], label + ": the keys of the answer")
      then(result)
    })
    returned = true
  }

  // A track that keeps playing gets a new address for its picture, and
  // nothing else about its entry changes: mpv's playlist still names the
  // file, so no file is written and none is deleted.
  function pictureAddress() {
    var h = root.h
    var id = root.vid("T")
    var moved = root.videoUrl.replace("rr1---", "rr2---")
    h.scenario({ ytdlp: "ok" })
    root.askPicture("picture, no entry", id, function(none) {
      h.equal([none.ok, none.code, none.videoUrl], [false, "E_VIDEO_NONE", ""], "picture: no entry, none")
      root.lookUp("picture", id, 18, function(made) {
        var old = made.entry
        var before = [root.starts(), h.jobs().length]
        h.scenario({ ytdlp: "moved" })
        root.askPicture("picture", id, function(result) {
          h.equal([result.ok, result.code, result.videoUrl], [true, "", moved], "picture: the new address")
          var entry = root.resolver.entry(id)
          h.equal([entry.n, entry.file, entry.resolvedAt, entry.videoUrl],
            [18, root.infoFile(18), old.resolvedAt, moved], "picture: the entry keeps file, counter and age")
          h.check(entry.track === old.track && Object.isFrozen(entry), "picture: and its track")
          h.equal(h.log("ytdlp")[before[0]].argv, root.flags(720), "picture: the signed-out lookup")
          h.scenario({ ytdlp: "refused" })
          root.askPicture("picture refused", id, function(refused) {
            h.equal([refused.ok, refused.code, refused.videoUrl], [false, "E_YT_REFUSED", ""],
              "picture: the code of a failure")
            h.check(root.resolver.entry(id) === entry, "picture: a failure changes nothing")
            root.settled(function() {
              var tags = h.jobs().slice(before[1]).map(function(job) { return job.tag })
              h.equal(tags, ["resolve", "resolve"], "picture: nothing was written or removed")
              h.check(h.readFile(root.infoFile(18)) === root.answer(id),
                "picture: the file of the play is as it was")
              root.listing(function(found) {
                h.equal(found, root.files([18]), "picture: one file, as before")
                var bad = []
                root.resolver.refreshVideoUrl("short", function(answer) { bad.push(answer) })
                root.resolver.refreshVideoUrl(null)
                h.after(100, function() {
                  h.equal(bad, [{ ok: false, code: "E_INVALID_INPUT", videoUrl: "" }], "picture: not an id")
                  root.next()
                })
              })
            })
          })
        })
      })
    })
  }

  // A play always comes first. A request for the picture never ends the
  // lookup of a play: it shares the one for its own track and gives way to
  // one for another. A play, or playback stopping, ends it.
  function pictureBesideAPlay() {
    var h = root.h
    var id = root.vid("T")
    var other = root.vid("U")
    var before = root.starts()
    var pictures = []
    var note = function(result) { pictures.push(result.code === "" ? result.videoUrl : result.code) }
    h.scenario({ ytdlp: "slow:800" })
    root.ask("picture beside a play", "ensure", other, function(played) {
      h.equal([played.ok, played.code], [true, ""], "picture beside a play: the play went on")
      h.equal(pictures, ["cancelled"], "picture beside a play: the picture gave way")
      root.ask("picture with its play", "refresh", id, function(again) {
        h.check(again.ok, "picture with its play: looked up again")
        h.equal(root.starts() - before, 2, "picture with its play: two lookups for three requests")
        h.scenario({ ytdlp: "slow:3000" })
        root.resolver.refreshVideoUrl(id, note)
        h.waitFor(function() { return root.starts() === before + 3 }, 5000, function() {
          // The play was told first, the picture right behind it.
          h.equal(pictures, ["cancelled", root.videoUrl], "picture with its play: shared the lookup")
          root.resolver.cancelPlay()
          root.resolver.refreshVideoUrl(id, note)
          h.waitFor(function() { return root.starts() === before + 4 }, 5000, function() {
            h.scenario({ ytdlp: "ok" })
            root.ask("a play ends a picture", "ensure", root.vid("V"), function(played2) {
              h.check(played2.ok, "a play ends a picture: the play is looked up")
              h.equal(pictures.slice(2), ["cancelled", "cancelled"],
                "a play ends a picture: stopped by playback, then by a play")
              root.resolver.purge([])
              root.settled(function() { root.next() })
            })
          })
        })
      })
      root.resolver.refreshVideoUrl(id, note)
    })
    root.resolver.refreshVideoUrl(id, note)
  }

  // ---- With the account ----

  readonly property string jarRows: "# Netscape HTTP Cookie File\n\n"
    + "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1893456000\tLOGIN_INFO\tinvented-login\n"
    + ".youtube.com\tTRUE\t/\tTRUE\t1893456000\tSAPISID\tinvented-key\n"

  // What the keeper stands in for was asked to do, and how it is told to
  // behave: the requests it got, the tickets it was asked to give up, and
  // whether it refuses calls or leaves the verdict on the login to others.
  property var requests: []
  property var tickets: []
  property var keeperJob: null
  property bool refusing: false
  property bool silent: false
  // It takes the call and then finds that it cannot run it.
  property bool stuck: false

  function copyFile(n) {
    return root.fs.paths.jarDir + "/" + n + ".txt"
  }

  function accountFlags(n) {
    var flags = root.flags(720)
    return flags.slice(0, 11).concat(["--cookies", root.copyFile(n)], flags.slice(13))
  }

  // Stands in for the keeper of the saved login, with the two functions the
  // resolver uses. Like the real one it copies the login, runs what the
  // request builds for the copy under the private umask, removes the copy
  // and only then tells, with its verdict on the login.
  function runSigned(request) {
    root.requests.push(request)
    var gone = { ok: false, error: "refused", exitCode: -1, stdout: "", stderr: "", durationMs: 0 }
    if (root.refusing) {
      root.h.after(0, function() { request.done(gone, "") })
      return 0
    }
    var ticket = root.requests.length
    if (root.stuck) {
      root.h.after(0, function() { request.done(gone, "") })
      return ticket
    }
    var copy = root.copyFile(ticket)
    var entry = { ticket: ticket, job: 0 }
    root.keeperJob = entry
    // A call that shows the login is no longer accepted is told by its
    // code, with nothing of its output.
    var tell = function(result) {
      var code = root.silent ? "" : Errors.fromSignedIn(result)
      var blank = { ok: false, error: "signed-out", exitCode: -1, stdout: "", stderr: "", durationMs: 0 }
      root.fs.remove([copy], function() { request.done(code === "" ? result : blank, code) })
    }
    root.fs.copyJar(ticket, function(copied) {
      if (!copied.ok) { tell(copied); return }
      entry.job = root.runner.run({
        tag: request.tag, argv: request.build(copy), stdin: request.stdin, timeoutSec: request.timeoutSec,
        maxBytes: request.maxBytes, env: Env.net(root.fs.paths), umask077: true, done: tell
      })
    })
    return ticket
  }

  function cancelSigned(ticket) {
    root.tickets.push(ticket)
    var entry = root.keeperJob
    if (entry !== null && entry.ticket === ticket && entry.job !== 0) root.runner.cancel(entry.job)
  }

  // then(lines): "<mode> <name>" for everything in the folder of copies,
  // and the mode and text of the saved login.
  function jarState(then) {
    var paths = root.fs.paths
    var find = ["/usr/bin/find", paths.jarDir, "-mindepth", "1", "-printf", "%m %f\n"]
    root.h.exec(find, null, function(code, out) {
      root.h.exec(["/usr/bin/stat", "-c", "%a", paths.jarFile], null, function(status, mode) {
        var saved = status === 0 ? root.h.readFile(paths.jarFile) : ""
        then(out.split("\n").filter(function(line) { return line !== "" }), mode.trim(), saved)
      })
    })
  }

  // A saved login for the steps below: made-up rows, private. Until someone
  // keeps it, nothing can be asked with the account.
  function accountReady() {
    var h = root.h
    var paths = root.fs.paths
    root.fs.prepareData(function(result) {
      h.check(result.ok, "account: the data folder is there")
      h.writeFile(paths.jarFile, root.jarRows)
      h.exec(["/usr/bin/chmod", "600", paths.jarFile], null, function() {
        var before = [root.starts(), h.jobs().length]
        var answers = []
        var note = function(answer) { answers.push(answer.code) }
        var keepers = [null, undefined, {}, { runSigned: "no function" }]
        for (var i = 0; i < keepers.length; i++) {
          root.resolver.account = keepers[i]
          root.resolver.refreshWithAccount(root.vid("W"), note)
        }
        root.resolver.account = { runSigned: root.runSigned, cancelSigned: root.cancelSigned }
        root.resolver.refreshWithAccount("short", note)
        root.resolver.refreshWithAccount(null)
        h.after(200, function() {
          var none = "E_SIGNED_OUT"
          h.equal(answers, [none, none, none, none, "E_INVALID_INPUT"],
            "account: nothing is asked while nobody keeps a login, or without an id")
          h.equal([root.starts(), h.jobs().length, root.requests.length], [before[0], before[1], 0],
            "account: and no job")
          root.next()
        })
      })
    })
  }

  // YouTube refuses a video to a visitor. Asked again with the account, it
  // is looked up by the keeper of the login with a copy of it: the command
  // the resolver builds names the copy it is handed, and no command is
  // built for the saved login itself or for any other file.
  function withAccount() {
    var h = root.h
    var id = root.vid("W")
    var paths = root.fs.paths
    var before = [root.starts(), h.jobs().length]
    h.scenario({ ytdlp: "restricted" })
    root.ask("visitor", "ensure", id, function(refused) {
      root.failed("visitor: the video needs an account", refused, "E_NEEDS_ACCOUNT")
      var returned = false
      root.resolver.refreshWithAccount(id, function(result) {
        h.check(returned, "with the account: answered after the request returned")
        h.equal([result.ok, result.code, result.cached], [true, "", false], "with the account: looked up")
        h.equal([result.entry.id, result.entry.file], [id, root.infoFile(result.entry.n)],
          "with the account: an entry like any other")
        h.check(root.resolver.entry(id) === result.entry, "with the account: and it is kept")
        var request = root.requests[0]
        h.equal([root.requests.length, request.tag, request.stdin, request.timeoutSec, request.maxBytes],
          [1, "resolve", "https://www.youtube.com/watch?v=" + id + "\n", 25, 4194304],
          "with the account: one call, bounded like every lookup, the address on stdin")
        h.equal(request.build(root.copyFile(9)), [h.tools.ytdlp].concat(root.accountFlags(9)),
          "with the account: the command names the copy it is handed")
        var others = [paths.jarFile, paths.jarDir + "/cookies.txt", root.infoFile(1), "/etc/passwd", "", null]
        var built = others.filter(function(file) { return request.build(file) !== null })
        h.equal(built, [], "with the account: no command for the saved login or any other file")
        var records = h.log("ytdlp").slice(before[0])
        h.equal(records.length, 2, "with the account: one lookup as a visitor, one signed in")
        h.equal([records[0].argv, records[0].jar], [root.flags(720), undefined], "visitor: no cookie file")
        h.equal(records[1].argv, root.accountFlags(1), "with the account: the copy in place of the pair")
        h.equal(records[1].jar, { found: true, mode: "600", login: true },
          "with the account: yt-dlp found a private copy that holds the login")
        root.settled(function() {
          h.equal(h.jobs().slice(before[1]).map(function(job) { return job.tag }),
            ["resolve", "jar-copy", "resolve", "remove", "write"], "with the account: the jobs, in order")
          root.jarState(function(copies, mode, saved) {
            h.equal([copies, mode, saved === root.jarRows], [[], "600", true],
              "with the account: no copy is left, and the saved login is untouched")
            root.whileItRuns()
          })
        })
      })
      returned = true
    })
  }

  // Playback stopping gives the call up at the keeper of the login, and the
  // caller hears "cancelled" whatever the call still says.
  function whileItRuns() {
    var h = root.h
    var id = root.vid("X")
    var before = root.starts()
    var answers = []
    h.scenario({ ytdlp: "slow:3000" })
    root.resolver.refreshWithAccount(id, function(result) { answers.push(result.code) })
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "while it runs: yt-dlp is running")
      var since = Date.now()
      root.resolver.cancelPlay()
      h.equal(root.tickets, [2], "while it runs: the call is given up by its ticket")
      root.settled(function() {
        h.check(Date.now() - since < 2000, "while it runs: yt-dlp was ended, not waited for")
        h.equal([answers, root.resolver.entry(id)], [["cancelled"], null], "while it runs: given up")
        root.jarState(function(left) {
          h.equal(left, [], "while it runs: the copy went with the call")
          root.next()
        })
      })
    })
  }

  // YouTube no longer accepts the login: yt-dlp says so in a warning and
  // answers all the same. That answer is not used, whether the keeper of
  // the login noticed or not. A call the keeper does not take is not made.
  function accountRefused() {
    var h = root.h
    var id = root.vid("Y")
    var before = root.starts()
    var codes = []
    h.scenario({ ytdlp: "signed-out" })
    root.resolver.refreshWithAccount(id, function(result) {
      root.failed("signed out: the answer is not used", result, "E_SIGNED_OUT")
      root.silent = true
      root.resolver.refreshWithAccount(id, function(again) {
        root.failed("signed out, unnoticed: the answer is still not used", again, "E_SIGNED_OUT")
        root.silent = false
        h.equal(root.starts() - before, 2, "signed out: yt-dlp was asked both times")
        root.refusing = true
        h.scenario({ ytdlp: "ok" })
        root.resolver.refreshWithAccount(id, function(none) {
          codes.push(none.code)
          h.after(200, function() {
            h.equal(codes, ["E_SIGNED_OUT"], "not taken: answered once, as signed out")
            h.equal([root.starts() - before, root.resolver.entry(id)], [2, null], "not taken: nothing asked")
            root.refusing = false
            root.stuck = true
            root.resolver.refreshWithAccount(id, function(unrun) {
              root.stuck = false
              root.failed("taken and not run: not the video's fault", unrun, "E_RUNTIME_DIR")
            })
            root.settled(function() {
              root.jarState(function(copies) {
                h.equal(copies, [], "signed out: no copy is left")
                var withJar = h.log("ytdlp").filter(function(record) { return record.jar !== undefined })
                h.equal(withJar.length, 4, "only the lookups asked for with the account were given a login")
                root.listing(function(found) {
                  h.equal(found.length, 1, "one info file: the one the account lookup made")
                  root.resolver.purge([])
                  root.settled(function() { root.next() })
                })
              })
            })
          })
        })
      })
    })
  }

  // Nothing of a lookup may reach the log: no id, no address, and not what
  // the tool printed.
  function quiet() {
    var h = root.h
    h.equal([Const.TIMEOUTS.resolve, Const.LIMITS.resolveTtlMs], [25, 18000000], "quiet: the usual limits")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      var log = h.readFile(h.runDir + "/out.txt")
      var named = root.asked.filter(function(id) { return log.indexOf(id) !== -1 })
      h.equal(named, [], "quiet: no id is in the log")
      var printed = [
        "watch?v=", "googlevideo", "ERROR: [youtube]", "Private video", "Reading URLs", "vid=1", "WARNING",
        "no longer valid", "LOGIN_INFO", "invented"
      ]
      h.check(JSON.stringify(h.jobs()).indexOf("invented") === -1, "quiet: no cookie is in any command")
      for (var i = 0; i < printed.length; i++) {
        h.check(log.indexOf(printed[i]) === -1, "quiet: the log holds nothing of a lookup (" + i + ")")
      }
      root.next()
    })
  }
}
