import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { Note } from './types';

interface Frontmatter {
  id: string;
  file: string;
  from: number;
  to: number;
}

export class NoteStore {
  readonly storeDir: string;
  private index: Map<string, Note[]> = new Map();
  private writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private changeEmitter = new vscode.EventEmitter<string>();
  readonly onDidChange: vscode.Event<string> = this.changeEmitter.event;

  constructor(private workspaceRoot: string) {
    this.storeDir = path.join(workspaceRoot, '.git', '.smartnotes');
    fs.mkdirSync(this.storeDir, { recursive: true });
  }

  async loadAll(): Promise<void> {
    this.index.clear();
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.storeDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = path.join(this.storeDir, entry.name);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const note = this._parseFrontmatter(raw, filePath);
        if (!note) continue;
        const bucket = this.index.get(note.file) ?? [];
        bucket.push(note);
        this.index.set(note.file, bucket);
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

  async addNote(fileKey: string, from: number, to: number, body: string): Promise<Note> {
    const id = crypto.randomUUID();
    const filePath = path.join(this.storeDir, id + '.md');
    const note: Note = { id, file: fileKey, from, to, body, filePath };
    const bucket = this.index.get(fileKey) ?? [];
    bucket.push(note);
    this.index.set(fileKey, bucket);
    await this._writeNoteFile(note);
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
    note.from = from;
    note.to = to;
    this._scheduleDebouncedWrite(note);
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

  /** Reload a single note file into the index (used by the file watcher). */
  reloadNoteFile(filePath: string): void {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const note = this._parseFrontmatter(raw, filePath);
      if (!note) return;

      // remove any existing entry for this filePath
      this._removeByFilePath(filePath);

      const bucket = this.index.get(note.file) ?? [];
      bucket.push(note);
      this.index.set(note.file, bucket);
      this.changeEmitter.fire(note.file);
    } catch {
      // ignore
    }
  }

  /** Remove a note from the index when its file is deleted externally. */
  removeNoteFile(filePath: string): void {
    const removed = this._removeByFilePath(filePath);
    if (removed) this.changeEmitter.fire(removed.file);
  }

  findById(noteId: string): Note | undefined {
    return this._findById(noteId);
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

  private _scheduleDebouncedWrite(note: Note): void {
    const existing = this.writeTimers.get(note.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._writeNoteFile(note);
      this.writeTimers.delete(note.id);
    }, 500);
    this.writeTimers.set(note.id, timer);
  }

  private async _writeNoteFile(note: Note): Promise<void> {
    const frontmatter: Frontmatter = {
      id: note.id,
      file: note.file,
      from: note.from,
      to: note.to,
    };
    const content = `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${note.body}`;
    fs.writeFileSync(note.filePath, content, 'utf8');
  }

  _parseFrontmatter(raw: string, filePath: string): Note | null {
    if (!raw.startsWith('---')) return null;
    const end = raw.indexOf('\n---', 3);
    if (end === -1) return null;
    const yamlBlock = raw.slice(3, end).trim();
    const body = raw.slice(end + 4).replace(/^\n/, '');
    try {
      const fm = yaml.load(yamlBlock) as Frontmatter;
      if (!fm || typeof fm.id !== 'string' || typeof fm.file !== 'string') return null;
      return {
        id: fm.id,
        file: fm.file,
        from: Number(fm.from) || 0,
        to: Number(fm.to) || 0,
        body,
        filePath,
      };
    } catch {
      return null;
    }
  }

  dispose(): void {
    for (const timer of this.writeTimers.values()) clearTimeout(timer);
    this.changeEmitter.dispose();
  }
}
