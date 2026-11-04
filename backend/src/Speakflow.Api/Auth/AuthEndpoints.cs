using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data;

namespace Speakflow.Api.Auth;

public static class AuthEndpoints
{
    public sealed record Credentials(string? Email, string? Password);

    public static void MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/api/auth/login", async (Credentials input, LoginService login, HttpContext context, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Email) || input.Email.Length > 256 ||
                string.IsNullOrEmpty(input.Password) || input.Password.Length > 1024)
                return Results.Problem(statusCode: 401, detail: "Email hoặc mật khẩu không đúng.");

            var outcome = await login.SignInAsync(input.Email, input.Password, ct);
            if (outcome.RetryAt is { } retryAt)
            {
                var now = context.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow();
                context.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling((retryAt - now).TotalSeconds)).ToString();
                return Results.Problem(statusCode: 429,
                    detail: $"Đăng nhập tạm khóa. Bạn có thể thử lại lúc {retryAt:O}.",
                    extensions: new Dictionary<string, object?> { ["retryAt"] = retryAt });
            }
            if (outcome.User is not { } user || outcome.Session is not { } session)
                return Results.Problem(statusCode: 401, detail: "Email hoặc mật khẩu không đúng.");

            var identity = new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email!),
                new Claim(AuthConfiguration.SessionClaim, session.Id.ToString()),
                new Claim(AuthConfiguration.StampClaim, user.SecurityStamp!),
            ], AuthConfiguration.Scheme);
            await context.SignInAsync(AuthConfiguration.Scheme, new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true, ExpiresUtc = session.ExpiresAt, AllowRefresh = false });
            return Results.Ok(new { userId = user.Id, email = user.Email });
        }).AllowAnonymous();

        app.MapGet("/api/auth/session", (HttpContext context) => Results.Ok(new
        {
            userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier),
            email = context.User.FindFirstValue(ClaimTypes.Email),
        }));

        app.MapPost("/api/auth/logout", async (HttpContext context, SpeakflowDbContext db, CancellationToken ct) =>
        {
            var uid = Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var sid = Guid.Parse(context.User.FindFirstValue(AuthConfiguration.SessionClaim)!);
            var session = await db.UserSessions.SingleOrDefaultAsync(s => s.Id == sid && s.UserId == uid, ct);
            if (session is not null)
            {
                db.UserSessions.Remove(session);
                await db.SaveChangesAsync(ct);
            }
            await context.SignOutAsync(AuthConfiguration.Scheme);
            return Results.NoContent();
        });
    }
}
