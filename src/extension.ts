import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { HoverProvider } from './HoverProvider';
import { GutterDecorator } from './GutterDecorator';
import { PositionTracker } from './PositionTracker';
import { NotesTreeProvider, NoteItem } from './NotesTreeProvider';
import { parseFrontmatter } from './noteStoreUtils';

let noteStore: NoteStore | undefined;
let gutterDecorator: GutterDecorator | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showInformationMessage('SmartNotes requires an open workspace folder.');
    return;
  }

  const outputChannel = vscode.window.createOutputChannel('SmartNotes');
  context.subscriptions.push(outputChannel);

  const cfg = () => vscode.workspace.getConfiguration('smartnotes');
  const openColumn = () => cfg().get<boolean>('openBeside', false) ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  const anchorLen = () => cfg().get<number>('anchorTextLength', 60);

  noteStore = new NoteStore(workspaceRoot);
  await noteStore.loadAll();

  // ─── startup image cleanup ────────────────────────────────────────────────
  {
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
    const walkDir = (dir: string): string[] => {
      try {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
          e.isDirectory() ? walkDir(path.join(dir, e.name)) : [path.join(dir, e.name)]
        );
      } catch { return []; }
    };
    const allFiles = walkDir(noteStore.storeDir);
    const mdContent = allFiles
      .filter(f => f.endsWith('.md'))
      .map(f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } })
      .join('\n');
    for (const file of allFiles) {
      if (IMAGE_EXTS.has(path.extname(file).toLowerCase()) && !mdContent.includes(path.basename(file))) {
        try { fs.unlinkSync(file); } catch {}
      }
    }
  }

  // ─── MCP server: copy to stable path and notify ───────────────────────────
  const stableMcpDir = context.globalStorageUri.fsPath;
  const stableMcpPath = path.join(stableMcpDir, 'mcp-server.js');
  try {
    fs.mkdirSync(stableMcpDir, { recursive: true });
    fs.copyFileSync(path.join(context.extensionPath, 'dist', 'mcp-server.js'), stableMcpPath);
  } catch { /* non-fatal */ }

  const currentVersion = context.extension.packageJSON.version as string;
  if (context.globalState.get<string>('smartnotes.mcpNotifiedVersion') !== currentVersion) {
    const mcpCommand = `claude mcp add --scope user smartnotes node "${stableMcpPath.replace(/\\/g, '/')}"`;
    vscode.window.showInformationMessage(
      'SmartNotes: Run this once in your terminal to enable Claude Code chat integration.',
      'Copy Command'
    ).then(choice => {
      if (choice === 'Copy Command') {
        vscode.env.clipboard.writeText(mcpCommand);
        vscode.window.showInformationMessage('SmartNotes: Command copied! Paste it in any terminal.');
      }
    });
    context.globalState.update('smartnotes.mcpNotifiedVersion', currentVersion);
  }

  const positionTracker = new PositionTracker(noteStore);
  positionTracker.register(context);

  const verifyDoc = (doc: vscode.TextDocument) => {
    if (doc.uri.scheme !== 'file') return;
    const fileKey = toFileKey(workspaceRoot, doc.uri);
    if (noteStore!.getNotesForFile(fileKey).length > 0)
      noteStore!.verifyAndReanchorFile(fileKey, doc, outputChannel);
  };

  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(verifyDoc));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(verifyDoc));

  for (const doc of vscode.workspace.textDocuments) verifyDoc(doc);

  const hoverProvider = new HoverProvider(noteStore, workspaceRoot);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider)
  );

  gutterDecorator = new GutterDecorator(noteStore, context);
  gutterDecorator.register();

  const treeProvider = new NotesTreeProvider(noteStore);
  const treeView = vscode.window.createTreeView('smartnotes.notesView', { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        if (!editor.document.uri.fsPath.startsWith(noteStore!.storeDir)) continue;
        if (!editor.document.fileName.endsWith('.md')) continue;
        vscode.commands.executeCommand('editor.fold', { selectionLines: [0] });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.notes.rename', async (item?: NoteItem) => {
      const target = item ?? (treeView.selection[0] instanceof NoteItem ? treeView.selection[0] : undefined);
      if (!target) return;
      const note = target.note;
      const currentBase = path.basename(note.filePath, '.md');
      const newBase = await vscode.window.showInputBox({
        prompt: 'Rename note file',
        value: currentBase,
        placeHolder: 'Enter a filename (without .md)',
      });
      if (newBase === undefined || newBase === currentBase) return;
      const cleanBase = newBase.replace(/[<>:"/\\|?*]/g, '').trim();
      if (!cleanBase) return;
      const newPath = path.join(path.dirname(note.filePath), `${cleanBase}.md`);
      noteStore!.renameNoteFile(note.id, newPath);
    })
  );

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

      const anchorText = editor.document.lineAt(from).text.trim() || undefined;
      const note = await noteStore!.addNote(fileKey, from, to, '', anchorText);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(note.filePath));
      await vscode.window.showTextDocument(doc, { viewColumn: openColumn(), preview: false });
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
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(notes[0].filePath));
        await vscode.window.showTextDocument(doc, { viewColumn: openColumn(), preview: false });
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
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(picked.filePath));
        await vscode.window.showTextDocument(doc, { viewColumn: openColumn(), preview: false });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.editNote', async (noteId: string) => {
      const note = noteStore!.findById(noteId);
      if (!note) return;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(note.filePath));
      await vscode.window.showTextDocument(doc, { viewColumn: openColumn(), preview: false });
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
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target.note.filePath));
      await vscode.window.showTextDocument(doc, { viewColumn: openColumn(), preview: false });
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

  let copiedNoteBody: string | undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.copyNote', async (ctx?: { lineNumber: number }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const line = ctx?.lineNumber !== undefined ? ctx.lineNumber - 1 : editor.selection.active.line;
      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      const notes = noteStore!.getNotesAtLine(fileKey, line);
      if (notes.length === 0) return;
      const { body } = parseFrontmatter(fs.readFileSync(notes[0].filePath, 'utf8'));
      copiedNoteBody = body;
      vscode.commands.executeCommand('setContext', 'smartnotes.hasCopiedNote', true);
      vscode.window.showInformationMessage('SmartNotes: Note copied.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartnotes.pasteNote', async (ctx?: { lineNumber: number }) => {
      if (copiedNoteBody === undefined) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const line = ctx?.lineNumber !== undefined ? ctx.lineNumber - 1 : editor.selection.active.line;
      const fileKey = toFileKey(workspaceRoot, editor.document.uri);
      const anchorText = editor.document.lineAt(line).text.trim() || undefined;
      await noteStore!.addNote(fileKey, line, line, copiedNoteBody, anchorText);
      copiedNoteBody = undefined;
      vscode.commands.executeCommand('setContext', 'smartnotes.hasCopiedNote', false);
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
        const anchorText = editor.document.lineAt(line).text.trim() || undefined;
        const note = await noteStore!.addNote(fileKey, line, line, '', anchorText);
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(note.filePath), { viewColumn: openColumn() });
        return;
      }

      const note = notes[0];
      const picked = await vscode.window.showQuickPick(
        [{ label: '$(go-to-file) Open note', action: 'open' }, { label: '$(trash) Remove note', action: 'remove' }],
        { placeHolder: `Line ${line + 1}: ${note.anchorText ?? ''}` }
      );
      if (!picked) return;
      if (picked.action === 'open') {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(note.filePath));
        await vscode.window.showTextDocument(doc, { viewColumn: openColumn(), preview: false });
      } else {
        for (const n of notes) await noteStore!.deleteNote(n.id);
      }
    })
  );

  // ─── orphan cleanup ───────────────────────────────────────────────────────
  if (cfg().get<boolean>('orphanCleanup', true)) {
    let orphansFound = false;
    for (const note of noteStore.listAllNotes()) {
      if (!fs.existsSync(path.join(workspaceRoot, note.file))) {
        if (!orphansFound) {
          outputChannel.show(true);
          orphansFound = true;
        }
        outputChannel.appendLine(`[SmartNotes] Removed orphan note: ${note.file} (line ${note.from + 1})`);
        await noteStore.deleteNote(note.id);
      }
    }
  }

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

context.subscriptions.push({ dispose: () => noteStore!.dispose() });
}

export function deactivate(): void {}

export function toFileKey(workspaceRoot: string, uri: vscode.Uri): string {
  const rel = path.relative(workspaceRoot, uri.fsPath);
  return rel.split(path.sep).join('/');
}
