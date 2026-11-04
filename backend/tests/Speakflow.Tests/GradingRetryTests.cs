using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Speakflow.Api.Features;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Tests;

[TestClass]
public sealed class GradingRetryTests
{
    [TestMethod]
    [DataRow(0)]
    [DataRow(1)]
    [DataRow(2)]
    [DataRow(3)]
    public async Task LostResponseReplayCannotScheduleOrRecordTheDisplayedAttemptTwice(int grade)
    {
        using var factory = new ApiFactory();
        await factory.InitializeAsync();
        using var client = factory.NewClient();
        await AuthTests.Login(client);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);
        var card = new Card { Id = Guid.NewGuid(), UserId = factory.UserA, Front = "Tôi muốn ôn", Back = "I'd like to practise.",
            Due = today, IsNew = true, Ease = 2.5 };
        db.Cards.Add(card);
        await db.SaveChangesAsync();
        var displayedAttempt = new { grade, today, expected_reps = 0, expected_lapses = 0 };

        // Commit the first attempt but discard its body, as if its response was lost in transit.
        using (var lost = await client.PostAsJsonAsync($"/api/cards/{card.Id}/grade", displayedAttempt))
            Assert.AreEqual(HttpStatusCode.OK, lost.StatusCode);
        using var replay = await client.PostAsJsonAsync($"/api/cards/{card.Id}/grade", displayedAttempt);
        Assert.AreEqual(HttpStatusCode.Conflict, replay.StatusCode, await replay.Content.ReadAsStringAsync());

        var stored = await db.Cards.AsNoTracking().SingleAsync(c => c.Id == card.Id);
        var expected = Srs.Plan(0, 2.5, 0, grade);
        Assert.AreEqual(expected.Reps, stored.Reps);
        Assert.AreEqual(expected.IntervalDays, stored.IntervalDays);
        Assert.AreEqual(expected.Ease, stored.Ease, 0.000001);
        Assert.AreEqual(today.AddDays(expected.IntervalDays), stored.Due);
        Assert.AreEqual(grade == 0 ? 1 : 0, stored.Lapses);
        Assert.IsFalse(stored.IsNew);
        var review = await db.Reviews.AsNoTracking().SingleAsync();
        Assert.AreEqual(factory.UserA, review.UserId);
        Assert.AreEqual(card.Id, review.CardId);
        Assert.AreEqual((short)grade, review.Grade);
        Assert.IsTrue(review.WasNew);

        // Refetching the advanced state permits a separate practice attempt, including another forgotten grade.
        using var nextAttempt = await client.PostAsJsonAsync($"/api/cards/{card.Id}/grade",
            new { grade, today, expected_reps = stored.Reps, expected_lapses = stored.Lapses });
        Assert.AreEqual(HttpStatusCode.OK, nextAttempt.StatusCode);
        Assert.AreEqual(2, await db.Reviews.CountAsync());
        Assert.AreEqual(1, await db.Reviews.CountAsync(r => r.WasNew));
    }

    [TestMethod]
    public async Task MissingOrPartialDisplayedStateCannotAdvanceACard()
    {
        using var factory = new ApiFactory();
        await factory.InitializeAsync();
        using var client = factory.NewClient();
        await AuthTests.Login(client);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);
        var card = new Card { Id = Guid.NewGuid(), UserId = factory.UserA, Front = "Ôn", Back = "Practise", Due = today, Ease = 2.5 };
        db.Cards.Add(card);
        await db.SaveChangesAsync();

        foreach (var body in new object[] {
            new { grade = 2, today },
            new { grade = 2, today, expected_reps = 0 },
            new { grade = 2, today, expected_lapses = 0 },
        })
        {
            using var response = await client.PostAsJsonAsync($"/api/cards/{card.Id}/grade", body);
            Assert.AreEqual(HttpStatusCode.Conflict, response.StatusCode);
        }
        Assert.AreEqual(0, await db.Reviews.CountAsync());
        var stored = await db.Cards.AsNoTracking().SingleAsync(c => c.Id == card.Id);
        Assert.AreEqual(0, stored.Reps);
        Assert.AreEqual(0, stored.Lapses);
        Assert.AreEqual(today, stored.Due);
    }
}
