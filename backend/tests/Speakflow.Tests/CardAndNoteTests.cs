using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Tests;

[TestClass]
public sealed class CardAndNoteTests
{
    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        Assert.AreEqual(expected, response.StatusCode, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [TestMethod]
    public async Task QueueOrdersDueBeforeNewAndEnforcesDailyLimitForEachUserAndLocalDate()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient(); await AuthTests.Login(client);
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        var oldest = new Card { Id = Guid.NewGuid(), UserId = factory.UserA, Front = "old", Back = "old", IsNew = false, Due = today.AddDays(-2) };
        var due = new Card { Id = Guid.NewGuid(), UserId = factory.UserA, Front = "due", Back = "due", IsNew = false, Due = today };
        var future = new Card { Id = Guid.NewGuid(), UserId = factory.UserA, Front = "future", Back = "future", IsNew = false, Due = today.AddDays(1) };
        db.Cards.AddRange(oldest, due, future);
        db.Cards.AddRange(Enumerable.Range(0, 12).Select(i => new Card { Id = Guid.NewGuid(), UserId = factory.UserA, Front = $"new{i}", Back = "new", IsNew = true }));
        db.Cards.Add(new Card { Id = Guid.NewGuid(), UserId = factory.UserB, Front = "secret", Back = "secret", Due = today });
        await db.SaveChangesAsync();
        var queue = await Json(await client.GetAsync($"/api/cards/queue?today={today:yyyy-MM-dd}"));
        Assert.AreEqual(12, queue.GetArrayLength()); Assert.AreEqual(oldest.Id, queue[0].GetProperty("id").GetGuid());
        Assert.AreEqual(due.Id, queue[1].GetProperty("id").GetGuid());
        var newId = queue[2].GetProperty("id").GetGuid();
        db.Reviews.AddRange(Enumerable.Range(0, 10).Select(_ => new Review { UserId = factory.UserA, CardId = due.Id, WasNew = true, ReviewedOn = today, ReviewedAt = factory.Clock.Now }));
        await db.SaveChangesAsync();
        queue = await Json(await client.GetAsync($"/api/cards/queue?today={today:yyyy-MM-dd}")); Assert.AreEqual(2, queue.GetArrayLength());
        Assert.AreEqual(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/cards/{newId}/grade", new { grade = 2, today, expected_reps = 0, expected_lapses = 0 })).StatusCode);
        Assert.AreEqual(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/cards/queue?today={today.AddDays(-3):yyyy-MM-dd}")).StatusCode);
        queue = await Json(await client.GetAsync($"/api/cards/queue?today={today.AddDays(1):yyyy-MM-dd}")); Assert.AreEqual(13, queue.GetArrayLength());
    }

    [TestMethod]
    public async Task CardValidationGradingAndDeletionAreAtomicAndOwned()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient(); await AuthTests.Login(client);
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);
        foreach (var front in new[] { " ", new string('x', 501) })
            Assert.AreEqual(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/cards", new { front, back = "valid", today })).StatusCode);
        var card = await Json(await client.PostAsJsonAsync("/api/cards", new { front = "xin chào", back = "hello", today }), HttpStatusCode.Created);
        var id = card.GetProperty("id").GetGuid();
        var graded = await Json(await client.PostAsJsonAsync($"/api/cards/{id}/grade", new { grade = 0, today, expected_reps = 0, expected_lapses = 0 }));
        Assert.AreEqual(1, graded.GetProperty("lapses").GetInt32()); Assert.IsFalse(graded.GetProperty("is_new").GetBoolean());
        Assert.AreEqual(today.ToString("yyyy-MM-dd"), graded.GetProperty("due").GetString());
        using var b = factory.NewClient(); await AuthTests.Login(b, "b@example.test");
        Assert.AreEqual(HttpStatusCode.NotFound, (await b.DeleteAsync($"/api/cards/{id}")).StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, (await b.PostAsJsonAsync($"/api/cards/{id}/grade", new { grade = 2, today, expected_reps = 0, expected_lapses = 1 })).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        var review = await db.Reviews.SingleAsync(); Assert.AreEqual(today, review.ReviewedOn); Assert.AreEqual(factory.UserA, review.UserId);
        Assert.AreEqual(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/cards/{id}")).StatusCode);
        Assert.AreEqual(1, await db.Reviews.CountAsync()); Assert.AreEqual(0, await db.Cards.CountAsync());
    }

    [TestMethod]
    public async Task NotesValidateSaveSuggestionsAndConvertAnOptionOnlyOnce()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient(); await AuthTests.Login(client);
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);
        foreach (var vi in new[] { " ", new string('x', 501) })
            Assert.AreEqual(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/notes", new { vi })).StatusCode);
        var note = await Json(await client.PostAsJsonAsync("/api/notes", new { vi = "Tôi muốn dời cuộc họp" }), HttpStatusCode.Created);
        var id = note.GetProperty("id").GetGuid();
        note = await Json(await client.PostAsync($"/api/notes/{id}/suggest", null)); Assert.AreEqual(2, note.GetProperty("options").GetArrayLength());
        note = await Json(await client.PostAsJsonAsync($"/api/notes/{id}/options", new { en = "My own phrasing." }));
        Assert.AreEqual("Bạn tự nhập", note.GetProperty("options")[2].GetProperty("note").GetString());
        var optionsVersion = note.GetProperty("options_version").GetString();
        await Json(await client.PostAsJsonAsync($"/api/notes/{id}/cards", new { index = 2, today, options_version = optionsVersion }));
        await Json(await client.PostAsJsonAsync($"/api/notes/{id}/cards", new { index = 2, today, options_version = optionsVersion }));
        var cards = await Json(await client.GetAsync("/api/cards")); Assert.AreEqual(1, cards.GetArrayLength());
        note = await Json(await client.PostAsJsonAsync($"/api/notes/{id}/options", new { en = "Another version." }));
        Assert.AreEqual(3, note.GetProperty("options").GetArrayLength()); Assert.AreEqual(1, note.GetProperty("carded")[0].GetInt32());
        using var b = factory.NewClient(); await AuthTests.Login(b, "b@example.test");
        Assert.AreEqual(HttpStatusCode.NotFound, (await b.PostAsync($"/api/notes/{id}/suggest", null)).StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, (await b.PostAsJsonAsync($"/api/notes/{id}/options", new { en = "secret" })).StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, (await b.PostAsJsonAsync($"/api/notes/{id}/cards", new { index = 0, today })).StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, (await b.DeleteAsync($"/api/notes/{id}")).StatusCode);
        Assert.AreEqual(1, factory.Ai.Calls);
    }

    [TestMethod]
    public async Task ResetClearsOnlyCurrentUserLearningDataAndKeepsOtherAccountAndSession()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var a = factory.NewClient(); using var b = factory.NewClient();
        await AuthTests.Login(a); await AuthTests.Login(b, "b@example.test");
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        db.Cards.AddRange(new Card { Id = Guid.NewGuid(), UserId = factory.UserA, Front = "a", Back = "a" }, new Card { Id = Guid.NewGuid(), UserId = factory.UserB, Front = "b", Back = "b" });
        db.Notes.AddRange(new Note { Id = Guid.NewGuid(), UserId = factory.UserA, Vi = "a" }, new Note { Id = Guid.NewGuid(), UserId = factory.UserB, Vi = "b" });
        foreach (var p in await db.Profiles.ToListAsync()) p.Mode = "60";
        await db.SaveChangesAsync();
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);
        Assert.AreEqual(HttpStatusCode.NoContent, (await a.DeleteAsync($"/api/data?today={today:yyyy-MM-dd}")).StatusCode);
        db.ChangeTracker.Clear();
        Assert.AreEqual(0, await db.Cards.IgnoreQueryFilters().CountAsync(c => c.UserId == factory.UserA));
        Assert.AreEqual(1, await db.Cards.CountAsync(c => c.UserId == factory.UserB));
        Assert.AreEqual(1, await db.Notes.CountAsync());
        Assert.AreEqual("30", (await db.Profiles.SingleAsync(p => p.UserId == factory.UserA)).Mode);
        Assert.AreEqual(today, (await db.Profiles.SingleAsync(p => p.UserId == factory.UserA)).StartDate);
        Assert.AreEqual("60", (await db.Profiles.SingleAsync(p => p.UserId == factory.UserB)).Mode);
        Assert.AreEqual(HttpStatusCode.OK, (await a.GetAsync("/api/auth/session")).StatusCode);
        Assert.AreEqual(HttpStatusCode.OK, (await b.GetAsync("/api/auth/session")).StatusCode);
    }

