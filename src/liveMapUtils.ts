export interface LineChange {
  startLine: number;
  endLine: number;
  text: string;
}

/**
 * Applies a set of text document changes to a live line→noteId map.
 * Returns true if any entry moved or was removed.
 * No VS Code dependency — fully testable in plain Node.
 */
export function applyChangesToMap(
  map: Map<number, string>,
  changes: LineChange[]
): boolean {
  const sorted = [...changes].sort((a, b) => b.startLine - a.startLine);
  let changed = false;

  for (const { startLine, endLine, text } of sorted) {
    const removedLines = endLine - startLine;
    const addedLines = text.split('\n').length - 1;
    const lineDelta = addedLines - removedLines;
    if (lineDelta === 0) continue;

    const toDelete: number[] = [];
    const toAdd: [number, string][] = [];

    if (lineDelta < 0) {
      // deletion: [startLine, endLine) removed; endLine and beyond shift up
      for (const [line, noteId] of map) {
        if (line >= startLine && line < endLine) {
          toDelete.push(line);
        } else if (line >= endLine) {
          toDelete.push(line);
          toAdd.push([line + lineDelta, noteId]);
        }
      }
    } else {
      // insertion: notes strictly after startLine shift down; note AT startLine stays
      for (const [line, noteId] of map) {
        if (line > startLine) {
          toDelete.push(line);
          toAdd.push([line + lineDelta, noteId]);
        }
      }
    }

    for (const line of toDelete) map.delete(line);
    for (const [line, noteId] of toAdd) map.set(line, noteId);
    if (toDelete.length > 0 || toAdd.length > 0) changed = true;
  }

  return changed;
}
