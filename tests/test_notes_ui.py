"""Notes palette interactions on the private GTK test display."""
import json
from pathlib import Path
import runpy
import tempfile
import unittest

from test_suite_ui import descendants, spin
from gi.repository import Adw, Gtk

notes = runpy.run_path(str(Path(__file__).resolve().parents[1]/'notes/lovycairn-notes'),run_name='lovycairn_notes_test')


class NotePaletteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Gtk.init(); Adw.init()
        cls.app = notes['NoteApp']()
        cls.app.register(None)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        namespace = notes['NoteApp'].load_state.__globals__
        namespace.update(NOTE_DIR=self.folder, STATE_FILE=self.folder/'.state.json', TRASH_DIR=self.folder/'.trash')
        self.path = self.folder/'test.md'
        self.path.write_text('A note with a pastel color\n')
        (self.folder/'older.md').write_text('An existing classic note\n')
        self.app.colors = {'older.md':'pink'}
        self.app.sizes = {}
        self.app.collapsed = set()
        self.app.open_note(self.path)
        self.window = self.app.windows[self.path]
        spin(.2)

    def tearDown(self):
        for window in list(self.app.windows.values()):
            window.close()
        spin(.1)
        self.temp.cleanup()

    def test_each_pastel_choice_is_applied_and_persisted_without_changing_classic_notes(self):
        picker = next(w for w in descendants(self.window) if isinstance(w,Gtk.MenuButton) and w.get_tooltip_text()=='Note color')
        choices = {w.get_tooltip_text():w for w in descendants(picker.get_popover()) if isinstance(w,Gtk.Button)}
        for name,key in [('Butter','pastel-yellow'),('Peach','pastel-orange'),('Blush','pastel-pink'),
                         ('Mint','pastel-green'),('Sky','pastel-blue'),('Lavender','pastel-lilac'),('Sand','pastel-gray')]:
            with self.subTest(color=name):
                self.assertIn(name,choices)
                choices[name].emit('clicked')
                saved = json.loads((self.folder/'.state.json').read_text())
                self.assertEqual(saved['colors'][self.path.name],key)
                self.assertEqual(self.window.color,key)
                self.assertEqual(saved['colors']['older.md'],'pink')

    def test_pastel_color_survives_reopening_and_picker_fits_a_note_window(self):
        self.app.colors[self.path.name] = 'pastel-green'
        self.app.save_state()
        self.window.close();spin()
        self.app.load_state()
        self.app.open_note(self.path)
        self.window = self.app.windows[self.path]
        spin(.2)
        self.assertEqual(self.window.color,'pastel-green')
        picker = next(w for w in descendants(self.window) if isinstance(w,Gtk.MenuButton) and w.get_tooltip_text()=='Note color')
        picker.popup();spin(.2)
        if picker.get_popover().get_width():
            self.assertLess(picker.get_popover().get_width(),340)


if __name__ == '__main__':
    unittest.main()