    [TestMethod]
    public async Task AiFailuresPreserveNoteAndDailyLimitPreventsProviderCall()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient(); await AuthTests.Login(client);
        var note = await Json(await client.PostAsJsonAsync("/api/notes", new { vi = "Giữ lại ý này" }), HttpStatusCode.Created);
        var id = note.GetProperty("id").GetGuid(); factory.Ai.Fails = true;
        Assert.AreEqual(HttpStatusCode.BadGateway, (await client.PostAsync($"/api/notes/{id}/suggest", null)).StatusCode);
        note = await Json(await client.GetAsync($"/api/notes/{id}")); Assert.AreEqual(0, note.GetProperty("options").GetArrayLength());
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        db.AiRequests.AddRange(Enumerable.Range(0, 49).Select(_ => new AiRequestLog { UserId = factory.UserA, CreatedAt = factory.Clock.Now }));
        await db.SaveChangesAsync();
        Assert.AreEqual(HttpStatusCode.TooManyRequests, (await client.PostAsync($"/api/notes/{id}/suggest", null)).StatusCode); Assert.AreEqual(1, factory.Ai.Calls);
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);
        Assert.AreEqual(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/data?today={today:yyyy-MM-dd}")).StatusCode);
        Assert.AreEqual(50, await db.AiRequests.CountAsync());
    }
}
