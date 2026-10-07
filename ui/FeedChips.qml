pragma ComponentBehavior: Bound

import QtQuick
import qs.Commons
import qs.Ui

// The chips above the main page's list while signed in: the home list and
// the lists of the account. The one that is shown is marked; a click picks
// another. The chips keep nothing and take no keyboard focus: the panel
// moves its one cursor onto the row and says here which chip carries it.
// They stay on one line. Where the panel is too narrow for all of them the
// line scrolls sideways (drag, a sideways swipe, or the wheel over it), and
// the chip with the cursor is always brought into view.
Item {
  id: root

  // Constant { value, label } entries (Ui.FEEDS); value "" is the home list.
  property var kinds: []
  // The value of the list that is shown.
  property string current: ""
  // Which chip carries the panel's cursor, -1 for none.
  property int cursorIndex: -1
  property color fg: Color.foreground
  property string fontFamily: Style.font.family

  // A chip was clicked; kind is that chip's value.
  signal picked(string kind)

  // Scrolls the line so that the chip at index is wholly in view.
  function reveal(index) {
    var chip = index >= 0 ? chipRepeater.itemAt(index) : null
    if (!chip) return
    var limit = Math.max(0, flick.contentWidth - flick.width)
    var x = flick.contentX
    if (chip.x < x) x = chip.x
    else if (chip.x + chip.width > x + flick.width) x = chip.x + chip.width - flick.width
    flick.contentX = Math.max(0, Math.min(limit, x))
  }

  implicitHeight: chipRow.implicitHeight

  onCursorIndexChanged: root.reveal(root.cursorIndex)
  // The marked chip is in view when the line first appears or another list
  // is picked from elsewhere.
  // A turn later: the chips are laid out by then.
  onCurrentChanged: Qt.callLater(root.revealMarked)
  onWidthChanged: Qt.callLater(root.revealMarked)
  Component.onCompleted: Qt.callLater(root.revealMarked)

  // The chip with the cursor, else the marked one.
  function revealMarked() {
    if (root.cursorIndex >= 0) {
      root.reveal(root.cursorIndex)
      return
    }
    for (var i = 0; i < root.kinds.length; i++) {
      if (root.kinds[i].value === root.current) root.reveal(i)
    }
  }

  Flickable {
    id: flick
    anchors.fill: parent
    contentWidth: chipRow.implicitWidth
    contentHeight: chipRow.implicitHeight
    flickableDirection: Flickable.HorizontalFlick
    boundsBehavior: Flickable.StopAtBounds
    interactive: contentWidth > width
    clip: true

    Row {
      id: chipRow
      spacing: Style.space(4)

      Repeater {
        id: chipRepeater
        model: root.kinds

        delegate: Button {
          id: chip
          required property var modelData
          required property int index

          text: chip.modelData.label
          bordered: true
          selected: chip.modelData.value === root.current
          hasCursor: root.cursorIndex === chip.index
          // Lettered in the accent colour under the cursor, like every framed
          // button of the panel.
          foreground: chip.hasCursor ? Color.accent : root.fg
          fontFamily: root.fontFamily
          fontSize: Style.font.bodySmall
          onClicked: root.picked(chip.modelData.value)
        }
      }
    }
  }

  // A plain mouse wheel only turns up and down. Over a line that scrolls
  // sideways it moves the line; over one that fits it is left to the page.
  WheelHandler {
    enabled: flick.contentWidth > flick.width
    acceptedDevices: PointerDevice.Mouse
    onWheel: function(event) {
      var delta = event.angleDelta.y !== 0 ? event.angleDelta.y : event.angleDelta.x
      var limit = Math.max(0, flick.contentWidth - flick.width)
      flick.contentX = Math.max(0, Math.min(limit, flick.contentX - delta / 2))
    }
  }
}
