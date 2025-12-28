AGENTS.md — Guidance for Agents and Contributors

Scope
- This file guides AI agents and humans contributing within this repository.
- It applies to the entire repo unless a more specific AGENTS.md is added in a subfolder.

What This Project Is
- ViBE is a chat-first coding agent demo with a Kanban UI and a minimal Node server.
- Latest flow: real planning via OpenAI (optional), controlled single-card execution with atomic patches, revert-per-card, and a simple event memory.

Environment & Tools
- Primary OS/shell: Windows with PowerShell. The author also has WSL available; feel free to provide Linux commands when appropriate, but include PowerShell variants for convenience.
- Node.js runtime. No heavy external dependencies by design.
- Network calls are restricted to OpenAI APIs when configured via environment variables.

Workspace Model
- The server detects a workspace root in this order: `VIBE_WORKSPACE` env → nearest parent with `.git/` → current working directory.
- Writes are confined to the workspace root. The `.vibe/` directory stores snapshots and event logs.
- The UI header shows the absolute workspace path; a CLI launcher (`vibe.js`) can target a different root.

How To Run (local)
- PowerShell
  - `node server.js` (serves at http://localhost:7080)
  - Optional: `setx OPENAI_API_KEY "<your_key>"` then restart shell, or place it in `.env` (not committed).
- WSL/Linux/macOS
  - `node server.js`
- CLI (pick workspace)
  - `node vibe.js C:\path\to\repo` (PowerShell)
  - `node vibe.js /path/to/repo` (WSL/Linux/macOS)

Configuration
- `.env` (not committed):
  - `OPENAI_API_KEY` (optional for real planning)
  - `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)
  - `PORT` (optional, default 7080)
  - `VIBE_WORKSPACE` (optional explicit workspace)
  - `VIBE_REQUIRE_TEST_CONFIRM=1` (optional; require explicit confirmation to run tests via `/api/run`)

Server Endpoints (selected)
- `GET /api/ping` → `{ ok, workspaceRoot }`
- `GET /api/tree?path=.&depth=2` → shallow file tree
- `GET /api/file?path=...` → read a file (bounded)
- `GET /api/search?q=...` → search text
- `POST /api/patch` → atomic text writes with snapshots; returns combined diff
- `POST /api/revert` → restore a snapshot (per-card revert)
- `POST /api/run { kind: "test", confirm?: true }` → runs `npm test` if present (optionally gated)
- `POST /api/agent/plan { goal }` → plan JSON via OpenAI (fallback deterministic if missing)
- `POST /api/agent/chat { text, history?, client? }` → action-oriented chat (READ/CREATE/UPDATE/PLAN/PROCEED etc.)

Action Schema (expectations)
- READ_FILE `{ path }`
- CREATE_FILE `{ path, content }` (full file content)
- UPDATE_FILE `{ path, content }` (full file content)
- EMIT_PLAN `{ plan }`, REPLAN `{ plan }`
- PROCEED_EXECUTION | HALT_EXECUTION | PLAN_ONLY | ASK_INPUT

Guardrails & Limits
- Path safety: normalized joins under the workspace root; `.git/` and `node_modules/` are blocked for writes.
- Atomic writes: `/api/patch` snapshots before/after; a lock serializes patch requests.
- Diff: unified diff with added line numbers; not a full GNU diff replacement.
- Size limits: large writes are rejected; repository search and file reads are bounded.
- Tests: `npm test` only. If `VIBE_REQUIRE_TEST_CONFIRM=1`, callers must pass `{ confirm: true }`.

Coding Conventions
- Keep changes minimal and focused; prefer small, reversible patches per card.
- Avoid adding heavy dependencies. Favor small, readable utilities.
- Keep UI chat-first; don’t add drag/drop Kanban edits — the agent owns the board.

Repo Layout (after cleanup)
- `index.html`, `styles.css`, `app.js` — SPA (Latest)
- `server.js`, `vibe.js` — minimal server + CLI workspace launcher
- `demos/` — archived demo apps and experiments
- `.vibe/` — snapshots + events (ignored in VCS)
- `PLAN.md`, `SEED.md`, `context-dumps/` — product intent and iteration notes
- `AGENTS.md` — this file (repo-wide)

Do’s and Don’ts for Agents
- Do:
  - Inspect current files via `/api/tree`/`/api/file` before proposing changes.
  - Use full-file `CREATE_FILE`/`UPDATE_FILE` actions; avoid diffs/snippets.
  - Keep changes in the workspace; respect ignore rules.
- Don’t:
  - Run arbitrary commands; only `npm test` is supported via `/api/run`.
  - Write into `.git/`, `node_modules/`, or outside the workspace root.
  - Commit or push secrets. `.env` must not be committed.

Windows Notes
- The author primarily uses PowerShell. Prefer PowerShell command examples; include WSL/Linux variants when helpful.
- WSL is available if a Linux-only command is more ergonomic.

Contact
- If something is unclear for agents, add a short note here or in a `demos/README.md` co-located with examples.

