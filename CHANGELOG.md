# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] — 2026-10-21

### Added
- A project that has notes shows a **✎n counter** next to its git state (on the desktop and inside group panels). Notes are matched by the project tag (`#tag`, as in the Notes app) and the counter follows the notes folder live.

## [1.2.0] — 2026-10-21

### Changed
- A click on a project that is not open yet now **asks where to open it** (this workspace or a new one) instead of silently opening a new workspace. The choice can be fixed per project from the right-click menu (“Click on this project…”: asks / new workspace / this workspace), which replaces the old on/off switch. Projects that had the old switch off (`X-LovyCairn-NewWorkspace=false`) keep opening in the current workspace; every other project now asks. Cancelling opens nothing, and no git monitor is left behind.

## [1.1.0] — 2026-10-21

### Added
- 31 more solid shapes for projects and groups, in the same three-shade style: developer and Linux (terminal, git, penguin, chip, bug, database, code, container, gear, server rack, network), Android (robot, phone, keyboard, APK), hacking (skull, padlock, key, eye, hooded hacker), media (download, music, pictures, video, games) and a few general ones (shield, bolt, book, cloud, target, house). Projects now also get the solid folder, stack, grid and star.

### Changed
- The shape choice in the menu is a grid (9 columns) inside a submenu, shared by projects and groups, instead of a long row that made the menu wider.
- The git monitor belongs to the workspace where the project is opened and shows only there (it used to open in the workspace you clicked from and stay visible everywhere).
- “Add project…” opens GNOME's folder chooser (through the desktop portal) instead of asking for a typed path; typing is only the fallback when no portal is available.

### Fixed
- An open group panel was drawn above everything, including dialogs and windows; it now sits on the desktop layer, like the icons.
- Three Italian strings of the failure notice were untranslated.

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
