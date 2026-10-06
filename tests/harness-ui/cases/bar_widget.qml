import QtQuick

// The bar icon with a fake bar and a stand-in panel: the slot has a size,
// no panel is loaded before the first open, the open and close members the
// bar routes through reach the panel, the icon and its tooltip follow the
// service's state row by row, and clicks and the wheel call the service
// only while it is usable.
QtObject {
  id: root

  property var widget: null
  property var button: null
  property string realVersion: ""

  function isBarButton(item) { return typeof item.triggerPress === "function" }
  function isLoader(item) { return item.sourceComponent !== undefined && item.active !== undefined }

  function look() {
    return { active: root.button.active, dimmed: root.button.dimmed, tooltip: root.button.tooltipText }
  }

  // Puts the mock into a playback state and returns how the icon looks.
  function inState(h, state, tooltip) {
    h.mock.playbackState = state
    h.mock.playing = state === "playing" || state === "buffering"
    h.mock.paused = state === "paused"
    h.mock.tooltip = tooltip
    return root.look()
  }

  function run(h) {
    root.widget = h.mount("BarWidget.qml", {
      bar: h.bar, moduleName: h.bar.pluginId,
      panelSource: "file://" + h.repo + "/tests/harness-ui/FakePanel.qml"
    })
    if (!root.widget) {
      h.finish()
      return
    }
    root.button = h.find(root.widget, root.isBarButton)
    root.realVersion = h.mock.version
    var loader = h.find(root.widget, root.isLoader)

    h.steps([
      function() {
        h.check(root.button !== null && loader !== null, "the widget has an icon and a panel loader")
        h.check(root.widget.implicitWidth > 0 && root.widget.implicitHeight > 0, "the slot has a size")
        h.equal([root.widget.implicitWidth, root.widget.implicitHeight],
          [root.button.implicitWidth, root.button.implicitHeight], "which is the icon's")
        h.check(root.button.visible && root.button.text !== "", "the icon is drawn")
        h.equal(h.bar.clickTargets.indexOf(root.button) !== -1, true,
          "and registered with the bar for clicks")

        h.equal(root.widget.service === h.mock, true,
          "the service comes from the bar, under the injected name")
        h.equal([root.widget.stale, root.widget.live], [false, true], "and is usable")

        // The members the bar and the shell route through.
        h.equal([typeof root.widget.open, typeof root.widget.close, typeof root.widget.closeForPopoutSwitch],
          ["function", "function", "function"], "open, close and closeForPopoutSwitch exist")
        h.equal([root.widget.opened, root.widget.popoutSwitchClosing], [false, false], "closed at first")
        h.equal([loader.active, loader.item === null], [false, true],
          "no panel is loaded before the first open")
        root.widget.close()
        root.widget.closeForPopoutSwitch()
        h.equal(loader.active, false, "closing a panel that was never opened loads nothing")

        root.widget.open()
        h.equal([loader.active, loader.item !== null], [true, true], "open() loads the panel at once")
        h.equal(root.widget.opened, true, "and opens it")
      },
      function() {
        var panel = loader.item
        h.equal(panel.calls, ["open"], "the panel was opened exactly once")
        h.equal([panel.bar === h.bar, panel.moduleName, panel.anchorItem === root.button,
          panel.hostWidget === root.widget], [true, h.bar.pluginId, true, true],
          "the panel got the bar, the module name, the icon to anchor to and its host")
        h.equal(root.button.tooltipText, "", "no tooltip over the open panel")

        root.widget.close()
        h.equal([root.widget.opened, panel.calls], [false, ["open", "close"]], "close() reaches the panel")
        root.widget.togglePanel()
        h.equal(root.widget.opened, true, "togglePanel opens a closed panel")
        root.widget.closeForPopoutSwitch()
        h.equal([root.widget.opened, root.widget.popoutSwitchClosing], [false, true],
          "closeForPopoutSwitch reaches the panel, and its flag is forwarded")
        root.widget.open()
        root.widget.togglePanel()
        h.equal(root.widget.opened, false, "togglePanel closes an open one")
        h.equal(panel.calls, ["open", "close", "open", "closeForPopoutSwitch", "open", "close"],
          "each call arrived once, in order")

        // The module name reaches a loaded panel when the host injects again.
        root.widget.moduleName = "other.name"
        h.equal(panel.moduleName, "other.name", "a later injection is passed on")
        h.equal(root.widget.service, null, "and another name finds no service")
        root.widget.moduleName = h.bar.pluginId
        h.equal(root.widget.service === h.mock, true, "the right name finds it again")

        // ---- The icon, row by row ----
        h.equal(root.inState(h, "idle", "OmaJuke"), { active: false, dimmed: false, tooltip: "OmaJuke" },
          "idle")
        h.equal(root.inState(h, "resolving", "Loading…"),
          { active: true, dimmed: false, tooltip: "Loading…" }, "resolving")
        h.equal(root.inState(h, "loading", "Loading…"),
          { active: true, dimmed: false, tooltip: "Loading…" }, "loading")
        h.equal(root.inState(h, "playing", "Title — Channel"),
          { active: true, dimmed: false, tooltip: "Title — Channel" }, "playing")
        h.equal(root.inState(h, "buffering", "Title — Channel"),
          { active: true, dimmed: false, tooltip: "Title — Channel" }, "buffering")
        h.equal(root.inState(h, "paused", "Paused: Title"),
          { active: false, dimmed: true, tooltip: "Paused: Title" }, "paused")
        h.equal(root.inState(h, "error", "No network"),
          { active: false, dimmed: false, tooltip: "No network" }, "error")

        root.widget.open()
        h.equal(root.look(), { active: false, dimmed: false, tooltip: "" },
          "open panel: the same icon, no tooltip")
        root.inState(h, "playing", "Title")
        h.equal(root.look(), { active: true, dimmed: false, tooltip: "" }, "open panel while playing")
        root.widget.close()
        h.equal(h.actions(), [], "showing a state calls nothing")
      },
      function() {
        // ---- Input on a usable service ----
        h.click(root.button, Qt.MiddleButton)
        h.equal(h.actions(), ["playPause"], "middle click toggles playback")
        h.resetCalls()
        h.click(root.button, Qt.RightButton)
        h.equal(h.actions(), [], "right click does nothing")
        h.equal(root.widget.opened, false, "and opens nothing")
        h.wheel(root.button, 120)
        h.equal(h.calls("nudgeVolume"), [[5]], "one wheel notch up raises the volume by five")
        h.wheel(root.button, -120)
        h.equal(h.calls("nudgeVolume"), [[5], [-5]], "one notch down lowers it by five")
        h.wheel(root.button, 40)
        h.wheel(root.button, 40)
        h.equal(h.calls("nudgeVolume").length, 2, "a touchpad's small steps add up before they count")
        h.wheel(root.button, 40)
        h.equal(h.calls("nudgeVolume"), [[5], [-5], [5]], "to one notch")
        h.resetCalls()
        h.click(root.button, Qt.LeftButton)
        h.equal(root.widget.opened, true, "left click opens the panel")
        h.click(root.button, Qt.LeftButton)
        h.equal(root.widget.opened, false, "and closes it")
        h.equal(h.actions(), [], "without calling the service")

        // ---- A service of another version ----
        h.mock.version = "0.0.0"
      },
      function() {
        h.equal([root.widget.stale, root.widget.live], [true, false], "stale: noticed")
        var restart = "OmaJuke was updated. Restart the shell to finish updating"
        h.equal(root.look(), { active: false, dimmed: true, tooltip: restart },
          "stale: dimmed, with the restart notice as tooltip, although the mock says playing")
        h.click(root.button, Qt.MiddleButton)
        h.wheel(root.button, 120)
        h.wheel(root.button, -120)
        h.equal(h.mock.calls, [], "stale: middle click and wheel call nothing at all")
        h.click(root.button, Qt.LeftButton)
        h.equal(root.widget.opened, true, "stale: the panel still opens, to say so")
        root.widget.close()

        // ---- No service: a replacement bar, a load error ----
        h.mock.version = root.realVersion
        h.bar.service = null
      },
      function() {
        h.equal(root.widget.service, null, "no service: the widget sees none")
        var reason = "OmaJuke needs the built-in Omarchy bar"
        h.equal(root.look(), { active: false, dimmed: true, tooltip: reason },
          "no service: dimmed, with the reason as tooltip")
        h.click(root.button, Qt.MiddleButton)
        h.wheel(root.button, 120)
        h.equal(h.mock.calls, [], "no service: nothing is called")

        // ---- No bar yet: the host creates the widget bare ----
        root.widget.bar = null
      },
      function() {
        h.equal(root.widget.service, null, "no bar: no service")
        h.check(root.widget.implicitWidth > 0 && root.widget.implicitHeight > 0,
          "no bar: the slot keeps its size")
        h.equal(root.button.tooltipText, "OmaJuke needs the built-in Omarchy bar", "no bar: the same tooltip")
        root.widget.togglePanel()
        h.equal(root.widget.opened, true, "no bar: the panel still opens")
        root.widget.close()
        h.equal(h.richTexts(root.widget), [], "every text element is plain text")
        h.finish()
      }
    ])
  }
}
