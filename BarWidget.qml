import QtQuick
import qs.Commons
import qs.Ui
import "ui/Ui.js" as Ui

// The bar icon. A copy exists per monitor and is rebuilt whenever the bar
// is, so it keeps nothing: it shows the service's state (accent while
// something plays, dimmed while paused, the title as tooltip), turns clicks
// and the wheel into calls on the service, and owns the lazy loader of the
// panel together with the open/close members the bar and the shell route
// through.
//
// `bar`, `moduleName` and `settings` are declared by the kit BarWidget and
// injected by the host. The plugin's id is never written here: the service
// is looked up under the injected moduleName.
BarWidget {
  id: root

  // Test seam: the UI harness loads a stand-in, because the real panel is a
  // layer-shell window. Nothing else assigns it.
  property url panelSource: Qt.resolvedUrl("Panel.qml")
  // open() was called before the panel was loaded.
  property bool pendingOpen: false
  property real wheelAccumulator: 0

  // Null under a replacement bar, after a load error and while the plugin
  // is being disabled.
  readonly property var service: (bar && bar.shell && typeof bar.shell.serviceFor === "function")
    ? (bar.shell.serviceFor(root.moduleName) || null) : null
  // The plugin was updated and the shell not yet restarted: the kept
  // service is the old code. Nothing but its version is read then.
  readonly property bool stale: service !== null && service.version !== Ui.VERSION
  readonly property bool live: service !== null && !stale
  readonly property var icon: Ui.barIcon(live, live ? service.playbackState : "")

  // ---- Panel. Shape contract for the routing of shell.summon, hide and
  //      toggle: the bar looks for open, close and opened on the slot's item.

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  // Forwarded so this widget can stand in for the panel as the bar's popout
  // identity: the bar prefers closeForPopoutSwitch over close, and the panel
  // window reads popoutSwitchClosing back from its owner.
  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true : false

  function open() {
    if (panelLoader.item) {
      panelLoader.item.open()
      return
    }
    // Up to four copies of the widget exist; none loads a panel before it
    // is first opened.
    root.pendingOpen = true
    panelLoader.active = true
  }

  function close() {
    root.pendingOpen = false
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (root.opened) root.close()
    else root.open()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("moduleName" in target) target.moduleName = root.moduleName
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  onBarChanged: root.injectPanel()
  onModuleNameChanged: root.injectPanel()

  // The slot is as large as the icon. Without these two lines it is 0x0,
  // the icon is invisible and the bar cannot route to the panel.
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Loader {
    id: panelLoader
    active: false
    source: root.panelSource
    visible: false
    onLoaded: {
      root.injectPanel()
      // The host injects a second time one turn later; so does this.
      Qt.callLater(root.injectPanel)
      if (!root.pendingOpen) return
      root.pendingOpen = false
      panelLoader.item.open()
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: Ui.GLYPH.music
    // The kit's default active colour is the urgent one.
    activeColor: Color.accent
    active: root.icon.active
    dimmed: root.icon.dimmed
    // The bar shows no tooltip over an open panel.
    tooltipText: root.opened ? ""
      : (root.service === null ? Ui.TEXT.E_NO_SERVICE : (root.stale ? Ui.TEXT.E_STALE : root.service.tooltip))

    onPressed: function(pressedButton) {
      if (pressedButton === Qt.LeftButton) root.togglePanel()
      else if (pressedButton === Qt.MiddleButton && root.live) root.service.playPause()
    }
    onWheelMoved: function(delta) {
      var wheel = Util.wheelSteps(root.wheelAccumulator, delta)
      root.wheelAccumulator = wheel.remainder
      if (root.live && wheel.steps !== 0) root.service.nudgeVolume(wheel.steps * Ui.STEP.volume)
    }
  }
}
