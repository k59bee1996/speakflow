---
name: ticket
description: Orchestrate a cross-agent software ticket from intake through review and a gated PR, using portable stage artifacts.
---

# Ticket workflow

Canonical workflow for Codex, Claude Code and GitHub Copilot. Follow root `AGENTS.md`, `CLAUDE.md` when present, and every applicable area rule. Artifacts are durable handoffs, not a replacement for stage skills, CLI operations or host capabilities. Installing or editing this skill does not run a ticket.

## Invocation and selection

Accept `<KEY> ["extra expectations"] [doc links] [--mode=manual|hybrid|auto] [--skip=<stage,...>] [--from=<stage>]`. Preserve expectations and links in context. Reject unknown stages/options or unsafe keys (absolute paths, separators, `.` or `..`); do not silently reinterpret them. Resolve GitHub tickets with `gh` CLI, or GitHub MCP only when exposed; do not assume Jira/Linear support. Read supplied docs, reporting inaccessible sources.

Stages: Intake -> Plan -> Implement -> Validate -> Review -> PR -> Retro. Teardown is a separate `--from=teardown` invocation after merge. Default start is Intake. Artifacts live at `.work/<KEY>/` and are ignored by Git:
`00-context.md`, `01-plan.md`, `02-implementation.md`, `03-validation.md`, `04-review.md`, `05-pr.md`.

- If mode is omitted, ask which mode; use manual only if the host cannot obtain an answer, and disclose it.
- Each stage has one Run / Skip / Stop decision, collected at the mode's gate. `--skip` pre-answers the named stage with Skip; do not ask again. Skip creates no artifact and must be reported as `Skipped — <reason>`. Preserve any historical artifact but do not treat it as output of the skipped run.
- `--from=<stage>` resumes from existing artifacts, marking earlier stages as not rerun. Read and verify prerequisite artifacts; ask for missing essential inputs or proceed only with available evidence and a stated limitation. Never fabricate missing artifacts or stage completion.
- Stop ends the pipeline without later stage actions. A skipped prerequisite does not authorize guessing its output.

## Modes and gates

- **Manual:** Ask one Run / Skip / Stop question before every stage. After each, display the handoff below and wait for approval to continue.
- **Hybrid:** Ask before Plan and hard-stop for plan approval. At that approval gate collect the combined Run/Skip selections for Implement and Validate (a Stop ends work), then chain selected stages. Hard-stop before Review and before PR. Intake and remaining stage choices still receive Run / Skip / Stop decisions; do not insert extra gates inside the selected Implement/Validate chain.
- **Auto:** Collect all stage Run/Skip selections once up front; Stop cancels. Chain selected stages up to PR. Loop Implement -> Validate at most three times until the validation artifact's exact final line is `VALIDATION: PASS`. Record each attempt. Stop on an external/setup blocker or when three attempts fail; do not claim an unrun/skipped Validate passed.
- **Every mode:** Hard-stop before PR for a concrete proposal and a separate fresh user `yes`. Stage selection, plan approval, auto mode and prior approvals are not this approval. No push, PR creation, comment, shared database write or other external side effect without fresh explicit approval for its exact batch.

Before each stage, ask exactly one Run / Skip / Stop here question. Include the stage number/name, a one-line summary of its action, and the artifact path it will write (or `none` for Retro/Teardown). Use `AskUserQuestion` when the host exposes it; otherwise present that same single question in chat and wait. In Auto, collect the stage choices together up front, with each stage's summary and artifact path shown. In Hybrid, show both Implement and Validate summaries/artifacts at their combined choice gate. A `--skip` pre-answer suppresses that stage's question. Never infer approval from silence.

## Host and stage execution

- Codex: `$ticket KEY` or skill discovery. Claude Code: `/ticket KEY` through the adapter. Copilot: its skill UI or natural-language invocation when supported; do not claim universal slash-command support.
- Plan, Implement, Validate and Review must follow their respective `.agents/skills/ticket-<stage>/SKILL.md`. Pass artifact paths, repo/worktree identities, scope and applicable instructions.
- Delegate stages when the host supports delegation; otherwise disclose the limitation and perform inline within the same authorization and stage contract. Do not invent a controller, agent, tool, MCP integration or result.

