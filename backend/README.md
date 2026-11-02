# Speakflow API

ASP.NET Core API and SQL Server data model for Speakflow. Schema changes are made with EF Core migrations. The initial schema contains ASP.NET Identity users, profiles, cards, reviews, notes, and AI request logs. Day-based sessions remain out of scope for this version.

## Requirements

- .NET 10 SDK
- Docker Desktop with its Linux engine running

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
