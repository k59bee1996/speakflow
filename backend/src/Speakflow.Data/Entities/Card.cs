namespace Speakflow.Data.Entities;

public sealed class Card
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Front { get; set; } = string.Empty;
    public string Back { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public int Week { get; set; }
    public string? SeedKey { get; set; }
    public DateOnly Due { get; set; }
    public int IntervalDays { get; set; }
    public double Ease { get; set; }
    public int Reps { get; set; }
    public int Lapses { get; set; }
    public bool IsNew { get; set; }
    public bool IsDeleted { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
