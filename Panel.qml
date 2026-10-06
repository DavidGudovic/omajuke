import QtQuick
import qs.Commons
import qs.Ui
import "ui"

// The dropdown under the bar icon, as a window: a kit Panel (the open state)
// holding a kit KeyboardPanel (the layer-shell surface, its position, the
// keyboard focus on open) with one PanelBody in it. Nothing else lives
// here. Everything the panel shows and every key it handles is in
// ui/PanelBody.qml, which needs no window and can therefore be tested.
//
// BarWidget.qml loads this file on the first open and assigns `bar`,
// `moduleName` (both declared by the kit Panel), `anchorItem` and
// `hostWidget`.
Panel {
  id: root

  // The one IpcHandler of the plugin is the service's. A panel exists per
  // monitor, so a handler here would register the same target several times.
  manageIpc: false

  // The bar icon the card is placed under.
  property var anchorItem: null
  // The bar tracks the widget mounted in its slot, not this nested panel:
  // the open-panel mark and the Tab cycle both look the slot up by that
  // widget.
  property var hostWidget: null

  readonly property var barIdentity: hostWidget || root
  // Null under a replacement bar, after a load error and while the plugin
  // is being disabled; PanelBody shows a message for each case.
  readonly property var service: (bar && bar.shell && typeof bar.shell.serviceFor === "function")
    ? (bar.shell.serviceFor(root.moduleName) || null) : null

  function open() { root.controller.show() }
  function close() { root.controller.hide() }

  // The kit's version passes this panel; the bar then finds no slot and Tab
  // does nothing.
  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function") {
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    }
    return false
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    // The kit makes exactly one focus request when the panel opens, for the
    // item named here at that moment: the search field once the page exists.
    focusTarget: body.focusItem
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(body.implicitHeight, Style.space(640))

    PanelBody {
      id: body
      anchors.fill: parent
      bar: root.bar
      service: root.service
      opened: root.opened
      // The window stays mapped while the card fades out.
      showing: root.opened || panel.visible
      onCloseRequested: root.close()
      onSwitchRequested: function(direction) { root.switchPanel(direction) }
    }
  }
}
