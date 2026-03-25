import { noteToListItem, noteToErrorItem, noteToSearchItem } from '../src/mcp-server';
import { Note } from '../src/types';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: '/store/src/foo.ts/L5 - def foo.md',
    file: 'src/foo.ts',
    from: 4,
    to: 4,
    body: '\nhello world\nsecond line',
    filePath: '/store/src/foo.ts/L5 - def foo.md',
    anchorText: 'def foo():',
    ...overrides,
  };
}

// ─── noteToListItem ───────────────────────────────────────────────────────────

test('list: basic fields and preview', () => {
  const item = noteToListItem(makeNote());
  expect(item.file).toBe('src/foo.ts');
  expect(item.line).toBe(5);
  expect(item.anchor).toBe('def foo():');
  expect(item.preview).toBe('hello world');
});

test('list: error and name only present when set', () => {
  expect(noteToListItem(makeNote({ error: true })).error).toBe(true);
  expect(noteToListItem(makeNote()).error).toBeUndefined();
  const pinned = makeNote({ pinned: true, filePath: '/store/src/foo.ts/my note.md' });
  expect(noteToListItem(pinned).name).toBe('my note');
  expect(noteToListItem(makeNote()).name).toBeUndefined();
});

test('list: null anchor and (empty) preview when missing', () => {
  expect(noteToListItem(makeNote({ anchorText: undefined })).anchor).toBeNull();
  expect(noteToListItem(makeNote({ body: '' })).preview).toBe('(empty)');
});

// ─── noteToErrorItem ──────────────────────────────────────────────────────────

test('error item: file, line, anchor; no preview/body/error field', () => {
  const item = noteToErrorItem(makeNote({ error: true }));
  expect(item.file).toBe('src/foo.ts');
  expect(item.line).toBe(5);
  expect(item.anchor).toBe('def foo():');
  expect(item.preview).toBeUndefined();
  expect(item.body).toBeUndefined();
  expect(item.error).toBeUndefined();
});

test('error item: name present only when pinned', () => {
  const pinned = makeNote({ error: true, pinned: true, filePath: '/store/my note.md' });
  expect(noteToErrorItem(pinned).name).toBe('my note');
  expect(noteToErrorItem(makeNote({ error: true })).name).toBeUndefined();
});

// ─── noteToSearchItem ─────────────────────────────────────────────────────────

test('search item: full trimmed body, error and name flags', () => {
  const item = noteToSearchItem(makeNote({
    body: '\nhello world\nsecond line\n',
    error: true,
    pinned: true,
    filePath: '/store/my note.md',
  }));
  expect(item.body).toBe('hello world\nsecond line');
  expect(item.error).toBe(true);
  expect(item.name).toBe('my note');
});
