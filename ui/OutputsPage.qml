pragma ComponentBehavior: Bound

import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The outputs page: where this player's sound goes. One row per audio
// output the service reports, the one in use marked; Enter or a click
// picks another. Only this player's stream moves; the system's own default
// is not touched. The list exists while something is playing: without one
// the page says so and names the saved choice. A device names itself, so
// its label is outside text and is shown as plain text like a title.
Item {
  id: root

  property var service: null
  // The PanelBody this page sits in: theme values, the row cursor and the
  // scroll area.
  property var body: null

  // No text field here: the panel's key router keeps the keyboard.
  readonly property Item focusItem: null

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent

  // Every read of the service is guarded: it can go away at any moment.
  readonly property var rows: Ui.outputRows(service ? service.outputs : null)
  readonly property string saved: Ui.outputChoice(service ? service.outputName : "")
  // The chosen output is gone and the system default plays instead.
  readonly property string note: service ? String(service.outputNote || "") : ""
  readonly property string noteText: service && note !== "" ? String(service.errorText(note) || "") : ""

  readonly property int rowCount: rows.length
  readonly property bool cursorOnRow: body
    ? body.cursorActive && body.selectedIndex >= 0 && body.selectedIndex < rowCount : false
  readonly property string rowKind: cursorOnRow ? "output" : ""

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
    if (action === "activate" && root.cursorOnRow) root.choose(root.body.selectedIndex)
  }

  // The service checks the name against its own list before it switches.
  function choose(index) {
    if (!root.service || index < 0 || index >= root.rows.length) return
    root.service.setOutput(root.rows[index].name)
  }

  // Rows that are replaced under a resting pointer (a device was plugged
  // in) must not move the highlight.
  onRowsChanged: if (root.body) root.body.disarmPointer()

  implicitHeight: column.implicitHeight

  Column {
    id: column
    width: parent.width
    spacing: Style.space(10)

    StatusLine {
      width: parent.width
      visible: root.noteText !== ""
      text: root.noteText
      isError: true
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
    }

    // ---- Nothing is playing ----

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.rows.length === 0
      text: Ui.TEXT.OUTPUT_SAVED + ": " + root.saved
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      elide: Text.ElideMiddle
    }

    StatusLine {
      width: parent.width
      visible: root.rows.length === 0
      text: Ui.TEXT.OUTPUTS_IDLE
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
    }

    // ---- The outputs ----

    Column {
      width: parent.width
      visible: root.rows.length > 0
      spacing: Style.space(2)

      Repeater {
        model: root.rows

        delegate: CursorSurface {
          id: row
          required property var modelData
          required property int index

          width: parent ? parent.width : 0
          implicitHeight: Style.space(34)
          foreground: root.fg
          hasCursor: root.cursorOnRow && root.body.selectedIndex === row.index
          current: row.modelData.current
          onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(row)

          Text {
            textFormat: Text.PlainText
            anchors.left: parent.left
            anchors.leftMargin: Style.space(10)
            anchors.right: mark.left
            anchors.rightMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            text: row.modelData.label
            color: root.fg
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            font.bold: row.modelData.current
            elide: Text.ElideRight
          }

          Text {
            id: mark
            textFormat: Text.PlainText
            anchors.right: parent.right
            anchors.rightMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            visible: row.modelData.current
            text: Ui.GLYPH.check
            color: root.fg
            font.family: root.fontFamily
            font.pixelSize: Style.font.icon
          }

          MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onPositionChanged: function(mouse) { if (root.body) root.body.pointAt(row.index, row, mouse) }
            onClicked: {
              if (root.body) root.body.setCursor(row.index)
              root.choose(row.index)
            }
          }
        }
      }
    }
  }
}
