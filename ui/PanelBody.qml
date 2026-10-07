pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// Everything inside the panel card. Panel.qml is only the window around
// it. This is an Item, so the UI harness can mount it without a compositor.
//
// It owns what belongs to one open panel and is lost when it closes: which
// page is shown, the one cursor (on a row of the page, or on one of the
// places a page lists beside its rows: the button of a notice, the row of
// feed chips, the buttons of the now-playing strip), the scroll position,
// the confirmation in front of a page. It is also the one place where a key press is decided
// (handleKey) and the one owner of the scroll area (ensureVisible). What is
// playing, searched or stored lives in the service; this file only reads
// the service's root members and calls its root functions, tolerates a
// missing service at any moment, and reads nothing but `version` from a
// service of another version.
Item {
  id: root

  // ---- In, from Panel.qml or the UI harness ----

  property QtObject bar: null
  property var service: null
  property bool opened: false
  // Open or still fading out. The page lives as long as this is true.
  property bool showing: false

  // ---- State of this panel, reset on open ----

  // "main" or the name of a sub-page.
  property string page: "main"
  // The cursor is the one highlight of a page: the keyboard moves it and so
  // does the pointer. Nothing is highlighted until one of them first does.
  property bool cursorActive: false
  property int selectedIndex: 0
  // The cursor can stand on the button of a notice, or on another place a
  // page lists in noticeActions, instead of on a row: this is which one,
  // counted through noticeActions, and -1 for none.
  // While it is set, cursorActive is false, so one highlight shows at most.
  property int noticeIndex: -1
  // A confirmation is open in front of the page (confirm, closeDialog).
  property bool dialogOpen: false

  // ---- Out ----

  // The plugin was updated and the shell not yet restarted: the kept
  // service is the old code, and this view may expect members it lacks.
  readonly property bool stale: service ? service.version !== Ui.VERSION : false
  // The service when it can be used, else null. One expression on purpose:
  // pages bind to this, so they never see a service of another version, not
  // even for the turn in which it appears.
  readonly property var liveService: service && service.version === Ui.VERSION ? service : null

  // Theme values for the pages. Bound, never cached: the theme can change
  // while the panel is open.
  readonly property color fg: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color urgent: bar ? bar.urgent : Color.urgent

  // The item that should have the keyboard: the page's choice (the search
  // field), or the key router on pages without one.
  readonly property Item focusItem: pageLoader.item && pageLoader.item.focusItem
    ? pageLoader.item.focusItem : keyRouter

  // Why no page can be shown, "" when one can. The order is the order of
  // the checks; a later member is not read when an earlier check answered.
  readonly property string blocker: {
    if (!root.service) return "service"
    if (root.service.version !== Ui.VERSION) return "stale"
    if (root.service.fatalCode !== "") return "fatal"
    if (!root.service.ready) return "loading"
    if (root.service.networkHold) return "proxy"
    return ""
  }
  readonly property string blockerText: {
    if (root.blocker === "service") return Ui.TEXT.E_NO_SERVICE
    if (root.blocker === "stale") return Ui.TEXT.E_STALE
    if (root.blocker === "loading") return Ui.TEXT.LOADING
    if (!root.liveService) return ""
    if (root.blocker === "fatal") return String(root.liveService.errorText(root.liveService.fatalCode) || "")
    if (root.blocker === "proxy") return String(root.liveService.errorText("N_PROXY") || "")
    return ""
  }

  // Rows the cursor can visit on the page that is shown.
  readonly property int rowCount: pageLoader.item && typeof pageLoader.item.rowCount === "number"
    ? pageLoader.item.rowCount : 0

  // The buttons of the notices on screen, top to bottom, each by the name
  // its owner answers to: the proxy question here, else what the page lists.
  readonly property var noticeActions: {
    if (root.blocker === "proxy") return ["proxy"]
    var page = pageLoader.item
    var listed = page ? page.noticeActions : null
    return listed && typeof listed.length === "number" ? listed : []
  }
  // One text for the whole list, so that a change of it is noticed even
  // though the list is a new object each time it is computed.
  readonly property string noticeKey: noticeActions.join(" ")
  // The name of the button that has the cursor, "" when none has.
  readonly property string noticeCursor: noticeIndex >= 0 && noticeIndex < noticeActions.length
    ? noticeActions[noticeIndex] : ""

  property string _dialogMessage: ""
  property string _dialogConfirmText: ""
  // Called when the open confirmation is confirmed.
  property var _dialogAction: null
  // The service that counts this panel as open, so that the count is given
  // back to the same one whatever happened to the service in between.
  property var _noted: null

  // Esc on the main page.
  signal closeRequested()
  // Tab (1) and Shift+Tab (-1): the next or the previous panel of the bar.
  signal switchRequested(int direction)
  // The user moved the cursor, with a key or with the pointer. Rows that
  // merely slide under the cursor (new results) do not count.
  signal cursorSteered()

  // ---- Keys ----

  // The one decision point for a key press. Called by the search field with
  // typing true, before the field edits with the key, and by the key router
  // with typing false, for whatever nothing else accepted. The decision
  // itself is Ui.keyAction, a pure function with its own tests; this only
  // gathers what it needs and carries out what it answers.
  function handleKey(event, typing) {
    // An open confirmation gets the key first.
    if (root.dialogOpen && confirmDialog.handleKey(event)) {
      event.accepted = true
      return true
    }
    var page = pageLoader.item
    if (!root.dialogOpen && page && page.handleKey(event, typing)) {
      event.accepted = true
      return true
    }
    var action = Ui.keyAction(event.key, event.modifiers, typing, root._context(page))
    // Not ours: while typing, the text field gets the key.
    if (action === "") return false
    event.accepted = true
    root._perform(action, typing, String(event.text || ""), page)
    return true
  }

  function _context(page) {
    // Without a page (a blocking message is showing) there are no rows:
    // the keys that close the panel or switch to another one mean something,
    // and the ones that reach the button of the message, if it has one.
    var ctx = page ? page.keyContext()
      : { hasText: false, matches: false, searching: false, rowCount: 0, rowKind: "" }
    ctx.page = root.page
    ctx.dialogOpen = root.dialogOpen
    // The buttons of notices are places the cursor can visit, like rows.
    ctx.rowCount = ctx.rowCount + root.noticeActions.length
    // So are the row of feed chips and the buttons of the now-playing
    // strip, each as one place: Left and Right pick the button there,
    // where a single button has nothing sideways.
    if (root.noticeCursor !== "") ctx.rowKind = Ui.placeKind(root.noticeCursor)
    ctx.fixed = root._fixedPlaces(page)
    return ctx
  }

  function _perform(action, typing, text, page) {
    if (action === "none") return
    if (action === "close") root.closeRequested()
    else if (action === "back") root.back()
    else if (action === "switchNext") root.switchRequested(1)
    else if (action === "switchPrev") root.switchRequested(-1)
    else if (action === "down") root._move(1, typing)
    else if (action === "up") root._move(-1, typing)
    else if (action === "pageDown") root._move(Ui.STEP.page, typing)
    else if (action === "pageUp") root._move(-Ui.STEP.page, typing)
    else if (action === "activate" && root.noticeCursor !== "") root.answerNotice(root.noticeCursor)
    else if (page) page.act(action, text)
  }

  // How many of the page's places beside its rows are buttons that are
  // always there, at the front of noticeActions.
  function _fixedPlaces(page) {
    return page && typeof page.fixedPlaces === "number" ? page.fixedPlaces : 0
  }

  function _move(delta, typing) {
    var at = { active: root.cursorActive, index: root.selectedIndex, action: root.noticeIndex }
    var fixed = root._fixedPlaces(pageLoader.item)
    var to = Ui.moveCursor(at, delta, root.rowCount, root.noticeActions.length, fixed)
    root.noticeIndex = to.action
    root.selectedIndex = to.index
    root.cursorActive = to.active
    // The rows have the keyboard from here on: Space is play or pause now,
    // not a character.
    if (typing) keyRouter.forceActiveFocus()
    pointerGate.reset()
    root.cursorSteered()
  }

  // Presses the button of a notice, for a click on it and for Enter while
  // it has the cursor alike. The proxy question is asked here, in place of
  // any page; every other notice belongs to the page that shows it.
  function answerNotice(name) {
    var page = pageLoader.item
    if (name === "proxy") {
      if (root.blocker === "proxy" && root.liveService) root.liveService.acknowledgeProxy()
    } else if (page && typeof page.answerNotice === "function") {
      page.answerNotice(name)
    }
  }

  // ---- For the pages ----

  // Shows another page. Sub-pages are named by the pages that lead to them.
  function go(name) {
    if (Ui.PAGES.indexOf(name) === -1) return
    root.closeDialog()
    // Before the page changes: the new page may then say where its cursor
    // starts (the queue page starts on the track that is playing).
    root._clearCursor()
    root.page = name
  }

  // Leaves a sub-page for the page it was reached from.
  function back() {
    root.go(Ui.parentPage(root.page))
  }

  // A page that was just shown: nothing is highlighted and its top is in
  // view.
  function _clearCursor() {
    root.cursorActive = false
    root.selectedIndex = 0
    root.noticeIndex = -1
    flick.contentY = 0
    pointerGate.reset()
  }

  // Puts the cursor on a row.
  function setCursor(index) {
    root.noticeIndex = -1
    root.cursorActive = true
    root.selectedIndex = Ui.clampIndex(index, root.rowCount)
  }

  // Takes the cursor off the button of a notice. A page calls this when
  // the notice under the cursor is no longer the one the user was shown.
  function clearNoticeCursor() {
    root.noticeIndex = -1
  }

  // Takes the highlight off the rows. A page calls this when its rows were
  // replaced by other ones (another list, other buttons, another screen),
  // so that the next Enter shows the highlight again, at the top, instead
  // of acting on a row the user has not looked at. A highlight on the
  // button of a notice stays: the notice is still the same.
  function dropCursor() {
    root.cursorActive = false
    root.selectedIndex = 0
    pointerGate.reset()
  }

  // A row reports the pointer over it. Rows also slide under a pointer that
  // rests (new results, scrolling), and only a real movement may move the
  // highlight.
  function pointAt(index, item, mouse) {
    if (!pointerGate.moved(item, mouse)) return
    root.setCursor(index)
    root.cursorSteered()
  }

  function disarmPointer() {
    pointerGate.reset()
  }

  // Scrolls just far enough that item, any descendant of the content
  // column, lies inside the viewport. Pages call this for the row that
  // holds the cursor; they have no other access to the scroll area.
  function ensureVisible(item) {
    if (!item) return
    var limit = flick.contentHeight - flick.height
    if (limit <= 0) return
    var margin = Style.space(6)
    var top = item.mapToItem(content, 0, 0).y
    var bottom = top + item.height
    var y = flick.contentY
    if (top - margin < y) y = top - margin
    else if (bottom + margin > y + flick.height) y = bottom + margin - flick.height
    flick.contentY = Math.max(0, Math.min(limit, y))
  }

  // Asks before something that cannot be undone. action runs only if the
  // user confirms; closing the panel or leaving the page cancels.
  function confirm(message, confirmText, action) {
    root._dialogMessage = message
    root._dialogConfirmText = confirmText
    root._dialogAction = action
    confirmDialog.selectedIndex = 1
    root.dialogOpen = true
  }

  function closeDialog() {
    root.dialogOpen = false
    root._dialogAction = null
  }

  function _confirmed() {
    var action = root._dialogAction
    root.closeDialog()
    if (typeof action === "function") action()
  }

  // ---- Open and close ----

  function _reset() {
    root.closeDialog()
    root._clearCursor()
    root.page = "main"
  }

  // The service counts open panels: it fetches thumbnails and reports the
  // playback position only while one is open. A service that appears under
  // an open panel is told as well, and one that is replaced gets its count
  // back.
  function _noteOpen() {
    var target = root.opened ? root.liveService : null
    if (target === root._noted) return
    if (root._noted) root._noted.notePanelOpen(false)
    root._noted = target
    if (target) target.notePanelOpen(true)
  }

  onOpenedChanged: {
    root._noteOpen()
    if (root.opened) root._reset()
    else root.closeDialog()
  }
  onLiveServiceChanged: root._noteOpen()
  // Unloaded on the main page, so the next open creates one page, not two.
  onShowingChanged: if (!root.showing) root._reset()
  onRowCountChanged: root.selectedIndex = Ui.clampIndex(root.selectedIndex, root.rowCount)
  // A notice came or went, so the count no longer names the same button:
  // the cursor lets go rather than land on one the user did not choose.
  onNoticeKeyChanged: root.noticeIndex = -1
  // While open, the keyboard follows the page: to the search field when the
  // main page appears, to the key router when a page without a field does.
  // On open this asks for the same item as the panel window's own request.
  onFocusItemChanged: if (root.opened && root.focusItem) root.focusItem.forceActiveFocus()

  Component.onDestruction: if (root._noted) root._noted.notePanelOpen(false)

  implicitHeight: content.implicitHeight

  PointerMoveGate {
    id: pointerGate
    referenceItem: root
  }

  // Has the keyboard whenever the search field does not, and receives every
  // key a focused child did not accept.
  Item {
    id: keyRouter
    anchors.fill: parent
    focus: true

    Keys.priority: Keys.BeforeItem
    Keys.onPressed: function(event) { root.handleKey(event, false) }

    // The card grows with its content up to a cap; beyond that the content
    // scrolls, by wheel or by the cursor (ensureVisible).
    Flickable {
      id: flick
      anchors.fill: parent
      contentWidth: width
      contentHeight: content.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      interactive: contentHeight > height

      ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

      Column {
        id: content
        width: flick.width
        spacing: Style.space(10)

        // One message and nothing else while no page can be shown.
        Notice {
          width: parent.width
          visible: root.blocker !== ""
          text: root.blockerText
          primaryLabel: root.blocker === "proxy" ? Ui.TEXT.PROXY_CONTINUE : ""
          cursor: root.noticeCursor === "proxy" ? "primary" : ""
          fg: root.fg
          fontFamily: root.fontFamily
          onPrimary: root.answerNotice("proxy")
        }

        PageHeader {
          width: parent.width
          visible: root.page !== "main" && pageLoader.item !== null
          title: Ui.pageTitle(root.page)
          fg: root.fg
          fontFamily: root.fontFamily
          onBack: root.back()
        }

        // Active through the fade-out as well: destroying the page at the
        // moment of close would shrink the card while it fades. After that
        // a closed panel holds no rows, no images and no bindings on lists.
        Loader {
          id: pageLoader
          width: parent.width
          active: root.showing && root.blocker === ""
          sourceComponent: root.page === "settings" ? settingsPage
            : (root.page === "queue" ? queuePage
              : (root.page === "outputs" ? outputsPage
                : (root.page === "shortcuts" ? shortcutsPage
                  : (root.page === "signin" ? signInPage : mainPage))))
        }
      }
    }

    // Over the whole card, not inside the scrolling content: it stays in
    // view however long the page behind it is.
    ConfirmDialog {
      id: confirmDialog
      anchors.fill: parent
      z: 10
      opened: root.dialogOpen
      message: root._dialogMessage
      confirmText: root._dialogConfirmText
      background: Color.popups.background
      foreground: root.fg
      scrim: Util.alpha(Color.popups.background, 0.7)
      fontFamily: root.fontFamily
      onCanceled: root.closeDialog()
      onConfirmed: root._confirmed()
    }
  }

  // ---- Pages ----
  //
  // A page is an Item that is handed `service` (the usable service or null)
  // and `body` (this object) and provides:
  //   focusItem        the item that should have the keyboard, or null
  //   rowCount         rows the cursor can visit
  //   implicitHeight   from its content column
  //   keyContext()     its part of what Ui.keyAction decides on
  //   handleKey(e, t)  keys only this page knows, true when it took one
  //   act(action, t)   carries out a page action Ui.keyAction chose
  //   navigate(page)   signal: asks for another page
  // and, when it has places for the cursor beside its rows (the buttons
  // of notices; on the main page also the settings button, the feed chips
  // and the now-playing strip):
  //   noticeActions    the names of those places, in the order Up and
  //                    Down go through them, the one nearest the rows last
  //   fixedPlaces      how many of them, at the front, are always there
  //   answerNotice(n)  presses the button of that name

  Component {
    id: mainPage

    MainPage {
      service: root.liveService
      body: root
      onNavigate: function(page) { root.go(page) }
    }
  }

  Component {
    id: settingsPage

    SettingsPage {
      service: root.liveService
      body: root
      onNavigate: function(page) { root.go(page) }
    }
  }

  Component {
    id: queuePage

    QueuePage {
      service: root.liveService
      body: root
      onNavigate: function(page) { root.go(page) }
    }
  }

  Component {
    id: outputsPage

    OutputsPage {
      service: root.liveService
      body: root
      onNavigate: function(page) { root.go(page) }
    }
  }

  Component {
    id: shortcutsPage

    ShortcutsPage {
      service: root.liveService
      body: root
      onNavigate: function(page) { root.go(page) }
    }
  }

  Component {
    id: signInPage

    SignInPage {
      service: root.liveService
      body: root
      onNavigate: function(page) { root.go(page) }
    }
  }
}
