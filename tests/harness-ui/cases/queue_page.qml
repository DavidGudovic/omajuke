import QtQuick

// The queue in the panel. On the main page: what is queued after the
// current track heads the home list, Enter plays a queued row in place,
// Shift+Enter and the small button of a row add a track to the queue. On
// the queue page: the whole queue with the playing row marked, the cursor
// starting there, Enter to play, x and Delete to remove, Shift with an
// arrow to carry a row (the cursor follows it to its new place), and Clear
// queue behind a question. Every change is asked of the service by the key
// of the row; the page changes nothing by itself.
QtObject {
  id: root

  property var body: null

  readonly property var one: (
    { id: "AAAAAAAAAAA", title: "Queued one", channel: "Channel A", duration: 61, live: false, key: 1,
      auto: false })
  readonly property var two: (
    { id: "BBBBBBBBBBB", title: "Queued two", channel: "Channel B", duration: 125, live: false, key: 2,
      auto: false })
  readonly property var three: (
    { id: "CCCCCCCCCCC", title: "Queued three", channel: "Channel C", duration: 300, live: false, key: 3,
      auto: false })
  // The same video as the second item, queued a second time by autoplay.
  readonly property var again: (
    { id: "BBBBBBBBBBB", title: "Queued again", channel: "Channel B", duration: 125, live: false, key: 9,
      auto: true })
  readonly property var recent: (
    { id: "DDDDDDDDDDD", title: "Recent one", channel: "Channel D", duration: 200, live: false })

  function isField(item) { return item.placeholderText !== undefined }
  function isList(item) { return item.positionViewAtIndex !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }
  function isButton(item) { return item.iconSpinning !== undefined }
  function isDialog(item) { return item.confirmText !== undefined }

  function glyph(codePoint) {
    var offset = codePoint - 0x10000
    return String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
  }
  function iconButton(h, under, codePoint) {
    var icon = root.glyph(codePoint)
    return h.find(under, function(item) { return item.iconText === icon && item.visible })
  }
  function button(h, text) {
    return h.find(root.body, function(item) {
      return root.isButton(item) && item.text === text && item.visible
    })
  }
  function field(h) { return h.find(root.body, root.isField) }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  function titles(h) {
    return h.findAll(root.body, root.isRow).map(function(row) { return row.track.title })
  }
  function highlighted(h) {
    return h.findAll(root.body, function(item) { return root.isRow(item) && item.hasCursor })
      .map(function(row) { return row.track.title })
  }
  function playing(h) {
    return h.findAll(root.body, function(item) { return root.isRow(item) && item.isCurrent })
      .map(function(row) { return row.track.title })
  }
  function row(h, title) {
    return h.find(root.body, function(item) { return root.isRow(item) && item.track.title === title })
  }
  function dialog(h) { return h.find(root.body, root.isDialog) }

  function run(h) {
    h.mock.queue = [root.one, root.two, root.again]
    h.mock.queueIndex = 0
    h.mock.currentTrack = root.one
    h.mock.hasTrack = true
    h.mock.playbackState = "playing"
    h.mock.playing = true
    h.mock.recents = [root.recent, root.two]
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
        // ---- The main page ----
        h.equal(root.titles(h), ["Queued two", "Queued again", "Recent one", "Queued two"],
          "home: what is queued after the current track, then the recents")
        h.check(root.shown(h, "QUEUE") && root.shown(h, "RECENTLY PLAYED"), "home: under two headings")
        h.equal(root.playing(h), [], "home: an upcoming track is not marked as playing")
        h.equal(h.actions(), [], "home: opening called nothing")

        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Queued two"], "home: Down shows the highlight on the first queued row")
        h.key(Qt.Key_Return)
        h.equal(h.calls("queuePlay"), [[2]], "home: Enter plays a queued row by its key, in place")
        h.equal(h.actions(), ["queuePlay"], "home: and does not replace the queue")
        h.resetCalls()
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.calls("enqueueTrack"), [[root.two]], "home: Shift+Enter queues the track once more")
        h.resetCalls()
        h.key(Qt.Key_Delete)
        h.key(Qt.Key_Down, Qt.ShiftModifier)
        h.equal(root.highlighted(h), ["Queued again"], "home: Shift carries no row here, the arrow moves")
        h.equal(h.actions(), [], "home: and Delete removes nothing")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Return)
        h.equal(h.calls("playTrack"), [[root.recent]], "home: Enter on a recent row plays it as before")
        h.resetCalls()
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.calls("enqueueTrack"), [[root.recent]], "home: Shift+Enter queues it instead")
        h.equal(h.actions(), ["enqueueTrack"], "home: without playing it")
        h.resetCalls()

        // The small button at the right edge of each row.
        h.click(root.iconButton(h, root.row(h, "Queued again"), 0xf0156))
        h.equal(h.actions(), ["queueRemove"], "home: the button of a queued row removes it, playing nothing")
        h.equal(h.calls("queueRemove"), [[9]], "home: by its key")
        h.resetCalls()
        h.click(root.iconButton(h, root.row(h, "Recent one"), 0xf0412))
        h.equal(h.actions(), ["enqueueTrack"], "home: the button of any other row queues it")
        h.equal(h.calls("enqueueTrack"), [[root.recent]], "home: that row's track")
        h.resetCalls()

        // Shift+Enter in the field queues a pasted video link.
        h.mock.returns = { submit: "video" }
        h.key(Qt.Key_Slash)
        h.type("link")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
      },
      function() {
        h.equal(h.calls("submit"), [["link", true]], "field: Shift+Enter submits the text for the queue")
        h.equal(root.field(h).text, "", "field: a link that was queued leaves the field")
        h.mock.returns = ({})
        h.resetCalls()
        h.type("more")
        h.key(Qt.Key_Return)
        h.equal(h.calls("submit"), [["more", false]], "field: Enter alone submits it for playing")
        h.key(Qt.Key_A, Qt.ControlModifier)
        h.key(Qt.Key_Backspace)

        // The service reports another track as the playing one.
        h.mock.queue = [root.one, root.two, root.three, root.again]
        h.mock.queueIndex = 1
        h.mock.currentTrack = root.two
      },
      function() {
        h.equal(root.titles(h), ["Queued three", "Queued again", "Recent one", "Queued two"],
          "home: the queued rows follow the position of the playing track")
        h.equal(root.playing(h), ["Queued two"],
          "home: the recent row of the playing track is marked, the queued copy of its video is not")
        h.resetCalls()
        h.click(root.iconButton(h, root.body, 0xf0411))
      },
      function() {
        // ---- The queue page ----
        h.equal(root.body.page, "queue", "the queue button opens the queue page")
        h.check(root.shown(h, "Queue"), "page: its heading")
        h.check(root.field(h) === null, "page: the main page is gone")
        h.check(h.focusItem() !== null && h.focusItem() === root.body.focusItem,
          "page: the key router has the keyboard")
        h.equal(root.titles(h), ["Queued one", "Queued two", "Queued three", "Queued again"],
          "page: the whole queue in its order, the played part included")
        h.equal(root.playing(h), ["Queued two"], "page: the playing row is marked by its key, and only it")
        h.equal(root.highlighted(h), [], "page: no row has the cursor yet")
        h.check(root.button(h, "Clear queue") !== null, "page: a button to clear the queue")
        h.equal(h.actions(), [], "page: opening it called nothing")

        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Queued two"], "page: the cursor starts on the playing track")
        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Queued three"], "page: Down moves it")
        h.equal(h.actions(), [], "page: moving the cursor called nothing")
        h.key(Qt.Key_Return)
        h.key(Qt.Key_Space)
        h.equal(h.calls("queuePlay"), [[3], [3]], "page: Enter and Space play the row by its key")
        h.resetCalls()
        h.key(Qt.Key_A)
        h.key(Qt.Key_Slash)
        h.key(Qt.Key_Left)
        h.equal(h.actions(), [], "page: other keys mean nothing here")

        // Removing.
        h.key(Qt.Key_X)
        h.equal(h.calls("queueRemove"), [[3]], "page: x removes the row with the cursor")
        h.key(Qt.Key_Delete)
        h.equal(h.calls("queueRemove"), [[3], [3]], "page: and so does Delete")
        h.equal(h.actions(), ["queueRemove", "queueRemove"], "page: nothing else was called")
        h.equal(root.titles(h).length, 4, "page: the row stays until the service reports the new queue")
        h.resetCalls()
        h.mock.queue = [root.one, root.two, root.again]
      },
      function() {
        h.equal(root.titles(h), ["Queued one", "Queued two", "Queued again"], "page: the reported queue")
        h.equal(root.highlighted(h), ["Queued again"], "page: the cursor stands on the row that moved up")

        // Carrying a row.
        h.key(Qt.Key_Up, Qt.ShiftModifier)
        h.equal(h.calls("queueMove"), [[9, -1]], "page: Shift+Up asks to move the row one place up")
        h.equal(root.highlighted(h), ["Queued again"], "page: nothing moves before the service reports it")
        h.mock.queue = [root.one, root.again, root.two]
      },
      function() {
        h.equal(root.titles(h), ["Queued one", "Queued again", "Queued two"], "page: the new order")
        h.equal(root.highlighted(h), ["Queued again"], "page: the cursor went with the row it carried")
        h.key(Qt.Key_Down, Qt.ShiftModifier)
        h.equal(h.calls("queueMove"), [[9, -1], [9, 1]], "page: Shift+Down asks to move it down again")
        h.equal(h.actions(), ["queueMove", "queueMove"], "page: nothing else was called")
        h.mock.queue = [root.one, root.two, root.again]
      },
      function() {
        h.equal(root.highlighted(h), ["Queued again"], "page: and the cursor follows it back")
        h.resetCalls()

        // A move the service refuses leaves nothing to follow.
        h.mock.returns = { queueMove: false }
        h.key(Qt.Key_Down, Qt.ShiftModifier)
        h.equal(h.calls("queueMove"), [[9, 1]], "page: the move was asked for")
        h.mock.queue = [root.again, root.one, root.two]
      },
      function() {
        h.equal(root.highlighted(h), ["Queued two"],
          "page: after a refused move the cursor keeps its place and does not chase the row")
        h.mock.returns = ({})
        h.resetCalls()
        // A move the user walks away from is not followed either.
        h.key(Qt.Key_Up, Qt.ShiftModifier)
        h.key(Qt.Key_Up)
        h.equal(root.highlighted(h), ["Queued one"], "page: the user moved the cursor after asking")
        h.mock.queue = [root.again, root.two, root.one]
      },
      function() {
        h.equal(root.highlighted(h), ["Queued two"], "page: so it stays where the user put it")
        h.resetCalls()

        // The pointer.
        h.click(root.row(h, "Queued one"))
        h.equal(h.calls("queuePlay"), [[1]], "page: a click on a row plays it")
        h.equal(root.highlighted(h), ["Queued one"], "page: and takes the cursor there")
        h.resetCalls()
        h.click(root.iconButton(h, root.row(h, "Queued again"), 0xf0156))
        h.equal(h.actions(), ["queueRemove"], "page: the button of a row removes it without playing it")
        h.equal(h.calls("queueRemove"), [[9]], "page: by its key")
        h.resetCalls()

        // Clear queue.
        h.key(Qt.Key_PageDown)
      },
      function() {
        var clear = root.button(h, "Clear queue")
        h.equal(clear.hasCursor, true, "clear: the cursor reaches the button after the last row")
        h.equal(root.highlighted(h), [], "clear: and no row has it")
        h.key(Qt.Key_X)
        h.key(Qt.Key_Delete)
        h.key(Qt.Key_Up, Qt.ShiftModifier)
        h.equal(h.actions(), [], "clear: x, Delete and Shift+Up act on rows only")
        h.equal(root.highlighted(h), ["Queued one"], "clear: Shift+Up moved the cursor back to the last row")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Return)
        h.equal(root.dialog(h).opened, true, "clear: Enter on the button asks first")
        h.equal(root.dialog(h).message, "Remove every track from the queue?", "clear: in these words")
        h.key(Qt.Key_X)
        h.equal(h.actions(), [], "clear: asking clears nothing, and x does nothing behind the question")
        h.key(Qt.Key_Escape)
        h.equal([root.dialog(h).opened, root.body.page], [false, "queue"],
          "clear: Esc cancels the question only")
        h.click(clear)
        h.equal(root.dialog(h).opened, true, "clear: a click on the button asks as well")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["queueClear"], "clear: only the confirmation clears the queue, once")
        h.resetCalls()
        h.mock.queue = []
        h.mock.queueIndex = -1
        h.mock.currentTrack = null
        h.mock.hasTrack = false
      },
      function() {
        // ---- An empty queue ----
        h.check(root.shown(h, "Queue is empty"), "empty: the page says so")
        h.equal(root.titles(h), [], "empty: no rows")
        h.equal(h.find(root.body, root.isList).visible, false, "empty: no list")
        h.check(root.button(h, "Clear queue") === null, "empty: nothing to clear")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Return)
        h.key(Qt.Key_X)
        h.equal(h.actions(), [], "empty: no key does anything")
        h.equal(root.dialog(h).opened, false, "empty: and no question opens")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")

        // A long queue: only the rows in view exist and ask for a thumbnail.
        var many = []
        for (var i = 1; i <= 60; i++) {
          many.push({
            id: "AAAAAAAAAAA", title: "Track " + i, channel: "Channel", duration: 60, live: false,
            key: 100 + i, auto: false
          })
        }
        h.resetCalls()
        h.mock.queue = many
        h.mock.queueIndex = 39
        h.mock.currentTrack = many[39]
        h.mock.hasTrack = true
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "main", "Esc on the queue page goes back to the main page")
        h.check(root.field(h) !== null && root.field(h).activeFocus, "where the field has the keyboard again")
        h.resetCalls()
        h.click(root.iconButton(h, root.body, 0xf0411))
      },
      function() {
        var created = root.titles(h).length
        h.check(created > 0 && created < 30, "long: only the rows near the view are created")
        // The rows at the top were created first, before the list moved on.
        var asked = h.calls("wantThumbs").length
        h.check(asked >= created && asked < 30, "long: and only rows that existed asked for a thumbnail")
        h.check(root.row(h, "Track 40") !== null, "long: the list opens where the playing track is")
        h.equal(root.playing(h), ["Track 40"], "long: which is marked")
        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Track 40"], "long: and is where the cursor starts")
        h.key(Qt.Key_PageDown)
      },
      function() {
        h.equal(root.highlighted(h), ["Track 46"], "long: PageDown moves six rows on")
        var at = root.row(h, "Track 46")
        var top = at.mapToItem(root.body, 0, 0).y
        h.check(top >= 0 && top + at.height <= root.body.height, "long: and the row is in view")
        h.equal(h.actions(), [], "long: moving through the queue changed nothing")
        h.finish()
      }
    ])
  }
}
