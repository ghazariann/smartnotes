import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Note } from './types';
import { walkMdFiles, parseFilename, noteFilePath, fileKeyFromNotePath, normalizeAnchor, anchorMatches, parseFrontmatter, serializeFrontmatter } from './noteStoreUtils';

export class NoteStore {
  readonly storeDir: string;
  private index: Map<string, Note[]> = new Map();
  private writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private changeEmitter = new vscode.EventEmitter<string>();
  readonly onDidChange: vscode.Event<string> = this.changeEmitter.event;
  constructor(private workspaceRoot: string) {
    const configuredPath = vscode.workspace.getConfiguration('smartnotes').get<string>('storagePath', '');
    if (configuredPath) {
      this.storeDir = path.isAbsolute(configuredPath)
        ? configuredPath
        : path.join(workspaceRoot, configuredPath);
    } else {
      this.storeDir = path.join(workspaceRoot, '.vscode', 'smartnotes');
    }
    fs.mkdirSync(this.storeDir, { recursive: true });
  }

  async loadAll(): Promise<void> {
    this.index.clear();
    for (const filePath of walkMdFiles(this.storeDir)) {
      try {
        const fileKey = fileKeyFromNotePath(this.storeDir, filePath);
        const raw = fs.readFileSync(filePath, 'utf8');
        const { frontmatter, body } = parseFrontmatter(raw);
        const pos = parseFilename(path.basename(filePath));
        let from: number, to: number;
        if (frontmatter.line !== undefined) {
          from = frontmatter.line - 1;
          to = from;
        } else if (pos) {
          from = pos.from;
          to = pos.to;
        } else {
          continue;
        }
        const anchorText = frontmatter.anchor ?? pos?.anchorText ?? this._anchorTextFromOpenDocs(fileKey, from);
        const filenameErrored = path.basename(filePath).startsWith('[err]');
        const error = frontmatter.error || filenameErrored || undefined;
        const pinned = frontmatter.pinned;
        const note: Note = { id: filePath, file: fileKey, from, to, body, filePath, anchorText, error, pinned };
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
    const filePath = noteFilePath(this.storeDir, fileKey, from, to, anchorText);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const note: Note = { id: filePath, file: fileKey, from, to, body, filePath, anchorText };
    const bucket = this.index.get(fileKey) ?? [];
    bucket.push(note);
    this.index.set(fileKey, bucket);
    fs.writeFileSync(filePath, serializeFrontmatter(anchorText, from) + body, 'utf8');
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

  persistPosition(noteId: string, line: number): void {
    const note = this._findById(noteId);
    if (!note) return;
    note.from = line;
    note.to = line;
    const timer = this.writeTimers.get(note.id);
    if (timer) { clearTimeout(timer); this.writeTimers.delete(note.id); }
    fs.writeFileSync(note.filePath, serializeFrontmatter(note.anchorText, line, note.error, note.pinned) + note.body, 'utf8');
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
      const fileKey = fileKeyFromNotePath(this.storeDir, filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(raw);
      const pos = parseFilename(path.basename(filePath));
      let from: number, to: number;
      if (frontmatter.line !== undefined) {
        from = frontmatter.line - 1;
        to = from;
      } else if (pos) {
        from = pos.from;
        to = pos.to;
      } else {
        return;
      }
      this._removeByFilePath(filePath);
      const anchorText = frontmatter.anchor ?? pos?.anchorText ?? this._anchorTextFromOpenDocs(fileKey, from);
      const filenameErrored = path.basename(filePath).startsWith('[err]');
      const error = frontmatter.error || filenameErrored || undefined;
      const pinned = frontmatter.pinned;
      const note: Note = { id: filePath, file: fileKey, from, to, body, filePath, anchorText, error, pinned };
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

  private _anchorTextFromOpenDocs(fileKey: string, line: number): string | undefined {
    const doc = vscode.workspace.textDocuments.find(d => {
      const rel = path.relative(this.workspaceRoot, d.uri.fsPath).split(path.sep).join('/');
      return rel === fileKey;
    });
    return doc && line < doc.lineCount ? doc.lineAt(line).text.trim() || undefined : undefined;
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
      fs.writeFileSync(note.filePath, serializeFrontmatter(note.anchorText, note.from, note.error, note.pinned) + note.body, 'utf8');
      this.writeTimers.delete(note.id);
    }, 500);
    this.writeTimers.set(note.id, timer);
  }

  /**
   * Stage 2: called every time a source file is opened.
   * For each note with an anchorText fingerprint, verifies the stored line still matches
   * the actual file content. Re-anchors if the line moved; flags with [err] prefix and
   * logs to the output channel if the content can no longer be found anywhere in the file.
   */
  verifyAndReanchorFile(
    fileKey: string,
    document: vscode.TextDocument,
    outputChannel: vscode.OutputChannel
  ): void {
    const notes = this.getNotesForFile(fileKey);
    if (notes.length === 0) return;

    const lines = document.getText().split('\n');

    for (const note of notes) {
      if (!note.anchorText) continue;

      const currentLine = lines[note.from];

      // Current position still matches — clear error flag if present.
      if (currentLine !== undefined && anchorMatches(note.anchorText, currentLine)) {
        if (note.error) {
          note.error = undefined;
          fs.writeFileSync(note.filePath, serializeFrontmatter(note.anchorText, note.from, undefined, note.pinned) + note.body, 'utf8');
        }
        continue;
      }

      // Search for best (closest) match across all lines.
      let bestLine = -1;
      let bestDist = Infinity;
      for (let i = 0; i < lines.length; i++) {
        if (anchorMatches(note.anchorText, lines[i])) {
          const dist = Math.abs(i - note.from);
          if (dist < bestDist) { bestDist = dist; bestLine = i; }
        }
      }

      if (bestLine !== -1) {
        const oldFrom = note.from;
        const rangeDelta = note.to - note.from;
        if (note.error) { note.error = undefined; }
        this.updateNotePosition(note.id, bestLine, bestLine + rangeDelta);
        outputChannel.appendLine(
          `[SmartNotes] Re-anchored note in ${fileKey}: line ${oldFrom + 1} → ${bestLine + 1}  ("${note.anchorText}")`
        );
        outputChannel.show(true);
      } else {
        // Not found anywhere — flag as error in frontmatter.
        if (!note.error) {
          note.error = true;
          fs.writeFileSync(note.filePath, serializeFrontmatter(note.anchorText, note.from, true, note.pinned) + note.body, 'utf8');
        }
        outputChannel.appendLine(
          `[SmartNotes] Cannot re-anchor: "${note.anchorText}" not found in ${fileKey} — ${path.basename(note.filePath)}`
        );
        outputChannel.show(true);
      }
    }
  }

  renameNoteFile(noteId: string, newFilePath: string): void {
    const note = this._findById(noteId);
    if (!note || newFilePath === note.filePath) return;
    try {
      fs.renameSync(note.filePath, newFilePath);
    } catch {
      return;
    }
    const timer = this.writeTimers.get(note.id);
    if (timer) {
      this.writeTimers.delete(note.id);
      this.writeTimers.set(newFilePath, timer);
    }
    note.id = newFilePath;
    note.filePath = newFilePath;
    note.pinned = true;
    fs.writeFileSync(note.filePath, serializeFrontmatter(note.anchorText, note.from, note.error, true) + note.body, 'utf8');
    this.changeEmitter.fire(note.file);
  }

  unpinNoteFile(noteId: string): void {
    const note = this._findById(noteId);
    if (!note) return;
    const autoPath = noteFilePath(this.storeDir, note.file, note.from, note.to, note.anchorText);
    try {
      fs.renameSync(note.filePath, autoPath);
    } catch {
      return;
    }
    const timer = this.writeTimers.get(note.id);
    if (timer) { this.writeTimers.delete(note.id); this.writeTimers.set(autoPath, timer); }
    note.id = autoPath;
    note.filePath = autoPath;
    note.pinned = undefined;
    fs.writeFileSync(note.filePath, serializeFrontmatter(note.anchorText, note.from, note.error, undefined) + note.body, 'utf8');
    this.changeEmitter.fire(note.file);
  }

  dispose(): void {
    for (const timer of this.writeTimers.values()) clearTimeout(timer);
    this.changeEmitter.dispose();
  }

}
