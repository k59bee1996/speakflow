# Speakflow API: rules for AI agents

- ASP.NET Core on .NET 10, EF Core, SQL Server. Schema changes only through EF Core migrations.
- Every table with user data has a non-null `UserId`; every query filters by the signed-in user.
- Business rules (spaced repetition, session progress, streaks) live in the API and have unit tests.
- All AI calls go through `IAiClient`; never call a provider SDK from feature code.
- Errors are returned as ProblemDetails; `detail` holds the Vietnamese message shown to the user.
- Secrets come from user-secrets locally and environment variables in production, never from files in git.
- Before you say a task is done: `dotnet build` and `dotnet test` pass.
