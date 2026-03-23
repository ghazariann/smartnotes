import * as fs from 'fs';
import * as path from 'path';
import { Note } from './types';

export function walkMdFiles(dir: string): string[] {
  let results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkMdFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/** Parse `from`/`to` (0-indexed) and optional `anchorText` slug from filenames like
 *  `L10.md`, `L5-L10.md`, `L10 - def foo.md`, or `[err] L10 - def foo.md`. */
export function parseFilename(filename: string): { from: number; to: number; anchorText?: string } | null {
  const base = filename.slice(0, -3).replace(/^\[err\]\s*/, '');
  let m = base.match(/^L(\d+)(?:\s+-\s+(.+?))?(?:~\d+)?$/);
  if (m) {
    const line = parseInt(m[1], 10) - 1;
    return { from: line, to: line, anchorText: m[2]?.trim() || undefined };
  }
  m = base.match(/^L(\d+)-L(\d+)(?:\s+-\s+(.+?))?(?:~\d+)?$/);
  if (m) {
    return { from: parseInt(m[1], 10) - 1, to: parseInt(m[2], 10) - 1, anchorText: m[3]?.trim() || undefined };
  }
  return null;
}

/** Generate a collision-safe file path for a note. */
export function noteFilePath(storeDir: string, fileKey: string, from: number, to: number, anchorText?: string): string {
  const noteDir = path.join(storeDir, ...fileKey.split('/'));
  const linesPart = from === to ? `L${from + 1}` : `L${from + 1}-L${to + 1}`;
  const slug = anchorText
    ? ' - ' + anchorText.replace(/[<>:"/\\|?*]/g, '').trim().slice(0, 40)
    : '';
  const base = linesPart + slug;
  const first = path.join(noteDir, `${base}.md`);
  if (!fs.existsSync(first)) return first;
  let i = 2;
  while (true) {
    const c = path.join(noteDir, `${base}~${i}.md`);
    if (!fs.existsSync(c)) return c;
    i++;
  }
}

/** Derive the source fileKey from a note's absolute path. */
export function fileKeyFromNotePath(storeDir: string, filePath: string): string {
  const rel = path.relative(storeDir, path.dirname(filePath));
  return rel.split(path.sep).join('/');
}

export function normalizeAnchor(text: string): string {
  let s = text.trim();
  s = s.replace(/\s+\/\/.*$/, '');
  s = s.replace(/\s+#+.*$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

export function anchorMatches(anchorText: string, lineText: string): boolean {
  const aNorm = normalizeAnchor(anchorText);
  const lNorm = normalizeAnchor(lineText);
  if (aNorm.length < 4 || lNorm.length < 4) return false;
  return aNorm === lNorm || lNorm.startsWith(aNorm) || aNorm.startsWith(lNorm);
}

/** Load all notes from a store directory into a flat array. */
export function loadAllNotes(storeDir: string): Note[] {
  const notes: Note[] = [];
  for (const filePath of walkMdFiles(storeDir)) {
    try {
      const pos = parseFilename(path.basename(filePath));
      if (!pos) continue;
      const fileKey = fileKeyFromNotePath(storeDir, filePath);
      const body = fs.readFileSync(filePath, 'utf8');
      notes.push({ id: filePath, file: fileKey, from: pos.from, to: pos.to, body, filePath, anchorText: pos.anchorText });
    } catch {
      // skip unreadable files
    }
  }
  return notes;
}
