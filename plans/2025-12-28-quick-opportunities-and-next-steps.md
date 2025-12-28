# ViBE — Quick Opportunities and Next Steps (2025-12-28)

Status
- Repo in “Latest” flow: real planning, grouped writes, strict proceed rules, snapshots, Dev Tools.
- Goal here: reliability hardening, clearer actions, better UX affordances, and small ops hooks.

Plan

1) Reliability — Event Log + Concurrency
- Make event writes atomic (tmp + rename + .bak), serialize writes.
- Harden readEvents: salvage on parse errors; fallback to .bak.
- Add revert lock (serialize /api/revert similar to patch).

2) Action Contract Hardening
- Preserve binary payloads: include `base64` in `toActionRecord` and map `CREATE_FILE_BINARY` correctly when grouping tool-like actions into plan writes.
- Accept `contentBase64` synonym in strict validator.

3) UX Polish — Inputs, Diff, Memory
- Map ASK_INPUT to a Kanban “Needs Input” card; skip in executor queue.
- Treat user’s next message as the answer: log `ANSWER` event and mark card Done.
- Diff modal: remember last-selected file and add a live filter field.
- Memory: record `REVERT_CHECK` warnings; render summary in Memory tab.
- Header: add “Copy Branch” helper next to Git tag.

4) Ops Hooks
- Expose `/api/snapshots/list` and `/api/snapshots/prune?keep=N`.
- Make debug log ring size configurable via `VIBE_DEBUG_LOG_LIMIT`.
- Improve `/api/search` with optional `dir` and `ext` filters.

Notes
- Keep changes small and reversible; favor minimal UI changes.
- Do not add heavy deps; rely on Node fs primitives.

