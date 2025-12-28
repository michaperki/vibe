
````md
# SEED.md — V0 / V1
AI-Driven Kanban for Vibe Coding (Chat-Only UX)

This document defines **V0 (concept lock)** and **V1 (structured agent)**.  
Goal: validate the *interaction model* and *agent planning discipline* before touching filesystem or runners.

---

## North-Star UX (applies to all versions)
- **Chat is the only user input**
- Agent:
  - creates the kanban
  - updates/moves cards
  - narrates intent briefly
- Kanban = *instrumentation*, not user-managed state

---

# V0 — Concept Lock / Interaction Proof

## Question V0 must answer
> Does “chat → agent plan → live kanban” feel obvious, useful, and non-confusing?

No correctness. No real AI decisions. Pure UX validation.

## What exists
- Static web app
- Fake agent
- Fake task execution
- Deterministic, scripted behavior

## What does NOT exist
- No LLM
- No backend
- No persistence
- No filesystem
- No tools

---

## UI (V0)
Single-page app with 3 panes:

### 1. Chat Pane (left)
- Text input
- Message list
- User messages echoed
- Agent messages pre-scripted

### 2. Kanban Pane (center)
Columns:
- Planned
- Executing
- Verifying
- Done

Cards appear/move automatically based on timers.

### 3. Evidence Pane (right)
- Placeholder tabs:
  - “Diff”
  - “Logs”
  - “Tests”
- Static lorem / fake content

---

## V0 Interaction Script (hardcoded)
Example flow:
1. User types:  
   > “Create a todo list app”
2. Agent responds (hardcoded):
   - short plan summary
3. Kanban auto-populates:
   - Scaffold app
   - Build UI
   - Add state
   - Add styling
4. Cards move across columns every N seconds
5. Fake diffs/logs appear as cards move

---

## V0 Acceptance Criteria
- User understands:
  - agent owns the board
  - board reflects progress
- No user confusion about “what do I click?”
- Board feels helpful, not redundant

If this *feels wrong*, stop.

---

# V1 — Structured Agent + Fake Tools

## Question V1 must answer
> Can an LLM reliably produce and manage a task plan *as structured state*, not prose?

This is about **planning discipline**, not execution.

---

## What exists (V1)
- Real LLM
- Real chat
- Agent produces **structured JSON**
- Kanban derived from agent state
- State persisted in memory (or localStorage)

## What does NOT exist
- No filesystem writes
- No command execution
- No runner
- No git

---

## Core Concept Shift (important)
The agent does **not** “talk then code”.

It does:
1. Parse intent
2. Emit a **Plan object**
3. Mutate that plan over time
4. UI renders the plan

---

## Required Agent Output Schemas

### Plan
```json
{
  "planId": "uuid",
  "goal": "string",
  "tasks": [Task]
}
````

### Task

```json
{
  "taskId": "uuid",
  "title": "string",
  "status": "PLANNED | EXECUTING | VERIFYING | DONE | BLOCKED",
  "steps": [string],
  "notes": "string"
}
```

### Agent Actions

Agent must emit **actions**, not instructions:

```json
{
  "action": "CREATE_TASKS",
  "tasks": [...]
}
```

```json
{
  "action": "UPDATE_TASK",
  "taskId": "...",
  "status": "EXECUTING",
  "notes": "Starting UI scaffolding"
}
```

---

## Fake Tool Layer (V1)

Simulated tools return canned responses:

* `analyze_repo()` → fake file tree
* `apply_patch()` → fake diff
* `run_tests()` → pass/fail toggle

Agent believes tools are real.

---

## V1 UX Flow

1. User types natural language request
2. Agent responds with:

   * brief explanation
   * **structured plan**
3. Kanban renders tasks
4. Agent “executes” tasks:

   * updates task status
   * emits fake diffs/logs
5. Tasks complete or block deterministically

---

## Constraints (important)

* Kanban state **cannot** be edited by user
* User may only:

  * chat
  * say “continue”, “stop”, “try again”
* Agent may not:

  * skip statuses
  * mark DONE without passing VERIFYING

---

## V1 Acceptance Criteria

* Agent consistently outputs valid JSON
* Tasks feel reasonable for varied prompts
* Kanban always matches agent state
* No reliance on conversational memory for state

If the model can’t do this, stop and fix prompts/schemas.

---

## Explicit Non-Goals (V0/V1)

* Revert
* History
* Branches
* Accuracy of code
* Real execution

Those come later.

---

## Definition of Success for V0/V1

A user can:

* type a single prompt
* watch a board appear
* understand what the agent *plans* to do
* trust that progress is structured, not vibes

Only then is it worth touching the filesystem.

```
```
