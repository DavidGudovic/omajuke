import QtQuick
import qs.Commons
import qs.Ui

// A banner: one message and up to two small buttons under it. The panel
// uses it for the states in which nothing else can be shown (no service, an
// update that needs a shell restart, a missing tool, the proxy question)
// and the main page for notices the user dismisses. The message is never
// cut: it wraps as far as it needs.
BorderSurface {
  id: root

  property string text: ""
  // A button is shown for each label that is not empty.
  property string primaryLabel: ""
  property string secondaryLabel: ""
  property color fg: Color.foreground
  property string fontFamily: Style.font.family

  signal primary()
  signal secondary()

  implicitHeight: column.implicitHeight + Style.space(16) + root.borderTop + root.borderBottom
  radius: Style.cornerRadius
  color: Style.normalFillFor(root.fg, Color.accent)
  borderSpec: Border.controlSpec("normal", root.fg, Color.accent)

  Column {
    id: column
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: root.borderLeft + Style.space(10)
    anchors.rightMargin: root.borderRight + Style.space(10)
    spacing: Style.space(8)

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.text
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    Row {
      visible: root.primaryLabel !== "" || root.secondaryLabel !== ""
      spacing: Style.space(6)

      Button {
        visible: root.primaryLabel !== ""
        text: root.primaryLabel
        bordered: true
        foreground: root.fg
        fontFamily: root.fontFamily
        fontSize: Style.font.bodySmall
        onClicked: root.primary()
      }

      Button {
        visible: root.secondaryLabel !== ""
        text: root.secondaryLabel
        bordered: true
        foreground: root.fg
        fontFamily: root.fontFamily
        fontSize: Style.font.bodySmall
        onClicked: root.secondary()
      }
    }
  }
}
