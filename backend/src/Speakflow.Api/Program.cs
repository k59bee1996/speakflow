using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Speakflow.Api.Health;
using Speakflow.Data;
using Speakflow.Data.Entities;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Speakflow");

if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Configure ConnectionStrings:Speakflow with user-secrets locally or ConnectionStrings__Speakflow in the environment.");
}

builder.Services.AddDbContext<SpeakflowDbContext>(options => options.UseSqlServer(connectionString));
builder.Services
    .AddIdentityCore<ApplicationUser>(options => options.User.RequireUniqueEmail = true)
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<SpeakflowDbContext>();
builder.Services.AddScoped<IDatabaseConnectivity, SqlServerDatabaseConnectivity>();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

var app = builder.Build();

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResultStatusCodes =
    {
        [HealthStatus.Healthy] = StatusCodes.Status200OK,
        [HealthStatus.Degraded] = StatusCodes.Status503ServiceUnavailable,
        [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable,
    },
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var database = report.Entries.TryGetValue("database", out var entry)
            ? entry.Description
            : "Database check is unavailable.";
        await JsonSerializer.SerializeAsync(
            context.Response.Body,
            new { status = report.Status.ToString(), database },
            cancellationToken: context.RequestAborted);
    },
});

app.Run();

public partial class Program;
