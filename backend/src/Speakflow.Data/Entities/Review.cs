namespace Speakflow.Data.Entities;

public sealed class Review
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public Guid CardId { get; set; }
    public short Grade { get; set; }
    public bool WasNew { get; set; }
    public DateTimeOffset ReviewedAt { get; set; }
    public DateOnly ReviewedOn { get; set; }
}
