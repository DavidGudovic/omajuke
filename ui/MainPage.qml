pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The panel's main page: the search field, the list (search results, or
// what was played recently), and the now-playing strip. It owns only what
// is lost when the panel closes: the text typed but not yet searched for,
// and the "that is a link" message. The search itself, its results and the
// playback state live in the service, so a reopened panel, or the copy on
// another monitor, shows the same thing.
Item {
  id: root

  property var service: null
  // The PanelBody this page sits in: theme values, the list cursor, the
  // key decisions and the scroll area.
  property var body: null

  // The last Enter was answered "that looks like a link, not to a video".
  // The message lasts exactly as long as the text it is about.
  property bool linkNotice: false
  // The service that was asked to report the playback position, so that the
  // request is withdrawn from the same one.
  property var watched: null

  // Where the keyboard goes when the page is shown.
  readonly property Item focusItem: field

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent

  // Every read of the service is guarded: it can go away at any moment.
  readonly property string searchState: service ? service.searchState : "idle"
  // The list shows the service's search rather than the home rows.
  readonly property bool searchMode: searchState !== "idle"
  // Two calls on purpose. Each reads only the lists its mode shows, so that
  // a track that starts playing (and so enters the recents) does not rebuild
  // a list of search results under the user.
  readonly property var rows: searchMode
    ? Ui.rows("search", service ? service.searchResults : null, null, -1, null)
    : Ui.rows("home", null, service ? service.queue : null, service ? service.queueIndex : -1,
      service ? service.recents : null)
  readonly property var area: Ui.listArea(linkNotice, searchState, rows.length)
  readonly property var thumbs: service ? service.thumbs : null
  readonly property var currentTrack: service ? service.currentTrack : null
  readonly property string currentId: currentTrack && typeof currentTrack.id === "string"
    ? currentTrack.id : ""
  readonly property string noticeCode: service ? service.noticeCode : ""
  readonly property string noticeText: service && noticeCode !== ""
    ? String(service.errorText(noticeCode) || "") : ""

  // Rows the cursor can visit: none while the list is hidden behind a message.
  readonly property int rowCount: area.list ? rows.length : 0
  readonly property bool cursorOnRow: body
    ? body.cursorActive && body.selectedIndex >= 0 && body.selectedIndex < rowCount : false
  readonly property string rowKind: cursorOnRow ? rows[body.selectedIndex].kind : ""

  readonly property string statusText: {
    var line = root.area.line
    if (line === "searching") return Ui.TEXT.SEARCHING
    if (line === "empty") return Ui.TEXT.NOTHING_FOUND
    if (line === "home") return Ui.TEXT.HOME_EMPTY
    if (!root.service) return ""
    if (line === "link") return String(root.service.errorText("E_LINK") || "")
    if (line === "error") return String(root.service.errorText(root.service.searchError) || "")
    return ""
  }

  signal navigate(string page)

  // ---- Keys ----

  // The page's part of what Ui.keyAction decides on, gathered at the moment
  // of the key press.
  function keyContext() {
    var text = field.text
    // While the link message shows, the text has had its answer: Enter must
    // not send it again, and no row is behind the message.
    var answered = root.linkNotice || (root.service ? root.service.matchesSearch(text) === true : false)
    return {
      hasText: text.trim() !== "",
      matches: answered,
      searching: !root.linkNotice && root.searchState === "searching",
      rowCount: root.rowCount,
      rowKind: root.rowKind
    }
  }

  // No key is special to this page: everything goes through Ui.keyAction.
  function handleKey(event, typing) {
    return false
  }

  // Carries out a page action that Ui.keyAction chose.
  function act(action, text) {
    // Queueing arrives with the queue; until then Shift+Enter is Enter.
    if (action === "activate" || action === "enqueue") {
      root.activateRow(root.body ? root.body.selectedIndex : -1)
    } else if (action === "submit" || action === "submitEnqueue") {
      root.submit()
    } else if (action === "playPause") {
      if (root.service) root.service.playPause()
    } else if (action === "focusField") {
      field.forceActiveFocus()
    } else if (action === "fieldBackspace") {
      field.forceActiveFocus()
      field.text = Ui.dropLast(field.text)
    } else if (action === "fieldAppend") {
      field.forceActiveFocus()
      if (Ui.printable(text)) field.text = field.text + text
    }
  }

  function activateRow(index) {
    if (!root.service || index < 0 || index >= root.rowCount) return
    root.service.playTrack(root.rows[index].track)
  }

  function submit() {
    if (!root.service) return
    var answer = root.service.submit(field.text, false)
    // A link that was played has done its work. Emptying the field also
    // returns the list to the home rows (fieldChanged).
    if (answer === "video") field.text = ""
    else if (answer === "link") root.linkNotice = true
  }

  // ---- The field and the service's search ----

  function fieldChanged() {
    root.linkNotice = false
    if (field.text === "" && root.service && root.service.searchState !== "idle") root.service.clearSearch()
  }

  // A search started elsewhere (another monitor's panel, the command line)
  // reaches this field, so results never stand under text they do not
  // belong to.
  function adoptQuery() {
    if (!root.service) return
    var query = root.service.searchQuery
    if (query !== "" && !root.service.matchesSearch(field.text)) field.text = query
  }

  // Fresh results put the highlight on the first one, so a second Enter
  // plays the top hit. Results that were already there when the page was
  // created do not: a panel that is merely reopened highlights nothing.
  function resultsArrived() {
    // Asked of the service itself: this runs on its signal, possibly before
    // the bindings above have followed.
    if (!root.service || root.service.searchState !== "results" || !root.body) return
    root.body.selectedIndex = 0
    root.body.cursorActive = true
  }

  // Notices above the list can push it out of view; the list itself keeps
  // its highlighted row visible.
  function highlightMoved() {
    if (root.body && root.body.cursorActive) root.body.ensureVisible(list)
  }

  // Rows that are replaced under a resting pointer must not move the
  // highlight: only a real pointer movement may.
  onRowsChanged: if (root.body) root.body.disarmPointer()

  Component.onCompleted: {
    if (root.service && root.service.searchState !== "idle") field.text = root.service.searchQuery
    root.watched = root.service
    if (root.watched) root.watched.setPositionWatch(true)
  }
  Component.onDestruction: if (root.watched) root.watched.setPositionWatch(false)

  implicitHeight: column.implicitHeight

  Connections {
    target: root.service
    ignoreUnknownSignals: true
    function onSearchQueryChanged() { root.adoptQuery() }
    function onSearchStateChanged() { root.resultsArrived() }
  }

  Connections {
    target: root.body
    ignoreUnknownSignals: true
    function onSelectedIndexChanged() { root.highlightMoved() }
    function onCursorActiveChanged() { root.highlightMoved() }
  }

  Column {
    id: column
    width: parent.width
    spacing: Style.space(10)

    // ---- Search field and settings ----

    Item {
      width: parent.width
      height: Style.space(30)

      TextField {
        id: field
        anchors.left: parent.left
        anchors.right: gear.left
        anchors.rightMargin: Style.space(8)
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        placeholderText: Ui.TEXT.SEARCH_HINT
        maximumLength: Ui.LIMITS.fieldChars
        foreground: root.fg
        font.family: root.fontFamily
        // Every key is offered to the panel's key table before the field
        // edits with it.
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) { if (root.body) root.body.handleKey(event, true) }
        onActiveFocusChanged: if (activeFocus) selectAll()
        onTextChanged: root.fieldChanged()
      }

      PanelActionButton {
        id: gear
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        iconText: Ui.GLYPH.cog
        tooltipText: Ui.TEXT.SETTINGS
        foreground: root.fg
        fontFamily: root.fontFamily
        onClicked: root.navigate("settings")
      }
    }

    // ---- Notices ----

    Notice {
      width: parent.width
      visible: root.noticeCode !== ""
      text: root.noticeText
      primaryLabel: Ui.TEXT.DISMISS
      fg: root.fg
      fontFamily: root.fontFamily
      onPrimary: if (root.service) root.service.dismissNotice()
    }

    // ---- Status line ----

    StatusLine {
      width: parent.width
      visible: root.statusText !== ""
      text: root.statusText
      busy: root.area.line === "searching"
      isError: root.area.line === "link" || root.area.line === "error"
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
    }

    // ---- List ----

    // A ListView rather than rows in a column: it keeps the highlighted row
    // in view by itself and only moves when that row is really clipped.
    // The model is not emptied when the panel closes: the page lives until
    // the fade-out is over, and an emptied list would shrink the card while
    // it fades. Unloading the page is what frees the rows.
    ListView {
      id: list
      width: parent.width
      // Between two and seven rows.
      height: Math.max(Style.space(94), Math.min(contentHeight, Style.space(334)))
      visible: root.area.list
      opacity: root.area.dim ? 0.5 : 1
      spacing: Style.space(2)
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      interactive: contentHeight > height
      model: root.rows
      currentIndex: root.cursorOnRow ? root.body.selectedIndex : -1

      // Deferred by a turn: new results replace the model, and positioning
      // straight out of the signal is lost when the view resets under it.
      onCurrentIndexChanged: if (currentIndex >= 0) Qt.callLater(keepCurrentVisible)
      function keepCurrentVisible() {
        if (currentIndex >= 0) positionViewAtIndex(currentIndex, ListView.Contain)
      }

      ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

      section.property: "group"
      section.criteria: ViewSection.FullString
      section.delegate: Item {
        id: heading
        required property string section

        width: ListView.view ? ListView.view.width : 0
        height: headingText.implicitHeight + Style.space(4)

        PanelSectionHeader {
          id: headingText
          anchors.left: parent.left
          anchors.leftMargin: Style.space(6)
          text: heading.section
          foreground: root.fg
          fontFamily: root.fontFamily
        }
      }

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
        isCurrent: root.currentId !== "" && row.modelData.track.id === root.currentId

        onActivated: {
          if (root.body) root.body.setCursor(row.index)
          root.activateRow(row.index)
        }
        onPointerMoved: function(mouse) { if (root.body) root.body.pointAt(row.index, row, mouse) }
        onThumbFailed: if (root.service) root.service.reportThumbError(row.modelData.track.id)
        // Only rows the list really created ask for their thumbnail.
        Component.onCompleted: if (root.service) root.service.wantThumbs([row.modelData.track.id])
      }
    }

    // ---- Now playing ----

    NowPlaying {
      width: parent.width
      visible: root.service ? root.service.hasTrack === true : false
      service: root.service
      body: root.body
      onNavigate: function(page) { root.navigate(page) }
    }
  }
}
