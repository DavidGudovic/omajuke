import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The header of a sub-page: a back button and the page's title. The panel
// puts it above every page but the main one.
Item {
  id: root

  property string title: ""
  property color fg: Color.foreground
  property string fontFamily: Style.font.family

  signal back()

  implicitHeight: Math.max(backButton.implicitHeight, label.implicitHeight)

  PanelActionButton {
    id: backButton
    anchors.left: parent.left
    anchors.verticalCenter: parent.verticalCenter
    iconText: Ui.GLYPH.chevronLeft
    tooltipText: Ui.TEXT.BACK
    foreground: root.fg
    fontFamily: root.fontFamily
    onClicked: root.back()
  }

  Text {
    id: label
    textFormat: Text.PlainText
    anchors.left: backButton.right
    anchors.leftMargin: Style.space(8)
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    text: root.title
    color: root.fg
    font.family: root.fontFamily
    font.pixelSize: Style.font.title
    font.bold: true
    elide: Text.ElideRight
  }
}
