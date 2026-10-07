import QtQuick
import "../../../lib/MpvArgs.js" as MpvArgs
import "../../../lib/MpvProto.js" as MpvProto
import "../../../lib/PlayerState.js" as PlayerState
import "../../vectors/mpvproto.js" as MpvProtoVectors

// Runs the vector table of MpvProto in Qt's JavaScript engine, the one the
// plugin really runs on, and replays every trace recorded from the real mpv
// through MpvProto.feed, MpvProto.parse and PlayerState there as well. The
// node tests do the same on another engine; a gate counts as proven only
// when it passes in both.
QtObject {
  id: root

  property string kind: "component"

  // Every trace and the signals it must produce (the table of
  // tests/node/playerstate.test.js).
  readonly property var expected: ({
    cold_load: ["idle", "loading 1", "started 1"],
    replace: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
    three_replaces: ["idle", "loading 1", "started 1", "loading 4", "started 4"],
    three_replaces_apart: ["idle", "loading 1", "started 1", "loading 4", "started 4"],
    playlist_next: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
    playlist_prev: ["idle", "loading 1", "started 1", "loading 2", "started 2", "loading 1", "started 1"],
    stop: ["idle", "loading 1", "started 1", "idle"],
    stop_then_load: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
    eof_with_next: ["idle", "loading 1", "started 1", "ended 1 eof", "loading 2", "started 2"],
    eof_last: ["idle", "loading 1", "started 1", "ended 1 eof", "idle"],
    error_with_next: ["idle", "loading 1", "ended 1 error loading failed", "loading 2", "started 2"],
    error_last: ["idle", "loading 1", "ended 1 error loading failed", "idle"],
    error_not_media: ["idle", "loading 1", "ended 1 error unrecognized file format", "idle"],
    error_no_data: ["idle", "loading 1", "started 1", "ended 1 error no audio or video data played", "idle"],
    pause_resume: ["idle", "loading 1", "started 1"],
    replace_while_paused: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
    seek: ["idle", "loading 1", "started 1"],
    seek_past_end: ["idle", "loading 1", "started 1", "ended 1 eof", "idle"],
    start_near_end: ["idle", "loading 1", "started 1", "ended 1 eof", "idle"],
    position_watch: ["idle", "loading 1", "started 1"],
    append_play_while_idle: ["idle", "loading 1", "started 1"],
    append_play_while_playing: ["idle", "loading 1", "started 1"],
    even_volume: ["idle", "loading 1", "started 1"],
    external_volume_speed: ["idle", "loading 1", "started 1"],
    external_stop: ["idle", "loading 1", "started 1", "idle"],
    foreign_load: ["idle", "loading 1", "started 1", "idle"],
    playlist_edit: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
    playlist_burst: ["idle", "loading 1", "started 1"],
    playlist_remove_current: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
    playlist_clear: ["idle", "loading 1", "started 1"],
    play_index_past_end: ["idle", "loading 1", "started 1", "idle"],
    video_show_hide: ["idle", "loading 1", "started 1"],
    video_track_change: ["idle", "loading 1", "started 1", "loading 2", "started 2"],
    video_show_again: ["idle", "loading 1", "started 1"],
    video_closed: ["idle", "loading 1", "started 1", "videoClosed"],
    video_add_fails: ["idle", "loading 1", "started 1"],
    output_select: ["idle", "loading 1", "started 1"],
    lost_load: ["idle", "idle"]
  })

  // The traces in which mpv's playlist is changed by somebody else, or by a
  // command the player never sends.
  readonly property var notOurPlaylist: ["external_stop", "foreign_load", "lost_load", "playlist_clear"]

  // Plays one trace through the reader and the reducer the way the player
  // does: replies to loads fill the table of playlist entries, and a replace
  // makes every older entry dead. mpv's playlist is kept as a list of keys
  // the way the player keeps it: changed by each command of ours at once,
  // and set to what mpv reports whenever none of them is unanswered.
  // Returns the signals, the commands that are not questions about the
  // position, the number of lines that could not be read or commands that
  // could not be sent, that list of keys, how often a report differed from
  // it, and the last value mpv told of each property.
  function replay(trace) {
    var state = PlayerState.initial()
    var entries = new Map()
    var floor = 0
    var loads = new Map()
    var questions = new Map()
    var requests = 0
    var keys = 0
    var out = { signals: [], answers: [], unread: 0, keys: [], surprises: 0, last: {} }
    var edits = new Map()
    var asked = new Map()
    var quitting = false
    var reported = function(data) {
      if (edits.size > 0) return
      var now = PlayerState.keysOf(MpvProto.playlistIds(data), entryKind)
      if (JSON.stringify(now) !== JSON.stringify(out.keys)) out.surprises++
      out.keys = now
    }
    var entryKind = function(id) {
      if (entries.has(id)) return { key: entries.get(id), dead: false, live: false }
      return { key: 0, dead: id < floor }
    }
    var take = function(result) {
      state = result.state
      for (var s = 0; s < result.signals.length; s++) {
        out.signals.push([result.signals[s].name].concat(result.signals[s].args).join(" ").trim())
      }
      for (var c = 0; c < result.commands.length; c++) {
        if (result.commands[c][0] !== "get_property") out.answers.push(result.commands[c])
        if (MpvProto.encode(result.commands[c], 1) === "") out.unread++
      }
    }
    for (var i = 0; i < trace.length; i++) {
      var record = trace[i]
      if (record.other !== undefined) continue
      if (record.send !== undefined) {
        requests++
        if (record.send[0] === "loadfile") {
          keys++
          loads.set(requests, { key: keys, mode: record.send[2] })
          out.keys = PlayerState.keysAfterLoad(out.keys, keys, record.send[2], record.send[3])
          edits.set(requests, true)
        } else if (record.send[0] === "playlist-remove") {
          out.keys = PlayerState.keysAfterRemove(out.keys, record.send[1])
          edits.set(requests, true)
        } else if (record.send[0] === "stop") {
          out.keys = []
          edits.set(requests, true)
        }
        if (record.send[0] === "quit") quitting = true
        if (record.send[0] === "get_property") {
          if (record.send[1] === "time-pos") questions.set(requests, true)
          else asked.set(requests, record.send[1])
        }
        if (record.send[0] === "seek") take(PlayerState.onLocalSeek(state, record.send[1], record.t))
        continue
      }
      // Through feed as well: one line a chunk, cut in two.
      var text = JSON.stringify(record.recv) + "\n"
      var half = MpvProto.feed(null, text.slice(0, 7), 65536)
      var whole = MpvProto.feed(half.pending, text.slice(7), 65536)
      var message = whole.lines.length === 1 ? MpvProto.parse(whole.lines[0]) : null
      if (message === null) {
        out.unread++
        continue
      }
      if (message.kind === "event") {
        take(PlayerState.onEvent(state, message, entryKind, record.t))
        // What mpv says on its way out is not about the track any more.
        if (message.event !== "property-change" || quitting) continue
        out.last[message.name] = message.data
        if (message.name === "playlist") reported(message.data)
        continue
      }
      var loaded = loads.get(message.request_id)
      if (loaded !== undefined && message.error === "") {
        var id = MpvProto.entryId(message.data)
        if (loaded.mode === "replace") {
          floor = id
          entries = new Map()
        }
        entries.set(id, loaded.key)
      }
      edits.delete(message.request_id)
      if (asked.has(message.request_id) && message.error === "") {
        out.last[asked.get(message.request_id)] = message.data
        if (asked.get(message.request_id) === "playlist") reported(message.data)
      }
      if (questions.has(message.request_id) && message.error === "") {
        take(PlayerState.onProperty(state, "time-pos", message.data, record.t))
      }
    }
    return out
  }

  function checkTraces(h, fixture) {
    var names = Object.keys(root.expected)
    h.equal(Object.keys(fixture.traces).sort(), names.slice().sort(), "every trace has its expectation")
    for (var i = 0; i < names.length; i++) {
      var out = root.replay(fixture.traces[names[i]])
      h.equal(out.signals, root.expected[names[i]], "trace " + names[i])
      h.equal(out.unread, 0, "trace " + names[i] + ": every line is read and every command can be sent")
      if (root.notOurPlaylist.indexOf(names[i]) === -1) {
        h.equal(out.surprises, 0, "trace " + names[i] + ": the list of keys is the playlist mpv reports")
      }
    }
    h.equal(root.replay(fixture.traces.foreign_load).answers, [["stop"]], "a foreign file is stopped")
    h.equal(root.replay(fixture.traces.lost_load).answers, [["stop"]],
      "a foreign file behind our load is stopped")
    h.equal(root.replay(fixture.traces.external_volume_speed).answers,
      [["set_property", "volume", 100], ["set_property", "speed", 1]], "volume and speed are set back")
  }

  // The playlist as keys after the traces that edit it, and what the
  // readers make of the last values mpv told.
  function checkValues(h, fixture) {
    h.equal(root.replay(fixture.traces.playlist_edit).keys, [1, 2], "appended, inserted, removed twice")
    h.equal(root.replay(fixture.traces.playlist_burst).keys, [1, 4], "two removals and a load in one write")
    h.equal(root.replay(fixture.traces.playlist_remove_current).keys, [2], "the playing entry removed")
    h.equal(root.replay(fixture.traces.foreign_load).keys, [], "nothing is left after a foreign file")
    var kind = function(id) { return id === 4 ? { key: 9 } : { key: 0, dead: true } }
    h.equal(PlayerState.keysOf([3, 4, 0], kind), [0, 9, 0], "an entry that is not ours keeps its slot")

    var again = root.replay(fixture.traces.video_show_again).last
    h.equal([MpvProto.videoTracks(again["track-list"]), MpvProto.trackId(again["vid"]),
      MpvProto.hasPicture(again["video-params"])], [[1], 1, true], "a video that was added and is shown")
    var closed = root.replay(fixture.traces.video_closed).last
    h.equal([MpvProto.trackId(closed["vid"]), MpvProto.hasPicture(closed["video-params"])], [0, false],
      "after the window was closed: no track selected, no picture")
    var outputs = root.replay(fixture.traces.output_select).last
    var list = MpvProto.devices(outputs["audio-device-list"])
    h.equal(list.map(function(device) { return device.name }),
      ["auto", "pipewire/stub.speakers", "pipewire/stub.headphones"], "the outputs mpv listed")
    h.equal(MpvProto.setAudioDevice(list[1].name, list), ["set_property", "audio-device", list[1].name],
      "a listed output can be selected")
    h.equal(MpvProto.deviceName(outputs["audio-device"]), "auto", "the output mpv plays on")
  }

  // The launch flags, as the real mpv accepted them when the traces were
  // made.
  function checkLaunch(h, fixture) {
    var sock = "/run/user/1000/omajuke/mpv.sock"
    var argv = MpvArgs.launch({ sock: sock, volume: 70, mpris: false, ytdlp: "/usr/bin/yt-dlp" })
    var recorded = fixture.argv.slice(0, argv.length)
    recorded[3] = "--input-ipc-server=" + sock
    h.equal(argv, recorded, "the launch flags are the recorded ones")
    h.equal(MpvArgs.launch({ sock: "/run/user/1000/a,b/mpv.sock", volume: 70, mpris: false,
      ytdlp: "/usr/bin/yt-dlp" }), null, "a socket path with a comma is refused")
  }

  // The reducer hands back a new state each time, here as under node, and
  // its own stop leaves no track behind.
  function checkReducer(h) {
    var first = PlayerState.initial()
    var second = PlayerState.onProperty(first, "volume", 150, 0)
    h.equal(first.volume, 0, "the state that went in is untouched")
    h.equal(second.state.volume, 100, "the volume is clamped")
    h.equal(second.commands, [["set_property", "volume", 100]], "and sent back clamped")

    var entryKind = function(id) { return { key: 7, dead: false, live: false } }
    var begin = MpvProto.parse(JSON.stringify({ event: "start-file", playlist_entry_id: 3 }))
    var restart = MpvProto.parse(JSON.stringify({ event: "playback-restart" }))
    var state = PlayerState.onEvent(first, begin, entryKind, 1000).state
    state = PlayerState.onProperty(state, "duration", 213, 1000).state
    state = PlayerState.onEvent(state, restart, entryKind, 1000).state
    state = PlayerState.onProperty(state, "core-idle", false, 1000).state
    h.equal([state.phase, state.key, state.entry, state.duration], ["playing", 7, 3, 213], "a track plays")
    var stopped = PlayerState.onLocalStop(state, 3000)
    h.equal([stopped.signals, stopped.commands], [[], []], "our own stop: no signal and no command")
    h.equal([stopped.state.phase, stopped.state.key, stopped.state.entry, stopped.state.duration],
      ["idle", 0, 0, 0], "and no track from that moment")
    h.equal(PlayerState.positionNow(stopped.state, 9000), 2, "the position stays where it stopped")
    h.equal(state.phase, "playing", "the state that went in is untouched again")
  }

  function run(h) {
    h.vectors(MpvProto, MpvProtoVectors)

    var fixture = null
    try {
      fixture = JSON.parse(h.readFile(h.repo + "/tests/fixtures/mpv-traces.json"))
    } catch (error) {
      fixture = null
    }
    h.check(fixture !== null && fixture.traces !== undefined, "the trace fixture is readable")
    if (fixture === null) { h.finish(); return }

    root.checkTraces(h, fixture)
    root.checkValues(h, fixture)
    root.checkLaunch(h, fixture)
    root.checkReducer(h)
    h.finish()
  }
}
