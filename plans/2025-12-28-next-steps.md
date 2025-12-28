# ViBE Next Steps — 2025-12-28

Status
- Chat-first UX with structured plan → execute → verify loop
- Atomic, snapshot-backed writes with per-file diffs and revert
- Lightweight memory line; visible “Thinking…/Applying patch…/Running tests…” feedback
- Demos isolated; docs and agent guidance in place

High-Priority Roadmap

1) Git-Integrated Runs
- Branch-per-run; one commit per card
- Prefer `git revert` for per-card revert
- Compare runs by diffing branches (UI later)
- Opt-in via env; fallback to snapshots when Git unavailable

2) Action Contract Hardening
- Validate actions with a stricter schema, surface precise errors
- Dedupe/merge tasks by `taskId`; keep deterministic updates
- Keep rejecting `PROCEED_EXECUTION` on empty queues

3) Context Discipline
- Provide targeted file excerpts (head/tail snippets) to the model instead of full files
- Keep a concise memory line; include “reverted files” to reduce repeats

4) Quality & Safety
- Add binary write support (`CREATE_FILE_BINARY { path, base64 }`) and reject binaries in text tools
- Strengthen search/file size guards for very large repos

5) UX Polish
- Diff modal keyboard navigation (↑/↓) across files
- Show elapsed time for background states

6) Prompt/Contract Refinement
- Nudge EMIT_PLAN → PROCEED when proposing concrete writes
- Maintain a bounded READ → UPDATE loop with full-file content

Implementation Notes
- Git integration is optional (env: `VIBE_GIT_INTEGRATION=1`) and used only if `.git/` exists; otherwise the snapshot system remains the source of truth.
- Stricter validation will re-ask the model once with detailed errors before deferring to normalization.
- Excerpts aim to trim tokens while preserving enough structure for edits.

