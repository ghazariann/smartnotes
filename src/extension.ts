import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { HoverProvider } from './HoverProvider';
import { GutterDecorator } from './GutterDecorator';
import { PositionTracker } from './PositionTracker';

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

  // ─── commands ────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.addNote', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      let from = editor.selection.start.line;
      let to = editor.selection.end.line;
      // if selection ends at column 0 of the next line, don't include that line
      if (to > from && editor.selection.end.character === 0) to--;

      const note = await noteStore!.addNote(fileKey, from, to, '');
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(note.filePath),
        { viewColumn: vscode.ViewColumn.Beside }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.openNote', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      const line = editor.selection.active.line;
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

  // ─── file system watcher ─────────────────────────────────────────────────

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(noteStore.storeDir),
      '*.md'
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