### Stage model routing

Use these defaults for stage workers. Model and effort are separate choices; writing them in a skill does not change the parent session's model.

| Stage | Codex model / reasoning effort | Claude Code model / effort | Worker scope |
|---|---|---|---|
| Intake | `gpt-6-luna` / `low` | `haiku` / `low` | Extract ticket and linked-document requirements for the context draft. |
| Plan | `gpt-6.1-sol` / `high` | `opus` / `high` | Produce the repository-grounded plan. |
| Implement | `gpt-6-luna` / `medium` | `sonnet` / `medium` | Implement the authorized plan. |
| Validate | `gpt-6-luna` / `low` | `haiku` / `low` | Run scoped checks and record raw evidence. |
| Review | `gpt-6.1-sol` / `high` | `opus` / `high` | Independently inspect the full diff and handle scoped findings. |
| PR | `gpt-6-luna` / `low` | `haiku` / `low` | Draft the proposal, commit message and PR text. |
| Retro | `gpt-6-luna` / `low` | `haiku` / `low` | Analyze the run and propose exact durable rules. |
| Teardown | `gpt-6.1-sol` / `medium` | `sonnet` / `medium` | Analyze merge, content and unpublished-work evidence. |

- Codex: pass the table's `model` and `reasoning_effort` as actual subagent invocation arguments, with `fork_turns="none"` when an override requires it. Supply the worker's task, relevant rules, artifact paths, repository identities and current gate authorization explicitly; an isolated worker does not inherit the conversation. Claude Code: pass the table's model alias and effort on each Agent invocation, or set both in a stage-specific subagent definition when invocation parameters are unavailable. Do not rely on prompt wording or skill frontmatter alone to select a model.
- Copilot: use the same capability tiers (light for Intake/Validate/PR/Retro, strong for Plan/Review, balanced for Implement/Teardown). Set the model on a custom agent only after confirming its exact ID is available in the active Copilot host. If the host cannot route a stage to that model, disclose the actual model or inherited default; do not claim the tier was enforced.
- The parent owns stage selection, approval gates, repository setup, artifact acceptance, commits, pushes, PR creation and teardown mutations. For Intake, PR, Retro and Teardown, delegate only the worker scope in the table, then independently verify its evidence and perform authorized parent actions. For Plan, Implement, Validate and Review, delegate the stage contract. Review's validation rerun uses the Validate model when delegated.
- If a configured model or effort is unavailable, use the nearest available model that can meet the stage contract and record the substitution in the handoff. For a mechanical implementation, `gpt-6-luna` may use `low` effort; raise effort or model only when scope or observed failures justify it, and record the reason. If no delegation is available, run inline and report that the requested stage model was not independently selected.

## Repository setup and safe resume

Before source analysis, list the touched repos and areas; read root and area rules before planning/editing, and list the rules read in the plan. Keep changes in ticket scope, use no new dependencies, never commit secrets, check the full diff for secrets, and preserve unrelated work. Never stash, discard, force-switch, force-push, amend pushed commits, or commit to default/release branches.

**New intake only:**

1. Resolve each repo and authoritative remote/default branch from repository metadata; do not assume `main` or `origin` when configured differently. Record actual names.
2. Before creation, check `.work/<KEY>/`, matching local/remote branches, `git worktree list --porcelain`, and existing ticket PRs (including open and merged) for duplicates. Reuse verified ticket work through resume, or stop to resolve conflicting identities; never create a second branch/worktree/PR blindly.
3. Fetch the authoritative remote; stop if it fails. Record command, fetched base ref and exact SHA. If the primary checkout is clean, on its default branch and has no unpushed/divergent work, fast-forward it with `git pull --ff-only`, verify it matches the fetched base, then create `feature/<KEY>-<slug>` from that exact base.
4. If dirty, on another branch, or containing unpushed work, leave that checkout intact. Create the ticket branch from the fetched remote default in `<worktrees-dir>/wt-<KEY>-<repo>`, using an established worktrees directory or a recorded safe chosen path. Never overwrite an existing directory/branch. Record all checkout paths.

