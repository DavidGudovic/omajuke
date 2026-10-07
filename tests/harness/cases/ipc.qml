import QtQuick

// The code behind the IPC handler, called the way the handler calls it. An
// IPC argument is whatever a local program chose to send: every method must
// answer at once with one of its documented words, refuse anything that is
// not what it expects before it starts or keeps anything, and treat an
// accepted argument as data wherever it goes. Two well-formed video ids
// spell an option and a member name; they have to behave like any other id.
QtObject {
  id: root

  property string kind: "service"
  // The service starts without the facade, as it does for one turn in the
  // shell and for good when the bar is not the built-in one.
  property bool inject: false

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string asOption: "--no-config"
  readonly property string asMember: "constructor"

  // Related tracks are another case's subject. Here the user has switched
  // them off, so a queue ends where the user's own tracks end.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok", curl: "ok" })
    root.steps = [
      root.withoutFacade, root.withFacade, root.hostileTargets, root.hostileQueries, root.hostileWords,
      root.nothingMoved,
      root.idLikeAnOption, root.idLikeAMember, root.transport, root.enqueue, root.search, root.status,
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

  function repeat(unit, count) {
    return new Array(count + 1).join(unit)
  }

  function state(name) {
    return function() { return root.h.service.playbackState === name }
  }

  function mpvOff() {
    return root.h.parts.player.mpvState === "off"
  }

  function facadeCalls(name) {
    return root.h.shell.calls.filter(function(call) { return call.name === name })
  }

  // Before the host has injected anything: every method still answers, and
  // nothing can be started.
  function withoutFacade() {
    var h = root.h
    var s = h.service
    h.after(400, function() {
      h.equal([s.ready, s.shell, s.manifest], [false, null, null], "no facade: not ready, nothing injected")
      h.equal([s._ipcToggle(), s._ipcOpen(), s._ipcClose()], ["unhandled", "unhandled", "unhandled"],
        "no facade: there is no panel to move")
      h.equal([s._ipcPlayPause(), s._ipcNext(), s._ipcPrevious(), s._ipcStop()],
        ["unhandled", "unhandled", "unhandled", "unhandled"], "no facade: nothing plays")
      h.equal([s._ipcPlay(root.idA), s._ipcEnqueue(root.idA), s._ipcSearch("some words")],
        ["unavailable", "unavailable", "unavailable"], "no facade: nothing can be started")
      h.equal([s._ipcPlay("file:///etc/hostname"), s._ipcSearch("file:///etc/hostname")],
        ["invalid", "invalid"], "no facade: a bad argument is refused as such")
      var status = JSON.parse(s._ipcStatus())
      h.equal([status.state, status.id, status.queueLength, status.updatePending], ["idle", "", 0, false],
        "no facade: the status of a service that has done nothing")
      root.next()
    })
  }

  function withFacade() {
    var h = root.h
    var s = h.service
    var id = h.manifest.id
    h.injectNow()
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.equal([s._ipcToggle(), s._ipcOpen(), s._ipcClose()], ["ok", "ok", "ok"], "facade: the panel methods")
      h.equal(h.shell.calls.slice(-3), [
        { name: "toggle", args: [id, ""] }, { name: "summon", args: [id, ""] }, { name: "hide", args: [id] }
      ], "facade: each reached the host with our id and nothing else")
      h.equal([s._ipcPlayPause(), s._ipcNext(), s._ipcPrevious(), s._ipcStop()],
        ["unhandled", "unhandled", "unhandled", "unhandled"], "facade: nothing plays yet")
      root.next()
    })
  }

  // What is not a link to a YouTube video, or not a string at all.
  function hostileTargets() {
    var h = root.h
    var s = h.service
    var link = "https://www.youtube.com/watch?v=" + root.idA
    var bad = [
      undefined, null, 7, true, {}, [], [root.idA], { toString: function() { return root.idA } },
      "", " ", root.repeat("A", 2049), root.repeat(" ", 2038) + root.idA,
      root.idA + "\n", "\u0000" + root.idA, root.idA + "\u0007", link + "\n--exec=x", link + "\tx", "\u007f",
      "file:///etc/hostname", "/etc/hostname", "~/x", "javascript:alert(1)", "ytsearch:x", "-J", "--exec=x",
      "http://localhost/watch?v=" + root.idA, "https://evil.example/watch?v=" + root.idA,
      "https://www.youtube.com.evil.example/watch?v=" + root.idA,
      "https://user@www.youtube.com/watch?v=" + root.idA,
      "https://www.youtube.com\\@evil.example/watch?v=" + root.idA,
      "https://www.youtube.com/playlist?list=PL0123456789",
      "AAAAAAAAAA", "AAAAAAAAAAAA", "AAAAAAAAAA!", "AAAAA AAAAA"
    ]
    for (var i = 0; i < bad.length; i++) {
      h.equal(s._ipcPlay(bad[i]), "invalid", "play, hostile argument " + i)
      h.equal(s._ipcEnqueue(bad[i]), "invalid", "enqueue, hostile argument " + i)
    }
    root.next()
  }

  // What must never reach YouTube as a search: nothing, too much, control
  // characters, and anything that looks like a link, an address or a path.
  function hostileQueries() {
    var h = root.h
    var s = h.service
    var bad = [
      undefined, null, 7, false, {}, ["some words"],
      "", "   ", "\u200b\u200b", "\u202e", root.repeat("a", 201), root.repeat("a ", 1025),
      "two\nlines", "a\u0000b", "bell\u0007",
      "https://youtu.be/" + root.idA, "youtube.com/playlist?list=PL0123456789", "file:///etc/hostname",
      "/home/user/private/file.mp4", "~/Documents/tax.pdf", "192.168.1.10/admin?token=abc",
      "localhost/x?token=abc", "someone@example.com", "will.i.am", "nas/share/private.mp4",
      "https://intranet.example/a b?token=x"
    ]
    for (var i = 0; i < bad.length; i++) {
      h.equal(s._ipcSearch(bad[i]), "invalid", "search, hostile argument " + i)
    }
    root.next()
  }

  // The two methods that take a word take their words and nothing else. A
  // name of an output is only ever looked for in the list mpv gave, and
  // while nothing plays there is no list.
  function hostileWords() {
    var h = root.h
    var s = h.service
    var common = [
      undefined, null, 7, true, {}, [], "", " ", "constructor", "__proto__", "file:///etc/hostname", "--fs",
      root.repeat("a", 5000)
    ]
    var actions = common.concat([["toggle"], "Toggle", "toggle ", " show", "hide\n", "show\u0000", "close"])
    for (var i = 0; i < actions.length; i++) {
      h.equal(s._ipcVideo(actions[i]), "invalid", "video, hostile argument " + i)
    }
    var names = common.concat([["next"], "Next", "next ", "auto\n", "pipewire/x\u0000", "pipewire/../../etc",
      "alsa/default", "--audio-device=x", "auto", "pipewire/stub.one"])
    for (var k = 0; k < names.length; k++) {
      h.equal(s._ipcOutput(names[k]), "invalid", "output, hostile argument " + k)
    }
    h.equal([s._ipcVideo("toggle"), s._ipcVideo("show"), s._ipcVideo("hide"), s._ipcOutput("next")],
      ["unhandled", "unhandled", "unhandled", "unhandled"],
      "the words themselves: taken, and there is nothing to show, hide or step through")
    root.next()
  }

  function nothingMoved() {
    var h = root.h
    var s = h.service
    h.after(400, function() {
      h.equal([s.playbackState, s.queue.length, s.hasTrack, s.errorCode], ["idle", 0, false, ""],
        "hostile: playback did not move")
      h.equal([s.searchState, s.searchQuery, s.searchResults.length, s.searchError], ["idle", "", 0, ""],
        "hostile: the search did not move, and no text was kept")
      h.equal(h.jobs().map(function(job) { return job.tag }), ["prepare", "prepare-data"],
        "hostile: no job was started")
      h.equal([s.videoState, s.videoNote, s.outputs.length, h.log("hyprctl").length], ["hidden", "", 0, 0],
        "hostile: no window, no output, and the compositor was not asked")
      h.equal([h.log("ytdlp").length, h.log("curl").length, h.log("mpv-start").length], [0, 0, 0],
        "hostile: no tool was started")
      h.equal(root.facadeCalls("summon").length, 1, "hostile: no refused search opened the panel")
      root.next()
    })
  }

  // Eleven characters of the id alphabet that spell an option of mpv and of
  // yt-dlp. As an id it goes where every id goes: into an address on
  // yt-dlp's standard input and into the command sent over mpv's socket.
  function idLikeAnOption() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcPlay("  " + root.asOption + "  "), "ok", "option-like id: taken as an id")
    h.equal(JSON.parse(s._ipcStatus()).id, root.asOption, "option-like id: the status names it at once")
    root.until("option-like id: plays", root.state("playing"), 8000, function() {
      var lookup = h.log("ytdlp")[0]
      h.equal(lookup.stdin, "https://www.youtube.com/watch?v=" + root.asOption + "\n",
        "option-like id: inside the address, on standard input")
      h.check(lookup.argv.indexOf(root.asOption) === -1, "option-like id: not among yt-dlp's arguments")
      h.check(JSON.stringify(h.jobs()).indexOf(root.asOption) === -1, "option-like id: in no command line")
      var launch = h.log("mpv-start")[0].argv
      h.equal(launch.filter(function(arg) { return arg === root.asOption }).length, 1,
        "option-like id: mpv has the option once, from its constant arguments")
      var loads = h.log("mpv").map(function(line) { return line.command }).filter(function(command) {
        return command[0] === "loadfile"
      })
      h.equal(loads.map(function(command) { return command[1] }),
        ["https://www.youtube.com/watch?v=" + root.asOption],
        "option-like id: inside the address, over the socket")
      root.next()
    })
  }

  // And eleven characters that spell a member every object has.
  function idLikeAMember() {
    var h = root.h
    var s = h.service
    h.shell.panelShown = true
    s.notePanelOpen(true)
    h.equal(s._ipcPlay(root.asMember), "ok", "member-like id: taken as an id")
    root.until("member-like id: plays", function() {
      return s.playbackState === "playing" && s.currentTrack.id === root.asMember
    }, 8000, function() {
      h.equal(JSON.parse(s._ipcStatus()).id, root.asMember, "member-like id: the status names it")
      h.equal(s.recents.map(function(track) { return track.id }), [root.asMember, root.asOption],
        "member-like id: both are among the recent tracks")
      h.check(s.thumbs[root.asMember] === undefined, "member-like id: no picture is found for it by accident")
      h.equal(s.errorText(root.asMember), "", "member-like id: and no error sentence")
      s.wantThumbs([root.asMember, root.asOption])
      root.until("member-like id: its picture arrives", function() {
        return typeof s.thumbs[root.asMember] === "string"
      }, 8000, function() {
        h.check(/\/thumbs\/[0-9]+\.jpg$/.test(s.thumbs[root.asMember]),
          "member-like id: a file named by a counter")
        h.check(h.log("curl")[0].argv.join(" ").indexOf(root.asMember) === -1
          && h.log("curl")[0].stdin.indexOf("/vi/" + root.asMember + "/") !== -1,
          "member-like id: the id reaches curl on standard input only")
        h.shell.panelShown = false
        s.notePanelOpen(false)
        root.next()
      })
    })
  }

  function transport() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcPlayPause(), "ok", "transport: pause is taken")
    root.until("transport: paused", root.state("paused"), 5000, function() {
      h.equal(s._ipcPlayPause(), "ok", "transport: resume is taken")
      root.until("transport: plays", root.state("playing"), 5000, function() {
        h.equal(s._ipcPrevious(), "ok", "transport: previous starts the track again")
        h.equal(s._ipcNext(), "unhandled", "transport: there is no next track")
        root.next()
      })
    })
  }

  // A video goes to the end of the queue, and plays when nothing does.
  function enqueue() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcEnqueue(root.idA), "ok", "enqueue: taken while a track plays")
    h.equal([s.currentTrack.id, s.queueIndex, s.playbackState], [root.asMember, 0, "playing"],
      "enqueue: the playing track is untouched")
    h.equal(s.queue.map(function(item) { return [item.id, item.auto] }),
      [[root.asMember, false], [root.idA, false]], "enqueue: at the end of the queue")
    h.equal(s.queue[1].title, "", "enqueue: known by its id alone until it is looked up")
    h.equal(JSON.parse(s._ipcStatus()).queueLength, 2, "enqueue: the status counts it")
    h.equal(s._ipcStop(), "ok", "stop: taken")
    h.equal(s._ipcStop(), "unhandled", "stop: nothing left to stop")
    root.until("stop: mpv is gone", root.mpvOff, 5000, function() {
      h.equal(s._ipcEnqueue("https://youtu.be/" + root.idA), "ok", "enqueue: taken when nothing plays")
      root.until("enqueue: plays", root.state("playing"), 8000, function() {
        h.equal([s.currentTrack.id, s.queueIndex, s.queue.length], [root.idA, 2, 3],
          "enqueue: the video of the link, at the end, and it plays")
        // Long enough for the player to remember a position after the stop.
        h.after(400, function() {
          h.check(JSON.parse(s._ipcStatus()).position > 0, "enqueue: the status has the position")
          h.equal(s._ipcStop(), "ok", "enqueue: stopped")
          root.until("enqueue: mpv is gone", root.mpvOff, 5000, root.next)
        })
      })
    })
  }

  function search() {
    var h = root.h
    var s = h.service
    var lookups = h.log("ytdlp").length
    var summons = root.facadeCalls("summon").length
    h.equal(s._ipcSearch("  some #words  here  "), "ok", "search: taken")
    h.equal([s.searchState, s.searchQuery], ["searching", "some words here"],
      "search: running, the query cleaned")
    h.equal(root.facadeCalls("summon").length, summons + 1, "search: the panel is opened on it")
    root.until("search: results", function() { return s.searchState === "results" }, 8000, function() {
      h.equal(h.log("ytdlp")[lookups].stdin, "ytsearch20:some words here\n",
        "search: the query on standard input")
      h.check(JSON.stringify(h.jobs()).indexOf("some") === -1, "search: in no command line")
      h.equal(s.searchResults.length, 11, "search: the results")
      // What the panel asks before it sends a query a second time.
      h.equal([s.matchesSearch("some words here"), s.matchesSearch(" some  #words here "),
        s.matchesSearch("some words"), s.matchesSearch("")], [true, true, false, false],
        "search: the shown results belong to this text, however it is spaced, and to no other")
      // Eleven letters are a query here: a bare id is taken by play alone.
      h.equal(s._ipcSearch(root.idA), "ok", "search: a bare id is searched for, not played")
      h.equal([s.searchQuery, s.playbackState], [root.idA, "idle"], "search: as text")
      h.equal([s.matchesSearch(root.idA), s.matchesSearch("some words here")], [true, false],
        "search: a running search belongs to its text too")
      root.until("search: done", function() { return s.searchState === "results" }, 8000, function() {
        // The search box does the same with eleven letters.
        h.equal([s.submit(root.idA, false), s.playbackState], ["query", "idle"],
          "search: the search box takes a bare id as text too")
        s.clearSearch()
        h.equal([s.searchState, s.searchQuery, s.searchResults.length], ["idle", "", 0],
          "search: cleared, and nothing kept")
        h.equal([s.matchesSearch(root.idA), s.matchesSearch("")], [false, false],
          "search: no text belongs to a cleared search, not even none")
        root.foundNothing()
      })
    })
  }

  // A search that found nothing has no rows to go to: the same text is
  // sent again when the user presses Enter on it.
  function foundNothing() {
    var h = root.h
    var s = h.service
    h.scenario({ ytdlp: "empty", mpv: "ok", curl: "ok" })
    h.equal(s._ipcSearch("nothing here"), "ok", "nothing found: taken")
    root.until("nothing found: the search says so", function() { return s.searchState === "empty" }, 8000,
      function() {
        h.equal([s.searchQuery, s.matchesSearch("nothing here")], ["nothing here", false],
          "nothing found: the query is kept, and counts as not answered")
        h.scenario({ ytdlp: "ok", mpv: "ok", curl: "ok" })
        s.clearSearch()
        root.next()
      })
  }

  // The files on disk belong to another version than the running code.
  function status() {
    var h = root.h
    var s = h.service
    var id = h.manifest.id
    var pending = function() { return JSON.parse(s._ipcStatus()).updatePending }
    h.equal(pending(), false, "status: no update pending")
    s.manifest = { id: id, version: "9.9.9" }
    h.equal(pending(), true, "status: another version on disk")
    var odd = [null, undefined, "9.9.9", 7, { id: id }, { id: id, version: 9 }]
    for (var i = 0; i < odd.length; i++) {
      s.manifest = odd[i]
      h.equal(pending(), false, "status: an odd manifest " + i + " is no update")
    }
    s.manifest = { id: id, version: h.manifest.version }
    h.equal(s._ipcStatus(), JSON.stringify({
      version: h.manifest.version, state: "idle", id: "", title: "", channel: "", position: 0, duration: 0,
      live: false, volume: 70, muted: false, queueLength: 3, queueIndex: -1, video: "hidden", output: "",
      signedIn: false, updatePending: false, error: ""
    }), "status: the whole answer, idle")
    root.next()
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.asMember, "some words",
      "etc/hostname", "evil.example", "token="]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, and no argument")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
