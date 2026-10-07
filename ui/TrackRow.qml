import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// One track in a list: thumbnail, title, channel, the length or a LIVE mark,
// and at the right edge an optional small button for the one thing a list
// offers beside playing the row (add it to the queue, remove it from the
// queue). The row draws no hover state of its own: the page decides which
// row carries the cursor, from the keyboard and from the pointer alike, so
// there is one highlight on screen at a time.
CursorSurface {
  id: root

  // A track object of the service. Shown, never changed.
  property var track: null
  property string thumbPath: ""
  property color fg: Color.foreground
  property string fontFamily: Style.font.family
  property color urgent: Color.urgent
  // This is the track that is playing.
  property bool isCurrent: false
  // The glyph and the tooltip of the button at the right edge. Without a
  // glyph there is no button.
  property string actionIcon: ""
  property string actionTip: ""

  readonly property string title: track && typeof track.title === "string" ? track.title : ""
  readonly property string channel: track && typeof track.channel === "string" ? track.channel : ""
  readonly property bool live: track ? track.live === true : false
  readonly property string runtime: track && !live ? Ui.duration(track.duration) : ""

  signal activated()
  // The pointer moved over the row. Carries the mouse event, so the page can
  // tell a real movement from a row that slid under a resting pointer.
  signal pointerMoved(var mouse)
  signal thumbFailed()
  // The button at the right edge was clicked.
  signal actionClicked()

  implicitHeight: Style.space(46)
  current: root.isCurrent
  foreground: root.fg

  Thumb {
    id: thumb
    anchors.left: parent.left
    anchors.leftMargin: Style.space(6)
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(64)
    height: Style.space(36)
    path: root.thumbPath
    fg: root.fg
    onFailed: root.thumbFailed()
  }

  Column {
    anchors.left: thumb.right
    anchors.leftMargin: Style.space(8)
    anchors.right: trailing.left
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(1)

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.title
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: root.isCurrent
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: text !== ""
      text: root.channel
      color: Qt.darker(root.fg, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      elide: Text.ElideRight
    }
  }

  Item {
    id: trailing
    anchors.right: actionButton.visible ? actionButton.left : parent.right
    anchors.rightMargin: Style.space(6)
    anchors.verticalCenter: parent.verticalCenter
    width: root.live ? liveChip.width : runtimeText.implicitWidth
    height: root.live ? liveChip.height : runtimeText.implicitHeight

    Text {
      id: runtimeText
      textFormat: Text.PlainText
      visible: !root.live
      text: root.runtime
      color: Qt.darker(root.fg, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    BorderSurface {
      id: liveChip
      visible: root.live
      width: liveText.implicitWidth + Style.space(8)
      height: liveText.implicitHeight + Style.space(4)
      radius: Style.cornerRadius
      color: Style.normalFillFor(root.urgent, root.urgent)
      borderSpec: Border.flat(root.urgent, Style.normalBorderWidth)

      Text {
        id: liveText
        textFormat: Text.PlainText
        anchors.centerIn: parent
        text: Ui.TEXT.LIVE
        color: root.urgent
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }
  }

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onPositionChanged: function(mouse) { root.pointerMoved(mouse) }
    onClicked: root.activated()
  }

  // After the mouse area, so that it lies on top and a click on it is not
  // a click on the row.
  PanelActionButton {
    id: actionButton
    anchors.right: parent.right
    anchors.rightMargin: Style.space(6)
    anchors.verticalCenter: parent.verticalCenter
    visible: root.actionIcon !== ""
    iconText: root.actionIcon
    tooltipText: root.actionTip
    foreground: Qt.darker(root.fg, 1.5)
    hoverColor: root.fg
    fontFamily: root.fontFamily
    onClicked: root.actionClicked()
  }
}
