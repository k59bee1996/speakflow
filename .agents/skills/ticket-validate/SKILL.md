---
name: ticket-validate
description: Run scoped validation and report raw results with an exact terminal sentinel.
---

# Ticket Validate

Read the canonical `.agents/skills/ticket/SKILL.md` for selection, mode gates, repository setup/resume, retry limits, handoff format and safety. Do not independently fetch or rebranch.

Inputs: `.work/<KEY>/02-implementation.md`, authorized plan, full current tracked/untracked diff, context identities and repository validation instructions. Verify repo/base SHA/branch/worktree and that the evidence covers the current diff.

Run relevant required checks using existing repository scripts and area rules, including setup/fixtures necessary for meaningful results. Record each exact command, exit code, raw passed/failed/skipped counts, setup/fixture result, zero-tests status and environment limitations. Preserve raw failures rather than reporting only a runner's summary. Distinguish pre-existing failures from regressions, but neither makes a required failing check pass.

Output: `.work/<KEY>/03-validation.md`. A setup/fixture failure, missing evidence, skipped required check or zero tests where tests are expected yields FAIL, even if a runner exits zero. If the repository has no relevant test suite, record that fact and the applicable non-test checks; do not invent tests or report zero expected tests as a successful test run.

PASS requires every required applicable check to succeed on the current change and enough evidence to support acceptance criteria. End the artifact with exactly `VALIDATION: PASS` or `VALIDATION: FAIL` as its final line, with no trailing commentary. Do not convert skips/setup failures to passes.

Do not edit product code in validation. Route actionable failures back through implementation, honoring the canonical mode and maximum three auto Implement/Validate attempts. Stop immediately on setup/external blockers. After fixes, rerun affected checks and replace stale validation evidence; never reuse a pre-fix PASS. Return the canonical handoff.
