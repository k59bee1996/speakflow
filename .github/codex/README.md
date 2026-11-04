# Codex PR reviews for Speakflow

This workflow runs `codex exec` directly using a ChatGPT-managed login on a trusted,
persistent self-hosted Linux runner. It does not use an OpenAI API key or
`openai/codex-action`.

Repository: `k59bee1996/speakflow`. Default branch: `main`.
This repository is public. Only trusted, same-repository, human-authored PRs may
execute on the persistent runner; fork and Bot-authored PRs remain excluded.

## 1. Prepare the runner

Register a trusted Linux runner for this repository with all these labels:

```text
self-hosted
Linux
codex-review
```

The workflow assumes the runner service account is `runner` and uses:

```text
CODEX_HOME=/home/runner/.codex-review
CODEX_LOCK=/home/runner/.codex-review/run.lock
```

If the service account or location differs, update both paths in
`.github/workflows/codex-code-review.yml` before enabling it.

Install Node.js/npm, Git, Bash, GitHub CLI (`gh`), `flock` from util-linux,
and `jq` for the setup check. Install an exact, tested Codex CLI version:

```bash
# Replace X.Y.Z with the version your team has approved.
npm i -g @openai/codex@X.Y.Z
codex --version
command -v gh flock git bash jq
node --version
codex exec --help # Must support --output-schema and --output-last-message.
```

Pin the Codex version and upgrade deliberately. Ensure these commands are on
the runner service's PATH, not only an interactive shell's PATH.

Use a dedicated runner account without stored GitHub credentials, exported
GH_TOKEN/GITHUB_TOKEN, OPENAI_API_KEY/CODEX_API_KEY, or unrelated provider
credentials. Do not use this account for other untrusted jobs.

Checkout deliberately uses `persist-credentials: false`. The later private
`git fetch` therefore needs a Git credential helper that uses the GH_TOKEN
provided only in the context-collection step. On the dedicated runner account,
configure GitHub CLI as the HTTPS credential helper without saving a token:

```bash
git config --global credential.https://github.com.helper '!gh auth git-credential'
```

Do not perform a persistent `gh auth login` for this runner account. The workflow
supplies the short-lived GitHub token to context collection and comment posting;
the Codex step receives neither.

## 2. Create ChatGPT-managed credentials

On a trusted machine with a browser, set this in the active Codex configuration
(normally `~/.codex/config.toml`):

```toml
cli_auth_credentials_store = "file"
```

Run:

```bash
codex login
```

Choose the ChatGPT account whose Codex allowance the reviewer should consume.
Confirm the credential type without printing tokens:

```bash
jq '{auth_mode, has_refresh_token: (.tokens.refresh_token != null)}' \
  ~/.codex/auth.json
```

Continue only when `auth_mode` is `"chatgpt"` and `has_refresh_token` is `true`.
If that machine uses a custom CODEX_HOME, inspect its auth.json instead.

## 3. Seed the runner once

As the runner service account, create the persistent directory:

```bash
export CODEX_HOME=/home/runner/.codex-review
install -d -m 700 "$CODEX_HOME"
```

Create `$CODEX_HOME/config.toml` with:

```toml
cli_auth_credentials_store = "file"
web_search = "disabled"
```

Keep the dedicated configuration free of MCP servers, plugins or hooks that
provide network access or execute repository-controlled commands. Do not mark
arbitrary PR checkouts as trusted or enable their project configuration.

Transfer the newly created auth.json over a secure channel to:

```text
/home/runner/.codex-review/auth.json
```

The directory and files must belong to the runner service account. Then run:

```bash
chmod 700 "$CODEX_HOME"
chmod 600 "$CODEX_HOME/auth.json" "$CODEX_HOME/config.toml"
```

Seed this file once. Codex refreshes and rotates it in place. Never restore the
original seed on later jobs, at service startup, or from a GitHub secret.

Use one auth.json for one runner. Do not copy that same credential file to a
second machine or continue using its seed copy concurrently. All Codex executions
using this credential, including manual maintenance, must acquire the same lock:

```bash
flock "$CODEX_HOME/run.lock" \
  codex exec --sandbox read-only --skip-git-repo-check "Reply with OK."
```

Repositories sharing this runner and credential must use this same CODEX_HOME
and lock path. GitHub concurrency groups alone do not serialize across repositories.

Never commit, print, log, cache or upload auth.json as an artifact.

## 4. Enable the workflow

Review and merge these three files into `main`:

- `.github/codex/review.md`
- `.github/workflows/codex-code-review.yml`
- `.github/codex/README.md`

Keep `AGENTS.md` committed. It already exists in this repository and is tracked.
The reviewer also reads the applicable frontend, backend and lesson rules.

The workflow reads review.md only from each PR's base branch and fails if that
trusted file is missing. Establish and inspect the rules on `main` before relying
on automated reviews. Other PR base branches need the rules file too.

