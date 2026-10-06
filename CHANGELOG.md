# Changelog

Every released version of OmaJuke, newest first. Only changes a user can see are listed.

## 0.1.0

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
