# ViBE — ClaudeCode Alignment & Next Steps (2025‑12‑28)

Context recap (from seed + latest dump + code skim)
- Diff‑first writes exist: `/api/patch/diff` with keep‑regions, fuzzy context, snapshots, optional git commit.
- Quiet execution + single wrap‑up shipped: optional execution bubbles, Plan Summary default, `POST /api/wrapup`.
- Safety: atomic snapshots, revert per card, divergence checks, write guards for `.git/` and `node_modules/`.
- Search/read: `/api/tree`, `/api/file` (truncates large files), `/api/search` with dir/ext filters.
- Run: `/api/run` limited to `npm test` (gated by `VIBE_REQUIRE_TEST_CONFIRM`).
- UI: Dev Tools toggles (keep‑regions strict, show execution in chat), evidence panes, revert/reapply per card.

Gaps vs. goals from seed (Claude Code talk)
- Docs drift: AGENTS.md still advises full‑file writes; should prefer `EDIT_DIFF` and document `/api/patch/diff`.
- Shell tool: no general shell endpoint; only test runner is allowed.
- File reads: no line/range/head/tail parameters; only size‑truncated head.
- Search: no regex/case options; lacks surrounding context window per match.
- To‑do/tasks: plan exists in memory; not persisted as a first‑class object under `.vibe/`.
- Sub‑agents/isolated context: no explicit task‑scoped chat contexts or handoff mechanism.
- Telemetry/evals: events exist, but no summarized metrics or replay UI hooks.
- Snapshot hygiene: server has list/prune, but UI doesn’t expose them yet.
- Skill library: no explicit invocation pattern beyond free‑form chat actions.

Plan — short, focused increments (small, reversible patches)
1) Align docs with diff‑first editing
   - Update `AGENTS.md` and `README.md`:
     - Prefer `EDIT_DIFF` with unified diff over full‑file rewrites.
     - Document `/api/patch/diff` request/response (keep‑regions, preview, warnings).
     - Reflect Dev Tools toggles and run wrap‑up behavior.
   - Acceptance: files updated; examples for PowerShell + WSL included.

2) File read ranges (safe, bounded)
   - Server: extend `/api/file` with optional `start`, `end`, `maxBytes`, `head`, `tail` query params (mutually exclusive: `start/end` or `head/tail`).
   - Return `{ size, content, range: { start, end } }`; keep truncation footer when applicable.
   - Acceptance: reading `head=200` or `start=500&end=800` returns exact slices; oversize guarded.

3) Repo search ergonomics
   - Add `regex`, `case`, and `context` (±N lines) params to `/api/search`; preserve `dir`, `ext`, `max`.
   - Response includes `before`/`after` context arrays and stable clipping for big matches.
   - Acceptance: can find case‑sensitive/regex matches and see N lines of context.

4) Shell runner (gated, minimal)
   - New `POST /api/shell { cmd, timeoutMs?, confirm? }` with strict allowlist:
     - Default allow: `node -v`, `npm test`, `npm run build`, `git status` (read‑only), `npm -v`.
     - Env gates: `VIBE_ENABLE_SHELL=1` (off by default), `VIBE_SHELL_ALLOW` (comma list), `VIBE_REQUIRE_SHELL_CONFIRM=1`.
   - Events: `SHELL_RUN` with timings/exit code; stdout/stderr truncated.
   - Acceptance: disallowed commands rejected; confirm gating works; test path still via `/api/run`.

5) Persisted plan/to‑dos
   - Persist current plan under `.vibe/plan.json` with minimal schema `{ planId, goal, tasks[] }`.
   - On load, if no in‑memory plan, hydrate from file and wire task statuses.
   - Acceptance: refresh preserves plan and task statuses in Latest mode.

6) Task‑scoped sub‑agents (lightweight isolation)
   - Add server support to start a task‑scoped chat: `POST /api/agent/sub { taskId, role, text, history? }` → returns summary only.
   - Client: optional “Research” and “Review” steps that call sub‑agent and store artifacts under `.vibe/artifacts/<run>/<task>.md`.
   - Acceptance: artifacts saved; summaries shown in Evidence without bloating main chat.

7) Telemetry + replay hooks
   - Server: new `GET /api/stats` summarizing events (tool calls, retries, durations, applied/ skipped hunks, reverts, test results).
   - UI Dev Tools: compact counters (“agent smell” metrics) and link to last N runs.
   - Acceptance: stats render without blocking; no heavy deps.

8) Snapshot hygiene in UI
   - Expose `/api/snapshots/list` and `/api/snapshots/prune` in Dev Tools with “Keep last N” control.
   - Acceptance: can view and prune snapshots safely.

9) Reviewer note (risk/assumptions)
   - Allow `META { risk, assumptions }` in actions; store under Evidence; show inline beneath diffs.
   - Acceptance: note displays for each completed card.

10) Small UX polishes
   - Replace “(details)” with chevron + tooltip; status pills in Plan Summary; @filename chips (click‑to‑open).
   - Acceptance: visual changes behind a feature flag where risky.

Non‑goals (for now)
- Web fetch/search tools beyond OpenAI planning; keep network surface minimal.
- General bash without allowlist/confirm; stick to gated subset.
- Heavy dependency additions.

Validation checklist (per item)
- Docs updated with examples for PowerShell/WSL.
- Unit tests for new server params/endpoints using Node’s built‑in `node:test` (no extra deps).
- Events include timing, bytes, counts; Dev Tools shows counters.
- All writes stay under workspace; `.git/` and `node_modules/` remain blocked.

Cut lines (suggested order)
1) Docs alignment (#1)
2) File read ranges (#2)
3) Search ergonomics (#3)
4) Snapshot hygiene UI (#8)
5) Telemetry/stats (#7)
6) Reviewer note (#9)
7) Persisted plan (#5)
8) Gated shell runner (#4)
9) Task‑scoped sub‑agents (#6)
10) Small UX polishes (#10)

Notes
- Keep changes small and reversible; prefer adding endpoints behind env flags, then flipping defaults after bake‑in.
- Update AGENTS.md to steer agents: prefer `EDIT_DIFF`, read in chunks, and avoid verbose narration.
