import QtQuick

// Stand-in for the bar facade a third-party widget is handed by the host:
// the colours, font and geometry the kit reads from it, the popout
// coordination, and `shell.serviceFor`, which answers with the object a
// case puts into `service` (the mock, another object, or null as under a
// replacement bar). Calls the view makes are written into `calls`.
QtObject {
  id: root

  // ---- What the kit and the widget read ----

  property color foreground: "#d8dee9"
  property color barForeground: "#d8dee9"
  property color background: "#2e3440"
  property color urgent: "#bf616a"
  property string fontFamily: "monospace"
  property string position: "top"
  property bool vertical: false
  property int barSize: 26
  property bool foregroundAnimationEnabled: true
  property var activePopout: null
  property var clickTargets: []

  // ---- What a case sets and reads ----

  // The id the host would inject into the widget as its moduleName. As with
  // the real facade, any other id gets no service.
  property string pluginId: "test.widget"
  property var service: null
  // { name, args } for every recorded call, in order.
  property var calls: []

  readonly property QtObject shell: QtObject {
    function serviceFor(id) {
      return id === root.pluginId ? root.service : null
    }
  }

  // The single-popout rule of the real bar (plugins/bar/Bar.qml): opening
  // one panel closes the one that was open.
  function requestPopout(owner) {
    if (root.activePopout === owner) return
    if (root.activePopout) {
      if ("closeForPopoutSwitch" in root.activePopout) root.activePopout.closeForPopoutSwitch()
      else if ("close" in root.activePopout) root.activePopout.close()
    }
    root.activePopout = owner
  }

  function releasePopout(owner) {
    if (root.activePopout === owner) root.activePopout = null
  }

  function switchPanelFrom(owner, direction) {
    root.calls.push({ name: "switchPanelFrom", args: [owner, direction] })
    return true
  }

  function showTooltip(target, text) {
    root.calls.push({ name: "showTooltip", args: [target, text] })
  }

  function hideTooltip(target) {
    root.calls.push({ name: "hideTooltip", args: [target] })
  }

  function registerClickTarget(target) {
    if (root.clickTargets.indexOf(target) === -1) root.clickTargets.push(target)
  }

  function unregisterClickTarget(target) {
    var at = root.clickTargets.indexOf(target)
    if (at !== -1) root.clickTargets.splice(at, 1)
  }
}
