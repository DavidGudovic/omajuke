# Contributing to OmaJuke

OmaJuke is an Omarchy shell plugin (Quickshell, QML) that plays YouTube from the bar through one
long-lived `mpv` owned by the shell, with `yt-dlp` for search and lookups. One service owns all
state; the bar widget and its panel are disposable views of it. This guide is for anyone changing
the code: what is where, the rules that never bend, how to test and how to release. What the
plugin does for its user is in [README.md](README.md); the trust model and the known limits are
in [SECURITY.md](SECURITY.md). A change that makes either of them untrue changes it in the same
commit.

## Layout

| Path | What it holds |
|---|---|
| `manifest.json` | Plugin manifest: id, version, kinds `service` and `bar-widget`, `keepLoaded` |
| `Service.qml` | Composition root: wires the parts, re-exports their state, holds the only `IpcHandler` |
| `core/` | Non-visual parts, one job each: `ProcessRunner` (bounded child processes), `PrivateFs`, `StateStore`, `SettingsStore`, `MpvProcess`, `MpvSocket`, `Player`, `Search`, `Resolver`, `Thumbnails`, `Playback` (queue and playback state), `HyprCtl`, `VideoWindow`, `Shortcuts`, `AudioOutputs`, `SignIn`, `Feeds`, `Sponsor` |
| `lib/` | Pure JavaScript for the service side: constants and limits (`Const.js`), command lines, parsers, validators, the player-state reducer, the queue, the state-file format, the Lua lines sent to Hyprland and their final check |
| `BarWidget.qml`, `Panel.qml`, `ui/` | The view. It reads and calls the public members of the service and has its own script, `ui/Ui.js` |
| `tests/node/`, `tests/vectors/` | Node tests, and the input/expectation tables that run on both JavaScript engines |
| `tests/harness.sh`, `tests/harness/`, `tests/harness-ui/` | Headless Quickshell harnesses: one for the service, one for the panel against `MockService.qml` |
| `tests/stubs/`, `tests/fixtures/` | Stand-ins for mpv, yt-dlp, curl, `hyprctl`, `xdg-settings` and the browser; synthetic test data |

`lib/` is imported by the service side only and `ui/` by the view side only: the service is kept
loaded across plugin updates, and a module shared with the view would hand new view code an old
module. `core/` imports nothing from the shell's own kit, so the headless harness can load it.

## Rules that never bend

Privacy and security come before convenience: take the conservative default, state the trade-off.

- **No telemetry**, no update check, no downloaded code. The network destinations are the ones
  listed in the README, each the direct result of something the user did or switched on.
- **User and remote text never reaches** a command line, an environment variable, a log line, a
  file name, a window title, Lua or an image source. Queries and links go to yt-dlp and curl on
  standard input and to mpv over its socket; runtime files are named by a counter.
- **Every helper process is bounded**: argument list, absolute tool path, emptied environment, a
  deadline, a byte cap while reading, cancellable. `Process` objects exist only in
  `core/ProcessRunner.qml`, `core/MpvProcess.qml` and `core/SignIn.qml`. The two commands that
  must outlive the service (cleaning the runtime folder, removing binds) are detached from
  `core/PrivateFs.qml` and `core/Shortcuts.qml`, as fixed argument lists under `timeout`.
- **Everything from outside is hostile**: the output of every tool, IPC arguments, the state file,
  the settings entry. Parse in `try`, copy into fresh objects, type-check, cap.
- **Every label is plain text** (`textFormat: Text.PlainText`). A label in the default format
  would fetch a remote image named in its text.
- **Hyprland is changed only through the three templates in `lib/Lua.js`**, each passed through
  `Lua.check` immediately before it is sent, never while the user's configuration has errors,
  never on a Hyprland version outside `TESTED` in `lib/Lua.js`, and never keeping a handle. A
  mistake in text handed to `hyprctl eval` can take the whole desktop down.
- **A key bind is removed only when a fresh listing shows it is ours and alone on its key.** The
  one exception is the end of the service, which relies on the last completed check.
- **The login file** is private from its first byte, holds `youtube.com` rows only, reaches a tool
  only as a throwaway copy by path, and never enters QML. Four requests carry it: an account
  list, the check of a new login, the watched report, and the lookup of one video after the user
  pressed **Play with my account**. Search, playing, preloading, the queue and autoplay never do.
- **Idle costs nothing**: nothing loaded and no panel open means no child process, no running
  timer and no connection to mpv.
- **Nothing is written inside the plugin directory or under `~/.config/hypr`.** The only log
  lines are constant `console.warn("omajuke: ...")` warnings that name a broken invariant.

## What the repository test enforces

`tests/node/repo.test.js` audits the published tree. The audits a change most often meets:

- Every file is named in `LAYOUT` there, under one area. Add a new file to the list.
- No symlink, no file over 512 KiB except `preview.png`, no compiled binary, no file name
  containing `install` or `setup`, no `.sh` and nothing executable outside `tests/`.
- Test data is synthetic: no real video ids, titles, user names, home paths or captured listings.
- A `lib/` or `ui/` script starts with `.pragma library` and ends with an export footer naming
  every public top-level name. Every source file opens with a comment about itself.
