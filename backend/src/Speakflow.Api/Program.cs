using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Speakflow.Api.Health;
using Speakflow.Api.Auth;
using Speakflow.Api.Features;
using Speakflow.Data;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Speakflow");

if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Configure ConnectionStrings:Speakflow with user-secrets locally or ConnectionStrings__Speakflow in the environment.");
}

builder.Services.AddDbContext<SpeakflowDbContext>(options => options.UseSqlServer(connectionString,
    sql => sql.EnableRetryOnFailure()));
builder.Services.AddSpeakflowAuth();
builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
{
    if (context.ProblemDetails.Status >= 500)
        context.ProblemDetails.Detail ??= "Máy chủ chưa xử lý được yêu cầu. Bạn hãy thử lại sau.";
    else
        context.ProblemDetails.Detail ??= "Yêu cầu không hợp lệ.";
});
var protection = builder.Services.AddDataProtection().SetApplicationName("Speakflow");
if (builder.Configuration["DataProtection:KeysPath"] is { Length: > 0 } keysPath)
    protection.PersistKeysToFileSystem(new DirectoryInfo(keysPath));
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddHttpClient<IAiClient, AnthropicAiClient>(client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddScoped<IDatabaseConnectivity, SqlServerDatabaseConnectivity>();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

var app = builder.Build();

if (args.FirstOrDefault() is "create-user" or "reset-password")
{
    Environment.ExitCode = await AccountCommand.RunAsync(app.Services, args);
    return;
}

app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    await next(context);
});
app.UseStatusCodePages(async context =>
{
    var response = context.HttpContext.Response;
    await Results.Problem(statusCode: response.StatusCode,
        detail: response.StatusCode == 404 ? "Không tìm thấy dữ liệu." : "Yêu cầu không hợp lệ.")
        .ExecuteAsync(context.HttpContext);
});
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    // Health stays available to local infrastructure. Credentials/sessions require TLS, including development.
    if (context.Request.Path != "/health" && !context.Request.IsHttps)
    {
        await Results.Problem(statusCode: 400, detail: "Kết nối phải sử dụng HTTPS.").ExecuteAsync(context);
        return;
    }
    // A custom header requires cross-origin browsers to preflight; this API deliberately enables no CORS.
    if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) &&
        context.Request.Headers["X-Speakflow-Request"] != "1")
    {
        await Results.Problem(statusCode: 400, detail: "Yêu cầu không hợp lệ.").ExecuteAsync(context);
        return;
    }
    await next(context);
});
app.MapAuthEndpoints();
app.MapOwnedDataEndpoints();
app.MapCardEndpoints();
app.MapNoteEndpoints();
app.MapProfileEndpoints();

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
        var database = report.Entries.TryGetValue("database", out var entry)
            ? entry.Description
            : "Database check is unavailable.";

        if (report.Status == HealthStatus.Healthy)
        {
            await context.Response.WriteAsJsonAsync(
                new { status = report.Status.ToString(), database },
                cancellationToken: context.RequestAborted);
            return;
        }

        var problem = new ProblemDetails
        {
            Status = context.Response.StatusCode,
            Title = "Dịch vụ chưa sẵn sàng.",
            Detail = "Không thể kết nối tới cơ sở dữ liệu.",
            Type = "about:blank",
        };
        context.Response.ContentType = "application/problem+json";
        await JsonSerializer.SerializeAsync(
            context.Response.Body,
            problem,
            new JsonSerializerOptions(JsonSerializerDefaults.Web),
            context.RequestAborted);
    },
}).AllowAnonymous();

app.Run();

public partial class Program;
