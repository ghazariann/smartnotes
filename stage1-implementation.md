# Stage 1: Feature Overview

Mirror LineNote's feature set, fix its one flaw (no position tracking), store notes in `.git/.smartnotes/`.

---

## Feature 1: Markdown Files as Notes

Each note is a plain `.md` file. The user writes pure Markdown — no JSON, no IDs visible.

Storage: `.git/.smartnotes/` mirroring the source tree. The `.git/` location is always writable and never committed.

LineNote encodes line range in the filename (`file.js#L5-L10.md`). SmartNotes uses a UUID filename and stores position in YAML frontmatter — so the filename never needs to change when lines shift.

```markdown
---
file: src/extension.ts
line: 42
id: a1b2c3d4
---

# Why this function exists

Claude explained that this handles X because of Y constraint.
```

---

## Feature 2: Associating a Note to a Line (or Range)

LineNote supports both single-line and multi-line range notes. SmartNotes should too.

When the user runs "Add Note", the extension reads the current selection. If multiple lines are selected, `from` and `to` are both stored in the frontmatter. Single-line note: `from === to`.

No marker is written into the source file.

---

## Feature 3: Hover Rendering

The `HoverProvider` strips the frontmatter and passes the body to `vscode.MarkdownString`. VS Code renders it natively.

The hover footer (from LineNote, keep it) adds two inline command links: **Edit** (opens the `.md` file beside the source) and **Remove** (deletes it). These are `command:` URIs embedded in the Markdown.

LineNote also supports cross-references inside note bodies: writing `#L42` or `other-file.ts#L42` becomes a clickable link that jumps to that line. Worth adding.

---

## Feature 4: Gutter Icon and Line Highlight

Two decoration types (from LineNote):
- **Gutter icon** on the first line of the note range.
- **Line background color** across the full range.
- **Overview ruler mark** (scrollbar) so you can spot notes in long files.

All three are configurable via VS Code settings.

Decorations are debounced (LineNote uses 500ms) to avoid flickering during rapid edits.

---

## Feature 5: Opening and Editing Notes

Two ways to open a note:
- Click the **Edit** link in the hover — opens the specific `.md` file.
- Run command from palette — opens all notes overlapping the current cursor line.

Notes open in a split view beside the source file (`ViewColumn.Beside`), same as LineNote.

---

## Feature 6: Auto-delete Empty Notes

When a note file is closed, if its body is empty (whitespace only), delete the file automatically. Avoids accumulating empty stubs.

---

## Feature 7: Orphan Cleanup

On a configurable interval, scan all notes and delete any whose source file no longer exists. LineNote calls this `automaticallyDelete`. Configurable on/off and interval.

---

## Feature 8: Note File Watching

When a source file is open, watch its corresponding note folder for external changes (note added or deleted outside VS Code). Refresh decorations immediately when that happens. LineNote uses `chokidar` for this.

---

## Feature 9: Position Tracking (Delta) — SmartNotes addition

LineNote has none of this. Notes are permanently tied to the line encoded in their filename. Any edit above a note drifts it.

SmartNotes adds `PositionTracker`: listens to `onDidChangeTextDocument`, computes line delta, updates the `line` field in frontmatter in real time. Same mechanism as VSCode Bookmarks — fast, no scanning.

Git pull and cold-restart accuracy addressed in Stage 2.

---

## What LineNote Has That We Skip for Stage 1

- Multi-workspace folder support — add later, single workspace is fine for v1.
- Configurable note storage path — default to `.git/.smartnotes/`, make configurable in Phase 3.
