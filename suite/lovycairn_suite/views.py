# SPDX-License-Identifier: GPL-3.0-or-later
"""Native widgets and explicit-save forms shared by the suite views."""
from gettext import gettext as _
from pathlib import Path
import re

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Adw, Gdk, Gio, GLib, Gtk, Pango


def label(text='', style=None, wrap=False):
    widget = Gtk.Label(label=str(text), xalign=0, wrap=wrap)
    if wrap:
        widget.set_wrap_mode(Pango.WrapMode.WORD_CHAR)
    if style:
        widget.add_css_class(style)
    return widget


def button(text, callback, icon=None, style=None):
    widget = Gtk.Button(label=text)
    if icon:
        box = Gtk.Box(spacing=8)
        box.append(Gtk.Image.new_from_icon_name(icon))
        box.append(Gtk.Label(label=text))
        widget.set_child(box)
        widget.update_property([Gtk.AccessibleProperty.LABEL], [text])
    if style:
        widget.add_css_class(style)
    widget.connect('clicked', lambda *_: callback())
    return widget


def icon_button(icon, title, callback):
    widget = Gtk.Button(icon_name=icon, tooltip_text=title)
    widget.add_css_class('flat')
    widget.update_property([Gtk.AccessibleProperty.LABEL], [title])
    widget.connect('clicked', lambda *_: callback())
    return widget


def section(title, action=None):
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
    heading = Gtk.Box(spacing=12)
    text = label(title, 'title-3')
    text.set_hexpand(True)
    heading.append(text)
    if action:
        heading.append(action)
    box.append(heading)
    return box


def boxed_list():
    box = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE)
    box.add_css_class('boxed-list')
    return box


def panel(child):
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
    box.add_css_class('suite-panel')
    box.append(child)
    return box


def clear(box):
    child = box.get_first_child()
    while child:
        following = child.get_next_sibling()
        box.remove(child)
        child = following


def shortened(text, length=130):
    return text if len(text) <= length else text[:length-1] + '…'


class Form(Adw.Dialog):
    def __init__(self, window, title, save_label, save):
        super().__init__(title=title, content_width=560, content_height=580)
        self.window = window
        self.save = save
        self.fields = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=20,
                              margin_start=24, margin_end=24, margin_top=16, margin_bottom=24)
        toolbar = Adw.ToolbarView()
        header = Adw.HeaderBar()
        toolbar.add_top_bar(header)
        scroller = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER, vexpand=True)
        scroller.set_child(self.fields)
        toolbar.set_content(scroller)
        self.error = label('', 'error', wrap=True)
        self.error.set_visible(False)
        self.fields.append(self.error)
        header.pack_start(button(_('Cancel'), self.close))
        header.pack_end(button(save_label, self.submit, style='suggested-action'))
        self.set_child(toolbar)
        window.active_dialog = self
        self.connect('closed', lambda *_: window.dialog_closed(self))

    def submit(self):
        try:
            self.save(self)
        except (ValueError, OSError, GLib.Error) as exc:
            self.error.set_label(str(exc))
            self.error.set_visible(True)
            self.window.toast(str(exc))
            return
        self.close()

    def group(self, title=None):
        group = Adw.PreferencesGroup(title=title or '')
        self.fields.append(group)
        return group


