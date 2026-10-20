// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors

// Finds the terminal, the browser and the notes app on this system. Each can be overridden in the preferences.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Known terminals: executable, arguments that open a NEW window in a directory.
const TERMINALS = [
    ['ptyxis', dir => ['ptyxis', '--new-window', '-d', dir]],
    ['kgx', dir => ['kgx', '--working-directory', dir]],
    ['gnome-terminal', dir => ['gnome-terminal', `--working-directory=${dir}`]],
    ['konsole', dir => ['konsole', '--workdir', dir]],
    ['kitty', dir => ['kitty', '--directory', dir]],
    ['alacritty', dir => ['alacritty', '--working-directory', dir]],
    ['foot', dir => ['foot', '--working-directory', dir]],
    ['wezterm', dir => ['wezterm', 'start', '--cwd', dir]],
    ['xterm', () => ['xterm']],
];

// Windows of these applications are remembered as belonging to a project (matched on the window class).
export const WINDOW_CLASSES = [
    ...TERMINALS.map(t => t[0]), 'org.gnome.ptyxis', 'org.gnome.console', 'firefox', 'chrome', 'chromium', 'brave',
    'epiphany', 'vivaldi', 'librewolf', 'zen',
];

const has = exe => !!GLib.find_program_in_path(exe);

// The command that opens a terminal in `dir`, as [argv, cwd]; null if no terminal is available.
// `custom` is a user command; `{dir}` in it is replaced by the folder.
export function terminalCommand(custom, dir) {
    if (custom?.trim()) {
        const [ok, argv] = GLib.shell_parse_argv(custom.trim());
        if (ok)
            return [argv.map(a => a.replaceAll('{dir}', dir)), dir];
    }
    for (const [exe, build] of TERMINALS) {
        if (has(exe))
            return [build(dir), dir];
    }
    return null;
}

// Commands that open `urls` in a new browser window.
export function browserCommands(custom, urls) {
    if (custom?.trim()) {
        const [ok, argv] = GLib.shell_parse_argv(custom.trim());
        if (ok)
            return [argv.some(a => a.includes('{url}'))
                ? argv.flatMap(a => (a === '{url}' ? urls : [a.replaceAll('{url}', urls[0])]))
                : [...argv, ...urls]];
    }
    const app = Gio.AppInfo.get_default_for_type('x-scheme-handler/https', false);
    const id = (app?.get_id() ?? '').toLowerCase();
    const exe = app?.get_executable?.();
    if (exe && /firefox|librewolf|zen/.test(id))
        return [[exe, '--new-window', urls[0]], ...urls.slice(1).map(u => [exe, '--new-tab', u])];
    if (exe && /chrome|chromium|brave|vivaldi/.test(id))
        return [[exe, '--new-window', ...urls]];
    return null;   // any other browser: the caller opens the addresses through the desktop's default handler
}

// The notes app: the user's command, else `lovycairn-notes` from the PATH; null if it is not installed.
export function notesCommand(custom) {
    if (custom?.trim()) {
        const [ok, argv] = GLib.shell_parse_argv(custom.trim());
        if (ok)
            return argv;
    }
    return has('lovycairn-notes') ? ['lovycairn-notes'] : null;
}

export function spawn(argv, cwd = null) {
    try {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        if (cwd)
            launcher.set_cwd(cwd);
        launcher.spawnv(argv);
        return true;
    } catch (e) {
        console.error(`lovycairn: ${argv[0]} not started: ${e}`);
        return false;
    }
}
