using System.Data;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Api.Features;

public static class NoteEndpoints
{
    public sealed record NewNote(string? Vi);
    public sealed record ManualOption(string? En);
    public sealed record OptionCard(int Index, DateOnly Today, string? OptionsVersion);

    public static void MapNoteEndpoints(this WebApplication app)
    {
        app.MapGet("/api/notes", async (HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = ApiData.UserId(context);
            var notes = await db.Notes.AsNoTracking().Where(n => n.UserId == uid).OrderByDescending(n => n.CreatedAt).ThenBy(n => n.Id).ToListAsync(ct);
            return Results.Ok(notes.Select(ApiData.ToDto));
        });
        app.MapPost("/api/notes", async (NewNote input, HttpContext context, SpeakflowDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Vi) || input.Vi.Trim().Length > 500) return ApiData.Invalid("Ý muốn nói cần từ 1 đến 500 ký tự.");
            var note = new Note { Id = Guid.NewGuid(), UserId = ApiData.UserId(context), Vi = input.Vi.Trim(), CreatedAt = clock.GetUtcNow() };
            db.Notes.Add(note);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/notes/{note.Id}", ApiData.ToDto(note));
        });
        app.MapDelete("/api/notes/{id:guid}", async (Guid id, HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = ApiData.UserId(context);
            var note = await db.Notes.SingleOrDefaultAsync(n => n.Id == id && n.UserId == uid, ct);
            if (note is null) return ApiData.Missing();
            db.Notes.Remove(note);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
        app.MapPost("/api/notes/{id:guid}/options", async (Guid id, ManualOption input, HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.En) || input.En.Trim().Length > 500) return ApiData.Invalid("Câu tiếng Anh cần từ 1 đến 500 ký tự.");
            var uid = ApiData.UserId(context);
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                db.ChangeTracker.Clear();
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                var note = await db.Notes.SingleOrDefaultAsync(n => n.Id == id && n.UserId == uid, ct);
                if (note is null) return ApiData.Missing();
                var options = ApiData.ToDto(note).Options;
                if (options.Length >= 3)
                {
                    options = options.Skip(1).ToArray();
                    note.Carded = note.Carded.Where(i => i > 0).Select(i => i - 1).ToArray();
                }
                note.OptionsJson = ApiData.OptionsJson([.. options, new(input.En.Trim(), "Bạn tự nhập")]);
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                return Results.Ok(ApiData.ToDto(note));
            });
        });
        app.MapPost("/api/notes/{id:guid}/cards", async (Guid id, OptionCard input, HttpContext context, SpeakflowDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!ApiData.ValidToday(input.Today, clock)) return ApiData.Invalid("Ngày ôn không hợp lệ.");
            var uid = ApiData.UserId(context);
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                db.ChangeTracker.Clear();
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                var note = await db.Notes.SingleOrDefaultAsync(n => n.Id == id && n.UserId == uid, ct);
                if (note is null) return ApiData.Missing();
                // The selected index is meaningful only for the exact options the caller saw.
                if (!string.Equals(input.OptionsVersion, ApiData.OptionsVersion(note), StringComparison.Ordinal))
                    return Results.Problem(statusCode: 409, detail: "Các cách nói đã thay đổi. Bạn hãy tải lại trang và chọn lại cách nói.");
                var options = ApiData.ToDto(note).Options;
                if (input.Index < 0 || input.Index >= options.Length) return ApiData.Invalid("Cách nói không hợp lệ.");
                if (!note.Carded.Contains(input.Index))
                {
                    var option = options[input.Index];
                    db.Cards.Add(new Card { Id = Guid.NewGuid(), UserId = uid, Front = note.Vi, Back = option.En,
                        Note = option.Note == "Bạn tự nhập" ? "" : option.Note, Due = input.Today, Ease = 2.5, IsNew = false, CreatedAt = clock.GetUtcNow() });
                    note.Carded = [.. note.Carded, input.Index];
                    await db.SaveChangesAsync(ct);
                }
                await tx.CommitAsync(ct);
                return Results.Ok(ApiData.ToDto(note));
            });
        });
        app.MapPost("/api/notes/{id:guid}/suggest", SuggestAsync);
    }

    private static async Task<IResult> SuggestAsync(Guid id, HttpContext context, SpeakflowDbContext db, IAiClient ai, TimeProvider clock, CancellationToken ct)
    {
        var uid = ApiData.UserId(context);
        string? vi = null;
        var reserved = await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var note = await db.Notes.AsNoTracking().SingleOrDefaultAsync(n => n.Id == id && n.UserId == uid, ct);
            if (note is null) return 404;
            var since = clock.GetUtcNow().AddHours(-24);
            if (await db.AiRequests.CountAsync(r => r.UserId == uid && r.CreatedAt > since, ct) >= 50) return 429;
            db.AiRequests.Add(new AiRequestLog { UserId = uid, Kind = "suggest", CreatedAt = clock.GetUtcNow() });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            vi = note.Vi;
            return 200;
        });
        if (reserved == 404) return ApiData.Missing();
        if (reserved == 429) return Results.Problem(statusCode: 429, detail: "Bạn đã dùng hết lượt gợi ý trong 24 giờ qua. Thử lại sau nhé.");
        NoteOption[] options;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(20));
            options = await ai.SuggestAsync(vi!, timeout.Token);
        }
        catch (Exception e) when (e is AiUnavailableException or HttpRequestException || e is OperationCanceledException && !ct.IsCancellationRequested)
        {
            return Results.Problem(statusCode: 502, detail: "Chưa lấy được gợi ý. Ghi chú vẫn được giữ lại; bạn hãy thử lại sau.");
        }
        var saved = await db.Notes.SingleOrDefaultAsync(n => n.Id == id && n.UserId == uid, ct);
        if (saved is null) return ApiData.Missing();
        saved.OptionsJson = ApiData.OptionsJson(options);
        saved.Carded = [];
        await db.SaveChangesAsync(ct);
        return Results.Ok(ApiData.ToDto(saved));
    }
}
