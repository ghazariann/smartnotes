import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { Note } from './types';

export class NoteItem extends vscode.TreeItem {
  constructor(public readonly note: Note) {
    const isError = !!note.error;
    const rawBasename = path.basename(note.filePath, '.md');
    const basename = rawBasename.replace(/^\[err\]\s*/, '');
    const isAutoNamed = /^L\d+/.test(basename);
    const lineLabel = note.from === note.to ? `L${note.from + 1}` : `L${note.from + 1}-${note.to + 1}`;
    const isEmpty = !note.body.trim();
    const bodyPreview = note.body.split('\n').find(l => l.trim()) ?? '';

    const isPinned = !!note.pinned;
    const errPrefix = isError && !isPinned ? '[err] ' : '';

    let label: string;
    let description: string;
    if (isAutoNamed) {
      const anchorSnippet = note.anchorText ? '  ' + note.anchorText.slice(0, 35) : '';
      label = errPrefix + lineLabel + anchorSnippet;
      description = isEmpty ? '' : bodyPreview.trim().slice(0, 60);
    } else {
      label = errPrefix + basename;
      description = '';
    }

    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = [
      `${lineLabel}${note.anchorText ? '  ' + note.anchorText : ''}`,
      isError ? '(anchor lost)' : '',
      isEmpty ? '(empty)' : note.body.trim().slice(0, 200),
    ].filter(Boolean).join('\n');
    this.contextValue = 'smartnotesNote';
    this.iconPath = new vscode.ThemeIcon(isError ? 'warning' : isEmpty ? 'bookmark' : 'note');
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
