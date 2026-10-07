pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The queue page: every track of the queue in its order, the playing one
// marked. Enter plays a row, x or Delete removes it, Shift with an arrow
// carries it up or down, and the button under the list empties the queue.
// The queue is the service's: this page shows it, asks for each change by
// the key of the row, and keeps only which row the cursor should follow
// while the service puts it in its new place.
Item {
  id: root

  property var service: null
  // The PanelBody this page sits in: theme values, the row cursor, the
  // confirmation and the scroll area.
  property var body: null
  // The key of the row that is being carried, 0 for none. When the queue
  // comes back in its new order the cursor goes to where that row is now.
  property int followKey: 0

  // No text field here: the panel's key router keeps the keyboard.
  readonly property Item focusItem: null

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent

  // Every read of the service is guarded: it can go away at any moment.
  readonly property var rows: Ui.rows("queue", null, service ? service.queue : null, -1, null)
  readonly property var thumbs: service ? service.thumbs : null
  readonly property var currentTrack: service ? service.currentTrack : null
  // The playing track is marked by its key, not its video: the same video
  // may stand in the queue twice.
  readonly property int currentKey: currentTrack && typeof currentTrack.key === "number"
    ? currentTrack.key : 0

  // The cursor visits the rows and then, when there is anything to clear,
  // the Clear button.
  readonly property int rowCount: rows.length > 0 ? rows.length + 1 : 0
  readonly property bool cursorOn: body
    ? body.cursorActive && body.selectedIndex >= 0 && body.selectedIndex < rowCount : false
  readonly property bool cursorOnRow: cursorOn && body.selectedIndex < rows.length
  readonly property bool cursorOnClear: cursorOn && body.selectedIndex === rows.length
  readonly property string rowKind: cursorOnRow ? "queue" : (cursorOnClear ? "clear" : "")

  signal navigate(string page)

  // ---- Keys ----

  function keyContext() {
    return {
      hasText: false, matches: false, searching: false, rowCount: root.rowCount, rowKind: root.rowKind
    }
  }

  // No key is special to this page: everything goes through Ui.keyAction.
  function handleKey(event, typing) {
    return false
  }

  function act(action, text) {
    var index = root.cursorOnRow ? root.body.selectedIndex : -1
    if (action === "activate") {
      if (root.cursorOnClear) root.askClear()
      else root.playRow(index)
    } else if (action === "remove") {
      root.removeRow(index)
    } else if (action === "moveUp") {
      root.moveRow(index, -1)
    } else if (action === "moveDown") {
      root.moveRow(index, 1)
    }
  }

  // ---- What a row can do ----

  function playRow(index) {
    if (!root.service || index < 0 || index >= root.rows.length) return
    root.service.queuePlay(root.rows[index].key)
  }

  // The cursor stays where it is, so it stands on the row that moved up
  // into the gap and x can be pressed again.
  function removeRow(index) {
    if (!root.service || index < 0 || index >= root.rows.length) return
    root.service.queueRemove(root.rows[index].key)
  }

  function moveRow(index, delta) {
    if (!root.service || index < 0 || index >= root.rows.length) return
    var key = root.rows[index].key
    // Set before the call: the service may hand out the new order before
    // it returns.
    root.followKey = key
    if (root.service.queueMove(key, delta) !== true) root.followKey = 0
  }

  // Emptying the queue cannot be undone, so the user is asked first.
  function askClear() {
    if (!root.body) return
    root.body.confirm(Ui.TEXT.QUEUE_CLEAR_ASK, Ui.TEXT.CLEAR, function() {
      if (root.service) root.service.queueClear()
    })
  }

  // The list keeps its highlighted row in view by itself; this brings the
  // list as a whole back when the page was scrolled away from it.
  function highlightMoved() {
    if (root.body && root.cursorOnRow) root.body.ensureVisible(list)
  }

  onRowsChanged: {
    // Rows that slide under a resting pointer must not move the highlight.
    if (root.body) root.body.disarmPointer()
    if (root.followKey === 0) return
    var at = Ui.indexOfKey(root.rows, root.followKey)
    root.followKey = 0
    if (at !== -1 && root.body) root.body.setCursor(at)
  }

  // The page opens on the track that is playing: the first arrow key shows
  // the cursor there, not at the top of a queue that may be long.
  Component.onCompleted: {
    var at = Ui.indexOfKey(root.rows, root.currentKey)
    if (at <= 0) return
    if (root.body && !root.body.cursorActive) root.body.selectedIndex = at
    Qt.callLater(list.showPlaying)
  }

  implicitHeight: column.implicitHeight

  Connections {
    target: root.body
    ignoreUnknownSignals: true
    function onSelectedIndexChanged() { root.highlightMoved() }
    function onCursorActiveChanged() { root.highlightMoved() }
    // The user put the cursor somewhere else: nothing is followed any more.
    function onCursorSteered() { root.followKey = 0 }
  }

  Column {
    id: column
    width: parent.width
    spacing: Style.space(10)

    StatusLine {
      width: parent.width
      visible: root.rows.length === 0
      text: Ui.TEXT.QUEUE_EMPTY
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
    }

    // A ListView rather than rows in a column: the queue can hold a couple
    // of hundred tracks, and only the rows in view are created and ask for
    // their thumbnails.
    ListView {
      id: list
      width: parent.width
      // Up to eight rows.
      height: Math.min(contentHeight, Style.space(382))
      visible: root.rows.length > 0
      spacing: Style.space(2)
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      interactive: contentHeight > height
      model: root.rows
      currentIndex: root.cursorOnRow ? root.body.selectedIndex : -1

      // Deferred by a turn: a change of the queue replaces the model, and
      // positioning straight out of the signal is lost when the view resets.
      onCurrentIndexChanged: if (currentIndex >= 0) Qt.callLater(keepCurrentVisible)
      function keepCurrentVisible() {
        if (currentIndex >= 0) positionViewAtIndex(currentIndex, ListView.Contain)
      }
      function showPlaying() {
        var at = Ui.indexOfKey(root.rows, root.currentKey)
        if (at > 0) positionViewAtIndex(at, ListView.Contain)
      }

      ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

      delegate: TrackRow {
        id: row
        required property var modelData
        required property int index

        width: ListView.view ? ListView.view.width : 0
        track: row.modelData.track
        thumbPath: Ui.thumbPath(root.thumbs, row.modelData.track.id)
        fg: root.fg
        fontFamily: root.fontFamily
        urgent: root.urgent
        hasCursor: root.cursorOnRow && root.body.selectedIndex === row.index
        isCurrent: root.currentKey !== 0 && row.modelData.key === root.currentKey
        actionIcon: Ui.GLYPH.close
        actionTip: Ui.TEXT.QUEUE_REMOVE

        onActivated: {
          if (root.body) root.body.setCursor(row.index)
          root.playRow(row.index)
        }
        onActionClicked: root.removeRow(row.index)
        onPointerMoved: function(mouse) { if (root.body) root.body.pointAt(row.index, row, mouse) }
        onThumbFailed: if (root.service) root.service.reportThumbError(row.modelData.track.id)
        // Only rows the list really created ask for their thumbnail.
        Component.onCompleted: if (root.service) root.service.wantThumbs([row.modelData.track.id])
      }
    }

    Button {
      id: clearRow
      visible: root.rows.length > 0
      text: Ui.TEXT.QUEUE_CLEAR
      bordered: true
      // Lettered in the accent colour under the cursor, like every framed
      // button of the panel.
      foreground: root.cursorOnClear ? Color.accent : root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorOnClear
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(clearRow)
      onClicked: root.askClear()

      HoverHandler {
        onPointChanged: if (root.body) root.body.pointAt(root.rows.length, clearRow, point.position)
      }
    }
  }
}
