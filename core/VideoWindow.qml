import QtQuick
import "../lib/Const.js" as Const
import "../lib/Geometry.js" as Geometry
import "../lib/Lua.js" as Lua

// The video window: whether the user wants to see the picture of what
// plays, and what it takes to show it. It owns that wish, the state the
// panel shows for it, and the memory of where the user left the window on
// each monitor.
//
// The window is mpv's own. Three things make it behave:
//
//   The picture is never part of what mpv is told to play. It is a second
//   stream that is attached after a track has started, again for every
//   track: mpv forgets the choice whenever a file comes without one.
//
//   A window may only open while Hyprland holds our rule for it, which
//   floats it into its corner without taking the focus. Without the rule it
//   would be laid out as a tile and grab the keyboard. So the rule is
//   registered before every opening, and when that cannot be done no
//   window is opened.
//
//   While the wish stands mpv keeps its window across tracks, so that it
//   neither flickers nor moves between two of them. It is closed for a
//   track that has no picture, when playback ends, and when the user says
//   so, here or with the compositor's own close key.
Item {
  id: root

  // ---- Given by the service ----

  // The player (the video commands, and what mpv reports about the
  // picture), the playback orchestrator (which track plays), the resolver
  // (the address of a track's picture), the compositor access, the state
  // store (where the window was left) and the typed settings.
  property var player: null
  property var playback: null
  property var resolver: null
  property var hyprCtl: null
  property var store: null
  property var settings: null

  // ---- What the service re-exports ----

  // "hidden", "loading" (the window is being opened or the picture is on
  // its way), "shown", or "unavailable": the wish stands, but this track
  // has no picture or the window cannot be opened; videoNote says which.
  readonly property string videoState: _state
  // "", or the code of why the picture is not there: E_VIDEO_NONE, or what
  // the compositor access answered (E_HYPR_NONE, E_HYPR_VERSION,
  // E_HYPR_ERRORS, E_HYPR_EVAL). A first showing that the compositor access
  // refused takes no wish: the state stays "hidden" and the reason stands
  // here until the track is over or something else is asked for.
  readonly property string videoNote: _note
  // The user's wish. It outlives the track and the end of playback, and is
  // not saved: a new session starts without a window.
  readonly property bool wanted: _wanted

  // ---- Private ----

  property string _state: "hidden"
  property string _note: ""
  property bool _wanted: false
  // The rule is being registered for a first showing; the wish is not
  // taken yet.
  property bool _opening: false
  // The window's place is being read before it is closed.
  property bool _closing: false
  // mpv was told to keep a window and has not been told otherwise since.
  property bool _window: false
  // The picture of the current track is selected.
  property bool _selected: false
  // Counts everything that makes an answer still on its way out of date:
  // a new attach, a hide, the end of playback. A callback that finds
  // another number than the one it started under says nothing.
  property int _pass: 0
  // The queue item whose picture address was already looked up a second
  // time. One such lookup per start of a track.
  property int _refreshedKey: 0
  // What the rule that was registered last says: { pct, corner }, or null.
  // And what it said when the window that is open now was opened.
  property var _placed: null
  property var _openedAs: null
  readonly property bool _keepAwake: root.settings ? root.settings.keepAwake === true : false
  readonly property var _started: ["playing", "paused", "buffering"]
  // How many monitors a place is remembered for.
  readonly property int _maxMonitors: 8

  // ---- Requests ----

  // Shows the picture of the current track, and of every track after it.
  // Returns false, and changes nothing, when no track plays or the wish
  // already stands. Why a window did not come is in videoNote.
  function showVideo(): bool {
    if (root._wanted || root._opening || root._closing || !root._usable()) return false
    if (root._playing() === null) return false
    var pass = ++root._pass
    root._note = ""
    root._opening = true
    root._register(function(code) {
      if (pass !== root._pass) return
      root._opening = false
      if (code !== "") { root._note = code; return }
      root._wanted = true
      root.player.setVideoWatch(true)
      root._attach(true)
    })
    return true
  }

  // Takes the window away and gives the wish up. Where the user left the
  // window is read first, for the next time. Returns false when there was
  // nothing to hide.
  function hideVideo(): bool {
    if (root._opening) {
      root._pass += 1
      root._opening = false
      return true
    }
    if (!root._wanted) {
      // Nothing to hide, but a reason that is still shown is put away.
      root._note = ""
      return false
    }
    root._close(false)
    return true
  }

  // Decides on what can be seen, not on the wish. While the wish stands and
  // nothing is shown (playback has ended, or the next track is on its way)
  // the button reads "show": the request is then a showing, which answers
  // false and keeps the wish, so the window still comes with the track.
  function toggleVideo(): bool {
    var visible = root._wanted && root._state !== "hidden"
    return visible || root._opening ? root.hideVideo() : root.showVideo()
  }

  // The service says that Hyprland loaded its configuration again. A sound
  // reload has wiped our rule and a failed one has kept it, and no listing
  // tells which. So the rule is registered again a moment later (reloads
  // come in bursts); the line itself does nothing when the rule is there.
  function compositorReloaded() {
    reloadTimer.restart()
  }

  // Forgets where the window was left on every monitor: the settings decide
  // again.
  function resetPlacement() {
    if (root.store) root.store.patch({ video: {} })
  }

  // The user picked another size or corner for the window. A place the
  // window was left in would overrule that choice, so every remembered
  // place is forgotten, and a window that is open moves to the new place.
  // Arrow keys step through the corners one press at a time, so the move
  // waits for the last press of a burst.
  function placementChosen() {
    root.resetPlacement()
    if (root._wanted && root._window) moveTimer.restart()
  }

  // ---- The rule ----

  function _usable() {
    return root.player !== null && root.playback !== null && root.resolver !== null && root.hyprCtl !== null
  }

  // Registers the rule for a window that opens now: asks the gate, reads
  // the monitors and the gaps, works out the place and sends the line.
  // then(code) gets "" when Hyprland holds the rule.
  function _register(then) {
    var hypr = root.hyprCtl
    hypr.gate(function(found) {
      if (found !== "ok") { then(hypr.gateCode(found)); return }
      hypr.monitors(function(monitors) {
        if (!monitors.ok) { then("E_HYPR_EVAL"); return }
        hypr.option("general:gaps_out", function(gaps) {
          if (!gaps.ok) { then("E_HYPR_EVAL"); return }
          var placed = Geometry.placement(monitors.value, gaps.value, root._placementSettings(),
            root._remembered())
          var line = placed.ok ? Lua.rule(placed) : ""
          if (line === "") { then("E_HYPR_EVAL"); return }
          hypr.evalLua(line, function(code) {
            if (code === "") root._placed = { pct: placed.pct, corner: placed.corner }
            then(code)
          })
        })
      })
    })
  }

  function _placementSettings() {
    var settings = root.settings
    return {
      videoSize: settings ? settings.videoSize : null,
      videoCorner: settings ? settings.videoCorner : null
    }
  }

  // The stored table of monitor name -> { corner, widthPct }, or null.
  function _remembered() {
    var values = root.store ? root.store.values : null
    var table = values !== null && typeof values === "object" ? values.video : null
    return table !== null && typeof table === "object" ? table : null
  }

  function _reregister() {
    if (!root._wanted || !root._usable()) return
    root._register(function(code) {
      // A window that could not be opened for want of the rule gets
      // another try now that the rule is there.
      if (code === "" && root._wanted && root._state === "unavailable" && root._note !== "E_VIDEO_NONE") {
        root._attach(true)
      }
    })
  }

  // ---- Attaching the picture of a track ----

  // The queue item that plays, pauses or buffers right now, or null.
  function _playing() {
    var playback = root.playback
    if (playback === null || root._started.indexOf(playback.status) === -1) return null
    var item = playback.current
    return item !== null && typeof item === "object" && typeof item.id === "string" ? item : null
  }

  // Runs when the wish is taken and after every start of a track while it
  // stands. ruled says that the rule was registered just now.
  function _attach(ruled) {
    var pass = ++root._pass
    root._selected = false
    var item = root._playing()
    // Between two tracks: the start of the next one attaches.
    if (item === null) return
    var entry = root.resolver.entry(item.id)
    var url = entry !== null && typeof entry === "object" && typeof entry.videoUrl === "string"
      ? entry.videoUrl : ""
    if (url === "") { root._unavailable("E_VIDEO_NONE"); return }
    root._note = ""
    root._state = "loading"
    loadingTimer.restart()
    // A window that is still there needs no rule: rules act when a window
    // opens.
    if (root._window || ruled) { root._open(pass, item, url); return }
    root._register(function(code) {
      if (pass !== root._pass) return
      if (code !== "") root._unavailable(code)
      else root._open(pass, item, url)
    })
  }

  function _open(pass, item, url) {
    if (!root._window) root._openedAs = root._placed
    root.player.setForceWindow(true)
    root._window = true
    root.player.readTracks(function(error, track) {
      if (pass !== root._pass) return
      if (error !== "") { root._unavailable("E_VIDEO_NONE"); return }
      // The picture was attached to this file before: it only has to be
      // selected again.
      if (track > 0) { root._select(track); return }
      root._add(pass, item, url, root._refreshedKey !== item.key)
    })
  }

  // Attaches the picture. The address stops working some hours after it
  // was looked up; when mpv cannot open it, it is looked up once more and
  // tried a second time. The sound plays on from what it has throughout.
  function _add(pass, item, url, mayRefresh) {
    root.player.addVideo(url, function(error) {
      if (pass !== root._pass) return
      if (error === "") {
        // The answer to the command does not name the new track.
        root.player.readTracks(function(readError, track) {
          if (pass !== root._pass) return
          if (readError === "" && track > 0) root._select(track)
          else root._unavailable("E_VIDEO_NONE")
        })
        return
      }
      if (!mayRefresh) { root._unavailable("E_VIDEO_NONE"); return }
      root._refreshedKey = item.key
      // The lookup and the second try each get the whole wait.
      loadingTimer.restart()
      root.resolver.refreshVideoUrl(item.id, function(answer) {
        if (pass !== root._pass) return
        var fresh = answer !== null && typeof answer === "object" && answer.ok === true
          && typeof answer.videoUrl === "string" ? answer.videoUrl : ""
        if (fresh === "") { root._unavailable("E_VIDEO_NONE"); return }
        loadingTimer.restart()
        root._add(pass, item, fresh, false)
      })
    })
  }

  function _select(track) {
    if (!root.player.selectVideo(track)) { root._unavailable("E_VIDEO_NONE"); return }
    root._selected = true
    // mpv keeps the screen awake only while a window is open and the track
    // plays, which is what the setting promises.
    root.player.setKeepAwake(root._keepAwake)
    root._pictured()
  }

  // The first picture can take seconds; until mpv reports one the state
  // stays "loading".
  function _pictured() {
    if (!root._wanted || !root._selected || root._state !== "loading") return
    if (root.player.hasPicture !== true) return
    loadingTimer.stop()
    root._state = "shown"
  }

  // The wish stands, but there is no window for this track: it has no
  // picture, or the window may not be opened. The next track tries again.
  function _unavailable(code) {
    root._pass += 1
    root._selected = false
    loadingTimer.stop()
    root._dropWindow()
    root._note = code
    root._state = "unavailable"
  }

  function _dropWindow() {
    root._window = false
    if (root.player === null) return
    root.player.setForceWindow(false)
    root.player.setKeepAwake(false)
  }

  // ---- Moving ----

  // Moves the open window to where the settings put it now. A rule acts
  // only when a window opens, and the rule is the one way OmaJuke places a
  // window, so the window is closed and opened again under a fresh rule:
  // the same steps as hiding it and showing it, without giving up the wish
  // and without remembering the old place. The sound plays on throughout.
  function _move() {
    if (!root._wanted || !root._window || root._opening || root._closing || !root._usable()) return
    root._pass += 1
    root._selected = false
    loadingTimer.stop()
    root.player.selectVideo(0)
    root._dropWindow()
    root._attach(false)
  }

  // ---- Closing ----

  // The end of the wish. byWindow is true when the user closed the window
  // with the compositor's close key: mpv has then deselected the picture
  // itself. In both cases mpv still holds the window until it is told
  // otherwise, so its place can be read first.
  function _close(byWindow) {
    root._pass += 1
    root._wanted = false
    root._selected = false
    root._note = ""
    root._state = "hidden"
    loadingTimer.stop()
    var finish = function() {
      root._closing = false
      if (!byWindow) root.player.selectVideo(0)
      root._dropWindow()
      root.player.setVideoWatch(false)
    }
    if (!root._window) { finish(); return }
    root._closing = true
    root._readPlace(finish)
  }

  // Reads where the window is and remembers it, then calls then() exactly
  // once. A read that fails or runs into its deadline remembers nothing.
  function _readPlace(then) {
    var hypr = root.hyprCtl
    hypr.clients(function(clients) {
      if (!clients.ok) { then(); return }
      var win = null
      for (var i = 0; i < clients.value.length; i++) {
        if (clients.value[i].className === Const.APP_NAME) { win = clients.value[i]; break }
      }
      if (win === null) { then(); return }
      hypr.monitors(function(monitors) {
        if (monitors.ok) root._remember(Geometry.fromWindow(win, monitors.value))
        then()
      })
    })
  }

  // Stores a place only when the user gave the window one: a window that is
  // still where the rule put it says nothing, and storing it would make the
  // settings for size and corner dead letters from the first hide on.
  function _remember(place) {
    if (!place.ok || root.store === null) return
    var placed = root._openedAs
    if (placed !== null && placed.corner === place.corner && placed.pct === place.widthPct) return
    var table = root._remembered()
    var names = table !== null ? Object.keys(table) : []
    var next = {}
    var known = false
    for (var i = 0; i < names.length; i++) {
      var name = names[i]
      var entry = table[name]
      if (entry === null || typeof entry !== "object") continue
      if (name === place.name) {
        if (entry.corner === place.corner && entry.widthPct === place.widthPct) return
        known = true
        continue
      }
      next[name] = { corner: entry.corner, widthPct: entry.widthPct }
    }
    // The table holds a few monitors; the one stored longest ago makes room.
    var kept = Object.keys(next)
    if (!known && kept.length >= root._maxMonitors) delete next[kept[0]]
    next[place.name] = { corner: place.corner, widthPct: place.widthPct }
    root.store.patch({ video: next })
  }

  // ---- What the others report ----

  function _onTrackStarted() {
    root._refreshedKey = 0
    if (root._wanted) root._attach(false)
    // A showing that was refused was about the track before this one.
    else if (!root._opening) root._note = ""
  }

  // Playback ended or failed: there is nothing to show a picture of. The
  // wish stays, so the next track opens the window again. Between two
  // tracks of a queue playback is never idle, and the window stays.
  function _onStatus() {
    var status = root.playback.status
    if (status !== "idle" && status !== "error") return
    if (root._opening) {
      root._pass += 1
      root._opening = false
      return
    }
    if (root._closing) return
    if (!root._wanted) {
      // Why a showing was refused is of no use once nothing plays.
      root._note = ""
      return
    }
    root._dropWindow()
    root._rest()
  }

  // mpv went away by itself and took its window along: there is nothing
  // left to switch off. Whatever playback does about it, the wish stays.
  function _onExited() {
    root._window = false
    if (root._wanted && !root._closing) root._rest()
  }

  // No window, and nothing on its way to one, until a track starts.
  function _rest() {
    root._pass += 1
    root._selected = false
    loadingTimer.stop()
    root._note = ""
    root._state = "hidden"
  }

  function _onVideoClosed() {
    if (root._wanted && !root._closing) root._close(true)
  }

  on_KeepAwakeChanged: {
    if (root._selected && root.player !== null) root.player.setKeepAwake(root._keepAwake)
  }

  Connections {
    target: root.playback
    function onTrackStarted(item) { root._onTrackStarted() }
    function onStatusChanged() { root._onStatus() }
  }

  Connections {
    target: root.player
    function onVideoClosed() { root._onVideoClosed() }
    function onHasPictureChanged() { root._pictured() }
    function onExited(crashed) { root._onExited() }
  }

  // Bounds the wait for a picture: runs only in "loading".
  Timer {
    id: loadingTimer
    interval: Const.TIMEOUTS.videoMs
    onTriggered: root._unavailable("E_VIDEO_NONE")
  }

  Timer {
    id: reloadTimer
    interval: Const.TIMEOUTS.reloadMs
    onTriggered: root._reregister()
  }

  // Runs only after the user picked a place while the window is open.
  Timer {
    id: moveTimer
    interval: Const.TIMEOUTS.moveMs
    onTriggered: root._move()
  }
}
