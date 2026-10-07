# Changelog

Every released version of OmaJuke, newest first. Only changes a user can see are listed.

## 0.2.0 - 2026-10-07

A queue, a video window, shortcuts, a choice of audio output and two things that stay off until
you switch them on: sign-in and sponsor skipping.

Added:

- A queue of up to 200 tracks. Shift+Enter or the button on a row adds a track, the queue page
  plays, moves and removes tracks, and Next and Previous move through it, from the panel, from
  IPC and from the media keys. A track that cannot be played is skipped. The queue is kept
  between sessions together with the history.
- The setting `autoplay`, on by default: when the last track of the queue starts, up to 20
  related tracks are added.
- Every button of the main page, and through them every other page, can be reached with the
  arrow keys: the gear above the list, the buttons under the playing track below it.
- The setting `preload`, on by default: the top result of every search and any result the
  highlight rests on is looked up at YouTube ahead of time, so that it starts at once. Switch it
  off if YouTube should only see what you play.
- A video window for the playing track: floating in a corner, pinned to every workspace, above
  tiled windows. It remembers per monitor where you left it. Settings `maxHeight`, `videoSize`,
  `videoCorner` and `keepAwake`. Needs Hyprland 0.56.x.
- Three keyboard shortcuts that work anywhere on the desktop: open the panel, show or hide the
  video, next audio output. None is assigned until you assign it. They are binds made in the
  running Hyprland, never written into your configuration, and OmaJuke takes only a key that
  nothing else uses. **Copy line** gives you a line for your own `bindings.lua` instead. Needs
  Hyprland 0.56.x.
- A choice of audio output for OmaJuke's sound alone. The system default is not changed. If the
  chosen output disappears, the system default is used until it is back.
- Sign-in, off unless you use it: the lists of your YouTube account in the panel, and the
  setting `markWatched`, which adds tracks that played for 30 seconds to your watch history. A
  video that needs an account can be played with it, one at a time: the panel asks with
  **Play with my account** each time and never uses the login for a video by itself. The login is
  stored in `~/.local/share/omajuke/cookies.txt`. A sign-in that does not finish leaves no login
  behind. It has been tested only against a stand-in browser, and it puts the account at risk:
  read the Sign-in section of the README first.
- Sponsor skipping, off until you answer the question the panel asks once: sponsor segments are
  looked up at sponsor.ajay.app and jumped over. Setting `sponsorSkip`.
- IPC methods `video` and `output`. `status` now reports the video window, the audio output and
  whether a login is in use.

Changed:

- Previous goes to the track before the playing one when that one has played for less than three
  seconds. `next` and `enqueue` act on the queue. `enqueue` can answer `full`.
- The home list shows what is queued above what was played recently.
- Clear history also cuts the queue down to the playing track.
- A history switched off, `preload` and `autoplay` survive disabling and enabling the plugin.
  Before, that held for the history alone.
- OmaJuke creates the folder `~/.local/share/omajuke/` at start. It stays empty unless you sign
  in.

## 0.1.0 - 2026-10-06

The first version: search YouTube from the bar and play the audio through mpv.

- A bar icon. Left click opens the panel, middle click plays or pauses, the wheel changes the
  volume. The icon shows whether something is playing or paused, and its tooltip names the track.
- A panel with a search field. A search is sent when you press Enter and lists up to 20 results
  with thumbnails. A pasted YouTube video link is played directly. Text that looks like any other
  link, address or file path is not sent anywhere.
- Playback as audio through mpv: pause, resume, seek, restart the track, volume and mute. It goes
  on while the panel is closed. One track at a time: there is no queue.
- A list of up to 30 recently played tracks, kept between sessions. The setting `rememberHistory`
  switches the keeping off, and Clear history empties the list.
- The setting `evenVolume`, which plays quiet and loud tracks at a similar level.
- Media keys and Omarchy's media widget, when `mpv-mpris` is installed.
- IPC methods for scripts and your own key bindings: `toggle`, `open`, `close`, `playPause`,
  `stop`, `previous`, `next`, `play`, `enqueue`, `search` and `status`.
- A notice instead of a silent bypass when a proxy is set for the session: OmaJuke does not use
  proxies, and does nothing on the network until you have read that.
