using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data;
using Speakflow.Api.Features;

namespace Speakflow.Api.Auth;

public static class OwnedDataEndpoints
{
    // Resolve ids within the authenticated user's data; missing and foreign ids share the same response.
    public static void MapOwnedDataEndpoints(this WebApplication app)
    {
        app.MapGet("/api/cards/{id:guid}", async (Guid id, HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = UserId(context);
            var card = await db.Cards.AsNoTracking().SingleOrDefaultAsync(c => c.Id == id && c.UserId == uid, ct);
            return card is null ? ApiData.Missing() : Results.Ok(card);
        });
        app.MapGet("/api/notes/{id:guid}", async (Guid id, HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = UserId(context);
            var note = await db.Notes.AsNoTracking().SingleOrDefaultAsync(n => n.Id == id && n.UserId == uid, ct);
            return note is null ? ApiData.Missing() : Results.Ok(ApiData.ToDto(note));
        });
        app.MapGet("/api/profiles/{id:guid}", async (Guid id, HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = UserId(context);
            var profile = await db.Profiles.AsNoTracking().SingleOrDefaultAsync(p => p.UserId == id && p.UserId == uid, ct);
            return profile is null ? ApiData.Missing() : Results.Ok(profile);
        });
    }

    private static Guid UserId(HttpContext context) => Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
