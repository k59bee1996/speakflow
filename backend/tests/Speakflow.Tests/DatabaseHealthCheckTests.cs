using Microsoft.Extensions.Diagnostics.HealthChecks;
using Speakflow.Api.Health;

namespace Speakflow.Tests;

[TestClass]
public sealed class DatabaseHealthCheckTests
{
    [TestMethod]
    public async Task ReportsHealthyWhenDatabaseIsReachable()
    {
        var check = new DatabaseHealthCheck(new StubDatabaseConnectivity(true));

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        Assert.AreEqual(HealthStatus.Healthy, result.Status);
        Assert.AreEqual("Database connection succeeded.", result.Description);
    }

    [TestMethod]
    public async Task ReportsUnhealthyWhenDatabaseIsUnavailable()
    {
        var check = new DatabaseHealthCheck(new StubDatabaseConnectivity(false));

        var result = await check.CheckHealthAsync(new HealthCheckContext());

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.AreEqual("Database connection failed.", result.Description);
    }

    private sealed class StubDatabaseConnectivity(bool canConnect) : IDatabaseConnectivity
    {
        public Task<bool> CanConnectAsync(CancellationToken cancellationToken) => Task.FromResult(canConnect);
    }
}
