# Native LovyCairn Suite Implementation Plan

**Goal:** ship the approved native companion application, preserve current data,
and install the tested result for this user.

**Architecture:** Python GTK 4/libadwaita app and shared filesystem model;
existing extension handles workspaces through a narrow session D-Bus API.
**Tech Stack:** Python stdlib, PyGObject, GJS, Git, gettext.
**Spec:** `docs/superpowers/specs/2026-11-05-lovycairn-suite-design.md`.

## Global constraints

No browser dependency in the shipped app. Preserve all existing launchers,
groups, notes and commands. Keep LovyCairn Notes as the editor. Do not write
to Git repositories. No forced logout. Ship English source strings and Italian.

## Review focus

- Unknown desktop keys and special characters survive edits and moves.
- Duplicate names and invalid JSON cannot silently overwrite existing files.
- Missing extension/Git/notes commands produce actionable local errors.
- External file changes preserve selection and unsaved form content.
- D-Bus requests accept only managed project launchers and valid modes.

## Task 1 — Shared model, Git and launch services

**Files:** `suite/lovycairn_suite/{__init__,model,services}.py`,
`tests/test_suite_model.py`, `tests/test_suite_services.py`.

Write tests first and observe failure, then implement and run the tests.
Exercise actual temporary desktop trees and Git repositories. Cover the review
focus above, including preservation, collisions, symlinks, special paths,
detached/unborn Git, tagged notes, invalid command templates and corrupt JSON.

Public model contracts used by the app:

- `Project`: launcher (Path), rel, name, path (Path), tag, color, shape,
  docs (tuple), new_workspace (str or None), group (relative folder string).
- `Group`: path (Path), rel, name, label. `Note`: path, title, text, tags, mtime.
- `Store(desktop=None, notes=None, config=None)`: `projects()`, `groups()`,
  `notes()`, `metadata(project)`, `set_metadata(project, **changes)`,
  `save_project(existing=None, *, name, folder, group='', color='', shape='cube',
  docs=(), new_workspace=None)`, `create_group(name, parent='')`,
  `trash_project(project)`. Paths are available as `desktop`, `notes_dir`, `config`.
- Metadata keys: `favorite`, `next_step`, `last_opened`; activity storage format
  is `{absolute_normalized_project_path: unix_timestamp_seconds}`.
- `git_state(path)` returns `GitState(state, branch, files, ahead=0, behind=0)`;
  state is clean/changed/missing/not-repository/error; files contain path/status.
- `make_settings() -> Gio.Settings` with safe source-schema fallback.
- `Launcher(settings, store)` methods `terminal_name()`,
  `open_project(project, mode='auto')` returning extension/direct,
  `open_notes(tag='', name=None, new=False, archive=False)`, `open_folder(path)`,
  `open_editor(project)`, `open_docs(project)`; failures raise descriptive errors.

## Task 2 — Extension bridge and packaging

**Files:** extension JS/schema/preferences, installer/uninstaller/dev scripts,
desktop entry/icon, extension translations, isolated GNOME scene.

Write a failing isolated integration scene first. Export the specified D-Bus
API, validate managed launchers/modes, unregister it on disable. Record successful
terminal opens into activity.json. Honor default-workspace after project override.
Add suite menu entries, preserve custom terminal commands. Add editor-command,
default-workspace and suite-theme settings. Install the Python package, executable,
translations and desktop icon and remove only shipped files on uninstall.
Verify the isolated bridge scene, existing checks and package.

## Task 3 — Native interface

**Files:** `suite/lovycairn`, `suite/lovycairn_suite/{app,views}.py`,
`suite/po/it.po`, GTK isolated test harness and captures.

Implement the approved native shell and all project/list/detail/notes/preferences
flows against Task 1 interfaces. Translate strings, use existing logo and native
theme. File monitors debounce changes, Git runs off the UI thread with stale
results discarded. Display real empty/error/loading states. Test observable
flows against temporary data and capture wide/narrow/light/dark native windows.

## Task 4 — Integrate, review, install

Run all unit and integration checks, schema/translation checks, package and
isolated GNOME smoke/bridge scenes. Request independent review of data integrity,
commands, D-Bus and UX. Fix material findings with regression coverage. Update
README/architecture/changelog, commit the finished branch, back up current install
and settings, install and open the real app, verify the user's project/note counts
and LovyTerm preference. Do not force session logout; report if required for new
extension code.

## Execution record

- User approved specification with “vai”. Work in current checkout on dedicated
  branch `feat/native-suite`; no external worktree created.
- Baseline: `scripts/dev.sh check` passed; installed LovyCairn 1.3.0 ACTIVE.
- Split model/services, extension/packaging, and native UI into nonoverlapping
  implementation domains under the parallel-agent skill.
