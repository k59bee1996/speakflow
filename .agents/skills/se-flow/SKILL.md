---
name: se-flow
description: Take a GitHub Issue or local engineering request from intake through implementation, verification, review, and delivery in the current repository. Use for end-to-end engineering tasks; plan mode stops before edits.
---

# Speakflow Engineering Flow

Use this skill to carry an engineering request to a reviewable result in the current local repository. Do not use it to implement a real ticket when the user only asks to install or edit this skill.

## Invocation

`$se-flow <issue-number-or-task> [mode=full|plan] [delivery=local|pr]`

- Defaults: `mode=full`, `delivery=local`.
- `plan` reports scope, open questions, risks, and verification steps, then stops before file edits.
- `local` leaves the work in the tree. `pr` requests a focused commit and pull request, subject to available tools and repository access.
- Work on the current checkout. Never overwrite unrelated changes or assume a clean tree.

## Phase 0 — Acquire Repository Lock

Before Phase 1, acquire the filesystem lock for both `mode=plan` and `mode=full`. Do not run Git commands, inspect repository contents, or fetch the issue until acquisition succeeds. The utility's bootstrap lookup of `.git` and worktree `commondir` metadata is the only repository access before acquisition.

From the repository workspace, run:

```text
node .agents/skills/se-flow/scripts/repo-lock.mjs acquire --ticket "<issue-number-or-task>"
```

The utility uses only built-in Node.js APIs and locates the canonical Git common directory, so linked worktrees share `<common-dir>/se-flow.lock`. Atomic directory creation chooses one owner. It records the ticket, workspace root, session ID, acquisition time, active state, and a hash of its unique ownership token. Keep the returned token in this Codex session only; do not write it into the repository or expose it in reports. Runtime lock data lives under Git metadata and must never be committed.

- If acquisition reports `BLOCKED`, show the active ticket, owner session ID, acquisition time, and workspace. Stop immediately: do not fetch, pull, checkout, create branches, analyze repository files, edit, test, commit, or push. Never wait, retry, steal, or overwrite the lock.
- If Node.js, Git metadata, or the common directory cannot be resolved or written, fail closed and stop.
- Verify ownership with the returned token before every phase and immediately before every operation that can change Git state or repository files. Do not rely on a previous verification. If verification fails, stop immediately and report it.
- The CLI process ending does not release the lock. Preserve it throughout the session; release only in Finally with the same token.

Lock commands (run from a workspace in the same repository):

```text
node .agents/skills/se-flow/scripts/repo-lock.mjs verify --token "<ownership-token>"
node .agents/skills/se-flow/scripts/repo-lock.mjs inspect
node .agents/skills/se-flow/scripts/repo-lock.mjs release --token "<ownership-token>"
```

### Phase 1 — Intake

- Verify lock ownership. For an issue number, identify the repository from the current checkout and read the issue using an available GitHub integration. Read comments or project metadata only when relevant and supported. For a local task, use the supplied description and artifacts.
- Extract confirmed requirements, acceptance criteria, dependencies, constraints, and unresolved questions. Label assumptions; never invent requirements. Use the repository's PO/BA role prompt when product clarification or backlog context warrants it.
- Ask a focused question only when ambiguity materially blocks a safe implementation; continue independent discovery meanwhile. If waiting for an answer suspends work, release through Finally before ending the session.

### Phase 2 — Repository Context

Verify lock ownership before this phase and immediately before every fetch, pull, or other Git-state change. The Remote Synchronization & Freshness Gate is mandatory and must pass before deep repository analysis.

#### Step 2.1 — Git Safety Check

- Read the root and applicable area Git/branch instructions needed to operate safely. Check the current branch, `git status`, tracking branch, configured remotes, uncommitted changes, and local/upstream divergence.
- Preserve all existing work. Never discard, overwrite, or automatically stash changes. Record the starting status so later changes can be distinguished from pre-existing work.

#### Step 2.2 — Fetch Latest Remote State