- A table in `tests/vectors/` is run by a `vectors_*` harness case, so that it is proven on Qt's
  engine too. A lookup in `lib/` whose key is not a constant is listed in `REVIEWED_LOOKUPS`.
- `tests/harness-ui/MockService.qml` has exactly the public members of `Service.qml`, and the IPC
  methods are exactly those in `ipcMethods`, each taking and returning strings.
- The plugin id is spelled only in `manifest.json`, `lib/Const.js`, the README and tests.
- The README keeps its second-level headings in order and has shell code blocks only under
  "Install" and "Development and testing". Nothing outside `tests/` matches `SCANNER_PHRASES`.

## Code style

The audits enforce most of it. Two-space indent, 110 columns, no semicolons, `var` and `function`
only (no arrow functions, `let`, `const`, template strings, destructuring, optional chaining),
`===`, line comments that say why, ASCII outside strings. Scripts in `lib/` and `ui/` run on Qt's
JavaScript engine in the shell and on node in tests; the two differ, so a validating function is
not done until its vector table passes on both. Nothing throws across a component boundary.

## Testing

`tests/check.sh` is the gate. It runs, in order, and stops at the first failure: the node tests,
`omarchy plugin validate`, `qmllint` filtered by `tests/lint-qml.js`, then every case under
`tests/harness/cases` and `tests/harness-ui/cases`. It takes several minutes and needs node 20 or
later (the tests have no dependencies), Omarchy with `quickshell`, `mpv`, and `qmllint` at
`/usr/lib/qt6/bin/qmllint` (package `qt6-declarative`). Parts run alone:

- `node --test tests/node`, or `node --test tests/node/<name>.test.js`
- `tests/harness.sh core <case>` and `tests/harness.sh ui <case>`

`tests/harness.sh` starts a separate, headless Quickshell for each case, with an emptied
environment, the offscreen platform and private runtime, state, data and configuration folders
under `$XDG_RUNTIME_DIR`, which it removes afterwards. That instance has no display, session bus
or compositor, and the stubs answer for every tool, so a case opens no window, plays no sound and
makes no network request. One case, `tether_real`, starts the real mpv, silent and with nothing
loaded, to prove that mpv exits when the shell is killed. The script ends a process only by a
process id it recorded itself, never by name. Two scripts are run by hand, outside the gate:
`node tests/record-traces.js` records the real mpv's event order into
`tests/fixtures/mpv-traces.json` (after an mpv upgrade or a change to the launch flags), and
`node tests/gen-binds.js` rewrites the made-up bind list `tests/fixtures/binds.txt`.

Away from an Omarchy machine, in a throwaway Linux container such as a cloud coding session, run
`tests/cloud-env.sh check` as root. The first run builds an Arch Linux root under `/opt/omajuke-env`
with Quickshell, mpv, `qt6-declarative`, node and a pinned copy of Omarchy's shell, then runs
`tests/check.sh` inside it as an unprivileged user against this checkout; `tests/cloud-env.sh run
<command>` runs anything else there, such as one harness case. It needs network access, mounts
`/proc`, `/dev` and `/sys` into that root, and is not for a machine anyone works on.

What the harnesses cannot prove needs a person on an Omarchy desktop: real playback, the video
window and shortcuts on a real Hyprland, how the panel looks, signing in with a real browser and
account. Say so plainly when a change falls in that area; do not claim that it works. A bug found
by hand gets a test that fails without the fix, and the stub is made to behave like the real tool
where it differed.

Never send state-changing `hyprctl` commands (`eval`, `dispatch`, `keyword`, `reload`) to a session
someone is working in. Compositor behaviour is tried in a separate, nested Hyprland started with a
minimal configuration, a private runtime directory and `HYPRLAND_NO_SD_VARS=1`.

## Releasing

The version is written in `manifest.json`, `lib/Const.js`, `ui/Ui.js`, twice in `README.md` (the
"This is version" sentence and the `status` example), and as the newest entry of `CHANGELOG.md`,
which lists user-visible changes only; the repository test fails if they disagree. Users update
as the README says and must then restart the shell: the service is kept loaded, so until the
restart the new panel only says that a restart is needed.

The plugin is not listed in the Omarchy plugin marketplace yet. A submission goes through the
issue form of `omacom/omarchy-plugin-marketplace` (category `Widgets`, tags `media`, `bar`,
`quickshell`) and is checked at one exact commit: the default branch must not move while it is open.

## Not yet verified by a person

- Sign-in has only run against a stand-in browser: no real browser, account or YouTube session.
- The shortcuts, queue and audio output pages have not been looked at on a real screen; nor have
  the paused strip, a long title, "Loading video…", the idle and paused bar icon, the tooltip.
- Recording a key with "Change…" and Shift+Enter have not been pressed on a real desktop.
- Losing the chosen audio output, a live stream, a second monitor, keep-awake.
- A "Play with my account" answer was never checked for stray cookies in what is saved.
- The video window and shortcuts are verified on Hyprland 0.56.2 only. Other 0.56.x versions pass
  the version gate without having been tried, and every other version is refused until someone
  tests it and extends `TESTED` in `lib/Lua.js`.
