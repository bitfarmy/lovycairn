# Submitting to extensions.gnome.org

LovyCairn is packaged the way the site expects (`scripts/dev.sh pack`). Checklist against the
[review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html):

| Guideline | Status |
|---|---|
| Only GJS, no binaries or external scripts bundled | The zip contains JavaScript, the schema, `metadata.json` and `.mo` files only. The notes app and the command-line tools are separate (installed by `scripts/install.sh`) and optional: the extension works without them. |
| Clean up in `disable()` | Signals via `connectObject`, timers tracked and removed, the patched `AppMenu.setApp` restored, actors destroyed. |
| No obfuscated or minified code | Plain source. |
| GPL-compatible license, `metadata.json` complete | GPL-3.0-or-later; `uuid`, `name`, `description`, `shell-version`, `url`, `settings-schema`, `gettext-domain`. |
| No network access, telemetry or remote code | None. |
| Subprocess use is justified | `git` (status), the terminal and browser (opening a project), the notes app (optional). All user-visible and user-configurable. |
| Private APIs | Used for the desktop layer; listed in `docs/ARCHITECTURE.md` and probed at start (`extension/compat.js`). |

Submitting: create the zip, then upload it at <https://extensions.gnome.org/upload/>. Each new version is reviewed by a
person, which takes days; releases for a new GNOME version should be uploaded as soon as the CI shows they pass.
