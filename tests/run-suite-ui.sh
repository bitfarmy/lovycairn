#!/usr/bin/env bash
# Native GTK behavior tests with private HOME, settings, D-Bus and Broadway.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d /tmp/lovycairn-suite-ui.XXXXXX)"
display="$(python3 - <<'PY'
import socket
for number in range(31, 90):
    with socket.socket() as sock:
        try: sock.bind(('127.0.0.1',8080+number))
        except OSError: continue
        print(number); break
else: raise SystemExit('No Broadway port available')
PY
)"
browser_pid=''
cleanup() {
  if [ -n "$browser_pid" ]; then kill -TERM -- "-$browser_pid" 2>/dev/null || true; wait "$browser_pid" 2>/dev/null || true; fi
  kill "$broadway_pid" 2>/dev/null || true
  for _ in $(seq 1 20); do rm -rf "$tmp" 2>/dev/null && break; sleep .1; done
}
mkdir -p "$tmp/home" "$tmp/config" "$tmp/data" "$tmp/cache" "$tmp/runtime"
chmod 700 "$tmp/runtime"
env XDG_RUNTIME_DIR="$tmp/runtime" gtk4-broadwayd ":$display" >"$tmp/broadway.log" 2>&1 &
broadway_pid=$!
trap cleanup EXIT
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$((8080+display))/" >/dev/null; then break; fi
  sleep .1
done
layout=0
browser="$(command -v google-chrome || command -v chromium || true)"
if [ -n "$browser" ]; then
  setsid "$browser" --headless=new --no-sandbox --disable-gpu --no-first-run --disable-background-networking \
    --user-data-dir="$tmp/browser" --window-size=1440,1000 \
    "http://127.0.0.1:$((8080+display))/" >"$tmp/browser.log" 2>&1 &
  browser_pid=$!
  layout=1
  sleep 1
fi
dbus-run-session -- env HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/config" XDG_DATA_HOME="$tmp/data" \
  XDG_CACHE_HOME="$tmp/cache" XDG_RUNTIME_DIR="$tmp/runtime" GSETTINGS_BACKEND=memory \
  GDK_BACKEND=broadway BROADWAY_DISPLAY=":$display" GTK_A11Y=none LANGUAGE=en \
  LOVYCAIRN_LAYOUT_TEST="$layout" PYTHONWARNINGS="ignore::DeprecationWarning:gi.events" \
  GIO_USE_VFS=local PYTHONPATH="$root/suite" python3 -m unittest discover -s "$root/tests" -p 'test_*ui.py' -v
