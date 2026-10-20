// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

// Notes on the desktop: remembers where each note window was and draws collapsed notes as small colored
// sticky icons on the desktop layer. The notes themselves are edited by the LovyCairn Notes app, which writes
// its state (.state.json) next to the notes; this module only reads it.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {readJson, writeJson} from './util.js';

export const NOTES_APP_ID = 'io.github.bitfarmy.LovyCairnNotes';
const STEM_RE = / · (\S+)$/;   // a note window title ends with " · <file-name>"
const ICON_W = 104;
const ICON_H = 84;
const DRAG_THRESHOLD = 6;
const COLORS = {
    yellow: '#f6d32d', orange: '#ff7800', pink: '#e879a8', green: '#33d17a', blue: '#62a0ea', lilac: '#c061cb', gray: '#9a9996',
};

function noteTitle(dir, name) {
    try {
        const [ok, bytes] = GLib.file_get_contents(GLib.build_filenamev([dir, name]));
        if (!ok)
            return null;
        for (const raw of new TextDecoder().decode(bytes).split('\n')) {
            const line = raw.replace(/^\s*(#+\s+|- \[[ xX]\]\s*|-\s+)/, '').trim();
            if (line)
                return line.length > 48 ? `${line.slice(0, 47)}…` : line;
        }
        return _('Empty note');
    } catch (e) {
        return null;   // the file is gone: the icon must go too
    }
}

export class Notes {
    constructor(ext, settings) {
        this._ext = ext;
        this._settings = settings;
    }

    get _dir() {
        return this._settings.get_string('notes-dir') || GLib.build_filenamev([GLib.get_home_dir(), 'Notes']);
    }

    enable() {
        const dir = this._dir;
        this._stateFile = GLib.build_filenamev([dir, '.state.json']);      // written by the app
        this._posFile = GLib.build_filenamev([dir, '.positions.json']);    // note windows: written by us
        this._iconFile = GLib.build_filenamev([dir, '.icons.json']);       // desktop icons: written by us
        this._tracked = new Set();   // windows we are connected to
        this._notes = new Map();     // note windows -> file name without .md
        this._timers = new Set();
        this._saveId = 0;
        this._pos = readJson(this._posFile);
        this._ipos = readJson(this._iconFile);
        this._icons = new Map();     // name.md -> actor
        this._drag = null;
        this._syncPending = false;
        this._syncTimer = 0;

        global.display.connectObject('window-created', (_d, win) => this._track(win), this);
        for (const actor of global.get_window_actors())
            this._track(actor.meta_window);
        this._watch();
        this._sync();
    }

    disable() {
        global.display.disconnectObject(this);
        for (const win of this._tracked ?? [])
            win.disconnectObject(this);
        for (const id of this._timers ?? [])
            GLib.source_remove(id);
        this._monitor?.cancel();
        this._drag?.grab?.dismiss();
        for (const icon of this._icons?.values() ?? [])
            icon.destroy();
        this._tracked = this._notes = this._timers = this._pos = this._ipos = null;
        this._icons = this._drag = this._monitor = null;
    }

    // ---- note windows: position remembered --------------------------------------------

    _isNote(win) {
        return win.get_wm_class() === NOTES_APP_ID || win.get_gtk_application_id() === NOTES_APP_ID;
    }

    _track(win) {
        if (this._tracked.has(win))
            return;
        this._tracked.add(win);
        win.connectObject(
            'notify::wm-class', () => this._check(win),
            'notify::gtk-application-id', () => this._check(win),
            'notify::title', () => this._check(win),
            'position-changed', () => this._queueSave(win),
            'unmanaged', () => this._forget(win),
            this);
        this._check(win);
    }

    _check(win) {
        if (!this._isNote(win))
            return;
        const stem = STEM_RE.exec(win.get_title() ?? '')?.[1];
        if (!stem)
            return;
        const first = !this._notes.has(win);
        this._notes.set(win, stem);
        if (first)
            this._restorePosition(win, stem);
    }

    _forget(win) {
        this._tracked.delete(win);
        this._notes.delete(win);
    }

    _restorePosition(win, stem) {
        const p = this._pos[stem];
        if (!p)
            return;
        const move = () => {
            try {
                win.move_frame(true, p[0], p[1]);
            } catch (e) {
                console.error(`lovycairn: moving a note failed: ${e}`);
            }
        };
        move();
        this._later(150, move);   // again after the first appearance, when the placement is decided
    }

    _later(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers?.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timers.add(id);
    }

    _queueSave(win) {
        if (!this._notes.has(win) || this._saveId)
            return;
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            this._timers?.delete(this._saveId);
            this._saveId = 0;
            for (const [w, stem] of this._notes) {
                const r = w.get_frame_rect();
                this._pos[stem] = [r.x, r.y];
            }
            writeJson(this._posFile, this._pos);
            return GLib.SOURCE_REMOVE;
        });
        this._timers.add(this._saveId);
    }

    // ---- collapsed notes: icons on the desktop layer -----------------------------------

    _watch() {
        try {
            GLib.mkdir_with_parents(this._dir, 0o755);
            this._monitor = Gio.File.new_for_path(this._dir).monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', () => {
                if (this._syncTimer)
                    return;
                this._syncTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                    this._timers?.delete(this._syncTimer);
                    this._syncTimer = 0;
                    this._sync();
                    return GLib.SOURCE_REMOVE;
                });
                this._timers.add(this._syncTimer);
            });
        } catch (e) {
            console.error(`lovycairn: cannot watch ${this._dir}: ${e}`);
        }
    }

    // Aligns the icons with .state.json: create, update or remove.
    _sync() {
        if (this._drag) {
            this._syncPending = true;
            return;
        }
        const state = readJson(this._stateFile);
        const wanted = new Map();
        for (const name of state.collapsed ?? []) {
            const title = noteTitle(this._dir, name);
            if (title !== null)
                wanted.set(name, {title, color: COLORS[state.colors?.[name]] ?? COLORS.yellow});
        }

        for (const [name, icon] of this._icons) {
            if (!wanted.has(name)) {
                icon.destroy();
                this._icons.delete(name);
            }
        }
        let index = 0;
        for (const [name, {title, color}] of wanted) {
            let icon = this._icons.get(name);
            if (!icon) {
                icon = this._makeIcon(name);
                this._icons.set(name, icon);
                Main.layoutManager._backgroundGroup.add_child(icon);
                const p = this._ipos[name] ?? this._defaultPosition(index);
                icon.set_position(...this._clamp(p[0], p[1]));
            }
            icon.set_style(`background-color: ${color}; border-radius: 10px; padding: 8px 10px; ` +
                `width: ${ICON_W - 20}px; height: ${ICON_H - 16}px; ` +
                'box-shadow: 0 3px 9px rgba(0,0,0,0.45);');
            icon._label.set_text(title);
            index++;
        }
    }

    _defaultPosition(index) {
        const top = Main.panel.height + 24;
        const rows = Math.max(1, Math.floor((global.stage.height - top - 80) / (ICON_H + 16)));
        const col = Math.floor(index / rows);
        return [global.stage.width - ICON_W - 24 - col * (ICON_W + 16), top + (index % rows) * (ICON_H + 16)];
    }

    _clamp(x, y) {
        const top = Main.panel.height;
        return [
            Math.min(Math.max(0, x), Math.max(0, global.stage.width - ICON_W)),
            Math.min(Math.max(top, y), Math.max(top, global.stage.height - ICON_H)),
        ];
    }

    _makeIcon(name) {
        const icon = new St.BoxLayout({reactive: true, track_hover: true, clip_to_allocation: true, orientation: Clutter.Orientation.VERTICAL});
        icon._label = new St.Label({style: 'color: #241f31; font-size: 11px; font-weight: bold;'});
        icon._label.clutter_text.set_line_wrap(true);
        icon._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        icon.add_child(icon._label);
        icon.connect('button-press-event', (_a, ev) => this._onPress(icon, name, ev));
        icon.connect('motion-event', (_a, ev) => this._onMotion(icon, ev));
        icon.connect('button-release-event', (_a, ev) => this._onRelease(icon, name, ev));
        return icon;
    }

    // Click: expands the note. Drag: moves the icon. Right click: sends the note back to the archive.
    _onPress(icon, name, event) {
        const button = event.get_button();
        if (button === 3) {
            this._ext._notesRun(['--uncollapse', name]);
            return Clutter.EVENT_STOP;
        }
        if (button !== 1)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._drag = {icon, x, y, ix: icon.x, iy: icon.y, moved: false, grab: global.stage.grab(icon)};
        return Clutter.EVENT_STOP;
    }

    _onMotion(icon, event) {
        const d = this._drag;
        if (!d || d.icon !== icon)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (!d.moved && Math.hypot(x - d.x, y - d.y) < DRAG_THRESHOLD)
            return Clutter.EVENT_STOP;
        d.moved = true;
        icon.set_position(...this._clamp(d.ix + x - d.x, d.iy + y - d.y));
        return Clutter.EVENT_STOP;
    }

    _onRelease(icon, name, event) {
        const d = this._drag;
        if (!d || d.icon !== icon || event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        d.grab.dismiss();
        this._drag = null;
        if (d.moved) {
            this._ipos[name] = [Math.round(icon.x), Math.round(icon.y)];
            writeJson(this._iconFile, this._ipos);
        } else {
            this._ext._notesRun(['--open', name]);
        }
        if (this._syncPending) {
            this._syncPending = false;
            this._sync();
        }
        return Clutter.EVENT_STOP;
    }
}
