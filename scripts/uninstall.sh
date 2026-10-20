#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Removes LovyCairn from your home folder. Your projects' folders, your notes and the project launchers on the desktop
# are NOT deleted. Add --purge to also remove LovyCairn's own settings (positions of the icons).
set -euo pipefail
uuid="lovycairn@bitfarmy.github.io"
data="${XDG_DATA_HOME:-$HOME/.local/share}"; bin="$HOME/.local/bin"
gnome-extensions disable "$uuid" 2>/dev/null || true
python3 - "$uuid" <<'PY' || true
import ast, subprocess, sys
uuid = sys.argv[1]
out = subprocess.run(['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions'], capture_output=True, text=True).stdout.strip()
current = ast.literal_eval(out.replace('@as ', '')) if out else []
if uuid in current:
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str([u for u in current if u != uuid])], check=True)
PY
rm -rf "$data/gnome-shell/extensions/$uuid"
rm -f "$bin/lovycairn-add" "$bin/lovycairn-doctor" "$bin/lovycairn-notes"
rm -f "$data/nautilus/scripts/Add as LovyCairn project"
rm -f "$data/applications/io.github.bitfarmy.LovyCairnNotes.desktop" "$data/icons/hicolor/scalable/apps/io.github.bitfarmy.LovyCairnNotes.svg"
rm -f "$data"/locale/*/LC_MESSAGES/lovycairn-notes.mo
rm -f "$HOME/.config/autostart/lovycairn-doctor.desktop"
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/lovycairn" "${XDG_CACHE_HOME:-$HOME/.cache}/lovycairn"
if [ "${1:-}" = "--purge" ]; then rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/lovycairn"; fi
echo "LovyCairn removed. Log out and in to unload it from the running session."
echo "Your notes (~/Notes) and the project launchers on the desktop were left untouched."
