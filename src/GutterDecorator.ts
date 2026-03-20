import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { toFileKey } from './extension';

export class GutterDecorator {
  private gutterType: vscode.TextEditorDecorationType | undefined;
  private highlightType: vscode.TextEditorDecorationType | undefined;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private store: NoteStore, private context: vscode.ExtensionContext) {}

  register(): void {
    this._createDecorationTypes();

    this.context.subscriptions.push(
      this.store.onDidChange(fileKey => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (toFileKey(this._workspaceRoot(), editor.document.uri) === fileKey) {
            this._scheduleRefresh(editor);
          }
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) this._scheduleRefresh(editor);
      }),
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        for (const e of editors) this._scheduleRefresh(e);
      }),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('smartnotes')) {
          this.gutterType?.dispose();
          this.highlightType?.dispose();
          this._createDecorationTypes();
          for (const editor of vscode.window.visibleTextEditors) {
            this._applyDecorations(editor);
          }
        }
      })
    );

    for (const editor of vscode.window.visibleTextEditors) {
      this._applyDecorations(editor);
    }
  }

  private _createDecorationTypes(): void {
    const config = vscode.workspace.getConfiguration('smartnotes');
    const iconPath = vscode.Uri.file(
      path.join(this.context.extensionPath, 'icons', 'note.svg')
    );

    this.gutterType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: iconPath,
      gutterIconSize: 'auto',
    });

    const highlightEnabled = config.get<boolean>('lineHighlightEnabled', true);
    const highlightColor = config.get<string>('lineHighlightColor', 'rgba(255, 220, 100, 0.15)');
    const rulerEnabled = config.get<boolean>('overviewRulerEnabled', true);
    const rulerColor = config.get<string>('overviewRulerColor', 'rgba(255, 180, 0, 0.8)');

    this.highlightType = vscode.window.createTextEditorDecorationType({
      backgroundColor: highlightEnabled ? highlightColor : undefined,
      overviewRulerColor: rulerEnabled ? rulerColor : undefined,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: true,
    });

    this.context.subscriptions.push(this.gutterType, this.highlightType);
  }

  private _scheduleRefresh(editor: vscode.TextEditor): void {
    const key = editor.document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._applyDecorations(editor);
      this.debounceTimers.delete(key);
    }, 500);
    this.debounceTimers.set(key, timer);
  }

  private _applyDecorations(editor: vscode.TextEditor): void {
    if (!this.gutterType || !this.highlightType) return;
    const config = vscode.workspace.getConfiguration('smartnotes');
    const workspaceRoot = this._workspaceRoot();
    if (!workspaceRoot) return;

    const fileKey = toFileKey(workspaceRoot, editor.document.uri);
    const notes = this.store.getNotesForFile(fileKey);

    const gutterRanges: vscode.Range[] = [];
    const highlightRanges: vscode.Range[] = [];

    for (const note of notes) {
      if (config.get<boolean>('gutterIconEnabled', true)) {
        gutterRanges.push(new vscode.Range(note.from, 0, note.from, 0));
      }
      highlightRanges.push(new vscode.Range(note.from, 0, note.to, Number.MAX_SAFE_INTEGER));
    }

    editor.setDecorations(this.gutterType, gutterRanges);
    editor.setDecorations(this.highlightType, highlightRanges);
  }

  private _workspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  }
}
