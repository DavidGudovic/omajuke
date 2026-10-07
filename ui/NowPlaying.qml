import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The strip at the bottom of the main page for the current track: what is
// playing, where it is, and the controls for it (seek, previous, play or
// pause, next, mute, volume, the video window, and the ways to the outputs
// and the queue). It shows the service's playback state and calls the
// service; it keeps no state of its own. Its buttons take no keyboard
// focus: the panel moves its one cursor onto the strip and says here which
// button carries it. That one is framed like a row that has the cursor.
Column {
  id: root

  property var service: null
  // The PanelBody this strip sits in: theme values and the bar.
  property var body: null
  // Which button carries the panel's cursor, counted through Ui.CONTROLS,
  // -1 for none.
  property int cursorIndex: -1

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent
  readonly property var bar: body ? body.bar : null

  // Every read of the service is guarded: it can go away at any moment.
  readonly property var track: service ? service.currentTrack : null
  readonly property string trackId: track && typeof track.id === "string" ? track.id : ""
  // A track started from a link is known by its id alone until it is looked
  // up: until then the strip names the link, and calls nothing live.
  readonly property bool known: track && typeof track.title === "string" ? track.title !== "" : false
  readonly property string title: Ui.rowTitle(track)
  readonly property string channel: track && typeof track.channel === "string" ? track.channel : ""
  readonly property bool live: track ? root.known && track.live === true : false
  readonly property string playbackState: service ? service.playbackState : "idle"
  readonly property bool starting: playbackState === "resolving" || playbackState === "loading"
  readonly property bool busy: starting || playbackState === "buffering"
  readonly property bool sounding: service ? service.playing === true : false
  readonly property bool failed: playbackState === "error"
  // The track is in the player: it plays, is paused or waits for more of
  // itself. Only then is the player's position this track's. Before that,
  // and for a track that failed or was stopped, the strip shows the start:
  // what the player told last belongs to the track before, and Play begins
  // at the start whatever it was.
  readonly property bool loaded: playbackState === "playing" || playbackState === "paused"
    || playbackState === "buffering"
  readonly property real position: service && loaded ? service.position : 0
  readonly property real duration: service ? service.duration : 0
  readonly property bool seekable: service ? service.seekable === true : false
  readonly property int volume: service ? service.volume : 0
  readonly property bool muted: service ? service.muted === true : false
  // Whether the queue holds a track after this one, and one before it.
  readonly property bool hasNext: service
    ? service.queueIndex >= 0 && service.queueIndex < service.queue.length - 1 : false
  readonly property bool hasPrevious: service ? service.queueIndex > 0 : false
  // The video window: "hidden", "loading", "shown", or "unavailable" when
  // the track has no picture to show.
  readonly property string videoState: service ? String(service.videoState || "") : ""
  // Why there is no picture, in the service's words: the track has none,
  // or the window could not be asked for. The second comes with a window
  // that stays "hidden", and is said all the same.
  readonly property string videoNote: service ? String(service.videoNote || "") : ""
  readonly property string videoNoteText: service && videoNote !== ""
    ? String(service.errorText(videoNote) || "") : ""
  readonly property var videoLook: Ui.videoButton(videoState, videoNoteText !== "")
  readonly property string videoTip: videoLook.tip === "hide" ? Ui.TEXT.VIDEO_HIDE
    : (videoLook.tip === "loading" ? Ui.TEXT.VIDEO_LOADING
      : (videoLook.tip === "note" && videoNoteText !== "" ? videoNoteText : Ui.TEXT.VIDEO_SHOW))
  // The chosen audio output is gone and the system default plays instead.
  readonly property bool outputLost: service ? String(service.outputNote || "") !== "" : false
  // The second line: why nothing is heard or seen yet, that a sponsor
  // segment was just skipped, or else who made the track.
  // A sponsor segment was skipped a moment ago.
  readonly property bool skipped: Ui.recentSkip(service ? service.lastSkip : null, position)
  readonly property string line: Ui.stripLine(playbackState, videoState, skipped, videoNoteText !== "")
  readonly property string detail: {
    if (root.line === "error") {
      return root.service ? String(root.service.errorText(root.service.errorCode) || "") : ""
    }
    if (root.line === "loading") return Ui.TEXT.LOADING
    if (root.line === "video") return Ui.TEXT.VIDEO_LOADING
    if (root.line === "novideo" && root.videoNoteText !== "") return root.videoNoteText
    if (root.line === "skip") return Ui.TEXT.SKIPPED
    return root.channel
  }

  // Which of the buttons can be pressed now, in the order of Ui.CONTROLS.
  readonly property var usable: [seekable || hasPrevious, true, hasNext, true, true, true, true]

  // Sub-pages opened from the strip (the queue, the outputs) are asked for
  // through this signal, as on every page.
  signal navigate(string page)

  // Presses a button by its name in Ui.CONTROLS, for a click on it and for
  // Enter while it carries the cursor alike. A button that cannot be
  // pressed now does nothing.
  function press(name) {
    var at = Ui.CONTROLS.indexOf(name)
    if (at === -1 || root.usable[at] !== true) return
    if (name === "outputs" || name === "queue") {
      root.navigate(name)
      return
    }
    if (!root.service) return
    if (name === "previous") root.service.previous()
    else if (name === "playPause") root.service.playPause()
    else if (name === "next") root.service.next()
    else if (name === "mute") root.service.toggleMute()
    else if (name === "video") root.service.toggleVideo()
  }

  function _carries(name) {
    return root.cursorIndex === Ui.CONTROLS.indexOf(name)
  }

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
    height: Math.max(thumb.height, labels.implicitHeight)

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
      id: labels
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
        // Why a track failed is a sentence, and it is read to its end: it
        // may take a second line. A channel name is cut at the first.
        wrapMode: Text.WordWrap
        maximumLineCount: root.line === "channel" ? 1 : 2
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
        // Back to the start of this track, or to the track before it.
        enabled: root.seekable || root.hasPrevious
        opacity: enabled ? 1 : 0.4
        hasCursor: root._carries("previous")
        onClicked: root.press("previous")
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
        hasCursor: root._carries("playPause")
        onClicked: root.press("playPause")
      }

      Button {
        iconText: Ui.GLYPH.next
        iconSize: Style.font.iconLarge
        tooltipText: Ui.TEXT.NEXT
        foreground: root.fg
        fontFamily: root.fontFamily
        enabled: root.hasNext
        opacity: enabled ? 1 : 0.4
        hasCursor: root._carries("next")
        onClicked: root.press("next")
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
        hasCursor: root._carries("mute")
        bordered: root._carries("mute")
        onClicked: root.press("mute")
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

      // Lit while the video window is open. A click asks for the window or
      // takes the wish back, whatever state it is in.
      PanelActionButton {
        anchors.verticalCenter: parent.verticalCenter
        iconText: root.videoLook.icon
        tooltipText: root.videoTip
        foreground: root.videoLook.lit ? Color.accent : root.fg
        hoverColor: foreground
        fontFamily: root.fontFamily
        hasCursor: root._carries("video")
        bordered: root._carries("video")
        onClicked: root.press("video")
      }

      PanelActionButton {
        anchors.verticalCenter: parent.verticalCenter
        iconText: Ui.GLYPH.speaker
        tooltipText: Ui.TEXT.OUTPUTS_TITLE
        foreground: root.outputLost ? root.urgent : root.fg
        hoverColor: foreground
        fontFamily: root.fontFamily
        hasCursor: root._carries("outputs")
        bordered: root._carries("outputs")
        onClicked: root.press("outputs")
      }

      PanelActionButton {
        anchors.verticalCenter: parent.verticalCenter
        iconText: Ui.GLYPH.queue
        tooltipText: Ui.TEXT.QUEUE_TITLE
        foreground: root.fg
        fontFamily: root.fontFamily
        hasCursor: root._carries("queue")
        bordered: root._carries("queue")
        onClicked: root.press("queue")
      }
    }
  }
}
