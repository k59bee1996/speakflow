using System.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Api.Auth;

public sealed record LoginOutcome(ApplicationUser? User, UserSession? Session, DateTimeOffset? RetryAt);

public sealed class LoginService(SpeakflowDbContext db, UserManager<ApplicationUser> users, TimeProvider clock)
{
    // Run the read/check/write as one serializable unit so simultaneous failures cannot lose increments.
    public Task<LoginOutcome> SignInAsync(string email, string password, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var user = await users.FindByEmailAsync(email.Trim());
            var now = clock.GetUtcNow();
            if (user is null)
            {
                // Do comparable hashing work even when the email does not exist.
                var hasher = users.PasswordHasher;
                hasher.HashPassword(new ApplicationUser(), password);
                return new LoginOutcome(null, null, null);
            }
            if (user.LockoutEnd > now)
                return new LoginOutcome(null, null, user.LockoutEnd);

            if (user.LockoutEnd is not null)
            {
                user.LoginFailures.Clear();
                user.LockoutEnd = null;
            }
            user.LoginFailures = user.LoginFailures.Where(at => at > now - AuthConfiguration.FailureWindow).ToList();

            if (!await users.CheckPasswordAsync(user, password))
            {
                user.LoginFailures.Add(now);
                user.AccessFailedCount = user.LoginFailures.Count;
                if (user.AccessFailedCount >= 5)
                    user.LockoutEnd = now + AuthConfiguration.FailureWindow;
                await SaveUserAsync(user);
                await transaction.CommitAsync(ct);
                return new LoginOutcome(null, null, user.LockoutEnd);
            }

            user.AccessFailedCount = 0;
            user.LoginFailures.Clear();
            user.LockoutEnd = null;
            await SaveUserAsync(user);
            var session = new UserSession { Id = Guid.NewGuid(), UserId = user.Id, ExpiresAt = now + AuthConfiguration.SessionLifetime };
            db.UserSessions.Add(session);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new LoginOutcome(user, session, null);
        });

    private async Task SaveUserAsync(ApplicationUser user)
    {
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
            throw new DbUpdateConcurrencyException("The account changed during sign-in. Retry the request.");
    }
}
