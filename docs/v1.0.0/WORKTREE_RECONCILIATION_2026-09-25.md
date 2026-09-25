# Worktree reconciliation · 2026-09-25

This note records code integration, not a Beta release approval. Installed-app
usability testing, clean-machine installation, signing and notarization remain
separate release gates in `BETA_1_EXECUTION_PLAN.md`.

| Worktree | Status on `main` | Boundary |
|---|---|---|
| `feat/refresh-storm-fix` | Already an ancestor of `main` | No further merge needed. |
| `feat/watcher-hardening` | Already an ancestor of `main` | No further merge needed. |
| `codex/ac28-uncertain-later` | Reconciled into current code and tests | “Still uncertain” keeps the candidate pending; both declaration write APIs reject `unknown`. |
| `codex/ac14-recalc-recovery` | Reconciled into current code and tests | Queued/failed recalculations retain the last successfully published result; a later explicit revoke still removes coverage. Recovery and retry UI already exist in the current workbench. |
| `overview-backend-wiring-2` | Not merged | Its committed overview implementation predates the current React/Authority integration. Its five uncommitted files concern a separate session-span change and must be reviewed and committed by their owner before any integration. |
| detached `bf14` worktree | Not merged | Contains unrelated uncommitted files; preserved unchanged. |

The current UI follow-up also fixes the usage host summary to use the dynamic
Authority source summary, makes Settings navigation/reload reflect the selected
section and full page, and stops a Skill host-selection change from implicitly
starting a scan. The release checklist remains open until the installed `.app`
passes a separate end-to-end usability run.
