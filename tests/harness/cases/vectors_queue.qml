import QtQuick
import "../../../lib/Queue.js" as Queue
import "../../vectors/queue.js" as QueueVectors

// Runs the vector table of Queue in Qt's JavaScript engine, the one the
// plugin really runs on, and then checks there what a table cannot hold:
// that a queue and a playlist kept in QML properties are still the lists
// the planner takes them for.
QtObject {
  id: root

  property string kind: "component"

  // The two lists as the playback component and the player keep them.
  property var queue: []
  property var entryKeys: []

  function track(letter) {
    return {
      id: new Array(12).join(letter), title: "Track " + letter, channel: "Channel", duration: 100,
      live: false
    }
  }

  // A queue built by the module's own edits and kept in a property plans
  // like one that never left the engine.
  function checkProperties(h) {
    var made = Queue.append([], -1, root.track("A"), 1, false)
    made = Queue.append(made.queue, 0, root.track("B"), 2, false)
    made = Queue.append(made.queue, 0, root.track("C"), 3, true)
    root.queue = made.queue
    root.entryKeys = [1]
    h.check(Array.isArray(root.queue) && Array.isArray(root.entryKeys), "property lists are still arrays")
    var all = function(id) { return true }
    h.equal(Queue.plan(root.queue, 0, all, root.entryKeys, 1),
      [{ op: "load", key: 2, mode: "append-play", index: -1 }], "the first item plays: the second joins")
    root.entryKeys = [1, 2]
    h.equal(Queue.plan(root.queue, 0, all, root.entryKeys, 1), [], "a window in shape needs nothing")
    h.equal(Queue.plan(root.queue, 1, all, root.entryKeys, 2),
      [{ op: "load", key: 3, mode: "append-play", index: -1 }], "mpv moved on: the third joins")
    root.entryKeys = [1, 2, 3]
    h.equal(Queue.plan(root.queue, 2, all, root.entryKeys, 3), [{ op: "remove", key: 1 }],
      "and on: the first leaves")
    h.equal(Queue.plan(root.queue, 0, all, root.entryKeys, 3),
      [{ op: "remove", key: 2 }, { op: "remove", key: 1 }],
      "another item was asked for: all but the playing entry leave, from the back")
    h.equal(Queue.keepIds(root.queue, 1), [root.queue[0].id, root.queue[1].id, root.queue[2].id],
      "the items beside the current one are kept")
    h.equal([root.queue[2].auto, Queue.itemAt(root.queue, 2) === root.queue[2]], [true, true],
      "an item read back from the property is the item")
  }

  // What a list model hands a delegate is accepted as the item it was made
  // from, whatever order its members come back in.
  function checkModelRow(h) {
    var made = Queue.append([], -1, root.track("A"), 7, false)
    var row = JSON.parse(JSON.stringify(made.queue[0]))
    var shuffled = {
      live: row.live, key: row.key, auto: row.auto, title: row.title, id: row.id, duration: row.duration,
      channel: row.channel
    }
    h.equal(Queue.indexOfKey([shuffled], 7), 0, "an item with its members in another order is an item")
    shuffled.extra = 1
    h.equal(Queue.indexOfKey([shuffled], 7), -1, "one with a member too many is not")
  }

  function run(h) {
    h.vectors(Queue, QueueVectors)
    root.checkProperties(h)
    root.checkModelRow(h)
    h.finish()
  }
}
