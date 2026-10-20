// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

// Groups on the desktop: real folders inside the Desktop folder, recognized by a marker file (.group).
// A group opens in a panel; subgroups are folders inside folders.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {ModalDialog} from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import {solidSvg, SOLID_SHAPES} from './icons.js';
import {P} from './palette.js';
import {N_, fmt} from './util.js';

export const MARKER = '.group';

// Customizable look of projects and groups. The color lives in the launcher (X-LovyCairn-Color) or in the
// group marker file (line “color=#rrggbb”), so it stays with the project.
export const COLORS = [
    [N_('Automatic'), null],
    [N_('Green'), P.swatch.green], [N_('Lime'), P.swatch.lime], [N_('Yellow'), P.swatch.yellow], [N_('Orange'), P.swatch.orange],
    [N_('Red'), P.swatch.red], [N_('Pink'), P.swatch.pink], [N_('Violet'), P.swatch.violet], [N_('Indigo'), P.swatch.indigo],
    [N_('Blue'), P.swatch.blue], [N_('Cyan'), P.swatch.cyan], [N_('Teal'), P.swatch.teal], [N_('Gray'), P.swatch.gray],
];
// The four SOLID shapes (drawn by icons.js) and the five outline symbolic icons from the icon theme.
export const ICONS = [
    [N_('Cube'), 'cube'], [N_('Folder with code'), 'folder-code'], [N_('Board'), 'board'], [N_('Flag'), 'flag'],
    [N_('Package'), 'package-x-generic'], [N_('Engineering'), 'applications-engineering'], [N_('Terminal'), 'utilities-terminal'],
    [N_('Server'), 'network-server'], [N_('Laboratory'), 'applications-science'],
];
export const PROJECT_ICON = 'cube';
// Group shapes: the classic outline folder (default), two more outline ones and four solid ones.
export const GROUP_ICONS = [
    [N_('Folder'), 'folder'], [N_('Solid folder'), 'folder-solid'], [N_('Stack'), 'stack'], [N_('Grid'), 'grid'],
    [N_('Star'), 'star'], [N_('Documents'), 'folder-documents'], [N_('Bookmark'), 'user-bookmarks'],
];
export const GROUP_ICON = 'folder';
const PROJECT_COLOR = P.ink2;
const GROUP_COLOR = P.ink;
const HEX = /^#[0-9a-fA-F]{6}$/;

// The group marker file is a list of “key=value” lines (color, icon).
function readMarker(path) {
    const r = {};
    try {
        const [ok, bytes] = GLib.file_get_contents(GLib.build_filenamev([path, MARKER]));
        if (ok)
            for (const m of new TextDecoder().decode(bytes).matchAll(/^(color|icon)=(\S+)\s*$/gm))
                r[m[1]] = m[2];
    } catch (e) {
        // missing or unreadable file: default look
    }
    return r;
}

export function groupColor(path) {
    const c = readMarker(path).color;
    return HEX.test(c ?? '') ? c : null;
}

export const groupIcon = path => readMarker(path).icon ?? null;

// Solid shapes are drawn per color (SVG file in the cache, created the first time); outline ones are symbolic icons
// recolored by the shell.
function solidIconFile(shape, color) {
    const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'lovycairn', 'icons']);
    const p = GLib.build_filenamev([dir, `${shape}-${color.slice(1)}.svg`]);
    if (!GLib.file_test(p, GLib.FileTest.EXISTS)) {
        GLib.mkdir_with_parents(dir, 0o755);
        GLib.file_set_contents(p, solidSvg(shape, color));
    }
    return p;
}

export function applyIcon(icon, shape, color, fallback = PROJECT_COLOR, list = ICONS, shape0 = PROJECT_ICON) {
    const id = list.some(i => i[1] === shape) ? shape : shape0;
    const col = HEX.test(color ?? '') ? color : fallback;
    if (id in SOLID_SHAPES) {
        icon.set_gicon(new Gio.FileIcon({file: Gio.File.new_for_path(solidIconFile(id, col))}));
        icon.set_style('');
    } else {
        icon.set_icon_name(`${id}-symbolic`);
        icon.set_style(`color: ${col};`);
    }
}

