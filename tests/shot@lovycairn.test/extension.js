// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

// Test helper (not part of LovyCairn): drives scenes inside the headless shell and takes screenshots.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const OUT = GLib.getenv('SHOT_DIR') ?? '/tmp';
const UUID = 'lovycairn@bitfarmy.github.io';
const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { r(); return GLib.SOURCE_REMOVE; }));
const say = m => console.log(`SHOT ${m}`);

function snap(name) {
    return new Promise(res => {
        try {
            const stream = Gio.File.new_for_path(`${OUT}/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
            new Shell.Screenshot().screenshot(false, stream, (o, r) => {
                try { o.screenshot_finish(r); } catch (e) { say(`error ${name}: ${e}`); }
                try { stream.close(null); } catch (e) { /* ignore */ }
                res();
            });
        } catch (e) { say(`exception ${name}: ${e}`); res(); }
    });
}

const finish = () => GLib.spawn_command_line_async(`touch ${OUT}/finished`);
const lc = () => Main.extensionManager.lookup(UUID).stateObj;

const SCENES = {
    // Loads the extension and checks that it came up: used by CI.
    async smoke() {
        await wait(6000);
        const info = Main.extensionManager.lookup(UUID);
        say(`extension state=${info.state} (1 = enabled) error=${info.error ?? 'none'}`);
        const ext = lc();
        say(`icons=${ext._icons.size} failedChecks=${ext._compat.failed.join(',') || 'none'}`);
        say(`group icons=${[...ext._icons.keys()].filter(k => k.endsWith('/')).join(',')}`);
        say(`keybindings=${ext._keys.join(',')}`);
        await snap('desktop');
    },

    // The screenshots used in the README.
    async demo() {
        await wait(6000);
        const ext = lc(), g = ext._groups;
        await snap('desktop');
        const work = ext._icons.get('work/');
        g.open(work, `${g.root}/work`); await wait(900); await snap('group');
        g.close(); await wait(400);
        const atlas = [...g.all()].find(v => v.rel === 'work/project-atlas-api.desktop');
        g.open(work, `${g.root}/work`); await wait(600);
        g.close();
        ext._showMenu(ext._icons.get('project-dotfiles.desktop'), 'project-dotfiles.desktop'); await wait(900); await snap('menu');
        ext._menu?.close(); await wait(400);
        // git monitor of a project with uncommitted changes
        g.open(work, `${g.root}/work`); await wait(500);
        ext._pos['git:work/project-atlas-api.desktop'] = [980, 250];
        ext._openMonitor({_project: GLib.build_filenamev([GLib.get_home_dir(), 'code', 'atlas-api']), _app: atlas.app}, 'work/project-atlas-api.desktop');
        await wait(2500); await snap('git');
        g.close(); await wait(300);
        g.openPicker(); await wait(900); await snap('picker');
        g._sel?.close(); await wait(400);
        ext._groups.newGroup(); await wait(900); await snap('dialog');
        g._dialog?.close(); await wait(300);
        say(`demo done; atlas=${!!atlas}`);
    },

    // The hero screenshot: a group panel and a git monitor open on a tidy desktop.
    async hero() {
        await wait(6000);
        const ext = lc(), g = ext._groups;
        const home = GLib.get_home_dir();
        const side = ext._icons.get('side projects/');
        const work = ext._icons.get('work/');
        g.open(work, `${g.root}/work`); await wait(900);
        const atlas = [...g.all()].find(v => v.rel === 'work/project-atlas-api.desktop');
        ext._pos['git:work/project-atlas-api.desktop'] = [980, 250];   // keeps the sticky notes in view
        ext._openMonitor({_project: `${home}/code/atlas-api`, _app: atlas.app}, 'work/project-atlas-api.desktop');
        await wait(2500);
        await snap('hero');
        say('hero done');
    },

    // A series of frames for the animated demo (README).
    async frames() {
        await wait(6000);
        const ext = lc(), g = ext._groups, home = GLib.get_home_dir();
        let n = 0;
        const frame = async (ms = 700) => { await wait(ms); await snap(`frame-${String(n++).padStart(2, '0')}`); };
        const work = ext._icons.get('work/');
        await frame(300); await frame(500);
        g.open(work, `${g.root}/work`); await frame(700); await frame(500);
        const atlas = [...g.all()].find(v => v.rel === 'work/project-atlas-api.desktop');
        ext._pos['git:work/project-atlas-api.desktop'] = [980, 250];
        ext._openMonitor({_project: `${home}/code/atlas-api`, _app: atlas.app}, 'work/project-atlas-api.desktop');
        await frame(1500); await frame(700);
        g.close(); await frame(500);
        const dot = ext._icons.get('project-dotfiles.desktop');
        ext._showMenu(dot, 'project-dotfiles.desktop'); await frame(900);
        ext._menu?.close(); g.setAppearance(`${g.root}/project-dotfiles.desktop`, 'project', 'X-LovyCairn-Color', '#e96ea9'); await frame(900);
        g.setAppearance(`${g.root}/project-dotfiles.desktop`, 'project', 'X-LovyCairn-Icon', 'flag'); await frame(900);
        g.openPicker(); await frame(900); await frame(500);
        g._sel?.close(); await frame(500);
        say(`frames=${n}`);
    },

    // The preferences window (it runs in its own process, on the shell's Wayland display).
    async prefs() {
        await wait(5000);
        Main.extensionManager.openExtensionPrefs(UUID, '', {});
        await wait(9000);
        for (const a of global.get_window_actors()) { const w = a.meta_window; say(`window: ${w.get_title()} class=${w.get_wm_class()} ${w.get_frame_rect().width}x${w.get_frame_rect().height} minimized=${w.minimized}`); }
        await snap('prefs');
        say('prefs opened');
    },

    // Opening a project: terminal, browser and workspace behavior, with fake commands that leave a trace.
    async launch() {
        await wait(5000);
        const ext = lc(), g = ext._groups, home = GLib.get_home_dir(), wm = global.workspace_manager;
        const trace = `${home}/trace`;
        GLib.mkdir_with_parents(trace, 0o755);
        ext._settings.set_string('terminal-command', `sh -c 'echo "$0" >> ${trace}/terminal.log' {dir}`);
        ext._settings.set_string('browser-command', `sh -c 'echo "$0" >> ${trace}/browser.log' {url}`);
        ext._settings.set_string('notes-command', `sh -c 'echo "$@" >> ${trace}/notes.log' notes`);
        const atlas = [...g.all()].find(v => v.rel === 'work/project-atlas-api.desktop');
        const proj = {_project: `${home}/code/atlas-api`, _app: atlas.app};
        const read = f => { try { return new TextDecoder().decode(GLib.file_get_contents(`${trace}/${f}`)[1]).trim().replace(/\n/g, ' ; '); } catch (e) { return '(none)'; } };
        say(`workspaces before=${wm.n_workspaces} active=${wm.get_active_workspace_index()}`);
        ext._launch(proj, 'work/project-atlas-api.desktop', 'here'); await wait(2500);
        say(`mode here  → workspaces=${wm.n_workspaces} active=${wm.get_active_workspace_index()} terminal=${read('terminal.log')} browser=${read('browser.log')}`);
        proj._lastLaunch = 0;
        ext._launch(proj, 'work/project-atlas-api.desktop', 'new'); await wait(2500);
        say(`mode new   → workspaces=${wm.n_workspaces} active=${wm.get_active_workspace_index()} (terminal lines: ${read('terminal.log').split(' ; ').length})`);
        // notes entry points
        ext._newNote('atlas-api'); ext._newNote('atlas-api', true); ext._projectNote(); await wait(1500);
        say(`notes → ${read('notes.log')}`);
        // adding a project from the code path used by the dialog
        GLib.mkdir_with_parents(`${home}/code/odd "name" $x`, 0o755);
        ext.addProject(`${home}/code/odd "name" $x`, 'odd project'); await wait(2500);
        say(`added project icon=${ext._icons.has('project-odd-project.desktop')} total=${ext._icons.size}`);
        const app = ext._icons.get('project-odd-project.desktop')?._app;
        say(`exec line parses: ${app?.get_commandline?.()}`);
        ext._askProject(); await wait(4000); await snap('add-project');
        for (const a of global.get_window_actors()) say(`window: ${a.meta_window.get_title()}`);
    },

    // Simulates an internal call that starts to throw (what GNOME 51 did with St.BoxLayout.vertical): the feature must
    // switch itself off, the rest must keep working and the notice must appear.
    async 'compat-runtime'() {
        await wait(5000);
        const ext = lc();
        const before = ext._icons.size;
        ext._makeIcon = () => { throw new Error('No property vertical on StBoxLayout (simulated)'); };
        for (const i of ext._icons.values()) i.destroy();
        ext._icons.clear();
        ext._sync(); ext._sync();   // the second call must be skipped, not throw again
        await wait(3000);
        say(`failedChecks=${ext._compat.failed.join(',')} before=${before} after=${ext._icons.size}`);
        say(`keybindings=${ext._keys.join(',')}`);
        say(`details=${ext._compat.details().replace(/\n/g, ' | ')}`);
        await snap('compat-runtime');
    },

    // Simulates GNOME removing an internal part and checks that the notice appears.
    async compat() {
        await wait(5000);
        const mgr = Main.extensionManager;
        mgr.disableExtension(UUID); await wait(1500);
        const saved = Main.layoutManager._bgManagers;
        Main.layoutManager._bgManagers = undefined;   // what a GNOME change could look like
        mgr.enableExtension(UUID); await wait(2500);
        const ext = lc();
        say(`failedChecks=${ext._compat.failed.join(',')}`);
        say(`icons=${ext._icons.size} (the rest keeps working)`);
        Main.messageTray.openTray?.(); await wait(800);
        await snap('compat');
        Main.layoutManager._bgManagers = saved;
    },
};

export default class Shot extends Extension {
    enable() {
        (async () => {
            try {
                Main.overview.hide();
                await (SCENES[GLib.getenv('SCENE') ?? 'smoke'] ?? SCENES.smoke)();
            } catch (e) {
                say(`scene error: ${e} ${e.stack}`);
            }
            finish();
        })();
    }

    disable() {}
}
