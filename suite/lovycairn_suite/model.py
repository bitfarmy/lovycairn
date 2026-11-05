"""Shared desktop launcher storage; project directories are never modified."""
from dataclasses import dataclass
from pathlib import Path
import gettext
import json
import os
import re
import tempfile
import math
from gi.repository import GLib, Gio

_ = gettext.gettext
ENTRY = 'Desktop Entry'


def identity(path):
    return os.path.abspath(os.path.expanduser(str(path)))


def read_json(path):
    try:
        value = json.loads(Path(path).read_text())
    except FileNotFoundError:
        return {}
    except (ValueError, OSError) as exc:
        raise ValueError(_('Cannot read data file: %s') % path) from exc
    if not isinstance(value, dict):
        raise ValueError(_('Expected a JSON object: %s') % path)
    return value


def atomic_write(path, data, *, replace=True):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            try: os.link(temporary, path)
            except FileExistsError as exc: raise ValueError(_('A file with this name already exists')) from exc
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def validate_metadata(item, activity=None):
    if not isinstance(item, dict) or ('favorite' in item and type(item['favorite']) is not bool) or ('next_step' in item and not isinstance(item['next_step'], str)):
        raise ValueError(_('Invalid project metadata'))
    if activity is not None and (type(activity) not in (int, float) or not math.isfinite(activity) or activity < 0):
        raise ValueError(_('Invalid project activity'))


def desktop_exec(folder):
    escaped = str(folder).replace('%', '%%')
    escaped = ''.join('\\' + char if char in '\\"`$' else char for char in escaped)
    return 'gio open "' + escaped + '"'


def keyfile(path):
    key = GLib.KeyFile()
    key.load_from_file(str(path), GLib.KeyFileFlags.KEEP_COMMENTS | GLib.KeyFileFlags.KEEP_TRANSLATIONS)
    return key


def value(key, name, default=''):
    try: return key.get_string(ENTRY, name)
    except GLib.Error: return default


@dataclass(frozen=True)
class Project:
    launcher: Path
    rel: str
    name: str
    path: Path
    tag: str
    color: str = ''
    shape: str = 'cube'
    docs: tuple = ()
    new_workspace: str | None = None
    group: str = ''


@dataclass(frozen=True)
class Group:
    path: Path
    rel: str
    name: str
    label: str


@dataclass(frozen=True)
class Note:
    path: Path
    title: str
    text: str
    tags: tuple
    mtime: float