**Resume (`--from`, including teardown):** Read `00-context.md` and verify repo identity, base commits, branch names and checkout/worktree paths. Do not refetch or rebranch during ordinary resume. Require each working repo on its recorded ticket branch; switch to that existing branch only if clean and safe, otherwise stop. Never create a fresh-base worktree as a substitute for the ticket's existing changes. Teardown alone performs its explicitly required fetch/default synchronization below. Check current diff and artifact provenance; stale evidence must be rerun, never silently reused.

## Stage contracts

### Intake -> `00-context.md`

Read the ticket, expectations and accessible linked docs. Capture goals, acceptance criteria, source links, repos, constraints, open questions, selected mode/stages and setup evidence. No implementation. Include these exact headings:

```markdown
## Base commits
| Repository | Remote/default ref | Base SHA | Fetch/sync evidence |
|---|---|---|---|

## Branches
| Repository | Ticket branch | Checkout/worktree path | Primary checkout |
|---|---|---|---|
```

Use exact SHAs and paths per repo. Record primary checkout starting branch/status and duplicate-check results. Do not invent unavailable issue/doc information.

### Plan -> `01-plan.md`

Follow `ticket-plan`. Map acceptance criteria to steps, affected files, decisions, risks, verification and exclusions. State rules read and repo/base/branch/path identities. No product edits. Manual/hybrid require plan approval before implementation; auto's upfront selection authorizes only the bounded plan within confirmed requirements.

### Implement -> `02-implementation.md`

Follow `ticket-implement` using the approved/authorized plan and recorded ticket branch. Record files, decisions, deviations, commands/results and unresolved issues. Stop for scope or architecture changes requiring new decisions. No validation/review completion claim.

### Validate -> `03-validation.md`

Follow `ticket-validate`. Record exact commands/exit codes, raw pass/fail/skip counts, setup/fixture state and whether zero tests ran. Setup failures, zero tests where tests are expected, skipped required checks and missing evidence fail validation. Repositories without a relevant test suite must disclose that fact and run their applicable non-test checks. The exact final line is `VALIDATION: PASS` only when every required check succeeds; otherwise `VALIDATION: FAIL`.

### Review -> `04-review.md`

Follow `ticket-review`. Inspect tracked and untracked ticket files and the entire diff against plan/acceptance criteria. Tag findings `[CRITICAL]`, `[MAJOR]` or `[MINOR]` with file/line evidence. Fix all in-scope CRITICAL/MAJOR findings and trivial in-scope MINOR findings. Rerun affected validation after every fix batch, update evidence, and re-review changed code. Stop for out-of-scope blocking findings; do not approve with unresolved CRITICAL/MAJOR issues.

### PR -> `05-pr.md`

Require current passing validation and a completed review for the exact proposed diff. Check duplicates again. Prepare a reviewable proposal before any commit/push/PR action:

- Exact repository, base branch, ticket branch and HEAD; exact files to stage and diff summary per repo.
- Exact Conventional Commit message(s) and intended commit content; show already-existing commits when applicable.
- Exact PR title and body, including `Closes #<number>` for GitHub issues, summary, validation, UI screenshots when applicable, and migrations/environment changes.
- Exact push targets and all external actions; show cross-links between related repo PRs and ticket links. If new URLs are not yet available, show placeholders and the exact approved follow-up body edits that will fill them.

Show the proposal, hard-stop, then ask separately for a fresh user `yes` to that exact batch. If rejected, unavailable or unanswered, stop with a proposal only and do not report PR completed. Any changed batch needs new approval.

