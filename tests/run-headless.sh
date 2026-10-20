#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Runs a scene in an isolated, headless GNOME Shell (private D-Bus session, private HOME, keyfile settings).
# Nothing of your real session or files is touched.
#   tests/run-headless.sh <scene> [output-dir]       scenes: smoke | demo | compat | frames
# Environment: LOVYCAIRN_LANG=it to run in Italian; MON=1920x1080 for the virtual monitor size.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$(dirname "$here")"
scene="${1:-smoke}"; out="${2:-$here/out}"; mkdir -p "$out"; out="$(cd "$out" && pwd)"
tmp="$(mktemp -d /tmp/lovycairn-test.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
home="$tmp/home"; data="$tmp/data"; config="$tmp/config"; ext="$data/gnome-shell/extensions"
uuid="lovycairn@bitfarmy.github.io"

"$here/fixtures.sh" "$home" >/dev/null
wall="$here/.wallpaper.png"
if [ ! -f "$wall" ] && python3 -c "import PIL" 2>/dev/null; then python3 "$here/make-wallpaper.py" "$wall"; fi   # optional: only for screenshots

mkdir -p "$ext" "$config/glib-2.0/settings" "$tmp/cache" "$tmp/runtime"; chmod 700 "$tmp/runtime"   # private Wayland socket
cp -r "$root/extension" "$ext/$uuid"; cp -r "$here/shot@lovycairn.test" "$ext/"
glib-compile-schemas "$ext/$uuid/schemas"
for po in "$root"/po/*.po; do   # translations, compiled the way `make pack` does
  [ -f "$po" ] || continue
  lang="$(basename "$po" .po)"; mkdir -p "$ext/$uuid/locale/$lang/LC_MESSAGES"
  msgfmt -o "$ext/$uuid/locale/$lang/LC_MESSAGES/lovycairn.mo" "$po"
done
cat > "$config/user-dirs.dirs" <<DIRS
XDG_DESKTOP_DIR="$home/Desktop"
XDG_DOCUMENTS_DIR="$home/Documents"
DIRS
cat > "$config/glib-2.0/settings/keyfile" <<KEY
[org/gnome/shell]
enabled-extensions=['$uuid','shot@lovycairn.test']
disable-user-extensions=false
disable-extension-version-validation=$([ -n "${LOVYCAIRN_SKIP_VERSION_CHECK:-}" ] && echo true || echo false)
welcome-dialog-last-shown-version='999'
[org/gnome/desktop/interface]
color-scheme='prefer-dark'
[org/gnome/mutter]
dynamic-workspaces=true
KEY
[ -f "$wall" ] && cat >> "$config/glib-2.0/settings/keyfile" <<KEY
[org/gnome/desktop/background]
picture-uri='file://$wall'
picture-uri-dark='file://$wall'
picture-options='zoom'
KEY

rm -f "$out/finished"
lang="${LOVYCAIRN_LANG:-en}"
( cd "$tmp"; setsid dbus-run-session -- env HOME="$home" XDG_RUNTIME_DIR="$tmp/runtime" XDG_CONFIG_HOME="$config" XDG_DATA_HOME="$data" XDG_CACHE_HOME="$tmp/cache" \
    PATH="$root/notes:$root/bin:$PATH" XDG_DATA_DIRS=/usr/local/share:/usr/share GSETTINGS_BACKEND=keyfile XDG_SESSION_TYPE=wayland \
    LANGUAGE="$lang" LANG="${lang}_$(echo "$lang" | tr a-z A-Z).UTF-8" \
    SCENE="$scene" SHOT_DIR="$out" \
    gnome-shell --headless --wayland --no-x11 --virtual-monitor "${MON:-1920x1080}" >"$out/shell.log" 2>&1 &
  echo $! > "$tmp/shell.pid" )
for _ in $(seq 1 180); do [ -f "$out/finished" ] && break; sleep 1; done
kill -TERM -"$(cat "$tmp/shell.pid")" 2>/dev/null || true; sleep 2
[ -f "$out/finished" ] || { echo "scene '$scene' did not finish (see $out/shell.log); last lines:" >&2; tail -25 "$out/shell.log" >&2; exit 1; }
rm -f "$out/finished"
grep "SHOT " "$out/shell.log" | sed 's/^.*SHOT /SHOT /' || true
