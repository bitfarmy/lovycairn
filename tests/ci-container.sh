#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Runs the whole check inside a clean Fedora container: the same steps GitHub Actions runs.
#   tests/ci-container.sh [fedora-tag]        e.g. 44 (default) or rawhide
# Needs podman (or docker). With "rawhide" the shell may be newer than the version in metadata.json: the
# extension version check is then switched off for the smoke test so it shows what would break.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$(dirname "$here")"
tag="${1:-44}"; engine="$(command -v podman || command -v docker)"
"$engine" run --rm -v "$root:/src:ro,z" "registry.fedoraproject.org/fedora:$tag" bash -c '
set -euo pipefail
dnf -y -q install --setopt=install_weak_deps=False gnome-shell mutter gjs glib2 gettext desktop-file-utils git dbus-daemon \
    dbus-x11 nodejs python3 python3-gobject python3-pillow python3-dbusmock unzip zip xdg-user-dirs gtk4 libadwaita >/dev/null
cp -r /src /work && cd /work
gnome-shell --version
scripts/dev.sh check
scripts/dev.sh pack >/dev/null
test -f "dist/lovycairn@bitfarmy.github.io.shell-extension.zip"
tests/container-setup.sh
if [ "'"$tag"'" = rawhide ]; then export LOVYCAIRN_SKIP_VERSION_CHECK=1; fi
mkdir -p /tmp/out && tests/run-headless.sh smoke /tmp/out >/tmp/smoke.txt 2>&1 || { cat /tmp/smoke.txt; exit 1; }
grep -q "extension state=1" /tmp/out/shell.log
grep -q "failedChecks=none" /tmp/out/shell.log
grep -q "icons=4" /tmp/out/shell.log
grep "SHOT " /tmp/out/shell.log | sed "s/^.*SHOT /SHOT /"
tests/run-headless.sh compat /tmp/out >/dev/null 2>&1 || true
grep -q "failedChecks=background-menu" /tmp/out/shell.log && echo "SHOT compat notice path ok"
'