// Icon of a group according to its marker file (shape and color).
export function applyGroupIcon(icon, path) {
    applyIcon(icon, groupIcon(path), groupColor(path), GROUP_COLOR, GROUP_ICONS, GROUP_ICON);
}
const COLS = 4;
const ITEM_W = 96;
const ITEM_H = 104;
const ITEM_GAP = 4;
const PANEL_PAD = 14;
const PANEL_W = COLS * ITEM_W + (COLS - 1) * ITEM_GAP + 2 * PANEL_PAD;
const MONO = P.font;

const join = (...p) => GLib.build_filenamev(p);
const base = p => GLib.path_get_basename(p);
const dir = p => GLib.path_get_dirname(p);
const label = e => (e.kind === 'group' ? e.name : e.app.get_name());

export function isGroup(path) {
    return GLib.file_test(join(path, MARKER), GLib.FileTest.EXISTS);
}

// Contents of a group: subgroups first, then launchers, alphabetical.
function entries(path) {
    const out = [];
    try {
        const en = Gio.File.new_for_path(path).enumerate_children(
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = en.next_file(null))) {
            const name = info.get_name();
            if (name.startsWith('.'))
                continue;
            const p = join(path, name);
            if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                if (isGroup(p))
                    out.push({kind: 'group', name, path: p});
            } else if (name.endsWith('.desktop')) {
                const app = GioUnix.DesktopAppInfo.new_from_filename(p);
                if (app)
                    out.push({kind: 'app', name, path: p, app});
            }
        }
    } catch (e) {
        console.error(`lovycairn: reading ${path} failed: ${e}`);
    }
    return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'group' ? -1 : 1) ||
        label(a).localeCompare(label(b)));
}

// How many launchers a group holds, subgroups included.
export function countApps(path, depth = 0) {
    if (depth > 8)
        return 0;
    return entries(path).reduce((n, e) => n + (e.kind === 'group' ? countApps(e.path, depth + 1) : 1), 0);
}

function uniqueChild(parent, name) {
    let p = join(parent, name), n = 2;
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    while (GLib.file_test(p, GLib.FileTest.EXISTS))
        p = join(parent, `${stem}-${n++}${ext}`);
    return p;
}

function nameError(name, parent, ignore) {
    if (!name)
        return _('Enter a name.');
    if (name.includes('/'))
        return _('The name cannot contain “/”.');
    if (name.startsWith('.'))
        return _('The name cannot start with a dot.');
    if (name !== ignore && GLib.file_test(join(parent, name), GLib.FileTest.EXISTS))
        return _('An item with this name already exists.');
    return null;
}

export class Groups {
    constructor(ext, root) {
        this.ext = ext;
        this.root = root;
        this.panel = null;
        this._dialog = null;
        this._bgItems = [];
        this._hl = null;
    }

    destroy() {
        this.close();
        this._sel?.close();
        this._dialog?.close();
        this._dialog = null;
        for (const item of this._bgItems) {
            try {
                item.destroy();   // if GNOME already destroyed the menu, the error is harmless
            } catch (e) {
                // already destroyed
            }
        }
        this._bgItems = [];
    }

    relName(path) {
        return path.startsWith(`${this.root}/`) ? path.slice(this.root.length + 1) : base(path);
    }

    allGroups(path = this.root, prefix = '') {
        const out = [];
        for (const e of entries(path).filter(x => x.kind === 'group')) {
            const name = prefix ? `${prefix} › ${e.name}` : e.name;
            out.push({path: e.path, label: name}, ...this.allGroups(e.path, name));
        }
        return out;
    }

    // All launchers and groups, also inside groups, with a readable path (“Apps › sport”).
    all(path = this.root, ctx = '', depth = 0) {
        const out = [];
        if (depth > 8)
            return out;
        for (const e of entries(path)) {
            if (e.kind === 'group') {
                out.push({kind: 'group', name: e.name, path: e.path, rel: this.relName(e.path), ctx});
                out.push(...this.all(e.path, ctx ? `${ctx} › ${e.name}` : e.name, depth + 1));
            } else {
                out.push({kind: 'app', name: e.app.get_name(), app: e.app, path: e.path, rel: this.relName(e.path), ctx});
            }
        }
        return out;
    }

    // ---- file operations --------------------------------------------------------

    _after() {
        this.ext._sync();
        if (this.panel)
            this._render();
    }

