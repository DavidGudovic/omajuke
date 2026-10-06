import QtQuick

// After a plugin update the files on disk are new while the kept service is
// the old code, and a new view may expect members the old service lacks.
// The view therefore reads nothing but `version` from a service of another
// version and shows only the restart notice.
//
// The service here is a plain object with another version and a getter for
// every other member name of the service surface. Each getter writes its
// name down: at the end the list must be empty, whatever was opened, typed,
// clicked or scrolled.
QtObject {
  id: root

  property var body: null
  property var widget: null
  property var touched: []
  property var closes: []

  readonly property string notice: "OmaJuke was updated. Restart the shell to finish updating"

  function isPage(item) { return typeof item.keyContext === "function" }
  function isNotice(item) { return item.primaryLabel !== undefined && item.visible }
  function isBarButton(item) { return typeof item.triggerPress === "function" }

  // The member names of the service surface, taken from the mock (which the
  // repo test keeps equal to Service.qml).
  function surface(h) {
    var names = []
    for (var name in h.mock) {
      if (name === "version" || name === "objectName" || name === "calls" || name === "returns") continue
      if (name.charAt(0) === "_" || /Changed$/.test(name)) continue
      names.push(name)
    }
    return names
  }

  function oldService(h) {
    var service = { version: "0.0.0" }
    root.surface(h).forEach(function(name) {
      Object.defineProperty(service, name, {
        enumerable: true,
        get: function() {
          root.touched.push(name)
          return undefined
        }
      })
    })
    return service
  }

  function run(h) {
    var names = root.surface(h)
    h.check(names.length > 40, "the surface was read from the mock")
    h.check(names.indexOf("playPause") !== -1 && names.indexOf("notePanelOpen") !== -1
      && names.indexOf("fatalCode") !== -1 && names.indexOf("tooltip") !== -1,
        "functions and properties alike")
    var stale = root.oldService(h)
    // The trap itself works: reading a member is noticed.
    var probe = stale.ready
    h.equal(root.touched, ["ready"], "a read of the old service is recorded")
    root.touched = []

    // Assigned after creation: initial properties are copied member by
    // member on their way into a new object, which would itself read them.
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: null, width: 420, height: 640 })
    root.widget = h.mount("BarWidget.qml", {
      bar: h.bar, moduleName: h.bar.pluginId, y: 660,
      panelSource: "file://" + h.repo + "/tests/harness-ui/FakePanel.qml"
    })
    if (!root.body || !root.widget) {
      h.finish()
      return
    }
    root.body.service = stale
    h.bar.service = stale
    root.body.closeRequested.connect(function() { root.closes.push("close") })

    h.steps([
      function() {
        h.equal(root.body.stale, true, "the body knows the service is of another version")
        h.equal(root.widget.stale, true, "and so does the widget")
        h.equal(root.widget.live, false, "which does not treat it as usable")
        h.open(root.body)
      },
      function() {
        h.equal(h.texts(root.body), [root.notice], "open: only the restart notice is shown")
        h.equal(h.findAll(root.body, root.isNotice).length, 1, "open: in exactly one notice")
        h.check(h.find(root.body, root.isPage) === null, "open: no page is loaded")
        h.equal(h.richTexts(root.body), [], "open: as plain text")
        // Every kind of key the main page would act on.
        h.key(Qt.Key_Space)
        h.key(Qt.Key_Return)
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Slash)
        h.key(Qt.Key_A)
        h.key(Qt.Key_Backspace)
        h.key(Qt.Key_Tab)
        h.key(Qt.Key_Escape)
        h.equal(root.closes, ["close"], "Esc still closes the panel")
      },
      function() {
        h.equal(h.texts(root.body), [root.notice], "keys change nothing")
        h.close(root.body)
        h.hide(root.body)
        h.open(root.body)
      },
      function() {
        var button = h.find(root.widget, root.isBarButton)
        h.check(button !== null, "the widget has its icon")
        h.equal(button.tooltipText, root.notice, "widget: the tooltip is the restart notice")
        h.equal([button.active, button.dimmed], [false, true], "widget: the icon is dimmed, not accented")
        h.click(button, Qt.MiddleButton)
        h.wheel(button, 120)
        h.wheel(button, -120)
        h.wheel(button, -120)
        h.click(button, Qt.RightButton)
        // The panel itself still opens and closes: it only says "restart".
        h.click(button, Qt.LeftButton)
        h.equal(root.widget.opened, true, "widget: a left click still opens the panel")
        h.equal(button.tooltipText, "", "widget: no tooltip over the open panel")
        h.click(button, Qt.LeftButton)
        h.equal(root.widget.opened, false, "widget: and closes it")
      },
      function() {
        h.unmount(root.body)
        h.unmount(root.widget)
      },
      function() {
        h.equal(root.touched, [], "nothing but the version was ever read from the old service")
        h.equal(h.mock.calls, [], "and the mock, which was not handed over, was not called")
        h.finish()
      }
    ])
  }
}
