---
name: ticket-review
description: Review the complete ticket diff, fix scoped critical or major findings, and verify the fixes.
---

# Ticket Review

Read the canonical `.agents/skills/ticket/SKILL.md` for selection, mode gates, repository setup/resume, handoff format and safety. Do not independently fetch, rebranch, commit, push or open PRs.

Inputs: authorized plan, `.work/<KEY>/02-implementation.md`, `.work/<KEY>/03-validation.md`, context repo/base SHA/branch/worktree, full current diff including staged, unstaged and untracked ticket files, and applicable repository rules. Inspect the entire change against acceptance criteria and authorized scope, independently of implementation claims.

Output: `.work/<KEY>/04-review.md`. Record scope and identities, correctness/security/secrets/regression/performance/maintainability/architecture assessment, findings with exact `[CRITICAL]`, `[MAJOR]` or `[MINOR]` tags and file/line evidence, each fix, current validation status, explicit verdict and unresolved issues. If no findings, say so with the inspected scope; never invent findings.

Fix every CRITICAL/MAJOR finding within authorized scope and trivial in-scope MINOR findings. If a blocking fix needs new product/architecture decisions, dependencies or expanded scope, stop and return the evidence for plan revision. Report remaining nonblocking MINOR recommendations.

After each fix batch, rerun affected validation through `ticket-validate`, update implementation and validation artifacts, and inspect the resulting full diff again. Require current evidence and the exact final line `VALIDATION: PASS` before claiming validation passes. A pre-fix PASS is stale.

Exit criteria: full tracked/untracked diff inspected, findings evidenced, fixes verified, current validation recorded and verdict explicit. Do not approve with unresolved CRITICAL/MAJOR findings, failed validation or unavailable required artifacts. Return the canonical handoff.
