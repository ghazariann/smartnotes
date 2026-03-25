import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseFrontmatter,
  serializeFrontmatter,
  parseFilename,
  loadAllNotes,
} from '../src/noteStoreUtils';

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

test('parses anchor, line, error, pinned', () => {
  const raw = '---\nanchor: "def foo():"\nline: 10\nerror: true\npinned: true\n---\n\nbody';
  const { frontmatter, body } = parseFrontmatter(raw);
  expect(frontmatter.anchor).toBe('def foo():');
  expect(frontmatter.line).toBe(10);
  expect(frontmatter.error).toBe(true);
  expect(frontmatter.pinned).toBe(true);
  expect(body.trim()).toBe('body');
});

test('returns raw body when no frontmatter', () => {
  const { frontmatter, body } = parseFrontmatter('just a note');
  expect(frontmatter).toEqual({});
  expect(body).toBe('just a note');
});

test('unescapes special chars in anchor', () => {
  const raw = '---\nanchor: "say \\"hi\\" and \\\\done"\nline: 1\n---\n\n';
  expect(parseFrontmatter(raw).frontmatter.anchor).toBe('say "hi" and \\done');
});

// ─── serializeFrontmatter ─────────────────────────────────────────────────────

test('serializes all fields', () => {
  const out = serializeFrontmatter('def foo():', 9, true, true);
  expect(out).toBe('---\nanchor: "def foo():"\nline: 10\nerror: true\npinned: true\n---\n\n');
});

test('omits error and pinned when not set', () => {
  const out = serializeFrontmatter('anchor', 0);
  expect(out).not.toContain('error');
  expect(out).not.toContain('pinned');
});

test('returns empty string when anchorText is undefined', () => {
  expect(serializeFrontmatter(undefined)).toBe('');
});

test('round-trips anchor with special characters', () => {
  const anchor = 'say "hi" and \\done';
  const { frontmatter } = parseFrontmatter(serializeFrontmatter(anchor, 0) + 'body');
  expect(frontmatter.anchor).toBe(anchor);
});

// ─── parseFilename ────────────────────────────────────────────────────────────

test('parses L10 - def foo.md', () => {
  expect(parseFilename('L10 - def foo.md')).toEqual({ from: 9, to: 9, anchorText: 'def foo' });
});

test('parses L5-L10.md range', () => {
  expect(parseFilename('L5-L10.md')).toEqual({ from: 4, to: 9, anchorText: undefined });
});

test('strips [err] prefix before parsing', () => {
  expect(parseFilename('[err] L10 - def foo.md')).toEqual({ from: 9, to: 9, anchorText: 'def foo' });
});

test('returns null for custom filename', () => {
  expect(parseFilename('my custom note.md')).toBeNull();
});

// ─── loadAllNotes ─────────────────────────────────────────────────────────────

function makeTempStore(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'smartnotes-test-'));
}

function writeNote(storeDir: string, fileKey: string, filename: string, content: string): string {
  const dir = path.join(storeDir, ...fileKey.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

test('loads note with error and pinned flags', () => {
  const storeDir = makeTempStore();
  writeNote(storeDir, 'src/foo.ts', 'my note.md',
    '---\nanchor: "def foo"\nline: 5\nerror: true\npinned: true\n---\n\nbody');
  const notes = loadAllNotes(storeDir);
  expect(notes).toHaveLength(1);
  expect(notes[0].file).toBe('src/foo.ts');
  expect(notes[0].from).toBe(4);
  expect(notes[0].error).toBe(true);
  expect(notes[0].pinned).toBe(true);
});

test('treats [err] filename prefix as error (backward compat)', () => {
  const storeDir = makeTempStore();
  writeNote(storeDir, 'src/foo.ts', '[err] L5 - def foo.md',
    '---\nanchor: "def foo"\nline: 5\n---\n\nbody');
  expect(loadAllNotes(storeDir)[0].error).toBe(true);
});

test('skips files without parseable position', () => {
  const storeDir = makeTempStore();
  writeNote(storeDir, 'src/foo.ts', 'README.md', 'no frontmatter');
  expect(loadAllNotes(storeDir)).toHaveLength(0);
});

test('loads notes from multiple source files', () => {
  const storeDir = makeTempStore();
  writeNote(storeDir, 'src/foo.ts', 'L1.md', '---\nanchor: "a"\nline: 1\n---\n\n');
  writeNote(storeDir, 'src/bar.ts', 'L2.md', '---\nanchor: "b"\nline: 2\n---\n\n');
  const files = loadAllNotes(storeDir).map(n => n.file).sort();
  expect(files).toEqual(['src/bar.ts', 'src/foo.ts']);
});
