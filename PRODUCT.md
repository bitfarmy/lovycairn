# LovyCairn

<!-- impeccable:product-schema 1 -->

## Platform

Native Linux desktop application for GNOME. Browser previews are design artifacts;
the suite is not a website.

## Stack

Existing GNOME Shell extension in GJS, GTK 4 / libadwaita notes application in
Python. The proposed companion application uses Python, GTK 4 and libadwaita.

## Users

People working on several local development projects and switching between their
folders, terminals, Git repositories, documentation and project notes.

## Product Purpose

Make local projects easy to find, open and resume. The dedicated LovyCairn suite
brings project management, project details and preferences into one application.
Desktop icons and context menus remain useful entry points.

## Operating Context

GNOME desktop, local folders and Git repositories. The current user's terminal
preference is LovyTerm. LovyCairn Notes is already installed and associated with
projects through Markdown tags. The user chose a separate LovyCairn application
and requested an interactive browser preview before implementation.

## Capabilities and Constraints

- Projects are desktop launchers with `X-LovyCairn-*` metadata.
- Groups are desktop folders containing a `.group` marker.
- Preferences use `org.gnome.shell.extensions.lovycairn` GSettings.
- Notes are Markdown files; project tags connect them to projects.
- The suite and extension must share these data, rather than maintain two
  independent project collections.
- LovyCairn Notes remains the note editor; the suite exposes project notes.
- Existing projects, notes, colors, positions and terminal preferences must survive.
- The initial proposed scope is project management, project details and settings.
  Exact scope and interface are pending approval of the preview and design.

## Brand Commitments

LovyCairn name and existing cairn logo. Italian is the language of the current
design discussion. Preserve the existing translation infrastructure for shipping.

## Evidence on Hand

`README.md`, `README.it.md`, `docs/ARCHITECTURE.md`, the working GNOME extension,
the notes application and screenshots in `docs/img`. Prototype project names can
reflect the user's project collection; Git state, note text and activity shown in
the prototype must be explicitly identified as demonstration data.

## Product Principles

- One project collection shared between the desktop and the suite.
- Make opening and resuming a project the shortest path.
- Keep the user's local files understandable and portable.
- Use GNOME conventions and keyboard access.
- Preserve existing data when adding new capabilities.
