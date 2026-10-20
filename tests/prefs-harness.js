// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 LovyCairn contributors
// Opens the extension's preferences window outside the shell (used by tests/shot-prefs.sh): it registers the resources
// the GNOME Extensions app provides to prefs.js, then builds the real window from extension/prefs.js.
//   gjs -m tests/prefs-harness.js <extension-dir>
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
const dir = Gio.File.new_for_path(GLib.canonicalize_filename(ARGV[0], GLib.get_current_dir()));
const metadata = JSON.parse(new TextDecoder().decode(dir.get_child('metadata.json').load_contents(null)[1]));
const {default: Prefs} = await import(`${dir.get_uri()}/prefs.js`);

Adw.init();
const loop = GLib.MainLoop.new(null, false);
const app = new Adw.Application({application_id: 'test.lovycairn.prefs'});
app.connect('activate', () => {
    const prefs = new Prefs({...metadata, dir, path: dir.get_path()});
    const window = new Adw.PreferencesWindow({application: app, default_width: 640, default_height: 640, title: 'LovyCairn'});
    prefs.fillPreferencesWindow(window);
    window.present();
});
app.run([]);
