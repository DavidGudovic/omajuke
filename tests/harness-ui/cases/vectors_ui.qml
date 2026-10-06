import QtQuick
import "../../../ui/Ui.js" as Ui
import "../../vectors/ui.js" as UiVectors

// Runs the ui/Ui.js vector table inside Qt's JavaScript engine, the one the
// panel really uses: the whole keyboard table, the list states and the text
// helpers must give there what they give under node. Also checks the key
// and modifier numbers in ui/Ui.js against Qt's own constants, which node
// cannot do.
QtObject {
  function run(h) {
    h.check(UiVectors.MODULE === "Ui" && UiVectors.SIDE === "ui", "the table is the one for ui/Ui.js")
    h.check(UiVectors.CASES.length > 200, "the table is complete")
    h.vectors(Ui, UiVectors)

    h.equal(Ui.KEY, {
      Escape: Qt.Key_Escape, Tab: Qt.Key_Tab, Backtab: Qt.Key_Backtab, Backspace: Qt.Key_Backspace,
      Return: Qt.Key_Return, Enter: Qt.Key_Enter, Delete: Qt.Key_Delete, Up: Qt.Key_Up, Down: Qt.Key_Down,
      PageUp: Qt.Key_PageUp, PageDown: Qt.Key_PageDown, Space: Qt.Key_Space, Slash: Qt.Key_Slash
    }, "KEY holds Qt's key numbers")
    h.equal(Ui.MOD, {
      Shift: Qt.ShiftModifier, Control: Qt.ControlModifier, Alt: Qt.AltModifier, Meta: Qt.MetaModifier
    }, "MOD holds Qt's modifier numbers")

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
