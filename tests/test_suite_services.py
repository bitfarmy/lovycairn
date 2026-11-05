import unittest, tempfile, subprocess, sys, os, json, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'suite'))
from lovycairn_suite.services import git_state, Launcher, make_settings
from lovycairn_suite.model import Store
class Settings:
    def __init__(self, **values): self.values=values
    def get_string(self,key): return self.values.get(key,'')
class ServicesTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup); self.root=Path(self.temp.name)
    def git(self,*args):
        return subprocess.check_output(['git','-C',str(self.root),*args],stderr=subprocess.DEVNULL)
    def test_actual_git_unborn_clean_rename_detached(self):
        self.assertEqual(git_state(self.root/'missing').state,'missing')
        self.assertEqual(git_state(self.root).state,'not-repository')
        self.git('init','-b','test'); self.assertEqual(git_state(self.root).branch,'test')
        (self.root/'old name').write_text('one'); self.git('add','.'); self.git('-c','user.name=Test','-c','user.email=test@local','commit','-m','initial')
        self.assertEqual(git_state(self.root).state,'clean')
        self.git('mv','old name','new\nname'); state=git_state(self.root)
        self.assertEqual(state.state,'changed'); self.assertEqual(state.files[0].path,'new\nname')
        self.git('checkout','--detach'); self.assertIn('detached',git_state(self.root).branch.lower())
    def test_real_commands_quote_substitution_and_notes_directory(self):
        out=self.root/'args.json'; script=self.root/'capture.py'
        script.write_text('import sys,json; from pathlib import Path; Path(sys.argv[1]).write_text(json.dumps(sys.argv[2:]))')
        command=f'/usr/bin/python3 "{script}" "{out}"'
        store=Store(self.root/'Desktop',self.root/'Notes',self.root/'config')
        folder=self.root/'code $ "quote'; folder.mkdir(); p=store.save_project(name='One',folder=folder)
        launch=Launcher(Settings(**{'editor-command':command+' "{dir}"','notes-command':command}),store)
        launch.open_editor(p)
        for _ in range(100):
            if out.exists(): break
            time.sleep(.01)
        self.assertEqual(json.loads(out.read_text()),[str(folder)])
        out.unlink(); launch.open_notes(tag='one',name='note.md',new=True)
        for _ in range(100):
            if out.exists(): break
            time.sleep(.01)
        self.assertEqual(json.loads(out.read_text()),['--notes-dir',str(store.notes_dir),'--tag','one','--open','note.md','--new'])
    def test_direct_fallback_real_session_bus_records_history(self):
        import shutil
        if not shutil.which('dbus-run-session'): self.skipTest('dbus-run-session unavailable')
        code = """
import tempfile, json, time
from pathlib import Path
from lovycairn_suite.model import Store
from lovycairn_suite.services import Launcher
class Settings:
 def get_string(self,key): return '/usr/bin/true' if key=='terminal-command' else ''
with tempfile.TemporaryDirectory() as root:
 root=Path(root); folder=root/'code'; folder.mkdir()
 store=Store(root/'Desktop',root/'Notes',root/'config')
 project=store.save_project(name='One',folder=folder)
 assert Launcher(Settings(),store).open_project(project)=='direct'
 assert store.metadata(project)['last_opened'] > time.time()-10
"""
        env={**os.environ,'PYTHONPATH':str(Path(__file__).resolve().parents[1]/'suite')}
        result=subprocess.run(['dbus-run-session','--','/usr/bin/python3','-c',code],env=env,capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_staged_installed_package_finds_extension_local_schema(self):
        import shutil
        source=Path(__file__).resolve().parents[1]
        data=self.root/'data'; installed=data/'lovycairn'/'suite'/'lovycairn_suite'
        installed.parent.mkdir(parents=True)
        shutil.copytree(source/'suite'/'lovycairn_suite',installed)
        schemas=data/'gnome-shell'/'extensions'/'lovycairn@bitfarmy.github.io'/'schemas'
        schemas.mkdir(parents=True)
        shutil.copy(source/'extension'/'schemas'/'org.gnome.shell.extensions.lovycairn.gschema.xml',schemas)
        subprocess.run(['glib-compile-schemas',str(schemas)],check=True)
        env={**os.environ,'HOME':str(self.root),'XDG_DATA_HOME':str(data),'PYTHONPATH':str(installed.parent),'GSETTINGS_BACKEND':'memory'}
        result=subprocess.run(['/usr/bin/python3','-c',"from lovycairn_suite.services import make_settings; assert make_settings().props.settings_schema.has_key('suite-theme')"],cwd=self.root,env=env,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_terminal_display_name_preserves_command_arguments(self):
        store=Store(self.root/'Desktop',config=self.root/'config')
        launch=Launcher(Settings(**{'terminal-command':'/opt/bin/lovyterm --cwd "{dir}"'}),store)
        self.assertEqual(launch.terminal_name(),'LovyTerm')
        self.assertEqual(launch._terminal(self.root),['/opt/bin/lovyterm','--cwd',str(self.root)])
        self.assertEqual(Launcher(Settings(**{'terminal-command':'kgx'}),store).terminal_name(),'Console')

    def test_command_errors_and_schema_fallback(self):
        store=Store(self.root/'Desktop',config=self.root/'config')
        for command in ['"unterminated','nonexistent-lovycairn-command']:
            with self.assertRaises(RuntimeError): Launcher(Settings(**{'notes-command':command}),store).open_notes()
        self.assertTrue(make_settings().props.settings_schema.has_key('terminal-command'))
        self.assertTrue(make_settings().props.settings_schema.has_key('suite-theme'))
if __name__=='__main__': unittest.main()
