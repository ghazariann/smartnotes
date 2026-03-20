import * as path from 'path';
import * as vscode from 'vscode';
import { NoteStore } from './NoteStore';
import { Note } from './types';
import { toFileKey } from './extension';

export class HoverProvider implements vscode.HoverProvider {
  constructor(private store: NoteStore, private workspaceRoot: string) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const fileKey = toFileKey(this.workspaceRoot, document.uri);
    const notes = this.store.getNotesAtLine(fileKey, position.line);
    if (notes.length === 0) return undefined;

    const parts: vscode.MarkdownString[] = [];
    for (const note of notes) {
      parts.push(this._buildMarkdown(note, document));
    }

    // use the widest range that covers all matching notes
    const from = Math.min(...notes.map(n => n.from));
    const to = Math.max(...notes.map(n => n.to));
    const range = new vscode.Range(from, 0, to, Number.MAX_SAFE_INTEGER);

    return new vscode.Hover(parts, range);
  }

  private _buildMarkdown(note: Note, document: vscode.TextDocument): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = false;

    const body = this._processXrefs(note.body, document);
    if (body.trim()) {
      md.appendMarkdown(body);
      md.appendMarkdown('\n\n---\n\n');
    }

    const editArg = encodeURIComponent(JSON.stringify([note.id]));
    const deleteArg = encodeURIComponent(JSON.stringify([note.id]));
    md.appendMarkdown(
      `[Edit](command:smartnotes.editNote?${editArg})` +
      `\u00a0\u00a0` +
      `[Remove](command:smartnotes.deleteNote?${deleteArg})`
    );

    return md;
  }

  /** Replace #L<n> and <file>#L<n> cross-references with clickable links. */
  private _processXrefs(body: string, document: vscode.TextDocument): string {
    // <file>#L<n> — link to another file
    body = body.replace(
      /\b([\w./\-]+\.(?:ts|js|py|go|rs|java|cs|cpp|c|h|rb|php|swift|kt|md))\s*#L(\d+)\b/g,
      (_, file, lineStr) => {
        const line = parseInt(lineStr, 10) - 1;
        const absPath = path.isAbsolute(file)
          ? file
          : path.join(this.workspaceRoot, file);
        const uri = vscode.Uri.file(absPath);
        const arg = encodeURIComponent(JSON.stringify([uri.toString(), { selection: new vscode.Range(line, 0, line, 0) }]));
        return `[${file}#L${lineStr}](command:vscode.open?${arg})`;
      }
    );

    // bare #L<n> — link to current file
    body = body.replace(/#L(\d+)\b/g, (_, lineStr) => {
      const line = parseInt(lineStr, 10) - 1;
      const arg = encodeURIComponent(
        JSON.stringify([document.uri.toString(), { selection: new vscode.Range(line, 0, line, 0) }])
      );
      return `[#L${lineStr}](command:vscode.open?${arg})`;
    });

    return body;
  }
}
