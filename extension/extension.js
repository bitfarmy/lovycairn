// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppMenuModule from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Groups, isGroup, countApps, groupColor, groupIcon, applyGroupIcon, applyIcon} from './groups.js';
import {Compat} from './compat.js';
import {Notes} from './notes.js';
import {P} from './palette.js';
import * as System from './system.js';
import {configPath, fmt, readJson, writeJson} from './util.js';

const HOME = GLib.get_home_dir();
const DESKTOP_DIR = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) ??
    GLib.build_filenamev([HOME, 'Desktop']);
const POS_FILE = configPath('positions.json');

const MON_W = 300;
const ICON_W = 96;
const ICON_H = 112;
const ICON_SIZE = 48;
const GAP = 12;
const DRAG_THRESHOLD = 6;

export default class LovyCairn extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._compat = new Compat(this, this._settings);
        this._compat.run();
        this._pos = readJson(POS_FILE);
        this._mons = new Map();    // .desktop file name -> {actor, timer}: open git monitors
        this._icons = new Map();   // .desktop file name -> actor
        this._drag = null;
        this._syncPending = false;
        this._syncTimer = 0;
        this._timers = new Set();
        this._groups = new Groups(this, DESKTOP_DIR);
        this._environments = new Map();   // project path -> windows opened from here

        this._guardMethods();
        this._safe('desktop-layer', () => {
            this._monitor = Gio.File.new_for_path(DESKTOP_DIR).monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', () => this._queueSync());
            this._sync();
        });
        this._safe('background-menu', () => this._groups.hookBackground());
        this._safe('app-menu', () => this._patchAppMenu());
        this._startNotes();
        this._keys = [];
        this._safe('keybindings', () => {
            const actions = {
                'quick-note': () => this._newNote(null),
                'project-note': () => this._projectNote(),
                'picker': () => this._groups.openPicker(),
            };
            for (const k of Object.keys(actions)) {
                // the returned action is Meta.KeyBindingAction.NONE (0) if the accelerator was not accepted
                const action = Main.wm.addKeybinding(k, this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, actions[k]);
                if (action)
                    this._keys.push(k);
                else
                    console.warn(`lovycairn: shortcut ${k} was rejected`);
            }
        });
        this._raiseTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._safe('desktop-layer', () => this._raiseIcons());
            this._safe('background-menu', () => this._groups?.hookBackground());   // GNOME recreates the background menu: hook the entry again
            return GLib.SOURCE_CONTINUE;
        });
        this._gitTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            for (const icon of this._icons.values())
                this._refreshGit(icon);
            return GLib.SOURCE_CONTINUE;
        });
        this._settingsId = this._settings.connect('changed::notes-integration', () => this._startNotes());
    }

    disable() {
        for (const k of this._keys ?? [])
            Main.wm.removeKeybinding(k);
        this._keys = [];
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        this._notes?.disable();
        this._notes = null;
        this._groups?.destroy();
        this._groups = null;
        this._unpatchAppMenu();
        if (this._gitTimer)
            GLib.source_remove(this._gitTimer);
        this._gitTimer = 0;
        if (this._raiseTimer)
            GLib.source_remove(this._raiseTimer);
        this._raiseTimer = 0;
        if (this._syncTimer)
            GLib.source_remove(this._syncTimer);
        this._syncTimer = 0;
        for (const id of this._timers ?? [])
            GLib.source_remove(id);
        this._timers = null;
        for (const set of this._environments?.values() ?? []) {
            for (const win of set)
                win.disconnectObject(this);
        }
        this._environments = null;
        global.display.disconnectObject(this);
        this._monitor?.cancel();
        this._drag?.grab?.dismiss();
        this._menu?.destroy();
        this._menu = null;
        for (const name of [...this._mons?.keys() ?? []])
            this._closeMonitor(name);
        for (const icon of this._icons?.values() ?? [])
            icon.destroy();
        this._compat?.destroy();
        this._compat = null;
        this._settings = null;
        this._pos = this._icons = this._drag = this._monitor = null;
    }

    // Runs `fn` for a feature. A feature whose probe failed is skipped; one that throws is switched off and reported
    // (see compat.js) instead of taking the whole extension down.
    _safe(id, fn) {
        if (!this._compat || !this._compat.ok(id))
            return undefined;
        try {
            return fn();
        } catch (e) {
            this._compat?.fail(id, e);
            return undefined;
        }
    }

    // Entry points that run from signals and timers: each is guarded by the feature it belongs to.
    _guardMethods() {
        const guard = (obj, method, id) => {
            const original = obj[method].bind(obj);
            obj[method] = (...args) => this._safe(id, () => original(...args));
        };
        guard(this, '_sync', 'desktop-layer');
        guard(this, '_showMenu', 'menus');
        guard(this, '_launch', 'launch');
        guard(this, '_openMonitor', 'git-monitor');
        guard(this._groups, 'open', 'groups');
        guard(this._groups, 'openPicker', 'picker');
    }

    _startNotes() {
        this._notes?.disable();
        this._notes = null;
        if (!this._settings.get_boolean('notes-integration'))
            return;
        this._safe('notes', () => {
            this._notes = new Notes(this, this._settings);
            this._notes.enable();
        });
    }

    // A one-shot timeout that is cancelled when the extension is disabled.
    _later(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers?.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timers.add(id);
    }

    _savePos() {
        writeJson(POS_FILE, this._pos);
    }

    // ---- "Add to Desktop" entry in the right-click menu of apps ------------

    _patchAppMenu() {
        const AppMenu = AppMenuModule.AppMenu;
        if (!AppMenu?.prototype?.setApp) {
            console.error('lovycairn: AppMenu.setApp not found, menu entry not added');
            return;
        }
        const self = this;
        this._appMenuProto = AppMenu.prototype;
        this._origSetApp = AppMenu.prototype.setApp;
        this._menuItems = new Set();
        AppMenu.prototype.setApp = function (app) {
            self._origSetApp.call(this, app);
            try {
                self._decorate(this, app);
            } catch (e) {
                console.error(`lovycairn: menu entry not added: ${e}`);
            }
        };
    }

    _unpatchAppMenu() {
        if (this._appMenuProto)
            this._appMenuProto.setApp = this._origSetApp;
        for (const item of this._menuItems ?? [])
            item.destroy();
        this._appMenuProto = this._origSetApp = this._menuItems = null;
    }

    _decorate(menu, app) {
        let item = menu._lcItem;
        let valid = false;
        try {
            valid = !!item?.get_parent();    // if the menu was rebuilt the object is already destroyed
        } catch (e) {
            valid = false;
        }
        if (!valid) {
            item = new PopupMenu.PopupMenuItem('');
            item.connect('activate', () => this._toggle(menu._lcApp));
            menu.addMenuItem(item);
            menu._lcItem = item;
            this._menuItems.add(item);
        }
        menu._lcApp = app;
        const file = app?.get_app_info()?.get_filename();
        item.visible = !!file;
        if (file)
            item.label.set_text(GLib.file_test(this._target(file), GLib.FileTest.EXISTS)
                ? _('Remove from Desktop') : _('Add to Desktop'));
    }

    _target(file) {
        return GLib.build_filenamev([DESKTOP_DIR, GLib.path_get_basename(file)]);
    }

    _toggle(app) {
        const file = app?.get_app_info()?.get_filename();
        if (!file)
            return;
        const dest = Gio.File.new_for_path(this._target(file));
        try {
            if (dest.query_exists(null))
                dest.trash(null);
            else
                Gio.File.new_for_path(file).copy(dest, Gio.FileCopyFlags.NONE, null, null);
        } catch (e) {
            console.error(`lovycairn: ${file}: ${e}`);
        }
    }

    _queueSync() {
        if (this._syncTimer)
            return;
        this._syncTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._syncTimer = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Align the icons with the .desktop files in the folder: create or remove.
    _sync() {
        if (this._drag) {
            this._syncPending = true;
            return;
        }
        const wanted = new Map();
        try {
            const en = Gio.File.new_for_path(DESKTOP_DIR).enumerate_children(
                'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = en.next_file(null))) {
                const name = info.get_name();
                const full = GLib.build_filenamev([DESKTOP_DIR, name]);
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    if (isGroup(full))
                        wanted.set(`${name}/`, {group: full});   // folder with the .group marker file
                    continue;
                }
                if (!name.endsWith('.desktop'))
                    continue;
                const app = GioUnix.DesktopAppInfo.new_from_filename(full);
                if (app)
                    wanted.set(name, {app});
            }
        } catch (e) {
            console.error(`lovycairn: reading ${DESKTOP_DIR} failed: ${e}`);
        }

        for (const [name, icon] of this._icons) {
            if (!wanted.has(name)) {
                this._closeMonitor(name);
                icon.destroy();
                this._icons.delete(name);
            }
        }
        let index = 0;
        for (const [name, w] of [...wanted].sort((a, b) => a[0].localeCompare(b[0]))) {
            let icon = this._icons.get(name);
            if (!icon) {
                icon = this._makeIcon(name);
                this._icons.set(name, icon);
                Main.layoutManager._backgroundGroup.add_child(icon);
                const p = this._pos[name] ?? this._freeSlot(icon);
                icon.set_position(...this._clamp(p[0], p[1]));
            }
            if (w.group) {
                icon._group = w.group;
                icon._app = null;
                icon._project = null;
                icon._color = groupColor(w.group);
                icon._iconId = groupIcon(w.group);
                applyGroupIcon(icon._icon, w.group);
                icon._label.set_text(name.slice(0, -1));
                const n = countApps(w.group);
                icon._status.clutter_text.set_use_markup(false);
                icon._status.set_text(fmt(ngettext('%s item', '%s items', n), n));
                icon._status.set_style(`${P.font} font-size: 9.5px; ` +
                    `color: ${P.ink2}; text-shadow: 0 1px 3px rgba(0,0,0,0.9);`);
                icon._status.visible = true;
            } else {
                const app = w.app;
                icon._group = null;
                icon._label.set_text(app.get_name());
                icon._app = app;
                icon._project = app.get_string('X-LovyCairn-Path');   // project launcher
                if (icon._project) {
                    // projects: recolorable icon (shape and color are chosen by the user)
                    icon._color = app.get_string('X-LovyCairn-Color');
                    icon._iconId = app.get_string('X-LovyCairn-Icon');
                    applyIcon(icon._icon, icon._iconId, icon._color);
                } else {
                    icon._icon.set_style('');
                    icon._icon.set_gicon(app.get_icon() ?? new Gio.ThemedIcon({name: 'application-x-executable'}));
                }
                icon._status.visible = !!icon._project;
                this._refreshGit(icon);
            }
            index++;
        }
    }

    // ---- git status of project launchers (async: the shell never blocks) ----

    _git(args, callback) {
        try {
            const proc = Gio.Subprocess.new(['git', ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, out] = p.communicate_utf8_finish(res);
                    callback(p.get_successful() ? out : null);
                } catch (e) {
                    callback(null);
                }
            });
        } catch (e) {
            callback(null);
        }
    }

    // ---- layout: free areas = everything except other widgets and icons ----

    _obstacles() {
        const group = Main.layoutManager._backgroundGroup, mine = new Set(this._icons.values());
        const W = global.stage.width, H = global.stage.height, out = [];
        for (const a of group.get_children()) {
            if (mine.has(a) || !a.visible)
                continue;
            if (a.width >= W * 0.9 && a.height >= H * 0.9)   // the wallpaper
                continue;
            if (a.width >= 120 && a.height >= 80)
                out.push([a.x, a.y, a.width, a.height]);
        }
        return out;
    }

    _overlaps(x, y, rects) {
        const pad = 6;
        return rects.some(([rx, ry, rw, rh]) =>
            x < rx + rw + pad && x + ICON_W > rx - pad && y < ry + rh + pad && y + ICON_H > ry - pad);
    }

    // First free slot, scanning the grid column by column from the top left.
    _freeSlot(skip, placed = []) {
        const rects = [...this._obstacles(), ...placed];
        for (const icon of this._icons.values()) {
            if (icon !== skip && !placed.length)
                rects.push([icon.x, icon.y, ICON_W, ICON_H]);
        }
        const top = Main.panel.height + 24, bottom = global.stage.height - 56;
        for (let x = 24; x + ICON_W < global.stage.width; x += ICON_W + GAP) {
            for (let y = top; y + ICON_H < bottom; y += ICON_H + GAP) {
                if (!this._overlaps(x, y, rects))
                    return [x, y];
            }
        }
        return this._defaultPosition(this._icons.size);
    }

    _arrange() {
        const ordered = [...this._icons.entries()].sort(([an, a], [bn, b]) =>
            (!!a._project - !!b._project) || an.localeCompare(bn));
        const placed = [];
        for (const [name, icon] of ordered) {
            const [x, y] = this._freeSlot(icon, placed);
            icon.set_position(...this._clamp(x, y));
            placed.push([icon.x, icon.y, ICON_W, ICON_H]);
            this._pos[name] = [Math.round(icon.x), Math.round(icon.y)];
        }
        writeJson(POS_FILE, this._pos);
    }

    // Other widgets are added to the desktop at different times and may cover the icons: raise the icons again.
    _raiseIcons() {
        const group = Main.layoutManager._backgroundGroup;
        for (const icon of this._icons?.values() ?? []) {
            if (icon.get_parent() === group && group.get_last_child() !== icon)
                group.set_child_above_sibling(icon, null);
        }
    }

    _refreshGit(icon) {
        const path = icon._project;
        if (!path)
            return;
        const alive = () => !icon._dead && (icon._panelItem || (this._icons && [...this._icons.values()].includes(icon)));
        this._git(['-C', path, 'status', '--porcelain=v2', '--branch'], out => {
            if (!alive())
                return;
            if (out === null) {
                icon._status.set_text(_('not a git repo'));
                return;
            }
            let branch = '?', ahead = 0, dirty = 0;
            for (const line of out.split('\n')) {
                if (line.startsWith('# branch.head '))
                    branch = line.slice(14);
                else if (line.startsWith('# branch.ab '))
                    ahead = parseInt(line.split(' ')[2], 10) || 0;
                else if (line && !line.startsWith('#'))
                    dirty++;
            }
            this._git(['-C', path, 'log', '-1', '--format=%ct'], ts => {
                if (!alive())
                    return;
                const dim = t => `<span foreground="${P.ink2}">${GLib.markup_escape_text(t, -1)}</span>`;
                const parts = [dim(branch)];
                parts.push(dirty > 0
                    ? `<span foreground="${P.warn}">●${dirty}</span>`
                    : `<span foreground="${P.accent}">✓</span>`);
                if (ahead > 0)
                    parts.push(dim(`↑${ahead}`));
                const secs = ts ? Math.floor(Date.now() / 1000) - parseInt(ts, 10) : NaN;
                if (!Number.isNaN(secs))
                    parts.push(dim(secs < 3600 ? `${Math.max(1, Math.floor(secs / 60))}m`
                        : secs < 86400 ? `${Math.floor(secs / 3600)}h` : `${Math.floor(secs / 86400)}d`));
                icon._status.clutter_text.set_markup(parts.join(' '));
            });
        });
    }

    // Columns from the left, top to bottom.
    _defaultPosition(index) {
        const top = Main.panel.height + 24;
        const rows = Math.max(1, Math.floor((global.stage.height - top - 80) / (ICON_H + GAP)));
        const col = Math.floor(index / rows);
        return [24 + col * (ICON_W + GAP), top + (index % rows) * (ICON_H + GAP)];
    }

    _clamp(x, y) {
        const top = Main.panel.height;
        return [
            Math.min(Math.max(0, x), Math.max(0, global.stage.width - ICON_W)),
            Math.min(Math.max(top, y), Math.max(top, global.stage.height - ICON_H)),
        ];
    }

    _makeIcon(name) {
        const icon = new St.BoxLayout({
            reactive: true,
            track_hover: true,
            orientation: Clutter.Orientation.VERTICAL,
            width: ICON_W,
            height: ICON_H,
            style: 'padding: 6px; border-radius: 2px; border: 1px solid transparent;',
        });
        icon._icon = new St.Icon({icon_size: ICON_SIZE, x_align: Clutter.ActorAlign.CENTER});
        icon._label = new St.Label({
            x_align: Clutter.ActorAlign.CENTER,
            style: `color: ${P.ink}; ${P.font} font-size: 11px; ` +
                'text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,0.9);',
        });
        icon._label.clutter_text.set_line_wrap(true);
        icon._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        icon.add_child(icon._icon);
        icon.add_child(icon._label);
        icon._status = new St.Label({
            x_align: Clutter.ActorAlign.CENTER,
            visible: false,
            style: `${P.font} font-size: 9.5px; text-shadow: 0 1px 3px rgba(0,0,0,0.9);`,
        });
        icon.add_child(icon._status);

        icon.connect('notify::hover', () => icon.set_style(
            'padding: 6px; border-radius: 2px; ' +
            `border: 1px solid ${icon.hover ? P.line2 : 'transparent'}; ` +
            `background-color: ${icon.hover ? P.accentTint : 'transparent'};`));
        icon.connect('button-press-event', (_a, ev) => this._onPress(icon, name, ev));
        icon.connect('motion-event', (_a, ev) => this._onMotion(icon, ev));
        icon.connect('button-release-event', (_a, ev) => this._onRelease(icon, name, ev));
        return icon;
    }

    // ---- git monitor: always-on-top card, draggable, refreshes itself ----

    _openMonitor(icon, name) {
        if (this._mons.has(name))
            return;
        const path = icon._project;
        const label = (text, style, ellipsize = true) => {
            const l = new St.Label({text, style, y_align: Clutter.ActorAlign.CENTER});
            if (ellipsize)
                l.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            return l;
        };
        const actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, reactive: true, width: MON_W,
            style: `background-color: ${P.card}; border: 1px solid ${P.line2}; border-radius: 4px; ` +
                'padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); ' +
                `${P.font}`,
        });
        const head = new St.BoxLayout({reactive: true, style: 'spacing: 8px;'});
        const title = label(icon._app.get_name(), `color: ${P.ink}; font-weight: bold; font-size: 10.5pt;`);
        title.x_expand = true;
        const branch = label('', `color: ${P.accent}; font-size: 9pt;`);
        const close = new St.Button({label: '✕', reactive: true, can_focus: true,
            style: `color: ${P.ink2}; padding: 0 4px;`});
        close.connect('clicked', () => this._closeMonitor(name));
        head.add_child(title);
        head.add_child(branch);
        head.add_child(close);
        const summary = label('…', `color: ${P.ink2}; font-size: 9pt; margin-top: 6px;`);
        const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style: 'spacing: 3px;'});
        actor.add_child(head);
        actor.add_child(summary);
        actor.add_child(body);

        const p = this._pos[`git:${name}`] ?? [global.stage.width - MON_W - 24 -
            this._mons.size * (MON_W + 12), Main.panel.height + 24];
        Main.uiGroup.add_child(actor);
        actor.set_position(...this._clampTo(p[0], p[1], MON_W, 80));

        head.connect('button-press-event', (_a, ev) => {
            if (ev.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = ev.get_coords();
            // a click on the ✕ belongs to the button: without this the drag would steal its release
            const [cx, cy] = close.get_transformed_position();
            const [cw, ch] = close.get_transformed_size();
            if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch)
                return Clutter.EVENT_PROPAGATE;
            this._mdrag = {actor, name, x, y, ax: actor.x, ay: actor.y, grab: global.stage.grab(head)};
            return Clutter.EVENT_STOP;
        });
        head.connect('motion-event', (_a, ev) => {
            const d = this._mdrag;
            if (!d || d.actor !== actor)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = ev.get_coords();
            actor.set_position(...this._clampTo(d.ax + x - d.x, d.ay + y - d.y, MON_W, 80));
            return Clutter.EVENT_STOP;
        });
        head.connect('button-release-event', () => {
            const d = this._mdrag;
            if (!d || d.actor !== actor)
                return Clutter.EVENT_PROPAGATE;
            d.grab.dismiss();
            this._mdrag = null;
            this._pos[`git:${name}`] = [Math.round(actor.x), Math.round(actor.y)];
            writeJson(POS_FILE, this._pos);
            return Clutter.EVENT_STOP;
        });

        const mon = {actor, timer: 0, branch, summary, body, path, label};
        this._mons.set(name, mon);
        mon.timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._refreshMonitor(name);
            return GLib.SOURCE_CONTINUE;
        });
        this._refreshMonitor(name);
    }

    _closeMonitor(name) {
        const mon = this._mons?.get(name);
        if (!mon)
            return;
        if (mon.timer)
            GLib.source_remove(mon.timer);
        if (this._mdrag?.actor === mon.actor) {
            this._mdrag.grab.dismiss();
            this._mdrag = null;
        }
        mon.actor.destroy();
        this._mons.delete(name);
    }

    _clampTo(x, y, w, h) {
        return [
            Math.min(Math.max(0, x), Math.max(0, global.stage.width - w)),
            Math.min(Math.max(0, y), Math.max(0, global.stage.height - h)),
        ];
    }

    _refreshMonitor(name) {
        const mon = this._mons.get(name);
        if (!mon)
            return;
        const alive = () => this._mons?.get(name) === mon;
        this._git(['-C', mon.path, 'status', '--porcelain=v1', '--branch'], out => {
            if (!alive())
                return;
            if (out === null) {
                mon.summary.set_text(_('not a git repository'));
                return;
            }
            const lines = out.split('\n').filter(Boolean);
            const head = lines.find(l => l.startsWith('## ')) ?? '## ?';
            const files = lines.filter(l => !l.startsWith('## '));
            const m = /^## (?:No commits yet on |Initial commit on )?(\S+?)(?:\.\.\.\S+)?(?: \[(.*)\])?$/.exec(head);
            mon.branch.set_text(m?.[1] ?? '?');
            const track = m?.[2] ? ` · ${m[2].replace('ahead ', '↑').replace('behind ', '↓').replace(', ', ' ')}` : '';
            const untracked = files.filter(l => l.startsWith('??')).length;
            const changed = files.length - untracked;
            mon.summary.set_text(files.length
                ? `${fmt(ngettext('%s changed', '%s changed', changed), changed)} · ${fmt(ngettext('%s new', '%s new', untracked), untracked)}${track}`
                : `${_('all saved')}${track}`);

            this._git(['-C', mon.path, 'log', '-5', '--format=%h%x09%s%x09%ct'], log => {
                if (!alive())
                    return;
                mon.body.destroy_all_children();
                const section = text => mon.body.add_child(mon.label(text,
                    `color: ${P.ink3}; font-size: 8pt; letter-spacing: 1.5px; margin-top: 12px;`));
                const colors = {M: P.warn, A: P.accent, '?': P.accent, D: P.danger, R: P.ink2};
                if (files.length) {
                    section(_('CHANGES'));
                    for (const l of files.slice(0, 8)) {
                        const code = l.slice(0, 2).trim() || '?';
                        const row = new St.BoxLayout({style: 'spacing: 8px;'});
                        row.add_child(mon.label(code, `color: ${colors[code[0]] ?? P.ink}; ` +
                            'font-size: 9pt; min-width: 18px;', false));
                        const f = mon.label(l.slice(3), `color: ${P.ink}; font-size: 9pt;`);
                        f.x_expand = true;
                        row.add_child(f);
                        mon.body.add_child(row);
                    }
                    if (files.length > 8)
                        mon.body.add_child(mon.label(fmt(_('… and %s more'), files.length - 8),
                            `color: ${P.ink2}; font-size: 9pt;`));
                }
                if (log) {
                    section(_('RECENT COMMITS'));
                    const now = Math.floor(Date.now() / 1000);
                    for (const l of log.split('\n').filter(Boolean)) {
                        const [hash, subject, ts] = l.split('\t');
                        const secs = now - parseInt(ts, 10);
                        const age = secs < 3600 ? `${Math.max(1, Math.floor(secs / 60))}m`
                            : secs < 86400 ? `${Math.floor(secs / 3600)}h` : `${Math.floor(secs / 86400)}d`;
                        const row = new St.BoxLayout({style: 'spacing: 8px;'});
                        row.add_child(mon.label(hash, `color: ${P.ink3}; font-size: 9pt;`, false));
                        const sub = mon.label(subject ?? '', `color: ${P.ink}; font-size: 9pt;`);
                        sub.x_expand = true;
                        row.add_child(sub);
                        row.add_child(mon.label(age, `color: ${P.ink3}; font-size: 9pt;`, false));
                        mon.body.add_child(row);
                    }
                }
            });
        });
    }

    // One launch per click: ignore quick double launches. Projects start with the
    // same command that opens a single window from a terminal (launching via GAppInfo opened two).
    _launch(icon, name, mode = 'auto') {
        const now = GLib.get_monotonic_time();
        if (icon._lastLaunch && now - icon._lastLaunch < 1500000)
            return;
        icon._lastLaunch = now;
        if (icon._project) {
            this._lastProject = {
                path: icon._project, name: icon._app.get_name(),
                tag: icon._app.get_string('X-LovyCairn-Tag') ?? icon._app.get_name().toLowerCase().replace(/\s+/g, '-'),
            };
            this._openMonitor(icon, name);
            this._goToProject(icon, mode);
            return;
        }
        try {
            icon._app.launch([], global.create_app_launch_context(0, -1));
        } catch (e) {
            console.error(`lovycairn: launching ${name} failed: ${e}`);
        }
    }

    // ---- “Go to project” -----------------------------------------------------------------
    // If the project is already open it takes you where its windows are; otherwise it opens its environment (terminal in the
    // folder and, if you chose one, the documentation in the browser) in an EMPTY workspace. No numbers to
    // assign and no fixed workspaces: workspaces stay dynamic.

    _docsOf(app) {
        return (app.get_string('X-LovyCairn-Docs') ?? '').split(';').map(u => u.trim()).filter(u => /^(https?|file):\/\/\S+$/.test(u));
    }

    // Project windows: the ones opened from here and still alive, plus every window with its path in the title.
    _projectWindows(path) {
        const found = new Set(this._environments.get(path) ?? []);
        const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = [path, path.replace(HOME, '~')].map(p => new RegExp(`${esc(p)}(?![\\w.-])`));
        for (const a of global.get_window_actors()) {
            const w = a.meta_window, title = w.get_title() ?? '';
            if (re.some(r => r.test(title)))
                found.add(w);
        }
        return [...found].filter(w => !w._closed);
    }

    // A click chooses by itself ('auto'); the menu entries force the behavior:
    //   auto → if the project is already open, go there; otherwise open it in an empty workspace (or in this one, if for that
    //           project the “Click opens in a new workspace” switch is off);
    //   new  → always open it in an empty workspace, even if it is already open elsewhere;
    //   here → always open it in the current workspace, without switching.
    _newWorkspaceDefault(app) {
        return app.get_string('X-LovyCairn-NewWorkspace') !== 'false';
    }

    _goToProject(icon, mode = 'auto') {
        const path = icon._project;
        if (mode === 'auto') {
            const openWindows = this._projectWindows(path);
            if (openWindows.length) {
                Main.activateWindow(openWindows[0]);   // switches workspace and raises the window
                return;
            }
        }
        if (mode === 'new' || (mode === 'auto' && this._newWorkspaceDefault(icon._app)))
            this._emptyWorkspace();
        this._watchWindows(path);
        this._openTerminal(path);
        const docs = this._docsOf(icon._app);
        if (docs.length)
            this._openBrowser(docs);
    }

    // The active workspace if it is empty, else the first empty one, else a new one.
    _emptyWorkspace() {
        const wm = global.workspace_manager, t = global.get_current_time();
        const isEmpty = ws => !ws.list_windows().some(w => !w.is_on_all_workspaces() && w.get_window_type() === Meta.WindowType.NORMAL);
        let ws = wm.get_active_workspace();
        if (!isEmpty(ws)) {
            ws = null;
            for (let i = 0; i < wm.n_workspaces && !ws; i++) {
                if (isEmpty(wm.get_workspace_by_index(i)))
                    ws = wm.get_workspace_by_index(i);
            }
            ws ??= wm.append_new_workspace(false, t);
        }
        ws.activate(t);
    }

    // For 20 seconds, remember the windows that appear (terminal and browser) as windows of this project.
    _watchWindows(path) {
        const set = this._environments.get(path) ?? new Set();
        this._environments.set(path, set);
        const custom = ['terminal-command', 'browser-command']
            .map(k => GLib.path_get_basename(this._settings.get_string(k).trim().split(/\s+/)[0] ?? ''))
            .filter(Boolean);
        const classes = [...System.WINDOW_CLASSES, ...custom].map(c => c.toLowerCase());
        const watching = Symbol('watching');
        global.display.connectObject('window-created', (_d, win) => {
            const register = () => {
                const cls = (win.get_wm_class() ?? '').toLowerCase();
                if (!cls || !classes.some(c => cls.includes(c)) || set.has(win))
                    return;
                set.add(win);
                win.connectObject('unmanaged', () => {
                    win._closed = true;
                    set.delete(win);
                }, this);
            };
            if (win.get_wm_class())
                register();
            else
                win.connectObject('notify::wm-class', register, this);
        }, watching);
        this._later(20000, () => global.display.disconnectObject(watching));
    }

    _openTerminal(path) {
        const command = System.terminalCommand(this._settings.get_string('terminal-command'), path);
        if (!command) {
            Main.notify(_('No terminal found'), _('Choose one in the LovyCairn preferences.'));
            return;
        }
        System.spawn(...command);
    }

    // Default browser in a NEW WINDOW (so it appears in the workspace just opened, without bringing
    // another browser window from elsewhere to the front).
    _openBrowser(urls) {
        const commands = System.browserCommands(this._settings.get_string('browser-command'), urls);
        if (commands) {
            commands.forEach((argv, i) => this._later(1800 * i, () => System.spawn(argv)));
            return;
        }
        try {
            Gio.AppInfo.get_default_for_type('x-scheme-handler/https', false)
                ?.launch_uris(urls, global.create_app_launch_context(0, -1));
        } catch (e) {
            console.error(`lovycairn: browser not started: ${e}`);
        }
    }

    // “Active” project: the one whose path appears in the title of the focused window (the terminal),
    // otherwise the last one opened from the desktop.
    _activeProject() {
        const title = global.display.focus_window?.get_title() ?? '';
        let best = null;
        for (const v of this._groups.all()) {
            const path = v.kind === 'app' ? v.app.get_string('X-LovyCairn-Path') : null;
            if (!path || !(title.includes(path) || title.includes(path.replace(HOME, '~'))))
                continue;
            if (!best || path.length > best.path.length) {
                best = {
                    path, name: v.app.get_name(),
                    tag: v.app.get_string('X-LovyCairn-Tag') ?? v.app.get_name().toLowerCase().replace(/\s+/g, '-'),
                };
            }
        }
        return best ?? this._lastProject ?? null;
    }

    _projectNote() {
        const p = this._activeProject();
        if (!p) {
            Main.notify(_('No active project'), _('Open a project from the desktop, or bring its terminal to the front, then try again.'));
            return;
        }
        this._newNote(p.tag);
    }

    // Runs the notes app with the given arguments.
    _notesRun(args) {
        const command = System.notesCommand(this._settings.get_string('notes-command'));
        if (!command) {
            Main.notify(_('LovyCairn Notes is not installed'), _('Install the notes app to use project notes (see the README).'));
            return;
        }
        const dir = this._settings.get_string('notes-dir');
        System.spawn([...command, ...(dir ? ['--notes-dir', dir] : []), ...args]);
    }

    // ---- adding a project: a launcher (.desktop file) on the desktop -------------------------

    // GNOME's own folder chooser, through the desktop portal (the one other apps use).
    // Resolves to the folder, null if cancelled, undefined if the portal is not available.
    _chooseFolder(title, start) {
        return new Promise(resolve => {
            const bus = Gio.DBus.session;
            const token = `lovycairn${GLib.random_int_range(0, 1000000000)}`;
            const sender = bus.get_unique_name().slice(1).replaceAll('.', '_');
            const request = `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
            const id = bus.signal_subscribe('org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Request', 'Response',
                request, null, Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _sig, params) => {
                    bus.signal_unsubscribe(id);
                    const [code, results] = params.recursiveUnpack();
                    resolve(code === 0 && results.uris?.length ? Gio.File.new_for_uri(results.uris[0]).get_path() : null);
                });
            const options = {
                handle_token: new GLib.Variant('s', token), directory: new GLib.Variant('b', true), modal: new GLib.Variant('b', true),
            };
            if (start)
                options.current_folder = new GLib.Variant('ay', new TextEncoder().encode(`${start}\0`));
            bus.call('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop', 'org.freedesktop.portal.FileChooser',
                'OpenFile', new GLib.Variant('(ssa{sv})', ['', title, options]), null, Gio.DBusCallFlags.NONE, -1, null, (c, r) => {
                    try {
                        c.call_finish(r);
                    } catch (e) {
                        bus.signal_unsubscribe(id);
                        resolve(undefined);
                    }
                });
        });
    }

    async _askProject() {
        const code = GLib.build_filenamev([HOME, 'code']);
        const start = GLib.file_test(code, GLib.FileTest.IS_DIR) ? code : HOME;
        let folder = await this._chooseFolder(_('Choose the project folder'), start);
        if (folder === null)
            return;   // cancelled
        if (folder === undefined) {
            // no portal: fall back to typing the path
            const text = await this._groups.askText({
                title: _('Add project'),
                description: _('Folder of the project, for example ~/code/my-app. The project appears on the desktop.'),
                initial: '', ok: _('Add'), hint: '~/code/my-app', wide: true,
                validate: t => (t && GLib.file_test(this._expandPath(t), GLib.FileTest.IS_DIR) ? null : _('This folder does not exist.')),
            });
            folder = text ? this._expandPath(text) : null;
        }
        if (folder)
            this.addProject(folder);
    }

    _expandPath(p) {
        return GLib.canonicalize_filename(p.startsWith('~') ? p.replace('~', HOME) : p, HOME);
    }

    addProject(dir, name = GLib.path_get_basename(dir)) {
        const tag = name.toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
        const file = GLib.build_filenamev([DESKTOP_DIR, `project-${tag}.desktop`]);
        const kf = new GLib.KeyFile();
        kf.set_string('Desktop Entry', 'Type', 'Application');
        kf.set_string('Desktop Entry', 'Name', name);
        // Exec quoting from the Desktop Entry spec: double quotes, with \ " ` $ escaped and % doubled
        kf.set_string('Desktop Entry', 'Exec', `gio open "${dir.replace(/%/g, '%%').replace(/[\\"`$]/g, c => `\\${c}`)}"`);
        kf.set_string('Desktop Entry', 'Icon', 'folder');
        kf.set_boolean('Desktop Entry', 'Terminal', false);
        kf.set_string('Desktop Entry', 'Categories', 'Development;');
        kf.set_string('Desktop Entry', 'X-LovyCairn-Path', dir);
        kf.set_string('Desktop Entry', 'X-LovyCairn-Tag', tag);
        try {
            kf.save_to_file(file);
        } catch (e) {
            console.error(`lovycairn: cannot create ${file}: ${e}`);
        }
    }

    // Opens a new note (with a project tag, if given) or, with `browse`, the notes of that tag.
    _newNote(tag, browse = false) {
        this._notesRun([...(browse ? [] : ['--new']), ...(tag ? ['--tag', tag] : [])]);
    }

    // Right-click menu of project launchers.
    _showMenu(icon, name) {
        this._menu?.destroy();
        if (icon._group) {
            this._groupMenu(icon, name);
            return;
        }
        const src = GLib.build_filenamev([DESKTOP_DIR, name]);
        const path = icon._project;
        const tag = icon._app.get_string('X-LovyCairn-Tag') ??
            icon._app.get_name().toLowerCase().replace(/\s+/g, '-');

        const menu = this._scrollableMenu(icon);
        if (!path) {
            menu.addAction(_('Open'), () => this._launch(icon, name));
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._groupItems(menu, icon, src);
            this._addRemove(menu, name, icon._panelItem);
            this._presentMenu(menu, icon);
            return;
        }
        menu.addAction(_('Open project'), () => this._launch(icon, name));
        menu.addAction(_('Open in a new workspace'), () => this._launch(icon, name, 'new'));
        menu.addAction(_('Open in this workspace'), () => this._launch(icon, name, 'here'));
        menu.addAction(_('New terminal here'), () => this._openTerminal(path));
        menu.addAction(_('Open folder'), () => {
            try {
                Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(path).get_uri(),
                    global.create_app_launch_context(0, -1));
            } catch (e) {
                console.error(`lovycairn: folder ${path}: ${e}`);
            }
        });
        menu.addAction(this._mons.has(name) ? _('Close git monitor') : _('Git monitor'), () =>
            (this._mons.has(name) ? this._closeMonitor(name) : this._openMonitor(icon, name)));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        if (System.notesCommand(this._settings.get_string('notes-command'))) {
            menu.addAction(_('New project note'), () => this._newNote(tag));
            menu.addAction(_('Project notes'), () => this._newNote(tag, true));
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        this._groups.addAppearanceMenu(menu, src, 'project', {color: icon._color, icon: icon._iconId});
        this._groups.addDocsMenu(menu, src, this._docsOf(icon._app));
        {
            // what a click does on this project: per-project switch (key X-LovyCairn-NewWorkspace)
            const item = new PopupMenu.PopupSwitchMenuItem(_('Click opens in a new workspace'),
                this._newWorkspaceDefault(icon._app));
            item.connect('toggled', (_v, on) =>
                this._groups.setAppearance(src, 'project', 'X-LovyCairn-NewWorkspace', on ? null : 'false'));
            menu.addMenuItem(item);
        }
        this._groupItems(menu, icon, src);
        this._addRemove(menu, name, icon._panelItem);
        this._presentMenu(menu, icon);
    }

    // Entries shared by launchers and projects: groups and arranging.
    _groupItems(menu, icon, src) {
        this._groups.addMoveMenu(menu, src);
        if (icon._panelItem)
            menu.addAction(_('Move out of group'), () => this._groups.moveUp(src));
        else
            menu.addAction(_('New group…'), () => this._groups.newGroup());
        if (!icon._panelItem)
            menu.addAction(_('Arrange icons'), () => this._arrange());
    }

    _groupMenu(icon, name) {
        const menu = this._scrollableMenu(icon);
        const src = icon._group;
        menu.addAction(_('Open'), () => this._groups.open(icon, src));
        menu.addAction(_('Rename…'), () => this._groups.rename(src));
        menu.addAction(_('New subgroup…'), () => this._groups.newGroup(src));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._groups.addAppearanceMenu(menu, src, 'group', {color: icon._color, icon: icon._iconId});
        this._groups.addMoveMenu(menu, src);
        if (icon._panelItem)
            menu.addAction(_('Move out of group'), () => this._groups.moveUp(src));
        else
            menu.addAction(_('New group…'), () => this._groups.newGroup());
        if (!icon._panelItem)
            menu.addAction(_('Arrange icons'), () => this._arrange());
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction(_('Ungroup (contents stay)'), () => this._groups.ungroup(src));
        this._presentMenu(menu, icon);
    }

    _addRemove(menu, name, inGroup = false) {
        menu.addAction(inGroup ? _('Remove') : _('Remove from Desktop'), () => {
            try {
                Gio.File.new_for_path(GLib.build_filenamev([DESKTOP_DIR, name])).trash(null);
            } catch (e) {
                console.error(`lovycairn: cannot trash ${name}: ${e}`);
            }
        });
    }

    // The menu must never exceed the available space: when it fits neither above nor below the icon, GNOME cuts it.
    // The entries therefore live in a section inside a scroll view at most as tall as the space on the larger side
    // (the usual pattern for long menus in extensions). Returns the section, where the entries are added.
    _scrollableMenu(icon) {
        const reale = new PopupMenu.PopupMenu(icon, 0.5, St.Side.TOP);
        const monitor = Main.layoutManager.findMonitorForActor(icon) ?? Main.layoutManager.primaryMonitor;
        const wa = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const below = wa.y + wa.height - (icon.y + icon.height);
        const above = icon.y - wa.y;
        const max = Math.max(240, Math.floor(Math.max(below, above) - 56));   // minus padding, border and arrow
        const scrollable = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true, style: `max-height: ${max}px;`,
        });
        const section = new PopupMenu.PopupMenuSection();
        scrollable.set_child(section.actor);
        reale.box.add_child(scrollable);
        section.connect('activate', () => reale.close());   // like a normal menu: it closes after an entry
        section._real = reale;
        return section;
    }

    _presentMenu(section, icon) {
        const menu = section._real ?? section;
        menu.actor.add_style_class_name('menu-compatto');   // lower entries: less scrolling
        Main.uiGroup.add_child(menu.actor);
        const manager = new PopupMenu.PopupMenuManager(icon);
        manager.addMenu(menu);
        menu.connect('open-state-changed', (_m, open) => {
            if (open)
                return;
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this._menu === menu)
                    this._menu = null;
                manager.destroy?.();
                menu.destroy();
                return GLib.SOURCE_REMOVE;
            });
        });
        this._menu = menu;
        menu.open();
    }

    // Click: launch. Drag: move. Right click: menu.
    _onPress(icon, name, event) {
        const button = event.get_button();
        if (button === 3) {
            this._showMenu(icon, name);
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
        this._groups?.hover(icon);   // highlight the group the icon is about to be dropped on
        return Clutter.EVENT_STOP;
    }

    _onRelease(icon, name, event) {
        const d = this._drag;
        if (!d || d.icon !== icon || event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        d.grab.dismiss();
        this._drag = null;
        if (d.moved) {
            const target = this._groups.dropTarget(icon);
            this._groups.hover(null);
            if (!(target && this._groups.dropInto(icon, name, target))) {
                this._pos[name] = [Math.round(icon.x), Math.round(icon.y)];
                writeJson(POS_FILE, this._pos);
            }
        } else if (icon._group) {
            this._groups.open(icon, icon._group);
        } else {
            this._launch(icon, name);
        }
        if (this._syncPending) {
            this._syncPending = false;
            this._sync();
        }
        return Clutter.EVENT_STOP;
    }
}
