import { applyChangesToMap, LineChange } from '../src/liveMapUtils';

function map(entries: [number, string][]): Map<number, string> {
  return new Map(entries);
}

function change(startLine: number, endLine: number, text: string): LineChange {
  return { startLine, endLine, text };
}

// ─── deletion ────────────────────────────────────────────────────────────────

test('delete line 0: note at line 0 is removed', () => {
  const m = map([[0, 'A']]);
  applyChangesToMap(m, [change(0, 1, '')]);
  expect(m.has(0)).toBe(false);
});

test('delete line 0: note at line 1 shifts to line 0', () => {
  const m = map([[1, 'B']]);
  applyChangesToMap(m, [change(0, 1, '')]);
  expect(m.get(0)).toBe('B');
});

test('delete line 0: note at line 0 removed, note at line 1 shifts up (adjacent notes)', () => {
  const m = map([[0, 'A'], [1, 'B']]);
  applyChangesToMap(m, [change(0, 1, '')]);
  expect(m.has(0)).toBe(true);
  expect(m.get(0)).toBe('B');
  expect(m.size).toBe(1);
});

test('delete line 0: note at line 2 shifts to line 1', () => {
  const m = map([[2, 'C']]);
  applyChangesToMap(m, [change(0, 1, '')]);
  expect(m.get(1)).toBe('C');
});

test('delete 3 lines (0-2): notes in range removed, note below shifts', () => {
  const m = map([[0, 'A'], [1, 'B'], [2, 'C'], [3, 'D']]);
  applyChangesToMap(m, [change(0, 3, '')]);
  expect(m.has(0)).toBe(true);
  expect(m.get(0)).toBe('D');
  expect(m.size).toBe(1);
});

test('delete middle line: note above unchanged, note below shifts up', () => {
  const m = map([[0, 'A'], [1, 'B'], [2, 'C']]);
  applyChangesToMap(m, [change(1, 2, '')]);
  expect(m.get(0)).toBe('A');
  expect(m.get(1)).toBe('C');
  expect(m.size).toBe(2);
});

test('delete note own line: note removed, nothing else shifts', () => {
  const m = map([[5, 'A']]);
  applyChangesToMap(m, [change(5, 6, '')]);
  expect(m.size).toBe(0);
});

test('returns true when map changed', () => {
  const m = map([[1, 'A']]);
  expect(applyChangesToMap(m, [change(0, 1, '')])).toBe(true);
});

test('returns false when lineDelta is 0 (only content changed, no line count change)', () => {
  const m = map([[1, 'A']]);
  expect(applyChangesToMap(m, [change(1, 1, 'newcontent')])).toBe(false);
  expect(m.get(1)).toBe('A');
});

// ─── insertion ────────────────────────────────────────────────────────────────

test('insert 1 line at line 0: note at line 0 stays', () => {
  const m = map([[0, 'A']]);
  applyChangesToMap(m, [change(0, 0, '\n')]);
  expect(m.get(0)).toBe('A');
});

test('insert 1 line at line 0: note at line 1 shifts to line 2', () => {
  const m = map([[1, 'B']]);
  applyChangesToMap(m, [change(0, 0, '\n')]);
  expect(m.get(2)).toBe('B');
});

test('insert 3 lines at line 2: notes at lines 0,1,2 stay, note at line 3 shifts to 6', () => {
  const m = map([[0, 'A'], [1, 'B'], [2, 'C'], [3, 'D']]);
  applyChangesToMap(m, [change(2, 2, '\n\n\n')]);
  expect(m.get(0)).toBe('A');
  expect(m.get(1)).toBe('B');
  expect(m.get(2)).toBe('C');
  expect(m.get(6)).toBe('D');
});

test('insert at end of note line: note stays, notes below shift', () => {
  const m = map([[3, 'A'], [4, 'B']]);
  applyChangesToMap(m, [change(3, 3, '\n')]);
  expect(m.get(3)).toBe('A');
  expect(m.get(5)).toBe('B');
});

// ─── multiple changes in one event ────────────────────────────────────────────

test('two deletions in same event processed descending', () => {
  // delete line 4, then line 1 — sorted descending so line 4 goes first
  const m = map([[1, 'A'], [4, 'B'], [6, 'C']]);
  applyChangesToMap(m, [change(1, 2, ''), change(4, 5, '')]);
  // After delete line 4 (processed first): B removed, C→5
  // After delete line 1: A removed, C→4
  expect(m.has(1)).toBe(false);
  expect(m.has(4)).toBe(true);
  expect(m.get(4)).toBe('C');
  expect(m.size).toBe(1);
});

// ─── edge cases ──────────────────────────────────────────────────────────────

test('empty map: no crash, returns false', () => {
  const m = map([]);
  expect(applyChangesToMap(m, [change(0, 1, '')])).toBe(false);
});

test('note exactly at endLine shifts (not treated as deleted)', () => {
  // VS Code deletion range is [start, end) — endLine is first line NOT deleted
  const m = map([[3, 'A']]);
  applyChangesToMap(m, [change(1, 3, '')]);  // deletes lines 1 and 2
  expect(m.has(1)).toBe(true);
  expect(m.get(1)).toBe('A');
});
