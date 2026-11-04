using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Speakflow.Tests;

[TestClass]
public sealed class ReviewRegressionTests
{
    [TestMethod]
    [DataRow("append", 0)]
    [DataRow("append", 1)]
    [DataRow("suggest", 2)]
    public async Task StaleOptionSelectionCannotCreateOrMarkADifferentCard(string mutation, int selectedIndex)
    {
        using var factory = new ApiFactory();
        await factory.InitializeAsync();
        using var deviceA = factory.NewClient();
        using var deviceB = factory.NewClient();
        await AuthTests.Login(deviceA);
        await AuthTests.Login(deviceB);
        var today = DateOnly.FromDateTime(factory.Clock.Now.UtcDateTime);

        var created = await Read(await deviceA.PostAsJsonAsync("/api/notes", new { vi = "Tôi muốn dời cuộc họp" }), HttpStatusCode.Created);
        var id = created.GetProperty("id").GetGuid();
        await Read(await deviceA.PostAsync($"/api/notes/{id}/suggest", null));
        var displayed = await Read(await deviceA.PostAsJsonAsync($"/api/notes/{id}/options", new { en = "The third option." }));
        var displayedVersion = displayed.GetProperty("options_version").GetString();

        var changed = mutation == "append"
            ? await Read(await deviceB.PostAsJsonAsync($"/api/notes/{id}/options", new { en = "The fourth option." }))
            : await Read(await deviceB.PostAsync($"/api/notes/{id}/suggest", null));
        Assert.AreNotEqual(displayedVersion, changed.GetProperty("options_version").GetString());

        var conflict = await Read(await deviceA.PostAsJsonAsync($"/api/notes/{id}/cards",
            new { index = selectedIndex, today, options_version = displayedVersion }), HttpStatusCode.Conflict);
        StringAssert.Contains(conflict.GetProperty("detail").GetString()!, "tải lại");
        // Old clients cannot omit the precondition and silently convert a shifted index.
        await Read(await deviceA.PostAsJsonAsync($"/api/notes/{id}/cards", new { index = 0, today }), HttpStatusCode.Conflict);
        Assert.AreEqual(0, (await Read(await deviceA.GetAsync("/api/cards"))).GetArrayLength());
        var refreshed = await Read(await deviceA.GetAsync($"/api/notes/{id}"));
        Assert.AreEqual(0, refreshed.GetProperty("carded").GetArrayLength());

        var currentVersion = refreshed.GetProperty("options_version").GetString();
        await Read(await deviceA.PostAsJsonAsync($"/api/notes/{id}/cards", new { index = 0, today, options_version = currentVersion }));
        var cards = await Read(await deviceA.GetAsync("/api/cards"));
        Assert.AreEqual(1, cards.GetArrayLength());
        Assert.AreEqual(refreshed.GetProperty("options")[0].GetProperty("en").GetString(), cards[0].GetProperty("back").GetString());
    }

    [TestMethod]
    [DataRow("2026-11-01T17:05:00Z", "2026-11-02")]
    [DataRow("2026-11-02T06:05:00Z", "2026-11-01")]
    public async Task ResetUsesValidatedLocalDayAndInvalidDatesCannotDeleteData(string utcNow, string localDay)
    {
        using var factory = new ApiFactory();
        factory.Clock.Now = DateTimeOffset.Parse(utcNow, CultureInfo.InvariantCulture);
        await factory.InitializeAsync();
        using var client = factory.NewClient();
        await AuthTests.Login(client);
        var today = DateOnly.Parse(localDay, CultureInfo.InvariantCulture);
        await Read(await client.PutAsJsonAsync("/api/profile", new { start_date = "2026-10-28", mode = "60" }));
        await Read(await client.PostAsJsonAsync("/api/notes", new { vi = "Giữ lại khi ngày không hợp lệ" }), HttpStatusCode.Created);

        foreach (var query in new[] { "", "?today=invalid", $"?today={today.AddDays(-3):yyyy-MM-dd}", $"?today={today.AddDays(3):yyyy-MM-dd}" })
            Assert.AreEqual(HttpStatusCode.BadRequest, (await client.DeleteAsync("/api/data" + query)).StatusCode);
        Assert.AreEqual(1, (await Read(await client.GetAsync("/api/notes"))).GetArrayLength());
        var before = await Read(await client.GetAsync("/api/profile"));
        Assert.AreEqual("60", before.GetProperty("mode").GetString());
        Assert.AreEqual("2026-10-28", before.GetProperty("start_date").GetString());

        Assert.AreEqual(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/data?today={today:yyyy-MM-dd}")).StatusCode);
        var after = await Read(await client.GetAsync("/api/profile"));
        Assert.AreEqual(localDay, after.GetProperty("start_date").GetString());
        Assert.AreEqual("30", after.GetProperty("mode").GetString());
        Assert.AreEqual(0, (await Read(await client.GetAsync("/api/notes"))).GetArrayLength());
    }

    private static async Task<JsonElement> Read(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        Assert.AreEqual(expected, response.StatusCode, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
