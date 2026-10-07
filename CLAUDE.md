# Working in this repository

Read `CONTRIBUTING.md` first: it has the layout, the rules that never bend, the code style, how to
test and how to release. This file adds only what an assistant session needs on top of it.

- **This repository is public.** Never put details of the machine you run on (user names, home
  paths, installed software, window titles, captured command output), real video ids or titles, or
  anything from a conversation into a file, a commit message or a screenshot. Test data is
  synthetic.
- **Privacy and security come first.** When a choice exists, take the conservative default and
  state the trade-off to the maintainer instead of silently choosing convenience. No telemetry.
- **Say what is unverified.** The automated tests run against stand-ins. Real playback, the video
  window and shortcuts on a real Hyprland, how the panel looks, and signing in with a real account
  need a person on an Omarchy desktop (see "Not verified yet" in `CONTRIBUTING.md`). Do not claim
  such a change works: say what was run and what was not.
- **Never send state-changing `hyprctl` commands to a session someone is working in**, and never
  touch a running Omarchy shell or an installed copy of the plugin while testing.
- **Before committing:** run `tests/check.sh`. Where Quickshell and mpv are not available, run
  `node --test tests/node` and say that the headless harnesses did not run. Then read the list of
  files you are about to add.
- **A change a user can see** gets a version bump in every place `CONTRIBUTING.md` lists and an
  entry in `CHANGELOG.md`.
- **Do not file the marketplace submission**, and take no other step outside this repository,
  unless the maintainer asks for it.
