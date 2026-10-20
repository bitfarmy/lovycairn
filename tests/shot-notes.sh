#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Screenshots of the notes app (archive and a note window) through Broadway + headless Chrome/Chromium.
#   tests/shot-notes.sh <output-dir>
# Uses a private D-Bus session and the fixture notes; nothing of your real notes is touched.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$(dirname "$here")"
out="${1:-$here/out}"; mkdir -p "$out"; out="$(cd "$out" && pwd)"
browser="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
[ -n "$browser" ] || { echo "no Chrome/Chromium found" >&2; exit 1; }
tmp="$(mktemp -d /tmp/lovycairn-notes-test.XXXXXX)"; home="$tmp/home"
"$here/fixtures.sh" "$home" >/dev/null
port=9; url="http://127.0.0.1:$((8080 + port))/"
cleanup() { kill -TERM -"$(cat "$tmp/pid" 2>/dev/null)" 2>/dev/null || true; kill "$(cat "$tmp/broadway.pid")" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
pkill -x gtk4-broadwayd 2>/dev/null || true; sleep 1
(setsid gtk4-broadwayd ":$port" >/dev/null 2>&1 & echo $! > "$tmp/broadway.pid")
sleep 2

shoot() {  # shoot <name> <app args...>
  local name="$1"; shift
  (cd "$tmp"; setsid dbus-run-session -- env HOME="$home" XDG_CONFIG_HOME="$home/.config" XDG_DATA_HOME="$home/.local/share" \
      GDK_BACKEND=broadway BROADWAY_DISPLAY=":$port" GSETTINGS_BACKEND=memory GTK_A11Y=none LANGUAGE="${LOVYCAIRN_LANG:-en}" \
      LOVYCAIRN_LOCALE_DIR="$tmp/locale" python3 "$root/notes/lovycairn-notes" --notes-dir "$home/Notes" "$@" >"$tmp/app.log" 2>&1 &
    echo $! > "$tmp/pid")
  sleep 5
  "$browser" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size="${SIZE:-760,640}" \
    --virtual-time-budget=6000 --screenshot="$out/$name.png" "$url" >/dev/null 2>&1
  kill -TERM -"$(cat "$tmp/pid")" 2>/dev/null || true; sleep 1
}
for po in "$root"/notes/po/*.po; do   # translations for the app
  [ -f "$po" ] || continue
  lang="$(basename "$po" .po)"; mkdir -p "$tmp/locale/$lang/LC_MESSAGES"; msgfmt -o "$tmp/locale/$lang/LC_MESSAGES/lovycairn-notes.mo" "$po"
done
shoot notes-archive --archive
shoot notes-note --open 20260101-100000.md
echo "screenshots in $out"
