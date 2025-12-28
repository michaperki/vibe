# ViBE V0 Blueprint — One Loop, Human Tools, Diff Edits (2025‑12‑28)

Thesis
- Safe, inspectable agent execution. The moat is Kanban + runs + evidence + revertability.
- One master while‑loop with a rock‑solid action schema. The model drives; tools are deterministic and observable.

Architecture (V0)
- Single loop: plan → tool call(s) → evidence → next action. No complex orchestrator/DAG.
- Kanban is the UI for loop state (cards = tasks; statuses = phase). Evidence is first‑class.
- Runs map to Git branches/snapshots; replayable per card; revertable.

Action Schema (human tools)
- READ { path, offset?, limit? }
- GREP { q, dir, globs?, max? } — glob/regex search; returns matches with file/line/context.
- EDIT_DIFF { diff, keepRegions? } — unified diff across one or more files. Primary write primitive.
- BASH { cmd, allow?: string } — gated shell runner (limited allowlist: `npm test`, `npm run build`, `node -v`, `git status` etc.).
- TEST { runner?: 'npm', confirm?: boolean } — thin wrapper over project test script.
- GIT { commit, revert, branch } (optional) — branch‑per‑run, commit‑per‑card, revert‑per‑card; disabled if repo missing.
- META { risk, assumptions } — short notes attached to the card, authored by a reviewer sub‑agent.

Diff Edits (not rewrites)
- All code changes flow through EDIT_DIFF with unified diffs and optional keep‑region hints.
- Keep‑region markers (language‑agnostic):
  - Start: `// VIBE-KEEP START name` (or `<!-- ... -->` / `/* ... */`)
  - End: `// VIBE-KEEP END name`
- Patch engine refuses to alter lines inside keep regions unless explicitly flagged; returns granular warnings.

Sub‑Agents & Summaries
- Researcher: READ/GREP only; returns findings.
- Executor: EDIT_DIFF + TEST/BASH; returns evidence (diff, logs, timings).
- Reviewer: reads diff + findings; returns risk/assumptions note.
- Summaries + artifacts saved under `.vibe/artifacts/<run>/<card>.md/json` and never stuffed back into prompt wholesale.

Cards (structured, not enforced)
- Fields: { id, title, status, steps?, evidence, risk?, assumptions? }.
- UX steers behavior (pause on preview, apply, revert) without hard enforcement beyond tool constraints.

Determinism lives in tools
- Path allowlist; size/time limits; retries with bounded counts; tool call counters in evidence.
- Strict validation: reject empty/invalid actions; force retry with explicit errors.

Permissions/Sandboxing
- Per‑run branch/workspace isolation; explicit path allowlist; destructive ops gated (confirm:true).
- BASH allowlist and env guard (e.g., `VIBE_ENABLE_BASH=1`).

V0 Scope (what ships)
- Minimal tools: READ, GREP, EDIT_DIFF, TEST, optional BASH, optional GIT.
- Every card yields: diff + commands/logs + short risk note + timestamps.
- Run replay: revert/apply at card granularity (snapshots or git). Timeline view across runs (basic).

Priorities (V0)
1) EDIT_DIFF Pipeline (unified diff + keep‑regions + safe apply)
2) One‑Loop Executor + strict action validation (no keyword interception)
3) GREP/glob upgrade + targeted READ (offset/limit, head/tail helpers)
4) Reviewer sub‑agent for risk/assumptions
5) Git run hygiene (branch‑per‑run, commit‑per‑card, revert‑per‑card)

---

## Implementation Plan — #1 EDIT_DIFF Pipeline (Top Priority)

Goal
- Make unified diff the primary write primitive to improve reliability, minimize context, and simplify reverts.

Server
- New endpoint: `POST /api/patch/diff { diff: string, keepRegions?: boolean }`.
  - Parse unified diff: `--- a/<file>` / `+++ b/<file>` and `@@ -l,s +l,s @@` hunks.
  - Validate paths (workspace‑root, allowlist). Reject writes to `.git/`, `node_modules/`, etc.
  - Apply hunks with fuzzy context (configurable max offset). On conflict, return per‑hunk error with suggested context snippet.
  - Keep‑regions: detect `VIBE-KEEP START/END` blocks; if a hunk overlaps and `keepRegions` isn’t explicitly disabled, reject and return warnings.
  - Dry application to compute resulting content, then snapshot + write (or preview mode if `preview: true`).
  - Return `{ ok, snapshotId?, changes:[{path,type,diff,appliedHunks,skippedHunks}], diff, warnings[] }`.
- Action normalization: accept `EDIT_DIFF { diff }` and map to one EMIT_PLAN task (“Apply diff N files”).
- Evidence: tool call count, elapsed time, bytes changed per file; emit `PATCH_DIFF_APPLIED|PREVIEW` events.

Client
- Allow agent to submit `EDIT_DIFF` actions (same EMIT_PLAN+PROCEED grouping).
- Evidence pane shows combined diff + per‑file; keep region warnings highlighted.
- Revert works identically (snapshots). Preview button available if enabled.
- Minimal UI: no new screens; add a “keep regions strict” toggle in Dev Tools.

Agent Prompting
- Update policy: prefer `EDIT_DIFF` over full rewrites; include minimal hunk context.
- Keep regions: advise to avoid editing inside keep markers unless explicitly justified.
- Reviewer: after diff is prepared, produce `META { risk, assumptions }`.

Testing/Validation
- Golden‑file diffs for: add/modify/delete; multi‑file; overlapping hunks; keep‑region conflicts; fuzzy apply success/failure.
- Large files truncated consistently; binary files unsupported in diff (use CREATE_FILE_BINARY fallback).

Risks & Mitigations
- Fuzzy match can misapply: default conservative (reject on weak context); expose `maxOffset` env; record per‑hunk decisions in Evidence.
- Diff dialect variance: stick to standard unified diff; ignore `index`/`mode` lines.

Rollout
- Ship `/api/patch/diff` behind `VIBE_ENABLE_DIFF=1` initially; migrate planner to use `EDIT_DIFF` gradually.
- Keep existing full‑file update path for back‑compat during transition.

