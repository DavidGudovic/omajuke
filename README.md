# OmaJuke

OmaJuke plays YouTube from the Omarchy bar. Click its icon, type a search, press Enter and pick a
result: the audio plays through mpv and keeps playing after the panel is closed. No browser is
opened and no account is used.

This is version 0.1.0. What it does:

- Searches YouTube and lists up to 20 results with thumbnails.
- Plays a result, or a YouTube video link pasted into the search field. Audio only.
- Pauses, resumes, seeks, restarts the track, changes the volume and mutes: from the panel, from
  the bar icon, from a command line and, with `mpv-mpris`, from the media keys.
- Remembers up to 30 recently played tracks. You can switch that off and clear the list.

What it does not do: there is no queue (a track you start replaces the one that is playing, and
playback stops when the track ends), no video window, no global keyboard shortcut, no choice of
audio output, no sign-in and no sponsor skipping.

OmaJuke makes no connection on its own. Every request follows from something you did, and there is
no telemetry and no update check. [What it connects to](#what-it-connects-to) and
[What it stores](#what-it-stores) list every host and every file.

## Requirements

- **Omarchy 4** with its built-in bar. Under a replacement bar OmaJuke only says that it needs
  the built-in one.
- **mpv** and **yt-dlp**. Both ship with Omarchy. OmaJuke runs `/usr/bin/mpv` and
  `/usr/bin/yt-dlp` and never looks a program up through `PATH`, so a copy installed somewhere
  else is not used. If one of them is missing, the panel says which, and it looks again every time
  it is opened.
- **mpv-mpris** for the media keys and Omarchy's media widget. It ships with Omarchy too. Without
  it everything else works, and the settings page says that media keys are unavailable.
- **curl** for thumbnails, and the usual system tools under `/usr/bin`: `sh`, `setpriv`,
  `timeout`, `head`, `rm`, `find` and a few more coreutils. Every Omarchy system has them.

OmaJuke needs no administrator rights. It installs nothing and edits none of your configuration
files. The one thing it changes outside its own two folders is its own settings entry in the
shell's `shell.json`, and it does that through the shell. While nothing is playing or paused and
the panel is closed, it runs no process and no timer.

It was developed against Omarchy 4.0.4 (Quickshell 0.3.1), mpv 0.41 and yt-dlp 2026.08.19. YouTube
changes often: when lookups that used to work start to fail, the usual fix is a newer yt-dlp from
a system update.

## Install

```sh
omarchy plugin add https://github.com/DavidGudovic/omajuke.git --enable
```

Omarchy downloads the repository to `~/.config/omarchy/plugins/davidgudovic.omajuke`, checks its
manifest, asks which section of the bar the icon goes in (the right one is preselected) and
enables it. Before any of that it reminds you that a plugin runs unsandboxed inside the shell
process, and asks for confirmation. That is the moment to read the code.

## Use

### The bar icon

| Action | Result |
|---|---|
| Left click | Opens or closes the panel |
| Middle click | Plays or pauses. After a failure it tries the track again. Without a track it does nothing |
| Wheel | Volume up or down, 5 points a notch |
| Right click | Nothing |

The icon takes the accent colour while a track plays or is being loaded and is dimmed while it is
paused. Its tooltip shows the title and channel, `Paused:` and the title, or the error. When
nothing is loaded it says `OmaJuke`.

### The panel

The search field has the keyboard as soon as the panel opens.

- **Search.** Type and press Enter. The text is sent when you press Enter, never while you type.
  Up to 20 results are listed, and the first one is highlighted, so a second Enter plays it.
- **Play a link.** Paste a YouTube video link and press Enter: that video plays. The forms
  `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, `youtube.com/live/...`
  and `youtube.com/embed/...` are understood. Of a link that also names a playlist, only the
  video is played.
- **Anything else that looks like a link, a network address or a file path is not sent
  anywhere.** The panel says that it looks like a link but not to a YouTube video. The price of
  that rule is that a few searches are taken for links, such as `will.i.am`, `re:zero` or anything
  that starts with `/`. Put a word in front and it is a search again.
- **Recently played.** With an empty field the list shows what you played recently. Emptying the
  field also drops the search results.
- **Click a row** to play it. Moving the pointer over the rows moves the highlight.
- **The gear button** opens the settings page.

Live streams are marked `LIVE`, and you cannot seek in them. Playing them has had little testing.

### Keys

| Key | While typing in the search field | After moving into the list |
|---|---|---|
| Enter | Searches for the text. If the list already belongs to that text, or the field is empty: plays the highlighted row. While that same search is still running: nothing | Plays the highlighted row |
| Down, Up | Move the highlight and leave the field | Move the highlight |
| Page Down, Page Up | The same, six rows at a time | Six rows at a time |
| Space | Types a space | Plays or pauses |
| `/` | Types `/` | Returns to the search field and selects its text |
| Backspace | Deletes a character | Returns to the field and deletes its last character |
| Any other character | Is typed | Returns to the field and adds the character |
| Esc | Closes the panel. Playback continues | The same |
| Tab, Shift+Tab | Switch to the next or previous panel of the bar | The same |

While no row is highlighted, the first Enter or arrow key only shows the highlight. The next one
acts on it. A panel that is reopened on earlier results highlights nothing by itself.

On the settings page Up and Down move between the rows, Enter or Space switches or presses the
row, and Esc returns to the main page.

### The strip at the bottom

While a track is loaded the panel shows its thumbnail, title and channel, and under them:

- a seek bar. Drag it, or turn the wheel over it to move 5 seconds at a time;
- Previous, which returns to the start of the track;
- Play or Pause. After a failure the strip shows the reason in one sentence, and this button
  tries again. Every new attempt looks the track up again at YouTube;
- Next, which stays disabled because there is no queue;
- a mute button and a volume slider (the wheel moves it 5 points a notch).

There is no stop button. A paused track keeps mpv running, so that it resumes at once. mpv ends
when the track ends, or when you run the `stop` method described under [IPC](#ipc).

If the shell restarts while a track is loaded and history is remembered, the strip shows that
track again afterwards. It does not start by itself: Play starts it from the beginning.

With `mpv-mpris` installed, mpv shows up as an ordinary media player on your desktop while a track
is loaded: the play/pause key and Omarchy's media widget control it.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `rememberHistory` | on | Keeps the recently played list and the last track in `state.json` between sessions. When it is off, nothing about what you play is written to disk, and the list lasts until the shell exits. Switching it off rewrites the file at once without them. Switching it back on saves the list as it stands then, including what you played while it was off |
| `evenVolume` | off | Plays quiet and loud tracks at a similar level, with mpv's `dynaudnorm` audio filter. It applies to the playing track at once |

Both are switches on the settings page. Omarchy stores them in OmaJuke's entry in
`~/.config/omarchy/shell.json`, so they can also be set from a terminal, for example
`omarchy bar set davidgudovic.omajuke rememberHistory false`.

Omarchy deletes that entry, settings included, when the plugin is disabled, and so do
`omarchy bar defaults` and `omarchy refresh shell`. A history you switched off would then be on
again, because on is the default. To prevent that, OmaJuke keeps a copy of this one choice in
`state.json` and follows it whenever the entry does not say. For the first moment after the shell
starts, before the settings are known, it behaves as if history were off.

**Clear history**, on the same page, asks for confirmation. Then it empties the recently played
list and the search results, deletes the thumbnails and the lookup files the playing track does
not need, and rewrites `state.json` at once. The track that is playing goes on and remains the
saved last track.

The volume and the mute state are remembered as well. They are not settings: they live in
`state.json`.

## IPC

Every method is called as `omarchy-shell davidgudovic.omajuke <method> [argument]`. With `-q`
right after `omarchy-shell` the command prints nothing and always succeeds, which suits a key
binding of your own.

| Method | Example | What it does | Answers |
|---|---|---|---|
| `toggle` | `omarchy-shell davidgudovic.omajuke toggle` | Opens or closes the panel, on the focused monitor | `ok`, `unhandled` |
| `open` | `omarchy-shell davidgudovic.omajuke open` | Opens the panel | `ok`, `unhandled` |
| `close` | `omarchy-shell davidgudovic.omajuke close` | Closes the panel | `ok`, `unhandled` |
| `playPause` | `omarchy-shell davidgudovic.omajuke playPause` | Pauses or resumes. After a failure it tries the track again | `ok`, `unhandled` |
| `stop` | `omarchy-shell davidgudovic.omajuke stop` | Stops playback and ends mpv | `ok`, `unhandled` |
| `previous` | `omarchy-shell davidgudovic.omajuke previous` | Returns to the start of the track | `ok`, `unhandled` |
| `next` | `omarchy-shell davidgudovic.omajuke next` | Nothing in this version: there is no queue | `unhandled` |
| `play` | `omarchy-shell davidgudovic.omajuke play "https://youtu.be/<id>"` | Plays that video. A bare 11-character video id is accepted here, and only here | `ok`, `invalid`, `unavailable` |
| `enqueue` | `omarchy-shell davidgudovic.omajuke enqueue "https://youtu.be/<id>"` | The same as `play` while nothing is playing. Otherwise nothing: there is no queue | `ok`, `invalid`, `unavailable`, `unhandled` |
| `search` | `omarchy-shell davidgudovic.omajuke search "night drive"` | Starts that search and opens the panel | `ok`, `invalid`, `unavailable` |
| `status` | `omarchy-shell davidgudovic.omajuke status` | Reports the playback state | JSON, below |

The answers:

- `ok`: done.
- `unhandled`: there was nothing to act on, or no bar to show the panel.
- `invalid`: the argument was refused. For `play` and `enqueue` it is not a YouTube video link or
  id. For `search` it is empty, longer than 200 characters, or looks like a link, an address or a
  file path. Any argument longer than 2048 characters or with a control character in it is
  refused as well.
- `unavailable`: OmaJuke cannot start anything right now. It is still starting, a tool it needs is
  missing, or the proxy notice has not been answered.

`status` answers one JSON object:

```json
{ "version": "0.1.0", "state": "playing", "id": "AAAAAAAAAAA", "title": "Example title",
  "channel": "Example channel", "position": 37.2, "duration": 213, "live": false, "volume": 70,
  "muted": false, "queueLength": 1, "queueIndex": 0, "video": "hidden", "output": "",
  "signedIn": false, "updatePending": false, "error": "" }
```

`state` is one of `idle`, `resolving`, `loading`, `playing`, `paused`, `buffering` and `error`.
`error` is empty or a code such as `E_NETWORK`. `updatePending` is true between an update and the
shell restart that finishes it. `video`, `output` and `signedIn` never change in this version.

No method takes a file path, a setting or a command, and no argument is ever written to a log.
Two things to know all the same:

- An argument you type on a command line (`search <words>`, `play <link>`) can be seen by other
  programs on your machine in that command's process arguments while it runs.
- Every program that runs as you can call these methods, and so read `status`.

## What it connects to

OmaJuke has no telemetry, no analytics, no crash reports and no update check, and it downloads no
code of its own. Its code names two hosts, `www.youtube.com` and `i.ytimg.com`. The media hosts
come out of YouTube's answers, and the last row of the table is not OmaJuke's doing at all.

| When | Program | Host | What the other side learns |
|---|---|---|---|
| You press Enter on a search, or call `search` | yt-dlp | `www.youtube.com` | Your IP address and the search text |
| You play a track. The same lookup is made again when you retry after a failure, when a track that failed or broke off is picked up again (OmaJuke does that once by itself, not in a loop), and when you resume a paused track that was looked up more than five and a half hours ago | yt-dlp | `www.youtube.com`, and for some videos other `*.youtube.com` and `*.googlevideo.com` addresses | Your IP address and the video |
| A track plays | mpv | `*.googlevideo.com` | Your IP address and the stream. The stream address YouTube issues contains your public IP address |
| The open panel shows a row or the playing track | curl | `i.ytimg.com` | Your IP address and which videos are on screen |
| A track is loaded and `mpv-mpris` is installed | Omarchy's media widget, not OmaJuke | `i1.ytimg.com` | Your IP address and the video |

What the table cannot show:

- **No account.** No login, no cookie file and no browser profile is read or sent, by OmaJuke, by
  yt-dlp or by mpv. yt-dlp still presents itself to YouTube the way it always does, with
  browser-like headers.
- **Fewer lookups than plays.** A track that was looked up less than five hours ago is played
  from that answer, as long as its file is still there (see [What it stores](#what-it-stores)).
  A thumbnail is fetched once and then kept, about 200 of them at most, until the shell restarts
  or you clear the history.
- **Opening the panel is a request.** The rows it shows, recently played ones included, get their
  thumbnails then. Thumbnails are fetched only while a panel is open: over HTTPS, without
  redirects, with an empty user agent, at most 256 KiB each and 12 per batch. The address is built
  from the video id. An address that YouTube returned is never fetched.
- **yt-dlp runs YouTube's player code.** To work out stream addresses yt-dlp downloads YouTube's
  player script from YouTube and may run it with deno. That is how yt-dlp works. OmaJuke starts it
  without your yt-dlp configuration and without yt-dlp plugins, with remote components for yt-dlp
  switched off and with deno's update check disabled.
- **Your own tool configuration is not used.** mpv starts with `--no-config`, yt-dlp with
  `--ignore-config`, curl with `-q`. A script or option of yours adds no destination and takes
  none away.
- **Certificates are checked.** mpv does not verify TLS certificates unless told to. OmaJuke
  starts it with `--tls-verify=yes`.
- **Your DNS resolver sees these host names.**
- **The list is what OmaJuke asks for, not a guarantee.** yt-dlp and mpv decide which requests
  they make in detail, and OmaJuke cannot restrict them.

**Proxies.** OmaJuke does not use a proxy, and it passes no proxy variable to yt-dlp, mpv or
curl. Passing them on would look harmless and would not be: mpv ignores the usual proxy settings
for media streams, so the lookups would go through the proxy while every stream left directly from
your real address. So everything goes direct, and OmaJuke says so instead of doing it silently. If
one of `http_proxy`, `https_proxy`, `all_proxy` or their upper-case forms is set when the shell
starts, it does nothing on the network and shows only a notice, until you click **Continue without
a proxy**. It asks once and keeps the answer in `state.json`. To route OmaJuke's traffic, use a
system-wide VPN.

**Other programs on your desktop.** With `mpv-mpris` installed, mpv announces itself on the
session bus as a media player. Programs on your desktop can then read the title of the track, the
address of its YouTube page and a cover-art address, and they can control playback. Omarchy's
media widget fetches that cover art, which is the last row of the table. Anything else that
listens there, such as a scrobbler or a phone bridge, may pass the title on. A program on the
session bus can also ask the player to open an address of its choice. OmaJuke stops such a file as
soon as mpv reports it, but mpv has usually begun to open it by then.

## What it stores

| Path | Mode | What is in it | How long |
|---|---|---|---|
| `~/.local/state/omajuke/state.json`, or `$XDG_STATE_HOME/omajuke/state.json` if that variable is set | Folder 0700, file 0600 | Volume and mute, whether you answered the proxy notice, a copy of your history choice and, while `rememberHistory` is on, the recently played list and the last track | Until you delete it |
| `$XDG_RUNTIME_DIR/omajuke/`, normally `/run/user/<uid>/omajuke/`, which is in memory | Folder 0700 | The entries below | Emptied when OmaJuke is disabled or removed, and normally when the shell exits. Gone at logout, at the latest at reboot |
| `mpv.sock` in it | 0600 | The socket OmaJuke controls mpv through | Removed at every shell start. mpv leaves the file behind when it exits |
| `info/<number>.json` | 0600 | yt-dlp's answer for a track you played. It holds stream addresses, and those contain your public IP address | About 8 files at most. Deleted once nothing is playing and the panel is closed, by Clear history, and at every shell start |
| `thumbs/<number>.jpg` | 0600 | Thumbnails of rows the panel showed | About 200 files at most: beyond that the oldest go. Deleted by Clear history and at every shell start |
| `ytcache/`, `deno/` | Folders 0700 | The caches yt-dlp and deno keep of YouTube's player code | As the folder |
| `jar/`, `signin/` | Folders 0700 | Nothing. They are created and not used in this version | As the folder |
| OmaJuke's entry in `~/.config/omarchy/shell.json`, which is Omarchy's file | Omarchy's | The two settings | Until the plugin is disabled |

About `state.json`:

- A track is stored as its video id, title, channel, length and whether it is live.
- It never holds search text, stream addresses, file paths, account names, dates, times or play
  counts.
- A file that cannot be read, that is larger than 1 MiB, or whose format version this OmaJuke
  does not know is replaced by a fresh one. No copy of the old file is kept, so a downgrade to an
  older format costs the saved history. The panel then says that the history was reset.
- While the plugin is being disabled or removed, nothing is written to it any more.

Files in the runtime folder are named by a counter, never by a video id, so no id appears in a
file name. Their content still shows what was listed and played until they are deleted.

Nothing else is written. OmaJuke keeps no log and writes nothing into its own plugin folder.
yt-dlp's cache in your home folder is neither read nor written.

The shell has a log, and OmaJuke is built to keep titles, search text, video ids and addresses out
of it. The only lines its own code sends there are fixed warnings about its own bugs. Qt may add
a warning of its own about the socket or about a file, which is one reason the files are numbered.

Honest limits:

- **Deleting is not secure erase.** On btrfs and on an SSD the old content of `state.json` stays
  on the disk until it happens to be overwritten. Full-disk encryption is what protects it.
- **Copies you made are yours to find.** Backups, snapshots and dotfile sync may hold older
  versions of `state.json`, with a history you have since cleared.
- **Memory can be swapped.** The runtime folder is in memory. If your system swaps to a disk, its
  content can end up there.
- **One command line shows what you play.** OmaJuke hands search text and links to yt-dlp and mpv
  through pipes and a socket, not on a command line, where every local program could read them.
  There is one exception it cannot avoid: each time a track starts, mpv runs its own yt-dlp helper
  for a fraction of a second with the address of the video's YouTube page among its arguments.
- **Other programs that run as you** can read these files, the socket and the desktop's media
  interface. See [SECURITY.md](SECURITY.md).

## Updating

Run `omarchy plugin update davidgudovic.omajuke`. Omarchy shows what changed and asks before it
applies the update. Then restart the shell with `omarchy restart shell`.

Until the restart, the part of OmaJuke that plays music is still the old version, while the icon
and the panel are the new one. A panel does not work with a service of another version: it shows
only `OmaJuke was updated. Restart the shell to finish updating`, and the middle click and the
wheel on the icon do nothing. Playback goes on meanwhile, and the media keys and the IPC methods
keep working.

Restarting the shell ends playback: mpv is tied to the shell and stops with it.

## Removing

Run `omarchy plugin remove davidgudovic.omajuke`. Omarchy asks for confirmation, disables the
plugin and deletes its folder `~/.config/omarchy/plugins/davidgudovic.omajuke`.

Disabling, which is also what `omarchy plugin disable davidgudovic.omajuke` does, takes the icon
off the bar, stops playback, ends mpv and deletes the files in the runtime folder. Omarchy erases
OmaJuke's settings entry at the same time. Your history choice survives in `state.json`, so a
plugin that is enabled again does not start remembering history you had switched off.

Removal cannot delete what lies outside the plugin folder. These are left, for you to delete by
hand if you want no trace:

| Path | What is left |
|---|---|
| `~/.local/state/omajuke/`, or `$XDG_STATE_HOME/omajuke/` | `state.json` |
| `$XDG_RUNTIME_DIR/omajuke/` | Normally an empty folder. It is gone at logout |

Nothing else is left behind. The limits listed under [What it stores](#what-it-stores) apply to
deleting `state.json` too.

## Terms and credits

OmaJuke is not affiliated with or endorsed by YouTube or Google. What you do with it is your
responsibility: respect YouTube's terms of service and the rights of the people whose work you
play.

mpv plays the media streams that YouTube serves. Those streams normally carry no ads. That is how
they come, not something OmaJuke promises.

OmaJuke is a thin layer over other people's work:

- [mpv](https://mpv.io/) plays the audio.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) searches and looks tracks up.
- [mpv-mpris](https://github.com/hoyon/mpv-mpris) connects mpv to the media keys.
- curl fetches the thumbnails.
- Omarchy and Quickshell are the shell it runs in.

## Development and testing

```sh
tests/check.sh
```

That one command runs, in this order, and stops at the first failure:

1. the node tests under `tests/node`, which cover the pure JavaScript modules in `lib/` and
   `ui/Ui.js` and a set of repository audits (style, safety rules, this README's sections);
2. `omarchy plugin validate`;
3. `qmllint` over the QML files, filtered by `tests/lint-qml.js`;
4. every case under `tests/harness/cases` and `tests/harness-ui/cases`.

It needs node 20 or later, Omarchy and Qt's `qmllint` at `/usr/lib/qt6/bin/qmllint`. The node
tests have no dependencies, so there is nothing to fetch first.

Parts of it can be run alone:

```sh
node --test tests/node
tests/harness.sh core search_ok
tests/harness.sh ui keys_main
```

The tests never touch your running session. `tests/harness.sh` starts a separate, headless
Quickshell for each case, with an emptied environment, the offscreen platform and private runtime,
state and configuration folders that it creates under `$XDG_RUNTIME_DIR` and removes afterwards.
That instance has no Wayland display, no session bus and no compositor. Stub scripts in
`tests/stubs` stand in for mpv, yt-dlp and curl, so a case opens no window, plays no sound and
makes no network request. One case, `tether_real`, starts the real mpv, silent and with nothing
loaded, to prove that mpv exits when the shell is killed. The script ends a process only by a
process id it recorded itself, never by name.

`tests/record-traces.js` is run by hand and is not part of the gate. It drives the real mpv,
silently, over generated sound files and records the event order that the player logic and the mpv
stub are tested against.

Where things are:

| Path | What |
|---|---|
| `Service.qml` | The one long-lived object: the public surface, the IPC methods, the wiring |
| `core/` | The parts the service is made of: process runner, files, player, search, lookups, thumbnails, playback |
| `lib/` | Pure JavaScript for the service side: validation, command lines, parsers, state format |
| `BarWidget.qml`, `Panel.qml`, `ui/` | The bar icon and the panel. They only read and call the service |
| `tests/` | Node tests, shared input tables, the two headless harnesses, stub tools, fixtures |

The code is written like Omarchy's own QML: two-space indent, no semicolons, `var` and `function`
only, and comments that say why. The audits in `tests/node/repo.test.js` enforce that along with
the safety rules.

Security reports go through [SECURITY.md](SECURITY.md), not through a public issue.

## License

MIT. See [LICENSE](LICENSE).
