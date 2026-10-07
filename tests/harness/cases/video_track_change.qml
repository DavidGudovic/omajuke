import QtQuick
import "../../../lib/Const.js" as Const

// core/VideoWindow.qml across tracks: while the wish stands the picture is
// attached anew to every track that starts, the window stays open in
// between, a track without a picture closes it until the next one, and an
// address that stopped working is looked up exactly once more. Also what
// happens when the compositor loads its configuration again. The player is
// a scripted stand-in (tests/harness/VideoParts.qml); hyprctl is the stub.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var parts: null
  property var video: null
  property var player: null
  property var steps: []
  property int at: 0
  property int key: 1

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/VideoParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.video = root.parts.video
    root.player = root.parts.player
    root.steps = [
      root.shown, root.nextTrack, root.noPicture, root.pictureAgain, root.addressRenewed, root.failsTwice,
      root.lookupFails, root.outOfDate, root.reloaded, root.reloadedWhileBroken, root.reloadedUnwanted,
      root.neverPictured
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function snapshot() {
    return [root.video.videoState, root.video.videoNote, root.video.wanted]
  }

  function until(label, predicate, then) {
    root.h.waitFor(predicate, 8000, function(met) {
      root.h.check(met, label)
      if (met) then()
      else root.h.finish()
    })
  }

  function untilState(label, state, then) {
    root.until(label, function() { return root.video.videoState === state }, then)
  }

  // Starts the next track: a new key, an id made from it, and a clean
  // record. name "" is a track without a picture.
  function play(name) {
    root.key += 1
    root.player.clearCalls()
    root.parts.clearStates()
    var id = "Track" + ("000000" + root.key).slice(-6)
    root.parts.start(root.key, id, name === "" ? "" : root.parts.url(name))
    return id
  }

  function shown() {
    var h = root.h
    root.parts.start(1, "Track000001", root.parts.url("one"))
    h.equal(root.video.showVideo(), true, "show on the first track")
    root.untilState("the first track is shown", "shown", root.next)
  }

  function nextTrack() {
    var h = root.h
    var lines = root.parts.lines().length
    root.play("two")
    h.equal(root.snapshot(), ["loading", "", true], "next track: loading again at once")
    root.untilState("next track: shown", "shown", function() {
      h.equal(root.player.names(), ["setForceWindow:true", "readTracks", "addVideo:" + root.parts.url("two"),
        "readTracks", "selectVideo:1", "setKeepAwake:true"], "next track: attached anew, nothing remembered")
      h.equal(root.parts.states, ["loading", "shown"], "next track: never hidden in between")
      h.equal(root.parts.lines().length, lines, "next track: the open window needs no rule")
      root.next()
    })
  }

  function noPicture() {
    var h = root.h
    root.play("")
    h.equal(root.snapshot(), ["unavailable", "E_VIDEO_NONE", true], "no picture: said so, and the wish stays")
    h.equal(root.player.names(), ["setForceWindow:false", "setKeepAwake:false"],
      "no picture: the window is closed and the selection left alone")
    root.next()
  }

  function pictureAgain() {
    var h = root.h
    var lines = root.parts.lines().length
    root.player.probe = function() { return root.parts.lines().length }
    root.play("four")
    h.equal(root.snapshot(), ["loading", "", true], "picture again: loading, the note is gone")
    h.equal(root.player.calls.length, 0, "picture again: no window before the rule is registered")
    root.untilState("picture again: shown", "shown", function() {
      h.equal(root.player.names()[0], "setForceWindow:true", "picture again: the window reopens")
      h.equal(root.player.calls[0].seen, lines + 1, "picture again: after the rule was sent once more")
      root.player.probe = null
      root.next()
    })
  }

  // mpv cannot open the address: it is looked up again, once, and the new
  // one is tried. Only the picture's address is asked for, so the file the
  // sound plays from is never replaced.
  function addressRenewed() {
    var h = root.h
    root.player.addErrors = ["error running command"]
    var id = root.play("five")
    root.untilState("renewed: shown", "shown", function() {
      h.equal(root.parts.resolver.calls, [id], "renewed: one lookup, for the playing track")
      h.equal(root.player.names(), ["setForceWindow:true", "readTracks", "addVideo:" + root.parts.url("five"),
        "addVideo:" + root.parts.url("fresh-" + id), "readTracks", "selectVideo:1", "setKeepAwake:true"],
        "renewed: the second try uses the new address")
      h.equal(root.parts.states, ["loading", "shown"], "renewed: loading throughout")
      root.next()
    })
  }

  function failsTwice() {
    var h = root.h
    root.parts.resolver.calls = []
    root.player.addErrors = ["error running command", "timeout"]
    var id = root.play("six")
    root.untilState("fails twice: given up", "unavailable", function() {
      h.equal(root.snapshot(), ["unavailable", "E_VIDEO_NONE", true], "fails twice: no picture this time")
      h.equal(root.parts.resolver.calls, [id], "fails twice: still only one lookup")
      h.equal(root.player.names().slice(-2), ["setForceWindow:false", "setKeepAwake:false"],
        "fails twice: the window is closed")
      root.next()
    })
  }

  function lookupFails() {
    var h = root.h
    root.parts.resolver.calls = []
    root.parts.resolver.answers = [{ ok: false, code: "E_YT_REFUSED", videoUrl: "" }]
    root.player.addErrors = ["error running command"]
    root.play("seven")
    root.untilState("lookup fails: given up", "unavailable", function() {
      h.equal(root.snapshot(), ["unavailable", "E_VIDEO_NONE", true], "lookup fails: no picture")
      h.equal(root.player.names().filter(function(name) { return name.indexOf("addVideo") === 0 }).length, 1,
        "lookup fails: no second try without a new address")
      root.parts.resolver.answers = [{ ok: false, code: "cancelled", videoUrl: "" }]
      root.player.addErrors = ["error running command"]
      root.play("eight")
      root.untilState("lookup cancelled: given up", "unavailable", function() {
        h.equal(root.video.videoNote, "E_VIDEO_NONE", "lookup cancelled: no picture either")
        root.next()
      })
    })
  }

  // An answer that belongs to the track before says nothing about this one.
  function outOfDate() {
    var h = root.h
    root.player.holdAdds = true
    root.player.addErrors = ["error running command"]
    root.parts.resolver.calls = []
    root.play("nine")
    root.until("out of date: the first attach waits for mpv", function() {
      return root.player.held.length === 1
    }, function() {
      root.player.holdAdds = false
      root.play("ten")
      root.untilState("out of date: the next track is shown", "shown", function() {
        root.player.clearCalls()
        root.player.release()
        h.after(300, function() {
          h.equal(root.snapshot(), ["shown", "", true], "out of date: the late failure changes nothing")
          h.equal(root.player.calls.length, 0, "out of date: and nothing is sent because of it")
          h.equal(root.parts.resolver.calls, [], "out of date: no lookup for a track that is over")
          root.next()
        })
      })
    })
  }

  // A sound reload wipes the rule. It is registered again a moment after
  // the last of a burst of reloads, once.
  function reloaded() {
    var h = root.h
    var lines = root.parts.lines().length
    var count = h.stubState("hyprctl").ruleCount
    root.parts.patchStub({ rule: "" })
    root.player.clearCalls()
    root.video.compositorReloaded()
    h.after(150, function() {
      root.video.compositorReloaded()
      h.equal(root.parts.lines().length, lines, "reloaded: nothing is sent while reloads still come in")
      root.until("reloaded: the rule is back", function() {
        return h.stubState("hyprctl").rule !== ""
      }, function() {
        h.after(500, function() {
          h.equal(root.parts.lines().length, lines + 1, "reloaded: sent once for the whole burst")
          h.equal(h.stubState("hyprctl").ruleCount, count + 1, "reloaded: registered once")
          h.equal(root.snapshot(), ["shown", "", true], "reloaded: the window that is open is left alone")
          h.equal(root.player.calls.length, 0, "reloaded: the player hears nothing")
          root.next()
        })
      })
    })
  }

  // A reload that left the configuration broken: nothing is sent, the open
  // window stays, and the next window does not open until it is fixed.
  function reloadedWhileBroken() {
    var h = root.h
    var lines = root.parts.lines().length
    root.parts.patchStub({ configErrors: "Config error in file /home/user/.config/hypr/hyprland.lua" })
    root.video.compositorReloaded()
    h.after(900, function() {
      h.equal(root.parts.lines().length, lines, "broken reload: nothing is sent")
      h.equal(root.snapshot(), ["shown", "", true], "broken reload: the open window is left alone")
      root.play("")
      root.play("twelve")
      root.untilState("broken reload: the next window is not opened", "unavailable", function() {
        h.equal(root.snapshot(), ["unavailable", "E_HYPR_ERRORS", true], "broken reload: the reason is shown")
        h.equal(root.player.names().indexOf("setForceWindow:true"), -1,
          "broken reload: no window without the rule")
        h.equal(root.parts.lines().length, lines, "broken reload: still nothing sent")
        root.parts.patchStub({ configErrors: "" })
        root.video.compositorReloaded()
        root.untilState("broken reload: shown once the configuration is fixed", "shown", function() {
          h.equal(root.parts.lines().length, lines + 1, "broken reload: the rule went out first")
          root.next()
        })
      })
    })
  }

  function reloadedUnwanted() {
    var h = root.h
    h.equal(root.video.hideVideo(), true, "unwanted: hide")
    root.until("unwanted: closed", function() {
      return root.player.names().slice(-1)[0] === "setVideoWatch:false"
    }, function() {
      var requests = root.parts.requests().length
      root.video.compositorReloaded()
      h.after(900, function() {
        h.equal(root.parts.requests().length, requests, "unwanted: a reload asks nothing of the compositor")
        root.next()
      })
    })
  }

  // mpv never reports a picture: the wait is bounded.
  function neverPictured() {
    var h = root.h
    h.equal(root.video.showVideo(), true, "never pictured: show")
    root.untilState("never pictured: shown at first", "shown", function() {
      root.player.pictures = false
      root.play("thirteen")
      var began = Date.now()
      h.waitFor(function() {
        return root.video.videoState !== "loading"
      }, Const.TIMEOUTS.videoMs + 3000, function() {
        var took = Date.now() - began
        h.equal(root.snapshot(), ["unavailable", "E_VIDEO_NONE", true], "never pictured: given up")
        h.check(took >= Const.TIMEOUTS.videoMs - 500 && took <= Const.TIMEOUTS.videoMs + 2000,
          "never pictured: after the wait a picture is given")
        h.equal(root.player.names().slice(-2), ["setForceWindow:false", "setKeepAwake:false"],
          "never pictured: the empty window is closed")
        root.next()
      })
    })
  }
}
