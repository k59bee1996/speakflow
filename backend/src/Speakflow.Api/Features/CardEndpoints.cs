using System.Data;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Api.Features;

public static class CardEndpoints
{
    public sealed record NewCard(string? Front, string? Back, DateOnly Today);
    public sealed record GradeCard(int Grade, DateOnly Today, int? ExpectedReps, int? ExpectedLapses);

    public static void MapCardEndpoints(this WebApplication app)
    {
        app.MapGet("/api/cards", async (HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = ApiData.UserId(context);
            return Results.Ok(await db.Cards.AsNoTracking().Where(c => c.UserId == uid).OrderByDescending(c => c.CreatedAt).ThenBy(c => c.Id).ToListAsync(ct));
        });
        app.MapGet("/api/cards/queue", async (DateOnly today, HttpContext context, SpeakflowDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!ApiData.ValidToday(today, clock)) return ApiData.Invalid("Ngày ôn không hợp lệ.");
            var uid = ApiData.UserId(context);
            var due = await db.Cards.AsNoTracking().Where(c => c.UserId == uid && !c.IsNew && c.Due <= today)
                .OrderBy(c => c.Due).ThenBy(c => c.CreatedAt).ThenBy(c => c.Id).ToListAsync(ct);
            var used = await db.Reviews.CountAsync(r => r.UserId == uid && r.WasNew && r.ReviewedOn == today, ct);
            var fresh = await db.Cards.AsNoTracking().Where(c => c.UserId == uid && c.IsNew)
                .OrderBy(c => c.Week).ThenBy(c => c.CreatedAt).ThenBy(c => c.Id).Take(Math.Max(0, 10 - used)).ToListAsync(ct);
            return Results.Ok(due.Concat(fresh));
        });
        app.MapPost("/api/cards", async (NewCard input, HttpContext context, SpeakflowDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Front) || input.Front.Trim().Length > 500) return ApiData.Invalid("Mặt trước cần từ 1 đến 500 ký tự.");
            if (string.IsNullOrWhiteSpace(input.Back) || input.Back.Trim().Length > 500) return ApiData.Invalid("Mặt sau cần từ 1 đến 500 ký tự.");
            if (!ApiData.ValidToday(input.Today, clock)) return ApiData.Invalid("Ngày ôn không hợp lệ.");
            var card = new Card { Id = Guid.NewGuid(), UserId = ApiData.UserId(context), Front = input.Front.Trim(), Back = input.Back.Trim(),
                Due = input.Today, Ease = 2.5, IsNew = false, CreatedAt = clock.GetUtcNow() };
            db.Cards.Add(card);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/cards/{card.Id}", card);
        });
        app.MapPost("/api/cards/{id:guid}/grade", async (Guid id, GradeCard input, HttpContext context, SpeakflowDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (input.Grade is < 0 or > 3) return ApiData.Invalid("Điểm ôn không hợp lệ.");
            if (!ApiData.ValidToday(input.Today, clock)) return ApiData.Invalid("Ngày ôn không hợp lệ.");
            var uid = ApiData.UserId(context);
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                db.ChangeTracker.Clear();
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                var card = await db.Cards.SingleOrDefaultAsync(c => c.Id == id && c.UserId == uid, ct);
                if (card is null) return ApiData.Missing();
                // Each grade changes Reps, or resets Reps and increments Lapses. The pair identifies the displayed attempt.
                if (input.ExpectedReps != card.Reps || input.ExpectedLapses != card.Lapses)
                    return Results.Problem(statusCode: 409, detail: "Thẻ đã được chấm điểm. Bạn hãy tải lại trang trước khi ôn tiếp.");
                if (card.IsNew && await db.Reviews.CountAsync(r => r.UserId == uid && r.WasNew && r.ReviewedOn == input.Today, ct) >= 10)
                    return ApiData.Invalid("Bạn đã học đủ 10 thẻ mới hôm nay.");
                var next = Srs.Plan(card.IntervalDays, card.Ease, card.Reps, input.Grade);
                db.Reviews.Add(new Review { UserId = uid, CardId = id, Grade = (short)input.Grade, WasNew = card.IsNew,
                    ReviewedOn = input.Today, ReviewedAt = clock.GetUtcNow() });
                card.IntervalDays = next.IntervalDays;
                card.Ease = next.Ease;
                card.Reps = next.Reps;
                card.Due = input.Today.AddDays(next.IntervalDays);
                card.Lapses += input.Grade == 0 ? 1 : 0;
                card.IsNew = false;
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                return Results.Ok(card);
            });
        });
        app.MapDelete("/api/cards/{id:guid}", async (Guid id, HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = ApiData.UserId(context);
            var card = await db.Cards.SingleOrDefaultAsync(c => c.Id == id && c.UserId == uid, ct);
            if (card is null) return ApiData.Missing();
            // Retain review history so deleting a learned card cannot restore today's new-card allowance.
            card.IsDeleted = true;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }
}
