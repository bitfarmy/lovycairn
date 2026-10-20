#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Inside a bare container GNOME Shell needs a system D-Bus with a (mock) logind. This starts both.
# Used by tests/ci-container.sh and the GitHub workflows; needs the python3-dbusmock and dbus-daemon packages.
set -euo pipefail
listnames() { dbus-send --system --dest=org.freedesktop.DBus --type=method_call --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null; }
if listnames | grep -q login1; then echo "system bus and logind mock already running"; exit 0; fi
mkdir -p /run/dbus
[ -s /etc/machine-id ] || dbus-uuidgen > /etc/machine-id
dbus-daemon --system --fork --nopidfile
python3 -m dbusmock --system --template logind >/tmp/logind-mock.log 2>&1 &
sleep 3
echo "system bus and logind mock ready"
