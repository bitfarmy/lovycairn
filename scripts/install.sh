#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Installs LovyCairn for the current user. No root, nothing outside your home folder.
#   scripts/install.sh [--no-notes] [--no-autostart]
#     --no-notes       do not install the notes app (the extension then hides the note entries)
#     --no-autostart   do not install the quiet update watcher (lovycairn-doctor --watch at login)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
uuid="lovycairn@bitfarmy.github.io"
notes=1; autostart=1
for a in "$@"; do
  case "$a" in
    --no-notes) notes=0 ;;
    --no-autostart) autostart=0 ;;
    -h|--help) sed -n 4,7p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

data="${XDG_DATA_HOME:-$HOME/.local/share}"; bin="$HOME/.local/bin"
ext="$data/gnome-shell/extensions/$uuid"

command -v gnome-shell >/dev/null || { echo "GNOME Shell was not found: LovyCairn is a GNOME Shell extension." >&2; exit 1; }
shell_major="$(gnome-shell --version | grep -oE '[0-9]+' | head -1)"
supported="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["shell-version"]))' "$root/extension/metadata.json")"
case " $supported " in *" $shell_major "*) ;; *)
  echo "Warning: this release is marked for GNOME $supported, you run GNOME $shell_major."
  echo "         GNOME will not load it until a release marked for $shell_major exists: https://github.com/bitfarmy/lovycairn/releases" ;;
esac

echo "→ extension: $ext"
rm -rf "$ext"; mkdir -p "$ext"
cp -r "$root/extension/." "$ext/"
glib-compile-schemas "$ext/schemas"
for po in "$root"/po/*.po; do
  [ -f "$po" ] || continue
  lang="$(basename "$po" .po)"; mkdir -p "$ext/locale/$lang/LC_MESSAGES"
  msgfmt -o "$ext/locale/$lang/LC_MESSAGES/lovycairn.mo" "$po"
done

mkdir -p "$bin"
echo "→ commands: $bin/lovycairn-add, $bin/lovycairn-doctor"
install -m 0755 "$root/bin/lovycairn-add" "$root/bin/lovycairn-doctor" "$bin/"

if [ -d "$data/nautilus" ] || command -v nautilus >/dev/null; then
  mkdir -p "$data/nautilus/scripts"
  install -m 0755 "$root/nautilus/add-as-lovycairn-project" "$data/nautilus/scripts/Add as LovyCairn project"
  echo "→ Files: right-click a folder → Scripts → “Add as LovyCairn project”"
fi

if [ "$notes" = 1 ]; then
  echo "→ notes app: $bin/lovycairn-notes"
  install -m 0755 "$root/notes/lovycairn-notes" "$bin/"
  mkdir -p "$data/applications" "$data/icons/hicolor/scalable/apps"
  install -m 0644 "$root/notes/data/io.github.bitfarmy.LovyCairnNotes.desktop" "$data/applications/"
  install -m 0644 "$root/notes/data/io.github.bitfarmy.LovyCairnNotes.svg" "$data/icons/hicolor/scalable/apps/"
  for po in "$root"/notes/po/*.po; do
    [ -f "$po" ] || continue
    lang="$(basename "$po" .po)"; mkdir -p "$data/locale/$lang/LC_MESSAGES"
    msgfmt -o "$data/locale/$lang/LC_MESSAGES/lovycairn-notes.mo" "$po"
  done
  update-desktop-database "$data/applications" 2>/dev/null || true
  gtk-update-icon-cache -q "$data/icons/hicolor" 2>/dev/null || true
fi

if [ "$autostart" = 1 ]; then
  mkdir -p "$HOME/.config/autostart"
  cat > "$HOME/.config/autostart/lovycairn-doctor.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=LovyCairn update watcher
Comment=Warns once if GNOME changed to a version LovyCairn is not marked for
Exec=$bin/lovycairn-doctor --watch
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
DESK
  echo "→ update watcher: ~/.config/autostart/lovycairn-doctor.desktop (silent; one notice if GNOME changes version)"
fi

case ":$PATH:" in *":$bin:"*) ;; *) echo "Note: $bin is not in your PATH; add it to use lovycairn-add and lovycairn-notes from a terminal." ;; esac

# GNOME only knows an extension after the next login, so `gnome-extensions enable` may refuse it: make sure it is in the list
gnome-extensions enable "$uuid" 2>/dev/null || true
python3 - "$uuid" <<'PY' && echo "→ enabled for the next login"
import ast, subprocess, sys
uuid = sys.argv[1]
out = subprocess.run(['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions'], capture_output=True, text=True).stdout.strip()
current = ast.literal_eval(out.replace('@as ', '')) if out else []
if uuid not in current:
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str(current + [uuid])], check=True)
PY
echo
echo "Done. GNOME loads new extensions at login: log out and back in, then run:  lovycairn-doctor"
echo "Add your first project:  lovycairn-add ~/code/my-project     (or right-click the desktop → Add project…)"
