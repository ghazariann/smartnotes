# SmartNotes

Attach persistent Markdown notes to any section of code. Notes render as hover tooltips, stay anchored as code changes, and render images inline.

![Demo](media/demo.gif)

---

## Features

- **Hover tooltips** — notes render as rich Markdown directly on the annotated line
- **Images in hover** — paste screenshots or diagrams into your note; local images are inlined as `data:` URIs to bypass VS Code's hover CSP
- **Position tracking** — notes shift with your code as you type, using delta tracking on `onDidChangeTextDocument`
- **Context-aware gutter menu** — right-clicking a line number shows *Add Note* when no note exists, or *Open Note* + *Remove Note* when one does
- **Sidebar panel** — dedicated activity bar tab to browse all notes grouped by file, with open and delete actions

---


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

---

## Future Work

- **Position tracking Stage 2** — content fingerprint to re-anchor notes after `git pull` or cold restart, even when lines shifted
- **Position tracking Stage 3** — AI-assisted re-anchoring for major refactors via MCP
---
