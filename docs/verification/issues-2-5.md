# Local verification: issues #2–#5

Implemented and verified locally on 2026-11-03 for #2, expanded by Hoàng to include #3, #4 and #5. Hoàng subsequently requested a commit, branch push and pull request. This report records the implementation verification; no merge, deployment or direct issue/project changes are included.

## Scope and repository evidence

- Areas: `backend/`, `frontend/`, root README and archival/verification documentation. No lesson content changes.
- Rules read: root `AGENTS.md`, `backend/AGENTS.md`, `frontend/AGENTS.md`, `docs/design/DESIGN.md`, frontend tokens, the installed Next.js auth/proxy/cookies/route/font documentation, and the Vercel React skill.
- Branch: `issue/2`. Initial working tree was clean.
- Before implementation, local HEAD, fetched `origin/main`, and analysis baseline: `de4857c14fae11047ac1c4dc62a4dc72a43b6c50`.
- Fetch succeeded at `2026-11-03T15:17:43.978Z`. Synchronization: `already-current`; ahead/behind: `0/0`; Freshness Gate: `PASS`. HEAD remained at the analysis baseline throughout implementation.
- Local backup tag: `v0.1-before-api-migration-20261103`, at the same baseline.

## Result

Authentication uses Identity's password hasher, a 12-character minimum, a fixed 30-day session per device, and Secure/HttpOnly/SameSite Strict cookies. Five failures within the preceding 15 minutes lock a registered account for 15 minutes; the rolling boundary and concurrent failures are covered. Account creation/password reset use CLI commands. Password reset invalidates all sessions; sign-out revokes the current device's session, including replay of its old cookie. API authorization defaults to authenticated access, with only login and health anonymous. Foreign card/note/profile ids return 404.

Card queue and SM-2 grading now run in the API. Reviews store the client-local date and timestamp; the API checks that date against UTC. A learned new card counts toward the daily limit even after it is deleted. Notes support two validated AI options, manual options, a 50-request/24-hour quota, a 20-second timeout and atomic/idempotent conversion of a current option to a card. Learning-data reset preserves AI quota and other users' data.

Frontend calls are confined to `src/lib/backend/`. The same-origin Next.js boundary validates mutation origins and forwards cookies over HTTPS to the API. Supabase packages, clients, callbacks and direct data access are removed; SQL history and the previous README are archived. Hôm nay/Lịch sử show the #5 transition notice. Existing touched screens use token-backed Tailwind styles; fonts are self-hosted by Next.js. Authentication and data responses are not cached, and restored browser pages revalidate after sign-out.

## Checks

| Check | Result |
| --- | --- |
| `dotnet build Speakflow.sln --configuration Release` | PASS, zero warnings/errors |
| `dotnet test Speakflow.sln --configuration Release --no-build --logger "console;verbosity=quiet"` | PASS, 37 tests, zero skipped |
| `npm run lint` | PASS, zero warnings/errors |
| `npm run lint:styles` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `dotnet tool run dotnet-ef database update --project src/Speakflow.Data --startup-project src/Speakflow.Api --context SpeakflowDbContext --configuration Release --no-build` | PASS on a new disposable SQL Server database with the full final migration chain |
| `dotnet tool run dotnet-ef migrations has-pending-model-changes --project src/Speakflow.Data --startup-project src/Speakflow.Api --context SpeakflowDbContext --configuration Release --no-build` | PASS, no pending model changes |
| `create-user` and `reset-password` via CLI | PASS against disposable SQL Server |
| SQL Server queue benchmark | PASS: p95 53.9 ms, 30 measured requests after 5 warmups, over 2,000 cards in storage; includes HTTPS, cookie validation, SQL queries and reading the complete response body |
| Six concurrent failed SQL Server sign-ins | PASS: four 401 responses, then two 429 responses; no lost failure increments |
| Chromium browser smoke | PASS: HTTPS sign-in/error, persistent secure cookie, three cards plus a forgotten-card retry, note/manual option/card conversion, AI failure preservation, settings persistence, logout, Back and protected routes |
| API stopped during browser checks | PASS: login and all app routes show Vietnamese errors; cross-origin writes return 403 before forwarding |
| `git diff --check` | PASS |

Portable API tests use SQLite with a test-only model adaptation. SQL Server migrations, concurrent sign-ins, the benchmark and browser flows were separately exercised against SQL Server 2022. Benchmark numbers describe this local environment, not production guarantees.

## UI evidence

Chromium emulation was checked at 390 × 844 in light/dark modes and at 1440 × 1000. Checks cover keyboard order and horizontal overflow. Screenshots are included below; the browser/benchmark scripts remain local under `.archify/issue-2-5/`. Next.js development indicators are hidden only in screenshots.

- [Login, light](screenshots/issue-2-5/login-mobile-light.png) / [dark](screenshots/issue-2-5/login-mobile-dark.png)
- [Cards, light](screenshots/issue-2-5/cards-mobile-light.png) / [dark](screenshots/issue-2-5/cards-mobile-dark.png)
- [Notes, light](screenshots/issue-2-5/notes-mobile-light.png) / [dark](screenshots/issue-2-5/notes-mobile-dark.png)
- [Settings, light](screenshots/issue-2-5/settings-mobile-light.png) / [dark](screenshots/issue-2-5/settings-mobile-dark.png)
- [API unavailable](screenshots/issue-2-5/login-api-offline.png)

