# Speakflow API

ASP.NET Core API and SQL Server data model for Speakflow. Schema changes are made with EF Core migrations. The initial schema contains ASP.NET Identity users, profiles, cards, reviews, notes, and AI request logs. Day-based sessions remain out of scope for this version.

## Requirements

- .NET 10 SDK
- Docker Desktop with its Linux engine running

The local Compose database binds to `127.0.0.1:1433` on the host. SQL Server Developer and the ASP.NET development certificate are for local development only; do not expose SQL Server to a network or use the Developer edition in production. This setup does not configure production hosting or backups.

## Run locally

From this directory, start SQL Server after setting a strong local password in the current shell. Do not put the password in this repository.

```powershell
$env:MSSQL_SA_PASSWORD = '<your-local-SQL-Server-password>'
docker compose up -d sqlserver
```

Provide the full development connection string through the SPEAKFLOW_SQL_CONNECTION shell variable, then store it in user-secrets. Keep its value outside the repository.

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet user-secrets set 'ConnectionStrings:Speakflow' $env:SPEAKFLOW_SQL_CONNECTION --project src/Speakflow.Api
```

Restore the local EF tool and apply the migration to the empty database:

```powershell
dotnet tool restore
dotnet tool run dotnet-ef database update --project src/Speakflow.Data --startup-project src/Speakflow.Api --context SpeakflowDbContext
```

Run the API and check database connectivity:

```powershell
dotnet run --project src/Speakflow.Api
Invoke-RestMethod http://localhost:5200/health
```

`/health` returns HTTP 200 with `Healthy` when SQL Server accepts a connection. It returns HTTP 503 when the database check fails.

## Build and test

```powershell
dotnet restore Speakflow.sln
dotnet build Speakflow.sln --configuration Release --no-restore
dotnet test Speakflow.sln --configuration Release
```

CI runs restore, build, and test on every push and pull request.

## Authentication and configuration

Run the API at `https://localhost:7200` using the development launch profile. `/health` also remains available at `http://localhost:5200` for local infrastructure. Every other endpoint requires authentication except `POST /api/auth/login`. Credentials and sessions require HTTPS; HTTP login requests are rejected.

After applying **all** migrations, create an account or reset its password using a hidden terminal prompt:

```powershell
dotnet run --project src/Speakflow.Api -- create-user you@example.com
dotnet run --project src/Speakflow.Api -- reset-password you@example.com
```

The password must contain at least 12 characters; spaces are allowed. Do not pass it as a command-line argument. Public registration has no endpoint. Account creation also creates a profile. A password reset revokes all old sessions through Identity's security stamp. Normal sign-out revokes only the current device, including replay of its previous cookie.

Five failed attempts for a registered email in a rolling failure window of 15 minutes lock that account for 15 minutes from the fifth failure. Only failures in the preceding 15 minutes are counted, including those spanning the boundary of the first failure window; success clears them. Email matching is normalized. Incorrect credentials return the same Vietnamese message; locked attempts return `429`, `Retry-After` and `retryAt`. Sessions have an absolute 30-day lifetime without sliding renewal.

Browser writes are forwarded by Next.js only from its own origin. Direct API writes require `X-Speakflow-Request: 1`; no CORS origins are enabled. Cross-origin browsers cannot pass that header without a preflight. Keep frontend/API on the agreed same origin and configure TLS termination/trusted forwarding in hosting (#6).

Set secrets with user-secrets locally or environment variables on the host:

| Setting | Environment variable | Purpose |
| --- | --- | --- |
| `ConnectionStrings:Speakflow` | `ConnectionStrings__Speakflow` | SQL Server connection |
| `Anthropic:ApiKey` | `Anthropic__ApiKey` | Server-only Claude key |
| `Anthropic:Model` | `Anthropic__Model` | Available Messages API model id; configure explicitly |
| `DataProtection:KeysPath` | `DataProtection__KeysPath` | Optional persistent key directory outside the checkout |

When setting local user-secrets, pass values from your shell's secret variables rather than literal keys in shell history. A deployed host must persist the Data Protection key ring across restarts, restrict its permissions to the API identity and protect it at rest using the host's key protection facility. Multiple API instances must share that protected key ring and SQL Server. Do not store the ring in Git. No bearer-token signing key is used.

## API surface

Responses use snake_case for application DTOs; errors are ProblemDetails with Vietnamese `detail`. Auth endpoints: `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`.

- Profile: `GET/PUT /api/profile`, `GET /api/profiles/{userId}`.
- Cards: `GET/POST /api/cards`, `GET/DELETE /api/cards/{id}`, `GET /api/cards/queue?today=YYYY-MM-DD`, `POST /api/cards/{id}/grade` with `{grade,today,expected_reps,expected_lapses}`. Send both counters from the card currently displayed. The API checks them in the same transaction as the grade; a missing or stale state returns 409 before scheduling or recording another review. If a committed response is lost, retrying the displayed state cannot apply that attempt twice. Reload the card/queue before a new attempt. Every grade changes `reps` or increments `lapses`, including repeated forgotten grades with zero reps. Grades 0–3 mean Quên/Khó/Được/Dễ. New cards are limited to 10 per local date; “today” must be within one day of UTC. A forgotten card is returned to the end of the frontend's current queue. Deleting a card hides it but retains reviews so its daily quota cannot be reused.
- Notes: `GET/POST /api/notes`, `GET/DELETE /api/notes/{id}`, `POST /api/notes/{id}/suggest`, `/options` with `{en}`, `/cards` with `{index,today,options_version}`. Send the `options_version` returned with the displayed note. A missing or stale version returns 409 without creating a card or changing its markers; reload the note and select again. Converting the same current option twice does not duplicate the card. Adding a fourth manual option drops the oldest and shifts the saved card markers.
- `DELETE /api/data?today=YYYY-MM-DD` clears the signed-in user's cards, reviews and notes and resets profile preferences, including the start date, to the client's local day. The date is required and must be within one day of UTC; invalid dates return 400 before any data is deleted. AI usage and authentication are retained; resetting learning data cannot bypass the 24-hour AI quota.

All reads/writes resolve ownership on the server. A foreign id and a missing id both return 404. AI calls use `IAiClient`; a reservation consumes a request even on provider failure. The provider timeout is 20 seconds, and only a validated pair of suggestions is saved.

## New migrations

`AuthenticationAndLocalReviews` adds per-device sessions, the first-failure timestamp and the local review date/index. `PreserveReviewsWhenDeletingCards` adds soft deletion for cards. `RollingLoginFailureWindow` replaces the first-failure timestamp with bounded recent failure timestamps, so attempts across the first window boundary are still counted correctly. Apply with the migration command above before starting the updated API. Historical review dates, if present from the original skeleton, are backfilled from their stored timestamp; historical local time zones cannot be reconstructed.

API tests use in-memory SQLite with SQL Server-specific defaults/types removed in the test-only model. SQL Server migrations and the actual browser/API flow are additionally verified on a disposable SQL Server database; SQLite tests alone do not validate SQL Server locking behavior or production performance.
