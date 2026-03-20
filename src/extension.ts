import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { HoverProvider } from './HoverProvider';
import { GutterDecorator } from './GutterDecorator';
import { PositionTracker } from './PositionTracker';
import { NotesTreeProvider, NoteItem } from './NotesTreeProvider';

let noteStore: NoteStore | undefined;
let gutterDecorator: GutterDecorator | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showInformationMessage('SmartNotes requires an open workspace folder.');
    return;
  }

  noteStore = new NoteStore(workspaceRoot);
  await noteStore.loadAll();

  const positionTracker = new PositionTracker(noteStore);
  positionTracker.register(context);

  const hoverProvider = new HoverProvider(noteStore, workspaceRoot);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider)
  );

  gutterDecorator = new GutterDecorator(noteStore, context);
  gutterDecorator.register();

  const treeProvider = new NotesTreeProvider(noteStore);
  const treeView = vscode.window.createTreeView('smartnotes.notesView', { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView);

  const updateLinesWithNotesContext = (editor: vscode.TextEditor | undefined) => {
    const lines = editor
      ? noteStore!.getNotesForFile(toFileKey(workspaceRoot, editor.document.uri))
          .flatMap(n => Array.from({ length: n.to - n.from + 1 }, (_, i) => n.from + i + 1))
      : [];
    vscode.commands.executeCommand('setContext', 'smartnotes.linesWithNotes', lines);
  };
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateLinesWithNotesContext));
  noteStore.onDidChange(() => updateLinesWithNotesContext(vscode.window.activeTextEditor));
  updateLinesWithNotesContext(vscode.window.activeTextEditor);

  // ─── commands ────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.addNote', async (ctx?: { lineNumber: number }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      let from: number, to: number;
      if (ctx?.lineNumber !== undefined) {
        from = to = ctx.lineNumber - 1;
      } else {
        from = editor.selection.start.line;
        to = editor.selection.end.line;
        if (to > from && editor.selection.end.character === 0) to--;
      }

      const anchorText = editor.document.lineAt(from).text.trim().slice(0, 60) || undefined;
      const note = await noteStore!.addNote(fileKey, from, to, '', anchorText);
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(note.filePath),
        { viewColumn: vscode.ViewColumn.Beside }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.openNote', async (ctx?: { lineNumber: number }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      const line = ctx?.lineNumber !== undefined ? ctx.lineNumber - 1 : editor.selection.active.line;
      const notes = noteStore!.getNotesAtLine(fileKey, line);

      if (notes.length === 0) {
        vscode.window.showInformationMessage('No notes at the current line.');
        return;
      }
      if (notes.length === 1) {
        await vscode.commands.executeCommand(
          'vscode.open',
          vscode.Uri.file(notes[0].filePath),
          { viewColumn: vscode.ViewColumn.Beside }
        );
        return;
      }
      const items = notes.map(n => ({
        label: `Line ${n.from + 1}–${n.to + 1}`,
        description: n.body.split('\n')[0].slice(0, 80) || '(empty)',
        noteId: n.id,
        filePath: n.filePath,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select note to open',
      });
      if (picked) {
        await vscode.commands.executeCommand(
          'vscode.open',
          vscode.Uri.file(picked.filePath),
          { viewColumn: vscode.ViewColumn.Beside }
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.editNote', async (noteId: string) => {
      const note = noteStore!.findById(noteId);
      if (!note) return;
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(note.filePath),
        { viewColumn: vscode.ViewColumn.Beside }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.deleteNote', async (noteId: string) => {
      await noteStore!.deleteNote(noteId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.notes.reveal', async (item: NoteItem) => {
      const sourceUri = vscode.Uri.file(path.join(workspaceRoot, item.note.file));
      const doc = await vscode.workspace.openTextDocument(sourceUri);
      const range = new vscode.Range(item.note.from, 0, item.note.to, 0);
      await vscode.window.showTextDocument(doc, { selection: range, preserveFocus: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.notes.open', async (item?: NoteItem) => {
      const target = item ?? (treeView.selection[0] instanceof NoteItem ? treeView.selection[0] : undefined);
      if (!target) return;
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(target.note.filePath),
        { viewColumn: vscode.ViewColumn.Beside }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.notes.delete', async (item?: NoteItem) => {
      const target = item ?? (treeView.selection[0] instanceof NoteItem ? treeView.selection[0] : undefined);
      if (!target) return;
      await noteStore!.deleteNote(target.note.id);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.notes.refresh', () => {
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.removeNoteAtLine', async (ctx?: { lineNumber: number }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const line = ctx ? ctx.lineNumber - 1 : editor.selection.active.line;
      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      const notes = noteStore!.getNotesAtLine(fileKey, line);
      for (const note of notes) {
        await noteStore!.deleteNote(note.id);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.gutterAction', async (ctx?: { lineNumber: number }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const line = ctx?.lineNumber !== undefined ? ctx.lineNumber - 1 : editor.selection.active.line;
      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      const notes = noteStore!.getNotesAtLine(fileKey, line);

      if (notes.length === 0) {
        const anchorText = editor.document.lineAt(line).text.trim().slice(0, 60) || undefined;
        const note = await noteStore!.addNote(fileKey, line, line, '', anchorText);
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(note.filePath), { viewColumn: vscode.ViewColumn.Beside });
        return;
      }

      const note = notes[0];
      const picked = await vscode.window.showQuickPick(
        [{ label: '$(go-to-file) Open note', action: 'open' }, { label: '$(trash) Remove note', action: 'remove' }],
        { placeHolder: `Line ${line + 1}: ${note.anchorText ?? ''}` }
      );
      if (!picked) return;
      if (picked.action === 'open') {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(note.filePath), { viewColumn: vscode.ViewColumn.Beside });
      } else {
        for (const n of notes) await noteStore!.deleteNote(n.id);
      }
    })
  );

  // ─── file system watcher ─────────────────────────────────────────────────

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(noteStore.storeDir),
      '**/*.md'
    )
  );
  watcher.onDidCreate(uri => noteStore!.reloadNoteFile(uri.fsPath));
  watcher.onDidChange(uri => noteStore!.reloadNoteFile(uri.fsPath));
  watcher.onDidDelete(uri => noteStore!.removeNoteFile(uri.fsPath));
  context.subscriptions.push(watcher);

  // ─── auto-delete empty notes on close ────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(async doc => {
      if (!doc.uri.fsPath.startsWith(noteStore!.storeDir)) return;
      const note = noteStore!.listAllNotes().find(n => n.filePath === doc.uri.fsPath);
      if (note && note.body.trim() === '') {
        await noteStore!.deleteNote(note.id);
      }
    })
  );

  // ─── orphan cleanup ───────────────────────────────────────────────────────

  const config = vscode.workspace.getConfiguration('smartnotes');
  const orphanEnabled = config.get<boolean>('orphanCleanupEnabled', true);
  if (orphanEnabled) {
    const intervalMs = config.get<number>('orphanCleanupIntervalMinutes', 30) * 60_000;
    const timer = setInterval(async () => {
      const fs = await import('fs');
      for (const note of noteStore!.listAllNotes()) {
        const absPath = path.join(workspaceRoot, note.file);
        if (!fs.existsSync(absPath)) {
          await noteStore!.deleteNote(note.id);
        }
      }
    }, intervalMs);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
  }

  context.subscriptions.push({ dispose: () => noteStore!.dispose() });
}

export function deactivate(): void {}

export function toFileKey(workspaceRoot: string, uri: vscode.Uri): string {
  const rel = path.relative(workspaceRoot, uri.fsPath);
  return rel.split(path.sep).join('/');
}
