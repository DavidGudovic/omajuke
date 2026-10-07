#!/usr/bin/sh
# tests/cloud-env.sh <prepare|check|run <command...>>
# Gives a bare Linux container, such as a cloud coding session, what tests/check.sh needs, by building
# an Arch Linux root outside the repository and running the checks inside it.
#
#   prepare  builds the root under $OMAJUKE_ENV (default /opt/omajuke-env), once: the Arch bootstrap
#            image, then quickshell, mpv, qt6-declarative, nodejs, jq and git from the Arch mirror,
#            and Omarchy's shell and command line at /usr/share/omarchy. Run again, it only mounts.
#   check    runs tests/check.sh in the root against this checkout.
#   run      runs any command there, from the top of the checkout (the root's PATH and tools).
#
# Needs root and network access, and is meant for a throwaway container only: it mounts /proc, /dev
# and /sys into the root and leaves them mounted. Nothing in the root reaches a desktop session; the
# harness inside starts its own headless Quickshell exactly as on an Omarchy machine.
#
# Trust: the bootstrap image is checked against the sha256 list on the same mirror, over TLS (not
# against the Arch release signature); packages are checked by pacman against the Arch keyring that
# image carries. Omarchy is a shallow copy of OMAJUKE_OMARCHY_REF (default: the pinned commit below)
# from its public repository.
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
ENV_DIR=${OMAJUKE_ENV:-/opt/omajuke-env}
ROOT=$ENV_DIR/root.x86_64
MIRROR=${OMAJUKE_ARCH_MIRROR:-https://geo.mirror.pkgbuild.com}
OMARCHY_URL=https://github.com/basecamp/omarchy
OMARCHY_REF=${OMAJUKE_OMARCHY_REF:-b6f2c1cef7bbf3c3560b0d9e039d6f4c742b70bf}
PACKAGES="quickshell mpv qt6-declarative nodejs jq git"

case "$ENV_DIR" in /?*) ;; *) echo "cloud-env: OMAJUKE_ENV must be an absolute path" >&2; exit 2 ;; esac
case "$ENV_DIR/" in "$REPO"/*) echo "cloud-env: the root may not live in the repository" >&2; exit 2 ;; esac

# Commands run as an unprivileged user: as root, the tests that expect a write to be refused would
# see it succeed. The checkout belongs to someone else, so git is told it is safe to read.
in_root() {
  /usr/sbin/chroot --userspec=1000:1000 "$ROOT" /usr/bin/env -i PATH=/usr/share/omarchy/bin:/usr/bin \
    HOME=/home/tester LANG=C.UTF-8 OMARCHY_PATH=/usr/share/omarchy XDG_RUNTIME_DIR=/run/oj-xdg \
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=/work/omajuke "$@"
}

mounts() {
  mountpoint -q "$ROOT/proc" || mount -t proc proc "$ROOT/proc"
  mountpoint -q "$ROOT/dev" || mount --rbind /dev "$ROOT/dev"
  mountpoint -q "$ROOT/sys" || mount --rbind /sys "$ROOT/sys"
  mkdir -p "$ROOT/work/omajuke"
  mountpoint -q "$ROOT/work/omajuke" || mount --bind "$REPO" "$ROOT/work/omajuke"
  mkdir -p -m 700 "$ROOT/run/oj-xdg"
  chown 1000:1000 "$ROOT/run/oj-xdg"
  cp /etc/resolv.conf "$ROOT/etc/resolv.conf"
}

prepare() {
  [ "$(id -u)" -eq 0 ] || { echo "cloud-env: prepare needs root" >&2; exit 1; }
  if [ ! -f "$ROOT/.omajuke-ready" ]; then build; fi
  mounts
  echo "cloud-env: ready ($(in_root pacman -Q quickshell mpv | tr '\n' ' '))"
}

build() {
  mkdir -p "$ENV_DIR"
  if [ ! -d "$ROOT/usr" ]; then
    image=$ENV_DIR/bootstrap.tar.zst
    curl -fsS -o "$image" "$MIRROR/iso/latest/archlinux-bootstrap-x86_64.tar.zst"
    want=$(curl -fsS "$MIRROR/iso/latest/sha256sums.txt" \
      | awk '$2 == "archlinux-bootstrap-x86_64.tar.zst" { print $1 }')
    have=$(sha256sum "$image" | awk '{ print $1 }')
    if [ -z "$want" ] || [ "$want" != "$have" ]; then
      echo "cloud-env: the bootstrap image does not match its checksum" >&2; exit 1
    fi
    command -v zstd >/dev/null || { echo "cloud-env: zstd is needed to unpack the image" >&2; exit 1; }
    tar --zstd -xf "$image" -C "$ENV_DIR" 2>/dev/null
    rm -f -- "$image"
  fi

  echo "Server = $MIRROR/\$repo/os/\$arch" > "$ROOT/etc/pacman.d/mirrorlist"
  # The root is not a mount point, so pacman cannot measure free space, and a container may refuse
  # the namespaces of pacman's download sandbox.
  sed -i 's/^CheckSpace/#CheckSpace/; s/^#DisableSandbox/DisableSandbox/' "$ROOT/etc/pacman.conf"
  # A container that reaches the network through an inspecting proxy names its certificate in
  # SSL_CERT_FILE; the root trusts it too, so pacman and git can get through.
  if [ -n "${SSL_CERT_FILE:-}" ] && [ -f "$SSL_CERT_FILE" ]; then
    cp "$SSL_CERT_FILE" "$ROOT/etc/ca-certificates/trust-source/anchors/container-proxy.crt"
  fi
  mounts

  proxy=${HTTPS_PROXY:-${https_proxy:-}}
  /usr/sbin/chroot "$ROOT" /usr/bin/env -i PATH=/usr/bin HOME=/root LANG=C.UTF-8 \
    ${proxy:+https_proxy="$proxy"} ${proxy:+http_proxy="$proxy"} /usr/bin/sh -euc '
      update-ca-trust
      pacman-key --init >/dev/null 2>&1
      pacman-key --populate archlinux >/dev/null 2>&1
      pacman -Syu --noconfirm --needed '"$PACKAGES"'
      mkdir -p /usr/share/omarchy
      cd /usr/share/omarchy
      [ -d .git ] || git init -q
      git fetch -q --depth 1 '"$OMARCHY_URL $OMARCHY_REF"'
      git checkout -q --detach FETCH_HEAD
      id tester >/dev/null 2>&1 || useradd -m -u 1000 -U tester
    '
  touch "$ROOT/.omajuke-ready"
}

case "${1:-}" in
  prepare) prepare ;;
  check)
    [ -f "$ROOT/.omajuke-ready" ] || prepare
    mounts
    in_root /usr/bin/env -C /work/omajuke tests/check.sh
    ;;
  run)
    shift
    [ "$#" -gt 0 ] || { echo "usage: cloud-env.sh run <command...>" >&2; exit 2; }
    [ -f "$ROOT/.omajuke-ready" ] || prepare
    mounts
    in_root /usr/bin/env -C /work/omajuke "$@"
    ;;
  *) echo "usage: cloud-env.sh <prepare|check|run <command...>>" >&2; exit 2 ;;
esac
