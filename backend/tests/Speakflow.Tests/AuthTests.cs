using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Tests;

[TestClass]
public sealed class AuthTests
{
    internal static async Task<string> Login(HttpClient client, string email = "a@example.test", string password = ApiFactory.Password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode, await response.Content.ReadAsStringAsync());
        var setCookie = response.Headers.GetValues("Set-Cookie").Single();
        StringAssert.Contains(setCookie, "secure"); StringAssert.Contains(setCookie, "httponly"); StringAssert.Contains(setCookie, "samesite=strict");
        var cookie = setCookie.Split(';')[0];
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return cookie;
    }

    [TestMethod]
    public async Task PersistentCookieLastsThirtyDaysAndLogoutRevokesOnlyOneDevice()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync();
        using var phone = factory.NewClient(); using var laptop = factory.NewClient();
        var replay = await Login(phone); await Login(laptop);
        using var scope = factory.Services.CreateScope();
        var sessions = await scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>().UserSessions.ToListAsync();
        Assert.AreEqual(2, sessions.Count);
        Assert.IsTrue(sessions.All(s => Math.Abs((s.ExpiresAt - factory.Clock.Now.AddDays(30)).TotalSeconds) < 1));
        Assert.AreEqual(HttpStatusCode.NoContent, (await phone.PostAsync("/api/auth/logout", null)).StatusCode);
        phone.DefaultRequestHeaders.Remove("Cookie"); phone.DefaultRequestHeaders.Add("Cookie", replay);
        Assert.AreEqual(HttpStatusCode.Unauthorized, (await phone.GetAsync("/api/auth/session")).StatusCode);
        Assert.AreEqual(HttpStatusCode.OK, (await laptop.GetAsync("/api/auth/session")).StatusCode);
        factory.Clock.Now = factory.Clock.Now.AddDays(30).AddSeconds(1);
        Assert.AreEqual(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/auth/session")).StatusCode);
    }

    [TestMethod]
    public async Task WrongAndUnknownCredentialsMatchAndLockoutExpiresAfterFifteenMinutes()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient();
        var unknown = await client.PostAsJsonAsync("/api/auth/login", new { email = "unknown@example.test", password = "wrong" });
        var wrong = await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" });
        Assert.AreEqual(HttpStatusCode.Unauthorized, wrong.StatusCode);
        var u = JsonDocument.Parse(await unknown.Content.ReadAsStringAsync()); var w = JsonDocument.Parse(await wrong.Content.ReadAsStringAsync());
        Assert.AreEqual("Email hoặc mật khẩu không đúng.", w.RootElement.GetProperty("detail").GetString());
        Assert.AreEqual(u.RootElement.GetProperty("detail").GetString(), w.RootElement.GetProperty("detail").GetString());
        for (var i = 1; i < 5; i++) await client.PostAsJsonAsync("/api/auth/login", new { email = " A@EXAMPLE.TEST ", password = "wrong" });
        var blocked = await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = ApiFactory.Password });
        Assert.AreEqual(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.IsNotNull(blocked.Headers.RetryAfter);
        factory.Clock.Now = factory.Clock.Now.AddMinutes(15).AddSeconds(1);
        await Login(client);
    }

    [TestMethod]
    public async Task FailuresOutsideWindowDoNotAccumulateAndSuccessResetsCounter()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient();
        for (var i = 0; i < 4; i++) await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" });
        factory.Clock.Now = factory.Clock.Now.AddMinutes(16);
        Assert.AreEqual(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" })).StatusCode);
        await Login(client);
        for (var i = 0; i < 4; i++) Assert.AreEqual(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" })).StatusCode);
        await Login(client);
    }

    [TestMethod]
    public async Task FailuresAreCountedAcrossTheBoundaryOfTheFirstWindow()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient();
        await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" });
        factory.Clock.Now = factory.Clock.Now.AddMinutes(14);
        for (var i = 0; i < 3; i++) await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" });
        factory.Clock.Now = factory.Clock.Now.AddMinutes(2);
        Assert.AreEqual(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" })).StatusCode);
        Assert.AreEqual(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = "wrong" })).StatusCode);
    }

    [TestMethod]
    public async Task AllEndpointsRequireSessionAndWritesRequireCsrfHeaderAndHttps()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient();
        foreach (var path in new[] { "/api/auth/session", "/api/cards", "/api/notes", "/api/profile", "/does-not-exist", "/api/auth/register" })
            Assert.AreEqual(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode, path);
        Assert.AreEqual(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Speakflow-Request");
        Assert.AreEqual(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/login", new { email = "a@example.test", password = ApiFactory.Password })).StatusCode);
        client.DefaultRequestHeaders.Add("X-Speakflow-Request", "1");
        Assert.AreEqual(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("http://localhost/api/auth/login", new { email = "a@example.test", password = ApiFactory.Password })).StatusCode);
    }

    [TestMethod]
    public async Task ForeignOwnedIdsReturn404AndPasswordResetInvalidatesSessions()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient(); await Login(client);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        var card = new Card { Id = Guid.NewGuid(), UserId = factory.UserB, Front = "secret", Back = "secret" };
        var note = new Note { Id = Guid.NewGuid(), UserId = factory.UserB, Vi = "secret" };
        db.Cards.Add(card); db.Notes.Add(note); await db.SaveChangesAsync();
        foreach (var path in new[] { $"/api/cards/{card.Id}", $"/api/notes/{note.Id}", $"/api/profiles/{factory.UserB}" })
        {
            var response = await client.GetAsync(path); Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
            Assert.IsFalse((await response.Content.ReadAsStringAsync()).Contains("secret"));
        }
        Assert.AreEqual(HttpStatusCode.OK, (await client.GetAsync($"/api/profiles/{factory.UserA}")).StatusCode);
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
        var user = await users.FindByIdAsync(factory.UserA.ToString());
        var token = await users.GeneratePasswordResetTokenAsync(user!);
        Assert.IsTrue((await users.ResetPasswordAsync(user!, token, "new test password twelve")).Succeeded);
        Assert.AreEqual(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/session")).StatusCode);
        var shortResult = await users.CreateAsync(new ApplicationUser { UserName = "short@example.test", Email = "short@example.test" }, "too short");
        Assert.IsFalse(shortResult.Succeeded);
    }
}
