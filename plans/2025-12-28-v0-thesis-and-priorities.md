# ViBE V0 Thesis, Priorities, and Next Steps — 2025‑12‑28

Thesis
- Safe, inspectable agent execution. The moat is Kanban + runs + evidence + revertability.
- We lean into traceability and control (what agents are bad at), not “magic”.

What Makes ViBE Distinct
- Timeline across runs with run comparison and card history
- Repetition guard (don’t redo reverted ideas)
- “Why this action?” breadcrumbs and per‑card risk/assumption notes
- Windows/PowerShell‑friendly DX

Priorities

Now (highest value, minimal scope)
1) Dry‑Run Mode (Top) — preview diffs without writing; promote to apply
2) Strict Mode — hard contract, bounded tool loop, deterministic retries
3) Run Comparison — diff two runs by files/tasks/evidence
4) Symbol‑Aware Edits — function/region‑scoped updates with AST/LSP hints
5) Reviewer Agent — independent critique + risk notes before apply

Soon
6) Playbooks — replayable multi‑card flows (Scaffold→Lint→Test→README)
7) Pattern Memory — learned style/conventions and anti‑pattern suppression
8) PR Generator — branch per run + PR text from evidence
9) Cost/Time Dashboard — per‑card and per‑run stats

Later
10) Marketplace — templates/playbooks/policy packs
11) Swarms — planner/editor/reviewer/tester roles under one schema
12) Design→Code — screenshot→UI scaffold with constraints

Out of Scope for V0 (avoid creep)
- VS Code extension, headless runner images, heavy Docker packaging
- Complex integrations beyond Git + CLI + web UI

Implementation Plan — #1 Dry‑Run Mode (Top Priority)

Goal
- Let users see exactly what would change (per‑card, per‑file diffs) before writing anything. Promote selectively to apply.

Server
- API: extend `/api/patch` to accept `{ dryRun: true }` or add `/api/patch/preview`.
  - Validate paths as usual; read current contents; build diffs; DO NOT write; DO NOT snapshot.
  - Return `{ preview: true, changes: [{path,type,diff}], diff, warnings }`.
- Agent normalization remains unchanged (EMIT_PLAN + writes); executor decides whether to preview or apply.
- Events: emit `DRY_RUN_PREVIEW` (files + taskId) for observability.

Client
- UI toggle “Dry Run” near Autopilot. Default ON for first‑time users.
- Executor (V7): when Dry Run is ON and a card has writes:
  - Call preview endpoint; show per‑file diffs in Evidence; mark task as VERIFYING (Preview).
  - Buttons: “Apply Card”, “Apply Selected Files…”, “Discard”. Applying calls real `/api/patch` and proceeds to tests.
  - If Autopilot is ON, pause after preview and wait for confirmation.
- Evidence: label previews clearly; disable Revert (nothing applied yet).

Testing
- Preview then apply → diffs identical and snapshot created only on apply.
- New files/dirs/binaries preview correctly; large files truncate same as patch.
- No changes to `.vibe/snapshots/` on pure preview.

Risks & Mitigations
- Divergence between preview and apply: share the same diff builder and path guards; include a quick re‑validation at apply.
- UX complexity: keep one toggle + three clear actions; no auto‑apply in Dry Run.

Rollout
- Behind UI toggle; env default `VIBE_DRY_RUN_DEFAULT=1` for newcomers.
- Add a short “Dry Run enabled” pill on Kanban when active.

