ViBE — Chat-First Coding Agent (Latest)

Overview
- Single-page app + minimal Node server that demonstrates:
  - Real LLM planning (optional) via `/api/agent/plan` and action-oriented chat via `/api/agent/chat`.
  - Controlled execution: one card at a time, atomic patch + snapshot + test + revert.
  - Lightweight memory: event log under `.vibe/` and a Memory tab in the UI.

Quick Start
- PowerShell (Windows)
  - `node server.js`
  - Open http://localhost:7080/
  - Optional: `setx OPENAI_API_KEY "<your_key>"` then restart shell, or add it to `.env` (not committed).
- WSL/Linux/macOS
  - `node server.js` then open http://localhost:7080/

CLI Workspace Launcher
- Start against a specific folder (where code changes land):
  - PowerShell: `node vibe.js C:\path\to\repo`
  - Linux/macOS/WSL: `node vibe.js /path/to/repo`
- Alternatively: `VIBE_WORKSPACE=/path/to/repo node server.js`

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

Security & Safety
- Writes are confined to the workspace root; `.git/` and `node_modules/` are blocked.
- `/api/patch` is atomic and snapshot-backed; a lock serializes concurrent patch requests.
- `/api/run` runs only `npm test`. Set `VIBE_REQUIRE_TEST_CONFIRM=1` to require `{ confirm: true }` in the request body.
- Do not commit secrets. `.env` is ignored by default; rotate any key already checked into history.

Demos
- Previous sandbox apps and experiments are under `demos/`.
- Open directly in the browser (e.g., `http://localhost:7080/demos/todo-app/`).

Notes
- Agent owns the board; Kanban is derived from agent state.
- The author primarily uses PowerShell and has WSL available; commands are provided for both where applicable.
