namespace Speakflow.Data.Entities;

public sealed class Profile
{
    public Guid UserId { get; set; }
    public DateOnly StartDate { get; set; }
    public string Mode { get; set; } = "30";
    public int[] SeededWeeks { get; set; } = [];
    public string[] Checks { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
}