- Fetch the appropriate configured remote before inspecting source code or other deep repository context. Use the current branch's remote when appropriate; otherwise identify the repository's authoritative remote from repository conventions and available metadata. If remote choice is ambiguous or no remote is configured, report the blocker.
- Identify the authoritative default/base branch from remote metadata (such as the remote's symbolic HEAD or repository metadata), repository conventions, and task context. Never assume the branch is named `main`.
- Record whether fetch succeeded, the fetched remote-tracking base ref, and its commit SHA. A successful fetch alone does not mean the working branch is synchronized.

#### Step 2.3 — Synchronize Local Code

- In `mode=full`, use `git pull --ff-only` only when the clean current branch safely tracks the intended upstream and fast-forwarding is appropriate. Verify lock ownership immediately before it.
- Never automatically merge, rebase, reset, force-pull, discard changes, or switch branches in a way that risks existing work. Do not merge or rebase the default branch into an existing feature branch automatically.
- In `mode=plan`, fetch is allowed, but do not change checked-out source files or switch branches. If the checkout is stale, inspect the fetched remote snapshot read-only when possible. If safe synchronization or a read-only snapshot is unavailable, stop and explain why.
- In `mode=full`, if synchronization would be unsafe (including a dirty tree or divergent branch), stop instead of trying another update strategy. In `mode=plan`, continue only by inspecting a verified fetched snapshot read-only; otherwise stop.
- Record synchronization separately from fetch (for example, fast-forwarded, already current, not performed in plan mode, or blocked).

#### Step 2.4 — Mandatory Freshness Gate

- Verify the local `HEAD` SHA, the latest authoritative remote base SHA, the current branch's tracking SHA when present, and ahead/behind or divergence status.
- Choose and record the exact analysis baseline commit: use local `HEAD` only when it is current with the intended base; in plan mode on a stale checkout, use the fetched remote commit as a read-only snapshot baseline. Confirm the analysis will use that commit, not stale working-tree files.
- After Repository Analysis, confirm the inspected commit still matches the recorded analysis baseline; report the actual commit used.
- Assign `PASS` only when the remote base was verified and the selected baseline is demonstrably current for the task. Assign `BLOCKED` if remote verification fails, the branch is stale/diverged and cannot be safely synchronized, or the latest snapshot cannot be inspected. Do not claim freshness because fetch succeeded or report `PASS` for an outdated baseline.
- Do not proceed to Repository Analysis unless the gate is `PASS`. Report blockers and stop when it is `BLOCKED`.

#### Step 2.5 — Repository Analysis

Only after the gate passes:

- Read all applicable `AGENTS.md` files and relevant authoritative architecture, design, product, and API documentation. List the areas touched. In this repository, read `frontend/AGENTS.md`, `backend/AGENTS.md`, or `content/lessons/README.md` when that area is in scope. If scope expands, read newly applicable rules before proceeding. State which rule files were read in the plan.
- Inspect implementation, tests, dependencies, architecture, and established quality commands against the verified analysis baseline. When using a fetched snapshot in plan mode, inspect that commit read-only rather than relying on stale checkout files.
- Resolve contradictory documentation by authority; report unresolved conflicts. Keep exploration scoped to the task.

#### Step 2.6 — Impact Analysis

- Identify affected modules and interfaces, dependencies, edge cases, and potential regressions. Carry these findings into Phase 3 — Technical Plan.

### Phase 3 — Technical Plan

- Verify lock ownership. State scope, non-goals, affected interfaces, risks, edge cases, security and regression impact, and concise implementation and verification steps.
- In `mode=plan`, report the plan and then go to Finally without edits. In `mode=full`, proceed when sufficiently clear and safe. Pause for destructive, high-risk, or materially ambiguous decisions.

### Phase 4 — Branch Preparation and Implementation

- Verify ownership before the phase and immediately before branch or file changes. Never create or switch branches in `mode=plan`. For issue work in `mode=full`, create a dedicated issue branch from the verified latest appropriate base commit as required by this repository. Before reusing an existing issue branch, check its tracking status and divergence from that base; do not automatically merge/rebase a stale branch. Preserve local changes and do not switch branches if doing so risks them.
- Make the smallest maintainable change that meets confirmed acceptance criteria. Reuse existing abstractions and relevant role guidance. Add or update focused tests where the project supports them. Avoid unrelated refactors, dependencies, and files.
- Do not create agents, hooks, or parallel work unless a relevant existing agent/tool makes it useful and coordination is clear. Never create infrastructure just to satisfy this workflow.

### Phase 5 — Verification

- Verify ownership before the phase and immediately before each check that may write generated files. Choose checks from the affected area's instructions and actual repository scripts. For the current frontend, available checks include `npm run lint`, `npm run lint:styles`, `npm run typecheck`, and `npm run build`; it has no test script. The backend rules require `dotnet build` and `dotnet test` when backend work is in scope. For lesson content, follow its README and inspect the actual validation/seed command before using it.
- Run checks relevant to the change and acceptance criteria. Report exact commands and outcomes; do not claim an unrun check passed. Fix regressions caused by the change and rerun affected checks. Distinguish known baseline failures from new failures.

### Phase 6 — Engineering Review

- Verify ownership before the phase and before any review fix. Inspect the complete diff and changed files for correctness, security, maintainability, performance, architectural fit, and regressions. Use an independent reviewer only when an appropriate agent is actually available and useful; do not invent one. Fix actionable findings and rerun affected checks. Report unresolved risks.

### Phase 7 — Delivery

- Verify ownership before the phase and immediately before commits or remote changes. Summarize the outcome, files changed, verification evidence, and remaining risks. Include current branch, local `HEAD` SHA, remote base SHA, fetch outcome, synchronization result, Freshness Gate status, and analysis baseline commit.
- For `delivery=local`, leave changes in the working tree; do not commit or push.
- For `delivery=pr`, prepare a focused Conventional Commit and PR that references `Closes #<number>` for an issue. Create/push branches or open a PR only when the requested delivery and available access authorize the action. Never force-push, merge, deploy, or delete remote resources automatically.
- Update GitHub Project fields only when authorized, the integration supports the operation, and the intended values are verified. Never mark an issue Done merely because implementation is complete.

### Finally — Release Repository Lock

After successful delivery, `mode=plan`, or a controlled cancellation, verify ownership and release with the matching token. Do not release a different session's lock or release after an individual command ends. If the session crashes, leave metadata intact for recovery. If ownership verification fails, stop; do not try to remove the lock.

#### Abandoned lock recovery

Inspect first. A lock has no automatic expiry and must never be stolen based on age. Confirm with the user that the recorded owner session is stopped before force-unlocking. The utility rechecks owner identity and requires an exact confirmation; it only removes its own `se-flow.lock` directory and never Git's `index.lock`, `HEAD.lock`, or other lock files.

```text
node .agents/skills/se-flow/scripts/repo-lock.mjs inspect
node .agents/skills/se-flow/scripts/repo-lock.mjs force-unlock --owner "<session-id>" --confirm "FORCE UNLOCK <session-id>"
```

If acquisition crashed before writing valid metadata, inspect the lock and confirm no owner is active, then use the separate explicit recovery path:

```text
node .agents/skills/se-flow/scripts/repo-lock.mjs force-unlock --incomplete yes --confirm "FORCE UNLOCK INCOMPLETE"
```

Never run either force-unlock command without explicit user confirmation. If the utility detects unexpected files or changed metadata, stop and leave the lock for manual inspection.

## Repository notes

- Existing product analysis guidance: `.github/agents/principal-po-ba.agent.md`. Consult or invoke it when supported and useful; it requires read-only issue/project analysis unless changes are explicitly approved and communicates in Vietnamese.
- No dedicated software engineer, QA, or reviewer role prompt was found at skill creation. Discover role prompts again for the current task; their availability may change.
- The GitHub integration available at skill creation supports issue reading/search and PR operations, but exposes no Project/Sprint field reader. Check current capabilities when needed; do not fabricate unavailable data or actions.
- The root `AGENTS.md` requires short Conventional Commit subjects, focused PRs with summary, issue link and validation, screenshots for UI changes, and notes for migrations or environment changes.