The workflow supplies a JSON schema and a transport adapter, so the first upgrade
PR can still use the older Markdown-oriented rules already on `main`. This adapter
requires the scores those rules already define; it does not replace the base
branch's review criteria. Markers record the rules version actually loaded. Once
version 2 is merged, previous version-1 reviews trigger a full re-review.

In repository Settings → Secrets and variables → Actions → Variables, optionally set:

| Variable | Purpose |
| --- | --- |
| `CODEX_MODEL` | An exact model supported by the pinned CLI and the ChatGPT account |
| `CODEX_EFFORT` | A reasoning-effort value supported by that model and CLI |

Leave either unset to use Codex defaults. These variables apply to PR reviews;
the keepalive uses the CLI defaults.

No OpenAI API-key secret or recurring auth.json secret is required. GitHub supplies
the workflow token, with read access to contents and write access to PR comments
for the review job.

The repository's Actions policies must allow `actions/checkout@v4`, the selected
runner, and the workflow's PR-comment permission.

After merging, use Actions → Codex Code Review → Run workflow to check the
keepalive. Then open a non-draft, same-repository PR authored by a human to check
the review and comment path. Manual dispatch runs keepalive, not a PR review.

## 5. Operation and recovery

PR reviews run when a PR is opened, becomes ready for review, or its head is
updated (`synchronize`). After initial eligibility, commit updates are the review
trigger. Editing the title/body, adding or editing comments, and reopening a PR
without a head update do not start another review. Updated PR claims and comments
are read on the next triggered review. Scheduled/manual-dispatch keepalive runs
only refresh authentication; they do not review a PR.

The reviewer checks out the actual PR head SHA with full history, reads context
without running builds or tests, and produces structured JSON. The workflow
validates it, renders the Markdown comment with a score for each finding, and
posts the comment. Drafts, Bot-authored PRs and fork PRs are excluded from execution
on the persistent runner. Excluded reviews do not satisfy the merge gate; use a
trusted, human-authored same-repository PR when an automated review is required.

The read-only sandbox restricts reviewer shell access and network use. The Codex
client itself still needs outbound connectivity to OpenAI for inference and
authentication; context collection and posting need GitHub connectivity.
Built-in web search is disabled in the dedicated runner configuration.

Weekly keepalive runs Monday at 02:17 UTC, which is 09:17 Asia/Saigon.
Both keepalive and PR review acquire the same filesystem lock. Keep the persistent
directory available between jobs and runner restarts.

If authentication fails with 401 because the refresh token was revoked, rotated
elsewhere or expired, stop all consumers of this credential, repeat the browser
login and verification in section 2, and securely reseed the runner as in section 3.
Do not replace auth.json while a run holds the lock.

Every review and keepalive consumes the ChatGPT account's Codex usage limits,
shared with that account's interactive usage.

If steps 2-8 of review.md change, increment its rules version and update the
review-rules markers and comparison threshold together.

## 6. Required merge gate on main

Commenting alone does not block a merge. The workflow also emits the separate
GitHub Actions check **Codex Review Gate**, which must be required by branch
protection for `main`.

| Confidence of an outstanding finding | Comment | Merge gate |
| --- | --- | --- |
| 80-100, including exactly 80 | Blocking issue, with its score and source link | Fails; fix every blocker and push the fix for re-review |
| 60-79 | Possible issue, warning only, with its score and uncertainty | Passes when the review is complete and there are no blockers |
| 0-59 | Omitted | Does not affect the result |

Scores express confidence in a defect, not a severity level or a grade for the PR.
All outstanding blockers count, including earlier findings not fixed by a later
push. Rerunning an already-reviewed SHA rechecks or retains its findings; it cannot
clear blockers by returning SKIP. Neither editing a comment nor resolving a
conversation changes the required check. Push the fix and let the reviewer verify it.

Invalid JSON/scores, an incomplete or failed Codex run, failure to post the comment,
and excluded or cancelled reviews keep the gate closed. A runner that is offline
leaves the required review waiting. Restore the runner and rerun the workflow;
do not replace a failed review with an unconditional success.

In Settings → Branches → protection for `main`, configure:

- Require a pull request before merging (zero required human approvals is sufficient
  for this bot gate).
- Require status checks before merging: **Codex Review Gate**, source **GitHub Actions**.
- Apply protection to administrators / do not allow bypassing, so the repo owner
  cannot merge a PR while the bot's gate is failing.
- Preserve any existing required checks and other protections.

GitHub must see the check on a PR before it appears in the UI selector. The upgrade
PR can run the new workflow against the existing base rules using the transport
adapter above. Require the gate once this check is registered; merge the upgrade
PR only after it passes. The upgraded rules take effect from `main` after merging.
Public repositories can use required status checks on GitHub Free; making a job
fail without requiring its check is insufficient.

References:

- [OpenAI: Maintain Codex account auth in CI/CD](https://learn.chatgpt.com/docs/auth/ci-cd-auth)
- [OpenAI: Web search configuration](https://learn.chatgpt.com/docs/web-search)
- [GitHub CLI credential-helper setup](https://cli.github.com/manual/gh_auth_setup-git)
- [GitHub required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
