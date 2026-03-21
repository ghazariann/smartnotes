# Changelog

## [0.1.0] - 2026-03-21

### Added
- Hover tooltips — notes render as rich Markdown on annotated lines
- Position tracking — notes shift with code as lines are inserted or deleted
- Context-aware gutter menu — right-click line number to add, open, or remove a note
- Sidebar panel — dedicated activity bar tab to browse all notes grouped by file
- Inline image rendering — local images in notes are inlined as base64 data URIs to bypass VS Code hover CSP
- Note file watching — note storage folder is watched for external changes; decorations and sidebar refresh immediately
- Anchor text filenames — note files include a slug of the annotated line's text (e.g. `L42 - def foo.md`) for easier manual navigation
