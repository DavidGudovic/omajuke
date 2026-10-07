import QtQuick

// The account page, reached from the settings page: what a sign-in does is
// on screen before anything is started; signing in takes two presses, the
// second only once the browser is known; each stage says where things
// stand and can be cancelled; a failure shows the service's reason and
// offers another try; signing out asks first and says what it leaves
// behind. The page starts nothing by being opened.
QtObject {
  id: root

  property var body: null
  property var closes: []

  function isField(item) { return item.placeholderText !== undefined }
  function isButton(item) { return item.iconSpinning !== undefined }
  function isToggle(item) { return item.checked !== undefined && item.description !== undefined }
  function isDialog(item) { return item.confirmText !== undefined }

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
  // The buttons with words on the page, as "Label" or "(Label)" when the
  // button cannot be used.
  function offered(h) {
    return h.findAll(root.body, function(item) {
      return root.isButton(item) && item.visible && item.text !== ""
    }).map(function(item) { return item.enabled ? item.text : "(" + item.text + ")" })
  }
  function cursorButton(h) {
    return h.findAll(root.body, function(item) { return root.isButton(item) && item.hasCursor === true })
      .map(function(item) { return item.text }).join("+")
  }
  function dialog(h) { return h.find(root.body, root.isDialog) }
  // The labels of the switches on screen.
  function switches(h) {
    return h.findAll(root.body, function(item) { return root.isToggle(item) && item.visible })
      .map(function(item) { return item.label })
  }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  // Whether a text is on screen that contains these words.
  function says(h, words) {
    return h.texts(root.body).some(function(text) { return text.indexOf(words) !== -1 })
  }
  function stage(h, state, signedIn, error, browser) {
    h.mock.signInState = state
    h.mock.signedIn = signedIn
    h.mock.signInError = error
    h.mock.signInBrowserPath = browser
  }

  function run(h) {
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: h.mock, width: 420, height: 640 })
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
        h.click(root.iconButton(h, 0xf0493))
      },
      function() {
        h.resetCalls()
        // The row lies below the first screenful: the keyboard brings it up.
        for (var i = 0; i < 11; i++) h.key(Qt.Key_Down)
      },
      function() {
        var open = root.button(h, "Sign in to YouTube…")
        h.check(open !== null && open.hasCursor, "signed out, the settings offer to sign in")
        h.check(root.button(h, "Sign out…") === null, "and not to sign out")
        h.equal(root.switches(h).indexOf("Add plays to YouTube history"), -1,
          "the history switch needs an account and is not there")
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal(root.body.page, "signin", "Enter on the row opens the account page")
        h.check(root.shown(h, "YouTube account"), "which has its heading")
        h.equal(h.actions(), [], "opening the page starts nothing")
        h.check(root.says(h, "opens your browser on a new, empty profile"), "it says what will be opened")
        h.check(root.says(h, "It never sees your password"), "that the password stays in the browser")
        h.check(root.says(h, "saved as cookies.txt in OmaJuke's data folder"), "where the login is kept")
        h.check(root.says(h, "Anything that can read that file can use your YouTube account"),
          "what that file is worth")
        h.check(root.says(h, "Searching and playing stay signed out"), "what the login is used for")
        h.check(root.says(h, "may be restricted or blocked by YouTube"),
          "and what the risk to the account is")
        h.equal(root.offered(h), ["Continue"], "one button goes on")
        h.equal(root.cursorButton(h), "", "which has no cursor yet")

        h.key(Qt.Key_Return)
        h.equal(root.cursorButton(h), "Continue", "the first Enter only shows the cursor")
        h.equal(h.actions(), [], "and starts nothing")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["beginSignIn"], "the second one starts an attempt")
        h.resetCalls()

        // The service is looking for the browser.
        root.stage(h, "confirm", false, "", "")
      },
      function() {
        h.check(root.shown(h, "Looking for your browser…"), "the page says it is looking for the browser")
        h.equal(root.offered(h), ["(Open browser)", "Cancel"],
          "which cannot be opened before it is known which one it is")
        h.equal(root.cursorButton(h), "", "the cursor let go: these are other buttons")
        h.key(Qt.Key_Return)
        h.equal(root.cursorButton(h), "(Open browser)".slice(1, -1), "Enter shows it on the first of them")
        h.key(Qt.Key_Return)
        h.click(root.button(h, "Open browser"))
        h.equal(h.actions(), [], "neither a key nor a click opens a browser that is not known")
        h.check(root.says(h, "may be restricted or blocked by YouTube"), "the risk is still on screen")

        root.stage(h, "confirm", false, "", "/usr/bin/browser-stub")
      },
      function() {
        h.check(root.shown(h, "Browser: /usr/bin/browser-stub"), "the program that would be started is named")
        h.check(!root.shown(h, "Looking for your browser…"), "and the search for it is over")
        h.equal(root.offered(h), ["Open browser", "Cancel"], "now it can be opened")
        h.equal(h.actions(), [], "the service's report opened nothing by itself")
        h.key(Qt.Key_Down)
        h.equal(root.cursorButton(h), "Cancel", "Down reaches Cancel")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["cancelSignIn"], "which gives the attempt up")
        h.resetCalls()
        h.key(Qt.Key_Up)
        h.key(Qt.Key_Space)
        h.equal(h.actions(), ["confirmSignIn"], "Open browser is the one thing that opens it")
        h.resetCalls()

        root.stage(h, "browser", false, "", "/usr/bin/browser-stub")
      },
      function() {
        h.check(root.says(h, "Sign in to YouTube in the browser window that opened, then close that window"),
          "while the browser is open the page says what to do there")
        h.check(root.says(h, "closes by itself after 15 minutes"), "and how long the window stays")
        h.equal(root.offered(h), ["Cancel"], "the stage can be cancelled")
        h.equal(root.cursorButton(h), "", "the cursor let go again")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), [], "so the Enter that opened the browser cannot also cancel it")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["cancelSignIn"], "a deliberate second one cancels")
        h.resetCalls()

        root.stage(h, "exporting", false, "", "/usr/bin/browser-stub")
      },
      function() {
        h.check(root.shown(h, "Saving the login…"), "saving the login is announced")
        h.equal(root.offered(h), ["Cancel"], "and can be cancelled")
        root.stage(h, "verifying", false, "", "/usr/bin/browser-stub")
      },
      function() {
        h.check(root.shown(h, "Checking the login with YouTube…"), "so is trying it out")
        h.equal(root.offered(h), ["Cancel"], "which can be cancelled as well")
        h.click(root.button(h, "Cancel"))
        h.equal(h.actions(), ["cancelSignIn"], "by a click too")
        h.resetCalls()

        root.stage(h, "failed", false, "E_SIGNIN_NONE", "")
      },
      function() {
        h.check(root.shown(h, "text of E_SIGNIN_NONE"), "a failed attempt shows the service's reason")
        h.equal(root.offered(h), ["Try again"], "and offers another try, and no sign-out: nothing was saved")
        h.check(root.says(h, "opens your browser on a new, empty profile"),
          "with what a sign-in does on screen again")
        h.click(root.button(h, "Try again"))
        h.equal(h.actions(), ["beginSignIn"], "which starts a new attempt")
        h.resetCalls()
        root.stage(h, "failed", false, "", "")
      },
      function() {
        h.check(root.shown(h, "Sign-in did not finish"), "a failure without a reason still says something")

        root.stage(h, "on", true, "", "")
      },
      function() {
        h.check(root.shown(h, "Signed in to YouTube"), "signed in, the page says so")
        h.equal(root.offered(h), ["Sign out"], "and offers to sign out")
        h.check(root.says(h, "The session still exists at Google until you remove it"),
          "saying beforehand what signing out leaves at Google")
        h.check(root.says(h, "A deleted file is not securely erased"), "and on the disk")
        h.check(!root.says(h, "opens your browser"), "the sign-in explanation is gone")
        h.equal(h.actions(), [], "nothing was called by signing in")

        h.click(root.button(h, "Sign out"))
        h.equal(root.dialog(h).opened, true, "Sign out asks first")
        h.equal(root.dialog(h).message, "Sign out and delete the saved login?", "in these words")
        h.equal(h.actions(), [], "asking signs nobody out")
        h.key(Qt.Key_Escape)
        h.equal(root.dialog(h).opened, false, "Esc cancels the question")
        h.equal(root.body.page, "signin", "and leaves the page")
        h.equal(h.actions(), [], "and the login")

        h.equal(root.cursorButton(h), "Sign out", "the click left the cursor on the button")
        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).opened, true, "from the keyboard it asks as well")
        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).opened, false, "Enter confirms")
        h.equal(h.actions(), ["signOut"], "and only the confirmation signs out, once")
        h.resetCalls()

        // The login is still being deleted.
        root.stage(h, "on", false, "", "")
      },
      function() {
        h.check(root.shown(h, "Signing out…"), "while the login is being deleted the page says so")
        h.equal(root.offered(h), [], "and there is nothing to press")
        h.key(Qt.Key_Return)
        h.key(Qt.Key_Down)
        h.equal(h.actions(), [], "so no key does anything")
        root.stage(h, "off", false, "", "")
      },
      function() {
        h.check(root.says(h, "Signed out. The session still exists at Google"),
          "after signing out here, what is left at Google stays on screen")
        h.equal(root.offered(h), ["Continue"], "beside the way to sign in again")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")

        // The service ended the session by itself. The login is of no use
        // any more, and its file is still on disk.
        h.mock.loginSaved = true
        root.stage(h, "failed", false, "E_SIGNED_OUT", "")
      },
      function() {
        h.check(root.shown(h, "text of E_SIGNED_OUT"), "a session YouTube ended is reported")
        h.equal(root.offered(h), ["Try again", "Sign out"],
          "with the way to sign in again, and the way to delete the login that is left")
        h.equal(h.actions(), [], "the service's reports called nothing")
        h.click(root.button(h, "Sign out"))
        h.equal(root.dialog(h).opened, true, "Sign out asks first here too")
        h.equal(h.actions(), [], "and asking deletes nothing")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["signOut"], "the confirmation signs out")
        h.resetCalls()
        // A sign-out that could not delete the file leaves the same way open.
        root.stage(h, "off", false, "E_SIGNOUT_LEFT", "")
      },
      function() {
        h.check(root.shown(h, "text of E_SIGNOUT_LEFT"), "a login that could not be deleted is reported")
        h.equal(root.offered(h), ["Continue", "Sign out"], "and can be deleted with another try")
        h.mock.loginSaved = false
        root.stage(h, "failed", false, "E_SIGNED_OUT", "")
      },
      function() {
        h.equal(root.offered(h), ["Try again"], "without a login on disk there is nothing to sign out of")
        h.equal(h.actions(), [], "the service's reports called nothing")
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "settings", "Esc returns to the settings")
        h.equal(root.closes, [], "without closing the panel")
        root.stage(h, "on", true, "", "")
        for (var i = 0; i < 12; i++) h.key(Qt.Key_Down)
      },
      function() {
        h.check(root.button(h, "Sign in to YouTube…") === null, "signed in, the settings no longer offer it")
        h.check(root.button(h, "Sign out…") !== null, "but the way to sign out")
        var watched = h.find(root.body, function(item) {
          return root.isToggle(item) && item.label === "Add plays to YouTube history"
        })
        h.check(root.switches(h).indexOf("Add plays to YouTube history") !== -1,
          "and the history switch is there")
        h.equal(watched.checked, false, "off unless the user switches it on")
        h.equal(watched.hasCursor, true, "the twelfth row is that switch")
        h.resetCalls()
        h.key(Qt.Key_Return)
        h.equal(h.calls("setSetting"), [["markWatched", true]], "Enter switches it on through the service")
        h.equal(h.actions(), ["setSetting"], "and does nothing else")
        h.resetCalls()
        h.key(Qt.Key_Up)
        h.equal(root.button(h, "Sign out…").hasCursor, true, "Up: the account row")
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal(root.body.page, "signin", "which opens the account page")
        h.check(root.shown(h, "Signed in to YouTube"), "on its signed-in screen")
        h.equal(h.actions(), [], "and signs nobody out by itself")
        h.click(root.iconButton(h, 0xf0141))
      },
      function() {
        h.equal(root.body.page, "settings", "the back button returns to the settings as well")
        h.finish()
      }
    ])
  }
}
