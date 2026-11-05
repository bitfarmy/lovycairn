"""Blocking services. Call Git and session D-Bus services outside the UI thread."""
from dataclasses import dataclass
from pathlib import Path
import gettext
import os
import shlex
import shutil
import subprocess
import tempfile
import time
import threading
from gi.repository import Gio, GLib
from .model import identity

_ = gettext.gettext
SCHEMA = 'org.gnome.shell.extensions.lovycairn'

@dataclass(frozen=True)
class GitFile:
    path: str
    status: str

@dataclass(frozen=True)
class GitState:
    state: str
    branch: str = ''
    files: tuple = ()
    ahead: int = 0
    behind: int = 0
    error: str = ''


def git_state(path):
    path = Path(path)
    if not path.is_dir(): return GitState('missing')
    env = {**os.environ, 'GIT_OPTIONAL_LOCKS':'0', 'LC_ALL':'C'}
    def run(*args):
        return subprocess.run(['git','-C',str(path),*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15,env=env)
    try:
        probe = run('rev-parse','--is-inside-work-tree')
        if probe.returncode:
            message = probe.stderr.decode(errors='replace').strip()
            return GitState('not-repository' if 'not a git repository' in message else 'error', error=message)
        result = run('status','--porcelain=v1','-z','--branch','--untracked-files=all')
        if result.returncode: return GitState('error',error=result.stderr.decode(errors='replace').strip())
        records = result.stdout.split(b'\0'); header = records.pop(0).decode(errors='replace')
        branch = header[3:]; ahead = behind = 0
        if branch.startswith(('No commits yet on ', 'Initial commit on ')): branch = branch.split(' on ',1)[1]
        elif branch.startswith('HEAD (no branch)'):
            rev = run('rev-parse','--short','HEAD').stdout.decode().strip(); branch = _('Detached HEAD (%s)') % rev
        else:
            import re
            match = re.search(r'\[([^]]+)\]',branch)
            if match:
                a=re.search(r'ahead (\d+)',match[1]); b=re.search(r'behind (\d+)',match[1])
                ahead=int(a[1]) if a else 0; behind=int(b[1]) if b else 0
            branch=branch.split('...')[0]
        files=[]; i=0
        while i<len(records):
            record=records[i]; i+=1
            if not record: continue
            status=record[:2].decode('ascii'); name=os.fsdecode(record[3:])
            files.append(GitFile(name,status))
            if 'R' in status or 'C' in status: i+=1
        return GitState('changed' if files else 'clean',branch,tuple(files),ahead,behind)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return GitState('error',error=str(exc))


def make_settings():
    source = Gio.SettingsSchemaSource.get_default()
    required = ('editor-command', 'default-workspace', 'suite-theme')
    def complete(candidate):
        return candidate is not None and all(candidate.has_key(key) for key in required)
    schema = source.lookup(SCHEMA, True) if source else None
    if not complete(schema):
        data_home = Path(os.environ.get('XDG_DATA_HOME', str(Path.home()/'.local/share')))
        installed = data_home/'gnome-shell/extensions/lovycairn@bitfarmy.github.io/schemas'
        if (installed/'gschemas.compiled').is_file():
            try:
                local = Gio.SettingsSchemaSource.new_from_directory(str(installed), source, False)
                candidate = local.lookup(SCHEMA, False)
                if complete(candidate): schema = candidate
            except GLib.Error:
                pass  # A valid source checkout can recover from a damaged install.
    if not complete(schema):
        directory = Path(__file__).resolve().parents[2]/'extension'/'schemas'
        if not (directory/(SCHEMA+'.gschema.xml')).is_file():
            raise RuntimeError(_('LovyCairn settings are missing or outdated. Reinstall LovyCairn.'))
        try:
            with tempfile.TemporaryDirectory(prefix='lovycairn-schema-') as target:
                for xml in directory.glob('*.gschema.xml'): shutil.copyfile(xml,Path(target)/xml.name)
                subprocess.run(['glib-compile-schemas','--strict',target],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                fallback = Gio.SettingsSchemaSource.new_from_directory(target,source,False)
                schema = fallback.lookup(SCHEMA,False)
        except (OSError,subprocess.CalledProcessError,GLib.Error) as exc:
            raise RuntimeError(_('Cannot load LovyCairn settings: %s') % exc) from exc
    if not complete(schema): raise RuntimeError(_('LovyCairn settings schema is unavailable or outdated. Reinstall LovyCairn.'))
    return Gio.Settings.new_full(schema,None,None)


class Launcher:
    def __init__(self, settings, store):
        self.settings=settings; self.store=store

    def _command(self, value):
        try: argv=shlex.split(value)
        except ValueError as exc: raise RuntimeError(_('Invalid command: %s') % exc) from exc
        if not argv: raise RuntimeError(_('Configure a command in Preferences'))
        return argv

    def _spawn(self, argv, cwd=None):
        try:
            process = subprocess.Popen(argv,cwd=cwd,stdin=subprocess.DEVNULL,close_fds=True)
            threading.Thread(target=process.wait, daemon=True).start()
        except (OSError,ValueError) as exc: raise RuntimeError(_('Cannot start %s: %s') % (argv[0],exc)) from exc

    def _terminal(self, path):
        custom=self.settings.get_string('terminal-command').strip()
        if custom: return [part.replace('{dir}',str(path)) for part in self._command(custom)]
        terminals=[('ptyxis',['--new-window','-d']),('kgx',['--working-directory']),('gnome-terminal',['--working-directory']),
                   ('konsole',['--workdir']),('kitty',['--directory']),('alacritty',['--working-directory']),
                   ('foot',['--working-directory']),('wezterm',['start','--cwd']),('xterm',[])]
        for executable,args in terminals:
            if shutil.which(executable): return [executable,*args,*([str(path)] if args else [])]
        raise RuntimeError(_('No terminal found. Configure a terminal command in Preferences.'))

    def terminal_name(self):
        try:
            executable = Path(self._terminal(self.store.desktop)[0]).name
            return {'lovyterm':'LovyTerm', 'kgx':'Console', 'ptyxis':'Ptyxis',
                    'gnome-terminal':'GNOME Terminal', 'konsole':'Konsole', 'kitty':'Kitty',
                    'alacritty':'Alacritty', 'foot':'Foot', 'wezterm':'WezTerm', 'xterm':'XTerm'}.get(executable, executable)
        except RuntimeError: return _('Not configured')

    def open_project(self, project, mode='auto'):
        if mode not in {'auto','new','here'}: raise RuntimeError(_('Invalid workspace mode'))
        if not any(p.rel==project.rel and p.path==project.path for p in self.store.projects()):
            raise RuntimeError(_('Project is no longer available'))
        unavailable = {'org.freedesktop.DBus.Error.ServiceUnknown','org.freedesktop.DBus.Error.NameHasNoOwner',
                       'org.freedesktop.DBus.Error.UnknownMethod','org.freedesktop.DBus.Error.UnknownObject',
                       'org.freedesktop.DBus.Error.UnknownInterface'}
        try:
            connection=Gio.bus_get_sync(Gio.BusType.SESSION,None)
            result=connection.call_sync('org.gnome.Shell','/io/github/bitfarmy/LovyCairn','io.github.bitfarmy.LovyCairn',
                'OpenProject',GLib.Variant('(ss)',(project.rel,mode)),GLib.VariantType.new('(b)'),Gio.DBusCallFlags.NONE,5000,None)
            if not result.unpack()[0]: raise RuntimeError(_('The extension rejected this project. Refresh the project list.'))
            return 'extension'
        except GLib.Error as exc:
            remote=Gio.DBusError.get_remote_error(exc)
            if remote not in unavailable and not exc.matches(Gio.io_error_quark(),Gio.IOErrorEnum.NOT_FOUND) and not exc.matches(Gio.io_error_quark(),Gio.IOErrorEnum.CONNECTION_REFUSED):
                raise RuntimeError(_('Cannot contact the LovyCairn extension: %s') % exc.message) from exc
        if not project.path.is_dir(): raise RuntimeError(_('The project folder does not exist: %s') % project.path)
        # Validate history before starting, so corrupt user data cannot be replaced.
        self.store.metadata(project)
        self._spawn(self._terminal(project.path),str(project.path))
        self.store.set_metadata(project,last_opened=time.time())
        self.open_docs(project)
        return 'direct'

    def open_notes(self, tag='', name=None, new=False, archive=False):
        command=self.settings.get_string('notes-command').strip() or 'lovycairn-notes'
        argv=self._command(command)
        directory=self.settings.get_string('notes-dir').strip() or str(self.store.notes_dir)
        argv.extend(['--notes-dir',str(Path(directory).expanduser())])
        if tag: argv.extend(['--tag',tag])
        if name is not None: argv.extend(['--open',str(name)])
        if new: argv.append('--new')
        if archive: argv.append('--archive')
        self._spawn(argv)

    def open_folder(self, path):
        try: Gio.AppInfo.launch_default_for_uri(Path(path).absolute().as_uri(),None)
        except GLib.Error as exc: raise RuntimeError(_('Cannot open folder: %s') % exc.message) from exc

    def open_editor(self, project):
        custom=self.settings.get_string('editor-command').strip()
        if not custom: raise RuntimeError(_('Configure an editor command in Preferences using {dir}.'))
        argv=[part.replace('{dir}',str(project.path)) for part in self._command(custom)]
        self._spawn(argv,str(project.path))

    def open_docs(self, project):
        urls=list(project.docs)
        if not urls: return
        from urllib.parse import urlparse
        if any(urlparse(url).scheme not in {'http','https','file'} for url in urls): raise RuntimeError(_('Documentation links must use http, https or file'))
        custom=self.settings.get_string('browser-command').strip()
        if custom:
            argv=self._command(custom)
            if any('{url}' in part for part in argv):
                argv=[url for part in argv for url in (urls if part=='{url}' else [part.replace('{url}',urls[0])])]
            else: argv.extend(urls)
            self._spawn(argv)
        else:
            for url in urls:
                try: Gio.AppInfo.launch_default_for_uri(url,None)
                except GLib.Error as exc: raise RuntimeError(_('Cannot open documentation: %s') % exc.message) from exc
