import QtQuick

// Real key and pointer events through the panel body on the main page:
// which of them move the highlight, which type, which call the service, and
// that none of them does more than the keyboard table says.
QtObject {
  id: root

  property var body: null
  property var closes: []
  property var switches: []
  property var keptRow: null

  readonly property var recents: [
    { id: "AAAAAAAAAAA", title: "Recent one", channel: "Channel A", duration: 61, live: false },
    { id: "BBBBBBBBBBB", title: "Recent two", channel: "Channel B", duration: 125, live: false },
    { id: "CCCCCCCCCCC", title: "Recent three", channel: "Channel C", duration: 300, live: false }
  ]
  readonly property var results: [
    { id: "DDDDDDDDDDD", title: "Result one", channel: "Channel D", duration: 200, live: false },
    { id: "EEEEEEEEEEE", title: "Result two", channel: "Channel E", duration: 210, live: false }
  ]

  function isField(item) { return item.placeholderText !== undefined }
  function isList(item) { return item.positionViewAtIndex !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }

  function field(h) { return h.find(root.body, root.isField) }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  // Titles of the rows that carry the highlight: never more than one.
  function highlighted(h) {
    return h.findAll(root.body, function(item) { return root.isRow(item) && item.hasCursor })
      .map(function(row) { return row.track.title })
  }
  function row(h, title) {
    return h.find(root.body, function(item) { return root.isRow(item) && item.track.title === title })
  }

  function run(h) {
    h.mock.recents = root.recents
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: h.mock, width: 420, height: 640 })
    if (!root.body) {
      h.finish()
      return
    }
    root.body.closeRequested.connect(function() { root.closes.push("close") })
    root.body.switchRequested.connect(function(direction) { root.switches.push(direction) })

    h.steps([
      function() {
        h.open(root.body)
      },
      function() {
        h.check(root.field(h).activeFocus, "open: typing")
        h.check(root.shown(h, "RECENTLY PLAYED"), "the home list has its heading")
        h.equal(h.findAll(root.body, root.isRow).length, 3, "and one row per recent track")
        h.equal(root.highlighted(h), [], "nothing is highlighted on open")
        h.equal(h.calls("wantThumbs"), [["AAAAAAAAAAA"], ["BBBBBBBBBBB"], ["CCCCCCCCCCC"]].map(function(ids) {
          return [ids]
        }), "each row asked for its own thumbnail")
        h.key(Qt.Key_Down)
      },
      function() {
        h.equal(root.highlighted(h), ["Recent one"],
          "Down: the first press shows the highlight on the first row")
        h.check(!root.field(h).activeFocus, "Down: the focus leaves the field")
        h.check(h.focusItem() !== null && h.focusItem() !== root.field(h), "Down: the key router has it")
        h.key(Qt.Key_Down)
      },
      function() {
        h.equal(root.highlighted(h), ["Recent two"], "Down again moves to the second row")
        h.equal(h.actions(), [], "moving called nothing")
        h.key(Qt.Key_Space)
      },
      function() {
        h.equal(h.actions(), ["playPause"], "Space while browsing toggles playback")
        h.equal(root.field(h).text, "", "and types nothing")
        h.resetCalls()
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal(h.calls("playTrack"), [[root.recents[1]]], "Enter plays the highlighted row")
        h.equal(h.actions(), ["playTrack"], "and does nothing else")
        h.resetCalls()
        h.key(Qt.Key_Return, Qt.ShiftModifier)
      },
      function() {
        h.equal(h.calls("playTrack"), [[root.recents[1]]], "Shift+Enter is Enter until there is a queue")
        h.resetCalls()
        h.key(Qt.Key_Up)
        h.equal(root.highlighted(h), ["Recent one"], "Up moves back")
        h.key(Qt.Key_Up)
        h.equal(root.highlighted(h), ["Recent one"], "and stops at the first row")
        h.key(Qt.Key_PageDown)
        h.equal(root.highlighted(h), ["Recent three"], "PageDown stops at the last row")
        h.key(Qt.Key_PageUp)
        h.equal(root.highlighted(h), ["Recent one"], "PageUp returns to the first")
        h.equal(h.actions(), [], "none of them called anything")
        h.key(Qt.Key_Slash)
      },
      function() {
        var f = root.field(h)
        h.check(f.activeFocus, "slash returns the focus to the field")
        h.equal(f.text, "", "without typing a slash")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Q)
      },
      function() {
        var f = root.field(h)
        h.equal(f.text, "q", "a character typed while browsing lands in the field")
        h.check(f.activeFocus, "and takes the focus there")
        h.key(Qt.Key_Slash)
        h.equal(f.text, "q/", "in the field a slash is a character")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Backspace)
      },
      function() {
        var f = root.field(h)
        h.equal(f.text, "q", "Backspace while browsing deletes the last character")
        h.check(f.activeFocus, "and returns to the field")
        h.key(Qt.Key_Backspace)
        h.equal(f.text, "", "Backspace in the field is the field's own")
        h.equal(h.actions(), [], "no key so far has searched or cleared anything")
        h.type("new")
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal(h.calls("submit"), [["new", false]], "Enter with new text submits it")
        h.equal(h.actions(), ["submit"], "and calls nothing else")
        h.resetCalls()
        // The service took the query and is searching.
        h.mock.searchQuery = "new"
        h.mock.searchState = "searching"
      },
      function() {
        h.check(root.shown(h, "Searching…"), "the search shows as running")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), [], "Enter with the same text while searching calls nothing")
        h.mock.searchResults = root.results
        h.mock.searchState = "results"
      },
      function() {
        h.equal(root.highlighted(h), ["Result one"], "fresh results put the highlight on the first one")
        h.check(root.field(h).activeFocus, "while the field keeps the keyboard")
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal(h.calls("playTrack"), [[root.results[0]]], "so a second Enter plays the top hit")
        h.equal(h.actions(), ["playTrack"], "without searching again")
        h.resetCalls()
        // The track starts and enters the recents, as it does in the service.
        root.keptRow = root.row(h, "Result two")
        h.mock.recents = [root.results[0]].concat(root.recents)
      },
      function() {
        h.check(root.keptRow !== null && root.row(h, "Result two") === root.keptRow,
          "a change of the recents does not rebuild the rows of a search")
        h.equal(root.highlighted(h), ["Result one"], "and leaves the highlight where it was")
        h.equal(h.calls("wantThumbs"), [], "nor are thumbnails asked for again")

        h.click(root.row(h, "Result two"))
        h.equal(h.calls("playTrack"), [[root.results[1]]], "a click on a row plays that row")
        h.equal(root.highlighted(h), ["Result two"], "and the highlight goes with it")
        h.resetCalls()

        // Rows that slid under a resting pointer (new results, a keyboard
        // move) report it once. That is not the user pointing at them.
        root.body.disarmPointer()
        var first = root.row(h, "Result one")
        h.hover(first, 20, 10)
        h.equal(root.highlighted(h), ["Result two"], "the first pointer sample over a row is not a movement")
        h.hover(first, 60, 20)
        h.equal(root.highlighted(h), ["Result one"], "a real movement moves the highlight")
        h.equal(h.actions(), [], "hovering called nothing")

        h.key(Qt.Key_Escape)
        h.key(Qt.Key_Tab)
        h.key(Qt.Key_Backtab, Qt.ShiftModifier)
      },
      function() {
        h.equal(root.closes, ["close"], "Esc asks to close, once")
        h.equal(root.switches, [1, -1], "Tab and Shift+Tab ask for the next and the previous panel")
        h.equal(h.actions(), [], "and none of the three reached the service")
        h.equal(root.field(h).text, "new", "or the field")

        // A pasted link that is not a video link.
        h.mock.returns = { submit: "link" }
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Slash)
        h.type("192.168.1.10/admin")
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal(h.calls("submit"), [["192.168.1.10/admin", false]], "link: submitted once")
        h.check(root.shown(h, "text of E_LINK"), "link: the line shows")
        h.equal(h.find(root.body, root.isList).visible, false, "link: the list is hidden")
        h.resetCalls()
        h.key(Qt.Key_Down)
        h.check(root.field(h).activeFocus, "link: Down finds no row, the field keeps the keyboard")
        h.key(Qt.Key_Return)
        h.key(Qt.Key_Return, Qt.ShiftModifier)
      },
      function() {
        h.equal(h.actions(), [], "link: Down and Enter call nothing while the line shows")
        h.check(root.shown(h, "text of E_LINK"), "link: the line is still there")
        h.key(Qt.Key_Z)
      },
      function() {
        h.check(!root.shown(h, "text of E_LINK"), "link: the line is gone with the next character")
        h.equal(root.field(h).text, "192.168.1.10/adminz", "which was typed")
        h.equal(h.find(root.body, root.isList).visible, true, "and the results are back")
        h.equal(h.actions(), [], "typing it called nothing")

        // Emptying the field returns to the home list.
        h.key(Qt.Key_A, Qt.ControlModifier)
        h.key(Qt.Key_Backspace)
      },
      function() {
        h.equal(root.field(h).text, "", "Ctrl+A and Backspace are the field's own and empty it")
        h.equal(h.actions(), ["clearSearch"], "an emptied field clears the service's search")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")
        h.finish()
      }
    ])
  }
}
