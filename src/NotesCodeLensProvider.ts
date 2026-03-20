import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { toFileKey } from './extension';

export class NotesCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private store: NoteStore, private workspaceRoot: string) {
    store.onDidChange(() => this._onDidChangeCodeLenses.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const fileKey = toFileKey(this.workspaceRoot, document.uri);
    return this.store.getNotesForFile(fileKey).map(note =>
      new vscode.CodeLens(new vscode.Range(note.from, 0, note.from, 0), {
        title: '$(pencil) note',
        command: 'smartnotes.editNote',
        arguments: [note.id],
      })
    );
  }
}
