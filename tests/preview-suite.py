#!/usr/bin/env python3
"""Native screenshot fixture. Only run with the isolated HOME from run-suite-preview.sh."""
from pathlib import Path
import json
import os
import subprocess
import sys
import time

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'suite'))
from lovycairn_suite.app import SuiteApplication
from lovycairn_suite.model import Store
from lovycairn_suite.services import make_settings
from gi.repository import GLib

out = Path(os.environ['SUITE_PROOF_DIR'])
home = Path.home()
assert str(home).startswith('/tmp/lovycairn-suite-preview.'), 'Use the isolated runner'
store = Store(home/'Desktop',home/'Notes')
store.notes_dir.mkdir(parents=True)
for name in ['Desktop App','web','Lab']:
    store.create_group(name)
projects=[]
for name,group,color in [('LovyCairn','Desktop App','#95c4ac'),('LovyTerm','Desktop App','#95c4ac'),('App Ristoranti','web','#9dabbc'),('TramaMind','Lab','#c6b17f')]:
    folder=home/'projects'/name
    folder.mkdir(parents=True)
    subprocess.run(['git','init','-q','-b','main',str(folder)],check=True)
    (folder/'README.md').write_text('# '+name+'\n')
    p=store.save_project(name=name,folder=folder,group=group,color=color,docs=('https://github.com/bitfarmy/lovycairn',) if name=='LovyCairn' else ())
    projects.append(p)
store.set_metadata(projects[0],favorite=True,next_step='Verificare la nuova finestra insieme ai progetti sulla scrivania.',last_opened=time.time())
store.set_metadata(projects[1],favorite=True)
(store.notes_dir/'progetto.md').write_text('Un unico spazio per riprendere il lavoro\n\nProgetti, note e prossimo passo devono essere subito visibili.\n\n#'+projects[0].tag)
(store.notes_dir/'libera.md').write_text('Idee da tenere a portata di mano\n\nUn appunto libero, da ritrovare anche senza un progetto.\n\n#idee')
settings=make_settings()
settings.set_string('suite-theme','dark')
settings.set_string('terminal-command','lovyterm --directory {dir}')
app=SuiteApplication()
last=None

def control():
    global last
    if not app.window:
        return GLib.SOURCE_CONTINUE
    try:
        action=json.loads((out/'control.json').read_text())
    except (OSError,ValueError):
        return GLib.SOURCE_CONTINUE
    if action==last:
        return GLib.SOURCE_CONTINUE
    last=action
    w=app.window
    if w.active_dialog:
        w.active_dialog.close()
    w.settings.set_string('suite-theme',action.get('theme','dark'))
    w.set_default_size(action.get('width',1180),action.get('height',820))
    view=action.get('view','projects')
    if view=='detail': w.show_project(w.projects[0])
    elif view=='settings': w.show_settings()
    elif view=='notes': w.show_notes()
    elif view=='notes-projects': w.show_notes('projects')
    elif view=='add': w.show_projects();w.new_project()
    else: w.show_projects()
    def ready():
        (out/'ready.json').write_text(json.dumps({'action':action,'width':w.get_width(),'height':w.get_height()}))
        return False
    GLib.timeout_add(900,ready)
    return GLib.SOURCE_CONTINUE

GLib.timeout_add(200,control)
app.run([sys.argv[0]])
