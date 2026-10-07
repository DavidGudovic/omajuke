import QtQuick
import "../../../lib/Const.js" as Const

// core/Search.qml fetching the tracks YouTube relates to one video, against
// the yt-dlp stub: the command line is the constant signed-out list and the
// video is only ever named in the stub's standard input; the list is
// capped, cleaned and without the video it was built around; every way it
// can fail ends in one answer and changes nothing else, least of all the
// search the panel shows.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var search: null
  property var steps: []
  property int at: 0
  // Every id this case asks for, to look for afterwards.
  property var asked: []

  // prepare only asks whether mpv is an executable file.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.search = h.mount("core/Search.qml", { runner: root.runner, tools: h.tools, fs: root.fs })
    if (root.runner === null || root.fs === null || root.search === null) { h.finish(); return }
    root.steps = [
      root.beforeReady, root.related, root.recorded, root.besideASearch, root.noMix, root.failures,
      root.noAnswer, root.tooLong, root.overtaken, root.stoppedByAnother, root.badRequests, root.quiet
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

  function snapshot() {
    var s = root.search
    return [s.status, s.query, s.results.length, s.errorCode]
  }

  // The flags behind the tool, written out a second time.
  function flags() {
    return [
      "--ignore-config", "--no-plugin-dirs", "--cache-dir", root.fs.paths.ytCacheDir, "--color", "never",
      "--no-cookies-from-browser", "--no-mark-watched", "--no-remote-components", "--socket-timeout", "10",
      "--no-cookies", "--no-warnings", "--flat-playlist", "--playlist-items", "1:25", "-J", "-a", "-"
    ]
  }

  function starts() {
    return root.h.log("ytdlp").length
  }

  // The ids of the related tracks the fixture holds within the first 25
  // entries: not the video itself, not the entry listed twice, the empty
  // one, the premiere or the one whose id is no id.
  function relatedIds() {
    var numbers = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
    return numbers.map(function(n) { return "RRRRRRRR" + ("00" + n).slice(-3) })
  }

  // Asks for the tracks related to id and calls then(result) with the
  // answer, which must come exactly once and never before the request has
  // returned.
  function ask(label, id, then) {
    var h = root.h
    var returned = false
    var answers = 0
    root.search.mix(id, function(result) {
      answers += 1
      h.check(returned && answers === 1, label + ": answered once, after the request returned")
      h.equal(Object.keys(result), ["ok", "code", "tracks"], label + ": the keys of the answer")
      then(result)
    })
    returned = true
  }

  function failed(label, result, code) {
    root.h.equal(result, { ok: false, code: code, tracks: [] }, label)
  }

  // Calls then() once no job is left, running or waiting.
  function settled(then) {
    var idle = function() { return root.runner.active === 0 && root.runner.waiting === 0 }
    root.h.waitFor(idle, 8000, function(ok) {
      root.h.check(ok, "every job has settled")
      then()
    })
  }

  // Until the private directories are vouched for, nothing is started that
  // would write into them.
  function beforeReady() {
    var h = root.h
    root.ask("before prepare", root.vid("S"), function(result) {
      root.failed("before prepare: no fetch", result, "E_RUNTIME_DIR")
      h.equal([h.jobs().length, root.snapshot()], [0, ["idle", "", 0, ""]], "before prepare: no job")
      root.fs.prepared.connect(function(ok) {
        h.check(ok, "the directories are prepared")
        if (ok) root.next()
        else h.finish()
      })
      root.fs.prepare()
    })
  }

  function related() {
    var h = root.h
    var seed = root.vid("S")
    h.equal([Const.LIMITS.mixFetch, Const.LIMITS.mixBytes, Const.TIMEOUTS.mix], [25, 1048576, 15], "limits")
    h.scenario({ ytdlp: "ok" })
    root.ask("related", seed, function(result) {
      h.equal([result.ok, result.code], [true, ""], "related: fetched")
      h.equal(result.tracks.map(function(track) { return track.id }), root.relatedIds(),
        "related: the head of the list, each track once, without the video itself")
      h.equal(result.tracks[0], {
        id: "RRRRRRRR001", title: "Synthetic related track 1", channel: "Synthetic Artist", duration: 181,
        live: false
      }, "related: a track has exactly the five fields")
      h.equal(result.tracks[8].title, "Related track with marks and a line break", "related: clean titles")
      h.equal([result.tracks[10].live, result.tracks[10].duration], [true, null], "related: a stream is live")
      h.equal(root.snapshot(), ["idle", "", 0, ""], "related: the search state is untouched")
      root.next()
    })
  }

  function recorded() {
    var h = root.h
    var seed = root.vid("S")
    var record = h.log("ytdlp")
    h.equal(record.length, 1, "recorded: yt-dlp ran once")
    h.equal(record[0].argv, root.flags(), "recorded: the arguments are the constant signed-out list")
    h.equal(record[0].stdin, "https://www.youtube.com/watch?v=" + seed + "&list=RD" + seed + "\n",
      "recorded: the address of the mix on stdin")
    h.equal(record[0].env, ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
      "recorded: the network profile and nothing else")
    var jobs = h.jobs().filter(function(job) { return job.tag !== "prepare" })
    var wrapper = [h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "15"]
    h.equal(jobs, [{ tag: "mix", command: wrapper.concat([h.tools.ytdlp], root.flags()) }],
      "recorded: one job, bounded by the wrapper")
    root.next()
  }

  // A search and a fetch of related tracks are two jobs that do not touch
  // each other, whichever starts first and whichever is cleared.
  function besideASearch() {
    var h = root.h
    var answers = []
    h.scenario({ ytdlp: "slow:600" })
    var note = function(result) { answers.push(result.ok + " " + result.tracks.length) }
    var both = function() { return answers.length === 1 && root.search.status === "results" }
    root.search.mix(root.vid("T"), note)
    h.equal(root.search.submit("beside a mix"), true, "beside a search: the search is taken")
    h.equal(root.runner.active, 2, "beside a search: two jobs")
    h.waitFor(both, 6000, function() {
      h.equal(answers, ["true 20"], "beside a search: the related tracks arrived")
      h.equal(root.snapshot(), ["results", "beside a mix", 11, ""], "beside a search: so did the results")
      root.search.mix(root.vid("T"), note)
      root.search.clear()
      root.search.submit("a second search")
      root.search.clear()
      h.waitFor(function() { return answers.length === 2 }, 6000, function() {
        h.equal(answers[1], "true 20", "beside a search: clearing the search leaves the fetch alone")
        h.equal(root.snapshot(), ["idle", "", 0, ""], "beside a search: the fetch leaves the search alone")
        root.settled(function() { root.next() })
      })
    })
  }

  // YouTube builds a mix for music only. For any other video the answer is
  // that one video, and that is no list.
  function noMix() {
    var h = root.h
    h.scenario({ ytdlp: "no-mix" })
    h.equal(root.search.submit("kept"), true, "no mix: a search for the state to keep")
    h.waitFor(function() { return root.search.status === "results" }, 6000, function() {
      root.ask("no mix", root.vid("U"), function(result) {
        root.failed("no mix: one video is not a list", result, "E_BAD_OUTPUT")
        h.equal(root.snapshot(), ["results", "kept", 11, ""], "no mix: the search is as it was")
        root.next()
      })
    })
  }

  // Each way a fetch can fail gives its code and an empty list, and the
  // search the panel shows stays what it was.
  function failures() {
    var h = root.h
    var table = [
      ["refused", "E_YT_REFUSED"], ["network", "E_NETWORK"], ["blocked", "E_YT_BLOCKED"],
      ["unknown", "E_YTDLP_FAILED"], ["garbage", "E_BAD_OUTPUT"], ["non-ascii", "E_BAD_OUTPUT"],
      ["flood", "E_BAD_OUTPUT"], ["big:" + (Const.LIMITS.mixBytes + 1), "E_BAD_OUTPUT"]
    ]
    var row = 0
    var one = function() {
      if (row >= table.length) {
        h.scenario({ ytdlp: "empty" })
        root.ask("empty", root.vid("V"), function(result) {
          h.equal(result, { ok: true, code: "", tracks: [] }, "empty: a list with nothing in it is a list")
          h.equal(root.snapshot(), ["results", "kept", 11, ""], "failures: the search is as it was")
          root.settled(function() { root.next() })
        })
        return
      }
      var scenario = table[row][0]
      var code = table[row][1]
      row += 1
      h.scenario({ ytdlp: scenario })
      root.ask(scenario, root.vid("V"), function(result) {
        root.failed(scenario.split(":")[0] + ": its code", result, code)
        one()
      })
    }
    one()
  }

  // No answer at all ends at the deadline, which is shortened for this one
  // step.
  function noAnswer() {
    var h = root.h
    var usual = Const.TIMEOUTS.mix
    h.scenario({ ytdlp: "hang" })
    Const.TIMEOUTS.mix = 1
    root.ask("no answer", root.vid("V"), function(result) {
      root.failed("no answer: the deadline", result, "E_TIMEOUT")
      root.settled(function() { root.next() })
    })
    Const.TIMEOUTS.mix = usual
  }

  // An answer of exactly as many bytes as one may have is read whole.
  function tooLong() {
    var h = root.h
    h.scenario({ ytdlp: "big:" + Const.LIMITS.mixBytes })
    root.ask("largest", root.vid("V"), function(result) {
      h.equal([result.ok, result.tracks.length], [true, 20], "largest: read to the last byte")
      root.next()
    })
  }

  // One fetch at a time: a new request ends the one in progress.
  function overtaken() {
    var h = root.h
    var before = root.starts()
    var answers = []
    h.scenario({ ytdlp: "slow:3000" })
    root.ask("overtaken", root.vid("W"), function(result) { answers.push(result) })
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function(started) {
      h.check(started, "overtaken: the first yt-dlp is running")
      h.scenario({ ytdlp: "ok" })
      var since = Date.now()
      root.ask("overtaking", root.vid("X"), function(result) {
        h.equal([result.ok, result.tracks.length], [true, 20], "overtaking: fetched")
        h.equal(answers.length, 1, "overtaken: the first request was answered")
        root.failed("overtaken: with cancelled", answers[0], "cancelled")
        root.settled(function() {
          h.check(Date.now() - since < 2000, "overtaken: the first yt-dlp was ended, not waited for")
          h.alive(function(names) {
            h.equal(names, [], "overtaken: and it is gone")
            root.next()
          })
        })
      })
    })
  }

  // A job that someone else stops still ends its caller's wait.
  function stoppedByAnother() {
    var h = root.h
    var before = root.starts()
    h.scenario({ ytdlp: "slow:3000" })
    root.ask("stopped by another", root.vid("Y"), function(result) {
      root.failed("stopped by another: a code that ends the wait", result, "E_YTDLP_FAILED")
      root.settled(function() { root.next() })
    })
    h.waitFor(function() { return root.starts() === before + 1 }, 5000, function() {
      root.runner.cancelAll()
    })
  }

  function badRequests() {
    var h = root.h
    var before = [root.starts(), h.jobs().length]
    var answers = []
    var notIds = [
      "", "short", "SSSSSSSSSSSS", "https://www.youtube.com/watch?v=SSSSSSSSSSS", "RDSSSSSSSSSSS", null,
      undefined, 5, {}, ["SSSSSSSSSSS"]
    ]
    for (var i = 0; i < notIds.length; i++) {
      root.search.mix(notIds[i], function(result) { answers.push(result.code) })
    }
    // A request without a callback is still a request.
    root.search.mix("short")
    h.equal(answers.length, 0, "bad requests: none is answered inside the request")
    h.after(200, function() {
      h.equal(answers.filter(function(code) { return code === "E_INVALID_INPUT" }).length, notIds.length,
        "bad requests: each is refused")
      h.equal([root.starts(), h.jobs().length], before, "bad requests: nothing was started")
      root.next()
    })
  }

  // Nothing of a fetch may reach the log or a command: no id, no address,
  // and not what the tool printed. And none was made with a login.
  function quiet() {
    var h = root.h
    h.equal(Const.TIMEOUTS.mix, 15, "quiet: the usual deadline")
    var mixes = h.log("ytdlp").filter(function(record) { return record.stdin.indexOf("&list=RD") !== -1 })
    var plain = mixes.filter(function(record) {
      return JSON.stringify(record.argv) === JSON.stringify(root.flags()) && record.jar === undefined
    })
    h.equal([mixes.length > 10, plain.length], [true, mixes.length], "quiet: always the same command")
    h.equal(h.stubState("ytdlp"), null, "quiet: nothing was marked as watched")
    var commands = JSON.stringify(h.jobs())
    var named = root.asked.filter(function(id) { return commands.indexOf(id) !== -1 })
    h.equal(named, [], "quiet: no id in a command")
    h.alive(function(names) {
      h.equal(names, [], "quiet: no stub is left running")
      var log = h.readFile(h.runDir + "/out.txt")
      var logged = root.asked.filter(function(id) { return log.indexOf(id) !== -1 })
      h.equal(logged, [], "quiet: no id in the log")
      var printed = ["list=RD", "watch?v=", "Synthetic", "RRRRRRRR", "ERROR:", "Reading URLs"]
      for (var i = 0; i < printed.length; i++) {
        h.check(log.indexOf(printed[i]) === -1, "quiet: the log holds nothing of a fetch (" + i + ")")
      }
      root.next()
    })
  }
}
