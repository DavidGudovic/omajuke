import QtQuick
import "../../../lib/Lua.js" as Lua

// core/VideoWindow.qml when the window goes without being asked to: the
// user closes it with the compositor's close key, or mpv itself goes away.
// A close by the user ends the wish like Hide does. mpv has then switched
// the picture off itself but still holds the window, so where the user left
// it is read before the window is let go. The player is a scripted
// stand-in (tests/harness/VideoParts.qml); hyprctl is the stub.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var parts: null
  property var video: null
  property var player: null
  property var steps: []
  property int at: 0

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/VideoParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.video = root.parts.video
    root.player = root.parts.player
    root.steps = [
      root.shown, root.closedByUser, root.staysClosed, root.closedAgain, root.closedWhileLoading,
      root.listUnreadable, root.listHangs, root.closedWithoutWindow, root.playerGone
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
    root.h.waitFor(predicate, 12000, function(met) {
      root.h.check(met, label)
      if (met) then()
      else root.h.finish()
    })
  }

  function untilClosed(label, then) {
    root.until(label, function() { return root.player.names().slice(-1)[0] === "setVideoWatch:false" }, then)
  }

  function show(label, then) {
    root.h.equal(root.video.showVideo(), true, label + ": show")
    root.until(label + ": shown", function() { return root.video.videoState === "shown" }, function() {
      root.player.clearCalls()
      then()
    })
  }

  function shown() {
    root.parts.start(1, "Abc123Def4Q", root.parts.url("one"))
    root.show("first", root.next)
  }

  function closedByUser() {
    var h = root.h
    // The user dragged the window to the top left and made it wider.
    root.parts.placeWindow([5, 35], [768, 432], {})
    root.player.probe = function() { return root.parts.requests().indexOf("clients") !== -1 }
    // What mpv does when the close key is pressed: picture off, message.
    root.player.videoTrack = 0
    root.player.hasPicture = false
    root.player.videoClosed()
    h.equal(root.snapshot(), ["hidden", "", false], "closed: hidden at once, and the wish is gone")
    h.equal(root.player.calls.length, 0, "closed: the window is not let go before its place was read")
    root.untilClosed("closed: the player was told", function() {
      h.equal(root.player.names(), ["setForceWindow:false", "setKeepAwake:false", "setVideoWatch:false"],
        "closed: window off, sleep allowed, watch off; the picture was mpv's to switch off")
      h.equal(root.player.calls[0].seen, true, "closed: the list of windows was read first")
      h.equal(root.parts.store.video(), { "DP-1": { corner: "top-left", widthPct: 40 } },
        "closed: where the user left the window is remembered")
      h.check(JSON.stringify(root.parts.store.patches).indexOf("notes") === -1,
        "closed: nothing of another window is kept")
      root.player.probe = null
      root.next()
    })
  }

  function staysClosed() {
    var h = root.h
    root.player.clearCalls()
    var requests = root.parts.requests().length
    root.parts.start(2, "Xyz789Uvw0A", root.parts.url("two"))
    h.after(400, function() {
      h.equal(root.snapshot(), ["hidden", "", false], "stays closed: the next track shows nothing")
      h.equal(root.player.calls.length, 0, "stays closed: and the player is told nothing")
      h.equal(root.parts.requests().length, requests, "stays closed: nor the compositor")
      root.next()
    })
  }

  // A second message, or one that comes when nothing is shown, is nothing.
  function closedAgain() {
    var h = root.h
    root.player.videoClosed()
    root.player.videoClosed()
    h.after(300, function() {
      h.equal(root.player.calls.length, 0, "closed again: nothing to close")
      h.equal(root.parts.store.patches.length, 1, "closed again: nothing to remember")
      root.next()
    })
  }

  function closedWhileLoading() {
    var h = root.h
    root.player.pictures = false
    h.equal(root.video.showVideo(), true, "while loading: show")
    root.until("while loading: the picture is selected", function() {
      return root.player.names().indexOf("selectVideo:1") !== -1
    }, function() {
      h.equal(root.video.videoState, "loading", "while loading: no picture yet")
      var left = Lua.rule({ pct: 40, corner: "top-left", marginX: 5, marginY: 35 })
      h.equal(root.parts.lines().slice(-1)[0], left, "while loading: it opened where the user left it")
      root.player.clearCalls()
      root.player.videoClosed()
      h.equal(root.snapshot(), ["hidden", "", false], "while loading: closed all the same")
      root.untilClosed("while loading: the player was told", function() {
        root.player.pictures = true
        root.player.hasPicture = true
        h.after(300, function() {
          h.equal(root.snapshot(), ["hidden", "", false], "while loading: a late picture shows nothing")
          root.player.hasPicture = false
          root.next()
        })
      })
    })
  }

  // The list of windows cannot be read: the window is closed all the same,
  // and what was remembered stays as it is.
  function listUnreadable() {
    var h = root.h
    root.show("unreadable", function() {
      root.parts.placeWindow([1435, 805], [480, 270], {})
      h.scenario({ hyprctl: "garbage:clients" })
      root.player.videoClosed()
      root.untilClosed("unreadable: closed", function() {
        h.equal(root.player.names(), ["setForceWindow:false", "setKeepAwake:false", "setVideoWatch:false"],
          "unreadable: the window is let go")
        h.equal(root.parts.store.patches.length, 1, "unreadable: nothing new is remembered")
        h.scenario({ hyprctl: "ok" })
        root.next()
      })
    })
  }

  function listHangs() {
    var h = root.h
    root.show("hangs", function() {
      h.scenario({ hyprctl: "hang:clients" })
      var began = Date.now()
      h.equal(root.video.hideVideo(), true, "hangs: hide")
      h.equal(root.snapshot(), ["hidden", "", false], "hangs: hidden at once")
      root.untilClosed("hangs: closed", function() {
        var took = Date.now() - began
        h.check(took >= 2500 && took < 9000, "hangs: after the read ran into its deadline")
        h.equal(root.player.names(), ["selectVideo:0", "setForceWindow:false", "setKeepAwake:false",
          "setVideoWatch:false"], "hangs: everything is switched off")
        h.equal(root.parts.store.patches.length, 1, "hangs: nothing new is remembered")
        h.scenario({ hyprctl: "ok" })
        root.next()
      })
    })
  }

  // The wish stands but this track has no picture, so there is no window:
  // a close message then only ends the wish.
  function closedWithoutWindow() {
    var h = root.h
    root.show("without window", function() {
      root.parts.start(3, "Mno456Pqr7S", "")
      h.equal(root.snapshot(), ["unavailable", "E_VIDEO_NONE", true], "without window: no picture")
      root.player.clearCalls()
      var requests = root.parts.requests().length
      root.player.videoClosed()
      h.equal(root.snapshot(), ["hidden", "", false], "without window: the wish ends")
      h.equal(root.player.names(), ["setForceWindow:false", "setKeepAwake:false", "setVideoWatch:false"],
        "without window: switched off at once")
      h.after(300, function() {
        h.equal(root.parts.requests().length, requests, "without window: no list of windows is read")
        root.next()
      })
    })
  }

  // mpv went away by itself and took the window along. The wish stays; the
  // next track opens a window again, under a freshly registered rule.
  function playerGone() {
    var h = root.h
    root.parts.start(4, "Abc123Def4Q", root.parts.url("four"))
    root.show("player gone", function() {
      var lines = root.parts.lines().length
      root.player.exited(true)
      h.equal(root.snapshot(), ["hidden", "", true], "player gone: hidden, the wish stays")
      h.equal(root.player.calls.length, 0, "player gone: there is nothing left to switch off")
      root.parts.end("error")
      h.equal(root.snapshot(), ["hidden", "", true], "player gone: playback failing changes nothing more")
      root.player.clearCalls()
      root.player.probe = function() { return root.parts.lines().length }
      root.parts.start(5, "Xyz789Uvw0A", root.parts.url("five"))
      root.until("player gone: shown again", function() {
        return root.video.videoState === "shown"
      }, function() {
        h.equal(root.player.names()[0], "setForceWindow:true", "player gone: a new window")
        h.equal(root.player.calls[0].seen, lines + 1, "player gone: opened after the rule was sent again")
        root.next()
      })
    })
  }
}