After yes, recheck status/diff/branch/HEAD and approval scope, stage only explicit reviewed paths (`git add -- <path> ...`), inspect the staged diff, and commit/push/create only approved actions. Never use `git add -A`, `git add .`, blanket pathspecs or unrelated files. Never force-push. Record actual commit SHAs, PR numbers/URLs, base/head, cross-links and open/merged state in `05-pr.md`. Report partial failures honestly; do not duplicate a successful action when retrying.

### Retro

Inspect the whole run. For every agent error, user correction or newly learned convention, propose exact durable rule text and destination (repo `CLAUDE.md` or the relevant skill). Write rules only after user `yes`; do not modify shared instructions as an automatic retrospective action.

For each repo whose primary checkout was used, check `git status --porcelain`: only when empty, safely `git switch <default>`; otherwise stop and report the dirty checkout. Keep ticket worktrees. Print the final table with open PRs `open — awaiting review` and Teardown `pending merge`. No numbered Retro artifact.

### Teardown

Only via `--from=teardown`; load context and PR artifacts first.

1. For every related PR, run `gh pr view <n> --json state,mergedAt` in its repo (or an exposed integration providing equivalent fields). If any is unmerged or unknown, remove nothing and report the blockers.
2. Identify only this ticket's recorded branches/worktrees/artifacts. Require explicit approval for the exact cleanup batch. Keep worktrees with uncommitted or unpushed work and report them; do not force-remove.
3. Fetch and fast-forward each affected default checkout safely; stop if fetch/synchronization fails or would endanger local changes. Verify the intended changes are present by content in the fetched default, e.g. `git show <remote>/<default>:<path>` and a distinctive changed line. Check all material ticket changes; ancestry alone is insufficient for squash merges.
4. Inspect worktree status, commits, and branch relationships. Where squash merges leave commits unrecognized by upstream tracking, verify their actual content and ensure no additional unpublished work exists before eligibility; preserve ambiguous work.
5. Remove only approved eligible worktrees with ordinary `git worktree remove <exact-path>`; switch away safely first if needed. Delete only approved ticket branches after verifying merged content; never delete remote branches or artifacts implicitly. If squash merge requires force-delete of a local branch, disclose that exact action and obtain specific approval.
6. Verify every removed directory is gone and its registration absent from `git worktree list --porcelain`. Report removed/preserved paths and reasons. Fill all final table rows; no numbered Teardown artifact.

## Between-stage handoff

After every stage, use this exact shape with 3–6 key points and honest pipeline checkboxes. For a skipped/stopped stage use `### Artifact: —`, explain `Skipped — <reason>` or the blocker, and do not check it as complete.

```markdown
## Stage N: <name>
### Artifact: .work/<KEY>/NN-*.md
<3–6 key points>
Pipeline: [x] Intake [ ] Plan [ ] Implement [ ] Validate [ ] Review [ ] PR [ ] Retro [ ] Teardown
```

Number Intake 0 through Retro 6, Teardown 7. Retro/Teardown use `### Artifact: —`. Obtain only the mode-specific next approval; never silently cross a hard gate.

## Final summary

Use this exact table, filling every row with actual outcomes (including skip reasons, blockers and existing artifact paths). A skipped current stage has no new artifact. Do not claim completion without evidence.

| Stage | Artifact | Result |
|---|---|---|
| Intake | 00-context.md | repos, branches |
| Plan | 01-plan.md | n steps / skipped |
| Implement | 02-implementation.md | n files |
| Validate | 03-validation.md | PASS / FAIL |
| Review | 04-review.md | verdict |
| PR | 05-pr.md | urls — open / merged |
| Retro | — | n rules written |
| Teardown | — | n worktrees removed / pending merge |

Replace example results with facts; use `—` for missing artifacts and `Skipped — <reason>` or `Stopped — <reason>` as appropriate. Include the `.work/<KEY>/` directory, repo/branch/worktree paths, base SHAs, remaining risks/questions and next required approval.
