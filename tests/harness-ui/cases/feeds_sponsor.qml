import QtQuick

// What signing in and the sponsor question add to the main page. The
// question about skipping sponsor segments is one notice with two buttons,
// answered by pointer or keyboard, and it stays until the service takes it
// away. Signed in, a row of chips picks one of the account's lists in place
// of the home list: its videos are opened or queued, its playlists only
// opened, each state of a list has its line, and a search still comes
// first. The strip says for a moment that a segment was skipped. Nothing
// is fetched or answered by the page itself.
QtObject {
  id: root

  property var body: null

  readonly property var chipLabels: [
    "Home", "For you", "Subscriptions", "Watch later", "Playlists"
  ]
  readonly property var recents: [
    { id: "AAAAAAAAAAA", title: "Recent one", channel: "Channel A", duration: 61, live: false },
    { id: "BBBBBBBBBBB", title: "Recent two", channel: "Channel B", duration: 125, live: false }
  ]
  readonly property var feed: [
    { key: 11, playlist: false, id: "CCCCCCCCCCC", title: "Feed one", channel: "Channel C", duration: 90,
      live: false },
    { key: 12, playlist: false, id: "DDDDDDDDDDD", title: "Feed two", channel: "Channel D", duration: 95,
      live: false },
    { key: 13, playlist: true, listId: "PL0123456789", title: "<i>My list</i>", count: 12 }
  ]
  readonly property var listVideos: [
    { key: 21, playlist: false, id: "EEEEEEEEEEE", title: "Listed one", channel: "Channel E", duration: 70,
      live: false },
    { key: 22, playlist: false, id: "FFFFFFFFFFF", title: "Listed two", channel: "Channel F", duration: 75,
      live: false }
  ]

  function isField(item) { return item.placeholderText !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }
  function isButton(item) { return item.iconSpinning !== undefined }
  function isNotice(item) { return item.primaryLabel !== undefined && item.visible }

  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  function titles(h) {
    return h.findAll(root.body, root.isRow).map(function(row) { return row.track.title })
  }
  function highlighted(h) {
    return h.findAll(root.body, function(item) { return root.isRow(item) && item.hasCursor })
      .map(function(row) { return row.track.title })
  }
  function row(h, title) {
    return h.find(root.body, function(item) { return root.isRow(item) && item.track.title === title })
  }
  function button(h, text) {
    return h.find(root.body, function(item) {
      return root.isButton(item) && item.visible && item.text === text
    })
  }
  // The chips on screen, left to right.
  function chips(h) {
    return h.findAll(root.body, function(item) {
      return root.isButton(item) && item.visible && root.chipLabels.indexOf(item.text) !== -1
    })
  }
  function chipTexts(h) { return root.chips(h).map(function(chip) { return chip.text }) }
  function marked(h) {
    return root.chips(h).filter(function(chip) { return chip.selected })
      .map(function(chip) { return chip.text })
  }
  // Every button that carries the cursor, by its label.
  function cursorButtons(h) {
    return h.findAll(root.body, function(item) { return root.isButton(item) && item.hasCursor === true })
      .map(function(item) { return item.text })
  }
  function showFeed(h, kind, state, rows, error) {
    h.mock.feedKind = kind
    h.mock.feedError = error
    h.mock.feedRows = rows
    h.mock.feedState = state
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
        h.equal(root.titles(h), ["Recent one", "Recent two"], "signed out: the home list")
        h.equal(root.chipTexts(h), [], "and no chips")
        h.equal(h.findAll(root.body, root.isNotice).length, 0, "no notice")
        h.resetCalls()

        // ---- The sponsor question ----
        h.mock.sponsorPrompt = true
      },
      function() {
        h.equal(h.findAll(root.body, root.isNotice).length, 1, "the question is one notice")
        h.check(root.shown(h, "Skip sponsor segments? Looks up a hash prefix of the video id at"
          + " sponsor.ajay.app."), "which says what skipping looks up, and where")
        h.check(root.button(h, "Enable") !== null && root.button(h, "No thanks") !== null,
          "with a button for each answer")
        h.equal(h.actions(), [], "asking calls nothing")
        h.check(h.find(root.body, root.isField).activeFocus, "and the field keeps the keyboard")

        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Recent one"], "the first arrow key highlights a row, not an answer")
        h.key(Qt.Key_Up)
        h.equal(root.cursorButtons(h), ["No thanks"], "Up from the first row reaches the nearer answer")
        h.equal(root.highlighted(h), [], "and the row lets go")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.actions(), [], "Shift+Enter answers nothing")
        h.key(Qt.Key_Up)
        h.equal(root.cursorButtons(h), ["Enable"], "Up again: the other answer")
        h.key(Qt.Key_Return)
        h.equal(h.calls("answerSponsorPrompt"), [[true]], "Enter on Enable says yes")
        h.equal(h.actions(), ["answerSponsorPrompt"], "and nothing else")
        h.equal(h.findAll(root.body, root.isNotice).length, 1,
          "the question stays until the service takes it away")
        h.resetCalls()
        h.click(root.button(h, "No thanks"))
        h.equal(h.calls("answerSponsorPrompt"), [[false]], "a click on No thanks says no")
        h.resetCalls()
        h.mock.sponsorPrompt = false
      },
      function() {
        h.equal(h.findAll(root.body, root.isNotice).length, 0, "answered, the question is gone")
        h.equal(root.cursorButtons(h), [], "and the cursor with it")

        // ---- Signed in: the chips ----
        h.mock.signedIn = true
      },
      function() {
        h.equal(root.chipTexts(h), root.chipLabels, "signed in: the home list and four lists as chips")
        h.equal(root.marked(h), ["Home"], "the home list is the one that is shown")
        h.equal(root.titles(h), ["Recent one", "Recent two"], "and it still is")
        h.equal(h.actions(), [], "signing in fetched nothing")

        h.click(root.button(h, "Subscriptions"))
        h.equal(h.calls("selectFeed"), [["subs"]], "a click on a chip asks the service for that list")
        h.equal(h.actions(), ["selectFeed"], "and for nothing else")
        h.equal(root.marked(h), ["Home"], "the chips wait for the service to report it")
        h.resetCalls()
        root.showFeed(h, "subs", "loading", [], "")
      },
      function() {
        h.equal(root.marked(h), ["Subscriptions"], "the reported list is marked")
        h.check(root.shown(h, "Loading…"), "a list on its way says so")
        h.equal(root.titles(h), [], "and the home rows are gone")
        h.check(!root.shown(h, "RECENTLY PLAYED"), "with their heading")
        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), [], "there is no row to highlight behind the line")
        h.equal(root.cursorButtons(h), ["Subscriptions"], "so the arrow key lands on the chips")
        h.equal(h.actions(), [], "which fetches nothing")
        root.showFeed(h, "subs", "rows", root.feed, "")
      },
      function() {
        h.equal(root.titles(h), ["Feed one", "Feed two", "<i>My list</i>"],
          "the list's rows, a title with markup shown as written")
        h.check(root.shown(h, "Playlist, 12 videos"), "a playlist says what it is and how much it holds")
        h.check(!root.shown(h, "Loading…"), "the loading line is gone")
        h.equal(h.calls("wantThumbs"), [[["CCCCCCCCCCC"]], [["DDDDDDDDDDD"]]],
          "the videos asked for their thumbnails, the playlist for none")
        h.equal(h.actions(), [], "showing the rows called nothing")
        h.equal(root.highlighted(h), [], "no row is highlighted in a list that just arrived")

        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Feed one"], "Down highlights its first row")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.calls("enqueueTrack").length, 1, "Shift+Enter on a video queues it")
        h.equal(h.calls("enqueueTrack")[0][0].id, "CCCCCCCCCCC", "as the track the service listed")
        h.key(Qt.Key_Return)
        h.equal(h.calls("openFeedRow"), [[11]], "Enter opens the row by its key")
        h.equal(h.calls("playTrack"), [], "which is the service's to play")
        h.equal(h.calls("hintHighlight"), [], "a list row is never reported as rested on")
        h.resetCalls()

        h.key(Qt.Key_Down)
        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["<i>My list</i>"], "Down, Down: the playlist")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.actions(), [], "a playlist cannot be queued")
        var playlist = root.row(h, "<i>My list</i>")
        h.equal(playlist.actionIcon, "", "and has no button for it")
        h.check(root.row(h, "Feed two").actionIcon !== "", "where a video has one")
        h.key(Qt.Key_Return)
        h.equal(h.calls("openFeedRow"), [[13]], "Enter opens it")
        h.resetCalls()

        // The service reads the playlist: its videos take the rows' place.
        root.showFeed(h, "playlists", "loading", [], "")
      },
      function() {
        h.equal(root.highlighted(h), [], "while it loads nothing is highlighted")
        h.check(!root.shown(h, "<i>My list</i>"), "and no playlist is named above the list yet")
        h.mock.feedTitle = "<i>My list</i>"
        h.check(root.shown(h, "<i>My list</i>"),
          "the title of the opened playlist stands above the list, as it is written")
        root.showFeed(h, "playlists", "rows", root.listVideos, "")
      },
      function() {
        h.equal(root.titles(h), ["Listed one", "Listed two"], "the playlist's videos")
        var heading = h.find(root.body, function(item) {
          return item.text === "<i>My list</i>" && item.elide !== undefined && item.thumbPath === undefined
        })
        h.check(heading !== null && heading.visible, "under the playlist's title")
        h.equal([heading.textFormat, heading.maximumLineCount], [Text.PlainText, 1],
          "which is plain text on one line, whatever YouTube put into it")
        h.equal(root.highlighted(h), [], "none of them highlighted by the Enter that opened the list")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), [], "so a second Enter plays nothing")
        h.equal(root.highlighted(h), ["Listed one"], "it shows the highlight")
        h.equal(root.marked(h), ["Playlists"], "the chip of the list is marked")
        h.click(root.button(h, "Playlists"))
        h.equal(h.calls("selectFeed"), [["playlists"]],
          "and a click on it asks again: the way back to the playlists")
        h.resetCalls()

        // ---- The chips from the keyboard ----
        h.key(Qt.Key_Up)
        h.equal(root.cursorButtons(h), ["Playlists"],
          "Up from the first row reaches the chips, on the list shown")
        h.equal(root.highlighted(h), [], "and the row lets go")
        h.key(Qt.Key_Right)
        h.equal(root.cursorButtons(h), ["Playlists"], "Right: it is the last chip")
        h.key(Qt.Key_Left)
        h.equal(root.cursorButtons(h), ["Watch later"], "Left: the chip before it")
        h.equal(h.actions(), [], "moving along the chips fetches nothing")
        h.key(Qt.Key_Return)
        h.equal(h.calls("selectFeed"), [["later"]], "Enter asks for the chip's list")
        h.resetCalls()
        for (var i = 0; i < 9; i++) h.key(Qt.Key_Left)
        h.equal(root.cursorButtons(h), ["Home"], "Left stops at the first chip")
        h.key(Qt.Key_Return)
        h.equal(h.calls("selectFeed"), [[""]], "which asks for the home list")
        h.resetCalls()
        h.key(Qt.Key_Down)
        h.equal(root.highlighted(h), ["Listed one"], "Down returns to the rows")
        h.equal(root.cursorButtons(h), [], "and leaves the chips")

        // ---- A list that holds nothing, and one that could not be read ----
        h.mock.feedTitle = ""
        root.showFeed(h, "later", "empty", [], "")
      },
      function() {
        h.check(!root.shown(h, "<i>My list</i>"), "a list of the account itself has no title above it")
        h.check(root.shown(h, "Nothing here yet"), "an empty list says so")
        h.equal(root.titles(h), [], "and shows no rows")
        root.showFeed(h, "later", "error", [], "E_FEED")
      },
      function() {
        h.check(root.shown(h, "text of E_FEED"), "a list that could not be read shows the service's sentence")
        h.check(!root.shown(h, "Nothing here yet"), "which is not the same as an empty one")
        h.equal(root.chipTexts(h), root.chipLabels, "the chips stay, to pick another")

        // ---- A search comes first ----
        root.showFeed(h, "subs", "rows", root.feed, "")
        h.mock.searchResults = [root.recents[1]]
        h.mock.searchQuery = "two"
        h.mock.searchState = "results"
      },
      function() {
        h.equal(root.titles(h), ["Recent two"], "search results stand in front of a list")
        h.equal(root.chipTexts(h), [], "and the chips step aside")
        h.mock.searchState = "idle"
        h.mock.searchQuery = ""
        h.mock.searchResults = []
      },
      function() {
        h.equal(root.titles(h), ["Feed one", "Feed two", "<i>My list</i>"],
          "without a search the list is back")
        h.equal(root.marked(h), ["Subscriptions"], "with its chip")
        h.resetCalls()

        // ---- Signed out again ----
        h.mock.signedIn = false
      },
      function() {
        h.equal(root.chipTexts(h), [], "signed out: no chips")
        h.equal(root.titles(h), ["Recent one", "Recent two"],
          "and the home list, whatever list the service still names")
        h.equal(h.actions(), [], "nothing was asked of the service")
        h.mock.signedIn = true

        // ---- The strip after a skip ----
        h.mock.currentTrack = {
          id: "AAAAAAAAAAA", title: "Recent one", channel: "Channel A", duration: 300, live: false, key: 1,
          auto: false
        }
        h.mock.queue = [h.mock.currentTrack]
        h.mock.queueIndex = 0
        h.mock.duration = 300
        h.mock.position = 20
        h.mock.playbackState = "playing"
        h.mock.playing = true
        h.mock.hasTrack = true
      },
      function() {
        var strip = h.texts(root.body)
        h.check(strip.indexOf("Channel A") !== -1, "playing: the strip's second line names the channel")
        h.check(!root.shown(h, "Skipped sponsor segment"), "nothing was skipped")
        h.mock.position = 60.2
        h.mock.lastSkip = { category: "sponsor", from: 30, to: 60 }
      },
      function() {
        h.check(root.shown(h, "Skipped sponsor segment"), "right after a skip the strip says so")
        h.mock.position = 75
      },
      function() {
        h.check(!root.shown(h, "Skipped sponsor segment"), "and stops saying it as the track plays on")
        h.mock.position = 60.5
        h.mock.playbackState = "error"
        h.mock.errorCode = "E_NETWORK"
      },
      function() {
        h.check(root.shown(h, "text of E_NETWORK") && !root.shown(h, "Skipped sponsor segment"),
          "an error is more pressing than a skip")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")
        h.equal(h.actions(), [], "the strip called nothing")

        // ---- A closed panel holds no rows ----
        h.close(root.body)
      },
      function() {
        h.check(root.titles(h).length > 0, "while the panel fades the rows stay")
        h.hide(root.body)
      },
      function() {
        h.equal(root.titles(h), [], "once it is hidden no row of any list is left")
        h.equal(root.chips(h).length, 0, "and no chip")
        h.equal(h.calls("selectFeed"), [], "closing asked for no list")
        h.finish()
      }
    ])
  }
}
