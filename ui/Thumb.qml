import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The thumbnail box of a row and of the now-playing strip. It shows a local
// file the service fetched into its private folder, or a music glyph while
// there is none. This is the only image in the plugin, and its source is
// never anything but a file path: no network address reaches it.
BorderSurface {
  id: root

  // Absolute path of the image file, "" while there is none.
  property string path: ""
  property color fg: Color.foreground

  // The file could not be shown. Reported once per path; the glyph stays.
  property bool broken: false

  signal failed()

  onPathChanged: root.broken = false

  implicitWidth: Style.space(64)
  implicitHeight: Style.space(36)
  radius: Style.cornerRadius
  color: Style.normalFillFor(root.fg, Color.accent)
  borderSpec: Border.controlSpec("normal", root.fg, Color.accent)
  clip: true

  Text {
    textFormat: Text.PlainText
    anchors.centerIn: parent
    visible: image.status !== Image.Ready || root.broken
    text: Ui.GLYPH.music
    color: Qt.darker(root.fg, 1.5)
    font.family: Style.font.family
    font.pixelSize: Style.font.iconLarge
  }

  Image {
    id: image
    anchors.fill: parent
    anchors.margins: root.borderLeft
    visible: status === Image.Ready && !root.broken
    source: Util.fileUrl(root.path)
    asynchronous: true
    cache: true
    fillMode: Image.PreserveAspectCrop
    // Twice the box, in physical pixels: sharp on a dense screen, and the
    // decoded size stays bounded whatever the file holds.
    sourceSize.width: 128 * Screen.devicePixelRatio
    sourceSize.height: 72 * Screen.devicePixelRatio
    onStatusChanged: {
      if (status !== Image.Error || root.broken) return
      root.broken = true
      root.failed()
    }
  }
}
