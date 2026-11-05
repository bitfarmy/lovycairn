# How LovyCairn fits together

```
lovycairn/
├── extension/                 the GNOME Shell extension (lovycairn@bitfarmy.github.io)
│   ├── extension.js           desktop layer: icons, git status, “go to project”, menus, shortcuts
│   ├── groups.js              groups (folders), panel, drag & drop, dialogs, appearance menu, quick picker
│   ├── icons.js               solid SVG shapes drawn from three shades of a color
│   ├── notes.js               collapsed notes as desktop stickies, remembers note window positions
│   ├── compat.js              probes of GNOME Shell internals + the one-per-version notification
│   ├── system.js              finds the terminal, browser and notes app; spawns processes
│   ├── palette.js             every color and the font used by the widgets
│   ├── util.js                tiny helpers (printf, JSON files)
│   ├── prefs.js               preferences window
│   └── schemas/               GSettings schema
├── suite/                     native GTK 4/libadwaita app, shared model/services, launcher, data and translations
├── notes/                     LovyCairn Notes (GTK 4 / libadwaita app) + desktop file and icon
├── bin/                       lovycairn-add, lovycairn-doctor
├── scripts/                   install, uninstall, developer shortcuts, screenshot pipeline
├── nautilus/                  “Add as LovyCairn project” script for Files
├── po/  notes/po/  suite/po/             translations
└── tests/                     headless GNOME Shell harness, fixtures, container run
```

## Data model — nothing hidden

| Thing | Stored as |
|---|---|
| Project | a `.desktop` file in the Desktop folder with `X-LovyCairn-*` keys |
| Group | a folder in the Desktop folder with a `.group` marker file (`color=`, `icon=`) |
| Icon positions | `~/.config/lovycairn/positions.json` |
| Notes | `~/Notes/*.md`, state in `~/Notes/.state.json` (written by the notes app), positions in `.positions.json` / `.icons.json` (written by the extension) |
| Favorites / next step | `$XDG_CONFIG_HOME/lovycairn/suite.json`, keyed by normalized absolute project folder |
| Successful project opens / resumes | `$XDG_CONFIG_HOME/lovycairn/activity.json`, `{absolute_project_path: unix_seconds}` |
| Preferences | GSettings `org.gnome.shell.extensions.lovycairn` |

The extension watches the Desktop folder (`Gio.FileMonitor`) and redraws when it changes, so anything that edits those
files — Files, a script, `lovycairn-add` — shows up immediately.

## Where it touches GNOME Shell internals

These are the parts GNOME does not promise to keep, and what happens if they change (`compat.js` probes each one at start):

| Probe | Internal part | If missing, this turns off |
|---|---|---|
| `desktop-layer` | `Main.layoutManager._backgroundGroup`, `findMonitorForActor`, `getWorkAreaForMonitor` | The icons on the desktop |
| `background-menu` | `layoutManager._bgManagers[].backgroundActor._backgroundMenu` | “New group…” / “Add project…” in the desktop menu |
| `app-menu` | `AppMenu.prototype.setApp` (patched, restored on disable) | “Add to Desktop” in the app menu |
| `keybindings` | `Main.wm.addKeybinding` / `removeKeybinding` | Keyboard shortcuts |
| `menus` | `PopupMenu` classes, `St.ScrollView` | Project menus |
| `workspaces` | `Main.activateWindow`, `workspace_manager.append_new_workspace` | Opening projects in workspaces |

The notification text and the list of probes are in `extension/compat.js`; add a probe there whenever new code relies on
another internal part.

## Testing

`tests/run-headless.sh <scene>` copies the extension into a private data dir and runs `gnome-shell --headless --wayland`
under `dbus-run-session` with a throw-away HOME, so scenes can click, open menus and take screenshots without touching
your session. `tests/ci-container.sh` does the same inside a clean Fedora container (what the CI runs).

## Native suite and shared storage

`suite/lovycairn` loads `lovycairn_suite` beside itself in a source checkout or from `$XDG_DATA_HOME/lovycairn` after installation. `app.py` and `views.py` implement the native interface; `model.py` owns project/group discovery, desktop-file edits, notes and metadata; `services.py` owns command construction, read-only Git inspection and launch integration. The installer places the executable in `~/.local/bin`, a desktop entry and icon under XDG data, and gettext domain `lovycairn-suite` under its locale tree.

The suite and extension share GSettings schema `org.gnome.shell.extensions.lovycairn`. Added string keys are `editor-command` (empty), `default-workspace` (`ask`, `new`, `here`; default `ask`) and `suite-theme` (`system`, `light`, `dark`; default `system`). Project `X-LovyCairn-NewWorkspace` values take precedence over the global choice. Commands are parsed into argument vectors without implicit shell evaluation; existing terminal/browser/notes templates remain editable.

Desktop files preserve unknown and localized keys. Launcher edits never modify source repositories. Removing a launcher uses the trash; groups and project folders are retained. Notes are read from the configured notes folder and opened in LovyCairn Notes, which remains responsible for editing, note state and trash. `suite.json` stores `favorite` and `next_step` by project folder; `activity.json` stores successful terminal spawns and activation of existing project windows. Writes reread existing JSON, replace atomically and preserve malformed data with an error. Reconnecting a project folder transfers its metadata; moving a launcher between groups keeps its folder identity.

File monitors debounce external updates. GTK Git work runs in an executor with timeouts in the service, and stale results are discarded when selection changes. User search, selection and open form content survive external refreshes.

## Session D-Bus bridge

The enabled extension exports bus name `org.gnome.Shell`, object path `/io/github/bitfarmy/LovyCairn`, interface `io.github.bitfarmy.LovyCairn`:

```text
OpenProject(launcher: s, mode: s) -> accepted: b
```

`launcher` must match a relative launcher returned by managed group discovery and have an absolute `X-LovyCairn-Path`. Absolute launcher arguments, traversal and unrecognized entries are rejected. `mode` accepts only `auto`, `new` or `here`. The bridge delegates to the existing window/workspace logic; `accepted` means that the request is valid, and an interactive workspace dialog can still be cancelled. Disabling the extension unexports the object. When the bridge is absent, the suite launches directly in the current workspace and reports that limitation; it records activity only after successful terminal spawn.

Run `scripts/dev.sh check` for model/services and static validation, `tests/run-suite-ui.sh` for private GTK/Broadway behavior tests, and `tests/run-headless.sh bridge tests/out-bridge` for managed requests, invalid modes/launchers, history preservation, failed spawns, workspace precedence and service teardown. All use temporary data; no real install is required.
