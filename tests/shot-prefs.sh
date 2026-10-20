#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Screenshot of the preferences window through Broadway + headless Chrome/Chromium.   tests/shot-prefs.sh <output-dir>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$(dirname "$here")"
out="${1:-$here/out}"; mkdir -p "$out"; out="$(cd "$out" && pwd)"
browser="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
[ -n "$browser" ] || { echo "no Chrome/Chromium found" >&2; exit 1; }
tmp="$(mktemp -d /tmp/lovycairn-prefs-test.XXXXXX)"; port=9
cp -r "$root/extension" "$tmp/ext"; glib-compile-schemas "$tmp/ext/schemas"
for po in "$root"/po/*.po; do [ -f "$po" ] || continue; lang="$(basename "$po" .po)"
  mkdir -p "$tmp/ext/locale/$lang/LC_MESSAGES"; msgfmt -o "$tmp/ext/locale/$lang/LC_MESSAGES/lovycairn.mo" "$po"; done
cleanup() { kill -TERM -"$(cat "$tmp/pid" 2>/dev/null)" 2>/dev/null || true; kill "$(cat "$tmp/broadway.pid" 2>/dev/null)" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
pkill -x gtk4-broadwayd 2>/dev/null || true; sleep 1
(setsid gtk4-broadwayd ":$port" >/dev/null 2>&1 & echo $! > "$tmp/broadway.pid"); sleep 2
(cd "$tmp"; setsid dbus-run-session -- env HOME="$tmp/home" GI_TYPELIB_PATH=/usr/lib64/gnome-shell/girepository-1.0 LD_LIBRARY_PATH=/usr/lib64/gnome-shell GDK_BACKEND=broadway BROADWAY_DISPLAY=":$port" GSETTINGS_BACKEND=memory \
   GTK_A11Y=none LANGUAGE="${LOVYCAIRN_LANG:-en}" gjs -m "$here/prefs-harness.js" "$tmp/ext" >"$tmp/app.log" 2>&1 & echo $! > "$tmp/pid")
sleep 9
"$browser" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=700,700 --virtual-time-budget=8000 \
  --screenshot="$out/prefs.png" "http://127.0.0.1:$((8080 + port))/" >/dev/null 2>&1
grep -iE "error|exception|SyntaxError" "$tmp/app.log" | head -5 || true
echo "screenshot: $out/prefs.png"
