using Microsoft.AspNetCore.Identity;

namespace Speakflow.Data.Entities;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public List<DateTimeOffset> LoginFailures { get; set; } = [];
}
