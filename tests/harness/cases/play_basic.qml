import QtQuick
import "../../../lib/MpvArgs.js" as MpvArgs
import "../../../lib/YtArgs.js" as YtArgs

// The whole service against the stub tools, when all goes well: a row is
// played, the video is looked up once, mpv is started and handed the track,
// and the public surface says what plays. Along the way it checks where the
// video's id and title are allowed to be: the id in yt-dlp's standard input
// and in the command sent over mpv's socket, the title in the options object
// of that command, and neither in any command line, file name or log line.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string id: "AAAAAAAAAAA"
  // Characters that would split a "key=value,key=value" option string.
  readonly property string title: "A,vid=1 \"q\""
  readonly property string watchUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA"

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
      root.becomesReady, root.refusesBadRows, root.plays, root.surface, root.lookup, root.player,
      root.files, root.stops, root.hostileRow, root.quiet
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

  // What mpv was sent, without the questions about the position: how many
  // of those there are depends on timing.
  function sent() {
    return root.h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
      return !(command[0] === "get_property" && command[1] === "time-pos")
    })
  }

  function becomesReady() {
    var h = root.h
    var s = h.service
    h.equal(s.ready, false, "at creation: not ready")
    h.equal(s.playTrack({ id: root.id, title: "t", channel: "c", duration: 5, live: false }), false,
      "at creation: nothing can be played yet")
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.equal([s.fatalCode, s.networkHold, s.playbackState, s.hasTrack], ["", false, "idle", false],
        "ready: idle, nothing held")
      h.equal([s.volume, s.muted, s.position, s.duration, s.tooltip], [70, false, 0, 0, "OmaJuke"],
        "ready: the values of a first start")
      h.equal(s.settings.rememberHistory, true, "ready: the settings are the user's, not the cautious ones")
      h.equal([h.log("ytdlp").length, h.log("mpv-start").length], [0, 0], "ready: no tool has run")
      // The second looks whether a saved login is there; it asks nobody.
      h.equal(h.jobs().map(function(job) { return job.tag }), ["prepare", "prepare-data"],
        "ready: two jobs, the preparations")
      root.next()
    })
  }

  // A row comes back from the panel, which is not trusted to return what it
  // was given.
  function refusesBadRows() {
    var h = root.h
    var s = h.service
    var bad = [
      null, undefined, "AAAAAAAAAAA", 7, [], {}, { id: "short" }, { id: "AAAAAAAAAAA/" },
      { id: root.id, title: 5, channel: "c", duration: 5, live: false },
      { id: "../../../etc", title: "t", channel: "c", duration: 5, live: false }
    ]
    for (var i = 0; i < bad.length; i++) h.equal(s.playTrack(bad[i]), false, "bad row " + i + ": refused")
    h.equal([s.playbackState, s.queue.length, h.jobs().length], ["idle", 0, 2], "bad rows: nothing started")
    root.next()
  }

  function plays() {
    var h = root.h
    var s = h.service
    var row = { id: root.id, title: root.title, channel: "c", duration: 5, live: false }
    h.check(s.playTrack(row), "accepted")
    h.equal([s.playbackState, s.playing, s.hasTrack, s.queueIndex], ["resolving", false, true, 0],
      "at once: the lookup is on its way")
    h.equal(s.tooltip, root.title + " \u2014 c", "at once: the icon names the track")
    root.until("reached playing", function() { return s.playbackState === "playing" }, 8000, root.next)
  }

  function surface() {
    var h = root.h
    var s = h.service
    var track = { id: root.id, title: root.title, channel: "c", duration: 5, live: false }
    h.equal([s.playing, s.paused, s.hasTrack, s.errorCode, s.noticeCode], [true, false, true, "", ""],
      "playing: the derived facts")
    var key = h.parts.player.currentKey
    h.check(key > 0, "playing: mpv is on a track of ours")
    h.equal(s.currentTrack, { id: root.id, title: root.title, channel: "c", duration: 5, live: false,
      key: key, auto: false }, "playing: the current item is the track, its key and how it got there")
    h.check(Array.isArray(s.queue) && Array.isArray(s.recents) && Array.isArray(s.searchResults),
      "playing: the lists are arrays")
    h.equal([s.queue.length, s.queueIndex], [1, 0], "playing: a queue of one")
    h.equal(s.recents, [track], "playing: the track is the most recent one")
    h.equal([s.duration, s.seekable], [200, true], "playing: the length mpv reported")
    var first = s.positionNow()
    h.after(300, function() {
      h.check(s.positionNow() > first, "playing: the position moves without being watched")
      var status = JSON.parse(s._ipcStatus())
      h.equal(Object.keys(status), ["version", "state", "id", "title", "channel", "position", "duration",
        "live", "volume", "muted", "queueLength", "queueIndex", "video", "output", "signedIn",
        "updatePending", "error"], "status: exactly the documented keys")
      h.equal([status.state, status.id, status.title, status.channel, status.duration, status.live],
        ["playing", root.id, root.title, "c", 200, false], "status: the track")
      h.equal([status.volume, status.muted, status.queueLength, status.queueIndex, status.error],
        [70, false, 1, 0, ""], "status: the counters")
      h.equal([status.video, status.output, status.signedIn, status.updatePending],
        ["hidden", "", false, false], "status: no video window, the default output, nobody signed in")
      h.check(status.position > 0 && Math.round(status.position * 10) === status.position * 10,
        "status: the position, to a tenth of a second")
      root.next()
    })
  }

  // The lookup: one yt-dlp run with a constant command line, and the address
  // on its standard input only.
  function lookup() {
    var h = root.h
    var paths = h.parts.fs.paths
    var records = h.log("ytdlp")
    h.equal(records.length, 1, "lookup: yt-dlp ran once")
    h.equal(records[0].stdin, root.watchUrl + "\n", "lookup: the address is on standard input")
    h.equal(records[0].argv, YtArgs.resolve(h.tools, paths, 720).slice(1), "lookup: the constant arguments")
    h.check(records[0].argv.indexOf("--no-cookies") !== -1 && records[0].argv.indexOf("--no-warnings") !== -1,
      "lookup: signed out")
    h.equal(records[0].env, ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
      "lookup: the network profile and nothing else")
    var jobs = JSON.stringify(h.jobs())
    h.check(jobs.indexOf(root.id) === -1 && jobs.indexOf("watch?v") === -1, "no id in any command line")
    h.check(jobs.indexOf("vid=1") === -1, "no title in any command line")
    h.equal(h.jobs().map(function(job) { return job.tag }), ["prepare", "prepare-data", "resolve", "write"],
      "lookup: prepared, looked up, written; nothing else ran")
    root.next()
  }

  // mpv: its command line is the constant one, and the track reaches it over
  // the socket, after the window binding and the observations.
  function player() {
    var h = root.h
    var parts = h.parts
    var starts = h.log("mpv-start")
    h.equal(starts.length, 1, "mpv: started once")
    h.equal(starts[0].argv, MpvArgs.launch({
      sock: parts.fs.paths.sock, volume: 70, mpris: parts.fs.mprisAvailable, ytdlp: h.tools.ytdlp
    }), "mpv: the constant arguments")
    var argv = JSON.stringify(starts[0].argv)
    h.check(argv.indexOf(root.id) === -1 && argv.indexOf("vid=1") === -1 && argv.indexOf("https:") === -1,
      "mpv: no id, title or address among them")
    h.equal(starts[0].env, ["DENO_DIR", "DENO_NO_UPDATE_CHECK", "HOME", "LANG", "PATH", "XDG_RUNTIME_DIR"],
      "mpv: a scrubbed environment")

    var commands = root.sent()
    h.equal(commands[0][0], "keybind", "CLOSE_WIN rebound first")
    var loads = commands.filter(function(command) { return command[0] === "loadfile" })
    h.equal(loads, [["loadfile", root.watchUrl, "replace", -1, {
      "force-media-title": root.title,
      "ytdl-raw-options-append": "load-info-json=" + parts.fs.paths.infoDir + "/1.json"
    }]], "mpv: one load, the exact command")
    h.equal(loads[0][4]["force-media-title"], root.title, "title only in the options object")
    var before = commands.slice(0, commands.indexOf(loads[0])).map(function(command) { return command[0] })
    h.check(before.indexOf("observe_property") !== -1 && before.indexOf("set_property") !== -1,
      "mpv: the handshake comes before the load")
    h.equal([parts.player.mpvState, parts.player.hasFile], ["running", true], "mpv: running, with a file")
    root.next()
  }

  // The runtime directory: files named by a counter, private, and nothing
  // that names the video.
  function files() {
    var h = root.h
    var paths = h.parts.fs.paths
    var find = ["/usr/bin/find", paths.runtimeDir, "-mindepth", "1", "-printf", "%P %m\\n"]
    h.exec(find, null, function(code, out) {
      var seen = out.split("\n").filter(function(line) { return line !== "" }).sort()
      h.equal(seen, ["deno 700", "info 700", "info/1.json 600", "jar 700", "mpv.sock 600", "signin 700",
        "thumbs 700", "ytcache 700"], "files: the private folders, one info file, the socket")
      h.check(out.indexOf(root.id) === -1, "files: no name holds the id")
      var text = h.readFile(paths.infoDir + "/1.json")
      h.check(text === h.readFile(h.repo + "/tests/fixtures/video.json"), "files: the lookup, as it came")
      root.next()
    })
  }

  function stops() {
    var h = root.h
    var s = h.service
    h.check(s.stop(), "stop: taken")
    h.equal([s.playbackState, s.hasTrack, s.queueIndex, s.queue.length, s.tooltip],
      ["idle", false, -1, 1, "OmaJuke"], "stop: idle at once, the queue keeps its item")
    h.equal(s.stop(), false, "stop: twice is nothing")
    var gone = function() { return h.parts.player.mpvState === "off" }
    root.until("stop: mpv is gone", gone, 5000, function() {
      var commands = root.sent()
      h.equal(commands[commands.length - 1], ["quit"], "stop: mpv was told to quit")
      h.alive(function(names) {
        h.equal(names, [], "stop: no stub is left running")
        root.next()
      })
    })
  }

  // A row's title is remote text, and the bar shows the tooltip as it is
  // given: until the lookup has answered, what the row says is all there
  // is. The lookup never answers here, and stopping gives it up.
  function hostileRow() {
    var h = root.h
    var s = h.service
    var long = new Array(30).join("word ")
    h.scenario({ ytdlp: "hang", mpv: "ok" })
    h.check(s.playTrack({ id: "BBBBBBBBBBB", title: "<img src=x>\n" + long, channel: "<b>", duration: 1,
      live: false }), "hostile row: taken")
    h.equal(s.playbackState, "resolving", "hostile row: being looked up")
    h.check(s.tooltip.indexOf("\u2039img src=x\u203a word") === 0,
      "hostile row: no tag can open in the tooltip")
    h.check(s.tooltip.length <= 80 && s.tooltip.indexOf("\n") === -1 && s.tooltip.indexOf("<") === -1,
      "hostile row: one line of at most 80 characters")
    root.until("hostile row: the lookup runs", function() { return h.parts.runner.active === 1 }, 5000,
      function() {
        h.check(s.stop(), "hostile row: stopped")
        h.equal([s.playbackState, s.tooltip], ["idle", "OmaJuke"], "hostile row: idle at once")
        root.until("hostile row: the lookup is given up", function() { return h.parts.runner.active === 0 },
          6000, function() {
            h.equal(h.log("mpv-start").length, 1, "hostile row: mpv was not started for it")
            h.alive(function(names) {
              h.equal(names, [], "hostile row: no stub is left running")
              root.next()
            })
          })
      })
  }

  // The log is the journal on a real desktop: nothing about a track may be
  // in it, and neither may an error of ours.
  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    h.check(log.indexOf("Configuration Loaded") !== -1, "log: readable while the case runs")
    var ids = [root.id, "BBBBBBBBBBB", "watch?v"]
    h.equal(ids.filter(function(text) { return log.indexOf(text) !== -1 }), [], "log: no id, no address")
    h.check(log.indexOf("vid=1") === -1 && log.indexOf("img src") === -1, "log: no title")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: "].filter(function(mark) {
      return log.indexOf(mark) !== -1
    })
    h.equal(named, [], "log: no message from the plugin")
    root.next()
  }
}
