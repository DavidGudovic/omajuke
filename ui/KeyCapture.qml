import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The box that records a shortcut. While it has the keyboard it keeps
// every key to itself and reports the first real key press together with
// the modifiers held, for the page to turn into a shortcut. Esc on its own
// gives up, and so does anything that takes the keyboard away.
//
// The keys of a shortcut are mostly ones the compositor already listens
// for, so pressing them would trigger whatever they are bound to. While the
// box has the keyboard it therefore asks the compositor to hold its own
// shortcuts back, and it takes no key until the compositor has confirmed
// that: a key press before that moment may already have done something
// else, and recording it would only hide that.
Item {
  id: root

  // What the shortcut is for.
  property string label: ""
  // The key that was pressed last is not one a shortcut can use.
  property bool refused: false
  property color fg: Color.foreground
  property color urgent: Color.urgent
  property string fontFamily: Style.font.family
  // The compositor holds its shortcuts back for this box. Only the UI
  // harness, which has no compositor, ever assigns it.
  property bool armed: inhibitor.active === true

  readonly property string prompt: refused ? Ui.TEXT.CAPTURE_INVALID
    : (armed ? Ui.TEXT.CAPTURE_PROMPT : Ui.TEXT.CAPTURE_WAITING)

  // A key was pressed that may be a shortcut: Qt's key and modifiers.
  signal captured(int key, int modifiers)
  signal cancelled()

  implicitHeight: frame.implicitHeight

  // Before the box itself and before everything around it: no key pressed
  // while recording may also move a cursor, switch the panel or close it.
  Keys.priority: Keys.BeforeItem
  Keys.onPressed: function(event) {
    event.accepted = true
    var step = Ui.captureStep(event.key, event.modifiers, event.isAutoRepeat, root.armed)
    if (step === "cancel") root.cancelled()
    else if (step === "take") root.captured(event.key, event.modifiers)
  }
  Keys.onReleased: function(event) { event.accepted = true }

  // The keyboard went elsewhere while recording: keys now land there, so
  // the box must not go on looking as if it listened.
  onActiveFocusChanged: if (!root.activeFocus && root.visible) root.cancelled()

  ShortcutInhibitor {
    id: inhibitor
    window: root.QsWindow.window
    enabled: root.visible && root.activeFocus
  }

  BorderSurface {
    id: frame
    width: parent.width
    implicitHeight: column.implicitHeight + Style.space(16) + frame.borderTop + frame.borderBottom
    radius: Style.cornerRadius
    color: Style.controlFill(false, true, root.fg, Color.accent)
    borderSpec: Border.controlSpec("hover-cursor", root.fg, Color.accent)

    Column {
      id: column
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: frame.borderLeft + Style.spacing.rowPaddingX
      anchors.rightMargin: frame.borderRight + Style.spacing.rowPaddingX
      spacing: Style.space(8)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: text !== ""
        text: root.label
        color: root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: root.prompt
        color: root.refused ? root.urgent : root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        wrapMode: Text.WordWrap
      }

      // For the pointer. It takes no keyboard focus, so pressing it is not
      // the keyboard going elsewhere.
      Button {
        text: Ui.TEXT.CANCEL
        bordered: true
        foreground: root.fg
        fontFamily: root.fontFamily
        fontSize: Style.font.bodySmall
        onClicked: root.cancelled()
      }
    }
  }
}
