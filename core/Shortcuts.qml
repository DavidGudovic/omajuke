import QtQuick
import Quickshell
import "../lib/Const.js" as Const
import "../lib/Env.js" as Env
import "../lib/Errors.js" as Errors
import "../lib/KeyCombo.js" as KeyCombo
import "../lib/Lua.js" as Lua

// The keyboard shortcuts of the actions in KeyCombo.ACTIONS (open the panel,
// show or hide the video, next audio output, play or pause, next and
// previous track). A shortcut is a key bind inside the
// compositor, made while it runs. So there are two truths: the combination
// the user asked for, which is saved, and the binds the compositor really
// holds, which only its own list shows. This component makes the second
// follow the first, in passes: read the list, compare, change what differs,
// read again.
//
// The compositor's binds are the user's, and a line that was sent cannot be
// taken back. So this component owns these rules:
//
//   Nothing is bound until the user asks. Combinations are only proposed.
//
//   A bind is made only on a combination that a list read immediately
//   before shows free. Two binds on one combination both fire.
//
//   A bind is removed only where a list read immediately before shows
//   nothing but binds made here for that action, and only under the
//   spelling they were made with, which nobody types. Where somebody else
//   has a bind too, or one cannot be read, nothing is removed.
//
//   A list that cannot be read or understood proves nothing: nothing is
//   made and nothing is removed.
//
//   One pass at a time. Whether a line did what it should is said by the
//   next list, never by the answer to the line.
//
//   When the compositor has loaded its configuration again, the list is
//   read before anything else. Binds made at runtime are usually gone then,
//   but a configuration that failed to load leaves them where they were,
//   and a second bind on the same keys would fire twice.
Item {
  id: root

  // ---- Given by the service ----

  // The compositor access and the state store (the combinations that were
  // asked for, under the key "shortcuts").
  property var hyprCtl: null
  property var store: null

  // ---- What the service re-exports ----

  // One row per action, in the order of KeyCombo.ACTIONS:
  // { action, label, combo, status, proposal, note }. status is one of
  //   "unassigned"  no shortcut; proposal is a free combination, or ""
  //   "assigned"    combo is bound, and the list shows it; with a note
  //                 when another combination was asked for and not had
  //   "config"      combo is bound by the line the user pasted into their
  //                 own configuration, which is theirs and stays
  //   "blocked"     combo was asked for and is kept, but cannot be bound
  //                 now; note says why, unless the gate does
  //   "failed"      combo was asked for and the bind did not come about
  // note is a sentence for the row, or "". Before the first pass, and
  // whenever the list could not be read, a saved combination shows as
  // "blocked": nothing confirms it. Replaced as a whole.
  readonly property var rows: _rows
  // What stands between a line and the compositor: "ok", "version",
  // "config-errors" or "no-hyprland". "ok" until a pass found otherwise.
  readonly property string gate: _gate
  // A pass is running.
  readonly property bool busy: _running
  // Nobody has answered the question whether to turn shortcuts on, no
  // action has one, and a yes is not being carried out: the panel may ask.
  readonly property bool firstUse: root.store !== null && root.store.loaded === true && !root._keys().asked
    && !root._anyCombo() && !root._suggest

  // ---- Private ----

  property var _rows: []
  property string _gate: "ok"
  property bool _running: false
  // Something asked for a pass while one was running: one more follows.
  property bool _again: false
  // The user asked for every proposal to be assigned: the next pass that
  // reads a list saves them as wishes, and the pass after it binds them.
  property bool _suggest: false
  property int _passes: 0
  // The combinations the last pass saw bound by us and by nobody else, in
  // its last list: what is taken back when the service ends. Emptied the
  // moment a line is sent, because what the list said is then out of date.
  property var _proven: []
  // "<action> <combination>" of removals that were sent and did not show
  // in the next list. Such a bind looks like ours and is not (it was
  // written under another spelling), so it is left alone until the
  // compositor loads its configuration again.
  property var _stuck: []
  // Shared with every callback, so that none of them runs into a component
  // that is already being destroyed.
  property var _life: ({ alive: true })

  // A pass sends at most this many lines for the combination of one action
  // (a removal of doubled binds, then the bind), and removes at most this
  // many binds an action left behind elsewhere.
  readonly property int _maxChanges: 2
  readonly property int _maxLeftovers: 4
  readonly property int _maxStuck: 16
  // How long the removal an earlier instance sent on its way out can still
  // arrive: the deadline of that command, its grace, and a second.
  readonly property int _settleMs: (Const.TIMEOUTS.hypr + Const.TIMEOUTS.killGraceSec + 1) * 1000

  readonly property string _usedBy: "Now used by: "
  readonly property string _usedByOther: "Now used by another shortcut"
  readonly property string _shared: "Also bound elsewhere. Reload Hyprland to clear OmaJuke's copy"
  readonly property string _unconfirmed: "Cannot confirm that this key is free"
  // Follows the combination that was asked for when the action keeps the
  // one it had; the reason comes after it.
  readonly property string _notAssigned: " was not assigned. "

  // ---- Requests ----

  // For the service, once the saved state is there. A user who never asked
  // for a shortcut causes no call to the compositor: a pass runs only when
  // a combination is saved, or when the last session ended with a change
  // that was not confirmed. Returns true when a pass was started.
  function start() {
    root._showSaved("")
    if (!root._anySaved()) return false
    if (!root._trigger()) return false
    // After a restart of the shell the instance before this one removes
    // its binds with a command that outlives it, and that removal can
    // arrive after this pass has read the list. One later pass puts back
    // what it took.
    settleTimer.restart()
    return true
  }

  // The page was opened: look again. Returns false when no pass can run.
  function refresh() {
    return root._trigger()
  }

  // The user asks for a shortcut. combo is a combination in the written
  // form ("SUPER + ALT + V"); anything else is refused. Returns true when
  // the wish was saved and a pass follows; what came of it is in rows. A
  // combination somebody else has is not taken over: the wish is dropped
  // and the row says who has it. An action that had a working shortcut
  // keeps it then, and whenever the new combination cannot be had.
  function assign(action: string, combo: string): bool {
    var parsed = KeyCombo.parse(combo)
    if (KeyCombo.ACTIONS.indexOf(action) === -1 || parsed === null || !root._usable()) return false
    if (!root._save(action, parsed.canonical, true)) return false
    root._flush()
    return root._trigger()
  }

  // Assigns to every action without a shortcut the free combination its row
  // proposes, as if the user had pressed Assign on each. A proposal is only
  // known from a list read in a pass, so a pass runs first and the wishes
  // are saved at its end; the pass after it makes the binds, each checked
  // against a fresh list like any other. Two actions never get the same
  // combination. Returns false when no pass can run.
  function assignSuggested(): bool {
    if (!root._usable()) return false
    root._suggest = true
    return root._trigger()
  }

  // The answer to the question whether to turn shortcuts on. No is final.
  // Yes assigns the proposals, and is only final once a pass could make
  // them: on a release the lines were not tried on, or while the
  // configuration has errors, nothing is assigned and the question may come
  // again.
  function answerPrompt(enable: bool): bool {
    if (!root._usable()) return false
    if (enable === true) return root.assignSuggested()
    var keys = root._keys()
    keys.asked = true
    if (root.store.patch({ shortcuts: keys }) !== true) return false
    root._flush()
    return true
  }

  // The user gives a shortcut up. The pass removes the bind where the list
  // shows it to be ours.
  function unassign(action: string): bool {
    if (KeyCombo.ACTIONS.indexOf(action) === -1 || !root._usable()) return false
    if (!root._save(action, "", true)) return false
    root._flush()
    return root._trigger()
  }

  // The line a user can paste into their own key configuration instead of
  // having a bind made at runtime, or "".
  function lineFor(action: string, combo: string): string {
    return KeyCombo.copyLine(action, combo)
  }

  // Puts that line on the clipboard. The clipboard is only ever written.
  function copyLine(action: string, combo: string): bool {
    var line = KeyCombo.copyLine(action, combo)
    if (line === "") return false
    Quickshell.clipboardText = line
    return true
  }

  // A key press as Qt reports it, as a combination in the written form, or
  // "" when it is none a shortcut can have.
  function comboFromKeyEvent(key: int, modifiers: int): string {
    return KeyCombo.fromQt(key, modifiers)
  }

  // The service says that the compositor loaded its configuration again.
  // Reloads come in bursts, so the pass waits for the last of them.
  function compositorReloaded() {
    root._stuck = []
    reloadTimer.restart()
  }

  // ---- The saved wishes ----

  function _usable() {
    return root.hyprCtl !== null && root.store !== null
  }

  // A copy of what is saved: one member per action, by its name, and dirty.
  function _keys() {
    var values = root.store ? root.store.values : null
    var saved = values ? values.shortcuts : null
    var keys = {}
    for (var i = 0; i < KeyCombo.ACTIONS.length; i++) {
      var value = saved ? saved[KeyCombo.ACTIONS[i]] : ""
      keys[KeyCombo.ACTIONS[i]] = typeof value === "string" ? value : ""
    }
    keys.dirty = saved ? saved.dirty === true : false
    keys.asked = saved ? saved.asked === true : false
    return keys
  }

  // Some action has a combination saved.
  function _anyCombo() {
    var keys = root._keys()
    for (var i = 0; i < KeyCombo.ACTIONS.length; i++) {
      if (keys[KeyCombo.ACTIONS[i]] !== "") return true
    }
    return false
  }

  // Some action has a combination saved, or a change was not confirmed.
  function _anySaved() {
    return root._anyCombo() || root._keys().dirty
  }

  function _desired(action) {
    return KeyCombo.ACTIONS.indexOf(action) !== -1 ? root._keys()[action] : ""
  }

  function _save(action, combo, dirty) {
    if (KeyCombo.ACTIONS.indexOf(action) === -1) return false
    var keys = root._keys()
    keys[action] = combo
    if (dirty) keys.dirty = true
    // Whoever chose a shortcut has no need of the first-use question.
    if (dirty && combo !== "") keys.asked = true
    return root.store !== null && root.store.patch({ shortcuts: keys }) === true
  }

  // Gives a wish up, unless the user has made another one meanwhile.
  function _forget(action, canonical) {
    if (root._desired(action) === canonical) root._save(action, "", false)
  }

  // Notes, before a line is sent, that the compositor is about to differ
  // from what the last pass confirmed. The note is written at once and not
  // a moment later: should the shell end right after the line, the next
  // start has to know that it must look.
  function _noteDirty() {
    var keys = root._keys()
    if (keys.dirty) return
    keys.dirty = true
    if (root.store.patch({ shortcuts: keys }) === true) root._flush()
  }

  function _flush() {
    if (typeof root.store.flushNow === "function") root.store.flushNow()
  }

  // ---- A pass ----

  function _trigger() {
    if (!root._usable()) return false
    if (root._running) {
      root._again = true
      return true
    }
    root._running = true
    root._passes += 1
    root._begin()
    return true
  }

  function _end() {
    root._running = false
    if (!root._again) return
    root._again = false
    root._trigger()
  }

  // A callback for the compositor access that says nothing once this
  // component is gone.
  function _alive(then) {
    var life = root._life
    return function(value) {
      if (life.alive) then(value)
    }
  }

  function _begin() {
    // readOnly: the gate is shut, so this pass only looks. unverified: a
    // line was sent and the next list did not show what it should have.
    var pass = { readOnly: false, layout: { plainUs: false }, unverified: false, results: [] }
    root.hyprCtl.gate(root._alive(function(found) {
      root._gate = found
      if (found === "no-hyprland") {
        // A request to assign the proposals has nothing to assign on.
        root._suggest = false
        root._showSaved("")
        root._end()
        return
      }
      // On a release the lines were not tried on, and while the user's
      // configuration has errors, the list can still be read: the rows then
      // say what is there, and a pasted line is still recognised.
      pass.readOnly = found !== "ok"
      root._readLayout(pass, [], function() {
        root._read(function(listing) {
          if (listing.ok) {
            root._settle(pass, 0, listing)
            return
          }
          root._proven = []
          root._suggest = false
          root._showSaved(root._unconfirmed)
          root._end()
        })
      })
    }))
  }

  // Asks for the options that decide which letter a key given by number
  // types. A reply that did not come counts as doubt.
  function _readLayout(pass, replies, then) {
    var names = KeyCombo.LAYOUT_OPTIONS
    if (replies.length >= names.length) {
      pass.layout = KeyCombo.layoutFacts(replies[0], replies[1], replies[2], replies[3])
      then()
      return
    }
    root.hyprCtl.option(names[replies.length], root._alive(function(reply) {
      root._readLayout(pass, replies.concat([reply && reply.ok === true ? reply.value : null]), then)
    }))
  }

  // Reads the list of binds: then({ ok, records }). A list that was read
  // can be empty, on a desktop without a single bind. One that was not read
  // has no records at all, so that it cannot be taken for an empty one.
  function _read(then) {
    root.hyprCtl.binds(root._alive(function(reply) {
      var parsed = reply && reply.ok === true ? KeyCombo.parseBinds(reply.text) : null
      if (parsed !== null && parsed.ok === true) then({ ok: true, records: parsed.records })
      else then({ ok: false, records: null })
    }))
  }

  function _classOf(pass, listing, action, parsed) {
    return listing.ok ? KeyCombo.classify(listing.records, pass.layout, action, parsed) : "unknown"
  }

  // The actions one after the other, each with the newest list.
  function _settle(pass, index, listing) {
    if (index >= KeyCombo.ACTIONS.length) {
      root._finish(pass, listing)
      return
    }
    var action = KeyCombo.ACTIONS[index]
    root._wanted(pass, action, listing, 0, function(result, newest) {
      root._leftovers(pass, action, result, newest, function(last) {
        pass.results.push(result)
        root._settle(pass, index + 1, last)
      })
    })
  }

  function _result(action, combo, status, note) {
    return { action: action, combo: combo, status: status, note: note }
  }

  // Makes the compositor hold the combination that was asked for, as far
  // as the list allows: done(result, newest list).
  function _wanted(pass, action, listing, tries, done) {
    var stored = root._desired(action)
    var parsed = KeyCombo.parse(stored)
    if (parsed === null) {
      // Saved text that is no combination is no wish.
      if (stored !== "") root._save(action, "", false)
      done(root._result(action, "", "unassigned", ""), listing)
      return
    }
    var combo = parsed.canonical
    var cls = root._classOf(pass, listing, action, parsed)
    if (cls === "ours") {
      done(root._result(action, combo, "assigned", ""), listing)
      return
    }
    var by = cls === "foreign" ? KeyCombo.takenBy(listing.records, pass.layout, action, parsed) : ""
    var note = ""
    if (cls === "foreign") note = by !== "" ? root._usedBy + by : root._usedByOther
    else if (cls === "shared") note = root._shared
    else if (cls === "unknown") note = root._unconfirmed
    if (pass.readOnly) {
      // The wish stays: a later pass may be able to grant it.
      done(root._result(action, combo, "blocked", note), listing)
      return
    }
    if (cls === "unknown") {
      // The same, unless the action still has the shortcut it had before.
      root._giveUp(pass, action, listing, combo, false, root._result(action, combo, "blocked", note), done)
      return
    }
    if (cls === "foreign" || cls === "shared") {
      // Theirs wins. Our own bind beside somebody else's is not removed
      // either: the two cannot be told apart safely enough.
      root._giveUp(pass, action, listing, combo, true, root._result(action, "", "unassigned", note), done)
      return
    }
    // Free, or bound more than once by us alone: a line has to be sent.
    if (tries >= root._maxChanges) {
      var refused = root._result(action, combo, "failed", Errors.TEXT.E_HYPR_EVAL)
      root._giveUp(pass, action, listing, combo, true, refused, done)
      return
    }
    var kind = cls === "free" ? "bind" : "unbind"
    root._change(pass, kind, action, parsed, listing, function(newest, sent) {
      if (kind === "bind" && sent) {
        var now = root._classOf(pass, newest, action, parsed)
        if (now === "ours") {
          done(root._result(action, combo, "assigned", ""), newest)
          return
        }
        // Not there, or there together with a bind somebody made at the
        // same moment. The second is left as it is, like every bind of
        // ours beside somebody else's. Where the newest list cannot be
        // read, the one from before the line says what the action had.
        var why = now === "shared" ? root._shared : Errors.TEXT.E_HYPR_EVAL
        var basis = newest.ok ? newest : listing
        root._giveUp(pass, action, basis, combo, true, root._result(action, combo, "failed", why),
          function(result) { done(result, newest) })
        return
      }
      // Nothing was sent, or the doubled binds were removed: the newest
      // list says how to go on.
      root._wanted(pass, action, newest, tries + 1, done)
    })
  }

  // The combination an action is bound on by us and by nobody else, other
  // than the one that was just asked for: the shortcut that worked before
  // the user chose another. "" when the list shows none.
  function _standing(pass, action, listing, combo) {
    if (!listing.ok) return ""
    var found = KeyCombo.findRuntime(listing.records, action)
    for (var i = 0; i < found.length; i++) {
      var parsed = KeyCombo.parse(found[i])
      if (parsed === null || parsed.canonical === combo) continue
      if (root._classOf(pass, listing, action, parsed) === "ours") return parsed.canonical
    }
    return ""
  }

  // The combination that was asked for cannot be had: done(result, list)
  // with the result given, after the wish was dropped (drop) or left. But
  // an action that still has a working shortcut keeps it. The wish goes
  // back to that combination, so that nothing removes its bind as left
  // over, and the row shows it with the reason why the other one was not
  // taken. Changing a shortcut can fail, and must not cost the old one.
  function _giveUp(pass, action, listing, combo, drop, result, done) {
    var kept = root._standing(pass, action, listing, combo)
    if (kept === "") {
      if (drop) root._forget(action, combo)
      done(result, listing)
      return
    }
    // Unless the user has made yet another wish meanwhile.
    if (root._desired(action) === combo) root._save(action, kept, false)
    done(root._result(action, kept, "assigned", combo + root._notAssigned + result.note), listing)
  }

  // Removes the binds of an action that sit on a combination nobody asks
  // for any more: after the user gave one up or chose another, and after a
  // session that ended before it could clean up. done(newest list). A bind
  // that has to stay because somebody else's sits beside it is mentioned
  // in the action's result, which otherwise would say that nothing is bound.
  function _leftovers(pass, action, result, listing, done) {
    if (pass.readOnly || !listing.ok) {
      done(listing)
      return
    }
    var keep = root._desired(action)
    var found = KeyCombo.findRuntime(listing.records, action).filter(function(combo) {
      return combo !== keep
    })
    root._remove(pass, action, result, found.slice(0, root._maxLeftovers), listing, done)
  }

  function _remove(pass, action, result, combos, listing, done) {
    if (combos.length === 0) {
      done(listing)
      return
    }
    var parsed = KeyCombo.parse(combos[0])
    var rest = combos.slice(1)
    var mention = function(newest) {
      var beside = parsed !== null && root._classOf(pass, newest, action, parsed) === "shared"
      if (beside && result.status === "unassigned" && result.note === "") result.note = root._shared
    }
    var cls = parsed !== null ? root._classOf(pass, listing, action, parsed) : "unknown"
    if (cls !== "ours" && cls !== "duplicate") {
      mention(listing)
      root._remove(pass, action, result, rest, listing, done)
      return
    }
    root._change(pass, "unbind", action, parsed, listing, function(newest, sent) {
      mention(newest)
      root._remove(pass, action, result, rest, newest, done)
    })
  }

  // ---- Sending a line ----

  // The only place a bind is made or removed: then(newest list, sent).
  // The list is read once more immediately before, and the line goes out
  // only if that reading still allows it: a bind needs "free", a removal
  // needs binds of ours and of nobody else. Afterwards the list is read
  // again, and that reading is what the callers judge. The line is built
  // from the spelling KeyCombo.parse made and from nothing else.
  function _change(pass, kind, action, parsed, listing, then) {
    var mark = action + " " + parsed.canonical
    var code = kind === "bind" ? Lua.bind(parsed.alias, action) : Lua.unbind(parsed.alias)
    if (code === "" || (kind === "unbind" && root._stuck.indexOf(mark) !== -1)) {
      then(listing, false)
      return
    }
    root._noteDirty()
    root._read(function(before) {
      var cls = root._classOf(pass, before, action, parsed)
      var allowed = kind === "bind" ? cls === "free" : cls === "ours" || cls === "duplicate"
      if (!allowed) {
        then(before, false)
        return
      }
      root._proven = []
      root.hyprCtl.evalLua(code, root._alive(function(error) {
        var shut = root._gateOf(error)
        if (shut !== "") {
          // The gate closed since the pass began, and nothing was sent.
          root._gate = shut
          pass.readOnly = true
          then(before, false)
          return
        }
        root._read(function(after) {
          var now = root._classOf(pass, after, action, parsed)
          if (kind === "bind" ? now !== "ours" : now !== "free") {
            pass.unverified = true
            if (kind === "unbind" && root._stuck.length < root._maxStuck) {
              root._stuck = root._stuck.concat([mark])
            }
          }
          then(after, true)
        })
      }))
    })
  }

  // The gate a refusal of the compositor access stands for, "" when the
  // line was let through.
  function _gateOf(error) {
    if (error === "E_HYPR_NONE") return "no-hyprland"
    if (error === "E_HYPR_VERSION") return "version"
    if (error === "E_HYPR_ERRORS") return "config-errors"
    return ""
  }

  // ---- The rows ----

  function _row(action, combo, status, proposal, note) {
    var texts = KeyCombo.action(action)
    return {
      action: action, label: texts !== null ? texts.label : "", combo: combo, status: status,
      proposal: proposal, note: note
    }
  }

  // Rows for what is saved, when no list says what is really there.
  function _showSaved(note) {
    var rows = []
    for (var i = 0; i < KeyCombo.ACTIONS.length; i++) {
      var action = KeyCombo.ACTIONS[i]
      var parsed = KeyCombo.parse(root._desired(action))
      if (parsed !== null) rows.push(root._row(action, parsed.canonical, "blocked", "", note))
      else rows.push(root._row(action, "", "unassigned", "", ""))
    }
    root._rows = rows
  }

  function _finish(pass, listing) {
    var rows = []
    var proven = []
    for (var i = 0; i < pass.results.length; i++) {
      var result = pass.results[i]
      var status = result.status
      var combo = result.combo
      var note = result.note
      var proposal = ""
      if (listing.ok) {
        // A bind from the line the user pasted is shown wherever nothing is
        // bound at runtime, whatever was asked for here.
        var configured = KeyCombo.findConfigured(listing.records, result.action)
        if (configured !== "" && status !== "assigned") {
          status = "config"
          combo = configured
          if (note !== root._shared) note = ""
        }
        proposal = KeyCombo.propose(listing.records, pass.layout, result.action)
      }
      // Only what the last list still shows is taken back at the end.
      var parsed = status === "assigned" ? KeyCombo.parse(combo) : null
      var held = parsed !== null && root._classOf(pass, listing, result.action, parsed) === "ours"
      if (held) proven.push(combo)
      rows.push(root._row(result.action, combo, status, proposal, note))
    }
    root._rows = rows
    root._proven = proven
    var keys = root._keys()
    if (keys.dirty && !pass.readOnly && listing.ok && !pass.unverified) {
      keys.dirty = false
      root.store.patch({ shortcuts: keys })
    }
    if (root._suggest) root._takeProposals(pass, listing, rows)
    root._end()
  }

  // Saves the proposals of the rows just made as wishes, and has one more
  // pass follow to bind them. A pass that could only look, or a list that
  // could not be read, proposes nothing: the request is dropped, the rows
  // say why, and the first-use question stays unanswered.
  function _takeProposals(pass, listing, rows) {
    if (pass.readOnly || !listing.ok) {
      root._suggest = false
      return
    }
    // Kept before the request ends, so the question does not show between.
    var keys = root._keys()
    keys.asked = true
    root.store.patch({ shortcuts: keys })
    root._suggest = false
    var taken = []
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      if (row.status !== "unassigned" || row.proposal === "" || taken.indexOf(row.proposal) !== -1) continue
      if (root._desired(row.action) !== "") continue
      if (root._save(row.action, row.proposal, true)) taken.push(row.proposal)
    }
    root._flush()
    if (taken.length > 0) root._again = true
  }

  // ---- The end of the service ----

  // Takes back the binds the last pass saw to be ours, when the plugin is
  // switched off or removed or the shell ends. Nothing can be read or
  // waited for any more, so each removal is a command that outlives this
  // component, bounded by its own deadline, and the compositor access
  // builds it only if its last look at the gate found it open. The saved
  // wishes stay: the next start binds them again. A shell that is ended
  // by force removes nothing; such binds call a shell command that says
  // nothing when the plugin is gone, and the next start finds them.
  function _release() {
    if (root.hyprCtl === null) return
    var combos = root._proven
    for (var i = 0; i < combos.length; i++) {
      var parsed = KeyCombo.parse(combos[i])
      var code = parsed !== null ? Lua.unbind(parsed.alias) : ""
      var argv = code !== "" ? root.hyprCtl.detachedEvalArgv(code) : null
      if (argv === null) continue
      Quickshell.execDetached({ command: argv, clearEnvironment: true, environment: Env.hypr() })
    }
  }

  Component.onCompleted: root._showSaved("")
  Component.onDestruction: {
    root._life.alive = false
    root._release()
  }

  Timer {
    id: reloadTimer
    interval: Const.TIMEOUTS.reloadMs
    // Somebody who never used a shortcut and never opened the page causes
    // no call to the compositor on a reload either.
    onTriggered: if (root._passes > 0 || root._anySaved()) root._trigger()
  }

  Timer {
    id: settleTimer
    interval: root._settleMs
    onTriggered: root._trigger()
  }
}
