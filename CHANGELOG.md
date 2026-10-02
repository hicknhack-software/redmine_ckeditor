# Changelog

## 2.0.1 — 2026-10-03

### Changed

- Updated CKEditor 5 from 48.3.1 to
  [48.5.2](https://github.com/ckeditor/ckeditor5/releases/tag/v48.5.2).
- Bumped the Redmine plugin and npm package versions to 2.0.1, updated the
  dependency lockfile, and rebuilt the bundled JavaScript and CSS.
- Reviewed the intervening CKEditor releases. No changes are required to editor
  initialization, the upload adapter, preview integration, toolbar configuration,
  or HTML sanitizer. The 48.4.0 breaking changes concern AI APIs this plugin does
  not use; the combined CSS import remains supported after the separation of
  editor UI and content styles.
- Updated the documented CKEditor version and corrected the Rails test command
  to set `RAILS_ENV=test` before invoking Rails.
- Moved version-specific release notes from the README into this changelog.

### Security

- Included the upstream fixes from
  [CKEditor 5.48.5.1](https://github.com/ckeditor/ckeditor5/releases/tag/v48.5.1)
  for prototype pollution when processing style attributes
  (`GHSA-rh54-vffm-5fvp`) and unsafe data URIs with certain General HTML Support
  configurations (`GHSA-v6mg-96c6-gmpq`).

### Fixed

- Reduced table editing overhead by synchronizing the backing textarea after
  a 150 ms typing pause instead of serializing the whole editor document on
  every content change ([#4](https://github.com/hicknhack-software/redmine_ckeditor/issues/4)).
  Preview, focus loss, submission, FormData creation, and programmatic content
  updates synchronize immediately. Pending updates and form listeners are
  removed when an editor is destroyed or replaced through AJAX.

## 2.0.0 — Internal testing

### Added

- Introduced a new CKEditor 5 integration by HicknHack Software GmbH, inspired by
  the original Redmine CKEditor plugin, with CKEditor 5.48.3.1 and support for
  Redmine 6.1 and 7.
- Added image paste and upload support using Redmine's native attachment storage,
  authenticated browser sessions, and CSRF protection.
- Added automatic migration of legacy Rich and `cw_rich` uploads into native
  Redmine attachments, including content URL rewriting, content backups,
  rollback support, and a retry/report rake task. Original legacy data and files
  are preserved.
- Added configurable editor settings and HTML sanitizer allowlists, plus
  translation of legacy CKEditor 4 toolbar names and layout settings.
- Added Ruby and JavaScript tests and a GitHub Actions matrix covering Redmine
  6.1 and 7 with SQLite, PostgreSQL, and MySQL.

### Changed

- Replaced the previous CKEditor 4 integration and removed its legacy runtime
  dependencies and assets.
- Adopted Redmine's Propshaft asset pipeline and committed compiled CKEditor
  JavaScript and CSS, so production installations do not require Node.js.
- Preserved formatted content as sanitized HTML with Redmine macro support and
  automatic links in visible text, while protecting code blocks and HTML
  attributes such as `srcset` from automatic linking.
- Licensed the new integration code under MIT and documented attribution,
  CKEditor's separate licensing terms, and license-key configuration.

### Fixed

- Restored issue image uploads by waiting for the complete form before checking
  whether attachment fields are available.
- Restored Redmine's server preview and edit tabs for CKEditor fields.
- Recreated editors when Redmine replaces note forms through AJAX, destroying
  stale editor instances.
- Normalized existing attachment image URLs to Redmine's download route so
  images display the file rather than the attachment preview page.
