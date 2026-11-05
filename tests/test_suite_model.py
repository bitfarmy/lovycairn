import sys, tempfile, unittest, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'suite'))
from lovycairn_suite.model import Store

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = Store(self.root/'Desktop', self.root/'Notes', self.root/'config')
        self.folder = self.root/'code $ special'; self.folder.mkdir()
    def test_preserves_unknown_localized_keys_and_identity_on_move(self):
        p = self.store.save_project(name='One', folder=self.folder)
        with p.launcher.open('a') as f: f.write('Name[it]=Uno\nX-Unknown=keep\\svalue\n')
        self.store.set_metadata(p, favorite=True, next_step='Ship')
        self.store.create_group('Team')
        q = self.store.save_project(p, name='Renamed', folder=self.folder, group='Team')
        self.assertIn('Name[it]=Uno', q.launcher.read_text())
        self.assertIn('X-Unknown=keep', q.launcher.read_text())
        self.assertEqual(self.store.metadata(q)['next_step'], 'Ship')
        self.assertFalse(p.launcher.exists())
    def test_collisions_duplicates_and_symlinks_rejected(self):
        p = self.store.save_project(name='One', folder=self.folder)
        with self.assertRaises(ValueError): self.store.save_project(name='Other', folder=self.folder)
        other=self.root/'other'; other.mkdir()
        with self.assertRaises(ValueError): self.store.save_project(name='One', folder=other)
        (self.store.desktop/'Escape').symlink_to(other, target_is_directory=True)
        with self.assertRaises(ValueError): self.store.save_project(name='Bad', folder=other, group='Escape')
        with self.assertRaises(ValueError): self.store.create_group('../escape')
        self.assertTrue(p.launcher.exists())
    def test_launcher_symlink_and_external_metadata_survive(self):
        p=self.store.save_project(name='One',folder=self.folder)
        other=self.root/'other'; other.mkdir()
        alias=self.root/'alias'; alias.symlink_to(self.folder,target_is_directory=True)
        with self.assertRaises(ValueError): self.store.save_project(name='Alias',folder=alias)
        self.store.set_metadata(p,favorite=True)
        target=self.store.config/'suite.json'; data=json.loads(target.read_text()); data['/external']={'next_step':'keep'}; target.write_text(json.dumps(data))
        self.store.set_metadata(p,next_step='next')
        self.assertEqual(json.loads(target.read_text())['/external']['next_step'],'keep')
        outside=self.root/'outside.desktop'; outside.write_text(p.launcher.read_text())
        p.launcher.unlink(); p.launcher.symlink_to(outside)
        self.assertEqual(self.store.projects(),[])
        with self.assertRaises(ValueError): self.store.save_project(p,name='One',folder=self.folder)
        self.assertIn('Name=One',outside.read_text())

    def test_corrupt_metadata_never_overwritten(self):
        p=self.store.save_project(name='One', folder=self.folder)
        self.store.config.mkdir(exist_ok=True)
        target=self.store.config/'suite.json'; target.write_text('{broken')
        with self.assertRaises(ValueError): self.store.set_metadata(p, favorite=True)
        self.assertEqual(target.read_text(), '{broken')
    def test_normalized_identity_exec_validation_and_corrupt_fields(self):
        from lovycairn_suite.model import identity
        alias=self.root/'alias'; alias.symlink_to(self.folder,target_is_directory=True)
        self.assertEqual(identity(alias),str(alias))
        p=self.store.save_project(name='One',folder=alias)
        self.assertIn('Exec=gio open',p.launcher.read_text())
        with self.assertRaises(ValueError): self.store.save_project(name='Missing',folder=self.root/'absent')
        with self.assertRaises(ValueError): self.store.save_project(p,name='One',folder=alias,docs=('javascript:bad',))
        self.store.config.mkdir(exist_ok=True)
        target=self.store.config/'suite.json'; target.write_text(json.dumps({str(alias):{'favorite': [], 'next_step':3}}))
        with self.assertRaises(ValueError): self.store.metadata(p)
        with self.assertRaises(ValueError): self.store.set_metadata(p,next_step='changed')
        self.assertEqual(json.loads(target.read_text())[str(alias)]['next_step'],3)

    def test_relink_rejects_destination_metadata_and_history_conflicts(self):
        p=self.store.save_project(name='One',folder=self.folder)
        self.store.set_metadata(p,favorite=True,next_step='Source',last_opened=123)
        destination=self.root/'destination'; destination.mkdir()
        for filename, record in [('suite.json',{'next_step':'Destination'}),('activity.json',456)]:
            with self.subTest(filename=filename):
                target=self.store.config/filename
                original=target.read_text(); records=json.loads(original)
                records[str(destination)]=record; target.write_text(json.dumps(records))
                before={path:path.read_bytes() for path in self.store.config.glob('*.json')}
                launcher=p.launcher.read_bytes()
                with self.assertRaisesRegex(ValueError,'metadata|history|activity'):
                    self.store.save_project(p,name='One',folder=destination)
                self.assertEqual(p.launcher.read_bytes(),launcher)
                for path, content in before.items(): self.assertEqual(path.read_bytes(),content)
                target.write_text(original)

    def test_new_tags_are_valid_notes_cli_tags_and_edits_preserve_existing(self):
        import re
        for index,name in enumerate(['API (test)','C++','☁','Caffè API']):
            with self.subTest(name=name):
                folder=self.root/str(index); folder.mkdir()
                project=self.store.save_project(name=name,folder=folder)
                self.assertIsNotNone(re.fullmatch(r'[\w-]+',project.tag))
                self.assertTrue(project.tag.strip('-'))
                with project.launcher.open('a') as stream: stream.write('X-LovyCairn-Tag=legacy-tag\n')
                updated=self.store.save_project(project,name=name,folder=folder)
                self.assertEqual(updated.tag,'legacy-tag')

    def test_hidden_names_rejected(self):
        with self.assertRaises(ValueError): self.store.create_group('.Work')
        with self.assertRaises(ValueError): self.store.save_project(name='.Work',folder=self.folder)
        self.assertEqual(self.store.projects(),[])
        self.assertEqual(self.store.groups(),[])

    def test_failed_relink_preserves_launcher_and_metadata(self):
        from unittest.mock import patch
        from lovycairn_suite import model
        p=self.store.save_project(name='One',folder=self.folder)
        self.store.set_metadata(p,favorite=True,next_step='Keep',last_opened=123)
        before_launcher=p.launcher.read_bytes()
        before_suite=(self.store.config/'suite.json').read_bytes()
        before_activity=(self.store.config/'activity.json').read_bytes()
        destination=self.root/'destination'; destination.mkdir()
        original=model.atomic_write
        failed=False
        def fail_activity_once(path,data,**kwargs):
            nonlocal failed
            if Path(path).name=='activity.json' and not failed:
                failed=True
                raise OSError('simulated full filesystem')
            return original(path,data,**kwargs)
        with patch.object(model,'atomic_write',side_effect=fail_activity_once):
            with self.assertRaises(OSError): self.store.save_project(p,name='Moved',folder=destination)
        self.assertEqual(p.launcher.read_bytes(),before_launcher)
        self.assertFalse((self.store.desktop/'Moved.desktop').exists())
        self.assertEqual((self.store.config/'suite.json').read_bytes(),before_suite)
        self.assertEqual((self.store.config/'activity.json').read_bytes(),before_activity)
        self.assertEqual(self.store.metadata(p)['next_step'],'Keep')

    def test_relink_transfers_metadata_and_notes_tags(self):
        p=self.store.save_project(name='One', folder=self.folder)
        self.store.set_metadata(p, favorite=True)
        new=self.root/'new'; new.mkdir()
        q=self.store.save_project(p,name='One',folder=new)
        self.assertTrue(self.store.metadata(q)['favorite'])
        self.store.notes_dir.mkdir(); (self.store.notes_dir/'note.md').write_text('# Title\nHello #one #caffè\n')
        note=self.store.notes()[0]
        self.assertEqual(note.title,'Title'); self.assertIn('one',note.tags); self.assertIn('caffè',note.tags)

if __name__ == '__main__': unittest.main()
