ViBE Context Dump — Iteration Notes (Revisions + Dev Tools)

Date: 2025-12-28

Overview
- Goal: Keep ViBE truly chat-first while making the agent reliably produce structured actions (plan → execute → verify → revise) with full transparency for developers.
- Theme of this iteration: remove client-side “interception,” preserve and render the agent’s intent, add a minimal tool loop (read/create/update), preserve content end-to-end, and make debugging easy.

North-Star & Vision
- Chat-first: The user talks naturally; the agent decides which tools to use.
- Structured actions: EMIT_PLAN/REPLAN/PROCEED_EXECUTION/HALT_EXECUTION/ASK_INPUT/PLAN_ONLY and file tools (READ_FILE/CREATE_FILE/UPDATE_FILE).
- Evidence-driven: Every execution step produces diffs/logs/tests/snapshots.
- Minimal UI bias: Kanban reflects the agent’s plan; the user does not drag cards.
- Observability: Dev tools make “what the model saw/returned” visible without cluttering the main UX.

Key Challenges We Hit
1) First-pass content quality: The checkerboard scaffold often used 1D CSS (vertical stripes). This is a model content issue and not a write bug.
2) No revise path (originally): The server dropped file content from tool-like actions or the agent replied with message-only/PROCEED, leaving no executable work.
3) Interception mismatch: The client intercepted “proceed/continue,” causing invisible flows and no Dev Tools logs; also created no-ops on empty queues.
4) Plan wipe: New EMIT_PLAN replaced the previous plan; earlier cards vanished.
5) Lack of read/update loop: The agent couldn’t READ_FILE → UPDATE_FILE with full content in a bounded way.
6) Poor observability: No easy way to inspect the model’s actual JSON outputs/request context.

Root Causes
- Weak contract: message-only replies were tolerated; PROCEED with empty queue wasn’t rejected.
- Normalization dropped content and/or didn’t generate executable writes.
- The UI intercepted messages (keywords) and executed locally, bypassing agent/tool decisions.
- Plan handling was replace-not-merge.

What We Changed (Core)
Server (server.js)
- State-guided, non-heuristic context: /api/agent/chat now receives client state (pending_task_count, autopilot, active_dir) as observations. No keyword routing.
- Available tools in prompt: READ_FILE, CREATE_FILE, UPDATE_FILE, EMIT_PLAN/REPLAN, PROCEED/HALT, PLAN_ONLY, ASK_INPUT. Emphasis on full-file content for updates.
- Short bounded tool loop:
  • READ_FILE aliases supported; server returns Observation: FILE <path> and re-asks once.
  • Missing content retry: for CREATE_FILE/UPDATE_FILE without content, server forces one retry demanding full file content (not diffs/snippets).
- Action normalization & grouping:
  • Tool-like CREATE_/UPDATE_ actions are grouped into one EMIT_PLAN with a single “Apply file changes (N)” task containing task.writes = [{path,content}].
  • We append PROCEED_EXECUTION after EMIT_PLAN to reflect the agent’s execution intent (no client interception required).
  • Directory creation becomes dedicated tasks (mkdir step) and is handled by executor.
- Strictness for empty queues: If there are no pending tasks and the agent tries to PROCEED, we reject and re-ask (no synthetic proceed).
- Debug endpoint: GET /api/debug returns a small ring buffer of recent chat_in/chat/chat_out entries.

Client (app.js/index.html)
- Removed V7 interception: No keyword-based “proceed/continue.” Everything goes to /api/agent/chat, so Dev Tools shows every turn.
- Plan merge (not replace): New plan tasks append to existing ones; duplicates update by title. Earlier cards remain visible as Done.
- Dev Tools modal: A lightweight popup with Refresh/Copy and Tail mode to live-view /api/debug.
- Empty-queue honesty: If autopilot is on but no tasks exist, the UI says “No pending tasks…” instead of pretending to run.

What Went Wrong (and is now fixed)
- Revisions did nothing: message-only or bare “proceed” led to no tasks. Now the agent must choose tools; we reject invalid PROCEED on empty queue; and CREATE/UPDATE get normalized with writes.
- Initial plan executed only after “continue”: We corrected flow by returning PROCEED_EXECUTION alongside EMIT_PLAN when the agent sends tool-like writes.
- Earlier cards vanished on revise: We now merge plans and keep cards.

What Went Right
- Revisions now apply: The agent READ_FILE → UPDATE_FILE with full content, we group file writes, and execution runs automatically (Autopilot or explicit PROCEED action).
- Transparency: Dev Tools shows exactly what the model saw/returned and what we normalized.
- Minimal UX changes: We stayed chat-first; Kanban reflects the agent’s plan; users aren’t forced into tool-speak.

Current Behavior (How to Verify)
1) Creation
   - Ask: “Create ‘demo’ app with HTML/CSS/JS.”
   - Expect: EMIT_PLAN with tasks + PROCEED_EXECUTION; cards move to Done; new folder/files appear.
   - Evidence: Diff shows writes; Logs show snapshot id and saved paths.

