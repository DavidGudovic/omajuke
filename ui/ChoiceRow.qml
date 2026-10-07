import QtQuick
import qs.Commons
import qs.Ui

// A settings row for a value that is one of a few: a title, a line about
// it, and one chip per value with the current one marked. It looks like the
// kit's switch row and, like it, keeps no value: it shows the one it is
// given and reports the chip that was clicked. The chips take no keyboard
// focus; the page's cursor stands on the row as a whole and the page steps
// through the values.
BorderSurface {
  id: root

  property string label: ""
  property string description: ""
  // Constant { value, label, icon, tooltip } entries (Ui.CHOICES).
  property var options: []
  property string value: ""
  property bool hasCursor: false
  property color fg: Color.foreground
  property string fontFamily: Style.font.family

  // A chip was clicked; value is that chip's.
  signal picked(string value)

  implicitHeight: content.implicitHeight + Style.spacing.huge
  radius: Style.cornerRadius
  color: Style.controlFill(false, root.hasCursor, root.fg, Color.accent)
  borderSpec: Border.controlSpec(root.hasCursor ? "hover-cursor" : "normal", root.fg, Color.accent)

  Column {
    id: content
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: root.borderLeft + Style.spacing.rowPaddingX
    anchors.rightMargin: root.borderRight + Style.spacing.rowPaddingX
    spacing: Style.spacing.xs

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.label
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
      font.bold: true
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.description !== ""
      text: root.description
      color: Qt.darker(root.fg, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      wrapMode: Text.WordWrap
    }

    // Room between the words and the chips.
    Item {
      width: parent.width
      height: Style.space(2)
    }

    ButtonGroup {
      options: root.options
      value: root.value
      focusable: false
      foreground: root.fg
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      onChanged: function(value) { root.picked(value) }
    }
  }
}
