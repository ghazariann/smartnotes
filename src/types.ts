export interface Note {
  id: string;
  file: string;       // workspace-relative POSIX path, e.g. "src/extension.ts"
  from: number;       // 0-based line number, inclusive
  to: number;         // 0-based line number, inclusive; equals `from` for single-line notes
  body: string;       // raw Markdown (no frontmatter)
  filePath: string;   // absolute path to the .md file in .git/.smartnotes/
}
