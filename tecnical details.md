# SmartNotes — Technical Details

## Position Tracking: How Notes Stay Anchored

LineNotePlus solves this by embedding a UUID comment directly into the source file — the marker moves with the code. SmartNotes cannot do that (no source modifications), so it needs a different approach.

The solution is a three-stage system, each stage building on the last.

---

### Stage 1: Content Fingerprint (Ship with v1)

When a note is created, store a snapshot of the surrounding lines as a fingerprint alongside the note metadata. On file open, scan the file for the best fuzzy match against that fingerprint.

What is stored per note:
- The target line text
- 2–3 lines of context above and below
- Original file path and line number (as a last-resort fallback)

On load, the `PositionTracker` scans the file and picks the line with the highest similarity score. If the score is below a threshold, the note is flagged as "unanchored" and shown in a warning state in the gutter.

This survives: in-session edits, git pulls, file moves that keep the code intact.
This fails on: the exact anchored lines being rewritten.

---

### Stage 2: Semantic Equivalence (v1.x)

A common false-negative for Stage 1 is when code changes in a way that is semantically identical — a comment added to the anchored line, whitespace reformatted, variable renamed by a linter. The fingerprint changes but the meaning did not.

Stage 2 adds a normalisation step before the fuzzy match:
- Strip comments from compared lines
- Normalise whitespace
- Optionally strip string literals and numeric literals

If the normalised fingerprint matches, the note re-anchors confidently even though the raw text differs. No AI needed — pure text normalisation.

---

### Stage 3: AI-Assisted Re-anchoring (v2)

For difficult cases where the code changed substantially but the developer still wants the note preserved — a function was refactored, logic was split into two functions, an algorithm was rewritten — Stage 1 and 2 will fail.

Stage 3 uses the MCP server to invoke an AI analysis pass:
- The original fingerprint and the new version of the file are sent as context
- The AI identifies the most semantically similar location in the new code
- If confidence is high enough, the note re-anchors automatically
- If not, the user is prompted to confirm or dismiss the suggested anchor

This runs on-demand, not on every file open. The user triggers it when they see an unanchored note warning.

---

### Summary

| Stage | Mechanism | Handles |
|---|---|---|
| 1 | Content fingerprint + fuzzy match | Line shifts, git pulls, minor edits |
| 2 | Normalised diff (strip comments, whitespace) | Reformats, inline comments, linter renames |
| 3 | AI semantic match via MCP | Major refactors where meaning is preserved |
