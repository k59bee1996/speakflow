namespace Speakflow.Data.Entities;

public sealed class UserSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
