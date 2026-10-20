// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class LovyCairnPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const _ = text => this.gettext(text);
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: _('LovyCairn'), icon_name: 'preferences-system-symbolic'});
        window.add(page);

        const text = (group, key, title, subtitle) => {
            const row = new Adw.EntryRow({title});
            row.set_text(settings.get_string(key));
            row.connect('changed', () => settings.set_string(key, row.get_text().trim()));
            if (subtitle)
                row.set_tooltip_text(subtitle);
            group.add(row);
            return row;
        };

        const launch = new Adw.PreferencesGroup({
            title: _('Opening a project'),
            description: _('Leave a field empty to detect the right command automatically.'),
        });
        text(launch, 'terminal-command', _('Terminal command'), _('{dir} is replaced by the project folder, e.g. kitty --directory {dir}'));
        text(launch, 'browser-command', _('Browser command'), _('{url} is replaced by the address, e.g. firefox --new-window {url}'));
        page.add(launch);

        const notes = new Adw.PreferencesGroup({title: _('Notes')});
        const integration = new Adw.SwitchRow({
            title: _('Collapsed notes on the desktop'),
            subtitle: _('Draw collapsed notes as sticky icons and remember where note windows were.'),
        });
        settings.bind('notes-integration', integration, 'active', 0);
        notes.add(integration);
        text(notes, 'notes-command', _('Notes app command'), _('Empty: lovycairn-notes, if installed'));
        text(notes, 'notes-dir', _('Notes folder'), _('Empty: the Notes folder in your home'));
        page.add(notes);

        const keys = new Adw.PreferencesGroup({
            title: _('Shortcuts'),
            description: _('Edit with the keyboard shortcut syntax, for example &lt;Super&gt;j.'),
        });
        for (const [key, title] of [['quick-note', _('New note')], ['project-note', _('New note for the active project')],
            ['picker', _('Quick picker')]]) {
            const row = new Adw.EntryRow({title});
            row.set_text(settings.get_strv(key)[0] ?? '');
            row.connect('changed', () => {
                const value = row.get_text().trim();
                settings.set_strv(key, value ? [value] : []);
            });
            keys.add(row);
        }
        page.add(keys);
    }
}
