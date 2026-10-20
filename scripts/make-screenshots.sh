#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Regenerates the pictures used in the README (docs/img) from clean demo data in an isolated GNOME Shell.
# Needs: gnome-shell, ImageMagick (magick), ffmpeg, Chrome/Chromium for the notes app. Nothing of your session is touched.
set -euo pipefail
cd "$(dirname "$0")/.."
out=tests/out; img=docs/img; mkdir -p "$img"; rm -rf "$out"; mkdir -p "$out"

tests/run-headless.sh hero "$out" >/dev/null
tests/run-headless.sh demo "$out" >/dev/null
tests/run-headless.sh compat "$out" >/dev/null
tests/run-headless.sh frames "$out" >/dev/null
tests/shot-notes.sh "$out" >/dev/null
tests/shot-prefs.sh "$out" >/dev/null
LOVYCAIRN_LANG=it tests/run-headless.sh demo tests/out-it >/dev/null

# full desktop (webp keeps the repository light) and focused crops
magick "$out/hero.png" -quality 88 "$img/hero.webp"
magick "$out/menu.png" -crop 380x640+0+170 +repage -quality 90 "$img/menu.webp"
magick "$out/group.png" -crop 520x230+110+420 +repage -quality 90 "$img/group.webp"
magick "$out/git.png" -crop 340x275+972+247 +repage -quality 90 "$img/git.webp"
magick "$out/picker.png" -gravity center -crop 760x560+0-60 +repage -quality 90 "$img/picker.webp"
magick "$out/compat.png" -crop 560x130+680+30 +repage -quality 90 "$img/compat.webp"
magick "tests/out-it/menu.png" -crop 380x640+0+170 +repage -quality 90 "$img/menu-it.webp"
magick "$out/notes-archive.png" -crop 440x580+10+15 +repage -quality 90 "$img/notes-archive.webp"
magick "$out/prefs.png" -crop 650x660+15+15 +repage -quality 90 "$img/prefs.webp"
magick "$out/notes-note.png" -crop 380x400+10+15 +repage -quality 90 "$img/notes-note.webp"

# animated demo: frames → GIF with an optimized palette
ffmpeg -y -loglevel error -framerate 1.3 -pattern_type glob -i "$out/frame-*.png" \
  -vf "scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 "$img/demo.gif"
ls -la "$img"
