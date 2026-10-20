// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

// Self-check. LovyCairn relies on a few internal parts of GNOME Shell that GNOME may change in a new release.
// At start-up each of them is probed: a feature whose part is missing is switched off (the rest keeps working) and
// the user gets ONE notification per GNOME version that says what is off and how to fix it.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as AppMenuModule from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {N_, fmt} from './util.js';

export const PROJECT_URL = 'https://github.com/bitfarmy/lovycairn';

const isFn = f => typeof f === 'function';

// [id, feature switched off when the probe fails, probe]
const PROBES = [
    ['desktop-layer', N_('Icons on the desktop'),
        () => isFn(Main.layoutManager?._backgroundGroup?.add_child) && isFn(Main.layoutManager.findMonitorForActor) &&
            isFn(Main.layoutManager.getWorkAreaForMonitor)],
    ['background-menu', N_('“New group…” in the desktop menu'),
        () => Array.isArray(Main.layoutManager._bgManagers) &&
            Main.layoutManager._bgManagers.every(bg => !bg.backgroundActor || isFn(bg.backgroundActor._backgroundMenu?.addAction))],
    ['app-menu', N_('“Add to Desktop” in the app menu'),
        () => isFn(AppMenuModule.AppMenu?.prototype?.setApp)],
    ['keybindings', N_('Keyboard shortcuts'),
        () => isFn(Main.wm?.addKeybinding) && isFn(Main.wm?.removeKeybinding)],
    ['menus', N_('Project menus'),
        () => isFn(PopupMenu.PopupMenu) && isFn(PopupMenu.PopupMenuSection) && isFn(PopupMenu.PopupSwitchMenuItem) &&
            isFn(St.ScrollView)],
    ['workspaces', N_('Opening projects in workspaces'),
        () => isFn(Main.activateWindow) && isFn(global.workspace_manager?.append_new_workspace)],
];

// Features that have no probe but can still fail at run time (an internal call that throws).
const RUNTIME = [
    ['groups', N_('Groups')],
    ['picker', N_('Quick picker')],
    ['git-monitor', N_('Git monitor')],
    ['launch', N_('Opening projects')],
    ['notes', N_('Notes on the desktop')],
];

export class Compat {
    constructor(ext, settings) {
        this._ext = ext;
        this._settings = settings;
        this._failed = new Map();   // id -> feature name
        this._errors = new Map();   // id -> error text (for the details)
        this._notifyTimer = 0;
    }

    destroy() {
        if (this._notifyTimer)
            GLib.source_remove(this._notifyTimer);
        this._notifyTimer = 0;
    }

    run() {
        this._failed.clear();
        for (const [id, feature, probe] of PROBES) {
            let ok = false;
            try {
                ok = !!probe();
            } catch (e) {
                ok = false;
            }
            if (!ok) {
                this._failed.set(id, feature);
                console.warn(`lovycairn: compatibility check failed: ${id}`);
            }
        }
        if (this._failed.size)
            this._scheduleNotify();
    }

    // A feature threw at run time: switch it off and tell the user (once per GNOME version and set of failures).
    fail(id, error) {
        if (this._failed.has(id))
            return;
        const feature = [...PROBES.map(p => [p[0], p[1]]), ...RUNTIME].find(f => f[0] === id)?.[1] ?? id;
        this._failed.set(id, feature);
        this._errors.set(id, `${error?.message ?? error}`);
        console.error(`lovycairn: ${id} failed: ${error}\n${error?.stack ?? ''}`);
        this._scheduleNotify();
    }

    // Several features can fail together at start-up: one notification for all of them.
    _scheduleNotify() {
        if (this._notifyTimer)
            return;
        this._notifyTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._notifyTimer = 0;
            this._notify();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Is the feature behind this probe available? (Ids that are not probes are always available.)
    ok(id) {
        return !this._failed.has(id);
    }

    get failed() {
        return [...this._failed.keys()];
    }

    // What to paste in an issue.
    details() {
        return [
            `LovyCairn ${this._ext.metadata['version-name'] ?? this._ext.metadata.version}`,
            `GNOME Shell ${Config.PACKAGE_VERSION}`,
            `Failed checks: ${this.failed.join(', ') || 'none'}`,
            ...[...this._errors].map(([id, e]) => `  ${id}: ${e}`),
        ].join('\n');
    }

    _notify() {
        // one notification per GNOME version and set of failures: it must not nag at every login
        const signature = `${Config.PACKAGE_VERSION}|${this.failed.join(',')}`;
        if (this._settings.get_string('compat-notified') === signature)
            return;
        this._settings.set_string('compat-notified', signature);

        const features = [...this._failed.values()].map(f => _(f)).join(', ');
        const title = _('LovyCairn: some features are off');
        const body = fmt(_('Turned off: %s.\n' +
            'GNOME Shell %s changed parts that LovyCairn relies on. How to fix: update LovyCairn to its latest version; ' +
            'if it is already the latest, open an issue and paste the details (“Copy details”).'), features, Config.PACKAGE_VERSION);
        try {
            const source = new MessageTray.Source({title: 'LovyCairn', iconName: 'dialog-warning-symbolic'});
            Main.messageTray.add(source);
            const notification = new MessageTray.Notification({source, title, body});
            notification.addAction(_('Open the project page'), () =>
                Gio.AppInfo.launch_default_for_uri(`${PROJECT_URL}/releases`, null));
            notification.addAction(_('Copy details'), () =>
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this.details()));
            source.addNotification(notification);
        } catch (e) {
            Main.notify(title, body);   // fallback if the notification API changed too
        }
    }
}
