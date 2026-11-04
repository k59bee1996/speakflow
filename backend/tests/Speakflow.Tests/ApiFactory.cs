using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Speakflow.Api.Features;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Tests;

public sealed class TestClock : TimeProvider
{
    public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => Now;
}

public sealed class FakeAi : IAiClient
{
    public int Calls { get; private set; }
    public bool Fails { get; set; }
    public bool Slow { get; set; }
    public async Task<NoteOption[]> SuggestAsync(string vi, CancellationToken ct)
    {
        Calls++;
        if (Slow) await Task.Delay(Timeout.InfiniteTimeSpan, ct);
        if (Fails) throw new AiUnavailableException();
        return [new("Let's move the meeting.", "Dời cuộc họp."), new("Could we reschedule?", "Lịch sự hơn.")];
    }
}

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    public TestClock Clock { get; } = new();
    public FakeAi Ai { get; } = new();
    public Guid UserA { get; private set; }
    public Guid UserB { get; private set; }
    public const string Password = "test password twelve";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Speakflow", "Server=unused");
        connection.Open();
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<SpeakflowDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<SpeakflowDbContext>>();
            services.AddDbContext<SpeakflowDbContext>(o => o.UseSqlite(connection).ReplaceService<IModelCustomizer, SqliteTestModel>());
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.RemoveAll<IAiClient>();
            services.AddSingleton<IAiClient>(Ai);
        });
    }

    public async Task InitializeAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        await db.Database.EnsureCreatedAsync();
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
        var a = new ApplicationUser { Id = Guid.NewGuid(), Email = "a@example.test", UserName = "a@example.test" };
        var b = new ApplicationUser { Id = Guid.NewGuid(), Email = "b@example.test", UserName = "b@example.test" };
        Assert.IsTrue((await users.CreateAsync(a, Password)).Succeeded);
        Assert.IsTrue((await users.CreateAsync(b, Password)).Succeeded);
        UserA = a.Id; UserB = b.Id;
        db.Profiles.AddRange(new Profile { UserId = a.Id }, new Profile { UserId = b.Id });
        await db.SaveChangesAsync();
    }

    public HttpClient NewClient()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false, HandleCookies = false });
        client.DefaultRequestHeaders.Add("X-Speakflow-Request", "1");
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) connection.Dispose();
    }
}

// SQL Server schema/index behavior is separately checked against SQL Server. SQLite keeps API tests portable in CI.
public sealed class SqliteTestModel(ModelCustomizerDependencies dependencies) : ModelCustomizer(dependencies)
{
    public override void Customize(ModelBuilder builder, DbContext context)
    {
        base.Customize(builder, context);
        foreach (var entity in builder.Model.GetEntityTypes())
        {
            foreach (var constraint in entity.GetCheckConstraints().ToArray()) entity.RemoveCheckConstraint(constraint.Name!);
            foreach (var property in entity.GetProperties())
            {
                property.SetDefaultValueSql(null);
                if (property.GetColumnType() == "nvarchar(max)") property.SetColumnType("TEXT");
                if (property.ClrType == typeof(DateTimeOffset))
                    property.SetValueConverter(new Microsoft.EntityFrameworkCore.Storage.ValueConversion.DateTimeOffsetToBinaryConverter());
                if (property.ClrType == typeof(DateTimeOffset?))
                    property.SetValueConverter(new Microsoft.EntityFrameworkCore.Storage.ValueConversion.DateTimeOffsetToBinaryConverter());
            }
        }
    }
}
