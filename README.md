# SmartNotes

Attach persistent Markdown notes to any line of code. Notes render as hover tooltips, stay anchored as code changes, and render images inline — including local screenshots via an automatic base64 conversion.

---

## Features

- **Hover tooltips** — notes render as rich Markdown directly on the annotated line
- **Images in hover** — paste screenshots or diagrams into your note; local images are inlined as `data:` URIs to bypass VS Code's hover CSP
- **Position tracking** — notes shift with your code as you type, using delta tracking on `onDidChangeTextDocument`
- **Gutter icon + overview ruler** — visual indicators on every annotated line, configurable
- **Context-aware gutter menu** — right-clicking a line number shows *Add Note* when no note exists, or *Open Note* + *Remove Note* when one does
- **Explorer sidebar panel** — browse all notes grouped by file; each item shows the line number and first line of source code
- **No source modifications** — notes live in `.vscode/smartnotes/`, never inside the source file
- **Edit / Remove from hover** — footer links open the note file or delete it without leaving the editor

---

## Usage

| Action | How |
|---|---|
| Add note to current line or selection | `Ctrl+Alt+N` · right-click line number → *SmartNotes: Add Note* |
| Open note at cursor | Right-click line number → *SmartNotes: Open Note* · click **Edit** in hover |
| Remove note | Right-click line number → *SmartNotes: Remove Note* · click **Remove** in hover |
| Browse all notes | SmartNotes panel in the Explorer sidebar |
| Open note from sidebar | Click any note row |
| Delete note from sidebar | Click the trash icon on a note row, or right-click → *Delete Note* |

The gutter menu adapts: lines with a note show **Open** and **Remove**; lines without one show **Add**.

### Adding images

Drop an image file into the note's own folder (`.vscode/smartnotes/<source-path>/`) and reference it by filename:

```markdown
![my diagram](diagram.png)
```

Paths are also resolved relative to the workspace root and the source file's directory.

---

## Storage

Notes live in `.vscode/smartnotes/`, mirroring the source tree:

```
.vscode/smartnotes/
  src/
    extension.ts/
      L42.md        ← single-line note
      L10-L15.md    ← range note
```

Each `.md` file is pure Markdown — open it in any editor. Commit the folder to share notes with your team, or add it to `.gitignore` to keep them local.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `smartnotes.gutterIconEnabled` | `true` | Show gutter icon on annotated lines |
| `smartnotes.lineHighlightEnabled` | `false` | Highlight annotated lines |
| `smartnotes.lineHighlightColor` | `rgba(255,220,100,0.15)` | Highlight color |
| `smartnotes.overviewRulerEnabled` | `true` | Show marks in the scrollbar |
| `smartnotes.orphanCleanupEnabled` | `true` | Delete notes whose source file is gone |
| `smartnotes.orphanCleanupIntervalMinutes` | `30` | Cleanup interval |

---

## Future Work

- **Position tracking Stage 2** — content fingerprint to re-anchor notes after `git pull` or cold restart, even when lines shifted
- **Position tracking Stage 3** — AI-assisted re-anchoring for major refactors via MCP
- **MCP server** — expose notes as tools (`get_note`, `add_note`, `search_notes`) so AI assistants like Claude Code can read and write notes from chat
- **Multi-workspace support**
- **Marketplace publish**

---

## Building

```bash
npm install
npm run compile   # bundle with esbuild → dist/extension.js
npm run watch     # watch mode
npm run typecheck # tsc --noEmit
```

Press **F5** in VS Code to launch the Extension Development Host.
