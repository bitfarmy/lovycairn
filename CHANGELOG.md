# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-10-20

First public release.

### Added
- Project launchers on the desktop with live git status (branch, uncommitted changes, commits ahead, age of the last commit).
- Groups: real folders in the Desktop folder, nestable, with colors and shapes; panel, drag and drop, “Move to…”, ungroup.
- “Go to project”: one click opens the terminal in the project folder and the chosen docs in the browser in an empty
  workspace, or switches to the project's windows if it is already open; per-project switch and explicit menu entries.
- Git monitor card (changed files, recent commits) that refreshes by itself.
- Quick picker (`Super+J`) and note shortcuts (`Super+Shift+N`, `Super+Ctrl+N`).
- Colors (12) and shapes (4 solid, 5 outline) for projects; 4 solid and 3 outline shapes for groups.
- LovyCairn Notes: Markdown sticky notes with checklists, tags, project sections, archive with search, trash; collapsed
  notes shown as sticky icons on the desktop.
- Self-check of the GNOME Shell internals LovyCairn relies on, with one notification per GNOME version that explains how
  to fix it; `lovycairn-doctor` (check, `--report`, `--watch`).
- `lovycairn-add`, a Files (Nautilus) script and “Add project…” in the desktop menu.
- Preferences window: terminal, browser, notes command and folder, shortcuts.
- English and Italian translations (extension and notes app).
- `scripts/install.sh` / `scripts/uninstall.sh` (no root); packaging for extensions.gnome.org.
- Headless test harness (isolated GNOME Shell) and CI, run on GNOME Shell 50 (Fedora 44) and 51 (Fedora Rawhide).
- Runtime guard: a feature that throws is switched off and reported, instead of taking the extension down.
