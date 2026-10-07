import QtQuick
import "../../../ui/Ui.js" as Ui
import "../../vectors/ui.js" as UiVectors

// Runs the ui/Ui.js vector table inside Qt's JavaScript engine, the one the
// panel really uses: the whole keyboard table, the cursor moves, the list
// states, the rows of the shortcuts page, the screens of the account page
// and the text helpers must give there what they give under node. Also
// checks the key and modifier numbers in ui/Ui.js against Qt's own
// constants, which node cannot do.
QtObject {
  function run(h) {
    h.check(UiVectors.MODULE === "Ui" && UiVectors.SIDE === "ui", "the table is the one for ui/Ui.js")
    h.check(UiVectors.CASES.length > 520, "the table is complete")
    h.vectors(Ui, UiVectors)

    h.equal(Ui.KEY, {
      Escape: Qt.Key_Escape, Tab: Qt.Key_Tab, Backtab: Qt.Key_Backtab, Backspace: Qt.Key_Backspace,
      Return: Qt.Key_Return, Enter: Qt.Key_Enter, Delete: Qt.Key_Delete, Left: Qt.Key_Left, Up: Qt.Key_Up,
      Right: Qt.Key_Right, Down: Qt.Key_Down, PageUp: Qt.Key_PageUp, PageDown: Qt.Key_PageDown,
      Space: Qt.Key_Space, Slash: Qt.Key_Slash, X: Qt.Key_X
    }, "KEY holds Qt's key numbers")
    h.equal(Ui.MOD, {
      Shift: Qt.ShiftModifier, Control: Qt.ControlModifier, Alt: Qt.AltModifier, Meta: Qt.MetaModifier
    }, "MOD holds Qt's modifier numbers")

    // The keys a shortcut is never recorded from are written as numbers in
    // ui/Ui.js. These are Qt's own names for them.
    var held = [
      Qt.Key_Shift, Qt.Key_Control, Qt.Key_Meta, Qt.Key_Alt, Qt.Key_CapsLock, Qt.Key_NumLock,
      Qt.Key_ScrollLock, Qt.Key_Super_L, Qt.Key_Super_R, Qt.Key_Hyper_L, Qt.Key_Hyper_R, Qt.Key_AltGr,
      Qt.Key_unknown
    ]
    var taken = held.filter(function(key) {
      return Ui.captureStep(key, Qt.MetaModifier, false, true) !== "wait"
    })
    h.equal(taken, [], "a key that is only held with others is waited out")
    h.equal(Ui.captureStep(Qt.Key_J, Qt.MetaModifier | Qt.AltModifier, false, true), "take",
      "a letter with modifiers is taken")
    h.equal(Ui.captureStep(Qt.Key_F12, Qt.MetaModifier, false, true), "take", "and so is a function key")
    h.equal(Ui.captureStep(Qt.Key_Escape, Qt.NoModifier, false, false), "cancel", "Esc gives up")

    // What this engine does with the glyph escapes and the padding helper.
    h.equal(Ui.GLYPH.music.length, 2, "a glyph is one surrogate pair")
    h.equal(Ui.GLYPH.music.charCodeAt(0), 0xdb81, "high half")
    h.equal(Ui.GLYPH.music.charCodeAt(1), 0xdf5a, "low half")
    var searching = Ui.TEXT.SEARCHING
    h.equal(searching.charCodeAt(searching.length - 1), 0x2026, "the ellipsis survives loading")
    h.equal(Ui.VERSION, h.mock.version, "the mock answers with the view's version")
    h.finish()
  }
}