    _move(src, destDir) {
        if (src === destDir || destDir.startsWith(`${src}/`) || dir(src) === destDir)
            return false;
        const dest = uniqueChild(destDir, base(src));
        try {
            Gio.File.new_for_path(src).move(Gio.File.new_for_path(dest), Gio.FileCopyFlags.NONE, null, null);
        } catch (e) {
            console.error(`lovycairn: moving ${src} failed: ${e}`);
            return false;
        }
        if (dir(src) === this.root) {
            delete this.ext._pos[base(src)];
            delete this.ext._pos[`${base(src)}/`];
            this.ext._savePos();
        }
        return true;
    }

    moveInto(src, groupPath) {
        const ok = this._move(src, groupPath);
        this._after();
        return ok;
    }

    moveToDesktop(src) {
        this._move(src, this.root);
        this._after();
    }

    moveUp(src) {
        this._move(src, dir(dir(src)));
        this._after();
    }

    create(parent, name) {
        const p = join(parent, name);
        try {
            Gio.File.new_for_path(p).make_directory(null);
            Gio.File.new_for_path(join(p, MARKER)).create(Gio.FileCreateFlags.NONE, null).close(null);
        } catch (e) {
            console.error(`lovycairn: creating group ${p} failed: ${e}`);
            return null;
        }
        this._after();
        return p;
    }

    async newGroup(parent = this.root) {
        const name = await this.askName(_('New group'), '', _('Create'), parent);
        return name ? this.create(parent, name) : null;
    }

    async rename(path) {
        const old = base(path), parent = dir(path);
        const name = await this.askName(_('Rename group'), old, _('Rename'), parent, old);
        if (!name || name === old)
            return;
        try {
            Gio.File.new_for_path(path).set_display_name(name, null);
        } catch (e) {
            console.error(`lovycairn: renaming ${path} failed: ${e}`);
            return;
        }
        const renamed = join(parent, name);
        if (parent === this.root) {
            const pos = this.ext._pos;
            if (pos[`${old}/`]) {
                pos[`${name}/`] = pos[`${old}/`];
                delete pos[`${old}/`];
                this.ext._savePos();
            }
        }
        if (this.panel) {
            for (const k of ['root', 'path']) {
                if (this.panel[k] === path || this.panel[k].startsWith(`${path}/`))
                    this.panel[k] = renamed + this.panel[k].slice(path.length);
            }
        }
        this._after();
    }

    // Ungroup: the contents go one level up, then the empty folder goes to the trash.
    ungroup(path) {
        const parent = dir(path);
        try {
            const en = Gio.File.new_for_path(path).enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            const names = [];
            while ((info = en.next_file(null)))
                names.push(info.get_name());
            for (const n of names.filter(x => x !== MARKER))
                this._move(join(path, n), parent);
            Gio.File.new_for_path(path).trash(null);
        } catch (e) {
            console.error(`lovycairn: ungrouping ${path} failed: ${e}`);
        }
        if (this.panel && (this.panel.root === path || this.panel.root.startsWith(`${path}/`)))
            this.close();
        else if (this.panel && (this.panel.path === path || this.panel.path.startsWith(`${path}/`)))
            this.panel.path = parent;
        this._after();
    }

    // ---- name dialog ------------------------------------------------

    askName(title, initial, ok, parent, ignora = null) {
        return this.askText({
            title, initial, ok, hint: _('Group name'), validate: name => nameError(name, parent, ignora),
        });
    }

