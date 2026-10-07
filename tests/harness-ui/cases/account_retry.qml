import QtQuick

// The one way a video is ever looked up with the saved login: the notice
// the main page shows when a track failed because YouTube shows it only to
// a signed-in user. It is there only while somebody is signed in and only
// for that error, says what a press sends, has one button, and is answered
// by pointer or keyboard. It comes back each time such a track fails: a
// yes is for one track and nothing remembers it. The page looks nothing up
// itself and asks the service for nothing by merely showing the notice.
QtObject {
  id: root

  property var body: null

  readonly property string label: "Play with my account"
  readonly property var recents: [
    { id: "AAAAAAAAAAA", title: "Recent one", channel: "Channel A", duration: 61, live: false },
    { id: "BBBBBBBBBBB", title: "Recent two", channel: "Channel B", duration: 125, live: false }
  ]

  function isField(item) { return item.placeholderText !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }
  function isButton(item) { return item.iconSpinning !== undefined }
  function isNotice(item) { return item.primaryLabel !== undefined && item.visible }

  // The notices on screen, each as the label of its first button.
  function notices(h) {
    return h.findAll(root.body, root.isNotice).map(function(item) { return item.primaryLabel })
  }
  // Whether a text is on screen that contains these words.
  function says(h, words) {
    return h.texts(root.body).some(function(text) { return text.indexOf(words) !== -1 })
  }
  function button(h) {
    return h.find(root.body, function(item) {
      return root.isButton(item) && item.visible && item.text === root.label
    })
  }
  // Every button that carries the cursor, by its label.
  function cursorButtons(h) {
    return h.findAll(root.body, function(item) { return root.isButton(item) && item.hasCursor === true })
      .map(function(item) { return item.text })
  }
  function highlighted(h) {
    return h.findAll(root.body, function(item) { return root.isRow(item) && item.hasCursor })
      .map(function(row) { return row.track.title })
  }
  // The service reports how the current track stands.
  function report(h, state, code) {
    h.mock.errorCode = code
    h.mock.playbackState = state
  }

  function run(h) {
    h.mock.recents = root.recents
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: h.mock, width: 420, height: 640 })
    if (!root.body) {
      h.finish()
      return
    }

    h.steps([
      function() {
        h.open(root.body)
      },
      function() {
        h.equal(root.notices(h), [], "nothing failed: no notice")
        h.resetCalls()

        // ---- Signed out ----
        root.report(h, "error", "E_NEEDS_ACCOUNT")
      },
      function() {
        h.equal(root.notices(h), [], "signed out, a video that needs an account brings no offer")
        h.check(root.button(h) === null, "and no button")
        h.check(!root.says(h, "with your YouTube login"), "nothing speaks of a login nobody has")

        // ---- Signed in ----
        h.mock.signedIn = true
      },
      function() {
        h.equal(root.notices(h), [root.label], "signed in, the same failure is one notice with one button")
        h.check(root.says(h, "text of E_NEEDS_ACCOUNT. OmaJuke can look it up once with your YouTube login."),
          "which says why the track failed and what a press does")
        h.check(root.says(h, "YouTube then sees your account ask for this video."),
          "and what YouTube learns from it")
        h.equal(h.findAll(root.body, root.isNotice)[0].secondaryLabel, "", "there is no second button")
        h.equal(h.actions(), [], "offering it calls nothing")
        h.check(h.find(root.body, root.isField).activeFocus, "and the field keeps the keyboard")

        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Recent one"], "the first arrow key highlights a row, not the offer")
        h.key(Qt.Key_Up)
        h.equal(root.cursorButtons(h).indexOf(root.label), -1, "Up from the first row: the chips come first")
        h.key(Qt.Key_Up)
        h.equal(root.cursorButtons(h), [root.label], "Up again: the offer")
        h.equal(h.actions(), [], "moving the cursor there calls nothing")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.actions(), [], "Shift+Enter does not take it")
        h.key(Qt.Key_Return)
        h.equal(h.calls("playWithAccount"), [[]], "Enter on the button asks for the account to be used")
        h.equal(h.actions(), ["playWithAccount"], "and for nothing else")
        h.resetCalls()
        h.click(root.button(h))
        h.equal(h.actions(), ["playWithAccount"], "a click asks for the same, once")
        h.resetCalls()

        // The service looks the track up.
        root.report(h, "resolving", "")
      },
      function() {
        h.equal(root.notices(h), [], "while the track is looked up the offer is gone")
        h.equal(root.cursorButtons(h).indexOf(root.label), -1, "and the cursor with it")
        root.report(h, "playing", "")
      },
      function() {
        h.equal(root.notices(h), [], "nothing is offered while the track plays")

        // ---- Asked every time ----
        root.report(h, "error", "E_NEEDS_ACCOUNT")
      },
      function() {
        h.equal(root.notices(h), [root.label], "the next track that needs an account is asked about again")
        h.equal(h.actions(), [], "the yes before it took nothing for this one")
        h.equal(root.cursorButtons(h).indexOf(root.label), -1, "and Enter does not rest on the button")

        // ---- Only this error ----
        root.report(h, "error", "E_YT_REFUSED")
      },
      function() {
        h.equal(root.notices(h), [], "a track that failed for another reason brings no offer")
        root.report(h, "playing", "E_NEEDS_ACCOUNT")
      },
      function() {
        h.equal(root.notices(h), [], "nor does a code without a failed track")
        root.report(h, "error", "E_NEEDS_ACCOUNT")
      },
      function() {
        h.equal(root.notices(h), [root.label], "the offer is back with the failure")
        h.mock.signedIn = false
      },
      function() {
        h.equal(root.notices(h), [], "signed out again, the offer is withdrawn")
        h.equal(h.actions(), [], "none of the reports called anything")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")
        h.finish()
      }
    ])
  }
}
