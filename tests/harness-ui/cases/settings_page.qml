import QtQuick

// The settings page inside a panel body that is lower than the page, so
// the content has to scroll: every change goes through setSetting, Clear
// history asks first and only its confirmation clears, and the row with
// the keyboard cursor is always brought into view.
QtObject {
  id: root

  property var body: null
  property var closes: []

  function isPage(item) { return typeof item.keyContext === "function" }
  function isField(item) { return item.placeholderText !== undefined }
  function isToggle(item) { return item.checked !== undefined && item.description !== undefined }
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
    return h.find(root.body, function(item) { return item.iconSpinning !== undefined && item.text === text })
  }
  function toggle(h, text) {
    return h.find(root.body, function(item) { return root.isToggle(item) && item.label === text })
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
    return h.findAll(root.body, function(item) { return item.hasCursor === true })
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
        h.equal(h.findAll(root.body, root.isToggle).map(function(item) { return item.label }),
          ["Remember history", "Even out volume"], "one switch per setting of this version")
        h.equal(root.switched(h), [true, false], "showing the service's values")
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
        h.equal(root.toggle(h, "Remember history").hasCursor, true, "on the first row")
        h.key(Qt.Key_Return)
        h.equal(h.calls("setSetting"), [["rememberHistory", false]],
          "Enter flips the setting through the service")
        h.equal(root.toggle(h, "Remember history").checked, true,
          "the switch waits for the service to report it")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Space)
        h.equal(h.calls("setSetting"), [["rememberHistory", false], ["evenVolume", true]],
          "Space on the next row")
        h.equal(h.actions(), ["setSetting", "setSetting"], "and nothing else was called")
        h.resetCalls()

        // The service reports new values: the switches follow.
        h.mock.settings = {
          autoplay: true, maxHeight: 720, videoSize: "quarter", videoCorner: "bottom-right", keepAwake: true,
          sponsorSkip: "ask", markWatched: false, evenVolume: true, rememberHistory: false, preload: true
        }
        h.equal(root.switched(h), [false, true], "the switches show what the service reports")
        h.click(root.toggle(h, "Even out volume"))
        h.equal(h.calls("setSetting"), [["evenVolume", false]], "a click flips it back")
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

        h.key(Qt.Key_Up)
        h.key(Qt.Key_Up)
      },
      function() {
        var first = root.toggle(h, "Remember history")
        h.equal(first.hasCursor, true, "Up twice returns to the first row")
        h.check(root.inView(first), "which was scrolled back into view")
        h.mock.mprisAvailable = false
      },
      function() {
        h.check(root.shown(h, "Media keys are unavailable: mpv-mpris is not installed"),
          "without mpv-mpris the about block says so")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")

        // An open question does not survive leaving the page.
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Down)
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
        var first = root.toggle(h, "Remember history")
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
