using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Api.Auth;

public static class AccountCommand
{
    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        if (args.Length != 2 || !System.Net.Mail.MailAddress.TryCreate(args[1], out var address) || address.Address != args[1])
        {
            Console.Error.WriteLine("Usage: create-user <email> | reset-password <email>. Password is read from stdin or a hidden prompt.");
            return 1;
        }
        Console.Error.Write("Mật khẩu (ít nhất 12 ký tự): ");
        var password = ReadPassword();
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<SpeakflowDbContext>();
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var user = await users.FindByEmailAsync(args[1]);
            IdentityResult result;
            if (args[0] == "create-user")
            {
                if (user is not null)
                {
                    Console.Error.WriteLine("Tài khoản đã tồn tại.");
                    return 1;
                }
                user = new ApplicationUser { Id = Guid.NewGuid(), Email = args[1], UserName = args[1] };
                result = await users.CreateAsync(user, password);
                if (result.Succeeded)
                {
                    db.Profiles.Add(new Profile { UserId = user.Id, StartDate = DateOnly.FromDateTime(DateTime.UtcNow), CreatedAt = DateTimeOffset.UtcNow });
                    await db.SaveChangesAsync();
                }
            }
            else
            {
                if (user is null)
                {
                    Console.Error.WriteLine("Không tìm thấy tài khoản.");
                    return 1;
                }
                var token = await users.GeneratePasswordResetTokenAsync(user);
                result = await users.ResetPasswordAsync(user, token, password);
                if (result.Succeeded)
                {
                    user.LockoutEnd = null;
                    user.AccessFailedCount = 0;
                    user.LoginFailures.Clear();
                    await db.SaveChangesAsync();
                }
            }
            if (!result.Succeeded)
            {
                Console.Error.WriteLine("Không cập nhật được tài khoản: " + string.Join(", ", result.Errors.Select(e => e.Code)));
                return 1;
            }
            await transaction.CommitAsync();
            Console.WriteLine("Đã cập nhật tài khoản.");
            return 0;
        });
    }

    private static string ReadPassword()
    {
        if (Console.IsInputRedirected) return Console.ReadLine() ?? "";
        var password = new System.Text.StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.Error.WriteLine(); return password.ToString(); }
            if (key.Key == ConsoleKey.Backspace) { if (password.Length > 0) password.Length--; }
            else if (!char.IsControl(key.KeyChar)) password.Append(key.KeyChar);
        }
    }
}
