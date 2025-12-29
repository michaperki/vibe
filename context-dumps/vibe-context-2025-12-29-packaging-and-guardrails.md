# ViBE Context Dump — Packaging, Permissions, Read‑First Guard (2025‑12‑29)

Summary
- Goal: Make ViBE easy to install/run anywhere, harden agent safety (read‑first, permission‑aware), and remove behavior that guesses user intent.
- Outcome: Added npm CLI (start/init/perms/doctor), served UI from package dir, expanded tool schema (READ_TREE/SEARCH), permission‑aware tool loop, read‑before‑write guard, prompt updates to prefer README/Repo over defaults, docs + UI updates (Help, Stats, Snapshot tools, banner on HALT).

What changed (chronological)
1) Repo scan + seeds/context review
   - Read seeds/seed_instructions_inspired_by_claudecode.md, latest context dump, README.
   - Identified needs: diff‑first writes, read/search ergonomics, permission gating, planning clarity, no keyword routing.

2) Server ergonomics: read ranges + richer search
   - /api/file: added head/tail/start/end byte ranges + maxBytes override (guarded).
   - /api/search: added regex, case, and context (±N lines) options; returns before/after.

3) Documentation + Dev Tools
   - AGENTS.md/README.md: documented EDIT_DIFF and new read/search params; clarified “diff‑first”.
   - Dev Tools: snapshot list + prune; Keep Regions toggle; Show execution in chat toggle.

4) Telemetry
   - /api/stats: counts tool calls, tests ok/fail, recent files, snapshot count.
   - Memory tab shows Agent Stats; added small endpoint cheatsheet.

5) Help modal
   - Added Help modal with endpoint cheatsheet + PowerShell/WSL examples.

6) Permissions model (UI + gating)
   - Permissions modal (read/write/test) with localStorage + hydrates from .vibe/config.json.
   - Executor gating: blocks writes/tests with clear status and system message; read gating enforced in tool loop later.
   - Header banner appears when HALT_EXECUTION reason=PERMISSION_REQUIRED; points user to Permissions.

7) Model‑driven tool layer (no NL routing)
   - Removed natural‑language auto‑routes and adhoc tasks.
   - Added first‑class tool actions READ_TREE and SEARCH; tool loop executes READ_FILE/READ_TREE/SEARCH and feeds Observations back to model.
   - Client sends perms in chat request; server injects permission Observations and halts auto‑proceed if write/test missing.
   - System prompt: explicit tool list and examples; policy to not PROCEED when perms off.

8) Packaging for easy install/run
   - package.json with bin mapping: `vibe`.
   - CLI (vibe.js): `start`, `init`, `perms`, `doctor`.
     - start: sets VIBE_WORKSPACE, runs server, `--open` opens browser.
     - init: scaffolds .vibe/, adds .vibe/ to .gitignore, creates .env.
     - perms: writes .vibe/config.json with default perms.
     - doctor: quick environment checks.
   - README updated with npm i -g / npx flows for PowerShell + WSL/macOS.

9) Serve UI from package directory
   - UI assets now served from `__dirname` (package install path), not workspace.
   - Fixes “404 / when workspace has no index.html”.

10) Chat robustness
   - 500 fix: fallback path no longer references undefined `history` on missing OPENAI_API_KEY.
   - Better logging: body parse errors, chat failures, and top‑level handler errors now logged with stack traces.

11) Stop scaffold drift (todo/hello default)
   - Prompt updated: “Read README.md first; repo instructions override defaults. Do not scaffold unless explicitly asked.”
   - README excerpt injection: include a small README snippet in extraSystem when present.
   - Read‑before‑write guard: if model proposes writes with no prior READ_TREE or READ_FILE README, server re‑asks with a policy nudge to read first.
   - Debug `chat_out` logs now include `readFirstSatisfied` flag.

Key design principles enforced
- Model decides tools; UI never keyword‑routes.
- Read‑first then plan; plan then execute.
- Diff‑first edits with keep‑regions and atomic snapshots.
- Permission gating at tool execution time; HALT with clear reason.
- Workspace writes strictly under VIBE_WORKSPACE; UI served from package dir.

Files touched (high level)
- server.js
  - /api/file ranges; /api/search regex/case/context.
  - /api/stats; /api/config; improved logs.
  - Tool loop executes READ_FILE/READ_TREE/SEARCH; permission Observations; read‑before‑write guard.
  - System prompt updates; fallback fixes; static UI base path.
- app.js
  - Dev Tools additions (snapshots/stats); Help modal; Permissions modal + hydrators.
  - HALT banner; “Needs Input” without auto‑cards.
  - buildClientState includes perms.
- index.html
  - Help + Permissions modals; Dev Tools tweaks; HALT banner.
- AGENTS.md/README.md
  - Documented diff‑first, new endpoints, CLI usage, permissions.
- vibe.js
  - CLI commands: start/init/perms/doctor.
- package.json
  - Bin entry and basic metadata; files whitelist.

Rationales
- Serving UI from package dir enables “run anywhere” without copying SPA into workspaces.
- Read‑before‑write guard makes “list files, read README” the unavoidable first step, removing scaffold drift.
- Permission Observations train the model to ask the user to enable perms instead of silently failing.
- CLI makes it trivial to initialize and run ViBE in any repo; no global Node hacks needed.

Known limitations / Open work
- No npm publish workflow yet (add publishConfig + GH Actions when ready).
- Server still uses simple fetch wrapper for OpenAI; may tighten error handling/timeouts.
- Tool loop read‑first guard currently satisfied by either READ_TREE or README read; could require both for stricter behavior.
- Slash commands send hints to model; can remove entirely if preferred for purity.
- Dev Tools could show “read-first satisfied” and initial read steps explicitly.

Quick verify checklist
1) `vibe start C:\\path\\to\\repo --open` opens UI even if repo has no SPA files.
2) Chat without OPENAI_API_KEY yields safe clarify/mock plan (no 500s).
3) With key set, first turn calls READ_TREE/READ_FILE(README) before proposing writes.
4) If write/test perms off, server returns EMIT_PLAN + HALT_EXECUTION { reason: PERMISSION_REQUIRED } and header banner shows.
5) /api/file ranges and /api/search context work; AGENTS/README reflect changes.

Next steps
- Add npm publish pipeline (publishConfig: public; GH Actions on tag; NPM_TOKEN).
- Optional binaries (pkg/nexe) for users without Node.
- Tighten read-first rule to require both tree + readme when present; add Dev Tools pill “Read-first: TREE, README”.
- Add minimal tests for /api/file ranges, /api/search options, and read‑first guard paths.

