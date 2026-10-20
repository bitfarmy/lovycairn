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
├── notes/                     LovyCairn Notes (GTK 4 / libadwaita app) + desktop file and icon
├── bin/                       lovycairn-add, lovycairn-doctor
├── scripts/                   install, uninstall, developer shortcuts, screenshot pipeline
├── nautilus/                  “Add as LovyCairn project” script for Files
├── po/  notes/po/             translations
└── tests/                     headless GNOME Shell harness, fixtures, container run
```

## Data model — nothing hidden

| Thing | Stored as |
|---|---|
| Project | a `.desktop` file in the Desktop folder with `X-LovyCairn-*` keys |
| Group | a folder in the Desktop folder with a `.group` marker file (`color=`, `icon=`) |
| Icon positions | `~/.config/lovycairn/positions.json` |
| Notes | `~/Notes/*.md`, state in `~/Notes/.state.json` (written by the notes app), positions in `.positions.json` / `.icons.json` (written by the extension) |
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
