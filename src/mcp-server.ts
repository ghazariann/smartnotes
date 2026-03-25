import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadAllNotes, noteFilePath, parseFrontmatter, serializeFrontmatter } from './noteStoreUtils';
import { Note } from './types';

export function noteToListItem(n: Note): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    file: n.file,
    line: n.from + 1,
    anchor: n.anchorText ?? null,
    preview: n.body.split('\n').find(l => l.trim())?.slice(0, 80) ?? '(empty)',
  };
  if (n.error) obj.error = true;
  if (n.pinned) obj.name = path.basename(n.filePath, '.md');
  return obj;
}

export function noteToErrorItem(n: Note): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    file: n.file,
    line: n.from + 1,
    anchor: n.anchorText ?? null,
  };
  if (n.pinned) obj.name = path.basename(n.filePath, '.md');
  return obj;
}

export function noteToSearchItem(n: Note): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    file: n.file,
    line: n.from + 1,
    anchor: n.anchorText ?? null,
    body: n.body.trim(),
  };
  if (n.error) obj.error = true;
  if (n.pinned) obj.name = path.basename(n.filePath, '.md');
  return obj;
}

const workspaceRoot = process.argv[2] ?? process.cwd();

const storeDir = path.join(workspaceRoot, '.vscode', 'smartnotes');

function getNotesAtLine(fileKey: string, line: number) {
  return loadAllNotes(storeDir).filter(n => n.file === fileKey && n.from <= line && line <= n.to);
}

const server = new McpServer({
  name: 'smartnotes',
  version: '0.4.0',
});

server.tool(
  'list_notes',
  'List all SmartNotes in the workspace. Optionally filter by source file (relative path).',
  { file: z.string().optional().describe('Relative path to filter by, e.g. "src/extension.ts"') },
  async ({ file }) => {
    const notes = loadAllNotes(storeDir);
    const filtered = file ? notes.filter(n => n.file === file) : notes;
    if (filtered.length === 0) {
      return { content: [{ type: 'text', text: 'No notes found.' }] };
    }
    const result = filtered.map(noteToListItem);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'list_errors',
  'List all notes whose anchor could not be found — these need to be re-anchored or deleted.',
  {},
  async () => {
    const notes = loadAllNotes(storeDir).filter(n => n.error);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: 'No errored notes.' }] };
    }
    const result = notes.map(noteToErrorItem);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'get_note',
  'Get the full Markdown body of a note at a specific line in a file.',
  {
    file: z.string().describe('Relative path to source file, e.g. "src/extension.ts"'),
    line: z.coerce.number().int().min(1).describe('1-based line number'),
  },
  async ({ file, line }) => {
    const notes = getNotesAtLine(file, line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${file}:${line}` }] };
    }
    const raw = fs.readFileSync(notes[0].filePath, 'utf8');
    return { content: [{ type: 'text', text: raw || '(empty note)' }] };
  }
);

server.tool(
  'add_note',
  'Add a new Markdown note anchored to a line in a source file.',
  {
    file: z.string().describe('Relative path to source file, e.g. "src/extension.ts"'),
    line: z.coerce.number().int().min(1).describe('1-based line number to anchor the note to'),
    body: z.string().describe('Markdown content for the note'),
  },
  async ({ file, line, body }) => {
    const from = line - 1;
    let anchorText: string | undefined;
    try {
      const srcPath = path.join(workspaceRoot, file);
      const srcLines = fs.readFileSync(srcPath, 'utf8').split('\n');
      anchorText = srcLines[from]?.trim() || undefined;
    } catch {
      // source file not readable — proceed without anchorText
    }
    const filePath = noteFilePath(storeDir, file, from, from, anchorText);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, serializeFrontmatter(anchorText, from) + body, 'utf8');
    return { content: [{ type: 'text', text: `Note added at ${file}:${line}` }] };
  }
);

server.tool(
  'update_note',
  'Update the Markdown body of an existing note at a specific line.',
  {
    file: z.string().describe('Relative path to source file'),
    line: z.coerce.number().int().min(1).describe('1-based line number'),
    body: z.string().describe('New Markdown content'),
  },
  async ({ file, line, body }) => {
    const notes = getNotesAtLine(file, line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${file}:${line}` }] };
    }
    const existing = fs.readFileSync(notes[0].filePath, 'utf8');
    const { frontmatter } = parseFrontmatter(existing);
    fs.writeFileSync(notes[0].filePath, serializeFrontmatter(frontmatter.anchor, frontmatter.line !== undefined ? frontmatter.line - 1 : undefined, frontmatter.error, frontmatter.pinned) + body, 'utf8');
    return { content: [{ type: 'text', text: `Note updated at ${file}:${line}` }] };
  }
);

