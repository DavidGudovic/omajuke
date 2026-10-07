pragma ComponentBehavior: Bound

import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The shortcuts page: one row per action that can have a key, with the key
// it has or the free one that is proposed, what stands in the way when
// there is something, and the buttons for it (assign the proposal, record
// another key, unassign, or copy a line for the user's own key file). The
// page decides nothing about keys: whether one is free, taken or cannot be
// checked is the service's finding, shown as reported, and every button
// asks the service. It owns only what is lost with it: which row's key is
// being recorded, which button of a row has the cursor, and the answer to
// the last copy.
//
// The words in a row can come from other software (the description of the
// binding that holds a key), so every text here is plain text.
Item {
  id: root

  property var service: null
  // The PanelBody this page sits in: theme values, the row cursor and the
  // scroll area.
  property var body: null

  // The action whose key is being recorded, "" for none.
  property string capturing: ""
  // The key pressed last while recording was no usable shortcut.
  property bool refused: false
  // Which button of the row with the cursor is highlighted.
  property int buttonIndex: 0
  // The action whose line was copied last, and whether that worked.
  property string copiedAction: ""
  property bool copiedOk: false

  // While a key is recorded the box has the keyboard, else the panel's key
  // router keeps it.
  readonly property Item focusItem: capturing !== "" ? capture : null

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent

  // Every read of the service is guarded: it can go away at any moment.
  readonly property string gate: service ? String(service.shortcutsGate || "") : ""
  readonly property bool busy: service ? service.shortcutsBusy === true : false
  readonly property var rows: Ui.shortcutRows(service ? service.shortcuts : null, gate, busy)
  // Why nothing can be assigned, "" when it can.
  readonly property string gateText: {
    var code = Ui.gateCode(root.gate)
    if (!root.service || code === "") return ""
    var text = String(root.service.errorText(code) || "")
    return root.gate === "version" && text !== "" ? text + ". " + Ui.TEXT.USE_COPY_LINE : text
  }
  // The buttons on screen as one text, so that a change of them is noticed
  // even though the rows are new objects each time they are computed.
  readonly property string buttonsKey: rows.map(function(row) {
    return row.buttons.map(function(button) { return button.name }).join(",")
  }).join(" ")
  readonly property string capturingLabel: {
    for (var i = 0; i < root.rows.length; i++) {
      if (root.rows[i].action === root.capturing) return root.rows[i].label
    }
    return ""
  }

  readonly property int rowCount: rows.length
  readonly property bool cursorOnRow: body
    ? body.cursorActive && body.selectedIndex >= 0 && body.selectedIndex < rowCount : false
  readonly property string rowKind: cursorOnRow ? "shortcut" : ""

  signal navigate(string page)

  // ---- Keys ----

  function keyContext() {
    return {
      hasText: false, matches: false, searching: false, rowCount: root.rowCount, rowKind: root.rowKind
    }
  }

  // No key is special to this page: everything goes through Ui.keyAction,
  // and while a key is recorded the box takes every key before the panel.
  function handleKey(event, typing) {
    return false
  }

  // Enter presses the highlighted button of the row with the cursor; Left
  // and Right move that highlight along the row's buttons.
  function act(action, text) {
    if (!root.cursorOnRow) return
    var index = root.body.selectedIndex
    var count = root.rows[index].buttons.length
    if (action === "activate") root.press(index, root.buttonIndex)
    else if (action === "left") root.buttonIndex = Ui.clampIndex(root.buttonIndex - 1, count)
    else if (action === "right") root.buttonIndex = Ui.clampIndex(root.buttonIndex + 1, count)
  }

  // ---- Buttons ----

  function buttonLabel(name) {
    if (name === "assign") return Ui.TEXT.SHORTCUT_ASSIGN
    if (name === "unassign") return Ui.TEXT.SHORTCUT_UNASSIGN
    if (name === "change") return Ui.TEXT.SHORTCUT_CHANGE
    return Ui.TEXT.SHORTCUT_COPY
  }

  // The sentence under a row's label.
  function lineText(row) {
    if (row.action === root.copiedAction) {
      return root.copiedOk ? Ui.TEXT.SHORTCUT_COPIED : Ui.TEXT.SHORTCUT_NOT_COPIED
    }
    if (row.line === "note") return row.note
    if (row.line === "assigned") return Ui.TEXT.SHORTCUT_ASSIGNED
    if (row.line === "config") return Ui.TEXT.SHORTCUT_CONFIG
    if (row.line === "blocked") return Ui.TEXT.SHORTCUT_BLOCKED
    if (row.line === "failed") return Ui.TEXT.SHORTCUT_FAILED
    return row.line === "suggested" ? Ui.TEXT.SHORTCUT_SUGGESTED : Ui.TEXT.SHORTCUT_NONE_FREE
  }

  // Presses a button of a row, for a click and for Enter alike. A button
  // that is shown but cannot be used now answers nothing.
  function press(rowIndex, index) {
    if (!root.service || rowIndex < 0 || rowIndex >= root.rows.length) return
    var row = root.rows[rowIndex]
    if (index < 0 || index >= row.buttons.length || !row.buttons[index].enabled) return
    var name = row.buttons[index].name
    if (name === "copy") {
      root.copiedOk = root.service.copyShortcutLine(row.action, row.copy) === true
      root.copiedAction = row.action
      return
    }
    root.copiedAction = ""
    if (name === "assign") root.service.assignShortcut(row.action, row.proposal)
    else if (name === "unassign") root.service.unassignShortcut(row.action)
    else if (name === "change") root.startCapture(row.action)
  }

  function clicked(rowIndex, index) {
    if (root.body) root.body.setCursor(rowIndex)
    root.buttonIndex = index
    root.press(rowIndex, index)
  }

  // ---- Recording a key ----

  function startCapture(action) {
    root.refused = false
    root.capturing = action
    // Asked for here as well as through focusItem: by now the box is
    // certainly shown, and only a shown item can take the keyboard.
    capture.forceActiveFocus()
    // The box stands under the page's first lines: bringing those into view
    // brings the box with them.
    if (root.body) root.body.ensureVisible(intro)
  }

  function endCapture() {
    root.capturing = ""
    root.refused = false
  }

  // The service says which shortcut a key press is, if any. One that is
  // none leaves the box open for another try.
  function captured(key, modifiers) {
    if (!root.service || root.capturing === "") return
    var combo = String(root.service.comboFromKeyEvent(key, modifiers) || "")
    if (combo === "") {
      root.refused = true
      return
    }
    var action = root.capturing
    root.endCapture()
    root.copiedAction = ""
    root.service.assignShortcut(action, combo)
  }

  // A row got other buttons (its key was assigned, taken away, lost): the
  // highlight lets go rather than stand on a button the user did not pick.
  onButtonsKeyChanged: {
    root.buttonIndex = 0
    if (root.cursorOnRow) root.body.dropCursor()
  }

  // The page shows what the last check found; opening it asks for a new one.
  Component.onCompleted: if (root.service) root.service.refreshShortcuts()

  implicitHeight: column.implicitHeight

  Connections {
    target: root.body
    ignoreUnknownSignals: true
    // Each row starts on its first button.
    function onSelectedIndexChanged() { root.buttonIndex = 0 }
  }

  Column {
    id: column
    width: parent.width
    spacing: Style.space(10)

    Notice {
      width: parent.width
      visible: root.gateText !== ""
      text: root.gateText
      fg: root.fg
      fontFamily: root.fontFamily
    }

    Text {
      id: intro
      textFormat: Text.PlainText
      width: parent.width
      text: Ui.TEXT.SHORTCUTS_INTRO
      color: Qt.darker(root.fg, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    // Above the rows, where the page begins: it is in view as soon as the
    // page is scrolled to its top, however long the rows below are.
    KeyCapture {
      id: capture
      width: parent.width
      visible: root.capturing !== ""
      label: root.capturingLabel
      refused: root.refused
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
      onCaptured: function(key, modifiers) { root.captured(key, modifiers) }
      onCancelled: root.endCapture()
    }

    StatusLine {
      width: parent.width
      visible: root.rows.length === 0 && !root.busy && root.gateText === ""
      text: Ui.TEXT.SHORTCUTS_EMPTY
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
    }

    // ---- The actions ----

    Repeater {
      model: root.rows

      delegate: BorderSurface {
        id: row
        required property var modelData
        required property int index

        readonly property bool hasCursor: root.cursorOnRow && root.body.selectedIndex === row.index

        width: parent ? parent.width : 0
        implicitHeight: inner.implicitHeight + Style.spacing.huge
        radius: Style.cornerRadius
        color: Style.controlFill(false, row.hasCursor, root.fg, Color.accent)
        borderSpec: Border.controlSpec(row.hasCursor ? "hover-cursor" : "normal", root.fg, Color.accent)
        onHasCursorChanged: if (row.hasCursor && root.body) root.body.ensureVisible(row)

        Column {
          id: inner
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: row.borderLeft + Style.spacing.rowPaddingX
          anchors.rightMargin: row.borderRight + Style.spacing.rowPaddingX
          spacing: Style.spacing.xs

          Item {
            width: parent.width
            height: Math.max(title.implicitHeight, chip.height)

            Text {
              id: title
              textFormat: Text.PlainText
              anchors.left: parent.left
              anchors.right: chip.visible ? chip.left : parent.right
              anchors.rightMargin: chip.visible ? Style.space(8) : 0
              anchors.verticalCenter: parent.verticalCenter
              text: row.modelData.label
              color: root.fg
              font.family: root.fontFamily
              font.pixelSize: Style.font.subtitle
              font.bold: true
              elide: Text.ElideRight
            }

            // The key, drawn like a key cap.
            BorderSurface {
              id: chip
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              visible: row.modelData.chip !== ""
              width: chipText.implicitWidth + Style.space(12)
              height: chipText.implicitHeight + Style.space(6)
              radius: Style.cornerRadius
              color: Style.normalFillFor(root.fg, Color.accent)
              borderSpec: Border.flat(root.fg, Style.normalBorderWidth)

              Text {
                id: chipText
                textFormat: Text.PlainText
                anchors.centerIn: parent
                text: row.modelData.chip
                color: root.fg
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }
            }
          }

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: root.lineText(row.modelData)
            color: row.modelData.warn && row.modelData.action !== root.copiedAction
              ? root.urgent : Qt.darker(root.fg, 1.5)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }

          // Room between the words and the buttons.
          Item {
            width: parent.width
            height: Style.space(2)
          }

          Row {
            spacing: Style.space(6)

            Repeater {
              model: row.modelData.buttons

              delegate: Button {
                id: button
                required property var modelData
                required property int index

                text: root.buttonLabel(button.modelData.name)
                tooltipText: button.modelData.name === "copy" ? Ui.TEXT.SHORTCUT_COPY_TIP : ""
                bordered: true
                enabled: button.modelData.enabled
                opacity: button.enabled ? 1 : 0.45
                foreground: root.fg
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                hasCursor: row.hasCursor && root.buttonIndex === button.index
                onClicked: root.clicked(row.index, button.index)
              }
            }
          }
        }

        HoverHandler {
          onPointChanged: if (root.body) root.body.pointAt(row.index, row, point.position)
        }
      }
    }

    // Below the rows, so that they do not shift each time a check starts.
    StatusLine {
      width: parent.width
      visible: root.busy
      text: Ui.TEXT.SHORTCUTS_BUSY
      busy: root.busy
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
    }
  }
}
