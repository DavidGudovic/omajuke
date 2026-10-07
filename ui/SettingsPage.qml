import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The settings page: one row per setting that does something in this
// version (a switch, or chips for a setting that is one of a few values),
// the ways to the shortcuts page and the account page, Clear history, and
// a line about the plugin. It keeps no values: each row shows what the
// service reports and asks the service to change it, and the service
// decides what is allowed.
Item {
  id: root

  property var service: null
  // The PanelBody this page sits in: theme values, the row cursor, the
  // confirmation and the scroll area.
  property var body: null

  // No text field here: the panel's key router keeps the keyboard.
  readonly property Item focusItem: null

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family

  // Every read of the service is guarded: it can go away at any moment.
  readonly property var settings: service ? service.settings : null
  readonly property bool autoplay: settings ? settings.autoplay === true : false
  readonly property bool preload: settings ? settings.preload === true : false
  readonly property bool evenVolume: settings ? settings.evenVolume === true : false
  readonly property bool keepAwake: settings ? settings.keepAwake === true : false
  readonly property bool rememberHistory: settings ? settings.rememberHistory === true : false
  // Skipping is on, off, or not decided yet. Only "on" looks anything up,
  // so only "on" shows as switched on.
  readonly property bool sponsorSkip: settings ? settings.sponsorSkip === "on" : false
  readonly property bool markWatched: settings ? settings.markWatched === true : false
  readonly property bool signedIn: service ? service.signedIn === true : false
  // The chips carry text, so the number among the choices is shown as text.
  readonly property string maxHeight: settings ? String(settings.maxHeight) : ""
  readonly property string videoSize: settings ? String(settings.videoSize) : ""
  readonly property string videoCorner: settings ? String(settings.videoCorner) : ""
  readonly property string version: service ? String(service.version) : ""
  readonly property bool mprisMissing: service ? service.mprisAvailable === false : false

  // The rows the cursor visits, top to bottom. A new row is one more name
  // here and one more element below. Adding plays to the account's history
  // needs an account, so that row exists only while signed in.
  readonly property var rowOrder: {
    var names = [
      "autoplay", "preload", "evenVolume", "sponsorSkip", "maxHeight", "videoSize", "videoCorner",
      "resetVideo", "keepAwake", "shortcuts", "account"
    ]
    if (root.signedIn) names.push("markWatched")
    names.push("rememberHistory", "clearHistory")
    return names
  }
  // The rows among them that are one of a few values.
  readonly property var choiceRows: ["maxHeight", "videoSize", "videoCorner"]
  readonly property int rowCount: rowOrder.length
  readonly property bool cursorOnRow: body
    ? body.cursorActive && body.selectedIndex >= 0 && body.selectedIndex < rowCount : false
  readonly property string cursorRow: cursorOnRow ? rowOrder[body.selectedIndex] : ""
  readonly property string rowKind: cursorRow === "" ? ""
    : (choiceRows.indexOf(cursorRow) !== -1 ? "choice" : "setting")

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
    if (action === "activate") root.activate(root.cursorRow)
    else if (action === "left") root.step(root.cursorRow, -1, false)
    else if (action === "right") root.step(root.cursorRow, 1, false)
  }

  // Enter, Space or a click on a row: a switch flips, a choice goes on to
  // its next value and from the last one back to the first.
  function activate(name) {
    if (!root.service) return
    if (name === "autoplay") root.service.setSetting("autoplay", !root.autoplay)
    else if (name === "preload") root.service.setSetting("preload", !root.preload)
    else if (name === "evenVolume") root.service.setSetting("evenVolume", !root.evenVolume)
    else if (name === "keepAwake") root.service.setSetting("keepAwake", !root.keepAwake)
    else if (name === "rememberHistory") root.service.setSetting("rememberHistory", !root.rememberHistory)
    else if (name === "sponsorSkip") root.service.setSetting("sponsorSkip", !root.sponsorSkip)
    else if (name === "markWatched") root.service.setSetting("markWatched", !root.markWatched)
    else if (name === "clearHistory") root.askClear()
    else if (name === "resetVideo") root.service.resetVideoPlacement()
    else if (name === "shortcuts") root.navigate("shortcuts")
    else if (name === "account") root.navigate("signin")
    else root.step(name, 1, true)
  }

  // Left and Right on a choice: the neighbouring value, stopping at the ends.
  function step(name, delta, wrap) {
    if (name === "maxHeight") {
      root.pick(name, root.maxHeight, Ui.stepChoice(Ui.CHOICES.maxHeight, root.maxHeight, delta, wrap))
    } else if (name === "videoSize") {
      root.pick(name, root.videoSize, Ui.stepChoice(Ui.CHOICES.videoSize, root.videoSize, delta, wrap))
    } else if (name === "videoCorner") {
      root.pick(name, root.videoCorner, Ui.stepChoice(Ui.CHOICES.videoCorner, root.videoCorner, delta, wrap))
    }
  }

  // Asks the service for one value of a choice, unless it is the one it
  // has. The quality cap is a number to the service and text on its chip.
  function pick(name, from, to) {
    if (!root.service || to === "" || to === from) return
    root.service.setSetting(name, name === "maxHeight" ? Number(to) : to)
  }

  // Clearing cannot be undone, so the user is asked first.
  function askClear() {
    if (!root.body) return
    root.body.confirm(Ui.TEXT.CLEAR_HISTORY_ASK, Ui.TEXT.CLEAR, function() {
      if (root.service) root.service.clearHistory()
    })
  }

  // The pointer moves the same cursor the keyboard does, but only when it
  // really moves: a row that slides under a resting pointer, as the first
  // one does when the page appears, must not take the highlight.
  function pointerOver(name, item, position) {
    if (root.body) root.body.pointAt(root.rowOrder.indexOf(name), item, position)
  }

  implicitHeight: column.implicitHeight

  Column {
    id: column
    width: parent.width
    spacing: Style.space(10)

    // ---- Playback ----

    PanelSectionHeader {
      text: Ui.TEXT.PLAYBACK
      foreground: root.fg
      fontFamily: root.fontFamily
    }

    Toggle {
      id: autoplayRow
      width: parent.width
      label: Ui.TEXT.AUTOPLAY
      description: Ui.TEXT.AUTOPLAY_HINT
      checked: root.autoplay
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "autoplay"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(autoplayRow)
      onClicked: root.activate("autoplay")

      HoverHandler {
        onPointChanged: root.pointerOver("autoplay", autoplayRow, point.position)
      }
    }

    Toggle {
      id: preloadRow
      width: parent.width
      label: Ui.TEXT.PRELOAD
      description: Ui.TEXT.PRELOAD_HINT
      checked: root.preload
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "preload"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(preloadRow)
      onClicked: root.activate("preload")

      HoverHandler {
        onPointChanged: root.pointerOver("preload", preloadRow, point.position)
      }
    }

    Toggle {
      id: evenRow
      width: parent.width
      label: Ui.TEXT.EVEN_VOLUME
      description: Ui.TEXT.EVEN_VOLUME_HINT
      checked: root.evenVolume
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "evenVolume"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(evenRow)
      onClicked: root.activate("evenVolume")

      HoverHandler {
        onPointChanged: root.pointerOver("evenVolume", evenRow, point.position)
      }
    }

    Toggle {
      id: sponsorRow
      width: parent.width
      label: Ui.TEXT.SPONSOR_SKIP
      description: Ui.TEXT.SPONSOR_SKIP_HINT
      checked: root.sponsorSkip
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "sponsorSkip"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(sponsorRow)
      onClicked: root.activate("sponsorSkip")

      HoverHandler {
        onPointChanged: root.pointerOver("sponsorSkip", sponsorRow, point.position)
      }
    }

    // ---- Video ----

    PanelSectionHeader {
      text: Ui.TEXT.VIDEO
      foreground: root.fg
      fontFamily: root.fontFamily
    }

    ChoiceRow {
      id: heightRow
      width: parent.width
      label: Ui.TEXT.MAX_HEIGHT
      description: Ui.TEXT.MAX_HEIGHT_HINT
      options: Ui.CHOICES.maxHeight
      value: root.maxHeight
      fg: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "maxHeight"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(heightRow)
      onPicked: function(value) { root.pick("maxHeight", root.maxHeight, value) }

      HoverHandler {
        onPointChanged: root.pointerOver("maxHeight", heightRow, point.position)
      }
    }

    ChoiceRow {
      id: sizeRow
      width: parent.width
      label: Ui.TEXT.VIDEO_SIZE
      description: Ui.TEXT.VIDEO_SIZE_HINT
      options: Ui.CHOICES.videoSize
      value: root.videoSize
      fg: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "videoSize"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(sizeRow)
      onPicked: function(value) { root.pick("videoSize", root.videoSize, value) }

      HoverHandler {
        onPointChanged: root.pointerOver("videoSize", sizeRow, point.position)
      }
    }

    ChoiceRow {
      id: cornerRow
      width: parent.width
      label: Ui.TEXT.VIDEO_CORNER
      description: Ui.TEXT.VIDEO_CORNER_HINT
      options: Ui.CHOICES.videoCorner
      value: root.videoCorner
      fg: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "videoCorner"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(cornerRow)
      onPicked: function(value) { root.pick("videoCorner", root.videoCorner, value) }

      HoverHandler {
        onPointChanged: root.pointerOver("videoCorner", cornerRow, point.position)
      }
    }

    // The video window is put back where it was last left on each monitor.
    // This forgets those places, so that size and corner above decide again.
    // Like every framed button of the panel it is lettered in the accent
    // colour while it has the cursor.
    Button {
      id: resetRow
      text: Ui.TEXT.VIDEO_RESET
      bordered: true
      foreground: resetRow.hasCursor ? Color.accent : root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "resetVideo"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(resetRow)
      onClicked: root.activate("resetVideo")

      HoverHandler {
        onPointChanged: root.pointerOver("resetVideo", resetRow, point.position)
      }
    }

    Toggle {
      id: awakeRow
      width: parent.width
      label: Ui.TEXT.KEEP_AWAKE
      description: Ui.TEXT.KEEP_AWAKE_HINT
      checked: root.keepAwake
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "keepAwake"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(awakeRow)
      onClicked: root.activate("keepAwake")

      HoverHandler {
        onPointChanged: root.pointerOver("keepAwake", awakeRow, point.position)
      }
    }

    // ---- Shortcuts ----

    PanelSectionHeader {
      text: Ui.TEXT.SHORTCUTS
      foreground: root.fg
      fontFamily: root.fontFamily
    }

    Button {
      id: shortcutsRow
      text: Ui.TEXT.SHORTCUTS_OPEN
      bordered: true
      foreground: shortcutsRow.hasCursor ? Color.accent : root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "shortcuts"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(shortcutsRow)
      onClicked: root.activate("shortcuts")

      HoverHandler {
        onPointChanged: root.pointerOver("shortcuts", shortcutsRow, point.position)
      }
    }

    // ---- Account ----

    PanelSectionHeader {
      text: Ui.TEXT.ACCOUNT
      foreground: root.fg
      fontFamily: root.fontFamily
    }

    // Both lead to the account page, which says what each step does before
    // it is taken. Nothing is signed in or out from here.
    Button {
      id: accountRow
      text: root.signedIn ? Ui.TEXT.SIGNOUT_OPEN : Ui.TEXT.SIGNIN_OPEN
      bordered: true
      foreground: accountRow.hasCursor ? Color.accent : root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "account"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(accountRow)
      onClicked: root.activate("account")

      HoverHandler {
        onPointChanged: root.pointerOver("account", accountRow, point.position)
      }
    }

    Toggle {
      id: watchedRow
      width: parent.width
      visible: root.signedIn
      label: Ui.TEXT.MARK_WATCHED
      description: Ui.TEXT.MARK_WATCHED_HINT
      checked: root.markWatched
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "markWatched"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(watchedRow)
      onClicked: root.activate("markWatched")

      HoverHandler {
        onPointChanged: root.pointerOver("markWatched", watchedRow, point.position)
      }
    }

    // ---- History ----

    PanelSectionHeader {
      text: Ui.TEXT.HISTORY
      foreground: root.fg
      fontFamily: root.fontFamily
    }

    Toggle {
      id: rememberRow
      width: parent.width
      label: Ui.TEXT.REMEMBER_HISTORY
      description: Ui.TEXT.REMEMBER_HISTORY_HINT
      checked: root.rememberHistory
      foreground: root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "rememberHistory"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(rememberRow)
      onClicked: root.activate("rememberHistory")

      HoverHandler {
        onPointChanged: root.pointerOver("rememberHistory", rememberRow, point.position)
      }
    }

    Button {
      id: clearRow
      text: Ui.TEXT.CLEAR_HISTORY
      bordered: true
      foreground: clearRow.hasCursor ? Color.accent : root.fg
      fontFamily: root.fontFamily
      hasCursor: root.cursorRow === "clearHistory"
      onHasCursorChanged: if (hasCursor && root.body) root.body.ensureVisible(clearRow)
      onClicked: root.activate("clearHistory")

      HoverHandler {
        onPointChanged: root.pointerOver("clearHistory", clearRow, point.position)
      }
    }

    PanelSeparator {
      foreground: root.fg
    }

    // ---- About ----

    Column {
      width: parent.width
      spacing: Style.space(2)

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: Ui.TEXT.APP + " " + root.version
        color: Qt.darker(root.fg, 1.5)
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: root.mprisMissing
        text: Ui.TEXT.NO_MPRIS
        color: Qt.darker(root.fg, 1.5)
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        wrapMode: Text.WordWrap
      }
    }
  }
}
