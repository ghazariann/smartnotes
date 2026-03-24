# Changelog

## [0.4.0] - 2026-03-24

### Added
- YAML frontmatter in note files stores the full lossless anchor text (`anchor:` field) and line number (`line:` field), fixing false `[err]` flags on TypeScript code with generics, union types, optional chaining, and type annotations
- `line:` in frontmatter is authoritative - edit it directly to re-anchor a note to a different line without renaming the file
- Rename note command in the sidebar context menu - rename to any filename (e.g. `pupu.md`); custom-named files are never auto-renamed by the position tracker
- Auto-fold frontmatter when opening a note file so the user only sees their content
- `[err]` warning icon and prefix shown in the sidebar panel for notes whose anchor line can no longer be found
- Verification now also runs on file save, not only on file open

### Changed
- Full source line is stored in `anchor:` frontmatter with no truncation; the `anchorTextLength` setting no longer affects matching
- Anchor matching is now stricter: exact match or line-starts-with-anchor only; partial prefix matches no longer produce false positives
- Auto-named notes (`L{n}...`) show line number, anchor snippet, and body preview in the sidebar; custom-named notes show only their chosen name
- Auto-named files still rename on re-anchor to stay readable; custom-named files update only the frontmatter `line:` field
- MCP `get_note` now returns the full file including frontmatter so Claude sees the anchor context
- MCP `update_note` accepts body only and preserves the existing frontmatter
- Sidebar bookmarks no longer show `(bookmark)` text label; the icon is sufficient

## [0.3.0] - 2026-03-23

### Added
- **MCP server** bundled in the extension — exposes 10 tools (`list_notes`, `get_note`, `add_note`, `update_note`, `delete_note`, `search_notes`, `copy_note`, `move_note`, `list_files`, `rename_file_notes`) so Claude Code and other AI agents can read and write notes directly from chat
- On activation, `mcp-server.js` is copied to a stable version-independent path in VS Code global storage; a notification provides the exact `claude mcp add` command to run once
- MCP server defaults workspace to `process.cwd()`, so no workspace argument needed in the `claude mcp add` command
- `noteStoreUtils.ts` shares pure-function layer used by both `NoteStore` and the MCP server


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
