pragma ComponentBehavior: Bound

import QtQuick
import qs.Commons
import qs.Ui

// The chips above the main page's list while signed in: the home list and
// the lists of the account. The one that is shown is marked; a click picks
// another. The chips keep nothing and take no keyboard focus: the panel
// moves its one cursor onto the row and says here which chip carries it.
// They wrap onto a second line where one is too narrow for them.
Flow {
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

  spacing: Style.space(4)

  Repeater {
    model: root.kinds

    delegate: Button {
      id: chip
      required property var modelData
      required property int index

      text: chip.modelData.label
      bordered: true
      selected: chip.modelData.value === root.current
      hasCursor: root.cursorIndex === chip.index
      foreground: root.fg
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      onClicked: root.picked(chip.modelData.value)
    }
  }
}
