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
- `GET /api/file?path=...` → read a file (bounded). Optional byte-range params: `head`, `tail`, or `start`/`end`; optional `maxBytes` cap.
- `GET /api/search?q=...` → search text. Optional `regex=1`, `case=sensitive`, and `context=N` (±N lines).
- `POST /api/patch` → atomic text writes with snapshots; returns combined diff
- `POST /api/patch/diff { diff, keepRegions?, preview? }` → apply unified diff with keep‑regions and snapshots; returns per‑file diffs and warnings. Prefer this for edits. When applied (not preview), a combined diff is saved under `.vibe/logs/` and returned as `diffPath`.
- `POST /api/diff/generate { path, newContent, oldContent? }` → returns a minimal unified diff for the given file.
- `POST /api/revert` → restore a snapshot (per-card revert)
- `POST /api/revert/check` → get divergence warnings before revert/reapply
- `POST /api/run { kind: "test", confirm?: true }` → runs `npm test` if present (optionally gated). Full logs are saved under `.vibe/logs/` and response includes `logPath` and `last` (tail).
- `POST /api/agent/plan { goal }` → plan JSON via OpenAI (fallback deterministic if missing)
- `POST /api/agent/chat { text, history?, client? }` → action-oriented chat (READ/CREATE/UPDATE/PLAN/PROCEED etc.)
- `POST /api/wrapup { summary }` → returns concise run wrap‑up (OpenAI if configured)
- `GET /api/skills/list` → list available skills in `skills/`
- `POST /api/diff/generate { path, newContent, oldContent? }` → generate unified diff for edits

Action Schema (expectations)
- READ_FILE `{ path }`
- EDIT_DIFF `{ diff, keepRegions? }` (preferred for edits; unified diff)
- CREATE_FILE `{ path, content }` (full file content for new files)
- UPDATE_FILE `{ path, content }` (use sparingly; prefer EDIT_DIFF when possible)
- UPDATE_MEMORY `{ kind, diff }` (maps to EDIT_DIFF on repo memory files; kinds: PLAN, DECISIONS, CURRENT_TASK, TODO, NOTES, ARCHITECTURE)
- TASK `{ kind, ... }` (fresh-context sub-agents; supported kinds: `SCOUT { q, dir?, ext? }`, `TEST { timeoutMs? }`). Returns observations and log pointers; results are folded into the next planning step.
- LOAD_SKILL `{ name }` (injects the skill doc into context for the next step; equivalent to user selecting a skill)
- EMIT_PLAN `{ plan }`, REPLAN `{ plan }`
- PROCEED_EXECUTION | HALT_EXECUTION | PLAN_ONLY | ASK_INPUT
– Optional: META `{ risk, assumptions }` attached to card evidence

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
- `PLAN.md`, `DECISIONS.md`, `CURRENT_TASK.md`, `TODO.md`, `NOTES.md`, `ARCHITECTURE.md` — files-as-memory consulted by the agent
- `tasks/` — per-task overlays (`<slug>.md`) created when a task begins execution
- `skills/` — loadable skill bundles (`.md`) injected on demand
- `SEED.md`, `context-dumps/` — product intent and iteration notes
- `AGENTS.md` — this file (repo-wide)

Do’s and Don’ts for Agents
- Do:
  - Inspect current files via `/api/tree`/`/api/file` before proposing changes.
  - Prefer `EDIT_DIFF` with unified diffs via `/api/patch/diff` for modifications; use `CREATE_FILE` for new files.
  - Use `/api/file` range params (`head`, `tail`, `start`/`end`) to read only what you need.
  - Use `/api/search` options (`regex`, `case`, `context`) to target results and include helpful context.
  - Keep changes in the workspace; respect ignore rules.
- Don’t:
  - Run arbitrary commands; only `npm test` is supported via `/api/run`.
  - Write into `.git/`, `node_modules/`, or outside the workspace root.
  - Commit or push secrets. `.env` must not be committed.

Quick examples (PowerShell / WSL)
- Read head: `curl "http://localhost:7080/api/file?path=server.js&head=2000"`
- Regex search with context: `curl "http://localhost:7080/api/search?q=^POST%20/api/patch&regex=1&case=sensitive&context=1"`
- Apply diff: POST to `/api/patch/diff` with body `{ diff, keepRegions: true }` (unified diff with `--- a/` / `+++ b/` and `@@` hunks).

Windows Notes
- The author primarily uses PowerShell. Prefer PowerShell command examples; include WSL/Linux variants when helpful.
- WSL is available if a Linux-only command is more ergonomic.

Permissions & Quick Commands
- On first load, ViBE prompts for workspace permissions (read/write/test). You can adjust anytime via the “Permissions” button in the header.
- Quick slash commands in chat:
  - `/tree [path]` — list files (depth 2)
  - `/file <path>` — read a file head
  - `/search <term>` — search with context
  - `/help`, `/perms`, `/stats`

Contact
- If something is unclear for agents, add a short note here or in a `demos/README.md` co-located with examples.
