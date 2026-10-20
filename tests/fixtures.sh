#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 LovyCairn contributors
# Builds a clean demo home for the tests and screenshots: small git repositories, project launchers, two groups, a few notes.
# Usage: fixtures.sh <home-dir>      (nothing outside <home-dir> is touched)
set -euo pipefail
home="$1"; here="$(cd "$(dirname "$0")" && pwd)"
add="$here/../bin/lovycairn-add"
rm -rf "$home"; mkdir -p "$home/code" "$home/Desktop" "$home/Notes"
export GIT_AUTHOR_NAME="Demo" GIT_AUTHOR_EMAIL="demo@example.org" GIT_COMMITTER_NAME="Demo" GIT_COMMITTER_EMAIL="demo@example.org"

repo() {  # repo <name> <age of the last commit, e.g. "3 hours"> <commit subject>...
  local d="$home/code/$1" age="$2"; shift 2
  git init -q -b main "$d"
  local i=0 n=$#
  for subject in "$@"; do
    i=$((i + 1)); echo "$subject $i" > "$d/file-$i.txt"
    # commits are spread in time: the last one is `age` old, the earlier ones a few days older
    local when; when="$(date -d "$age ago - $(( (n - i) * 2 )) days" '+%Y-%m-%dT%H:%M:%S')"
    git -C "$d" add -A; GIT_AUTHOR_DATE="$when" GIT_COMMITTER_DATE="$when" git -C "$d" commit -q -m "$subject"
  done
}
repo atlas-api      "2 hours"   "Initial commit" "Add health endpoint" "Paginate list responses" "Fix timezone handling"
repo nebula-web     "5 hours"   "Scaffold app" "Add dashboard" "Polish empty states"
repo dotfiles       "3 days"    "Add shell prompt" "Tune terminal colors"
repo paper-notes    "1 day"     "Outline chapter one" "Add references"
repo rust-playground "20 minutes" "cargo init" "Parser experiment" "Benchmark harness"
repo kernel-lab     "9 days"    "Boot log notes" "Add scheduler trace"
repo sketchbook     "12 days"   "First sketches"
# uncommitted changes, so the status line has something to show
echo "wip" >> "$home/code/atlas-api/file-1.txt"; echo "wip" >> "$home/code/atlas-api/file-2.txt"; echo x > "$home/code/atlas-api/new.py"
echo "wip" >> "$home/code/rust-playground/file-1.txt"

d="$home/Desktop"
$add --desktop "$d" --color '#aa74e2' --shape cube           --docs https://docs.python.org/3/ "$home/code/atlas-api"
$add --desktop "$d" --color '#3a9bec' --shape flag           "$home/code/nebula-web"
$add --desktop "$d" --color '#a0a7a1' --shape folder-code    "$home/code/dotfiles"
$add --desktop "$d" --color '#e4c232' --shape board          "$home/code/paper-notes"
$add --desktop "$d" --color '#f68c26' --shape cube           "$home/code/rust-playground"
$add --desktop "$d" --color '#22c4b5' --shape applications-science "$home/code/kernel-lab"
$add --desktop "$d" --color '#e96ea9' --shape board          "$home/code/sketchbook"

# two groups; the marker file holds color and shape
mkdir -p "$d/work" "$d/side projects"
printf 'color=#3a9bec\nicon=stack\n' > "$d/work/.group"
printf 'color=#e96ea9\nicon=star\n' > "$d/side projects/.group"
mv "$d/project-atlas-api.desktop" "$d/project-nebula-web.desktop" "$d/project-kernel-lab.desktop" "$d/work/"
mv "$d/project-rust-playground.desktop" "$d/project-sketchbook.desktop" "$d/side projects/"

# notes: two collapsed on the desktop, one of them tagged with a project
cat > "$home/Notes/20260101-100000.md" <<'NOTE'
Release checklist

- [x] Changelog
- [ ] Tag the version
#atlas-api
NOTE
cat > "$home/Notes/20260102-090000.md" <<'NOTE'
Ideas for the weekend

Try the new parser on real logs.
NOTE
cat > "$home/Notes/20260103-120000.md" <<'NOTE'
Standup talking points
#nebula-web
NOTE
cat > "$home/Notes/.state.json" <<'JSON'
{"pinned": [], "collapsed": ["20260101-100000.md", "20260102-090000.md"], "sizes": {}, "colors": {"20260101-100000.md": "yellow", "20260102-090000.md": "blue"}}
JSON
echo "fixtures ready in $home"