class Store:
    def __init__(self, desktop=None, notes=None, config=None):
        self.desktop = Path(desktop or GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) or Path.home()/'Desktop').absolute()
        self.notes_dir = Path(notes or Path.home()/'Notes').expanduser().absolute()
        self.config = Path(config or Path(GLib.get_user_config_dir())/'lovycairn').absolute()
        self.desktop.mkdir(parents=True, exist_ok=True)

    def _managed(self, relative, directory=False):
        rel = Path(relative)
        if rel.is_absolute() or '..' in rel.parts: raise ValueError(_('Invalid desktop path'))
        current = self.desktop
        for part in rel.parts:
            current = current/part
            if current.is_symlink(): raise ValueError(_('Symbolic links cannot be managed'))
        if directory and current != self.desktop and (not (current/'.group').is_file() or (current/'.group').is_symlink()):
            raise ValueError(_('Select an existing project group'))
        return current

    def groups(self):
        result = []
        def visit(parent):
            for child in sorted(parent.iterdir()):
                if child.is_symlink() or not child.is_dir() or not (child/'.group').is_file() or (child/'.group').is_symlink(): continue
                rel = child.relative_to(self.desktop).as_posix()
                result.append(Group(child, rel, child.name, rel)); visit(child)
        visit(self.desktop)
        return result

    def projects(self):
        result = []
        for group in ['', *(g.rel for g in self.groups())]:
            for path in sorted((self.desktop/group).glob('*.desktop')):
                if path.is_symlink(): continue
                try:
                    key = keyfile(path); folder = value(key, 'X-LovyCairn-Path')
                    if not folder: continue
                    name = value(key, 'Name', path.stem)
                    result.append(Project(path, path.relative_to(self.desktop).as_posix(), name, Path(folder),
                        value(key, 'X-LovyCairn-Tag', re.sub(r'\s+', '-', name.lower())),
                        value(key, 'X-LovyCairn-Color'), value(key, 'X-LovyCairn-Icon', 'cube'),
                        tuple(x.strip() for x in value(key, 'X-LovyCairn-Docs').split(';') if x.strip()),
                        value(key, 'X-LovyCairn-NewWorkspace', None), group))
                except (GLib.Error, OSError): continue
        return result

    def notes(self):
        result = []
        if not self.notes_dir.is_dir(): return result
        for path in sorted(self.notes_dir.glob('*.md')):
            if path.is_symlink(): continue
            try:
                text = path.read_text(); title = next((line.lstrip('#').strip() for line in text.splitlines() if line.strip()), path.stem)
                tags = tuple(sorted(set(re.findall(r'(?<!\S)#([^\W]+[\w-]*|[\w-]+)', text, re.UNICODE))))
                result.append(Note(path, title, text, tags, path.stat().st_mtime))
            except (OSError, UnicodeError): continue
        return result

    def metadata(self, project):
        data = read_json(self.config/'suite.json'); activity = read_json(self.config/'activity.json')
        key = identity(project.path); item = data.get(key, {})
        validate_metadata(item, activity.get(key, 0))
        return {'favorite': False, 'next_step': '', **item, 'last_opened': activity.get(key, 0)}

    def set_metadata(self, project, **changes):
        if set(changes) - {'favorite', 'next_step', 'last_opened'}: raise ValueError(_('Unknown metadata field'))
        data = read_json(self.config/'suite.json'); key = identity(project.path)
        item = data.get(key, {})
        validate_metadata(item)
        validate_metadata({**item, **{k:v for k,v in changes.items() if k != 'last_opened'}}, changes.get('last_opened'))
        if 'last_opened' in changes:
            activity = read_json(self.config/'activity.json'); activity[key] = changes.pop('last_opened')
            atomic_write(self.config/'activity.json', json.dumps(activity, indent=2))
        data[key] = {**item, **changes}
        atomic_write(self.config/'suite.json', json.dumps(data, ensure_ascii=False, indent=2))

    def create_group(self, name, parent=''):
        self._valid_name(name)
        target = self._managed(parent, directory=True)/name
        if target.exists() or target.is_symlink(): raise ValueError(_('A file with this name already exists'))
        target.mkdir(); atomic_write(target/'.group', '{}\n')
        return next(g for g in self.groups() if g.path == target)

    @staticmethod
    def _valid_name(name):
        if not name or not name.strip() or name.startswith('.') or '/' in name or '\x00' in name or '\n' in name:
            raise ValueError(_('Enter a valid name'))

    def save_project(self, existing=None, *, name, folder, group='', color='', shape='cube', docs=(), new_workspace=None):
        self._valid_name(name)
        target = self._managed(group, directory=True)/(name+'.desktop')
        folder = Path(identity(folder))
        if not folder.is_dir(): raise ValueError(_('Choose an existing project folder'))
        if color and not re.fullmatch(r'#[0-9a-fA-F]{6}', color): raise ValueError(_('Invalid project color'))
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', shape): raise ValueError(_('Invalid project shape'))
        if any(not re.fullmatch(r'(?:https?|file)://[^\s;]+', url) for url in docs): raise ValueError(_('Invalid documentation address'))
        old = None
        if existing:
            old = self._managed(existing.rel)
            if not any(p.launcher == old for p in self.projects()): raise ValueError(_('Project is no longer available'))
        if (target.exists() or target.is_symlink()) and target != old: raise ValueError(_('A launcher with this name already exists'))
        for project in self.projects():
            if project.launcher != old and os.path.realpath(project.path) == os.path.realpath(folder): raise ValueError(_('This folder already has a project launcher'))
        data = read_json(self.config/'suite.json') if existing and identity(existing.path) != str(folder) else None
        activity = read_json(self.config/'activity.json') if data is not None else None
        if data is not None:
            validate_metadata(data.get(identity(existing.path), {}), activity.get(identity(existing.path), 0))
            if str(folder) in data or str(folder) in activity:
                raise ValueError(_('The destination folder already has saved metadata or activity. Choose another folder.'))
        key = keyfile(old) if old else GLib.KeyFile()
        fields = {'Type':'Application', 'Name':name, 'X-LovyCairn-Path':str(folder), 'X-LovyCairn-Color':color,
                  'X-LovyCairn-Icon':shape, 'X-LovyCairn-Docs':';'.join(docs)}
        if not old: fields.update({'Exec':desktop_exec(folder), 'Icon':'folder', 'X-LovyCairn-Tag':re.sub(r'[^\w-]+', '-', name.lower()).strip('-') or 'project'})
        if old and value(key, 'Exec') == desktop_exec(existing.path): fields['Exec'] = desktop_exec(folder)
        if new_workspace not in (None,'true','false'): raise ValueError(_('Invalid workspace preference'))
        for field, text in fields.items(): key.set_string(ENTRY, field, text)
        if new_workspace is None:
            try: key.remove_key(ENTRY,'X-LovyCairn-NewWorkspace')
            except GLib.Error: pass
        else: key.set_string(ENTRY,'X-LovyCairn-NewWorkspace',new_workspace)
        # Move metadata first, keeping the original launcher valid until every data
        # write succeeds. Roll back completed writes if a later operation fails.
        backups = []
        launcher_written = False
        previous_launcher = old.read_text() if old else None
        previous_mode = old.stat().st_mode & 0o777 if old else None
        try:
            if data is not None:
                old_id = identity(existing.path)
                for records, filename in ((data, 'suite.json'), (activity, 'activity.json')):
                    if old_id not in records: continue
                    path = self.config/filename
                    before = path.read_text() if path.exists() else None
                    records[str(folder)] = records.pop(old_id)
                    atomic_write(path, json.dumps(records, ensure_ascii=False, indent=2))
                    backups.append((path, before))
            atomic_write(target, key.to_data()[0], replace=target == old)
            launcher_written = True
            target.chmod(previous_mode if previous_mode is not None else 0o755)
            if old and old != target: old.unlink()
        except Exception as failure:
            rollback_errors = []
            if launcher_written:
                try:
                    if target == old:
                        atomic_write(old, previous_launcher)
                        old.chmod(previous_mode)
                    else:
                        target.unlink()
                except OSError as exc: rollback_errors.append(str(exc))
            for path, before in reversed(backups):
                try:
                    if before is None: path.unlink(missing_ok=True)
                    else: atomic_write(path, before)
                except OSError as exc: rollback_errors.append(str(exc))
            if rollback_errors:
                raise RuntimeError(_('Could not restore project data after a failed save: %s') % '; '.join(rollback_errors)) from failure
            raise
        return next(p for p in self.projects() if p.launcher == target)

    def trash_project(self, project):
        path = self._managed(project.rel)
        if not any(p.launcher == path for p in self.projects()): raise ValueError(_('Project is no longer available'))
        Gio.File.new_for_path(str(path)).trash(None)
