
High-impact UX improvements (tight + dev-centric):

**Chat**

* Resizable / dockable chat (drag to expand, fullscreen toggle).
* Markdown-first rendering (code blocks, tables, bold/italics, emojis).
* Terminal mode toggle: monospace, prompt (`>`, `$`), streaming tokens, minimal bubbles.
* Message grouping: user → agent plan → execution → result (collapsible).
* Inline “quote/select → ask agent” like IDEs.

**Kanban**

* Cards as *execution units*, not mandatory: agent decides when to spawn.
* Card diff preview + partial revert (step-level undo).
* Timeline view (linear log) as alternative to columns.

**Execution / Evidence**

* Live diff stream (like `git add -p`).
* “Dry run” / “Explain before apply” switch.
* Confidence & risk badges per action.

**Agent Control**

* Autonomy slider (Chat ↔ Suggest ↔ Execute).
* Explicit modes: *Explore*, *Plan*, *Hack*, *Refactor*, *Explain*.
* Memory panel with editable agent assumptions.

**New Screens / Features**

* **Session Timeline**: chronological, replayable run.
* **Workspace Map**: visual graph of touched files.
* **Prompt Inspector**: what the agent *thought it was asked*.
* **Compare Runs**: diff two agent executions.
* **CLI Companion**: mirror session in terminal (Codex-style).
* **Style/Themes**: ChatGPT-like, Claude-terminal, Pure-IDE.

**Big UX principle**

> Fewer forced abstractions. Everything collapsible. Agent intent always visible.

If you want, next step: I can sketch a **v2 layout** (panels + interactions) or write a **UX design spec** you can hand directly to the frontend agent.
