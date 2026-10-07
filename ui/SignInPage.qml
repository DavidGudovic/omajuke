pragma ComponentBehavior: Bound

import QtQuick
import qs.Commons
import qs.Ui
import "Ui.js" as Ui

// The account page: signing in to YouTube and out again. It is the only
// place a sign-in can be started from, and it says before each step what
// that step does: what is opened, what is kept and where, what the login
// is used for, and what the risk to the account is. Signing in is two
// deliberate presses (go on, then open the browser), and signing out is
// asked about first.
//
// The page runs nothing itself. It shows the stage the service reports and
// asks the service for the next one; the password is typed into the
// browser and never comes near this panel. It owns one thing: that the
// sign-out which just finished was asked for here, so that what remains to
// be done at Google stays on screen.
Item {
  id: root

  property var service: null
  // The PanelBody this page sits in: theme values, the row cursor, the
  // confirmation and the scroll area.
  property var body: null

  // A sign-out asked for on this page has been started.
  property bool signedOutHere: false

  // No text field here: the panel's key router keeps the keyboard.
  readonly property Item focusItem: null

  readonly property color fg: body ? body.fg : Color.foreground
  readonly property string fontFamily: body ? body.fontFamily : Style.font.family
  readonly property color urgent: body ? body.urgent : Color.urgent

  // Every read of the service is guarded: it can go away at any moment.
  readonly property string signInState: service ? String(service.signInState || "") : ""
  readonly property bool signedIn: service ? service.signedIn === true : false
  readonly property string screen: Ui.signInScreen(signInState, signedIn)
  // The browser that would be opened, "" until it has been looked up.
  readonly property string browserPath: service ? String(service.signInBrowserPath || "") : ""
  readonly property string errorCode: service ? String(service.signInError || "") : ""
  readonly property string errorText: service && errorCode !== ""
    ? String(service.errorText(errorCode) || "") : ""

  // A login file lies on disk, whether or not anybody is signed in with it.
  readonly property bool loginSaved: service ? service.loginSaved === true : false

  // The buttons of the screen, which are also the rows the cursor visits.
  readonly property var buttons: Ui.signInButtons(screen, loginSaved)
  readonly property bool finding: screen === "confirm" && browserPath === ""
  readonly property bool working: finding || screen === "exporting" || screen === "verifying"
    || screen === "leaving"
  readonly property bool failed: screen === "failed" || (screen === "off" && errorText !== "")
  // Where things stand, in one line. Every screen has one, except the
  // first, which is all explanation.
  readonly property string statusText: {
    if (root.screen === "confirm") return root.finding ? Ui.TEXT.SIGNIN_FINDING : ""
    if (root.screen === "browser") return Ui.TEXT.SIGNIN_IN_BROWSER
    if (root.screen === "exporting") return Ui.TEXT.SIGNIN_EXPORTING
    if (root.screen === "verifying") return Ui.TEXT.SIGNIN_VERIFYING
    if (root.screen === "on") return Ui.TEXT.SIGNIN_ON
    if (root.screen === "leaving") return Ui.TEXT.SIGNING_OUT
    if (root.screen === "failed") return root.errorText !== "" ? root.errorText : Ui.TEXT.SIGNIN_FAILED
    if (root.errorText !== "") return root.errorText
    return root.signedOutHere ? Ui.TEXT.SIGNED_OUT : ""
  }
  // Before a sign-in: what it does. The same words stand beside an error,
  // where the next press starts another attempt.
  readonly property bool explaining: screen === "off" || screen === "confirm" || screen === "failed"
  readonly property bool signedInScreen: screen === "on" || screen === "leaving"

  readonly property int rowCount: buttons.length
  readonly property bool cursorOnRow: body
    ? body.cursorActive && body.selectedIndex >= 0 && body.selectedIndex < rowCount : false
  readonly property string rowKind: cursorOnRow ? "setting" : ""

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
    if (action === "activate" && root.cursorOnRow) root.press(root.buttons[root.body.selectedIndex])
  }

  // ---- Buttons ----

  function buttonLabel(name) {
    if (name === "begin") return root.screen === "failed" ? Ui.TEXT.SIGNIN_RETRY : Ui.TEXT.SIGNIN_CONTINUE
    if (name === "open") return Ui.TEXT.SIGNIN_OPEN_BROWSER
    if (name === "signout") return Ui.TEXT.SIGNOUT
    return Ui.TEXT.CANCEL
  }

  // The browser cannot be opened before it is known which one it is.
  function usable(name) {
    return name !== "open" || root.browserPath !== ""
  }

  // Presses a button, for a click and for Enter alike.
  function press(name) {
    if (!root.service || root.buttons.indexOf(name) === -1 || !root.usable(name)) return
    if (name === "begin") {
      root.signedOutHere = false
      root.service.beginSignIn()
    } else if (name === "open") {
      root.service.confirmSignIn()
    } else if (name === "cancel") {
      root.service.cancelSignIn()
    } else if (name === "signout") {
      root.askSignOut()
    }
  }

  // Signing out deletes the saved login, so the user is asked first.
  function askSignOut() {
    if (!root.body) return
    root.body.confirm(Ui.TEXT.SIGNOUT_ASK, Ui.TEXT.SIGNOUT, function() {
      if (!root.service) return
      root.signedOutHere = true
      root.service.signOut()
    })
  }

  // Another screen has other buttons in the same places. The highlight
  // lets go, so that a second Enter does not answer a question the first
  // one only brought up (Open browser, then Cancel in its place).
  onScreenChanged: if (root.body) root.body.dropCursor()

  implicitHeight: column.implicitHeight

  Column {
    id: column
    width: parent.width
    spacing: Style.space(10)

    StatusLine {
      width: parent.width
      visible: root.statusText !== ""
      text: root.statusText
      busy: root.working
      isError: root.failed
      fg: root.fg
      urgent: root.urgent
      fontFamily: root.fontFamily
    }

    // Which program will be started, by its full path.
    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.screen === "confirm" && root.browserPath !== ""
      text: Ui.TEXT.SIGNIN_BROWSER + ": " + root.browserPath
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      elide: Text.ElideMiddle
    }

    // ---- What signing in means ----

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.explaining
      text: Ui.TEXT.SIGNIN_WHAT
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.explaining || root.signedInScreen
      text: Ui.TEXT.SIGNIN_USE
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.explaining || root.signedInScreen
      text: Ui.TEXT.SIGNIN_WHERE
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.explaining
      text: Ui.TEXT.SIGNIN_RISK
      color: root.urgent
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    // ---- What signing out does and does not do ----

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.signedInScreen
      text: Ui.TEXT.SIGNOUT_NOTE
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    // ---- The next step ----

    Row {
      visible: root.buttons.length > 0
      spacing: Style.space(6)

      Repeater {
        model: root.buttons

        delegate: Button {
          id: button
          required property var modelData
          required property int index

          text: root.buttonLabel(button.modelData)
          bordered: true
          enabled: root.usable(button.modelData)
          opacity: button.enabled ? 1 : 0.45
          // Lettered in the accent colour under the cursor, like every
          // framed button of the panel.
          foreground: button.hasCursor ? Color.accent : root.fg
          fontFamily: root.fontFamily
          hasCursor: root.cursorOnRow && root.body.selectedIndex === button.index
          onHasCursorChanged: if (button.hasCursor && root.body) root.body.ensureVisible(button)
          onClicked: {
            if (root.body) root.body.setCursor(button.index)
            root.press(button.modelData)
          }

          HoverHandler {
            onPointChanged: if (root.body) root.body.pointAt(button.index, button, point.position)
          }
        }
      }
    }
  }
}