server.tool(
  'delete_note',
  'Delete the note anchored at a specific line in a file.',
  {
    file: z.string().describe('Relative path to source file'),
    line: z.coerce.number().int().min(1).describe('1-based line number'),
  },
  async ({ file, line }) => {
    const notes = getNotesAtLine(file, line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${file}:${line}` }] };
    }
    for (const note of notes) {
      try { fs.unlinkSync(note.filePath); } catch { /* already gone */ }
    }
    return { content: [{ type: 'text', text: `Deleted ${notes.length} note(s) at ${file}:${line}` }] };
  }
);

server.tool(
  'search_notes',
  'Search all note bodies for a query string (case-insensitive).',
  { query: z.string().describe('Search query') },
  async ({ query }) => {
    const lower = query.toLowerCase();
    const matches = loadAllNotes(storeDir).filter(n => {
      return n.body.toLowerCase().includes(lower) ||
        n.file.toLowerCase().includes(lower) ||
        path.basename(n.filePath, '.md').toLowerCase().includes(lower) ||
        (n.error && '[err]'.includes(lower)) ||
        (n.pinned && '[pinned]'.includes(lower));
    });
    if (matches.length === 0) {
      return { content: [{ type: 'text', text: `No notes matching "${query}"` }] };
    }
    const result = matches.map(noteToSearchItem);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'copy_note',
  'Copy a note from one file/line to another location.',
  {
    from_file: z.string().describe('Source file (relative path)'),
    from_line: z.coerce.number().int().min(1).describe('Source line (1-based)'),
    to_file: z.string().describe('Destination file (relative path)'),
    to_line: z.coerce.number().int().min(1).describe('Destination line (1-based)'),
  },
  async ({ from_file, from_line, to_file, to_line }) => {
    const notes = getNotesAtLine(from_file, from_line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${from_file}:${from_line}` }] };
    }
    const body = notes[0].body;
    const toFrom = to_line - 1;
    let anchorText: string | undefined;
    try {
      const srcLines = fs.readFileSync(path.join(workspaceRoot, to_file), 'utf8').split('\n');
      anchorText = srcLines[toFrom]?.trim() || undefined;
    } catch { /* proceed without anchorText */ }
    const filePath = noteFilePath(storeDir, to_file, toFrom, toFrom, anchorText);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, serializeFrontmatter(anchorText, toFrom) + body, 'utf8');
    return { content: [{ type: 'text', text: `Note copied from ${from_file}:${from_line} to ${to_file}:${to_line}` }] };
  }
);

