using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Speakflow.Data.Entities;

namespace Speakflow.Api.Features;

public sealed record NoteOption(string En, string Note);
public sealed record NoteDto(Guid Id, Guid UserId, string Vi, NoteOption[] Options, int[] Carded, DateTimeOffset CreatedAt, string OptionsVersion);

public static class ApiData
{
    public static Guid UserId(HttpContext context) => Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static IResult Missing() => Results.Problem(statusCode: 404, detail: "Không tìm thấy dữ liệu.");
    public static IResult Invalid(string detail) => Results.Problem(statusCode: 400, detail: detail);
    public static NoteDto ToDto(Note note) => new(note.Id, note.UserId, note.Vi,
        JsonSerializer.Deserialize<NoteOption[]>(note.OptionsJson, JsonSerializerOptions.Web) ?? [], note.Carded, note.CreatedAt,
        OptionsVersion(note));
    public static string OptionsVersion(Note note) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(note.OptionsJson)));
    public static string OptionsJson(NoteOption[] options) => JsonSerializer.Serialize(options, JsonSerializerOptions.Web);
    public static bool ValidToday(DateOnly today, TimeProvider clock) =>
        Math.Abs(today.DayNumber - DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).DayNumber) <= 1;
}
