import QtQuick
import "../../../lib/Lua.js" as Lua

// A session without Hyprland: the launcher runs this case without the
// variable that names a compositor. Nothing may then be asked of hyprctl at
// all: the gate answers by itself, every read fails at once, no line is
// sent, and the video window says why it stays shut. The hyprctl stub is in
// the tool table and must never be started.
QtObject {
  id: root

  property string kind: "component"

  readonly property string rule: Lua.rule({ pct: 25, corner: "bottom-right", marginX: 5, marginY: 5 })

  function run(h) {
    var parts = h.mount("tests/harness/VideoParts.qml", { h: h })
    if (parts === null || !parts.build()) { h.finish(); return }
    var hypr = parts.hypr
    hypr.gate(function(found) {
      h.equal(found, "no-hyprland", "the gate: no compositor")
      h.equal(hypr.lastGate, "no-hyprland", "the gate: kept")
      h.equal(hypr.gateCode(found), "E_HYPR_NONE", "the gate: its code")
      hypr.evalLua(root.rule, function(code) {
        h.equal(code, "E_HYPR_NONE", "a line: not sent")
        h.equal(hypr.detachedEvalArgv(root.rule), null, "a line: not sent blind either")
        hypr.monitors(function(monitors) {
          h.equal(monitors, { ok: false, value: null }, "monitors: no read")
          hypr.clients(function(clients) {
            h.equal(clients, { ok: false, value: null }, "clients: no read")
            hypr.option("general:gaps_out", function(gaps) {
              h.equal(gaps, { ok: false, value: null }, "option: no read")
              hypr.binds(function(binds) {
                h.equal(binds, { ok: false, text: "" }, "binds: no read")
                root.window(h, parts)
              })
            })
          })
        })
      })
    })
  }

  function window(h, parts) {
    parts.start(1, "Abc123Def4Q", parts.url("one"))
    h.equal(parts.video.showVideo(), true, "show: taken")
    h.waitFor(function() { return parts.video.videoNote !== "" }, 5000, function(met) {
      h.check(met, "show: the reason is there")
      var video = parts.video
      h.equal([video.videoState, video.videoNote, video.wanted], ["hidden", "E_HYPR_NONE", false],
        "show: no window without Hyprland, and the note says so")
      parts.video.compositorReloaded()
      h.after(700, function() {
        h.equal(parts.player.calls.length, 0, "the player was never told anything")
        h.equal(h.log("hyprctl"), [], "hyprctl was never started")
        h.equal(h.jobs().length, 0, "and no job of any kind ran")
        h.finish()
      })
    })
  }
}