    // Dialog with a text field. `validate` returns an error message or null.
    askText({title, initial, ok, hint, validate, description = null, wide = false}) {
        return new Promise(resolve => {
            this._dialog?.close();
            const dlg = new ModalDialog({destroyOnClose: true});
            const entry = new St.Entry({
                text: initial, hint_text: hint, can_focus: true, style_class: 'gruppi-campo',
                style: `${MONO} padding: 6px 8px; min-width: ${wide ? 480 : 300}px;`,
            });
            const error = new St.Label({
                visible: false, style: `${MONO} color: ${P.danger}; font-size: 9pt; max-width: 480px;`,
            });
            error.clutter_text.set_line_wrap(true);
            const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style: 'spacing: 10px;'});
            box.add_child(new St.Label({
                text: title, style: `${MONO} color: ${P.ink}; font-weight: 600; font-size: 11pt;`,
            }));
            if (description) {
                const d = new St.Label({text: description, style: `${MONO} color: ${P.ink3}; font-size: 9pt; max-width: 480px;`});
                d.clutter_text.set_line_wrap(true);
                box.add_child(d);
            }
            box.add_child(entry);
            box.add_child(error);
            dlg.contentLayout.add_child(box);

            let done = false;
            const finish = value => {
                if (done)
                    return;
                done = true;
                this._dialog = null;
                dlg.close();
                resolve(value);
            };
            const confirm = () => {
                const testo = entry.get_text().trim();
                const err = validate(testo);
                if (err) {
                    error.set_text(err);
                    error.show();
                    return;
                }
                finish(testo);
            };
            dlg.setButtons([
                {label: _('Cancel'), action: () => finish(null), key: Clutter.KEY_Escape},
                {label: ok, action: confirm, default: true},
            ]);
            entry.clutter_text.connect('activate', confirm);
            dlg.connect('closed', () => finish(null));
            this._dialog = dlg;
            dlg.open();
            entry.grab_key_focus();
            entry.clutter_text.set_selection(0, -1);
        });
    }

    // Documentation addresses to open in the browser together with the project (space separated).
    async askDocs(path, current) {
        const testo = await this.askText({
            title: _('Project documentation'),
            description: _('Pages to open in the browser when you open the project. Separate them with a space. Leave empty to not open the browser.'),
            initial: current.join(' '), ok: _('Save'), hint: 'https://… https://…', wide: true,
            validate: t => {
                const url = t.split(/\s+/).filter(Boolean);
                const bad = url.find(u => !/^(https?|file):\/\/\S+$/.test(u) || u.includes(';'));
                return bad ? fmt(_('Invalid address: %s (must start with https://, http:// or file://)'), bad) : null;
            },
        });
        if (testo === null)
            return;
        const url = testo.split(/\s+/).filter(Boolean);
        this.setAppearance(path, 'project', 'X-LovyCairn-Docs', url.length ? url.join(';') : null);
    }

    // ---- appearance: color and icon --------------------------------------------------------

    // Save color or icon: in the launcher (projects) or in the marker file (groups); then redraw.
    setAppearance(path, kind, key, value) {
        try {
            if (kind === 'group') {
                const r = readMarker(path);
                const k = key === 'X-LovyCairn-Icon' ? 'icon' : 'color';
                if (value)
                    r[k] = value;
                else
                    delete r[k];
                GLib.file_set_contents(join(path, MARKER),
                    Object.entries(r).map(([n, v]) => `${n}=${v}\n`).join(''));
            } else {
                const kf = new GLib.KeyFile();
                kf.load_from_file(path, GLib.KeyFileFlags.KEEP_COMMENTS | GLib.KeyFileFlags.KEEP_TRANSLATIONS);
                if (value)
                    kf.set_string('Desktop Entry', key, value);
                else {
                    try { kf.remove_key('Desktop Entry', key); } catch (_e) { /* the key was not there */ }
                }
                kf.save_to_file(path);
            }
        } catch (e) {
            console.error(`lovycairn: appearance of ${path}: ${e}`);
            return;
        }
        this._after();
    }

    addDocsMenu(menu, path, docs) {
        const n = docs.length;
        menu.addAction(n ? fmt(ngettext('Docs in browser (%s page)…', 'Docs in browser (%s pages)…', n), n) : _('Docs in browser…'),
            () => this.askDocs(path, docs));
    }

    // Two rows in the menu: a row of color dots and a row of shapes.
    // The row heading shows the name of whatever is under the pointer.
    addAppearanceMenu(menu, path, kind, current) {
        const row = (title, buttons) => {
            const item = new PopupMenu.PopupBaseMenuItem({activate: false, can_focus: false});
            const colonna = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style: 'spacing: 6px; padding: 2px 0;'});
            const heading = new St.Label({text: title, style: `color: ${P.ink3}; font-size: 9pt;`});
            const fila = new St.BoxLayout({style: 'spacing: 5px;'});
            for (const [b, name] of buttons) {
                b.connect('notify::hover', () => heading.set_text(b.hover ? `${title} · ${name}` : title));
                fila.add_child(b);
            }
            colonna.add_child(heading);
            colonna.add_child(fila);
            item.add_child(colonna);
            menu.addMenuItem(item);
        };
        const choose = (key, value) => {
            this.setAppearance(path, kind, key, value);
            this.ext._menu?.close();
        };
        const base = kind === 'group' ? GROUP_COLOR : PROJECT_COLOR;

        row(_('Color'), COLORS.map(([name, hex]) => {
            const chosen = (current.color ?? null) === hex;
            const b = new St.Button({
                reactive: true, can_focus: true, width: 18, height: 18,
                label: hex ? '' : 'A',
                style: `${MONO} border-radius: 9px; font-size: 8px; ` +
                    `color: ${P.ink3}; background-color: ${hex ?? 'transparent'}; ` +
                    `border: 2px solid ${chosen ? P.ink : (hex ? 'transparent' : P.line2)};`,
            });
            b.connect('clicked', () => choose('X-LovyCairn-Color', hex));
            return [b, _(name)];
        }));

        const isGroupKind = kind === 'group';
        row(_('Shape'), (isGroupKind ? GROUP_ICONS : ICONS).map(([name, id]) => {
            const chosen = (current.icon ?? (isGroupKind ? GROUP_ICON : PROJECT_ICON)) === id;
            const ic = new St.Icon({icon_size: 16});
            applyIcon(ic, id, current.color, base, isGroupKind ? GROUP_ICONS : ICONS, isGroupKind ? GROUP_ICON : PROJECT_ICON);
            const b = new St.Button({
                reactive: true, can_focus: true, width: 26, height: 26, child: ic,
                style: `border-radius: 2px; border: 1px solid ${chosen ? P.ink : P.line}; ` +
                    `background-color: ${chosen ? P.surface3 : 'transparent'};`,
            });
            b.connect('clicked', () => choose('X-LovyCairn-Icon', id));
            return [b, _(name)];
        }));
    }

    // ---- menu: “Move to…” and the entry in the background menu ------------------------------------

    addMoveMenu(menu, src) {
        const sub = new PopupMenu.PopupSubMenuMenuItem(_('Move to…'));
        const groups = this.allGroups().filter(g =>
            g.path !== src && !g.path.startsWith(`${src}/`) && g.path !== dir(src));
        if (dir(src) !== this.root)
            sub.menu.addAction('Desktop', () => this.moveToDesktop(src));
        for (const g of groups)
            sub.menu.addAction(g.label, () => this.moveInto(src, g.path));
        sub.menu.addAction(_('New group…'), async () => {
            const p = await this.newGroup();
            if (p)
                this.moveInto(src, p);
        });
        menu.addMenuItem(sub);
    }

    // GNOME recreates the background menu (screen lock/unlock, monitor changes): the entry
    // is re-hooked whenever it is missing, so this method must be called periodically.
    hookBackground() {
        let added = 0;
        for (const bg of Main.layoutManager._bgManagers ?? []) {
            const menu = bg.backgroundActor?._backgroundMenu;
            if (!menu?.addAction || menu._groupsItem)
                continue;
            menu._groupsItem = menu.addAction(_('New group…'), () => this.newGroup());
            this._bgItems.push(menu._groupsItem);
            this._bgItems.push(menu.addAction(_('Add project…'), () => this.ext._askProject()));
            added++;
        }
    }

    // ---- dragging an icon onto a group --------------------------------------------

    _panelRect() {
        if (!this.panel)
            return null;
        const a = this.panel.actor;
        return [a.x, a.y, a.width, a.height];
    }

    // Group (or panel) under the center of the dragged icon.
    dropTarget(icon) {
        const cx = icon.x + icon.width / 2, cy = icon.y + icon.height / 2;
        const p = this._panelRect();
        if (p && cx >= p[0] && cx <= p[0] + p[2] && cy >= p[1] && cy <= p[1] + p[3])
            return {path: this.panel.path, panel: true};
        for (const [, g] of this.ext._icons) {
            if (!g._group || g === icon)
                continue;
            if (cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height)
                return {path: g._group, icon: g};
        }
        return null;
    }

    hover(icon) {
        const t = icon ? this.dropTarget(icon) : null;
        if (this._hl && this._hl !== t?.icon) {
            this._hl.set_style('padding: 6px; border-radius: 2px; border: 1px solid transparent;');
            this._hl = null;
        }
        if (t?.icon && this._hl !== t.icon) {
            t.icon.set_style(`padding: 6px; border-radius: 2px; border: 1px solid ${P.accentLine}; ` +
                `background-color: ${P.accentTint2};`);
            this._hl = t.icon;
        }
    }

    // Drop: move the file (or the group) into the target. True if it was moved.
    dropInto(icon, name, target) {
        const src = join(this.root, name.replace(/\/$/, ''));
        if (src === target.path || target.path.startsWith(`${src}/`))
            return false;
        return this.moveInto(src, target.path);
    }

    // ---- panel ------------------------------------------------------------------

    open(anchor, path) {
        if (this.panel?.root === path) {
            this.close();
            return;
        }
        this.close();
        this._build(anchor, path);
    }

    close() {
        if (!this.panel)
            return;
        if (this.panel.listener)
            global.stage.disconnect(this.panel.listener);
        this.panel.actor.destroy();
        this.panel = null;
    }

    // A click outside the panel closes it (like the ✕). It closes on the RELEASE of a click without movement, not on
    // press: so a desktop icon can still be dragged into the open panel. It does nothing if a
    // menu, a dialog or the picker is in front, nor for a click on the group icon
    // (which opens/closes by itself).
    _outsideEvent(ev) {
        const t = ev.type();
        const p = this.panel;
        if (!p || (t !== Clutter.EventType.BUTTON_PRESS && t !== Clutter.EventType.BUTTON_RELEASE))
            return Clutter.EVENT_PROPAGATE;
        if (Main.modalCount > 0 || this._dialog || this._sel)
            return Clutter.EVENT_PROPAGATE;
        const eventTarget = global.stage.get_event_actor(ev);
        const insideOf = a => !!eventTarget && (eventTarget === a || a.contains(eventTarget));
        const [x, y] = ev.get_coords();
        if (t === Clutter.EventType.BUTTON_PRESS) {
            const inMenu = !!this.ext._menu && insideOf(this.ext._menu.actor);
            p.outside = (!insideOf(p.actor) && !inMenu && !(p.anchor && insideOf(p.anchor))) ? {x, y} : null;
        } else if (p.outside) {
            const movedFar = Math.hypot(x - p.outside.x, y - p.outside.y) > 6;
            p.outside = null;
            if (!movedFar)
                this.close();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _button(text, fn) {
        const b = new St.Button({
            label: text, reactive: true, can_focus: true,
            style: `${MONO} color: ${P.ink2}; padding: 2px 8px; border: 1px solid ${P.line}; border-radius: 2px; ` +
                `background-color: ${P.surface2};`,
        });
        b.connect('clicked', fn);
        return b;
    }

    _build(anchor, path) {
        const actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, reactive: true, width: PANEL_W,
            style: `background-color: ${P.card}; border: 1px solid ${P.line2}; border-radius: 6px; ` +
                `padding: ${PANEL_PAD}px; box-shadow: 0 12px 32px rgba(0,0,0,0.55); ${MONO}`,
        });
        const head = new St.BoxLayout({style: 'spacing: 6px;'});
        const back = this._button('‹', () => {
            this.panel.path = dir(this.panel.path);
            this._render();
        });
        const title = new St.Label({
            x_expand: true, y_align: Clutter.ActorAlign.CENTER,
            style: `color: ${P.ink}; font-weight: 600; font-size: 10.5pt;`,
        });
        title.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        head.add_child(back);
        head.add_child(title);
        head.add_child(this._button('+', () => this.newGroup(this.panel.path)));
        head.add_child(this._button('✎', () => this.rename(this.panel.path)));
        head.add_child(this._button('✕', () => this.close()));
        const sub = new St.Label({style: `color: ${P.ink3}; font-size: 9pt; margin-top: 4px;`});
        const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style: 'spacing: 4px;'});
        const scroll = new St.ScrollView({
            style: 'max-height: 424px; margin-top: 8px;', overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        scroll.set_child(body);
        actor.add_child(head);
        actor.add_child(sub);
        actor.add_child(scroll);
        Main.uiGroup.add_child(actor);
        this.panel = {actor, root: path, path, title, sub, back, body, anchor, outside: null};
        this.panel.listener = global.stage.connect('captured-event', (_s, ev) => this._outsideEvent(ev));
        this._render();
        this._place();
    }

    _place() {
        const {actor, anchor} = this.panel;
        const W = global.stage.width, H = global.stage.height;
        let x = anchor.x + anchor.width + 12;
        if (x + PANEL_W > W - 12)
            x = Math.max(12, anchor.x - PANEL_W - 12);
        const h = actor.get_preferred_height(PANEL_W)[1];
        actor.set_position(Math.round(x), Math.round(Math.min(Math.max(12, anchor.y), Math.max(12, H - h - 12))));
    }

    _render() {
        const p = this.panel;
        if (!p)
            return;
        if (!GLib.file_test(p.path, GLib.FileTest.IS_DIR)) {
            this.close();
            return;
        }
        p.title.set_text(this.relName(p.path).split('/').join(' › '));
        p.back.visible = p.path !== p.root;
        const list = entries(p.path);
        const n = countApps(p.path);
        p.sub.set_text(list.length ? fmt(ngettext('%s item', '%s items', n), n) : '');
        p.body.destroy_all_children();
        if (!list.length) {
            p.body.add_child(new St.Label({
                text: _('Empty group. Drag desktop icons here, or use “Move to…” in their menu.'),
                style: `color: ${P.ink3}; font-size: 9.5pt; padding: 12px 0; max-width: 360px;`,
            }));
            p.body.get_first_child().clutter_text.set_line_wrap(true);
        }
        for (let i = 0; i < list.length; i += COLS) {
            const row = new St.BoxLayout({style: `spacing: ${ITEM_GAP}px;`});
            for (const e of list.slice(i, i + COLS))
                row.add_child(this._makeItem(e));
            p.body.add_child(row);
        }
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this.panel === p)
                this._place();
            return GLib.SOURCE_REMOVE;
        });
    }

    _makeItem(e) {
        const name = this.relName(e.path);
        const item = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, reactive: true, track_hover: true, width: ITEM_W, height: ITEM_H,
            style: 'padding: 6px; border-radius: 2px; border: 1px solid transparent;',
        });
        item._panelItem = true;
        item._icon = new St.Icon({icon_size: 40, x_align: Clutter.ActorAlign.CENTER});
        item._label = new St.Label({
            x_align: Clutter.ActorAlign.CENTER,
            style: `color: ${P.ink}; font-size: 10.5px; text-align: center;`,
        });
        item._label.clutter_text.set_line_wrap(true);
        item._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        item._status = new St.Label({x_align: Clutter.ActorAlign.CENTER, visible: false, style: 'font-size: 9.5px;'});
        item.add_child(item._icon);
        item.add_child(item._label);
        item.add_child(item._status);

        if (e.kind === 'group') {
            item._group = e.path;
            item._color = groupColor(e.path);
            applyGroupIcon(item._icon, e.path);
            item._label.set_text(e.name);
            const n = countApps(e.path);
            item._status.clutter_text.set_use_markup(false);
            item._status.set_text(fmt(ngettext('%s item', '%s items', n), n));
            item._status.set_style(`color: ${P.ink2}; font-size: 9.5px;`);
            item._status.visible = true;
        } else {
            item._app = e.app;
            item._project = e.app.get_string('X-LovyCairn-Path');
            item._icon.set_gicon(e.app.get_icon() ?? new Gio.ThemedIcon({name: 'application-x-executable'}));
            item._label.set_text(e.app.get_name());
            item._status.visible = !!item._project;
            if (item._project) {
                item._color = e.app.get_string('X-LovyCairn-Color');
                item._iconId = e.app.get_string('X-LovyCairn-Icon');
                applyIcon(item._icon, item._iconId, item._color);
            }
            this.ext._refreshGit(item);
        }

        item.connect('destroy', () => {
            item._dead = true;
        });
        item.connect('notify::hover', () => item.set_style(
            'padding: 6px; border-radius: 2px; ' +
            `border: 1px solid ${item.hover ? P.line2 : 'transparent'}; ` +
            `background-color: ${item.hover ? P.accentTint : 'transparent'};`));
        item.connect('button-press-event', (_a, ev) => {
            if (ev.get_button() === 3) {
                this.ext._showMenu(item, name);
                return Clutter.EVENT_STOP;
            }
            item._pressed = ev.get_button() === 1;
            return item._pressed ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });
        item.connect('button-release-event', (_a, ev) => {
            if (ev.get_button() !== 1 || !item._pressed)
                return Clutter.EVENT_PROPAGATE;
            item._pressed = false;
            if (item._group) {
                this.panel.path = item._group;
                this._render();
            } else {
                this.ext._launch(item, name);
            }
            return Clutter.EVENT_STOP;
        });
        return item;
    }

    // ---- quick picker (shortcut): search and open projects, apps and groups without the mouse ---------------

    openPicker() {
        if (this._sel) {
            this._sel.close();
            return;
        }
        const items = this.all();
        const dlg = new ModalDialog({destroyOnClose: true});
        const entry = new St.Entry({
            hint_text: _('Search a project, app or group…'), can_focus: true, style_class: 'gruppi-campo',
            style: `${MONO} padding: 8px 10px; min-width: 480px;`,
        });
        const listBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style: 'spacing: 2px; margin-top: 10px;'});
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        box.add_child(entry);
        box.add_child(listBox);
        dlg.contentLayout.add_child(box);

        let matches = [], sel = 0;
        const score = (v, q) => {
            const name = v.name.toLowerCase(), full = `${v.ctx} ${v.name}`.toLowerCase();
            if (!q)
                return v.kind === 'app' && v.app.get_string('X-LovyCairn-Path') ? 0 : v.kind === 'group' ? 1 : 2;
            if (name.startsWith(q))
                return 0;
            if (name.includes(q))
                return 1;
            if (full.includes(q))
                return 2;
            let i = 0;
            for (const c of full) {
                if (c === q[i])
                    i++;
            }
            return i === q.length ? 3 : -1;
        };
        const draw = () => {
            listBox.destroy_all_children();
            if (!matches.length) {
                listBox.add_child(new St.Label({
                    text: _('No results'), style: `${MONO} color: ${P.ink3}; font-size: 10px; padding: 8px 10px;`,
                }));
                return;
            }
            matches.forEach((v, i) => {
                const row = new St.BoxLayout({
                    reactive: true, style: `${MONO} spacing: 10px; padding: 6px 10px; border-radius: 2px; ` +
                        `border-left: 3px solid ${i === sel ? P.accent : 'transparent'}; ` +
                        `background-color: ${i === sel ? P.surface3 : 'transparent'};`,
                });
                const ic = new St.Icon({icon_size: 20});
                if (v.kind === 'group') {
                    applyGroupIcon(ic, v.path);
                } else if (v.app.get_string('X-LovyCairn-Path')) {
                    applyIcon(ic, v.app.get_string('X-LovyCairn-Icon'), v.app.get_string('X-LovyCairn-Color'));
                } else {
                    ic.set_gicon(v.app.get_icon() ?? new Gio.ThemedIcon({name: 'application-x-executable'}));
                }
                row.add_child(ic);
                row.add_child(new St.Label({
                    text: v.name, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
                    style: `color: ${P.ink}; font-size: 11px;`,
                }));
                const where = [v.kind === 'group' ? 'group' : '', v.ctx].filter(Boolean).join(' · ');
                if (where) {
                    row.add_child(new St.Label({
                        text: where, y_align: Clutter.ActorAlign.CENTER, style: `color: ${P.ink3}; font-size: 9.5px;`,
                    }));
                }
                row.connect('button-press-event', () => {
                    sel = i;
                    choose();
                    return Clutter.EVENT_STOP;
                });
                listBox.add_child(row);
            });
        };
        const applyFilter = () => {
            const q = entry.get_text().trim().toLowerCase();
            matches = items.map(v => [v, score(v, q)]).filter(([, s]) => s >= 0)
                .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).map(([v]) => v).slice(0, 8);
            sel = 0;
            draw();
        };
        const choose = () => {
            const v = matches[sel];
            if (!v)
                return;
            dlg.close();
            if (v.kind === 'group') {
                const top = v.rel.split('/')[0];
                const icon = this.ext._icons.get(`${top}/`);
                if (!icon)
                    return;
                this.close();
                this._build(icon, join(this.root, top));
                this.panel.path = v.path;
                this._render();
            } else {
                // minimal object with what _launch needs (same path as a click on the icon)
                const project = v.app.get_string('X-LovyCairn-Path');
                this.ext._launch({_app: v.app, _project: project}, v.rel);
            }
        };

        entry.clutter_text.connect('text-changed', applyFilter);
        entry.clutter_text.connect('activate', choose);
        entry.clutter_text.connect('key-press-event', (_a, ev) => {
            const k = ev.get_key_symbol();
            if (k === Clutter.KEY_Escape) {
                dlg.close();
                return Clutter.EVENT_STOP;
            }
            if (k === Clutter.KEY_Down || k === Clutter.KEY_Up) {
                sel = Math.max(0, Math.min(matches.length - 1, sel + (k === Clutter.KEY_Down ? 1 : -1)));
                draw();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        dlg.connect('closed', () => {
            this._sel = null;
        });
        this._sel = dlg;
        applyFilter();
        dlg.open();
        entry.grab_key_focus();
    }
}
