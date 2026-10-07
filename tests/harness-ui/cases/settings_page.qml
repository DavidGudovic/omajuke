import QtQuick

// The settings page inside a panel body that is lower than the page, so
// the content has to scroll: every change goes through setSetting, a row
// that is one of a few values is stepped with Left and Right or picked by
// its chips, the switch for skipping sponsor segments is off until the
// user said yes, two rows lead on to the shortcuts and the account, Clear
// history asks first and only its confirmation clears, and the row with
// the keyboard cursor is always brought into view.
QtObject {
  id: root

  property var body: null
  property var closes: []

  readonly property var labels: [
    "Autoplay", "Start faster", "Even out volume", "Skip sponsor segments", "Keep the screen awake",
    "Remember history"
  ]

  function isPage(item) { return typeof item.keyContext === "function" }
  function isField(item) { return item.placeholderText !== undefined }
  // A switch that is on screen: the one that needs an account is not.
  function isToggle(item) {
    return item.checked !== undefined && item.description !== undefined && item.visible
  }
  function isChoice(item) { return item.options !== undefined && item.description !== undefined }
  function isButton(item) { return item.iconSpinning !== undefined }
  function isDialog(item) { return item.confirmText !== undefined }
  function isFlickable(item) { return item.contentY !== undefined && item.flickableDirection !== undefined }

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
  function toggle(h, text) {
    return h.find(root.body, function(item) { return root.isToggle(item) && item.label === text })
  }
  function choice(h, text) {
    return h.find(root.body, function(item) { return root.isChoice(item) && item.label === text })
  }
  // The chips of a choice row, left to right.
  function chips(h, row) { return h.findAll(row, root.isButton) }
  // The chip that is marked as the current value: its text, or its tooltip
  // when it shows an icon.
  function marked(h, row) {
    return root.chips(h, row).filter(function(chip) { return chip.selected })
      .map(function(chip) { return chip.text !== "" ? chip.text : chip.tooltipText })
  }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  // What each switch shows, top to bottom.
  function switched(h) {
    return h.findAll(root.body, root.isToggle).map(function(item) { return item.checked })
  }
  function dialog(h) { return h.find(root.body, root.isDialog) }
  // The flickable of the body is the outermost one.
  function scroll(h) { return h.find(root.body, root.isFlickable) }

  // Whether item lies completely inside the body's viewport.
  function inView(item) {
    var top = item.mapToItem(root.body, 0, 0).y
    return top >= 0 && top + item.height <= root.body.height
  }
  function cursorRows(h) {
    return h.findAll(root.body, function(item) {
      return item.hasCursor === true && (root.isToggle(item) || root.isChoice(item) || root.isButton(item))
    })
  }
  function settings(changes) {
    var values = {
      autoplay: true, maxHeight: 720, videoSize: "quarter", videoCorner: "bottom-right", keepAwake: true,
      sponsorSkip: "ask", markWatched: false, evenVolume: false, rememberHistory: true, preload: true
    }
    Object.keys(changes).forEach(function(name) { values[name] = changes[name] })
    return values
  }
  function press(h, key, times) {
    for (var i = 0; i < times; i++) h.key(key)
  }

  function run(h) {
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: h.mock, width: 420, height: 120 })
    if (!root.body) {
      h.finish()
      return
    }
    root.body.closeRequested.connect(function() { root.closes.push("close") })

    h.steps([
      function() {
        h.open(root.body)
      },
      function() {
        h.resetCalls()
        h.click(root.iconButton(h, 0xf0493))
      },
      function() {
        h.equal(root.body.page, "settings", "the gear opens the settings page")
        h.check(h.find(root.body, root.isField) === null, "the main page is gone")
        h.check(root.shown(h, "Settings"), "the page has its heading")
        h.check(h.focusItem() !== null && h.focusItem() === root.body.focusItem,
          "the key router has the keyboard")
        h.equal(["PLAYBACK", "VIDEO", "SHORTCUTS", "YOUTUBE ACCOUNT", "HISTORY"].filter(function(heading) {
          return !root.shown(h, heading)
        }), [], "the rows stand under five headings")
        h.equal(h.findAll(root.body, root.isToggle).map(function(item) { return item.label }), root.labels,
          "one switch per setting that is on or off")
        h.equal(root.switched(h), [true, true, false, false, true, true], "showing the service's values")
        h.equal(h.findAll(root.body, root.isChoice).map(function(item) { return item.label }),
          ["Video quality", "Video size", "Video corner"], "one row of chips per setting with a few values")
        h.equal(root.chips(h, root.choice(h, "Video quality")).map(function(chip) { return chip.text }),
          ["480p", "720p", "1080p"], "the quality chips")
        h.equal(root.chips(h, root.choice(h, "Video size")).map(function(chip) { return chip.text }),
          ["1/6", "1/4", "1/3", "1/2"], "the size chips")
        h.equal(root.chips(h, root.choice(h, "Video corner")).map(function(chip) { return chip.tooltipText }),
          ["Top left", "Top right", "Bottom left", "Bottom right"], "the corner chips, each explained")
        var rows = ["Video quality", "Video size", "Video corner"]
        h.equal(rows.map(function(label) { return root.marked(h, root.choice(h, label)) }),
          [["720p"], ["1/4"], ["Bottom right"]], "each row marks the service's value, and only that one")
        h.check(root.shown(h, "Prepare the highlighted result before you press Enter. YouTube sees a lookup"
          + " for the top result of each search and for any result you rest on."),
            "the row that starts tracks faster says what YouTube sees of it")
        h.check(root.shown(h, "OmaJuke " + h.mock.version), "the about line names the running version")
        h.check(!root.shown(h, "Media keys are unavailable: mpv-mpris is not installed"),
          "no media-key warning")
        h.equal(h.calls("setPositionWatch"), [[false]], "leaving the main page released the position watch")
        h.equal(h.actions(), [], "opening the page changed nothing")
        h.equal(root.cursorRows(h).length, 0, "no row has the cursor yet")
        var flick = root.scroll(h)
        h.check(flick.contentHeight > flick.height, "the page is higher than the body, so it scrolls")
        h.equal(flick.contentY, 0, "and starts at the top")

        h.key(Qt.Key_Down)
        h.equal(root.cursorRows(h).length, 1, "Down shows the cursor")
        h.equal(root.toggle(h, "Autoplay").hasCursor, true, "on the first row")
        h.key(Qt.Key_Return)
        h.equal(h.calls("setSetting"), [["autoplay", false]], "Enter flips the setting through the service")
        h.equal(root.toggle(h, "Autoplay").checked, true, "the switch waits for the service to report it")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Space)
        h.equal(h.calls("setSetting"), [["autoplay", false], ["preload", false]], "Space on the next row")
        // Left and Right mean nothing on a switch.
        h.key(Qt.Key_Left)
        h.key(Qt.Key_Right)
        h.equal(h.actions(), ["setSetting", "setSetting"], "and nothing else was called")
        h.resetCalls()

        // The service reports new values: the switches follow.
        h.mock.settings = root.settings({ autoplay: false, evenVolume: true, rememberHistory: false })
        h.equal(root.switched(h), [false, true, true, false, true, false],
          "the switches show what is reported")
        h.key(Qt.Key_Down)
      },
      function() {
        var even = root.toggle(h, "Even out volume")
        h.check(even.hasCursor && root.inView(even), "Down brings the third switch into view")
        h.click(even)
        h.equal(h.calls("setSetting"), [["evenVolume", false]], "a click flips it back")
        h.resetCalls()
        h.mock.settings = root.settings({})

        h.key(Qt.Key_Down)
      },
      function() {
        // Skipping sponsor segments: not decided yet is not on.
        var sponsor = root.toggle(h, "Skip sponsor segments")
        h.check(sponsor.hasCursor && root.inView(sponsor), "Down: the switch for sponsor segments")
        h.equal(sponsor.description, "Looks up a hash prefix of the video id at sponsor.ajay.app.",
          "which says what skipping looks up, and where")
        h.equal(sponsor.checked, false, "undecided shows as off")
        h.key(Qt.Key_Return)
        h.equal(h.calls("setSetting"), [["sponsorSkip", true]], "Enter switches it on")
        h.resetCalls()
        h.mock.settings = root.settings({ sponsorSkip: "on" })
        h.equal(sponsor.checked, true, "on shows as on")
        h.key(Qt.Key_Space)
        h.equal(h.calls("setSetting"), [["sponsorSkip", false]], "and is switched off again")
        h.resetCalls()
        h.mock.settings = root.settings({ sponsorSkip: "off" })
        h.equal(sponsor.checked, false, "off shows as off")
        h.click(sponsor)
        h.equal(h.calls("setSetting"), [["sponsorSkip", true]], "a click switches it on")
        h.resetCalls()
        h.mock.settings = root.settings({})

        h.key(Qt.Key_Down)
      },
      function() {
        // A row that is one of a few values.
        var quality = root.choice(h, "Video quality")
        h.equal(quality.hasCursor, true, "the cursor reaches the quality row")
        h.equal(root.cursorRows(h).length, 1, "which alone has it")
        h.check(root.inView(quality), "and was scrolled into view")
        h.key(Qt.Key_Right)
        h.equal(h.calls("setSetting"), [["maxHeight", 1080]], "Right asks for the next value, as a number")
        h.equal(root.marked(h, quality), ["720p"], "the chips wait for the service to report it")
        h.resetCalls()
        h.key(Qt.Key_Left)
        h.equal(h.calls("setSetting"), [["maxHeight", 480]], "Left asks for the one before")
        h.resetCalls()
        h.mock.settings = root.settings({ maxHeight: 1080 })
        h.equal(root.marked(h, quality), ["1080p"], "the reported value is marked")
        h.key(Qt.Key_Right)
        h.equal(h.actions(), [], "Right stops at the last value")
        h.key(Qt.Key_Return)
        h.equal(h.calls("setSetting"), [["maxHeight", 480]], "Enter goes on from the last value to the first")
        h.resetCalls()
        h.key(Qt.Key_Space)
        h.equal(h.calls("setSetting"), [["maxHeight", 480]], "and so does Space")
        h.resetCalls()

        h.key(Qt.Key_Down)
      },
      function() {
        var size = root.choice(h, "Video size")
        h.equal(size.hasCursor, true, "Down: the size row")
        h.key(Qt.Key_Left)
        h.equal(h.calls("setSetting"), [["videoSize", "sixth"]], "Left on the size row")
        h.key(Qt.Key_Right)
        h.equal(h.calls("setSetting"), [["videoSize", "sixth"], ["videoSize", "third"]], "Right on that row")
        h.resetCalls()
        var chips = root.chips(h, size)
        h.click(chips[3])
        h.equal(h.calls("setSetting"), [["videoSize", "half"]], "a click on a chip asks for that value")
        h.resetCalls()
        h.click(chips[1])
        h.equal(h.actions(), [], "a click on the chip of the current value asks for nothing")

        h.key(Qt.Key_Down)
      },
      function() {
        var corner = root.choice(h, "Video corner")
        h.equal(corner.hasCursor, true, "Down: the corner row")
        h.key(Qt.Key_Left)
        h.equal(h.calls("setSetting"), [["videoCorner", "bottom-left"]], "Left on the corner row")
        h.resetCalls()
        h.key(Qt.Key_Right)
        h.equal(h.actions(), [], "Right stops at the last corner")
        h.click(root.chips(h, corner)[0])
        h.equal(h.calls("setSetting"), [["videoCorner", "top-left"]], "a corner chip asks for its corner")
        h.resetCalls()
        h.mock.settings = root.settings({ videoCorner: "top-left", videoSize: "half" })
        h.equal([root.marked(h, corner), root.marked(h, root.choice(h, "Video size"))],
          [["Top left"], ["1/2"]], "the rows show the new values")
        h.mock.settings = root.settings({})

        h.key(Qt.Key_Down)
      },
      function() {
        var reset = root.button(h, "Reset video position")
        h.check(reset.hasCursor && root.inView(reset), "Down: the button that forgets the window's places")
        h.key(Qt.Key_Left)
        h.key(Qt.Key_Right)
        h.equal(h.actions(), [], "Left and Right mean nothing on a button")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["resetVideoPlacement"], "Enter asks the service to forget them")
        h.click(reset)
        h.equal(h.actions(), ["resetVideoPlacement", "resetVideoPlacement"], "and so does a click")
        h.resetCalls()

        h.key(Qt.Key_Down)
        h.equal(root.toggle(h, "Keep the screen awake").hasCursor, true, "Down: the next switch")
        h.key(Qt.Key_Return)
        h.equal(h.calls("setSetting"), [["keepAwake", false]], "which flips like the others")
        h.resetCalls()

        h.key(Qt.Key_Down)
      },
      function() {
        // The two rows that lead on. Passing over them does nothing.
        var shortcuts = root.button(h, "Shortcuts…")
        h.check(shortcuts.hasCursor && root.inView(shortcuts), "Down: the way to the shortcuts")
        h.key(Qt.Key_Left)
        h.key(Qt.Key_Right)
        h.key(Qt.Key_Down)
      },
      function() {
        var account = root.button(h, "Sign in to YouTube…")
        h.check(account.hasCursor && root.inView(account), "Down: the way to the account")
        h.check(root.toggle(h, "Add plays to YouTube history") === null,
          "signed out, there is no switch for the account's history")
        h.equal(h.actions(), [], "reaching the two rows called nothing")
        h.equal(root.body.page, "settings", "and left the page where it is")

        h.key(Qt.Key_Down)
        h.key(Qt.Key_Return)
        h.equal(h.calls("setSetting"), [["rememberHistory", false]],
          "Down: the next switch flips like the others")
        h.equal(h.actions(), ["setSetting"], "nothing else was called")
        h.resetCalls()

        h.key(Qt.Key_Down)
      },
      function() {
        var clear = root.button(h, "Clear history")
        h.equal(clear.hasCursor, true, "Down reaches the last row")
        h.equal(root.cursorRows(h).length, 1, "which alone has the cursor")
        h.check(root.inView(clear), "the last row was scrolled into view")
        h.check(root.scroll(h).contentY > 0, "by moving the content")
        h.key(Qt.Key_Down)
        h.equal(clear.hasCursor, true, "Down stops at the last row")

        h.equal(root.dialog(h).opened, false, "no question yet")
        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).opened, true, "Enter on Clear history asks first")
        h.equal(root.body.dialogOpen, true, "the body knows a confirmation is open")
        h.equal(root.dialog(h).message, "Clear recently played, the queue and search results?",
          "in these words")
        h.equal(h.actions(), [], "asking clears nothing")

        // Behind the question nothing reacts.
        h.key(Qt.Key_Up)
        h.key(Qt.Key_Space)
        h.key(Qt.Key_A)
        h.equal(clear.hasCursor, true, "the cursor does not move behind the question")
        h.equal(h.actions(), [], "and nothing is called")

        h.key(Qt.Key_Escape)
        h.equal(root.dialog(h).opened, false, "Esc cancels the question")
        h.equal(root.body.page, "settings", "and leaves the page where it is")
        h.equal(h.actions(), [], "cancelling clears nothing")

        h.key(Qt.Key_Return)
        h.key(Qt.Key_Left)
        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).opened, false, "Left, Enter picks Cancel")
        h.equal(h.actions(), [], "which clears nothing either")

        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).selectedIndex, 1, "a new question starts on its confirmation again")
        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).opened, false, "Enter confirms")
        h.equal(h.actions(), ["clearHistory"], "and only the confirmation clears the history, once")
        h.resetCalls()

        // The pointer path: the button asks, the dialog's own buttons answer.
        h.click(clear)
        h.equal(root.dialog(h).opened, true, "a click on Clear history asks as well")
        h.key(Qt.Key_Tab)
        h.equal(root.dialog(h).selectedIndex, 0, "Tab moves inside the question, not to another panel")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), [], "and Cancel was picked")

        h.key(Qt.Key_PageUp)
        h.key(Qt.Key_PageUp)
      },
      function() {
        var first = root.toggle(h, "Autoplay")
        h.equal(first.hasCursor, true, "PageUp twice returns to the first row")
        h.check(root.inView(first), "which was scrolled back into view")
        h.mock.mprisAvailable = false
      },
      function() {
        h.check(root.shown(h, "Media keys are unavailable: mpv-mpris is not installed"),
          "without mpv-mpris the about block says so")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")

        // An open question does not survive leaving the page.
        root.press(h, Qt.Key_PageDown, 2)
        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).opened, true, "a question is open")
        h.close(root.body)
        h.equal(root.dialog(h).opened, false, "closing the panel cancels it")
        h.hide(root.body)
        h.open(root.body)
      },
      function() {
        h.equal(root.body.page, "main", "a reopened panel starts on the main page")
        h.check(h.find(root.body, root.isField).activeFocus, "with the keyboard in the field")
        h.click(root.iconButton(h, 0xf0493))
      },
      function() {
        h.equal(root.body.page, "settings", "settings again")
        // The pointer still rests where the gear was clicked, and the rows
        // slid under it while the page was laid out. That is not pointing.
        h.equal(root.cursorRows(h).length, 0, "the cursor starts hidden on every visit")
        var first = root.toggle(h, "Autoplay")
        h.hover(first, 40, 20)
        h.hover(first, 60, 30)
        h.equal(first.hasCursor, true, "a pointer that moves over a row highlights it")
        h.equal(root.cursorRows(h).length, 1, "and only that row")
        h.resetCalls()
        h.click(root.iconButton(h, 0xf0141))
      },
      function() {
        h.equal(root.body.page, "main", "the back button returns to the main page")
        h.check(h.find(root.body, root.isField).activeFocus, "and the field has the keyboard again")
        h.click(root.iconButton(h, 0xf0493))
      },
      function() {
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "main", "Esc on a sub-page goes back")
        h.equal(root.closes, [], "without closing the panel")
        h.check(h.find(root.body, root.isField).activeFocus, "and the field has the keyboard again")
        h.equal(h.actions(), [], "moving between pages called nothing")
        h.key(Qt.Key_Escape)
        h.equal(root.closes, ["close"], "Esc on the main page closes")
        h.finish()
      }
    ])
  }
}
