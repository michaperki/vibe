# ViBE UI/UX Polish — 2025-12-28

Goals
- Improve state clarity and control around revert/reapply flows
- Reduce user doubt during background activity
- Make diffs easier to navigate per-file

Shipped in this checkpoint
- Header Git tag (tiny): shows Git Off / Repo / On (branch)
- Processing feedback with elapsed time: Thinking / Applying patch / Running tests
- Diff modal per-file selector + keyboard navigation (arrow keys)
- Card-level Revert → marks card REVERTED; Reapply → returns to DONE
- File-level revert/reapply from the diff modal
- Pre-revert/reapply checks: warn if current files diverged vs snapshot
- Server support for partial and directional revert (/api/revert with direction + paths; /api/revert/check)

Open items / next steps
- Highlight selected card persistently (done); add toast notifications for common states (pending tasks, waiting for actions)
- Confirm dialog for full-card reverts lists diverged files (done); consider similar flow for file-level writes outside snapshots
- Card pills & badges: small “Reverted” pill near title (done); refine styling and add “Changed” pill when later cards touch same files
- Optional: hunk-level revert (requires structured patch storage)
- Optional: git cherry-pick for Reapply Card when integration is on; fallback to snapshots for granular cases

