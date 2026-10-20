// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

import GLib from 'gi://GLib';

// Marks a string for translation without translating it yet (used for module-level tables;
// the text is translated with _() when it is shown).
export const N_ = s => s;

// Minimal printf: replaces each %s / %d in order.
export function fmt(template, ...args) {
    let i = 0;
    return template.replace(/%[sd]/g, () => String(args[i++]));
}

export function readJson(path, fallback = {}) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? JSON.parse(new TextDecoder().decode(bytes)) : fallback;
    } catch (e) {
        return fallback;
    }
}

export function writeJson(path, data) {
    try {
        GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
        GLib.file_set_contents(path, JSON.stringify(data));
    } catch (e) {
        console.error(`lovycairn: writing ${path} failed: ${e}`);
    }
}

export const configPath = (...parts) => GLib.build_filenamev([GLib.get_user_config_dir(), 'lovycairn', ...parts]);
