using Microsoft.Extensions.Diagnostics.HealthChecks;
using Speakflow.Data;

namespace Speakflow.Api.Health;

public interface IDatabaseConnectivity
{
    Task<bool> CanConnectAsync(CancellationToken cancellationToken);
}

public sealed class SqlServerDatabaseConnectivity(SpeakflowDbContext dbContext) : IDatabaseConnectivity
{
    public Task<bool> CanConnectAsync(CancellationToken cancellationToken) =>
        dbContext.Database.CanConnectAsync(cancellationToken);
}

public sealed class DatabaseHealthCheck(IDatabaseConnectivity databaseConnectivity) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await databaseConnectivity.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy("Database connection succeeded.")
                : HealthCheckResult.Unhealthy("Database connection failed.");
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return HealthCheckResult.Unhealthy("Database connection failed.");
        }
    }
}
