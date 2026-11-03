using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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

    [TestMethod]
    [DoNotParallelize]
    public async Task HealthEndpointReturnsProblemDetailsWhenDatabaseIsUnavailable()
    {
        const string connectionStringKey = "ConnectionStrings__Speakflow";
        var originalConnectionString = Environment.GetEnvironmentVariable(connectionStringKey);
        Environment.SetEnvironmentVariable(connectionStringKey, "Server=unused");

        try
        {
            using var factory = new WebApplicationFactory<Program>()
                .WithWebHostBuilder(builder =>
                {
                    builder.ConfigureServices(services =>
                    {
                        services.RemoveAll<IDatabaseConnectivity>();
                        services.AddScoped<IDatabaseConnectivity>(_ => new StubDatabaseConnectivity(false));
                    });
                });
            using var client = factory.CreateClient();

            using var response = await client.GetAsync("/health");
            var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

            Assert.AreEqual(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            Assert.AreEqual("application/problem+json", response.Content.Headers.ContentType?.MediaType);
            Assert.IsNotNull(problem);
            Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, problem.Status);
            Assert.AreEqual("Không thể kết nối tới cơ sở dữ liệu.", problem.Detail);
        }
        finally
        {
            Environment.SetEnvironmentVariable(connectionStringKey, originalConnectionString);
        }
    }

    private sealed class StubDatabaseConnectivity(bool canConnect) : IDatabaseConnectivity
    {
        public Task<bool> CanConnectAsync(CancellationToken cancellationToken) => Task.FromResult(canConnect);
    }
}
