import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The settings page: one switch per setting that does something in this
// version, Clear history, and a line about the plugin. It keeps no values:
// each switch shows what the service reports and asks the service to change
// it, and the service decides what is allowed.
Item {
  id: root

  property var service: null
  // The PanelBody this page sits in: theme values, the row cursor, the
  // confirmation and the scroll area.
  property var body: null

  // No text field here: the panel's key router keeps the keyboard.
  readonly property Item focusItem: null

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family

  // Every read of the service is guarded: it can go away at any moment.
  readonly property var settings: service ? service.settings : null
  readonly property bool rememberHistory: settings ? settings.rememberHistory === true : false
  readonly property bool evenVolume: settings ? settings.evenVolume === true : false
  readonly property string version: service ? String(service.version) : ""
  readonly property bool mprisMissing: service ? service.mprisAvailable === false : false

  // The rows the cursor visits, top to bottom. A new row is one more name
  // here and one more element below.
  readonly property var rowOrder: ["rememberHistory", "evenVolume", "clearHistory"]
  readonly property int rowCount: rowOrder.length
  readonly property bool cursorOnRow: body
    ? body.cursorActive && body.selectedIndex >= 0 && body.selectedIndex < rowCount : false
  readonly property string cursorRow: cursorOnRow ? rowOrder[body.selectedIndex] : ""
  readonly property string rowKind: cursorRow !== "" ? "setting" : ""

  signal navigate(string page)

  // ---- Keys ----

  function keyContext() {
    return {
      hasText: false, matches: false, searching: false, rowCount: root.rowCount, rowKind: root.rowKind
    }
  }

  // No key is special to this page: everything goes through Ui.keyAction.
  function handleKey(event, typing) {
    return false
  }

  function act(action, text) {
    if (action === "activate") root.activate(root.cursorRow)
  }

  function activate(name) {
    if (!root.service) return
    if (name === "rememberHistory") root.service.setSetting("rememberHistory", !root.rememberHistory)
    else if (name === "evenVolume") root.service.setSetting("evenVolume", !root.evenVolume)
    else if (name === "clearHistory") root.askClear()
  }

  // Clearing cannot be undone, so the user is asked first.
  function askClear() {
    if (!root.body) return
    root.body.confirm(Ui.TEXT.CLEAR_HISTORY_ASK, Ui.TEXT.CLEAR, function() {
      if (root.service) root.service.clearHistory()
    })
  }

  // The pointer moves the same cursor the keyboard does, but only when it
  // really moves: a row that slides under a resting pointer, as the first
  // one does when the page appears, must not take the highlight.
  function pointerOver(name, item, position) {
    if (root.body) root.body.pointAt(root.rowOrder.indexOf(name), item, position)
  }

  implicitHeight: column.implicitHeight

  Column {
    id: column
    width: parent.width
    spacing: Style.space(10)

    Toggle {
      id: rememberRow
      width: parent.width
      label: Ui.TEXT.REMEMBER_HISTORY
      description: Ui.TEXT.REMEMBER_HISTORY_HINT
      checked: root.rememberHistory
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "rememberHistory"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(rememberRow)
      onClicked: root.activate("rememberHistory")

      HoverHandler {
        onPointChanged: root.pointerOver("rememberHistory", rememberRow, point.position)
      }
    }

    Toggle {
      id: evenRow
      width: parent.width
      label: Ui.TEXT.EVEN_VOLUME
      description: Ui.TEXT.EVEN_VOLUME_HINT
      checked: root.evenVolume
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "evenVolume"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(evenRow)
      onClicked: root.activate("evenVolume")

      HoverHandler {
        onPointChanged: root.pointerOver("evenVolume", evenRow, point.position)
      }
    }

    Button {
      id: clearRow
      text: Ui.TEXT.CLEAR_HISTORY
      bordered: true
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "clearHistory"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(clearRow)
      onClicked: root.activate("clearHistory")

      HoverHandler {
        onPointChanged: root.pointerOver("clearHistory", clearRow, point.position)
      }
    }

    PanelSeparator {
      foreground: root.fg
    }

    // ---- About ----

    Column {
      width: parent.width
      spacing: Style.space(2)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: Ui.TEXT.APP + " " + root.version
        color: Qt.darker(root.fg, 1.5)
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: root.mprisMissing
        text: Ui.TEXT.NO_MPRIS
        color: Qt.darker(root.fg, 1.5)
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        wrapMode: Text.WordWrap
      }
    }
  }
}
