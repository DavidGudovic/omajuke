import QtQuick
import "../../../lib/Lua.js" as Lua

// core/VideoWindow.qml, showing and hiding: a window is opened only after
// Hyprland has taken the rule that places it, the picture is attached to
// the playing track step by step, and hiding undoes all of it. Whatever
// keeps the rule from being registered keeps the window shut. The player is
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

  readonly property string quarter: Lua.rule({ pct: 25, corner: "bottom-right", marginX: 5, marginY: 5 })

  function run(h) {
    root.h = h
    root.parts = h.mount("tests/harness/VideoParts.qml", { h: h })
    if (root.parts === null || !root.parts.build()) { h.finish(); return }
    root.video = root.parts.video
    root.player = root.parts.player
    root.steps = [
      root.nothingPlays, root.shows, root.showsOnce, root.hides, root.showsAgain, root.keepsAwake,
      root.toggles, root.givenUpEarly, root.brokenConfig, root.refusedLine, root.refusalPasses,
      root.noMonitors, root.untestedRelease, root.playbackEnds
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

  // Gives everything that is still on its way the time to arrive, for
  // steps that assert that nothing more happens.
  function settle(then) {
    root.h.after(400, then)
  }

  function nothingPlays() {
    var h = root.h
    h.equal(root.snapshot(), ["hidden", "", false], "at rest: hidden, no note, no wish")
    h.equal(root.video.showVideo(), false, "nothing plays: there is nothing to show")
    h.equal(root.video.hideVideo(), false, "nothing plays: and nothing to hide")
    root.settle(function() {
      h.equal(root.parts.requests(), [], "nothing plays: the compositor is not asked")
      h.equal(root.player.calls.length, 0, "nothing plays: the player is not told anything")
      root.next()
    })
  }

  function shows() {
    var h = root.h
    root.parts.start(1, "Abc123Def4Q", root.parts.url("one"))
    h.equal(root.player.calls.length, 0, "a track starts: no picture unless it is asked for")
    // What the stub holds as the registered rule each time the player is
    // told something.
    root.player.probe = function() {
      var state = h.stubState("hyprctl")
      return state ? state.rule : ""
    }
    h.equal(root.video.showVideo(), true, "show: taken")
    h.equal(root.snapshot(), ["hidden", "", false], "show: nothing changes before the rule is registered")
    root.until("show: the picture is shown", function() {
      return root.video.videoState === "shown"
    }, function() {
      h.equal(root.snapshot(), ["shown", "", true], "show: shown, and the wish stands")
      h.equal(root.parts.states, ["loading", "shown"], "show: through loading")
      h.equal(root.parts.requests(),
        ["version", "configerrors", "monitors", "getoption", "configerrors", "eval"],
        "show: the gate, the monitors, the gaps, the errors once more, the line")
      h.equal(root.parts.lines(), [root.quarter], "show: the line is the rule for a quarter, bottom right")
      h.equal(root.player.names(), [
        "setVideoWatch:true", "setForceWindow:true", "readTracks", "addVideo:" + root.parts.url("one"),
        "readTracks", "selectVideo:1", "setKeepAwake:true"
      ], "show: watch, window, attach, select, keep awake")
      h.equal(root.player.calls[0].seen, "25-br-5-5", "show: the rule was registered before the player heard")
      h.equal(root.parts.resolver.calls, [], "show: the address that was there is used")
      root.next()
    })
  }

  function showsOnce() {
    var h = root.h
    var requests = root.parts.requests().length
    h.equal(root.video.showVideo(), false, "show twice: the wish already stands")
    root.settle(function() {
      h.equal(root.parts.requests().length, requests, "show twice: nothing is asked again")
      h.equal(root.player.calls.length, 7, "show twice: nothing is sent again")
      root.next()
    })
  }

  function hides() {
    var h = root.h
    root.player.clearCalls()
    root.parts.clearStates()
    root.player.probe = function() { return root.parts.requests().indexOf("clients") !== -1 }
    h.equal(root.video.hideVideo(), true, "hide: taken")
    h.equal(root.snapshot(), ["hidden", "", false], "hide: hidden at once, the wish is gone")
    h.equal(root.video.showVideo(), false, "hide: not shown again before the window is closed")
    root.until("hide: the player was told", function() { return root.player.calls.length === 4 }, function() {
      h.equal(root.player.names(), ["selectVideo:0", "setForceWindow:false", "setKeepAwake:false",
        "setVideoWatch:false"], "hide: picture off, window off, sleep allowed, watch off")
      h.equal(root.player.calls[0].seen, true, "hide: the window's place was read while it was still there")
      h.equal(root.parts.store.patches, [], "hide: no window in the list, nothing remembered")
      h.equal(root.parts.lines().length, 1, "hide: nothing is sent to the compositor")
      root.next()
    })
  }

  // The picture stays attached to the file, unselected: showing it again
  // needs no second attach.
  function showsAgain() {
    var h = root.h
    root.player.clearCalls()
    root.player.probe = null
    h.equal(root.video.showVideo(), true, "show again: taken")
    root.until("show again: shown", function() { return root.video.videoState === "shown" }, function() {
      h.equal(root.player.names(), ["setVideoWatch:true", "setForceWindow:true", "readTracks",
        "selectVideo:1", "setKeepAwake:true"], "show again: selected, not attached a second time")
      h.equal(root.parts.lines(), [root.quarter, root.quarter], "show again: a rule for every opening")
      h.equal(h.stubState("hyprctl").ruleCount, 1, "show again: and registered once, by its own guard")
      root.next()
    })
  }

  function keepsAwake() {
    var h = root.h
    root.player.clearCalls()
    root.parts.set({ keepAwake: false })
    h.equal(root.player.names(), ["setKeepAwake:false"], "keep awake: switched off while shown")
    root.parts.set({ keepAwake: true })
    h.equal(root.player.names(), ["setKeepAwake:false", "setKeepAwake:true"], "keep awake: and on again")
    root.parts.set({ videoSize: "third" })
    h.equal(root.player.calls.length, 2, "keep awake: another setting says nothing to the player")
    root.parts.set({ videoSize: "quarter" })
    root.next()
  }

  function toggles() {
    var h = root.h
    h.equal(root.video.toggleVideo(), true, "toggle: hides what is shown")
    h.equal(root.snapshot(), ["hidden", "", false], "toggle: hidden")
    root.until("toggle: closed", function() {
      return root.player.names().indexOf("setVideoWatch:false") !== -1
    }, function() {
      h.equal(root.video.toggleVideo(), true, "toggle: shows what is hidden")
      root.until("toggle: shown", function() { return root.video.videoState === "shown" }, function() {
        h.equal(root.video.hideVideo(), true, "toggle: hide for the next step")
        root.until("toggle: closed again", function() {
          return root.player.names().slice(-1)[0] === "setVideoWatch:false"
        }, root.next)
      })
    })
  }

  // Hide while the rule is still being registered: the wish is never taken.
  function givenUpEarly() {
    var h = root.h
    root.player.clearCalls()
    h.equal(root.video.showVideo(), true, "given up early: show")
    h.equal(root.video.hideVideo(), true, "given up early: hide right behind it")
    root.settle(function() {
      h.equal(root.snapshot(), ["hidden", "", false], "given up early: hidden, no wish")
      h.equal(root.player.calls.length, 0, "given up early: the player never heard of it")
      root.next()
    })
  }

  function refusedShow(label, code, then) {
    var h = root.h
    var lines = root.parts.lines().length
    root.player.clearCalls()
    h.equal(root.video.showVideo(), true, label + ": show is taken")
    root.until(label + ": the reason is there", function() {
      return root.video.videoNote !== ""
    }, function() {
      root.settle(function() {
        h.equal(root.snapshot(), ["hidden", code, false], label + ": hidden, with the reason, no wish")
        h.equal(root.player.calls.length, 0, label + ": no window was opened")
        then(root.parts.lines().length - lines)
      })
    })
  }

  function brokenConfig() {
    var h = root.h
    root.parts.patchStub({ configErrors: "Config error in file /home/user/.config/hypr/hyprland.lua" })
    root.refusedShow("broken config", "E_HYPR_ERRORS", function(sent) {
      h.equal(sent, 0, "broken config: nothing was sent")
      h.check(h.stubState("hyprctl").configErrors !== "", "broken config: the list of errors is still there")
      h.equal(root.video.hideVideo(), false, "broken config: there is nothing to hide")
      h.equal(root.snapshot(), ["hidden", "", false], "broken config: but the reason is put away")
      root.parts.patchStub({ configErrors: "" })
      root.next()
    })
  }

  function refusedLine() {
    var h = root.h
    h.scenario({ hyprctl: "refuse" })
    root.refusedShow("refused line", "E_HYPR_EVAL", function(sent) {
      h.equal(sent, 1, "refused line: it was sent once and not repeated")
      h.scenario({ hyprctl: "ok" })
      root.next()
    })
  }

  // Why a showing was refused is said for the track it was asked on: the
  // next track starts without it, and so does the end of playback. A click
  // meanwhile asks again, it has nothing to hide.
  function refusalPasses() {
    var h = root.h
    h.scenario({ hyprctl: "refuse" })
    h.equal(root.snapshot(), ["hidden", "E_HYPR_EVAL", false], "refusal: still said while the track plays")
    h.equal(root.video.toggleVideo(), true, "refusal: a toggle asks again")
    h.equal(root.snapshot(), ["hidden", "", false], "refusal: and puts the old answer away meanwhile")
    root.until("refusal: refused again", function() { return root.video.videoNote !== "" }, function() {
      root.parts.start(5, "Qrs456Tuv7B", root.parts.url("five"))
      h.equal(root.snapshot(), ["hidden", "", false], "refusal: the next track starts without the reason")
      root.refusedShow("refusal, then the end", "E_HYPR_EVAL", function(sent) {
        root.parts.end("idle")
        h.equal(root.snapshot(), ["hidden", "", false], "refusal: nor is it kept when playback ends")
        h.scenario({ hyprctl: "ok" })
        root.parts.start(6, "Wxy012Zab3C", root.parts.url("six"))
        root.settle(function() {
          h.equal(root.snapshot(), ["hidden", "", false], "refusal: no wish was ever taken")
          h.equal(root.player.calls.length, 0, "refusal: and no window opened")
          root.next()
        })
      })
    })
  }

  // Without a focused monitor there is no place to work out, so no line.
  function noMonitors() {
    var h = root.h
    root.parts.patchStub({ monitors: [] })
    root.refusedShow("no monitors", "E_HYPR_EVAL", function(sent) {
      h.equal(sent, 0, "no monitors: nothing was sent")
      h.scenario({ hyprctl: "garbage:getoption" })
      h.setStubState("hyprctl", {})
      root.refusedShow("no gaps", "E_HYPR_EVAL", function(again) {
        h.equal(again, 0, "no gaps: nothing was sent")
        h.scenario({ hyprctl: "ok" })
        root.next()
      })
    })
  }

  // The release is asked once per compositor access, so this takes parts of
  // its own.
  function untestedRelease() {
    var h = root.h
    h.setStubState("hyprctl", { version: "0.57.0" })
    var other = h.mount("tests/harness/VideoParts.qml", { h: h })
    if (other === null || !other.build()) { h.finish(); return }
    var lines = root.parts.lines().length
    other.start(1, "Abc123Def4Q", other.url("one"))
    h.equal(other.video.showVideo(), true, "untested release: show is taken")
    root.until("untested release: the reason is there", function() { return other.video.videoNote !== "" },
      function() {
        h.equal([other.video.videoState, other.video.videoNote, other.video.wanted],
          ["hidden", "E_HYPR_VERSION", false], "untested release: no window on a release nobody tried")
        h.equal(other.player.calls.length, 0, "untested release: the player is not told anything")
        h.equal(root.parts.lines().length, lines, "untested release: nothing was sent")
        h.setStubState("hyprctl", {})
        root.next()
      })
  }

  // The queue ran out: the window goes, the wish stays, and the next track
  // brings the window back under a freshly registered rule.
  function playbackEnds() {
    var h = root.h
    h.equal(root.video.showVideo(), true, "playback ends: show first")
    root.until("playback ends: shown", function() { return root.video.videoState === "shown" }, function() {
      root.player.clearCalls()
      var lines = root.parts.lines().length
      root.parts.end("idle")
      h.equal(root.snapshot(), ["hidden", "", true], "playback ends: hidden, the wish stays")
      h.equal(root.player.names(), ["setForceWindow:false", "setKeepAwake:false"],
        "playback ends: the window is closed, the watch stays")
      // Nothing is visible, so a toggle is a showing and not a hiding. It
      // changes nothing: the wish already stands.
      h.equal(root.video.toggleVideo(), false, "playback ends: a toggle has nothing to hide")
      h.equal(root.snapshot(), ["hidden", "", true], "playback ends: and does not take the wish back")
      h.equal(root.player.names(), ["setForceWindow:false", "setKeepAwake:false"],
        "playback ends: the player hears nothing of it")
      root.player.clearCalls()
      root.parts.start(2, "Xyz789Uvw0A", root.parts.url("two"))
      root.until("playback ends: shown for the next track", function() {
        return root.video.videoState === "shown"
      }, function() {
        h.equal(root.parts.lines().length, lines + 1, "playback ends: the rule goes out before the window")
        h.equal(root.player.names(), ["setForceWindow:true", "readTracks",
          "addVideo:" + root.parts.url("two"), "readTracks", "selectVideo:1", "setKeepAwake:true"],
          "playback ends: attached to the new track")
        h.equal(root.parts.resolver.calls, [], "throughout: no address was ever looked up again")
        root.next()
      })
    })
  }
}
