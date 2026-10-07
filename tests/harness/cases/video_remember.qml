import QtQuick
import "../../../lib/Lua.js" as Lua

// core/VideoWindow.qml and the memory of where the user left the window:
// read when the window is hidden, kept per monitor, used for the next rule,
// and only ever about our own window. A window that still sits where the
// rule put it is not remembered, so the settings for size and corner keep
// working until the user moves it. The player is a scripted stand-in
// (tests/harness/VideoParts.qml); hyprctl is the stub, whose default
// monitor is 1920 by 1080 with a bar of 30 at the top and gaps of 5.
QtObject {
  id: root

  property string kind: "component"

  property var h: null
  property var parts: null
  property var video: null
  property var player: null
  property var steps: []
  property int at: 0

  readonly property var second: ({
    id: 1, name: "HDMI-A-1", description: "Synthetic monitor", width: 2560, height: 1440, refreshRate: 60,
    x: 1920, y: 0, scale: 2, transform: 0, focused: false, reserved: [0, 0, 0, 0]
  })
  readonly property var first: ({
    id: 0, name: "DP-1", description: "Synthetic monitor", width: 1920, height: 1080, refreshRate: 60,
    x: 0, y: 0, scale: 1, transform: 0, focused: true, reserved: [0, 30, 0, 0]
  })

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/VideoParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.video = root.parts.video
    root.player = root.parts.player
    root.parts.start(1, "Abc123Def4Q", root.parts.url("one"))
    root.steps = [
      root.untouched, root.moved, root.usedNextTime, root.leftThere, root.otherMonitor, root.notOurs,
      root.notFloating, root.unusableName, root.settingsWithoutMemory, root.manyMonitors, root.reset,
      root.movedByChoice
    ]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function rule(pct, corner, x, y) {
    return Lua.rule({ pct: pct, corner: corner, marginX: x, marginY: y })
  }

  function until(label, predicate, then) {
    root.h.waitFor(predicate, 8000, function(met) {
      root.h.check(met, label)
      if (met) then()
      else root.h.finish()
    })
  }

  // Shows the picture, lets the case put the window somewhere, hides it
  // again and calls then(line) with the rule that was sent for the showing.
  function showAndHide(label, place, then) {
    var h = root.h
    h.equal(root.video.showVideo(), true, label + ": show")
    root.until(label + ": shown", function() { return root.video.videoState === "shown" }, function() {
      var line = root.parts.lines().slice(-1)[0]
      place()
      root.player.clearCalls()
      h.equal(root.video.hideVideo(), true, label + ": hide")
      root.until(label + ": closed", function() {
        return root.player.names().slice(-1)[0] === "setVideoWatch:false"
      }, function() { then(line) })
    })
  }

  // Shown and hidden where the rule put it: a quarter of 1920 at the
  // bottom right, five from both edges.
  function untouched() {
    var h = root.h
    root.showAndHide("untouched", function() {
      root.parts.placeWindow([1435, 805], [480, 270], {})
    }, function(line) {
      h.equal(line, root.rule(25, "bottom-right", 5, 5), "untouched: the settings placed it")
      h.equal(root.parts.store.patches, [], "untouched: a window nobody moved is not remembered")
      root.next()
    })
  }

  function moved() {
    var h = root.h
    root.showAndHide("moved", function() {
      root.parts.placeWindow([20, 60], [768, 432], {})
    }, function(line) {
      h.equal(root.parts.store.patches, [{ video: { "DP-1": { corner: "top-left", widthPct: 40 } } }],
        "moved: corner and width are remembered for the monitor")
      root.next()
    })
  }

  function usedNextTime() {
    var h = root.h
    root.showAndHide("next time", function() {
      root.parts.placeWindow([5, 35], [768, 432], {})
    }, function(line) {
      h.equal(line, root.rule(40, "top-left", 5, 35), "next time: the rule puts it where it was left")
      h.equal(root.parts.store.patches.length, 1, "next time: and nothing new is written for the same place")
      root.next()
    })
  }

  // The settings change, but the user's own placing on this monitor wins.
  function leftThere() {
    var h = root.h
    root.parts.set({ videoSize: "half", videoCorner: "top-right" })
    root.showAndHide("left there", function() {}, function(line) {
      h.equal(line, root.rule(40, "top-left", 5, 35), "left there: what was remembered beats the settings")
      root.next()
    })
  }

  // Dragged onto a second monitor: the place is kept under the monitor the
  // window's middle is on, in that monitor's own measure (2560 at twice
  // the size is 1280 wide).
  function otherMonitor() {
    var h = root.h
    root.parts.patchStub({ monitors: [root.first, root.second] })
    root.showAndHide("other monitor", function() {
      root.parts.placeWindow([2700, 380], [640, 360], { monitor: 0 })
    }, function(line) {
      h.equal(root.parts.store.video(), {
        "DP-1": { corner: "top-left", widthPct: 40 },
        "HDMI-A-1": { corner: "bottom-right", widthPct: 50 }
      }, "other monitor: remembered beside the first, whatever the window says about its monitor")
      // The second monitor has the focus now: the next window opens there.
      var away = JSON.parse(JSON.stringify(root.first))
      var here = JSON.parse(JSON.stringify(root.second))
      away.focused = false
      here.focused = true
      root.parts.patchStub({ monitors: [away, here] })
      root.showAndHide("other monitor, focused", function() {}, function(second) {
        h.equal(second, root.rule(50, "bottom-right", 5, 5), "other monitor: its own place is used there")
        root.parts.patchStub({ monitors: [root.first] })
        root.next()
      })
    })
  }

  function notOurs() {
    var h = root.h
    var before = root.parts.store.patches.length
    root.showAndHide("not ours", function() {
      root.parts.patchStub({ clients: [
        { "class": "omajuke", title: "x", at: [900, 500], size: [900, 506], floating: true, fullscreen: 0 },
        { "class": "OmaJuke2", title: "x", at: [900, 500], size: [900, 506], floating: true, fullscreen: 0 },
        { title: "OmaJuke", at: [900, 500], size: [900, 506], floating: true, fullscreen: 0 }
      ] })
    }, function(line) {
      h.equal(root.parts.store.patches.length, before, "not ours: a window of another class says nothing")
      root.next()
    })
  }

  // A window the user tiled or made fullscreen has the layout's size, and
  // one that is on no monitor has no corner.
  function notFloating() {
    var h = root.h
    var before = root.parts.store.patches.length
    root.showAndHide("tiled", function() {
      root.parts.placeWindow([960, 30], [960, 1050], { floating: false })
    }, function() {
      root.showAndHide("fullscreen", function() {
        root.parts.placeWindow([0, 0], [1920, 1080], { fullscreen: 2 })
      }, function() {
        root.showAndHide("nowhere", function() {
          root.parts.placeWindow([9000, 9000], [480, 270], {})
        }, function() {
          root.showAndHide("no size", function() {
            root.parts.placeWindow("left", null, {})
          }, function() {
            h.equal(root.parts.store.patches.length, before, "not floating: none of them is remembered")
            root.next()
          })
        })
      })
    })
  }

  function unusableName() {
    var h = root.h
    var before = root.parts.store.patches.length
    var odd = JSON.parse(JSON.stringify(root.first))
    odd.name = "constructor ../x"
    root.parts.patchStub({ monitors: [odd] })
    root.showAndHide("unusable name", function() {
      root.parts.placeWindow([1000, 600], [800, 450], {})
    }, function(line) {
      h.equal(line, root.rule(50, "top-right", 5, 35), "unusable name: nothing is remembered for it, so the "
        + "settings place the window")
      h.equal(root.parts.store.patches.length, before, "unusable name: and nothing is stored under it")
      root.parts.patchStub({ monitors: [root.first] })
      root.next()
    })
  }

  function settingsWithoutMemory() {
    var h = root.h
    root.video.resetPlacement()
    h.equal(root.parts.store.video(), {}, "reset: every remembered place is gone")
    root.parts.set({ videoSize: "third", videoCorner: "top-right" })
    root.showAndHide("settings", function() {
      root.parts.placeWindow([1281, 35], [634, 356], {})
    }, function(line) {
      h.equal(line, root.rule(33, "top-right", 5, 35), "settings: with nothing remembered they decide")
      h.equal(root.parts.store.video(), {}, "settings: and a window left there is still not remembered")
      root.parts.set({ videoSize: "sixth", videoCorner: "bottom-left" })
      root.showAndHide("settings changed", function() {}, function(second) {
        h.equal(second, root.rule(17, "bottom-left", 5, 5), "settings: a change counts at the next showing")
        root.next()
      })
    })
  }

  // The table holds eight monitors; a ninth takes the place of the one
  // stored longest ago.
  function manyMonitors() {
    var h = root.h
    var table = {}
    for (var i = 1; i <= 8; i++) table["OUT-" + i] = { corner: "top-left", widthPct: 10 + i }
    root.parts.store.patch({ video: table })
    root.showAndHide("many monitors", function() {
      root.parts.placeWindow([1000, 600], [800, 450], {})
    }, function(line) {
      var kept = root.parts.store.video()
      h.equal(Object.keys(kept), ["OUT-2", "OUT-3", "OUT-4", "OUT-5", "OUT-6", "OUT-7", "OUT-8", "DP-1"],
        "many monitors: eight are kept, the oldest made room")
      h.equal(kept["DP-1"], { corner: "bottom-right", widthPct: 42 }, "many monitors: the new place is there")
      root.next()
    })
  }

  // Picking a place in the settings while the window is open: what was
  // remembered is forgotten, and the window is closed and opened again
  // under a rule for the new place, once, after the last of a burst of
  // picks. The wish stands throughout and the old place is not stored.
  function movedByChoice() {
    var h = root.h
    root.parts.store.patch({ video: { "DP-1": { corner: "top-left", widthPct: 40 } } })
    h.equal(root.video.showVideo(), true, "chosen: show")
    root.until("chosen: shown", function() { return root.video.videoState === "shown" }, function() {
      var sent = root.parts.lines().length
      root.parts.placeWindow([5, 35], [768, 432], {})
      root.player.clearCalls()
      root.parts.set({ videoCorner: "top-right" })
      root.video.placementChosen()
      root.parts.set({ videoCorner: "top-left" })
      root.video.placementChosen()
      h.equal(root.parts.store.video(), {}, "chosen: every remembered place is forgotten at once")
      root.until("chosen: moved", function() {
        return root.parts.lines().length > sent && root.video.videoState === "shown"
      }, function() {
        h.equal(root.parts.lines().slice(sent), [root.rule(17, "top-left", 5, 35)],
          "chosen: one rule, for the place picked last")
        var names = root.player.names()
        h.check(names.indexOf("selectVideo:0") !== -1 && names.indexOf("setForceWindow:false") !== -1,
          "chosen: the window was closed")
        h.equal(names.slice(-1)[0], "setKeepAwake:true", "chosen: and opened again with the picture")
        h.check(names.indexOf("setVideoWatch:false") === -1, "chosen: the wish stood throughout")
        h.equal(root.video.wanted, true, "chosen: and stands")
        h.equal(root.parts.store.video(), {}, "chosen: the old place was not remembered")
        root.video.hideVideo()
        root.until("chosen: hidden", function() { return root.video.videoState === "hidden" }, function() {
          root.video.placementChosen()
          h.equal(root.parts.lines().length, sent + 1, "chosen: with no window nothing is sent")
          root.next()
        })
      })
    })
  }

  function reset() {
    var h = root.h
    root.video.resetPlacement()
    h.equal(root.parts.store.video(), {}, "reset again: empty")
    root.showAndHide("after reset", function() {}, function(line) {
      h.equal(line, root.rule(17, "bottom-left", 5, 5), "after reset: the settings place the window")
      root.next()
    })
  }
}
