# SmartNotes
**VS Code Extension — Project Plan**  
Version 0.1 · March 2026

---

## 1. What Is SmartNotes?

SmartNotes is a VS Code extension that lets developers attach persistent Markdown notes to any part of their code. Notes render as hover tooltips, stay anchored as code changes, and can be opened in a full editor via a command. An MCP server is also included, allowing AI tools like Claude Code to read and write notes directly from the chat.

---

## 2. Core Features

### Markdown Tooltip
Notes render as rich Markdown hover previews using VS Code's native tooltip renderer — supports headings, code blocks, bold, lists, and more.

### Position Tracking
Notes stay anchored to the correct code as lines shift. Stage 1 (ship): delta tracking via `onDidChangeTextDocument`, same mechanism as VSCode Bookmarks — fast and works perfectly during a live session. Stage 2: content fingerprint to survive git pull and cold restarts. Stage 3: AI re-anchoring for major refactors. See `tecnical details.md` for the full breakdown.

### Open Note Command
A dedicated command (and keybinding) opens the note for the selected code in a full Markdown editor panel — useful for longer, more detailed annotations.

### MCP Server
An optional local MCP server exposes notes as tools (get, add, update, delete, search) so AI assistants can query and create notes via natural language chat.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| VS Code APIs | HoverProvider, TextEditorDecorationType, McpServerDefinition |
| Storage | `.git/.smartnotes/` — one `.md` file per note, YAML frontmatter for metadata |
| MCP Transport | stdio (Claude Code compatible) |
| Bundler | esbuild |
| Publishing | vsce → Visual Studio Marketplace |

---

## 4. Roadmap

### Phase 1 — Core (Weeks 1–2)
See `stage1-implementation.md` for the full implementation plan.

- Scaffold extension with `yo code`
- `NoteStore`: read/write/delete `.smartnotes/` JSON per file
- `PositionTracker`: delta tracking via `onDidChangeTextDocument` (same as VSCode Bookmarks)
- `HoverProvider`: render Markdown tooltip on the annotated line
- `GutterDecorator`: gutter icon on lines with notes
- Add / Edit / Delete commands + keybindings

Known Stage 1 limitation: notes fall back to saved line number after git pull or process restart. Fixed in Stage 2.

### Phase 2 — MCP Server (Week 3)
- Register MCP server via `vscode.McpServerDefinition`
- Implement tools: `get_note`, `add_note`, `update_note`, `delete_note`, `search_notes`
- Test end-to-end with Claude Code chat

### Phase 2.5 — Position Tracking Stage 2 (Week 3, alongside MCP)
- Normalised diff: strip comments and whitespace before fingerprint comparison
- Note survives reformats, inline comment additions, linter renames

### Phase 3 — Ship (Week 4)
- SmartNotes panel: tree view of all notes by file
- Settings: storage path, icon style, toggle MCP server
- README, demo GIF, marketplace listing
- Publish to VS Code Marketplace

### Phase 4 — AI Re-anchoring Stage 3 (v2)
- On-demand AI analysis for unanchored notes via MCP
- Send original fingerprint + new file to AI, get suggested anchor back
- User confirms or dismisses the suggested re-anchor

---

## 5. Immediate Next Steps

1. Scaffold: run `npx --package yo --package generator-code -- yo code`
2. Build the Note Store class (get / set / delete / list)
3. Wire up HoverProvider to render notes as Markdown tooltips
4. Implement position tracking on document change events
5. Add the Open Note command

---

## 6. How It Differs From Existing Tools

| Extension | Capability |
|---|---|
| Marginalia | Markdown notes stored as files, hover preview. No AI integration. |
| Sidenotes | External notes shown on hover. No AI integration. |
| Line Note Plus | Markdown notes on hover. No position tracking or AI integration. |
| **SmartNotes ✦** | Tooltip rendering, position tracking, open command, and MCP for AI tools. |
