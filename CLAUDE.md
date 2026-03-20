# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SmartNotes is a VS Code extension that attaches persistent Markdown notes to code. Notes render as hover tooltips and stay anchored as code evolves (position tracking, not raw line numbers). An MCP server is bundled so AI tools like Claude Code can read/write notes from chat.

## Commands

Once scaffolded with `npx --package yo --package generator-code -- yo code`:

```bash
npm run compile        # compile TypeScript via esbuild
npm run watch          # watch mode during development
npm run lint           # ESLint
npm run test           # run extension tests
vsce package           # package .vsix for local install
vsce publish           # publish to VS Code Marketplace
```

## Architecture

**Storage** — notes live in `.git/.smartnotes/` at the workspace root, one `.md` file per note. No changes are ever written to the source code itself. The `.git/` location avoids any permission or gitignore issues since `.git/` is always writable and never committed.

**Core classes to build:**
- `NoteStore` — get / set / delete / list notes, keyed by file + semantic position (not line number)
- `HoverProvider` — registered via `vscode.languages.registerHoverProvider`, renders note Markdown as a tooltip
- `PositionTracker` — listens to `vscode.workspace.onDidChangeTextDocument` to keep note anchors valid as lines shift
- `NoteEditorPanel` — opens a full Markdown editor (`WebviewPanel`) for longer annotations via a command/keybinding
- `MCP Server` — registered via `vscode.McpServerDefinition` with stdio transport, exposes tools: `get_note`, `add_note`, `update_note`, `delete_note`, `search_notes`

**Extension entry point** — `src/extension.ts`, `activate()` wires up all providers, commands, and the MCP server registration.

**Bundler** — esbuild (not tsc directly); `esbuild.js` at root drives the build.

## Coding Style

- Comments: sparingly — only on genuinely complex logic, not on self-evident code.

## Reference Documents

- `SmartNotes-Project-Plan.md` — overall goals, roadmap, and feature scope.
- `stage1-implementation.md` — Stage 1 feature breakdown, the primary reference for what to build first.

## Key Design Constraints

- Notes must never modify the source file or add any comments/markers to the codebase.
- Position tracking must use semantic anchoring (symbol/range heuristics), not raw line numbers — this is the core differentiator from LineNotes and Line Note Plus.
- MCP transport is stdio to stay compatible with Claude Code.
- Storage path and icon style are user-configurable via VS Code settings.
