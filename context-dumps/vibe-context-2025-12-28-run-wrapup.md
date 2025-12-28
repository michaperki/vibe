# ViBE Context Dump — Run Wrap‑Up + Quiet Execution (2025‑12‑28)

Summary
- Goal: Make chat a narrative (intent + final wrap‑up) and move execution into quiet, factual summaries.
- Status: Shipped one wrap‑up per run, Plan Summary default view, execution bubbles optional and collapsed by default.

Key Changes (since last dump)
- Agent wrap‑up (facts‑driven)
  - After all tasks finish, agent posts 1–2 line wrap‑up based on structured run facts.
  - Facts include: goal, task title, deduped file changes (deleted>added>modified), primaryFiles, tests ok/fail, snapshotId.
  - Endpoint: `POST /api/wrapup { summary }` → wraps via OpenAI (fallback deterministic).
- Execution is quiet by default
  - Dev Tools toggle: “Show execution in chat” (default OFF). Failures still show execution.
  - Execution bubbles are single‑line with inline “(details)” expander and safe DOM rendering.
- Plan Summary default
  - Evidence Plan tab shows a human‑readable summary; “View raw JSON” toggles raw.
- Diff‑first write support
  - `POST /api/patch/diff` unified diff apply with keep‑regions, snapshot + (optional) git commit; fuzzy context matcher.
  - System prompt prefers `EDIT_DIFF`; client applies task.diff via diff endpoint.
- Security & UX hardening
  - No chat innerHTML; all system/Execution content uses createElement/textContent only.
  - Events (.vibe/events.json) atomic writes + salvage; revert lock; debug ring size via env.

Behavior Rules (chat)
- Agent speaks only when:
  - ASK_INPUT (clarification),
  - the model asks a question, or
  - there’s no immediate execution.
- On success: agent posts one final wrap‑up after the run completes.
- Execution: collapsed, optional in chat (always on failure), with link‑like “(details)”.

Dev Tools Toggles
- Keep Regions Strict (default ON) — governs diff overlap enforcement.
- Show execution in chat (default OFF) — show Execution bubbles on success.
- Tail logs.

Small Polishes
- Single‑file write tasks titled “Write <path>”.
- “No test script” → “Tests: n/a”.
- Done column softened; Execution summary filters out `.gitkeep` noise.

Endpoints
- `POST /api/wrapup` — returns 1–2 line wrap‑up; uses OpenAI if available.
- `POST /api/patch/diff` — apply unified diff; keep‑regions + fuzzy.
- Existing: `/api/agent/chat`, `/api/agent/plan`, `/api/patch`, `/api/revert`, `/api/revert/check`, `/api/run`.

How To Verify
1) Create a simple app (e.g., Hello World). Observe:
   - Execution bubbles are collapsed; Plan Summary visible.
   - One agent wrap‑up after all tasks complete; filenames mentioned.
2) Toggle “Show execution in chat”: see summaries appear on success; off hides them (failures still show).
3) Open Diff Preview; verify per‑file diffs and snapshot revert.

Notes / Next Ideas
- Replace “(details)” with a chevron icon + tooltip.
- @filename mention chips with existence validation + click‑to‑preview.
- Status pills (✓/…/⚠) in Plan Summary for tighter scan.
