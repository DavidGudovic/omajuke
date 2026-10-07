# Security

## Reporting a vulnerability

Report it privately, through GitHub's private vulnerability reporting for this repository: open
the **Security** tab of <https://github.com/DavidGudovic/omajuke> and choose **Report a
vulnerability**, or go straight to
<https://github.com/DavidGudovic/omajuke/security/advisories/new>.

Please do not open a public issue or a pull request for anything that could put users at risk
before it is fixed.

A report is most useful with:

- the OmaJuke version (shown at the bottom of the panel's settings page), and the versions of
  Omarchy, Hyprland, mpv and yt-dlp;
- what an attacker has to control: a video title, a search result, a file, a local program, the
  network;
- the steps or the input that show the problem.

Leave personal data out. A made-up title or id that triggers the bug is enough: no real history,
no real addresses, and never a real login file.

In scope is anything that breaks a statement in this file or under "What it connects to",
"What it stores", "Shortcuts" and "Sign-in" in the [README](README.md). Examples: text from
outside that is run, shown as markup, or that reaches a command line, a file name, a line sent to
Hyprland or the log; a request to a host that is not listed; the saved login in a request that
should not carry it; a file with wider permissions than documented; a child process that outlives
the shell; a bind of yours that OmaJuke removed or replaced; an IPC argument that does more than
documented.

A bug in mpv, yt-dlp, curl, Hyprland, a browser, Quickshell or Omarchy itself belongs to that
project. If the way OmaJuke calls one of them is what makes the bug reachable, it belongs here as
well.

## Supported versions

Only the current state of the default branch, `main`, is supported. That is what
`omarchy plugin add` and `omarchy plugin update` install. There are no maintenance branches, and
fixes are not backported to older versions.

## Trust summary

Trusted:

- Your session: everything that already runs as you, including Hyprland and the Omarchy shell,
  inside which OmaJuke's code runs unsandboxed.
- The programs it starts, from fixed paths under `/usr/bin`: mpv, yt-dlp, curl, `hyprctl`,
  `xdg-settings` and a few system tools. yt-dlp may in turn run deno.
- For a sign-in, your default browser, if it is one of six known ones at its packaged path.

Not trusted, and treated as hostile input:

- Everything those programs return: yt-dlp's JSON and its error text, every line mpv sends over
  its socket, curl's report, the images, Hyprland's answers and its list of binds (the
  descriptions in it are other people's text), the names of audio devices (a Bluetooth device
  names itself), the answer of the sponsor database.
- The arguments of IPC calls, the text typed or pasted into the search field, and a key
  combination recorded on the shortcuts page.
- The files it reads back: `state.json` and its own entry in the shell's `shell.json`.

Stored: `state.json`, mode 0600 in a 0700 folder, with the volume, the mute state, your answer to
the proxy notice, three privacy choices, the shortcuts you assigned and your answer to the
question about them, the audio output you chose, where you left the video window and, unless you
switched history off, up to 30 recently played tracks and the queue. Short-lived files in a
private folder in memory. Ten settings in the shell's own configuration. Only if you sign in: `cookies.txt`, mode 0600 in a 0700 folder, which
is a credential for your YouTube account.

Leaves the machine: your search text and the videos you play, queue next or preload go to
YouTube, the streams come from YouTube's media hosts, the thumbnails from `i.ytimg.com`. Only if
you switch it on: a four-character hash prefix per track to `sponsor.ajay.app`; with a sign-in,
your account's lists and, if you ask for it, watch reports, to YouTube. No telemetry, no update
check. The [README](README.md) has the full tables under "What it connects to" and "What it
stores".

## How untrusted input is handled

- It is capped in size while it is read, parsed defensively, type-checked and copied field by
  field. Text is stripped of control and direction-changing characters before it is kept.
- Every label is plain text. A title cannot become markup, so it cannot make the shell load
  anything.
- No such text reaches a command line, an environment variable, a file name or the log. Search
  text and video addresses go to yt-dlp and curl on standard input and to mpv over its socket, and
  files are named by a counter.
- A video address is always rebuilt from a validated 11-character id. Text that looks like any
  other link, address or path is refused and not sent anywhere.
- Every helper (yt-dlp, curl, `hyprctl`, the file tools) is started by absolute path from an
  argument list, with an emptied environment, a time limit and a cap on the bytes read from it.
  The only shell text is six fixed snippets that receive their paths as positional parameters.
  The helpers and mpv are tied to the shell and are ended when it ends.
- mpv runs without your configuration, without its default key bindings, with certificate checks
  on, and it is sent commands from a closed list only. Its control socket is in a folder only you
  can enter, inside a runtime directory that must itself be yours and private. There is no
  fallback to a shared temporary folder.
- An answer of the sponsor database is believed only as far as it fits the track: segments must
  lie inside the track, belong to a fixed list of categories and together cover no more than four
  fifths of it. A skip only ever moves forward, and when skips end three tracks in a row within
  seconds of their start, skipping rests until you act.

## What is sent to Hyprland

A line handed to `hyprctl eval` runs inside the compositor, so this is the narrowest path in the
plugin:

- There are three fixed lines: one window rule for the video window, one that makes a bind, one
  that removes a bind. The only parts that vary are numbers that OmaJuke computed and a key
  combination that passed a strict grammar (modifiers and one letter or function key). No text
  from a file, from Hyprland, from IPC or from the network is ever part of a line.
- Every line is checked once more against the pattern of those three forms immediately before it
  is sent. A line that does not match is not sent.
- Nothing is sent on a Hyprland version that is not 0.56.x, while Hyprland reports configuration
  errors, or outside Hyprland. While OmaJuke runs, both are asked before each line.
- No handle that Hyprland returns for a bind or a rule is kept or used.
- A bind is made only on a combination that a list read immediately before shows as free. While
  OmaJuke runs, a bind is removed only where a list read immediately before shows nothing but
  OmaJuke's own bind on that combination. A bind is only ever removed under a spelling of the
  modifiers that nobody types by hand. Where the list cannot be read or understood, nothing is
  made and nothing is removed.
- The one exception is the moment the plugin is disabled or removed or the shell exits, when
  nothing can be read or waited for. The binds that the last completed check showed as OmaJuke's
  own and nobody else's are then removed without a new read of the list, the version or the
  configuration errors, and only if that check had found nothing in the way. The known limits
  say what that can cost.
- Nothing is written under `~/.config/hypr`. The clipboard is written by **Copy line** and never
  read.

## How the login is handled

This applies only after a sign-in:

- The browser is chosen by looking the default browser's desktop id up in a fixed table. No
  desktop file is read and no command from one is run. It is started on a new profile in the
  private runtime folder, with a private and empty configuration folder, so that no flag file of
  yours can add an extension, a password store or a debugging port. OmaJuke passes no flag that
  opens a debugging port, automates the browser or writes a log. The browser is ended after 15
  minutes at the latest. While OmaJuke runs, its profile is deleted only after it has exited. When
  the plugin is disabled or removed, or the shell exits, during a sign-in, that order is not
  kept (see the known limits).
- The password is typed into the browser. OmaJuke never sees it.
- The cookies are read by yt-dlp from that one profile, with the browser's built-in key instead of
  a keyring. Your everyday profile and your keyring are never opened. A fixed shell snippet keeps
  the rows of `youtube.com` and its subdomains only. The file is created private from its first
  byte and moved into place in one step. The profile and the unfiltered export are deleted on
  every way the step can end.
- A saved login is kept only once YouTube has answered one request made with it. If that request
  fails for any reason, if the user cancels while the login is being saved or checked, or if the
  plugin or the shell ends in that time, the file is deleted. A login nobody has seen working
  never counts as signed in.
- Cookie values never pass through OmaJuke's own code, a command line, an environment variable
  or a log.
- OmaJuke never reads the saved file. A request that needs it gets a numbered copy, runs with a
  private file mask, and the copy is deleted after the program has exited. One such request runs
  at a time.
- The login is attached only to the requests listed in the README, and only to addresses on
  `www.youtube.com` that OmaJuke built itself. There are four: reading one of the account's
  lists, the one check of a new login, the watched report, and the lookup of one video after the
  user pressed **Play with my account** for it. Nothing else carries it, and curl and mpv never
  get it.
- The lookup of a video with the login has exactly one caller: the button on the notice for a
  track that failed because it needs an account, shown only while somebody is signed in. The
  answer is not remembered and no setting stands in for it. There is no IPC method for it.
- When yt-dlp reports that YouTube no longer accepts the login, no further request is given it.
  The file stays on disk until the user signs in again or signs out. The account page offers
  both in that state.
- The watched report is switched off whenever nobody is signed in any more, so that a choice made
  for one login never applies to the next.

## Known limits

These are known and accepted:

- **The sign-in flow has been tested only against a stand-in browser,** never with a real
  browser or a Google account. The handling above is what the code does and what its tests
  check. That a real browser honours every flag as assumed has not been observed.
- The lines sent to Hyprland, and the assumptions about what removing a bind matches, are
  verified on Hyprland 0.56.2 only.
- `cookies.txt` is protected by file permissions and nothing else. Every program that runs as you
  can read it and use the account. During a sign-in the browser profile, with Google's cookies
  in it, lies in the runtime folder until the window is closed and the login is saved. If the
  shell is killed outright at that moment, it lies there until the shell next starts or you log
  out.
- Signing out deletes the file, and so does disabling or removing the plugin, there through a
  command that outlives the shell and whose result nothing checks. Neither ends the session at
  Google, and deleting is not secure erase. Backups or snapshots may keep older copies of
  `cookies.txt` and `state.json`.
- If the plugin is disabled or removed, or the shell exits, while the sign-in window is open, the
  browser is told to close and its profile is deleted at once, not after the browser has gone. A
  file the browser writes after that stays in the runtime folder until the next shell start, and
  after disabling or removing until logout. The same command deletes a login that was still being
  saved or checked. If the helper that saves it finishes in that same instant, the file can
  survive, unchecked, and count as signed in at the next start.
- A track played or queued from one of the account's lists is a played track like any other. While
  `rememberHistory` is on, its id, title and channel are stored in `state.json`, and signing out
  does not remove them. **Clear history** does.
- The answer to a lookup made with **Play with my account** is yt-dlp's description of the video,
  kept in the runtime folder and handed to mpv like the answer to any other lookup. yt-dlp writes
  a cookie into such an answer only beside an address on the cookie's own site, and stream
  addresses are not on `youtube.com`. OmaJuke relies on that and does not inspect the answer.
- At exit the binds are removed on the strength of the last completed check, however old (see
  "What is sent to Hyprland"). If another program has since made a bind under the very same
  spelling of the same combination, it is removed with OmaJuke's. If Hyprland has reported
  configuration errors since, the line clears that list from the screen.
- Configuration errors that Hyprland reports while one of OmaJuke's lines is already on its way
  are cleared from the screen by that line. The next check then finds none, and OmaJuke goes on
  sending lines although the configuration has errors.
- Hyprland's list does not show every kind of bind: binds that ignore modifiers, binds limited
  to one device, binds on several keys, and per-device layouts are invisible to it. OmaJuke can
  then bind a key that is in use, and both binds fire. Another program that makes a bind on the
  same combination between OmaJuke's read and its line is not noticed either.
- A bind left behind by a crash stays until Hyprland reloads. It runs a fixed command that does
  nothing once OmaJuke is gone.
- A preloaded result is looked up exactly like a played one. YouTube cannot tell the difference,
  and with `preload` on it sees a lookup for the top result of every search.
- Each time a track starts, mpv runs its own yt-dlp helper for a fraction of a second with the
  address of the video's YouTube page among its arguments. Other local programs can see it there.
  mpv offers no other way to hand it over.
- With `mpv-mpris` installed, the track's title, its page address and a cover-art address are
  published on the session bus, and a program on that bus can ask the player to open an address
  of its choice. OmaJuke stops such a file as soon as mpv reports it, but mpv has usually begun to
  open it by then.
- If OmaJuke is disabled, or the shell exits, while a lookup is running, yt-dlp is ended, but a
  process yt-dlp started itself (deno) is not, and may run on for a moment.

## What OmaJuke does not try to do

- **Defend against other software that runs as you.** Such software can read `state.json`, the
  login file and the runtime folder, call the IPC methods, use the desktop's media interface,
  talk to Hyprland, and connect to mpv's control socket, which is as powerful as your own
  account. It could do all of that harm without OmaJuke, except for reading a login that would
  not be on the disk.
- **Hide what you do from YouTube or from your network.** YouTube sees your IP address, your
  searches and what you play. Your DNS resolver and your network see which hosts you contact.
  OmaJuke uses no proxy and offers no anonymity.
- **Protect an account from YouTube.** YouTube does not offer the access a sign-in uses, and may
  challenge, restrict or close an account for it.
- **Contain mpv, yt-dlp, deno or a browser.** They run with your rights. A flaw in one of them,
  for example in the code that decodes a stream, is not confined by OmaJuke.
- **Vouch for future versions.** An update installs whatever the default branch then holds.
  Omarchy shows you the changes first, and reading them is the check there is.
