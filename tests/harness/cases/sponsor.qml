import QtQuick

// core/Sponsor.qml with a scripted player, a scripted playback and, for
// most of the case, a runner that only writes down the job it is given, so
// that the case decides what the lookup answers and when. What is shown:
// nothing is looked up before the user said yes, and the question is put
// once; a track gets one lookup, built from a hash prefix and never from
// the id; a skip follows the position, goes forward only, is spaced out and
// leaves a note that fades; a segment at the end of a track moves on to the
// next one; whatever the lookup says or fails to say, playback is left
// alone; and a run of tracks that skips end at once switches skipping off.
//
// Last, the lookup runs through the real runner into the curl stand-in: the
// command as a child process gets it, an answer that comes back through a
// real pipe, the failures of the service itself, and a lookup that hangs.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var runner: null
  property var fs: null
  property var player: null
  // The component under test, and every one made before it.
  property var sponsor: null
  property var made: []
  property var steps: []
  property int at: 0
  // What the component reported through its signals.
  property var answers: []
  property int prompts: 0
  // Every video id this case plays, to look for afterwards.
  property var used: []
  property int keys: 0

  readonly property string first: "AAAAAAAAAAA"
  readonly property string second: "BBBBBBBBBBB"
  readonly property string third: "CCCCCCCCCCC"
  readonly property string fourth: "DDDDDDDDDDD"
  readonly property string fifth: "EEEEEEEEEEE"
  // A valid id that is also the name of a member every object has.
  readonly property string named: "constructor"

  // What the runner is to the component: run() and cancel(). This one
  // starts nothing and keeps the job, so that the case can end it.
  property QtObject jobs: QtObject {
    id: fakeRunner

    property var specs: []
    property var cancelled: []

    function run(spec) {
      fakeRunner.specs.push(spec)
      return fakeRunner.specs.length
    }

    function cancel(jobId) {
      fakeRunner.cancelled.push(jobId)
    }
  }

  // What playback is to the component: the two signals, and next(), which
  // ends the playing track at once when another one follows.
  property QtObject playback: QtObject {
    id: fakePlayback

    property var playing: null
    property bool hasNext: false
    property int asked: 0

    signal trackStarted(var item)
    signal trackEnded(var item)

    function next() {
      fakePlayback.asked += 1
      if (!fakePlayback.hasNext) return false
      fakePlayback.finish()
      return true
    }

    function finish() {
      var over = fakePlayback.playing
      if (over === null) return
      fakePlayback.playing = null
      fakePlayback.trackEnded(over)
    }
  }

  // prepare only asks whether mpv is an executable file.
  function setup(h, done) {
    h.tools.mpv = h.repo + "/tests/stubs/probe.js"
    done()
  }

  function run(h) {
    root.h = h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.fs = h.mount("core/PrivateFs.qml", { runner: root.runner, tools: h.tools })
    root.player = h.mount("tests/harness/FakePlayer.qml", {})
    if (root.runner === null || root.fs === null || root.player === null) { h.finish(); return }
    root.steps = [
      root.prepare, root.asking, root.declined, root.enabled, root.request, root.waitsForLength, root.skips,
      root.spacedOut, root.backAndAgain, root.pictureOn, root.noteFades, root.toTheEnd, root.failsSoft,
      root.staleAnswer, root.switchedOff, root.goesBack, root.cascade, root.realTool, root.realFailures,
      root.realCancel, root.neverNamed
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  // ---- Script ----

  // A component of its own, wired the way the service wires it. The ones
  // made before are cut off: they would hear the same signals.
  function make(mode, runner) {
    for (var i = 0; i < root.made.length; i++) {
      root.made[i].playback = null
      root.made[i].player = null
      root.made[i].settings = null
    }
    fakePlayback.finish()
    root.answers = []
    root.prompts = 0
    var sponsor = root.h.mount("core/Sponsor.qml", {
      runner: runner, tools: root.h.tools, fs: root.fs, settings: { sponsorSkip: mode }, player: root.player,
      playback: fakePlayback
    })
    if (sponsor === null) return false
    sponsor.answered.connect(function(enable) { root.answers.push(enable) })
    sponsor.promptChanged.connect(function() {
      if (sponsor.prompt) root.prompts += 1
    })
    root.made.push(sponsor)
    root.sponsor = sponsor
    return true
  }

  // The i-th made-up id of this case.
  function tid(i) {
    return "t" + ("000000000" + i).slice(-10)
  }

  // A track starts, as playback and the player report it.
  function start(id) {
    fakePlayback.finish()
    if (root.used.indexOf(id) === -1) root.used.push(id)
    root.keys += 1
    var item = { id: id, title: "A title", channel: "A channel", duration: 600, live: false, key: root.keys,
      auto: false }
    root.player.currentKey = root.keys
    root.player.position = 0
    fakePlayback.playing = item
    fakePlayback.trackStarted(item)
  }

  function seg(from, to, category) {
    return { category: category, actionType: "skip", segment: [from, to], UUID: "0", videoDuration: 600,
      locked: 0, votes: 1, description: "" }
  }

  // The output of a lookup that found these segments for the id, among
  // those of another video that falls into the same bucket.
  function found(id, segments) {
    return JSON.stringify([
      { videoID: "zzzzzzzzzzz", segments: [root.seg(0, 400, "sponsor")] },
      { videoID: id, segments: segments }
    ]) + "\n200\n"
  }

  function ended(stdout) {
    return { ok: true, error: "", exitCode: 0, stdout: stdout, stderr: "", durationMs: 5 }
  }

  // Ends the latest job the stand-in runner holds with this result.
  function deliver(result) {
    fakeRunner.specs[fakeRunner.specs.length - 1].done(result)
  }

  function seeks() {
    return root.player.calls.filter(function(call) { return call.name === "seek" })
      .map(function(call) { return call.args[0] })
  }

  // What the component did to playback: its seeks, and how often it asked
  // for the next track. Anything else it called shows as a name.
  function did() {
    var other = root.player.names().filter(function(name) { return name !== "seek" })
    return [root.seeks(), fakePlayback.asked, other]
  }

  // The flags behind the tool, written out a second time.
  function flags() {
    return [
      "-q", "--no-progress-meter", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "0",
      "--tlsv1.2", "--connect-timeout", "3", "--max-time", "5", "--max-filesize", "1048576",
      "--user-agent", "", "--header", "Accept-Language:", "--write-out", "\\n%{response_code}\\n",
      "--config", "-"
    ]
  }

  // The one line curl is given: the bucket the id hashes into.
  function address(prefix) {
    return "url = \"https://sponsor.ajay.app/api/skipSegments/" + prefix
      + "?categories=%5B%22sponsor%22%2C%22selfpromo%22%2C%22interaction%22%2C%22music_offtopic%22%5D"
      + "&actionTypes=%5B%22skip%22%5D\"\n"
  }

  // Calls then() once the real runner has no job left.
  function settled(then) {
    var idle = function() { return root.runner.active === 0 && root.runner.waiting === 0 }
    root.h.waitFor(idle, 12000, function(ok) {
      root.h.check(ok, "every job has settled")
      then()
    })
  }

  // ---- Steps ----

  function prepare() {
    var h = root.h
    root.fs.prepared.connect(function(ok) {
      h.check(ok, "the directories are prepared")
      if (ok) root.next()
      else h.finish()
    })
    root.fs.prepare()
  }

  // The setting says "ask": the first track raises the question, and
  // nothing else happens for as long as it is open.
  function asking() {
    var h = root.h
    if (!root.make("ask", fakeRunner)) { h.finish(); return }
    var sponsor = root.sponsor
    h.equal([sponsor.prompt, sponsor.lastSkip, sponsor.watching], [false, null, false],
      "asking: nothing is asked before a track plays")
    root.start(root.first)
    h.equal([sponsor.prompt, root.prompts], [true, 1], "asking: the first track raises the question")
    root.player.duration = 600
    root.player.position = 30
    root.player.position = 300
    sponsor.userActed()
    root.start(root.second)
    root.start(root.third)
    h.equal([sponsor.prompt, root.prompts], [true, 1], "asking: it stays, and is raised once")
    h.equal([fakeRunner.specs.length, root.did(), sponsor.watching, sponsor.lastSkip],
      [0, [[], 0, []], false, null], "asking: meanwhile nothing is looked up and nothing is skipped")
    root.next()
  }

  function declined() {
    var h = root.h
    var sponsor = root.sponsor
    sponsor.answer(false)
    h.equal([root.answers, sponsor.prompt], [[false], false], "declined: the answer is passed on once")
    sponsor.answer(true)
    sponsor.answer(false)
    h.equal(root.answers, [false], "declined: an answer nobody asked for is not passed on")
    // The service stores the answer as the setting.
    sponsor.settings = { sponsorSkip: "off" }
    root.start(root.fourth)
    root.player.position = 30
    // If the setting is lost later it says "ask" again; this service has
    // put its question.
    sponsor.settings = { sponsorSkip: "ask" }
    root.start(root.first)
    h.equal([sponsor.prompt, root.prompts], [false, 1], "declined: the question is not put a second time")
    var odd = [null, {}, { sponsorSkip: true }, { sponsorSkip: "yes" }, { sponsorSkip: "ON" }, "on"]
    for (var i = 0; i < odd.length; i++) {
      sponsor.settings = odd[i]
      root.start(root.tid(i))
    }
    h.equal([fakeRunner.specs.length, root.did()], [0, [[], 0, []]],
      "declined: no lookup without a yes, whatever else the setting says")
    root.next()
  }

  function enabled() {
    var h = root.h
    if (!root.make("ask", fakeRunner)) { h.finish(); return }
    var sponsor = root.sponsor
    root.player.duration = 0
    root.start(root.first)
    h.equal(sponsor.prompt, true, "enabled: a new service asks again")
    sponsor.answer(true)
    h.equal([root.answers, sponsor.prompt, fakeRunner.specs.length], [[true], false, 0],
      "enabled: the yes is passed on, and nothing is looked up until it is the setting")
    sponsor.settings = { sponsorSkip: "on" }
    h.equal(fakeRunner.specs.length, 1, "enabled: the track that plays gets its lookup at once")
    sponsor.settings = { sponsorSkip: "on" }
    sponsor.userActed()
    h.equal(fakeRunner.specs.length, 1, "enabled: and only one")
    root.next()
  }

  function request() {
    var h = root.h
    var spec = fakeRunner.specs[0]
    h.equal([spec.tag, spec.timeoutSec, spec.maxBytes, spec.umask077], ["sponsor", 6, 1048576, undefined],
      "request: six seconds and a megabyte at most")
    h.equal(spec.argv, [h.tools.curl].concat(root.flags()), "request: the arguments are the constant list")
    h.equal(spec.stdin, root.address("dd20"), "request: the address names the bucket of the hash prefix")
    h.equal(Object.keys(spec.env).sort(),
      ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
      "request: the network profile and nothing else")
    h.check(JSON.stringify(spec).indexOf(root.first) === -1, "request: the id is nowhere in the job")
    root.next()
  }

  // The answer is there before the player knows how long the track is.
  function waitsForLength() {
    var h = root.h
    var sponsor = root.sponsor
    root.deliver(root.ended(root.found(root.first, [
      root.seg(100, 110, "selfpromo"), root.seg(30, 60, "sponsor"), root.seg(58, 70, "interaction"),
      root.seg(200, 220, "music_offtopic"), root.seg(300, 320, "preview"), root.seg(400, 400.5, "sponsor")
    ])))
    root.player.position = 31
    h.equal([sponsor.watching, root.did()], [false, [[], 0, []]],
      "length: no segment counts while the length of the track is unknown")
    root.player.position = 10
    root.player.duration = 600
    h.equal([sponsor.watching, root.did()], [true, [[], 0, []]],
      "length: once it is known, the position is watched and nothing is skipped yet")
    root.next()
  }

  function skips() {
    var h = root.h
    var sponsor = root.sponsor
    root.player.position = 29.75
    h.equal(root.seeks(), [], "skip: not before the segment")
    root.player.position = 30.25
    h.equal(root.did(), [[70], 0, []], "skip: one seek, to the end of the two segments that overlap")
    h.equal(sponsor.lastSkip, { category: "sponsor", from: 30, to: 70 }, "skip: and a note about it")
    h.equal([root.player.position, sponsor.watching], [70, true], "skip: more lies ahead")
    root.next()
  }

  function spacedOut() {
    var h = root.h
    var sponsor = root.sponsor
    root.player.position = 100.25
    h.equal(root.seeks(), [70], "spaced: a second skip does not follow the first at once")
    h.after(600, function() {
      root.player.position = 100.5
      h.equal(root.seeks(), [70, 110], "spaced: it is made half a second later")
      h.equal(sponsor.lastSkip, { category: "selfpromo", from: 100, to: 110 }, "spaced: with its own note")
      root.next()
    })
  }

  // The user goes back into a segment to hear it, then to before it.
  function backAndAgain() {
    var h = root.h
    var sponsor = root.sponsor
    h.after(2200, function() {
      root.player.position = 45
      root.player.position = 46
      h.equal(root.seeks(), [70, 110], "back: inside a segment that was skipped, it is left to play")
      root.player.position = 5
      h.equal(sponsor.watching, true, "back: before it, it lies ahead again")
      root.player.position = 30.5
      h.equal(root.seeks(), [70, 110, 70], "back: and is skipped again")
      h.equal(root.player.names(), ["seek", "seek", "seek"], "back: and the player was told nothing else")
      root.next()
    })
  }

  // Talk in a music video is skipped only while no picture is shown.
  function pictureOn() {
    var h = root.h
    var sponsor = root.sponsor
    h.after(600, function() {
      sponsor.videoHidden = false
      root.player.position = 150
      root.player.position = 201
      h.equal(root.seeks().length, 3, "picture: with the picture on, the talk is played")
      root.player.position = 301
      root.player.position = 400.25
      h.equal([root.seeks().length, sponsor.watching], [3, false],
        "picture: an unknown category and a segment too short to skip never count")
      root.player.position = 201
      sponsor.videoHidden = true
      h.equal(root.seeks().slice(3), [220], "picture: without the picture it is skipped where it stands")
      h.equal(sponsor.lastSkip, { category: "music_offtopic", from: 200, to: 220 }, "picture: under its name")
      root.next()
    })
  }

  function noteFades() {
    var h = root.h
    var sponsor = root.sponsor
    h.check(sponsor.lastSkip !== null, "note: still shown right after the skip")
    h.waitFor(function() { return sponsor.lastSkip === null }, 7000, function(gone) {
      h.check(gone, "note: gone a few seconds later")
      h.equal(root.did(), [[70, 110, 70, 220], 0, []],
        "note: four skips, and the player was told nothing else")
      h.equal([fakeRunner.specs.length, fakeRunner.cancelled], [1, []], "note: all from one lookup")
      root.next()
    })
  }

  // A segment that reaches the end of the track: on to the next track, if
  // there is one.
  function toTheEnd() {
    var h = root.h
    var sponsor = root.sponsor
    var tail = [root.seg(570, 600.5, "sponsor")]
    root.player.clearCalls()
    root.start(root.second)
    h.equal(fakeRunner.specs.length, 2, "end: the next track has its own lookup")
    h.equal(fakeRunner.specs[1].stdin, root.address("d0ef"), "end: for its own bucket")
    root.deliver(root.ended(root.found(root.second, tail)))
    fakePlayback.hasNext = false
    root.player.position = 571
    h.equal([root.did(), sponsor.lastSkip, sponsor.watching], [[[], 1, []], null, false],
      "end: with nothing to go on to, the end is played and nothing is noted")
    root.player.position = 572
    h.equal(fakePlayback.asked, 1, "end: and playback is not asked again")
    h.after(600, function() {
      root.start(root.third)
      root.deliver(root.ended(root.found(root.third, tail)))
      fakePlayback.hasNext = true
      root.player.position = 571
      h.equal([root.did(), fakePlayback.playing], [[[], 2, []], null], "end: with a next track, on to it")
      h.equal(sponsor.lastSkip, { category: "sponsor", from: 570, to: 600 }, "end: with a note")
      h.equal(sponsor.watching, false, "end: and nothing of the old track is watched for")
      fakePlayback.hasNext = false
      root.next()
    })
  }

  // Every way a lookup can go wrong, and every answer that is not believed.
  // The last answer is a sound one, to show that the others are told from
  // it by what they are and not by the way this step plays them.
  function failsSoft() {
    var h = root.h
    var sponsor = root.sponsor
    var good = [root.seg(30, 60, "sponsor")]
    var results = function(id) {
      var body = root.found(id, good)
      return [
        { ok: false, error: "timeout", exitCode: -1, stdout: "", stderr: "", durationMs: 6000 },
        { ok: false, error: "exit", exitCode: 22, stdout: body, stderr: "", durationMs: 5 },
        { ok: false, error: "overflow", exitCode: -1, stdout: body, stderr: "", durationMs: 5 },
        { ok: false, error: "refused", exitCode: -1, stdout: "", stderr: "", durationMs: 0 },
        root.ended("Not Found\n404\n"),
        root.ended(body.replace("\n200\n", "\n500\n")),
        root.ended(body.replace("\n200\n", "")),
        root.ended(body + "200\n"),
        root.ended(""),
        root.ended("<html><body>busy</body></html>\n200\n"),
        root.ended("[" + body),
        root.ended(root.found(id, [root.seg(0, 590, "sponsor")])),
        root.ended(body.replace("\"UUID\":\"0\"", "\"UUID\":\"\u00e9\"")),
        root.ended(root.found("yyyyyyyyyyy", good)),
        root.ended(root.found(id, [root.seg(60, 30, "sponsor"), root.seg(-5, 40, "sponsor")])),
        null, undefined, 5, "ok", [],
        root.ended(body)
      ]
    }
    var count = results(root.first).length
    var before = fakeRunner.specs.length
    var note = JSON.stringify(sponsor.lastSkip)
    var quiet = 0
    h.after(600, function() {
      root.player.clearCalls()
      fakePlayback.asked = 0
      for (var i = 0; i < count; i++) {
        root.start(i === 0 ? root.named : root.tid(100 + i))
        root.deliver(results(fakePlayback.playing.id)[i])
        root.player.position = 31
        root.player.position = 45
        root.player.position = 300
        if (!sponsor.watching && !sponsor.prompt && JSON.stringify(sponsor.lastSkip) === note) quiet += 1
      }
      h.equal(root.seeks(), [60], "soft: of all these answers, only the sound one leads to a skip")
      h.equal([quiet, fakePlayback.asked, root.player.names()], [count - 1, 0, ["seek"]],
        "soft: every other one leaves playback alone and shows nothing")
      h.equal(sponsor.lastSkip, { category: "sponsor", from: 30, to: 60 }, "soft: the sound one is noted")
      h.equal(fakeRunner.specs.length, before + count, "soft: one lookup per track, and never a second try")
      h.equal(fakeRunner.specs[before].stdin, root.address("e3c1"), "soft: any id is hashed like any other")
      root.next()
    })
  }

  // An answer that arrives for a track that is over.
  function staleAnswer() {
    var h = root.h
    var sponsor = root.sponsor
    h.after(600, function() {
      root.player.clearCalls()
      root.start(root.fourth)
      var late = fakeRunner.specs[fakeRunner.specs.length - 1]
      var job = fakeRunner.specs.length
      root.start(root.fifth)
      h.equal(fakeRunner.cancelled.slice(-1), [job], "stale: the lookup of a track that ended is stopped")
      late.done(root.ended(root.found(root.fifth, [root.seg(30, 60, "sponsor")])))
      late.done({ ok: false, error: "cancelled", exitCode: -1, stdout: "", stderr: "", durationMs: 0 })
      root.player.position = 31
      h.equal([root.seeks(), sponsor.watching], [[], false], "stale: and what it says is not taken")
      var own = [root.seg(90, 120, "sponsor"), root.seg(200, 230, "sponsor")]
      root.deliver(root.ended(root.found(root.fifth, own)))
      root.player.position = 91
      h.equal(root.seeks(), [120], "stale: the track's own answer is")
      root.next()
    })
  }

  // The setting is switched off, and on again, while a track plays.
  function switchedOff() {
    var h = root.h
    var sponsor = root.sponsor
    var lookups = fakeRunner.specs.length
    h.after(600, function() {
      sponsor.settings = { sponsorSkip: "off" }
      root.player.position = 201
      h.equal([root.seeks(), sponsor.watching], [[120], false], "off: nothing is skipped and nothing watched")
      root.player.position = 150
      sponsor.settings = { sponsorSkip: "on" }
      h.equal([sponsor.watching, fakeRunner.specs.length], [true, lookups],
        "on again: the segments count again, without a second lookup")
      root.player.position = 200.5
      h.equal(root.seeks(), [120, 230], "on again: and are skipped")
      root.next()
    })
  }

  // A player that answers a skip by going back instead of forward would be
  // sent round and round.
  function goesBack() {
    var h = root.h
    var sponsor = root.sponsor
    h.after(600, function() {
      root.player.clearCalls()
      root.start(root.tid(200))
      var two = [root.seg(30, 60, "sponsor"), root.seg(90, 120, "sponsor")]
      root.deliver(root.ended(root.found(root.tid(200), two)))
      root.player.position = 30.5
      h.equal(root.seeks(), [60], "round: the skip is made")
      root.player.position = 12
      h.equal(sponsor.watching, false, "round: the player lands before the segment, and skipping is given up")
      h.after(600, function() {
        root.player.position = 30.5
        root.player.position = 91
        h.equal(root.seeks(), [60], "round: nothing more is skipped in this track")
        root.start(root.tid(201))
        root.deliver(root.ended(root.found(root.tid(201), [root.seg(30, 60, "sponsor")])))
        root.player.position = 30.5
        h.equal(root.seeks(), [60, 60], "round: the next track is skipped in as usual")
        root.next()
      })
    })
  }

  // Tracks that a skip ends right after they began, one after the other.
  function cascade() {
    var h = root.h
    var sponsor = root.sponsor
    var opening = [root.seg(0, 30, "sponsor")]
    var round = 0
    root.player.clearCalls()
    // What the steps before left behind is cleared the way the user clears
    // it, and a track that plays without a skip comes first.
    root.start(root.tid(300))
    sponsor.userActed()
    var one = function() {
      round += 1
      root.start(root.tid(300 + round))
      root.deliver(root.ended(root.found(root.tid(300 + round), opening)))
      if (round < 5) { h.after(600, one); return }
      h.equal(root.seeks(), [30, 30, 30], "cascade: three tracks in a row are skipped into and end at once")
      h.equal(sponsor.watching, false, "cascade: after them skipping is off, for the fifth as for the fourth")
      root.player.position = 1
      root.player.position = 2
      h.equal(root.seeks().length, 3, "cascade: whatever position is reported")
      sponsor.userActed()
      h.equal(root.seeks(), [30, 30, 30, 30], "cascade: until the user does something")
      root.next()
    }
    h.after(600, one)
  }

  // The same lookup as a child process gets it, answered by the stand-in
  // for the service.
  function realTool() {
    var h = root.h
    if (!root.make("on", root.runner)) { h.finish(); return }
    var sponsor = root.sponsor
    root.player.clearCalls()
    fakePlayback.asked = 0
    root.player.duration = 600
    h.setStubState("curl", { sponsor: [
      { videoID: "zzzzzzzzzzz", segments: [root.seg(0, 400, "sponsor")] },
      { videoID: root.fifth, segments: [root.seg(30, 60, "sponsor")] }
    ] })
    h.scenario({ sponsor: "slow:300" })
    root.start(root.fifth)
    root.player.position = 20
    h.equal([sponsor.watching, root.did()], [false, [[], 0, []]],
      "tool: the track plays on while the lookup is under way")
    h.waitFor(function() { return sponsor.watching }, 8000, function(arrived) {
      h.check(arrived, "tool: the answer arrived and its segment lies ahead")
      root.player.position = 30.5
      h.equal(root.did(), [[60], 0, []], "tool: and is skipped")
      root.settled(function() {
        var record = h.log("curl")
        h.equal(record.length, 1, "tool: curl ran once")
        h.equal(record[0].argv, root.flags(), "tool: with the constant arguments")
        h.equal(record[0].stdin, root.address("9006"), "tool: and the address on standard input")
        var profile = ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"]
        h.equal(record[0].env, profile, "tool: in the network profile")
        var jobs = h.jobs().filter(function(job) { return job.tag === "sponsor" })
        var command = [h.tools.setpriv, "--pdeathsig", "TERM", h.tools.timeout, "-k", "2", "6", h.tools.curl]
        h.equal(jobs, [{ tag: "sponsor", command: command.concat(root.flags()) }],
          "tool: one job, bounded by the wrapper")
        root.next()
      })
    })
  }

  // The ways the service itself can fail, through the real runner.
  function realFailures() {
    var h = root.h
    var sponsor = root.sponsor
    var kinds = ["none", "empty", "error", "garbage", "non-ascii", "big"]
    var before = h.log("curl").length
    var note = JSON.stringify(sponsor.lastSkip)
    var quiet = 0
    var round = 0
    root.player.clearCalls()
    var one = function() {
      if (round === kinds.length) {
        h.equal([quiet, root.did()], [kinds.length, [[], 0, []]],
          "failures: none of them shows, and none touches playback")
        h.equal(h.log("curl").length, before + kinds.length, "failures: one lookup each, no second try")
        root.next()
        return
      }
      h.scenario({ sponsor: kinds[round] })
      round += 1
      root.start(root.tid(400 + round))
      h.waitFor(function() { return h.log("curl").length === before + round }, 8000, function(started) {
        h.check(started, "failures: the lookup was started")
        root.settled(function() {
          root.player.position = 31
          root.player.position = 300
          if (!sponsor.watching && !sponsor.prompt && JSON.stringify(sponsor.lastSkip) === note) quiet += 1
          one()
        })
      })
    }
    one()
  }

  // A lookup that does not come back must not outlive its track.
  function realCancel() {
    var h = root.h
    var before = h.log("curl").length
    h.scenario({ sponsor: "hang" })
    root.start(root.tid(500))
    h.waitFor(function() { return h.log("curl").length === before + 1 }, 8000, function(started) {
      h.check(started, "cancel: the lookup of the next track was started")
      h.equal(root.runner.active, 1, "cancel: and waits for an answer that does not come")
      var at = Date.now()
      fakePlayback.finish()
      root.settled(function() {
        h.check(Date.now() - at < 4000, "cancel: it is stopped when the track is over, not at its deadline")
        h.equal([h.log("curl").length, root.did()], [before + 1, [[], 0, []]],
          "cancel: nothing was repeated and playback was left alone")
        root.next()
      })
    })
  }

  function neverNamed() {
    var h = root.h
    var commands = JSON.stringify(h.jobs())
    var specs = JSON.stringify(fakeRunner.specs)
    var given = JSON.stringify(h.log("curl"))
    var named = root.used.filter(function(id) {
      return commands.indexOf(id) !== -1 || specs.indexOf(id) !== -1 || given.indexOf(id) !== -1
    })
    h.check(root.used.length >= 30, "never named: the ids this case played")
    h.equal(named, [], "never named: no id is in any job, nor in anything the tool was given")
    h.check(commands.indexOf("ajay") === -1 && commands.indexOf("https:") === -1,
      "never named: nor an address")
    var opening = "url = \"https://sponsor.ajay.app/api/skipSegments/"
    var plain = fakeRunner.specs.filter(function(spec) {
      return spec.stdin.indexOf(opening) === 0 && /^[0-9a-f]{4}\?/.test(spec.stdin.slice(opening.length))
    })
    h.equal(plain.length, fakeRunner.specs.length,
      "never named: every lookup names four characters of a hash")
    h.alive(function(names) {
      h.equal(names, [], "never named: no stub is left running")
      var log = h.readFile(h.runDir + "/out.txt")
      var logged = root.used.filter(function(id) { return log.indexOf(id) !== -1 })
      h.equal(logged, [], "never named: no id is in the log")
      h.check(log.indexOf("skipSegments") === -1, "never named: nor a lookup")
      root.next()
    })
  }
}
