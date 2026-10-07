import QtQuick
import "../../lib/StateFile.js" as StateFile

// What a case about core/VideoWindow.qml is built from. The compositor side
// is real: a process runner and core/HyprCtl.qml, which talk to the hyprctl
// stub. The playback side is scripted: stand-ins for the player, the
// playback orchestrator, the resolver and the state store, each with the
// members the video window may use and no others, so that a call to
// anything else fails in the case as it would in the shell.
//
// The stand-in player writes every command down and answers the way the
// real one promises to: never inside the call, and with the id of the
// attached picture once there is one. What mpv would do next (a first
// picture, an address that does not open) is for the case to script.
Item {
  id: root

  // The harness, given at creation.
  property var h: null

  readonly property var player: fakePlayer
  readonly property var playback: fakePlayback
  readonly property var resolver: fakeResolver
  readonly property var store: fakeStore
  // The typed settings the window reads; replaced as a whole on a change,
  // like the real ones.
  property var settings: ({ videoSize: "quarter", videoCorner: "bottom-right", keepAwake: true })
  // The real parts, once build() has run.
  property var runner: null
  property var hypr: null
  property var video: null
  // Every value videoState has had since the last clearStates().
  property var states: []

  // A picture address of the only shape the plugin hands to mpv.
  function url(name) {
    return "https://rr1---sn-test.googlevideo.com/videoplayback?id=" + name
  }

  // Mounts the runner, the compositor access and the video window. Returns
  // false when one of them did not load.
  function build() {
    var h = root.h
    root.runner = h.mount("core/ProcessRunner.qml", { tools: h.tools })
    root.hypr = h.mount("core/HyprCtl.qml", { runner: root.runner, tools: h.tools })
    root.video = h.mount("core/VideoWindow.qml", {
      player: fakePlayer, playback: fakePlayback, resolver: fakeResolver, hyprCtl: root.hypr,
      store: fakeStore, settings: Qt.binding(function() { return root.settings })
    })
    if (root.runner === null || root.hypr === null || root.video === null) return false
    root.video.videoStateChanged.connect(function() {
      root.states = root.states.concat([root.video.videoState])
    })
    return true
  }

  function clearStates() {
    root.states = []
  }

  function set(changes) {
    var next = {}
    for (var key in root.settings) next[key] = root.settings[key]
    for (var changed in changes) next[changed] = changes[changed]
    root.settings = next
  }

  // A track starts: a new file in mpv, which knows nothing of a picture.
  // videoUrl "" is a track that has none.
  function start(key, id, videoUrl) {
    fakeResolver.entries.set(id, { id: id, n: key, file: "/run/user/1000/omajuke/info/" + key + ".json",
      videoUrl: videoUrl })
    var item = { key: key, id: id, title: "Synthetic " + key }
    fakePlayer.newFile()
    fakePlayback.current = item
    fakePlayback.status = "playing"
    fakePlayback.trackStarted(item)
  }

  // Playback ends, the way the orchestrator reports it.
  function end(status) {
    fakePlayback.status = status
    fakePlayback.current = null
  }

  // What the hyprctl stub was started with, as the word that tells the
  // requests apart.
  function requests() {
    return root.h.log("hyprctl").map(function(entry) {
      return entry.argv[0] === "-j" ? entry.argv[1] : entry.argv[0]
    })
  }

  // The lines that were sent to the compositor, in order.
  function lines() {
    return root.h.log("hyprctl").filter(function(entry) { return entry.argv[0] === "eval" })
      .map(function(entry) { return entry.argv[2] })
  }

  // The window as the stub's client list shows it. Without a window the
  // list holds one of somebody else.
  function placeWindow(at, size, more) {
    var win = { "class": "OmaJuke", title: "OmaJuke", at: at, size: size, floating: true, fullscreen: 0 }
    for (var key in more) win[key] = more[key]
    root.patchStub({ clients: [{ "class": "editor", title: "Somebody's notes", at: [0, 30], size: [900, 1000],
      floating: false, fullscreen: 0 }, win] })
  }

  // Changes keys of the stub's state and keeps the others.
  function patchStub(changes) {
    var state = root.h.stubState("hyprctl") || {}
    for (var key in changes) state[key] = changes[key]
    root.h.setStubState("hyprctl", state)
  }

  QtObject {
    id: fakePlayer

    // Every command, in order, as { name, args, seen }. seen is what
    // probe() returned at that moment, when the case set one.
    property var calls: []
    property var probe: null
    // What mpv reports while it is watched.
    property bool hasPicture: false
    property int videoTrack: 0
    property int externalVideo: 0
    // The errors the next addVideo calls end with, in order; "" or nothing
    // left means that the picture was attached.
    property var addErrors: []
    // While true addVideo keeps its answer; release() hands them out.
    property bool holdAdds: false
    property var held: []
    // The error readTracks answers with, "" for none.
    property string tracksError: ""
    // Whether selecting the picture leads to a first frame a moment later.
    property bool pictures: true

    signal videoClosed()
    signal exited(bool crashed)

    function names() {
      return fakePlayer.calls.map(function(call) {
        return call.args.length > 0 ? call.name + ":" + call.args.join(",") : call.name
      })
    }

    function clearCalls() {
      fakePlayer.calls = []
    }

    function newFile() {
      fakePlayer.externalVideo = 0
      fakePlayer.videoTrack = 0
      fakePlayer.hasPicture = false
    }

    function release() {
      var waiting = fakePlayer.held
      fakePlayer.held = []
      for (var i = 0; i < waiting.length; i++) waiting[i]()
    }

    function _record(name, args) {
      var seen = typeof fakePlayer.probe === "function" ? fakePlayer.probe() : null
      fakePlayer.calls = fakePlayer.calls.concat([{ name: name, args: args, seen: seen }])
    }

    function setVideoWatch(on) {
      fakePlayer._record("setVideoWatch", [on])
      if (!on) fakePlayer.hasPicture = false
    }

    function setForceWindow(on) {
      fakePlayer._record("setForceWindow", [on])
    }

    function readTracks(done) {
      fakePlayer._record("readTracks", [])
      var error = fakePlayer.tracksError
      var track = fakePlayer.externalVideo
      Qt.callLater(function() { done(error, error === "" ? track : 0) })
    }

    function addVideo(videoUrl, done) {
      fakePlayer._record("addVideo", [videoUrl])
      var error = fakePlayer.addErrors.length > 0 ? fakePlayer.addErrors[0] : ""
      fakePlayer.addErrors = fakePlayer.addErrors.slice(1)
      var answer = function() {
        if (error === "") fakePlayer.externalVideo = 1
        done(error)
      }
      if (fakePlayer.holdAdds) fakePlayer.held = fakePlayer.held.concat([answer])
      else Qt.callLater(answer)
    }

    function selectVideo(id) {
      fakePlayer._record("selectVideo", [id])
      if (id !== 0 && id !== fakePlayer.externalVideo) return false
      fakePlayer.videoTrack = id
      if (id === 0) fakePlayer.hasPicture = false
      else if (fakePlayer.pictures) Qt.callLater(function() { fakePlayer.hasPicture = true })
      return true
    }

    function setKeepAwake(on) {
      fakePlayer._record("setKeepAwake", [on])
    }
  }

  QtObject {
    id: fakePlayback

    property string status: "idle"
    property var current: null

    signal trackStarted(var item)
    signal trackEnded(var item)
  }

  QtObject {
    id: fakeResolver

    // The ids a new picture address was asked for, in order.
    property var calls: []
    property var entries: new Map()
    // What the next lookups answer, in order; with nothing left a lookup
    // answers with a new address.
    property var answers: []

    function entry(id) {
      var found = fakeResolver.entries.get(id)
      return found === undefined ? null : found
    }

    function refreshVideoUrl(id, done) {
      fakeResolver.calls = fakeResolver.calls.concat([id])
      var answer = fakeResolver.answers.length > 0 ? fakeResolver.answers[0]
        : { ok: true, code: "", videoUrl: root.url("fresh-" + id) }
      fakeResolver.answers = fakeResolver.answers.slice(1)
      Qt.callLater(function() { done(answer) })
    }
  }

  // Keeps the state the way the real store does, through the same
  // validation, without a file.
  QtObject {
    id: fakeStore

    property var values: StateFile.defaults()
    // Every change that was handed in, as it came.
    property var patches: []

    function patch(changes) {
      var plain = JSON.parse(JSON.stringify(changes))
      var next = StateFile.withChanges(fakeStore.values, plain)
      if (next === null) return false
      fakeStore.patches = fakeStore.patches.concat([plain])
      fakeStore.values = next
      return true
    }

    // The remembered places as a plain object, for a comparison.
    function video() {
      return JSON.parse(JSON.stringify(fakeStore.values.video))
    }
  }
}
