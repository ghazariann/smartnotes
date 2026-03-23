import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { Note } from './types';

export class NoteItem extends vscode.TreeItem {
  constructor(public readonly note: Note) {
    const label = path.basename(note.filePath, '.md');
    super(label, vscode.TreeItemCollapsibleState.None);
    const isEmpty = !note.body.trim();
    this.description = isEmpty ? '(bookmark)' : note.body.split('\n')[0].trim().slice(0, 60);
    this.tooltip = note.body || '(bookmark)';
    this.contextValue = 'smartnotesNote';
    this.iconPath = new vscode.ThemeIcon(isEmpty ? 'bookmark' : 'note');
    this.command = { command: 'smartnotes.notes.open', title: 'Open Note', arguments: [this] };
  }
}

export class FileItem extends vscode.TreeItem {
  constructor(public readonly fileKey: string, noteCount: number) {
    super(fileKey, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${noteCount} note${noteCount === 1 ? '' : 's'}`;
    this.contextValue = 'smartnotesFile';
    this.iconPath = new vscode.ThemeIcon('file');
  }
}

export class NotesTreeProvider implements vscode.TreeDataProvider<FileItem | NoteItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private store: NoteStore) {
    store.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileItem | NoteItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FileItem | NoteItem): (FileItem | NoteItem)[] {
    if (!element) {
      const files = [...new Set(this.store.listAllNotes().map(n => n.file))].sort();
      return files.map(f => new FileItem(f, this.store.getNotesForFile(f).length));
    }
    if (element instanceof FileItem) {
      return this.store.getNotesForFile(element.fileKey)
        .sort((a, b) => a.from - b.from)
        .map(n => new NoteItem(n));
    }
    return [];
  }
}
