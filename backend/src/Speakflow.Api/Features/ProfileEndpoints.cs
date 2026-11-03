using Microsoft.EntityFrameworkCore;
using Speakflow.Data;

namespace Speakflow.Api.Features;

public static class ProfileEndpoints
{
    public sealed record UpdateProfile(DateOnly StartDate, string Mode);

    public static void MapProfileEndpoints(this WebApplication app)
    {
        app.MapGet("/api/profile", async (HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = ApiData.UserId(context);
            var profile = await db.Profiles.AsNoTracking().SingleOrDefaultAsync(p => p.UserId == uid, ct);
            return profile is null ? ApiData.Missing() : Results.Ok(profile);
        });
        app.MapPut("/api/profile", async (UpdateProfile input, HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            if (input.Mode is not ("30" or "60") || input.StartDate == default) return ApiData.Invalid("Cài đặt không hợp lệ.");
            var uid = ApiData.UserId(context);
            var profile = await db.Profiles.SingleOrDefaultAsync(p => p.UserId == uid, ct);
            if (profile is null) return ApiData.Missing();
            profile.StartDate = input.StartDate;
            profile.Mode = input.Mode;
            await db.SaveChangesAsync(ct);
            return Results.Ok(profile);
        });
        app.MapDelete("/api/data", async (HttpContext context, SpeakflowDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var uid = ApiData.UserId(context);
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                db.ChangeTracker.Clear();
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                db.Reviews.RemoveRange(await db.Reviews.Where(r => r.UserId == uid).ToListAsync(ct));
                await db.SaveChangesAsync(ct);
                db.Cards.RemoveRange(await db.Cards.IgnoreQueryFilters().Where(c => c.UserId == uid).ToListAsync(ct));
                db.Notes.RemoveRange(await db.Notes.Where(n => n.UserId == uid).ToListAsync(ct));
                var profile = await db.Profiles.SingleAsync(p => p.UserId == uid, ct);
                profile.Mode = "30";
                profile.StartDate = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
                profile.Checks = [];
                profile.SeededWeeks = [];
                // Keep AI usage so resetting learning data cannot bypass the daily limit.
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                return Results.NoContent();
            });
        });
    }
}
