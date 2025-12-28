ViBE Context Dump — for developers

Scope
- This file summarizes what we’ve built, why, and how the current “Latest” flow behaves.
- It is not part of the ViBE product UI; it’s a developer artifact you asked Codex to generate.

North‑Star UX
- Chat‑first: the user chats with an AI coding agent; chat is LLM‑only.
- Structured actions: the agent emits actions (EMIT_PLAN, REPLAN, PROCEED_EXECUTION, HALT_EXECUTION, PLAN_ONLY, ASK_INPUT).
- Kanban renders agent state; the user does not drag cards.
- Execution is gated; runs only when the agent decides (or via user Autopilot toggle).

What’s implemented (Latest)
- Real planning via OpenAI if OPENAI_API_KEY is set (.env supported); falls back to deterministic plan for resilience.
- Chat orchestration with history: the last ~10 turns + repo summary are sent every call.
- Agent discipline: if the model returns message‑only, server re‑prompts for actions once; if still none, server synthesizes a minimal EMIT_PLAN so Kanban can render.
- Tool action normalization: if the model replies with CREATE_DIR/CREATE_FILE (tool‑like acts) instead of EMIT_PLAN, server wraps them into a plan.
- Executor: applies atomic patches per card with snapshots and unified diffs; runs tests (npm test if present, else pass).
- Evidence: per‑card Diff (added/modified/deleted files), Logs (snapshot id, workspace root, saved absolute paths), Tests output.
- Revert: per‑card revert via snapshots.
- Memory: events log under .vibe/events.json, Memory tab shows summary (optional for UX).

Workspace model
- All writes land in the workspaceRoot (server detects: VIBE_WORKSPACE env, else nearest parent with .git, else cwd).
- .vibe/ holds snapshots and events only; not where user code is written.
- Header shows the absolute workspace path.
- vibe.js launcher provided to start against an explicit path (node vibe.js /path/to/repo).

UX guardrails added
- No canned chat from the UI; chat is LLM‑only.
- If the model re‑emits the same plan after acceptance (no PROCEED_EXECUTION), client auto‑proceeds once (silent) to avoid loop.
- Kanban shows “Waiting for agent actions…” if message‑only replies arrive several times in a row.

Server endpoints (selected)
- GET /api/ping → { ok, workspaceRoot }
- POST /api/agent/chat → { provider, message, actions[] } (chat with actions policy + fallback)
- POST /api/patch → { ok, snapshotId, workspaceRoot, changes[{path,absPath,type}], diff }
- POST /api/run → test run (whitelisted)
- POST /api/revert → { ok, snapshotId, workspaceRoot, restored[{path,absPath}], diff }

Execution details
- Path parsing in executor now honors titles like “Create directory hello‑vibes” and steps like “write hello‑vibes/index.html”.
- Creates directory by adding .gitkeep (server now allows .gitkeep; still blocks .git directory and node_modules).
- Scaffolds index.html/styles.css/app.js with minimal content; if the model supplies content in actions, we can extend to write that verbatim.

Known behavior to refine
- LLM may send tool‑like actions instead of EMIT_PLAN; we normalize, but we should encourage a single EMIT_PLAN followed by PROCEED_EXECUTION after user acceptance.
- Rare repeated plans: loop‑breaker proceeds once, but we should nudge PROCEED_EXECUTION in the prompt further.
- Diff context is minimal (unified); could add hunk context and line numbers.

Next steps (proposals)
- Formalize action schema + JSON schema validation; stream tool feedback.
- Git branch‑per‑run, PR previews, revert/compare runs.
- “Change Workspace” CLI polish and warning when no .git.
- Plan‑only mode: richer instruction sets for separate repositories.

Environment
- OPENAI_API_KEY and optional OPENAI_MODEL in .env; port 7080 default.
- VIBE_WORKSPACE to set workspace root explicitly.

This dump reflects the state after implementing: chat‑first orchestration, action normalization/fallback, workspace root detection, absolute path logging, and generalized executor for arbitrary app names.

