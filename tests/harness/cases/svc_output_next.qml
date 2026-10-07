import QtQuick

// The request `output next` when it is the first thing of a session that
// has to do with outputs: no panel was opened, no output was ever chosen,
// and no shortcut is saved. Until then mpv was never asked which outputs
// there are, so the request arrives before any list does.
//
// It must work all the same, the first time: the request makes the player
// ask for the list, and the step is taken when the list arrives. Only
// without a player is there nothing to step through.
QtObject {
  id: root

  property string kind: "service"

  property var h: null
  property var steps: []
  property int at: 0

  readonly property string idA: "AAAAAAAAAAA"
  readonly property string speakers: "pipewire/stub.speakers"
  readonly property string headphones: "pipewire/stub.headphones"

  // Related tracks are another case's subject.
  function setup(h, done) {
    var entry = { id: h.manifest.id, autoplay: false }
    h.shell.barConfig = { position: "top", layout: { left: [], center: [], right: [entry] } }
    done()
  }

  function run(h) {
    root.h = h
    h.scenario({ ytdlp: "ok", mpv: "ok" })
    root.steps = [root.nothingPlays, root.firstPress, root.secondPress, root.afterStop]
    root.next()
  }

  function next() {
    if (root.at >= root.steps.length) { root.h.finish(); return }
    root.steps[root.at++]()
  }

  function until(label, predicate, ms, then) {
    root.h.waitFor(predicate, ms, function(met) {
      root.h.check(met, label)
      then()
    })
  }

  function commands() {
    return root.h.log("mpv").map(function(line) { return line.command })
  }

  // The devices mpv was told to use, in order.
  function told() {
    return root.commands().filter(function(command) {
      return command[0] === "set_property" && command[1] === "audio-device"
    }).map(function(command) { return command[2] })
  }

  function asked() {
    return root.commands().filter(function(command) {
      return command[0] === "observe_property" && command[2] === "audio-device-list"
    }).length
  }

  function current() {
    var list = root.h.service.outputs.filter(function(output) { return output.current === true })
    return list.map(function(output) { return output.name })
  }

  function nothingPlays() {
    var h = root.h
    var s = h.service
    root.until("ready", function() { return s.ready }, 5000, function() {
      h.equal(s._ipcOutput("next"), "unhandled", "nothing plays: there is no player to list outputs")
      h.after(300, function() {
        h.equal([s.outputs.length, h.log("mpv-start").length], [0, 0],
          "nothing plays: and the request starts none")
        root.next()
      })
    })
  }

  // A fresh service: the request above is forgotten with the one before.
  function firstPress() {
    var h = root.h
    h.recreate(function() {
      var s = h.service
      root.until("first press: ready", function() { return s.ready }, 5000, function() {
        var track = { id: root.idA, title: "A track", channel: "A channel", duration: 200, live: false }
        h.check(s.playTrack(track), "first press: a track is taken")
        root.until("first press: it plays", function() { return s.playbackState === "playing" }, 8000,
          function() {
            h.after(300, function() {
              h.equal([root.asked(), s.outputs.length, root.told()], [0, 0, []],
                "first press: nobody has asked for the outputs so far")
              h.equal(s._ipcOutput("next"), "ok", "first press: taken although no list is there")
              root.until("first press: the step is taken when the list arrives", function() {
                return root.current().join() === root.speakers
              }, 5000, function() {
                h.equal([root.asked(), root.told()], [1, [root.speakers]],
                  "first press: mpv was asked for its outputs once and told one device")
                h.equal([s.outputs.length, h.parts.store.values.outputDevice], [3, root.speakers],
                  "first press: the list is there now, and the choice is saved")
                root.next()
              })
            })
          })
      })
    })
  }

  function secondPress() {
    var h = root.h
    var s = h.service
    h.equal(s._ipcOutput("next"), "ok", "second press: taken")
    root.until("second press: one device further", function() {
      return root.current().join() === root.headphones
    }, 5000, function() {
      h.equal(root.told(), [root.speakers, root.headphones], "second press: each step was sent once")
      root.next()
    })
  }

  function afterStop() {
    var h = root.h
    var s = h.service
    h.check(s.stop(), "stop: taken")
    var gone = function() { return h.parts.player.mpvState === "off" }
    root.until("stop: mpv is gone", gone, 5000, function() {
      h.equal(s._ipcOutput("next"), "unhandled", "stop: without a player the request says so")
      h.equal(root.told(), [root.speakers, root.headphones], "stop: and nothing more was sent")
      h.alive(function(names) {
        h.equal(names, [], "no stub is left running")
        root.next()
      })
    })
  }
}
