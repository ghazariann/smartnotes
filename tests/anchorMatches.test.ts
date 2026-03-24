import { anchorMatches, normalizeAnchor } from '../src/noteStoreUtils';

// ─── normalizeAnchor ──────────────────────────────────────────────────────────

test('trims whitespace', () => {
  expect(normalizeAnchor('  def foo()  ')).toBe('def foo()');
});

test('strips // comment', () => {
  expect(normalizeAnchor('x = 1 // set x')).toBe('x = 1');
});

test('strips # comment', () => {
  expect(normalizeAnchor('if x:  # check x')).toBe('if x:');
});

test('collapses internal whitespace', () => {
  expect(normalizeAnchor('def   foo(  )')).toBe('def foo( )');
});

// ─── anchorMatches ────────────────────────────────────────────────────────────

test('exact match', () => {
  expect(anchorMatches('def foo():', 'def foo():')).toBe(true);
});

test('line starts with anchor (prefix match)', () => {
  expect(anchorMatches('def foo', 'def foo(x, y):')).toBe(true);
});

test('anchor does not match unrelated line', () => {
  expect(anchorMatches('def foo():', 'class Bar:')).toBe(false);
});

test('anchor shorter than 4 chars returns false', () => {
  expect(anchorMatches('fn', 'fn something')).toBe(false);
});

test('line shorter than 4 chars returns false', () => {
  expect(anchorMatches('def foo', 'fn')).toBe(false);
});

test('match ignores trailing comment on line', () => {
  expect(anchorMatches('backend_config = None', 'backend_config = None  # default')).toBe(true);
});

test('different lines with similar prefix do not false-match', () => {
  expect(anchorMatches('if backend_config is None:', 'backend_config = KubernetesBackendConfig()')).toBe(false);
});

test('adjacent similar lines do not cross-match', () => {
  expect(anchorMatches('backend_config = KubernetesBackendConfig()', 'if backend_config is None:')).toBe(false);
});
