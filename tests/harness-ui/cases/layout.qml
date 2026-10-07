import QtQuick

// What stays on screen however much stands above the list: one notice at a
// time, a list that gives way, and a now-playing strip that is never cut.
// Also the row of a track that is known by its link alone, the two ends of
// a page that is longer than the card, which the keyboard reaches like
// every row between them, and the height of the card once a page has given
// way to a single message.
QtObject {
  id: root

  property var body: null
  // The tallest the card lets the page be.
  readonly property int limit: 608
  property real tallest: 0

  readonly property var current: (
    { id: "AAAAAAAAAAA", title: "Playing now", channel: "Channel A", duration: 213, live: false, key: 1,
      auto: false })
  // Queued from a link: nothing but the id is known until its turn comes.
  readonly property var linked: (
    { id: "BBBBBBBBBBB", title: "", channel: "", duration: null, live: true, key: 2, auto: false })
  readonly property var stream: (
    { id: "CCCCCCCCCCC", title: "Live now", channel: "Channel C", duration: null, live: true, key: 3,
      auto: false })

  function isNotice(item) { return item.primaryLabel !== undefined && item.visible }
  function isList(item) { return item.positionViewAtIndex !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }
  function isButton(item) { return item.iconSpinning !== undefined }
  function isPage(item) { return typeof item.keyContext === "function" }
  // The now-playing strip: the one item that says which of its buttons can
  // be pressed.
  function isStrip(item) { return item.usable !== undefined && item.cursorIndex !== undefined }
  // The scroll area of the card, which is not the list inside it.
  function isScroll(item) { return item.contentY !== undefined && item.positionViewAtIndex === undefined }

  function recents() {
    var out = []
    var letters = ["D", "E", "F", "G", "H", "I", "J", "K"]
    for (var i = 0; i < letters.length; i++) {
      out.push({
        id: new Array(12).join(letters[i]), title: "Recent " + letters[i], channel: "Channel", duration: 100,
        live: false
      })
    }
    return out
  }
  function button(h, text) {
    return h.find(root.body, function(item) {
      return root.isButton(item) && item.text === text && item.visible
    })
  }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  function list(h) { return h.find(root.body, root.isList) }
  function scroll(h) { return h.find(root.body, root.isScroll) }
  // The labels of the buttons of the notices on screen.
  function answers(h) {
    var out = []
    h.findAll(root.body, root.isNotice).forEach(function(notice) {
      h.findAll(notice, function(item) { return root.isButton(item) && item.visible })
        .forEach(function(item) { out.push(item.text) })
    })
    return out
  }
  // Where the strip ends, counted from the top of the page.
  function stripEnd(h) {
    var strip = h.find(root.body, root.isStrip)
    return strip ? strip.mapToItem(root.body, 0, strip.height).y : -1
  }
  // The page fits the card and the strip lies whole inside it.
  function whole(h, label) {
    h.check(root.body.implicitHeight <= root.limit, label + ": the page is no taller than the card")
    h.check(root.stripEnd(h) > 0 && root.stripEnd(h) <= root.limit, label + ": the strip is not cut")
    h.check(root.list(h).height >= 94, label + ": the list keeps two rows at least")
  }

  function run(h) {
    h.mock.queue = [root.current, root.linked, root.stream]
    h.mock.queueIndex = 0
    h.mock.currentTrack = root.current
    h.mock.hasTrack = true
    h.mock.playbackState = "playing"
    h.mock.playing = true
    h.mock.recents = root.recents()
    root.body = h.mount("ui/PanelBody.qml", {
      bar: h.bar, service: h.mock, width: 388, height: root.limit, heightLimit: root.limit
    })
    if (!root.body) {
      h.finish()
      return
    }

    h.steps([
      function() {
        h.open(root.body)
      },
      function() {
        // ---- A track that is known by its link alone ----
        h.check(root.shown(h, "youtu.be/BBBBBBBBBBB"), "link: the row names the link in place of a title")
        var rows = h.findAll(root.body, root.isRow)
        var live = rows.filter(function(row) { return row.live }).map(function(row) { return row.track.id })
        h.equal(live, ["CCCCCCCCCCC"], "link: only a track that is known to be live is marked LIVE")

        // ---- Nothing above the list ----
        root.whole(h, "plain")
        root.tallest = root.list(h).height
        h.check(root.tallest > 300, "plain: the list shows its seven rows")
        h.equal(root.answers(h), [], "plain: no notice")

        // ---- Everything at once ----
        h.mock.noticeCode = "N_SKIPPED"
        h.mock.outputNote = "N_OUTPUT_FALLBACK"
        h.mock.sponsorPrompt = true
        h.mock.signedIn = true
        h.mock.playbackState = "error"
        h.mock.playing = false
        h.mock.errorCode = "E_NEEDS_ACCOUNT"
      },
      function() {
        h.equal(root.answers(h), ["Play with my account"],
          "all: one notice, and first the one that waits for a decision about the track")
        root.whole(h, "all")
        h.check(root.list(h).height < root.tallest, "all: the list is what gave way")
        h.mock.errorCode = ""
        h.mock.playbackState = "playing"
        h.mock.playing = true
      },
      function() {
        h.equal(root.answers(h), ["Dismiss"], "then: what the service has to tell")
        root.whole(h, "service")
        h.mock.noticeCode = ""
      },
      function() {
        h.equal(root.answers(h), ["Choose output"], "then: that the chosen output is gone")
        root.whole(h, "output")
        h.mock.outputNote = ""
      },
      function() {
        h.equal(root.answers(h), ["Enable", "No thanks"], "last: the question that can wait")
        root.whole(h, "sponsor")
        h.mock.sponsorPrompt = false
        h.mock.signedIn = false
      },
      function() {
        h.equal(root.answers(h), [], "answered: no notice is left")
        h.equal(root.list(h).height, root.tallest, "answered: and the list has its seven rows again")

        // ---- A card smaller than the page ----
        root.body.heightLimit = 200
      },
      function() {
        h.equal(root.list(h).height, 94, "small: the list gives way down to two rows")
        h.check(root.body.implicitHeight > 200, "small: beyond that the page scrolls as a whole")
        root.body.heightLimit = 0
      },
      function() {
        h.equal(root.list(h).height, root.tallest, "unknown: without a limit the list has its seven rows")
        root.body.heightLimit = root.limit

        // ---- The two ends of a long page ----
        root.body.go("settings")
      },
      function() {
        var area = root.scroll(h)
        h.check(area.contentHeight > area.height, "ends: the settings page is longer than the card")
        h.equal(area.contentY, 0, "ends: it opens at its top")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_PageDown)
        h.key(Qt.Key_PageDown)
        h.key(Qt.Key_PageDown)
      },
      function() {
        var area = root.scroll(h)
        h.equal(Math.round(area.contentY), Math.round(area.contentHeight - area.height),
          "ends: the last row brings the end of the page into view, with the line under it")
        h.check(root.button(h, "Clear history").hasCursor, "ends: and has the cursor")
        h.key(Qt.Key_Up)
      },
      function() {
        h.key(Qt.Key_PageUp)
        h.key(Qt.Key_PageUp)
        h.key(Qt.Key_PageUp)
      },
      function() {
        h.equal(root.scroll(h).contentY, 0, "ends: the first row brings the top back, with the heading")

        // ---- A message in place of the page ----
        h.mock.fatalCode = "E_MPV_MISSING"
      },
      function() {
        h.check(h.find(root.body, root.isPage) === null, "message: the page is gone")
        h.check(root.body.implicitHeight > 0 && root.body.implicitHeight < 100,
          "message: and the card is as tall as the message, not as the page that was there")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")
        h.finish()
      }
    ])
  }
}
