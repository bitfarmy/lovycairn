#!/usr/bin/env bash
# Start an isolated native suite with demonstration data for screenshot review.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/tests/out-native-suite}"
mkdir -p "$out"; out="$(cd "$out" && pwd)"
tmp="$(mktemp -d /tmp/lovycairn-suite-preview.XXXXXX)"
mkdir -p "$tmp/home" "$tmp/config" "$tmp/data/locale/it/LC_MESSAGES" "$tmp/cache" "$tmp/runtime"
chmod 700 "$tmp/runtime"
cat > "$tmp/config/user-dirs.dirs" <<EOF
XDG_DESKTOP_DIR="$tmp/home/Desktop"
EOF
msgfmt -o "$tmp/data/locale/it/LC_MESSAGES/lovycairn-suite.mo" "$root/suite/po/it.po"
display="$(python3 - <<'PY'
import socket
for i in range(60,100):
 with socket.socket() as s:
  try: s.bind(('127.0.0.1',8080+i))
  except OSError: continue
  print(i);break
else: raise SystemExit('No free Broadway display')
PY
)"
env XDG_RUNTIME_DIR="$tmp/runtime" gtk4-broadwayd ":$display" >"$out/broadway.log" 2>&1 &
broadway_pid=$!
cleanup(){ kill "$broadway_pid" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$((8080+display))/" >/dev/null; then break; fi
  sleep .1
done
echo "http://localhost:$((8080+display))/" > "$out/url"
echo '{"view":"projects","width":1180,"height":820}' > "$out/control.json"
echo "Native suite preview: http://localhost:$((8080+display))/"
dbus-run-session -- env HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/config" XDG_DATA_HOME="$tmp/data" \
 XDG_CACHE_HOME="$tmp/cache" XDG_RUNTIME_DIR="$tmp/runtime" GSETTINGS_BACKEND=memory \
 GDK_BACKEND=broadway BROADWAY_DISPLAY=":$display" GTK_A11Y=none GIO_USE_VFS=local \
 LANGUAGE=it SUITE_PROOF_DIR="$out" PYTHONPATH="$root/suite" \
 PYTHONWARNINGS="ignore::DeprecationWarning:gi.events" python3 "$root/tests/preview-suite.py" > "$out/app.log" 2>&1
