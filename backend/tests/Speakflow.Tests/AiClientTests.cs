using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Speakflow.Api.Features;

namespace Speakflow.Tests;

[TestClass]
public sealed class AiClientTests
{
    [TestMethod]
    [DataRow("not JSON")]
    [DataRow("{}")]
    [DataRow("{\"options\":[]}")]
    [DataRow("{\"options\":[null,null]}")]
    [DataRow("{\"options\":[{\"en\":\"hello\"},{\"en\":\"hi\"}]}")]
    public async Task RejectsMalformedProviderOutput(string text)
    {
        using var http = new HttpClient(new ResponseHandler(text));
        var ai = new AnthropicAiClient(http, Configuration());
        await Assert.ThrowsExactlyAsync<AiUnavailableException>(() => ai.SuggestAsync("Ý muốn nói", CancellationToken.None));
    }

    [TestMethod]
    public async Task ParsesTwoOptionsAndSendsConfiguredModelAndServerKey()
    {
        var handler = new ResponseHandler("{\"options\":[{\"en\":\"Hello.\",\"note\":\"Chào.\"},{\"en\":\"Hi.\",\"note\":\"Thân mật.\"}]}");
        using var http = new HttpClient(handler);
        var options = await new AnthropicAiClient(http, Configuration()).SuggestAsync("Xin chào", CancellationToken.None);
        Assert.AreEqual(2, options.Length); Assert.AreEqual("test-key", handler.Key); Assert.AreEqual("configured-model", handler.Model);
    }

    [TestMethod]
    public async Task SlowSuggestionStopsAfterTwentySecondsAndKeepsNote()
    {
        using var factory = new ApiFactory(); await factory.InitializeAsync(); using var client = factory.NewClient(); await AuthTests.Login(client);
        var saved = await client.PostAsJsonAsync("/api/notes", new { vi = "Giữ ghi chú này" });
        var note = await saved.Content.ReadFromJsonAsync<JsonElement>(); var id = note.GetProperty("id").GetGuid();
        factory.Ai.Slow = true;
        var timer = System.Diagnostics.Stopwatch.StartNew();
        Assert.AreEqual(HttpStatusCode.BadGateway, (await client.PostAsync($"/api/notes/{id}/suggest", null)).StatusCode);
        Assert.IsTrue(timer.Elapsed.TotalSeconds is >= 19 and < 25);
        var response = await client.GetAsync($"/api/notes/{id}");
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual(0, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("options").GetArrayLength());
    }

    private static IConfiguration Configuration() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Anthropic:ApiKey"] = "test-key", ["Anthropic:Model"] = "configured-model",
    }).Build();

    private sealed class ResponseHandler(string text) : HttpMessageHandler
    {
        public string? Key { get; private set; }
        public string? Model { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Key = request.Headers.GetValues("x-api-key").Single();
            Model = (await request.Content!.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("model").GetString();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { content = new[] { new { type = "text", text } } }) };
        }
    }
}