server.tool(
  'move_note',
  'Move a note from one file/line to another, deleting the original.',
  {
    from_file: z.string().describe('Source file (relative path)'),
    from_line: z.coerce.number().int().min(1).describe('Source line (1-based)'),
    to_file: z.string().describe('Destination file (relative path)'),
    to_line: z.coerce.number().int().min(1).describe('Destination line (1-based)'),
  },
  async ({ from_file, from_line, to_file, to_line }) => {
    const notes = getNotesAtLine(from_file, from_line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${from_file}:${from_line}` }] };
    }
    const body = notes[0].body;
    const toFrom = to_line - 1;
    let anchorText: string | undefined;
    try {
      const srcLines = fs.readFileSync(path.join(workspaceRoot, to_file), 'utf8').split('\n');
      anchorText = srcLines[toFrom]?.trim() || undefined;
    } catch { /* proceed without anchorText */ }
    const filePath = noteFilePath(storeDir, to_file, toFrom, toFrom, anchorText);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, serializeFrontmatter(anchorText, toFrom) + body, 'utf8');
    try { fs.unlinkSync(notes[0].filePath); } catch { /* already gone */ }
    return { content: [{ type: 'text', text: `Note moved from ${from_file}:${from_line} to ${to_file}:${to_line}` }] };
  }
);

server.tool(
  'list_files',
  'List all source files in the workspace that have at least one SmartNote, with note counts.',
  {},
  async () => {
    const notes = loadAllNotes(storeDir);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: 'No notes in this workspace.' }] };
    }
    const counts = new Map<string, number>();
    for (const note of notes) counts.set(note.file, (counts.get(note.file) ?? 0) + 1);
    const lines = [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, count]) => `${file}  (${count} note${count === 1 ? '' : 's'})`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

server.tool(
  'set_note_name',
  'Give a note a custom name (pins it). The filename is locked after this — position tracking and error state will never rename it.',
  {
    file: z.string().describe('Relative path to source file'),
    line: z.coerce.number().int().min(1).describe('1-based line number'),
    name: z.string().describe('Custom name for the note file (without .md)'),
  },
  async ({ file, line, name }) => {
    const notes = getNotesAtLine(file, line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${file}:${line}` }] };
    }
    const note = notes[0];
    const cleanName = name.replace(/[<>:"/\\|?*]/g, '').trim();
    if (!cleanName) {
      return { content: [{ type: 'text', text: 'Name cannot be empty — use unset_note_name to restore auto-name.' }] };
    }
    const newPath = path.join(path.dirname(note.filePath), `${cleanName}.md`);
    if (newPath === note.filePath) {
      return { content: [{ type: 'text', text: `Note already named "${cleanName}".` }] };
    }
    try { fs.renameSync(note.filePath, newPath); } catch {
      return { content: [{ type: 'text', text: 'Failed to rename note file.' }] };
    }
    const raw = fs.readFileSync(newPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    fs.writeFileSync(newPath, serializeFrontmatter(frontmatter.anchor, frontmatter.line !== undefined ? frontmatter.line - 1 : undefined, frontmatter.error, true) + body, 'utf8');
    return { content: [{ type: 'text', text: `Note at ${file}:${line} named "${cleanName}" and pinned.` }] };
  }
);

server.tool(
  'unset_note_name',
  'Remove a custom name from a note, restoring the auto-generated filename and unpinning it.',
  {
    file: z.string().describe('Relative path to source file'),
    line: z.coerce.number().int().min(1).describe('1-based line number'),
  },
  async ({ file, line }) => {
    const notes = getNotesAtLine(file, line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${file}:${line}` }] };
    }
    const note = notes[0];
    const autoPath = noteFilePath(storeDir, note.file, note.from, note.to, note.anchorText);
    if (autoPath === note.filePath) {
      return { content: [{ type: 'text', text: 'Note is already using the auto-generated name.' }] };
    }
    try { fs.renameSync(note.filePath, autoPath); } catch {
      return { content: [{ type: 'text', text: 'Failed to rename note file.' }] };
    }
    const raw = fs.readFileSync(autoPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    fs.writeFileSync(autoPath, serializeFrontmatter(frontmatter.anchor, frontmatter.line !== undefined ? frontmatter.line - 1 : undefined, frontmatter.error, undefined) + body, 'utf8');
    return { content: [{ type: 'text', text: `Note at ${file}:${line} unpinned and restored to auto-name.` }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`SmartNotes MCP error: ${err}\n`);
    process.exit(1);
  });
}
