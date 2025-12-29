
Here’s what this Claude Code talk implies for **what VIBE needs** (especially tool access + architecture), distilled into a “requirements-style” summary you can hand to your terminal agent.

## The core architecture (what changed)

* The “breakthrough” isn’t fancy orchestration—it’s **better models + a simpler agent loop**.
* Modern coding agents are basically: **one master while-loop**:

  1. model proposes tool calls
  2. system runs them
  3. results go back to the model
  4. repeat until no more tool calls → respond to user / ask next step
* Strong warning from speaker: **don’t build huge DAGs / branching prompt graphs** to “prevent hallucinations.” Prefer *simple loop + good tools + light prompting*.

## The “constitution” file (repo instructions)

* Claude Code uses a markdown “constitution” (e.g., `CLAUDE.md` / `AGENTS.md`) as the **primary repo-specific instruction + norms**.
* Key philosophy: don’t auto-RAG the whole repo; **just have an editable instruction file** the user/agent can maintain.

**VIBE implication:** you want a first-class “Agent Instructions” doc in-repo that the agent always reads early (and can update).

## The tool suite the speaker says matters (and why)

These are framed as “human terminal behaviors” rather than exotic AI tools.

### 1) Read (file read with limits)

* Not just `cat`: it exists because **token limits** and big files.
* Typically supports reading **ranges / truncation / summaries**.

**VIBE needs:** structured file read (with chunking + “file too big” handling).

### 2) Grep + Glob (search codebase without embeddings)

* Speaker is explicitly pro-**grep/glob** for general agents (vs. always doing vector DB/RAG).
* Because it matches how humans navigate repos.

**VIBE needs:** repo search primitives: `grep`, `ripgrep`, `glob`, “find usages”, etc.

### 3) Edit via diffs (not rewrite whole files)

* Major point: editing should be **diff/patch-based**, not “rewrite entire file”.
* Benefits: fewer mistakes, less context, faster, easier to review.

**VIBE needs:** apply unified diffs/patches; ideally also “surgical edit” (replace range / insert block).

### 4) Bash (the “universal adapter”)

* He basically says: **you could delete other tools and keep only bash**.
* Why it’s powerful:

  * can run tests, formatters, git, install deps, run scripts, create temporary scripts, etc.
  * huge amount of training data → models are good at it.
* He loves the pattern: agent writes a temp script → runs it → deletes it.

**VIBE needs (big one):** real shell access (ideally sandboxed), with capture of stdout/stderr, exit codes, and timeouts.

### 5) Web search + fetch (often on cheaper model / sub-agent)

* These are separated because:

  * might be cheaper/faster model
  * it’s an injection/security risk
  * results can be summarized before entering main context

**VIBE needs:** optional web tools with strict permissioning + “summarize before injecting”.

### 6) To-do list tool (lightweight steering)

* To-dos are **structured but not hard-enforced**—it’s mostly prompt-following.
* Benefits:

  * forces planning
  * lets you resume after crashes
  * better UX (progress visibility)
  * better steerability (“do task 3 next”)

**VIBE needs:** a todo/task list object the agent updates (and UI shows), but don’t over-engineer enforcement.

### 7) Tasks / sub-agents (context isolation)

* “Tasks” are sub-agents with their **own context**, returning only results back.
* Example sub-agents: researcher, docs reader, test runner, code reviewer.
* Key purpose: **don’t pollute the main context** (context bloat makes the agent “dumber”).

**VIBE needs:** ability to spawn sub-runs with separate context + return a concise result payload.

## Context management mechanisms discussed

* “Context compressor”: when nearing limit, **summarize + drop middle**, keep head/tail.
* The speaker also likes storing long-term artifacts as **files in a sandbox** (“save markdown files”), so the agent can re-open later rather than keeping it in chat context.
* AMP’s alternative: “handoff” = **start a fresh thread** with a curated state payload (faster than “compact”).

**VIBE needs:**

* explicit “compact/summarize state” action
* and/or “handoff/new session with state” concept
* plus strong support for “write memory to files”.

## Sandboxing + permissions (boring but necessary)

* Biggest real complexity is **permission gating**, especially for:

  * bash commands
  * web fetch/search (prompt injection risk)
* Claude Code reportedly gates bash based on command prefixes / categories; web calls may be run in constrained sub-agent.

**VIBE needs:** permission layer for:

* shell commands (with allow/deny + ask-user)
* network access
* filesystem scope (repo-only vs broader)

## System prompt / behavioral nudges (what they bake in)

From leaked/observed Claude Code prompt behavior:

* be concise (don’t narrate “here’s what I’ll do” too much)
* **use tools instead of explaining**
* read-before-edit
* match existing code style; avoid adding comments unnecessarily
* run commands in parallel when safe
* maintain to-dos

**VIBE needs:** you can implement most of this as:

* repo constitution + short system prompt + tool descriptions.

## “Skills” (extendable prompt bundles)

* “Skills” = modular prompt packs for special workflows (docs updates, design style guide, deep research, Office editing, etc.).
* Caveat: skills often require **manual invocation**; auto-selection isn’t reliable yet.

**VIBE needs:** a “skill library” that can be explicitly invoked, not relied on automatically.

## Eval philosophy (how to test agents)

* Benchmarks aren’t that helpful; evals should be:

  * end-to-end integration runs (“does it fix the issue?”)
  * point-in-time tool-choice tests (“given this state, does it call tool X?”)
  * backtests on historical runs
* “Agent smell” metrics:

  * number of tool calls
  * retries
  * runtime
  * how often it gets stuck

**VIBE needs:** basic telemetry + replay harness (even minimal).

---

# What you should ask your Terminal Agent (implementation feasibility checklist)

If you want a super actionable prompt for your terminal agent, ask them to audit whether VIBE currently has:

1. **Shell tool**: can agent run bash/ps commands? capture stdout/stderr/exit code? timeouts? sandbox?
2. **File tools**: read with chunking + size limits; write; apply unified diff patches
3. **Repo search**: glob + grep/ripgrep primitives
4. **Task system**: sub-agent runs with isolated context + return summaries
5. **To-do object**: persisted plan with statuses + surfaced in UI
6. **Permissions**: per-tool gating (shell/web/fs) + “ask user to approve” flow
7. **Context controls**: compact/summarize state; write memory to repo files; “handoff/new thread” option
8. **Telemetry/evals**: tool-call logs + basic “agent smell” counters