class ProjectForm(Form):
    def __init__(self, window, project=None):
        self.project = project
        super().__init__(window, _('Edit project') if project else _('Add project'), _('Save'), self.save_project)
        basics = self.group(_('Project'))
        self.name = Adw.EntryRow(title=_('Name'), text=project.name if project else '')
        basics.add(self.name)
        self.folder = Adw.EntryRow(title=_('Project folder'), text=str(project.path) if project else '')
        self.folder.add_suffix(icon_button('folder-open-symbolic', _('Choose a folder'), self.choose_folder))
        basics.add(self.folder)
        groups = window.store.groups()
        self.group_values = ['', *(g.rel for g in groups)]
        current = project.group if project else (window.group_filter or '')
        self.destination = Adw.ComboRow(title=_('Group'), model=Gtk.StringList.new([_('Desktop'), *(g.label.replace('/', ' › ') for g in groups)]))
        self.destination.set_selected(self.group_values.index(current) if current in self.group_values else 0)
        basics.add(self.destination)
        appearance = self.group(_('Appearance'))
        self.color = Adw.EntryRow(title=_('Color (#rrggbb, or empty)'), text=project.color if project else '')
        appearance.add(self.color)
        self.shapes = ['cube','folder-code','board','flag','folder-solid','stack','grid','star','git','penguin','code','container','gear','network','android','phone','keyboard','skull','padlock','key','eye','hacker','download','music','pictures','video','games','shield','bolt','book','cloud','target','house','chip','bug','database','package-x-generic','applications-engineering','utilities-terminal','network-server','applications-science']
        if project and project.shape not in self.shapes:
            self.shapes.append(project.shape)
        shape_names = {
            'cube':_('Cube'), 'folder-code':_('Folder with code'), 'board':_('Board'), 'flag':_('Flag'),
            'folder-solid':_('Folder'), 'stack':_('Stack'), 'grid':_('Grid'), 'star':_('Star'),
            'git':_('Git'), 'penguin':_('Penguin'), 'code':_('Code'), 'container':_('Container'),
            'gear':_('Gear'), 'network':_('Network'), 'android':_('Android'), 'phone':_('Phone'),
            'keyboard':_('Keyboard'), 'skull':_('Skull'), 'padlock':_('Padlock'), 'key':_('Key'),
            'eye':_('Eye'), 'hacker':_('Hacker'), 'download':_('Download'), 'music':_('Music'),
            'pictures':_('Pictures'), 'video':_('Video'), 'games':_('Games'), 'shield':_('Shield'),
            'bolt':_('Bolt'), 'book':_('Book'), 'cloud':_('Cloud'), 'target':_('Target'), 'house':_('House'),
            'chip':_('Chip'), 'bug':_('Bug'), 'database':_('Database'), 'package-x-generic':_('Package'),
            'applications-engineering':_('Engineering'), 'utilities-terminal':_('Terminal'),
            'network-server':_('Server'), 'applications-science':_('Laboratory'),
        }
        self.shape = Adw.ComboRow(title=_('Icon'), model=Gtk.StringList.new([shape_names.get(shape,_('Current icon')) for shape in self.shapes]))
        self.shape.set_selected(self.shapes.index(project.shape) if project else 0)
        appearance.add(self.shape)
        links = self.group(_('Documentation'))
        self.docs = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD_CHAR, top_margin=10, bottom_margin=10, left_margin=10, right_margin=10)
        self.docs.set_size_request(-1, 100)
        self.docs.get_buffer().set_text('\n'.join(project.docs) if project else '')
        self.docs.add_css_class('view')
        links.add(self.docs)
        self.fields.append(label(_('One http, https or file address per line.'), 'dim-label', True))
        self.workspaces = [None, 'true', 'false']
        self.workspace = Adw.ComboRow(title=_('Workspace'), model=Gtk.StringList.new([_('Use global preference'), _('New workspace'), _('Current workspace')]))
        self.workspace.set_selected(self.workspaces.index(project.new_workspace) if project and project.new_workspace in self.workspaces else 0)
        self.group(_('Opening a project')).add(self.workspace)

    def choose_folder(self):
        chooser = Gtk.FileDialog(title=_('Choose a project folder'))
        typed = self.folder.get_text().strip()
        if typed and Path(typed).expanduser().is_dir():
            chooser.set_initial_folder(Gio.File.new_for_path(str(Path(typed).expanduser())))
        chooser.select_folder(self.window, None, self.folder_chosen)

    def folder_chosen(self, chooser, result):
        try:
            selected = chooser.select_folder_finish(result)
            path = selected.get_path() if selected else None
            if path:
                self.folder.set_text(path)
                if not self.name.get_text().strip():
                    self.name.set_text(Path(path).name)
        except GLib.Error:
            pass

    def save_project(self, _form):
        buf = self.docs.get_buffer()
        text = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False)
        urls = tuple(line.strip() for line in text.splitlines() if line.strip())
        if any(not re.fullmatch(r'(?:https?|file)://[^\s;]+', url) for url in urls):
            raise ValueError(_('Enter valid documentation addresses.'))
        color = self.color.get_text().strip()
        if color and not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
            raise ValueError(_('The color must look like #3a9bec.'))
        folder = Path(self.folder.get_text().strip()).expanduser()
        if not self.folder.get_text().strip() or not folder.is_dir():
            raise ValueError(_('Choose an existing project folder.'))
        result = self.window.store.save_project(self.project, name=self.name.get_text().strip(), folder=folder,
            group=self.group_values[self.destination.get_selected()], color=color,
            shape=self.shapes[self.shape.get_selected()], docs=urls,
            new_workspace=self.workspaces[self.workspace.get_selected()])
        self.window.selected_project = result
        self.window.refresh()
        self.window.show_project(result)


class NextStepForm(Form):
    def __init__(self, window, project):
        self.project = project
        super().__init__(window, _('Where I left off'), _('Save'), self.save_step)
        self.fields.append(label(_('The next step for %s') % project.name, wrap=True))
        self.text = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD_CHAR, top_margin=16, bottom_margin=16, left_margin=16, right_margin=16)
        self.text.set_vexpand(True)
        self.text.set_size_request(-1, 220)
        self.text.add_css_class('view')
        self.text.get_buffer().set_text(window.safe_metadata(project).get('next_step', ''))
        self.fields.append(self.text)

    def save_step(self, _form):
        buf = self.text.get_buffer()
        text = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False).strip()
        self.window.save_next_step(self.project, text)


class GroupForm(Form):
    def __init__(self, window):
        super().__init__(window, _('New group'), _('Create'), self.create_group)
        self.name = Adw.EntryRow(title=_('Name'))
        self.group().add(self.name)

    def create_group(self, _form):
        result = self.window.store.create_group(self.name.get_text().strip())
        self.window.group_filter = result.rel
        self.window.refresh()
        self.window.show_projects('projects', result.rel)
