import QtQuick
import Quickshell
import Quickshell.Io
import QtTest

// Root of the UI harness. tests/harness.sh copies this one file into a
// throwaway directory next to links to the first-party kit and starts a
// headless Quickshell on it (no compositor, no session bus, offscreen
// platform). It imports nothing from the repository: a copied file with a
// relative import would point outside its root. Everything else, the mock
// service, the fake bar, the case and whatever the case mounts, is loaded
// from $OMAJUKE_REPO by file URL.
//
// It owns the one offscreen window the view is mounted in, the object `h`
// that cases drive it with, and the result line the launcher reads.
ShellRoot {
  id: root

  readonly property string repo: Quickshell.env("OMAJUKE_REPO") || ""
  readonly property string runDir: Quickshell.env("XDG_RUNTIME_DIR") || ""
  readonly property string caseName: Quickshell.env("OMAJUKE_CASE") || ""

  property var mock: null
  property var bar: null
  property var testCase: null
  property var mounted: []
  property var waits: []
  property var failures: []
  property int checks: 0
  property bool finished: false
  // Time the view gets between two steps of a case.
  readonly property int settleMs: 80

  // ---- Loading from the repository ----

  function create(relPath, parent, props) {
    var component = Qt.createComponent("file://" + root.repo + "/" + relPath, Component.PreferSynchronous)
    if (component.status !== Component.Ready) {
      console.warn("harness: cannot load " + relPath + ": " + component.errorString())
      h.check(false, "load " + relPath)
      return null
    }
    var object = component.createObject(parent, props || {})
    if (object === null) {
      console.warn("harness: cannot create " + relPath + ": " + component.errorString())
      h.check(false, "create " + relPath)
    }
    return object
  }

  // Runs test code. An exception there must fail the case at once instead of
  // leaving it to the launcher's timeout.
  function guarded(label, fn) {
    try {
      fn()
    } catch (error) {
      console.warn("harness: exception in " + label + ": " + error)
      h.check(false, "exception in " + label)
      h.finish()
    }
  }

  function start() {
    pidFile.setText(String(Quickshell.processId))
    root.mock = root.create("tests/harness-ui/MockService.qml", root, {})
    root.bar = root.create("tests/harness-ui/FakeBar.qml", root, { service: root.mock })
    root.testCase = root.create("tests/harness-ui/cases/" + root.caseName + ".qml", root, {})
    if (!root.mock || !root.bar || !root.testCase) {
      h.finish()
      return
    }
    // Key events go to the window that has the focus, so the case starts
    // once the offscreen window is the active one.
    surface.requestActivate()
    h.waitFor(function() { return surface.active }, 2000, function(active) {
      h.check(active, "the harness window is active")
      root.testCase.run(h)
    })
  }

  // ---- Waiting ----

  function tick() {
    var now = Date.now()
    var due = []
    var later = []
    for (var i = 0; i < root.waits.length; i++) {
      var wait = root.waits[i]
      var met = false
      if (wait.predicate) {
        try {
          met = !!wait.predicate()
        } catch (error) {
          met = false
        }
      }
      if (met || now >= wait.until) due.push({ wait: wait, met: met })
      else later.push(wait)
    }
    root.waits = later
    if (later.length === 0) poll.stop()
    due.forEach(function(entry) {
      if (root.finished) return
      root.guarded("a callback", function() { entry.wait.then(entry.met) })
    })
  }

  function addWait(predicate, ms, then) {
    root.waits.push({ predicate: predicate, until: Date.now() + ms, then: then })
    poll.start()
  }

  // ---- Looking at what is on screen ----

  function walk(item, visit) {
    if (!item) return
    visit(item)
    var kids = item.children
    if (!kids) return
    for (var i = 0; i < kids.length; i++) root.walk(kids[i], visit)
  }

  // A QtQuick Text, or a type derived from it (the kit's section header).
  function isText(item) {
    return item.textFormat !== undefined && item.elide !== undefined && item.lineCount !== undefined
  }

  // A vector argument that source text cannot carry is described instead
  // of written out; tests/node/load.js expands the same two forms.
  function expand(arg) {
    if (arg === null || typeof arg !== "object" || Array.isArray(arg)) return arg
    if (typeof arg.gen !== "string") return arg
    if (arg.gen === "repeat") return String(arg.unit).repeat(arg.count)
    if (arg.gen === "codes") return String.fromCharCode.apply(null, arg.codes)
    throw new Error("unknown generator: " + arg.gen)
  }

  FileView {
    id: pidFile
    path: root.runDir + "/qs.pid"
    blockWrites: true
    printErrors: false
  }

  FileView {
    id: scratchFile
    blockWrites: true
    printErrors: false
  }

  // A quit during load is lost, and the instance would run into the
  // launcher's timeout: everything starts from this timer instead.
  Timer {
    interval: 100
    running: true
    onTriggered: root.guarded("the case", root.start)
  }

  Timer {
    id: deadline
    interval: 50000
    running: true
    onTriggered: {
      h.check(false, "the case did not finish within 50 s")
      h.finish()
    }
  }

  Timer {
    id: poll
    interval: 25
    repeat: true
    onTriggered: root.tick()
  }

  Window {
    id: surface
    visible: true
    width: 800
    height: 700

    Item {
      id: stage
      anchors.fill: parent

      TestEvent { id: events }
    }
  }

  // What a case is handed as `h`.
  QtObject {
    id: h

    readonly property string repo: root.repo
    readonly property string caseName: root.caseName
    readonly property var mock: root.mock
    readonly property var bar: root.bar
    readonly property var window: surface

    // ---- Mounting and driving the view ----

    // Creates a component of the repository in the window. Destroyed by finish.
    function mount(relPath, props) {
      var object = root.create(relPath, stage, props)
      if (object) root.mounted.push(object)
      return object
    }

    // Writes a small text file into this run's private directory and
    // returns its path, for cases that need a real file to show.
    function writeFile(name, text) {
      if (!/^[a-z0-9]+\.[a-z0-9]+$/.test(name)) throw new Error("writeFile: a plain file name is needed")
      scratchFile.path = root.runDir + "/" + name
      scratchFile.setText(text)
      return root.runDir + "/" + name
    }

    // Destroys a mounted object before the case ends.
    function unmount(object) {
      var at = root.mounted.indexOf(object)
      if (at !== -1) root.mounted.splice(at, 1)
      object.destroy()
    }

    // Opens a PanelBody the way Panel.qml does, then makes the single
    // deferred focus request the kit's KeyboardPanel makes on open.
    function open(body) {
      body.opened = true
      body.showing = true
      Qt.callLater(function() {
        if (body.focusItem) body.focusItem.forceActiveFocus()
      })
    }

    // Closed, but the window is still mapped for the fade-out.
    function close(body) {
      body.opened = false
    }

    // The fade is over.
    function hide(body) {
      body.showing = false
    }

    function key(key, modifiers) {
      events.keyClick(key, modifiers || Qt.NoModifier, -1)
    }

    function type(text) {
      for (var i = 0; i < text.length; i++) events.keyClickChar(text.charAt(i), Qt.NoModifier, -1)
    }

    // Pointer events need a live item: handed one that was not found or
    // is already destroyed, the event code would take the process down
    // and the case would end without a result.
    function usable(item, what) {
      var ok = !!item && typeof item.width === "number"
      if (!ok) h.check(false, what + " on an item that is not there")
      return ok
    }

    function click(item, button) {
      if (!h.usable(item, "click")) return
      events.mouseClick(item, item.width / 2, item.height / 2, button || Qt.LeftButton, Qt.NoModifier, -1)
    }

    function wheel(item, delta) {
      if (!h.usable(item, "wheel")) return
      events.mouseWheel(item, item.width / 2, item.height / 2, Qt.NoButton, Qt.NoModifier, 0, delta, -1)
    }

    function hover(item, x, y) {
      if (!h.usable(item, "hover")) return
      events.mouseMove(item, x, y, -1, Qt.NoButton, Qt.NoModifier)
    }

    function focusItem() {
      return surface.activeFocusItem
    }

    // ---- Looking at the view ----

    function find(item, predicate) {
      var found = null
      root.walk(item, function(candidate) {
        if (found === null && predicate(candidate)) found = candidate
      })
      return found
    }

    function findAll(item, predicate) {
      var found = []
      root.walk(item, function(candidate) {
        if (predicate(candidate)) found.push(candidate)
      })
      return found
    }

    // The strings a user could read under item right now.
    function texts(item) {
      var out = []
      root.walk(item, function(candidate) {
        if (root.isText(candidate) && candidate.visible && candidate.text !== "") out.push(candidate.text)
      })
      return out
    }

    // The text elements under item, shown or not, that would interpret
    // markup, each as its type name. The view may have none. One element is
    // not counted: the placeholder inside the kit's text field, which Qt
    // creates with the default format and which no file of ours can reach.
    // It only ever shows the constant hint; the cases with a field check
    // that hint.
    function richTexts(item) {
      var out = []
      root.walk(item, function(candidate) {
        if (!root.isText(candidate) || candidate.textFormat === Text.PlainText) return
        var type = String(candidate)
        if (type.indexOf("QQuickPlaceholderText") !== 0) out.push(type)
      })
      return out
    }

    // ---- The mock's record ----

    // The argument lists of every call of one function on the mock.
    function calls(name) {
      var out = []
      var all = root.mock ? root.mock.calls : []
      for (var i = 0; i < all.length; i++) {
        if (all[i].name === name) out.push(all[i].args)
      }
      return out
    }

    // The names of the calls that did something, in order. Left out are the
    // calls the view makes by merely being open and the ones that only ask.
    function actions() {
      var quiet = [
        "notePanelOpen", "setPositionWatch", "wantThumbs", "errorText", "matchesSearch", "positionNow"
      ]
      var out = []
      var all = root.mock ? root.mock.calls : []
      for (var i = 0; i < all.length; i++) {
        if (quiet.indexOf(all[i].name) === -1) out.push(all[i].name)
      }
      return out
    }

    function resetCalls() {
      root.mock.calls = []
    }

    // ---- Waiting ----

    function waitFor(predicate, ms, then) {
      root.addWait(predicate, ms, then)
    }

    function after(ms, then) {
      root.addWait(null, ms, function(met) { then() })
    }

    // Runs the steps of a case in order. Between two steps the view gets a
    // few frames to lay itself out, create rows and move the focus, so each
    // step sees the result of the one before.
    function steps(list) {
      var next = 0
      var advance = function() {
        if (root.finished || next >= list.length) return
        var step = list[next]
        next++
        step()
        h.after(root.settleMs, advance)
      }
      h.after(root.settleMs, advance)
    }

    // ---- Assertions ----

    function check(condition, label) {
      root.checks++
      if (!condition) root.failures.push(label)
    }

    function equal(a, b, label) {
      var got = JSON.stringify(a)
      var want = JSON.stringify(b)
      if (got !== want) console.warn("harness: " + label + ": got " + got + ", expected " + want)
      h.check(got === want, label)
    }

    // Runs a tests/vectors table against the module the case imported: one
    // assertion per entry.
    function vectors(module, table) {
      var cases = table.CASES
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i]
        var label = table.MODULE + "." + c.fn + " #" + i
        if (typeof module[c.fn] !== "function") {
          h.check(false, label + " (no such function)")
          continue
        }
        var want = c.expect && c.expect.throws === true ? "throws" : JSON.stringify(c.expect)
        var got
        try {
          got = JSON.stringify(module[c.fn].apply(null, c.args.map(root.expand)))
        } catch (error) {
          got = "throws"
        }
        h.check(got === want, label)
      }
    }

    // Prints the result line the launcher looks for, destroys what was
    // mounted, then quits.
    function finish() {
      if (root.finished) return
      root.finished = true
      poll.stop()
      deadline.stop()
      var passed = root.checks - root.failures.length
      var tally = root.caseName + " " + passed + "/" + root.checks
      // A case that asserted nothing has proven nothing.
      if (root.failures.length === 0 && root.checks > 0) console.log("OJ-RESULT PASS " + tally)
      else console.log("OJ-RESULT FAIL " + tally + " " + root.failures.join("; "))
      for (var i = root.mounted.length - 1; i >= 0; i--) root.mounted[i].destroy()
      root.mounted = []
      Qt.callLater(Qt.quit)
    }
  }
}
