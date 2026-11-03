namespace Speakflow.Data.Entities;

public sealed class AiRequestLog
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public string Kind { get; set; } = "suggest";
    public DateTimeOffset CreatedAt { get; set; }
}
