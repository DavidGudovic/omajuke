import QtQuick

// Opening and closing the panel body: the search field has the keyboard
// when the panel opens, what is typed lands in it and calls nothing, a
// reopened panel shows the service's search under a field that matches it,
// the card keeps its height while it fades out, and the "that is a link"
// message belongs to the one page that got it.
QtObject {
  id: root

  property var body: null
  property real heightBeforeClose: 0

  readonly property var tracks: [
    { id: "AAAAAAAAAAA", title: "First result", channel: "Channel A", duration: 61, live: false },
    { id: "BBBBBBBBBBB", title: "Second result", channel: "Channel B", duration: 3700, live: false },
    { id: "CCCCCCCCCCC", title: "Third result", channel: "", duration: null, live: true }
  ]

  function isPage(item) { return typeof item.keyContext === "function" }
  function isField(item) { return item.placeholderText !== undefined }
  function isList(item) { return item.positionViewAtIndex !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }

  function field(h) { return h.find(root.body, root.isField) }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }

  function run(h) {
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: h.mock, width: 420, height: 640 })
    if (!root.body) {
      h.finish()
      return
    }

    h.steps([
      function() {
        h.check(h.find(root.body, root.isPage) === null, "closed: no page is loaded")
        h.equal(h.texts(root.body), [], "closed: nothing is shown")
        h.equal(h.mock.calls, [], "closed: nothing is called")
        h.equal(root.body.implicitHeight, 0, "closed: no height")
        h.open(root.body)
      },
      function() {
        var f = root.field(h)
        h.check(f !== null, "open: the main page with its field exists")
        h.equal(f.placeholderText, "Search YouTube or paste a link", "open: the hint is the constant one")
        h.check(f && f.activeFocus, "open: the field has active focus")
        h.check(h.focusItem() === f, "open: the window's focus item is the field")
        h.equal(root.body.focusItem === f, true, "open: the body names the field as its focus item")
        h.equal(h.calls("notePanelOpen"), [[true]], "open: the service is told once")
        h.equal(h.calls("setPositionWatch"), [[true]], "open: the position watch is requested once")
        h.equal(h.actions(), [], "open: nothing else is called")
        h.check(root.shown(h, "Nothing played yet. Search above, or paste a YouTube link"),
          "open: the empty home text")
        h.key(Qt.Key_A)
        h.key(Qt.Key_Space)
        h.key(Qt.Key_B)
      },
      function() {
        var f = root.field(h)
        h.equal(f.text, "a b", "typing: a, Space and b land in the field")
        h.check(f.activeFocus, "typing: the field keeps the focus")
        h.equal(h.actions(), [], "typing: Space did not toggle playback and nothing was searched")
        // A search arrives from elsewhere (another monitor's panel, the
        // command line) while this panel is open.
        h.mock.searchResults = root.tracks
        h.mock.searchState = "results"
        h.mock.searchQuery = "lofi beats"
      },
      function() {
        var f = root.field(h)
        h.equal(f.text, "lofi beats", "a search from elsewhere reaches the open field")
        h.check(root.shown(h, "First result") && root.shown(h, "Third result"), "its results are listed")
        h.check(root.shown(h, "1:01") && root.shown(h, "1:01:40") && root.shown(h, "LIVE"),
          "with their lengths")
        h.equal(h.findAll(root.body, root.isRow).length, 3, "three rows")
        root.heightBeforeClose = root.body.implicitHeight
        h.check(root.heightBeforeClose > 100, "the card has the height of its content")
        h.close(root.body)
        h.equal(root.body.implicitHeight, root.heightBeforeClose, "close: the height is unchanged at once")
      },
      function() {
        h.equal(root.body.implicitHeight, root.heightBeforeClose, "fading: the height is still unchanged")
        h.check(h.find(root.body, root.isPage) !== null, "fading: the page is still loaded")
        h.equal(h.findAll(root.body, root.isRow).length, 3, "fading: the list is not emptied")
        h.equal(h.calls("notePanelOpen"), [[true], [false]], "close: the service is told")
        h.equal(h.calls("setPositionWatch"), [[true]], "fading: the position watch is still on")
        h.hide(root.body)
      },
      function() {
        h.check(h.find(root.body, root.isPage) === null, "hidden: the page is unloaded")
        h.equal(h.findAll(root.body, root.isRow).length, 0, "hidden: no rows are left")
        h.equal(h.texts(root.body), [], "hidden: nothing is shown")
        h.equal(h.calls("setPositionWatch"), [[true], [false]], "hidden: the position watch is released")
        h.equal(h.actions(), [], "closing called nothing else")
        h.resetCalls()
        h.open(root.body)
      },
      function() {
        var f = root.field(h)
        h.check(f && f.activeFocus, "reopen: the field has the focus again")
        h.equal(f.text, "lofi beats", "reopen: the field is refilled from the service's query")
        h.equal(f.selectedText, "lofi beats", "reopen: and selected, so typing replaces it")
        h.equal(h.findAll(root.body, root.isRow).length, 3, "reopen: the results are listed")
        var highlighted = h.findAll(root.body, function(item) { return root.isRow(item) && item.hasCursor })
        h.equal(highlighted.length, 0, "reopen: no row is highlighted until the user moves")
        h.equal(h.actions(), [], "reopen: nothing is called, in particular no search is cleared")

        // A pasted link that is not a video link.
        h.mock.returns = { submit: "link" }
        h.type("nas/private.mp4")
        h.key(Qt.Key_Return)
      },
      function() {
        var f = root.field(h)
        h.equal(f.text, "nas/private.mp4", "link: typing replaced the selected query")
        h.equal(h.calls("submit"), [["nas/private.mp4", false]], "link: Enter submitted the text once")
        h.check(root.shown(h, "text of E_LINK"), "link: the line is what errorText answered for E_LINK")
        h.equal(h.find(root.body, root.isList).visible, false, "link: the list is hidden")
        h.equal(h.findAll(root.body, function(item) { return root.isRow(item) && item.visible }).length, 0,
          "link: no row shows behind the line")
        h.equal(h.calls("clearSearch"), [], "link: the service's search is left alone")
        h.equal(h.calls("playTrack"), [], "link: nothing is played")
        h.equal(h.actions(), ["submit"], "link: submit is the only call")
        h.close(root.body)
        h.hide(root.body)
      },
      function() {
        h.resetCalls()
        h.open(root.body)
      },
      function() {
        var f = root.field(h)
        h.check(!root.shown(h, "text of E_LINK"), "after reopening the link line is gone")
        h.equal(f.text, "lofi beats", "and the field holds the service's query again")
        h.equal(h.find(root.body, root.isList).visible, true, "over its results")
        h.equal(h.findAll(root.body, root.isRow).length, 3, "all three of them")
        h.equal(h.actions(), [], "without calling anything")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")

        // The bar is rebuilt while the panel is open: the body goes away
        // without ever being closed.
        h.resetCalls()
        h.unmount(root.body)
      },
      function() {
        h.equal(h.calls("notePanelOpen"), [[false]], "destroyed while open: the service gets its count back")
        h.equal(h.calls("setPositionWatch"), [[false]], "destroyed while open: and the position watch")
        h.equal(h.actions(), [], "destroyed while open: nothing else is called")
        h.finish()
      }
    ])
  }
}
