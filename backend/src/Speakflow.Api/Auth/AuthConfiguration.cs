using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Api.Auth;

public static class AuthConfiguration
{
    public const string Scheme = "Speakflow";
    public const string CookieName = "__Host-speakflow";
    public const string SessionClaim = "session_id";
    public const string StampClaim = "security_stamp";
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30);
    public static readonly TimeSpan FailureWindow = TimeSpan.FromMinutes(15);

    public static void AddSpeakflowAuth(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<LoginService>();
        services.AddIdentityCore<ApplicationUser>(options =>
        {
            options.User.RequireUniqueEmail = true;
            options.Password.RequiredLength = 12;
            options.Password.RequireDigit = false;
            options.Password.RequireLowercase = false;
            options.Password.RequireUppercase = false;
            options.Password.RequireNonAlphanumeric = false;
        }).AddRoles<IdentityRole<Guid>>()
          .AddEntityFrameworkStores<SpeakflowDbContext>()
          .AddDefaultTokenProviders();
        services.AddAuthentication(Scheme).AddCookie(Scheme, options =>
        {
            options.Cookie.Name = CookieName;
            options.Cookie.Path = "/";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.ExpireTimeSpan = SessionLifetime;
            options.SlidingExpiration = false;
            options.Events.OnRedirectToLogin = context => WriteUnauthorized(context.HttpContext);
            options.Events.OnRedirectToAccessDenied = context =>
                Results.Problem(statusCode: 403, detail: "Bạn không có quyền truy cập.").ExecuteAsync(context.HttpContext);
            options.Events.OnValidatePrincipal = async context =>
            {
                var db = context.HttpContext.RequestServices.GetRequiredService<SpeakflowDbContext>();
                var clock = context.HttpContext.RequestServices.GetRequiredService<TimeProvider>();
                var userId = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                var sessionId = context.Principal?.FindFirstValue(SessionClaim);
                if (!Guid.TryParse(userId, out var uid) || !Guid.TryParse(sessionId, out var sid))
                {
                    context.RejectPrincipal();
                    return;
                }

                var session = await db.UserSessions.AsNoTracking()
                    .SingleOrDefaultAsync(s => s.Id == sid && s.UserId == uid, context.HttpContext.RequestAborted);
                var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == uid, context.HttpContext.RequestAborted);
                if (session is null || session.ExpiresAt <= clock.GetUtcNow() || user is null ||
                    user.SecurityStamp != context.Principal!.FindFirstValue(StampClaim))
                {
                    context.RejectPrincipal();
                }
            };
        });
        services.AddAuthorization(options => options.FallbackPolicy =
            new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
    }

    public static Task WriteUnauthorized(HttpContext context) =>
        Results.Problem(statusCode: 401, detail: "Bạn cần đăng nhập lại.").ExecuteAsync(context);
}
