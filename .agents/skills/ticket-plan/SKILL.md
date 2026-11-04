---
name: ticket-plan
description: Produce a repository-grounded, approval-ready plan for a ticket workflow.
---

# Ticket Plan

Read the canonical `.agents/skills/ticket/SKILL.md` for selection, mode gates, repository setup/resume, handoff format and safety. This stage does not independently fetch, create a branch or bypass approval.

Inputs: `.work/<KEY>/00-context.md`, supplied expectations/docs, root `AGENTS.md`/`CLAUDE.md`, applicable area rules and repository evidence. Read rules for every area the plan may touch and state the files read. If context is missing, disclose it and ask or plan only from available artifacts; never invent requirements. Verify the exact repo, recorded base SHA, ticket branch and checkout/worktree path.

Output: `.work/<KEY>/01-plan.md`. Map each acceptance criterion to numbered bounded implementation steps, affected files/areas and verification methods. Include decisions, constraints, dependencies, risks, open questions and explicit exclusions. Record identities from context, sources/evidence and instruction files read.

No product edits or new dependencies. Do not create a fresh branch/worktree on resume. Exit only with a plan that supports an approve/revise decision; stop if essential scope cannot be determined. Manual/hybrid require explicit plan approval; auto uses its upfront stage authorization within confirmed scope. Return the canonical handoff.
