pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The panel's main page: the search field, a notice, while signed in the
// chips that pick one of the account's lists, the title of a playlist that
// was opened from them, the list (search results, or else such a list, or
// else what is queued and what was played recently), and the now-playing
// strip. It owns only what is lost when the panel
// closes: the text typed but not yet searched for, the "that is a link"
// message, which result it last told the service the user is resting on,
// and which chip the cursor would pick. The search itself, its results, the
// lists, the queue and the playback state live in the service, so a
// reopened panel, or the copy on another monitor, shows the same thing.
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
  // The text of the last search this page started, "" once its results
  // were seen.
  property string submittedText: ""
  // What the user chose to rest on (the highlight hint, below): the result
  // the highlight was moved onto, and the query of a search made here,
  // whose top hit counts as chosen while it is highlighted.
  property string chosenId: ""
  property string chosenQuery: ""
  // The result last reported to the service as highlighted, "" for none.
  property string hinted: ""
  // Which feed chip is highlighted while the cursor is on their row.
  property int chipIndex: 0
  // Which button of the now-playing strip is, while the cursor is there.
  property int controlIndex: Ui.CONTROL_HOME

  // Where the keyboard goes when the page is shown.
  readonly property Item focusItem: field

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent

  // Every read of the service is guarded: it can go away at any moment.
  readonly property string searchState: service ? service.searchState : "idle"
  // The list shows the service's search rather than the home rows.
  readonly property bool searchMode: searchState !== "idle"
  // Signed in, the chips offer the account's lists in place of the home
  // list. A search still comes first: its results are what was asked for.
  readonly property bool signedIn: service ? service.signedIn === true : false
  readonly property bool chipsShown: signedIn && !searchMode
  // The list that is picked, "" for the home list.
  readonly property string feedKind: service && signedIn ? String(service.feedKind || "") : ""
  readonly property bool feedMode: !searchMode && feedKind !== ""
  readonly property string feedState: service && feedMode ? String(service.feedState || "idle") : ""
  // The playlist whose videos the list shows, "" while it shows a list of
  // the account itself.
  readonly property string feedTitle: service && feedMode ? String(service.feedTitle || "") : ""
  // Separate calls on purpose. Each reads only the lists its mode shows, so
  // that a track that starts playing (and so enters the recents) does not
  // rebuild a list of search results under the user.
  readonly property var rows: searchMode
    ? Ui.rows("search", service ? service.searchResults : null, null, -1, null)
    : (feedMode ? Ui.feedRows(service ? service.feedRows : null)
      : Ui.rows("home", null, service ? service.queue : null, service ? service.queueIndex : -1,
        service ? service.recents : null))
  readonly property var area: Ui.listArea(linkNotice, searchState, rows.length, feedState)
  readonly property var thumbs: service ? service.thumbs : null
  readonly property var currentTrack: service ? service.currentTrack : null
  readonly property string currentId: currentTrack && typeof currentTrack.id === "string"
    ? currentTrack.id : ""
  readonly property string noticeCode: service ? service.noticeCode : ""
  readonly property string noticeText: service && noticeCode !== ""
    ? String(service.errorText(noticeCode) || "") : ""
  // The chosen audio output went away and the system default plays instead.
  readonly property string outputNote: service ? String(service.outputNote || "") : ""
  readonly property string outputNoteText: service && outputNote !== ""
    ? String(service.errorText(outputNote) || "") : ""
  // The track failed because YouTube shows it only to a signed-in user, and
  // somebody is signed in. The page then offers to play it with the
  // account: each time, for that one track, and never by itself.
  readonly property bool accountOffer: service
    ? Ui.accountOffer(String(service.playbackState || ""), String(service.errorCode || ""), signedIn) : false
  readonly property string accountText: service && accountOffer
    ? String(service.errorText("E_NEEDS_ACCOUNT") || "") + ". " + Ui.TEXT.ACCOUNT_ASK : ""
  // The question whether to skip sponsor segments waits for an answer.
  readonly property bool sponsorPrompt: service ? service.sponsorPrompt === true : false
  // So does the question, on first use, whether to turn shortcuts on.
  readonly property bool shortcutsPrompt: service ? service.shortcutsPrompt === true : false
  // The one notice that shows. The others wait their turn behind it, so
  // that the list and the strip keep their room.
  readonly property string notice: Ui.topNotice(accountOffer, noticeCode !== "", outputNote !== "",
    sponsorPrompt, shortcutsPrompt)
  // The now-playing strip is on screen.
  readonly property bool stripShown: service ? service.hasTrack === true : false
  // What everything on the page but the list takes of its height, with the
  // gaps between. The list gets what the card has left beside it.
  readonly property real aroundList: {
    var total = 0
    var parts = column.children
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] !== list && parts[i].visible && parts[i].height > 0) {
        total += parts[i].height + column.spacing
      }
    }
    return total
  }
  // The places the cursor can visit beside the rows of the list, in the
  // order Up and Down go through them. Above the first row lie, from the
  // top of the page down: the settings button, the buttons of the notice
  // on screen and the row of feed chips, which is one place (Left and Right
  // pick the chip there). One more Up from the settings button leads round
  // to the bottom of the page, to the buttons of the now-playing strip,
  // again one place with Left and Right. That is how every button of the
  // page, and through them every other page, is reached without a pointer.
  readonly property var noticeActions: {
    var names = []
    if (root.stripShown) names.push("controls")
    names.push("settings")
    if (root.notice === "account") names.push("account")
    else if (root.notice === "service") names.push("dismiss")
    else if (root.notice === "output") names.push("outputs")
    else if (root.notice === "sponsor") names.push("sponsorOn", "sponsorOff")
    else if (root.notice === "shortcuts") names.push("shortcutsOn", "shortcutsOff")
    if (root.chipsShown) names.push("feeds")
    return names
  }
  // The first of them are always there: the strip's buttons while a track
  // is loaded, and the settings button.
  readonly property int fixedPlaces: stripShown ? 2 : 1
  readonly property string noticeCursor: body ? body.noticeCursor : ""

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
    if (line === "feedLoading") return Ui.TEXT.LOADING
    if (line === "feedEmpty") return Ui.TEXT.FEED_EMPTY
    if (!root.service) return ""
    if (line === "link") return String(root.service.errorText("E_LINK") || "")
    if (line === "error") return String(root.service.errorText(root.service.searchError) || "")
    if (line === "feedError") return String(root.service.errorText(root.service.feedError || "E_FEED") || "")
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
    var index = root.cursorOnRow ? root.body.selectedIndex : -1
    if (action === "activate") {
      root.activateRow(index)
    } else if (action === "enqueue") {
      root.enqueueRow(index)
    } else if (action === "submit") {
      root.submit(false)
    } else if (action === "submitEnqueue") {
      root.submit(true)
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
    } else if (action === "left" || action === "right") {
      // Only ever answered while the cursor is on a row of buttons: the
      // feed chips, or the now-playing strip.
      var step = action === "left" ? -1 : 1
      if (root.noticeCursor === "feeds") {
        root.chipIndex = Ui.clampIndex(root.chipIndex + step, Ui.FEEDS.length)
      } else if (root.noticeCursor === "controls") {
        root.controlIndex = Ui.stepControl(root.controlIndex, step, strip.usable)
      }
    }
  }

  // Plays a row: a queued track by its place in the queue, which stays as
  // it is; any other track in place of the queue. A row of an account list
  // is opened by the service, which plays a video and shows the videos of
  // a playlist.
  function activateRow(index) {
    if (!root.service || index < 0 || index >= root.rowCount) return
    var row = root.rows[index]
    if (row.kind === "queue") root.service.queuePlay(row.key)
    else if (row.kind === "feed" || row.kind === "list") root.service.openFeedRow(row.key)
    else root.service.playTrack(row.track)
  }

  // Adds the row's track to the end of the queue. A queued track can be
  // added again: the same video may stand in the queue twice. A playlist
  // is no track.
  function enqueueRow(index) {
    if (!root.service || index < 0 || index >= root.rowCount) return
    if (root.rows[index].kind !== "list") root.service.enqueueTrack(root.rows[index].track)
  }

  // The small button at the right edge of a row: an upcoming track leaves
  // the queue, any other track joins it.
  function rowAction(index) {
    if (!root.service || index < 0 || index >= root.rowCount) return
    var row = root.rows[index]
    if (row.kind === "queue") root.service.queueRemove(row.key)
    else if (row.kind !== "list") root.service.enqueueTrack(row.track)
  }

  // Shows one of the account's lists, or with "" the home list again. The
  // chip of the list that is shown asks as well: from an opened playlist
  // that is the way back to the playlists.
  function pickFeed(kind) {
    if (root.service) root.service.selectFeed(kind)
  }

  // The chip that stands for the list on screen.
  function currentChip() {
    for (var i = 0; i < Ui.FEEDS.length; i++) {
      if (Ui.FEEDS[i].value === root.feedKind) return i
    }
    return 0
  }

  function submit(enqueue) {
    if (!root.service) return
    var text = field.text
    var answer = root.service.submit(text, enqueue)
    // A link that was played or queued has done its work. Emptying the
    // field also returns the list to the home rows (fieldChanged).
    if (answer === "video") field.text = ""
    else if (answer === "link") root.linkNotice = true
    else if (answer === "query") root.submittedText = text
  }

  // Presses the button that has the cursor, or the button of a notice
  // that was clicked (PanelBody.answerNotice).
  function answerNotice(name) {
    if (name === "settings") {
      root.navigate("settings")
    } else if (name === "controls") {
      strip.press(Ui.CONTROLS[Ui.stepControl(root.controlIndex, 0, strip.usable)])
    } else if (name === "dismiss") {
      if (root.service) root.service.dismissNotice()
    } else if (name === "account") {
      if (root.service) root.service.playWithAccount()
    } else if (name === "outputs") {
      root.navigate("outputs")
    } else if (name === "sponsorOn" || name === "sponsorOff") {
      if (root.service) root.service.answerSponsorPrompt(name === "sponsorOn")
    } else if (name === "shortcutsOn" || name === "shortcutsOff") {
      if (root.service) root.service.answerShortcutsPrompt(name === "shortcutsOn")
      // The page shows what came of it, key by key.
      if (name === "shortcutsOn") root.navigate("shortcuts")
    } else if (name === "feeds") {
      root.pickFeed(Ui.FEEDS[Ui.clampIndex(root.chipIndex, Ui.FEEDS.length)].value)
    }
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
    root.body.setCursor(0)
    var mine = root.submittedText !== "" && root.service.matchesSearch(root.submittedText) === true
    root.submittedText = ""
    root.chosenId = ""
    root.chosenQuery = mine ? root.service.searchQuery : ""
    root.syncHint()
  }

  // ---- The highlight hint ----
  //
  // The service may prepare the result the user rests on, so that Enter
  // starts it at once. It is told which result that is only when the user
  // chose it: by moving the highlight there with an arrow key or the
  // pointer, or by starting the search whose top hit is highlighted when
  // its results arrive. A row that merely slid under the highlight is not
  // a choice, so new rows withdraw the hint, and so does closing the panel.
  // Opening a panel over results that are already there says nothing.
  //
  // What is hinted follows from what is on screen and what was chosen, and
  // is worked out anew after each change of either. The order in which the
  // service's changes arrive therefore does not matter.

  // The highlighted row if it is a search result, else null. Checked
  // against the rows themselves: this runs on their change signal, when
  // the counts derived from them may not have followed yet.
  function highlightedResult() {
    if (!root.body || !root.body.cursorActive || !root.area.list) return null
    var index = root.body.selectedIndex
    if (index < 0 || index >= root.rows.length) return null
    return root.rows[index].kind === "result" ? root.rows[index] : null
  }

  // The id to report now, "" for none.
  function hintTarget() {
    var row = root.highlightedResult()
    if (!row || !root.service) return ""
    if (row.track.id === root.chosenId) return row.track.id
    // Asked of the service itself, for the same reason.
    var top = root.body.selectedIndex === 0 && root.chosenQuery !== ""
      && root.service.searchState === "results" && root.service.searchQuery === root.chosenQuery
    return top ? row.track.id : ""
  }

  function syncHint() {
    var id = root.hintTarget()
    if (id === root.hinted) return
    root.hinted = id
    if (root.watched) root.watched.hintHighlight(id)
  }

  // The user moved the highlight: what it stands on now is the choice.
  function steered() {
    var row = root.highlightedResult()
    root.chosenId = row ? row.track.id : ""
    root.chosenQuery = ""
    root.syncHint()
  }

  function withdrawHint() {
    root.chosenId = ""
    root.chosenQuery = ""
    root.syncHint()
  }

  // Notices above the list can push it out of view; the list itself keeps
  // its highlighted row visible.
  function highlightMoved() {
    if (root.body && root.body.cursorActive) root.body.ensureVisible(list)
  }

  // Rows that are replaced under a resting pointer must not move the
  // highlight: only a real pointer movement may.
  onRowsChanged: {
    if (root.body) root.body.disarmPointer()
    root.syncHint()
  }
  // The list was hidden behind a message, or is shown again.
  onRowCountChanged: root.syncHint()
  // Another notice took the place of the one whose button was highlighted.
  // The user has not read this one, so Enter must not dismiss it yet.
  onNoticeCodeChanged: if (root.body && root.noticeCursor === "dismiss") root.body.clearNoticeCursor()
  // The notice with the cursor is scrolled into view like a row. On the
  // row of chips the highlight starts on the list that is shown.
  onNoticeCursorChanged: {
    if (!root.body) return
    if (root.noticeCursor === "controls") {
      // The highlight starts on play or pause, which can always be pressed.
      root.controlIndex = Ui.CONTROL_HOME
      root.body.ensureVisible(strip)
    } else if (root.noticeCursor === "settings") {
      root.body.ensureVisible(gear)
    } else if (root.noticeCursor === "dismiss") {
      root.body.ensureVisible(serviceNotice)
    } else if (root.noticeCursor === "account") {
      root.body.ensureVisible(accountNotice)
    } else if (root.noticeCursor === "outputs") {
      root.body.ensureVisible(outputNotice)
    } else if (root.noticeCursor === "sponsorOn" || root.noticeCursor === "sponsorOff") {
      root.body.ensureVisible(sponsorNotice)
    } else if (root.noticeCursor === "shortcutsOn" || root.noticeCursor === "shortcutsOff") {
      root.body.ensureVisible(shortcutsNotice)
    } else if (root.noticeCursor === "feeds") {
      root.chipIndex = root.currentChip()
      root.body.ensureVisible(chips)
    }
  }
  // Another list, or the videos of a playlist in place of the playlists:
  // a highlight on a row lets go, so that a second Enter does not play
  // whatever arrives in the place of the row the first one opened.
  onFeedKindChanged: if (root.body) root.body.dropCursor()
  onFeedStateChanged: if (root.body && root.feedState === "loading") root.body.dropCursor()

  Component.onCompleted: {
    if (root.service && root.service.searchState !== "idle") field.text = root.service.searchQuery
    root.watched = root.service
    if (root.watched) root.watched.setPositionWatch(true)
  }
  Component.onDestruction: {
    if (!root.watched) return
    if (root.hinted !== "") root.watched.hintHighlight("")
    root.watched.setPositionWatch(false)
  }

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
    function onCursorSteered() { root.steered() }
    function onOpenedChanged() { if (!root.body.opened) root.withdrawHint() }
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
        hasCursor: root.noticeCursor === "settings"
        // With the cursor it is framed like a row that has it.
        bordered: root.noticeCursor === "settings"
        onClicked: root.answerNotice("settings")
      }
    }

    // ---- Notices ----
    //
    // One at a time (root.notice): each of them is as tall as its sentence
    // needs, and together they would take the room of the list.

    Notice {
      id: serviceNotice
      width: parent.width
      visible: root.notice === "service"
      text: root.noticeText
      primaryLabel: Ui.TEXT.DISMISS
      cursor: root.noticeCursor === "dismiss" ? "primary" : ""
      fg: root.fg
      fontFamily: root.fontFamily
      onPrimary: root.answerNotice("dismiss")
    }

    // The one way a video is ever looked up with the login: this button,
    // pressed for the track that just failed for want of an account. The
    // notice says what pressing it sends, and it goes when the track does.
    Notice {
      id: accountNotice
      width: parent.width
      visible: root.notice === "account"
      text: root.accountText
      primaryLabel: Ui.TEXT.ACCOUNT_PLAY
      cursor: root.noticeCursor === "account" ? "primary" : ""
      fg: root.fg
      fontFamily: root.fontFamily
      onPrimary: root.answerNotice("account")
    }

    // Nothing to dismiss here: the note stays as long as the chosen output
    // is gone, and its button leads to where another one is picked.
    Notice {
      id: outputNotice
      width: parent.width
      visible: root.notice === "output"
      text: root.outputNoteText
      primaryLabel: Ui.TEXT.OUTPUT_CHOOSE
      cursor: root.noticeCursor === "outputs" ? "primary" : ""
      fg: root.fg
      fontFamily: root.fontFamily
      onPrimary: root.answerNotice("outputs")
    }

    // Asked once, and it stays until it is answered: skipping needs a
    // lookup at another service, which is the user's call to make.
    Notice {
      id: sponsorNotice
      width: parent.width
      visible: root.notice === "sponsor"
      text: Ui.TEXT.SPONSOR_ASK
      primaryLabel: Ui.TEXT.SPONSOR_ENABLE
      secondaryLabel: Ui.TEXT.SPONSOR_DECLINE
      cursor: root.noticeCursor === "sponsorOn" ? "primary"
        : (root.noticeCursor === "sponsorOff" ? "secondary" : "")
      fg: root.fg
      fontFamily: root.fontFamily
      onPrimary: root.answerNotice("sponsorOn")
      onSecondary: root.answerNotice("sponsorOff")
    }

    // Asked once, on first use, while no action has a shortcut. Yes assigns
    // the free keys the shortcuts page would suggest and opens that page;
    // either answer is final.
    Notice {
      id: shortcutsNotice
      width: parent.width
      visible: root.notice === "shortcuts"
      text: Ui.TEXT.SHORTCUTS_ASK
      primaryLabel: Ui.TEXT.SHORTCUTS_ENABLE
      secondaryLabel: Ui.TEXT.SHORTCUTS_DECLINE
      cursor: root.noticeCursor === "shortcutsOn" ? "primary"
        : (root.noticeCursor === "shortcutsOff" ? "secondary" : "")
      fg: root.fg
      fontFamily: root.fontFamily
      onPrimary: root.answerNotice("shortcutsOn")
      onSecondary: root.answerNotice("shortcutsOff")
    }

    // ---- The account's lists ----

    FeedChips {
      id: chips
      width: parent.width
      visible: root.chipsShown
      kinds: Ui.FEEDS
      current: root.feedKind
      cursorIndex: root.noticeCursor === "feeds" ? root.chipIndex : -1
      fg: root.fg
      fontFamily: root.fontFamily
      onPicked: function(kind) { root.pickFeed(kind) }
    }

    // ---- The playlist that is open ----

    // Which playlist the rows below are the videos of. The title is
    // YouTube's text, on one line and as it is written. The marked chip
    // above it leads back to the playlists.
    Text {
      id: listHeading
      textFormat: Text.PlainText
      width: parent.width
      visible: root.feedTitle !== ""
      text: root.feedTitle
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: true
      elide: Text.ElideRight
      maximumLineCount: 1
    }

    // ---- Status line ----

    StatusLine {
      width: parent.width
      visible: root.statusText !== ""
      text: root.statusText
      busy: root.area.line === "searching" || root.area.line === "feedLoading"
      isError: root.area.line === "link" || root.area.line === "error" || root.area.line === "feedError"
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
      // Between two and seven rows, and fewer than seven where a notice,
      // the chips or a small screen leave less room: the list gives way and
      // scrolls, the strip under it stays whole.
      height: Ui.listHeight(contentHeight, Style.space(94), Style.space(334),
        root.body ? root.body.heightLimit : 0, root.aroundList)
      // Without rows it would be two rows of nothing: a first search has no
      // earlier results to show dimmed while it runs.
      visible: root.area.list && root.rows.length > 0
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
        // An upcoming track is not the playing one, even when the same
        // video is queued a second time.
        isCurrent: row.modelData.kind !== "queue" && root.currentId !== ""
          && row.modelData.track.id === root.currentId
        // A playlist has no button: it can only be opened.
        actionIcon: row.modelData.kind === "queue" ? Ui.GLYPH.close
          : (row.modelData.kind === "list" ? "" : Ui.GLYPH.queueAdd)
        actionTip: row.modelData.kind === "queue" ? Ui.TEXT.QUEUE_REMOVE : Ui.TEXT.QUEUE_ADD

        onActivated: {
          if (root.body) root.body.setCursor(row.index)
          root.activateRow(row.index)
        }
        onActionClicked: root.rowAction(row.index)
        onPointerMoved: function(mouse) { if (root.body) root.body.pointAt(row.index, row, mouse) }
        onThumbFailed: if (root.service) root.service.reportThumbError(row.modelData.track.id)
        // Only rows the list really created ask for their thumbnail, and
        // only rows that are a video have one.
        Component.onCompleted: {
          if (root.service && row.modelData.track.id !== "") root.service.wantThumbs([row.modelData.track.id])
        }
      }
    }

    // ---- Now playing ----

    NowPlaying {
      id: strip
      width: parent.width
      visible: root.stripShown
      service: root.service
      body: root.body
      // A button that can no longer be pressed (no track after this one)
      // hands the highlight to play or pause.
      cursorIndex: root.noticeCursor === "controls"
        ? Ui.stepControl(root.controlIndex, 0, strip.usable) : -1
      onNavigate: function(page) { root.navigate(page) }
    }
  }
}
