import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The strip at the bottom of the main page for the current track: what is
// playing, where it is, and the controls for it (seek, previous, play or
// pause, next, mute, volume). It shows the service's playback state and
// calls the service; it keeps no state of its own.
Column {
  id: root

  property var service: null
  // The PanelBody this strip sits in: theme values and the bar.
  property var body: null

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent
  readonly property var bar: body ? body.bar : null

  // Every read of the service is guarded: it can go away at any moment.
  readonly property var track: service ? service.currentTrack : null
  readonly property string trackId: track && typeof track.id === "string" ? track.id : ""
  readonly property string title: track && typeof track.title === "string" ? track.title : ""
  readonly property string channel: track && typeof track.channel === "string" ? track.channel : ""
  readonly property bool live: track ? track.live === true : false
  readonly property string playbackState: service ? service.playbackState : "idle"
  readonly property bool starting: playbackState === "resolving" || playbackState === "loading"
  readonly property bool busy: starting || playbackState === "buffering"
  readonly property bool sounding: service ? service.playing === true : false
  readonly property bool failed: playbackState === "error"
  readonly property real position: service ? service.position : 0
  readonly property real duration: service ? service.duration : 0
  readonly property bool seekable: service ? service.seekable === true : false
  readonly property int volume: service ? service.volume : 0
  readonly property bool muted: service ? service.muted === true : false
  // Whether the queue holds a track after this one.
  readonly property bool hasNext: service
    ? service.queueIndex >= 0 && service.queueIndex < service.queue.length - 1 : false
  // The second line: why nothing is heard yet, or else who made the track.
  readonly property string detail: failed && service ? String(service.errorText(service.errorCode) || "")
    : (starting ? Ui.TEXT.LOADING : channel)

  // Sub-pages opened from the strip (the queue, the outputs) are asked for
  // through this signal, as on every page.
  signal navigate(string page)

  // Only tracks the strip really shows are fetched.
  function requestThumb() {
    if (root.service && root.trackId !== "") root.service.wantThumbs([root.trackId])
  }

  onTrackIdChanged: root.requestThumb()
  Component.onCompleted: root.requestThumb()

  spacing: Style.space(10)

  PanelSeparator {
    foreground: root.fg
  }

  // ---- What is playing ----

  Item {
    width: parent.width
    height: thumb.height

    Thumb {
      id: thumb
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(64)
      height: Style.space(36)
      path: Ui.thumbPath(root.service ? root.service.thumbs : null, root.trackId)
      fg: root.fg
      onFailed: if (root.service && root.trackId !== "") root.service.reportThumbError(root.trackId)
    }

    Column {
      anchors.left: thumb.right
      anchors.leftMargin: Style.space(8)
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(2)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: text !== ""
        text: root.title
        color: root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: text !== ""
        text: root.detail
        color: root.failed ? root.urgent : Qt.darker(root.fg, 1.5)
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
      }
    }
  }

  // ---- Where it is ----

  Item {
    width: parent.width
    height: seek.implicitHeight

    Text {
      id: elapsed
      textFormat: Text.PlainText
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: Math.max(Style.space(40), implicitWidth)
      // While the knob is dragged the label follows the knob, not the track.
      text: Ui.duration(seek.dragging ? seek.liveValue : root.position)
      color: Qt.darker(root.fg, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    PanelSlider {
      id: seek
      anchors.left: elapsed.right
      anchors.leftMargin: Style.space(6)
      anchors.right: total.left
      anchors.rightMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
      bar: root.bar
      minimum: 0
      maximum: root.duration
      value: root.position
      // The kit's default step would make a wheel notch seek a twentieth of
      // a second.
      step: Ui.STEP.seek
      enabled: root.seekable
      opacity: enabled ? 1 : 0.4
      // Seek once, when the knob is let go: a seek per pointer movement
      // would restart the stream over and over.
      onReleased: function(value) { if (root.service) root.service.seekTo(value) }
    }

    Text {
      id: total
      textFormat: Text.PlainText
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: Math.max(Style.space(40), implicitWidth)
      horizontalAlignment: Text.AlignRight
      text: root.live ? Ui.TEXT.LIVE : (root.duration > 0 ? Ui.duration(root.duration) : "")
      color: Qt.darker(root.fg, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
  }

  // ---- Controls ----

  Item {
    width: parent.width
    height: transport.implicitHeight

    Row {
      id: transport
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(6)

      Button {
        iconText: Ui.GLYPH.previous
        iconSize: Style.font.iconLarge
        tooltipText: Ui.TEXT.PREVIOUS
        foreground: root.fg
        fontFamily: root.fontFamily
        enabled: root.seekable
        opacity: enabled ? 1 : 0.4
        onClicked: if (root.service) root.service.previous()
      }

      Button {
        // A turning glyph while the track is on its way; then what a click
        // would do next.
        iconText: root.busy ? Ui.GLYPH.spinner : (root.sounding ? Ui.GLYPH.pause : Ui.GLYPH.play)
        iconSpinning: root.busy
        iconSize: Style.font.iconLarge
        tooltipText: root.sounding ? Ui.TEXT.PAUSE : Ui.TEXT.PLAY
        foreground: root.fg
        fontFamily: root.fontFamily
        horizontalPadding: Style.spacing.panelGap
        onClicked: if (root.service) root.service.playPause()
      }

      Button {
        iconText: Ui.GLYPH.next
        iconSize: Style.font.iconLarge
        tooltipText: Ui.TEXT.NEXT
        foreground: root.fg
        fontFamily: root.fontFamily
        enabled: root.hasNext
        opacity: enabled ? 1 : 0.4
        onClicked: if (root.service) root.service.next()
      }
    }

    Row {
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(6)

      PanelActionButton {
        anchors.verticalCenter: parent.verticalCenter
        iconText: root.muted ? Ui.GLYPH.volumeMute : Ui.GLYPH.volumeHigh
        tooltipText: root.muted ? Ui.TEXT.UNMUTE : Ui.TEXT.MUTE
        foreground: root.fg
        fontFamily: root.fontFamily
        onClicked: if (root.service) root.service.toggleMute()
      }

      PanelSlider {
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(96)
        bar: root.bar
        minimum: 0
        maximum: 100
        step: Ui.STEP.volume
        integer: true
        value: root.volume
        opacity: root.muted ? 0.5 : 1
        onMoved: function(value) { if (root.service) root.service.setVolume(Math.round(value)) }
      }
    }
  }
}