2) Revision
   - Ask: “Fix the CSS for grid parity” or “Add hover effect to X/styles.css.”
   - Expect: The agent may READ_FILE; then EMIT_PLAN (grouped “Apply file changes (N)”) + PROCEED_EXECUTION; new card appears and moves to Done; files reflect the changes.
   - Evidence: Diff shows updated files; Dev Tools shows chat_in/chat/chat_out entries for the fix turn.

3) Dev Tools (index.html button)
   - Click “Dev Tools” → Toggle Tail for live updates → Refresh to fetch logs.
   - You will see:
     • chat_in: text + client state
     • chat: model request/response JSON (sanitized)
     • chat_out: normalized actions + plan summary

Shortcomings & Pitfalls (Known)
- First-pass content quality: The model may still pick suboptimal CSS. This is expected without tests; revisions now make correction easy.
- Merge-by-title: We dedupe/refresh tasks by title; identical titles across runs could collide. Future work: stable task keys or richer identity.
- Grouped writes: One “Apply file changes (N)” card simplifies Kanban, but very large batches could be split for readability.
- Debug ring size: Only last ~50 entries are kept in memory; tail for live runs if needed.

Next Steps (Recommended)
1) Harden action schema & validation
   - JSON schema for actions (types, required fields, constraints). Reject invalid payloads with clear observations.
2) Bounded tool loop (multi-turn)
   - Allow up to 2–3 action/observation rounds per user message to converge on correct UPDATE_FILE payloads.
3) Dev Tools polish
   - Add a compact “Plan Preview” of normalized tasks and write paths; optional auto-open on new plan.
4) Test hooks (optional)
   - If a project has a test script, run auto-checks; otherwise expose a VERIFY tool for agent-initiated checks (generic, not task-specific).
5) Plan continuity UX
   - Show a subtle banner “Agent proposed N tasks; executing now” when Autopilot is On.

Recent Observation: Grouping Update Tasks
- Symptom: Multiple “Update file …” cards appeared even after enabling grouping, and styles.css diff showed “(no changes)”.
- Causes:
  • Server not restarted — grouping lives in server normalization; running an old server keeps per-file tasks.
  • Agent emitted an explicit EMIT_PLAN with multiple tasks — we render the agent’s plan as-is; grouping only applies when the agent returns tool-like actions (CREATE_FILE/UPDATE_FILE) directly.
  • No-change diffs — the agent’s “updated” content was identical to the current file; executor correctly showed “(no changes)”.
- How to verify grouping works:
  • Restart server (node server.js) after changes.
  • Issue a multi-file update in one message; check Dev Tools chat_out for planSummary titles like “Apply file changes (2)”.
  • Expect a single grouped card in Kanban with both files in the diff.
- Optional future: a dev flag (e.g., COALESCE_PLAN_TASKS) to coalesce multi-file plan tasks even when the agent sends an explicit EMIT_PLAN (development-only), keeping production behavior faithful to the agent’s plan.

Proposed Next Steps for ViBE
- Tool-calling loop v2
  • Expand the bounded loop to 2–3 turns per user message, coalescing multiple reads/updates, with explicit stop criteria and observation aggregation.
  • Keep writes flowing through the existing executor for diffs/snapshots/tests.
- Action schema & validation
  • Introduce a JSON Schema for actions and enforce it server-side; include validation errors in Dev Tools chat_out for quick diagnosis.
  • Add a compatibility layer for { action | type | tool } and normalize to `type`.
- Dev Tools evolution
  • Add “Plan Preview” (titles + write paths) and an option to copy normalized plan.
  • Tail toggle persists across sessions; optional auto-open on error states.
  • Expose a “clear debug buffer” button and include timestamps in the Dev Tools body.
- Plan & run UX
  • Keep planId consistent across runs where appropriate; display “Run #N” headers to demarcate revisions.
  • Optional dev flag to coalesce multi-file plan tasks even when sent via EMIT_PLAN.
- Workspace & multi-app awareness
  • Track active project dirs more explicitly; provide a quick switcher in Dev Tools (read-only) to show scoped file previews.
- Verification hooks (generic, not task-specific)
  • Provide a generic VERIFY tool (agent-triggered) to run a quick heuristic or test command; keep it pluggable.
- Reliability & safety
  • Rate-limit patch sizes and enforce path allowlists (already present) with clearer error messages.
  • Add graceful handling for partial failures (one of many writes fails) with clear evidence.


Enhanced Understanding & Goals
- The agent must decide; UI should never hijack control flow.
- Revisions must be deterministic: READ_FILE when needed → UPDATE_FILE with full content → execute → evidence.
- Observability trumps cleverness: prefer clear “no pending tasks” observations and Dev Tools transparency over silent automation.

Appendix: Action Schema (current expectation)
- READ_FILE { path }
- CREATE_FILE { path, content }
- UPDATE_FILE { path, content }
- EMIT_PLAN { plan }
- REPLAN { plan }
- PROCEED_EXECUTION | HALT_EXECUTION | PLAN_ONLY | ASK_INPUT

Notes
- All writes are confined to the workspace root; .vibe contains snapshots/events only.
- Directories are created via mkdir semantics (executor writes a .gitkeep to ensure creation).
