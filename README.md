# SmartNotes

Attach persistent Markdown notes to any section of code. Notes render as hover tooltips, stay anchored as code changes, and render images inline.

![Demo](media/demo.gif)

---

## Features

### Hover tooltips & inline images
Notes render as rich Markdown directly on the annotated line. Local images are inlined as `data:` URIs to bypass VS Code's hover CSP — something no other note extension does.

> *LineNote vs SmartNotes — image rendering in hover*

<img src="media/image.gif" width="800">

---

### Position tracking
Notes stay anchored as code changes. Delta tracking keeps them accurate during a live session; on every file open, anchor text is matched against actual file content so notes survive `git pull`, cold restarts, and external edits. Fuzzy matching ignores trailing comments and whitespace changes.

> *LineNote vs Bookmarks vs SmartNotes — position tracking after file changes*

<img src="media/reanchor.gif" width="500">

---

### Sidebar panel & gutter menu
Browse all notes grouped by file in a dedicated activity bar panel. Right-clicking a line number shows *Add Note* when none exists, or *Open Note* + *Remove Note* when one does.

> *SmartNotes sidebar panel and context-aware gutter menu*

<img src="media/sidebar.gif" >



## Storage

Notes live in `.vscode/smartnotes/`, mirroring the source tree:

```
.vscode/smartnotes/
  src/
    extension.ts/
      L6 - - Hover tooltips — notes render as rich.md        ← single-line note
      L9-L17 - let noteStore NoteStore  undefined;.md        ← range note
```

Each `.md` file is pure Markdown — open it in any editor. Commit the folder to share notes with your team, or add it to `.gitignore` to keep them local.


## Future Work

- **MCP server** — expose notes as tools (`get_note`, `add_note`, `update_note`, `delete_note`, `search_notes`) so AI agents can read and write notes directly from chat, and perform AI-assisted re-anchoring after large refactors
