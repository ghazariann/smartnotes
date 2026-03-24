import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadAllNotes, noteFilePath, parseFrontmatter, serializeFrontmatter } from './noteStoreUtils';

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
    const lines = filtered.map(n => {
      const lineRange = n.from === n.to ? `L${n.from + 1}` : `L${n.from + 1}-${n.to + 1}`;
      const preview = n.body.split('\n')[0].slice(0, 80) || '(empty)';
      const errFlag = path.basename(n.filePath).startsWith('[err]') ? '[err] ' : '';
      return `${errFlag}${n.file}:${lineRange}${n.anchorText ? ` (${n.anchorText})` : ''}\n  ${preview}`;
    });
    return { content: [{ type: 'text', text: lines.join('\n\n') }] };
  }
);

server.tool(
  'get_note',
  'Get the full Markdown body of a note at a specific line in a file.',
  {
    file: z.string().describe('Relative path to source file, e.g. "src/extension.ts"'),
    line: z.number().int().min(1).describe('1-based line number'),
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
    line: z.number().int().min(1).describe('1-based line number to anchor the note to'),
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
    line: z.number().int().min(1).describe('1-based line number'),
    body: z.string().describe('New Markdown content'),
  },
  async ({ file, line, body }) => {
    const notes = getNotesAtLine(file, line - 1);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No note found at ${file}:${line}` }] };
    }
    const existing = fs.readFileSync(notes[0].filePath, 'utf8');
    const { frontmatter } = parseFrontmatter(existing);
    fs.writeFileSync(notes[0].filePath, serializeFrontmatter(frontmatter.anchor, frontmatter.line !== undefined ? frontmatter.line - 1 : undefined) + body, 'utf8');
    return { content: [{ type: 'text', text: `Note updated at ${file}:${line}` }] };
  }
);

server.tool(
  'delete_note',
  'Delete the note anchored at a specific line in a file.',
  {
    file: z.string().describe('Relative path to source file'),
    line: z.number().int().min(1).describe('1-based line number'),
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
    const matches = loadAllNotes(storeDir).filter(n => n.body.toLowerCase().includes(lower));
    if (matches.length === 0) {
      return { content: [{ type: 'text', text: `No notes matching "${query}"` }] };
    }
    const lines = matches.map(n => {
      const lineRange = n.from === n.to ? `L${n.from + 1}` : `L${n.from + 1}-${n.to + 1}`;
      return `${n.file}:${lineRange}\n${n.body.trim()}`;
    });
    return { content: [{ type: 'text', text: lines.join('\n\n---\n\n') }] };
  }
);

server.tool(
  'copy_note',
  'Copy a note from one file/line to another location.',
  {
    from_file: z.string().describe('Source file (relative path)'),
    from_line: z.number().int().min(1).describe('Source line (1-based)'),
    to_file: z.string().describe('Destination file (relative path)'),
    to_line: z.number().int().min(1).describe('Destination line (1-based)'),
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
    from_line: z.number().int().min(1).describe('Source line (1-based)'),
    to_file: z.string().describe('Destination file (relative path)'),
    to_line: z.number().int().min(1).describe('Destination line (1-based)'),
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
  'rename_file_notes',
  'Move all notes from one source file path to another. Use this after renaming a source file so notes stay attached.',
  {
    old_file: z.string().describe('Old relative file path, e.g. "src/utils.ts"'),
    new_file: z.string().describe('New relative file path, e.g. "src/helpers.ts"'),
  },
  async ({ old_file, new_file }) => {
    const notes = loadAllNotes(storeDir).filter(n => n.file === old_file);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: `No notes found for ${old_file}` }] };
    }
    let moved = 0;
    for (const note of notes) {
      const newPath = noteFilePath(storeDir, new_file, note.from, note.to, note.anchorText);
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      try {
        fs.renameSync(note.filePath, newPath);
        moved++;
      } catch { /* skip if rename fails */ }
    }
    return { content: [{ type: 'text', text: `Moved ${moved} note(s) from ${old_file} to ${new_file}` }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`SmartNotes MCP error: ${err}\n`);
  process.exit(1);
});
