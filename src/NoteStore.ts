import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Note } from './types';

export class NoteStore {
  readonly storeDir: string;
  private index: Map<string, Note[]> = new Map();
  private writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private changeEmitter = new vscode.EventEmitter<string>();
  readonly onDidChange: vscode.Event<string> = this.changeEmitter.event;

  constructor(private workspaceRoot: string) {
    this.storeDir = path.join(workspaceRoot, '.vscode', 'smartnotes');
    fs.mkdirSync(this.storeDir, { recursive: true });
  }

  async loadAll(): Promise<void> {
    this.index.clear();
    for (const filePath of this._walkMdFiles(this.storeDir)) {
      try {
        const pos = this._parseFilename(path.basename(filePath));
        if (!pos) continue;
        const fileKey = this._fileKeyFromNotePath(filePath);
        const body = fs.readFileSync(filePath, 'utf8');
        const anchorText = this._anchorTextFromOpenDocs(fileKey, pos.from);
        const note: Note = { id: filePath, file: fileKey, from: pos.from, to: pos.to, body, filePath, anchorText };
        const bucket = this.index.get(fileKey) ?? [];
        bucket.push(note);
        this.index.set(fileKey, bucket);
      } catch {
        // skip unreadable files
      }
    }
  }

  getNotesForFile(fileKey: string): Note[] {
    return this.index.get(fileKey) ?? [];
  }

  getNotesAtLine(fileKey: string, line: number): Note[] {
    return this.getNotesForFile(fileKey).filter(
      n => n.from <= line && line <= n.to
    );
  }

  async addNote(fileKey: string, from: number, to: number, body: string, anchorText?: string): Promise<Note> {
    const filePath = this._noteFilePath(fileKey, from, to, anchorText);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const note: Note = { id: filePath, file: fileKey, from, to, body, filePath, anchorText };
    const bucket = this.index.get(fileKey) ?? [];
    bucket.push(note);
    this.index.set(fileKey, bucket);
    fs.writeFileSync(filePath, body, 'utf8');
    this.changeEmitter.fire(fileKey);
    return note;
  }

  async updateNoteBody(noteId: string, body: string): Promise<void> {
    const note = this._findById(noteId);
    if (!note) return;
    note.body = body;
    this._scheduleDebouncedWrite(note);
  }

  updateNotePosition(noteId: string, from: number, to: number): void {
    const note = this._findById(noteId);
    if (!note) return;
    const newPath = this._noteFilePath(note.file, from, to, note.anchorText);
    note.from = from;
    note.to = to;
    if (newPath !== note.filePath) {
      try {
        fs.renameSync(note.filePath, newPath);
      } catch {
        return;
      }
      const timer = this.writeTimers.get(note.id);
      if (timer) {
        this.writeTimers.delete(note.id);
        this.writeTimers.set(newPath, timer);
      }
      note.id = newPath;
      note.filePath = newPath;
    }
  }

  async deleteNote(noteId: string): Promise<void> {
    const note = this._findById(noteId);
    if (!note) return;
    const timer = this.writeTimers.get(noteId);
    if (timer) {
      clearTimeout(timer);
      this.writeTimers.delete(noteId);
    }
    const bucket = this.index.get(note.file);
    if (bucket) {
      const idx = bucket.indexOf(note);
      if (idx !== -1) bucket.splice(idx, 1);
    }
    try {
      fs.unlinkSync(note.filePath);
    } catch {
      // already gone
    }
    this.changeEmitter.fire(note.file);
  }

  listAllNotes(): Note[] {
    const all: Note[] = [];
    for (const notes of this.index.values()) all.push(...notes);
    return all;
  }

  reloadNoteFile(filePath: string): void {
    try {
      const pos = this._parseFilename(path.basename(filePath));
      if (!pos) return;
      const fileKey = this._fileKeyFromNotePath(filePath);
      const body = fs.readFileSync(filePath, 'utf8');
      this._removeByFilePath(filePath);
      const existing = this._findById(filePath);
      const anchorText = existing?.anchorText ?? this._anchorTextFromOpenDocs(fileKey, pos.from);
      const note: Note = { id: filePath, file: fileKey, from: pos.from, to: pos.to, body, filePath, anchorText };
      const bucket = this.index.get(fileKey) ?? [];
      bucket.push(note);
      this.index.set(fileKey, bucket);
      this.changeEmitter.fire(fileKey);
    } catch {
      // ignore
    }
  }

  removeNoteFile(filePath: string): void {
    const removed = this._removeByFilePath(filePath);
    if (removed) this.changeEmitter.fire(removed.file);
  }

  findById(noteId: string): Note | undefined {
    return this._findById(noteId);
  }

  // ─── private ─────────────────────────────────────────────────────────────

  /** Generate a collision-safe file path for a note. */
  private _noteFilePath(fileKey: string, from: number, to: number, anchorText?: string): string {
    const noteDir = path.join(this.storeDir, ...fileKey.split('/'));
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

  /** Parse `from`/`to` (0-indexed) from a filename like `L10.md`, `L5-L10.md`, or `L10 - def foo.md`. */
  private _parseFilename(filename: string): { from: number; to: number } | null {
    const base = filename.slice(0, -3); // strip .md
    let m = base.match(/^L(\d+)(?:\s+-.*)?(?:~\d+)?$/);
    if (m) {
      const line = parseInt(m[1], 10) - 1;
      return { from: line, to: line };
    }
    m = base.match(/^L(\d+)-L(\d+)(?:\s+-.*)?(?:~\d+)?$/);
    if (m) {
      return { from: parseInt(m[1], 10) - 1, to: parseInt(m[2], 10) - 1 };
    }
    return null;
  }

  /** Derive the source fileKey from a note's absolute path. */
  private _fileKeyFromNotePath(filePath: string): string {
    const rel = path.relative(this.storeDir, path.dirname(filePath));
    return rel.split(path.sep).join('/');
  }

  private _anchorTextFromOpenDocs(fileKey: string, line: number): string | undefined {
    const doc = vscode.workspace.textDocuments.find(d => {
      const rel = path.relative(this.workspaceRoot, d.uri.fsPath).split(path.sep).join('/');
      return rel === fileKey;
    });
    return doc && line < doc.lineCount ? doc.lineAt(line).text.trim().slice(0, 60) || undefined : undefined;
  }

  private _findById(noteId: string): Note | undefined {
    for (const notes of this.index.values()) {
      const note = notes.find(n => n.id === noteId);
      if (note) return note;
    }
    return undefined;
  }

  private _removeByFilePath(filePath: string): Note | undefined {
    for (const [key, notes] of this.index.entries()) {
      const idx = notes.findIndex(n => n.filePath === filePath);
      if (idx !== -1) {
        const [removed] = notes.splice(idx, 1);
        this.index.set(key, notes);
        return removed;
      }
    }
    return undefined;
  }

  private _walkMdFiles(dir: string): string[] {
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
        results = results.concat(this._walkMdFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
    return results;
  }

  private _scheduleDebouncedWrite(note: Note): void {
    const existing = this.writeTimers.get(note.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      fs.writeFileSync(note.filePath, note.body, 'utf8');
      this.writeTimers.delete(note.id);
    }, 500);
    this.writeTimers.set(note.id, timer);
  }

  dispose(): void {
    for (const timer of this.writeTimers.values()) clearTimeout(timer);
    this.changeEmitter.dispose();
  }
}
