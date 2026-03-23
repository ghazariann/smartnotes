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
Browse all notes grouped by file in a dedicated activity bar panel. Right-click any section to add, open, or remove notes, or use `Ctrl+Alt+N` to add a note from the keyboard.

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


## MCP server 

SmartNotes includes a bundled MCP server so agents (claude code for now) can read and write notes directly from chat.

**Setup (once):** When you install or update the extension, a notification appears with a "Copy Command" button. Click it, paste the command in your terminal:

```bash
claude mcp add smartnotes node "/path/to/stable/mcp-server.js"
```

That's it. The path is stable, so it won't change when the extension updates.

**Tools available to Claude:**

| Tool | What it does |
|------|-------------|
| `list_notes` | List all notes; optionally filter by file |
| `get_note` | Read a note at a specific line |
| `add_note` | Create a note anchored to a line |
| `update_note` | Overwrite a note's content |
| `delete_note` | Delete a note at a line |
| `search_notes` | Full-text search across all notes |
| `copy_note` | Copy a note to another file/line |
| `move_note` | Move a note to another file/line |
| `list_files` | List files that have notes, with counts |
| `rename_file_notes` | Re-attach all notes after a file rename |

**Example prompts:**
- *"What SmartNotes do I have in this project?"*
- *"Explain what `verifyAndReanchorFile` does and save the explanation as a note on line 249 of src/NoteStore.ts"*
- *"I renamed utils.ts to helpers.ts, update the notes"*
- *Check all my SmartNotes for any that start with [err] — those are notes that couldn't be re-anchored automatically after a file change. For each one, look at the note's filename to understand what function or line it was on, then search the codebase to find where that code might have moved — it could be a renamed function, a renamed file, or code extracted to a different module. Reason out the best match and move each note there using move_note and give summary"*
