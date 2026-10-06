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
  Omarchy, mpv and yt-dlp;
- what an attacker has to control: a video title, a search result, a file, a local program, the
  network;
- the steps or the input that show the problem.

Leave personal data out. A made-up title or id that triggers the bug is enough: no real history,
no real addresses.

In scope is anything that breaks a statement in this file or under "What it connects to" and
"What it stores" in the [README](README.md). Examples: text from outside that is run, shown as
markup, or that reaches a command line, a file name or the log; a request to a host that is not
listed; a file with wider permissions than documented; a child process that outlives the shell; an
IPC argument that does more than documented.

A bug in mpv, yt-dlp, curl, Quickshell or Omarchy itself belongs to that project. If the way
OmaJuke calls one of them is what makes the bug reachable, it belongs here as well.

## Supported versions

Only the current state of the default branch, `main`, is supported. That is what
`omarchy plugin add` and `omarchy plugin update` install. There are no maintenance branches, and
fixes are not backported to older versions.

## Trust summary

Trusted:

- Your session: everything that already runs as you, including the compositor and the Omarchy
  shell, inside which OmaJuke's code runs unsandboxed.
- The programs it starts, from fixed paths under `/usr/bin`: mpv, yt-dlp, curl and a few system
  tools. yt-dlp may in turn run deno.

Not trusted, and treated as hostile input:

- Everything those programs return: yt-dlp's JSON and its error text, every line mpv sends over
  its socket, curl's report, the images.
- The arguments of IPC calls, and the text typed or pasted into the search field.
- The files it reads back: `state.json` and its own entry in the shell's `shell.json`.

Stored: `state.json`, mode 0600 in a 0700 folder, with the volume, the mute state, your answer to
the proxy notice, your history choice and, unless you switched history off, up to 30 recently
played tracks and the last track. Short-lived files in a private folder in memory. Two settings in
the shell's own configuration. No credentials of any kind exist in this version.

Leaves the machine: your search text and the videos you play go to YouTube, the streams come from
YouTube's media hosts, the thumbnails from `i.ytimg.com`. No telemetry, no update check.

The README has both full tables.

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
- Every helper (yt-dlp, curl, the file tools) is started by absolute path from an argument list,
  with an emptied environment, a time limit and a cap on the bytes read from it. The only shell
  text is three fixed snippets that receive their paths as positional parameters. The helpers and
  mpv are tied to the shell and are ended when it ends.
- mpv runs without your configuration, without its default key bindings, with certificate checks
  on, and it is sent commands from a closed list only. Its control socket is in a folder only you
  can enter, inside a runtime directory that must itself be yours and private. There is no
  fallback to a shared temporary folder.

## Known limits

These are known and accepted:

- Each time a track starts, mpv runs its own yt-dlp helper for a fraction of a second with the
  address of the video's YouTube page among its arguments. Other local programs can see it there.
  mpv offers no other way to hand it over.
- With `mpv-mpris` installed, the track's title, its page address and a cover-art address are
  published on the session bus, and a program on that bus can ask the player to open an address
  of its choice. OmaJuke stops such a file as soon as mpv reports it, but mpv has usually begun to
  open it by then.
- If OmaJuke is disabled, or the shell exits, while a lookup is running, yt-dlp is ended, but a
  process yt-dlp started itself (deno) is not, and may run on for a moment.
- Deleting a file is not secure erase, and backups or snapshots may keep older copies of
  `state.json`.

## What OmaJuke does not try to do

- **Defend against other software that runs as you.** Such software can read `state.json` and the
  runtime folder, call the IPC methods, use the desktop's media interface, and connect to mpv's
  control socket, which is as powerful as your own account. It could do all of that harm without
  OmaJuke.
- **Hide what you do from YouTube or from your network.** YouTube sees your IP address, your
  searches and what you play. Your DNS resolver and your network see which hosts you contact.
  OmaJuke uses no proxy and offers no anonymity.
- **Contain mpv, yt-dlp or deno.** They run with your rights. A flaw in one of them, for example
  in the code that decodes a stream, is not confined by OmaJuke.
- **Vouch for future versions.** An update installs whatever the default branch then holds.
  Omarchy shows you the changes first, and reading them is the check there is.
