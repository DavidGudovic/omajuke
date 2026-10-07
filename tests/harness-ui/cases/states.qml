import QtQuick

// Every empty, loading and error state of the panel. The blocking ones show
// exactly one notice and no page. On the main page each state of the list
// area has its line, and every error sentence is what the service's
// errorText answered, never wording of the view's own. Also the proxy
// question, which the keyboard answers as well as the pointer, the notices
// the user dismisses and the now-playing strip with its controls.
QtObject {
  id: root

  property var body: null
  property var closes: []

  readonly property var track: (
    { id: "AAAAAAAAAAA", title: "Playing now", channel: "Channel A", duration: 213, live: false })
  readonly property var liveTrack: (
    { id: "BBBBBBBBBBB", title: "Live now", channel: "Channel B", duration: null, live: true })
  // A picture small enough to write as text.
  readonly property string picture: "<svg width='32' height='18'><rect width='32' height='18'/></svg>"
  readonly property var otherTrack: (
    { id: "CCCCCCCCCCC", title: "A result", channel: "Channel C", duration: 100, live: false })

  function isPage(item) { return typeof item.keyContext === "function" }
  function isField(item) { return item.placeholderText !== undefined }
  function isList(item) { return item.positionViewAtIndex !== undefined }
  function isNotice(item) { return item.primaryLabel !== undefined && item.visible }
  function isSlider(item) { return item.liveValue !== undefined }
  function isImage(item) { return item.sourceSize !== undefined && item.fillMode !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }

  // An icon of the bar font, from its code point.
  function glyph(codePoint) {
    var offset = codePoint - 0x10000
    return String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
  }

  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  function picturePath(h) { return h.mock.thumbs.CCCCCCCCCCC }
  // The image of each list row, top to bottom.
  function rowImages(h) {
    return h.findAll(root.body, root.isRow).map(function(row) { return h.find(row, root.isImage) })
  }
  function button(h, text) {
    return h.find(root.body, function(item) { return item.iconSpinning !== undefined && item.text === text })
  }
  // A visible button by its icon, which is all an icon button carries.
  function iconButton(h, codePoint) {
    var icon = root.glyph(codePoint)
    return h.find(root.body, function(item) { return item.iconText === icon && item.visible })
  }

  // One blocking notice with exactly this text, and nothing else on screen.
  function blocked(h, text, label) {
    h.equal(h.texts(root.body), [text], label + ": only this sentence is shown")
    h.equal(h.findAll(root.body, root.isNotice).length, 1, label + ": in exactly one notice")
    h.check(h.find(root.body, root.isPage) === null, label + ": no page is loaded")
    h.equal(h.richTexts(root.body), [], label + ": as plain text")
  }

  function run(h) {
    root.body = h.mount("ui/PanelBody.qml", { bar: h.bar, service: null, width: 420, height: 640 })
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
        root.blocked(h, "OmaJuke needs the built-in Omarchy bar", "no service")
        h.equal(h.mock.calls, [], "no service: nothing is called on the one that is not handed over")
        h.key(Qt.Key_Space)
        h.key(Qt.Key_Return)
        h.key(Qt.Key_A)
        h.key(Qt.Key_Escape)
        h.equal(root.closes, ["close"], "no service: Esc still closes the panel")

        h.mock.fatalCode = "E_MPV_MISSING"
        root.body.service = h.mock
      },
      function() {
        root.blocked(h, "text of E_MPV_MISSING", "fatal")
        h.equal(h.calls("notePanelOpen"), [[true]],
          "a service that appears under an open panel is told the panel is open")
        var asked = h.calls("errorText")
        h.check(asked.length > 0 && asked.every(function(args) { return args[0] === "E_MPV_MISSING" }),
          "fatal: the sentence was asked of the service, by its code")
        h.equal(h.actions(), [], "fatal: nothing else is called")
        // Not ready and fatal at once: the fatal message wins.
        h.mock.ready = false
      },
      function() {
        root.blocked(h, "text of E_MPV_MISSING", "fatal while not ready")
        h.mock.fatalCode = ""
      },
      function() {
        root.blocked(h, "Loading…", "not ready")
        h.mock.ready = true
        h.mock.networkHold = true
      },
      function() {
        h.equal(h.texts(root.body), ["text of N_PROXY", "Continue without a proxy"],
          "proxy: the notice and its button, nothing else")
        h.equal(h.findAll(root.body, root.isNotice).length, 1, "proxy: exactly one notice")
        h.check(h.find(root.body, root.isPage) === null, "proxy: no page is loaded")
        h.resetCalls()
        // The question is answered from the keyboard in two steps, so that
        // one stray key press never answers it.
        var answer = root.button(h, "Continue without a proxy")
        h.equal(answer.hasCursor, false, "proxy: the button is not highlighted when the notice appears")
        h.key(Qt.Key_Space)
        h.key(Qt.Key_A)
        h.equal([answer.hasCursor, h.actions()], [false, []], "proxy: Space and letters do nothing")
        h.key(Qt.Key_Return)
        h.equal(answer.hasCursor, true, "proxy: the first Enter shows the highlight on the button")
        h.equal(h.actions(), [], "proxy: and acknowledges nothing yet")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.key(Qt.Key_Space)
        h.key(Qt.Key_Up)
        h.key(Qt.Key_Down)
        h.equal([answer.hasCursor, h.actions()], [true, []],
          "proxy: the highlight stays on the only button, and only a plain Enter presses it")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["acknowledgeProxy"], "proxy: Enter on the highlighted button answers, once")
        h.resetCalls()
        h.click(answer)
        h.equal(h.actions(), ["acknowledgeProxy"], "proxy: a click on the button acknowledges as well")
        // A panel that is closed and opened again starts without a highlight.
        h.close(root.body)
        h.hide(root.body)
        h.open(root.body)
      },
      function() {
        var answer = root.button(h, "Continue without a proxy")
        h.equal(answer.hasCursor, false, "proxy: a reopened panel shows the question without a highlight")
        h.resetCalls()
        h.key(Qt.Key_Down)
        h.equal(answer.hasCursor, true, "proxy: Down shows the highlight as well")
        h.key(Qt.Key_Escape)
        h.equal(h.actions(), [], "proxy: Esc answers nothing")
        h.equal(root.closes, ["close", "close"], "proxy: it asks to close the panel")
        h.mock.networkHold = false
      },
      function() {
        var f = h.find(root.body, root.isField)
        h.check(f !== null, "home: with nothing in the way the main page loads")
        h.check(f && f.activeFocus, "home: and its field takes the keyboard")
        h.check(root.shown(h, "Nothing played yet. Search above, or paste a YouTube link"),
          "home: the empty text")
        h.equal(h.find(root.body, root.isList).visible, false, "home: no list while it is empty")
        h.equal(h.findAll(root.body, root.isNotice).length, 0, "home: no notice")
        h.check(root.iconButton(h, 0xf040a) === null, "home: no now-playing strip without a track")

        h.mock.searchQuery = "query"
        h.mock.searchState = "searching"
      },
      function() {
        h.check(root.shown(h, "Searching…"), "searching: the line")
        var turning = root.glyph(0xf0996)
        var spinner = h.find(root.body, function(item) { return item.text === turning && item.visible })
        h.check(spinner !== null, "searching: with the turning glyph")
        var list = h.find(root.body, root.isList)
        h.equal(list.visible, true, "searching: the list area is kept")
        h.equal(list.opacity, 0.5, "searching: dimmed")
        h.mock.searchState = "empty"
      },
      function() {
        h.check(root.shown(h, "Nothing found"), "empty: the line")
        h.equal(h.find(root.body, root.isList).visible, false, "empty: no list")
        h.resetCalls()
        h.mock.searchError = "E_NETWORK"
        h.mock.searchState = "error"
      },
      function() {
        h.check(root.shown(h, "text of E_NETWORK"), "error: the line is what errorText answered")
        h.check(h.calls("errorText").some(function(args) { return args[0] === "E_NETWORK" }),
          "error: asked by code")
        h.equal(h.find(root.body, root.isList).visible, false, "error: no list")
        h.mock.searchError = "E_YT_BLOCKED"
      },
      function() {
        h.check(root.shown(h, "text of E_YT_BLOCKED"), "error: another code, another sentence")
        h.mock.searchResults = [root.otherTrack, root.liveTrack]
        h.mock.searchState = "results"
      },
      function() {
        h.check(root.shown(h, "A result") && root.shown(h, "Live now"), "results: the rows")
        h.check(root.shown(h, "1:40") && root.shown(h, "LIVE"), "results: a length or the LIVE mark")
        h.check(!root.shown(h, "text of E_YT_BLOCKED") && !root.shown(h, "Searching…"), "results: no line")
        h.equal(h.find(root.body, root.isList).opacity, 1, "results: not dimmed")

        // Thumbnails: no file yet, a file, a file that cannot be shown.
        var images = root.rowImages(h)
        h.equal(images.length, 2, "thumbnails: one image per row")
        h.equal(h.findAll(root.body, root.isImage).length, 3, "thumbnails: and one in the now-playing strip")
        h.equal(images.map(function(image) { return [String(image.source), image.visible] }),
          [["", false], ["", false]], "thumbnails: without a file nothing is loaded and the glyph shows")
        h.equal(h.texts(root.body).filter(function(text) { return text === root.glyph(0xf075a) }).length, 2,
          "thumbnails: the music glyph stands in")
        var picture = h.writeFile("picture.svg", root.picture)
        h.resetCalls()
        h.mock.thumbs = { CCCCCCCCCCC: picture, BBBBBBBBBBB: "/nonexistent/7.jpg" }
      },
      function() {
        var images = root.rowImages(h)
        h.equal(String(images[0].source), "file://" + root.picturePath(h),
          "thumbnails: a file is shown by its path")
        h.equal([images[0].status === Image.Ready, images[0].visible], [true, true],
          "thumbnails: once it is decoded")
        h.check(images[0].sourceSize.width > 0 && images[0].sourceSize.height > 0,
          "thumbnails: at a bounded size")
        h.equal([images[1].status === Image.Error, images[1].visible], [true, false],
          "thumbnails: a file that cannot be shown is hidden")
        h.equal(h.calls("reportThumbError"), [["BBBBBBBBBBB"]],
          "thumbnails: and reported to the service, once")
        h.equal(h.texts(root.body).filter(function(text) { return text === root.glyph(0xf075a) }).length, 1,
          "thumbnails: its glyph stays")
        h.resetCalls()
        // Whatever the table holds, an address never reaches an image.
        h.mock.thumbs = {
          CCCCCCCCCCC: "https://i.ytimg.com/vi/CCCCCCCCCCC/mqdefault.jpg", BBBBBBBBBBB: "//127.0.0.1/x.jpg"
        }
      },
      function() {
        var images = root.rowImages(h)
        h.equal(images.map(function(image) { return [String(image.source), image.status === Image.Null] }),
          [["", true], ["", true]], "thumbnails: an address in the table is not loaded")
        h.equal(h.calls("reportThumbError"), [], "thumbnails: and is not an error to report either")
        h.mock.thumbs = {}

        // A notice the user dismisses.
        h.mock.noticeCode = "N_STATE_RESET"
      },
      function() {
        h.check(root.shown(h, "text of N_STATE_RESET"), "notice: its sentence comes from errorText")
        h.equal(h.findAll(root.body, root.isNotice).length, 1, "notice: one banner")
        h.resetCalls()
        h.click(root.button(h, "Dismiss"))
        h.equal(h.actions(), ["dismissNotice"], "notice: Dismiss tells the service")
        h.mock.noticeCode = ""

        // The now-playing strip.
        h.mock.currentTrack = root.track
        h.mock.hasTrack = true
        h.mock.queue = [root.track]
        h.mock.queueIndex = 0
        h.mock.playbackState = "loading"
      },
      function() {
        h.equal(h.findAll(root.body, root.isNotice).length, 0, "the dismissed notice is gone")
        h.check(root.shown(h, "Playing now"), "strip: the title of the current track")
        h.check(root.shown(h, "Loading…"), "strip: Loading while the track is on its way")
        h.check(root.iconButton(h, 0xf0996) !== null, "strip: the play button turns")
        h.check(h.calls("wantThumbs").some(function(args) { return args[0][0] === "AAAAAAAAAAA" }),
          "strip: the current track's thumbnail is requested")
        h.mock.playbackState = "error"
        h.mock.errorCode = "E_YT_REFUSED"
      },
      function() {
        h.check(root.shown(h, "text of E_YT_REFUSED"), "strip: the error line is what errorText answered")
        h.check(!root.shown(h, "Loading…"), "strip: instead of Loading")
        h.mock.errorCode = ""
        h.mock.playbackState = "playing"
        h.mock.playing = true
        h.mock.duration = 213
        h.mock.position = 61
        h.mock.seekable = true
      },
      function() {
        h.check(root.shown(h, "Channel A"), "strip: the channel while playing")
        h.check(root.shown(h, "1:01") && root.shown(h, "3:33"), "strip: position and length")
        h.resetCalls()
        h.click(root.iconButton(h, 0xf03e4))
        h.equal(h.actions(), ["playPause"], "strip: the pause button calls playPause")
        h.resetCalls()
        h.click(root.iconButton(h, 0xf04ae))
        h.equal(h.actions(), ["previous"], "strip: previous")
        h.resetCalls()
        h.click(root.iconButton(h, 0xf04ad))
        h.equal(h.actions(), [], "strip: next is disabled while the queue has nothing after this track")
        h.click(root.iconButton(h, 0xf057e))
        h.equal(h.actions(), ["toggleMute"], "strip: the volume glyph toggles mute")
        h.resetCalls()

        var sliders = h.findAll(root.body, root.isSlider)
        h.equal(sliders.length, 2, "strip: a seek bar and a volume slider")
        h.equal([sliders[0].maximum, sliders[0].value, sliders[0].step], [213, 61, 5], "strip: the seek bar")
        h.equal([sliders[1].maximum, sliders[1].value, sliders[1].step], [100, 70, 5],
          "strip: the volume slider")
        // One wheel notch up on each.
        h.wheel(sliders[0], 120)
        h.equal(h.calls("seekTo"), [[66]], "strip: a wheel notch on the seek bar seeks five seconds on")
        h.wheel(sliders[1], -120)
        h.equal(h.calls("setVolume"), [[65]], "strip: a wheel notch on the volume slider changes it by five")
        h.equal(h.actions(), ["seekTo", "setVolume"], "strip: and nothing else")

        h.mock.queue = [root.track, root.liveTrack]
        h.mock.muted = true
        h.mock.playing = false
        h.mock.paused = true
        h.mock.playbackState = "paused"
      },
      function() {
        h.resetCalls()
        h.click(root.iconButton(h, 0xf04ad))
        h.equal(h.actions(), ["next"], "strip: next works once a track follows")
        h.check(root.iconButton(h, 0xf075f) !== null, "strip: the muted glyph")
        h.check(root.iconButton(h, 0xf040a) !== null, "strip: the play glyph while paused")

        h.mock.currentTrack = root.liveTrack
        h.mock.duration = 0
        h.mock.seekable = false
      },
      function() {
        h.equal(h.texts(root.body).filter(function(text) { return text === "Live now" }).length, 2,
          "strip: the new track's title, as on its row")
        h.equal(h.texts(root.body).filter(function(text) { return text === "LIVE" }).length, 2,
          "strip: LIVE instead of a length, as on its row")
        var current = h.findAll(root.body, function(item) { return root.isRow(item) && item.isCurrent })
        h.equal(current.map(function(row) { return row.track.title }), ["Live now"],
          "the row of the playing track is marked, and only that row")
        h.resetCalls()
        h.wheel(h.findAll(root.body, root.isSlider)[0], 120)
        h.click(root.iconButton(h, 0xf04ae))
        h.equal(h.actions(), [], "strip: nothing seeks on a track that cannot be sought")

        // The service goes away while the page is open.
        root.body.service = null
      },
      function() {
        root.blocked(h, "OmaJuke needs the built-in Omarchy bar", "service gone")
        h.equal(h.calls("notePanelOpen"), [[false]], "service gone: it got its open count back")
        h.equal(h.calls("setPositionWatch"), [[false]], "service gone: and its position watch")
        h.equal(h.actions(), [], "service gone: nothing else was called on it")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")
        h.finish()
      }
    ])
  }
}
