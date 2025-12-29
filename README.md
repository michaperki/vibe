ViBE — Chat-First Coding Agent (Latest)

Overview
- Single-page app + minimal Node server that demonstrates:
  - Real LLM planning (optional) via `/api/agent/plan` and action-oriented chat via `/api/agent/chat`.
  - Controlled execution: one card at a time, atomic patch + snapshot + test + revert.
  - Diff-first writes via `/api/patch/diff` with keep‑regions and fuzzy context matching.
  - Lightweight memory: event log under `.vibe/` and a Memory tab in the UI.

Quick Start
- PowerShell (Windows)
  - `npm i -g @vibelabs/vibe`
  - `vibe init .` (creates `.vibe/`, `.env`)
  - `vibe start . --open` (opens http://localhost:7080)
  - Optional: `setx OPENAI_API_KEY "<your_key>"` then restart shell, or add it to `.env`.
- WSL/Linux/macOS
  - `npx @vibelabs/vibe@latest start . --open` (or install globally and use `vibe`)

CLI Workspace Launcher
- Start ViBE against a specific folder (where code changes land):
  - PowerShell: `vibe start C:\path\to\repo --open`
  - Linux/macOS/WSL: `vibe start /path/to/repo --open`
- Initialize a repo for ViBE: `vibe init .`
- Set default permissions: `vibe perms --read on --write on --test on`
- Diagnose environment: `vibe doctor`

Key Files
- `index.html` — App UI (Chat, Kanban, Evidence)
- `styles.css` — Layout/theme
- `app.js` — Orchestration for Latest (planning, execution, revert, memory)
- `server.js` — Minimal server exposing /api endpoints and snapshots
- `vibe.js` — CLI launcher specifying workspace root
- `AGENTS.md` — Guidance for agents and contributors
- `PLAN.md`, `SEED.md` — Product milestones and early spec

Configuration
- `.env` (not committed):
  - `OPENAI_API_KEY` (optional; enables real planning)
  - `OPENAI_MODEL` (optional; default `gpt-4o-mini`)
  - `PORT` (optional; default 7080)
  - `VIBE_WORKSPACE` (optional explicit workspace)
  - `VIBE_REQUIRE_TEST_CONFIRM=1` (optional; require explicit confirmation to run tests)

Using the App
- Type a goal in Chat (e.g., "Add a dark mode").
- The agent plans tasks and executes sequentially (Autopilot toggles pacing).
- Evidence shows diffs/logs/tests per card; double‑click a card or use Preview Diff.
- Revert Card restores its snapshot.
 - Execution is quiet by default; enable “Show execution in chat” in Dev Tools for summaries. A single final wrap‑up appears when all tasks complete.

Security & Safety
- Writes are confined to the workspace root; `.git/` and `node_modules/` are blocked.
- `/api/patch` and `/api/patch/diff` are atomic and snapshot‑backed; a lock serializes concurrent patch requests.
- `/api/run` runs only `npm test`. Set `VIBE_REQUIRE_TEST_CONFIRM=1` to require `{ confirm: true }` in the request body.
- Do not commit secrets. `.env` is ignored by default; rotate any key already checked into history.

Endpoints (selected)
- Read file: `GET /api/file?path=...` with optional `head`, `tail`, or `start`/`end` (bytes); optional `maxBytes` (capped).
- Search: `GET /api/search?q=...&regex=1&case=sensitive&context=2` includes regex/case and ±N lines of context.
- Apply diff: `POST /api/patch/diff { diff, keepRegions?, preview? }` — unified diff across files; returns per‑file diffs and warnings.
- Revert: `POST /api/revert { snapshotId, direction }` and `POST /api/revert/check` for divergence warnings.
- Wrap‑up: `POST /api/wrapup { summary }` returns a concise final message (OpenAI if configured).

Dev Tools
- Keep Regions Strict toggle (default ON) — prevents edits within `VIBE-KEEP` blocks via diff endpoint.
- Show execution in chat toggle (default OFF) — show collapsed execution summaries on success.

Demos
- Previous sandbox apps and experiments are under `demos/`.
- Open directly in the browser (e.g., `http://localhost:7080/demos/todo-app/`).

Notes
- Agent owns the board; Kanban is derived from agent state.
- The author primarily uses PowerShell and has WSL available; commands are provided for both where applicable.
 - Permissions: use the header “Permissions” button to grant read/write/test access to the workspace. The app will prompt on first load.

Slash commands (quick tooling)
- `/tree [path]` — show a shallow file tree (default `.`)
- `/file <path>` — show head of a file
- `/search <term>` — search repo (adds ±1 line context)
- `/help` — open help; `/perms` — open permissions; `/stats` — open Dev Tools
