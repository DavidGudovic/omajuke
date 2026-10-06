import QtQuick
import qs.Commons
import "Ui.js" as Ui

// One line that says what the list area is doing or why it is empty:
// "Searching...", "Nothing found", an error sentence. Dim and italic like
// the status lines of the first-party panels, in the error colour for an
// error, with a turning glyph in front while something is in progress.
Row {
  id: root

  property string text: ""
  property bool busy: false
  property bool isError: false
  property color fg: Color.foreground
  property color urgent: Color.urgent
  property string fontFamily: Style.font.family

  spacing: Style.space(6)

  Text {
    id: glyph
    textFormat: Text.PlainText
    visible: root.busy
    text: Ui.GLYPH.spinner
    color: Qt.darker(root.fg, 1.5)
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall

    // Costs a frame callback while it runs, so it stops with the line.
    RotationAnimator on rotation {
      running: root.busy && root.visible
      from: 0
      to: 360
      duration: 800
      loops: Animation.Infinite
    }
  }

  Text {
    textFormat: Text.PlainText
    width: root.width - (glyph.visible ? glyph.width + root.spacing : 0)
    text: root.text
    color: root.isError ? root.urgent : Qt.darker(root.fg, 1.5)
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
    font.italic: true
    wrapMode: Text.WordWrap
  }
}
