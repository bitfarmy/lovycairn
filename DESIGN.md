---
name: LovyCairn
description: Native GNOME workspace for finding and resuming local projects.
rounded:
  panel: "12px"
spacing:
  action: "8px"
  section: "12px"
  panel: "20px"
  columns: "28px"
components:
  panel:
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  page:
    padding: "30px 32px 36px"
  project-row:
    height: "68px"
---

# Design System: LovyCairn

## Overview

**Creative North Star: "The GNOME project workspace"**

A practical, native desktop workspace with quiet surfaces and clear working actions. The signature is the project handoff: terminal access, saved next step, associated notes and Git state together. Existing GNOME conventions are the visual authority.

**Key Characteristics:**
- Native GTK 4 and libadwaita controls.
- Compact project rows with generous separation between working sections.
- Existing cairn logo and project identity assets.

This documents the implemented suite in `suite/lovycairn_suite/app.py` and `views.py`, checked against native screenshots. The HTML/CSS preview is an approved design artifact, not production styling.

## Colors

Primary accents, foregrounds, windows, cards, destructive actions and disabled states come from the active GTK/libadwaita theme. System theme is the default; explicit light and dark choices use `Adw.StyleManager`. Screenshot orange is a system accent, not a fixed LovyCairn brand color. No fixed color tokens are extracted for these environment-dependent values.

The suite panel uses `@card_bg_color`. Sidebar tint uses `alpha(@window_fg_color, .025)` and selected navigation uses `alpha(@window_fg_color, .09)`. Project colors are existing user data, applied to project symbols.

**The System Authority Rule.** Preserve native theme and accent behavior; never copy screenshot colors into a fixed application palette.

## Typography

Use the user's GTK system font and libadwaita hierarchy: `title-1` for page titles, `title-3` for section headings, standard widget text for controls, and `dim-label` for secondary information. Do not install a display face or force the preview's locally loaded Cantarell.

Implemented relative treatments: project identity (1.15em, bold), next step (1.08em, line height 1.6), metadata and Git (0.9em), metadata opacity (0.8). File-status listings use the system monospace family (0.9em). Exact platform title sizes remain theme-owned.

## Layout

Default window size is 1180 × 820. Sidebar bounds are 210–224, with a 0.2 width fraction. Pages scroll vertically inside `Adw.Clamp` (maximum size 1160, tightening threshold 900); horizontal scrolling is disabled. Page padding is defined in frontmatter. Main page groups use the columns spacing token; headings and their descriptions have a tighter gap (6).

At `max-width: 1000sp`, the overlay sidebar collapses and equal-width detail columns become a non-homogeneous vertical stack. Detail actions use `Gtk.FlowBox` and wrap with action-sized row and column gaps. Project rows have a minimum height matching the frontmatter row token, not a fixed height; allow native content expansion. Forms use 24 side margins, 16 top margin and 24 bottom margin, with 20 between fields.

## Elevation & Depth

Use libadwaita's own window, boxed-list, dialog and control elevation. Custom panels use a theme card surface without custom shadows. Do not reproduce the Broadway browser canvas or impose web shadow recipes.

## Shapes

Custom panel curvature is defined by the panel token. Native buttons, switches, search entries, dialogs and boxed lists retain platform geometry. Reuse the existing cairn logo, extension SVG shapes and symbolic GTK icons; project identity color and shape remain user data.

Project identities in lists, resume panels and details, and group identities in the sidebar, use the same shape IDs, vector geometry and default colors as the desktop. `scripts/suite-icons.mjs` generates `shapes.json` and `visuals.json` from the extension and note editor sources; edit those sources rather than generated assets. Explicit identity colors override generic GTK icon tinting. Notes use small filled dots colored from the editor's `.state.json`, including pastel colors; color names are accessible tooltips.

## Components

- **Primary actions:** native buttons with `suggested-action`, especially opening the configured terminal and adding projects. Secondary actions use standard or flat buttons. Destructive launcher removal uses native destructive styling and explicit confirmation.
- **Navigation:** sidebar buttons, selected tint and symbolic icons; existing groups and counts remain visible. Collapsed navigation uses the native overlay split view.
- **Project rows:** `Adw.ActionRow` in a boxed list: identity icon, name, one-line path, Git and group metadata, note count, favorite and terminal actions. Icon buttons carry accessible labels and tooltips.
- **Project handoff:** next-step panel, associated note rows, Git summary and file statuses. Wide details use two columns; narrow details stack. Notes open in the separate LovyCairn Notes editor.
- **Search and empty states:** native search entry and list-specific empty guidance; preserve native keyboard focus and selection behavior.
- **Settings and forms:** native preference rows, switches, selectors and explicit-save dialogs. Retain GTK hover, focus, disabled and error states; do not invent custom animation timing.

## Do's and Don'ts

- Do use theme-owned colors, fonts and interaction states.
- Do keep terminal access, next step, Git and notes easy to find.
- Do reuse existing user project colors, shapes and the cairn logo.
- Don't treat browser preview CSS as production tokens.
- Don't hard-code a GNOME accent or screenshot-specific font size.
- Don't embed a replacement note editor in the suite.
