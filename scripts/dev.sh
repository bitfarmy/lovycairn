#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Developer shortcuts (users only need scripts/install.sh).
#   scripts/dev.sh check   syntax, schema, translations and desktop-file checks
#   scripts/dev.sh pot     refresh the translation templates and merge them into the .po files
#   scripts/dev.sh pack    build dist/lovycairn@bitfarmy.github.io.shell-extension.zip (releases and extensions.gnome.org)
#   scripts/dev.sh test    headless smoke test in an isolated GNOME Shell
set -euo pipefail
cd "$(dirname "$0")/.."
uuid="lovycairn@bitfarmy.github.io"

case "${1:-}" in
  check)
    for f in extension/*.js; do node --input-type=module --check < "$f"; done
    python3 -m py_compile notes/lovycairn-notes; rm -rf notes/__pycache__
    bash -n bin/lovycairn-add; bash -n bin/lovycairn-doctor; bash -n scripts/install.sh; bash -n scripts/uninstall.sh
    bash -n tests/run-headless.sh; bash -n tests/shot-notes.sh; bash -n tests/shot-prefs.sh; bash -n tests/fixtures.sh; bash -n tests/container-setup.sh; bash -n tests/ci-container.sh
    glib-compile-schemas --strict --dry-run extension/schemas
    for f in po/*.po notes/po/*.po; do msgfmt --check -o /dev/null "$f"; done
    desktop-file-validate notes/data/io.github.bitfarmy.LovyCairnNotes.desktop
    python3 -c "import json; json.load(open('extension/metadata.json'))"
    echo "all checks passed" ;;
  pot)
    xgettext --from-code=UTF-8 --language=JavaScript -k_ -kN_ -kngettext:1,2 --package-name=lovycairn \
      --msgid-bugs-address=https://github.com/bitfarmy/lovycairn/issues -o po/lovycairn.pot extension/*.js
    xgettext --from-code=UTF-8 --language=Python -k_ --package-name=lovycairn-notes \
      --msgid-bugs-address=https://github.com/bitfarmy/lovycairn/issues -o notes/po/lovycairn-notes.pot notes/lovycairn-notes
    for f in po/*.po; do msgmerge --update --backup=none --quiet "$f" po/lovycairn.pot; done
    for f in notes/po/*.po; do msgmerge --update --backup=none --quiet "$f" notes/po/lovycairn-notes.pot; done
    echo "templates refreshed" ;;
  pack)
    mkdir -p dist
    extra=(); for f in extension/*.js; do b="$(basename "$f")"; case "$b" in extension.js|prefs.js) ;; *) extra+=(--extra-source="$b") ;; esac; done
    (cd extension && gnome-extensions pack --force --podir=../po --schema=schemas/org.gnome.shell.extensions.lovycairn.gschema.xml \
      "${extra[@]}" --out-dir=../dist .)
    unzip -l "dist/$uuid.shell-extension.zip" | tail -n +4 | head -40 ;;
  test)
    tests/run-headless.sh smoke tests/out ;;
  *) sed -n 4,8p "$0" | sed 's/^# \{0,1\}//' ;;
esac
