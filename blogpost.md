## The Problem With How I Take Code Notes

I watch and try to understand a lot of open source code. Agents like Claude Code help enormously because I can ask them to explain things, give examples, and save the results. My usual workflow is keeping separate PDF files or Notion pages where I literally screenshot parts of the code and add my explanations.

Then I thought: what if I bring the notes to the code itself?

## Why Existing Extensions Did Not Work

After some research I found several extensions that do that (see comparison section). The most well-known is probably [LineNotes by tkrkt](https://github.com/tkrkt/linenotes). It does most of what I need, but it has one unbearable issue: notes are tied to line numbers, not context. That is a real problem because most open source projects are constantly evolving, and after one pull all my notes can become invalid. I wanted something like [VSCode Bookmarks](https://github.com/alefragnani/vscode-bookmarks), which at least keeps up with your edits as you type.

The fork "Line Note Plus" fixes that issue, but introduces another one: it injects comment links directly into the code. I do not want any code changes. I just want to keep my notes locally as markdown files, with no commits touching the codebase.

## How VSCode Bookmarks Tracks Position, and Why It Still Fails

I assumed Bookmarks solved the problem — its icon visibly follows your code as you type. Looking at the source, the mechanism is simple: it listens to `onDidChangeTextDocument` and shifts the stored line number by the delta every time you insert or delete lines. If you add two lines above a bookmark, the stored number goes from 42 to 44 instantly. That is why it feels live.

But this only works while the file is open in the editor. The moment you close VS Code, switch branches, or do a `git pull`, no change events fire. The bookmark just sits at whatever line number was stored last. If the code shifted, the bookmark is now wrong.

This is not a hidden edge case. Users have been reporting it for years:

- [Issue #675](https://github.com/alefragnani/vscode-bookmarks/issues/675) — user lost all bookmarks after a single `git pull` with one change. Closed as duplicate, not planned.
- [Issue #606](https://github.com/alefragnani/vscode-bookmarks/issues/606) — user proposed the fix themselves: store a snippet of the line text, not just a number. The maintainer closed it as too much reengineering.
- [Issue #652](https://github.com/alefragnani/vscode-bookmarks/issues/652) — still open, 13 comments, same complaint.

The conclusion is that no existing tool solves this cleanly. LineNotes stores a raw line number. LineNotePlus embeds a marker in the source. Bookmarks does delta tracking but loses state on any external change. The fix users keep asking for — anchor to the content, not the line — is exactly what SmartNotes does.

## Building My Own

So I decided to just build my own extension. I also added an MCP server, because apparently every new tool in 2026 needs one [according to Karpathy](https://x.com/karpathy/status/2026360908398862478).
