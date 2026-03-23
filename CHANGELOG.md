# Changelog

## [0.2.2] - 2026-03-23

### Added
- Copy / Paste in gutter menu — right-click a line with a note to copy it; paste appears on any empty line after copying and disappears after one use
- Empty notes are shown as bookmarks in the sidebar (bookmark icon, `(bookmark)` label) while retaining full note functionality
- Startup image cleanup — unreferenced image files left in the notes storage directory are deleted automatically on activation
- Orphan cleanup — notes whose source file no longer exists are deleted on startup with output channel logging; enabled by default, can be disabled via `smartnotes.orphanCleanup`

### Changed
- Six new settings exposed in VS Code Settings UI under **SmartNotes**:
  - `smartnotes.openBeside` — open notes beside the editor or in the same tab (default: same tab)
  - `smartnotes.anchorTextLength` — max characters from the source line used in note filenames (default: 60)
  - `smartnotes.showOverviewRuler` — toggle orange scrollbar marks for annotated lines (default: on)
  - `smartnotes.storagePath` — custom notes directory, relative or absolute (default: `.vscode/.smartnotes/`)
  - `smartnotes.orphanCleanup` — delete notes for missing source files on startup (default: on)

## [0.2.1] - 2026-03-22

### Changed
- Updated README with feature screenshots and clearer descriptions

## [0.2.0] - 2026-03-22

### Added
- Content-based re-anchoring - every time a file is opened, each note's stored anchor text is compared against the actual file content; if the annotated line moved (e.g. after a git pull or external edit) the note is automatically re-anchored to the correct line
- Fuzzy anchor matching — trailing `//` and `#` comments are stripped before comparison, so inline comment additions and minor reformats do not break anchoring
- Error flagging — if an anchor can no longer be located anywhere in the file, the note filename is prefixed with `[err]` and a message is written to the SmartNotes output channel; the prefix is removed automatically once the content is found again
- Sidebar note labels now show the note filename (e.g. `L42 - def foo`) instead of the anchor text snippet

## [0.1.0] - 2026-03-21

### Added
- Hover tooltips — notes render as rich Markdown on annotated lines
- Position tracking — notes shift with code as lines are inserted or deleted
- Context-aware gutter menu — right-click line number to add, open, or remove a note
- Sidebar panel — dedicated activity bar tab to browse all notes grouped by file
- Inline image rendering — local images in notes are inlined as base64 data URIs to bypass VS Code hover CSP
- Note file watching — note storage folder is watched for external changes; decorations and sidebar refresh immediately
- Anchor text filenames — note files include a slug of the annotated line's text (e.g. `L42 - def foo.md`) for easier manual navigation
