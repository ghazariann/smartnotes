import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { toFileKey } from './extension';

export class PositionTracker {
  constructor(private store: NoteStore) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => this._handleChange(e))
    );
  }

  private _handleChange(event: vscode.TextDocumentChangeEvent): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    const fileKey = toFileKey(workspaceRoot, event.document.uri);
    const notes = this.store.getNotesForFile(fileKey);
    if (notes.length === 0 || event.contentChanges.length === 0) return;

    // sort changes descending by start line so lower-line deltas don't corrupt upper ones
    const changes = [...event.contentChanges].sort(
      (a, b) => b.range.start.line - a.range.start.line
    );

    for (const change of changes) {
      const startLine = change.range.start.line;
      const removedLines = change.range.end.line - change.range.start.line;
      const addedLines = change.text.split('\n').length - 1;
      const lineDelta = addedLines - removedLines;
      if (lineDelta === 0) continue;

      for (const note of notes) {
        if (note.from > startLine) {
          const newFrom = Math.max(0, note.from + lineDelta);
          const newTo = Math.max(newFrom, note.to + lineDelta);
          this.store.updateNotePosition(note.id, newFrom, newTo);
        } else if (note.to > startLine && lineDelta < 0) {
          // edit overlaps the end of the note range — clamp to
          const newTo = Math.max(note.from, note.to + lineDelta);
          this.store.updateNotePosition(note.id, note.from, newTo);
        }
      }
    }
  }
}
