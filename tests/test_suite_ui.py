"""Native UI behavior on private data; run under Broadway with tests/run-suite-ui.sh."""
import os
import tempfile
import time
import unittest
from unittest import mock
import threading
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'suite'))
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Adw, Gio, GLib, Gtk
from lovycairn_suite.app import SuiteApplication, SuiteWindow
from lovycairn_suite.model import Store
from lovycairn_suite.services import make_settings, GitState, GitFile


def spin(seconds=.15):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        while GLib.MainContext.default().pending():
            GLib.MainContext.default().iteration(False)
        time.sleep(.005)


def descendants(widget):
    yield widget
    child = widget.get_first_child()
    while child:
        yield from descendants(child)
        child = child.get_next_sibling()


class NativeSuiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Gtk.init()
        Adw.init()
        cls.app = SuiteApplication()
        cls.app.register(None)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for name in ['Desktop', 'Notes', 'config', 'code/Atlas', 'code/Beta']:
            (self.root / name).mkdir(parents=True)
        self.store = Store(desktop=self.root/'Desktop', notes=self.root/'Notes', config=self.root/'config')
        self.settings = make_settings()
        self.window = SuiteWindow(self.app, self.store, self.settings)
        self.window.present()
        spin()

    def tearDown(self):
        self.window.close()
        spin()
        self.tmp.cleanup()

    def project(self, name):
        return self.store.save_project(name=name, folder=self.root/'code'/name)

    def test_empty_collection_offers_add_without_fake_recent_project(self):
        labels = [w.get_label() for w in descendants(self.window) if isinstance(w, Gtk.Label)]
        self.assertIn('No projects yet', labels)
        self.assertNotIn('LovyPC', labels)

    def test_search_filters_real_projects_and_detail_exposes_associated_notes(self):
        atlas, beta = self.project('Atlas'), self.project('Beta')
        (self.root/'Notes/atlas.md').write_text('Atlas note\n\n#'+atlas.tag)
        self.window.refresh()
        self.window.search_entry.set_text('beta')
        spin(.4)
        self.assertEqual([p.name for p in self.window.visible_projects], ['Beta'])
        self.window.show_project(atlas)
        spin()
        labels = [w.get_label() for w in descendants(self.window) if isinstance(w, Gtk.Label)]
        self.assertTrue(any('Atlas note' in label for label in labels))
        self.assertTrue(any('Where I left off' in label for label in labels))

    def test_favorite_and_next_step_survive_new_window(self):
        p = self.project('Atlas')
        self.window.show_project(p)
        self.window.toggle_favorite(p)
        self.window.save_next_step(p, 'Check the installation')
        self.window.close()
        spin()
        self.window = SuiteWindow(self.app, Store(desktop=self.root/'Desktop',notes=self.root/'Notes',config=self.root/'config'),self.settings)
        self.window.present()
        self.window.show_projects('favorites')
        spin()
        self.assertEqual([p.name for p in self.window.visible_projects], ['Atlas'])
        self.assertEqual(self.window.store.metadata(p)['next_step'], 'Check the installation')

    def test_settings_writes_shared_values_and_retains_custom_terminal(self):
        self.settings.set_string('terminal-command', '/custom/terminal --cwd {dir}')
        self.window.show_settings()
        spin()
        self.assertEqual(self.settings.get_string('terminal-command'), '/custom/terminal --cwd {dir}')
        self.window.apply_command('terminal-command', 'lovyterm --directory {dir}')
        self.assertEqual(self.settings.get_string('terminal-command'), 'lovyterm --directory {dir}')
        with self.assertRaises(ValueError):
            self.window.apply_command('terminal-command', 'lovyterm "')
        self.assertEqual(self.settings.get_string('terminal-command'), 'lovyterm --directory {dir}')

    def test_native_project_form_creates_and_edits_shared_launcher(self):
        self.window.new_project()
        form = self.window.active_dialog
        form.name.set_text('Atlas')
        form.folder.set_text(str(self.root/'code/Atlas'))
        form.submit()
        spin(.4)
        self.assertEqual([p.name for p in self.store.projects()], ['Atlas'])
        p = self.store.projects()[0]
        self.window.edit_project(p)
        form = self.window.active_dialog
        form.name.set_text('Renamed Atlas')
        form.submit()
        spin(.4)
        self.assertEqual([p.name for p in self.store.projects()], ['Renamed Atlas'])
        self.assertTrue((self.root/'code/Atlas').is_dir())

    def test_file_monitor_preserves_unsaved_next_step(self):
        p = self.project('Atlas')
        self.window.refresh()
        self.window.show_project(p)
        self.window.edit_next_step(p)
        form = self.window.active_dialog
        form.text.get_buffer().set_text('An unfinished draft')
        self.store.set_metadata(p, favorite=True)
        spin(.6)
        self.assertIs(self.window.active_dialog, form)
        buf = form.text.get_buffer()
        self.assertEqual(buf.get_text(buf.get_start_iter(),buf.get_end_iter(),False),'An unfinished draft')
        form.submit()
        spin(.3)
        self.assertEqual(self.store.metadata(p)['next_step'],'An unfinished draft')

    def test_remove_dialog_trashes_only_launcher(self):
        p = self.project('Atlas')
        self.window.refresh()
        self.window.confirm_remove(p)
        self.window.active_dialog.emit('response', 'remove')
        spin(.3)
        self.assertEqual(self.store.projects(), [])
        self.assertTrue((self.root/'code/Atlas').is_dir())

    def test_wide_project_details_place_git_beside_next_step(self):
        if os.environ.get('LOVYCAIRN_LAYOUT_TEST') != '1':
            self.skipTest('A Broadway browser client is required for allocation checks')
        p = self.project('Atlas')
        self.window.set_default_size(1180, 820)
        self.window.show_project(p)
        spin(.4)
        labels = {w.get_label():w for w in descendants(self.window) if isinstance(w,Gtk.Label)}
        left_ok, left = labels['Where I left off'].compute_bounds(self.window)
        right_ok, right = labels['Git status'].compute_bounds(self.window)
        self.assertTrue(left_ok and right_ok)
        self.assertLess(abs(left.get_y()-right.get_y()), 8)
        self.assertGreater(right.get_x(),left.get_x()+200)

    def test_documentation_uses_configured_browser_service(self):
        p = self.store.save_project(name='Atlas',folder=self.root/'code/Atlas',docs=('https://example.test/guide',))
        opened=[]
        self.window.launcher.open_docs=lambda project:opened.extend(project.docs)
        self.window.show_project(p)
        row=next(w for w in descendants(self.window) if isinstance(w,Adw.ActionRow) and w.get_title()=='https://example.test/guide')
        with mock.patch.object(Gio.AppInfo,'launch_default_for_uri',return_value=True):
            row.emit('activated')
            spin(.3)
        self.assertEqual(opened,['https://example.test/guide'])

    def test_git_sort_reorders_when_background_results_arrive(self):
        self.project('Atlas');self.project('Beta')
        gate=threading.Event()
        def delayed(path):
            gate.wait(2)
            return GitState('changed' if path.name=='Beta' else 'clean','main',
                (GitFile('first.py',' M'),GitFile('second.py',' M')) if path.name=='Beta' else ())
        with mock.patch('lovycairn_suite.app.git_state',side_effect=delayed):
            self.window.git.clear()
            self.window.sort=2
            self.window.refresh()
            self.assertEqual([p.name for p in self.window.visible_projects],['Atlas','Beta'])
            gate.set()
            spin(.7)
            self.assertEqual([p.name for p in self.window.visible_projects],['Beta','Atlas'])

    def test_note_search_survives_external_refresh(self):
        (self.root/'Notes/alpha.md').write_text('Alpha note')
        (self.root/'Notes/beta.md').write_text('Beta note')
        self.window.refresh();self.window.show_notes()
        search=next(w for w in descendants(self.window) if isinstance(w,Gtk.SearchEntry))
        search.set_text('Alpha');spin(.3)
        self.window.refresh()
        current=next(w for w in descendants(self.window) if isinstance(w,Gtk.SearchEntry))
        self.assertEqual(current.get_text(),'Alpha')

    def test_notes_archive_distinguishes_project_notes_from_free_and_orphan_notes(self):
        atlas=self.project('Atlas');beta=self.project('Beta')
        for name,text in [('free.md','A free note\n#personal'),('atlas.md','Atlas work\n#'+atlas.tag),
                          ('beta.md','Beta work\n#'+beta.tag),('orphan.md','Old work\n#removed-project')]:
            (self.root/'Notes'/name).write_text(text)
        self.window.refresh();self.window.show_notes()
        self.assertEqual({n.path.name for n in self.window.visible_notes},{'free.md','orphan.md'})
        self.window.show_notes('projects')
        self.assertEqual({n.path.name for n in self.window.visible_notes},{'atlas.md','beta.md'})
        self.window.select_notes_project(atlas.rel)
        self.assertEqual([n.path.name for n in self.window.visible_notes],['atlas.md'])
        self.window.refresh()
        self.assertEqual([n.path.name for n in self.window.visible_notes],['atlas.md'])

    def test_new_note_from_archive_uses_free_or_selected_project_context(self):
        atlas=self.project('Atlas')
        requests=[]
        self.window.launcher.open_notes=lambda **options:requests.append(options)
        self.window.refresh();self.window.show_notes()
        self.window.create_note_from_archive();spin(.2)
        self.assertEqual(requests[-1],{'new':True})
        self.window.show_notes('projects')
        self.window.select_notes_project(atlas.rel)
        self.window.create_note_from_archive();spin(.2)
        self.assertEqual(requests[-1],{'tag':atlas.tag,'new':True})

    def test_free_note_tag_filter_does_not_include_project_notes(self):
        atlas=self.project('Atlas')
        for name,text in [('one.md','One\n#idea'),('two.md','Two\n#later'),('project.md','Project\n#idea #'+atlas.tag)]:
            (self.root/'Notes'/name).write_text(text)
        self.window.refresh();self.window.show_notes()
        self.window.select_notes_tag('idea')
        self.assertEqual([n.path.name for n in self.window.visible_notes],['one.md'])

    def test_new_project_note_from_all_projects_asks_before_launching_editor(self):
        self.project('Atlas');beta=self.project('Beta')
        requests=[]
        self.window.launcher.open_notes=lambda **options:requests.append(options)
        self.window.refresh();self.window.show_notes('projects')
        self.window.create_note_from_archive();spin(.2)
        self.assertEqual(requests,[])
        form=self.window.active_dialog
        self.assertIsNotNone(form)
        form.project_choice.set_selected(1)
        form.submit();spin(.3)
        self.assertEqual(requests,[{'tag':beta.tag,'new':True}])

    def test_project_outline_and_automatic_color_match_desktop(self):
        p=self.store.save_project(name='Atlas',folder=self.root/'code/Atlas',shape='applications-science')
        self.window.refresh()
        row=next(w for w in descendants(self.window.project_list) if isinstance(w,Adw.ActionRow))
        image=next(w for w in descendants(row) if isinstance(w,Gtk.Image))
        self.assertEqual(image.get_icon_name(),'applications-science-symbolic')
        p=self.store.save_project(p,name='Atlas',folder=p.path,shape='cube')
        self.window.refresh()
        row=next(w for w in descendants(self.window.project_list) if isinstance(w,Adw.ActionRow))
        image=next(w for w in descendants(row) if isinstance(w,Gtk.Image))
        self.assertIn(b'#aeb5bf',image.get_gicon().get_bytes().get_data())

    def test_group_uses_its_desktop_shape_and_color(self):
        group=self.store.create_group('Lab')
        (group.path/'.group').write_text('icon=skull\ncolor=#e96ea9\n')
        self.window.refresh()
        candidate=next(w for w in descendants(self.window.nav) if isinstance(w,Gtk.Label) and w.get_label()=='Lab  0')
        image=candidate.get_parent().get_first_child()
        self.assertIsInstance(image.get_gicon(),Gio.BytesIcon)
        self.assertIn(b'#e96ea9',image.get_gicon().get_bytes().get_data())

    def test_note_uses_saved_color_dot_and_refreshes_after_editor_changes(self):
        note=self.root/'Notes/colored.md'
        note.write_text('Colored note')
        state=self.root/'Notes/.state.json'
        state.write_text('{"colors":{"colored.md":"pastel-green"}}')
        self.window.refresh();self.window.show_notes()
        def dot():
            row=next(w for w in descendants(self.window) if isinstance(w,Adw.ActionRow) and w.get_title()=='Colored note')
            return next(w for w in descendants(row) if isinstance(w,Gtk.Image))
        self.assertIsInstance(dot().get_gicon(),Gio.BytesIcon)
        self.assertIn(b'<circle',dot().get_gicon().get_bytes().get_data())
        self.assertIn(b'#bfe3cb',dot().get_gicon().get_bytes().get_data())
        state.write_text('{"colors":{"colored.md":"pink"}}')
        self.window.refresh()
        self.assertIn(b'#e879a8',dot().get_gicon().get_bytes().get_data())


if __name__ == '__main__':
    unittest.main()
