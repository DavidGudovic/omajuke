import QtQuick

// The video button of the now-playing strip in each state of the video
// window, the notices of the main page answered from the keyboard, and the
// outputs page: its rows, the saved choice while nothing plays, and the
// note that the chosen output is gone. The view only ever asks the service
// (toggleVideo, setOutput, dismissNotice); every sentence about a failure
// is the one the service's errorText answered.
QtObject {
  id: root

  property var body: null

  readonly property var track: (
    { id: "AAAAAAAAAAA", title: "Playing now", channel: "Channel A", duration: 213, live: false, key: 1,
      auto: false })
  readonly property var recents: [
    { id: "BBBBBBBBBBB", title: "Recent one", channel: "Channel B", duration: 61, live: false },
    { id: "CCCCCCCCCCC", title: "Recent two", channel: "Channel C", duration: 125, live: false }
  ]
  // The label of the last one is what a device could call itself.
  readonly property var outputs: [
    { name: "auto", label: "System default", current: false },
    { name: "pipewire/sink-1", label: "Speakers", current: true },
    { name: "pipewire/sink-2", label: "<b>Head</b>phones <img src='device.invalid/x'>", current: false }
  ]

  function isField(item) { return item.placeholderText !== undefined }
  function isRow(item) { return item.thumbPath !== undefined }
  function isNotice(item) { return item.primaryLabel !== undefined && item.visible }
  function isButton(item) { return item.iconSpinning !== undefined }
  // A row of the outputs page: the kit's cursor row, without a thumbnail.
  function isOutput(item) { return item.currentFill !== undefined && item.thumbPath === undefined }

  function glyph(codePoint) {
    var offset = codePoint - 0x10000
    return String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
  }
  function iconButton(h, codePoint) {
    var icon = root.glyph(codePoint)
    return h.find(root.body, function(item) { return item.iconText === icon && item.visible })
  }
  // The small buttons of the strip, by what their tooltip says.
  function tipButton(h, tip) {
    return h.find(root.body, function(item) {
      return item.iconText !== undefined && item.tooltipText === tip && item.visible
    })
  }
  function button(h, text) {
    return h.find(root.body, function(item) {
      return root.isButton(item) && item.text === text && item.visible
    })
  }
  function field(h) { return h.find(root.body, root.isField) }
  function shown(h, text) { return h.texts(root.body).indexOf(text) !== -1 }
  function highlighted(h) {
    return h.findAll(root.body, function(item) { return root.isRow(item) && item.hasCursor })
      .map(function(row) { return row.track.title })
  }
  // The labels of the buttons that carry the cursor: never more than one.
  function pressed(h) {
    return h.findAll(root.body, function(item) {
      return root.isButton(item) && item.hasCursor && item.visible
    }).map(function(item) { return item.text })
  }
  // The tooltips of the icon buttons that carry the cursor (the settings
  // button, the buttons of the strip): never more than one.
  function carried(h) {
    return h.findAll(root.body, function(item) {
      return item.hasCursor === true && item.visible && item.thumbPath === undefined
        && typeof item.tooltipText === "string" && item.tooltipText !== ""
    }).map(function(item) { return item.tooltipText })
  }
  function outputRows(h) { return h.findAll(root.body, root.isOutput) }
  function labels(h) {
    return root.outputRows(h).map(function(row) { return h.texts(row)[0] })
  }
  function marked(h) {
    return root.outputRows(h).filter(function(row) { return row.current })
      .map(function(row) { return h.texts(row)[0] })
  }
  function withCursor(h) {
    return root.outputRows(h).filter(function(row) { return row.hasCursor })
      .map(function(row) { return h.texts(row)[0] })
  }

  function run(h) {
    h.mock.queue = [root.track]
    h.mock.queueIndex = 0
    h.mock.currentTrack = root.track
    h.mock.hasTrack = true
    h.mock.playbackState = "playing"
    h.mock.playing = true
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
        // ---- The video button ----
        var video = root.tipButton(h, "Show video")
        h.check(video !== null, "hidden: the strip offers to show the video")
        h.equal(video.iconText, root.glyph(0xf0567), "hidden: with the video glyph")
        h.equal(String(video.foreground), String(root.body.fg), "hidden: in the ordinary colour")
        h.check(root.shown(h, "Channel A"), "hidden: the second line names the channel")
        h.resetCalls()
        h.click(video)
        h.equal(h.actions(), ["toggleVideo"], "hidden: a click asks the service to toggle the window")
        h.mock.videoState = "loading"
      },
      function() {
        var video = root.tipButton(h, "Loading video…")
        h.check(video !== null, "loading: the button says the video is on its way")
        h.equal(video.iconText, root.glyph(0xf0996), "loading: with the busy glyph")
        h.check(root.shown(h, "Loading video…") && !root.shown(h, "Channel A"),
          "loading: and so does the second line, in place of the channel")
        h.resetCalls()
        h.click(video)
        h.equal(h.actions(), ["toggleVideo"], "loading: a click takes the wish back the same way")
        // The track itself comes first, and a failure before everything.
        h.mock.playbackState = "loading"
      },
      function() {
        h.check(root.shown(h, "Loading…") && !root.shown(h, "Loading video…"),
          "loading: while the track itself loads, the line is about the track")
        h.mock.playbackState = "error"
        h.mock.errorCode = "E_NETWORK"
      },
      function() {
        h.check(root.shown(h, "text of E_NETWORK") && !root.shown(h, "Loading video…"),
          "loading: a failed track says why, whatever its picture does")
        h.mock.errorCode = ""
        h.mock.playbackState = "playing"
        h.mock.videoState = "shown"
      },
      function() {
        var video = root.tipButton(h, "Hide video")
        h.check(video !== null, "shown: the button offers to hide the video")
        h.equal(video.iconText, root.glyph(0xf0567), "shown: with the video glyph")
        h.check(String(video.foreground) !== String(root.body.fg), "shown: lit in another colour")
        h.check(root.shown(h, "Channel A"), "shown: the second line is the channel again")
        h.resetCalls()
        h.click(video)
        h.equal(h.actions(), ["toggleVideo"], "shown: a click toggles")
        h.mock.videoNote = "E_VIDEO_NONE"
        h.mock.videoState = "unavailable"
      },
      function() {
        var video = root.tipButton(h, "text of E_VIDEO_NONE")
        h.check(video !== null, "unavailable: the button's tooltip is the service's sentence")
        h.equal(video.iconText, root.glyph(0xf0568), "unavailable: with the crossed-out glyph")
        h.equal(String(video.foreground), String(root.body.fg), "unavailable: not lit")
        h.check(root.shown(h, "text of E_VIDEO_NONE"), "unavailable: the second line says it too")
        h.resetCalls()
        h.click(video)
        h.equal(h.actions(), ["toggleVideo"], "unavailable: a click still toggles the wish")
        h.equal(h.calls("showVideo").concat(h.calls("hideVideo")), [],
          "the view never decides between showing and hiding by itself")
        // The compositor could not be asked for the window: no window, no
        // wish, and a reason that has to be said all the same.
        h.mock.videoNote = "E_HYPR_ERRORS"
        h.mock.videoState = "hidden"
      },
      function() {
        var video = root.tipButton(h, "text of E_HYPR_ERRORS")
        h.check(video !== null, "refused: the button's tooltip says why no window came")
        h.check(root.tipButton(h, "Show video") === null, "refused: in place of the offer")
        h.equal(video.iconText, root.glyph(0xf0567), "refused: with the video glyph, a click asks again")
        h.equal(String(video.foreground), String(root.body.fg), "refused: not lit")
        h.check(root.shown(h, "text of E_HYPR_ERRORS") && !root.shown(h, "Channel A"),
          "refused: the second line says it too, in place of the channel")
        h.resetCalls()
        h.click(video)
        h.equal(h.actions(), ["toggleVideo"], "refused: a click toggles")
        h.mock.videoNote = ""
      },
      function() {
        h.check(root.tipButton(h, "Show video") !== null && root.shown(h, "Channel A"),
          "refused: once the reason is put away the strip is as before")

        // ---- The strip and the settings button, by keys alone ----
        h.resetCalls()
        h.equal(root.carried(h), [], "keys: no button carries the cursor before a key was pressed")
        h.key(Qt.Key_Return)
        h.equal([root.highlighted(h), root.carried(h)], [["Recent one"], []],
          "keys: Enter shows the highlight on a row, never on a button that is always there")
        h.key(Qt.Key_Up)
        h.equal([root.highlighted(h), root.carried(h)], [[], ["Settings"]],
          "keys: Up from the first row reaches the settings button at the top of the page")
        h.key(Qt.Key_Up)
        h.equal(root.carried(h), ["Pause"],
          "keys: Up once more leads round to the strip, onto play or pause")
        h.key(Qt.Key_Up)
        h.equal(root.carried(h), ["Pause"], "keys: and stops there")
        h.key(Qt.Key_Left)
        h.equal(root.carried(h), ["Pause"], "keys: Left finds no button: nothing lies before this track")
        h.key(Qt.Key_Right)
        h.equal(root.carried(h), ["Mute"], "keys: Right steps over Next, which has nothing to go to")
        h.equal(h.actions(), [], "keys: moving called nothing")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["toggleMute"], "keys: Enter presses the button with the cursor")
        h.key(Qt.Key_Right)
        h.equal(root.carried(h), ["Show video"], "keys: Right, the video button")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["toggleMute", "toggleVideo"], "keys: Enter toggles the video window")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.actions(), ["toggleMute", "toggleVideo"], "keys: Shift+Enter presses nothing")
        h.key(Qt.Key_Space)
        h.equal(h.actions(), ["toggleMute", "toggleVideo", "playPause"],
          "keys: Space is play or pause, as everywhere on this page")
        h.key(Qt.Key_Right)
        h.equal(root.carried(h), ["Audio output"], "keys: Right, the outputs button")
        h.key(Qt.Key_Right)
        h.equal(root.carried(h), ["Queue"], "keys: Right, the queue button")
        h.key(Qt.Key_Right)
        h.equal(root.carried(h), ["Queue"], "keys: which is the last")
        h.resetCalls()
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal([root.body.page, h.actions()], ["queue", []], "keys: Enter on it opens the queue page")
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "main", "keys: Esc returns to the main page")
        h.check(root.field(h).activeFocus, "keys: where the field has the keyboard again")
        h.equal(root.carried(h), [], "keys: and no button carries the cursor")
        // A track before and after this one: every button can be pressed.
        h.mock.queue = [root.track, root.track, root.track]
        h.mock.queueIndex = 1
      },
      function() {
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Up)
        h.key(Qt.Key_Up)
        h.equal(root.carried(h), ["Pause"], "keys: the cursor starts on play or pause again")
        h.key(Qt.Key_Right)
        h.equal(root.carried(h), ["Next"], "keys: Right is Next now")
        h.key(Qt.Key_Return)
        h.key(Qt.Key_Left)
        h.key(Qt.Key_Left)
        h.equal(root.carried(h), ["Previous"], "keys: Left twice, Previous")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["next", "previous"], "keys: both were pressed")
        // The track after this one goes while the cursor is on Next.
        h.key(Qt.Key_Right)
        h.key(Qt.Key_Right)
        h.equal(root.carried(h), ["Next"], "keys: on Next")
        h.mock.queue = [root.track, root.track]
      },
      function() {
        h.equal(root.carried(h), ["Pause"],
          "keys: a button that can no longer be pressed hands the cursor to play or pause")
        h.resetCalls()
        h.key(Qt.Key_Down)
        h.equal(root.carried(h), ["Settings"], "keys: Down from the strip leads to the settings button")
        h.key(Qt.Key_Return)
      },
      function() {
        h.equal([root.body.page, h.actions()], ["settings", []],
          "keys: Enter on the settings button opens the settings page")
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "main", "keys: and Esc returns")
        h.mock.queue = [root.track]
        h.mock.queueIndex = 0

        // ---- Notices and the keyboard ----
        h.mock.noticeCode = "N_SKIPPED"
        h.mock.outputNote = "N_OUTPUT_FALLBACK"
      },
      function() {
        h.equal(h.findAll(root.body, root.isNotice).length, 2, "notices: one per condition")
        h.check(root.shown(h, "text of N_SKIPPED") && root.shown(h, "text of N_OUTPUT_FALLBACK"),
          "notices: each with the service's sentence")
        h.check(root.button(h, "Dismiss") !== null && root.button(h, "Choose output") !== null,
          "notices: and its button")
        h.equal(root.pressed(h), [], "notices: no button is highlighted when they appear")
        h.check(root.field(h).activeFocus, "notices: the field keeps the keyboard")
        h.resetCalls()

        h.key(Qt.Key_Down)
        h.equal([root.highlighted(h), root.pressed(h)], [["Recent one"], []],
          "notices: the first Down shows the highlight on a row, not on a button")
        h.key(Qt.Key_Up)
        h.equal([root.highlighted(h), root.pressed(h)], [[], ["Choose output"]],
          "notices: Up from the first row reaches the button nearest to it")
        h.key(Qt.Key_Up)
        h.equal(root.pressed(h), ["Dismiss"], "notices: Up again reaches the one above")
        h.key(Qt.Key_Up)
        h.equal([root.pressed(h), root.carried(h)], [[], ["Settings"]],
          "notices: above the notices lies the settings button")
        h.key(Qt.Key_Down)
        h.equal([root.pressed(h), root.carried(h)], [["Dismiss"], []],
          "notices: and Down returns from it to the first notice")
        h.key(Qt.Key_Return, Qt.ShiftModifier)
        h.equal(h.actions(), [], "notices: Shift+Enter presses nothing")
        h.key(Qt.Key_Space)
        h.equal(h.actions(), ["playPause"], "notices: Space is play or pause, as everywhere on this page")
        h.resetCalls()
        // Another notice takes the place of the highlighted one.
        h.mock.noticeCode = "N_NO_RELATED"
        h.check(root.shown(h, "text of N_NO_RELATED"), "notices: a new notice replaces the old one")
        h.equal(root.pressed(h), [], "notices: and its button is not highlighted before it was read")
        h.key(Qt.Key_Return)
        h.equal([root.highlighted(h), h.actions()], [["Recent one"], []],
          "notices: so Enter dismisses nothing and shows the highlight on a row again")
        h.key(Qt.Key_Up)
        h.key(Qt.Key_Up)
        h.equal(root.pressed(h), ["Dismiss"], "notices: Up twice reaches its button")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["dismissNotice"], "notices: Enter presses the highlighted button")
        h.resetCalls()
        h.mock.noticeCode = ""
      },
      function() {
        h.equal(h.findAll(root.body, root.isNotice).length, 1, "notices: the dismissed one is gone")
        h.equal([root.highlighted(h), root.pressed(h)], [[], []],
          "notices: and the highlight did not slide onto the button that is left")
        h.key(Qt.Key_Return)
        h.equal([root.highlighted(h), root.pressed(h), h.actions()], [["Recent one"], [], []],
          "notices: the next Enter only shows the highlight again, on a row")
        h.key(Qt.Key_PageUp)
        h.equal(root.pressed(h), ["Choose output"], "notices: PageUp from the first row reaches it too")
        h.key(Qt.Key_Down)
        h.equal([root.highlighted(h), root.pressed(h)], [["Recent one"], []],
          "notices: Down returns to the row the highlight left")
        h.key(Qt.Key_Up)

        // Text typed since then is searched for: Enter does not press.
        h.key(Qt.Key_Q)
        h.check(root.field(h).activeFocus, "notices: a character goes to the field")
        h.key(Qt.Key_Return)
        h.equal(h.actions(), ["submit"], "notices: Enter then searches for the text and presses nothing")
        h.equal(root.body.page, "main", "notices: so the page stays")
        h.key(Qt.Key_Backspace)
        h.resetCalls()
        h.equal(root.pressed(h), ["Choose output"], "notices: the button kept the highlight")
        h.key(Qt.Key_Return)
      },
      function() {
        // ---- The outputs page, while nothing reports a list ----
        h.equal(root.body.page, "outputs", "Enter on the button of the output notice opens the outputs page")
        h.equal(h.actions(), [], "outputs: which called nothing on the service")
        h.check(root.shown(h, "Audio output"), "outputs: the heading")
        h.check(root.field(h) === null, "outputs: the main page is gone")
        h.check(root.shown(h, "text of N_OUTPUT_FALLBACK"), "outputs: the note that the chosen one is gone")
        h.check(root.shown(h, "Outputs are available while something is playing"),
          "idle: the page says when the list exists")
        h.check(root.shown(h, "Saved choice: System default"), "idle: and names the saved choice")
        h.equal(root.outputRows(h).length, 0, "idle: no rows")
        h.key(Qt.Key_Down)
        h.key(Qt.Key_Return)
        h.equal(h.actions(), [], "idle: no key does anything")
        h.mock.outputName = "pipewire/sink-9"
      },
      function() {
        h.check(root.shown(h, "Saved choice: pipewire/sink-9"), "idle: a saved device is shown by its name")
        h.mock.outputs = root.outputs
      },
      function() {
        // ---- The outputs page with a list ----
        h.equal(root.labels(h), ["System default", "Speakers", root.outputs[2].label],
          "list: one row per output, a label with markup shown letter by letter")
        h.check(root.labels(h)[2].indexOf("<img") !== -1, "list: the markup is on screen as text")
        h.equal(root.marked(h), ["Speakers"], "list: the output in use is marked, and only that one")
        h.equal(h.texts(root.body).filter(function(text) { return text === root.glyph(0xf012c) }).length, 1,
          "list: with one check mark")
        h.check(!root.shown(h, "Outputs are available while something is playing")
          && !root.shown(h, "Saved choice: pipewire/sink-9"), "list: the idle lines are gone")
        h.equal(h.richTexts(root.body), [], "list: every text element is plain text")
        h.equal(root.withCursor(h), [], "list: no row has the cursor yet")
        h.resetCalls()

        h.key(Qt.Key_Down)
        h.equal(root.withCursor(h), ["System default"], "list: Down shows the cursor on the first row")
        h.key(Qt.Key_PageDown)
        h.equal(root.withCursor(h).length, 1, "list: PageDown moves to the last row, which alone has it")
        h.equal(h.actions(), [], "list: moving the cursor chooses nothing")
        h.key(Qt.Key_Return)
        h.equal(h.calls("setOutput"), [["pipewire/sink-2"]], "list: Enter asks for the row's output by name")
        h.key(Qt.Key_Up)
        h.key(Qt.Key_Space)
        h.equal(h.calls("setOutput"), [["pipewire/sink-2"], ["pipewire/sink-1"]], "list: Space as well")
        h.key(Qt.Key_Left)
        h.key(Qt.Key_Delete)
        h.key(Qt.Key_X)
        h.equal(h.actions(), ["setOutput", "setOutput"], "list: nothing else was called")
        h.equal(root.marked(h), ["Speakers"], "list: the mark waits for the service to report the change")
        h.resetCalls()
        h.click(root.outputRows(h)[0])
        h.equal(h.calls("setOutput"), [["auto"]], "list: a click on a row asks for it")
        h.equal(root.withCursor(h), ["System default"], "list: and takes the cursor there")

        // The service reports the change, and the device is back.
        h.mock.outputs = [root.outputs[0], root.outputs[2]].map(function(entry, at) {
          return { name: entry.name, label: entry.label, current: at === 0 }
        })
        h.mock.outputNote = ""
      },
      function() {
        h.equal(root.marked(h), ["System default"], "list: the reported output is marked")
        h.equal(root.labels(h).length, 2, "list: a device that went away has no row any more")
        h.check(!root.shown(h, "text of N_OUTPUT_FALLBACK"), "list: the note is gone with its reason")
        h.resetCalls()
        h.key(Qt.Key_Escape)
      },
      function() {
        h.equal(root.body.page, "main", "Esc on the outputs page goes back")
        h.check(root.field(h) !== null && root.field(h).activeFocus, "where the field has the keyboard again")
        h.equal(h.findAll(root.body, root.isNotice).length, 0, "main: no notice is left")
        var speaker = root.tipButton(h, "Audio output")
        h.check(speaker !== null && speaker.iconText === root.glyph(0xf04c3),
          "main: the strip has an output button")
        h.equal(String(speaker.foreground), String(root.body.fg), "main: in the ordinary colour")
        h.mock.outputNote = "N_OUTPUT_FALLBACK"
      },
      function() {
        var speaker = root.tipButton(h, "Audio output")
        h.equal(String(speaker.foreground), String(root.body.urgent),
          "main: in the warning colour while the chosen output is gone")
        h.resetCalls()
        h.click(speaker)
      },
      function() {
        h.equal(root.body.page, "outputs", "the output button opens the outputs page as well")
        h.equal(h.actions(), [], "without calling the service")
        h.equal(h.calls("cycleOutput"), [], "the panel never cycles outputs: it shows the list")
        h.equal(h.richTexts(root.body), [], "every text element is plain text")
        h.finish()
      }
    ])
  }
}