The external wireframe artifact could not be loaded by the available web tool, so exact comparison with that artifact remains unverified. Screens were checked against the authoritative DESIGN.md. Known scope differences: Hôm nay/Lịch sử are placeholders per #5; existing Vietnamese card fronts, manual cards and notes remain supported; Sprint 2's lesson/session screens and English situation fronts are not implemented here. No design tokens or DESIGN.md changes were made.

## Configuration and limits

Apply all three new migrations: `AuthenticationAndLocalReviews`, `PreserveReviewsWhenDeletingCards`, and `RollingLoginFailureWindow`. The first backfills historical review dates from their stored timestamps; original local time zones cannot be recovered. The final migration replaces the temporary first-failure field with bounded recent failure timestamps. A persistent protected Data Protection key ring is required when hosting the application.

Configure server-side `BACKEND_URL` in the frontend and `Anthropic__ApiKey`/`Anthropic__Model` on the API, alongside its SQL connection. See the root/backend READMEs for local HTTPS and CLI setup. There is no usable live Claude configuration in the verification environment: successful provider responses use a fake provider/HTTP handler, while malformed output, failure, quota and timeout paths are tested. Live Claude success and the 10-second p95 requirement must be checked with the chosen model/key before production. No physical phone or production hosting was tested; deployment/backups remain #6. Existing Supabase user data is not imported automatically.

## PR #19 review follow-up — 2026-11-04

Both P2 findings in [the review](https://github.com/k59bee1996/speakflow/pull/19#issuecomment-6619582105) are addressed:

- Note DTOs now include `options_version`, a fingerprint of the displayed options. The frontend echoes it when converting an option to a card. The API checks it inside the existing serializable transaction after verifying ownership, before resolving the index or writing anything. Missing/stale versions return 409 with a Vietnamese reload instruction. Updating card markers alone keeps the version unchanged, preserving duplicate-conversion idempotency.
- Reset sends `todayISO()` through `DELETE /api/data?today=YYYY-MM-DD`. The API validates it against the existing one-day UTC tolerance before deleting data and sets the start date to that exact local day. A missing, malformed or out-of-range date returns 400 without resetting preferences or removing notes.

New regression cases exercise two devices, removal/shift of a selected option, AI option replacement, absent conversion preconditions, and recovery after refetching. Reset cases cover local days ahead of and behind UTC, invalid-date preservation, and an explicit `StartDate` assertion in the existing ownership/reset test.

Verification: `dotnet build Speakflow.sln --configuration Release` passed with zero warnings/errors; the full backend suite passed **42 tests**, including **5 new regression cases**. Frontend `npm run lint`, `npm run lint:styles`, `npm run typecheck` and `npm run build` all passed. A smoke check of the actual TypeScript client verified local-day query strings for Asia/Ho_Chi_Minh and America/Los_Angeles, forwarding of the displayed version, and preservation of the 409 recovery message. No layout/style, database schema or environment-variable changes are needed for these fixes.

The user-approved merge of `origin/main` produced analysis baseline `d8d4c9f4aaa9f1f1968340ffed87d5c03a7ee288` on `issue/2`. Freshness Gate passed after fetching at `2026-11-04T12:00:21.687Z`, against remote base `ab042f2ff9c53303633d2e58ed866b4f39605c25`, with no commits behind the base. Rules read for this follow-up: root, frontend and backend AGENTS.md, plus the installed Next.js route-handler documentation and React skill. The original browser screenshots remain applicable to the unchanged layout.

## Grading replay blocker — 2026-11-04

The [remaining blocking finding](https://github.com/k59bee1996/speakflow/pull/19#issuecomment-6630245770) concerned a grade that committed before its response was lost: retrying the still-displayed card applied SM-2 and wrote a review a second time.

Grading now requires `expected_reps` and `expected_lapses` from the displayed card. The API compares both values after ownership lookup, inside the existing serializable grading transaction and before applying SM-2 or writing a review. Every successful grade either increments reps or resets reps and increments lapses, so this pair distinguishes the displayed review state even when a forgotten card still has zero reps. A stale, missing or partial state returns 409 with a reload instruction; the original saved schedule/review remain intact. Refetching the advanced state permits a separate practice attempt. The frontend passes the displayed snapshot to its typed client and retains that snapshot when the response fails.

Five new `GradingRetryTests` cases failed against the previous endpoint and passed after the fix. They discard the first committed response body, replay the same displayed attempt for all four grades, and assert that only one review and one scheduling transition were saved. They also verify that a refreshed state permits another attempt, the original new-card quota is consumed once, and absent/partial preconditions cannot write a review. A smoke check of the actual TypeScript client confirms unchanged counter preconditions across a lost response/retry, propagation of the 409 message, and use of refreshed counters for a new attempt.

Final verification: backend Release build passed with zero warnings/errors; **47 tests passed**, zero skipped. Frontend lint, lint CSS, typecheck and production build all passed. No database migration, environment-variable or layout changes are required.

Fix baseline: `eeb6645b1ba9db1ce3eeaddaa107281e4484b465`, branch `issue/2`; remote base `ab042f2ff9c53303633d2e58ed866b4f39605c25`. Fetch succeeded at `2026-11-04T12:17:04.388Z`; Freshness Gate PASS, feature branch unchanged, zero commits behind. Root/frontend/backend rules and the installed Next.js route-handler documentation were read for this follow-up.
