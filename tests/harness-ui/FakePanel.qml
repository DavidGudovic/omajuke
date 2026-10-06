import QtQuick

// Stand-in for Panel.qml in the UI harness. The real panel is a layer-shell
// window and cannot be created without a compositor; this item has the same
// shape as far as BarWidget.qml drives it: the open state, the calls that
// change it, and the properties the widget injects after loading. Calls are
// written into `calls`.
Item {
  id: root

  // Injected by the widget.
  property var bar: null
  property string moduleName: ""
  property var anchorItem: null
  property var hostWidget: null

  property bool opened: false
  // Stays set until the next open, so a case can read it after the call.
  property bool popoutSwitchClosing: false
  property var calls: []

  function open() {
    root.calls.push("open")
    root.popoutSwitchClosing = false
    root.opened = true
  }

  function close() {
    root.calls.push("close")
    root.opened = false
  }

  function closeForPopoutSwitch() {
    root.calls.push("closeForPopoutSwitch")
    root.popoutSwitchClosing = true
    root.opened = false
  }
}
