---
name: ticket-implement
description: Implement only an approved ticket plan and record concrete changes.
---

# Ticket Implement

Read the canonical `.agents/skills/ticket/SKILL.md` for selection, mode gates, repository setup/resume, handoff format and safety. Do not independently fetch, rebranch or cross PR gates.

Inputs: authorized `.work/<KEY>/01-plan.md`, `.work/<KEY>/00-context.md`, applicable repository instructions and recorded repo/base SHA/branch/worktree. Confirm plan approval where required by the mode and verify the checkout is safely on the recorded existing ticket branch before editing. If absent or unsafe, stop and report what is needed.

Implement only the plan and acceptance criteria. Read area rules before editing. Use existing dependencies, commands and conventions. Stop for product/architecture decisions, expanded scope or dependencies outside the authorized plan. Preserve unrelated changes; never stash, discard, force-switch, commit to default/release branches or expose secrets. Do not commit, push or open PRs in this stage.

Output: `.work/<KEY>/02-implementation.md` with files changed, concise implementation details, acceptance-criteria mapping, deviations, exact commands/results, known issues, repo/base SHA/branch/worktree and required follow-up. Track implementation/validation retry attempts when applicable. Do not claim validation or review complete.

Exit criteria: authorized changes represented by the artifact and full tracked/untracked diff, deviations disclosed and no unsupported claims. If blocked, stop without a completion claim. Return the canonical handoff.
