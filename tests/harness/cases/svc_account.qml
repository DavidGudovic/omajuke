import QtQuick

// Signing in and what follows from it, through the whole service and
// against the stub tools: a stand-in for the browser, for the question
// which browser is the default one, and for yt-dlp. The saved login reaches
// only the calls the user asked for with the account in mind: its lists,
// one video that needs an account, and the report that a video was
// watched. A search, a lookup made to play a track, and a lookup made ahead
// for a highlighted row never carry it. Nothing of a list is written to
// disk. Signing out removes the login; so does switching the plugin off,
// and a restart of the shell does not. Whenever nobody is signed in any
// more, the pictures fetched for the account's lists are gone and the
// watched report is switched off, so that it never passes to another login.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0
  property string stateBefore: ""

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string idB: "BBBBBBBBBBB"
  readonly property string idC: "CCCCCCCCCCC"
  readonly property string idD: "DDDDDDDDDDD"
  readonly property string idE: "EEEEEEEEEEE"
  readonly property string idF: "FFFFFFFFFFF"

  // Related tracks are another case's subject. Here the user has switched
  // them off, so a queue ends where the user's own tracks end.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    root.scene("ok")
    root.steps = [
      root.becomesReady, root.nobodySignedIn, root.signsIn, root.lists, root.playlist, root.nothingOnDisk,
      root.playsARow, root.aheadIsNotWatched, root.watched, root.needsAnAccount, root.signedOutByYouTube,
      root.signsOut, root.signsOutWhileSignedIn, root.switchedOff, root.restartsMidCheck,
      root.shellRestarts, root.quiet
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

  function scene(ytdlp) {
    root.h.scenario({
      ytdlp: ytdlp, mpv: "ok", curl: "ok", browser: "ok", "xdg-settings": "ok", "export": "ok"
    })
  }

  function row(id) {
    return { id: id, title: "A track", channel: "A channel", duration: 200, live: false }
  }

  // The yt-dlp starts that were handed a cookie file, and those that were
  // not, from a given start on. The start that reads the login out of the
  // browser's throwaway profile is neither: it makes the file.
  function calls(from, carrying) {
    return root.h.log("ytdlp").slice(from).filter(function(record) {
      if (record.argv.indexOf("--cookies-from-browser") !== -1) return false
      return (record.argv.indexOf("--cookies") !== -1) === carrying
    })
  }

  function withLogin(from) {
    return root.calls(from, true)
  }

  function withoutLogin(from) {
    return root.calls(from, false)
  }

  // What lies in the folders a login passes through, as "<folder>/<name>".
  function loginFiles(then) {
    var paths = root.h.parts.fs.paths
    var find = ["/usr/bin/find", paths.dataDir, paths.jarDir, paths.signinDir, "-mindepth", "1", "-printf",
      "%h/%f %m\\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  function signIn(label, then) {
    var h = root.h
    var s = h.service
    h.check(s.beginSignIn(), label + ": begun")
    h.equal(s.signInState, "confirm", label + ": the user is shown what will happen")
    root.until(label + ": the browser is known", function() { return s.signInBrowserPath !== "" }, 5000,
      function() {
        h.equal(h.log("browser").length, root.browsers, label + ": and not opened before the user said so")
        h.check(s.confirmSignIn(), label + ": confirmed")
        root.until(label + ": signed in", function() { return s.signedIn && s.signInState === "on" }, 15000,
          function() {
            root.browsers += 1
            h.equal([h.log("browser").length, s.signInError], [root.browsers, ""],
              label + ": the browser ran once")
            then()
          })
      })
  }

  property int browsers: 0

  // Switches the watched report on and has a panel show pictures for the
  // rows of a list, as a user who looks at the list does. then() runs when
  // the pictures are there.
  function leaveTraces(label, then) {
    var h = root.h
    var s = h.service
    h.check(s.setSetting("markWatched", true), label + ": the watched report is switched on")
    h.check(s.selectFeed("subs"), label + ": a list is shown")
    var listed = function() { return s.feedState === "rows" }
    root.until(label + ": its rows are there", listed, 8000, function() {
      h.shell.panelShown = true
      s.notePanelOpen(true)
      s.wantThumbs(s.feedRows.map(function(entry) { return entry.id }))
      root.until(label + ": their pictures arrive", function() {
        return Object.keys(s.thumbs).length === s.feedRows.length && s.settings.markWatched === true
      }, 8000, function() {
        root.pictures(function(files) {
          h.check(files.length > 0, label + ": as files in the runtime folder")
          then()
        })
      })
    })
  }

  // The picture files in the runtime folder.
  function pictures(then) {
    var find = ["/usr/bin/find", root.h.parts.fs.paths.thumbsDir, "-mindepth", "1", "-printf", "%f\\n"]
    root.h.exec(find, null, function(code, out) {
      then(out.split("\n").filter(function(line) { return line !== "" }).sort())
    })
  }

  // then() runs once nothing of the account's use is left: no picture in
  // memory or on disk, and the watched report off.
  function tracesGone(label, then) {
    var h = root.h
    var s = h.service
    root.until(label + ": the watched report is switched off", function() {
      return s.settings.markWatched === false
    }, 5000, function() {
      h.equal(Object.keys(s.thumbs), [], label + ": no picture is left in memory")
      var left = null
      var look = function() {
        root.pictures(function(files) {
          left = files
          if (files.length > 0) h.after(50, look)
        })
      }
      look()
      root.until(label + ": and none in the runtime folder", function() {
        return left !== null && left.length === 0
      }, 5000, function() {
        h.shell.panelShown = false
        s.notePanelOpen(false)
        then()
      })
    })
  }

  function becomesReady() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready && h.parts.signIn.known }, 5000, function() {
      h.equal([s.signedIn, s.signInState, s.signInError, s.signInBrowserPath], [false, "off", "", ""],
        "ready: nobody is signed in")
      h.equal([s.feedKind, s.feedState, s.feedRows, s.feedError], ["", "idle", [], ""], "ready: no list")
      h.equal(JSON.parse(s._ipcStatus()).signedIn, false, "ready: the status says so")
      root.next()
    })
  }

  function nobodySignedIn() {
    var h = root.h
    var s = h.service
    h.equal([s.selectFeed("subs"), s.openFeedRow(1), s.playWithAccount(), s.cancelSignIn()],
      [false, false, false, false], "signed out: nothing of an account can be asked for")
    h.check(s.playTrack(root.row(root.idA)), "signed out: a track is played")
    root.until("signed out: it plays", function() { return s.playbackState === "playing" }, 8000, function() {
      h.check(s.stop(), "signed out: stopped")
      h.equal([root.withLogin(0).length, h.log("browser").length], [0, 0],
        "signed out: no call had a cookie file, and no browser ran")
      root.next()
    })
  }

  function signsIn() {
    var h = root.h
    var s = h.service
    var paths = h.parts.fs.paths
    root.signIn("sign in", function() {
      root.loginFiles(function(files) {
        h.equal(files, [paths.jarFile + " 600"],
          "sign in: the saved login, private; no profile and no copy is left")
        var calls = root.withLogin(0)
        h.check(calls.length >= 1 && calls.every(function(record) {
          var copy = record.argv[record.argv.indexOf("--cookies") + 1]
          return copy.indexOf(paths.jarDir + "/") === 0 && /\/[0-9]+\.txt$/.test(copy)
            && record.argv.indexOf("--no-warnings") === -1 && record.argv.indexOf("--no-cookies") === -1
        }), "sign in: the login was only ever handed over as a numbered copy, with warnings kept")
        h.equal(JSON.parse(s._ipcStatus()).signedIn, true, "sign in: the status says so")
        root.next()
      })
    })
  }

  // The lists of the account, one at a time, each asked for with the login.
  function lists() {
    var h = root.h
    var s = h.service
    var kinds = ["foryou", "subs", "later", "history"]
    var before = h.log("ytdlp").length
    h.equal([s.selectFeed("constructor"), s.selectFeed("bogus")], [false, false],
      "lists: what is no list is not selected")
    var step = function(index) {
      if (index >= kinds.length) {
        h.equal(root.withLogin(before).length, kinds.length, "lists: one call with the login per list")
        h.equal(root.withoutLogin(before).length, 0, "lists: and none without")
        h.check(s.selectFeed(""), "lists: none of them can be selected too")
        h.equal([s.feedKind, s.feedState, s.feedRows], ["", "idle", []], "lists: then nothing is shown")
        root.next()
        return
      }
      h.check(s.selectFeed(kinds[index]), "list " + kinds[index] + ": selected")
      root.until("list " + kinds[index] + ": its rows arrive", function() {
        return s.feedKind === kinds[index] && s.feedState === "rows"
      }, 8000, function() {
        var first = s.feedRows[0]
        h.check(s.feedRows.length > 0 && first.key > 0 && first.playlist === false && first.title !== ""
          && /^[A-Za-z0-9_-]{11}$/.test(first.id), "list " + kinds[index] + ": rows are tracks with a key")
        step(index + 1)
      })
    }
    // The track that was played is saved a moment after it was stopped.
    // What the file holds then is what it has to hold afterwards.
    root.until("lists: a saved state is there to compare with", function() {
      return h.readFile(h.parts.fs.paths.stateFile).indexOf("\"index\":-1") !== -1
    }, 5000, function() {
      root.stateBefore = h.readFile(h.parts.fs.paths.stateFile)
      step(0)
    })
  }

  // A row of the playlists list opens into the videos of that playlist.
  function playlist() {
    var h = root.h
    var s = h.service
    h.check(s.selectFeed("playlists"), "playlist: the list of playlists is selected")
    root.until("playlist: its rows arrive", function() {
      return s.feedKind === "playlists" && s.feedState === "rows"
    }, 8000, function() {
      var first = s.feedRows[0]
      h.equal(first.playlist, true, "playlist: its rows are playlists")
      h.equal(s.feedTitle, "", "playlist: no playlist is open yet, so none is named")
      h.equal(s.openFeedRow(first.key), false, "playlist: opening one plays nothing")
      root.until("playlist: its videos arrive", function() {
        return s.feedState === "rows" && s.feedRows.length > 0 && s.feedRows[0].playlist === false
      }, 8000, function() {
        h.equal([s.feedKind, s.playbackState], ["playlists", "idle"], "playlist: shown under its list")
        h.check(first.title !== "" && s.feedTitle === first.title,
          "playlist: and named by the title of the row that was opened")
        h.check(s.selectFeed("playlists"), "playlist: the list of playlists is asked for again")
        h.equal(s.feedTitle, "", "playlist: which is no playlist, so the title goes")
        h.equal(s.openFeedRow(first.key), false, "playlist: opened once more for the steps that follow")
        h.equal(s.openFeedRow(999999), false, "playlist: a key no row has opens nothing")
        root.next()
      })
    })
  }

  // The lists live in memory. The saved state is, byte for byte, what it
  // was before they were looked at, and nothing else was written.
  function nothingOnDisk() {
    var h = root.h
    var written = h.jobs().filter(function(job) { return job.tag === "write" }).length
    h.after(1200, function() {
      h.equal(h.readFile(h.parts.fs.paths.stateFile), root.stateBefore,
        "on disk: the saved state did not change")
      h.equal(h.jobs().filter(function(job) { return job.tag === "write" }).length, written,
        "on disk: no file was written")
      root.next()
    })
  }

  // A video row is played like any other track: its lookup is signed out.
  function playsARow() {
    var h = root.h
    var s = h.service
    var before = h.log("ytdlp").length
    var first = s.feedRows[0]
    h.check(s.openFeedRow(first.key), "row: a video row is taken")
    root.until("row: it plays", function() {
      return s.playbackState === "playing" && s.currentTrack.id === first.id
    }, 8000, function() {
      h.equal([root.withLogin(before).length, root.withoutLogin(before).length], [0, 1],
        "row: one lookup, without the login")
      h.equal(s.currentTrack.title !== "", true, "row: it has the title the list gave it")
      h.check(s.stop(), "row: stopped")
      root.next()
    })
  }

  // The watched report is switched on. A row the highlight rests on is
  // looked up ahead, and that reports nothing: nobody has watched it.
  function aheadIsNotWatched() {
    var h = root.h
    var s = h.service
    var before = h.log("ytdlp").length
    h.parts.signIn.markAfterMs = 1000
    h.check(s.setSetting("markWatched", true), "ahead: reports are switched on")
    h.shell.panelShown = true
    s.notePanelOpen(true)
    s.hintHighlight(root.idB)
    root.until("ahead: the highlighted row is looked up", function() {
      return h.parts.resolver.fresh(root.idB)
    }, 8000, function() {
      h.after(1500, function() {
        var state = h.stubState("ytdlp")
        h.equal(state && Array.isArray(state.marked) ? state.marked : [], [],
          "ahead: nothing was reported as watched")
        h.equal([root.withLogin(before).length, root.withoutLogin(before).length], [0, 1],
          "ahead: one lookup, without the login")
        s.hintHighlight("")
        h.shell.panelShown = false
        s.notePanelOpen(false)
        root.next()
      })
    })
  }

  // A track that really played for a while is reported, once.
  function watched() {
    var h = root.h
    var s = h.service
    var before = h.log("ytdlp").length
    h.check(s.playTrack(root.row(root.idC)), "watched: a track is played")
    root.until("watched: it is reported", function() {
      var state = h.stubState("ytdlp")
      return state !== null && Array.isArray(state.marked) && state.marked.length === 1
    }, 10000, function() {
      h.equal(h.stubState("ytdlp").marked, [root.idC], "watched: the track that played, and no other")
      var reports = root.withLogin(before)
      h.equal(reports.length, 1, "watched: one call with the login")
      h.check(reports[0].argv.indexOf("--mark-watched") > reports[0].argv.indexOf("--no-mark-watched")
        && reports[0].argv.indexOf("--simulate") !== -1, "watched: the report, which fetches nothing")
      h.after(1500, function() {
        h.equal(h.stubState("ytdlp").marked.length, 1, "watched: reported once, however long it plays")
        h.check(s.setSetting("markWatched", false), "watched: reports are switched off again")
        h.check(s.stop(), "watched: stopped")
        root.next()
      })
    })
  }

  // A video YouTube shows only to a signed-in user. The login is used for
  // it when the user asks, and for that one lookup.
  function needsAnAccount() {
    var h = root.h
    var s = h.service
    root.scene("restricted")
    var before = h.log("ytdlp").length
    h.check(s.playTrack(root.row(root.idD)), "restricted: a track is taken")
    var refused = function() { return s.playbackState === "error" }
    root.until("restricted: it is refused", refused, 8000, function() {
      h.equal([s.errorCode, root.withLogin(before).length], ["E_NEEDS_ACCOUNT", 0],
        "restricted: for want of an account, and the login was not tried by itself")
      h.check(s.playWithAccount(), "restricted: the user asks for the account to be used")
      root.until("restricted: now it plays", function() { return s.playbackState === "playing" }, 8000,
        function() {
          h.equal(root.withLogin(before).length, 1, "restricted: one lookup with the login")
          h.equal(s.playWithAccount(), false, "restricted: nothing more to ask for while it plays")
          root.loginFiles(function(files) {
            h.equal(files, [h.parts.fs.paths.jarFile + " 600"], "restricted: the copy is gone again")
            h.check(s.stop(), "restricted: stopped")
            root.notRemembered()
          })
        })
    })
  }

  // The yes was for that one track. Two more such videos, one started by
  // the user and one the queue comes to by itself, are looked up signed
  // out and refused: nothing uses the login until the user asks again.
  function notRemembered() {
    var h = root.h
    var s = h.service
    var before = h.log("ytdlp").length
    h.check(s.playTrack(root.row(root.idE)), "not remembered: another such track is taken")
    h.check(s.enqueueTrack(root.row(root.idF)), "not remembered: and one more is queued behind it")
    root.until("not remembered: both are looked up", function() {
      return root.withoutLogin(before).length >= 2 && s.playbackState === "error"
    }, 10000, function() {
      h.after(1200, function() {
        h.equal([s.playbackState, s.errorCode], ["error", "E_NEEDS_ACCOUNT"],
          "not remembered: refused for want of an account, like the first one")
        h.equal(root.withLogin(before).length, 0, "not remembered: and no call was given the login")
        h.check(s.stop(), "not remembered: stopped")
        root.scene("ok")
        root.next()
      })
    })
  }

  // YouTube no longer accepts the login, which shows in the next answer
  // that is asked for with it. (The lists themselves were fetched a moment
  // ago and come from memory; a playlist is read anew each time.) From
  // then on no call is given the login.
  function signedOutByYouTube() {
    var h = root.h
    var s = h.service
    root.leaveTraces("ended session", function() {
      root.scene("signed-out")
      h.check(s.selectFeed("playlists"), "ended session: the playlists are shown again")
      h.equal(s.feedState, "rows", "ended session: from memory")
      h.equal(s.openFeedRow(s.feedRows[0].key), false, "ended session: a playlist is asked for")
      root.until("ended session: the service notices", function() { return s.signedIn === false }, 8000,
        function() {
          h.equal([s.signInState, s.signInError], ["failed", "E_SIGNED_OUT"], "ended session: and says so")
          h.equal([s.feedKind, s.feedState, s.feedRows], ["", "idle", []], "ended session: no list is left")
          h.equal(s.loginSaved, true, "ended session: the login file is still there, for the user to remove")
          root.scene("ok")
          var before = h.log("ytdlp").length
          h.equal([s.selectFeed("later"), s.playWithAccount()], [false, false],
            "ended session: nothing of the account can be asked for")
          h.after(400, function() {
            h.equal(root.withLogin(before).length, 0, "ended session: and no call is given the login")
            root.tracesGone("ended session", root.next)
          })
        })
    })
  }

  function signsOut() {
    var h = root.h
    var s = h.service
    h.check(s.signOut(), "sign out: taken")
    root.until("sign out: done", function() {
      return s.signInState === "off" && h.parts.signIn.signingOut === false
    }, 8000, function() {
      h.equal([s.signedIn, s.signInError, s.loginSaved], [false, "", false],
        "sign out: nobody is signed in, nothing went wrong")
      root.loginFiles(function(files) {
        h.equal(files, [], "sign out: the saved login is gone, and so is everything made from it")
        root.next()
      })
    })
  }

  // The user signs out while signed in. What the account's lists left in
  // the panel goes with the login, and the watched report does not wait
  // for whoever signs in next.
  function signsOutWhileSignedIn() {
    var h = root.h
    var s = h.service
    root.signIn("anew", function() {
      h.equal(s.settings.markWatched, false, "anew: a new login starts without the watched report")
      root.leaveTraces("anew", function() {
        h.check(s.signOut(), "anew: the user signs out")
        root.until("anew: done", function() {
          return s.signInState === "off" && h.parts.signIn.signingOut === false
        }, 8000, function() {
          root.tracesGone("anew", function() {
            root.loginFiles(function(files) {
              h.equal(files, [], "anew: and the login is gone")
              root.next()
            })
          })
        })
      })
    })
  }

  // The plugin is switched off or removed: the host takes its facade away
  // and destroys the service. No login stays behind.
  function switchedOff() {
    var h = root.h
    root.signIn("again", function() {
      var jar = h.parts.fs.paths.jarFile
      h.check(h.service.setSetting("markWatched", true), "switched off: the watched report was on")
      h.recreate(function() {
        var s = h.service
        root.until("switched off: the next start is ready", function() {
          return s.ready && h.parts.signIn.known
        }, 5000, function() {
          h.exec(["/usr/bin/find", jar], null, function(code, out) {
            h.equal(out, "", "switched off: the saved login was removed with the runtime files")
            h.equal([s.signedIn, s.signInState], [false, "off"], "switched off: and nobody is signed in")
            root.until("switched off: the watched report does not wait for the next login", function() {
              return s.settings.markWatched === false
            }, 5000, root.next)
          })
        })
      })
    })
  }

  // The shell ends while a new login is being tried out. The service goes
  // with its facade in place, as on any restart, but this login nobody has
  // seen working: it is removed, and the next start is not signed in.
  function restartsMidCheck() {
    var h = root.h
    var s = h.service
    var jar = h.parts.fs.paths.jarFile
    var starts = h.log("ytdlp").length
    root.scene("hang")
    h.check(s.beginSignIn(), "mid-check: begun")
    root.until("mid-check: the browser is known", function() { return s.signInBrowserPath !== "" }, 5000,
      function() {
        h.check(s.confirmSignIn(), "mid-check: confirmed")
        root.until("mid-check: the login is being tried out", function() {
          return s.signInState === "verifying" && root.withLogin(starts).length === 1
        }, 15000, function() {
          root.browsers += 1
          h.exec(["/usr/bin/stat", "-c", "%a", jar], null, function(code, out) {
            h.equal(out, "600\n", "mid-check: the login has been saved")
            h.service.destroy()
            h.service = null
            h.parts = null
            var gone = false
            var look = function() {
              h.exec(["/usr/bin/find", jar], null, function(found, text) {
                gone = text === ""
                if (!gone) h.after(50, look)
              })
            }
            look()
            root.until("mid-check: the unchecked login is removed", function() { return gone }, 8000,
              function() {
                root.scene("ok")
                h.recreate(function() {
                  root.until("mid-check: the next start is ready", function() {
                    return h.service.ready && h.parts.signIn.known
                  }, 5000, function() {
                    h.equal([h.service.signedIn, h.service.signInState, h.service.loginSaved],
                      [false, "off", false], "mid-check: and nobody is signed in")
                    root.next()
                  })
                })
              })
          })
        })
      })
  }

  // The shell ends with the plugin still switched on: the service goes
  // with its facade in place. The runtime files go; the login stays.
  function shellRestarts() {
    var h = root.h
    root.signIn("once more", function() {
      var paths = h.parts.fs.paths
      var jar = paths.jarFile
      var runtime = paths.runtimeDir
      h.service.destroy()
      var emptied = false
      var look = function() {
        h.exec(["/usr/bin/find", runtime, "-mindepth", "1", "-maxdepth", "1"], null, function(code, out) {
          emptied = out === ""
          if (!emptied) h.after(50, look)
        })
      }
      look()
      root.until("restart: the runtime files are removed", function() { return emptied }, 8000, function() {
        h.exec(["/usr/bin/stat", "-c", "%a", jar], null, function(code, out) {
          h.equal(out, "600\n", "restart: the saved login is still there, and private")
          root.next()
        })
      })
    })
  }

  function quiet() {
    var h = root.h
    var log = h.readFile(h.runDir + "/out.txt")
    var named = ["Service.qml", "/core/", "/lib/", "omajuke: ", root.idA, root.idC, root.idD, "invented-",
      "LOGIN_INFO", "cookies.txt"]
    h.equal(named.filter(function(mark) { return log.indexOf(mark) !== -1 }), [],
      "log: no message from the plugin, no id, nothing of a login")
    h.alive(function(names) {
      h.equal(names, [], "no stub is left running")
      root.next()
    })
  }
}
