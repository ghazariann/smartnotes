import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { PositionTracker } from './PositionTracker';
import { toFileKey } from './extension';

export class GutterDecorator {
  private gutterType: vscode.TextEditorDecorationType | undefined;
  private highlightType: vscode.TextEditorDecorationType | undefined;

  constructor(
    private store: NoteStore,
    private tracker: PositionTracker,
    private context: vscode.ExtensionContext
  ) {}

  register(): void {
    this._createDecorationTypes();

    this.context.subscriptions.push(
      this.tracker.onDidChangeLivePositions(fileKey => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (toFileKey(this._workspaceRoot(), editor.document.uri) === fileKey) {
            this._applyDecorations(editor);
          }
        }
      }),
      this.store.onDidChange(fileKey => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (toFileKey(this._workspaceRoot(), editor.document.uri) === fileKey) {
            this._applyDecorations(editor);
          }
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) this._applyDecorations(editor);
      }),
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        for (const e of editors) this._applyDecorations(e);
      }),
    );

    for (const editor of vscode.window.visibleTextEditors) {
      this._applyDecorations(editor);
    }
  }

  private _createDecorationTypes(): void {
    const iconPath = vscode.Uri.file(
      path.join(this.context.extensionPath, 'media', 'icon-gutter.svg')
    );

    this.gutterType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: iconPath,
      gutterIconSize: 'auto',
    });

    this.highlightType = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: 'rgba(255, 180, 0, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      isWholeLine: true,
    });

    this.context.subscriptions.push(this.gutterType, this.highlightType);
  }

  private _applyDecorations(editor: vscode.TextEditor): void {
    if (!this.gutterType || !this.highlightType) return;
    const workspaceRoot = this._workspaceRoot();
    if (!workspaceRoot) return;

    const fileKey = toFileKey(workspaceRoot, editor.document.uri);
    const liveLines = this.tracker.getLiveLines(fileKey);

    const gutterRanges: vscode.Range[] = [];
    const highlightRanges: vscode.Range[] = [];

    for (const [line] of liveLines) {
      gutterRanges.push(new vscode.Range(line, 0, line, 0));
      highlightRanges.push(new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER));
    }

    const showRuler = vscode.workspace.getConfiguration('smartnotes').get<boolean>('showOverviewRuler', false);
    editor.setDecorations(this.gutterType, gutterRanges);
    editor.setDecorations(this.highlightType, showRuler ? highlightRanges : []);
  }

  private _workspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  }
}
