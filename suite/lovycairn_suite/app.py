# SPDX-License-Identifier: GPL-3.0-or-later
"""The native LovyCairn companion. Files remain shared with the extension."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import gettext
import json
import os
from pathlib import Path
import shlex
import sys
import time

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Adw, Gdk, Gio, GLib, Gtk

DOMAIN = 'lovycairn-suite'
for locale_dir in (os.environ.get('LOVYCAIRN_LOCALE_DIR'),
                   Path(os.environ.get('XDG_DATA_HOME', Path.home()/'.local/share'))/'locale',
                   '/usr/share/locale'):
    if locale_dir and gettext.find(DOMAIN, str(locale_dir)):
        gettext.bindtextdomain(DOMAIN, str(locale_dir))
        break
gettext.textdomain(DOMAIN)
_ = gettext.gettext

from .model import Store
from .services import Launcher, git_state, make_settings
from .views import Form, GroupForm, NextStepForm, ProjectForm, boxed_list, button, clear, icon_button, label, panel, section, shortened

APP_ID = 'io.github.bitfarmy.LovyCairn'
SHAPES = json.loads(Path(__file__).with_name('shapes.json').read_text())
CSS = '''
.suite-sidebar { padding: 12px 10px; background: alpha(@window_fg_color, .025); }
.suite-sidebar button { min-height: 34px; padding: 5px 12px; }
.suite-sidebar button.selected { background: alpha(@window_fg_color, .09); }
.suite-group-label { margin: 22px 12px 8px; font-size: 0.9em; }
.suite-page { padding: 30px 32px 36px; }
.suite-panel { background: @card_bg_color; border-radius: 12px; padding: 20px; }
.suite-projects row { min-height: 68px; }
.suite-projects row image { margin-right: 5px; }
.suite-meta { font-size: .9em; opacity: .8; }
.suite-git { font-size: .9em; }
.suite-identity { font-size: 1.15em; font-weight: bold; }
.suite-next-step { font-size: 1.08em; line-height: 1.6; }
.suite-file { font-family: monospace; font-size: .9em; }
.suite-note { padding: 5px 0; }
'''


def project_icon(project):
    return {'folder-code':'folder-documents-symbolic','code':'applications-engineering-symbolic',
            'git':'git-symbolic','network-server':'network-server-symbolic','phone':'phone-symbolic',
            'music':'audio-x-generic-symbolic','pictures':'image-x-generic-symbolic',
            'games':'applications-games-symbolic','book':'accessories-dictionary-symbolic',
            'cloud':'weather-overcast-symbolic','star':'starred-symbolic',
            'utilities-terminal':'utilities-terminal-symbolic'}.get(project.shape, 'folder-symbolic')


class SuiteWindow(Adw.ApplicationWindow):
    def __init__(self, app, store=None, settings=None, launcher=None):
        super().__init__(application=app, title='LovyCairn', default_width=1180, default_height=820)
        self.set_size_request(480, 420)
        self.settings = settings or make_settings()
        self.store = store or Store(notes=self.settings.get_string('notes-dir') or None)
        self.launcher = launcher or Launcher(self.settings, self.store)
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix='lovycairn')
        self.alive = True
        self.view = 'projects'
        self.group_filter = None
        self.selected_project = None
        self.query = ''
        self.notes_query = ''
        self.notes_section = 'free'
        self.notes_project_rel = None
        self.notes_tag = None
        self.visible_notes = []
        self.sort_refresh_id = 0
        self.sort = 0
        self.projects = []
        self.notes = []
        self.visible_projects = []
        self.git = {}
        self.git_pending = set()
        self.git_rows = {}
        self.monitors = []
        self.monitor_id = 0
        self.active_dialog = None
        self.pending_refresh = False
        self.search_entry = None
        self.command_entries = {}
        self._metadata_error = None
        self.toast_overlay = Adw.ToastOverlay()
        self.split = Adw.OverlaySplitView(min_sidebar_width=210, max_sidebar_width=224, sidebar_width_fraction=.2)
        self.sidebar = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.sidebar.add_css_class('suite-sidebar')
        self.nav = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
        sidebar_scroll = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER, vexpand=True)
        sidebar_scroll.set_child(self.nav)
        self.sidebar.append(sidebar_scroll)
        self.preferences_button = self.nav_button(_('Settings'), 'emblem-system-symbolic', self.show_settings)
        self.sidebar.append(self.preferences_button)
        location = label(_('Projects on your computer'), 'dim-label', True)
        location.set_margin_start(12)
        location.set_margin_top(16)
        location.set_margin_bottom(8)
        self.sidebar.append(location)
        self.split.set_sidebar(self.sidebar)
        self.content_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.split.set_content(self.content_box)
        self.toolbar = Adw.ToolbarView(content=self.split)
        header = Adw.HeaderBar()
        self.title_widget = Adw.WindowTitle(title='LovyCairn', subtitle=_('Your workspace'))
        brand = Gtk.Box(spacing=8)
        brand_image = Gtk.Image.new_from_icon_name(APP_ID)
        brand_image.set_pixel_size(28)
        source_icon = Path(__file__).resolve().parents[1]/'data'/('io.github.bitfarmy.LovyCairn.svg')
        if source_icon.exists():
            brand_image.set_from_file(str(source_icon))
        brand.append(brand_image)
        brand.append(self.title_widget)
        header.set_title_widget(brand)
        self.menu_button = icon_button('sidebar-show-symbolic', _('Show navigation'), lambda: self.split.set_show_sidebar(not self.split.get_show_sidebar()))
        header.pack_start(self.menu_button)
        self.back_button = icon_button('go-previous-symbolic', _('Back to projects'), lambda: self.show_projects('projects', self.group_filter))
        self.back_button.set_visible(False)
        header.pack_start(self.back_button)
        header.pack_end(icon_button('view-refresh-symbolic', _('Refresh'), self.reload_git))
        self.toolbar.add_top_bar(header)
        self.toast_overlay.set_child(self.toolbar)
        self.set_content(self.toast_overlay)
        self.detail_layout = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL,spacing=28,homogeneous=True)
        breakpoint = Adw.Breakpoint.new(Adw.BreakpointCondition.parse('max-width: 1000sp'))
        breakpoint.add_setter(self.split, 'collapsed', True)
        breakpoint.add_setter(self.detail_layout, 'orientation', Gtk.Orientation.VERTICAL)
        breakpoint.add_setter(self.detail_layout, 'homogeneous', False)
        self.add_breakpoint(breakpoint)
        self.split.connect('notify::collapsed', lambda *_: self.menu_button.set_visible(self.split.get_collapsed()))
        self.menu_button.set_visible(False)
        self.connect('close-request', self.on_close)
        self.settings_id = self.settings.connect('changed', self.settings_changed)
        shortcut = Gtk.ShortcutController()
        shortcut.set_scope(Gtk.ShortcutScope.MANAGED)
        shortcut.add_shortcut(Gtk.Shortcut.new(Gtk.ShortcutTrigger.parse_string('<Control>k'), Gtk.CallbackAction.new(self.focus_search)))
        self.add_controller(shortcut)
        self.apply_theme()
        self.refresh()

    def focus_search(self, *_):
        if self.view != 'projects' and self.view != 'favorites':
            self.show_projects()
        if self.search_entry:
            self.search_entry.grab_focus()
        return True

    def toast(self, text):
        if self.alive:
            self.toast_overlay.add_toast(Adw.Toast(title=str(text), timeout=5))

    def safe_metadata(self, project):
        try:
            return self.store.metadata(project)
        except (OSError, ValueError) as exc:
            if self._metadata_error != str(exc):
                self._metadata_error = str(exc)
                GLib.idle_add(lambda: (self.toast(str(exc)), False)[1])
            return {'favorite':False, 'next_step':'', 'last_opened':0}

    def apply_theme(self):
        scheme = {'system':Adw.ColorScheme.DEFAULT, 'light':Adw.ColorScheme.FORCE_LIGHT, 'dark':Adw.ColorScheme.FORCE_DARK}
        Adw.StyleManager.get_default().set_color_scheme(scheme.get(self.settings.get_string('suite-theme'), Adw.ColorScheme.DEFAULT))

    def settings_changed(self, _settings, key):
        if not self.alive:
            return
        entry = self.command_entries.get(key)
        if entry and entry.get_text().strip() == getattr(entry, '_saved_command', ''):
            entry._saved_command = self.settings.get_string(key)
            entry.set_text(entry._saved_command)
        if key == 'suite-theme':
            self.apply_theme()
        if key == 'notes-dir':
            self.store.notes_dir = Path(self.settings.get_string(key) or Path.home()/'Notes').expanduser().absolute()
            self.refresh()

    def schedule_refresh(self, *_):
        if not self.alive:
            return
        if self.monitor_id:
            GLib.source_remove(self.monitor_id)
        self.monitor_id = GLib.timeout_add(250, self.monitored_refresh)

    def monitored_refresh(self):
        self.monitor_id = 0
        if self.active_dialog:
            self.pending_refresh = True
        else:
            self.refresh()
        return GLib.SOURCE_REMOVE

    def dialog_closed(self, dialog):
        if self.active_dialog is dialog:
            self.active_dialog = None
        if self.pending_refresh:
            self.pending_refresh = False
            self.refresh()

    def watch(self):
        for monitor in self.monitors:
            monitor.cancel()
        self.monitors.clear()
        paths = [self.store.desktop, self.store.notes_dir, self.store.config]
        try:
            paths.extend(group.path for group in self.store.groups())
        except OSError:
            pass
        for path in paths:
            if not path.is_dir():
                path = path.parent
            try:
                monitor = Gio.File.new_for_path(str(path)).monitor_directory(Gio.FileMonitorFlags.NONE, None)
                monitor.connect('changed', self.schedule_refresh)
                self.monitors.append(monitor)
            except GLib.Error:
                pass

    def refresh(self):
        if not self.alive:
            return
        try:
            self.projects = self.store.projects()
            self.notes = self.store.notes()
        except (OSError, ValueError, GLib.Error) as exc:
            self.toast(str(exc))
        self.build_navigation()
        self.watch()
        if self.view == 'detail' and self.selected_project:
            selected = next((p for p in self.projects if p.launcher == self.selected_project.launcher), None)
            if selected:
                self.show_project(selected)
            else:
                self.show_projects()
        elif self.view == 'settings':
            # Changes from other processes update settings bindings, not rebuild draft fields.
            if not self.content_box.get_first_child():
                self.show_settings()
        elif self.view == 'notes':
            self.show_notes()
        else:
            self.show_projects(self.view, self.group_filter)

    def nav_button(self, title, icon, callback, selected=False):
        widget = button(title, callback, icon=icon, style='flat')
        widget.set_halign(Gtk.Align.FILL)
        if selected:
            widget.add_css_class('selected')
        return widget

    def build_navigation(self):
        clear(self.nav)
        self.nav.append(self.nav_button(_('All projects')+'  '+str(len(self.projects)), 'view-grid-symbolic', self.show_projects,
            self.view=='projects' and not self.group_filter))
        favorites = sum(bool(self.safe_metadata(p).get('favorite')) for p in self.projects)
        self.nav.append(self.nav_button(_('Favorites')+'  '+str(favorites), 'starred-symbolic', lambda: self.show_projects('favorites'), self.view=='favorites'))
        self.nav.append(self.nav_button(_('Notes')+'  '+str(len(self.notes)), 'text-x-generic-symbolic', self.show_notes, self.view=='notes'))
        group_label = label(_('Desktop groups'), 'dim-label')
        group_label.add_css_class('suite-group-label')
        self.nav.append(group_label)
        try:
            groups = self.store.groups()
        except OSError:
            groups = []
        for group in groups:
            count = sum(p.group == group.rel for p in self.projects)
            self.nav.append(self.nav_button(group.label.replace('/', ' › ')+'  '+str(count), 'folder-symbolic',
                lambda rel=group.rel: self.show_projects('projects', rel), self.group_filter==group.rel and self.view=='projects'))
        self.nav.append(self.nav_button(_('New group'), 'list-add-symbolic', self.new_group))
        if self.view == 'settings':
            self.preferences_button.add_css_class('selected')
        else:
            self.preferences_button.remove_css_class('selected')

    def page(self, title, subtitle='', action=None):
        clear(self.content_box)
        self.git_rows = {}
        self.back_button.set_visible(self.view=='detail')
        self.title_widget.set_subtitle(title)
        scroller = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER, vexpand=True, hexpand=True)
        clamp = Adw.Clamp(maximum_size=1160, tightening_threshold=900)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=28)
        box.add_css_class('suite-page')
        heading = Gtk.Box(spacing=18)
        titles = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, hexpand=True)
        titles.append(label(title, 'title-1', True))
        if subtitle:
            titles.append(label(subtitle, 'dim-label', True))
        heading.append(titles)
        if action:
            action.set_valign(Gtk.Align.CENTER)
            heading.append(action)
        box.append(heading)
        clamp.set_child(box)
        scroller.set_child(clamp)
        self.content_box.append(scroller)
        if self.split.get_collapsed():
            self.split.set_show_sidebar(False)
        return box

    def project_notes(self, project):
        return [n for n in self.notes if project.tag in n.tags]

    def show_projects(self, view='projects', group=None):
        self.view = view if view in ('projects','favorites') else 'projects'
        self.group_filter = group
        self.selected_project = None
        self.build_navigation()
        title = group.replace('/', ' › ') if group else (_('Favorites') if self.view=='favorites' else _('Projects'))
        page = self.page(title, _('Everything you need to resume your work.'),
                         button(_('Add project'), self.new_project, 'list-add-symbolic', 'suggested-action'))
        if self.view=='projects' and not group and not self.query:
            history = [(self.safe_metadata(p).get('last_opened',0),p) for p in self.projects]
            recent = max(history, key=lambda pair:pair[0], default=(0,None))
            if recent[0]:
                p = recent[1]
                resume = section(_('Resume here'))
                body = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
                body.append(label(p.name, 'title-3'))
                body.append(label(self.safe_metadata(p).get('next_step') or _('Open the project to continue.'), wrap=True))
                actions = Gtk.Box(spacing=8)
                actions.append(button(_('Open with %s') % self.launcher.terminal_name(), lambda: self.open_project(p), 'utilities-terminal-symbolic', 'suggested-action'))
                actions.append(button(_('Project details'), lambda: self.show_project(p), style='flat'))
                body.append(actions)
                resume.append(panel(body))
                page.append(resume)
        search_row = Gtk.Box(spacing=12)
        self.search_entry = Gtk.SearchEntry(placeholder_text=_('Search a project or folder'), hexpand=True)
        self.search_entry.set_text(self.query)
        self.search_entry.connect('search-changed', self.search_changed)
        search_row.append(self.search_entry)
        sort = Gtk.DropDown.new_from_strings([_('Recent'), _('Name'), _('Git changes')])
        sort.set_selected(self.sort)
        sort.set_tooltip_text(_('Sort projects'))
        sort.connect('notify::selected', self.sort_changed)
        search_row.append(sort)
        page.append(search_row)
        self.project_list = boxed_list()
        self.project_list.add_css_class('suite-projects')
        page.append(self.project_list)
        self.list_empty = Adw.StatusPage(title=_('No projects yet'), description=_('Add a folder to get started.'), icon_name='folder-new-symbolic')
        self.list_empty.set_child(button(_('Add project'), self.new_project, style='suggested-action'))
        page.append(self.list_empty)
        self.list_count = label('', 'dim-label')
        page.append(self.list_count)
        self.populate_projects()

    def search_changed(self, entry):
        self.query = entry.get_text()
        self.populate_projects()

    def sort_changed(self, dropdown, _pspec):
        self.sort = dropdown.get_selected()
        self.populate_projects()

    def populate_projects(self):
        clear(self.project_list)
        self.git_rows = {}
        query = self.query.casefold()
        items = [p for p in self.projects if (not self.group_filter or p.group==self.group_filter)
            and (self.view!='favorites' or self.safe_metadata(p).get('favorite'))
            and query in (p.name+' '+str(p.path)+' '+p.group).casefold()]
        if self.sort == 1:
            items.sort(key=lambda p:p.name.casefold())
        elif self.sort == 2:
            items.sort(key=lambda p:-len(self.git[str(p.path)][1].files) if str(p.path) in self.git else 0)
        else:
            items.sort(key=lambda p:-self.safe_metadata(p).get('last_opened',0))
        self.visible_projects = items
        self.project_list.set_visible(bool(items))
        self.list_empty.set_visible(not items)
        self.list_empty.set_title(_('No projects found') if query else _('No favorites yet') if self.view=='favorites' else _('No projects yet'))
        self.list_empty.set_description(_('Try another name or path.') if query else _('Use the star beside a project to keep it here.') if self.view=='favorites' else _('Add a folder to get started.'))
        self.list_empty.get_child().set_visible(not query and self.view!='favorites')
        self.list_count.set_label(_('1 project') if len(items)==1 else _('%s projects') % len(items))
        for p in items:
            row = Adw.ActionRow(title=GLib.markup_escape_text(p.name), subtitle=GLib.markup_escape_text(str(p.path)))
            row.set_activatable(True)
            row.set_subtitle_lines(1)
            image = Gtk.Image.new_from_icon_name(project_icon(p))
            image.set_pixel_size(24)
            row.add_prefix(image)
            self.apply_project_color(image,p)
            meta = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, valign=Gtk.Align.CENTER)
            git_label = label(_('Reading Git…'), 'suite-git')
            group_label = label(p.group.replace('/',' › ') or _('Desktop'), 'dim-label')
            group_label.add_css_class('suite-meta')
            meta.append(git_label)
            meta.append(group_label)
            row.add_suffix(meta)
            notes = len(self.project_notes(p))
            note_count = label(str(notes), 'dim-label')
            note_count.set_tooltip_text(_('Project notes'))
            note_count.set_margin_start(8)
            note_count.set_margin_end(4)
            row.add_suffix(note_count)
            favorite = bool(self.safe_metadata(p).get('favorite'))
            row.add_suffix(icon_button('starred-symbolic' if favorite else 'non-starred-symbolic', _('Remove from favorites') if favorite else _('Add to favorites'), lambda p=p:self.toggle_favorite(p)))
            row.add_suffix(icon_button('utilities-terminal-symbolic', _('Open with %s') % self.launcher.terminal_name(), lambda p=p:self.open_project(p)))
            row.connect('activated', lambda _row,p=p:self.show_project(p))
            self.project_list.append(row)
            self.git_rows[str(p.path)] = git_label
            self.request_git(p)

    def apply_project_color(self, widget, project):
        import re
        color = project.color if re.fullmatch(r'#[0-9a-fA-F]{6}', project.color or '') else '#96b8a6'
        drawing = SHAPES.get(project.shape)
        if drawing:
            rgb = [int(color[i:i+2],16) for i in (1,3,5)]
            def shade(target, amount):
                return '#' + ''.join(f'{int(v+(target-v)*amount+.5):02x}' for v in rgb)
            for token,value in [('BASE',color),('LIGHT',shade(255,.30)),('DARK',shade(0,.34)),('DEEP',shade(0,.62))]:
                drawing = drawing.replace('__'+token+'__',value)
            svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'+drawing+'</svg>'
            widget.set_from_gicon(Gio.BytesIcon.new(GLib.Bytes.new(svg.encode())))
        else:
            provider = Gtk.CssProvider()
            provider.load_from_string('image { color: '+color+'; }')
            widget.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

    def request_git(self, project, force=False):
        key = str(project.path)
        cached = self.git.get(key)
        if cached and not force and time.monotonic()-cached[0]<15:
            self.present_git(project,cached[1])
            return
        if key in self.git_pending:
            return
        self.git_pending.add(key)
        future = self.executor.submit(git_state, project.path)
        def completed(result):
            try:
                state = result.result()
            except Exception as exc:
                state = None
                error = str(exc)
            else:
                error = None
            def deliver():
                self.git_pending.discard(key)
                if not self.alive:
                    return False
                if error:
                    self.toast(error)
                elif state:
                    self.git[key] = (time.monotonic(),state)
                    self.present_git(project,state)
                    if self.sort == 2 and self.view in ('projects','favorites') and not self.sort_refresh_id:
                        self.sort_refresh_id = GLib.timeout_add(100,self.resort_after_git)
                return False
            GLib.idle_add(deliver)
        future.add_done_callback(completed)

    def resort_after_git(self):
        self.sort_refresh_id = 0
        if self.alive and self.sort == 2 and self.view in ('projects','favorites'):
            self.populate_projects()
        return GLib.SOURCE_REMOVE

    def present_git(self, project, state):
        titles = {'missing':_('Folder not found'), 'not-repository':_('Not a Git repository'), 'error':_('Git unavailable')}
        if state.state in titles:
            summary = titles[state.state]
        else:
            changes = _('No changes') if not state.files else (_('1 changed file') if len(state.files)==1 else _('%s changed files') % len(state.files))
            summary = (state.branch+' · ' if state.branch else '')+changes
        row_label = self.git_rows.get(str(project.path))
        if row_label:
            row_label.set_label(summary)
            row_label.set_tooltip_text(getattr(state,'error','') or summary)
        if self.view=='detail' and self.selected_project and self.selected_project.path==project.path:
            self.git_detail.set_title(summary)
            self.git_detail.set_subtitle(getattr(state,'error','') or '')
            clear(self.git_files)
            for file in state.files:
                self.git_files.append(label(file.status+'  '+file.path, 'suite-file', True))

    def show_project(self, project):
        self.view = 'detail'
        self.selected_project = project
        self.build_navigation()
        edit = icon_button('document-edit-symbolic', _('Edit project'), lambda: self.edit_project(project))
        page = self.page(project.name, str(project.path), edit)
        actions = Gtk.FlowBox(selection_mode=Gtk.SelectionMode.NONE, row_spacing=8, column_spacing=8, homogeneous=False, max_children_per_line=5)
        for action in [button(_('Open with %s') % self.launcher.terminal_name(), lambda:self.open_project(project), 'utilities-terminal-symbolic', 'suggested-action'),
                       button(_('Open folder'), lambda:self.run_action(lambda:self.launcher.open_folder(project.path)), 'folder-open-symbolic'),
                       button(_('Open in editor'), lambda:self.run_action(lambda:self.launcher.open_editor(project)), 'applications-engineering-symbolic')]:
            actions.insert(action,-1)
        page.append(actions)
        info = Gtk.Box(spacing=14)
        info.append(label(project.group.replace('/',' › ') or _('Desktop'),'dim-label'))
        note_total = len(self.project_notes(project))
        info.append(label(_('1 note') if note_total == 1 else _('%s notes') % note_total,'dim-label'))
        favorite = bool(self.safe_metadata(project).get('favorite'))
        info.append(button(_('In favorites') if favorite else _('Add to favorites'), lambda:self.toggle_favorite(project), 'starred-symbolic' if favorite else 'non-starred-symbolic','flat'))
        page.append(info)
        columns = self.detail_layout
        if columns.get_parent():
            columns.get_parent().remove(columns)
        clear(columns)
        left = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=28, hexpand=True, valign=Gtk.Align.START)
        right = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=28, hexpand=True, valign=Gtk.Align.START)
        columns.append(left)
        columns.append(right)
        page.append(columns)
        step = section(_('Where I left off'), button(_('Edit'), lambda:self.edit_next_step(project), 'document-edit-symbolic','flat'))
        next_step = label(self.safe_metadata(project).get('next_step') or _('Write the next step to find it when you return to this project.'), 'suite-next-step', True)
        step.append(panel(next_step))
        left.append(step)
        notes = section(_('Project notes'), button(_('New note'), lambda:self.new_note(project),'list-add-symbolic','flat'))
        notes_list = boxed_list()
        for note in self.project_notes(project):
            self.append_note_row(notes_list,note,project)
        if not self.project_notes(project):
            empty = Adw.ActionRow(title=_('No notes for this project yet'),subtitle=_('New notes will be associated automatically.'))
            notes_list.append(empty)
        notes.append(notes_list)
        notes.append(label(_('Notes open in LovyCairn Notes.'), 'dim-label'))
        left.append(notes)
        git = section(_('Git status'),button(_('Refresh'),lambda:self.request_git(project,True),'view-refresh-symbolic','flat'))
        git_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL,spacing=12)
        self.git_detail = Adw.ActionRow(title=_('Reading Git…'))
        git_box.append(self.git_detail)
        self.git_files = Gtk.Box(orientation=Gtk.Orientation.VERTICAL,spacing=9,margin_start=15,margin_end=15,margin_bottom=15)
        git_box.append(self.git_files)
        git.append(panel(git_box))
        right.append(git)
        self.request_git(project)
        links = section(_('Links'))
        link_list = boxed_list()
        for url in project.docs:
            row = Adw.ActionRow(title=GLib.markup_escape_text(shortened(url,100)), activatable=True)
            row.add_suffix(Gtk.Image.new_from_icon_name('external-link-symbolic'))
            row.connect('activated',lambda _r,u=url:self.run_action(lambda:self.launcher.open_docs(replace(project,docs=(u,)))))
            link_list.append(row)
        if not project.docs:
            row = Adw.ActionRow(title=_('No documentation links'),subtitle=_('Add links from Edit project.'))
            link_list.append(row)
        links.append(link_list)
        right.append(links)
        remove = button(_('Remove project launcher'),lambda:self.confirm_remove(project),'user-trash-symbolic','destructive-action')
        remove.set_halign(Gtk.Align.START)
        page.append(remove)

    def append_note_row(self, box, note, project=None):
        associated = [p.name for p in self.projects if p.tag in note.tags] if project is None else []
        preview = ' '.join(line.strip() for line in note.text.splitlines() if line.strip() and not line.strip().startswith('#'))
        date = time.strftime('%d/%m/%Y %H:%M',time.localtime(note.mtime))
        preview = ' · '.join([*associated,date,preview])
        row = Adw.ActionRow(title=GLib.markup_escape_text(shortened(note.title,100)),subtitle=GLib.markup_escape_text(shortened(preview)))
        row.set_subtitle_lines(2)
        row.set_activatable(True)
        row.add_prefix(Gtk.Image.new_from_icon_name('text-x-generic-symbolic'))
        row.add_suffix(Gtk.Image.new_from_icon_name('go-next-symbolic'))
        row.connect('activated',lambda *_:self.run_action(lambda:self.launcher.open_notes(name=note.path.name)))
        box.append(row)

    def show_notes(self, section_name=None):
        if section_name in ('free','projects'):
            self.notes_section = section_name
        self.view = 'notes'
        self.selected_project = None
        self.build_navigation()
        project_tags = {p.tag for p in self.projects}
        free = [n for n in self.notes if not project_tags.intersection(n.tags)]
        associated = [n for n in self.notes if project_tags.intersection(n.tags)]
        projects = sorted(self.projects,key=lambda p:p.name.casefold())
        if self.notes_project_rel not in {p.rel for p in projects}:
            self.notes_project_rel = None
        tags = sorted({tag for note in free for tag in note.tags})
        if self.notes_tag not in tags:
            self.notes_tag = None
        actions = Gtk.Box(spacing=8)
        actions.append(button(_('New project note') if self.notes_section=='projects' else _('New note'),
            self.create_note_from_archive,'list-add-symbolic','suggested-action'))
        actions.append(icon_button('window-new-symbolic',_('Open LovyCairn Notes'),
            lambda:self.run_action(lambda:self.launcher.open_notes(archive=True))))
        page = self.page(_('Notes'), _('Free notes and project notes, as in LovyCairn Notes.'), actions)
        switches = Gtk.Box(css_classes=['linked'],halign=Gtk.Align.START)
        free_button = Gtk.ToggleButton(label=_('Free notes'))
        project_button = Gtk.ToggleButton(label=_('Projects'),group=free_button)
        (project_button if self.notes_section=='projects' else free_button).set_active(True)
        free_button.connect('toggled',lambda widget:self.show_notes('free') if widget.get_active() else None)
        project_button.connect('toggled',lambda widget:self.show_notes('projects') if widget.get_active() else None)
        switches.append(free_button);switches.append(project_button)
        page.append(switches)
        if self.notes_section=='projects':
            values = [None,*(p.rel for p in projects)]
            names = [_('All projects')]+[p.name+' ('+str(len(self.project_notes(p)))+')' for p in projects]
            selector = Adw.ComboRow(title=_('Project'),model=Gtk.StringList.new(names))
            selector.set_selected(values.index(self.notes_project_rel))
            selector.connect('notify::selected',lambda row,_spec:self.select_notes_project(values[row.get_selected()]))
            group = Adw.PreferencesGroup()
            group.add(selector)
            page.append(group)
        elif tags:
            chips = Gtk.FlowBox(selection_mode=Gtk.SelectionMode.NONE,homogeneous=False,
                column_spacing=6,row_spacing=6,max_children_per_line=8)
            for tag in [None,*tags]:
                chip = Gtk.ToggleButton(label='#'+tag if tag else _('All tags'),active=self.notes_tag==tag)
                chip.add_css_class('pill')
                chip.connect('toggled',lambda widget,t=tag:self.select_notes_tag(t if widget.get_active() else None))
                chips.append(chip)
            page.append(chips)
        search = Gtk.SearchEntry(placeholder_text=_('Search project notes') if self.notes_section=='projects' else _('Search notes'))
        search.set_text(self.notes_query)
        page.append(search)
        rows = boxed_list()
        page.append(rows)
        count = label('', 'dim-label')
        page.append(count)
        def populate(*_args):
            clear(rows)
            self.notes_query = search.get_text()
            query = self.notes_query.casefold()
            candidates = associated if self.notes_section=='projects' else free
            selected = next((p for p in projects if p.rel==self.notes_project_rel),None)
            if self.notes_section=='projects' and selected:
                candidates = [n for n in candidates if selected.tag in n.tags]
            elif self.notes_section=='free' and self.notes_tag:
                candidates = [n for n in candidates if self.notes_tag in n.tags]
            self.visible_notes = []
            for note in sorted(candidates,key=lambda n:-n.mtime):
                names = ' '.join(p.name for p in projects if p.tag in note.tags)
                if query not in (note.text+' '+names).casefold():
                    continue
                self.visible_notes.append(note)
                self.append_note_row(rows,note)
            if not self.visible_notes:
                rows.append(Adw.ActionRow(title=_('No notes found'),
                    subtitle=_('Create a note for the selected project.') if self.notes_section=='projects' else _('Create a free note to get started.')))
            total = len(self.visible_notes)
            count.set_label(_('1 note') if total==1 else _('%s notes') % total)
        search.connect('search-changed',populate)
        populate()

    def select_notes_project(self, relative):
        self.notes_project_rel = relative
        self.show_notes('projects')

    def select_notes_tag(self, tag):
        self.notes_tag = tag
        self.show_notes('free')

    def create_note_from_archive(self):
        if self.notes_section=='free':
            self.run_action(lambda:self.launcher.open_notes(new=True))
            return
        projects = sorted(self.projects,key=lambda p:p.name.casefold())
        selected = next((p for p in projects if p.rel==self.notes_project_rel),None)
        if selected:
            self.new_note(selected)
            return
        if not projects:
            self.toast(_('Add a project before creating a project note.'))
            return
        def create(form):
            self.new_note(projects[form.project_choice.get_selected()])
        form = Form(self,_('Choose a project'),_('Create note'),create)
        form.project_choice = Adw.ComboRow(title=_('Project'),model=Gtk.StringList.new([p.name for p in projects]))
        form.group().add(form.project_choice)
        form.present(self)

    def show_settings(self):
        self.view = 'settings'
        self.selected_project = None
        self.build_navigation()
        self.command_entries = {}
        page = self.page(_('Settings'), _('The same environment, from the suite and the desktop.'))
        opening = Adw.PreferencesGroup(title=_('Opening projects'))
        page.append(opening)
        self.preset_command(opening,'terminal-command',_('Terminal'), [(_('Automatic'),''),('LovyTerm','lovyterm --directory {dir}'),('Ptyxis','ptyxis --new-window -d {dir}'),('Console','kgx --working-directory {dir}'),('GNOME Terminal','gnome-terminal --working-directory={dir}'),('kitty','kitty --directory {dir}')],_('{dir} is replaced by the project folder. Empty: detect automatically.'))
        self.preset_command(opening,'browser-command',_('Browser'), [(_('Default browser'),''),('Firefox','firefox --new-window {url}'),('Chrome','google-chrome --new-window {url}')],_('{url} is replaced by the documentation address. Empty: default browser.'))
        self.preset_command(opening,'editor-command',_('Editor'), [(_('Not configured'),''),('Visual Studio Code','code {dir}'),('VSCodium','codium {dir}'),('Zed','zed {dir}')],_('Set an editor command using {dir}, for example code {dir}.'))
        workspace = Adw.ComboRow(title=_('Workspace'),model=Gtk.StringList.new([_('Ask every time'),_('New workspace'),_('Current workspace')]))
        values = ['ask','new','here']
        workspace.set_selected(values.index(self.settings.get_string('default-workspace')))
        workspace.connect('notify::selected',lambda row,_p:self.settings.set_string('default-workspace',values[row.get_selected()]))
        opening.add(workspace)
        note_group = Adw.PreferencesGroup(title=_('Notes and appearance'))
        page.append(note_group)
        notes_desktop = Adw.SwitchRow(title=_('Notes on the desktop'),subtitle=_('Show notes collapsed to icons.'))
        self.settings.bind('notes-integration', notes_desktop, 'active', Gio.SettingsBindFlags.DEFAULT)
        note_group.add(notes_desktop)
        self.command_row(note_group,'notes-command',_('Notes command'),_('Empty: lovycairn-notes.'))
        folder = Adw.EntryRow(title=_('Notes folder'),text=self.settings.get_string('notes-dir'),show_apply_button=True)
        folder.set_tooltip_text(_('Empty: ~/Notes.'))
        folder.connect('apply',lambda row:self.apply_notes_folder(row))
        note_group.add(folder)
        theme = Adw.ComboRow(title=_('Appearance'),model=Gtk.StringList.new([_('System'),_('Light'),_('Dark')]))
        themes = ['system','light','dark']
        theme.set_selected(themes.index(self.settings.get_string('suite-theme')))
        theme.connect('notify::selected',lambda row,_p:self.settings.set_string('suite-theme',themes[row.get_selected()]))
        note_group.add(theme)
        keys = Adw.PreferencesGroup(title=_('Desktop shortcuts'),description=GLib.markup_escape_text(_('Press Enter or Apply to save a shortcut, for example <Super>j.')))
        page.append(keys)
        for key,title in [('picker',_('Find a project')),('project-note',_('New project note')),('quick-note',_('New note'))]:
            values = self.settings.get_strv(key)
            row = Adw.EntryRow(title=title,text=values[0] if values else '',show_apply_button=True)
            row.connect('apply',lambda row,k=key:self.save_shortcut(k,row.get_text()))
            keys.add(row)

    def preset_command(self, group, key, title, presets, hint):
        current = self.settings.get_string(key)
        selected = len(presets)
        for index, (_name, command) in enumerate(presets):
            if current == command:
                selected = index
                break
            try:
                if current and command and Path(shlex.split(current)[0]).name == Path(shlex.split(command)[0]).name:
                    selected = index
                    break
            except ValueError:
                pass
        chooser = Adw.ComboRow(title=title, model=Gtk.StringList.new([name for name,_cmd in presets]+[_('Custom command')]))
        chooser.set_selected(selected)
        group.add(chooser)
        advanced = Adw.ExpanderRow(title=_('Custom command'), expanded=selected==len(presets))
        entry = self.command_row(advanced,key,_('Command'),hint)
        group.add(advanced)
        def select(row,_pspec):
            choice=row.get_selected()
            if choice==len(presets):
                advanced.set_expanded(True)
                entry.grab_focus()
            else:
                value=presets[choice][1]
                self.apply_command(key,value)
                entry._saved_command=value
                entry.set_text(value)
                advanced.set_expanded(False)
        chooser.connect('notify::selected',select)

    def command_row(self, group, key, title, hint):
        row = Adw.EntryRow(title=title, text=self.settings.get_string(key), show_apply_button=True)
        row.set_tooltip_text(hint)
        row._saved_command = self.settings.get_string(key)
        self.command_entries[key] = row
        def apply(entry):
            try:
                self.apply_command(key,entry.get_text())
                entry._saved_command = self.settings.get_string(key)
                entry.set_text(entry._saved_command)
            except ValueError as exc:
                self.toast(str(exc))
        row.connect('apply',apply)
        if isinstance(group, Adw.ExpanderRow):
            group.add_row(row)
        else:
            group.add(row)
        description = Adw.ActionRow(title=hint)
        description.add_css_class('dim-label')
        if isinstance(group, Adw.ExpanderRow):
            group.add_row(description)
        else:
            group.add(description)
        return row

    def apply_command(self, key, text):
        value = text.strip()
        try:
            if value:
                argv = shlex.split(value)
                if not argv or not argv[0].strip():
                    raise ValueError(_('Enter an executable command.'))
        except ValueError as exc:
            raise ValueError(_('The command has invalid quotation marks.')) from exc
        self.settings.set_string(key,value)
        self.toast(_('Preference saved.'))

    def apply_notes_folder(self, row):
        path = row.get_text().strip()
        if path and not Path(path).expanduser().is_dir():
            self.toast(_('Choose an existing notes folder.'))
            return
        self.settings.set_string('notes-dir',str(Path(path).expanduser().absolute()) if path else '')
        self.toast(_('Preference saved.'))

    def save_shortcut(self, key, text):
        text = text.strip()
        valid,keyval,mods = Gtk.accelerator_parse(text) if text else (True,0,0)
        if text and (not valid or not Gtk.accelerator_valid(keyval,mods)):
            self.toast(_('Enter a valid keyboard shortcut.'))
            return
        self.settings.set_strv(key,[text] if text else [])
        self.toast(_('Preference saved.'))

    def toggle_favorite(self, project):
        try:
            self.store.set_metadata(project,favorite=not self.store.metadata(project).get('favorite',False))
            self.refresh()
        except (OSError,ValueError) as exc:
            self.toast(str(exc))

    def save_next_step(self, project, text):
        self.store.set_metadata(project,next_step=text)
        if self.view=='detail':
            self.show_project(project)
        self.toast(_('Next step saved.'))

    def new_project(self):
        try:
            ProjectForm(self).present(self)
        except (ValueError,OSError,GLib.Error) as exc:
            self.toast(str(exc))

    def edit_project(self, project):
        try:
            ProjectForm(self,project).present(self)
        except (ValueError,OSError,GLib.Error) as exc:
            self.toast(str(exc))

    def new_group(self):
        GroupForm(self).present(self)

    def edit_next_step(self, project):
        NextStepForm(self,project).present(self)

    def new_note(self, project):
        self.run_action(lambda:self.launcher.open_notes(tag=project.tag,new=True))

    def confirm_remove(self, project):
        dialog = Adw.AlertDialog(heading=_('Remove “%s” from LovyCairn?') % project.name,
            body=_('Only the launcher moves to the trash. The project folder and its notes are kept.'))
        dialog.add_response('cancel',_('Cancel'))
        dialog.add_response('remove',_('Remove launcher'))
        dialog.set_response_appearance('remove',Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.set_default_response('cancel')
        dialog.set_close_response('cancel')
        self.active_dialog = dialog
        def response(_dialog, response_id):
            if response_id=='remove':
                try:
                    self.store.trash_project(project)
                    self.selected_project=None
                    self.view='projects'
                    self.refresh()
                except (OSError,ValueError,GLib.Error) as exc:
                    self.toast(str(exc))
            self.dialog_closed(dialog)
        dialog.connect('response',response)
        dialog.present(self)

    def run_action(self, callback, success=None):
        future = self.executor.submit(callback)
        def done(result):
            try:
                value = result.result()
                error = None
            except Exception as exc:
                value,error = None,str(exc)
            def finish():
                if self.alive:
                    if error:
                        self.toast(error)
                    elif success:
                        success(value)
                return False
            GLib.idle_add(finish)
        future.add_done_callback(done)

    def open_project(self, project):
        def opened(result):
            if result=='direct':
                self.toast(_('The desktop extension is unavailable. Opened in the current workspace.'))
            self.refresh()
        self.run_action(lambda:self.launcher.open_project(project), opened)

    def reload_git(self):
        self.git.clear()
        self.refresh()

    def on_close(self, *_):
        self.alive=False
        self.settings.disconnect(self.settings_id)
        if self.monitor_id:
            GLib.source_remove(self.monitor_id)
        if self.sort_refresh_id:
            GLib.source_remove(self.sort_refresh_id)
        for monitor in self.monitors:
            monitor.cancel()
        self.executor.shutdown(wait=False,cancel_futures=True)
        return False


class SuiteApplication(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID,flags=Gio.ApplicationFlags.HANDLES_COMMAND_LINE)
        self.window = None
        self.add_main_option('project',0,GLib.OptionFlags.NONE,GLib.OptionArg.STRING,
                             _('Show a project from its desktop launcher.'),'LAUNCHER')

    def do_startup(self):
        Adw.Application.do_startup(self)
        self.set_resource_base_path('/io/github/bitfarmy/LovyCairn')
        Gtk.Window.set_default_icon_name(APP_ID)
        provider = Gtk.CssProvider()
        provider.load_from_string(CSS)
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),provider,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        quit_action = Gio.SimpleAction.new('quit',None)
        quit_action.connect('activate',lambda *_:self.quit())
        self.add_action(quit_action)
        self.set_accels_for_action('app.quit',['<Control>q'])

    def do_activate(self):
        if not self.window or not self.window.alive:
            try:
                self.window = SuiteWindow(self)
            except (OSError,ValueError,RuntimeError,GLib.Error) as exc:
                self.show_startup_error(str(exc))
                return
        self.window.present()

    def do_command_line(self, command):
        self.activate()
        if self.window:
            value = command.get_options_dict().lookup_value('project',None)
            if value:
                requested = value.get_string()
                found = next((p for p in self.window.projects if p.rel==requested),None)
                if found:
                    self.window.show_project(found)
                else:
                    self.window.toast(_('This project is no longer available.'))
        return 0

    def show_startup_error(self, text):
        window = Adw.ApplicationWindow(application=self,title='LovyCairn',default_width=540,default_height=360)
        status = Adw.StatusPage(title=_('LovyCairn could not start'),description=text,icon_name='dialog-warning-symbolic')
        window.set_content(status)
        window.present()


def main():
    GLib.set_application_name('LovyCairn')
    GLib.set_prgname(APP_ID)
    return SuiteApplication().run(sys.argv)
