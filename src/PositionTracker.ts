import * as path from 'path';
import * as vscode from 'vscode';
import { Note } from './types';
import { NoteStore } from './NoteStore';
import { toFileKey } from './extension';
import { applyChangesToMap } from './liveMapUtils';

export class PositionTracker {
  // liveMap: fileKey → (line → noteId)
  private liveMap: Map<string, Map<number, string>> = new Map();
  private changeEmitter = new vscode.EventEmitter<string>();
  readonly onDidChangeLivePositions: vscode.Event<string> = this.changeEmitter.event;

  constructor(private store: NoteStore) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => this._handleChange(e)),
      this.changeEmitter,
    );
  }

  initializeFile(fileKey: string): void {
    const map = new Map<number, string>();
    for (const note of this.store.getNotesForFile(fileKey)) {
      if (path.basename(note.filePath).startsWith('[err]')) continue;
      map.set(note.from, note.id);
    }
    this.liveMap.set(fileKey, map);
    this.changeEmitter.fire(fileKey);
  }

  getNoteAtLine(fileKey: string, line: number): Note | undefined {
    const noteId = this.liveMap.get(fileKey)?.get(line);
    if (!noteId) return undefined;
    return this.store.findById(noteId);
  }

  getLiveLines(fileKey: string): Map<number, string> {
    return this.liveMap.get(fileKey) ?? new Map();
  }

  addNote(fileKey: string, line: number, noteId: string): void {
    let map = this.liveMap.get(fileKey);
    if (!map) { map = new Map(); this.liveMap.set(fileKey, map); }
    map.set(line, noteId);
    this.changeEmitter.fire(fileKey);
  }

  removeNote(fileKey: string, noteId: string): void {
    const map = this.liveMap.get(fileKey);
    if (!map) return;
    for (const [line, id] of map) {
      if (id === noteId) { map.delete(line); break; }
    }
    this.changeEmitter.fire(fileKey);
  }

  flushLivePositions(fileKey: string): void {
    const map = this.liveMap.get(fileKey);
    if (!map) return;
    for (const [line, noteId] of map) {
      this.store.persistPosition(noteId, line);
    }
  }

  private _handleChange(event: vscode.TextDocumentChangeEvent): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;
    const fileKey = toFileKey(workspaceRoot, event.document.uri);
    const map = this.liveMap.get(fileKey);
    if (!map || map.size === 0 || event.contentChanges.length === 0) return;

    const lineChanges = event.contentChanges.map(c => ({
      startLine: c.range.start.line,
      endLine: c.range.end.line,
      text: c.text,
    }));

    if (applyChangesToMap(map, lineChanges)) {
      this.changeEmitter.fire(fileKey);
    }
  }
}
