import QtQuick

// The shortcuts page, reached from the settings page: one row per action
// with its key and the buttons its state allows; assigning the proposed
// key, unassigning, copying a line; recording another key in a box that
// keeps every key to itself and takes none before the compositor holds its
// own shortcuts back; and what the page says while a check runs, when the
// compositor cannot be asked, and when a key is taken or cannot be checked.
QtObject {
  id: root

  property var body: null
  property var closes: []
  property var switches: []

  readonly property string proposal: "SUPER + CTRL + ALT + J"

  function isField(item) { return item.placeholderText !== undefined }
  function isButton(item) { return item.iconSpinning !== undefined }
  function isRow(item) {
    return item.hasCursor !== undefined && item.modelData !== undefined && item.modelData !== null
      && item.modelData.buttons !== undefined
  }
  function isCapture(item) { return item.armed !== undefined && item.refused !== undefined }

  function glyph(codePoint) {
    var offset = codePoint - 0x10000
    return String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
  }
  function iconButton(h, codePoint) {
    var icon = root.glyph(codePoint)
    return h.find(root.body, function(item) { return item.iconText === icon && item.visible })
  }
  function button(h, text) {
    return h.find(root.body, function(item) { return root.isButton(item) && item.text === text })
  }
  function rows(h) { return h.findAll(root.body, root.isRow) }
  function row(h, action) {
    return h.find(root.body, function(item) { return root.isRow(item) && item.modelData.action === action })
  }
  // The buttons of a row, left to right, as "Label" or "(Label)" when the
  // button cannot be used.
  function offered(h, action) {
    return h.findAll(root.row(h, action), root.isButton).map(function(item) {
      return item.enabled ? item.text : "(" + item.text + ")"
    })
  }
  function rowButton(h, action, text) {
    return h.find(root.row(h, action), function(item) { return root.isButton(item) && item.text === text })
  }
  // The label of the button that carries the cursor, "" when none does.
  function cursorButton(h) {
    var found = h.findAll(root.body, function(item) { return root.isButton(item) && item.hasCursor === true })
    return found.map(function(item) { return item.text }).join("+")
  }
  function cursorRows(h) {
    return root.rows(h).filter(function(item) { return item.hasCursor }).map(function(item) {
      return item.modelData.action
    })
  }
  function capture(h) { return h.find(root.body, root.isCapture) }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }

  function entry(action, label, status, combo, proposal, note) {
    return { action: action, label: label, combo: combo, status: status, proposal: proposal, note: note }
  }
  function threeRows() {
    return [
      root.entry("panel", "Open panel", "unassigned", "", root.proposal, ""),
      root.entry("video", "Show or hide video", "assigned", "SUPER + CTRL + ALT + V", "", ""),
      root.entry("output", "Next audio output", "config", "SUPER + F9", "", "")
    ]
  }

  function run(h) {
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: h.mock, width: 420, height: 640 })
    if (!root.body) {
      h.finish()
      return
    }
    root.body.closeRequested.connect(function() { root.closes.push("close") })
    root.body.switchRequested.connect(function(direction) { root.switches.push(direction) })
    h.mock.shortcuts = root.threeRows()

    h.steps([
      function() {
        h.open(root.body)
      },
      function() {
        h.click(root.iconButton(h, 0xf0493))
      },
      function() {
        h.resetCalls()
        // The row lies below the first screenful: the keyboard brings it up.
        for (var i = 0; i < 10; i++) h.key(Qt.Key_Down)
      },
      function() {
        var open = root.button(h, "Shortcuts…")
        h.equal(open.hasCursor, true, "the tenth row of the settings leads to the shortcuts")
        h.equal(h.actions(), [], "reaching it calls nothing")
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal(root.body.page, "shortcuts", "Enter on the settings row opens the shortcuts page")
        h.check(root.shown(h, "Shortcuts"), "which has its heading")
        h.equal(h.actions(), ["refreshShortcuts"], "opening it asks for a new check, and for nothing else")
        h.check(h.focusItem() !== null && h.focusItem() === root.body.focusItem,
          "the key router has the keyboard")
        h.equal(root.rows(h).map(function(item) { return item.modelData.label }),
          ["Open panel", "Show or hide video", "Next audio output"], "one row per action")
        h.check(root.shown(h, root.proposal), "the free key that is proposed is shown as a key")
        h.check(root.shown(h, "Not assigned. This key is free"), "and said to be free, not assigned")
        h.check(root.shown(h, "SUPER + CTRL + ALT + V") && root.shown(h, "Assigned"),
          "an assigned key is shown as assigned")
        h.check(root.shown(h, "SUPER + F9") && root.shown(h, "Set in your bindings.lua"),
          "a key from the user's own file is shown as theirs")
        h.equal(root.offered(h, "panel"), ["Assign", "Change…", "Copy line"],
          "nothing assigned: assign the proposal, record another key, or copy a line")
        h.equal(root.offered(h, "video"), ["Unassign", "Change…"], "assigned: unassign or change")
        h.equal(root.offered(h, "output"), ["Change…"], "set in the user's file: only another key here")
        h.check(!root.shown(h, "Checking keys…"), "no check is running")
        h.equal(root.capture(h).visible, false, "nothing is being recorded")
        h.equal(root.cursorRows(h), [], "no row has the cursor yet")
        h.resetCalls()

        h.key(Qt.Key_Return)
        h.equal(root.cursorRows(h), ["panel"], "the first Enter only shows the cursor")
        h.equal(h.actions(), [], "and assigns nothing")
        h.equal(root.cursorButton(h), "Assign", "on the first button of the first row")
        h.key(Qt.Key_Return)
        h.equal(h.calls("assignShortcut"), [["panel", root.proposal]], "Enter assigns the proposed key")
        h.resetCalls()

        h.key(Qt.Key_Right)
        h.equal(root.cursorButton(h), "Change…", "Right moves along the row's buttons")
        h.key(Qt.Key_Right)
        h.key(Qt.Key_Right)
        h.equal(root.cursorButton(h), "Copy line", "and stops at the last one")
        h.equal(root.cursorRows(h), ["panel"], "without leaving the row")
        h.key(Qt.Key_Space)
        h.equal(h.calls("copyShortcutLine"), [["panel", root.proposal]],
          "Copy line hands the action and the proposed key to the service")
        h.check(root.shown(h, "Copied. Paste the line into your bindings.lua"), "and says what to do with it")
        h.equal(h.actions(), ["copyShortcutLine"], "nothing is assigned by copying")
        h.resetCalls()
        h.mock.returns = { copyShortcutLine: false }
        h.key(Qt.Key_Return)
        h.check(root.shown(h, "The line could not be copied"), "a copy that failed says so")
        h.mock.returns = {}
        h.resetCalls()

        h.key(Qt.Key_Left)
        h.equal(root.cursorButton(h), "Change…", "Left moves back")
        h.key(Qt.Key_Return)
      },
      function() {
        var box = root.capture(h)
        h.equal(box.visible, true, "Change… opens the box that records a key")
        h.check(h.focusItem() === box, "and the box has the keyboard")
        h.equal(box.label, "Open panel", "it names the action")
        h.equal(box.armed, false, "without a compositor nothing holds the shortcuts back")
        h.check(root.shown(h, "Waiting for the keyboard. Esc cancels"), "and the box says it is waiting")
        h.equal(h.actions(), [], "opening the box calls nothing")

        h.key(Qt.Key_K, Qt.MetaModifier | Qt.AltModifier)
        h.equal(h.actions(), [], "a key pressed before the shortcuts are held back is not taken")
        h.equal(box.visible, true, "and the box stays open")

        // What the compositor's confirmation does.
        box.armed = true
        h.check(root.shown(h, "Press the new shortcut. Esc cancels"), "armed, the box asks for the key")

        // Every key belongs to the box while it records.
        h.key(Qt.Key_Tab)
        h.key(Qt.Key_Down)
        h.equal(root.switches, [], "Tab does not switch panels while recording")
        h.equal(root.cursorRows(h), ["panel"], "and an arrow does not move the cursor")
        h.equal(h.calls("comboFromKeyEvent"), [[Qt.Key_Tab, Qt.NoModifier], [Qt.Key_Down, Qt.NoModifier]],
          "the service is asked what each key press is")
        h.equal(h.calls("assignShortcut"), [], "and what is no shortcut assigns nothing")
        h.check(root.shown(h, "Hold Super, Ctrl or Alt and press a letter or F1 to F12. Esc cancels"),
          "the box says what a shortcut needs")
        h.equal(box.visible, true, "and stays open for another try")
        h.resetCalls()

        h.key(Qt.Key_Shift, Qt.ShiftModifier)
        h.key(Qt.Key_Meta, Qt.MetaModifier)
        h.equal(h.actions(), [], "a modifier on its own is not a key press to ask about")

        h.mock.returns = { comboFromKeyEvent: "SUPER + ALT + K" }
        h.key(Qt.Key_K, Qt.MetaModifier | Qt.AltModifier)
      },
      function() {
        h.equal(h.calls("comboFromKeyEvent"), [[Qt.Key_K, Qt.MetaModifier | Qt.AltModifier]],
          "the key and the modifiers held go to the service")
        h.equal(h.calls("assignShortcut"), [["panel", "SUPER + ALT + K"]],
          "and the shortcut it names is assigned to the action being changed")
        h.equal(root.capture(h).visible, false, "the box closes")
        h.check(h.focusItem() !== null && h.focusItem() === root.body.focusItem,
          "and the key router has the keyboard again")
        h.equal(root.body.page, "shortcuts", "on the same page")
        h.mock.returns = {}
        h.resetCalls()

        // Esc gives up, and is not a way back while recording.
        h.click(root.rowButton(h, "video", "Change…"))
      },
      function() {
        var box = root.capture(h)
        h.equal(box.visible, true, "a click on Change… records as well")
        h.equal(box.label, "Show or hide video", "for the row that was clicked")
        h.check(h.focusItem() === box, "with the keyboard in the box")
        box.armed = true
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.capture(h).visible, false, "Esc closes the box")
        h.equal(root.body.page, "shortcuts", "and leaves the page where it is")
        h.equal(h.actions(), [], "nothing was asked or assigned")
        h.equal(root.closes, [], "and the panel stays open")

        h.click(root.rowButton(h, "video", "Change…"))
      },
      function() {
        h.equal(root.capture(h).visible, true, "recording again")
        h.click(h.find(root.capture(h), function(item) {
          return root.isButton(item) && item.text === "Cancel"
        }))
      },
      function() {
        h.equal(root.capture(h).visible, false, "the box's own button cancels for the pointer")
        h.equal(h.actions(), [], "and nothing was assigned")

        // The other rows.
        h.equal(root.cursorRows(h), ["video"], "the cursor is on the row that was clicked")
        h.equal(root.cursorButton(h), "Change…", "on the button that was clicked")
        h.key(Qt.Key_Left)
        h.equal(root.cursorButton(h), "Unassign", "Left reaches the row's first button")
        h.key(Qt.Key_Return)
        h.equal(h.calls("unassignShortcut"), [["video"]], "Enter unassigns it")
        h.resetCalls()
        h.key(Qt.Key_Down)
        h.equal(root.cursorRows(h), ["output"], "Down: the row set in the user's file")
        h.equal(root.cursorButton(h), "Change…", "whose one button is Change…")
        h.key(Qt.Key_Left)
        h.key(Qt.Key_Right)
        h.equal(root.cursorButton(h), "Change…", "Left and Right have nowhere to go")
        h.key(Qt.Key_Down)
        h.equal(root.cursorRows(h), ["output"], "Down stops at the last row")
        h.equal(h.actions(), [], "moving called nothing")

        // A check is running: nothing answers until it is over.
        h.mock.shortcutsBusy = true
      },
      function() {
        h.check(root.shown(h, "Checking keys…"), "a running check is announced")
        h.equal(root.offered(h, "panel"), ["(Assign)", "(Change…)", "(Copy line)"],
          "and every button waits for it")
        h.equal(root.offered(h, "video"), ["(Unassign)", "(Change…)"], "on every row")
        h.key(Qt.Key_Return)
        h.key(Qt.Key_Space)
        h.click(root.rowButton(h, "panel", "Assign"))
        h.equal(h.actions(), [], "neither a key nor a click gets through")
        h.equal(root.capture(h).visible, false, "and nothing is recorded")
        h.mock.shortcutsBusy = false
      },
      function() {
        h.check(!root.shown(h, "Checking keys…"), "the line goes when the check is over")
        h.equal(root.offered(h, "panel"), ["Assign", "Change…", "Copy line"], "and the buttons answer again")

        // The check found the key assigned: the row has other buttons now.
        h.key(Qt.Key_PageUp)
        h.equal(root.cursorRows(h), ["panel"], "the cursor is on the first row")
        var rows = root.threeRows()
        rows[0] = root.entry("panel", "Open panel", "assigned", root.proposal, "", "")
        h.mock.shortcuts = rows
      },
      function() {
        h.equal(root.offered(h, "panel"), ["Unassign", "Change…"], "an assigned row offers to unassign")
        h.equal(root.cursorRows(h), [], "and the cursor let go of the row whose buttons changed")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), [], "so a second Enter does not unassign what the first assigned")
        h.equal(root.cursorRows(h), ["panel"], "it only shows the cursor again")

        // A key that went to something else, one that cannot be checked,
        // one that could not be assigned, and no free key to propose.
        h.mock.shortcuts = [
          root.entry("panel", "Open panel", "unassigned", "", "SUPER + ALT + J", "Now used by: <b>Other</b>"),
          root.entry("video", "Show or hide video", "blocked", "SUPER + ALT + V", "", ""),
          root.entry("output", "Next audio output", "failed", "", "", "")
        ]
      },
      function() {
        h.check(root.shown(h, "Now used by: <b>Other</b>"),
          "what took the key is named in the service's words, markup shown as written")
        h.equal(root.offered(h, "panel"), ["Assign", "Change…", "Copy line"],
          "with the next free key on offer")
        h.check(root.shown(h, "SUPER + ALT + J"), "which is shown")
        h.check(root.shown(h, "Cannot confirm that this key is free"),
          "a key that cannot be checked says so")
        h.check(root.shown(h, "SUPER + ALT + V"), "and stays on screen as the key that is wanted")
        h.equal(root.offered(h, "video"), ["Change…", "Copy line"], "it can be changed, or copied as a line")
        h.check(root.shown(h, "That key could not be assigned"), "a key that could not be assigned says so")
        h.equal(root.offered(h, "output"), ["Change…", "(Copy line)"],
          "and without a key to name there is no line to copy")
        h.click(root.rowButton(h, "video", "Copy line"))
        h.equal(h.calls("copyShortcutLine"), [["video", "SUPER + ALT + V"]],
          "the copied line names the wanted key")
        h.resetCalls()

        h.mock.shortcuts = [root.entry("panel", "Open panel", "unassigned", "", "", "")]
      },
      function() {
        h.check(root.shown(h, "Not assigned. No free key to suggest"), "no free key to propose says so")
        h.equal(root.offered(h, "panel"), ["(Assign)", "Change…", "(Copy line)"],
          "and leaves only recording one")

        // The compositor cannot be asked.
        h.mock.shortcuts = root.threeRows()
        h.mock.shortcutsGate = "config-errors"
      },
      function() {
        h.check(root.shown(h, "text of E_HYPR_ERRORS"), "errors in the user's config head the page")
        h.equal(root.offered(h, "panel"), ["(Assign)", "(Change…)", "Copy line"],
          "nothing can be assigned, the line can still be copied")
        h.equal(root.offered(h, "video"), ["(Unassign)", "(Change…)"], "and nothing unassigned")
        h.click(root.rowButton(h, "panel", "Assign"))
        h.click(root.rowButton(h, "video", "Unassign"))
        h.equal(h.actions(), [], "a click on a button that waits does nothing")
        h.click(root.rowButton(h, "panel", "Copy line"))
        h.equal(h.calls("copyShortcutLine"), [["panel", root.proposal]], "Copy line works")
        h.resetCalls()
        h.mock.shortcutsGate = "version"
      },
      function() {
        h.check(root.shown(h, "text of E_HYPR_VERSION. Use Copy line"),
          "an untested compositor version points at Copy line")
        h.equal(root.offered(h, "panel"), ["(Assign)", "(Change…)", "Copy line"], "which is what is left")
        h.mock.shortcutsGate = "no-hyprland"
        h.mock.shortcuts = []
      },
      function() {
        h.check(root.shown(h, "text of E_HYPR_NONE"), "no compositor to ask says so")
        h.equal(root.rows(h).length, 0, "and there are no rows")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Return)
        h.equal(h.actions(), [], "so no key does anything")
        h.mock.shortcutsGate = "ok"
      },
      function() {
        h.check(root.shown(h, "No shortcuts to show yet"), "a page without rows says so")
        h.mock.shortcuts = root.threeRows()
      },
      function() {
        h.equal(h.richTexts(root.body), [], "every text element is plain text")
        h.equal(h.actions(), [], "what the service reported changed nothing by itself")

        // The pointer moves the same cursor.
        var video = root.row(h, "video")
        h.hover(video, 30, 12)
        h.hover(video, 60, 16)
        h.equal(root.cursorRows(h), ["video"], "a pointer that moves over a row highlights it")
        h.click(root.rowButton(h, "video", "Unassign"))
        h.equal(h.calls("unassignShortcut"), [["video"]], "a click presses the button")
        h.resetCalls()

        // Esc first ends a recording, and only the next one leaves the page.
        h.click(root.rowButton(h, "panel", "Change…"))
      },
      function() {
        h.equal(root.capture(h).visible, true, "recording")
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.capture(h).visible, false, "the first Esc ends the recording")
        h.equal(root.body.page, "shortcuts", "on the page")
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "settings", "Esc on the page returns to the settings")
        h.equal(root.closes, [], "without closing the panel")
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "main", "and from there to the main page")
        h.check(h.find(root.body, root.isField).activeFocus, "where the field has the keyboard")
        h.equal(h.actions(), [], "leaving called nothing")
        h.finish()
      }
    ])
  }
}
